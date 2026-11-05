// sitemap.xml · robots.txt 만들기와 읽기
const xmlEscape = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
const xmlUnescape = (s) =>
  String(s).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');

/** entries: [{ loc, lastmod? }] */
export function renderSitemap(entries) {
  const urls = entries.map((e) =>
    [
      '  <url>',
      `    <loc>${xmlEscape(e.loc)}</loc>`,
      ...(e.lastmod ? [`    <lastmod>${xmlEscape(e.lastmod)}</lastmod>`] : []),
      '  </url>',
    ].join('\n'),
  );
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls,
    '</urlset>',
    '',
  ].join('\n');
}

/** sitemap.xml → Map(주소 → lastmod 또는 '') */
export function parseSitemap(xml) {
  const map = new Map();
  for (const m of String(xml ?? '').matchAll(/<url>([\s\S]*?)<\/url>/gi)) {
    const loc = /<loc>\s*([\s\S]*?)\s*<\/loc>/i.exec(m[1]);
    if (!loc) continue;
    const lastmod = /<lastmod>\s*([\s\S]*?)\s*<\/lastmod>/i.exec(m[1]);
    map.set(xmlUnescape(loc[1]), lastmod ? xmlUnescape(lastmod[1]) : '');
  }
  return map;
}

/**
 * 지금 배포된 sitemap과 새 sitemap을 비교해 검색엔진에 알릴 주소를 고릅니다.
 *  changed: 새로 생겼거나 lastmod(마지막 커밋 시각)가 바뀐 페이지
 *  removed: 사라진 페이지 (IndexNow는 삭제된 주소 알림도 받습니다)
 */
export function diffSitemaps(previousXml, nextXml) {
  const prev = parseSitemap(previousXml);
  const next = parseSitemap(nextXml);
  const changed = [];
  for (const [loc, lastmod] of next) {
    if (!prev.has(loc) || (lastmod && prev.get(loc) !== lastmod)) changed.push(loc);
  }
  const removed = [...prev.keys()].filter((loc) => !next.has(loc));
  return { changed, removed };
}

export function renderRobots({ sitemapUrl, extraLines = [] }) {
  return [
    '# 자동 생성 파일입니다 (scripts/build.mjs). 직접 관리하려면 src/robots.txt를 만드세요.',
    'User-agent: *',
    'Allow: /',
    '',
    `Sitemap: ${sitemapUrl}`,
    ...(extraLines.length ? ['', ...extraLines] : []),
    '',
  ].join('\n');
}
