// 방문 기록 CSV 가져오기·내보내기와 검증
import { parseAmount, parseCsv, toCsv } from './csv.js';
import { parseDate, today } from './dates.js';

export const COLUMNS = [
  { key: 'customerId', label: '고객ID', required: true, aliases: ['고객id', '고객 id', '고객번호', '고객 번호', 'customerid', 'customer_id', 'id'] },
  { key: 'alias', label: '별칭', aliases: ['이름', '고객명', '이름/별칭', '닉네임', 'alias', 'name'] },
  { key: 'gender', label: '성별', required: true, aliases: ['gender', 'sex'] },
  { key: 'date', label: '방문일', required: true, aliases: ['날짜', '방문날짜', '방문 날짜', '방문일자', 'date', 'visit_date'] },
  { key: 'service', label: '시술', required: true, aliases: ['시술명', '시술 부위', '부위', '메뉴', 'service'] },
  { key: 'listPrice', label: '정가', aliases: ['정상가', 'list_price', 'price'] },
  { key: 'paid', label: '결제액', required: true, aliases: ['결제금액', '결제 금액', '금액', '매출', 'paid', 'amount'] },
  { key: 'promotion', label: '프로모션', aliases: ['혜택', '이벤트', '할인', 'promotion'] },
  { key: 'variableCost', label: '변동비', aliases: ['원가', '재료비', 'variable_cost', 'cost'] },
  { key: 'consent', label: '수신동의', aliases: ['수신 동의', '마케팅수신동의', '마케팅 수신 동의', '광고수신동의', 'consent'] },
];

