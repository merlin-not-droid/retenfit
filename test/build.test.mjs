import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { build } from '../scripts/build.mjs';
import { parseSitemap } from '../scripts/lib/sitemap.mjs';
import { copyDir, copyFixture, countOf, DOMAIN_URL, FIXTURE, jsonLd, PROJECT_URL, read, tempDir, write } from './helpers.mjs';

test('하위 경로(프로젝트 사이트) 빌드: 검색 태그 자동 삽입', async (t) => {
  const outDir = tempDir(t);
  await build({ root: FIXTURE, outDir, siteUrl: PROJECT_URL });
  const home = read(outDir, 'index.html');

  assert.match(home, /<link rel="canonical" href="https:\/\/example-user\.github\.io\/demo\/">/);
  assert.match(home, /<meta property="og:url" content="https:\/\/example-user\.github\.io\/demo\/">/);
  assert.match(home, /<meta property="og:title" content="데모 스튜디오 \| 테스트용 홈">/);
  assert.match(home, /<meta property="og:site_name" content="Demo Studio">/);
  assert.match(home, /<meta property="og:locale" content="ko_KR">/);
  assert.match(home, /<meta property="og:image" content="https:\/\/example-user\.github\.io\/demo\/assets\/og\.png">/);
  assert.match(home, /<meta name="twitter:card" content="summary_large_image">/);
  assert.match(home, /<meta name="theme-color" content="#123456">/);
  assert.match(home, /<link rel="icon" href="\/demo\/favicon\.svg" type="image\/svg\+xml">/);

  // 소유 확인: 태그 전체를 붙여넣은 값에서 content만 골라 씀, 빈 값(bing)은 출력 안 함
  assert.match(home, /<meta name="google-site-verification" content="g00gleCode_-123">/);
  assert.match(home, /<meta name="naver-site-verification" content="abcdef0123456789">/);
  assert.doesNotMatch(home, /msvalidate/);

  // 통계
  assert.match(home, /googletagmanager\.com\/gtag\/js\?id=G-TEST1234/);
  assert.match(home, /wcs_add\["wa"\]="abc123def"/);
});

