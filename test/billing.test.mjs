import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  PRICING, addMonths, adminSummary, applyCharge, cancelSubscription, chargeAmount, chargeSchedule, conversionNotices,
  expire, hasAccess, isDue, newSubscription, nextCharge, paidThroughOn, poolExperiments, resumeSubscription,
} from '../supabase/functions/_shared/billing-core.js';
import { handleBilling, runRenewals } from '../supabase/functions/_shared/billing-handler.js';
import { memoryStore } from '../supabase/functions/_shared/memory-store.js';

const pay = (sub, today) => applyCharge(sub, { ok: true, today, paymentId: `pay-${sub.chargesDone + 1}` });

test('요금: 첫 3개월 4,900원, 4개월째부터 8,900원', () => {
  assert.deepEqual([0, 1, 2, 3, 4, 11].map((i) => chargeAmount(i)), [4900, 4900, 4900, 8900, 8900, 8900]);
  assert.equal(chargeAmount(0, false), 8900); // 체험가를 이미 쓴 계정
  assert.deepEqual(chargeSchedule('2026-11-08').map((c) => [c.on, c.amount]), [
    ['2026-11-08', 4900], ['2026-12-08', 4900], ['2027-01-08', 4900], ['2027-02-08', 8900],
  ]);
});

test('매달 같은 날 결제, 없는 날은 말일로', () => {
  assert.equal(addMonths('2027-01-31', 1), '2027-02-28');
  assert.equal(addMonths('2028-01-31', 1), '2028-02-29'); // 윤년
  assert.equal(addMonths('2026-12-15', 1), '2027-01-15');
  assert.equal(addMonths('2027-03-31', -1), '2027-02-28');
  // 기준은 항상 가입일: 1/31 가입 → 2/28 → 3/31 (2/28에서 한 달이 아님)
  assert.equal(addMonths('2027-01-31', 2), '2027-03-31');
});

test('정기결제 흐름: 체험가 3회 → 정가 전환, 다음 결제일은 가입일 기준', () => {
  let s = newSubscription({ userId: 'u1', today: '2026-11-08' });
  assert.equal(isDue(s, '2026-11-08'), true);
  s = pay(s, '2026-11-08');
  assert.deepEqual([s.status, s.chargesDone, s.nextChargeOn], ['trial', 1, '2026-12-08']);
  assert.equal(isDue(s, '2026-12-07'), false);
  s = pay(pay(s, '2026-12-08'), '2027-01-08');
  assert.equal(s.status, 'trial');
  assert.deepEqual(nextCharge(s), { on: '2027-02-08', amount: 8900, conversion: true });
  s = pay(s, '2027-02-08');
  assert.deepEqual([s.status, s.chargesDone, s.nextChargeOn], ['active', 4, '2027-03-08']);
});

test('결제 실패: 1·3·5일 뒤 재시도, 모두 실패하면 종료(이용 중지)', () => {
  let s = pay(newSubscription({ userId: 'u2', today: '2026-11-08' }), '2026-11-08');
  s = applyCharge(s, { ok: false, today: '2026-12-08' });
  assert.deepEqual([s.status, s.nextChargeOn], ['past_due', '2026-12-09']);
  assert.equal(hasAccess(s, '2026-12-09'), true); // 재시도 동안은 이용 가능
  s = applyCharge(s, { ok: false, today: '2026-12-09' });
  assert.equal(s.nextChargeOn, '2026-12-12');
  // 재시도 성공하면 원래 일정(가입일 기준)으로 돌아감
  const recovered = pay(s, '2026-12-12');
  assert.deepEqual([recovered.status, recovered.nextChargeOn, recovered.failedCount], ['trial', '2027-01-08', 0]);
  s = applyCharge(applyCharge(s, { ok: false, today: '2026-12-12' }), { ok: false, today: '2026-12-17' });
  assert.equal(s.status, 'ended');
  assert.equal(hasAccess(s, '2026-12-18'), false);
});

