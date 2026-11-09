// 효과 실험(비교군) — '프로모션이 없었어도 왔을 손님'을 빼고 효과를 재서 추천 엔진이 우리 매장 결과로 배우게 함
// (순수 함수 — test/experiments.test.mjs)
//
// 방식은 프로모션(엔진 장치)의 대상에 따라 자동으로 정해집니다.
//   switchback : 첫 방문 유인 — 시행 주와 쉬는 주를 번갈아 주간 신규 손님 수를 비교
//   checkout   : 결제 때 주는 혜택 — 첫 방문(회수권은 2회째) 손님을 손님 번호로 혜택군/비교군에 고정 배정, 비교군에는 혜택을 주지 않음
//   message    : 안내 발송 — 보낼 손님을 같은 방식으로 나누고 혜택군에게만 보냄(목록을 복사할 때 양쪽 모두 기록)
import { timelines } from './analytics.js';
import { addDays, diffDays } from './dates.js';
import { CATALOG_BY_ID, WAX_TO_ENGINE, levelFromWaxRate } from '../../../assets/js/promo-engine/index.js';
import { hashString } from '../../../assets/js/promo-engine/util.js';
import { nextVisitInfo } from './state.js';

export const DESIGN_LABEL = { switchback: '격주 교차', checkout: '비교군(결제 때)', message: '비교군(안내 발송)' };
export const VERDICT = {
  collecting: { label: '데이터 모으는 중', tone: '' },
  positive: { label: '효과 있음', tone: 'safe' },
  negative: { label: '역효과 의심', tone: 'danger' },
  unclear: { label: '아직 판단 어려움', tone: 'caution' },
};
const MIN_PER_ARM = 10; // 각 군 관찰 완료 손님이 이만큼은 있어야 판단
const Z2_POWER = 6.19; // (1.645 + 0.842)^2: 단측 5%, 검정력 80%

export const engineIdOf = (plan) => WAX_TO_ENGINE[plan.promotionId] ?? plan.promotionId;
export const deviceOf = (exp) => CATALOG_BY_ID[exp.engineId] ?? null;

export function designOf(device) {
  if (!device) return 'checkout';
  if (device.segment === 'prospect') return 'switchback';
  if (device.channel === 'message') return 'message';
  return 'checkout';
}

/** 저장한 프로모션(plan)으로 실험 만들기 */
export function newExperiment(plan, { id, startDate, controlShare = 0.2, settings = {} }) {
  const engineId = engineIdOf(plan);
  const design = designOf(CATALOG_BY_ID[engineId]);
  return {
    id,
    planId: plan.id,
    name: plan.name,
    engineId,
    waxId: WAX_TO_ENGINE[plan.promotionId] ? plan.promotionId : null,
    kind: plan.kind,
    rate: typeof plan.rate === 'number' ? plan.rate : null,
    level: typeof plan.level === 'number' ? plan.level : null,
    design,
    controlShare: design === 'switchback' ? 0.5 : controlShare,
    windowDays: design === 'message' ? 30 : design === 'switchback' ? 7 : settings.windowDays || 60,
    startDate,
    endDate: null,
    exposures: [],
  };
}

