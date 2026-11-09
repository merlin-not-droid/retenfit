// 구독 결제 핵심 규칙 (순수 함수 — test/billing.test.mjs)
// 운영 서버(supabase/functions)와 로컬 테스트 서버(scripts/dev-backend.mjs)가 이 파일 하나를 함께 씁니다.
//
//   요금 : 첫 3개월 매달 4,900원 → 4개월째부터 매달 8,900원 (부가세 포함)
//   전환 : 가입 때 정가 자동 전환에 동의, 전환 7일 전 안내, 언제든 해지(낸 기간 끝까지 이용)
//   날짜 : 한국 시간 기준 'YYYY-MM-DD'

export const PRICING = Object.freeze({
  planName: '리텐핏 매장 요금제',
  introMonths: 3,
  introPrice: 4900,
  regularPrice: 8900,
  currency: 'KRW',
  noticeDays: 7,
  retryDays: [1, 3, 5], // 결제 실패 후 재시도까지 일수. 모두 실패하면 종료
});

export const STATUS_LABEL = {
  trial: '체험가 이용 중',
  active: '정가 이용 중',
  past_due: '결제 실패 · 재시도 중',
  canceled: '해지 예약(남은 기간 이용)',
  ended: '종료',
};
const LIVE = new Set(['trial', 'active', 'past_due']);

const DAY = 86400000;
const toMs = (d) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10));
const fmt = (ms) => new Date(ms).toISOString().slice(0, 10);
export const addDays = (d, n) => fmt(toMs(d) + n * DAY);
export const diffDays = (from, to) => Math.round((toMs(to) - toMs(from)) / DAY);
export const todayKST = (now = Date.now()) => fmt(now + 9 * 3600000);

/** 매달 같은 날(그 달에 없는 날이면 말일): 1월 31일 + 1개월 → 2월 28일(윤년 29일) */
export function addMonths(d, n) {
  const y = +d.slice(0, 4);
  const m = +d.slice(5, 7) - 1 + n;
  const yy = y + Math.floor(m / 12);
  const mm = ((m % 12) + 12) % 12;
  const last = new Date(Date.UTC(yy, mm + 1, 0)).getUTCDate();
  return fmt(Date.UTC(yy, mm, Math.min(+d.slice(8, 10), last)));
}

/** index번째(0부터) 결제 금액. 체험가는 계정당 한 번(intro=false면 처음부터 정가) */
export const chargeAmount = (index, intro = true) => (intro && index < PRICING.introMonths ? PRICING.introPrice : PRICING.regularPrice);

/** 가입일 기준 앞으로의 결제 일정 */
export function chargeSchedule(startedOn, count = PRICING.introMonths + 1, from = 0, intro = true) {
  return Array.from({ length: count }, (_, i) => ({ index: from + i, on: addMonths(startedOn, from + i), amount: chargeAmount(from + i, intro) }));
}

export function newSubscription({ userId, today, intro = true }) {
  return { userId, status: intro ? 'trial' : 'active', intro, startedOn: today, chargesDone: 0, nextChargeOn: today, failedCount: 0, canceledOn: null, endedOn: null, lastPaymentId: null };
}

const statusAfter = (sub, chargesDone) => (sub.intro !== false && chargesDone <= PRICING.introMonths ? 'trial' : 'active');

/** 낸 기간의 끝(이날부터는 다음 결제가 필요) */
export const paidThroughOn = (sub) => addMonths(sub.startedOn, sub.chargesDone);

export const isDue = (sub, today) => LIVE.has(sub.status) && sub.nextChargeOn <= today;

/** 결제 결과 반영. 실패하면 정해진 간격으로 재시도하고, 모두 실패하면 종료 */
export function applyCharge(sub, { ok, today, paymentId = null }) {
  if (ok) {
    const chargesDone = sub.chargesDone + 1;
    return {
      ...sub,
      chargesDone,
      status: statusAfter(sub, chargesDone),
      nextChargeOn: addMonths(sub.startedOn, chargesDone),
      failedCount: 0,
      lastPaymentId: paymentId ?? sub.lastPaymentId,
    };
  }
  const failedCount = sub.failedCount + 1;
  if (failedCount > PRICING.retryDays.length) return { ...sub, status: 'ended', endedOn: today, failedCount };
  return { ...sub, status: 'past_due', failedCount, nextChargeOn: addDays(today, PRICING.retryDays[failedCount - 1]) };
}

/** 해지: 더는 결제하지 않고, 이미 낸 기간 끝까지 이용 */
export function cancelSubscription(sub, today) {
  if (!LIVE.has(sub.status)) return sub;
  return { ...sub, status: 'canceled', canceledOn: today };
}

/** 해지 취소: 낸 기간이 남아 있으면 원래 일정 그대로 다시 이어감 */
export function resumeSubscription(sub, today) {
  if (sub.status !== 'canceled' || today >= paidThroughOn(sub)) return sub;
  return { ...sub, status: statusAfter(sub, sub.chargesDone), canceledOn: null };
}

/** 해지 예약이 낸 기간을 지나면 종료로 정리 */
export function expire(sub, today) {
  return sub.status === 'canceled' && today >= paidThroughOn(sub) ? { ...sub, status: 'ended', endedOn: paidThroughOn(sub) } : sub;
}

export function hasAccess(sub, today) {
  if (!sub) return false;
  if (LIVE.has(sub.status)) return true;
  return sub.status === 'canceled' && today < paidThroughOn(sub);
}

