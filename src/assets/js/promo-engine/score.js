// 자동 생성 — 직접 고치지 마세요. promo-engine/src/score.ts를 고친 뒤 scripts/build-browser.mjs로 다시 만듭니다.
                                                                                                                                  
import { BARRIER_LABEL, OBJECTIVE_LABEL, SUCCESS_LABEL } from './types.js';
import { POLICY } from './config.js';
import { clamp, fmtWon, pct } from './util.js';
import { costBasis, levelLabel, levelsOf, perceivedBenefit, policyCheck, qualityFactor, responseMultiplier, unitCost } from './intensity.js';
                                              
import { monthsToDecide, posterior, thompson } from './learning.js';
import { monthlyRevenue } from './diagnose.js';

// 2단계 평가: 매장 s에서 장치 p가 목적 o에 대해 얼마나 좋은가.
// 사전 효과 u0 = baseUplift × (0.4 + 1.2 × 장벽매칭) × 맥락적합 × 차별성
// → 실험 데이터로 사후분포 → 강도별 기대 순이익 → 위험 보정 → 점수

const TA_LABEL                            = { residential: '주거', office: '오피스', university: '대학가', station: '역세권·번화가' };

                                                                                                                  

export function contextualPrior(d                 , s              , barriers                       )               {
  const notes           = [];
  let num = 0;
  let den = 0;
  for (const [b, mech] of Object.entries(d.barriers)                       ) {
    num += mech * barriers[b].score;
    den += mech;
  }
  const match = den ? num / den : 0;

  const a = d.affinity ?? {};
  let context = 1;
  const ta = a.tradeArea?.[s.tradeArea];
  if (ta) {
    context *= ta;
    notes.push(`${TA_LABEL[s.tradeArea]} 상권 ${ta > 1 ? '가산' : '감산'}(×${ta})`);
  }
  const pp = a.pricePosition?.[s.pricePosition];
  if (pp) {
    context *= pp;
    notes.push(`가격 포지션 ${pp > 1 ? '가산' : '감산'}(×${pp})`);
  }
  const months = a.months?.[s.businessType];
  if (months) {
    if (months.includes(s.month)) {
      context *= a.monthBoost ?? 1.3;
      notes.push(`지금(${s.month}월)이 새 출발 시점`);
    } else context *= 0.75;
  }
  if (a.maleBoost) context *= 1 + (a.maleBoost - 1) * s.maleShare;
  if (a.newStoreBoost && s.monthsOpen < 6) {
    context *= a.newStoreBoost;
    notes.push('개업 초기 매장 가산');
  }
  context = clamp(context, 0.3, 1.8);

  const n = s.nearbyActive?.[d.id] ?? 0;
  let crowding = 1 / (1 + 0.25 * n);
  if (n > 0) notes.push(`같은 상권 구독 매장 ${n}곳이 이미 운영 중 → 차별성 감소 반영`);
  if (d.segment === 'prospect' && ['percent', 'amount'].includes(d.lever.kind) && s.competitorDiscountIntensity > 0) {
    crowding *= 1 - 0.1 * s.competitorDiscountIntensity;
    notes.push('주변 매장도 할인 중이라 가격 혜택이 덜 눈에 띔');
  }
  const prior = d.baseUplift * (0.4 + 1.2 * match) * context * crowding;
  return { match, context, crowding, prior, notes };
}

                                                                                    

function segmentModel(d                 , s              , diag           )               {
  const f = s.funnel;
  const u = diag.unit;
  const cap = u.capacityFactor;
  switch (d.segment) {
    case 'prospect':
      if (d.channel === 'referral')
        return { size: f.activeRegulars, base: 0, value: u.valueFirst * 1.15 * cap, metric: '추천 코드로 들어온 신규 고객 수' };
      return { size: Math.max(f.newPerMonth, POLICY.minProspectBase), base: 0, value: u.valueFirst * cap, metric: '주간 신규 고객 수(시행 주 vs 미시행 주 교차 비교)' };
    case 'firstTimer':
      return { size: f.newPerMonth, base: f.secondVisitRate, value: u.valueSecond * Math.sqrt(cap), metric: '첫 방문 후 평소 주기 1.5배 안의 재방문율' };
    case 'repeat':
      return { size: f.newPerMonth * f.secondVisitRate, base: f.regularRate, value: u.valueRegular * 0.6 * Math.sqrt(cap), metric: '3회차 방문 전환율' };
    case 'regular': {
      // 단골 장치의 효과 단위는 '월 이탈 확률 감소(%p)'. 주기 1.5배 초과 비율을 약 4개월 누적 이탈로 본다.
      const monthlyChurn = clamp(f.overdueShare / 4, 0.02, 0.15);
      return { size: f.activeRegulars, base: 1 - monthlyChurn, value: u.valueRegular * 0.7, metric: '월 단골 이탈률(비교군 대비)' };
    }
    case 'atRisk':
      // 매달 새로 주기를 넘기는 고객(재고의 절반 정도)에게 연락한다고 본다
      return { size: f.activeRegulars * f.overdueShare * 0.5, base: 0.35, value: u.valueRegular * 0.6, metric: '연락 후 30일 내 방문율' };
    case 'lapsed':
      return { size: f.lapsedCount * 0.5, base: 0.08, value: u.valueRegular * 0.4, metric: '연락 후 30일 내 방문율' };
  }
}

