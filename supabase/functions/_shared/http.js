// Edge Functions 공용: CORS·JSON 응답·로그인 사용자 확인
import { createClient } from 'npm:@supabase/supabase-js@2.118.0';

export const cors = {
  'Access-Control-Allow-Origin': Deno.env.get('SITE_ORIGIN') ?? '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

/**
 * 서버 전용 키: 예전 방식(SUPABASE_SERVICE_ROLE_KEY) → 새 방식(SUPABASE_SECRET_KEYS, sb_secret_…) 순서로 찾음.
 * 둘 다 Supabase가 함수에 자동으로 넣어 주는 값이며, 브라우저에는 절대 내보내지 않습니다.
 */
function serverKey() {
  const legacy = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (legacy) return legacy;
  const raw = Deno.env.get('SUPABASE_SECRET_KEYS') ?? '';
  if (raw.startsWith('sb_secret_')) return raw;
  try {
    const keys = JSON.parse(raw);
    return keys.default ?? Object.values(keys)[0];
  } catch {
    throw new Error('서버 키를 찾지 못했습니다(SUPABASE_SERVICE_ROLE_KEY 또는 SUPABASE_SECRET_KEYS).');
  }
}

/** 서버 전용 클라이언트(RLS를 넘어서므로 서버에서만) */
export const serviceClient = () => createClient(Deno.env.get('SUPABASE_URL'), serverKey(), { auth: { persistSession: false } });

/** Authorization 헤더의 로그인 토큰 → 사용자(카카오 닉네임·이메일) */
export async function userFrom(req, db) {
  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const { data } = await db.auth.getUser(token);
  const u = data?.user;
  if (!u) return null;
  const m = u.user_metadata ?? {};
  return { id: u.id, email: u.email ?? '', nickname: m.name ?? m.full_name ?? m.nickname ?? m.preferred_username ?? '카카오 사용자' };
}

/** 한국 시간 오늘 */
export const todayKST = () => new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
