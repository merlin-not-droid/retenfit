// 브라우저 종단간 점검 (선택): 처음 화면 → 업종별 소개 → 결제 → 대시보드 흐름을 실제 브라우저로 확인합니다.
//
//   npm run test:browser
//
// Playwright가 필요합니다:  npm i -D playwright && npx playwright install chromium
// 이미 설치한 Edge·Chrome을 쓰려면:  npm i -D playwright-core 후 E2E_CHANNEL=msedge npm run test:browser
// (GitHub Actions의 기본 배포 흐름에는 넣지 않았습니다 — 무거운 브라우저 설치가 필요해서)
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
function loadPlaywright() {
  for (const name of ['playwright', 'playwright-core']) {
    try {
      return require(name); // 지역 설치·NODE_PATH 모두 찾습니다
    } catch {
      /* 다음 이름 시도 */
    }
  }
  return null;
}
const playwright = loadPlaywright();
if (!playwright) {
  console.log('Playwright가 없습니다. 설치: npm i -D playwright && npx playwright install chromium');
  process.exit(0);
}
const { chromium, devices } = playwright.default ?? playwright;
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const work = process.env.E2E_DIR || mkdtempSync(path.join(tmpdir(), 'retenfit-e2e-'));
console.log(`작업 폴더(스크린샷): ${work}`);
const shots = path.join(work, 'shots');
mkdirSync(shots, { recursive: true });
const { build } = await import('../../scripts/build.mjs');
const { createDevBackend } = await import('../../scripts/dev-backend.mjs');
const { createServer } = await import('../../scripts/serve.mjs');

// 결제 서버를 끈 상태(지금 공개 사이트와 같음)
const PORT = Number(process.env.E2E_PORT || 4321);
const BASE = `http://localhost:${PORT}/retenfit/`;
const outDir = path.join(work, 'dist');
await build({ root: repo, outDir, siteUrl: BASE });
const server = createServer({ outDir, basePath: '/retenfit/' });
await new Promise((r) => server.listen(PORT, '127.0.0.1', r));

// 가짜 로그인·결제 서버(결제 흐름 확인용)
const DEV_PORT = PORT + 1;
const DEV_BASE = `http://localhost:${DEV_PORT}/retenfit/`;
const dev = await createDevBackend({ outDir, basePath: '/retenfit/' });
const devServer = http.createServer(dev.handler);
await new Promise((r) => devServer.listen(DEV_PORT, '127.0.0.1', r));

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok: Boolean(ok), detail });
  console.log(`${ok ? '✔' : '✖'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const browser = await chromium.launch(process.env.E2E_CHANNEL ? { channel: process.env.E2E_CHANNEL } : {});
const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, acceptDownloads: true, locale: 'ko-KR' });
await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: `http://localhost:${PORT}` });
const page = await context.newPage();
const errors = [];
const watch = (p, label = '') => {
  p.on('pageerror', (e) => errors.push(`${label}pageerror: ${e.message}`));
  p.on('console', (m) => m.type() === 'error' && !m.text().includes('402') && !m.text().includes('cdn.jsdelivr') && errors.push(`${label}console: ${m.text()}`));
  p.on('response', (r) => r.status() >= 400 && r.status() !== 402 && r.url().includes('localhost') && errors.push(`${label}HTTP ${r.status()} ${r.url()}`));
};
watch(page);

const OLD_NAMES = /왁스핏|살롱핏|WAXFIT|SALONFIT/i;
const noOldNames = async (p, name) => check(`${name}: 옛 이름 없음`, !OLD_NAMES.test(await p.locator('body').innerText()));
/** 화면 안 확인 창에서 확인을 누릅니다 */
const accept = async (p = page) => {
  await p.waitForSelector('dialog.confirm-dialog[open]');
  await p.click('.confirm-ok');
};
const goWaxTab = async (route, title) => {
  await page.click(`.dash-nav a[data-route="${route}"]`);
  await page.waitForSelector(`#view h1:text-is("${title}")`);
};
const goSalonTab = async (route, title) => {
  await page.click(`.dash-nav a[data-tab="${route}"]`);
  await page.waitForFunction((t) => document.title.startsWith(t), title);
};

// ── 처음 화면 ─────────────────────────────────────────
await page.goto(BASE, { waitUntil: 'networkidle' });
check('처음: 제목', (await page.title()).startsWith('리텐핏'));
check('처음: h1 1개', (await page.locator('h1').count()) === 1);
check('처음: 스크롤 없이 한 화면', await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight));
check('처음: 세로로 반 나눔', await page.evaluate(() => getComputedStyle(document.querySelector('.split')).gridTemplateColumns.split(' ').length === 2));
check('처음: 미용실 버튼', (await page.locator('.half--salon .half-cta').getAttribute('href')) === '/retenfit/salon/');
check('처음: 왁싱샵 버튼', (await page.locator('.half--wax .half-cta').getAttribute('href')) === '/retenfit/wax/');
check('처음: Pretendard 폰트 지정', await page.evaluate(() => getComputedStyle(document.body).fontFamily.includes('Pretendard')));
check('처음: canonical', (await page.locator('link[rel=canonical]').getAttribute('href')) === BASE);
await noOldNames(page, '처음');
await page.screenshot({ path: path.join(shots, 'landing-desktop.png') });

