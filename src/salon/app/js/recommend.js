// 미용실 이번 달 추천: 매장·고객 데이터 → promo-engine → 매달 달라지는 추천 (순수 함수 — test/salon.test.mjs)
import { markAdopted, storeKey, syncMonthly, withoutExploration } from '../../../assets/js/monthly-record.js';
import { customerCopy, recommend, storeFromSalon } from '../../../assets/js/promo-engine/index.js';
import { daysBetween, economics, planAudience, salonModel } from './core.js';
import { addDays, promotionGroups } from './dashboard.js';
import { deterministicSplit } from './growth.js';

export const TRADE_AREA = { residential: '주거지', office: '오피스', university: '대학가', station: '역세권·번화가' };
export const COMPETITION = ['거의 없음', '조금 있음', '보통', '매우 심함'];
export const EVIDENCE = { prior: '초기 가정', similar: '유사 매장 실험', own: '우리 매장 실험' };

const PROFILE_TO_AREA = { residential: 'residential', office: 'office', campus: 'university' };

export function defaultShop(state) {
  return {
    configured: false,
    tradeArea: PROFILE_TO_AREA[state?.growthSettings?.profile] ?? 'residential',
    openedOn: '',
    competitorDensity: 3,
    competitorDiscountIntensity: 1,
    reviewCount: 30,
    rating: 4.5,
    offPeakSlack: 0.3,
    hasOnlineBooking: true,
  };
}

const num = (v, fallback = 0) => (Number.isFinite(Number(v)) ? Number(v) : fallback);

function monthsSince(ym, asOf) {
  const m = /^(\d{4})-(\d{2})/.exec(ym || '');
  if (!m) return null;
  return Math.max(0, (Number(asOf.slice(0, 4)) - Number(m[1])) * 12 + Number(asOf.slice(5, 7)) - Number(m[2]));
}

function dataMonths(state) {
  const dates = (state.visitData?.visits ?? []).map((v) => v.date).sort();
  if (dates.length) return Math.max(1, daysBetween(dates[0], state.settings.asOf) / 30);
  return state.customers.some((c) => c.visits > 0) ? 6 : 0;
}

/** 매장 설정의 '매장 진단' → 엔진 입력 */
export function salonContext(state) {
  const s = { ...defaultShop(state), ...(state.settings.shop ?? {}) };
  const util = state.growthSettings?.bookingUtilization;
  return {
    tradeArea: TRADE_AREA[s.tradeArea] ? s.tradeArea : 'residential',
    competitorDensity: Math.max(0, num(s.competitorDensity)),
    competitorDiscountIntensity: Math.min(3, Math.max(0, Math.round(num(s.competitorDiscountIntensity, 1)))),
    monthsOpen: monthsSince(s.openedOn, state.settings.asOf) ?? 24,
    offPeakSlack: Math.min(1, Math.max(0, num(s.offPeakSlack, 0.3))),
    reviewCount: Math.max(0, num(s.reviewCount)),
    rating: Math.min(5, Math.max(0, num(s.rating))),
    hasOnlineBooking: Boolean(s.hasOnlineBooking),
    utilization: Number.isFinite(util) ? util / 100 : null,
    dataMonths: dataMonths(state),
  };
}

/** 원장이 입력한 값이 있으면 그 값을, 없으면 고객 기록의 최근 방문일로 비교 결과를 계산합니다 */
export function experimentOutcome(x, state) {
  if (x.result) return { treated: x.treatment.length, treatedSuccess: x.result.treatmentReturned, control: x.control.length, controlSuccess: x.result.controlReturned, observing: 0, source: 'owner' };
  const start = x.startDate ?? x.createdAt?.slice(0, 10);
  if (!start) return null;
  const window = x.windowDays ?? 60;
  const asOf = state.settings.asOf;
  if (daysBetween(start, asOf) < window) return { treated: 0, treatedSuccess: 0, control: 0, controlSuccess: 0, observing: x.treatment.length + x.control.length, source: 'auto' };
  const end = addDays(start, window);
  const byId = new Map(state.customers.map((c) => [c.id, c]));
  const returned = (ids) => ids.filter((id) => {
    const last = byId.get(id)?.last;
    return last && last > start && last <= end;
  }).length;
  return { treated: x.treatment.length, treatedSuccess: returned(x.treatment), control: x.control.length, controlSuccess: returned(x.control), observing: 0, source: 'auto' };
}