/** 다음 결제 안내(사장님 화면용) */
export function nextCharge(sub) {
  if (!sub || !LIVE.has(sub.status)) return null;
  return { on: sub.nextChargeOn, amount: chargeAmount(sub.chargesDone, sub.intro), conversion: sub.intro !== false && sub.chargesDone === PRICING.introMonths };
}

/** 체험가 → 정가 전환 안내 대상: 3번 결제를 마쳤고 다음 결제(정가)가 noticeDays 안 */
export function conversionNotices(subs, today, days = PRICING.noticeDays) {
  return subs.filter((s) => s.status === 'trial' && s.intro !== false && s.chargesDone === PRICING.introMonths && diffDays(today, s.nextChargeOn) >= 0 && diffDays(today, s.nextChargeOn) <= days);
}

/** 여러 매장의 실험 결과를 장치별로 합침(비교군 실험만) — 비슷한 매장 학습의 재료 */
export function poolExperiments(metrics) {
  const pool = new Map();
  for (const m of metrics) {
    for (const r of m.data?.experiments ?? []) {
      if (!r.treated || !r.control) continue;
      const p = pool.get(r.promotionId) ?? { promotionId: r.promotionId, stores: new Set(), treated: 0, treatedSuccess: 0, control: 0, controlSuccess: 0 };
      p.stores.add(m.userId);
      p.treated += r.treated;
      p.treatedSuccess += r.treatedSuccess;
      p.control += r.control;
      p.controlSuccess += r.controlSuccess;
      pool.set(r.promotionId, p);
    }
  }
  return [...pool.values()].map((p) => {
    const pt = p.treatedSuccess / p.treated;
    const pc = p.controlSuccess / p.control;
    const se = Math.sqrt((pt * (1 - pt)) / p.treated + (pc * (1 - pc)) / p.control);
    return { ...p, stores: p.stores.size, pt, pc, diff: pt - pc, ci: [pt - pc - 1.96 * se, pt - pc + 1.96 * se] };
  }).sort((a, b) => b.treated + b.control - (a.treated + a.control));
}

/** 운영자 분석 요약 */
export function adminSummary({ profiles = [], subscriptions = [], payments = [], metrics = [] }, today) {
  const byStatus = Object.fromEntries(Object.keys(STATUS_LABEL).map((k) => [k, 0]));
  for (const s of subscriptions) byStatus[s.status] = (byStatus[s.status] ?? 0) + 1;
  const live = subscriptions.filter((s) => LIVE.has(s.status));
  const paid = payments.filter((p) => p.status === 'paid');
  const sum = (list) => list.reduce((a, p) => a + p.amount, 0);
  const month = today.slice(0, 7);
  const reached = subscriptions.filter((s) => s.intro !== false && addMonths(s.startedOn, PRICING.introMonths) <= today);
  const converted = reached.filter((s) => s.chargesDone > PRICING.introMonths);

  const months = [];
  for (let i = 11; i >= 0; i -= 1) months.push(addMonths(`${month}-01`, -i).slice(0, 7));
  const monthly = months.map((mo) => ({
    month: mo,
    signups: subscriptions.filter((s) => s.startedOn.startsWith(mo)).length,
    cancels: subscriptions.filter((s) => s.canceledOn?.startsWith(mo)).length,
    revenue: sum(paid.filter((p) => p.paidOn.startsWith(mo))),
  }));
  const liveAtMonthStart = subscriptions.filter((s) => s.startedOn < `${month}-01` && (!s.canceledOn || s.canceledOn >= `${month}-01`) && (!s.endedOn || s.endedOn >= `${month}-01`)).length;
  const cancelsThisMonth = monthly[monthly.length - 1].cancels;

  const profileOf = new Map(profiles.map((p) => [p.userId, p]));
  const subOf = new Map(subscriptions.map((s) => [s.userId, s]));
  const stores = metrics
    .map((m) => ({ ...m, profile: profileOf.get(m.userId) ?? null, subscription: subOf.get(m.userId) ?? null }))
    .sort((a, b) => (b.syncedOn ?? '').localeCompare(a.syncedOn ?? ''));

  return {
    today,
    subscribers: subscriptions.length,
    byStatus,
    live: live.length,
    mrr: live.reduce((a, s) => a + chargeAmount(s.chargesDone, s.intro), 0),
    revenueTotal: sum(paid),
    revenueThisMonth: sum(paid.filter((p) => p.paidOn.startsWith(month))),
    failedThisMonth: payments.filter((p) => p.status === 'failed' && p.paidOn.startsWith(month)).length,
    conversion: { reached: reached.length, converted: converted.length, rate: reached.length ? converted.length / reached.length : null },
    churnThisMonth: liveAtMonthStart ? cancelsThisMonth / liveAtMonthStart : null,
    monthly,
    notices: conversionNotices(subscriptions, today).map((s) => ({ ...s, profile: profileOf.get(s.userId) ?? null })),
    pastDue: subscriptions.filter((s) => s.status === 'past_due').map((s) => ({ ...s, profile: profileOf.get(s.userId) ?? null })),
    recentPayments: [...payments].sort((a, b) => b.paidOn.localeCompare(a.paidOn)).slice(0, 15).map((p) => ({ ...p, profile: profileOf.get(p.userId) ?? null })),
    stores,
    pooled: poolExperiments(metrics),
  };
}
