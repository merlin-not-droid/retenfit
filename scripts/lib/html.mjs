// 의존성 없는 작은 HTML 도구 모음.
//
// 완전한 HTML 파서는 아니지만, 정상적으로 작성된 정적 페이지를 읽고
// 태그 속성을 안전하게 고치는 데 필요한 만큼은 정확하게 처리합니다.
//  - 주석과 <script>·<style>·<textarea> 내용은 "마크업"과 분리해서 다룹니다.
//    (자바스크립트 문자열 안의 '<a href="/x">' 같은 것을 잘못 고치지 않도록)
//  - 속성 값의 따옴표 세 가지(", ', 없음)를 모두 처리합니다.
//  - 고친 태그만 다시 쓰고, 나머지 원문은 한 글자도 바꾸지 않습니다.

const RAW_TEXT = 'script|style|textarea';
// (?=[\s/>]) : <style-guide> 같은 사용자 정의 태그를 <style>로 착각하지 않도록
const SEGMENT_SOURCE = `<!--[\\s\\S]*?(?:-->|$)|<(${RAW_TEXT})(?=[\\s/>])(?:"[^"]*"|'[^']*'|[^'">])*>`;

// <태그이름 속성들 /?>  — 따옴표 안의 '>'도 안전하게 건너뜁니다.
const TAG_SOURCE =
  '<([a-zA-Z][a-zA-Z0-9:-]*)((?:\\s+[^\\s"\'<>\\/=]+(?:\\s*=\\s*(?:"[^"]*"|\'[^\']*\'|[^\\s"\'=<>`]+))?)*)\\s*(\\/?)>';
const ATTR_SOURCE = '([^\\s"\'<>\\/=]+)(?:\\s*=\\s*(?:"([^"]*)"|\'([^\']*)\'|([^\\s"\'=<>`]+)))?';

/**
 * HTML을 조각으로 나눕니다.
 *  - markup : 일반 마크업 (태그와 텍스트)
 *  - comment: <!-- 주석 -->
 *  - raw    : <script>/<style>/<textarea>의 내용 (여는·닫는 태그는 markup)
 */
export function segment(html) {
  const out = [];
  const re = new RegExp(SEGMENT_SOURCE, 'gi');
  let last = 0;
  let m;
  while ((m = re.exec(html))) {
    if (m.index > last) out.push({ type: 'markup', text: html.slice(last, m.index) });
    if (m[1] === undefined) {
      out.push({ type: 'comment', text: m[0] });
      last = re.lastIndex;
      continue;
    }
    const tag = m[1].toLowerCase();
    out.push({ type: 'markup', text: m[0] });
    const close = new RegExp(`</${tag}\\s*>`, 'gi');
    close.lastIndex = re.lastIndex;
    const c = close.exec(html);
    const contentEnd = c ? c.index : html.length;
    out.push({ type: 'raw', tag, openTag: m[0], text: html.slice(re.lastIndex, contentEnd) });
    if (c) out.push({ type: 'markup', text: c[0] });
    last = c ? close.lastIndex : html.length;
    re.lastIndex = last;
  }
  if (last < html.length) out.push({ type: 'markup', text: html.slice(last) });
  return out;
}

export const join = (segments) => segments.map((s) => s.text).join('');

export function parseAttrs(source) {
  const attrs = [];
  const re = new RegExp(ATTR_SOURCE, 'g');
  let m;
  while ((m = re.exec(source))) {
    const raw = m[2] ?? m[3] ?? m[4];
    attrs.push({ name: m[1], lower: m[1].toLowerCase(), value: raw === undefined ? null : decodeEntities(raw), raw: m[0] });
  }
  return attrs;
}

function makeNode(raw, name, attrSource, slash, index) {
  const attrs = parseAttrs(attrSource);
  return {
    raw,
    name,
    lower: name.toLowerCase(),
    attrs,
    selfClosing: slash === '/',
    index,
    /** 속성 값. 없으면 undefined, 값 없는 속성(예: async)이면 '' */
    get(attrName) {
      const a = attrs.find((x) => x.lower === attrName);
      if (!a) return undefined;
      return a.value ?? '';
    },
    has(attrName) {
      return attrs.some((x) => x.lower === attrName);
    },
  };
}

/** 마크업 조각 안의 모든 여는 태그를 순서대로 돌려줍니다. index는 원문 기준 위치입니다. */
export function collectTags(html) {
  const tags = [];
  let offset = 0;
  for (const s of segment(html)) {
    if (s.type === 'markup') {
      const re = new RegExp(TAG_SOURCE, 'g');
      let m;
      while ((m = re.exec(s.text))) tags.push(makeNode(m[0], m[1], m[2], m[3], offset + m.index));
    }
    offset += s.text.length;
  }
  return tags;
}

/**
 * 태그·CSS를 고칩니다.
 *  tag(node)  → 새 태그 문자열을 돌려주면 교체, undefined면 그대로
 *  css(text)  → <style> 내용 변환
 */
