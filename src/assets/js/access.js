// 대시보드 공통: 구독 확인과 하루 한 번 매장 집계 숫자 올리기
// 결제 서버가 연결된 경우에만 동작합니다(backend-config.js의 mode가 'off'면 아무것도 하지 않음).
//
// 손님 기록(이름·연락처·방문일)은 이 기기에만 남고, 서버에는 손님 개인정보가 없는 매장 집계 숫자만 올라갑니다.
// 주의: 정적 사이트라 이 확인은 화면 단계의 안내입니다. 진짜 보호가 필요한 데이터는 서버(RLS)가 지킵니다.
import { backend, mode } from './backend.js';

export const backendMode = mode;

/** 샘플 매장 미리보기: 주소에 ?demo=1. 구독 없이 열리고 아무것도 저장하지 않습니다 */
export const isDemo = () => new URLSearchParams(location.search).has('demo');

/** 앱을 열어도 되는지: { ok } 또는 { ok:false, reason:'login'|'subscribe' } */
export async function checkAccess() {
  if (mode === 'off') return { ok: true };
  const be = await backend();
  const user = await be.session();
  if (!user) return { ok: false, reason: 'login' };
  const st = await be.status();
  return st.access ? { ok: true, user, status: st } : { ok: false, reason: 'subscribe', user, status: st };
}

/** 하루 한 번만 올립니다. snapshot은 호출할 때 계산합니다 */
export async function syncDaily({ key, today, snapshot }) {
  if (mode === 'off') return false;
  try {
    if (localStorage.getItem(key) === today) return false;
  } catch {
    /* 저장소를 못 쓰면 매번 시도 */
  }
  const be = await backend();
  if (!(await be.session())) return false;
  const ok = await be.syncMetrics(snapshot());
  if (ok) {
    try {
      localStorage.setItem(key, today);
    } catch {
      /* 무시 */
    }
  }
  return ok;
}

/** 구독 전 안내 화면의 내용(두 업종 공통) */
export function gateCopy(reason) {
  return reason === 'login'
    ? { help: '구독한 카카오 계정으로 로그인하면 대시보드가 열립니다.', cta: '카카오로 로그인하기' }
    : { help: '첫 3개월 월 4,900원, 4개월째부터 월 8,900원(부가세 포함)입니다. 언제든 해지할 수 있습니다.', cta: '결제하기' };
}
