// 자동 생성 — 직접 고치지 마세요. promo-engine/src/intensity.ts를 고친 뒤 scripts/build-browser.mjs로 다시 만듭니다.
                                                                                                 
import { POLICY } from './config.js';
import { clamp, fmtWon, pct } from './util.js';

// '얼마나 줄 것인가'를 계산하는 혜택 강도 수학. '왜 이 장치인가'(score.ts)와 분리한다.

export function levelsOf(lever       )           {
  const out           = [];
  for (let x = lever.min; x <= lever.max + 1e-9; x += lever.step) out.push(Math.round(x * 1000) / 1000);
  return out.length ? out : [lever.refLevel];
}

export function levelLabel(lever       , level        )         {
  switch (lever.kind) {
    case 'percent': return pct(level);
    case 'amount': return fmtWon(level);
    case 'gift': return `원가 ${fmtWon(level)} 선물`;
    case 'service': return `원가 ${fmtWon(level)} 무료 서비스`;
    case 'bonus': return `${pct(level)} 보너스`;
    case 'stamp': return `${level}회 방문 시 1회 무료`;
    case 'ladder': return `${pct(level)}`;
    case 'none': return '비가격 장치';
  }
}

/** 고객이 체감하는 혜택 크기(정가 대비 비율) */
export function perceivedBenefit(lever       , level        , s              )         {
  const m = lever.perceivedMultiplier ?? 1;
  switch (lever.kind) {
    case 'percent': return level * (lever.base ?? 1);
    case 'ladder': return level;
    case 'amount': return level / s.avgTicket;
    case 'gift': case 'service': return (level * m) / s.avgTicket;
    case 'bonus': return level * 0.6; // 미래에 쓰는 혜택이라 덜 두드러진다
    case 'stamp': return 0.7 / Math.max(1, level - (lever.endowed ?? 0) + 1);
    case 'none': return 0;
  }
}

/** 체감 혜택이 커질수록 효과는 늘지만 증가 폭은 줄어든다(체감효용 체감). 기준 강도 = 1 */
export function responseMultiplier(lever       , level        , s              )         {
  if (lever.kind === 'none') return 1;
  const g = (b        ) => 1 - Math.exp(-8 * b);
  const ref = g(perceivedBenefit(lever, lever.refLevel, s));
  return ref > 0 ? g(perceivedBenefit(lever, level, s)) / ref : 1;
}

export function costBasis(lever       )                                   {
  return lever.costBasis ?? (lever.kind === 'none' ? 'reached' : 'redeemer');
}

/** 비용 1단위(사용자 1명 또는 대상 1명)당 매장이 부담하는 금액 */
export function unitCost(device                 , level        , s              , u               )         {
  const t = s.avgTicket;
  const lever = device.lever;
  switch (lever.kind) {
    case 'percent': return t * level * (lever.base ?? 1) * (device.id === 'session_pack' ? 5 : 1);
    case 'amount': return Math.min(level, t) * (device.channel === 'referral' ? 2 : 1);
    case 'gift': case 'service': case 'none': return level;
    case 'bonus': return t * 5 * level; // 5회분 충전 가정
    case 'ladder': return t * level + s.funnel.regularRate * t * level * 0.5;
    case 'stamp': {
      // 무료 1회의 비용 = 재료·수수료 + 예약이 찬 만큼의 기회비용
      const freeVisit = t * s.variableCostRate + u.marginPerVisit * s.utilization;
      return (3 * freeVisit) / Math.max(1, level - (lever.endowed ?? 0) + 1);
    }
  }
}

/** 혜택이 적용된 방문 1회의 실효 할인율과 추가 비용(목표이익 하한 검사용) */
export function effectiveDiscount(lever       , level        , s              )                                      {
  switch (lever.kind) {
    case 'percent': return { discount: level * (lever.base ?? 1), extra: 0 };
    case 'ladder': return { discount: level, extra: 0 };
    case 'amount': return { discount: Math.min(1, level / s.avgTicket), extra: 0 };
    case 'gift': case 'service': return { discount: 0, extra: level };
    case 'bonus': return { discount: level / (1 + level), extra: 0 };
    case 'stamp': return { discount: 1 / (level + 1), extra: 0 };
    case 'none': return { discount: 0, extra: 0 };
  }
}

/**
 * 정책 한도: 혜택을 준 방문도 목표이익을 남겨야 한다.
 * 1회 잔여이익 = 혜택 후 결제액 × (1 − 변동비율) − 배분 고정비 − 추가 혜택 비용 ≥ 하한 × 정가
 * 첫 방문 유인은 투자로 보고 하한을 손익분기(0)로 둔다. 예약이 찬 매장·깊은 할인 지양 매장은 상한을 더 낮춘다.
 */
export function policyCheck(device                 , level        , s              , objective           )                                {
  const { discount, extra } = effectiveDiscount(device.lever, level, s);
  const floor = objective === 'acquire' ? POLICY.acquisitionMarginFloor : s.targetMarginRate;
  const residual = s.avgTicket * (1 - discount) * (1 - s.variableCostRate) - s.fixedCostPerVisit - extra;
  if (residual < floor * s.avgTicket - 1e-6) return { ok: false, why: `잔여이익 ${fmtWon(residual)} < 하한 ${fmtWon(floor * s.avgTicket)}` };
  // 바쁜 매장에 새 수요를 크게 사 올 이유는 적다 → 신규 유입 가격 혜택만 제한(기존 고객 유지 장치는 제외)
  const priceLever = ['percent', 'amount', 'ladder'].includes(device.lever.kind);
  if (priceLever && device.segment === 'prospect' && !device.requires?.offPeak && s.utilization >= POLICY.busyUtilization && discount > POLICY.busyDiscountCap + 1e-9)
    return { ok: false, why: `예약률 ${pct(s.utilization)} — 할인 상한 ${pct(POLICY.busyDiscountCap)}` };
  if (s.preferences?.avoidDeepDiscount && discount > 0.15 + 1e-9) return { ok: false, why: '사장님 설정: 깊은 할인 지양(15% 상한)' };
  return { ok: true };
}

/** 손님에게 보여 줄 혜택 문구. 원가 같은 매장 내부 숫자는 드러내지 않는다 */
export function customerBenefit(lever       , level        )         {
  switch (lever.kind) {
    case 'percent': case 'ladder': return pct(level);
    case 'amount': return `${Math.round(level).toLocaleString('ko-KR')}원`;
    case 'gift': return '작은 선물';
    case 'service': return '무료 서비스';
    case 'bonus': return `${pct(level)} 추가 적립`;
    case 'stamp': return `${level}회 방문 시 1회 무료`;
    case 'none': return '';
  }
}

export function customerCopy(device                 , level        )         {
  return device.copy.replace('{benefit}', customerBenefit(device.lever, level));
}

/** 깊은 할인일수록 쿠폰 헌터 비중이 커져 추가 고객의 미래 가치가 줄어든다 — Lewis, 2006 */
export function qualityFactor(device                 , level        , s              , dealSeekingBarrier        )         {
  const depth = clamp(perceivedBenefit(device.lever, level, s) / 0.4);
  return 1 - 0.6 * device.risks.dealSeeker * dealSeekingBarrier * depth;
}
