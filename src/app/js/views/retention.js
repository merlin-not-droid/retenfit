// 재방문 설계: 다시 올 때가 된 손님 + 재방문 프로모션 + 안내 문구(수신 동의 손님만)
import { RETENTION } from '../catalog.js';
import { dday, diffDays, formatDate } from '../dates.js';
import { evaluateRetention } from '../economics.js';
import { GENDER_LABEL, menuFor, menuItem, nextVisitInfo, STATUS_LABEL, uid } from '../state.js';
import { copyText, genderSeg, html, pct, raw, toast, won } from '../ui.js';

const MAX_RATE = 0.4;
const ui = { gender: 'all', status: 'due', promotionId: 'cycle-remind', rate: null, service: null, priceGender: 'F' };

export const title = '재방문 설계';

const STATUS_FILTERS = {
  due: { label: '임박·지남', match: (s) => s === 'soon' || s === 'overdue' },
  dormant: { label: '휴면', match: (s) => s === 'dormant' },
  scheduled: { label: '예정', match: (s) => s === 'scheduled' },
  all: { label: '전체', match: () => true },
};

function rows(app) {
  const { state } = app;
  return state.customers
    .map((c) => ({ c, info: nextVisitInfo(c, state.visits, state.settings, app.today) }))
    .filter(({ info }) => info.status !== 'none')
    .sort((a, b) => a.info.daysLeft - b.info.daysLeft);
}

function benefitText(promotion, rate) {
  if (promotion.id === 'cycle-remind' || !rate) return '';
  const p = pct(rate);
  const text = {
    'second-visit': `이번 주기 안에 다시 오시면 ${p} 할인해 드려요.`,
    package: `회수권으로 결제하시면 회당 ${p} 할인된 금액으로 이용하실 수 있어요.`,
    stamp: `방문 스탬프를 모으시면 회당 약 ${p} 할인 효과의 혜택을 드려요.`,
    winback: `오랜만에 오시는 분께 ${p} 할인 쿠폰을 드려요.`,
    review: `후기를 남겨 주시면 다음 방문 때 ${p} 할인해 드려요. (후기에는 혜택을 받았다는 사실을 함께 적어 주세요)`,
  };
  return text[promotion.id] ?? `${p} 할인 혜택을 드려요.`;
}

export function message(settings, promotion, rate) {
  const shop = settings.shopName || '[매장 이름]';
  const contact = settings.shopContact || '[매장 연락처]';
  return [
    `(광고) ${shop}`,
    '{별칭}님, 지난 {시술} 관리 후 {경과}주가 지났어요. 다시 관리받으실 때가 되었습니다.',
    benefitText(promotion, rate),
    `예약 문의: ${contact}`,
    `무료 수신거부: ${contact} 로 '수신거부' 회신`,
  ]
    .filter(Boolean)
    .join('\n');
}

