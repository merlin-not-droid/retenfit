// 할인·이익 계산 (화면과 무관한 순수 함수 — test/app-economics.test.mjs)
//
// 용어
//   정가(price)            : 할인 전 시술 가격
//   변동비(variableCost)   : 시술 1회에 드는 재료비 + 인건비(추정)
//   공헌이익(contribution) : 결제액 − 변동비. 임대료 같은 고정비를 갚는 데 쓰이는 돈
//   최소 이익(minContribution) : 1회 시술에서 최소한 남겨야 하는 공헌이익 (매장이 정함)

export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const won = (v) => Math.round(v);

/** 1회 방문의 결제액·공헌이익 */
export function visitEconomics({ price, variableCost, discountRate = 0, discountAmount = 0 }) {
  const discount = clamp(won(price * discountRate + discountAmount), 0, price);
  const paid = price - discount;
  const contribution = paid - variableCost;
  return {
    price,
    discount,
    paid,
    variableCost,
    contribution,
    marginRate: paid > 0 ? contribution / paid : 0,
  };
}

/**
 * 첫 방문 프로모션 평가
 *  - 첫 방문 공헌이익이 최소 이익보다 낮으면 'danger'
 *  - 할인액을 재방문 이익으로 다 메우지 못하면 'caution' (재방문율을 알 때만)
 *  - 그 외 'safe'
 *
 * 회수에 필요한 재방문율 = 첫 방문 할인액 ÷ 재방문 1회 공헌이익
 *   예) 할인 14,000원, 재방문 1회 공헌이익 50,000원 → 28%의 손님이 한 번 더 오면 할인액을 메움
 */
export function evaluateAcquisition({
  price,
  variableCost,
  discountRate = 0,
  discountAmount = 0,
  minContribution = 0,
  revisitRate = null,
  revisitDiscountRate = 0,
}) {
  const first = visitEconomics({ price, variableCost, discountRate, discountAmount });
  const revisit = visitEconomics({ price, variableCost, discountRate: revisitDiscountRate });
  const recoveryRate = first.discount === 0 ? 0 : revisit.contribution > 0 ? first.discount / revisit.contribution : Infinity;
  const expectedPerCustomer = revisitRate === null ? null : won(first.contribution + revisitRate * revisit.contribution);
  const recoveredShare =
    revisitRate === null || first.discount === 0 ? null : clamp((revisitRate * Math.max(revisit.contribution, 0)) / first.discount, 0, 1);
  let zone = 'safe';
  if (first.contribution < minContribution) zone = 'danger';
  else if (revisitRate !== null && revisitRate < recoveryRate) zone = 'caution';
  return { first, revisit, recoveryRate, expectedPerCustomer, recoveredShare, zone };
}

/** 재방문 프로모션 평가: 재방문 1회 공헌이익이 최소 이익보다 낮으면 'danger' */
export function evaluateRetention({ price, variableCost, discountRate = 0, minContribution = 0 }) {
  const visit = visitEconomics({ price, variableCost, discountRate });
  return { visit, zone: visit.contribution < minContribution ? 'danger' : 'safe' };
}

/**
 * 넘지 말아야 할 첫 방문 할인율
 *  byFloor    : 첫 방문 공헌이익 ≥ 최소 이익이 되는 최대 할인율
 *  byRecovery : 할인액 ≤ 재방문율 × 재방문 1회 공헌이익이 되는 최대 할인율 (재방문율을 알 때)
 */
export function discountLimits({ price, variableCost, minContribution = 0, revisitRate = null, revisitDiscountRate = 0 }) {
  if (!(price > 0)) return { byFloor: 0, byRecovery: null, max: 0 };
  const byFloor = clamp((price - variableCost - minContribution) / price, 0, 1);
  const revisitContribution = price * (1 - revisitDiscountRate) - variableCost;
  const byRecovery = revisitRate === null ? null : clamp((revisitRate * Math.max(revisitContribution, 0)) / price, 0, 1);
  return { byFloor, byRecovery, max: byRecovery === null ? byFloor : Math.min(byFloor, byRecovery) };
}

/**
 * 추천 할인율: 프로모션의 일반 추천값을 출발점으로, 매장 숫자로 계산한 한도를 넘지 않게.
 * 한도가 프로모션 최소 범위보다 낮으면 최소값을 주되 limited=true 로 알림.
 */
export function recommendDiscount({ promotion, price, variableCost, minContribution, revisitRate = null, revisitDiscountRate = 0 }) {
  const limits = discountLimits({ price, variableCost, minContribution, revisitRate, revisitDiscountRate });
  const step = 0.01;
  const capped = Math.floor(Math.min(promotion.recommended, limits.max) / step) * step;
  const value = Math.max(promotion.range[0], Number(capped.toFixed(2)));
  return { value, limits, limited: limits.max < promotion.range[0], reducedFrom: capped < promotion.recommended ? promotion.recommended : null };
}

/**
 * 스펙트럼 막대의 색 구간 (0 ~ maxRate)
 * 반환: [{ from, to, zone }] — 할인율 기준
 */
export function spectrumZones({ price, variableCost, minContribution = 0, revisitRate = null, revisitDiscountRate = 0, maxRate = 0.7 }) {
  const { byFloor, byRecovery } = discountLimits({ price, variableCost, minContribution, revisitRate, revisitDiscountRate });
  const zones = [];
  const safeEnd = Math.min(byRecovery ?? byFloor, byFloor, maxRate);
  if (safeEnd > 0) zones.push({ from: 0, to: safeEnd, zone: 'safe' });
  const cautionEnd = Math.min(byFloor, maxRate);
  if (cautionEnd > safeEnd) zones.push({ from: safeEnd, to: cautionEnd, zone: 'caution' });
  if (maxRate > cautionEnd) zones.push({ from: Math.max(cautionEnd, 0), to: maxRate, zone: 'danger' });
  return zones;
}
