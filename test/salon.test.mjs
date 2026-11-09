import assert from 'node:assert/strict';
import { test } from 'node:test';
import { markAdopted, monthlySummaryHtml, syncMonthly } from '../src/assets/js/monthly-record.js';
import { recommend } from '../src/assets/js/promo-engine/index.js';
import { crossSellRecommendations } from '../src/salon/app/js/ai.js';
import { DEFAULTS, clone, demoCustomers, economics, evaluatePlan } from '../src/salon/app/js/core.js';
import { dashboardModel, initializeDashboard, promotionGroups } from '../src/salon/app/js/dashboard.js';
import { audienceFor, buildSalonRecommendation, experimentOutcome, metricsSnapshot, planFromEvaluation, salesReport, salonResults, startEngineRun } from '../src/salon/app/js/recommend.js';
import { readShop, renderRecommend, renderSales, shopFields } from '../src/salon/app/js/recommend-view.js';

const asOf = '2026-11-09';
const fresh = (over = {}) => {
  const state = { settings: { ...clone(DEFAULTS), asOf, month: asOf.slice(0, 7), ...over }, customers: demoCustomers(asOf), source: 'sample', plans: [] };
  initializeDashboard(state);
  return state;
};
const esc = (s) => String(s);

test('미용실 샘플로 추천이 나오고 매달 기록이 남는다', () => {
  const state = fresh();
  const rec = buildSalonRecommendation(state);
  assert.ok(rec.plan.selected.length >= 1);
  assert.equal(state.monthlyPlans.length, 1);
  assert.equal(state.monthlyPlans[0].period, '2026-11');
  assert.equal(rec.plan.changes.previous, null);
});

test('다음 달 추천은 달라지고 이유를 함께 보여 준다', () => {
  const october = fresh({ asOf: '2026-10-20', month: '2026-10' });
  buildSalonRecommendation(october);
  const november = fresh();
  november.monthlyPlans = october.monthlyPlans;
  const rec = buildSalonRecommendation(november);
  assert.equal(rec.plan.changes.previous, '2026-10');
  assert.ok(rec.plan.changes.added.length >= 1);
  const html = monthlySummaryHtml(rec.plan.changes, esc);
  assert.match(html, /이번 달 달라진 점/);
  assert.match(html, /2026-10/);
});

test('실행 기록 → 비교군 분리 → 다음 달 고객 데이터로 결과 자동 계산 → 추천 반영', () => {
  const state = fresh({ asOf: '2026-09-01', month: '2026-09' });
  const rec = buildSalonRecommendation(state);
  const target = rec.plan.byObjective.retain.concat(rec.plan.byObjective.loyalize, rec.plan.byObjective.convert).find((e) => e.device.segment !== 'prospect' && audienceFor(e.device, state).length >= 10);
  assert.ok(target, '비교군을 나눌 수 있는 추천이 있어야 한다');
  const { experiment } = startEngineRun(target, state);
  assert.ok(experiment);
  assert.ok(experiment.control.length >= 2 && experiment.treatment.length >= 2);
  assert.ok(state.monthlyPlans[0].adopted.includes(target.device.id));
  // 같은 달에 다시 눌러도 나누어 둔 비교군을 그대로 유지
  assert.equal(startEngineRun(target, state).experiment, experiment);

  // 관찰 기간 전에는 결과를 계산하지 않음
  assert.ok(experimentOutcome(experiment, state).observing > 0);
  assert.equal(salonResults(state, { id: 'salon-local' }).length, 0);

  // 60일 뒤, 혜택군만 대부분 다시 왔다고 고객 데이터를 갱신
  state.settings.asOf = '2026-11-09';
  state.settings.month = '2026-11';
  for (const c of state.customers) {
    if (experiment.treatment.includes(c.id)) c.last = '2026-09-20';
    if (experiment.control.includes(c.id)) c.last = '2026-08-01';
  }
  const outcome = experimentOutcome(experiment, state);
  assert.equal(outcome.treatedSuccess, experiment.treatment.length);
  assert.equal(outcome.controlSuccess, 0);
  const results = salonResults(state, { id: 'salon-local' });
  assert.equal(results.length, 1);
  assert.equal(results[0].promotionId, target.device.id);

  const next = buildSalonRecommendation(state);
  assert.ok(next.plan.changes.learned.some((l) => l.id === target.device.id));
});

test('원장이 입력한 결과가 있으면 그 값을 쓴다', () => {
  const x = { treatment: ['a', 'b', 'c'], control: ['d', 'e'], result: { treatmentReturned: 2, controlReturned: 1 } };
  const r = experimentOutcome(x, fresh());
  assert.deepEqual([r.treated, r.treatedSuccess, r.control, r.controlSuccess, r.source], [3, 2, 2, 1, 'owner']);
});

test('추천 장치를 프로모션 설계안으로 바꾸면 손익 계산이 된다', () => {
  const state = fresh();
  const rec = buildSalonRecommendation(state);
  const priced = Object.values(rec.plan.byObjective).flat().filter((e) => ['percent', 'amount', 'gift', 'service', 'bonus'].includes(e.device.lever.kind));
  assert.ok(priced.length > 0);
  for (const e of priced) {
    const plan = planFromEvaluation(e, state);
    assert.ok(plan, e.device.id);
    assert.equal(plan.engineId, e.device.id);
    assert.ok(plan.count >= 1);
    const x = evaluatePlan(state.settings, state.customers, plan, []);
    assert.ok(Number.isFinite(x.e.residual));
    assert.ok(Number.isFinite(economics(state.settings, plan.service, plan).benefitCost));
  }
  const none = Object.values(rec.plan.byObjective).flat().find((e) => e.device.lever.kind === 'none');
  if (none) assert.equal(planFromEvaluation(none, state), null);
});

