// 첫 방문 유인: 프로모션 선택 + 할인 스펙트럼 + 이익·회수 계산
import { ACQUISITION } from '../catalog.js';
import { evaluateAcquisition, recommendDiscount, spectrumZones } from '../economics.js';
import { GENDER_LABEL, menuFor, menuItem, uid } from '../state.js';
import { genderSeg, html, pct, raw, toast, won, ZONE_TEXT } from '../ui.js';

const MAX_RATE = 0.7;
const ui = { gender: 'F', service: null, promotionId: 'first-rate', rate: null };

export const title = '첫 방문 유인';

function current(app) {
  const { settings } = app.state;
  const options = menuFor(settings, ui.gender);
  if (!options.some((m) => m.name === ui.service)) ui.service = options[0]?.name ?? null;
  const item = ui.service ? menuItem(settings, ui.service, ui.gender) : null;
  const promotion = ACQUISITION.find((p) => p.id === ui.promotionId) ?? ACQUISITION[0];
  const revisit = app.revisitRateFor(ui.gender);
  return { settings, options, item, promotion, revisit };
}

function zoneGradient(zones) {
  const color = { safe: 'var(--ok-bg)', caution: 'var(--warn-bg)', danger: 'var(--bad-bg)' };
  const stops = zones.map((z) => `${color[z.zone]} ${((z.from / MAX_RATE) * 100).toFixed(2)}% ${((z.to / MAX_RATE) * 100).toFixed(2)}%`);
  return `linear-gradient(90deg, ${stops.join(', ')})`;
}

export function render(app) {
  const { settings, options, item, promotion, revisit } = current(app);
  if (!item) {
    return html`<section class="panel"><h1>${title}</h1><p>먼저 <a href="#/settings">매장 설정</a>에서 ${GENDER_LABEL[ui.gender]} 시술 메뉴를 추가해 주세요.</p></section>`;
  }
  const rec = recommendDiscount({
    promotion,
    price: item.price,
    variableCost: item.variableCost,
    minContribution: settings.minContribution,
    revisitRate: revisit.rate,
  });
  if (ui.rate === null) ui.rate = rec.value;
  const plans = app.state.plans.filter((p) => p.kind === 'acquisition');

  return html`
  <section class="panel intro">
    <h1>${title}</h1>
    <p class="help">처음 오는 손님을 위한 프로모션을 고르고 할인율을 정하세요. 남는 이익과, 할인한 금액이 재방문으로 얼마나 회수되는지 바로 계산합니다.</p>
    <div class="controls">
      ${genderSeg('acq-gender', ui.gender)}
      <label class="field">시술
        <select id="acq-service">${options.map((m) => html`<option value="${m.name}" ${m.name === ui.service ? raw('selected') : ''}>${m.name}${m.gender === 'A' ? '' : ` (${GENDER_LABEL[m.gender]})`}</option>`)}</select>
      </label>
      <p class="facts">정가 <b>${won(item.price)}</b> · 1회 변동비 <b>${won(item.variableCost)}</b> · 최소 이익 <b>${won(settings.minContribution)}</b>${settings.menuIsExample ? html` <a class="badge warn" href="#/settings">예시 가격</a>` : ''}</p>
    </div>
  </section>

  <div class="two-col">
    <section class="panel">
      <h2>프로모션 고르기</h2>
      <div class="promo-list" role="radiogroup" aria-label="첫 방문 프로모션">
        ${ACQUISITION.map((p) => html`
          <label class="promo ${p.id === promotion.id ? 'active' : ''}">
            <input type="radio" name="acq-promo" value="${p.id}" ${p.id === promotion.id ? raw('checked') : ''}>
            <span class="promo-name">${p.name}</span>
            <span class="promo-summary">${p.summary}</span>
            <span class="promo-range">일반 추천 ${pct(p.recommended)} · 범위 ${pct(p.range[0])}~${pct(p.range[1])}</span>
          </label>`)}
      </div>
      <p class="tip">${promotion.tip}</p>
    </section>

    <section class="panel spectrum-panel" aria-labelledby="acq-spectrum-title">
      <h2 id="acq-spectrum-title">할인 스펙트럼</h2>
      <div class="spectrum">
        <div class="spectrum-track" id="acq-track"></div>
        <input type="range" id="acq-rate" min="0" max="${MAX_RATE * 100}" step="1" value="${Math.round(ui.rate * 100)}" aria-label="할인율" aria-describedby="acq-alert">
        <span class="rec-marker" id="acq-rec" title="추천 할인율"></span>
      </div>
      <div class="spectrum-scale" aria-hidden="true"><span>0%</span><span>35%</span><span>70%</span></div>
      <div class="rate-row">
        <output id="acq-rate-out" for="acq-rate" class="rate-out"></output>
        <button type="button" class="btn btn-line btn-sm" id="acq-use-rec">추천값 ${pct(rec.value)}로</button>
      </div>
      <p class="rec-note" id="acq-rec-note"></p>
      <dl class="figures" id="acq-figures"></dl>
      <div class="alert" id="acq-alert" role="status" aria-live="polite"></div>
      <details class="assume">
        <summary>재방문율 기준: <span id="acq-revisit-src"></span></summary>
        <p>${revisit.source === 'data'
          ? html`내 매장 방문 기록에서 관찰 기간(${settings.windowDays}일)이 끝난 ${GENDER_LABEL[ui.gender]} 손님 ${revisit.completed}명으로 계산한 값입니다.`
          : html`방문 기록이 충분하지 않아(관찰 완료 ${revisit.completed}명) 매장 설정의 가정값을 씁니다. 고객 데이터가 쌓이면 실제 재방문율로 바뀝니다.`}</p>
        <label class="field inline">가정 재방문율 <input type="number" id="acq-assume" min="0" max="100" step="1" value="${Math.round(settings.assumedRevisitRate * 100)}"> %</label>
      </details>
      <form class="save-plan" id="acq-save">
        <label class="field">이름
          <input type="text" id="acq-plan-name" maxlength="40" required>
        </label>
        <button class="btn btn-primary" type="submit">이 프로모션 저장</button>
      </form>
    </section>
  </div>

  <section class="panel">
    <h2>저장한 첫 방문 프로모션</h2>
    ${plans.length
      ? html`<ul class="plan-list">${plans.map((p) => html`<li><span><b>${p.name}</b> · ${GENDER_LABEL[p.gender] ?? ''} ${p.service} · 할인 ${pct(p.rate)}</span><button type="button" class="btn btn-ghost btn-sm" data-delete-plan="${p.id}" aria-label="${p.name} 삭제">삭제</button></li>`)}</ul>
        <p class="help">저장한 이름은 방문 기록의 ‘프로모션’ 칸에서 고를 수 있고, 성과 분석에서 이 이름별로 재방문율을 비교합니다.</p>`
      : html`<p class="help">아직 없습니다. 할인율을 정한 뒤 저장하면 방문 기록과 성과 분석에서 이 이름으로 구분됩니다.</p>`}
  </section>`;
}

