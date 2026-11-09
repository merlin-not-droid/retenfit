// 사장님 구독 API: 상태 확인 · 가입(첫 결제) · 해지 · 해지 취소 — 카카오 로그인 토큰 필요
// 배포: supabase functions deploy billing --no-verify-jwt
//   (로그인 확인은 아래 userFrom()이 직접 합니다. 새 공개 키(sb_publishable_…)는 게이트웨이 JWT 검사와 맞지 않아 끕니다)
import { handleBilling } from '../_shared/billing-handler.js';
import { cors, json, serviceClient, todayKST, userFrom } from '../_shared/http.js';
import { payWithBillingKey } from '../_shared/portone.js';
import { supabaseStore } from '../_shared/supabase-store.js';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const db = serviceClient();
  const user = await userFrom(req, db);
  if (!user) return json({ error: '카카오 로그인이 필요합니다.' }, 401);
  const payload: any = await req.json().catch(() => ({}));
  const { action, ...body } = payload;
  try {
    const r = await handleBilling({ action, body, user, today: todayKST(), store: supabaseStore(db), pay: payWithBillingKey });
    return json(r.body, r.status);
  } catch (e) {
    console.error('billing', action, e);
    return json({ error: '처리 중 오류가 발생했습니다. 잠시 뒤 다시 시도해 주세요.' }, 500);
  }
});
