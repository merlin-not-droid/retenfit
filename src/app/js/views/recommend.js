// 이번 달 추천: 어디서 이익이 새는지 → 손님을 막는 심리 장벽 → 무엇을 얼마나 줄지 (promo-engine)
import { BARRIERS, BARRIER_LABEL, EVIDENCE_LABEL, OBJECTIVES, OBJECTIVE_LABEL, SUCCESS_LABEL, deviceName, promotionMessage } from '../recommend.js';
import { DESIGN_LABEL, newExperiment, runningFor } from '../experiments.js';
import { uid } from '../state.js';
import { copyText, html, num, pct, toast, won } from '../ui.js';
import * as acquisitionView from './acquisition.js';
import * as retentionView from './retention.js';

export const title = '이번 달 추천';

/** 추정치는 천 원 단위로 반올림해 '약'을 붙인다(가정값 기반이라 원 단위 정밀도는 의미 없음) */
const est = (x) => `약 ${won(Math.round(x / 1000) * 1000)}`;

const meter = (value) => html`<span class="meter" aria-hidden="true"><span style="width:${Math.round(Math.min(1, Math.max(0, value)) * 100)}%"></span></span>`;

function months(m) {
  if (!Number.isFinite(m) || m > 24) return '매장 단독으로는 어려움(유사 매장 결과와 합산 필요)';
  return m < 1 ? '1개월 이내' : `약 ${Math.ceil(m)}개월`;
}

function card(e, i, rec) {
  const s = rec.suggestions.find((x) => x.engineId === e.device.id);
  const priced = e.device.lever.kind !== 'none';
  const where = s.kind === 'acquisition' ? '첫 방문 유인' : '재방문 설계';
  return html`<article class="rec-card">
    <div class="rec-head">
      <span class="rec-rank" aria-hidden="true">${i + 1}</span>
      <div>
        <h3>${e.device.name}</h3>
        <p class="rec-tags"><span class="badge navy">${OBJECTIVE_LABEL[e.objective]}</span><span class="badge">근거: ${EVIDENCE_LABEL[e.posterior.evidence]}</span>${s.waxfitId ? '' : html`<span class="badge warn">새 아이디어</span>`}</p>
      </div>
    </div>
    <p class="promo-summary">${e.device.summary}</p>
    <dl class="figures">
      <div><dt>첫 시험 강도</dt><dd>${priced ? e.recommended.label : '가격 혜택 없음'}</dd></div>
      <div><dt>넘지 말 한도</dt><dd>${priced && e.maxAllowed ? e.maxAllowed.label : '–'}</dd></div>
      <div><dt>예상 효과(월)</dt><dd>+${e.recommended.extraSuccesses.toFixed(1)}${SUCCESS_LABEL[e.device.segment]}</dd></div>
      <div><dt>월 비용</dt><dd>${est(e.recommended.costPerMonth)}</dd></div>
      <div><dt>12개월 기대 순이익</dt><dd class="${e.recommended.eip < 0 ? 'neg' : ''}">${est(e.recommended.eip)}</dd></div>
    </dl>
    <details class="why">
      <summary>왜 이 프로모션인가요?</summary>
      <ul>${e.reasons.map((r) => html`<li>${r}</li>`)}</ul>
      <p class="help small">효과 확인: ${e.measurement.metric} · 혜택 없는 비교군 ${pct(e.measurement.controlShare)} · 판정까지 ${months(e.measurement.monthsToDecide)}</p>
    </details>
    ${e.warnings.length ? html`<ul class="warn-list">${e.warnings.map((w) => html`<li>${w}</li>`)}</ul>` : ''}
    <div class="btn-row">
      ${s.waxfitId
        ? html`<button type="button" class="btn btn-primary btn-sm" data-open="${e.device.id}">${where}에서 열기</button>`
        : html`<button type="button" class="btn btn-primary btn-sm" data-save="${e.device.id}">프로모션으로 저장</button>`}
      <button type="button" class="btn btn-line btn-sm" data-copy="${e.device.id}">안내 문구 복사</button>
      ${rec.running.has(e.device.id)
        ? html`<a class="btn btn-ghost btn-sm" href="#/experiments">효과 실험 중</a>`
        : html`<button type="button" class="btn btn-ghost btn-sm" data-xp-start="${e.device.id}">비교군 실험으로 시작</button>`}
    </div>
  </article>`;
}

