// 미용실 '이번 달 추천' · '매출 분석' 화면
import { effectText, isAdopted, monthlySummaryHtml } from '../../../assets/js/monthly-record.js';
import { BARRIERS, BARRIER_LABEL, OBJECTIVES, OBJECTIVE_LABEL } from '../../../assets/js/promo-engine/index.js';
import { COMPETITION, EVIDENCE, TRADE_AREA, defaultShop, experimentOutcome, planFromEvaluation, salesReport } from './recommend.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const money = (n) => (Number.isFinite(n) ? `${Math.round(n).toLocaleString('ko-KR')}원` : '–');
const about = (n) => `약 ${money(Math.round(n / 1000) * 1000)}`;
const pct = (r) => (Number.isFinite(r) ? `${Math.round(r * 100)}%` : '–');
const meter = (v) => `<span class="meter" aria-hidden="true"><span style="width:${Math.round(Math.min(1, Math.max(0, v)) * 100)}%"></span></span>`;

function row(e, i, state) {
  const priced = e.device.lever.kind !== 'none';
  const canPlan = Boolean(planFromEvaluation(e, state));
  const done = isAdopted(state, state.settings.month, e.device.id);
  return `<article class="rec-card">
    <div class="rec-main">
      <div class="rec-head"><span class="rec-rank" aria-hidden="true">${i + 1}</span>
        <div><h3>${esc(e.device.name)}</h3>
          <p class="rec-tags"><span class="badge navy">${esc(OBJECTIVE_LABEL[e.objective])}</span><span class="badge">근거: ${EVIDENCE[e.posterior.evidence]}</span>${done ? '<span class="badge lime">실행 중</span>' : ''}</p>
        </div>
      </div>
      <p class="promo-summary">${esc(e.device.summary)}</p>
      <details class="why"><summary>왜 우리 매장에 이 추천인가요?</summary><ul>${e.reasons.map((r) => `<li>${esc(r)}</li>`).join('')}</ul></details>
      ${e.warnings.length ? `<ul class="warn-list">${e.warnings.map((w) => `<li>${esc(w)}</li>`).join('')}</ul>` : ''}
    </div>
    <div class="rec-side">
      <dl class="figures">
        <div><dt>첫 시험 강도</dt><dd>${priced ? esc(e.recommended.label) : '가격 혜택 없음'}</dd></div>
        <div><dt>넘지 말 한도</dt><dd>${priced && e.maxAllowed ? esc(e.maxAllowed.label) : '–'}</dd></div>
        <div><dt>예상 효과(월)</dt><dd>${esc(effectText(e))}</dd></div>
        <div><dt>월 비용</dt><dd>${about(e.recommended.costPerMonth)}</dd></div>
        <div><dt>12개월 기대 순이익</dt><dd class="${e.recommended.eip < 0 ? 'neg' : ''}">${about(e.recommended.eip)}</dd></div>
      </dl>
      <div class="btn-row">
        ${done ? '' : `<button type="button" class="btn btn-primary btn-sm" data-action="rec-run" data-id="${esc(e.device.id)}">이번 달 실행 기록</button>`}
        ${canPlan ? `<button type="button" class="btn btn-line btn-sm" data-action="rec-plan" data-id="${esc(e.device.id)}">손익 확인</button>` : ''}
        <button type="button" class="btn btn-ghost btn-sm" data-action="rec-copy" data-id="${esc(e.device.id)}">안내 문구 보기</button>
      </div>
    </div>
  </article>`;
}

function running(state) {
  const list = (state.experiments ?? []).filter((x) => x.engineId);
  if (!list.length) return '';
  const rows = list.map((x) => {
    const r = experimentOutcome(x, state);
    const result = !r ? '–' : r.observing ? `관찰 중 · ${x.windowDays ?? 60}일이 지나면 자동 계산` : `혜택군 ${r.treatedSuccess}/${r.treated}명 · 비교군 ${r.controlSuccess}/${r.control}명`;
    return `<tr><td>${esc(x.month)}</td><td>${esc(x.label)}</td><td class="num">${x.treatment.length}명</td><td class="num">${x.control.length}명</td><td>${esc(result)}</td></tr>`;
  }).join('');
  return `<section class="panel"><h2>실행 중인 추천과 결과</h2>
    <p class="help">실행을 기록하면 대상 손님의 일부를 혜택 없는 비교군으로 나눕니다. 다음 달 고객 데이터를 올리면 최근 방문일로 재방문 수를 자동 계산해 추천에 반영합니다.</p>
    <div class="table-wrap"><table><thead><tr><th scope="col">월</th><th scope="col">추천</th><th scope="col" class="num">혜택군</th><th scope="col" class="num">비교군</th><th scope="col">결과</th></tr></thead><tbody>${rows}</tbody></table></div></section>`;
}

