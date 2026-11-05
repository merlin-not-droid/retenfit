import assert from 'node:assert/strict';
import { test } from 'node:test';
import { analyze, NO_PROMOTION, wilson } from '../src/app/js/analytics.js';
import { csvCell, parseAmount, parseCsv, toCsv } from '../src/app/js/csv.js';
import { addDays, diffDays, parseDate } from '../src/app/js/dates.js';
import {
  discountLimits,
  evaluateAcquisition,
  evaluateRetention,
  recommendDiscount,
  spectrumZones,
  visitEconomics,
} from '../src/app/js/economics.js';
import { ACQUISITION } from '../src/app/js/catalog.js';
import { exportVisitsCsv, importVisitsCsv, templateCsv } from '../src/app/js/records.js';
import { sampleState } from '../src/app/js/sample.js';
import { defaultState, mergeImported, nextCustomerId, nextVisitInfo } from '../src/app/js/state.js';

const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b}`);

test('할인·공헌이익 계산 (랜딩페이지 예시와 같은 값)', () => {
  const e = evaluateAcquisition({ price: 70000, variableCost: 20000, discountRate: 0.2, minContribution: 10000, revisitRate: 0.4 });
  assert.equal(e.first.discount, 14000);
  assert.equal(e.first.paid, 56000);
  assert.equal(e.first.contribution, 36000);
  assert.equal(e.revisit.contribution, 50000);
  near(e.recoveryRate, 0.28);
  assert.equal(e.zone, 'safe');
  assert.equal(e.expectedPerCustomer, 56000); // 36,000 + 0.4 × 50,000
  assert.equal(e.recoveredShare, 1);

  // 재방문율이 회수에 필요한 수준보다 낮으면 주의, 최소 이익 아래면 위험
  assert.equal(evaluateAcquisition({ price: 70000, variableCost: 20000, discountRate: 0.35, minContribution: 10000, revisitRate: 0.4 }).zone, 'caution');
  assert.equal(evaluateAcquisition({ price: 70000, variableCost: 20000, discountRate: 0.6, minContribution: 10000, revisitRate: 0.4 }).zone, 'danger');
  // 재방문율을 모르면 최소 이익만 봄
  assert.equal(evaluateAcquisition({ price: 70000, variableCost: 20000, discountRate: 0.35, minContribution: 10000 }).zone, 'safe');
  // 정액 할인, 할인액이 정가보다 크면 정가까지만
  assert.equal(visitEconomics({ price: 20000, variableCost: 5000, discountAmount: 30000 }).paid, 0);
  assert.equal(evaluateRetention({ price: 25000, variableCost: 6000, discountRate: 0.4, minContribution: 10000 }).zone, 'danger');
});

test('할인 한도·스펙트럼 구간·추천값', () => {
  const limits = discountLimits({ price: 70000, variableCost: 20000, minContribution: 10000, revisitRate: 0.4 });
  near(limits.byFloor, 4 / 7); // (70,000 − 20,000 − 10,000) / 70,000 = 57.1%
  near(limits.byRecovery, 20000 / 70000); // 0.4 × 50,000 / 70,000
  near(limits.max, 20000 / 70000);

  const zones = spectrumZones({ price: 70000, variableCost: 20000, minContribution: 10000, revisitRate: 0.4, maxRate: 0.7 });
  assert.deepEqual(zones.map((z) => z.zone), ['safe', 'caution', 'danger']);
  near(zones[0].to, 20000 / 70000);
  near(zones[1].to, 4 / 7);

  const first = ACQUISITION.find((p) => p.id === 'first-rate'); // 추천 20%, 범위 10~30%
  assert.equal(recommendDiscount({ promotion: first, price: 70000, variableCost: 20000, minContribution: 10000, revisitRate: 0.4 }).value, 0.2);
  // 재방문율이 낮으면 회수 가능한 만큼으로 추천값을 낮춤
  const lowered = recommendDiscount({ promotion: first, price: 70000, variableCost: 20000, minContribution: 10000, revisitRate: 0.2 });
  assert.equal(lowered.value, 0.14);
  assert.equal(lowered.reducedFrom, 0.2);
  // 마진이 너무 낮아 최소 범위도 못 맞추면 표시
  assert.equal(recommendDiscount({ promotion: first, price: 20000, variableCost: 9000, minContribution: 10000 }).limited, true);
});

test('날짜 해석과 계산', () => {
  assert.equal(parseDate('2026. 3. 7.'), '2026-03-07');
  assert.equal(parseDate('2026/03/07'), '2026-03-07');
  assert.equal(parseDate('20260307'), '2026-03-07');
  assert.equal(parseDate('2026년 3월 7일'), '2026-03-07');
  assert.equal(parseDate('2026-02-30'), null);
  assert.equal(parseDate('3/7'), null);
  assert.equal(addDays('2026-12-30', 3), '2027-01-02');
  assert.equal(diffDays('2026-03-01', '2026-03-31'), 30);
});

test('CSV: 따옴표·줄바꿈·BOM, 엑셀 수식 주입 방지', () => {
  assert.deepEqual(parseCsv('﻿a,b\r\n"x, y","줄\n바꿈"\n"따옴표 ""안"""\n'), [['a', 'b'], ['x, y', '줄\n바꿈'], ['따옴표 "안"']]);
  assert.equal(csvCell('=HYPERLINK("x")'), '"\'=HYPERLINK(""x"")"');
  assert.equal(csvCell('-5000'), '-5000');
  assert.equal(csvCell(-5000), '-5000');
  assert.ok(toCsv([['a']]).startsWith('﻿'));
  assert.equal(parseAmount('₩60,000원'), 60000);
  assert.equal(parseAmount(''), null);
  assert.ok(Number.isNaN(parseAmount('육만원')));
});

test('CSV 가져오기 검증: 오류 행 건너뛰기, 중복·성별 불일치 경고', () => {
  const csv = [
    '고객 번호,이름,성별,방문 날짜,시술,정가,결제 금액,프로모션,수신동의',
    'C001,손님A,여,2026-01-05,브라질리언,"70,000","56,000",첫 방문 할인,동의',
    'C001,손님A,여,2026-01-05,브라질리언,70000,56000,첫 방문 할인,동의', // 중복
    'C002,손님B,남성,2026/01/07,브라질리언,90000,,첫 방문 할인,', // 결제액 없음
    'C003,손님C,?,2026-01-08,겨드랑이,25000,25000,,', // 성별 오류
    'C004,손님D,여,2026-13-01,겨드랑이,25000,25000,,', // 날짜 오류
    'C001,손님A,남,2026-02-10,브라질리언,70000,80000,,미동의', // 성별 불일치, 결제액 > 정가
    'C005,손님E,F,2026-01-09,얼굴·인중,20000,20000,,maybe', // 수신동의 값 오류
  ].join('\n');
  const r = importVisitsCsv(csv, { asOf: '2026-03-01' });
  assert.equal(r.total, 7);
  assert.equal(r.records.length, 2);
  assert.deepEqual(r.errors.map((e) => e.row), [4, 5, 6, 8]);
  assert.match(r.errors[0].message, /결제액이 비어 있습니다/);
  assert.match(r.errors[1].message, /성별을 알 수 없습니다/);
  assert.match(r.errors[2].message, /방문일이 올바른 날짜가 아닙니다/);
  assert.match(r.warnings.map((w) => w.message).join('\n'), /이미 있어 건너뜁니다/);
  assert.match(r.warnings.map((w) => w.message).join('\n'), /성별이 앞 행과 다릅니다/);
  assert.match(r.warnings.map((w) => w.message).join('\n'), /정가보다 큽니다/);
  assert.equal(r.records[1].gender, 'F'); // 처음 값 유지
  assert.equal(r.records[1].consent, false);

  assert.match(importVisitsCsv('이름,날짜\n가,2026-01-01').errors[0].message, /필수 열이 없습니다: 고객ID, 성별, 시술, 결제액/);
  // 내보낸 파일과 양식을 다시 가져올 수 있어야 함
  assert.equal(importVisitsCsv(templateCsv()).records.length, 2);
});

test('가져오기 → 내보내기 → 다시 가져오기 왕복', () => {
  const state = defaultState();
  const first = importVisitsCsv(templateCsv());
  mergeImported(state, first.records);
  assert.equal(state.customers.length, 1);
  assert.equal(state.customers[0].consent.marketing, true);
  const again = importVisitsCsv(exportVisitsCsv(state.customers, state.visits));
  assert.deepEqual(again.errors, []);
  assert.deepEqual(
    again.records.map((r) => [r.customerId, r.date, r.paid, r.promotion]),
    first.records.map((r) => [r.customerId, r.date, r.paid, r.promotion]),
  );
  // 이미 있는 기록은 중복으로 건너뜀
  assert.equal(importVisitsCsv(exportVisitsCsv(state.customers, state.visits), { existingVisits: state.visits }).records.length, 0);
  assert.equal(nextCustomerId(state.customers), 'C002');
});

test('재방문율: 관찰 기간이 끝난 손님만, 관찰 중은 따로', () => {
  const v = (customerId, date, paid, promotion = '') => ({ customerId, date, service: 'X', paid, promotion });
  const visits = [
    v('A', '2026-01-01', 50000, '첫 방문 할인'), v('A', '2026-02-01', 60000), // 31일 뒤 재방문
    v('B', '2026-01-05', 50000, '첫 방문 할인'), v('B', '2026-04-01', 60000), // 86일 뒤 → 관찰 기간(60일) 밖
    v('C', '2026-01-10', 60000), // 프로모션 없음, 재방문 없음
    v('D', '2026-03-20', 50000, '첫 방문 할인'), v('D', '2026-03-30', 60000), // 관찰 중(기준일까지 12일), 이미 재방문
  ];
  const r = analyze(visits, { windowDays: 60, asOf: '2026-04-01', costOf: () => 20000, genderOf: (id) => (id === 'C' ? 'M' : 'F') });
  assert.equal(r.totals.customers, 4);
  assert.equal(r.totals.completed, 3);
  assert.equal(r.totals.observing, 1);
  assert.equal(r.totals.observingRevisited, 1);
  assert.equal(r.totals.revisited, 1);
  near(r.totals.rate, 1 / 3);

  const promo = r.byPromotion.find((g) => g.label === '첫 방문 할인');
  assert.equal(promo.completed, 2);
  assert.equal(promo.rate, 0.5);
  // 손님 1명당 공헌이익(60일 안): A = (50,000−20,000)+(60,000−20,000)=70,000, B = 30,000 → 평균 50,000
  assert.equal(promo.contributionPerCustomer, 50000);
  assert.equal(r.byPromotion.at(-1).label, NO_PROMOTION); // '없음'은 맨 뒤
  near(promo.lift, 0.5); // 50% − 0%
  assert.equal(promo.smallSample, true);

  // 성별 필터
  assert.equal(analyze(visits, { asOf: '2026-04-01', gender: 'M', genderOf: (id) => (id === 'C' ? 'M' : 'F') }).totals.customers, 1);
  // 변동비를 모르면 공헌이익을 확정하지 않음
  const unknown = analyze(visits, { asOf: '2026-04-01', costOf: () => null });
  assert.equal(unknown.totals.contributionPerCustomer, null);
  assert.equal(unknown.totals.contributionUnknown, 3);
});

test('윌슨 신뢰 구간', () => {
  const [lo, hi] = wilson(40, 100);
  near(lo, 0.3093, 1e-3);
  near(hi, 0.4979, 1e-3);
  assert.deepEqual(wilson(0, 0), null);
  assert.ok(wilson(0, 5)[0] === 0 && wilson(5, 5)[1] === 1);
});

test('다음 방문 예정일과 상태', () => {
  const state = defaultState();
  const c = { id: 'C001', gender: 'F', mainService: '브라질리언', cycleDays: null };
  const visits = [{ customerId: 'C001', date: '2026-03-01', service: '브라질리언', paid: 56000 }];
  const at = (base) => nextVisitInfo(c, visits, state.settings, base);
  assert.equal(at('2026-03-10').nextDate, '2026-04-05'); // 여성 브라질리언 기본 35일
  assert.equal(at('2026-03-10').status, 'scheduled');
  assert.equal(at('2026-03-30').status, 'soon');
  assert.equal(at('2026-04-20').status, 'overdue');
  assert.equal(at('2026-05-20').status, 'dormant');
  assert.equal(nextVisitInfo({ ...c, cycleDays: 28 }, visits, state.settings, '2026-03-10').nextDate, '2026-03-29');
  assert.equal(nextVisitInfo({ ...c, id: 'X' }, visits, state.settings).status, 'none');
});

test('샘플 데이터는 고정된 결과를 만들고 분석 가능', () => {
  const a = sampleState('2026-11-05');
  const b = sampleState('2026-11-05');
  assert.deepEqual(a, b);
  assert.ok(a.customers.length > 80);
  assert.ok(a.visits.every((v) => v.date <= '2026-11-05'));
  const r = analyze(a.visits, { asOf: '2026-11-05', genderOf: (id) => a.customers.find((c) => c.id === id).gender, costOf: () => 20000 });
  assert.ok(r.totals.completed > 50);
  assert.ok(r.byPromotion.length >= 4);
});
