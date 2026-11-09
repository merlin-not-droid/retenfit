// 자동 생성 — 직접 고치지 마세요. promo-engine/src/adapters/wax.ts를 고친 뒤 scripts/build-browser.mjs로 다시 만듭니다.
                                                                                                                        
import { BENCHMARK } from '../config.js';
import { effectiveDiscount } from '../intensity.js';
import { clamp } from '../util.js';

// 왁싱샵 대시보드 데이터 → 엔진 입력, 엔진 출력 → 왁싱샵 앱 프로모션 선택지.
// 왁싱샵 앱의 localStorage 상태(state.js의 defaultState 구조)를 그대로 받는다. 손님 개인정보는 집계에만 쓰고 밖으로 내보내지 않는다.

                                                                                                                                           
                                                                                                                                                  
                                                                                                                                                                          
                                                                                                                           
                           
                                                                                                                                
                           
                     
                    
 

/** 왁싱샵 앱에 아직 없는 매장 정보 — 매장 설정 화면에 '매장 진단' 항목으로 받는다 */
                              
                       
                               
                            
                                             
                     
                     
                           
                      
                       
                      
                 
                             
                             
                              
                             
 

/** 왁싱샵 앱 catalog.js의 프로모션 id ↔ 엔진 장치 id */
export const WAX_TO_ENGINE                         = {
  'first-rate': 'first_percent',
  'first-booking': 'first_booking_discount',
  'first-friend': 'bring_friend',
  'first-addon': 'first_addon',
  'cycle-remind': 'cycle_reminder',
  'second-visit': 'next_visit_coupon',
  package: 'session_pack',
  stamp: 'stamp_endowed',
  winback: 'winback_offer',
  review: 'review_reward',
};
export const ENGINE_TO_WAX                         = Object.fromEntries(Object.entries(WAX_TO_ENGINE).map(([k, v]) => [v, k]));

const dayNum = (s        ) => Math.floor(Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)) / 86400000);
const mean = (xs          ) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);

function menuItem(menu               , name                    , gender                       ) {
  const same = menu.filter((m) => m.name === name);
  return same.find((m) => m.gender === gender) ?? same.find((m) => m.gender === 'A') ?? same[0] ?? null;
}

/** 왁싱샵 앱 상태 + 매장 진단 정보 → 엔진의 StoreProfile (asOf: 'YYYY-MM-DD') */
export function storeFromWax(state          , ctx             , asOf        , id = 'wax-local')               {
  const { settings } = state;
  const t = dayNum(asOf);
  const W = settings.windowDays || 60;
  const customers = new Map(state.customers.map((c) => [c.id, c]));
  const timelines = new Map                    ();
  for (const v of state.visits) {
    if (v.date > asOf) continue;
    if (!timelines.has(v.customerId)) timelines.set(v.customerId, []);
    timelines.get(v.customerId) .push(v);
  }
  for (const list of timelines.values()) list.sort((a, b) => a.date.localeCompare(b.date));

  let newRecent = 0, completed = 0, revisited = 0, completed2 = 0, third = 0;
  let activeRegulars = 0, overdue = 0, lapsed = 0, male = 0, consent = 0, earliest = t;
  const gaps           = [];
  const firstDiscounts           = [];
  const disc = { n: 0, r: 0 };
  const full = { n: 0, r: 0 };
  for (const [cid, list] of timelines) {
    const c = customers.get(cid);
    if (c?.gender === 'M') male += 1;
    if (c?.consent?.marketing) consent += 1;
    const d0 = dayNum(list[0].date);
    earliest = Math.min(earliest, d0);
    if (t - d0 < 90) newRecent += 1;
    for (let i = 1; i < list.length; i++) gaps.push(dayNum(list[i].date) - dayNum(list[i - 1].date));
    const lp = list[0].listPrice ?? menuItem(settings.menu, list[0].service, c?.gender)?.price ?? 0;
    const fd = lp > 0 ? clamp((lp - list[0].paid) / lp) : 0;
    if (lp > 0) firstDiscounts.push(fd);
    if (t - d0 >= W) {
      completed += 1;
      const rev = list.length > 1 && dayNum(list[1].date) - d0 <= W;
      if (rev) revisited += 1;
      const g = fd >= 0.1 ? disc : fd <= 0.02 ? full : null;
      if (g) { g.n += 1; if (rev) g.r += 1; }
    }
    if (list.length >= 2) {
      const d1 = dayNum(list[1].date);
      if (t - d1 >= W) {
        completed2 += 1;
        if (list.length >= 3 && dayNum(list[2].date) - d1 <= W) third += 1;
      }
    }
    const last = list[list.length - 1];
    const cycle = Number(c?.cycleDays) || menuItem(settings.menu, c?.mainService || last.service, c?.gender)?.cycleDays || 35;
    const since = t - dayNum(last.date);
    if (list.length >= 3 && since <= 2 * cycle) {
      activeRegulars += 1;
      if (since > 1.5 * cycle) overdue += 1;
    }
    if (list.length >= 2 && since > 2 * cycle) lapsed += 1;
  }

  const recent = state.visits.filter((v) => v.date <= asOf && t - dayNum(v.date) <= 180);
  const priceOf = (v          ) => v.listPrice ?? menuItem(settings.menu, v.service, customers.get(v.customerId)?.gender)?.price ?? v.paid;
  const costOf = (v          ) => v.variableCost ?? menuItem(settings.menu, v.service, customers.get(v.customerId)?.gender)?.variableCost ?? NaN;
  const menuPrice = mean(settings.menu.map((m) => m.price));
  const avgTicket = mean(recent.map(priceOf)) || menuPrice || 60000;
  const costRates = recent.map((v) => costOf(v) / priceOf(v)).filter((x) => Number.isFinite(x));
  const variableCostRate = mean(costRates) || mean(settings.menu.map((m) => m.variableCost / m.price)) || 0.3;
  const interval = mean(gaps) || mean(settings.menu.map((m) => m.cycleDays)) || BENCHMARK.wax.avgIntervalDays;
  const sd = gaps.length > 1 ? Math.sqrt(mean(gaps.map((g) => (g - interval) ** 2))) : interval * 0.35;
  const n = Math.max(timelines.size, 1);

  return {
    id,
    name: settings.shopName || '내 매장',
    businessType: 'wax',
    tradeArea: ctx.tradeArea,
    pricePosition: ctx.pricePosition,
    competitorDensity: ctx.competitorDensity,
    competitorDiscountIntensity: ctx.competitorDiscountIntensity,
    monthsOpen: ctx.monthsOpen,
    staffCount: ctx.staffCount,
    capacityPerMonth: ctx.capacityPerMonth,
    utilization: ctx.utilization,
    offPeakSlack: ctx.offPeakSlack,
    reviewCount: ctx.reviewCount,
    rating: ctx.rating,
    maleShare: male / n,
    avgTicket,
    variableCostRate,
    fixedCostPerVisit: ctx.fixedCostPerVisit ?? 0,
    // 왁싱샵 앱의 '최소 이익'(1회 공헌이익 하한, 원)을 정가 대비 비율로 바꾼다
    targetMarginRate: settings.minContribution / avgTicket,
    monthlyPromoBudget: ctx.monthlyPromoBudget,
    marketingConsentRate: consent / n,
    hasOnlineBooking: ctx.hasOnlineBooking ?? false,
    prepaidOutstanding: ctx.prepaidOutstanding ?? 0,
    month: +asOf.slice(5, 7),
    funnel: {
      newPerMonth: newRecent / 3,
      // 왁싱샵 앱 규칙과 같게: 관찰 완료 20명 이상이면 실제 값, 아니면 설정의 가정값
      secondVisitRate: completed >= 20 ? revisited / completed : settings.assumedRevisitRate,
      regularRate: completed2 >= 10 ? third / completed2 : BENCHMARK.wax.regularRate,
      activeRegulars,
      overdueShare: activeRegulars ? overdue / activeRegulars : 0,
      lapsedCount: lapsed,
      avgIntervalDays: interval,
      intervalCv: interval ? sd / interval : 0.35,
      firstVisitDiscountRate: mean(firstDiscounts) || 0,
      discountedSecondVisitRate: disc.n >= 10 && full.n >= 10 ? disc.r / disc.n : undefined,
      fullPriceSecondVisitRate: disc.n >= 10 && full.n >= 10 ? full.r / full.n : undefined,
      dataMonths: Math.max(0, (t - earliest) / 30),
    },
  };
}

                                
                   
               
                       
                    
                                    
                                                  
                       
                                               
                      
                         
                
                    
                     
 