test('해지: 더 결제하지 않고 낸 기간 끝까지 이용, 지나면 종료', () => {
  let s = pay(newSubscription({ userId: 'u3', today: '2026-11-08' }), '2026-11-08');
  s = cancelSubscription(s, '2026-11-20');
  assert.equal(s.status, 'canceled');
  assert.equal(isDue(s, '2026-12-08'), false);
  assert.equal(paidThroughOn(s), '2026-12-08');
  assert.equal(hasAccess(s, '2026-12-07'), true);
  assert.equal(hasAccess(s, '2026-12-08'), false);
  assert.equal(expire(s, '2026-12-08').status, 'ended');
  assert.equal(cancelSubscription(expire(s, '2026-12-08'), '2026-12-09').status, 'ended');
});

test('정가 전환 7일 전 안내 대상', () => {
  let s = newSubscription({ userId: 'u4', today: '2026-11-08' });
  for (const d of ['2026-11-08', '2026-12-08', '2027-01-08']) s = pay(s, d);
  assert.equal(conversionNotices([s], '2027-01-31').length, 0); // 8일 전
  assert.equal(conversionNotices([s], '2027-02-01').length, 1); // 7일 전
  assert.equal(conversionNotices([s], '2027-02-08').length, 1); // 당일
  assert.equal(conversionNotices([cancelSubscription(s, '2027-02-01')], '2027-02-02').length, 0); // 해지하면 제외
});

test('운영자 요약: 상태별 수·월 반복 매출·체험→정가 전환율·월별 추이', () => {
  const today = '2027-03-10';
  const subs = [];
  const payments = [];
  const add = (userId, start, months, { fail = false, cancelOn = null } = {}) => {
    let s = newSubscription({ userId, today: start });
    for (let i = 0; i < months; i += 1) {
      const on = addMonths(start, i);
      s = pay(s, on);
      payments.push({ id: `${userId}-${i}`, userId, amount: chargeAmount(i), status: 'paid', paidOn: on });
    }
    if (fail) {
      s = applyCharge(s, { ok: false, today });
      payments.push({ id: `${userId}-f`, userId, amount: chargeAmount(s.chargesDone), status: 'failed', paidOn: today });
    }
    if (cancelOn) s = cancelSubscription(s, cancelOn);
    subs.push(s);
  };
  add('a', '2026-11-05', 5); // 정가 전환 완료(5회)
  add('b', '2026-12-01', 3, { cancelOn: '2027-02-20' }); // 체험 3회 후 해지
  add('c', '2027-02-01', 2); // 체험 중
  add('d', '2027-03-01', 1, { fail: true }); // 결제 실패
  const sum = adminSummary({ subscriptions: subs, payments, profiles: [{ userId: 'a', nickname: '가' }] }, today);
  assert.equal(sum.subscribers, 4);
  assert.deepEqual([sum.byStatus.active, sum.byStatus.trial, sum.byStatus.canceled, sum.byStatus.past_due], [1, 1, 1, 1]);
  assert.equal(sum.mrr, PRICING.regularPrice + PRICING.introPrice + PRICING.introPrice); // a 8,900 + c 4,900 + d(재시도) 4,900
  assert.deepEqual(sum.conversion, { reached: 2, converted: 1, rate: 0.5 }); // a·b가 3개월을 넘김, a만 정가 결제
  assert.equal(sum.monthly.length, 12);
  assert.equal(sum.monthly.at(-1).month, '2027-03');
  assert.equal(sum.revenueTotal, payments.filter((p) => p.status === 'paid').reduce((a, p) => a + p.amount, 0));
  assert.equal(sum.pastDue.length, 1);
});

test('해지 취소: 낸 기간이 남아 있으면 원래 일정으로, 지나면 불가', () => {
  const s = cancelSubscription(pay(newSubscription({ userId: 'u5', today: '2026-11-08' }), '2026-11-08'), '2026-11-20');
  const back = resumeSubscription(s, '2026-11-25');
  assert.deepEqual([back.status, back.canceledOn, back.nextChargeOn], ['trial', null, '2026-12-08']);
  assert.equal(resumeSubscription(s, '2026-12-08'), s);
});

