// 브라우저 종단간 점검 (선택): 랜딩페이지 + 앱의 주요 흐름을 실제 Chromium으로 확인합니다.
//
//   npm run test:browser
//
// Playwright가 필요합니다:  npm i -D playwright && npx playwright install chromium
// (GitHub Actions의 기본 배포 흐름에는 넣지 않았습니다 — 무거운 브라우저 설치가 필요해서)
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

let playwright;
try {
  playwright = await import('playwright');
} catch {
  try {
    playwright = createRequire(import.meta.url)('playwright'); // 전역 설치(NODE_PATH)도 찾기
  } catch {
    console.log('Playwright가 없습니다. 설치: npm i -D playwright && npx playwright install chromium');
    process.exit(0);
  }
}
const { chromium, devices } = playwright.default ?? playwright;
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const work = process.env.E2E_DIR || mkdtempSync(path.join(tmpdir(), 'waxfit-e2e-'));
console.log(`작업 폴더(스크린샷): ${work}`);
const shots = path.join(work, 'shots');
mkdirSync(shots, { recursive: true });
const { build } = await import(path.join(repo, 'scripts/build.mjs'));
const { createServer } = await import(path.join(repo, 'scripts/serve.mjs'));

const PORT = Number(process.env.E2E_PORT || 4321);
const BASE = `http://localhost:${PORT}/waxfit/`;
const outDir = path.join(work, 'dist');
await build({ root: repo, outDir, siteUrl: BASE });
const server = createServer({ outDir, basePath: '/waxfit/' });
await new Promise((r) => server.listen(PORT, '127.0.0.1', r));

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok: Boolean(ok), detail });
  console.log(`${ok ? '✔' : '✖'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true, locale: 'ko-KR' });
await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: `http://localhost:${PORT}` });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => m.type() === 'error' && errors.push(`console: ${m.text()}`));
page.on('response', (r) => r.status() >= 400 && r.url().includes('localhost') && errors.push(`HTTP ${r.status()} ${r.url()}`));
page.on('dialog', (d) => d.accept()); // confirm() 창은 모두 '확인'
const TITLES = { recommend: '이번 달 추천', acquisition: '첫 방문 유인', retention: '재방문 설계', analytics: '성과 분석', experiments: '효과 실험', customers: '고객 데이터', settings: '매장 설정' };
const goTab = async (route) => { await page.click(`.app-tabs a[data-route="${route}"]`); await page.waitForSelector(`#view h1:text-is("${TITLES[route]}")`); };

// ── 랜딩페이지 ─────────────────────────────────────────
await page.goto(BASE, { waitUntil: 'networkidle' });
check('랜딩: 제목', (await page.title()).startsWith('WAXFIT 왁스핏'));
check('랜딩: h1 1개', (await page.locator('h1').count()) === 1);
check('랜딩: CSS 적용(네이비 버튼)', (await page.locator('.site-header .btn-primary').evaluate((e) => getComputedStyle(e).backgroundColor)) === 'rgb(30, 42, 71)');
check('랜딩: Pretendard 폰트 로드', await page.evaluate(async () => { await document.fonts.ready; return [...document.fonts].some((f) => f.family.includes('Pretendard') && f.status === 'loaded'); }));
check('랜딩: 시작 버튼이 결제 페이지(하위 경로 포함)', (await page.locator('.hero a.btn-primary').getAttribute('href')) === '/waxfit/checkout/');
check('랜딩: 핵심 문구 강조', (await page.locator('.hero h1').textContent()).includes('단골로 만드는') && (await page.locator('.hero .lead-strong').textContent()).includes('재방문 시점을 분석'));
check('랜딩: 체험가·정가 표시', (await page.locator('.price-card').textContent()).includes('4,900원') && (await page.locator('.price-card').textContent()).includes('8,900원'));
check('랜딩: JSON-LD 3종', (await page.locator('script[type="application/ld+json"]').count()) === 3);
check('랜딩: canonical', (await page.locator('link[rel=canonical]').getAttribute('href')) === BASE);
await page.screenshot({ path: path.join(shots, 'landing-desktop.png'), fullPage: true });

// ── 앱: 첫 화면 → 샘플 데이터 ───────────────────────────
// ── 결제 페이지(결제 서버 미연결 = 오픈 준비 상태) ─────────
await page.click('.hero a.btn-primary');
await page.waitForURL(/\/waxfit\/checkout\//);
check('결제: 요금 일정 5줄', (await page.locator('#schedule tr').count()) === 5);
check('결제: 오픈 전에는 결제 버튼 막힘', await page.locator('#pay-btn').isDisabled());

await page.goto(`${BASE}app/`, { waitUntil: 'networkidle' });
check('앱: 첫 방문 안내 배너', await page.locator('.banner.welcome').isVisible());
check('앱: robots noindex', (await page.locator('meta[name=robots]').getAttribute('content')) === 'noindex');
await page.click('[data-action="load-sample"]');
check('앱: 샘플 모드 배너', await page.locator('.banner.info').filter({ hasText: '샘플 데이터' }).isVisible());

// ── 이번 달 추천(기본 화면) ─────────────────────────────
check('추천: 기본 화면', (await page.locator('#view h1').textContent()) === TITLES.recommend);
check('추천: 실행 플랜 카드', (await page.locator('.rec-card').count()) >= 1);
check('추천: 목적 비중 4개', (await page.locator('.meter-list').first().locator('.meter-row').count()) === 4);
const openBtn = page.locator('[data-open]').first();
if (await openBtn.count()) {
  await openBtn.click();
  await page.waitForSelector('#view h1');
  check('추천: 기존 옵션 열기', ['첫 방문 유인', '재방문 설계'].includes(await page.locator('#view h1').textContent()));
}

// ── 효과 실험(샘플에 진행 중 실험 1개) ───────────────────
await goTab('experiments');
check('실험: 진행 중 카드', (await page.locator('.exp-card').count()) >= 1);
check('실험: 혜택군·비교군 결과표', (await page.locator('.xp-table tbody tr').count()) === 2);
await page.locator('[data-xp-lookup]').first().fill('C001');
check('실험: 손님 배정 확인', /혜택군|비교군|없습니다/.test(await page.locator('[data-xp-lookup-out]').first().textContent()));

// ── 첫 방문 유인 ───────────────────────────────────────
await page.goto(`${BASE}app/#/acquisition`);
const rateOut = page.locator('#acq-rate-out');
check('첫 방문: 추천값으로 시작', /할인 \d+%/.test(await rateOut.textContent()), await rateOut.textContent());
check('첫 방문: 재방문율 출처 표시(실제 데이터)', (await page.locator('#acq-revisit-src').textContent()).includes('내 매장 실제'), await page.locator('#acq-revisit-src').textContent());
await page.locator('#acq-rate').fill('60');
check('첫 방문: 60%면 위험 경고', (await page.locator('#acq-alert').getAttribute('class')).includes('danger'), await page.locator('#acq-alert').textContent());
await page.locator('#acq-rate').fill('10');
const alert10 = await page.locator('#acq-alert').getAttribute('class');
check('첫 방문: 10%면 안전', alert10.includes('safe'), await page.locator('#acq-alert').textContent());
const firstPaid = await page.locator('#acq-figures dd').nth(1).textContent();
check('첫 방문: 첫 결제액 계산(70,000×0.9)', firstPaid === '63,000원', firstPaid);
await page.locator('input[name="acq-gender"][value="M"]').check({ force: true });
check('첫 방문: 남성 전환 후 남성 메뉴', (await page.locator('#acq-service').inputValue()) === '브라질리언' && (await page.locator('.facts').textContent()).includes('90,000원'));
await page.locator('#acq-plan-name').fill('테스트 첫방문 프로모션');
await page.click('#acq-save button[type=submit]');
check('첫 방문: 프로모션 저장', await page.locator('.plan-list').getByText('테스트 첫방문 프로모션').isVisible());
await page.screenshot({ path: path.join(shots, 'app-acquisition.png'), fullPage: true });

// ── 재방문 설계 ───────────────────────────────────────
await goTab('retention');
check('재방문: 대상 손님 표', (await page.locator('table tbody tr').count()) > 0);
const msg = await page.locator('#ret-message').inputValue();
check('재방문: 문구에 (광고)·수신거부', msg.startsWith('(광고)') && msg.includes('수신거부'));
await page.locator('input[name="ret-promo"][value="second-visit"]').check({ force: true });
await page.locator('#ret-rate').fill('15');
check('재방문: 할인 문구 반영', (await page.locator('#ret-message').inputValue()).includes('15% 할인'));
await page.click('#ret-copy-list');
const clip = await page.evaluate(() => navigator.clipboard.readText());
check('재방문: 수신 동의 손님 목록 복사', clip.includes('[샘플 손님') && !clip.includes('{별칭}'), clip.slice(0, 60).replace(/\n/g, ' / '));
await page.screenshot({ path: path.join(shots, 'app-retention.png'), fullPage: true });

// ── 성과 분석 ─────────────────────────────────────────
await goTab('analytics');
check('분석: 요약 수치', (await page.locator('.kpis > div').count()) === 5);
check('분석: 프로모션별 차트', (await page.locator('svg.chart').count()) === 2);
const rows = await page.locator('table tbody tr').count();
check('분석: 프로모션별 표', rows >= 4, `${rows}행`);
const rateBefore = await page.locator('.kpis > div').nth(2).locator('b').textContent();
await page.locator('#an-window').selectOption('30');
const rateAfter = await page.locator('.kpis > div').nth(2).locator('b').textContent();
check('분석: 관찰 기간 바꾸면 재계산', rateBefore !== rateAfter, `${rateBefore} → ${rateAfter}`);
await page.locator('input[name="an-gender"][value="M"]').check({ force: true });
check('분석: 성별 필터', (await page.locator('.kpis > div').first().locator('b').textContent()) !== '0명');
await page.screenshot({ path: path.join(shots, 'app-analytics.png'), fullPage: true });

// ── 고객 데이터 ───────────────────────────────────────
await goTab('customers');
const total = await page.locator('table tbody tr').count();
await page.fill('#cu-q', '샘플 손님 001');
await page.waitForFunction(() => document.querySelectorAll('table tbody tr').length === 1);
check('고객: 검색', (await page.locator('table tbody tr').count()) === 1, `${total} → 1`);
check('고객: 검색 중 입력창 포커스 유지', await page.evaluate(() => document.activeElement?.id === 'cu-q'));
await page.fill('#cu-q', '');
await page.click('#cu-add');
await page.fill('#cu-form input[name="alias"]', '<b>새 손님</b>');
await page.locator('#cu-form input[name="gender"][value="F"]').check({ force: true });
await page.locator('#cu-form input[name="consent"]').check();
await page.click('#cu-form button[type=submit]');
await page.fill('#cu-q', '새 손님');
await page.waitForFunction(() => document.querySelectorAll('table tbody tr').length === 1);
check('고객: 추가 + 이름의 태그가 글자로 표시(XSS 방지)', (await page.locator('table tbody tr .link-btn').first().textContent()) === '<b>새 손님</b>');
await page.locator('table tbody tr .link-btn').first().click();
await page.click('#cu-visit-here');
await page.fill('#visit-form input[name="paid"]', '56000');
await page.click('#visit-form button[type=submit]');
check('고객: 방문 기록 추가', (await page.locator('table tbody tr').first().textContent()).includes('1회'));
await page.fill('#cu-q', '');

// CSV 가져오기 (샘플 상태 → 샘플 비우고 가져오기)
const csv = path.join(work, 'import.csv');
writeFileSync(csv, '﻿고객ID,별칭,성별,방문일,시술,정가,결제액,프로모션,변동비,수신동의\r\nK001,가져온 손님,여,2026-05-01,브라질리언,70000,56000,첫 방문 할인,,동의\r\nK001,가져온 손님,여,2026-06-03,브라질리언,70000,70000,,,동의\r\nK002,오류 손님,?,2026-05-02,겨드랑이,25000,25000,,,\r\n');
await page.setInputFiles('#cu-import', csv);
await page.waitForSelector('dialog[open] .kpis');
check('CSV: 미리보기 — 가져올 2건·오류 1건', (await page.locator('dialog[open] .kpis b').allTextContents()).join('|') === '2건|1건|0건');
check('CSV: 오류 행 번호 표시', (await page.locator('dialog[open] .issues.error li').first().textContent()).includes('4행'));
await page.click('#import-confirm');
check('CSV: 샘플 비우고 가져옴', (await page.locator('table tbody tr').count()) === 1 && !(await page.locator('.banner.info').filter({ hasText: '샘플 데이터' }).count()));
await page.screenshot({ path: path.join(shots, 'app-customers.png'), fullPage: true });

// ── 매장 설정·백업·새로고침 유지 ─────────────────────────
await goTab('settings');
await page.fill('#st-basic input[name="shopName"]', '테스트 왁싱');
await page.click('#st-basic button[type=submit]');
const [download] = await Promise.all([page.waitForEvent('download'), page.click('#st-backup')]);
check('설정: 백업 파일 내려받기', download.suggestedFilename().startsWith('waxfit-backup-'), download.suggestedFilename());
await page.reload();
check('새로고침 후 데이터 유지', (await page.locator('#shop-name').textContent()) === '테스트 왁싱');
await page.goto(`${BASE}app/#/customers`);
check('새로고침 후 가져온 손님 유지', (await page.locator('table tbody tr').count()) === 1);

// ── 휴대폰 화면 ───────────────────────────────────────
const phone = await browser.newContext({ ...devices['iPhone 13'], locale: 'ko-KR' });
const m = await phone.newPage();
m.on('pageerror', (e) => errors.push(`mobile pageerror: ${e.message}`));
await m.goto(BASE, { waitUntil: 'networkidle' });
const overflowLanding = await m.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
check('휴대폰: 랜딩 가로 넘침 없음', overflowLanding <= 0, `${overflowLanding}px`);
await m.screenshot({ path: path.join(shots, 'landing-mobile.png'), fullPage: false });
await m.goto(`${BASE}app/`, { waitUntil: 'networkidle' });
await m.click('[data-action="load-sample"]');
await m.goto(`${BASE}app/#/acquisition`);
const overflowApp = await m.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
check('휴대폰: 앱 가로 넘침 없음', overflowApp <= 0, `${overflowApp}px`);
await m.screenshot({ path: path.join(shots, 'app-mobile.png'), fullPage: true });
await phone.close();

check('콘솔·페이지 오류 없음', errors.length === 0, errors.join(' | '));
await browser.close();
server.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} 통과`);
process.exit(failed.length ? 1 : 0);
