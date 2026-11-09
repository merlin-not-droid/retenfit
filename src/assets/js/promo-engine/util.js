// 자동 생성 — 직접 고치지 마세요. promo-engine/src/util.ts를 고친 뒤 scripts/build-browser.mjs로 다시 만듭니다.
export const clamp = (x        , lo = 0, hi = 1)         => Math.min(hi, Math.max(lo, x));

export const pct = (x        , digits = 0)         => `${(x * 100).toFixed(digits)}%`;

/** 원 단위 금액을 사장님이 읽기 쉬운 문자열로 */
export function fmtWon(x        )         {
  const sign = x < 0 ? '-' : '';
  const a = Math.abs(x);
  if (a >= 10000) return `${sign}${(Math.round(a / 1000) / 10).toLocaleString('ko-KR')}만원`;
  return `${sign}${(Math.round(a / 100) * 100).toLocaleString('ko-KR')}원`;
}

/** 문자열 → 32bit 시드 (FNV-1a) */
export function hashString(s        )         {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** 재현 가능한 난수 (mulberry32) */
export function rng(seed        )               {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 표준정규 난수 (Box–Muller) */
export function normal(r              )         {
  const u = Math.max(r(), 1e-12);
  const v = r();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
