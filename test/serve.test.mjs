import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { build } from '../scripts/build.mjs';
import { createServer } from '../scripts/serve.mjs';
import { FIXTURE, read, tempDir, write } from './helpers.mjs';

test('미리보기 서버는 GitHub Pages와 같은 규칙으로 응답', async (t) => {
  const outDir = tempDir(t);
  await build({ root: FIXTURE, outDir, siteUrl: 'http://localhost:4173/demo/' });
  const server = createServer({ outDir, basePath: '/demo/' });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;
  const get = (p) => fetch(base + p, { redirect: 'manual' });

  assert.equal((await get('/demo')).headers.get('location'), '/demo/');
  assert.equal((await get('/demo/')).status, 200);
  assert.equal((await get('/demo/about')).headers.get('location'), '/demo/about/');
  assert.equal((await get('/demo/menu')).status, 200); // menu.html
  assert.equal((await get('/demo/assets/style.css')).headers.get('content-type'), 'text/css; charset=utf-8');
  const missing = await get('/demo/nope');
  assert.equal(missing.status, 404);
  assert.match(await missing.text(), /페이지를 찾을 수 없습니다/);
  assert.equal((await get('/assets/style.css')).status, 404); // 하위 경로 밖
  assert.equal((await get('/demo/.build.json')).status, 404); // 숨김 파일
  assert.equal((await get('/demo/%2e%2e/package.json')).status, 404); // 폴더 밖 접근 차단
});

test('--live 미리보기는 응답에서만 실제 Supabase 모드로 바꾸고, 파일은 그대로 둠', async (t) => {
  const outDir = tempDir(t);
  const rel = 'assets/js/backend-config.js';
  const source = readFileSync(new URL(`../src/${rel}`, import.meta.url), 'utf8'); // 실제 설정 파일 형식으로 확인
  write(outDir, rel, source.replace(/^(\s*mode:\s*)'\w+'/m, "$1'off'"));
  const before = read(outDir, rel);
  const configFrom = async (live) => {
    const server = createServer({ outDir, basePath: '/waxfit/', live });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    t.after(() => server.close());
    return (await fetch(`http://127.0.0.1:${server.address().port}/waxfit/${rel}`)).text();
  };

  const live = await configFrom(true);
  assert.match(live, /^\s*mode: 'supabase',$/m);
  assert.doesNotMatch(live, /^\s*mode: 'off'/m);
  assert.match(live, /^\/\/\s+mode 'off'/m); // 설명 주석은 건드리지 않음
  assert.equal(await configFrom(false), before); // 일반 미리보기는 파일 그대로
  assert.equal(read(outDir, rel), before);
});