export function transform(html, { tag, css } = {}) {
  const segs = segment(html);
  for (const s of segs) {
    if (s.type === 'markup' && tag) {
      s.text = s.text.replace(new RegExp(TAG_SOURCE, 'g'), (raw, name, attrSource, slash) => {
        const replaced = tag(makeNode(raw, name, attrSource, slash, -1));
        return replaced === undefined ? raw : replaced;
      });
    } else if (s.type === 'raw' && s.tag === 'style' && css) {
      s.text = css(s.text);
    }
  }
  return join(segs);
}

/**
 * 태그를 다시 씁니다. set의 키는 소문자 속성 이름이고,
 * 값이 null이면 속성을 지우고, 기존에 없던 키는 끝에 추가합니다.
 * 바꾸지 않는 속성은 원문 그대로 둡니다.
 */
export function serializeTag(node, set = {}) {
  let out = `<${node.name}`;
  const done = new Set();
  for (const a of node.attrs) {
    if (Object.hasOwn(set, a.lower)) {
      done.add(a.lower);
      const v = set[a.lower];
      if (v === null) continue;
      out += ` ${a.name}="${escapeAttr(v)}"`;
    } else {
      out += ` ${a.raw}`;
    }
  }
  for (const [k, v] of Object.entries(set)) {
    if (!done.has(k) && v !== null) out += ` ${k}="${escapeAttr(v)}"`;
  }
  return out + (node.selfClosing ? ' />' : '>');
}

/** 마크업 조각에서 처음 일치하는 위치의 앞(before)이나 뒤(after)에 snippet을 넣습니다. 못 찾으면 null. */
export function insertAt(html, pattern, snippet, where) {
  const segs = segment(html);
  for (const s of segs) {
    if (s.type !== 'markup') continue;
    const m = new RegExp(pattern.source, pattern.flags.replace('g', '')).exec(s.text);
    if (!m) continue;
    const at = where === 'after' ? m.index + m[0].length : m.index;
    s.text = s.text.slice(0, at) + snippet + s.text.slice(at);
    return join(segs);
  }
  return null;
}

/** <head> 안쪽의 <title> 텍스트 (SVG 안의 <title>은 무시) */
export function extractTitle(html) {
  const markup = segment(html)
    .map((s) => (s.type === 'markup' ? s.text : ' '.repeat(s.text.length)))
    .join('');
  const headEnd = markup.search(/<\/head\s*>|<body\b/i);
  const head = headEnd === -1 ? markup : markup.slice(0, headEnd);
  const m = /<title\b[^>]*>([\s\S]*?)<\/title\s*>/i.exec(head);
  return m ? decodeEntities(m[1]).replace(/\s+/g, ' ').trim() : undefined;
}

/** 화면에 보이는 텍스트(대략). 주석·스크립트·스타일 제외 */
export function visibleText(html) {
  return decodeEntities(
    segment(html)
      .filter((s) => s.type === 'markup')
      .map((s) =>
        s.text
          .replace(new RegExp(TAG_SOURCE, 'g'), ' ')
          .replace(/<\/[a-zA-Z][^>]*>/g, ' ')
          .replace(/<![^>]*>/g, ' '),
      )
      .join(' '),
  )
    .replace(/\s+/g, ' ')
    .trim();
}

/** <script type="application/ld+json"> 내용들 */
export function jsonLdBlocks(html) {
  return segment(html)
    .filter((s) => s.type === 'raw' && s.tag === 'script' && /type\s*=\s*["']?application\/ld\+json/i.test(s.openTag))
    .map((s) => s.text);
}

const NAMED_ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0',
  middot: '·', copy: '©', reg: '®', trade: '™', hellip: '…', ndash: '–', mdash: '—',
  lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', laquo: '«', raquo: '»',
  times: '×', bull: '•', rarr: '→', larr: '←', uarr: '↑', darr: '↓', won: '₩',
};

export function decodeEntities(text) {
  return String(text).replace(/&(#[xX][0-9a-fA-F]+|#\d+|[a-zA-Z][a-zA-Z0-9]*);/g, (m, e) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      try {
        return String.fromCodePoint(code);
      } catch {
        return m;
      }
    }
    return NAMED_ENTITIES[e] ?? m;
  });
}

export const escapeAttr = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export const escapeText = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** <script> 안에 넣어도 안전한 JSON ('</script>' 차단) */
export const safeJson = (value) =>
  JSON.stringify(value, null, 2).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');

/** rel="a b c" 안에 특정 값이 있는지 */
export const relHas = (node, value) =>
  (node.get('rel') || '')
    .toLowerCase()
    .split(/\s+/)
    .includes(value);

/** 원문 위치 → 줄 번호 (1부터) */
export const lineOf = (text, index) => (index < 0 ? undefined : text.slice(0, index).split('\n').length);
