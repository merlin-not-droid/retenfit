// PortOne V2 REST — 빌링키 결제, 결제 단건 조회, 웹훅 서명 확인
// 비밀값은 Supabase Secrets에만 둡니다: PORTONE_API_SECRET, PORTONE_WEBHOOK_SECRET
const API = 'https://api.portone.io';
const headers = () => ({ Authorization: `PortOne ${Deno.env.get('PORTONE_API_SECRET')}`, 'Content-Type': 'application/json' });

export async function getPayment(paymentId) {
  const res = await fetch(`${API}/payments/${encodeURIComponent(paymentId)}`, { headers: headers() });
  return res.ok ? res.json() : null;
}

/** 빌링키로 결제하고, 응답만 믿지 않고 단건 조회로 상태·금액을 다시 확인 */
export async function payWithBillingKey({ paymentId, billingKey, amount, orderName, customerId }) {
  const res = await fetch(`${API}/payments/${encodeURIComponent(paymentId)}/billing-key`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ billingKey, orderName, customer: { id: customerId }, amount: { total: amount }, currency: 'KRW' }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    return { ok: false, error: err.message ?? `결제 요청 실패(HTTP ${res.status})` };
  }
  const p = await getPayment(paymentId);
  const ok = p?.status === 'PAID' && p?.amount?.total === amount;
  return { ok, pgTxId: p?.pgTxId ?? null, error: ok ? null : `결제 확인 실패(${p?.status ?? '응답 없음'})` };
}

const b64 = (bytes) => btoa(String.fromCharCode(...bytes));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

/** Standard Webhooks 서명 확인(webhook-id·timestamp·signature, HMAC-SHA256). 5분이 지난 요청은 거절 */
export async function verifyWebhook(secret, h, body) {
  const id = h.get('webhook-id');
  const ts = h.get('webhook-timestamp');
  const sigs = h.get('webhook-signature');
  if (!secret || !id || !ts || !sigs || Math.abs(Date.now() / 1000 - Number(ts)) > 300) return false;
  const raw = secret.startsWith('whsec_') ? unb64(secret.slice(6)) : new TextEncoder().encode(secret);
  const key = await crypto.subtle.importKey('raw', raw, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = b64(new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${id}.${ts}.${body}`))));
  return sigs.split(' ').some((s) => s.split(',')[1] === mac);
}
