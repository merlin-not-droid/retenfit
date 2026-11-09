// 페이지 한 장을 "검색엔진이 읽기 좋은 상태"로 만드는 처리.
//  1) 루트 기준 링크(/about/)에 하위 경로(/retenfit/) 붙이기
//  2) <html lang> 보장
//  3) <head>에 빠진 태그만 채우기 — canonical, Open Graph, 소유 확인, JSON-LD, 통계
import {
  collectTags,
  extractTitle,
  insertAt,
  jsonLdBlocks,
  relHas,
  safeJson,
  serializeTag,
  transform,
  escapeAttr,
} from './html.mjs';

const URL_ATTRS = new Set([
  'href', 'src', 'poster', 'action', 'formaction', 'data', 'xlink:href',
  'data-src', 'data-href', 'data-bg', 'data-background',
]);
const SRCSET_ATTRS = new Set(['srcset', 'data-srcset', 'imagesrcset']);
const ABSOLUTE_META = new Set(['og:image', 'og:image:url', 'og:image:secure_url', 'og:url', 'twitter:image']);

export function rewriteSrcset(value, fn) {
  return value
    .split(',')
    .map((part) => {
      const m = /^(\s*)(\S+)([\s\S]*)$/.exec(part);
      return m ? m[1] + fn(m[2]) + m[3] : part;
    })
    .join(',');
}