/** 실험 → 엔진 학습 입력. 결과가 나온 실험만 */
export function salonResults(state, store) {
  const out = [];
  for (const x of state.experiments ?? []) {
    if (!x.engineId) continue;
    const r = experimentOutcome(x, state);
    if (!r || !r.treated || !r.control) continue;
    out.push({ storeId: store.id, promotionId: x.engineId, period: x.month, level: x.level, treated: r.treated, treatedSuccess: r.treatedSuccess, control: r.control, controlSuccess: r.controlSuccess });
  }
  return out;
}

/** 이번 달 추천. 지난달까지의 기록과 실험 결과를 반영합니다 */
export function buildSalonRecommendation(state) {
  const period = state.settings.month;
  const isSample = state.source === 'sample';
  const key = storeKey(state, 'salon', isSample);
  const store = storeFromSalon(state, salonContext(state), key.id);
  if (isSample) withoutExploration(store);
  const results = salonResults(state, store);
  const plan = recommend(store, { period, results, stores: [store], history: state.monthlyPlans ?? [], listSize: 50 });
  const recordChanged = syncMonthly(state, plan, period) || key.created;
  return {
    store, plan, results, recordChanged,
    configured: Boolean(state.settings.shop?.configured),
    dataReady: state.customers.filter((c) => c.visits > 0).length >= 30,
  };
}

/** 장치가 겨냥하는 고객(엔진의 segment) */
export function audienceFor(device, state) {
  const s = state.settings;
  const cycleOf = (c) => (c.cycle > 0 ? c.cycle : s.services.find((v) => v.id === c.service)?.cycle ?? 45);
  const ratio = (c) => (c.last ? daysBetween(c.last, s.asOf) / cycleOf(c) : 0);
  const held = new Set((state.experiments ?? []).filter((x) => x.month === s.month).flatMap((x) => x.control));
  const test = {
    prospect: (c) => c.visits === 0,
    firstTimer: (c) => c.visits === 1,
    repeat: (c) => c.visits >= 2 && c.visits < s.loyaltyVisits,
    regular: (c) => c.visits >= s.loyaltyVisits && ratio(c) <= 1.5,
    atRisk: (c) => c.visits >= 2 && ratio(c) > 1.5 && ratio(c) < 2,
    lapsed: (c) => c.visits >= 2 && ratio(c) >= 2,
  }[device.segment] ?? (() => false);
  return state.customers.filter((c) => test(c) && !held.has(c.id) && (device.channel !== 'message' || c.consent));
}

function topService(rows, s) {
  const count = {};
  rows.forEach((c) => (count[c.service] = (count[c.service] ?? 0) + 1));
  return Object.entries(count).sort((a, b) => b[1] - a[1])[0]?.[0] ?? s.services[0].id;
}

/** 프로모션 설계 화면에서 손익을 확인할 수 있는 장치면 설계안으로 바꿉니다. 금액이 없는 장치는 null */
export function planFromEvaluation(e, state) {
  const { device, recommended } = e;
  const s = state.settings;
  const rows = audienceFor(device, state);
  const service = topService(rows, s);
  const benefit = { percent: { type: 'discount', discount: Math.round(recommended.level * 100) }, amount: { type: 'coupon', coupon: recommended.level } }[device.lever.kind]
    ?? (['gift', 'service'].includes(device.lever.kind) ? { type: 'gift', gift: recommended.level, giftName: device.name } : null)
    ?? (device.lever.kind === 'bonus' ? { type: 'wallet', bonus: Math.round(recommended.level * 100), charge: 300000 } : null);
  if (!benefit) return null;
  const base = { discount: 0, points: 0, gift: 0, coupon: 0, bonus: 0, charge: 0, extraMinutes: 0, giftName: '홈케어 제품', giftRetail: 15000 };
  const plan = {
    ...base, ...benefit,
    key: `engine-${device.id}`, engineId: device.id, level: recommended.level,
    groupName: device.name, segment: 'regular', service, execution: device.channel === 'message' ? 'contact' : 'counter',
    audienceIds: rows.map((c) => c.id), expiry: device.segment === 'lapsed' ? 14 : 30,
    conditions: '1인 1회 · 다른 혜택과 중복 불가', aiReason: device.summary, reason: e.reasons.at(-1) ?? device.summary, month: s.month, generated: true,
  };
  const eligible = planAudience(plan, state.customers, s).length;
  const unit = economics(s, service, plan).benefitCost;
  plan.count = Math.max(1, Math.min(eligible || 1, state.growthSettings?.pilotLimit ?? 20, unit > 0 ? Math.floor(s.budget / unit) || 1 : 20));
  return plan;
}

