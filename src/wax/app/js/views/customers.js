// 고객 데이터: 손님·방문 기록 관리, CSV 가져오기(검증 미리보기)·내보내기
import { askConfirm } from '../../../../assets/js/confirm-dialog.js';
import { dday, formatDate, parseDate } from '../dates.js';
import { exportVisitsCsv, importVisitsCsv, templateCsv } from '../records.js';
import { GENDER_LABEL, menuFor, menuItem, mergeImported, nextCustomerId, nextVisitInfo, STATUS_LABEL, uid } from '../state.js';
import { download, genderSeg, html, num, openDialog, raw, toast, won } from '../ui.js';

const ui = { query: '', gender: 'all', status: 'all', sort: 'next' };

export const title = '고객 목록';

function list(app) {
  const { state } = app;
  const q = ui.query.trim().toLowerCase();
  return state.customers
    .map((c) => ({ c, info: nextVisitInfo(c, state.visits, state.settings, app.today) }))
    .filter(({ c }) => !q || c.alias.toLowerCase().includes(q) || c.id.toLowerCase().includes(q) || (c.phone || '').includes(q))
    .filter(({ c }) => ui.gender === 'all' || c.gender === ui.gender)
    .filter(({ info }) => ui.status === 'all' || info.status === ui.status)
    .sort((a, b) => {
      if (ui.sort === 'recent') return (b.info.lastDate ?? '').localeCompare(a.info.lastDate ?? '');
      if (ui.sort === 'paid') return b.info.totalPaid - a.info.totalPaid;
      return (a.info.daysLeft ?? 1e9) - (b.info.daysLeft ?? 1e9);
    });
}

export function render(app) {
  const { state } = app;
  const rows = list(app);
  return html`
  <section class="panel intro">
    <h1>${title}</h1>
    <p class="help">손님별 방문·결제 기록을 관리합니다. 이름 대신 별칭을 쓰고, 연락처는 안내를 보낼 때만 적어 주세요. 기록은 이 기기의 브라우저에만 저장됩니다.</p>
    <div class="btn-row">
      <button type="button" class="btn btn-primary btn-sm" id="cu-add">손님 추가</button>
      <button type="button" class="btn btn-line btn-sm" id="cu-add-visit" ${state.customers.length ? '' : raw('disabled')}>방문 기록 추가</button>
      <label class="btn btn-line btn-sm file-btn">CSV 가져오기<input type="file" id="cu-import" accept=".csv,text/csv" class="sr-only"></label>
      <button type="button" class="btn btn-line btn-sm" id="cu-export" ${state.visits.length ? '' : raw('disabled')}>CSV 내보내기</button>
      <button type="button" class="btn btn-ghost btn-sm" id="cu-template">CSV 양식 내려받기</button>
    </div>
  </section>

  <section class="panel">
    <div class="controls">
      <label class="field grow">검색 <input type="search" id="cu-q" value="${ui.query}" placeholder="별칭·고객ID·연락처"></label>
      ${genderSeg('cu-gender', ui.gender, { all: true })}
      <label class="field">상태
        <select id="cu-status">${[['all', '전체'], ...Object.entries(STATUS_LABEL)].map(([k, l]) => html`<option value="${k}" ${k === ui.status ? raw('selected') : ''}>${l}</option>`)}</select>
      </label>
      <label class="field">정렬
        <select id="cu-sort">${[['next', '다음 방문 빠른 순'], ['recent', '최근 방문 순'], ['paid', '누적 결제 많은 순']].map(([k, l]) => html`<option value="${k}" ${k === ui.sort ? raw('selected') : ''}>${l}</option>`)}</select>
      </label>
    </div>
    <p class="help" aria-live="polite">${num(rows.length)}명${rows.length !== state.customers.length ? ` / 전체 ${num(state.customers.length)}명` : ''}</p>
    ${rows.length
      ? html`<div class="table-wrap"><table class="clickable">
          <thead><tr><th scope="col">손님</th><th scope="col">주 시술 · 주기</th><th scope="col">방문</th><th scope="col">누적 결제</th><th scope="col">다음 방문</th><th scope="col">수신 동의</th></tr></thead>
          <tbody>${rows.slice(0, 300).map(({ c, info }) => html`<tr>
            <td><button type="button" class="link-btn" data-open="${c.id}">${c.alias}</button><span class="sub">${c.id} · ${GENDER_LABEL[c.gender]}</span></td>
            <td>${c.mainService || info.lastService || '–'}<span class="sub">${info.cycleDays ? `${info.cycleDays}일${c.cycleDays ? ' (개인)' : ''}` : ''}</span></td>
            <td>${num(info.visitCount)}회<span class="sub">${info.lastDate ? `마지막 ${formatDate(info.lastDate, app.today)}` : ''}</span></td>
            <td>${won(info.totalPaid)}</td>
            <td>${info.nextDate ? html`<span class="status ${info.status}">${STATUS_LABEL[info.status]} ${dday(info.daysLeft)}</span><span class="sub">${formatDate(info.nextDate, app.today)}</span>` : html`<span class="muted-text">${STATUS_LABEL.none}</span>`}</td>
            <td>${c.consent?.marketing ? html`<span class="ok-text">동의</span>` : html`<span class="muted-text">미동의</span>`}</td>
          </tr>`)}</tbody></table></div>
          ${rows.length > 300 ? html`<p class="help">앞의 300명만 보여 줍니다. 검색으로 좁혀 보세요.</p>` : ''}`
      : html`<p class="empty">${state.customers.length ? '조건에 맞는 손님이 없습니다.' : '아직 손님이 없습니다. ‘손님 추가’ 또는 ‘CSV 가져오기’로 시작하세요.'}</p>`}
  </section>`;
}