// ── 업종별 소개 ───────────────────────────────────────
await page.click('.half--salon .half-cta');
await page.waitForURL(/\/retenfit\/salon\/$/);
await page.waitForSelector('.plan-rows li');
check('미용실 소개: 초록 색', (await page.locator('.b-top .btn-primary').evaluate((e) => getComputedStyle(e).backgroundColor)) === 'rgb(33, 78, 66)');
check('미용실 소개: 실제 계산 미리보기', (await page.locator('.plan-rows li').count()) >= 3);
const payLinks = await page.locator('a[href*="checkout"]').evaluateAll((a) => a.map((x) => [x.textContent.trim(), x.getAttribute('href')]));
check('미용실 소개: 시작 버튼은 모두 결제하기', payLinks.length >= 3 && payLinks.every(([t, h]) => t === '결제하기' && h === '/retenfit/checkout/?service=salon'), `${payLinks.length}개`);
const tabs = page.locator('[role="tab"]');
await tabs.first().focus();
await page.keyboard.press('ArrowRight');
check('미용실 소개: 탭 화살표 키', (await tabs.nth(1).getAttribute('aria-selected')) === 'true');
await noOldNames(page, '미용실 소개');
await page.screenshot({ path: path.join(shots, 'salon-intro.png'), fullPage: true });

await page.goto(`${BASE}wax/`, { waitUntil: 'networkidle' });
await page.waitForSelector('.plan-rows li');
check('왁싱샵 소개: 네이비 색', (await page.locator('.b-top .btn-primary').evaluate((e) => getComputedStyle(e).backgroundColor)) === 'rgb(30, 42, 71)');
await noOldNames(page, '왁싱샵 소개');
await page.screenshot({ path: path.join(shots, 'wax-intro.png'), fullPage: true });

// ── 결제 페이지(결제 서버 미연결 = 지금 공개 상태) ─────────
await page.goto(`${BASE}checkout/?service=salon`, { waitUntil: 'networkidle' });
check('결제: 요금 일정 5줄', (await page.locator('#schedule tr').count()) === 5);
check('결제: 오픈 전에는 결제 버튼 막힘', await page.locator('#pay-btn').isDisabled());
check('결제: 오픈 전 다음 행동 안내', (await page.locator('#demo-link').getAttribute('href')).endsWith('/salon/app/?demo=1'));
check('결제: 주소의 업종으로 색 변경', (await page.locator('html').getAttribute('data-service')) === 'salon');
await page.locator('input[name="service"][value="wax"]').check({ force: true });
check('결제: 업종을 바꾸면 색과 링크 변경', (await page.locator('html').getAttribute('data-service')) === 'wax' && (await page.locator('#demo-link').getAttribute('href')).endsWith('/wax/app/?demo=1'));

