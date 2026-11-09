// Postgres 저장소(billing-handler.js의 store 계약 구현) — Edge Functions에서 service role 클라이언트로 사용
const toSub = (r) =>
  r && {
    userId: r.user_id, status: r.status, intro: r.intro, startedOn: r.started_on, chargesDone: r.charges_done,
    nextChargeOn: r.next_charge_on, failedCount: r.failed_count, canceledOn: r.canceled_on, endedOn: r.ended_on, lastPaymentId: r.last_payment_id,
  };
const fromSub = (s) => ({
  user_id: s.userId, status: s.status, intro: s.intro !== false, started_on: s.startedOn, charges_done: s.chargesDone,
  next_charge_on: s.nextChargeOn, failed_count: s.failedCount, canceled_on: s.canceledOn, ended_on: s.endedOn,
  last_payment_id: s.lastPaymentId, updated_at: new Date().toISOString(),
});

export function supabaseStore(db) {
  const must = (res) => {
    if (res.error) throw new Error(res.error.message);
    return res.data;
  };
  return {
    async getSub(userId) { return toSub(must(await db.from('subscriptions').select('*').eq('user_id', userId).maybeSingle())); },
    async putSub(sub) { must(await db.from('subscriptions').upsert(fromSub(sub))); },
    async listSubs() { return must(await db.from('subscriptions').select('*').in('status', ['trial', 'active', 'past_due', 'canceled'])).map(toSub); },
    async addPayment(p) {
      must(await db.from('payments').upsert({
        id: p.id, user_id: p.userId, amount: p.amount, charge_index: p.chargeIndex, status: p.status,
        paid_on: p.paidOn, pg_tx_id: p.pgTxId, failure: p.failure,
      }));
    },
    async getBillingKey(userId) { return must(await db.from('billing_keys').select('billing_key').eq('user_id', userId).maybeSingle())?.billing_key ?? null; },
    async putBillingKey(userId, key) { must(await db.from('billing_keys').upsert({ user_id: userId, billing_key: key })); },
    async isAdmin(userId) { return Boolean(must(await db.from('admins').select('user_id').eq('user_id', userId).maybeSingle())); },
    async upsertProfile(p) {
      must(await db.from('profiles').upsert({
        user_id: p.userId, nickname: p.nickname, email: p.email, phone: p.phone, shop_name: p.shopName, agreed_at: p.agreedAt,
      }));
    },
  };
}
