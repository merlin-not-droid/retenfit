import assert from 'node:assert/strict';
import path from 'node:path';
import { test } from 'node:test';
import { build } from '../scripts/build.mjs';
import { check } from '../scripts/check.mjs';
import { copyFixture, FIXTURE, PROJECT_URL, tempDir, write } from './helpers.mjs';

const errorsOf = (issues) => issues.filter((i) => i.level === 'error');
const messages = (issues) => issues.map((i) => `${i.file}: ${i.message}`).join('\n');

test('정상 사이트는 오류 없이 통과', async (t) => {
  const outDir = tempDir(t);
  await build({ root: FIXTURE, outDir, siteUrl: PROJECT_URL });
  const issues = await check({ root: FIXTURE, outDir });
  assert.deepEqual(errorsOf(issues), [], messages(issues));
  // noindex 페이지·canonical이 다른 페이지는 안내로만 알림
  assert.ok(issues.some((i) => i.level === 'info' && i.file === 'src/private/index.html'));
  assert.ok(issues.some((i) => i.level === 'info' && i.file === 'src/dup/index.html'));
});

test('배포를 막아야 하는 문제를 모두 잡아냄', async (t) => {
  const root = copyFixture(t);
  write(root, 'src/bad/index.html', `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <title>문제 페이지 | 데모 스튜디오</title>
</head>
<body>
  <h1>TODO: 내용 넣기</h1>
  <img src="/assets/bg.png">
  <img src="http://insecure.example.com/a.png" alt="">
  <a href="/nope/">없는 페이지</a>
  <a href="#missing">없는 앵커</a>
  <script type="application/ld+json">{ "broken": </script>
</body>
</html>
`);
  const outDir = path.join(root, 'out');
  await build({ root, outDir, siteUrl: PROJECT_URL });
  const issues = await check({ root, outDir });
  const errors = messages(errorsOf(issues));

  assert.match(errors, /src\/bad\/index\.html: 'TODO' 자리표시가 남아 있습니다/);
  assert.match(errors, /meta name="description">이 없습니다/);
  assert.match(errors, /이미지에 alt\(대체 텍스트\)가 없습니다: \/demo\/assets\/bg\.png/);
  assert.match(errors, /HTTPS 사이트에서 차단되는 http:\/\/ 리소스입니다/);
  assert.match(errors, /연결된 파일·페이지가 없습니다: \/demo\/nope\//);
  assert.match(errors, /구조화 데이터\(JSON-LD\)가 올바른 JSON이 아닙니다/);
  assert.match(messages(issues), /같은 페이지 안의 이동 링크 대상이 없습니다: #missing/);
  // TODO는 원본 줄 번호로 알려 줌
  assert.equal(issues.find((i) => i.message.includes('TODO')).line, 8);
});

test('홈 noindex, robots 전체 차단, 설정의 TODO도 오류', async (t) => {
  const root = copyFixture(t);
  write(root, 'src/index.html', `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><title>홈 | 데모 스튜디오</title>
<meta name="robots" content="noindex"></head><body><h1>홈</h1></body></html>
`);
  write(root, 'src/robots.txt', 'User-agent: *\nDisallow: /\n');
  write(root, 'site.config.mjs', `export default { siteUrl: '${PROJECT_URL}', siteName: 'TODO 이름' };\n`);
  const outDir = path.join(root, 'out');
  await build({ root, outDir, siteUrl: PROJECT_URL });
  const errors = messages(errorsOf(await check({ root, outDir })));
  assert.match(errors, /홈 페이지에 noindex가 있어/);
  assert.match(errors, /robots\.txt가 'Disallow: \/'로/);
  assert.match(errors, /site\.config\.mjs: 'TODO' 자리표시가 남아 있습니다/);
});

test('include로 불러온 조각(_partials)의 TODO도 잡아냄', async (t) => {
  const root = copyFixture(t);
  write(root, 'src/_partials/header.html', '<header>TODO 메뉴</header>\n');
  write(root, 'src/_drafts/note.html', 'TODO 초안은 배포되지 않으므로 검사하지 않음\n');
  const outDir = path.join(root, 'out');
  await build({ root, outDir, siteUrl: PROJECT_URL });
  const todo = (await check({ root, outDir })).filter((i) => i.message.includes('TODO'));
  assert.deepEqual(todo.map((i) => i.file), ['src/_partials/header.html']);
});

test('빌드 없이 검사하면 안내', async (t) => {
  const issues = await check({ root: FIXTURE, outDir: tempDir(t) });
  assert.match(issues[0].message, /먼저 npm run build/);
});
