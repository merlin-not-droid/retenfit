// 월간 학습 기록(두 업종 공통): 이번 달 추천을 기록해 두고 다음 달 추천의 입력으로 돌려줍니다.
// 기록은 state.monthlyPlans에 남습니다. 손님 개인정보는 없습니다.
import { SUCCESS_LABEL, recordFromPlan } from './promo-engine/index.js';

/** 예상 효과 문구. 0.05 미만은 '+0.0명'으로 읽혀 말로 적습니다 */
export function effectText(e) {
  const extra = e.recommended.extraSuccesses;
  return extra >= 0.05 ? `+${extra.toFixed(1)}${SUCCESS_LABEL[e.device.segment]}` : '아주 작음';
}

const newKey = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

/**
 * 추천에 쓸 매장 ID. 탐색 난수가 매장마다 달라야 같은 달에 모든 매장이 같은 쪽으로 쏠리지 않으므로,
 * 실제 매장은 키를 한 번 만들어 저장합니다. 샘플 매장은 소개 화면이 늘 같도록 고정 ID를 씁니다.
 * created가 true면 저장이 필요합니다.
 */
export function storeKey(state, prefix, isSample) {
  if (isSample) return { id: `${prefix}-sample`, created: false };
  if (state.storeKey) return { id: state.storeKey, created: false };
  state.storeKey = `${prefix}-${newKey()}`;
  return { id: state.storeKey, created: true };
}

/** 샘플 매장은 탐색 없이 기대값이 가장 높은 조합을 보여 줍니다(지난달 기록에 따른 교체는 그대로) */
export function withoutExploration(store) {
  store.preferences = { ...store.preferences, stableMode: true };
  return store;
}

/** 이번 달 추천을 기록에 반영. 내용이 바뀌었으면 true */
export function syncMonthly(state, plan, period) {
  state.monthlyPlans ??= [];
  const i = state.monthlyPlans.findIndex((r) => r.period === period);
  const adopted = i >= 0 ? state.monthlyPlans[i].adopted ?? [] : [];
  const next = recordFromPlan(plan, period, adopted);
  if (i < 0) {
    state.monthlyPlans.push(next);
    return true;
  }
  const same = state.monthlyPlans[i].selected.map((x) => x.id).join() === next.selected.map((x) => x.id).join();
  if (same) return false;
  state.monthlyPlans[i] = next;
  return true;
}

/** 사장님이 실행한 추천으로 표시 → 다음 달에 유지·교체 판단에 쓰입니다 */
export function markAdopted(state, period, id) {
  state.monthlyPlans ??= [];
  let record = state.monthlyPlans.find((r) => r.period === period);
  if (!record) {
    record = { period, selected: [], adopted: [] };
    state.monthlyPlans.push(record);
  }
  record.adopted ??= [];
  if (!record.adopted.includes(id)) record.adopted.push(id);
}

export const isAdopted = (state, period, id) => Boolean(state.monthlyPlans?.find((r) => r.period === period)?.adopted?.includes(id));

const STATUS_NOTE = {
  proven: '효과가 확인되어 유지합니다.',
  measuring: '실행 결과를 확인하는 중입니다.',
};

const VERDICT = {
  good: (x) => `${x.name}: 혜택군의 결과가 비교군보다 좋았습니다. 계속 추천합니다.`,
  weak: (x) => `${x.name}: 기대한 효과가 나오지 않았습니다. 순위를 낮췄습니다.`,
  unclear: (x) => `${x.name}: 아직 판단하기에 표본이 적습니다. 결과를 더 모읍니다.`,
};

const item = (esc, name, note) => `<li><b>${esc(name)}</b>${note ? `<span>${esc(note)}</span>` : ''}</li>`;

/** '이번 달 달라진 점' 영역 HTML. 값은 esc로 이스케이프합니다 */
export function monthlySummaryHtml(changes, esc) {
  const head = `<h2 id="monthly-title">이번 달 달라진 점</h2>`;
  if (!changes.previous) {
    return `<section class="panel" aria-labelledby="monthly-title">${head}
      <p class="help">이번 달이 첫 추천입니다. 다음 달부터 실행 결과를 반영해 바뀝니다.</p></section>`;
  }
  const col = (title, rows, empty) => `<div><h3>${title}</h3>${rows.length ? `<ul>${rows.join('')}</ul>` : `<p class="help small">${empty}</p>`}</div>`;
  return `<section class="panel" aria-labelledby="monthly-title">${head}
    <p class="help">${esc(changes.previous)} 추천과 비교했습니다.</p>
    <div class="monthly">
      ${col(`새로 추천 ${changes.added.length}개`, changes.added.map((x) => item(esc, x.name, x.note)), '새로 넣은 추천이 없습니다.')}
      ${col(`계속 추천 ${changes.kept.length}개`, changes.kept.map((x) => item(esc, x.name, x.note ?? STATUS_NOTE[x.status] ?? '')), '이어서 추천하는 항목이 없습니다.')}
      ${col(`이번 달 제외 ${changes.dropped.length}개`, changes.dropped.map((x) => item(esc, x.name, x.reason)), '제외한 항목이 없습니다.')}
    </div>
    ${changes.learned.length ? `<div class="monthly-learned"><b>우리 매장 실험에서 배운 것</b><ul>${changes.learned.map((x) => `<li>${esc(VERDICT[x.verdict](x))}</li>`).join('')}</ul></div>` : ''}
  </section>`;
}