const norm = (s) => String(s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

export function normalizeGender(value) {
  const s = norm(value);
  if (['여', '여성', '여자', 'f', 'female', 'w', 'woman'].includes(s)) return 'F';
  if (['남', '남성', '남자', 'm', 'male', 'man'].includes(s)) return 'M';
  return null;
}

export function normalizeConsent(value) {
  const s = norm(value);
  if (!s) return undefined;
  if (['y', 'yes', 'o', '동의', '예', 'true', '1', 'v', '✓', '✔'].includes(s)) return true;
  if (['n', 'no', 'x', '미동의', '비동의', '거부', '아니오', 'false', '0'].includes(s)) return false;
  return null;
}

export const visitKey = (v) => `${v.customerId}|${v.date}|${v.service}`;

/**
 * CSV 텍스트 → 방문 기록
 * 반환: { records, errors, warnings, total }
 *   records: 가져올 수 있는 행 (오류 행은 빠짐)
 *   errors/warnings: { row(엑셀 행 번호), message }
 */
export function importVisitsCsv(text, { existingVisits = [], asOf = today() } = {}) {
  const rows = parseCsv(text).filter((r) => r.some((c) => c.trim() !== ''));
  const errors = [];
  const warnings = [];
  if (!rows.length) return { records: [], errors: [{ row: 1, message: '파일이 비어 있습니다.' }], warnings, total: 0 };

  const header = rows[0].map(norm);
  const index = {};
  for (const col of COLUMNS) {
    const names = [norm(col.label), ...col.aliases.map(norm)];
    const at = header.findIndex((h) => names.includes(h));
    if (at !== -1) index[col.key] = at;
  }
  const missing = COLUMNS.filter((c) => c.required && index[c.key] === undefined).map((c) => c.label);
  if (missing.length) {
    return {
      records: [],
      errors: [{ row: 1, message: `필수 열이 없습니다: ${missing.join(', ')} (양식을 내려받아 열 이름을 맞춰 주세요)` }],
      warnings,
      total: rows.length - 1,
    };
  }

  const seen = new Set(existingVisits.map(visitKey));
  const genderOf = new Map();
  const records = [];
  rows.slice(1).forEach((cells, i) => {
    const row = i + 2; // 엑셀 행 번호 (1행은 제목)
    const get = (key) => (index[key] === undefined ? '' : String(cells[index[key]] ?? '').trim());
    const problems = [];

    const customerId = get('customerId');
    if (!customerId) problems.push('고객ID가 비어 있습니다');
    const gender = normalizeGender(get('gender'));
    if (!gender) problems.push(`성별을 알 수 없습니다("${get('gender')}") — 여/남으로 적어 주세요`);
    const date = parseDate(get('date'));
    if (!date) problems.push(`방문일이 올바른 날짜가 아닙니다("${get('date')}") — 예: 2026-03-15`);
    const service = get('service');
    if (!service) problems.push('시술이 비어 있습니다');
    const paid = parseAmount(get('paid'));
    if (paid === null) problems.push('결제액이 비어 있습니다 — 금액이 없으면 합계를 확정할 수 없습니다');
    else if (Number.isNaN(paid)) problems.push(`결제액이 숫자가 아닙니다("${get('paid')}")`);
    else if (paid < 0) problems.push('결제액이 음수입니다');
    const listPrice = parseAmount(get('listPrice'));
    if (Number.isNaN(listPrice)) problems.push(`정가가 숫자가 아닙니다("${get('listPrice')}")`);
    const variableCost = parseAmount(get('variableCost'));
    if (Number.isNaN(variableCost)) problems.push(`변동비가 숫자가 아닙니다("${get('variableCost')}")`);
    const consent = normalizeConsent(get('consent'));
    if (consent === null) problems.push(`수신동의 값을 알 수 없습니다("${get('consent')}") — 동의/미동의로 적어 주세요`);

    if (problems.length) {
      errors.push({ row, message: problems.join(' · ') });
      return;
    }
    const record = {
      customerId,
      alias: get('alias'),
      gender,
      date,
      service,
      listPrice: listPrice ?? null,
      paid,
      promotion: get('promotion'),
      variableCost: variableCost ?? null,
      consent,
    };
    const key = visitKey(record);
    if (seen.has(key)) {
      warnings.push({ row, message: `같은 고객·날짜·시술 기록이 이미 있어 건너뜁니다 (${customerId}, ${date}, ${service})` });
      return;
    }
    seen.add(key);
    if (genderOf.has(customerId) && genderOf.get(customerId) !== gender) {
      warnings.push({ row, message: `${customerId}의 성별이 앞 행과 다릅니다 — 처음 값(${genderOf.get(customerId) === 'F' ? '여' : '남'})을 씁니다` });
      record.gender = genderOf.get(customerId);
    } else {
      genderOf.set(customerId, gender);
    }
    if (listPrice !== null && paid > listPrice) warnings.push({ row, message: '결제액이 정가보다 큽니다 — 확인해 주세요' });
    if (date > asOf) warnings.push({ row, message: `미래 날짜입니다(${date})` });
    records.push(record);
  });
  return { records, errors, warnings, total: rows.length - 1 };
}

export function exportVisitsCsv(customers, visits) {
  const byId = new Map(customers.map((c) => [c.id, c]));
  const header = COLUMNS.map((c) => c.label);
  const rows = [...visits]
    .sort((a, b) => (a.date === b.date ? a.customerId.localeCompare(b.customerId) : a.date.localeCompare(b.date)))
    .map((v) => {
      const c = byId.get(v.customerId) ?? {};
      return [
        v.customerId,
        c.alias ?? '',
        c.gender === 'M' ? '남' : '여',
        v.date,
        v.service,
        v.listPrice ?? '',
        v.paid,
        v.promotion ?? '',
        v.variableCost ?? '',
        c.consent?.marketing ? '동의' : '미동의',
      ];
    });
  return toCsv([header, ...rows]);
}

export function templateCsv() {
  return toCsv([
    COLUMNS.map((c) => c.label),
    ['C001', '예시 손님', '여', '2026-03-02', '브라질리언', 70000, 56000, '첫 방문 할인', '', '동의'],
    ['C001', '예시 손님', '여', '2026-04-06', '브라질리언', 70000, 63000, '주기 안 재방문 할인', '', '동의'],
  ]);
}
