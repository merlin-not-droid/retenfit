// 로컬 테스트 서버용 가상 구독 매장(실제 사람·결제 아님). 같은 기준일이면 항상 같은 데이터
import {
  addDays, addMonths, applyCharge, cancelSubscription, chargeAmount, expire, newSubscription,
} from '../../supabase/functions/_shared/billing-core.js';

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const AREAS = [['station', '역세권·번화가'], ['residential', '주거지'], ['office', '오피스'], ['university', '대학가']];

export async function seedDemo({ store, today, count = 36, seed = 11 }) {
  const r = rng(seed);
  for (let i = 0; i < count; i += 1) {
    const no = String(i + 1).padStart(2, '0');
    const userId = `seed-${no}`;
    // 앞의 두 곳은 이번 주에 정가로 바뀌도록(안내 대상 예시)
    const startedOn = i < 2 ? addDays(addMonths(today, -3), 2 + i * 3) : addDays(today, -1 - Math.floor(r() * 300));
    const cancelAt = i >= 2 && r() < 0.3 ? 1 + Math.floor(r() * 6) : -1;
    let sub = newSubscription({ userId, today: startedOn });
    for (let m = 0; ; m += 1) {
      const on = addMonths(startedOn, m);
      if (on > today) break;
      const isLatest = addMonths(startedOn, m + 1) > today;
      const ok = !(isLatest && i >= 2 && r() < 0.1); // 가장 최근 회차에서 가끔 실패
      const paymentId = `seed-${no}-${m}`;
      await store.addPayment({ id: paymentId, userId, amount: chargeAmount(m), chargeIndex: m, status: ok ? 'paid' : 'failed', paidOn: on, pgTxId: null, failure: ok ? null : '테스트: 카드 한도 초과' });
      sub = applyCharge(sub, { ok, today: on, paymentId });
      if (!ok) break;
      if (m === cancelAt) {
        sub = cancelSubscription(sub, addDays(on, 4) > today ? today : addDays(on, 4));
        break;
      }
    }
    sub = expire(sub, today);
    await store.putSub(sub);
    await store.putBillingKey(userId, 'dev-ok');
    const service = i % 2 ? 'salon' : 'wax';
    const shopName = `샘플 ${service === 'salon' ? '미용실' : '왁싱샵'} ${no}호점`;
    await store.upsertProfile({ userId, nickname: `샘플 사장님 ${no}`, email: '', phone: `010-0000-${String(1000 + i)}`, shopName, createdOn: startedOn });
    if (sub.status === 'ended') continue;
    const [area, label] = AREAS[Math.floor(r() * AREAS.length)];
    const customers = 60 + Math.floor(r() * 340);
    const treated = 20 + Math.floor(r() * 60);
    const control = 8 + Math.floor(r() * 20);
    await store.putMetrics(userId, addDays(today, -Math.floor(r() * 3)), {
      service, shopName, tradeArea: area, tradeAreaLabel: label, customers, visits: Math.round(customers * (1.8 + r())),
      newPerMonth: Math.round((5 + r() * 35) * 10) / 10, secondVisitRate: Math.round((0.25 + r() * 0.35) * 1000) / 1000,
      regularRate: Math.round((0.35 + r() * 0.35) * 1000) / 1000, activeRegulars: Math.floor(customers * (0.1 + r() * 0.25)),
      lapsedCount: Math.floor(customers * r() * 0.15),
      experiments: r() < 0.6 ? [{
        storeId: userId, promotionId: 'next_visit_coupon', period: startedOn.slice(0, 7), level: 6000,
        treated, treatedSuccess: Math.round(treated * (0.42 + r() * 0.12)), control, controlSuccess: Math.round(control * (0.38 + r() * 0.08)),
      }] : [],
    });
  }
}
