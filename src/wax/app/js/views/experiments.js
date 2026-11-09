// 효과 실험: 혜택을 받은 손님 vs 받지 않은 손님(비교군)을 같은 기간에 비교 → 결과를 이번 달 추천에 반영
import { askConfirm } from '../../../../assets/js/confirm-dialog.js';
import { DESIGN_LABEL, VERDICT, armOf, experimentResult, messageTargets, newExperiment, recordMessageExposures } from '../experiments.js';
import { formatDate, diffDays } from '../dates.js';
import { learningFor } from '../recommend.js';
import { uid } from '../state.js';
import { copyText, html, num, pct, pp, raw, toast } from '../ui.js';

export const title = '효과 실험';

const ARM_LABEL = { treat: '혜택군', control: '비교군' };
const effect = (x, relative) => (x === null || x === undefined ? '–' : relative ? `${x >= 0 ? '+' : '−'}${Math.abs(x * 100).toFixed(0)}%` : pp(x));
const range = (ci, relative) => (ci ? `95% 구간 ${effect(ci[0], relative)} ~ ${effect(ci[1], relative)}` : '');

function todo(r, app) {
  const { exp } = r;
  if (exp.endDate) return '';
  if (r.design === 'switchback') {
    const w = r.thisWeek;
    return html`<p class="alert ${w.on ? 'safe' : 'caution'}">이번 주(${formatDate(w.from, app.today)}~${formatDate(w.to, app.today)})는 <b>${w.on ? '시행 주' : '쉬는 주'}</b> — ${w.on ? '이 프로모션을 안내하세요.' : '이번 주에는 안내하지 마세요.'}</p>`;
  }
  if (r.design === 'message') {
    const viaRetention = (exp.waxId ?? exp.waxfitId) && exp.kind === 'retention';
    const sent = exp.exposures.length;
    const last = sent ? exp.exposures.reduce((m, e) => (e.date > m ? e.date : m), exp.exposures[0].date) : null;
    return html`<p class="alert caution">보낼 때 <b>비교군 손님은 빼고</b> 보냅니다. ${viaRetention
      ? html`<a href="#/retention">재방문 설계</a>에서 이 프로모션을 고르고 목록을 복사하면 자동으로 빠지고 기록됩니다.`
      : html`<button type="button" class="link-btn" data-xp-copy="${exp.id}">보낼 손님 목록 복사(혜택군만)</button>`}
      ${sent ? html`<br>기록된 대상 ${num(sent)}명 · 마지막 ${formatDate(last, app.today)}` : ''}</p>`;
  }
  const recent = r.exposures.filter((e) => diffDays(e.date, app.today) <= 14).slice(0, 12);
  return html`<p class="alert caution">처음 온 손님 중 <b>비교군</b>에게는 이 혜택을 주지 마세요. 손님 번호로 자동 배정됩니다.</p>
    <label class="field inline">손님 번호·별칭 확인 <input type="search" data-xp-lookup="${exp.id}" placeholder="예: C123" autocomplete="off"></label>
    <output class="xp-lookup" data-xp-lookup-out="${exp.id}"></output>
    ${recent.length ? html`<p class="help small">최근 2주 첫 방문: ${recent.map((e) => html`<span class="arm ${e.arm}">${e.customerId} ${ARM_LABEL[e.arm]}</span>`)}</p>` : ''}`;
}

function results(r) {
  if (r.design === 'switchback') {
    const w = r.weeks;
    return html`<div class="table-wrap"><table class="xp-table">
      <thead><tr><th scope="col"></th><th scope="col">지난 주 수</th><th scope="col">신규 손님</th><th scope="col">주당 신규</th></tr></thead>
      <tbody>
        <tr><th scope="row">시행 주</th><td>${num(w.weeksOn)}</td><td>${num(w.newOn)}</td><td>${w.weeksOn ? (w.newOn / w.weeksOn).toFixed(1) : '–'}</td></tr>
        <tr><th scope="row">쉬는 주</th><td>${num(w.weeksOff)}</td><td>${num(w.newOff)}</td><td>${w.weeksOff ? (w.newOff / w.weeksOff).toFixed(1) : '–'}</td></tr>
      </tbody></table></div>
      <p class="xp-effect">신규 손님 증가: <b>${effect(r.stats.uplift, true)}</b> <span class="sub">${range(r.stats.ci, true)}</span></p>`;
  }
  const { treat, control } = r.arms;
  const row = (k, a) => html`<tr><th scope="row">${ARM_LABEL[k]}</th><td>${num(a.n + a.observing)}</td><td>${num(a.n)}</td><td>${num(a.success)}</td><td><b>${a.n ? pct(a.success / a.n) : '–'}</b></td></tr>`;
  return html`<div class="table-wrap"><table class="xp-table">
      <thead><tr><th scope="col"></th><th scope="col">대상</th><th scope="col">관찰 완료</th><th scope="col">다시 옴</th><th scope="col">비율</th></tr></thead>
      <tbody>${row('treat', treat)}${row('control', control)}</tbody></table></div>
    <p class="xp-effect">혜택군 − 비교군: <b>${effect(r.stats.diff, false)}</b> <span class="sub">${range(r.stats.ci, false)}</span></p>
    ${r.stats.verdict === 'collecting' ? html`<p class="help small">각 군 관찰 완료 10명 이상부터 판단합니다. 관찰 중: 혜택군 ${num(treat.observing)}명 · 비교군 ${num(control.observing)}명</p>` : ''}
    ${r.stats.needed ? html`<p class="help small">이 정도 차이를 확인하려면 각 군 약 ${num(r.stats.needed)}명이 필요합니다. 비슷한 매장 결과와 합치면 더 빨라집니다.</p>` : ''}`;
}

