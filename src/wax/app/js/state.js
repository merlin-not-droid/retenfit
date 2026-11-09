// 앱 데이터: 이 기기의 브라우저(localStorage)에만 저장합니다. 서버로 보내지 않습니다.
import { addDays, diffDays, today } from './dates.js';

export const STORAGE_KEY = 'waxfit:v1';
export const GENDER_LABEL = { F: '여성', M: '남성', A: '공통' };

/** 시술 메뉴 예시 값 — 매장 설정에서 실제 가격으로 바꾸도록 안내 */
export function defaultMenu() {
  return [
    { id: 'm1', name: '브라질리언', gender: 'F', price: 70000, variableCost: 20000, cycleDays: 35 },
    { id: 'm2', name: '브라질리언', gender: 'M', price: 90000, variableCost: 25000, cycleDays: 35 },
    { id: 'm3', name: '겨드랑이', gender: 'A', price: 25000, variableCost: 6000, cycleDays: 28 },
    { id: 'm4', name: '다리 전체', gender: 'A', price: 70000, variableCost: 20000, cycleDays: 35 },
    { id: 'm5', name: '얼굴·인중', gender: 'A', price: 20000, variableCost: 5000, cycleDays: 21 },
    { id: 'm6', name: '가슴·배', gender: 'M', price: 50000, variableCost: 15000, cycleDays: 35 },
  ];
}

/** 매장 진단 기본값 — 방문 기록에 없는 매장 정보(이번 달 추천에 사용, 매장 설정에서 입력) */
export function defaultShop() {
  return {
    configured: false,
    tradeArea: 'residential',
    pricePosition: 'mid',
    openedOn: '',
    staffCount: 1,
    capacityPerMonth: 150,
    utilization: 0.6,
    offPeakSlack: 0.3,
    competitorDensity: 5,
    competitorDiscountIntensity: 1,
    reviewCount: 30,
    rating: 4.7,
    monthlyPromoBudget: 300000,
    prepaidOutstanding: 0,
    hasOnlineBooking: true,
  };
}

export function defaultState() {
  return {
    version: 1,
    settings: {
      shopName: '',
      shopContact: '',
      minContribution: 10000,
      windowDays: 60,
      assumedRevisitRate: 0.4,
      menuIsExample: true,
      menu: defaultMenu(),
      shop: defaultShop(),
    },
    customers: [],
    visits: [],
    plans: [],
    experiments: [],
    meta: { demo: false, lastBackupAt: null },
  };
}

function storage() {
  try {
    const s = window.localStorage;
    const probe = '__retenfit_probe__';
    s.setItem(probe, '1');
    s.removeItem(probe);
    return s;
  } catch {
    return null;
  }
}

/** 저장된 데이터 읽기. 저장소를 못 쓰면 persistent=false */
export function loadState() {
  const s = storage();
  const base = defaultState();
  if (!s) return { state: base, persistent: false };
  try {
    const raw = s.getItem(STORAGE_KEY);
    if (!raw) return { state: base, persistent: true };
    const saved = JSON.parse(raw);
    return {
      state: {
        ...base,
        ...saved,
        settings: { ...base.settings, ...saved.settings },
        meta: { ...base.meta, ...saved.meta },
      },
      persistent: true,
    };
  } catch {
    return { state: base, persistent: true, corrupted: true };
  }
}

export function saveState(state) {
  const s = storage();
  if (!s) return false;
  try {
    s.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

export function uid(prefix = 'v') {
  const rand = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID().slice(0, 8) : Math.random().toString(36).slice(2, 10);
  return `${prefix}_${Date.now().toString(36)}${rand}`;
}

/** 다음 고객 번호: C001, C002 … */
export function nextCustomerId(customers) {
  const max = customers.reduce((m, c) => {
    const n = /^C(\d+)$/.exec(c.id);
    return n ? Math.max(m, Number(n[1])) : m;
  }, 0);
  return `C${String(max + 1).padStart(3, '0')}`;
}

/** 손님 성별에 맞는 메뉴 항목 (성별 전용 → 공통 순) */
export function menuItem(settings, serviceName, gender) {
  const same = settings.menu.filter((m) => m.name === serviceName);
  return same.find((m) => m.gender === gender) ?? same.find((m) => m.gender === 'A') ?? same[0] ?? null;
}

export function menuFor(settings, gender) {
  return settings.menu.filter((m) => m.gender === gender || m.gender === 'A');
}

export const STATUS_LABEL = {
  none: '방문 기록 없음',
  scheduled: '예정',
  soon: '임박',
  overdue: '지남',
  dormant: '휴면',
};

/**
 * 다음 방문 예정일
 *  주기 = 손님 개인 주기 > 주 시술의 기본 주기 > 35일
 *  상태 = 예정(8일 이상 남음) · 임박(7일 이내) · 지남 · 휴면(주기의 2배 넘게 안 옴)
 */
export function nextVisitInfo(customer, visits, settings, base = today()) {
  const mine = visits.filter((v) => v.customerId === customer.id).sort((a, b) => a.date.localeCompare(b.date));
  const last = mine.at(-1);
  if (!last) return { status: 'none', visitCount: 0, totalPaid: 0, cycleDays: null };
  const service = customer.mainService || last.service;
  const cycleDays = Number(customer.cycleDays) || menuItem(settings, service, customer.gender)?.cycleDays || 35;
  const nextDate = addDays(last.date, cycleDays);
  const daysLeft = diffDays(base, nextDate);
  let status = 'scheduled';
  if (daysLeft < -cycleDays) status = 'dormant';
  else if (daysLeft < 0) status = 'overdue';
  else if (daysLeft <= 7) status = 'soon';
  return {
    status,
    firstDate: mine[0].date,
    lastDate: last.date,
    lastService: last.service,
    visitCount: mine.length,
    totalPaid: mine.reduce((s, v) => s + (Number(v.paid) || 0), 0),
    cycleDays,
    nextDate,
    daysLeft,
  };
}

/** 가져온 CSV 행을 고객·방문 기록에 합치기 */
export function mergeImported(state, records) {
  const byId = new Map(state.customers.map((c) => [c.id, c]));
  let newCustomers = 0;
  for (const r of records) {
    let c = byId.get(r.customerId);
    if (!c) {
      c = {
        id: r.customerId,
        alias: r.alias || r.customerId,
        gender: r.gender,
        mainService: r.service,
        cycleDays: null,
        phone: '',
        consent: { marketing: r.consent === true, at: r.consent === true ? r.date : null },
        memo: '',
      };
      byId.set(c.id, c);
      state.customers.push(c);
      newCustomers += 1;
    } else if (r.consent !== undefined && c.consent?.marketing !== r.consent) {
      c.consent = { marketing: r.consent, at: r.consent ? r.date : null };
    }
    state.visits.push({
      id: uid('v'),
      customerId: r.customerId,
      date: r.date,
      service: r.service,
      listPrice: r.listPrice,
      paid: r.paid,
      promotion: r.promotion,
      variableCost: r.variableCost,
    });
  }
  return { newCustomers, newVisits: records.length };
}