test('하위 경로 빌드: 루트 기준 링크에 /demo/ 붙이기', async (t) => {
  const outDir = tempDir(t);
  await build({ root: FIXTURE, outDir, siteUrl: PROJECT_URL });
  const home = read(outDir, 'index.html');

  assert.match(home, /<link rel="stylesheet" href="\/demo\/assets\/style\.css">/);
  assert.match(home, /<a href="\/demo\/about\/">소개<\/a>/);
  assert.match(home, /<a href="\/demo\/menu">메뉴<\/a>/);
  assert.match(home, /srcset="\/demo\/assets\/bg\.png 1x, \/demo\/assets\/bg\.png 2x"/);
  assert.match(home, /style="background: url\('\/demo\/assets\/bg\.png'\) no-repeat"/);
  assert.match(home, /\.hero \{ background-image: url\("\/demo\/assets\/bg\.png"\); \}/);
  // 이미 붙어 있으면 두 번 붙이지 않음
  assert.match(home, /<a href="\/demo\/about\/">이미 하위 경로가 붙은 링크<\/a>/);
  assert.doesNotMatch(home, /\/demo\/demo\//);
  // 외부 링크·전화·같은 페이지 앵커·자바스크립트 문자열은 그대로
  assert.match(home, /<a href="https:\/\/external\.example\.org\/">/);
  assert.match(home, /<a href="tel:\+8220000000">/);
  assert.match(home, /<a href="#contact">/);
  assert.match(home, /const template = '<a href="\/x">/);

  // include 펼치기 + 그 안의 링크도 보정
  assert.doesNotMatch(home, /@include/);
  assert.match(home, /<header class="site-header"><nav><a href="\/demo\/">홈<\/a>/);

  // CSS 파일 안의 url()·@import
  const css = read(outDir, 'assets/style.css');
  assert.match(css, /@import "\/demo\/assets\/extra\.css";/);
  assert.match(css, /background: url\(\/demo\/assets\/bg\.png\);/);
});

test('구조화 데이터(JSON-LD): 홈에만, 설정값으로 생성', async (t) => {
  const outDir = tempDir(t);
  await build({ root: FIXTURE, outDir, siteUrl: PROJECT_URL });
  const [website, business] = jsonLd(read(outDir, 'index.html'));

  assert.equal(website['@type'], 'WebSite');
  assert.equal(website.name, 'Demo Studio');
  assert.deepEqual(website.alternateName, ['데모 스튜디오']);
  assert.equal(website.url, PROJECT_URL);

  assert.equal(business['@type'], 'LocalBusiness');
  assert.equal(business.url, PROJECT_URL);
  assert.equal(business.description, '빌드 도구 테스트를 위한 가상의 스튜디오 홈 페이지입니다. 실제 업체가 아닙니다.');
  assert.equal(business.image, `${PROJECT_URL}assets/og.png`);
  assert.deepEqual(business.address, {
    '@type': 'PostalAddress',
    streetAddress: '테스트로 1',
    addressLocality: '중구',
    addressRegion: '서울특별시',
    postalCode: '04500',
    addressCountry: 'KR',
  });
  assert.deepEqual(business.geo, { '@type': 'GeoCoordinates', latitude: 37.5, longitude: 126.9 });
  assert.deepEqual(business.openingHoursSpecification[0].dayOfWeek, ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']);
  assert.equal(business.openingHoursSpecification[1].opens, '09:00');
  assert.deepEqual(business.sameAs, ['https://www.instagram.com/demo-studio-test']);

  const about = read(outDir, 'about/index.html');
  assert.equal(jsonLd(about).length, 0);
  assert.doesNotMatch(about, /site-verification/);
});

test('페이지에 직접 쓴 JSON-LD가 있어도 빠진 @type만 보충', async (t) => {
  const root = copyFixture(t);
  write(root, 'src/index.html', `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><title>홈 | 데모</title>
<meta name="description" content="직접 쓴 구조화 데이터와 자동 생성 데이터가 함께 들어가는지 확인하는 페이지입니다.">
<script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"SoftwareApplication","name":"Demo"},{"@type":"Organization","name":"직접 쓴 조직"}]}</script>
</head><body><h1>홈</h1></body></html>
`);
  const outDir = tempDir(t);
  await build({ root, outDir, siteUrl: PROJECT_URL });
  const blocks = jsonLd(read(outDir, 'index.html'));
  const types = blocks.flatMap((b) => (b['@graph'] ?? [b]).map((x) => x['@type']));
  assert.deepEqual(types.sort(), ['Organization', 'SoftwareApplication', 'WebSite']);
});

test('이미 있는 태그는 덮어쓰거나 중복하지 않음', async (t) => {
  const outDir = tempDir(t);
  await build({ root: FIXTURE, outDir, siteUrl: PROJECT_URL });
  const dup = read(outDir, 'dup/index.html');
  assert.equal(countOf(dup, 'rel="canonical"'), 1);
  // 상대 주소 canonical → 절대 주소로, og:url은 canonical을 따름
  assert.match(dup, /<link rel="canonical" href="https:\/\/example-user\.github\.io\/demo\/about\/">/);
  assert.match(dup, /<meta property="og:url" content="https:\/\/example-user\.github\.io\/demo\/about\/">/);

  // lang·charset·viewport가 없던 페이지
  const menu = read(outDir, 'menu.html');
  assert.match(menu, /<html lang="ko">/);
  assert.match(menu, /<head>\n<meta charset="utf-8">\n<meta name="viewport"/);
});

test('sitemap.xml · robots.txt · 404 · IndexNow 키 · 복사 규칙', async (t) => {
  const outDir = tempDir(t);
  const { pages } = await build({ root: FIXTURE, outDir, siteUrl: PROJECT_URL });

  const locs = [...parseSitemap(read(outDir, 'sitemap.xml')).keys()];
  assert.deepEqual(locs, [PROJECT_URL, `${PROJECT_URL}about/`, `${PROJECT_URL}menu.html`]);
  assert.equal(pages.find((p) => p.rel === 'private/index.html').inSitemap, false);
  assert.equal(pages.find((p) => p.rel === 'dup/index.html').inSitemap, false);

  const robots = read(outDir, 'robots.txt');
  assert.match(robots, /^Sitemap: https:\/\/example-user\.github\.io\/demo\/sitemap\.xml$/m);
  assert.match(robots, /^#DaumWebMasterTool:aaaabbbbccccdddd:XyZ==$/m);

  const notFound = read(outDir, '404.html');
  assert.match(notFound, /<meta name="robots" content="noindex">/);
  assert.match(notFound, /<a href="\/demo\/">Demo Studio 홈으로 가기<\/a>/);
  assert.doesNotMatch(notFound, /rel="canonical"/);

  assert.equal(read(outDir, '0123456789abcdef0123456789abcdef.txt'), '0123456789abcdef0123456789abcdef');
  // '_'로 시작하는 폴더는 배포하지 않음, 소유 확인 파일은 한 글자도 안 바꿈
  assert.equal(existsSync(path.join(outDir, '_partials')), false);
  assert.equal(
    read(outDir, 'google0123456789abcdef.html'),
    readFileSync(path.join(FIXTURE, 'src/google0123456789abcdef.html'), 'utf8'),
  );
});

test('자체 도메인(루트 경로) 빌드: 링크는 그대로, 주소만 도메인 기준', async (t) => {
  const outDir = tempDir(t);
  const { notes } = await build({ root: FIXTURE, outDir, siteUrl: DOMAIN_URL });
  const home = read(outDir, 'index.html');
  assert.match(home, /<link rel="canonical" href="https:\/\/demo\.example\.com\/">/);
  assert.match(home, /<link rel="stylesheet" href="\/assets\/style\.css">/);
  assert.match(home, /<a href="\/about\/">소개<\/a>/);
  assert.equal(read(outDir, 'assets/style.css'), readFileSync(path.join(FIXTURE, 'src/assets/style.css'), 'utf8'));
  assert.match(read(outDir, 'robots.txt'), /^Sitemap: https:\/\/demo\.example\.com\/sitemap\.xml$/m);
  assert.equal(notes.some((n) => n.includes('하위 경로')), false);
});

test('빌드를 여러 번 해도 결과가 같음', async (t) => {
  const a = tempDir(t);
  const b = tempDir(t);
  await build({ root: FIXTURE, outDir: a, siteUrl: PROJECT_URL });
  await build({ root: FIXTURE, outDir: b, siteUrl: PROJECT_URL });
  for (const rel of ['index.html', 'about/index.html', 'menu.html', 'sitemap.xml', 'robots.txt', '404.html']) {
    assert.equal(read(a, rel), read(b, rel), rel);
  }
});

test('sitemap lastmod = 페이지와 include 조각 중 가장 최근 커밋 시각', async (t) => {
  const root = tempDir(t);
  copyDir(FIXTURE, root);
  const git = (args, date) =>
    execFileSync('git', ['-c', 'user.name=test', '-c', 'user.email=test@example.com', '-c', 'commit.gpgsign=false', ...args], {
      cwd: root,
      stdio: 'ignore',
      env: { ...process.env, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date },
    });
  git(['init', '-q', '-b', 'main']);
  git(['add', '.']);
  git(['commit', '-q', '-m', 'first'], '2026-01-02T03:04:05+09:00');
  write(root, 'src/_partials/header.html', '<header class="site-header"><nav><a href="/">홈</a></nav></header>\n');
  git(['commit', '-q', '-am', 'header'], '2026-02-03T04:05:06+09:00');

  const outDir = path.join(root, 'out');
  await build({ root, outDir, siteUrl: PROJECT_URL });
  const lastmod = parseSitemap(read(outDir, 'sitemap.xml'));
  assert.equal(lastmod.get(PROJECT_URL), '2026-02-03T04:05:06+09:00'); // header를 include → 갱신
  assert.equal(lastmod.get(`${PROJECT_URL}menu.html`), '2026-01-02T03:04:05+09:00'); // include 안 함 → 그대로
});