export function renderRecommend(state, rec) {
  const { plan, store } = rec;
  const d = plan.diagnosis;
  const f = store.funnel;
  const objs = [...d.objectives].sort((a, b) => b.weight - a.weight);
  const barriers = BARRIERS.map((b) => d.barriers[b]).sort((a, b) => b.score - a.score).slice(0, 5);
  const left = [...plan.skipped, ...plan.excluded];
  return `
  ${rec.configured ? '' : `<p class="alert caution">매장 진단을 아직 입력하지 않아 기본값으로 계산했습니다. <a href="#/settings" data-tab="settings">매장 설정 → 매장 진단</a>을 채우면 우리 매장에 맞게 바뀝니다.</p>`}
  ${rec.dataReady ? '' : '<p class="alert caution">방문 기록이 있는 손님이 30명 미만이라 재방문율 등 일부 값은 초기 가정입니다.</p>'}
  <div class="kpis">
    <div><span>월 신규(최근 3개월)</span><b>${Math.round(f.newPerMonth)}명</b></div>
    <div><span>첫 재방문율</span><b>${pct(f.secondVisitRate)}</b></div>
    <div><span>활성 단골</span><b>${f.activeRegulars}명</b></div>
    <div><span>이탈 위험</span><b>${f.lapsedCount}명</b></div>
  </div>
  <section class="panel"><h2>이번 달 실행 플랜</h2>
    <p class="help">월 예산 ${money(store.monthlyPromoBudget)}과 예약 여유 안에서 고른 조합입니다. 금액과 효과는 초기 가정으로 계산한 추정치이며, 비교군 결과가 쌓이면 보정됩니다.</p>
    ${plan.selected.length
      ? `<div class="rec-cards">${plan.selected.map((e, i) => row(e, i, state)).join('')}</div>
         <p class="rec-total">합계 · 월 비용 ${about(plan.totals.costPerMonth)} · 12개월 기대 순이익 ${about(plan.totals.eip)}</p>`
      : `<p class="empty">조건을 모두 만족하는 프로모션이 없습니다. <a href="#/settings" data-tab="settings">매장 설정</a>에서 예상 건수·고정비·예산을 확인해 주세요.</p>`}
  </section>
  ${monthlySummaryHtml(plan.changes, esc)}
  ${running(state)}
  <div class="two-col">
    <section class="panel"><h2>어디서 이익이 새나요</h2>
      <div class="meter-list">${objs.map((o) => `<div class="meter-row"><span class="meter-label">${esc(OBJECTIVE_LABEL[o.objective])}</span>${meter(o.weight)}<b>${pct(o.weight)}</b></div>`).join('')}</div>
      <p class="help" style="margin-top:12px">${esc(objs[0].reason)}</p>
      ${d.notes.map((n) => `<p class="tip">${esc(n)}</p>`).join('')}
    </section>
    <section class="panel"><h2>손님을 막는 심리 장벽</h2>
      <div class="meter-list">${barriers.map((b) => `<details class="barrier"><summary class="meter-row"><span class="meter-label">${esc(BARRIER_LABEL[b.barrier])}</span>${meter(b.score)}<b>${b.score.toFixed(2)}</b></summary>${b.evidence.length ? `<ul>${b.evidence.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : '<p class="help small">업종 기본값입니다.</p>'}</details>`).join('')}</div>
      <p class="help small" style="margin-top:12px">0~1. 업종 기본값에 후기 수, 상권, 가격대 같은 매장 신호를 더한 값입니다. 눌러서 근거를 볼 수 있습니다.</p>
    </section>
  </div>
  <section class="panel"><h2>목적별 다른 선택지</h2>
    <div class="alt-grid">${OBJECTIVES.map((o) => `<div><h3>${esc(OBJECTIVE_LABEL[o])}</h3>${plan.byObjective[o].length
      ? `<ol>${plan.byObjective[o].slice(0, 4).map((e) => `<li>${esc(e.device.name)} <span class="sub">${e.device.lever.kind === 'none' ? '가격 혜택 없음' : esc(e.recommended.label)}</span></li>`).join('')}</ol>`
      : '<p class="help small">조건에 맞는 항목이 없습니다.</p>'}</div>`).join('')}</div>
    ${left.length ? `<details class="why" style="margin-top:12px"><summary>이번 달 플랜에서 빠진 항목과 이유 (${left.length})</summary><ul>${left.map((x) => `<li>${esc(x.reason)}</li>`).join('')}</ul></details>` : ''}
  </section>`;
}

export function renderSales(state) {
  const r = salesReport(state);
  const s = state.settings;
  const totalRow = r.rows.length
    ? `<section class="panel"><h2>월별 매출</h2><p class="help">완료된 방문 기록의 결제액 합계입니다.</p>
        <div class="table-wrap sales-months"><table><thead><tr><th scope="col">월</th><th scope="col" class="num">매출</th><th scope="col" class="num">방문</th><th scope="col" class="num">객단가</th>${s.services.map((v) => `<th scope="col" class="num">${esc(v.name)}</th>`).join('')}</tr></thead>
        <tbody>${r.rows.map((m) => `<tr><td>${esc(m.month)}</td><td class="num"><b>${money(m.revenue)}</b></td><td class="num">${m.visits}건</td><td class="num">${money(m.revenue / (m.visits || 1))}</td>${s.services.map((v) => `<td class="num">${money(m.byService[v.id] ?? 0)}</td>`).join('')}</tr>`).join('')}</tbody></table></div></section>`
    : `<section class="panel"><h2>월별 매출</h2><p class="empty">방문 단위 기록이 없어 월별 매출을 계산할 수 없습니다. 지금은 아래의 설정 기준 예상만 볼 수 있습니다.</p></section>`;
  return `${totalRow}
  <div class="two-col">
    <section class="panel"><h2>이번 달 예상 손익</h2>
      <p class="help">매장 설정의 예상 건수가 그대로 달성된다고 가정한 값입니다.</p>
      <dl class="figures">
        <div><dt>예상 매출</dt><dd>${money(r.model.sales)}</dd></div>
        <div><dt>재료비</dt><dd>− ${money(r.model.material)}</dd></div>
        <div><dt>수수료·매출연동 인건비</dt><dd>− ${money(r.model.sales * r.model.rate)}</dd></div>
        <div><dt>고정비</dt><dd>− ${money(r.model.fixed)}</dd></div>
        <div><dt>예상 이익</dt><dd class="${r.model.profit < 0 ? 'neg' : ''}">${money(r.model.profit)}</dd></div>
        <div><dt>월 목표이익</dt><dd>${money(s.targetProfit)}</dd></div>
        <div><dt>시술 가동률</dt><dd>${pct(r.model.utilization)}</dd></div>
      </dl>
      <div class="btn-row"><button type="button" class="btn btn-line btn-sm" data-tab="settings">비용 수정하기</button></div>
    </section>
    <section class="panel"><h2>시술별 예상 매출</h2>
      <div class="table-wrap"><table><thead><tr><th scope="col">시술</th><th scope="col" class="num">가격</th><th scope="col" class="num">예상 건수</th><th scope="col" class="num">예상 매출</th><th scope="col" class="num">비중</th></tr></thead>
      <tbody>${r.expected.map((v) => `<tr><td>${esc(v.name)}</td><td class="num">${money(v.price)}</td><td class="num">${v.volume}건</td><td class="num">${money(v.sales)}</td><td class="num">${pct(v.share)}</td></tr>`).join('')}</tbody></table></div>
    </section>
  </div>`;
}

const field = (label, name, value, extra = '') => `<label class="field">${label}<input type="number" name="${name}" value="${esc(value)}" ${extra}></label>`;

/** 매장 설정 화면의 '매장 진단' 영역 */
export function shopFields(state) {
  const s = { ...defaultShop(state), ...(state.settings.shop ?? {}) };
  return `<section class="card"><div class="section-heading tight"><div><h2>매장 진단</h2><p>이번 달 추천을 매장마다 다르게 만드는 정보입니다. 비슷한 매장이라도 이 값이 다르면 추천이 달라집니다.</p></div></div>
    <div class="form-grid three">
      <label class="field">상권<select name="shop_tradeArea">${Object.entries(TRADE_AREA).map(([k, v]) => `<option value="${k}" ${s.tradeArea === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
      <label class="field">개업 연월<input type="month" name="shop_openedOn" value="${esc(s.openedOn)}"></label>
      <label class="field">주변 할인 경쟁<select name="shop_competitorDiscountIntensity">${COMPETITION.map((v, i) => `<option value="${i}" ${Number(s.competitorDiscountIntensity) === i ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
      ${field('반경 500m 미용실 수', 'shop_competitorDensity', s.competitorDensity, 'min="0" max="200" step="1"')}
      ${field('온라인 후기 수', 'shop_reviewCount', s.reviewCount, 'min="0" step="1"')}
      ${field('평점', 'shop_rating', s.rating, 'min="0" max="5" step="0.1"')}
      ${field('한산 시간대 빈 예약 비율(%)', 'shop_offPeakSlack', Math.round(Number(s.offPeakSlack) * 100), 'min="0" max="100" step="5"')}
      <label class="field check" style="align-self:end"><input type="checkbox" name="shop_hasOnlineBooking" ${s.hasOnlineBooking ? 'checked' : ''}> 온라인 예약을 받습니다</label>
    </div></section>`;
}

export function readShop(fd) {
  const n = (k) => Number(fd.get(k));
  return {
    configured: true,
    tradeArea: String(fd.get('shop_tradeArea')),
    openedOn: String(fd.get('shop_openedOn') ?? ''),
    competitorDiscountIntensity: n('shop_competitorDiscountIntensity'),
    competitorDensity: n('shop_competitorDensity'),
    reviewCount: n('shop_reviewCount'),
    rating: n('shop_rating'),
    offPeakSlack: n('shop_offPeakSlack') / 100,
    hasOnlineBooking: fd.get('shop_hasOnlineBooking') === 'on',
  };
}
