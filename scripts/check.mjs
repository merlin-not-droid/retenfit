#!/usr/bin/env node
// 배포 전 검사 (npm run build 다음에 실행)
//
//   npm run check
//
// ✖ 오류  : 하나라도 있으면 실패 → GitHub Actions가 배포하지 않습니다.
// ⚠ 경고  : 검색 노출·성능에 불리한 점. 배포는 됩니다.
// ℹ 안내  : 다음에 할 일.
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT } from './build.mjs';
import { ConfigError, loadConfig, makeSite } from './lib/config.mjs';
import { walk } from './lib/files.mjs';
import { collectTags, lineOf, relHas } from './lib/html.mjs';
import { inspect } from './lib/seo.mjs';
import { parseSitemap } from './lib/sitemap.mjs';

const TEXT_FILE = /\.(html?|css|m?js|json|svg|xml|txt|webmanifest)$/i;
const IMAGE_FILE = /\.(png|jpe?g|gif|webp|avif|svg)$/i;
const BIG_IMAGE = 500 * 1024;
const SUBRESOURCE_TAGS = new Set(['img', 'script', 'iframe', 'source', 'audio', 'video', 'embed', 'track', 'input']);
const LINK_ATTRS = ['href', 'src', 'srcset', 'poster', 'data'];
const IGNORED_SCHEME = /^(mailto:|tel:|sms:|javascript:|data:|blob:|about:|intent:|kakaotalk:|kakaoplus:|nmap:)/i;
const CONTACT_LINK =
  /^(tel:|mailto:|sms:)|\/\/(pf\.kakao\.com|open\.kakao\.com|talk\.naver\.com|naver\.me|booking\.naver\.com|forms\.gle|docs\.google\.com\/forms|tally\.so|form\.typeform\.com)/i;

function urlsOf(node) {
  const out = [];
  for (const name of LINK_ATTRS) {
    const value = node.get(name);
    if (value === undefined || value === '') continue;
    if (name === 'srcset') {
      for (const part of value.split(',')) {
        const u = part.trim().split(/\s+/)[0];
        if (u) out.push({ attr: name, value: u });
      }
    } else {
      out.push({ attr: name, value: value.trim() });
    }
  }
  return out;
}

/** 같은 사이트 주소가 dist/ 안의 실제 파일로 이어지는지 (GitHub Pages 규칙과 같게) */
function existsOnSite(url, site, outDir) {
  let pathname;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    return false;
  }
  if (!pathname.startsWith(site.basePath)) return false;
  const rel = pathname.slice(site.basePath.length);
  const candidates = rel === '' || rel.endsWith('/') ? [`${rel}index.html`] : [rel, `${rel}.html`, `${rel}/index.html`];
  return candidates.some((c) => {
    const file = path.join(outDir, c);
    return file.startsWith(outDir) && existsSync(file) && statSync(file).isFile();
  });
}

