// site.config.mjs 읽기·검증, 그리고 사이트 주소 계산 도우미.
import { pathToFileURL } from 'node:url';

/** 사용자가 고칠 수 있는 설정 오류 (스택 없이 메시지만 보여 줌) */
export class ConfigError extends Error {}

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '0.0.0.0']);

const str = (v) => (v === undefined || v === null ? '' : String(v).trim());
const arr = (v) => (Array.isArray(v) ? v : v ? [v] : []);

export async function loadConfig(file) {
  let mod;
  try {
    mod = await import(pathToFileURL(file).href);
  } catch (err) {
    throw new ConfigError(`설정 파일을 읽을 수 없습니다: ${file}\n  ${err.message}`);
  }
  return normalizeConfig(mod.default ?? {});
}

export function normalizeConfig(raw) {
  const v = raw.verification ?? {};
  const a = raw.analytics ?? {};
  const n = raw.indexNow ?? {};
  const siteName = str(raw.siteName);
  const config = {
    siteUrl: str(raw.siteUrl),
    siteName,
    alternateNames: arr(raw.alternateNames).map(str).filter(Boolean),
    language: str(raw.language) || 'ko',
    locale: str(raw.locale) || 'ko_KR',
    ogImage: str(raw.ogImage),
    themeColor: str(raw.themeColor),
    verification: {
      google: cleanVerification(v.google, 'google'),
      naver: cleanVerification(v.naver, 'naver'),
      bing: cleanVerification(v.bing, 'bing'),
      daum: cleanDaum(v.daum),
    },
    business: normalizeBusiness(raw.business ?? {}, siteName),
    analytics: {
      ga4: cleanId(a.ga4, /^G-[A-Z0-9]{4,}$/, 'analytics.ga4', "'G-'로 시작하는 측정 ID"),
      naver: cleanId(a.naver, /^[a-zA-Z0-9]{6,}$/, 'analytics.naver', '영문·숫자로 된 사이트 ID'),
    },
    indexNow: {
      enabled: n.enabled !== false && Boolean(str(n.key)),
      key: str(n.key),
      endpoints: arr(n.endpoints).map(str).filter(Boolean),
    },
  };
  if (config.indexNow.key && !/^[a-zA-Z0-9-]{8,128}$/.test(config.indexNow.key)) {
    throw new ConfigError('indexNow.key는 영문·숫자·하이픈으로 된 8~128자여야 합니다.');
  }
  for (const e of config.indexNow.endpoints) {
    if (!/^https:\/\//.test(e)) throw new ConfigError(`indexNow.endpoints 주소가 올바르지 않습니다: ${e}`);
  }
  return config;
}

/** 발급받은 <meta> 태그를 통째로 붙여넣어도 content 값만 골라냅니다. */
export function cleanVerification(value, label) {
  let s = str(value);
  if (!s) return '';
  const m = /content\s*=\s*["']([^"']*)["']/i.exec(s);
  if (m) s = m[1].trim();
  if (!/^[A-Za-z0-9_\-.:+/=]+$/.test(s)) {
    throw new ConfigError(
      `verification.${label} 값이 올바르지 않습니다: "${value}"\n  발급받은 <meta> 태그의 content="..." 안의 값만 넣어 주세요.`,
    );
  }
  return s;
}

function cleanDaum(value) {
  let s = str(value);
  if (!s) return '';
  s = s.replace(/^#?\s*DaumWebMasterTool\s*:\s*/i, '');
  if (!/^[A-Za-z0-9_\-:+/=]+$/.test(s)) {
    throw new ConfigError(`verification.daum 값이 올바르지 않습니다: "${value}" — 다음 웹마스터도구가 준 PIN 코드를 그대로 넣어 주세요.`);
  }
  return `#DaumWebMasterTool:${s}`;
}

function cleanId(value, pattern, label, hint) {
  const s = str(value);
  if (s && !pattern.test(s)) throw new ConfigError(`${label} 값이 올바르지 않습니다: "${s}" (${hint})`);
  return s;
}

const DAYS = {
  mo: 'Monday', tu: 'Tuesday', we: 'Wednesday', th: 'Thursday', fr: 'Friday', sa: 'Saturday', su: 'Sunday',
  월: 'Monday', 화: 'Tuesday', 수: 'Wednesday', 목: 'Thursday', 금: 'Friday', 토: 'Saturday', 일: 'Sunday',
};

function dayName(d) {
  const s = str(d);
  const k = s.toLowerCase();
  if (DAYS[k]) return DAYS[k];
  if (/^[a-z]{2,}$/.test(k) && DAYS[k.slice(0, 2)]) return DAYS[k.slice(0, 2)]; // Mon, monday
  if (/^[월화수목금토일]요일$/.test(s)) return DAYS[s[0]];
  throw new ConfigError(`business.openingHours의 요일을 알 수 없습니다: "${d}" (예: '월' 또는 'Mo')`);
}

function time(t, label) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(str(t));
  if (!m || Number(m[1]) > 24 || Number(m[2]) > 59) {
    throw new ConfigError(`business.openingHours의 ${label} 시간 형식이 올바르지 않습니다: "${t}" (예: '10:00')`);
  }
  return `${m[1].padStart(2, '0')}:${m[2]}`;
}

function normalizeBusiness(b, siteName) {
  const addr = b.address ?? {};
  const geo = b.geo ?? {};
  const sameAs = arr(b.sameAs).map(str).filter(Boolean);
  for (const url of sameAs) {
    if (!/^https?:\/\//.test(url)) throw new ConfigError(`business.sameAs에는 전체 주소(https://...)를 넣어 주세요: ${url}`);
  }
  return {
    type: str(b.type) || 'Organization',
    name: str(b.name) || siteName,
    description: str(b.description),
    logo: str(b.logo),
    image: str(b.image),
    telephone: str(b.telephone),
    email: str(b.email),
    priceRange: str(b.priceRange),
    address: {
      streetAddress: str(addr.streetAddress),
      addressLocality: str(addr.addressLocality),
      addressRegion: str(addr.addressRegion),
      postalCode: str(addr.postalCode),
      addressCountry: str(addr.addressCountry) || 'KR',
    },
    geo: { latitude: str(geo.latitude), longitude: str(geo.longitude) },
    openingHours: arr(b.openingHours).map((h) => ({
      days: arr(h.days).map(dayName),
      opens: time(h.opens, '시작'),
      closes: time(h.closes, '종료'),
    })),
    sameAs,
  };
}

// ── 사이트 주소 ──────────────────────────────────────────────────────────────

/** 'about/index.html' → 'about/',  'index.html' → '',  'event.html' → 'event.html' */
export function pageRel(rel) {
  if (rel === 'index.html') return '';
  if (rel.endsWith('/index.html')) return rel.slice(0, -'index.html'.length);
  return rel;
}

export const encodePath = (p) => p.split('/').map(encodeURIComponent).join('/');

/**
 * 배포 주소 하나로 필요한 계산을 모두 제공합니다.
 *  basePath  : '/retenfit/' (프로젝트 사이트) 또는 '/' (자체 도메인·사용자 사이트)
 *  withBase  : '/about/' → '/retenfit/about/'  (루트 기준 링크에 하위 경로 붙이기)
 *  abs       : '/assets/og.png' → 'https://.../retenfit/assets/og.png'
 */
export function makeSite(rawUrl) {
  let u;
  try {
    u = new URL(str(rawUrl));
  } catch {
    throw new ConfigError(`사이트 주소가 올바르지 않습니다: "${rawUrl}" (예: https://아이디.github.io/retenfit/)`);
  }
  if (!/^https?:$/.test(u.protocol)) throw new ConfigError(`사이트 주소는 http(s)로 시작해야 합니다: ${rawUrl}`);
  const isLocal = LOCAL_HOSTS.has(u.hostname);
  if (u.protocol === 'http:' && !isLocal) u.protocol = 'https:'; // GitHub Pages는 HTTPS 제공
  u.search = '';
  u.hash = '';
  if (!u.pathname.endsWith('/')) u.pathname += '/';
  const basePath = u.pathname;

  const withBase = (p) => {
    if (typeof p !== 'string' || basePath === '/') return p;
    if (!p.startsWith('/') || p.startsWith('//')) return p;
    if (p === basePath.slice(0, -1) || p.startsWith(basePath)) return p; // 이미 붙어 있음
    return basePath + p.slice(1);
  };
  const abs = (p) => {
    if (p.startsWith('//')) return u.protocol + p;
    if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(p)) return p;
    if (p.startsWith('/')) return u.origin + withBase(p);
    return new URL(p, u).href;
  };
  return {
    url: u.href,
    origin: u.origin,
    host: u.host,
    basePath,
    isLocal,
    withBase,
    abs,
    pageUrl: (rel) => u.href + encodePath(pageRel(rel)),
  };
}