export function bind(root, app) {
  const { settings, item, promotion, revisit } = current(app);
  if (!item) return;
  const slider = root.querySelector('#acq-rate');
  const rec = recommendDiscount({
    promotion,
    price: item.price,
    variableCost: item.variableCost,
    minContribution: settings.minContribution,
    revisitRate: revisit.rate,
  });
  const zones = spectrumZones({
    price: item.price,
    variableCost: item.variableCost,
    minContribution: settings.minContribution,
    revisitRate: revisit.rate,
    maxRate: MAX_RATE,
  });
  root.querySelector('#acq-track').style.background = zoneGradient(zones);
  root.querySelector('#acq-rec').style.left = `${(rec.value / MAX_RATE) * 100}%`;
  root.querySelector('#acq-revisit-src').textContent =
    revisit.source === 'data' ? `내 매장 실제 ${pct(revisit.rate)} (${revisit.completed}명)` : `가정값 ${pct(revisit.rate)}`;
  const recNote = root.querySelector('#acq-rec-note');
  if (rec.limited) {
    recNote.textContent = `이 시술은 이익 여유가 작아, 이 프로모션의 최소 범위(${pct(promotion.range[0])})도 최소 이익 기준을 넘깁니다. 다른 프로모션을 고려하세요.`;
  } else if (rec.reducedFrom !== null) {
    recNote.textContent = `일반 추천 ${pct(rec.reducedFrom)}를 매장 숫자에 맞춰 ${pct(rec.value)}로 낮췄습니다 (재방문으로 회수 가능한 한도 ${pct(rec.limits.max)}).`;
  } else {
    recNote.textContent = `추천 ${pct(rec.value)} — 매장 숫자로 계산한 한도(${pct(rec.limits.max)}) 안에 있습니다.`;
  }
  const nameInput = root.querySelector('#acq-plan-name');

  const update = () => {
    ui.rate = Number(slider.value) / 100;
    const e = evaluateAcquisition({
      price: item.price,
      variableCost: item.variableCost,
      discountRate: ui.rate,
      minContribution: settings.minContribution,
      revisitRate: revisit.rate,
    });
    root.querySelector('#acq-rate-out').textContent = `할인 ${pct(ui.rate)}`;
    slider.setAttribute('aria-valuetext', `할인 ${pct(ui.rate)}, ${ZONE_TEXT[e.zone]}`);
    root.querySelector('#acq-figures').innerHTML = String(html`
      <div><dt>할인액</dt><dd>${won(e.first.discount)}</dd></div>
      <div><dt>첫 결제액</dt><dd>${won(e.first.paid)}</dd></div>
      <div><dt>첫 방문 공헌이익</dt><dd class="${e.first.contribution < settings.minContribution ? 'neg' : ''}">${won(e.first.contribution)}</dd></div>
      <div><dt>재방문 1회 공헌이익</dt><dd>${won(e.revisit.contribution)}</dd></div>
      <div><dt>회수에 필요한 재방문율</dt><dd>${Number.isFinite(e.recoveryRate) ? pct(e.recoveryRate) : '회수 불가'}</dd></div>
      <div><dt>손님 1명당 기대 공헌이익</dt><dd>${won(e.expectedPerCustomer)}</dd></div>`);
    const alert = root.querySelector('#acq-alert');
    alert.className = `alert ${e.zone}`;
    if (e.zone === 'danger') {
      alert.textContent = `⚠ 첫 방문 공헌이익(${won(e.first.contribution)})이 최소 이익 기준(${won(settings.minContribution)})보다 낮습니다. 할인율을 낮추거나 다른 프로모션을 고르세요.`;
    } else if (e.zone === 'caution') {
      alert.textContent = `재방문율 ${pct(revisit.rate)}로는 할인액의 ${pct(e.recoveredShare)}만 회수됩니다 (필요 ${pct(e.recoveryRate)}). 재방문 혜택을 함께 설계하세요.`;
    } else if (ui.rate === 0) {
      alert.textContent = '할인이 없습니다. 첫 방문 유인 효과를 보려면 프로모션 범위 안에서 정해 보세요.';
    } else {
      alert.textContent = `안전: 최소 이익을 지키고, 재방문율 ${pct(revisit.rate)} 기준으로 할인액을 모두 회수합니다.`;
    }
    if (!nameInput.dataset.edited) nameInput.value = `${promotion.name} ${pct(ui.rate)} (${GENDER_LABEL[ui.gender]} ${ui.service})`;
  };
  slider.addEventListener('input', update);
  nameInput.addEventListener('input', () => (nameInput.dataset.edited = '1'));
  update();

  root.querySelector('#acq-use-rec').addEventListener('click', () => {
    slider.value = Math.round(rec.value * 100);
    update();
  });
  root.querySelectorAll('input[name="acq-gender"]').forEach((r) =>
    r.addEventListener('change', () => {
      ui.gender = r.value;
      ui.rate = null;
      app.rerender();
    }),
  );
  root.querySelector('#acq-service').addEventListener('change', (e) => {
    ui.service = e.target.value;
    ui.rate = null;
    app.rerender();
  });
  root.querySelectorAll('input[name="acq-promo"]').forEach((r) =>
    r.addEventListener('change', () => {
      ui.promotionId = r.value;
      ui.rate = null;
      app.rerender();
    }),
  );
  root.querySelector('#acq-assume').addEventListener('change', (e) => {
    const v = Math.min(100, Math.max(0, Number(e.target.value) || 0));
    settings.assumedRevisitRate = v / 100;
    app.save();
    app.rerender();
  });
  root.querySelector('#acq-save').addEventListener('submit', (e) => {
    e.preventDefault();
    const name = nameInput.value.trim();
    if (!name) return;
    if (app.state.plans.some((p) => p.name === name)) {
      toast('같은 이름의 프로모션이 이미 있습니다. 이름을 바꿔 주세요.');
      return;
    }
    app.state.plans.push({
      id: uid('p'),
      kind: 'acquisition',
      name,
      promotionId: promotion.id,
      gender: ui.gender,
      service: ui.service,
      rate: ui.rate,
      createdAt: app.today,
    });
    app.save();
    toast(`‘${name}’을(를) 저장했습니다.`);
    app.rerender();
  });
  root.querySelectorAll('[data-delete-plan]').forEach((b) =>
    b.addEventListener('click', () => {
      const plan = app.state.plans.find((p) => p.id === b.dataset.deletePlan);
      if (!plan || !confirm(`‘${plan.name}’을(를) 삭제할까요? 이미 기록된 방문의 프로모션 이름은 그대로 남습니다.`)) return;
      app.state.plans = app.state.plans.filter((p) => p !== plan);
      app.save();
      app.rerender();
    }),
  );
}