export async function check(options = {}) {
  const root = options.root ?? ROOT;
  const srcDir = path.resolve(options.srcDir ?? path.join(root, 'src'));
  const outDir = path.resolve(options.outDir ?? path.join(root, 'dist'));
  const configPath = options.configPath ?? path.join(root, 'site.config.mjs');
  const issues = [];
  const add = (level, file, message, line) => issues.push({ level, file, message, line });

  const manifestFile = path.join(outDir, '.build.json');
  if (!existsSync(manifestFile)) {
    add('error', 'dist', '빌드 결과가 없습니다. 먼저 npm run build를 실행하세요.');
    return issues;
  }
  const manifest = JSON.parse(readFileSync(manifestFile, 'utf8'));
  const config = options.config ?? (await loadConfig(configPath));
  const site = makeSite(manifest.siteUrl);
  const configShown = path.relative(root, configPath).split(path.sep).join('/');

  // ── 1. 자리표시(TODO)가 남은 채로 배포되지 않도록 ──────────────────────────
  const scanned = new Set();
  const scanTodo = (abs) => {
    if (scanned.has(abs) || !existsSync(abs) || !TEXT_FILE.test(abs)) return;
    scanned.add(abs);
    const shown = path.relative(root, abs).split(path.sep).join('/');
    readFileSync(abs, 'utf8')
      .split('\n')
      .forEach((text, i) => {
        if (/\bTODO\b/.test(text)) add('error', shown, `'TODO' 자리표시가 남아 있습니다: ${text.trim().slice(0, 80)}`, i + 1);
      });
  };
  for (const f of walk(srcDir)) scanTodo(f.abs);
  for (const p of manifest.pages) for (const d of p.deps) scanTodo(path.join(root, d));
  scanTodo(configPath);

  // ── 2. 사이트 전체 ────────────────────────────────────────────────────────
  if (!config.siteName) add('error', configShown, 'siteName이 비어 있습니다.');
  const home = manifest.pages.find((p) => p.rel === 'index.html');
  if (!home) add('error', 'src', '홈 페이지(src/index.html)가 없습니다.');
  else if (home.noindex) add('error', home.src, '홈 페이지에 noindex가 있어 검색에 전혀 나오지 않습니다.');

  const sitemapFile = path.join(outDir, 'sitemap.xml');
  if (!existsSync(sitemapFile)) {
    add('error', 'dist/sitemap.xml', 'sitemap.xml이 없습니다.');
  } else {
    const locs = [...parseSitemap(readFileSync(sitemapFile, 'utf8')).keys()];
    if (!locs.length) add('error', 'dist/sitemap.xml', 'sitemap.xml에 등록된 페이지가 없습니다.');
    for (const loc of locs) {
      if (!loc.startsWith(site.url)) add('error', 'dist/sitemap.xml', `사이트 주소 밖의 URL이 있습니다: ${loc}`);
    }
  }
  const robotsFile = path.join(outDir, 'robots.txt');
  if (existsSync(robotsFile)) {
    const robots = readFileSync(robotsFile, 'utf8');
    if (/^\s*Disallow:\s*\/\s*$/im.test(robots)) {
      add('error', 'robots.txt', "robots.txt가 'Disallow: /'로 사이트 전체의 검색 수집을 막고 있습니다.");
    }
  }

  if (!config.ogImage) {
    add('warn', configShown, 'ogImage(공유 미리보기 이미지)가 없습니다. 카카오톡·SNS 공유 때 이미지가 비어 보입니다.');
  }
  if (home) {
    const homeInfo = inspect(readFileSync(path.join(outDir, 'index.html'), 'utf8'));
    if (!homeInfo.icons.length) {
      add('warn', home.src, '파비콘이 없습니다. src/favicon.svg(또는 .png, 48px 배수)를 넣으면 검색 결과에 아이콘이 보입니다.');
    }
    const contactLink = homeInfo.tags.some((t) => t.lower === 'a' && CONTACT_LINK.test(t.get('href') || ''));
    if (!contactLink) {
      add('warn', home.src, '홈 페이지에 문의 수단(전화·이메일·카카오톡 채널·문의 폼 링크)이 없습니다. 검색으로 들어온 방문자가 연락할 방법이 필요합니다.');
    }
  }
  const b = config.business;
  if (b.type !== 'Organization' && !b.address.streetAddress) {
    add('warn', configShown, `business.type이 '${b.type}'(매장)인데 주소가 없습니다. 구글 업체 정보는 주소가 필수입니다.`);
  }
  if (!config.verification.google) {
    add('info', configShown, '구글 서치 콘솔 소유 확인 코드(verification.google)가 비어 있습니다 → guide/SEARCH.md 1단계');
  }
  if (!config.verification.naver) {
    add('info', configShown, '네이버 서치어드바이저 소유 확인 코드(verification.naver)가 비어 있습니다 → guide/SEARCH.md 2단계');
  }

  // ── 3. 페이지별 ────────────────────────────────────────────────────────────
  const titles = new Map();
  for (const page of manifest.pages) {
    const file = page.src ?? `dist/${page.rel}`;
    const html = readFileSync(path.join(outDir, page.rel), 'utf8');
    const info = inspect(html);
    const indexable = !page.noindex && !page.is404;

    if (!info.hasHtml || !info.hasHead) add('error', file, '<html>/<head> 태그가 없어 검색용 태그를 넣지 못했습니다.');
    if (!info.lang) add('error', file, '<html lang="ko"> 속성이 없습니다.');
    if (!info.title) add('error', file, '<title>이 없습니다. 검색 결과의 제목이 됩니다.');
    else if (info.title.length > 60) add('warn', file, `<title>이 깁니다(${info.title.length}자). 검색 결과에서 잘리므로 40자 안팎을 권장합니다.`);

    if (indexable) {
      const desc = info.meta('description');
      if (!desc) add('error', file, '<meta name="description">이 없습니다. 검색 결과의 설명 문장이 됩니다.');
      else if (desc.length > 160) add('warn', file, `description이 깁니다(${desc.length}자). 80~120자를 권장합니다.`);
      else if (desc.length < 20) add('warn', file, `description이 너무 짧습니다(${desc.length}자). 80~120자를 권장합니다.`);
      if (!info.canonical) add('error', file, 'canonical 주소가 없습니다.');
      else if (info.canonical !== page.url) add('info', file, `canonical이 다른 주소(${info.canonical})를 가리켜 sitemap에서 뺐습니다.`);
      const h1 = info.tags.filter((t) => t.lower === 'h1').length;
      if (h1 === 0) add('warn', file, '<h1>이 없습니다. 페이지의 핵심 제목을 <h1>로 표시하세요.');
      if (h1 > 1) add('warn', file, `<h1>이 ${h1}개입니다. 페이지당 1개를 권장합니다.`);
      if (info.title) {
        if (titles.has(info.title)) add('warn', file, `${titles.get(info.title)}와(과) <title>이 같습니다. 페이지마다 다르게 쓰세요.`);
        else titles.set(info.title, file);
      }
    } else if (!page.is404) {
      add('info', file, 'noindex 페이지입니다 (검색에 나오지 않음, sitemap 제외).');
    }

    for (const block of info.jsonLd) {
      try {
        JSON.parse(block);
      } catch (err) {
        add('error', file, `구조화 데이터(JSON-LD)가 올바른 JSON이 아닙니다: ${err.message}`);
      }
    }

    const ids = new Set();
    for (const t of info.tags) {
      if (t.get('id')) ids.add(t.get('id'));
      if (t.lower === 'a' && t.get('name')) ids.add(t.get('name'));
    }
    let noSize = 0;
    const brokenSeen = new Set();
    for (const t of collectTags(html)) {
      if (t.lower === 'img') {
        if (!t.has('alt')) add('error', file, `이미지에 alt(대체 텍스트)가 없습니다: ${t.get('src') ?? t.raw.slice(0, 60)}`, lineOf(html, t.index));
        if (!t.has('width') || !t.has('height')) noSize += 1;
      }
      for (const { attr, value } of urlsOf(t)) {
        if (value.startsWith('#')) {
          const id = decodeURIComponent(value.slice(1));
          // '#/경로' · '#!경로'는 앱 화면 전환용 주소라 앵커 검사에서 제외
          if (attr === 'href' && id && id !== 'top' && !/^[/!]/.test(id) && !ids.has(id)) {
            add('warn', file, `같은 페이지 안의 이동 링크 대상이 없습니다: ${value}`);
          }
          continue;
        }
        if (IGNORED_SCHEME.test(value)) continue;
        const isSubresource = SUBRESOURCE_TAGS.has(t.lower) || (t.lower === 'link' && !relHas(t, 'canonical') && !relHas(t, 'alternate'));
        if (/^http:\/\//i.test(value) && isSubresource) {
          add('error', file, `HTTPS 사이트에서 차단되는 http:// 리소스입니다: ${value}`);
          continue;
        }
        let url;
        try {
          url = new URL(value, page.url);
        } catch {
          add('error', file, `주소 형식이 잘못되었습니다: ${value}`);
          continue;
        }
        if (!/^https?:$/.test(url.protocol) || url.origin !== site.origin) continue; // 외부 사이트
        if (!existsOnSite(url, site, outDir) && !brokenSeen.has(url.pathname)) {
          brokenSeen.add(url.pathname);
          const hint = !url.pathname.startsWith(site.basePath)
            ? ` (사이트 하위 경로 ${site.basePath} 밖입니다 — 자바스크립트에서 만든 주소라면 상대 경로를 쓰세요)`
            : '';
          add('error', file, `연결된 파일·페이지가 없습니다: ${value}${hint}`);
        }
      }
    }
    if (noSize) add('warn', file, `이미지 ${noSize}개에 width·height가 없습니다. 로딩 중 화면이 밀리는 현상(CLS)을 줄이려면 지정하세요.`);

    const ogImage = info.meta('og:image');
    if (ogImage) {
      try {
        const u = new URL(ogImage);
        if (u.origin === site.origin && !existsOnSite(u, site, outDir)) add('error', file, `og:image 파일이 없습니다: ${ogImage}`);
      } catch {
        add('error', file, `og:image 주소가 잘못되었습니다: ${ogImage}`);
      }
    }
  }

  // ── 4. 이미지 용량 ────────────────────────────────────────────────────────
  for (const f of walk(outDir)) {
    if (!IMAGE_FILE.test(f.rel)) continue;
    const size = statSync(f.abs).size;
    if (size > BIG_IMAGE) {
      add('warn', `src/${f.rel}`, `이미지가 큽니다(${Math.round(size / 1024)}KB). WebP 변환·크기 줄이기를 권장합니다 (모바일 속도는 검색 순위에 영향).`);
    }
  }
  return issues;
}