export function render(app) {
  const { state } = app;
  const { settings } = state;
  const all = rows(app);
  const count = (s) => all.filter(({ info }) => info.status === s).length;
  const filtered = all.filter(({ c, info }) => (ui.gender === 'all' || c.gender === ui.gender) && STATUS_FILTERS[ui.status].match(info.status));
  const consenting = filtered.filter(({ c }) => c.consent?.marketing);
  const promotion = RETENTION.find((p) => p.id === ui.promotionId) ?? RETENTION[0];
  if (ui.rate === null) ui.rate = promotion.recommended;
  const options = menuFor(settings, ui.priceGender);
  if (!options.some((m) => m.name === ui.service)) ui.service = options[0]?.name ?? null;
  const item = ui.service ? menuItem(settings, ui.service, ui.priceGender) : null;
  const plans = state.plans.filter((p) => p.kind === 'retention');

  return html`
  <section class="panel intro">
    <h1>${title}</h1>
    <p class="help">손님마다 마지막 방문일과 방문 주기(개인 주기 → 시술 기본 주기)로 다음 방문 예정일을 계산합니다. 7일 안이면 ‘임박’, 지나면 ‘지남’, 주기의 두 배가 넘도록 안 오면 ‘휴면’입니다.</p>
    <div class="kpis small">
      <div><span>임박</span><b>${count('soon')}명</b></div>
      <div><span>지남</span><b>${count('overdue')}명</b></div>
      <div><span>휴면</span><b>${count('dormant')}명</b></div>
      <div><span>수신 동의</span><b>${state.customers.filter((c) => c.consent?.marketing).length}/${state.customers.length}명</b></div>
    </div>
  </section>

  <div class="two-col">
    <section class="panel">
      <h2>다시 올 때가 된 손님</h2>
      <div class="controls">
        ${genderSeg('ret-gender', ui.gender, { all: true })}
        <label class="field">상태
          <select id="ret-status">${Object.entries(STATUS_FILTERS).map(([k, f]) => html`<option value="${k}" ${k === ui.status ? raw('selected') : ''}>${f.label}</option>`)}</select>
        </label>
      </div>
      ${filtered.length
        ? html`<div class="table-wrap"><table>
            <thead><tr><th scope="col">손님</th><th scope="col">시술</th><th scope="col">마지막 방문</th><th scope="col">다음 예정</th><th scope="col">수신 동의</th></tr></thead>
            <tbody>${filtered.slice(0, 200).map(({ c, info }) => html`<tr>
              <td><b>${c.alias}</b><span class="sub">${c.id} · ${GENDER_LABEL[c.gender]}</span></td>
              <td>${c.mainService || info.lastService}<span class="sub">주기 ${info.cycleDays}일</span></td>
              <td>${formatDate(info.lastDate, app.today)}</td>
              <td><span class="status ${info.status}">${STATUS_LABEL[info.status]} ${dday(info.daysLeft)}</span><span class="sub">${formatDate(info.nextDate, app.today)}</span></td>
              <td>${c.consent?.marketing ? html`<span class="ok-text">동의</span>` : html`<span class="muted-text">미동의</span>`}</td>
            </tr>`)}</tbody></table></div>
            ${filtered.length > 200 ? html`<p class="help">앞의 200명만 보여 줍니다.</p>` : ''}`
        : html`<p class="empty">해당하는 손님이 없습니다. ${state.customers.length ? '' : html`<a href="#/customers">고객 데이터</a>에서 손님과 방문 기록을 추가하세요.`}</p>`}
    </section>

    <section class="panel">
      <h2>재방문 프로모션</h2>
      <div class="promo-list" role="radiogroup" aria-label="재방문 프로모션">
        ${RETENTION.map((p) => html`
          <label class="promo ${p.id === promotion.id ? 'active' : ''}">
            <input type="radio" name="ret-promo" value="${p.id}" ${p.id === promotion.id ? raw('checked') : ''}>
            <span class="promo-name">${p.name}</span>
            <span class="promo-summary">${p.summary}</span>
            ${p.range[1] ? html`<span class="promo-range">일반 추천 ${pct(p.recommended)} · 범위 ${pct(p.range[0])}~${pct(p.range[1])}</span>` : html`<span class="promo-range">할인 없음</span>`}
          </label>`)}
      </div>
      <p class="tip">${promotion.tip}</p>
      ${promotion.range[1] && item
        ? html`<div class="controls">
            ${genderSeg('ret-price-gender', ui.priceGender)}
            <label class="field">계산할 시술
              <select id="ret-service">${options.map((m) => html`<option value="${m.name}" ${m.name === ui.service ? raw('selected') : ''}>${m.name}</option>`)}</select>
            </label>
          </div>
          <label class="field" for="ret-rate">재방문 할인율 <output id="ret-rate-out" class="rate-out"></output></label>
          <input type="range" id="ret-rate" class="plain-range" min="0" max="${MAX_RATE * 100}" step="1" value="${Math.round(ui.rate * 100)}" aria-describedby="ret-alert">
          <dl class="figures" id="ret-figures"></dl>
          <div class="alert" id="ret-alert" role="status" aria-live="polite"></div>
          <button type="button" class="btn btn-line btn-sm" id="ret-save">이 재방문 프로모션 저장</button>`
        : ''}
      <h3>안내 문구</h3>
      <p class="help">수신에 동의한 손님에게만 보낼 수 있습니다. 지금 목록에서 보낼 수 있는 손님: <b>${consenting.length}명</b>${filtered.length - consenting.length ? html` (미동의 ${filtered.length - consenting.length}명 제외)` : ''}.</p>
      ${!settings.shopName || !settings.shopContact ? html`<p class="alert caution">매장 이름과 연락처를 <a href="#/settings">매장 설정</a>에 넣으면 문구에 자동으로 들어갑니다. 광고 문자에는 보내는 사람과 수신 거부 방법이 꼭 있어야 합니다.</p>` : ''}
      <textarea id="ret-message" rows="6" aria-label="안내 문구">${message(settings, promotion, ui.rate)}</textarea>
      <div class="btn-row">
        <button type="button" class="btn btn-primary btn-sm" id="ret-copy">문구 복사</button>
        <button type="button" class="btn btn-line btn-sm" id="ret-copy-list" ${consenting.length ? '' : raw('disabled')}>보낼 손님 목록 복사 (${consenting.length}명)</button>
      </div>
      <p class="help small">밤 9시부터 다음 날 아침 8시 사이에는 별도로 동의한 손님에게만 보낼 수 있습니다. {별칭}·{시술}·{경과}는 손님별로 바꿔 넣으세요(목록 복사에 함께 들어갑니다).</p>
      ${plans.length ? html`<h3>저장한 재방문 프로모션</h3><ul class="plan-list">${plans.map((p) => html`<li><span><b>${p.name}</b></span><button type="button" class="btn btn-ghost btn-sm" data-delete-plan="${p.id}" aria-label="${p.name} 삭제">삭제</button></li>`)}</ul>` : ''}
    </section>
  </div>`;
}