test('요청 처리: 동의·결제 수단 확인 → 첫 결제 4,900원 → 매달 갱신 → 4회째 8,900원', async () => {
  const store = memoryStore({ admins: ['boss'] });
  const charges = [];
  const pay = async (p) => (charges.push(p), p.billingKey === 'bad' ? { ok: false, error: '카드 한도 초과' } : { ok: true, pgTxId: `tx-${charges.length}` });
  const user = { id: 'owner-1', nickname: '왁싱 사장' };
  const agreed = { terms: true, privacy: true, billing: true };
  const call = (action, body, today = '2026-11-08') => handleBilling({ action, body, user, today, store, pay });

  assert.equal((await call('subscribe', { billingKey: 'k1', agreed: { terms: true } })).status, 400); // 동의 부족
  assert.equal((await call('subscribe', { agreed })).status, 400); // 결제 수단 없음
  const bad = await call('subscribe', { billingKey: 'bad', agreed });
  assert.equal(bad.status, 402);
  assert.match(bad.body.error, /카드 한도 초과/);
  const ok = await call('subscribe', { billingKey: 'k1', agreed, customer: { shopName: '테스트 왁싱' } });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.access, true);
  assert.deepEqual(ok.body.next, { on: '2026-12-08', amount: 4900, conversion: false });
  assert.equal((await call('subscribe', { billingKey: 'k1', agreed })).status, 409); // 중복 가입 막음

  for (const day of ['2026-12-08', '2027-01-08', '2027-02-08']) await runRenewals({ today: day, store, pay });
  assert.deepEqual(charges.filter((c) => c.billingKey === 'k1').map((c) => c.amount), [4900, 4900, 4900, 8900]);
  assert.match(charges.at(-1).orderName, /4개월차$/);
  // 같은 날 다시 돌려도 중복 결제 없음
  await runRenewals({ today: '2027-02-08', store, pay });
  assert.equal(charges.filter((c) => c.billingKey === 'k1').length, 4);
  assert.equal((await store.getSub('owner-1')).status, 'active');

  const canceled = await call('cancel', {}, '2027-02-20');
  assert.equal(canceled.body.subscription.status, 'canceled');
  assert.equal(canceled.body.access, true);
  const s = await runRenewals({ today: '2027-03-08', store, pay });
  assert.deepEqual([s.charged, s.ended], [0, 1]);
  // 다시 가입하면 체험가 없이 정가로
  const again = await call('subscribe', { billingKey: 'k2', agreed }, '2027-04-01');
  assert.equal(charges.at(-1).amount, 8900);
  assert.equal(again.body.subscription.status, 'active');
  assert.equal((await handleBilling({ action: 'status', user: { id: 'boss' }, today: '2027-04-01', store, pay })).body.isAdmin, true);
});

test('여러 매장 실험 합치기: 장치별 합산과 차이', () => {
  const pooled = poolExperiments([
    { userId: 'a', data: { experiments: [{ promotionId: 'next_visit_coupon', treated: 40, treatedSuccess: 20, control: 10, controlSuccess: 3 }] } },
    { userId: 'b', data: { experiments: [{ promotionId: 'next_visit_coupon', treated: 60, treatedSuccess: 30, control: 30, controlSuccess: 9 }, { promotionId: 'first_percent', weeksOn: 4, newOn: 20, weeksOff: 4, newOff: 12 }] } },
  ]);
  assert.equal(pooled.length, 1); // 격주 교차는 합산 대상 아님
  const p = pooled[0];
  assert.deepEqual([p.stores, p.treated, p.treatedSuccess, p.control, p.controlSuccess], [2, 100, 50, 40, 12]);
  assert.ok(Math.abs(p.diff - (0.5 - 0.3)) < 1e-9);
});