function learning(r, rec) {
  const l = learningFor(rec, r.exp.engineId);
  if (!l) return '';
  const rel = l.relative;
  return html`<p class="ai-note">추천 엔진 반영: 기준 강도에서의 효과 추정 ${effect(l.before.mean, rel)} → <b>${effect(l.after.mean, rel)}</b>
    <span class="sub">이 매장 실험 데이터 비중 ${pct(l.share)} · 표본이 쌓일수록 커집니다</span></p>`;
}

function card(r, app, rec) {
  const { exp } = r;
  const v = VERDICT[r.stats.verdict];
  return html`<article class="exp-card">
    <div class="exp-head">
      <h3>${exp.name}</h3>
      <p class="rec-tags"><span class="badge">${DESIGN_LABEL[exp.design]}</span><span class="badge ${v.tone === 'safe' ? 'navy' : v.tone === 'danger' ? 'warn' : ''}">${v.label}</span></p>
    </div>
    <p class="help small">${formatDate(exp.startDate, app.today)} 시작${exp.endDate ? ` · ${formatDate(exp.endDate, app.today)} 종료` : ` · ${diffDays(exp.startDate, app.today) + 1}일째`}
      · ${exp.design === 'switchback' ? '한 주씩 번갈아 시행' : `비교군 ${pct(exp.controlShare)} · 관찰 ${exp.windowDays}일`}</p>
    ${todo(r, app)}
    ${results(r)}
    ${learning(r, rec)}
    <div class="btn-row">
      ${exp.endDate ? '' : html`<button type="button" class="btn btn-line btn-sm" data-xp-stop="${exp.id}">실험 끝내기</button>`}
      <button type="button" class="btn btn-ghost btn-sm" data-xp-delete="${exp.id}">삭제</button>
    </div>
  </article>`;
}

export function render(app) {
  const { state } = app;
  const exps = state.experiments ?? [];
  const rec = app.recommendation();
  const all = exps.map((x) => experimentResult(x, state, app.today));
  const running = all.filter((r) => !r.exp.endDate);
  const done = all.filter((r) => r.exp.endDate);
  const startable = state.plans.filter((p) => !exps.some((x) => x.planId === p.id && !x.endDate));
  return html`
  <section class="panel intro">
    <h1>${title}</h1>
    <p class="help">프로모션을 받은 손님과 <b>받지 않은 손님(비교군)</b>을 같은 기간에 비교해, ‘프로모션이 없었어도 왔을 손님’을 빼고 효과를 잽니다. 결과는 <a href="#/recommend">이번 달 추천</a> 계산에 바로 반영됩니다.</p>
    <ul class="design-list">
      <li><b>격주 교차</b> · 첫 방문 유인 — 한 주는 시행, 한 주는 쉬며 주간 신규 손님 수를 비교</li>
      <li><b>비교군(결제 때)</b> · 재방문 혜택 — 처음 온 손님 일부에게는 혜택을 주지 않음(손님 번호로 자동 배정)</li>
      <li><b>비교군(안내 발송)</b> · 리마인드·복귀 쿠폰 — 보낼 손님 일부를 빼고 보냄</li>
    </ul>
  </section>

  <section class="panel">
    <h2>새 실험 시작</h2>
    ${startable.length
      ? html`<form id="xp-new" class="form-grid">
          <label class="field">프로모션 <select name="planId">${startable.map((p) => html`<option value="${p.id}">${p.name} (${p.kind === 'acquisition' ? '첫 방문' : '재방문'})</option>`)}</select></label>
          <label class="field">비교군 비율 <select name="controlShare">${[0.2, 0.3, 0.5].map((v) => html`<option value="${v}" ${v === 0.2 ? raw('selected') : ''}>${pct(v)}</option>`)}</select>
            <span class="hint">손님이 적으면 30~50%가 빨리 판단됩니다. 격주 교차는 자동으로 절반</span></label>
          <div class="btn-row end span-all"><button class="btn btn-primary" type="submit">오늘부터 실험 시작</button></div>
        </form>`
      : html`<p class="empty">실험할 프로모션이 없습니다. <a href="#/recommend">이번 달 추천</a>·<a href="#/acquisition">첫 방문 유인</a>·<a href="#/retention">재방문 설계</a>에서 프로모션을 저장하세요.</p>`}
  </section>

  ${running.length ? html`<section class="panel"><h2>진행 중 (${running.length})</h2><div class="exp-list">${running.map((r) => card(r, app, rec))}</div></section>` : ''}
  ${done.length ? html`<section class="panel"><h2>끝난 실험 (${done.length})</h2><div class="exp-list">${done.map((r) => card(r, app, rec))}</div></section>` : ''}

  <section class="panel method">
    <h2>읽는 법</h2>
    <ul>
      <li><b>다시 옴</b>: 혜택(또는 안내) 다음 날부터 관찰 기간 안에 한 번 이상 방문. 관찰 기간이 안 끝난 손님은 ‘관찰 중’으로 빼고 셉니다.</li>
      <li><b>95% 구간</b>이 0보다 위면 ‘효과 있음’, 아래면 ‘역효과 의심’, 0을 걸치면 아직 우연과 구별이 안 됩니다.</li>
      <li>작은 매장은 한 곳만으로 판단까지 오래 걸립니다. 추천 엔진은 이 결과를 사전 가정과 섞어 쓰고, 데이터가 쌓일수록 이 매장 결과의 비중이 커집니다.</li>
      <li>비교군 손님에게도 평소 서비스는 똑같이 제공합니다. 빼는 것은 이번 실험의 할인·쿠폰·안내뿐입니다.</li>
    </ul>
  </section>`;
}

