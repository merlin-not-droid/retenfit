// 구독 확인과 매장 집계 숫자 올리기 — 결제 서버가 연결된 경우에만(backend-config.js mode가 'off'면 아무것도 하지 않음)
//
// 손님 기록(이름·연락처·방문일)은 이 기기에만 남고, 서버에는 손님 개인정보가 없는 매장 집계 숫자만 하루 한 번 올라갑니다.
// 주의: 정적 사이트라 이 확인은 화면 단계의 안내입니다. 진짜 보호가 필요한 데이터는 서버(RLS)가 지킵니다.
import { backend, mode } from '../../assets/js/backend.js';
import { TRADE_AREA_LABEL } from './recommend.js';

const SYNC_KEY = 'waxfit:last-sync';
const round = (x, d) => (Number.isFinite(x) ? Math.round(x * 10 ** d) / 10 ** d : null);

export const backendMode = mode;

/** 앱을 열어도 되는지: { ok } 또는 { ok:false, reason:'login'|'subscribe' } */
export async function checkAccess() {
  if (mode === 'off') return { ok: true };
  const be = await backend();
  const user = await be.session();
  if (!user) return { ok: false, reason: 'login' };
  const st = await be.status();
  return st.access ? { ok: true, user, status: st } : { ok: false, reason: 'subscribe', user, status: st };
}

/** 서버로 보내는 매장 집계 숫자(손님 개인정보 없음) */
export function metricsSnapshot(state, rec) {
  const s = rec.store;
  const f = s.funnel;
  return {
    shopName: state.settings.shopName || '',
    tradeArea: s.tradeArea,
    tradeAreaLabel: TRADE_AREA_LABEL[s.tradeArea] ?? '',
    pricePosition: s.pricePosition,
    monthsOpen: s.monthsOpen,
    staffCount: s.staffCount,
    customers: state.customers.length,
    visits: state.visits.length,
    newPerMonth: round(f.newPerMonth, 1),
    secondVisitRate: round(f.secondVisitRate, 3),
    regularRate: round(f.regularRate, 3),
    activeRegulars: f.activeRegulars,
    overdueShare: round(f.overdueShare, 3),
    lapsedCount: f.lapsedCount,
    avgIntervalDays: round(f.avgIntervalDays, 1),
    avgTicket: Math.round(s.avgTicket),
    maleShare: round(s.maleShare, 3),
    consentRate: round(s.marketingConsentRate, 3),
    plan: rec.plan.selected.map((e) => ({ id: e.device.id, level: e.recommended.level })),
    experiments: rec.results,
  };
}

/** 하루 한 번만. 샘플 데이터는 올리지 않음 */
export async function syncOncePerDay(app) {
  if (mode === 'off' || app.state.meta.demo || !app.state.visits.length) return false;
  try {
    if (localStorage.getItem(SYNC_KEY) === app.today) return false;
  } catch {
    /* 저장소를 못 쓰면 매번 시도 */
  }
  const be = await backend();
  if (!(await be.session())) return false;
  const ok = await be.syncMetrics(metricsSnapshot(app.state, app.recommendation()));
  if (ok) {
    try {
      localStorage.setItem(SYNC_KEY, app.today);
    } catch {
      /* 무시 */
    }
  }
  return ok;
}