export function rewriteCssUrls(css, fn) {
  return css
    .replace(/url\(\s*(['"]?)([^'")]+?)\1\s*\)/gi, (m, q, u) => `url(${q}${fn(u)}${q})`)
    .replace(/@import\s+(['"])([^'"]+)\1/gi, (m, q, u) => `@import ${q}${fn(u)}${q}`);
}

/** 루트 기준 URL에 하위 경로를 붙이고, 공유용 메타·canonical은 절대 주소로 바꿉니다. */
export function rewriteUrls(html, site, pageUrl) {
  return transform(html, {
    tag(node) {
      const set = {};
      for (const a of node.attrs) {
        if (a.value === null) continue;
        if (URL_ATTRS.has(a.lower)) {
          const v = site.withBase(a.value);
          if (v !== a.value) set[a.lower] = v;
        } else if (SRCSET_ATTRS.has(a.lower)) {
          const v = rewriteSrcset(a.value, site.withBase);
          if (v !== a.value) set[a.lower] = v;
        } else if (a.lower === 'style') {
          const v = rewriteCssUrls(a.value, site.withBase);
          if (v !== a.value) set.style = v;
        }
      }
      if (node.lower === 'meta') {
        const key = (node.get('property') || node.get('name') || '').toLowerCase();
        const content = node.get('content');
        if (ABSOLUTE_META.has(key) && content && !/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(content)) {
          set.content = content.startsWith('/') ? site.abs(content) : new URL(content, pageUrl).href;
        }
      }
      if (node.lower === 'link' && relHas(node, 'canonical')) {
        const href = set.href ?? node.get('href');
        if (href && !/^https?:/i.test(href)) set.href = new URL(href, pageUrl).href;
      }
      return Object.keys(set).length ? serializeTag(node, set) : undefined;
    },
    css: (css) => rewriteCssUrls(css, site.withBase),
  });
}

/** 페이지에 이미 있는 태그 정보 */
export function inspect(html) {
  const tags = collectTags(html);
  const metas = tags.filter((t) => t.lower === 'meta');
  const metaNode = (key) => {
    const k = key.toLowerCase();
    return metas.find((t) => (t.get('name') || '').toLowerCase() === k || (t.get('property') || '').toLowerCase() === k);
  };
  const htmlTag = tags.find((t) => t.lower === 'html');
  const robots = ['robots', 'googlebot', 'yeti']
    .map((k) => metaNode(k)?.get('content') || '')
    .join(',')
    .toLowerCase();
  const canonicalNode = tags.find((t) => t.lower === 'link' && relHas(t, 'canonical'));
  return {
    tags,
    hasHead: tags.some((t) => t.lower === 'head'),
    hasHtml: Boolean(htmlTag),
    lang: htmlTag?.get('lang'),
    charset: metas.some((t) => t.has('charset') || (t.get('http-equiv') || '').toLowerCase() === 'content-type'),
    title: extractTitle(html),
    meta: (key) => metaNode(key)?.get('content'),
    hasMeta: (key) => Boolean(metaNode(key)),
    canonical: canonicalNode?.get('href'),
    icons: tags.filter((t) => t.lower === 'link' && /(^|\s)(icon|apple-touch-icon)(\s|$)/i.test(t.get('rel') || '')),
    jsonLd: jsonLdBlocks(html),
    robots,
    noindex: /\b(noindex|none)\b/.test(robots),
  };
}

/** JSON-LD 블록들에 들어 있는 @type 목록 (@graph 포함, 잘못된 JSON은 무시 — 검사 단계에서 오류로 보고) */
export function jsonLdTypes(blocks) {
  const types = new Set();
  const visit = (node) => {
    if (Array.isArray(node)) return node.forEach(visit);
    if (!node || typeof node !== 'object') return;
    for (const t of [].concat(node['@type'] ?? [])) types.add(t);
    if (node['@graph']) visit(node['@graph']);
  };
  for (const block of blocks) {
    try {
      visit(JSON.parse(block));
    } catch {
      // 무시
    }
  }
  return types;
}

const DAY_ORDER = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/** 홈 페이지용 구조화 데이터: WebSite(사이트 이름) + 업체/브랜드 정보 */
export function buildJsonLd(config, site, homeDescription) {
  const b = config.business;
  const website = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: config.siteName || b.name,
    url: site.url,
    inLanguage: config.language,
  };
  if (config.alternateNames.length) website.alternateName = config.alternateNames;

  const org = {
    '@context': 'https://schema.org',
    '@type': b.type,
    '@id': `${site.url}#organization`,
    name: b.name,
    url: site.url,
  };
  if (config.alternateNames.length) org.alternateName = config.alternateNames;
  const description = b.description || homeDescription;
  if (description) org.description = description;
  if (b.logo) org.logo = site.abs(b.logo);
  const image = b.image || config.ogImage;
  if (image) org.image = site.abs(image);
  if (b.telephone) org.telephone = b.telephone;
  if (b.email) org.email = b.email;
  const { addressCountry, ...addressParts } = b.address;
  if (Object.values(addressParts).some(Boolean)) {
    org.address = { '@type': 'PostalAddress' };
    for (const [k, v] of Object.entries(b.address)) if (v) org.address[k] = v;
  }
  if (b.type !== 'Organization') {
    // 매장(LocalBusiness 계열)에만 의미가 있는 항목
    if (b.priceRange) org.priceRange = b.priceRange;
    if (b.geo.latitude && b.geo.longitude) {
      org.geo = { '@type': 'GeoCoordinates', latitude: Number(b.geo.latitude), longitude: Number(b.geo.longitude) };
    }
    if (b.openingHours.length) {
      org.openingHoursSpecification = b.openingHours.map((h) => ({
        '@type': 'OpeningHoursSpecification',
        dayOfWeek: [...new Set(h.days)].sort((x, y) => DAY_ORDER.indexOf(x) - DAY_ORDER.indexOf(y)),
        opens: h.opens,
        closes: h.closes,
      }));
    }
  }
  if (b.sameAs.length) org.sameAs = b.sameAs;
  return [website, org];
}

function analyticsTags(config) {
  const out = [];
  const { ga4, naver } = config.analytics;
  if (ga4) {
    out.push(
      `<script async src="https://www.googletagmanager.com/gtag/js?id=${ga4}"></script>`,
      `<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${ga4}');</script>`,
    );
  }
  if (naver) {
    out.push(
      '<script src="https://wcs.naver.net/wcslog.js"></script>',
      `<script>if(!window.wcs_add)window.wcs_add={};wcs_add["wa"]="${naver}";if(window.wcs){wcs_do();}</script>`,
    );
  }
  return out;
}

/**
 * 페이지 HTML을 처리합니다.
 * ctx: { site, config, rel, pageUrl, isHome, is404, icons }
 * 반환: { html, info } — info는 처리 후 페이지에서 다시 읽은 정보
 */
export function processPage(input, ctx) {
  const { site, config, pageUrl, isHome, is404 } = ctx;
  let html = rewriteUrls(input, site, pageUrl);

  // <html lang="ko">
  let langDone = false;
  html = transform(html, {
    tag(node) {
      if (langDone || node.lower !== 'html') return undefined;
      langDone = true;
      return node.has('lang') ? undefined : serializeTag(node, { lang: config.language });
    },
  });

  const info = inspect(html);
  if (!info.hasHead) return { html, info }; // 검사 단계에서 오류로 보고됩니다

  const top = [];
  const tags = [];
  if (!info.charset) top.push('<meta charset="utf-8">');
  if (!info.hasMeta('viewport')) top.push('<meta name="viewport" content="width=device-width, initial-scale=1">');

  if (is404) {
    if (!info.robots) tags.push('<meta name="robots" content="noindex">');
  } else {
    if (!info.canonical && !info.noindex) tags.push(`<link rel="canonical" href="${escapeAttr(pageUrl)}">`);
    const image = info.meta('og:image') || (config.ogImage ? site.abs(config.ogImage) : '');
    const og = [
      ['og:type', 'website'],
      ['og:site_name', config.siteName],
      ['og:locale', config.locale],
      ['og:title', info.title],
      ['og:description', info.meta('description')],
      ['og:url', info.canonical || pageUrl],
      ['og:image', image],
    ];
    for (const [k, v] of og) if (v && !info.hasMeta(k)) tags.push(`<meta property="${k}" content="${escapeAttr(v)}">`);
    if (!info.hasMeta('twitter:card')) {
      tags.push(`<meta name="twitter:card" content="${image ? 'summary_large_image' : 'summary'}">`);
    }
  }
  if (config.themeColor && !info.hasMeta('theme-color')) {
    tags.push(`<meta name="theme-color" content="${escapeAttr(config.themeColor)}">`);
  }
  if (!info.icons.length) {
    for (const icon of ctx.icons ?? []) {
      const extra = Object.entries(icon.attrs ?? {})
        .filter(([, v]) => v)
        .map(([k, v]) => ` ${k}="${escapeAttr(v)}"`)
        .join('');
      tags.push(`<link rel="${icon.rel}" href="${escapeAttr(site.withBase(icon.href))}"${extra}>`);
    }
  }
  if (isHome) {
    const v = config.verification;
    const verify = [
      ['google-site-verification', v.google],
      ['naver-site-verification', v.naver],
      ['msvalidate.01', v.bing],
    ];
    for (const [name, value] of verify) {
      if (value && !info.hasMeta(name)) tags.push(`<meta name="${name}" content="${escapeAttr(value)}">`);
    }
    // 페이지에 직접 넣은 JSON-LD와 같은 @type은 건너뜀 (예: 직접 쓴 Organization이 있으면 자동 생성 안 함)
    const existing = jsonLdTypes(info.jsonLd);
    const hasBusiness = ['Organization', 'LocalBusiness', config.business.type].some((t) => existing.has(t));
    const [website, business] = buildJsonLd(config, site, info.meta('description'));
    for (const obj of [existing.has('WebSite') ? null : website, hasBusiness ? null : business]) {
      if (obj) tags.push(`<script type="application/ld+json">\n${safeJson(obj)}\n</script>`);
    }
  }
  tags.push(...analyticsTags(config));

  if (top.length) {
    html = insertAt(html, /<head(?=[\s>])[^>]*>/i, `\n${top.join('\n')}`, 'after') ?? html;
  }
  if (tags.length) {
    const block = `<!-- 자동 생성: scripts/build.mjs (site.config.mjs) -->\n${tags.join('\n')}\n`;
    html = insertAt(html, /<\/head\s*>/i, block, 'before') ?? html;
  }
  return { html, info: inspect(html) };
}
