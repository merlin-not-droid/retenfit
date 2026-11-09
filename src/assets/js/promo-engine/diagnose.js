// 자동 생성 — 직접 고치지 마세요. promo-engine/src/diagnose.ts를 고친 뒤 scripts/build-browser.mjs로 다시 만듭니다.
                                                                                                                               
import { OBJECTIVES } from './types.js';
import { BENCHMARK, POLICY, lifecycleWeights } from './config.js';
import { clamp, fmtWon, pct } from './util.js';

// 1단계 진단: (1) 단위 경제성 → (2) 목적별 '새는 이익(value at stake)' → (3) 심리 장벽 강도

export function unitEconomics(s              )                {
  const f = s.funnel;
  const marginPerVisit = s.avgTicket * (1 - s.variableCostRate);
  const residualPerVisit = marginPerVisit - s.fixedCostPerVisit;
  const interval = f.avgIntervalDays || BENCHMARK[s.businessType].avgIntervalDays;
  const visitsPerYear = 365 / interval;
  // 향후 12개월 동안 단골로 남아 있을 평균 비율의 근사
  const retention = clamp(1 - f.overdueShare, 0.4, 0.9);
  const valueRegular = marginPerVisit * visitsPerYear * retention;
  const valueSecond = marginPerVisit + f.regularRate * valueRegular + (1 - f.regularRate) * 0.5 * marginPerVisit;
  const valueFirst = marginPerVisit + f.secondVisitRate * valueSecond;
  // 예약률 70%까지는 여유가 있다고 보고, 그 이상은 추가 방문의 가치를 깎는다(남은 빈자리는 팔기 어려운 시간대가 많음)
  const capacityFactor = clamp((1 - s.utilization) / 0.3, 0.2, 1);
  return { marginPerVisit, residualPerVisit, visitsPerYear, valueRegular, valueSecond, valueFirst, capacityFactor };
}

export function monthlyRevenue(s              )         {
  return s.capacityPerMonth * s.utilization * s.avgTicket;
}

function objectiveDiagnosis(s              , u               , dataConfidence        )                       {
  const f = s.funnel;
  const b = BENCHMARK[s.businessType];
  const prospects = Math.max(f.newPerMonth, POLICY.minProspectBase);
  const cap = u.capacityFactor;

  let acquire = prospects * 0.25 * u.valueFirst * cap;
  if (s.monthsOpen < 6) acquire *= 1.3;
  const convGap = Math.max(0.03, b.secondVisitRate + 0.05 - f.secondVisitRate);
  const convert = f.newPerMonth * convGap * u.valueSecond * Math.sqrt(cap);
  const loyalGap = Math.max(0.03, b.regularRate + 0.05 - f.regularRate);
  const repeaters = f.newPerMonth * f.secondVisitRate;
  const loyalize = (repeaters * loyalGap * u.valueRegular + f.activeRegulars * 0.02 * u.valueRegular * 0.5) * Math.sqrt(cap);
  const atRisk = f.activeRegulars * f.overdueShare;
  const retain = (atRisk * 0.15 + f.lapsedCount * 0.05) * u.valueRegular * 0.6;

  const vas                            = { acquire, convert, loyalize, retain };
  const total = OBJECTIVES.reduce((a, o) => a + vas[o], 0) || 1;
  const life = lifecycleWeights(s.monthsOpen);
  let w                            = { acquire: 0, convert: 0, loyalize: 0, retain: 0 };
  for (const o of OBJECTIVES) w[o] = dataConfidence * (vas[o] / total) + (1 - dataConfidence) * life[o];

  const g = s.preferences?.goalWeights;
  if (g) {
    const gt = OBJECTIVES.reduce((a, o) => a + (g[o] ?? 0), 0);
    if (gt > 0) for (const o of OBJECTIVES) w[o] = 0.7 * w[o] + 0.3 * ((g[o] ?? 0) / gt);
  }
  const wt = OBJECTIVES.reduce((a, o) => a + w[o], 0);
  w = Object.fromEntries(OBJECTIVES.map((o) => [o, w[o] / wt]))                             ;

  const reason                            = {
    acquire: `월 신규 ${Math.round(f.newPerMonth)}명·예약률 ${pct(s.utilization)} → 신규가 25% 늘면 월 약 ${fmtWon(acquire)}의 이익 기회` +
      (cap < 1 ? ' (예약이 차 있어 신규 유입 가치를 낮춰 계산)' : ''),
    convert: `첫 재방문율 ${pct(f.secondVisitRate)} (업종 기준 ${pct(b.secondVisitRate)}) → 월 약 ${fmtWon(convert)}이 새는 중`,
    loyalize: `2회 방문 고객의 단골 전환율 ${pct(f.regularRate)} (기준 ${pct(b.regularRate)}) → 월 약 ${fmtWon(loyalize)}의 기회`,
    retain: `단골 ${f.activeRegulars}명 중 ${pct(f.overdueShare)}가 주기 1.5배 초과, 장기 미방문 ${f.lapsedCount}명 → 월 약 ${fmtWon(retain)} 위험`,
  };
  return OBJECTIVES.map((o) => ({ objective: o, valueAtStake: vas[o], weight: w[o], reason: reason[o] }));
}

                                      

