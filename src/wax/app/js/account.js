// 왁싱샵 앱 → 서버로 보내는 매장 집계 숫자(손님 개인정보 없음). 구독 확인은 assets/js/access.js
import { syncDaily } from '../../../assets/js/access.js';
import { TRADE_AREA_LABEL } from './recommend.js';

const SYNC_KEY = 'waxfit:last-sync'; // 저장소 키는 기존 사용자 기록을 지키려고 그대로 둡니다
const round = (x, d) => (Number.isFinite(x) ? Math.round(x * 10 ** d) / 10 ** d : null);

/** 서버로 보내는 매장 집계 숫자(손님 개인정보 없음) */
export function metricsSnapshot(state, rec) {
  const s = rec.store;
  const f = s.funnel;
  return {
    service: 'wax',
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
  if (app.state.meta.demo || !app.state.visits.length) return false;
  return syncDaily({ key: SYNC_KEY, today: app.today, snapshot: () => metricsSnapshot(app.state, app.recommendation()) });
}
