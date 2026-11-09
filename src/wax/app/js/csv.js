// CSV 읽기·쓰기 (엑셀 호환)
//  - 읽기: BOM 제거, 따옴표 안의 쉼표·줄바꿈 처리, CRLF/LF 모두
//  - 쓰기: UTF-8 BOM을 붙여 엑셀에서 한글이 깨지지 않게, 수식 주입(=, +, -, @로 시작하는 글자) 방지

export function parseCsv(text) {
  const src = String(text ?? '').replace(/^﻿/, '');
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < src.length; i += 1) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"' && field === '') {
      quoted = true;
    } else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += c;
    }
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

const NEEDS_QUOTE = /[",\r\n]/;
const FORMULA = /^[=+\-@\t\r]/;

export function csvCell(value) {
  if (value === null || value === undefined) return '';
  let s = typeof value === 'number' ? String(value) : String(value);
  if (typeof value !== 'number' && FORMULA.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`;
  return NEEDS_QUOTE.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows, { bom = true } = {}) {
  return (bom ? '﻿' : '') + rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

/** '60,000원' · ' 60000 ' · '₩60,000' → 60000 (숫자가 아니면 NaN, 비어 있으면 null) */
export function parseAmount(input) {
  const s = String(input ?? '').trim();
  if (!s) return null;
  const cleaned = s.replace(/[₩원,\s]/g, '');
  return /^-?\d+(\.\d+)?$/.test(cleaned) ? Number(cleaned) : NaN;
}