function customerForm(app, c) {
  const { settings } = app.state;
  const services = [...new Set(settings.menu.map((m) => m.name))];
  return html`
  <form method="dialog" class="dialog-form" id="cu-form">
    <h2>${c ? '손님 정보' : '손님 추가'}</h2>
    <div class="form-grid">
      <label class="field">고객ID <input name="id" value="${c?.id ?? nextCustomerId(app.state.customers)}" ${c ? raw('readonly') : ''} required maxlength="20" pattern="[A-Za-z0-9_\\-]+" title="영문·숫자·_·- 만 쓸 수 있습니다"></label>
      <label class="field">별칭 <input name="alias" value="${c?.alias ?? ''}" required maxlength="30" placeholder="예: 화요일 저녁 단골"></label>
      <fieldset class="field"><legend>성별</legend>${genderSeg('gender', c?.gender ?? 'F')}</fieldset>
      <label class="field">주 시술
        <select name="mainService"><option value="">선택 안 함</option>${services.map((s) => html`<option ${s === c?.mainService ? raw('selected') : ''}>${s}</option>`)}</select>
      </label>
      <label class="field">개인 방문 주기(일) <input name="cycleDays" type="number" min="7" max="180" value="${c?.cycleDays ?? ''}" placeholder="비우면 시술 기본 주기"></label>
      <label class="field">연락처 (선택) <input name="phone" value="${c?.phone ?? ''}" inputmode="tel" maxlength="20" placeholder="안내를 보낼 때만"></label>
    </div>
    <label class="check"><input type="checkbox" name="consent" ${c?.consent?.marketing ? raw('checked') : ''}> 재방문 안내 등 광고성 정보 수신에 동의함</label>
    <label class="field">동의일 <input type="date" name="consentAt" value="${c?.consent?.at ?? ''}"></label>
    <label class="field">메모 <textarea name="memo" rows="2" maxlength="300" placeholder="시술 시 참고할 점 (민감한 내용은 적지 마세요)">${c?.memo ?? ''}</textarea></label>
    <div class="btn-row end">
      ${c ? html`<button type="button" class="btn btn-ghost btn-sm danger" id="cu-delete">손님 삭제</button>` : ''}
      <button type="button" class="btn btn-line" data-close>취소</button>
      <button type="submit" class="btn btn-primary">${c ? '저장' : '추가'}</button>
    </div>
  </form>`;
}

function visitForm(app, customerId) {
  const { state } = app;
  const c = state.customers.find((x) => x.id === customerId) ?? state.customers[0];
  const plans = state.plans.map((p) => p.name);
  return html`
  <form method="dialog" class="dialog-form" id="visit-form">
    <h2>방문 기록 추가</h2>
    <div class="form-grid">
      <label class="field">손님
        <select name="customerId">${state.customers.map((x) => html`<option value="${x.id}" ${x.id === c.id ? raw('selected') : ''}>${x.alias} (${x.id})</option>`)}</select>
      </label>
      <label class="field">방문일 <input type="date" name="date" value="${app.today}" max="${app.today}" required></label>
      <label class="field">시술 <select name="service" id="visit-service"></select></label>
      <label class="field">정가 <input type="number" name="listPrice" min="0" step="1000" id="visit-price"></label>
      <label class="field">결제액 <input type="number" name="paid" min="0" step="1000" required id="visit-paid"></label>
      <label class="field">프로모션
        <input name="promotion" list="plan-names" placeholder="없으면 비워 두세요" maxlength="40">
        <datalist id="plan-names">${plans.map((p) => html`<option value="${p}"></option>`)}</datalist>
      </label>
    </div>
    <div class="btn-row end">
      <button type="button" class="btn btn-line" data-close>취소</button>
      <button type="submit" class="btn btn-primary">기록</button>
    </div>
  </form>`;
}