/** 비교군을 나눠 이번 달 실행을 시작합니다. 개인 비교군을 둘 수 없는 신규 유입 장치는 실행 표시만 합니다 */
export function startEngineRun(e, state) {
  const s = state.settings;
  markAdopted(state, s.month, e.device.id);
  if (e.device.segment === 'prospect') return { experiment: null };
  state.experiments ??= [];
  const id = `${s.month}-${e.device.id}`;
  const existing = state.experiments.find((x) => x.id === id);
  if (existing) return { experiment: existing };
  const ids = audienceFor(e.device, state).map((c) => c.id);
  const split = deterministicSplit(ids, Math.round((e.measurement.controlShare ?? 0.2) * 100), id);
  if (split.control.length < 2 || split.treatment.length < 2) return { experiment: null, tooSmall: true };
  const experiment = {
    id, month: s.month, stage: e.objective, engineId: e.device.id, level: e.recommended.level, label: e.device.name,
    ...split, startDate: s.asOf, windowDays: 60, createdAt: new Date().toISOString(),
  };
  state.experiments.push(experiment);
  return { experiment };
}

/** 원장이 검토하는 안내 문구 */
export function recommendationMessage(e, state) {
  const body = customerCopy(e.device, e.recommended.level);
  if (!e.device.requires?.consent) return body;
  const salon = state.settings.salon || '[매장 이름]';
  return [`(광고) ${salon}`, body, '예약 문의: [매장 연락처]', '무료 수신거부: [매장 연락처]로 ‘수신거부’ 회신'].join('\n');
}

/** 서버로 보내는 매장 집계 숫자(손님 개인정보 없음) */
export function metricsSnapshot(state, rec) {
  const round = (x, d) => (Number.isFinite(x) ? Math.round(x * 10 ** d) / 10 ** d : null);
  const f = rec.store.funnel;
  return {
    service: 'salon',
    shopName: state.settings.salon || '',
    tradeArea: rec.store.tradeArea,
    tradeAreaLabel: TRADE_AREA[rec.store.tradeArea] ?? '',
    pricePosition: rec.store.pricePosition,
    monthsOpen: rec.store.monthsOpen,
    staffCount: rec.store.staffCount,
    customers: state.customers.length,
    visits: state.customers.reduce((n, c) => n + c.visits, 0),
    newPerMonth: round(f.newPerMonth, 1),
    secondVisitRate: round(f.secondVisitRate, 3),
    regularRate: round(f.regularRate, 3),
    activeRegulars: f.activeRegulars,
    overdueShare: round(f.overdueShare, 3),
    lapsedCount: f.lapsedCount,
    avgIntervalDays: round(f.avgIntervalDays, 1),
    avgTicket: Math.round(rec.store.avgTicket),
    consentRate: round(rec.store.marketingConsentRate, 3),
    plan: rec.plan.selected.map((e) => ({ id: e.device.id, level: e.recommended.level })),
    experiments: rec.results,
  };
}

/** 월별 매출: 방문 단위 기록이 있을 때 시술별로, 없으면 설정 기준 예상만 */
export function salesReport(state) {
  const s = state.settings;
  const m = salonModel(s);
  const visits = state.visitData?.visits ?? [];
  const months = new Map();
  for (const v of visits) {
    if (v.date > s.asOf) continue;
    const key = v.date.slice(0, 7);
    if (!months.has(key)) months.set(key, { month: key, revenue: 0, visits: 0, byService: {} });
    const row = months.get(key);
    row.revenue += v.paid;
    row.visits += 1;
    row.byService[v.service] = (row.byService[v.service] ?? 0) + v.paid;
  }
  const rows = [...months.values()].sort((a, b) => b.month.localeCompare(a.month)).slice(0, 12);
  const expected = s.services.map((v) => ({ id: v.id, name: v.name, price: v.price, volume: v.volume, sales: v.price * v.volume, share: m.sales ? (v.price * v.volume) / m.sales : 0 }));
  return { rows, expected, model: m, groups: promotionGroups(state).length };
}