// ── 전체 흐름: 가짜 로그인 → 결제 → 대시보드 ───────────────
const paying = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'ko-KR' });
const pay = await paying.newPage();
watch(pay, 'pay ');
await pay.goto(`${DEV_BASE}salon/`, { waitUntil: 'networkidle' });
await pay.locator('.b-hero a.btn-pay, .b-hero a[href*="checkout"]').first().click();
await pay.waitForURL(/checkout\/\?service=salon/);
await pay.waitForSelector('#kakao-login');
await pay.click('#kakao-login');
await pay.waitForSelector('#logout');
await pay.click('#pay-btn');
check('흐름: 빈 칸은 칸 아래에 이유 표시', (await pay.locator('.field-error').count()) === 2 && (await pay.evaluate(() => document.activeElement?.name)) === 'shopName');
await pay.fill('#pay-form input[name="shopName"]', '테스트 미용실');
await pay.fill('#pay-form input[name="phone"]', '010-1234-5678');
check('흐름: 고치면 오류 문구가 사라짐', (await pay.locator('.field-error').count()) === 0);
await pay.click('#pay-btn');
check('흐름: 동의 없으면 결제되지 않음', (await pay.locator('#msg').textContent()).includes('동의'));
await pay.check('#agree-all');
await pay.selectOption('select[name="testCard"]', 'fail');
await pay.click('#pay-btn');
await pay.waitForFunction(() => document.getElementById('msg').className.includes('bad'));
check('흐름: 결제 실패 안내', (await pay.locator('#msg').textContent()).includes('완료되지 않았습니다'));
await pay.selectOption('select[name="testCard"]', 'ok');
await pay.click('#pay-btn');
await pay.waitForSelector('#open-app');
check('흐름: 결제 완료 안내', (await pay.locator('#msg').textContent()).includes('결제가 끝났습니다'));
await pay.click('#open-app');
await pay.waitForURL(/\/salon\/app\//);
await pay.waitForSelector('.rec-card');
check('흐름: 업종에 맞는 대시보드', (await pay.locator('.dash-brand small').textContent()) === '미용실');

await pay.locator('[data-action="rec-run"]').last().click();
await accept(pay);
await pay.waitForSelector('.badge.lime');
check('미용실: 실행 기록 → 비교군 분리', (await pay.locator('#toast').textContent()).includes('기록했습니다'));
const stored = await pay.evaluate(() => JSON.parse(localStorage.getItem('retenfit:salon:v1')).monthlyPlans.at(-1));
check('미용실: 이번 달 실행으로 저장', stored.adopted.length === 1, stored.adopted.join());
await pay.goto(`${DEV_BASE}checkout/?service=salon`, { waitUntil: 'networkidle' });
await pay.click('#cancel');
await pay.click('.confirm-cancel');
check('결제: 해지 확인 창에서 취소하면 그대로', (await pay.locator('#my-sub-body').textContent()).includes('체험가'));
await pay.click('#cancel');
await accept(pay);
await pay.waitForSelector('#resume');
check('결제: 해지 예약 후 해지 취소 가능', (await pay.locator('#my-sub-body').textContent()).includes('해지 예약'));
await pay.click('#resume');
await pay.waitForSelector('#cancel');
await pay.goto(`${DEV_BASE}admin/`, { waitUntil: 'networkidle' });
check('운영자: 일반 계정은 막힘', (await pay.locator('#admin').textContent()).includes('운영자만'));
await paying.close();

const operator = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'ko-KR' });
const op = await operator.newPage();
watch(op, 'admin ');
await op.goto(`${DEV_BASE}admin/`, { waitUntil: 'networkidle' });
await op.click('#login');
await op.waitForSelector('.kpi-grid');
check('운영자: 요약 5칸', (await op.locator('.kpi').count()) === 5);
check('운영자: 업종별 집계', /미용실 [1-9]\d*곳, 왁싱샵 [1-9]\d*곳/.test(await op.locator('#admin').textContent()));
await noOldNames(op, '운영자');
await op.screenshot({ path: path.join(shots, 'admin.png'), fullPage: true });
await operator.close();