function openCustomer(app, id) {
  const { state } = app;
  const c = state.customers.find((x) => x.id === id);
  const visits = state.visits.filter((v) => v.customerId === id).sort((a, b) => b.date.localeCompare(a.date));
  const history = html`
    <section class="visit-history">
      <h3>방문 기록 ${visits.length}건</h3>
      ${visits.length
        ? html`<ul>${visits.map((v) => html`<li><span>${formatDate(v.date, app.today)} · ${v.service} · <b>${won(v.paid)}</b>${v.promotion ? html` · ${v.promotion}` : ''}</span><button type="button" class="btn btn-ghost btn-sm" data-del-visit="${v.id}" aria-label="${v.date} 기록 삭제">삭제</button></li>`)}</ul>`
        : html`<p class="help">기록이 없습니다.</p>`}
      <button type="button" class="btn btn-line btn-sm" id="cu-visit-here">이 손님 방문 기록 추가</button>
    </section>`;
  openDialog(html`${customerForm(app, c)}${history}`, {
    wide: true,
    onMount: (dialog) => {
      bindCustomerForm(dialog, app, c);
      dialog.querySelectorAll('[data-del-visit]').forEach((b) =>
        b.addEventListener('click', async () => {
          if (!(await askConfirm('이 방문 기록을 삭제할까요?', { confirmLabel: '삭제', danger: true }))) return;
          state.visits = state.visits.filter((v) => v.id !== b.dataset.delVisit);
          app.save();
          dialog.close();
          app.rerender();
          openCustomer(app, id);
        }),
      );
      dialog.querySelector('#cu-visit-here').addEventListener('click', () => {
        dialog.close();
        openVisit(app, id);
      });
    },
  });
}

function bindCustomerForm(dialog, app, c) {
  const { state } = app;
  const form = dialog.querySelector('#cu-form');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const f = new FormData(form);
    const id = String(f.get('id')).trim();
    if (!c && state.customers.some((x) => x.id === id)) {
      toast(`고객ID ${id}가 이미 있습니다.`);
      return;
    }
    const consent = f.get('consent') === 'on';
    const data = {
      alias: String(f.get('alias')).trim(),
      gender: f.get('gender') === 'M' ? 'M' : 'F',
      mainService: String(f.get('mainService') || ''),
      cycleDays: Number(f.get('cycleDays')) || null,
      phone: String(f.get('phone') || '').trim(),
      consent: { marketing: consent, at: consent ? parseDate(f.get('consentAt')) || app.today : null },
      memo: String(f.get('memo') || '').trim(),
    };
    if (c) Object.assign(c, data);
    else state.customers.push({ id, ...data });
    app.save();
    dialog.close();
    toast(c ? '저장했습니다.' : `${data.alias} 손님을 추가했습니다.`);
    app.rerender();
  });
  dialog.querySelector('#cu-delete')?.addEventListener('click', async () => {
    const count = state.visits.filter((v) => v.customerId === c.id).length;
    if (!(await askConfirm(`${c.alias} 손님과 방문 기록 ${count}건을 삭제할까요? 되돌릴 수 없습니다.`, { confirmLabel: '손님 삭제', danger: true }))) return;
    state.customers = state.customers.filter((x) => x !== c);
    state.visits = state.visits.filter((v) => v.customerId !== c.id);
    app.save();
    dialog.close();
    app.rerender();
  });
}

function openVisit(app, customerId) {
  const { state } = app;
  openDialog(visitForm(app, customerId), {
    onMount: (dialog) => {
      const form = dialog.querySelector('#visit-form');
      const who = form.elements.customerId;
      const serviceSel = dialog.querySelector('#visit-service');
      const price = dialog.querySelector('#visit-price');
      const paid = dialog.querySelector('#visit-paid');
      const fill = () => {
        const c = state.customers.find((x) => x.id === who.value);
        const options = menuFor(state.settings, c.gender);
        const names = [...new Set(options.map((m) => m.name))];
        serviceSel.innerHTML = String(html`${names.map((n) => html`<option ${n === c.mainService ? raw('selected') : ''}>${n}</option>`)}`);
        setPrice();
      };
      const setPrice = () => {
        const c = state.customers.find((x) => x.id === who.value);
        const item = menuItem(state.settings, serviceSel.value, c.gender);
        price.value = item?.price ?? '';
        paid.value = item?.price ?? '';
      };
      who.addEventListener('change', fill);
      serviceSel.addEventListener('change', setPrice);
      fill();
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const f = new FormData(form);
        const date = parseDate(f.get('date'));
        if (!date) return toast('방문일을 확인해 주세요.');
        state.visits.push({
          id: uid('v'),
          customerId: String(f.get('customerId')),
          date,
          service: String(f.get('service')),
          listPrice: Number(f.get('listPrice')) || null,
          paid: Number(f.get('paid')) || 0,
          promotion: String(f.get('promotion') || '').trim(),
          variableCost: null,
        });
        app.save();
        dialog.close();
        toast('방문을 기록했습니다.');
        app.rerender();
      });
    },
  });
}

