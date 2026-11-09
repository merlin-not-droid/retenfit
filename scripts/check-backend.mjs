#!/usr/bin/env node
// 결제·로그인 연결 점검 — 비밀값 없이, src/assets/js/backend-config.js 의 공개 값만으로 확인할 수 있는 것을 봅니다.
//
//   node scripts/check-backend.mjs
//
// 확인: Supabase 주소·공개 키 형식, 카카오 로그인 켜짐, DB 테이블 생성(마이그레이션), 서버 함수 3개 배포, PortOne 공개 값 형식
// 확인 못 함(대시보드에서 직접): 리디렉션 주소 목록, 비밀값(Secrets) 내용, 정기결제 예약(pg_cron), 운영자 등록
import config from '../src/assets/js/backend-config.js';

const results = [];
const ok = (msg) => results.push(['✔', msg]);
const bad = (msg, next) => results.push(['✖', msg, next]);
const info = (msg, next) => results.push(['ℹ', msg, next]);

async function get(url, init = {}) {
  try {
    const res = await fetch(url, { ...init, signal: AbortSignal.timeout(15000) });
    const text = await res.text();
    let body = null;
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
    return { status: res.status, body };
  } catch (e) {
    return { status: 0, body: String(e.message ?? e) };
  }
}

async function main() {
  if (config.mode !== 'supabase') {
    info(`mode가 '${config.mode}'입니다. 실제 연결을 확인하려면 'supabase'로 바꾸세요.`, 'src/assets/js/backend-config.js');
  }
  const url = String(config.supabaseUrl ?? '').replace(/\/+$/, '');
  const key = String(config.supabaseAnonKey ?? '');
  const ref = /^https:\/\/([a-z0-9]{20})\.supabase\.co$/.exec(url)?.[1];
  if (ref) ok(`Supabase 주소: ${url}`);
  else bad('Supabase 주소가 비었거나 형식이 다릅니다(https://프로젝트ID.supabase.co).', 'Supabase → Project Settings → API의 Project URL');
  const keyKind = key.startsWith('sb_publishable_') ? 'publishable' : /^ey[\w-]+\.[\w-]+\.[\w-]+$/.test(key) ? 'anon(JWT)' : null;
  if (key.startsWith('sb_secret_') || /service_role/.test(Buffer.from(key.split('.')[1] ?? '', 'base64').toString())) {
    bad('공개 키 자리에 비밀 키(service_role/secret)가 들어 있습니다. 즉시 지우고, 대시보드에서 그 키를 재발급하세요.', '공개용 anon 또는 publishable 키만 넣습니다');
    return;
  }
  if (keyKind) ok(`공개 키 형식: ${keyKind}`);
  else bad('공개 키(anon public 또는 sb_publishable_…)가 비었거나 형식이 다릅니다.', 'Supabase → Project Settings → API Keys');

  if (ref && keyKind) {
    const h = { apikey: key, ...(keyKind === 'anon(JWT)' ? { Authorization: `Bearer ${key}` } : {}) };
    const settings = await get(`${url}/auth/v1/settings`, { headers: h });
    if (settings.status === 200 && settings.body?.external) {
      if (settings.body.external.kakao) ok('카카오 로그인 공급자: 켜짐');
      else bad('카카오 로그인 공급자가 꺼져 있습니다.', 'Supabase → Authentication → Sign In / Providers → Kakao (REST API 키·Client Secret 입력)');
    } else bad(`인증 설정을 읽지 못했습니다(HTTP ${settings.status}).`, '주소·공개 키를 다시 확인하세요');

    for (const table of ['profiles', 'subscriptions', 'payments', 'store_metrics', 'admins', 'billing_keys']) {
      const r = await get(`${url}/rest/v1/${table}?select=user_id&limit=1`, { headers: h });
      if (r.status === 200) ok(`테이블 ${table}: 있음${Array.isArray(r.body) && r.body.length ? ' — ⚠ 로그인 없이 행이 보입니다(보안 정책 확인)' : ''}`);
      else if (r.status === 401 || r.status === 403) ok(`테이블 ${table}: 있음(로그인 없이는 접근 불가)`);
      else bad(`테이블 ${table}: 없음(HTTP ${r.status})`, 'SQL 편집기에서 supabase/migrations/20261108000000_billing.sql 실행');
    }

    const fn = async (name, expect) => {
      const r = await get(`${url}/functions/v1/${name}`, { method: 'POST', headers: { ...h, 'content-type': 'application/json' }, body: '{}' });
      if (r.status === 404 || r.status === 0) bad(`서버 함수 ${name}: 배포 안 됨(HTTP ${r.status})`, `npx supabase@3.0.0 functions deploy ${name} --remote=${ref} --use-api --no-verify-jwt --yes`);
      else ok(`서버 함수 ${name}: 배포됨(로그인·서명 없이 호출 → HTTP ${r.status}${expect.includes(r.status) ? '' : ', 예상과 다름'})`);
    };
    await fn('billing', [401]);
    await fn('renew', [403]);
    await fn('portone-webhook', [401]);
  }

  const { storeId = '', channelKey = '' } = config.portone ?? {};
  if (storeId.startsWith('store-')) ok(`PortOne 상점 ID: ${storeId.slice(0, 12)}…`);
  else bad('PortOne 상점 ID가 비었거나 형식이 다릅니다(store-…).', 'PortOne 콘솔 → 상점·계정 관리');
  if (channelKey.startsWith('channel-key-')) ok('PortOne 채널 키: 있음');
  else bad('PortOne 채널 키가 비었거나 형식이 다릅니다(channel-key-…).', 'PortOne 콘솔 → 결제 연동 → 채널 관리(정기결제 지원 PG)');

  info('대시보드에서 직접 확인: Auth Redirect URLs(…/retenfit/**), Edge Function Secrets(PORTONE_API_SECRET·PORTONE_WEBHOOK_SECRET·CRON_SECRET·SITE_ORIGIN), pg_cron 예약, 운영자 등록');
}

await main();
for (const [mark, msg, next] of results) console.log(`${mark} ${msg}${next ? `\n    → ${next}` : ''}`);
const failed = results.filter((r) => r[0] === '✖').length;
console.log(`\n${failed ? `남은 항목 ${failed}개` : '확인 가능한 항목은 모두 통과했습니다.'}`);
process.exitCode = config.mode === 'supabase' && failed ? 1 : 0;
