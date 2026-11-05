import assert from 'node:assert/strict';
import http from 'node:http';
import { test } from 'node:test';
import { build } from '../scripts/build.mjs';
import { plan, submit } from '../scripts/indexnow.mjs';
import { diffSitemaps, parseSitemap, renderSitemap } from '../scripts/lib/sitemap.mjs';
import { FIXTURE, PROJECT_URL, read, tempDir } from './helpers.mjs';

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

  // 지금 배포된 sitemap 흉내: 홈·소개는 이번 빌드와 같은 lastmod(안 바뀜), menu.html은 없고(새로 생김), old.html은 사라짐.
  // lastmod는 git 커밋 시각이라 환경마다 다르므로(커밋 전 로컬 vs CI) 이번 빌드 값을 그대로 가져다 씀
  const built = parseSitemap(read(outDir, 'sitemap.xml'));
  const same = (url) => [url, built.get(url)];
  const live = sitemap([same(PROJECT_URL), same(`${PROJECT_URL}about/`), [`${PROJECT_URL}old.html`, '']]);
  const next = await plan({ outDir, fetchImpl: async () => new Response(live, { status: 200 }) });
  assert.deepEqual(next.changed, [`${PROJECT_URL}menu.html`]);
  assert.deepEqual(next.removed, [`${PROJECT_URL}old.html`]);

  // 이전 배포에 lastmod가 다르게(또는 없이) 기록된 페이지는 다시 알림
  const stale = sitemap([[PROJECT_URL, '2000-01-01T00:00:00Z'], same(`${PROJECT_URL}about/`), same(`${PROJECT_URL}menu.html`)]);
  const again = await plan({ outDir, fetchImpl: async () => new Response(stale, { status: 200 }) });
  assert.deepEqual(again.changed, built.get(PROJECT_URL) ? [PROJECT_URL] : []);
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

test('submit: 네이버 창구가 거절하면 확인할 점을 함께 알림', async () => {
  const key = 'abcdef0123456789';
  const siteUrl = 'https://owner.github.io/demo/';
  const fetchImpl = async (url) => {
    if (String(url).startsWith(`${siteUrl}${key}.txt`)) return new Response(key, { status: 200 });
    return new Response('', { status: String(url).includes('naver.com') ? 422 : 202 });
  };
  const config = { indexNow: { enabled: true, key, endpoints: ['https://searchadvisor.naver.com/indexnow', 'https://api.indexnow.org/indexnow'] } };
  const results = await submit({ siteUrl, config, urls: [siteUrl], fetchImpl, attempts: 1 });
  assert.deepEqual(results.map((r) => [r.status, r.ok]), [[422, false], [202, true]]);
  assert.match(results[0].hint, /서치어드바이저에 이 사이트를 등록/);
  assert.equal(results[1].hint, '');
});

test('submit: 키 파일이 아직 없으면 보내지 않음 (실패해도 예외 없음)', async (t) => {
  const { base, key, received } = await startMockServer(t, { serveKey: false });
  const config = { indexNow: { enabled: true, key, endpoints: [`${base}/indexnow`] } };
  const results = await submit({ siteUrl: `${base}/demo/`, config, urls: [`${base}/demo/`], attempts: 2, delayMs: 10 });
  assert.deepEqual(results, []);
  assert.equal(received.length, 0);
});
