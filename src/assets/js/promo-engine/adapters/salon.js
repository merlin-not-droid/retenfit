// 자동 생성 — 직접 고치지 마세요. promo-engine/src/adapters/salon.ts를 고친 뒤 scripts/build-browser.mjs로 다시 만듭니다.
                                                                          
import { BENCHMARK } from '../config.js';
import { clamp } from '../util.js';

// 미용실 앱 데이터 → 엔진 입력. 미용실 앱은 시술별 가격·재료비·시간·고정비를 받고, 손님은 ID별 집계 기록으로 다룬다.
// 손님 개인정보는 집계에만 쓰고 밖으로 내보내지 않는다.

                                                                                                                                                                
                                
                                              
                                                                                       
                                                                
                                                                        
                                                 
                           
 
                                                                                                                                                                   
                                                                                   

/** 미용실 설정에 없는 매장 정보 — 매장 설정의 '매장 진단' 항목으로 받는다 */
                               
                       
                                
                            
                                             
                     
                       
                      
                 
                             
                                           
                              
                     
                                  
                      
 

const dayNum = (s        ) => Math.floor(Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)) / 86400000);
const mean = (xs          ) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);

function pricePositionOf(services                )                {
  const ratios = services.filter((v) => v.competitor && v.competitor > 0).map((v) => v.price / v.competitor );
  if (!ratios.length) return 'mid';
  const r = mean(ratios);
  return r < 0.85 ? 'value' : r > 1.15 ? 'premium' : 'mid';
}

/** 미용실 앱 상태 + 매장 진단 → 엔진의 StoreProfile */
export function storeFromSalon(state            , ctx              , id = 'salon-local')               {
  const s = state.settings;
  const t = dayNum(s.asOf);
  const serviceOf = (c               ) => s.services.find((v) => v.id === c.service) ?? s.services[0];
  const cycleOf = (c               ) => (c.cycle && c.cycle > 0 ? c.cycle : serviceOf(c).cycle);
  const since = (c               ) => (c.last ? t - dayNum(c.last) : Infinity);

  const visits = s.services.reduce((a, v) => a + v.volume, 0);
  const minutes = s.services.reduce((a, v) => a + v.minutes * v.volume, 0);
  const capacityMinutes = s.stylists * s.days * s.hours * 60;
  const sales = s.services.reduce((a, v) => a + v.price * v.volume, 0);
  const material = s.services.reduce((a, v) => a + v.material * v.volume, 0);
  const fixed = s.stylists * s.stylistSalary + s.assistants * s.assistantSalary + s.rent + s.otherFixed;
  const rate = (s.fee + s.commission) / 100;
  const avgMinutes = visits ? minutes / visits : 60;

  const seen = state.customers.filter((c) => c.visits > 0 && c.last);
  const n = Math.max(state.customers.length, 1);
  const newRecent = seen.filter((c) => c.visits === 1 && since(c) < 90).length;
  // 첫 재방문율: 평소 주기의 1.5배가 지난 첫 방문 손님만 분모에 넣는다(막 다녀간 손님 때문에 낮아 보이지 않게)
  const stillOneTime = seen.filter((c) => c.visits === 1 && since(c) >= 1.5 * cycleOf(c)).length;
  const returned = seen.filter((c) => c.visits >= 2).length;
  const thirdPlus = seen.filter((c) => c.visits >= 3).length;
  const twoDone = seen.filter((c) => c.visits === 2 && since(c) >= 1.5 * cycleOf(c)).length;
  const regulars = seen.filter((c) => c.visits >= s.loyaltyVisits && since(c) <= 2 * cycleOf(c));
  const overdue = regulars.filter((c) => since(c) > 1.5 * cycleOf(c)).length;
  const lapsed = seen.filter((c) => c.visits >= 2 && since(c) > 2 * cycleOf(c)).length;
  const cycles = seen.filter((c) => c.visits >= 2 && c.cycle && c.cycle > 0).map((c) => c.cycle );
  const interval = mean(cycles) || mean(s.services.map((v) => v.cycle)) || BENCHMARK.hair.avgIntervalDays;
  const sd = cycles.length > 1 ? Math.sqrt(mean(cycles.map((g) => (g - interval) ** 2))) : interval * 0.35;
  const completedFirst = returned + stillOneTime;
  const completedSecond = thirdPlus + twoDone;

  return {
    id,
    name: s.salon || '내 매장',
    businessType: 'hair',
    tradeArea: ctx.tradeArea,
    pricePosition: ctx.pricePosition ?? pricePositionOf(s.services),
    competitorDensity: ctx.competitorDensity,
    competitorDiscountIntensity: ctx.competitorDiscountIntensity,
    monthsOpen: ctx.monthsOpen,
    staffCount: Math.max(1, s.stylists + s.assistants),
    capacityPerMonth: Math.max(1, capacityMinutes / avgMinutes),
    utilization: clamp(ctx.utilization ?? (capacityMinutes ? minutes / capacityMinutes : 0.6), 0, 1),
    offPeakSlack: ctx.offPeakSlack,
    reviewCount: ctx.reviewCount,
    rating: ctx.rating,
    maleShare: ctx.maleShare ?? 0.2,
    avgTicket: visits ? sales / visits : 60000,
    variableCostRate: clamp((sales ? material / sales : 0.15) + rate, 0, 0.95),
    fixedCostPerVisit: visits ? fixed / visits : 0,
    targetMarginRate: sales ? s.targetProfit / sales : 0,
    monthlyPromoBudget: s.budget,
    marketingConsentRate: state.customers.filter((c) => c.consent).length / n,
    hasOnlineBooking: ctx.hasOnlineBooking ?? false,
    prepaidOutstanding: state.customers.reduce((a, c) => a + (c.walletBalance ?? 0), 0),
    month: +s.month.slice(5, 7),
    funnel: {
      newPerMonth: newRecent / 3,
      secondVisitRate: completedFirst >= 20 ? returned / completedFirst : BENCHMARK.hair.secondVisitRate,
      regularRate: completedSecond >= 10 ? thirdPlus / completedSecond : BENCHMARK.hair.regularRate,
      activeRegulars: regulars.length,
      overdueShare: regulars.length ? overdue / regulars.length : 0,
      lapsedCount: lapsed,
      avgIntervalDays: interval,
      intervalCv: interval ? sd / interval : 0.35,
      firstVisitDiscountRate: ctx.firstVisitDiscountRate ?? 0,
      dataMonths: ctx.dataMonths ?? (seen.length ? 6 : 0),
    },
  };
}
