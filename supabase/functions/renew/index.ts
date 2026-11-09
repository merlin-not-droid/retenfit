// 하루 한 번(pg_cron이 호출): 결제일이 된 구독 결제 · 기간이 끝난 해지 예약 정리
// 배포: supabase functions deploy renew --no-verify-jwt   (대신 x-cron-secret 헤더로 확인)
import { runRenewals } from '../_shared/billing-handler.js';
import { json, serviceClient, todayKST } from '../_shared/http.js';
import { payWithBillingKey } from '../_shared/portone.js';
import { supabaseStore } from '../_shared/supabase-store.js';

Deno.serve(async (req: Request) => {
  const secret = Deno.env.get('CRON_SECRET');
  if (!secret || req.headers.get('x-cron-secret') !== secret) return json({ error: 'forbidden' }, 403);
  const summary = await runRenewals({ today: todayKST(), store: supabaseStore(serviceClient()), pay: payWithBillingKey });
  console.log('renew', JSON.stringify(summary));
  return json(summary);
});