// ── 출력 ─────────────────────────────────────────────────────────────────────
const ICON = { error: '✖', warn: '⚠', info: 'ℹ' };
const escapeData = (s) => String(s).replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
const escapeProp = (s) => escapeData(s).replace(/:/g, '%3A').replace(/,/g, '%2C');

export function report(issues, { github = process.env.GITHUB_ACTIONS === 'true' } = {}) {
  const count = (level) => issues.filter((i) => i.level === level).length;
  const byFile = new Map();
  for (const i of issues) {
    if (!byFile.has(i.file)) byFile.set(i.file, []);
    byFile.get(i.file).push(i);
  }
  for (const [file, list] of byFile) {
    console.log(`\n${file}`);
    for (const i of list) console.log(`  ${ICON[i.level]} ${i.line ? `${i.line}행: ` : ''}${i.message}`);
  }
  console.log(`\n${count('error') ? '✖' : '✔'} 오류 ${count('error')}개 · 경고 ${count('warn')}개 · 안내 ${count('info')}개`);
  if (count('error')) console.log('  오류를 고치기 전에는 배포되지 않습니다.');
  if (github) {
    for (const i of issues) {
      if (i.level === 'info') continue;
      const kind = i.level === 'error' ? 'error' : 'warning';
      const props = [`file=${escapeProp(i.file)}`, i.line ? `line=${i.line}` : '', `title=${escapeProp('배포 전 검사')}`].filter(Boolean);
      console.log(`::${kind} ${props.join(',')}::${escapeData(i.message)}`);
    }
  }
  return count('error') === 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const ok = report(await check());
    process.exit(ok ? 0 : 1);
  } catch (err) {
    if (err instanceof ConfigError) {
      console.error(`✖ ${err.message}`);
      process.exit(1);
    }
    throw err;
  }
}
