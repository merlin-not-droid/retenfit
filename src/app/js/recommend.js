// 매장별 추천 엔진 연결 (순수 함수 — test/recommend.test.mjs)
//
// 앱 데이터(손님·방문·시술 메뉴) + 매장 진단(settings.shop) → promo-engine → 이번 달 추천
// 엔진 원본은 별도 프로젝트 promo-engine(TypeScript)이고, js/promo-engine/ 은 거기서 생성한 브라우저용 복사본입니다.
import { campaignResults } from './experiments.js';
import {
  BARRIERS, BARRIER_LABEL, CATALOG_BY_ID, ENGINE_TO_WAXFIT, OBJECTIVES, OBJECTIVE_LABEL, SUCCESS_LABEL,
  contextualPrior, customerCopy, posterior, recommend, responseMultiplier, storeFromWaxfit, waxfitRate, waxfitSuggestions,
} from './promo-engine/index.js';
import { defaultShop } from './state.js';

export { BARRIERS, BARRIER_LABEL, OBJECTIVES, OBJECTIVE_LABEL, SUCCESS_LABEL, defaultShop };

export const TRADE_AREA_LABEL = { residential: '주거지', office: '오피스', university: '대학가', station: '역세권·번화가' };
export const PRICE_POSITION_LABEL = { value: '가성비', mid: '중간', premium: '프리미엄' };
export const COMPETITION_LABEL = ['거의 없음', '조금 있음', '보통', '매우 심함'];
export const EVIDENCE_LABEL = { prior: '사전 가정', similar: '유사 매장 실험', own: '우리 매장 실험' };

export const deviceName = (id) => CATALOG_BY_ID[id]?.name ?? id;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const n = (v, fallback = 0) => (Number.isFinite(Number(v)) ? Number(v) : fallback);

/** 'YYYY-MM' 개업 연월 → 기준일까지 개월 수 (모르면 null) */
export function monthsSince(ym, asOf) {
  const m = /^(\d{4})-(\d{2})/.exec(ym || '');
  if (!m) return null;
  return Math.max(0, (Number(asOf.slice(0, 4)) - Number(m[1])) * 12 + Number(asOf.slice(5, 7)) - Number(m[2]));
}

/** settings.shop → 엔진의 ShopContext */
export function shopContext(settings, asOf) {
  const s = { ...defaultShop(), ...(settings.shop ?? {}) };
  return {
    tradeArea: TRADE_AREA_LABEL[s.tradeArea] ? s.tradeArea : 'residential',
    pricePosition: PRICE_POSITION_LABEL[s.pricePosition] ? s.pricePosition : 'mid',
    competitorDensity: Math.max(0, n(s.competitorDensity)),
    competitorDiscountIntensity: clamp(Math.round(n(s.competitorDiscountIntensity, 1)), 0, 3),
    monthsOpen: monthsSince(s.openedOn, asOf) ?? 12,
    staffCount: Math.max(1, Math.round(n(s.staffCount, 1))),
    capacityPerMonth: Math.max(1, n(s.capacityPerMonth, 150)),
    utilization: clamp(n(s.utilization, 0.6), 0, 1),
    offPeakSlack: clamp(n(s.offPeakSlack, 0.3), 0, 1),
    reviewCount: Math.max(0, n(s.reviewCount)),
    rating: clamp(n(s.rating), 0, 5),
    monthlyPromoBudget: Math.max(0, n(s.monthlyPromoBudget)),
    prepaidOutstanding: Math.max(0, n(s.prepaidOutstanding)),
    hasOnlineBooking: Boolean(s.hasOnlineBooking),
  };
}

/** 손님에게 보낼 안내 문구. 광고성 메시지면 (광고)·발신 매장·수신거부를 붙인다 */
export function promotionMessage(evaluation, settings) {
  const body = customerCopy(evaluation.device, evaluation.recommended.level);
  if (!evaluation.device.requires?.consent) return body;
  const shop = settings.shopName || '[매장 이름]';
  const contact = settings.shopContact || '[매장 연락처]';
  return [`(광고) ${shop}`, body, `예약 문의: ${contact}`, `무료 수신거부: ${contact} 로 '수신거부' 회신`].join('\n');
}

/**
 * 이번 달 추천.
 *  plan        : 엔진 결과(목적 비중·장벽·목적별 후보·실행 플랜)
 *  suggestions : 실행 플랜을 왁스핏 화면 기준으로 바꾼 것
 *  byOption    : 왁스핏 프로모션 id → { evaluation, rate } (그 옵션에 대한 엔진 평가, 화면 배지·추천값에 사용)
 */
export function buildRecommendation(state, asOf) {
  const store = storeFromWaxfit(state, shopContext(state.settings, asOf), asOf, 'waxfit-local');
  // 효과 실험 결과(비교군)를 엔진에 넣어 우리 매장 결과로 효과 추정을 보정
  const results = campaignResults(state, asOf, store);
  const plan = recommend(store, { period: asOf.slice(0, 7), listSize: 50, results, stores: [store] });
  const selected = new Set(plan.selected.map((e) => e.device.id));
  const byOption = new Map();
  for (const o of OBJECTIVES) {
    for (const e of plan.byObjective[o]) {
      const id = ENGINE_TO_WAXFIT[e.device.id];
      if (!id) continue;
      const prev = byOption.get(id);
      if (!prev || e.score > prev.evaluation.score) {
        byOption.set(id, { evaluation: e, rate: waxfitRate(e, e.recommended.level, store), inPlan: selected.has(e.device.id) });
      }
    }
  }
  return {
    store,
    plan,
    results,
    suggestions: waxfitSuggestions(plan, store),
    byOption,
    configured: Boolean(state.settings.shop?.configured),
    dataReady: state.visits.length >= 30 && store.funnel.dataMonths >= 2,
  };
}

/**
 * 실험 결과가 엔진의 효과 추정을 얼마나 바꿨는지(기준 강도 기준).
 * before: 사전 가정만, after: 우리 매장 실험까지 반영, share: 추정치에서 실험 데이터가 차지하는 비중
 */
export function learningFor(recommendation, engineId) {
  const device = CATALOG_BY_ID[engineId];
  if (!device) return null;
  const { store, plan, results } = recommendation;
  const prior = contextualPrior(device, store, plan.diagnosis.barriers).prior;
  const evidence = results
    .filter((r) => r.promotionId === engineId)
    .map((r) => ({ store, result: r, priorUplift: prior * (r.level !== undefined ? responseMultiplier(device.lever, r.level, store) : 1) }));
  const before = posterior(prior, store, []);
  const after = posterior(prior, store, evidence);
  return { before, after, share: after.effectiveN / (1 + after.effectiveN), relative: device.segment === 'prospect' };
}

/** 한 화면(첫 방문 유인·재방문 설계)의 왁스핏 옵션들을 엔진 점수 순으로 */
export function rankOptions(recommendation, options) {
  const scored = options
    .map((p) => ({ id: p.id, info: recommendation.byOption.get(p.id) }))
    .filter((x) => x.info && x.info.evaluation.score > 0)
    .sort((a, b) => b.info.evaluation.score - a.info.evaluation.score);
  return new Map(scored.map((x, i) => [x.id, { rank: i + 1, ...x.info }]));
}
