// 날짜는 'YYYY-MM-DD' 문자열로 다룹니다. 계산은 UTC 날짜 기준이라 시간대 영향을 받지 않습니다.
const DAY = 86400000;
const pad = (n) => String(n).padStart(2, '0');

export function isValidYmd(y, m, d) {
  if (!(y >= 1900 && y <= 2200 && m >= 1 && m <= 12 && d >= 1)) return false;
  return d <= new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** '2026-01-05' · '2026.1.5' · '2026. 1. 5.' · '2026/01/05' · '20260105' → '2026-01-05' (아니면 null) */
export function parseDate(input) {
  const s = String(input ?? '').trim();
  let m = /^(\d{4})\s*[-./]\s*(\d{1,2})\s*[-./]\s*(\d{1,2})\.?$/.exec(s) || /^(\d{4})(\d{2})(\d{2})$/.exec(s);
  if (!m) {
    m = /^(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일$/.exec(s);
  }
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  return isValidYmd(y, mo, d) ? `${y}-${pad(mo)}-${pad(d)}` : null;
}

export const toDays = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y, m - 1, d) / DAY;
};

export const fromDays = (n) => {
  const dt = new Date(n * DAY);
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
};

export const addDays = (iso, n) => fromDays(toDays(iso) + n);
export const diffDays = (from, to) => toDays(to) - toDays(from);
export const monthOf = (iso) => iso.slice(0, 7);

/** 사용 중인 기기의 오늘 날짜 */
export function today(now = new Date()) {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** '2026-03-07' → '3월 7일' (올해가 아니면 '2025년 3월 7일') */
export function formatDate(iso, base = today()) {
  if (!iso) return '–';
  const [y, m, d] = iso.split('-').map(Number);
  return y === Number(base.slice(0, 4)) ? `${m}월 ${d}일` : `${y}년 ${m}월 ${d}일`;
}

export function dday(daysLeft) {
  if (daysLeft === 0) return 'D-day';
  return daysLeft > 0 ? `D-${daysLeft}` : `D+${-daysLeft}`;
}
