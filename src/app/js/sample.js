// 둘러보기용 샘플 데이터 (가상의 손님 — 실제 매장 결과가 아닙니다)
// 같은 기준일이면 항상 같은 데이터가 나오도록 고정된 난수를 씁니다.
import { addDays, diffDays } from './dates.js';
import { checkoutExposures, newExperiment } from './experiments.js';
import { defaultShop, defaultState, menuFor, menuItem } from './state.js';

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 샘플 안에서만 쓰는 가정 (프로모션마다 다른 재방문 경향을 흉내 냄)
const ACQ = [
  { name: '첫 방문 할인', rate: 0.2, revisit: 0.42 },
  { name: '다음 방문 예약 시 첫 방문 할인', rate: 0.15, revisit: 0.55 },
  { name: '지인과 함께 방문 할인', rate: 0.15, revisit: 0.4 },
  { name: '', rate: 0, revisit: 0.33 },
];

export function sampleState(asOf, seed = 20261105) {
  const rand = mulberry32(seed);
  const pick = (list) => list[Math.floor(rand() * list.length)];
  const state = defaultState();
  state.settings.shopName = '샘플 왁싱샵';
  state.meta.demo = true;
  // 매장 진단(가상): 역세권, 개업 9개월, 2인, 예약률 55%
  state.settings.shop = {
    ...defaultShop(),
    configured: true,
    tradeArea: 'station',
    openedOn: addDays(asOf, -270).slice(0, 7),
    staffCount: 2,
    capacityPerMonth: 220,
    utilization: 0.55,
    competitorDensity: 7,
    competitorDiscountIntensity: 2,
    reviewCount: 60,
    monthlyPromoBudget: 400000,
  };
  const start = addDays(asOf, -240);
  let n = 0;
  for (let day = 0; day <= 230; day += 1) {
    const date = addDays(start, day);
    const arrivals = rand() < 0.55 ? 1 : rand() < 0.15 ? 2 : 0;
    for (let k = 0; k < arrivals; k += 1) {
      n += 1;
      const id = `C${String(n).padStart(3, '0')}`;
      const gender = rand() < 0.68 ? 'F' : 'M';
      const options = menuFor(state.settings, gender);
      const main = rand() < 0.55 ? options.find((m) => m.name === '브라질리언') ?? pick(options) : pick(options);
      const acq = pick(ACQ);
      const consent = rand() < 0.62;
      state.customers.push({
        id,
        alias: `샘플 손님 ${String(n).padStart(3, '0')}`,
        gender,
        mainService: main.name,
        cycleDays: rand() < 0.2 ? main.cycleDays + (rand() < 0.5 ? -7 : 7) : null,
        phone: '',
        consent: { marketing: consent, at: consent ? date : null },
        memo: '',
      });
      const item = menuItem(state.settings, main.name, gender);
      const visit = (d, rate, promotion) =>
        state.visits.push({
          id: `v_s${state.visits.length + 1}`,
          customerId: id,
          date: d,
          service: main.name,
          listPrice: item.price,
          paid: Math.round((item.price * (1 - rate)) / 1000) * 1000,
          promotion,
          variableCost: null,
        });
      visit(date, acq.rate, acq.name);
      // 재방문: 주기 근처에 올 확률은 프로모션마다 다르게, 이후 방문은 점점 줄어듦
      let last = date;
      let p = acq.revisit;
      for (let r = 0; r < 6; r += 1) {
        if (rand() > p) break;
        const gap = Math.max(14, Math.round(item.cycleDays + (rand() - 0.4) * 18));
        const next = addDays(last, gap);
        if (diffDays(next, asOf) < 0) break;
        const discounted = r === 0 && rand() < 0.5;
        visit(next, discounted ? 0.1 : 0, discounted ? '주기 안 재방문 할인' : '');
        last = next;
        p = Math.min(0.85, p + 0.18);
      }
    }
  }
  addSampleExperiment(state, asOf, seed);
  return state;
}

/**
 * 효과 실험 예시(가상): 150일 전부터 처음 온 손님에게 '주기 안 재방문 할인 10%'를 주되 30%는 비교군으로 남김.
 * 혜택군의 재방문이 조금 늘도록 흉내 냄. 위 손님 데이터와 다른 난수를 써서 기존 샘플은 그대로 둠.
 */
function addSampleExperiment(state, asOf, seed) {
  const plan = { id: 'p_sample_revisit', kind: 'retention', name: '주기 안 재방문 할인 10%', promotionId: 'second-visit', rate: 0.1, createdAt: addDays(asOf, -150) };
  state.plans.push(plan);
  const exp = newExperiment(plan, { id: 'x_sample_revisit', startDate: addDays(asOf, -150), controlShare: 0.3, settings: state.settings });
  state.experiments.push(exp);
  const rand = mulberry32(seed + 7);
  for (const e of checkoutExposures(exp, state.visits, asOf)) {
    if (e.arm !== 'treat') continue;
    const came = state.visits.some((v) => v.customerId === e.customerId && diffDays(e.date, v.date) > 0 && diffDays(e.date, v.date) <= exp.windowDays);
    if (came || rand() > 0.22) continue;
    const c = state.customers.find((x) => x.id === e.customerId);
    const item = menuItem(state.settings, c.mainService, c.gender);
    const date = addDays(e.date, Math.max(21, Math.round(item.cycleDays + (rand() - 0.5) * 10)));
    if (date > asOf) continue;
    state.visits.push({
      id: `v_x${state.visits.length + 1}`, customerId: e.customerId, date, service: c.mainService,
      listPrice: item.price, paid: Math.round((item.price * 0.9) / 1000) * 1000, promotion: plan.name, variableCost: null,
    });
  }
}
