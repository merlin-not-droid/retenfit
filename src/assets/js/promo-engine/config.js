// 자동 생성 — 직접 고치지 마세요. promo-engine/src/config.ts를 고친 뒤 scripts/build-browser.mjs로 다시 만듭니다.
                                                          

// ⚠ 아래 수치는 '초기 가정값'이다. 업계 통계로 검증된 값이 아니며,
// 플랫폼에 매장 데이터가 쌓이면 업종·상권별 분포로 교체한다(설계 문서 7장).

                            
                          
                      
                       
                          
 

export const BENCHMARK                                  = {
  hair: { secondVisitRate: 0.45, regularRate: 0.55, overdueShare: 0.2, avgIntervalDays: 45 },
  wax: { secondVisitRate: 0.4, regularRate: 0.5, overdueShare: 0.2, avgIntervalDays: 32 },
};

/** 데이터가 부족한 매장은 개업 단계별 기본 목표 비중에서 출발한다. */
export function lifecycleWeights(monthsOpen        )                            {
  if (monthsOpen < 6) return { acquire: 0.45, convert: 0.35, loyalize: 0.15, retain: 0.05 };
  if (monthsOpen < 24) return { acquire: 0.25, convert: 0.35, loyalize: 0.25, retain: 0.15 };
  return { acquire: 0.15, convert: 0.25, loyalize: 0.3, retain: 0.3 };
}

export const POLICY = {
  /** 첫 방문 유인은 투자로 보고 배분 고정비까지의 손익분기(0)를 하한으로 둔다. */
  acquisitionMarginFloor: 0,
  /** 예약률이 이 값 이상이면 한산 시간대 장치를 제외한 할인 강도를 busyDiscountCap 이하로 제한(미용실 서비스 규칙 계승) */
  busyUtilization: 0.8,
  busyDiscountCap: 0.05,
  /** 매장 미사용 선불 잔액이 월 예상 매출의 이 비율을 넘으면 신규 선불 권유 차단(미용실 서비스 규칙 계승) */
  prepaidOutstandingCap: 0.5,
  /** 이익 차이가 이 비율 이내면 더 낮은 혜택으로 먼저 시험 */
  flatOptimumTolerance: 0.1,
  /** 광고성 메시지 1건 비용(알림톡·문자 평균 가정) */
  messageCost: 30,
  /** 사전 효과의 불확실성(변동계수) */
  priorCv: 0.6,
  /** 톰슨 샘플링 탐색 폭(1 = 표준, 작을수록 보수적). 작은 매장의 손실을 줄이려 절반으로 둔다 */
  explorationScale: 0.5,
  /** 신규 고객 수가 매우 적은 매장도 최소 이 정도 잠재 유입은 있다고 본다 */
  minProspectBase: 8,
  /** 효과 판정: 단측 유의수준 5%·검정력 80% → (1.645 + 0.842)^2 */
  powerZ2: 6.19,
  // 월간 학습 고리(monthly.ts). 아래 계수도 초기 가정값이다.
  /** 효과 확인·효과 약함 판정의 신뢰 수준(단측 90%) */
  decisionZ: 1.28,
  provenFactor: 1.1,
  /** 실제 효과가 기대의 이 비율에도 못 미치면 '효과 약함' */
  weakShare: 0.5,
  weakFactor: 0.4,
  /** 지난달 추천했지만 실행하지 않은 장치의 순위 계수(2달 연속이면 더 낮춤) */
  skippedFactor: 0.7,
  skippedTwiceFactor: 0.4,
  /** 실행 중인 장치를 결과 확인 때문에 연속으로 유지하는 최대 개월 수 */
  maxMeasureMonths: 3,
  fatigueFactor: 0.6,
  /** 이 기간 안에 추천한 적이 없으면 새로운 시도로 가산 */
  noveltyMonths: 6,
  noveltyFactor: 1.2,
};

export function defaultMaxConcurrent(staffCount        )         {
  if (staffCount <= 1) return 2;
  if (staffCount <= 4) return 3;
  return 4;
}