export function barrierScores(s              )                                {
  const f = s.funnel;
  const b = BENCHMARK[s.businessType];
  const wax = s.businessType === 'wax';
  const uni = s.tradeArea === 'university';
  const station = s.tradeArea === 'station';
  const offSeasonWax = wax && (s.month >= 10 || s.month <= 3);
  const gap = f.fullPriceSecondVisitRate !== undefined && f.discountedSecondVisitRate !== undefined
    ? f.fullPriceSecondVisitRate - f.discountedSecondVisitRate : 0;
  const out = {}                                 ;
  const add = (k         , base        , rules        ) => {
    let score = base;
    const evidence           = [];
    for (const [cond, delta, why] of rules) {
      if (!cond || delta === 0) continue;
      score += delta;
      evidence.push(`${delta > 0 ? '+' : ''}${delta.toFixed(2)} ${why}`);
    }
    out[k] = { barrier: k, score: clamp(score), evidence };
  };

  add('perceivedRisk', wax ? 0.5 : 0.4, [
    [s.reviewCount < 30, 0.2, '후기 30개 미만'],
    [s.reviewCount > 300, -0.15, '후기 300개 이상'],
    [s.rating > 0 && s.rating < 4.5, 0.1, '평점 4.5 미만'],
    [s.monthsOpen < 6, 0.1, '개업 6개월 이내'],
    [s.pricePosition === 'premium', 0.1, '고가 포지션(실패 비용이 큼)'],
  ]);
  add('physicalAnxiety', wax ? 0.55 : 0.15, [
    [wax && s.maleShare >= 0.4, 0.1, '남성 비중 높음(첫 왁싱 고객 많음)'],
    [s.reviewCount < 30, 0.05, '통증·위생 후기 부족'],
  ]);
  add('socialAnxiety', wax ? 0.45 : 0.1, [
    [wax && s.maleShare > 0, 0.3 * s.maleShare, `남성 고객 비중 ${pct(s.maleShare)}`],
  ]);
  add('priceSensitivity', 0.4, [
    [uni, 0.25, '대학가 상권'],
    [s.pricePosition === 'value', 0.1, '가성비 포지션'],
    [s.pricePosition === 'premium', -0.15, '고가 포지션 고객층'],
    [s.competitorDiscountIntensity >= 2, 0.08 * s.competitorDiscountIntensity, '주변 할인 경쟁'],
  ]);
  add('switchingCost', wax ? 0.35 : 0.5, [
    [s.tradeArea === 'residential', 0.1, '주거 상권(기존 샵 관계가 강함)'],
    [s.competitorDensity >= 8, 0.1, '경쟁 매장 밀집(이미 다니는 샵이 있음)'],
    [station, -0.1, '유동 인구 상권'],
  ]);
  add('lowAwareness', 0.25, [
    [s.reviewCount < 30, 0.35, '후기 30개 미만'],
    [s.reviewCount >= 30 && s.reviewCount < 100, 0.15, '후기 100개 미만'],
    [s.monthsOpen < 6, 0.2, '개업 6개월 이내'],
    [station, -0.05, '유동 인구 상권'],
  ]);
  add('procrastination', 0.35, [
    [wax, 0.1, '필요 시점을 미루기 쉬운 시술'],
    [offSeasonWax, 0.1, '왁싱 비수기'],
  ]);
  add('forgetting', 0.3, [
    [f.avgIntervalDays > 45, 0.15, '방문 주기가 길어 잊기 쉬움'],
    [f.intervalCv > 0.5, 0.15, '방문 간격이 불규칙'],
    [f.overdueShare > b.overdueShare, 0.15, '주기 초과 고객 비율이 기준보다 높음'],
  ]);
  add('referencePriceShock', 0.15, [
    [f.firstVisitDiscountRate >= 0.3, 0.4, `첫 방문 할인 ${pct(f.firstVisitDiscountRate)}로 깊음`],
    [f.firstVisitDiscountRate >= 0.15 && f.firstVisitDiscountRate < 0.3, 0.2, `첫 방문 할인 ${pct(f.firstVisitDiscountRate)}`],
    [gap >= 0.1, 0.3, `할인 받은 첫 방문 고객의 재방문율이 정가 고객보다 ${pct(gap)} 낮음`],
  ]);
  add('dealSeeking', 0.2, [
    [s.competitorDiscountIntensity > 0, 0.1 * s.competitorDiscountIntensity, '주변 첫 방문 할인 경쟁'],
    [uni, 0.15, '대학가 상권'],
    [f.firstVisitDiscountRate >= 0.3, 0.15, '깊은 첫 할인으로 유입된 고객'],
    [gap >= 0.15, 0.15, '할인 고객만 재방문하지 않음'],
  ]);
  add('weakCommitment', 0.3, [
    [f.regularRate < b.regularRate - 0.05, 0.25, '단골 전환율이 기준보다 낮음'],
    [f.intervalCv > 0.5, 0.15, '방문 간격이 불규칙'],
    [f.secondVisitRate < b.secondVisitRate - 0.1, 0.1, '첫 재방문율이 기준보다 낮음'],
  ]);
  add('varietySeeking', 0.25, [
    [s.competitorDensity >= 8, 0.15, '경쟁 매장 밀집'],
    [uni, 0.15, '대학가 상권'],
    [station, 0.1, '유동 인구 상권'],
    [!wax, 0.05, '트렌드형 시술'],
  ]);
  add('payPain', 0.25, [
    [s.avgTicket >= 80000, 0.2, '객단가 8만원 이상'],
    [s.avgTicket >= 150000, 0.1, '객단가 15만원 이상'],
    [f.avgIntervalDays <= 35, 0.1, '잦은 방문으로 결제가 반복됨'],
  ]);
  add('dissatisfaction', 0.1, [
    [s.rating > 0 && s.rating < 4.5, 0.25, '평점 4.5 미만'],
    [f.overdueShare > b.overdueShare + 0.1, 0.2, '주기 초과 고객이 기준보다 크게 많음'],
    [f.secondVisitRate < b.secondVisitRate - 0.15, 0.15, '첫 재방문율이 기준보다 크게 낮음(시술 품질 점검 필요)'],
  ]);
  return out;
}

