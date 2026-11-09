// 프로모션 성과 분석 (순수 함수 — test/app-analytics.test.mjs)
//
// 재방문율 정의
//   손님의 첫 방문일로부터 관찰 기간(windowDays) 안에 한 번 이상 다시 왔는가.
//   관찰 기간이 아직 안 끝난 손님(관찰 중)은 재방문율 계산에서 빼고 따로 셉니다.
//   → 막 다녀간 손님 때문에 재방문율이 낮아 보이는 착시를 막기 위함
import { diffDays, monthOf, today } from './dates.js';

export const NO_PROMOTION = '프로모션 없음';
export const SMALL_SAMPLE = 30;

/** 95% 윌슨 신뢰 구간 — 표본이 작을 때도 0~1 범위를 벗어나지 않음 */
export function wilson(successes, n, z = 1.96) {
  if (!n) return null;
  const p = successes / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const center = (p + z2 / (2 * n)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / denom;
  return [Math.max(0, center - half), Math.min(1, center + half)];
}

/** 손님별로 방문을 날짜순으로 묶음 */
export function timelines(visits) {
  const map = new Map();
  for (const v of visits) {
    if (!map.has(v.customerId)) map.set(v.customerId, []);
    map.get(v.customerId).push(v);
  }
  for (const list of map.values()) list.sort((a, b) => a.date.localeCompare(b.date));
  return map;
}

function summarize(customers, label) {
  const completed = customers.filter((c) => c.completed);
  const revisited = completed.filter((c) => c.revisited).length;
  const withContribution = completed.filter((c) => c.contribution !== null);
  const avg = (list, f) => (list.length ? list.reduce((s, x) => s + f(x), 0) / list.length : null);
  return {
    label,
    customers: customers.length,
    completed: completed.length,
    observing: customers.length - completed.length,
    observingRevisited: customers.filter((c) => !c.completed && c.revisited).length,
    revisited,
    rate: completed.length ? revisited / completed.length : null,
    ci: wilson(revisited, completed.length),
    avgFirstPaid: avg(customers, (c) => c.firstPaid),
    contributionPerCustomer: avg(withContribution, (c) => c.contribution),
    contributionUnknown: completed.length - withContribution.length,
    smallSample: completed.length < SMALL_SAMPLE,
  };
}

/**
 * visits: [{ customerId, date, service, paid, promotion, variableCost? }]
 * genderOf(customerId) → 'F' | 'M'
 * costOf(visit) → 변동비(원) 또는 null(모름)
 */
export function analyze(visits, { windowDays = 60, asOf = today(), gender = 'all', genderOf = () => null, costOf = () => null } = {}) {
  const customers = [];
  for (const [customerId, list] of timelines(visits)) {
    const g = genderOf(customerId) ?? list[0].gender ?? null;
    if (gender !== 'all' && g !== gender) continue;
    const first = list[0];
    if (first.date > asOf) continue; // 기준일 이후에 처음 온 손님은 제외
    const elapsed = diffDays(first.date, asOf);
    const inWindow = list.filter((v) => {
      const d = diffDays(first.date, v.date);
      return d >= 0 && d <= windowDays && v.date <= asOf;
    });
    const revisited = inWindow.some((v) => diffDays(first.date, v.date) > 0);
    let contribution = 0;
    for (const v of inWindow) {
      const cost = costOf(v);
      if (cost === null || cost === undefined) {
        contribution = null;
        break;
      }
      contribution += v.paid - cost;
    }
    customers.push({
      customerId,
      gender: g,
      firstDate: first.date,
      firstPaid: first.paid,
      promotion: first.promotion?.trim() || NO_PROMOTION,
      completed: elapsed >= windowDays,
      revisited,
      contribution,
    });
  }

  const groups = new Map();
  for (const c of customers) {
    if (!groups.has(c.promotion)) groups.set(c.promotion, []);
    groups.get(c.promotion).push(c);
  }
  const byPromotion = [...groups.entries()]
    .map(([label, list]) => summarize(list, label))
    .sort((a, b) => (a.label === NO_PROMOTION) - (b.label === NO_PROMOTION) || b.customers - a.customers);

  const months = new Map();
  for (const c of customers) {
    const m = monthOf(c.firstDate);
    if (!months.has(m)) months.set(m, []);
    months.get(m).push(c);
  }
  const monthly = [...months.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, list]) => ({ month, ...summarize(list, month) }));

  const baseline = byPromotion.find((g) => g.label === NO_PROMOTION && g.rate !== null);
  for (const g of byPromotion) g.lift = baseline && g !== baseline && g.rate !== null ? g.rate - baseline.rate : null;

  return { totals: summarize(customers, '전체'), byPromotion, monthly, windowDays, asOf };
}