// ── 왁싱샵 대시보드(결제 서버 끈 상태: 바로 열림) ──────────
await page.goto(`${BASE}wax/app/`, { waitUntil: 'networkidle' });
check('왁싱샵: 첫 방문 안내 배너', await page.locator('.banner.welcome').isVisible());
check('왁싱샵: robots noindex', (await page.locator('meta[name=robots]').getAttribute('content')).includes('noindex'));
await page.click('[data-action="load-sample"]');
check('왁싱샵: 샘플 모드 배너', await page.locator('.banner.info').filter({ hasText: '샘플 데이터' }).isVisible());
check('왁싱샵: 추천이 기본 화면', (await page.locator('#view h1').textContent()) === '이번 달 추천');
check('왁싱샵: 실행 플랜 카드', (await page.locator('.rec-card').count()) >= 1);
const openBtn = page.locator('[data-open]').first();
if (await openBtn.count()) {
  await openBtn.click();
  await page.waitForSelector('#view h1');
  check('왁싱샵: 추천에서 옵션 열기', ['첫 방문 유인', '재방문 설계'].includes(await page.locator('#view h1').textContent()));
}

await goWaxTab('experiments', '효과 실험');
check('실험: 진행 중 카드', (await page.locator('.exp-card').count()) >= 1);
check('실험: 혜택군·비교군 결과표', (await page.locator('.xp-table tbody tr').count()) === 2);

await page.goto(`${BASE}wax/app/#/acquisition`);
await page.waitForSelector('#acq-rate');
await page.locator('#acq-rate').fill('60');
check('첫 방문: 60%면 위험 경고', (await page.locator('#acq-alert').getAttribute('class')).includes('danger'));
await page.locator('#acq-rate').fill('10');
check('첫 방문: 10%면 안전', (await page.locator('#acq-alert').getAttribute('class')).includes('safe'));
const firstPaid = await page.locator('#acq-figures dd').nth(1).textContent();
check('첫 방문: 첫 결제액 계산(70,000×0.9)', firstPaid === '63,000원', firstPaid);
await page.locator('#acq-plan-name').fill('테스트 첫방문 프로모션');
await page.click('#acq-save button[type=submit]');
check('첫 방문: 프로모션 저장', await page.locator('.plan-list').getByText('테스트 첫방문 프로모션').isVisible());

await goWaxTab('retention', '재방문 설계');
const msg = await page.locator('#ret-message').inputValue();
check('재방문: 문구에 (광고)·수신거부', msg.startsWith('(광고)') && msg.includes('수신거부'));

await goWaxTab('analytics', '성과·매출 분석');
check('분석: 차트 2개', (await page.locator('svg.chart').count()) === 2);

await goWaxTab('customers', '고객 목록');
await page.fill('#cu-q', '샘플 손님 001');
await page.waitForFunction(() => document.querySelectorAll('table tbody tr').length === 1);
check('고객: 검색 중 입력창 포커스 유지', await page.evaluate(() => document.activeElement?.id === 'cu-q'));
await page.fill('#cu-q', '');
await page.click('#cu-add');
await page.fill('#cu-form input[name="alias"]', '<b>새 손님</b>');
await page.locator('#cu-form input[name="gender"][value="F"]').check({ force: true });
await page.click('#cu-form button[type=submit]');
await page.fill('#cu-q', '새 손님');
await page.waitForFunction(() => document.querySelectorAll('table tbody tr').length === 1);
check('고객: 이름의 태그가 글자로 표시(XSS 방지)', (await page.locator('table tbody tr .link-btn').first().textContent()) === '<b>새 손님</b>');
await page.fill('#cu-q', '');