/**
 * 엔진 강도 → 왁싱샵 앱 할인 스펙트럼의 할인율(1회 실효 할인).
 * 선물·서비스·비가격 장치는 null. 금액 장치는 왁싱샵 앱에 같은 옵션이 있을 때만 객단가 대비 비율로 바꾼다.
 */
export function waxRate(e            , level                    , store              )                {
  if (level === undefined) return null;
  const k = e.device.lever.kind;
  if (k === 'none' || k === 'gift' || k === 'service') return null;
  if (k === 'amount' && !ENGINE_TO_WAX[e.device.id]) return null;
  return Math.round(effectiveDiscount(e.device.lever, level, store).discount * 100) / 100;
}

/** 왁싱샵 앱 할인율(1회 실효 할인) → 엔진 강도. waxRate의 역변환이며 실험 결과를 학습에 넣을 때 쓴다 */
export function levelFromWaxRate(device                 , rate                           , store              )         {
  const l = device.lever;
  const fit = (x        ) => Math.min(l.max, Math.max(l.min, x));
  if (typeof rate !== 'number' || !Number.isFinite(rate)) return l.refLevel;
  switch (l.kind) {
    case 'percent': return fit(rate / (l.base ?? 1));
    case 'ladder': return fit(rate);
    case 'amount': return fit(Math.round((rate * store.avgTicket) / l.step) * l.step);
    case 'bonus': return fit(rate / Math.max(1e-6, 1 - rate));
    case 'stamp': return fit(Math.round(1 / Math.max(rate, 1e-6) - 1));
    default: return l.refLevel;
  }
}

/** 엔진 플랜 → 왁싱샵 앱 첫 방문 유인·재방문 설계 화면에서 바로 고를 수 있는 형태 */
export function waxSuggestions(plan      , store              )                  {
  return plan.selected.map((e) => ({
    engineId: e.device.id,
    name: e.device.name,
    objective: e.objective,
    kind: e.objective === 'acquire' ? 'acquisition' : 'retention',
    waxId: ENGINE_TO_WAX[e.device.id] ?? null,
    rate: waxRate(e, e.recommended.level, store),
    maxRate: waxRate(e, e.maxAllowed?.level, store),
    label: e.recommended.label,
    reasons: e.reasons,
    warnings: e.warnings,
  }));
}