/** 실행 전 차단 조건. 통과하면 null */
export function gate(d                 , s              )                {
  const req = d.requires ?? {};
  if (s.preferences?.excluded?.includes(d.id)) return '사장님 제외 설정';
  if (req.consent && s.marketingConsentRate < 0.1) return '광고 수신동의 고객이 거의 없음';
  if (req.prepaid && s.preferences?.noPrepaid) return '사장님 설정: 선불 상품 미운영';
  if (req.prepaid && s.prepaidOutstanding > POLICY.prepaidOutstandingCap * monthlyRevenue(s)) return '미사용 선불 잔액이 월 매출의 50% 초과';
  if (req.balance && s.prepaidOutstanding <= 0) return '소멸을 알릴 고객 보유 잔액이 없음';
  if (req.offPeak && s.offPeakSlack < 0.15) return '한산 시간대 빈자리가 거의 없음';
  if (req.minRegulars && s.funnel.activeRegulars < req.minRegulars) return `추천을 부탁할 단골이 ${req.minRegulars}명 미만`;
  if (req.booking && !s.hasOnlineBooking) return '온라인 예약 미사용';
  return null;
}

function warningsFor(d                 )           {
  const w           = [];
  if (d.requires?.consent) w.push('광고성 메시지: 수신동의 고객에게만, (광고) 표기·수신거부 방법 안내, 21시~08시 전송은 별도 동의 필요');
  if (d.requires?.prepaid) w.push('선불·회차권: 유효기간·중도 해지 환불 기준을 약관과 결제 화면에 명시하고 미사용 잔액을 관리');
  if (['trust_content', 'referral_two_sided', 'review_reward'].includes(d.id)) w.push('후기·추천에 대가를 줬다면 경제적 이해관계를 함께 표시');
  if (d.id === 'offpeak_first') w.push('한정 수량·선착순은 실제 운영 수량과 같아야 함(허위 희소성 금지)');
  if (d.lever.kind === 'percent' && d.segment === 'prospect') w.push('할인 전 가격은 실제로 받던 정상가여야 함');
  if (d.id === 'winback_offer') w.push('같은 고객에게 반복 제공하지 않기(할인을 기다리는 습관 방지)');
  if (d.id === 'course_program') w.push('효과를 의학적으로 단정하는 표현 금지(예: 영구 제모·모량 감소 보장)');
  return w;
}

                              
                  
                       
                     
                  
 

