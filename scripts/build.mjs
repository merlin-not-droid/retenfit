#!/usr/bin/env node
// 사이트 빌드: src/ → dist/
//
//   npm run build
//   SITE_URL=https://waxfit.kr/ npm run build   (주소를 직접 지정할 때)
//
//  1. src/의 파일을 dist/로 복사 ('_'·'.'으로 시작하는 파일·폴더는 제외)
//  2. HTML의 <!-- @include _partials/header.html --> 를 해당 파일 내용으로 교체
//  3. 페이지마다 검색 노출용 태그를 채움 (scripts/lib/seo.mjs)
//  4. sitemap.xml · robots.txt · 404.html · IndexNow 키 파일 생성
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ConfigError, loadConfig, makeSite } from './lib/config.mjs';
import { walk } from './lib/files.mjs';
import { isShallow, lastCommitDate } from './lib/git.mjs';
import { processPage, rewriteCssUrls } from './lib/seo.mjs';
import { renderRobots, renderSitemap } from './lib/sitemap.mjs';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const INCLUDE_RE = /<!--\s*@include\s+(\S+?)\s*-->/g;
// 검색엔진 "파일 업로드 방식" 소유 확인 파일은 손대지 않고 그대로 복사
const VERIFICATION_FILE_RE = /^(google[0-9a-f]{8,}\.html|naver[0-9a-f]{8,}\.html|BingSiteAuth\.xml)$/i;
// src/ 최상위에 있으면 모든 페이지에 링크를 넣는 아이콘들 (브라우저가 지원하는 것을 골라 씀)
const ICON_FILES = [
  { file: 'favicon.ico', rel: 'icon', attrs: { sizes: '32x32' } },
  { file: 'favicon.svg', rel: 'icon', attrs: { type: 'image/svg+xml' } },
  { file: 'favicon.png', rel: 'icon', attrs: { type: 'image/png' }, measure: true },
  { file: 'apple-touch-icon.png', rel: 'apple-touch-icon', attrs: {} },
];

/** PNG 헤더에서 크기 읽기 → '192x192' */
function pngSize(file) {
  const head = readFileSync(file).subarray(0, 24);
  if (head.length < 24 || head.toString('ascii', 1, 4) !== 'PNG') return null;
  return `${head.readUInt32BE(16)}x${head.readUInt32BE(20)}`;
}

function expandIncludes(html, file, srcDir, stack, deps) {
  return html.replace(INCLUDE_RE, (_, target) => {
    const resolved = path.resolve(srcDir, target.replace(/^\/+/, ''));
    const shown = path.relative(srcDir, file);
    if (!resolved.startsWith(srcDir + path.sep)) {
      throw new ConfigError(`include 경로가 src 밖을 가리킵니다: ${target} (${shown})`);
    }
    if (stack.includes(resolved)) {
      throw new ConfigError(`include가 서로를 계속 불러옵니다: ${[...stack, resolved].map((f) => path.relative(srcDir, f)).join(' → ')}`);
    }
    if (!existsSync(resolved)) throw new ConfigError(`include 파일이 없습니다: ${target} (${shown})`);
    deps.add(resolved);
    return expandIncludes(readFileSync(resolved, 'utf8'), resolved, srcDir, [...stack, resolved], deps);
  });
}

function default404(config) {
  const name = config.siteName || '홈';
  return `<!doctype html>
<html lang="${config.language}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>페이지를 찾을 수 없습니다 | ${name}</title>
<meta name="robots" content="noindex">
<style>
  :root { color-scheme: light dark; --bg: #ffffff; --fg: #111111; --muted: #666666; }
  @media (prefers-color-scheme: dark) { :root { --bg: #111111; --fg: #f2f2f2; --muted: #a0a0a0; } }
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 24px; box-sizing: border-box;
         background: var(--bg); color: var(--fg); text-align: center;
         font-family: Pretendard, -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif; }
  p { color: var(--muted); }
  a { color: inherit; font-weight: 600; }
</style>
</head>
<body>
<main>
  <h1>페이지를 찾을 수 없습니다</h1>
  <p>주소가 바뀌었거나 삭제된 페이지입니다.</p>
  <p><a href="/">${name} 홈으로 가기</a></p>
</main>
</body>
</html>
`;
}

