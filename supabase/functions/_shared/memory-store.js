// 메모리 저장소 — 로컬 테스트 서버와 자동 테스트용 (운영은 supabase-store.ts)
export function memoryStore({ admins = [] } = {}) {
  const subs = new Map();
  const keys = new Map();
  const profiles = new Map();
  const metrics = new Map();
  const payments = [];
  const adminSet = new Set(admins);
  return {
    async getSub(userId) { return subs.get(userId) ?? null; },
    async putSub(sub) { subs.set(sub.userId, { ...sub }); },
    async listSubs() { return [...subs.values()]; },
    async addPayment(p) {
      const i = payments.findIndex((x) => x.id === p.id);
      if (i >= 0) payments[i] = p; // 같은 결제 번호는 덮어씀(중복 결제 없음)
      else payments.push(p);
    },
    async getBillingKey(userId) { return keys.get(userId) ?? null; },
    async putBillingKey(userId, key) { keys.set(userId, key); },
    async isAdmin(userId) { return adminSet.has(userId); },
    async upsertProfile(p) { profiles.set(p.userId, { ...profiles.get(p.userId), ...p }); },
    async putMetrics(userId, syncedOn, data) { metrics.set(userId, { userId, syncedOn, data }); },
    addAdmin(userId) { adminSet.add(userId); },
    /** 운영자 화면용 전체 데이터(결제 수단은 내보내지 않음) */
    dump() {
      return { profiles: [...profiles.values()], subscriptions: [...subs.values()], payments: [...payments], metrics: [...metrics.values()] };
    },
  };
}
