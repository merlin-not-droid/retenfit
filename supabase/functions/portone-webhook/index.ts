// PortOne 웹훅: 서명 확인 → 결제 단건 재조회 → payments 상태 맞춤(콘솔에서 취소·환불한 경우 등)
// 배포: supabase functions deploy portone-webhook --no-verify-jwt
// PortOne 콘솔 웹훅 주소: https://프로젝트ID.supabase.co/functions/v1/portone-webhook
import { json, serviceClient } from '../_shared/http.js';
import { getPayment, verifyWebhook } from '../_shared/portone.js';

const STATUS: Record<string, string> = { PAID: 'paid', FAILED: 'failed', CANCELLED: 'cancelled', PARTIAL_CANCELLED: 'cancelled' };

Deno.serve(async (req: Request) => {
  const body = await req.text();
  if (!(await verifyWebhook(Deno.env.get('PORTONE_WEBHOOK_SECRET'), req.headers, body))) return json({ error: 'invalid signature' }, 401);
  const event: any = JSON.parse(body);
  const paymentId = event?.data?.paymentId;
  if (!paymentId) return json({ ok: true, ignored: event?.type ?? 'unknown' });
  const p: any = await getPayment(paymentId);
  const status = STATUS[p?.status];
  if (status) await serviceClient().from('payments').update({ status }).eq('id', paymentId);
  return json({ ok: true, paymentId, status: status ?? p?.status ?? null });
});
