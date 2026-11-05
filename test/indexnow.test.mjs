import assert from 'node:assert/strict';
import http from 'node:http';
import { test } from 'node:test';
import { build } from '../scripts/build.mjs';
import { plan, submit } from '../scripts/indexnow.mjs';
import { diffSitemaps, renderSitemap } from '../scripts/lib/sitemap.mjs';
import { FIXTURE, PROJECT_URL, tempDir } from './helpers.mjs';

const sitemap = (entries) => renderSitemap(entries.map(([loc, lastmod]) => ({ loc, lastmod })));

test('sitemap 비교: 새로 생김·바뀜·삭제', () => {
  const before = sitemap([['https://s/a', '2026-01-01T00:00:00Z'], ['https://s/b', '2026-01-01T00:00:00Z'], ['https://s/c', '']]);
  const after = sitemap([['https://s/a', '2026-01-01T00:00:00Z'], ['https://s/b', '2026-03-01T00:00:00Z'], ['https://s/d', '']]);
  assert.deepEqual(diffSitemaps(before, after), { changed: ['https://s/b', 'https://s/d'], removed: ['https://s/c'] });
  // lastmod가 없으면 새로 생긴 것만 알림
  assert.deepEqual(diffSitemaps(after, after), { changed: [], removed: [] });
});

test('plan: 첫 배포면 전체, 이후엔 바뀐 것만', async (t) => {
  const outDir = tempDir(t);
  await build({ root: FIXTURE, outDir, siteUrl: PROJECT_URL });

  const first = await plan({ outDir, fetchImpl: async () => new Response('Not Found', { status: 404 }) });
  assert.equal(first.urls.length, 3);
  assert.match(first.note, /첫 배포/);

  const live = sitemap([[PROJECT_URL, ''], [`${PROJECT_URL}about/`, ''], [`${PROJECT_URL}old.html`, '']]);
  const next = await plan({ outDir, fetchImpl: async () => new Response(live, { status: 200 }) });
  assert.deepEqual(next.changed, [`${PROJECT_URL}menu.html`]);
  assert.deepEqual(next.removed, [`${PROJECT_URL}old.html`]);
});

function startMockServer(t, { serveKey = true } = {}) {
  const received = [];
  const key = 'abcdef0123456789';
  const server = http.createServer((req, res) => {
    if (req.method === 'GET' && req.url.startsWith(`/demo/${key}.txt`) && serveKey) {
      res.end(key);
    } else if (req.method === 'POST' && req.url === '/indexnow') {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        received.push({ contentType: req.headers['content-type'], body: JSON.parse(body) });
        res.writeHead(202).end();
      });
    } else {
      res.writeHead(404).end();
    }
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      t.after(() => server.close());
      const base = `http://localhost:${server.address().port}`;
      resolve({ base, key, received });
    });
  });
}

test('submit: 키 파일 확인 후 IndexNow 규격대로 전송', async (t) => {
  const { base, key, received } = await startMockServer(t);
  const siteUrl = `${base}/demo/`;
  const config = { indexNow: { enabled: true, key, endpoints: [`${base}/indexnow`] } };
  const results = await submit({
    siteUrl,
    config,
    urls: [`${siteUrl}`, `${siteUrl}about/`, 'https://other.example.com/x'],
    attempts: 1,
  });
  assert.deepEqual(results.map((r) => r.status), [202]);
  assert.equal(received.length, 1);
  assert.equal(received[0].contentType, 'application/json; charset=utf-8');
  assert.deepEqual(received[0].body, {
    host: new URL(base).host,
    key,
    keyLocation: `${siteUrl}${key}.txt`,
    urlList: [siteUrl, `${siteUrl}about/`], // 다른 사이트 주소는 제외
  });
});

test('submit: 키 파일이 아직 없으면 보내지 않음 (실패해도 예외 없음)', async (t) => {
  const { base, key, received } = await startMockServer(t, { serveKey: false });
  const config = { indexNow: { enabled: true, key, endpoints: [`${base}/indexnow`] } };
  const results = await submit({ siteUrl: `${base}/demo/`, config, urls: [`${base}/demo/`], attempts: 2, delayMs: 10 });
  assert.deepEqual(results, []);
  assert.equal(received.length, 0);
});
