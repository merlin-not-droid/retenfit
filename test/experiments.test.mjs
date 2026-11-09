import assert from 'node:assert/strict';
import { test } from 'node:test';
import { addDays } from '../src/app/js/dates.js';
import {
  armOf, campaignResults, designOf, experimentResult, newExperiment, recordMessageExposures, switchbackWeek,
} from '../src/app/js/experiments.js';
import { CATALOG_BY_ID } from '../src/app/js/promo-engine/index.js';
import { buildRecommendation, learningFor } from '../src/app/js/recommend.js';
import { sampleState } from '../src/app/js/sample.js';
import { defaultState } from '../src/app/js/state.js';
import { render } from '../src/app/js/views/experiments.js';

const plan = (promotionId, kind = 'retention', rate = 0.1) => ({ id: `p_${promotionId}`, kind, name: `${promotionId} 테스트`, promotionId, rate });
const visit = (customerId, date) => ({ customerId, date, service: '브라질리언', listPrice: 70000, paid: 70000, promotion: '' });

test('배정: 같은 손님은 항상 같은 군, 비교군 비율은 설정값 근처', () => {
  const exp = newExperiment(plan('second-visit'), { id: 'x1', startDate: '2026-06-01', controlShare: 0.3 });
  assert.equal(armOf(exp, 'C001'), armOf(exp, 'C001'));
  const ids = Array.from({ length: 3000 }, (_, i) => `C${i}`);
  const share = ids.filter((id) => armOf(exp, id) === 'control').length / ids.length;
  assert.ok(Math.abs(share - 0.3) < 0.03, `비교군 비율 ${share}`);
  // 손님 번호가 연속(C001~C100)이어도 한쪽으로 몰리지 않음
  const seq = Array.from({ length: 100 }, (_, i) => `C${String(i + 1).padStart(3, '0')}`);
  const seqShare = seq.filter((id) => armOf(exp, id) === 'control').length / seq.length;
  assert.ok(Math.abs(seqShare - 0.3) < 0.12, `연속 번호 비교군 비율 ${seqShare}`);
  // 실험이 다르면 배정도 독립
  const other = { ...exp, id: 'x2' };
  assert.ok(ids.some((id) => armOf(exp, id) !== armOf(other, id)));
});

test('방식은 프로모션 대상에 따라 자동으로 정해진다', () => {
  assert.equal(designOf(CATALOG_BY_ID.first_percent), 'switchback'); // 첫 방문 할인
  assert.equal(designOf(CATALOG_BY_ID.next_visit_coupon), 'checkout'); // 주기 안 재방문 할인
  assert.equal(designOf(CATALOG_BY_ID.session_pack), 'checkout'); // 회수권(2회째)
  assert.equal(designOf(CATALOG_BY_ID.cycle_reminder), 'message'); // 주기 안내
  const sw = newExperiment(plan('first-rate', 'acquisition', 0.2), { id: 'x', startDate: '2026-06-01', controlShare: 0.2 });
  assert.equal(sw.controlShare, 0.5);
  assert.equal(sw.engineId, 'first_percent');
});

test('비교군(결제 때): 관찰이 끝난 손님만 세고, 혜택군·비교군 재방문을 따로 계산', () => {
  const state = defaultState();
  const exp = newExperiment(plan('second-visit'), { id: 'x_checkout', startDate: '2026-06-01', controlShare: 0.5, settings: { windowDays: 30 } });
  state.experiments.push(exp);
  for (let i = 0; i < 60; i += 1) {
    const id = `C${String(i).padStart(3, '0')}`;
    const first = addDays('2026-06-01', i % 20);
    state.visits.push(visit(id, first));
    if (armOf(exp, id) === 'treat') state.visits.push(visit(id, addDays(first, 20))); // 혜택군만 20일 뒤 재방문
  }
  state.visits.push(visit('C999', '2026-05-20')); // 실험 전 첫 방문 → 제외
  state.visits.push(visit('C998', '2026-08-28')); // 관찰 중
  const r = experimentResult(exp, state, '2026-09-01');
  const treat = r.arms.treat;
  const control = r.arms.control;
  assert.equal(treat.n + control.n, 60);
  assert.equal(treat.success, treat.n);
  assert.equal(control.success, 0);
  assert.equal(treat.observing + control.observing, 1);
  assert.equal(r.stats.verdict, 'positive');
  assert.ok(r.stats.ci[0] > 0);
});

