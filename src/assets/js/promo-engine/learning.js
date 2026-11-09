// 자동 생성 — 직접 고치지 마세요. promo-engine/src/learning.ts를 고친 뒤 scripts/build-browser.mjs로 다시 만듭니다.
                                                                                   
import { POLICY } from './config.js';
import { clamp, normal } from './util.js';

// 학습 루프: 실험 결과 → 효과 추정 → '비슷한 매장일수록 크게' 반영한 보정계수 → 다음 추천.
// 모델: 매장 s에서 장치 p의 실제 효과 = (맥락 사전값 u0[s,p]) × θ[p]
//   θ는 사전값이 얼마나 맞는지 나타내는 보정계수. 사전분포 N(1, priorCv²)에서 출발해
//   각 실험의 (관측 효과 / 그 매장의 u0)를 유사도 × 정밀도로 가중 평균한다(경험적 베이즈 축소 추정).

                                                                                              

/** 실험 1건의 효과 추정치와 분산. 장치의 효과 단위(신규 증가율 또는 %p)와 같다. */
export function measure(r                )                                                {
  if (r.treated && r.control && r.treatedSuccess !== undefined && r.controlSuccess !== undefined) {
    const pt = (r.treatedSuccess + 0.5) / (r.treated + 1);
    const pc = (r.controlSuccess + 0.5) / (r.control + 1);
    return { estimate: pt - pc, variance: (pt * (1 - pt)) / r.treated + (pc * (1 - pc)) / r.control };
  }
  if (r.weeksOn && r.weeksOff && r.newOn !== undefined && r.newOff !== undefined) {
    const ratio = (r.newOn + 0.5) / r.weeksOn / ((r.newOff + 0.5) / r.weeksOff);
    return { estimate: ratio - 1, variance: ratio ** 2 * (1 / (r.newOn + 0.5) + 1 / (r.newOff + 0.5)) };
  }
  return null;
}

/** 매장 특징 벡터(유사도 계산용) */
export function features(s              )           {
  const pos = { value: 0, mid: 0.5, premium: 1 }[s.pricePosition];
  return [
    s.businessType === 'wax' ? 1.5 : 0,
    s.tradeArea === 'residential' ? 1 : 0,
    s.tradeArea === 'office' ? 1 : 0,
    s.tradeArea === 'university' ? 1 : 0,
    s.tradeArea === 'station' ? 1 : 0,
    pos,
    Math.log(s.avgTicket / 50000),
    s.maleShare,
    s.utilization,
    s.competitorDiscountIntensity / 3,
    Math.min(s.monthsOpen, 36) / 36,
  ];
}

/** 0~1 유사도(가우시안 커널). 같은 매장은 1 */
export function similarity(a              , b              , bandwidth = 1.2)         {
  if (a.id === b.id) return 1;
  const fa = features(a);
  const fb = features(b);
  const d2 = fa.reduce((acc, x, i) => acc + (x - fb[i]) ** 2, 0);
  return Math.exp(-d2 / (2 * bandwidth ** 2));
}

export function posterior(priorUplift        , target              , evidence            )            {
  const priorPrecision = 1 / POLICY.priorCv ** 2;
  let precision = priorPrecision;
  let weighted = priorPrecision * 1;
  let own = 0;
  let other = 0;
  // 우리 매장 실험만 따로 합친 효과(역분산 가중). '효과 확인·효과 약함' 판정에 쓴다
  let ownPrecision = 0;
  let ownWeighted = 0;
  for (const e of evidence) {
    const m = measure(e.result);
    if (!m) continue;
    if (e.store.id === target.id && m.variance > 0) {
      ownPrecision += 1 / m.variance;
      ownWeighted += m.estimate / m.variance;
    }
    if (e.priorUplift <= 0) continue;
    const k = similarity(target, e.store);
    if (k < 0.05) continue;
    const ratio = m.estimate / e.priorUplift;
    const w = k / (m.variance / e.priorUplift ** 2);
    precision += w;
    weighted += w * ratio;
    if (e.store.id === target.id) own += w;
    else other += w;
  }
  const calibration = weighted / precision;
  const dataWeight = (own + other) / priorPrecision;
  // 데이터가 추정치의 20% 미만(사전 대비 0.25배 미만)을 차지하면 아직 '사전 가정'으로 표시
  const evidenceLevel                        = dataWeight < 0.25 ? 'prior' : own >= other ? 'own' : 'similar';
  return {
    mean: priorUplift * Math.max(0, calibration),
    sd: priorUplift * Math.sqrt(1 / precision),
    evidence: evidenceLevel,
    effectiveN: dataWeight,
    calibration,
    prior: priorUplift,
    ownEffect: ownPrecision > 0 ? { estimate: ownWeighted / ownPrecision, se: Math.sqrt(1 / ownPrecision) } : null,
  };
}

/** 톰슨 샘플링: 불확실한 장치도 가끔 시험하게 해 매장별 학습이 일어나게 한다 */
export function thompson(p           , r              )         {
  return Math.max(0, p.mean + POLICY.explorationScale * p.sd * normal(r));
}

/** 비교군 실험으로 효과를 판정하는 데 필요한 개월 수(단측 5%, 검정력 80%) */
export function monthsToDecide(segment         , base        , uplift        , reachPerMonth        , controlShare        )         {
  if (uplift <= 0 || reachPerMonth <= 0) return Infinity;
  if (segment === 'prospect') {
    // 시행 주/미시행 주를 번갈아 비교(포아송 근사): 필요 개월 ≈ z² × 4 / (월 신규 × 상대효과²)
    return (POLICY.powerZ2 * 4) / (reachPerMonth * uplift ** 2);
  }
  const p1 = clamp(base + uplift, 0.001, 0.999);
  const p0 = clamp(base, 0.001, 0.999);
  const n = (POLICY.powerZ2 * ((p1 * (1 - p1)) / (1 - controlShare) + (p0 * (1 - p0)) / controlShare)) / uplift ** 2;
  return n / reachPerMonth;
}
