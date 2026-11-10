// 성과 분석: 프로모션별 재방문율·공헌이익 (관찰 중 손님 분리, 신뢰 구간, 표본 경고)
import { analyze, NO_PROMOTION, SMALL_SAMPLE } from '../analytics.js';
import { monthlyChart, rateBars } from '../charts.js';
import { formatDate, parseDate } from '../dates.js';
import { genderSeg, html, num, pct, pp, raw, won } from '../ui.js';

/** 월별 매출: 방문 기록의 결제액 합계(최근 12개월) */
function monthlySales(visits, asOf) {
  const months = new Map();
  for (const v of visits) {
    if (v.date > asOf) continue;
    const key = v.date.slice(0, 7);
    const row = months.get(key) ?? { month: key, revenue: 0, visits: 0, customers: new Set() };
    row.revenue += Number(v.paid) || 0;
    row.visits += 1;
    row.customers.add(v.customerId);
    months.set(key, row);
  }
  return [...months.values()].sort((a, b) => b.month.localeCompare(a.month)).slice(0, 12);
}

function salesPanel(visits, asOf) {
  const rows = monthlySales(visits, asOf);
  if (!rows.length) return '';
  return html`<section class="panel">
    <h2>월별 매출</h2>
    <p class="help hint">완료된 방문 기록의 결제액 합계입니다.</p>
    <div class="table-wrap"><table>
      <thead><tr><th scope="col">월</th><th scope="col" class="num">매출</th><th scope="col" class="num">방문</th><th scope="col" class="num">손님</th><th scope="col" class="num">객단가</th></tr></thead>
      <tbody>${rows.map((m) => html`<tr><td>${m.month}</td><td class="num"><b>${won(m.revenue)}</b></td><td class="num">${num(m.visits)}건</td><td class="num">${num(m.customers.size)}명</td><td class="num">${won(m.revenue / (m.visits || 1))}</td></tr>`)}</tbody>
    </table></div>
  </section>`;
}

const ui = { gender: 'all', windowDays: null, asOf: null };

export const title = '성과·매출 분석';

