#!/usr/bin/env node
// IndexNow — 새로 생기거나 바뀐 페이지 주소를 네이버·Bing 등에 바로 알립니다.
// (구글은 IndexNow를 쓰지 않으므로 서치 콘솔에 제출한 sitemap.xml로 수집합니다)
//
//   node scripts/indexnow.mjs plan     빌드 후·배포 전: 지금 배포된 sitemap과 비교해 알릴 주소 계산
//   node scripts/indexnow.mjs submit   배포 후: 계산한 주소를 전송
//
// GitHub Actions가 자동으로 실행합니다. 실패해도 배포에는 영향이 없고 경고만 남깁니다.
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT } from './build.mjs';
import { loadConfig, makeSite } from './lib/config.mjs';
import { diffSitemaps } from './lib/sitemap.mjs';

const MAX_URLS = 10000; // IndexNow 한 번 요청의 최대 개수

const warn = (msg) =>
  console.log(process.env.GITHUB_ACTIONS === 'true' ? `::warning title=IndexNow::${msg}` : `⚠ ${msg}`);

const STATUS_TEXT = {
  200: '접수됨',
  202: '접수됨 (키 확인 대기 중)',
  400: '요청 형식 오류',
  403: '키가 유효하지 않음 (키 파일이 사이트에 없거나 내용이 다름)',
  422: '주소가 이 사이트(host) 소속이 아니거나 키와 맞지 않음',
  429: '요청이 너무 많음 (잠시 후 자동으로 다시 시도됩니다)',
};

/** 배포 전: 알릴 주소 목록 계산 */
export async function plan({ outDir = path.join(ROOT, 'dist'), fetchImpl = fetch } = {}) {
  const manifest = JSON.parse(readFileSync(path.join(outDir, '.build.json'), 'utf8'));
  const nextXml = readFileSync(path.join(outDir, 'sitemap.xml'), 'utf8');
  const liveUrl = manifest.sitemapUrl;
  let previousXml = '';
  let note = '';
  try {
    const res = await fetchImpl(`${liveUrl}?nocache=${Date.now()}`, { signal: AbortSignal.timeout(15000) });
    if (res.ok) previousXml = await res.text();
    else note = res.status === 404 ? '첫 배포(이전 sitemap 없음) → 모든 페이지를 알립니다.' : `이전 sitemap을 읽지 못함(HTTP ${res.status}) → 모든 페이지를 알립니다.`;
  } catch (err) {
    note = `이전 sitemap을 읽지 못함(${err.message}) → 모든 페이지를 알립니다.`;
  }
  const { changed, removed } = diffSitemaps(previousXml, nextXml);
  return { urls: [...changed, ...removed].slice(0, MAX_URLS), changed, removed, note };
}

async function waitForKeyFile(keyLocation, key, { fetchImpl, attempts, delayMs }) {
  for (let i = 1; i <= attempts; i += 1) {
    try {
      const res = await fetchImpl(`${keyLocation}?nocache=${Date.now()}`, { signal: AbortSignal.timeout(10000) });
      if (res.ok && (await res.text()).trim() === key) return true;
    } catch {
      // 배포 직후 반영이 늦을 수 있어 다시 시도
    }
    if (i < attempts) await new Promise((r) => setTimeout(r, delayMs));
  }
  return false;
}

/** 배포 후: IndexNow 전송. 결과 목록을 돌려주며 예외를 던지지 않습니다. */
export async function submit({ siteUrl, urls, config, fetchImpl = fetch, attempts = 12, delayMs = 10000 }) {
  const results = [];
  if (!config.indexNow.enabled) {
    console.log('IndexNow가 꺼져 있습니다 (site.config.mjs → indexNow.enabled).');
    return results;
  }
  const site = makeSite(siteUrl);
  const list = urls.filter((u) => u.startsWith(site.url));
  if (list.length !== urls.length) warn(`사이트 주소(${site.url}) 밖의 주소 ${urls.length - list.length}개는 뺐습니다.`);
  if (!list.length) {
    console.log('알릴 주소가 없습니다.');
    return results;
  }
  const { key, endpoints } = config.indexNow;
  const keyLocation = site.abs(`/${key}.txt`);
  if (!(await waitForKeyFile(keyLocation, key, { fetchImpl, attempts, delayMs }))) {
    warn(`키 파일이 아직 사이트에 보이지 않아 전송을 건너뜁니다: ${keyLocation}`);
    return results;
  }
  const body = JSON.stringify({ host: site.host, key, keyLocation, urlList: list });
  for (const endpoint of endpoints) {
    try {
      const res = await fetchImpl(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json; charset=utf-8' },
        body,
        signal: AbortSignal.timeout(20000),
      });
      const ok = res.status === 200 || res.status === 202;
      results.push({ endpoint, status: res.status, ok });
      const text = `${endpoint} → HTTP ${res.status} ${STATUS_TEXT[res.status] ?? ''}`.trim();
      if (ok) console.log(`✔ ${text}`);
      else warn(text);
    } catch (err) {
      results.push({ endpoint, status: 0, ok: false });
      warn(`${endpoint} → 전송 실패: ${err.message}`);
    }
  }
  return results;
}

async function main() {
  const [command] = process.argv.slice(2);
  const config = await loadConfig(path.join(ROOT, 'site.config.mjs'));
  if (command === 'plan') {
    const outDir = path.join(ROOT, 'dist');
    if (!existsSync(path.join(outDir, '.build.json'))) throw new Error('먼저 npm run build를 실행하세요.');
    const result = config.indexNow.enabled ? await plan({ outDir }) : { urls: [], changed: [], removed: [], note: 'IndexNow 꺼짐' };
    if (result.note) console.log(result.note);
    console.log(`알릴 주소 ${result.urls.length}개 (새로 생김·바뀜 ${result.changed.length}, 삭제 ${result.removed.length})`);
    for (const u of result.urls) console.log(`  ${u}`);
    if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `urls=${JSON.stringify(result.urls)}\n`);
    return;
  }
  if (command === 'submit') {
    const urls = JSON.parse(process.env.INDEXNOW_URLS || '[]');
    const siteUrl = process.env.SITE_URL || config.siteUrl;
    await submit({ siteUrl, urls, config });
    return;
  }
  console.log('사용법: node scripts/indexnow.mjs plan | submit');
  process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((err) => {
    warn(err.message);
    // IndexNow는 보조 수단이므로 실패해도 워크플로를 실패시키지 않습니다.
  });
}
