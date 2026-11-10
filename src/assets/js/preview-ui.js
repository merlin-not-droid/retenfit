// 업종별 소개 페이지의 '실제 계산 미리보기' 공용 부품. 숫자는 대시보드와 같은 코드로 계산합니다.
import { effectText } from './monthly-record.js';
import { OBJECTIVE_LABEL } from './promo-engine/index.js';

export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export const money = (n) => (Number.isFinite(n) ? `${Math.round(n).toLocaleString('ko-KR')}원` : '–');
export const pct = (r) => (Number.isFinite(r) ? `${Math.round(r * 100)}%` : '–');

/** 'YYYY-MM'의 한 달 전 */
export function previousMonth(period) {
  const d = new Date(`${period}-01T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() - 1);
  return d.toISOString().slice(0, 7);
}

export const monthLabel = (period) => `${Number(period.slice(5, 7))}월`;

function strength(e) {
  return e.device.lever.kind === 'none' ? '가격 혜택 없음' : e.recommended.label;
}

/** 추천 플랜 → 줄 목록 */
export function planRows(plan, limit = 4) {
  if (!plan.selected.length) return '<p class="muted">조건을 만족하는 추천이 없습니다.</p>';
  return `<ul class="plan-rows">${plan.selected.slice(0, limit).map((e) => `<li>
    <b>${esc(e.device.name)}</b><em>${esc(strength(e))}</em>
    <span class="plan-why">${esc(OBJECTIVE_LABEL[e.objective])} · 예상 효과(월) ${esc(effectText(e))}</span>
  </li>`).join('')}</ul>`;
}

/** 지난달과 달라진 점 → 줄 목록 */
export function changeRows(changes) {
  const rows = [
    ...changes.added.map((x) => `<li><b>${esc(x.name)}</b><em>새 추천</em><span class="plan-why">${esc(x.note ?? '이번 달 매장 상황에서 순위가 올랐습니다.')}</span></li>`),
    ...changes.kept.map((x) => `<li><b>${esc(x.name)}</b><em>유지</em><span class="plan-why">${esc(x.note ?? '이번 달에도 순위가 높습니다.')}</span></li>`),
    ...changes.dropped.map((x) => `<li><b>${esc(x.name)}</b><em>제외</em><span class="plan-why">${esc(x.reason)}</span></li>`),
  ];
  return rows.length ? `<ul class="plan-rows">${rows.join('')}</ul>` : '<p class="muted">달라진 점이 없습니다.</p>';
}

export function fill(id, content) {
  const box = document.getElementById(id);
  if (box) box.innerHTML = content;
}

/** 계산 실패 시 빈 칸 대신 안내 */
export function showFailure(ids) {
  for (const id of ids) fill(id, '<p class="muted">미리보기를 불러오지 못했습니다. 새로고침하거나, 대시보드의 샘플 매장에서 확인해 주세요.</p>');
}
