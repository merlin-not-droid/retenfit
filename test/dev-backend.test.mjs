import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import http from 'node:http';
import { test } from 'node:test';
import { createDevBackend } from '../scripts/dev-backend.mjs';
import { loginErrorMessage } from '../src/assets/js/backend.js';
import { adminSummary } from '../src/assets/js/billing-core.js';

async function start(t, options) {
  const dev = await createDevBackend(options);
  const server = http.createServer(dev.handler);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (path, body, token) => {
    const res = await fetch(`${base}/__dev/api/${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, body: await res.json() };
  };
  return { dev, base, call };
}

test('카카오 로그인 오류 주소를 사장님이 이해할 문구로 바꾼다', () => {
  assert.match(loginErrorMessage('?error=invalid_request&error_code=bad_oauth_state&error_description=OAuth+state+has+expired'), /제한 시간/);
  assert.match(loginErrorMessage('?error=access_denied&error_description=User+denied'), /동의/);
  assert.match(loginErrorMessage('?error=server_error&error_code=unexpected_failure'), /다시 시도/);
  assert.equal(loginErrorMessage(''), null);
  assert.equal(loginErrorMessage('?code=abc'), null); // 정상 로그인 복귀
  assert.equal(loginErrorMessage('?return=billing&billingKey=abc'), null); // 카드 등록 복귀
});

test('테스트 카드 칸이 실제 결제 화면에 보이지 않는다: hidden 속성이 CSS에 밀리지 않음', () => {
  const css = readFileSync(new URL('../src/assets/tokens.css', import.meta.url), 'utf8');
  const page = readFileSync(new URL('../src/checkout/index.html', import.meta.url), 'utf8');
  assert.match(page, /<label id="test-card-field" hidden>/);
  assert.match(css, /\[hidden\]\s*\{\s*display:\s*none\s*!important;?\s*\}/);
});

test('브라우저와 서버가 같은 결제 규칙 파일을 쓴다', () => {
  const a = readFileSync(new URL('../supabase/functions/_shared/billing-core.js', import.meta.url), 'utf8');
  const b = readFileSync(new URL('../src/assets/js/billing-core.js', import.meta.url), 'utf8');
  assert.equal(a, b, 'src/assets/js/billing-core.js를 supabase/functions/_shared/billing-core.js와 같게 복사하세요');
});

test('로컬 테스트 서버: 로그인 → 동의·결제 → 매달 결제 → 정가 전환 → 해지, 운영자만 전체 조회', async (t) => {
  const { base, call } = await start(t, { seed: false, startToday: '2026-11-09' });
  const cfg = await fetch(`${base}/retenfit/assets/js/backend-config.js`).then((r) => r.text());
  assert.match(cfg, /mode: 'dev'/);

  assert.equal((await call('billing', { action: 'status' })).status, 401);
  const { token } = (await call('login', { nickname: '테스트 사장님' })).body;
  assert.equal((await call('billing', { action: 'status' }, token)).body.access, false);
  const agreed = { terms: true, privacy: true, billing: true };
  assert.equal((await call('billing', { action: 'subscribe', billingKey: 'dev-ok', agreed: { terms: true } }, token)).status, 400);
  assert.equal((await call('billing', { action: 'subscribe', billingKey: 'dev-fail', agreed }, token)).status, 402);
  const ok = await call('billing', { action: 'subscribe', billingKey: 'dev-ok', agreed, customer: { shopName: '테스트 왁싱', phone: '010-1234-5678' } }, token);
  assert.equal(ok.status, 200);
  assert.deepEqual(ok.body.next, { on: '2026-12-09', amount: 4900, conversion: false });

  assert.equal((await call('metrics', { data: { customers: 12, experiments: [] } }, token)).status, 200);
  assert.equal((await call('admin', undefined, token)).status, 403); // 사장님은 전체 조회 불가

  const clock = await call('clock', { days: 92 }, token);
  assert.equal(clock.body.today, '2027-02-09');
  const st = (await call('billing', { action: 'status' }, token)).body;
  assert.deepEqual([st.subscription.chargesDone, st.subscription.status], [4, 'active']);

  const admin = (await call('login', { nickname: '운영자' })).body.token;
  const data = (await call('admin', undefined, admin)).body;
  assert.deepEqual(data.payments.filter((p) => p.status === 'paid').map((p) => p.amount), [4900, 4900, 4900, 8900]);
  assert.equal(data.profiles[0].shopName, '테스트 왁싱');
  assert.equal(data.metrics.length, 1);
  assert.ok(!JSON.stringify(data).includes('dev-ok'), '결제 수단(빌링키)은 운영자 데이터에도 나오지 않음');

  assert.equal((await call('billing', { action: 'cancel' }, token)).body.subscription.status, 'canceled');
  assert.equal((await call('billing', { action: 'resume' }, token)).body.subscription.status, 'active');
});

test('가상 구독 매장: 운영자 요약에 상태별 수·안내 대상·매장 지표·실험 합산이 나온다', async (t) => {
  const { dev, call } = await start(t, { seed: true, startToday: '2026-11-09' });
  const admin = (await call('login', { nickname: '운영자' })).body.token;
  const data = (await call('admin', undefined, admin)).body;
  const sum = adminSummary(data, dev.today);
  assert.equal(sum.subscribers, 36);
  assert.ok(sum.live > 15 && sum.mrr > 0);
  assert.ok(sum.notices.length >= 2, `안내 대상 ${sum.notices.length}`);
  assert.ok(sum.stores.length > 10 && sum.pooled.length === 1);
  assert.ok(sum.monthly.some((m) => m.revenue > 0));
});
