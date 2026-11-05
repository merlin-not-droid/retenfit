// 둘러보기용 샘플 데이터 (가상의 손님 — 실제 매장 결과가 아닙니다)
// 같은 기준일이면 항상 같은 데이터가 나오도록 고정된 난수를 씁니다.
import { addDays, diffDays } from './dates.js';
import { defaultState, menuFor, menuItem } from './state.js';

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
  return state;
}