test('격주 교차: 지난 주만 세고 시행 주/쉬는 주 신규 손님을 비교', () => {
  const state = defaultState();
  const exp = newExperiment(plan('first-rate', 'acquisition', 0.2), { id: 'x_sw', startDate: '2026-06-01' });
  let n = 0;
  for (let k = 0; k < 8; k += 1) {
    const perWeek = k % 2 === 0 ? 8 : 3;
    for (let j = 0; j < perWeek; j += 1) state.visits.push(visit(`N${(n += 1)}`, addDays('2026-06-01', 7 * k + (j % 7))));
  }
  state.visits.push(visit('N_now', '2026-07-27')); // 진행 중인 9번째 주 → 아직 안 셈
  const r = experimentResult(exp, state, '2026-07-27');
  assert.deepEqual(r.weeks, { weeksOn: 4, newOn: 32, weeksOff: 4, newOff: 12 });
  assert.equal(r.stats.verdict, 'positive');
  assert.ok(r.stats.uplift > 1);
  assert.equal(switchbackWeek(exp, '2026-07-27').on, true); // 9번째 주(k=8)는 시행 주
  assert.equal(switchbackWeek(exp, '2026-06-09').on, false);
});

test('비교군(안내 발송): 복사할 때 양쪽을 한 번씩만 기록하고 30일 안 방문을 성공으로', () => {
  const state = defaultState();
  const exp = newExperiment(plan('cycle-remind', 'retention', 0), { id: 'x_msg', startDate: '2026-06-01', controlShare: 0.5 });
  const ids = Array.from({ length: 40 }, (_, i) => `M${i}`);
  assert.equal(recordMessageExposures(exp, ids, '2026-06-10'), 40);
  assert.equal(recordMessageExposures(exp, ids.slice(0, 10), '2026-06-20'), 0); // 중복 기록 안 함
  for (const id of ids) if (armOf(exp, id) === 'treat') state.visits.push(visit(id, '2026-06-25'));
  const r = experimentResult(exp, state, '2026-08-01');
  assert.equal(r.arms.treat.success, r.arms.treat.n);
  assert.equal(r.arms.control.success, 0);
});

test('실험 결과 → 추천 엔진 입력: 장치·강도·집계값', () => {
  const state = defaultState();
  const exp = newExperiment(plan('second-visit', 'retention', 0.1), { id: 'x_cr', startDate: '2026-06-01', controlShare: 0.5, settings: { windowDays: 30 } });
  state.experiments.push(exp);
  for (let i = 0; i < 30; i += 1) state.visits.push(visit(`K${i}`, addDays('2026-06-01', i)));
  const store = { id: 'waxfit-local', avgTicket: 60000 };
  const [r] = campaignResults(state, '2026-09-01', store);
  assert.equal(r.promotionId, 'next_visit_coupon');
  assert.equal(r.storeId, 'waxfit-local');
  assert.equal(r.level, 6000); // 할인 10% × 객단가 6만원 → 6,000원 쿠폰
  assert.equal(r.treated + r.control, 30);
});

test('샘플: 진행 중인 실험이 있고, 결과가 추천 엔진의 효과 추정을 바꾼다', () => {
  const asOf = '2026-11-05';
  const state = sampleState(asOf);
  assert.equal(state.experiments.length, 1);
  const r = experimentResult(state.experiments[0], state, asOf);
  assert.ok(r.arms.treat.n >= 10 && r.arms.control.n >= 10, `표본 ${r.arms.treat.n}/${r.arms.control.n}`);
  assert.ok(r.stats.pt > r.stats.pc, '샘플은 혜택군 재방문이 더 많도록 만듦');
  const rec = buildRecommendation(state, asOf);
  assert.ok(rec.results.some((x) => x.promotionId === 'next_visit_coupon'));
  const l = learningFor(rec, 'next_visit_coupon');
  assert.ok(l.after.effectiveN > 0 && l.share > 0 && l.share < 1);
  assert.notEqual(l.after.mean, l.before.mean);
});

test('효과 실험 화면: 진행 중 카드·결과표·엔진 반영이 그려진다', () => {
  const asOf = '2026-11-05';
  const state = sampleState(asOf);
  const app = { state, today: asOf, recommendation: () => buildRecommendation(state, asOf) };
  const out = String(render(app));
  for (const text of ['효과 실험', '진행 중 (1)', '혜택군', '비교군', '추천 엔진 반영', '새 실험 시작']) assert.ok(out.includes(text), text);
  assert.equal((out.match(/<h1>/g) ?? []).length, 1);
  assert.ok(!out.includes('undefined') && !out.includes('NaN'));
});