export function bind(root, app) {
  const { state } = app;
  state.experiments ??= [];
  const byId = (id) => state.experiments.find((x) => x.id === id);

  root.querySelector('#xp-new')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const plan = state.plans.find((p) => p.id === f.get('planId'));
    if (!plan) return;
    const exp = newExperiment(plan, { id: uid('x'), startDate: app.today, controlShare: Number(f.get('controlShare')) || 0.2, settings: state.settings });
    state.experiments.push(exp);
    app.save();
    toast(`‘${plan.name}’ 실험을 시작했습니다 (${DESIGN_LABEL[exp.design]}).`);
    app.rerender();
  });
  root.querySelectorAll('[data-xp-stop]').forEach((b) =>
    b.addEventListener('click', async () => {
      const exp = byId(b.dataset.xpStop);
      if (!exp || !(await askConfirm(`‘${exp.name}’ 실험을 끝낼까요? 지금까지의 결과는 남고 추천에 계속 반영됩니다.`, { confirmLabel: '실험 끝내기' }))) return;
      exp.endDate = app.today;
      app.save();
      app.rerender();
    }),
  );
  root.querySelectorAll('[data-xp-delete]').forEach((b) =>
    b.addEventListener('click', async () => {
      const exp = byId(b.dataset.xpDelete);
      if (!exp || !(await askConfirm(`‘${exp.name}’ 실험 기록을 지울까요? 추천 계산에서도 빠집니다.`, { confirmLabel: '기록 지우기', danger: true }))) return;
      state.experiments = state.experiments.filter((x) => x !== exp);
      app.save();
      app.rerender();
    }),
  );
  root.querySelectorAll('[data-xp-lookup]').forEach((input) =>
    input.addEventListener('input', () => {
      const exp = byId(input.dataset.xpLookup);
      const out = root.querySelector(`[data-xp-lookup-out="${exp.id}"]`);
      const q = input.value.trim().toLowerCase();
      const c = q && state.customers.find((x) => x.id.toLowerCase() === q || (x.alias || '').toLowerCase() === q);
      out.innerHTML = c ? String(html`<span class="arm ${armOf(exp, c.id)}">${c.alias} (${c.id}) → ${ARM_LABEL[armOf(exp, c.id)]}${armOf(exp, c.id) === 'control' ? ' · 혜택 없이' : ' · 혜택 제공'}</span>`) : q ? '해당 손님이 없습니다.' : '';
    }),
  );
  root.querySelectorAll('[data-xp-copy]').forEach((b) =>
    b.addEventListener('click', async () => {
      const exp = byId(b.dataset.xpCopy);
      const targets = messageTargets(exp, state, app.today);
      if (!targets.length) return toast('지금 보낼 대상 손님이 없습니다.');
      const treat = targets.filter(({ c }) => armOf(exp, c.id) === 'treat');
      const text = treat.map(({ c }) => `[${c.alias}${c.phone ? ` · ${c.phone}` : ''}]`).join('\n');
      if (!(await copyText(text))) return toast('복사하지 못했습니다.');
      const added = recordMessageExposures(exp, targets.map(({ c }) => c.id), app.today);
      app.save();
      toast(`혜택군 ${treat.length}명 목록을 복사했습니다. (비교군 ${targets.length - treat.length}명 제외, 새로 기록 ${added}명)`);
      app.rerender();
    }),
  );
}