export function bind(root, app) {
  const { state } = app;
  const { settings } = state;
  const promotion = RETENTION.find((p) => p.id === ui.promotionId) ?? RETENTION[0];
  root.querySelectorAll('input[name="ret-gender"]').forEach((r) => r.addEventListener('change', () => ((ui.gender = r.value), app.rerender())));
  root.querySelector('#ret-status').addEventListener('change', (e) => ((ui.status = e.target.value), app.rerender()));
  root.querySelectorAll('input[name="ret-promo"]').forEach((r) =>
    r.addEventListener('change', () => {
      ui.promotionId = r.value;
      ui.rate = null;
      app.rerender();
    }),
  );
  root.querySelectorAll('input[name="ret-price-gender"]').forEach((r) => r.addEventListener('change', () => ((ui.priceGender = r.value), app.rerender())));
  root.querySelector('#ret-service')?.addEventListener('change', (e) => ((ui.service = e.target.value), app.rerender()));

  const slider = root.querySelector('#ret-rate');
  const messageBox = root.querySelector('#ret-message');
  if (slider) {
    const item = menuItem(settings, ui.service, ui.priceGender);
    const update = () => {
      ui.rate = Number(slider.value) / 100;
      const e = evaluateRetention({ price: item.price, variableCost: item.variableCost, discountRate: ui.rate, minContribution: settings.minContribution });
      root.querySelector('#ret-rate-out').textContent = pct(ui.rate);
      root.querySelector('#ret-figures').innerHTML = String(html`
        <div><dt>재방문 결제액</dt><dd>${won(e.visit.paid)}</dd></div>
        <div><dt>재방문 1회 공헌이익</dt><dd class="${e.zone === 'danger' ? 'neg' : ''}">${won(e.visit.contribution)}</dd></div>`);
      const alert = root.querySelector('#ret-alert');
      alert.className = `alert ${e.zone}`;
      alert.textContent =
        e.zone === 'danger'
          ? `⚠ 재방문 1회 공헌이익이 최소 이익 기준(${won(settings.minContribution)})보다 낮습니다.`
          : `안전: 재방문 1회에 ${won(e.visit.contribution)}이 남습니다.`;
      messageBox.value = message(settings, promotion, ui.rate);
    };
    slider.addEventListener('input', update);
    update();
    root.querySelector('#ret-save').addEventListener('click', () => {
      const name = `${promotion.name} ${pct(ui.rate)}`;
      if (state.plans.some((p) => p.name === name)) return toast('같은 이름의 프로모션이 이미 있습니다.');
      state.plans.push({ id: uid('p'), kind: 'retention', name, promotionId: promotion.id, rate: ui.rate, createdAt: app.today });
      app.save();
      toast(`‘${name}’을(를) 저장했습니다.`);
      app.rerender();
    });
  }

  root.querySelector('#ret-copy').addEventListener('click', async () => {
    toast((await copyText(messageBox.value)) ? '문구를 복사했습니다.' : '복사하지 못했습니다. 직접 선택해 복사해 주세요.');
  });
  root.querySelector('#ret-copy-list').addEventListener('click', async () => {
    const list = rows(app).filter(
      ({ c, info }) => c.consent?.marketing && (ui.gender === 'all' || c.gender === ui.gender) && STATUS_FILTERS[ui.status].match(info.status),
    );
    const lines = list.map(({ c, info }) => {
      const weeks = Math.max(1, Math.round(diffDays(info.lastDate, app.today) / 7));
      const text = messageBox.value
        .replaceAll('{별칭}', c.alias)
        .replaceAll('{시술}', c.mainService || info.lastService)
        .replaceAll('{경과}', String(weeks));
      return `[${c.alias}${c.phone ? ` · ${c.phone}` : ''}]\n${text}`;
    });
    toast((await copyText(lines.join('\n\n'))) ? `${list.length}명분 문구를 복사했습니다.` : '복사하지 못했습니다.');
  });
  root.querySelectorAll('[data-delete-plan]').forEach((b) =>
    b.addEventListener('click', () => {
      state.plans = state.plans.filter((p) => p.id !== b.dataset.deletePlan);
      app.save();
      app.rerender();
    }),
  );
}