export function evaluate(d                 , objective           , s              , ctx             )                                    {
  const blocked = gate(d, s);
  if (blocked) return { excluded: blocked };
  const { diag } = ctx;
  const fit = d.objectives[objective] ?? 0;
  const cp = contextualPrior(d, s, diag.barriers);
  const post = posterior(cp.prior, s, ctx.evidence);
  const sampledUplift = ctx.stable ? post.mean : thompson(post, ctx.rand);
  const seg = segmentModel(d, s, diag);
  const contactable = d.channel === 'message' ? (d.requires?.consent ? s.marketingConsentRate : 0.9) : 1;
  const reach = seg.size * (d.lever.reachShare ?? 1) * contactable;
  const dealB = diag.barriers.dealSeeking.score;

  const point = (level        , upliftBase        )             => {
    const r = responseMultiplier(d.lever, level, s);
    const uplift = upliftBase * r;
    const extra = reach * uplift;
    const q = d.segment === 'prospect' ? qualityFactor(d, level, s, dealB) : 1;
    const basis = costBasis(d.lever);
    let units        ;
    if (basis === 'reached') units = reach;
    else if (basis === 'buyer') units = reach * Math.min(1, (d.lever.uptake ?? 0.1) * r);
    else if (d.channel === 'referral') units = extra;
    else if (d.segment === 'prospect') units = (reach + extra) * 0.7;
    else units = (reach * seg.base + extra) * 0.85;
    const cost = units * unitCost(d, level, s, diag.unit);
    return {
      level, label: levelLabel(d.lever, level), uplift, extraSuccesses: extra, costPerMonth: cost,
      eip: extra * seg.value * q - cost, marginOk: policyCheck(d, level, s, objective).ok,
    };
  };

  const benefit = (p            ) => perceivedBenefit(d.lever, p.level, s);
  const levels = levelsOf(d.lever).map((l) => point(l, post.mean)).sort((a, b) => benefit(a) - benefit(b) || a.level - b.level);
  const allowed = levels.filter((p) => p.marginOk);
  if (!allowed.length) return { excluded: `최소 강도도 정책 한도 초과 — ${policyCheck(d, levels[0].level, s, objective).why}` };
  const best = allowed.reduce((a, b) => (b.eip > a.eip ? b : a));
  const recommended = best.eip > 0 ? allowed.find((p) => p.eip >= best.eip * (1 - POLICY.flatOptimumTolerance))  : allowed[0];
  const maxAllowed = allowed[allowed.length - 1];

  const depth = clamp(benefit(recommended) / 0.3);
  const premium = s.pricePosition === 'premium' ? 1 : s.pricePosition === 'mid' ? 0.5 : 0.2;
  const riskFactor = clamp(1 - (
    0.25 * d.risks.refPrice * depth * (0.5 + diag.barriers.referencePriceShock.score) +
    0.25 * d.risks.brand * depth * premium +
    0.2 * d.risks.liability +
    0.15 * d.risks.dealSeeker * dealB), 0.4, 1);
  const sampledEip = point(recommended.level, sampledUplift).eip;
  const score = Math.max(0, sampledEip) * riskFactor * fit;

  const top = (Object.entries(d.barriers)                       )
    .map(([b, mech]) => ({ b, v: mech * diag.barriers[b].score }))
    .sort((x, y) => y.v - x.v).slice(0, 2);
  const evidenceText = { prior: '사전 가정값', similar: '유사 매장 실험으로 보정', own: '우리 매장 실험으로 보정' }[post.evidence];
  const reasons = [
    `목적: ${OBJECTIVE_LABEL[objective]} (적합도 ${fit})`,
    `공략 장벽: ${top.map((t) => `${BARRIER_LABEL[t.b]} ${diag.barriers[t.b].score.toFixed(2)}`).join(', ')} — 장벽 매칭 ${cp.match.toFixed(2)}`,
    `심리 원리: ${d.principles.join(' / ')}`,
    ...cp.notes,
    d.lever.kind === 'none'
      ? '혜택 강도: 가격 혜택 없는 장치'
      : `혜택 강도: ${recommended.label} 추천(이익 차이 ${pct(POLICY.flatOptimumTolerance)} 이내에서 가장 낮은 혜택으로 첫 시험), 정책 한도 ${maxAllowed.label}`,
    `예상: 월 +${recommended.extraSuccesses.toFixed(1)}${SUCCESS_LABEL[d.segment]}, 비용 ${fmtWon(recommended.costPerMonth)}, 12개월 기대 순이익 ${fmtWon(recommended.eip)} [${evidenceText}]`,
  ];

  const controlShare = d.segment === 'prospect' ? 0.5 : reach >= 60 ? 0.2 : 0.3;
  const decideReach = d.segment === 'prospect' ? Math.max(s.funnel.newPerMonth, 1) : reach;
  const decideUplift = d.channel === 'referral' ? recommended.extraSuccesses / Math.max(s.funnel.newPerMonth, 1) : recommended.uplift;
  const months = monthsToDecide(d.segment, seg.base, decideUplift, decideReach, controlShare);

  return {
    device: d, objective, fit, match: cp.match, context: cp.context, crowding: cp.crowding,
    priorUplift: cp.prior, posterior: post, sampledUplift, reach, levels, recommended, maxAllowed,
    riskFactor, score, reasons, warnings: warningsFor(d),
    measurement: { controlShare, monthsToDecide: months, metric: seg.metric },
  };
}
