// 구독 요청 처리 — 저장소(store)와 결제 함수(pay)만 바꿔 끼웁니다 (test/billing.test.mjs)
//   운영: supabase/functions/billing·renew  (store = Postgres, pay = PortOne 빌링키 결제)
//   로컬: scripts/dev-backend.mjs           (store = 메모리, pay = 가짜 결제)
//
// store: { getSub(userId), putSub(sub), listSubs(), addPayment(p), getBillingKey(userId), putBillingKey(userId, key),
//          isAdmin(userId), upsertProfile(profile) }
// pay  : async ({ paymentId, billingKey, amount, orderName, customerId }) => ({ ok, pgTxId?, error? })
import {
  PRICING, applyCharge, cancelSubscription, chargeAmount, expire, hasAccess, isDue, newSubscription, nextCharge, resumeSubscription,
} from './billing-core.js';

/** 같은 날 같은 회차를 두 번 결제하지 않도록 결정적인 결제 번호(PortOne이 중복 결제를 거절) */
export const paymentIdFor = (userId, today, sub) =>
  `wf-${String(userId).replace(/-/g, '').slice(0, 12)}-${today.replaceAll('-', '')}-${sub.chargesDone}-${sub.failedCount}`;

export const orderName = (index, intro) =>
  `${PRICING.planName} ${index + 1}개월차${intro !== false && index < PRICING.introMonths ? ' (체험가)' : ''}`;

export async function statusView(store, user, today) {
  const sub = await store.getSub(user.id);
  return { today, user, subscription: sub, access: hasAccess(sub, today), next: nextCharge(sub), isAdmin: await store.isAdmin(user.id), pricing: PRICING };
}

const fail = (status, error) => ({ status, body: { error } });

export async function handleBilling({ action, body = {}, user, today, store, pay }) {
  const sub = await store.getSub(user.id);
  if (action === 'status') return { status: 200, body: await statusView(store, user, today) };

  if (action === 'subscribe') {
    if (sub && hasAccess(sub, today)) {
      return fail(409, sub.status === 'canceled' ? '해지 예약 중입니다. ‘해지 취소’로 다시 이어 쓸 수 있습니다.' : '이미 구독 중입니다.');
    }
    if (!body.billingKey) return fail(400, '결제 수단이 등록되지 않았습니다.');
    const a = body.agreed ?? {};
    if (!a.terms || !a.privacy || !a.billing) return fail(400, '이용약관·개인정보·정기결제 자동 전환에 모두 동의해야 합니다.');
    const intro = !sub; // 체험가는 계정당 한 번
    let next = newSubscription({ userId: user.id, today, intro });
    const amount = chargeAmount(0, intro);
    const paymentId = paymentIdFor(user.id, today, next);
    const r = await pay({ paymentId, billingKey: body.billingKey, amount, orderName: orderName(0, intro), customerId: user.id });
    await store.addPayment({
      id: paymentId, userId: user.id, amount, chargeIndex: 0, status: r.ok ? 'paid' : 'failed', paidOn: today,
      pgTxId: r.pgTxId ?? null, failure: r.ok ? null : r.error ?? '결제 실패',
    });
    if (!r.ok) return fail(402, `결제가 완료되지 않았습니다. ${r.error ?? ''}`.trim());
    await store.upsertProfile({
      userId: user.id, nickname: user.nickname ?? '', email: user.email ?? '', phone: body.customer?.phone ?? '',
      shopName: body.customer?.shopName ?? '', agreedAt: new Date().toISOString(), createdOn: today,
    });
    next = applyCharge(next, { ok: true, today, paymentId });
    await store.putBillingKey(user.id, body.billingKey);
    await store.putSub(next);
    return { status: 200, body: await statusView(store, user, today) };
  }

  if (action === 'cancel' || action === 'resume') {
    if (!sub) return fail(404, '구독 정보가 없습니다.');
    const changed = action === 'cancel' ? cancelSubscription(sub, today) : resumeSubscription(sub, today);
    if (changed === sub) return fail(409, action === 'cancel' ? '해지할 수 있는 구독이 없습니다.' : '다시 이어 쓸 수 있는 해지 예약이 없습니다.');
    await store.putSub(changed);
    return { status: 200, body: await statusView(store, user, today) };
  }
  return fail(400, '알 수 없는 요청입니다.');
}

/** 하루 한 번: 결제일이 된 구독을 결제하고, 기간이 끝난 해지 예약을 정리 */
export async function runRenewals({ today, store, pay }) {
  const summary = { today, charged: 0, failed: 0, ended: 0 };
  for (const sub of await store.listSubs()) {
    if (sub.status === 'canceled') {
      const done = expire(sub, today);
      if (done !== sub) {
        await store.putSub(done);
        summary.ended += 1;
      }
      continue;
    }
    if (!isDue(sub, today)) continue;
    const billingKey = await store.getBillingKey(sub.userId);
    const amount = chargeAmount(sub.chargesDone, sub.intro);
    const paymentId = paymentIdFor(sub.userId, today, sub);
    const r = billingKey
      ? await pay({ paymentId, billingKey, amount, orderName: orderName(sub.chargesDone, sub.intro), customerId: sub.userId })
      : { ok: false, error: '등록된 결제 수단 없음' };
    await store.addPayment({
      id: paymentId, userId: sub.userId, amount, chargeIndex: sub.chargesDone, status: r.ok ? 'paid' : 'failed', paidOn: today,
      pgTxId: r.pgTxId ?? null, failure: r.ok ? null : r.error ?? '결제 실패',
    });
    const next = applyCharge(sub, { ok: r.ok, today, paymentId });
    await store.putSub(next);
    if (r.ok) summary.charged += 1;
    else {
      summary.failed += 1;
      if (next.status === 'ended') summary.ended += 1;
    }
  }
  return summary;
}