function openImport(app, text, fileName) {
  const { state } = app;
  // 샘플 데이터 상태라면 샘플을 비우고 가져오므로, 중복 검사도 빈 상태 기준
  const result = importVisitsCsv(text, { existingVisits: state.meta.demo ? [] : state.visits, asOf: app.today });
  const issueList = (items, kind) =>
    items.length
      ? html`<details class="issues ${kind}" ${kind === 'error' ? raw('open') : ''}><summary>${kind === 'error' ? '오류' : '확인 필요'} ${items.length}건</summary>
          <ul>${items.slice(0, 100).map((i) => html`<li><b>${i.row}행</b> ${i.message}</li>`)}</ul>
          ${items.length > 100 ? html`<p class="help">앞의 100건만 보여 줍니다.</p>` : ''}</details>`
      : '';
  openDialog(
    html`<div class="dialog-form">
      <h2>CSV 가져오기 미리보기</h2>
      <p class="help">${fileName} · 데이터 ${num(result.total)}행</p>
      <div class="kpis small">
        <div><span>가져올 기록</span><b>${num(result.records.length)}건</b></div>
        <div><span>오류(건너뜀)</span><b>${num(result.errors.length)}건</b></div>
        <div><span>확인 필요</span><b>${num(result.warnings.length)}건</b></div>
      </div>
      ${issueList(result.errors, 'error')}
      ${issueList(result.warnings, 'warn')}
      <div class="btn-row end">
        <button type="button" class="btn btn-line" data-close>취소</button>
        <button type="button" class="btn btn-primary" id="import-confirm" ${result.records.length ? '' : raw('disabled')}>${num(result.records.length)}건 가져오기</button>
      </div>
    </div>`,
    {
      wide: true,
      onMount: (dialog) => {
        dialog.querySelector('#import-confirm').addEventListener('click', async () => {
          // 샘플(가상) 기록과 실제 기록이 섞이면 분석이 틀어지므로, 샘플을 비운 뒤에만 가져옴
          if (state.meta.demo) {
            if (!(await askConfirm('지금은 샘플 데이터가 들어 있습니다. 샘플 데이터를 지우고 내 기록만 가져올까요?', { confirmLabel: '샘플 지우고 가져오기' }))) return;
            app.clearData();
          }
          const { newCustomers, newVisits } = mergeImported(app.state, result.records);
          app.save();
          dialog.close();
          toast(`방문 기록 ${newVisits}건, 새 손님 ${newCustomers}명을 가져왔습니다.`);
          app.rerender();
        });
      },
    },
  );
}

export function bind(root, app) {
  const { state } = app;
  const search = root.querySelector('#cu-q');
  search.addEventListener('input', () => {
    ui.query = search.value;
    const pos = search.selectionStart;
    app.rerender();
    const again = document.querySelector('#cu-q');
    again.focus();
    again.setSelectionRange(pos, pos);
  });
  root.querySelectorAll('input[name="cu-gender"]').forEach((r) => r.addEventListener('change', () => ((ui.gender = r.value), app.rerender())));
  root.querySelector('#cu-status').addEventListener('change', (e) => ((ui.status = e.target.value), app.rerender()));
  root.querySelector('#cu-sort').addEventListener('change', (e) => ((ui.sort = e.target.value), app.rerender()));
  root.querySelector('#cu-add').addEventListener('click', () =>
    openDialog(customerForm(app, null), { onMount: (d) => bindCustomerForm(d, app, null) }),
  );
  root.querySelector('#cu-add-visit').addEventListener('click', () => openVisit(app, state.customers[0]?.id));
  root.querySelectorAll('[data-open]').forEach((b) => b.addEventListener('click', () => openCustomer(app, b.dataset.open)));
  root.querySelector('#cu-import').addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) return toast('5MB보다 큰 파일은 가져올 수 없습니다.');
    openImport(app, await file.text(), file.name);
    e.target.value = '';
  });
  root.querySelector('#cu-export').addEventListener('click', () => {
    download(`retenfit-wax-visits-${app.today}.csv`, exportVisitsCsv(state.customers, state.visits), 'text/csv;charset=utf-8');
  });
  root.querySelector('#cu-template').addEventListener('click', () => {
    download('retenfit-wax-visits-template.csv', templateCsv(), 'text/csv;charset=utf-8');
  });
}