export async function build(options = {}) {
  const root = options.root ?? ROOT;
  const srcDir = path.resolve(options.srcDir ?? path.join(root, 'src'));
  const outDir = path.resolve(options.outDir ?? path.join(root, 'dist'));
  const config = options.config ?? (await loadConfig(options.configPath ?? path.join(root, 'site.config.mjs')));
  const siteUrl = options.siteUrl || process.env.SITE_URL || config.siteUrl;
  if (!siteUrl) throw new ConfigError('사이트 주소가 없습니다. site.config.mjs의 siteUrl을 채워 주세요.');
  const site = makeSite(siteUrl);
  if (!existsSync(srcDir)) throw new ConfigError(`원본 폴더가 없습니다: ${srcDir}`);

  // fs.rmSync(…, { recursive: true })는 Node 24(Windows)에서 한글 등 비ASCII 경로를 만나면 프로세스가 강제 종료되어 비동기 rm을 씁니다
  await rm(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });

  const files = walk(srcDir);
  const relSet = new Set(files.map((f) => f.rel));
  const icons = ICON_FILES.filter((i) => relSet.has(i.file)).map((i) => ({
    rel: i.rel,
    href: `/${i.file}`,
    attrs: i.measure ? { ...i.attrs, sizes: pngSize(path.join(srcDir, i.file)) } : i.attrs,
  }));
  const pages = [];
  const notes = [];

  const addPage = (rel, source, srcFile, deps) => {
    const is404 = rel === '404.html';
    const pageUrl = site.pageUrl(rel);
    const { html, info } = processPage(source, {
      site, config, rel, pageUrl, icons, is404, isHome: rel === 'index.html',
    });
    const dest = path.join(outDir, rel);
    mkdirSync(path.dirname(dest), { recursive: true });
    writeFileSync(dest, html);
    pages.push({
      rel,
      src: srcFile ? path.relative(root, srcFile).split(path.sep).join('/') : null,
      deps: [...deps].map((d) => path.relative(root, d).split(path.sep).join('/')),
      url: pageUrl,
      title: info.title ?? null,
      description: info.meta('description') ?? null,
      canonical: info.canonical ?? null,
      noindex: info.noindex || is404,
      is404,
      lastmod: srcFile ? lastCommitDate([srcFile, ...deps], root) : null,
    });
  };

  for (const f of files) {
    const dest = path.join(outDir, f.rel);
    mkdirSync(path.dirname(dest), { recursive: true });
    if (f.rel.endsWith('.html') && !VERIFICATION_FILE_RE.test(f.rel)) {
      const deps = new Set();
      const source = expandIncludes(readFileSync(f.abs, 'utf8'), f.abs, srcDir, [f.abs], deps);
      addPage(f.rel, source, f.abs, deps);
    } else if (f.rel.endsWith('.css') && site.basePath !== '/') {
      writeFileSync(dest, rewriteCssUrls(readFileSync(f.abs, 'utf8'), site.withBase));
    } else {
      copyFileSync(f.abs, dest);
    }
  }

  if (!relSet.has('404.html')) {
    addPage('404.html', default404(config), null, new Set());
    notes.push('404.html 자동 생성 (직접 꾸미려면 src/404.html을 만드세요)');
  }

  // sitemap.xml — noindex 페이지, 다른 주소를 canonical로 지정한 페이지, 404는 제외
  const indexable = pages
    .filter((p) => !p.noindex && (!p.canonical || p.canonical === p.url))
    .sort((a, b) => (a.rel === 'index.html' ? -1 : b.rel === 'index.html' ? 1 : a.url.localeCompare(b.url)));
  for (const p of pages) p.inSitemap = indexable.includes(p);
  const sitemapUrl = site.abs('/sitemap.xml');
  if (!relSet.has('sitemap.xml')) {
    writeFileSync(path.join(outDir, 'sitemap.xml'), renderSitemap(indexable.map((p) => ({ loc: p.url, lastmod: p.lastmod }))));
  }
  if (!relSet.has('robots.txt')) {
    const extraLines = config.verification.daum ? [config.verification.daum] : [];
    writeFileSync(path.join(outDir, 'robots.txt'), renderRobots({ sitemapUrl, extraLines }));
  }
  if (config.indexNow.enabled) {
    writeFileSync(path.join(outDir, `${config.indexNow.key}.txt`), config.indexNow.key);
  }
  if (site.basePath !== '/') {
    notes.push(
      `하위 경로(${site.basePath})에 배포됩니다. 검색엔진은 robots.txt를 도메인 최상위에서만 읽으므로, ` +
        '사이트맵은 서치 콘솔·서치어드바이저에 직접 제출하세요. (자체 도메인을 연결하면 해결됩니다)',
    );
  }
  if (isShallow(root)) notes.push('git 이력이 얕게 받아져 있어 sitemap의 lastmod가 부정확할 수 있습니다 (fetch-depth: 0 필요).');

  const manifest = {
    siteUrl: site.url,
    basePath: site.basePath,
    sitemapUrl,
    generatedAt: new Date().toISOString(),
    pages,
  };
  // 이름이 '.'으로 시작하는 파일은 GitHub Pages에 올라가지 않습니다 (검사·IndexNow 단계용)
  writeFileSync(path.join(outDir, '.build.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  return { site, config, pages, notes, outDir, manifest };
}

export function printBuildSummary({ site, pages, notes, outDir }) {
  const count = pages.filter((p) => p.inSitemap).length;
  console.log(`✔ 빌드 완료 → ${path.relative(process.cwd(), outDir) || outDir}`);
  console.log(`  사이트 주소: ${site.url}`);
  console.log(`  페이지 ${pages.length}개 (sitemap 등록 ${count}개)`);
  const order = (p) => (p.rel === 'index.html' ? 0 : p.is404 ? 2 : 1);
  for (const p of [...pages].sort((a, b) => order(a) - order(b) || a.url.localeCompare(b.url))) {
    const flag = p.inSitemap ? '  ' : p.is404 ? '  [404]' : '  [sitemap 제외]';
    console.log(`   ${flag} ${p.url}`);
  }
  for (const n of notes) console.log(`  ℹ ${n}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    printBuildSummary(await build());
  } catch (err) {
    if (err instanceof ConfigError) {
      console.error(`✖ ${err.message}`);
      process.exit(1);
    }
    throw err;
  }
}