export function diagnose(s              )            {
  const unit = unitEconomics(s);
  const dataConfidence = clamp(s.funnel.dataMonths / 6);
  const objectives = objectiveDiagnosis(s, unit, dataConfidence);
  const barriers = barrierScores(s);
  const notes           = [];
  if (dataConfidence < 1) notes.push(`고객 데이터 ${s.funnel.dataMonths}개월 — 목표 비중의 ${pct(1 - dataConfidence)}는 개업 단계 기본값을 사용했어요.`);
  if (s.funnel.firstVisitDiscountRate >= 0.3 && barriers.referencePriceShock.score >= 0.6)
    notes.push(`지금 첫 방문 할인 ${pct(s.funnel.firstVisitDiscountRate)}는 정가 저항을 키워요 — 첫 할인은 낮추고 그 예산을 재방문 설계로 옮기는 것을 권해요.`);
  if (s.utilization >= 0.85) notes.push('예약이 거의 차 있어 신규 유입보다 단골 가치·선결제·한산 시간대 채우기가 효율적이에요.');
  if (s.marketingConsentRate < 0.3) notes.push(`광고 수신동의율 ${pct(s.marketingConsentRate)} — 메시지형 장치는 도달이 작아 현장 장치를 우선하고, 결제 시 동의 받기를 함께 권해요.`);
  if (s.prepaidOutstanding > POLICY.prepaidOutstandingCap * monthlyRevenue(s)) notes.push('미사용 선불 잔액이 월 매출의 50%를 넘어 신규 정액권·회차권 권유를 막았어요.');
  if (unit.residualPerVisit <= 0) notes.push('혜택 전에도 1회 잔여이익이 0 이하예요 — 가격·원가 구조부터 점검이 필요해요.');
  return { unit, objectives, barriers, dataConfidence, notes };
}
