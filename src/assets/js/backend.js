// 결제·로그인 서버 연결 — 결제 페이지, 운영자 분석, 앱이 함께 씁니다.
// backend-config.js 의 mode 에 따라 'off'(결제 오픈 전) · 'supabase'(운영) · 'dev'(로컬 테스트 서버)
import config from './backend-config.js';

export const mode = config.mode ?? 'off';
export const PRICE = { intro: 4900, regular: 8900, introMonths: 3 };

/** 카카오 로그인이 오류로 끝나 돌아왔을 때(주소의 ?error=…) 보여 줄 문구. 오류가 아니면 null */
export function loginErrorMessage(search) {
  const q = new URLSearchParams(search);
  const codes = [q.get('error'), q.get('error_code')];
  if (!codes.some(Boolean)) return null;
  if (codes.includes('bad_oauth_state')) return '로그인 제한 시간이 지났습니다. 카카오로 로그인을 다시 눌러 주세요.';
  if (codes.includes('access_denied')) return '카카오 동의를 마치지 않아 로그인되지 않았습니다. 필수 항목에 동의하면 가입할 수 있습니다.';
  return '카카오 로그인을 마치지 못했습니다. 다시 시도해 주세요.';
}

const camel = (rows) =>
  rows.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k.replace(/_([a-z])/g, (_, c) => c.toUpperCase()), v])));

let instance = null;
export async function backend() {
  instance ??= mode === 'supabase' ? await supabaseBackend() : mode === 'dev' ? devBackend() : offBackend();
  return instance;
}

function offBackend() {
  const closed = async () => {
    throw new Error('결제 오픈을 준비하고 있습니다.');
  };
  return {
    mode: 'off', session: async () => null, login: closed, logout: async () => {}, status: async () => null,
    subscribe: closed, cancel: closed, resume: closed, syncMetrics: async () => false, adminData: closed,
  };
}

// ── 로컬 테스트 서버(scripts/dev-backend.mjs): 카카오·PortOne 대신 가짜 로그인·가짜 카드 ──
function devBackend() {
  const KEY = 'waxfit:dev-session';
  const read = () => {
    try {
      return JSON.parse(sessionStorage.getItem(KEY));
    } catch {
      return null;
    }
  };
  const api = async (path, body) => {
    const s = read();
    const res = await fetch(`/__dev/api/${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { 'content-type': 'application/json', ...(s ? { authorization: `Bearer ${s.token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(data.error ?? `HTTP ${res.status}`), { status: res.status });
    return data;
  };
  return {
    mode: 'dev',
    async session() {
      return read()?.user ?? null;
    },
    async login({ nickname = '테스트 사장님' } = {}) {
      const r = await api('login', { nickname });
      sessionStorage.setItem(KEY, JSON.stringify(r));
      return r.user;
    },
    async logout() {
      sessionStorage.removeItem(KEY);
    },
    status: () => api('billing', { action: 'status' }),
    subscribe: ({ customer, agreed, testCard = 'ok' }) => api('billing', { action: 'subscribe', billingKey: `dev-${testCard}`, customer, agreed }),
    cancel: () => api('billing', { action: 'cancel' }),
    resume: () => api('billing', { action: 'resume' }),
    syncMetrics: (data) => api('metrics', { data }),
    adminData: () => api('admin'),
  };
}

// ── 운영: Supabase Auth(카카오) + Edge Functions + PortOne 빌링키 ──
async function supabaseBackend() {
  const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.118.0/+esm');
  const sb = createClient(config.supabaseUrl, config.supabaseAnonKey, { auth: { flowType: 'pkce', detectSessionInUrl: true, persistSession: true } });
  const call = async (body) => {
    const { data, error } = await sb.functions.invoke('billing', { body });
    if (error) {
      let message = error.message;
      try {
        message = (await error.context.json()).error ?? message;
      } catch {
        /* 서버 응답이 JSON이 아니면 기본 메시지 */
      }
      throw Object.assign(new Error(message), { status: error.context?.status }); // 서버에 닿지 못했으면 status 없음
    }
    return data;
  };
  const session = async () => {
    const { data } = await sb.auth.getSession();
    const u = data.session?.user;
    if (!u) return null;
    const m = u.user_metadata ?? {};
    return { id: u.id, email: u.email ?? '', nickname: m.name ?? m.full_name ?? m.nickname ?? '카카오 사용자' };
  };
  return {
    mode: 'supabase',
    session,
    async login({ returnTo = location.href } = {}) {
      const { error } = await sb.auth.signInWithOAuth({ provider: 'kakao', options: { redirectTo: returnTo } });
      if (error) throw new Error(error.message);
      return null; // 카카오 화면으로 이동
    },
    async logout() {
      await sb.auth.signOut();
    },
    status: () => call({ action: 'status' }),
    /** 카드 등록(빌링키 발급) → 서버가 첫 달 결제·확인. 휴대폰은 결제창이 redirectUrl 로 돌아옴 */
    async subscribe({ customer, agreed, redirectUrl }) {
      const PortOne = await loadPortOne();
      const user = await session();
      const issued = await PortOne.requestIssueBillingKey({
        storeId: config.portone.storeId,
        channelKey: config.portone.channelKey,
        billingKeyMethod: 'CARD',
        issueName: '리텐핏 매장 요금제 정기결제',
        customer: {
          customerId: user.id,
          fullName: customer?.name || undefined,
          phoneNumber: customer?.phone || undefined,
          email: customer?.email || user.email || undefined,
        },
        redirectUrl,
      });
      if (!issued || issued.code) throw new Error(issued?.message ?? '결제 수단 등록이 취소되었습니다.');
      return call({ action: 'subscribe', billingKey: issued.billingKey, customer, agreed });
    },
    /** 휴대폰 결제창에서 돌아왔을 때: 주소의 billingKey 로 가입 마무리 */
    completeSubscribe: ({ billingKey, customer, agreed }) => call({ action: 'subscribe', billingKey, customer, agreed }),
    cancel: () => call({ action: 'cancel' }),
    resume: () => call({ action: 'resume' }),
    async syncMetrics(data) {
      const u = await session();
      if (!u) return false;
      const syncedOn = new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
      const { error } = await sb.from('store_metrics').upsert({ user_id: u.id, synced_on: syncedOn, data });
      return !error;
    },
    /** 운영자만: 행 단위 보안(RLS) 때문에 운영자가 아니면 자기 행만 옵니다 */
    async adminData() {
      const pick = async (table) => {
        const { data, error } = await sb.from(table).select('*');
        if (error) throw new Error(error.message);
        return camel(data);
      };
      const [profiles, subscriptions, payments, metrics] = await Promise.all(['profiles', 'subscriptions', 'payments', 'store_metrics'].map(pick));
      return { profiles, subscriptions, payments, metrics };
    },
  };
}

function loadPortOne() {
  return new Promise((resolve, reject) => {
    if (window.PortOne) return resolve(window.PortOne);
    const s = document.createElement('script');
    s.src = 'https://cdn.portone.io/v2/browser-sdk.js';
    s.onload = () => resolve(window.PortOne);
    s.onerror = () => reject(new Error('결제 모듈을 불러오지 못했습니다. 잠시 뒤 다시 시도해 주세요.'));
    document.head.append(s);
  });
}