/** 추천 장치를 저장한 프로모션(plan)으로 — 이미 있으면 그대로 사용 */
function ensurePlan(app, e, s) {
  const name = `${e.device.name}${e.device.lever.kind === 'none' ? '' : ` ${e.recommended.label}`}`;
  const promotionId = s.waxfitId ?? e.device.id;
  let plan = app.state.plans.find((p) => p.name === name) ?? app.state.plans.find((p) => p.promotionId === promotionId && p.source === 'engine');
  if (!plan) {
    plan = { id: uid('p'), kind: s.kind, name, promotionId, rate: s.rate ?? 0, level: e.recommended.level, source: 'engine', createdAt: app.today };
    app.state.plans.push(plan);
  }
  return plan;
}

export function render(app) {
  const rec = { ...app.recommendation(), running: new Set(runningFor(app.state ?? {}, () => true).map((x) => x.engineId)) };
  const { plan, store } = rec;
  const d = plan.diagnosis;
  const f = store.funnel;
  const objs = [...d.objectives].sort((a, b) => b.weight - a.weight);
  const barriers = BARRIERS.map((b) => d.barriers[b]).sort((a, b) => b.score - a.score).slice(0, 5);
  const left = [...plan.skipped, ...plan.excluded];
  return html`
  <section class="panel intro">
    <h1>${title}</h1>
    <p class="help">방문 기록과 매장 진단으로 <b>어디서 이익이 새는지 → 손님이 왜 오지 않는지 → 무엇을 얼마나 줄지</b>를 계산했습니다. 매장마다 결과가 다르고, 매달 다시 계산합니다.</p>
    ${rec.configured ? '' : html`<p class="alert caution">매장 진단을 아직 입력하지 않아 기본값으로 계산했습니다. <a href="#/settings">매장 설정 → 매장 진단</a>을 채우면 내 매장에 맞게 바뀝니다.</p>`}
    ${rec.dataReady ? '' : html`<p class="alert caution">방문 기록이 적어 재방문율 등 일부 값은 가정값입니다. 기록이 쌓일수록 정확해집니다.</p>`}
    <div class="kpis small">
      <div><span>월 신규(최근 3개월)</span><b>${num(f.newPerMonth)}명</b></div>
      <div><span>첫 재방문율</span><b>${pct(f.secondVisitRate)}</b></div>
      <div><span>활성 단골</span><b>${num(f.activeRegulars)}명</b></div>
      <div><span>휴면</span><b>${num(f.lapsedCount)}명</b></div>
    </div>
  </section>

  <section class="panel">
    <h2>이번 달 실행 플랜</h2>
    <p class="help">월 예산 ${won(store.monthlyPromoBudget)}과 일손·예약 여유 안에서 고른 조합입니다. 금액과 효과는 <b>초기 가정값으로 계산한 추정치</b>이고, 혜택 없는 비교군 결과가 쌓이면 보정됩니다.</p>
    ${plan.selected.length
      ? html`<div class="rec-cards">${plan.selected.map((e, i) => card(e, i, rec))}</div>
        <p class="rec-total">합계 · 월 비용 ${est(plan.totals.costPerMonth)} · 12개월 기대 순이익 ${est(plan.totals.eip)}</p>`
      : html`<p class="empty">조건을 모두 만족하는 프로모션이 없습니다. 예산·예약 여유를 확인해 주세요.</p>`}
  </section>

  <div class="two-col">
    <section class="panel">
      <h2>어디서 이익이 새나요</h2>
      <div class="meter-list">${objs.map((o) => html`<div class="meter-row"><span class="meter-label">${OBJECTIVE_LABEL[o.objective]}</span>${meter(o.weight)}<b>${pct(o.weight)}</b></div>`)}</div>
      <p class="help">${objs[0].reason}</p>
      ${d.notes.map((note) => html`<p class="tip">${note}</p>`)}
    </section>
    <section class="panel">
      <h2>손님을 막는 심리 장벽</h2>
      <div class="meter-list">${barriers.map((b) => html`<details class="barrier">
        <summary class="meter-row"><span class="meter-label">${BARRIER_LABEL[b.barrier]}</span>${meter(b.score)}<b>${b.score.toFixed(2)}</b></summary>
        ${b.evidence.length ? html`<ul>${b.evidence.map((x) => html`<li>${x}</li>`)}</ul>` : html`<p class="help small">업종 기본값입니다.</p>`}
      </details>`)}</div>
      <p class="help small">0~1. 업종 기본값에 매장 신호(후기 수, 첫 할인 깊이, 상권, 남성 비중 등)를 더한 값입니다. 눌러서 근거를 보세요.</p>
    </section>
  </div>

  <section class="panel">
    <h2>목적별 다른 선택지</h2>
    <div class="alt-grid">${OBJECTIVES.map((o) => html`<div>
      <h3>${OBJECTIVE_LABEL[o]}</h3>
      ${plan.byObjective[o].length
        ? html`<ol>${plan.byObjective[o].slice(0, 4).map((e) => html`<li>${e.device.name} <span class="sub">${e.device.lever.kind === 'none' ? '가격 혜택 없음' : e.recommended.label}</span></li>`)}</ol>`
        : html`<p class="help small">조건에 맞는 장치가 없습니다.</p>`}
    </div>`)}</div>
    ${left.length ? html`<details class="why"><summary>이번 달 플랜에서 빠진 프로모션과 이유 (${left.length})</summary><ul>${left.map((x) => html`<li>${x.reason.includes('—') ? x.reason : `${deviceName(x.id)} — ${x.reason}`}</li>`)}</ul></details>` : ''}
  </section>`;
}