// CSV 가져오기: 샘플을 비우는 확인 창을 거칩니다
const csv = path.join(work, 'import.csv');
writeFileSync(csv, '﻿고객ID,별칭,성별,방문일,시술,정가,결제액,프로모션,변동비,수신동의\r\nK001,가져온 손님,여,2026-05-01,브라질리언,70000,56000,첫 방문 할인,,동의\r\nK001,가져온 손님,여,2026-06-03,브라질리언,70000,70000,,,동의\r\nK002,오류 손님,?,2026-05-02,겨드랑이,25000,25000,,,\r\n');
await page.setInputFiles('#cu-import', csv);
await page.waitForSelector('dialog[open] .kpis');
check('CSV: 미리보기 — 가져올 2건·오류 1건', (await page.locator('dialog[open] .kpis b').allTextContents()).join('|') === '2건|1건|0건');
await page.click('#import-confirm');
await accept();
await page.waitForFunction(() => document.querySelectorAll('table tbody tr').length === 1);
check('CSV: 샘플 비우고 가져옴', !(await page.locator('.banner.info').filter({ hasText: '샘플 데이터' }).count()));

await goWaxTab('settings', '매장 설정');
await page.fill('#st-basic input[name="shopName"]', '테스트 왁싱');
await page.click('#st-basic button[type=submit]');
const [download] = await Promise.all([page.waitForEvent('download'), page.click('#st-backup')]);
check('설정: 백업 파일 내려받기', download.suggestedFilename().startsWith('retenfit-wax-backup-'), download.suggestedFilename());
await page.reload();
await page.waitForSelector('#view h1');
check('새로고침 후 데이터 유지', (await page.locator('#shop-name').textContent()) === '테스트 왁싱');

// ── 미용실 대시보드 ───────────────────────────────────
await page.goto(`${BASE}salon/app/?demo=1`, { waitUntil: 'networkidle' });
await page.waitForSelector('.rec-card');
check('미용실: 샘플 미리보기 표시', (await page.locator('.data-state').textContent()).includes('샘플'));
await noOldNames(page, '미용실 대시보드');
for (const [route, title] of [['overview', '재방문 현황'], ['customers', '고객 목록'], ['ai', '고객별 제안'], ['planner', '프로모션 설계'], ['sales', '매출 분석'], ['growth', '관계·계절 전략'], ['settings', '매장 설정'], ['data', '고객 데이터']]) {
  await goSalonTab(route, title);
  const text = await page.locator('#view').innerText();
  check(`미용실: ${title} 화면`, (await page.title()).startsWith(title) && !/undefined|NaN/.test(text));
}
await page.screenshot({ path: path.join(shots, 'salon-data.png'), fullPage: true });

// ── 휴대폰 화면 ───────────────────────────────────────
const phone = await browser.newContext({ ...devices['iPhone 13'], locale: 'ko-KR' });
const m = await phone.newPage();
watch(m, 'mobile ');
for (const [name, url] of [['처음', ''], ['미용실 소개', 'salon/'], ['왁싱샵 소개', 'wax/'], ['결제', 'checkout/'], ['미용실 대시보드', 'salon/app/?demo=1'], ['왁싱샵 대시보드', 'wax/app/?demo=1#/settings']]) {
  await m.goto(`${BASE}${url}`, { waitUntil: 'networkidle' });
  const over = await m.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check(`휴대폰: ${name} 가로 넘침 없음`, over <= 0, `${over}px`);
  await m.screenshot({ path: path.join(shots, `mobile-${name}.png`), fullPage: true });
}
await m.goto(BASE, { waitUntil: 'networkidle' });
check('휴대폰: 처음 화면 스크롤 없음', await m.evaluate(() => document.documentElement.scrollHeight <= innerHeight));
await phone.close();

check('콘솔·페이지 오류 없음', errors.length === 0, errors.join(' | '));
await browser.close();
server.close();
devServer.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} 통과`);
process.exit(failed.length ? 1 : 0);