test('매장 진단이 다르면 추천이 달라진다', () => {
  const a = fresh();
  a.settings.shop = { configured: true, tradeArea: 'residential', openedOn: '2019-03', competitorDensity: 3, competitorDiscountIntensity: 0, reviewCount: 200, rating: 4.8, offPeakSlack: 0.1, hasOnlineBooking: true };
  const b = fresh({ budget: 150000, stylists: 1, assistants: 0, rent: 900000, otherFixed: 400000, targetProfit: 800000 });
  b.settings.shop = { configured: true, tradeArea: 'university', openedOn: '2026-07', competitorDensity: 10, competitorDiscountIntensity: 3, reviewCount: 4, rating: 4.1, offPeakSlack: 0.5, hasOnlineBooking: false };
  b.customers = b.customers.filter((_, i) => i % 3 === 0).map((c) => ({ ...c, visits: Math.min(c.visits, 2) }));
  const ids = (s) => buildSalonRecommendation(s).plan.selected.map((e) => e.device.id).sort().join();
  assert.notEqual(ids(a), ids(b));
});

test('화면이 그려지고, 고객 데이터를 지운 빈 매장에서도 깨지지 않는다', () => {
  const state = fresh();
  const rec = buildSalonRecommendation(state);
  assert.match(renderRecommend(state, rec), /이번 달 실행 플랜/);
  assert.match(renderSales(state), /월별 매출/);
  assert.match(shopFields(state), /매장 진단/);

  const empty = fresh();
  empty.customers = [];
  empty.source = 'import';
  empty.visitData = null;
  initializeDashboard(empty);
  const emptyRec = buildSalonRecommendation(empty);
  assert.equal(typeof renderRecommend(empty, emptyRec), 'string');
  assert.match(renderSales(empty), /방문 단위 기록이 없어/);
  assert.equal(dashboardModel(empty).risk.length, 0);
  assert.ok(promotionGroups(empty).length > 0);
  assert.equal(crossSellRecommendations(empty.customers, empty.settings).rows.length, 0);
});

test('매장 진단 입력값을 읽는다', () => {
  const fd = new Map(Object.entries({ shop_tradeArea: 'office', shop_openedOn: '2024-01', shop_competitorDiscountIntensity: '2', shop_competitorDensity: '5', shop_reviewCount: '40', shop_rating: '4.5', shop_offPeakSlack: '30', shop_hasOnlineBooking: 'on' }));
  const shop = readShop({ get: (k) => fd.get(k) ?? null });
  assert.equal(shop.configured, true);
  assert.equal(shop.tradeArea, 'office');
  assert.equal(shop.offPeakSlack, 0.3);
  assert.equal(shop.hasOnlineBooking, true);
});

test('샘플 매장은 고정 ID로 탐색 없이, 실제 매장은 저장된 키로 계산한다', () => {
  const ids = (rec) => rec.plan.selected.map((e) => e.device.id).sort().join();
  const sample = fresh();
  const shown = buildSalonRecommendation(sample);
  assert.equal(shown.store.id, 'salon-sample');
  assert.equal(shown.store.preferences.stableMode, true);
  assert.equal(sample.storeKey, undefined);

  const own = { ...fresh(), source: 'import' };
  own.monthlyPlans = [];
  const first = buildSalonRecommendation(own);
  const key = own.storeKey;
  assert.match(key, /^salon-/);
  assert.equal(first.recordChanged, true, '새 키는 저장되어야 다시 열어도 같은 추천이 나온다');
  const again = buildSalonRecommendation(own);
  assert.equal(own.storeKey, key);
  assert.equal(again.recordChanged, false);
  assert.equal(ids(again), ids(first));
});

test('같은 달에도 매장마다 탐색 결과가 달라 추천이 한쪽으로 쏠리지 않는다', () => {
  const plans = new Set();
  for (let i = 0; i < 12; i += 1) {
    const state = { ...fresh(), source: 'import', storeKey: `salon-test-${i}`, monthlyPlans: [] };
    plans.add(buildSalonRecommendation(state).plan.selected.map((e) => e.device.id).sort().join());
  }
  assert.ok(plans.size >= 2, `조합 ${plans.size}개`);
});

test('매출 보고: 방문 기록이 있으면 월별로, 합계는 기록과 일치', () => {
  const state = fresh();
  const r = salesReport(state);
  assert.ok(r.rows.length > 0);
  const m = r.rows[0];
  const sum = state.visitData.visits.filter((v) => v.date.startsWith(m.month) && v.date <= asOf).reduce((n, v) => n + v.paid, 0);
  assert.equal(m.revenue, sum);
});

test('서버로 보내는 숫자에 고객 ID가 들어가지 않고 업종이 표시된다', () => {
  const state = fresh();
  const snapshot = metricsSnapshot(state, buildSalonRecommendation(state));
  assert.equal(snapshot.service, 'salon');
  const text = JSON.stringify(snapshot);
  assert.doesNotMatch(text, /"C\d{3}"/);
});

test('기록 도우미: 추천이 그대로면 저장할 일이 없고, 실행 표시는 유지된다', () => {
  const state = fresh();
  const plan = recommend(buildSalonRecommendation(state).store, { period: '2026-11', history: [] });
  state.monthlyPlans = [];
  assert.equal(syncMonthly(state, plan, '2026-11'), true);
  assert.equal(syncMonthly(state, plan, '2026-11'), false);
  markAdopted(state, '2026-11', plan.selected[0].device.id);
  markAdopted(state, '2026-11', plan.selected[0].device.id);
  assert.equal(state.monthlyPlans[0].adopted.length, 1);
});