export function bind(root, app) {
  const rec = app.recommendation();
  const find = (id) => rec.plan.selected.find((e) => e.device.id === id);
  root.querySelectorAll('[data-open]').forEach((b) =>
    b.addEventListener('click', () => {
      const s = rec.suggestions.find((x) => x.engineId === b.dataset.open);
      if (!s) return;
      const view = s.kind === 'acquisition' ? acquisitionView : retentionView;
      view.preselect({ promotionId: s.waxfitId, rate: s.rate });
      location.hash = s.kind === 'acquisition' ? '#/acquisition' : '#/retention';
    }),
  );
  root.querySelectorAll('[data-save]').forEach((b) =>
    b.addEventListener('click', () => {
      const e = find(b.dataset.save);
      const s = rec.suggestions.find((x) => x.engineId === b.dataset.save);
      if (!e || !s) return;
      const before = app.state.plans.length;
      const plan = ensurePlan(app, e, s);
      if (app.state.plans.length === before) return toast('같은 프로모션이 이미 저장되어 있습니다.');
      app.save();
      toast(`‘${plan.name}’을(를) 저장했습니다. 방문 기록의 ‘프로모션’ 칸에서 고르면 성과 분석에 나옵니다.`);
    }),
  );
  root.querySelectorAll('[data-xp-start]').forEach((b) =>
    b.addEventListener('click', () => {
      const e = find(b.dataset.xpStart);
      const s = rec.suggestions.find((x) => x.engineId === b.dataset.xpStart);
      if (!e || !s) return;
      const plan = ensurePlan(app, e, s);
      app.state.experiments ??= [];
      const exp = newExperiment(plan, { id: uid('x'), startDate: app.today, controlShare: 0.2, settings: app.state.settings });
      if (!confirm(`‘${plan.name}’을(를) 오늘부터 ${DESIGN_LABEL[exp.design]} 방식으로 실험할까요?\n${exp.design === 'switchback' ? '한 주는 시행, 한 주는 쉬면서 신규 손님 수를 비교합니다.' : '대상 손님의 20%는 비교군으로 혜택(안내) 없이 둡니다.'}`)) return;
      app.state.experiments.push(exp);
      app.save();
      location.hash = '#/experiments';
    }),
  );
  root.querySelectorAll('[data-copy]').forEach((b) =>
    b.addEventListener('click', async () => {
      const e = find(b.dataset.copy);
      if (!e) return;
      toast((await copyText(promotionMessage(e, app.state.settings))) ? '안내 문구를 복사했습니다.' : '복사하지 못했습니다.');
    }),
  );
}