export function render(app) {
  const { state } = app;
  ui.windowDays ??= state.settings.windowDays;
  ui.asOf ??= app.today;
  if (!state.visits.length) {
    return html`<section class="panel intro">
      <h1>${title}</h1>
      <p class="help">방문 기록이 쌓이면 프로모션별 재방문율과 손님 1명당 남은 이익을 비교합니다.</p>
      <div class="empty-actions">
        <button type="button" class="btn btn-primary" data-action="load-sample">샘플 데이터로 둘러보기</button>
        <a class="btn btn-line" href="#/customers">CSV 가져오기 · 손님 추가</a>
      </div>
    </section>`;
  }
  const r = analyze(state.visits, {
    windowDays: ui.windowDays,
    asOf: ui.asOf,
    gender: ui.gender,
    genderOf: app.genderOf,
    costOf: app.costOf,
  });
  const t = r.totals;
  const chartRows = r.byPromotion.map((g) => ({
    label: g.label,
    rate: g.rate,
    ci: g.ci,
    note: `관찰 완료 ${g.completed}명`,
    muted: g.label === NO_PROMOTION,
  }));

  return html`
  <section class="panel intro">
    <h1>${title}</h1>
    <div class="controls">
      ${genderSeg('an-gender', ui.gender, { all: true })}
      <label class="field">관찰 기간
        <select id="an-window">${[30, 45, 60, 90, 120].map((d) => html`<option value="${d}" ${d === ui.windowDays ? raw('selected') : ''}>첫 방문 후 ${d}일</option>`)}</select>
      </label>
      <label class="field">기준일
        <input type="date" id="an-asof" value="${ui.asOf}" max="${app.today}">
      </label>
    </div>
    <p class="help">방문 기록 ${num(state.visits.length)}건 · 손님 ${num(state.customers.length)}명 기준${state.meta.demo ? html` <span class="badge">샘플 데이터</span>` : ''}. 재방문율은 첫 방문 후 ${ui.windowDays}일이 지난 손님만으로 계산합니다.</p>
  </section>

  ${salesPanel(state.visits, ui.asOf)}

  <section class="kpis" aria-label="요약">
    <div><span>신규 손님</span><b>${num(t.customers)}명</b></div>
    <div><span>관찰 완료</span><b>${num(t.completed)}명</b></div>
    <div><span>재방문율</span><b>${pct(t.rate)}</b>${t.ci ? html`<small>95% 구간 ${pct(t.ci[0])}~${pct(t.ci[1])}</small>` : ''}</div>
    <div><span>손님 1명당 공헌이익</span><b>${won(t.contributionPerCustomer)}</b><small>첫 방문 후 ${ui.windowDays}일 안</small></div>
    <div><span>관찰 중</span><b>${num(t.observing)}명</b><small>이미 재방문 ${num(t.observingRevisited)}명</small></div>
  </section>

  <section class="panel">
    <h2>첫 방문 프로모션별 재방문율</h2>
    <p class="help hint">손님이 처음 왔을 때 받은 프로모션으로 묶었습니다. 가는 선은 95% 신뢰 구간이며, 구간이 서로 많이 겹치면 차이가 우연일 수 있습니다.</p>
    ${rateBars(chartRows)}
    <div class="table-wrap"><table>
      <thead><tr>
        <th scope="col">프로모션</th><th scope="col">신규</th><th scope="col">관찰 완료</th><th scope="col">재방문</th>
        <th scope="col">재방문율</th><th scope="col">‘없음’ 대비</th><th scope="col">평균 첫 결제</th><th scope="col">1명당 공헌이익</th>
      </tr></thead>
      <tbody>${r.byPromotion.map((g) => html`<tr>
        <th scope="row">${g.label}${g.smallSample ? html`<span class="badge warn" title="관찰 완료 손님이 ${SMALL_SAMPLE}명 미만">표본 적음</span>` : ''}</th>
        <td>${num(g.customers)}</td><td>${num(g.completed)}</td><td>${num(g.revisited)}</td>
        <td><b>${pct(g.rate)}</b>${g.ci ? html`<span class="sub">${pct(g.ci[0])}~${pct(g.ci[1])}</span>` : ''}</td>
        <td>${g.lift === null ? '–' : pp(g.lift)}</td>
        <td>${won(g.avgFirstPaid)}</td>
        <td>${won(g.contributionPerCustomer)}${g.contributionUnknown ? html`<span class="sub">변동비 모름 ${g.contributionUnknown}명 제외</span>` : ''}</td>
      </tr>`)}</tbody>
    </table></div>
    ${t.contributionUnknown ? html`<p class="alert caution">변동비를 알 수 없는 방문이 있어 ${num(t.contributionUnknown)}명은 공헌이익 계산에서 뺐습니다. <a href="#/settings">매장 설정</a>의 시술 메뉴 이름과 방문 기록의 시술 이름을 맞추거나, CSV에 ‘변동비’ 열을 넣어 주세요.</p>` : ''}
  </section>

  <section class="panel">
    <h2>월별 신규 손님과 재방문율</h2>
    <p class="help hint">막대: 그달 처음 온 손님 수 · 선: 그 손님들의 재방문율 (관찰 기간이 끝난 달만 표시)</p>
    ${monthlyChart(r.monthly)}
  </section>

  <section class="panel method">
    <h2>계산 방법</h2>
    <ul>
      <li><b>재방문</b>: 첫 방문일 다음 날부터 ${ui.windowDays}일 안에 한 번 이상 다시 온 경우입니다.</li>
      <li><b>관찰 중</b>: 첫 방문 후 아직 ${ui.windowDays}일이 지나지 않은 손님입니다(기준일 ${formatDate(ui.asOf, app.today)}). 재방문율 계산에서 빼야 막 다녀간 손님 때문에 수치가 낮아 보이지 않습니다.</li>
      <li><b>공헌이익</b>: 첫 방문 후 ${ui.windowDays}일 안의 결제액 합계 − 시술별 변동비 합계입니다.</li>
      <li><b>신뢰 구간</b>: 관찰 완료 손님 수가 적을수록 넓어집니다. ${SMALL_SAMPLE}명 미만이면 ‘표본 적음’으로 표시합니다.</li>
    </ul>
  </section>`;
}

export function bind(root, app) {
  root.querySelectorAll('input[name="an-gender"]').forEach((r) => r.addEventListener('change', () => ((ui.gender = r.value), app.rerender())));
  root.querySelector('#an-window')?.addEventListener('change', (e) => ((ui.windowDays = Number(e.target.value)), app.rerender()));
  root.querySelector('#an-asof')?.addEventListener('change', (e) => {
    const d = parseDate(e.target.value);
    if (d) {
      ui.asOf = d;
      app.rerender();
    }
  });
}

export function reset() {
  ui.windowDays = null;
  ui.asOf = null;
}