/** 해시 뒤섞기(murmur3 fmix32). 끝자리만 다른 손님 번호(C001, C002…)도 고르게 퍼지도록 */
function mix32(h) {
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/** 손님 번호로 고정 배정: 같은 실험·같은 손님이면 언제나 같은 군 */
export const armOf = (exp, customerId) => (mix32(hashString(`${exp.id}:${customerId}`)) / 4294967296 < exp.controlShare ? 'control' : 'treat');

export const runningFor = (state, predicate) => (state.experiments ?? []).filter((x) => !x.endDate && predicate(x));
/** 기본 옵션(id)으로 진행 중인 실험 */
export const runningForOption = (state, waxId) => runningFor(state, (x) => (x.waxId ?? x.waxfitId) === waxId)[0] ?? null;

/** 격주 교차의 이번 주: 시작 주가 시행 주, 다음 주가 쉬는 주 … */
export function switchbackWeek(exp, asOf) {
  const k = Math.max(0, Math.floor(diffDays(exp.startDate, asOf) / 7));
  const from = addDays(exp.startDate, 7 * k);
  return { on: k % 2 === 0, from, to: addDays(from, 6) };
}

/** 결제 때 주는 혜택: 기간 안의 첫 방문(회수권 같은 2회째 장치는 2회째, 단골 장치는 기간 중 첫 방문)이 노출 */
export function checkoutExposures(exp, visits, asOf) {
  const segment = deviceOf(exp)?.segment;
  const end = exp.endDate ?? asOf;
  const out = [];
  for (const [customerId, list] of timelines(visits)) {
    const v = segment === 'repeat' ? list[1]
      : segment === 'regular' ? list.find((x, i) => i >= 2 && x.date >= exp.startDate)
      : list[0];
    if (!v || v.date < exp.startDate || v.date > end) continue;
    out.push({ customerId, date: v.date, arm: armOf(exp, customerId) });
  }
  return out.sort((a, b) => b.date.localeCompare(a.date));
}

/** 안내 발송 기록: 목록을 복사할 때 양쪽 군을 모두 기록(손님당 처음 한 번) */
export function recordMessageExposures(exp, customerIds, date) {
  const seen = new Set(exp.exposures.map((e) => e.customerId));
  let added = 0;
  for (const id of customerIds) {
    if (seen.has(id)) continue;
    exp.exposures.push({ customerId: id, date, arm: armOf(exp, id) });
    seen.add(id);
    added += 1;
  }
  return added;
}

/** 엔진 장치에 맞는 안내 대상(재방문 설계 화면에 없는 장치용) */
export function messageTargets(exp, state, asOf) {
  const device = deviceOf(exp);
  const want = device?.segment === 'lapsed' ? ['dormant'] : device?.segment === 'atRisk' ? ['overdue'] : ['soon', 'overdue'];
  return state.customers
    .map((c) => ({ c, info: nextVisitInfo(c, state.visits, state.settings, asOf) }))
    .filter(({ c, info }) => want.includes(info.status) && (!device?.requires?.consent || c.consent?.marketing));
}

export function holdoutStats(t, c) {
  const rate = (a) => (a.n ? a.success / a.n : null);
  const pt = rate(t);
  const pc = rate(c);
  if (t.n < MIN_PER_ARM || c.n < MIN_PER_ARM) return { pt, pc, diff: pt !== null && pc !== null ? pt - pc : null, ci: null, verdict: 'collecting', needed: null };
  const diff = pt - pc;
  const se = Math.sqrt((pt * (1 - pt)) / t.n + (pc * (1 - pc)) / c.n);
  const ci = [diff - 1.96 * se, diff + 1.96 * se];
  const verdict = ci[0] > 0 ? 'positive' : ci[1] < 0 ? 'negative' : 'unclear';
  const d = Math.max(Math.abs(diff), 0.03);
  const needed = verdict === 'unclear' ? Math.ceil((Z2_POWER * (pt * (1 - pt) + pc * (1 - pc) || 0.25)) / d ** 2) : null;
  return { pt, pc, diff, ci, verdict, needed };
}

export function switchbackStats(w) {
  if (w.weeksOn < 2 || w.weeksOff < 2) return { uplift: null, ci: null, verdict: 'collecting' };
  const ratio = (w.newOn + 0.5) / w.weeksOn / ((w.newOff + 0.5) / w.weeksOff);
  const se = Math.sqrt(1 / (w.newOn + 0.5) + 1 / (w.newOff + 0.5));
  const ci = [ratio * Math.exp(-1.96 * se) - 1, ratio * Math.exp(1.96 * se) - 1];
  return { uplift: ratio - 1, ci, verdict: ci[0] > 0 ? 'positive' : ci[1] < 0 ? 'negative' : 'unclear' };
}

/** 실험 하나의 현재 결과 */
export function experimentResult(exp, state, asOf) {
  const lines = timelines(state.visits);
  if (exp.design === 'switchback') {
    const end = exp.endDate ?? asOf;
    const days = diffDays(exp.startDate, end) + (exp.endDate ? 1 : 0); // 진행 중이면 오늘은 아직 안 끝남
    const weeks = Math.max(0, Math.floor(days / 7));
    const firsts = [...lines.values()].map((list) => list[0].date);
    const w = { weeksOn: 0, newOn: 0, weeksOff: 0, newOff: 0 };
    for (let k = 0; k < weeks; k += 1) {
      const from = addDays(exp.startDate, 7 * k);
      const to = addDays(from, 6);
      const n = firsts.filter((d) => d >= from && d <= to).length;
      if (k % 2 === 0) { w.weeksOn += 1; w.newOn += n; } else { w.weeksOff += 1; w.newOff += n; }
    }
    return { exp, design: exp.design, weeks: w, stats: switchbackStats(w), thisWeek: switchbackWeek(exp, asOf) };
  }
  const exposures = exp.design === 'message' ? exp.exposures : checkoutExposures(exp, state.visits, asOf);
  const arms = { treat: { n: 0, success: 0, observing: 0 }, control: { n: 0, success: 0, observing: 0 } };
  for (const e of exposures) {
    const a = arms[e.arm];
    if (diffDays(e.date, asOf) < exp.windowDays) {
      a.observing += 1;
      continue;
    }
    a.n += 1;
    const came = (lines.get(e.customerId) ?? []).some((v) => {
      const d = diffDays(e.date, v.date);
      return d > 0 && d <= exp.windowDays;
    });
    if (came) a.success += 1;
  }
  return { exp, design: exp.design, exposures, arms, stats: holdoutStats(arms.treat, arms.control) };
}

/** 실험 결과 → 엔진 학습 입력(CampaignResult). 관찰이 끝난 데이터가 있는 실험만 */
export function campaignResults(state, asOf, store) {
  const out = [];
  for (const exp of state.experiments ?? []) {
    const device = deviceOf(exp);
    if (!device) continue;
    const r = experimentResult(exp, state, asOf);
    const level = exp.level ?? levelFromWaxRate(device, exp.rate, store);
    const base = { storeId: store.id, promotionId: exp.engineId, period: exp.startDate.slice(0, 7), level };
    if (r.design === 'switchback') {
      if (r.weeks.weeksOn && r.weeks.weeksOff) out.push({ ...base, ...r.weeks });
    } else if (r.arms.treat.n && r.arms.control.n) {
      out.push({ ...base, treated: r.arms.treat.n, treatedSuccess: r.arms.treat.success, control: r.arms.control.n, controlSuccess: r.arms.control.success });
    }
  }
  return out;
}
