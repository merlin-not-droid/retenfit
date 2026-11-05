// 매장 설정: 기준 숫자, 시술 메뉴, 데이터 백업·복원
import { GENDER_LABEL, uid } from '../state.js';
import { download, html, num, raw, toast, won } from '../ui.js';

export const title = '매장 설정';

export function render(app) {
  const { settings, meta, customers, visits } = app.state;
  return html`
  <section class="panel intro">
    <h1>${title}</h1>
    <p class="help">여기 숫자로 할인 경고·추천 할인율·공헌이익·다음 방문일을 계산합니다.</p>
    <form id="st-basic" class="form-grid">
      <label class="field">매장 이름 <input name="shopName" value="${settings.shopName}" maxlength="30" placeholder="안내 문구 맨 앞에 들어갑니다"></label>
      <label class="field">매장 연락처 <input name="shopContact" value="${settings.shopContact}" maxlength="30" inputmode="tel" placeholder="예약 문의·수신 거부용"></label>
      <label class="field">1회 최소 공헌이익(원)
        <input name="minContribution" type="number" min="0" step="1000" value="${settings.minContribution}" required>
        <span class="hint">할인 후 1회 시술에서 최소한 남겨야 하는 금액</span>
      </label>
      <label class="field">재방문 관찰 기간(일)
        <input name="windowDays" type="number" min="14" max="180" value="${settings.windowDays}" required>
        <span class="hint">첫 방문 후 이 기간 안에 다시 오면 ‘재방문’</span>
      </label>
      <label class="field">재방문율 가정(%)
        <input name="assumedRevisitRate" type="number" min="0" max="100" value="${Math.round(settings.assumedRevisitRate * 100)}" required>
        <span class="hint">방문 기록이 충분하지 않을 때 쓰는 값</span>
      </label>
      <div class="btn-row end span-all"><button class="btn btn-primary" type="submit">저장</button></div>
    </form>
  </section>

  <section class="panel">
    <h2>시술 메뉴</h2>
    ${settings.menuIsExample ? html`<p class="alert caution">지금 값은 <b>예시</b>입니다. 매장 가격과 변동비로 바꿔 저장하면 이 표시가 사라집니다.</p>` : ''}
    <p class="help">변동비는 1회 시술에 드는 재료비와 인건비(시간 × 시급 등) 추정치입니다. 방문 주기는 다음 방문 예정일 계산에 쓰는 기본값이며, 손님마다 따로 정할 수도 있습니다.</p>
    <form id="st-menu">
      <div class="table-wrap"><table class="menu-table">
        <thead><tr><th scope="col">시술</th><th scope="col">성별</th><th scope="col">정가(원)</th><th scope="col">변동비(원)</th><th scope="col">기본 주기(일)</th><th scope="col"><span class="sr-only">삭제</span></th></tr></thead>
        <tbody>${settings.menu.map((m) => html`<tr data-id="${m.id}">
          <td><input name="name" value="${m.name}" required maxlength="20" aria-label="시술 이름"></td>
          <td><select name="gender" aria-label="성별">${['A', 'F', 'M'].map((g) => html`<option value="${g}" ${g === m.gender ? raw('selected') : ''}>${GENDER_LABEL[g]}</option>`)}</select></td>
          <td><input name="price" type="number" min="0" step="1000" value="${m.price}" required aria-label="정가"></td>
          <td><input name="variableCost" type="number" min="0" step="500" value="${m.variableCost}" required aria-label="변동비"></td>
          <td><input name="cycleDays" type="number" min="7" max="180" value="${m.cycleDays}" required aria-label="기본 주기"></td>
          <td><button type="button" class="btn btn-ghost btn-sm" data-remove="${m.id}" aria-label="${m.name} 삭제">삭제</button></td>
        </tr>`)}</tbody>
      </table></div>
      <div class="btn-row">
        <button type="button" class="btn btn-line btn-sm" id="st-add-row">시술 추가</button>
        <button type="submit" class="btn btn-primary btn-sm">메뉴 저장</button>
      </div>
    </form>
  </section>

  <section class="panel">
    <h2>데이터 관리</h2>
    <p class="help">손님 ${num(customers.length)}명 · 방문 기록 ${num(visits.length)}건이 이 기기의 브라우저에 저장되어 있습니다.
      ${meta.lastBackupAt ? `마지막 백업: ${meta.lastBackupAt}` : '아직 백업한 적이 없습니다.'}</p>
    <div class="btn-row">
      <button type="button" class="btn btn-primary btn-sm" id="st-backup">백업 파일 내려받기</button>
      <label class="btn btn-line btn-sm file-btn">백업 파일로 복원<input type="file" id="st-restore" accept=".json,application/json" class="sr-only"></label>
      <button type="button" class="btn btn-line btn-sm" data-action="load-sample">샘플 데이터 불러오기</button>
      <button type="button" class="btn btn-ghost btn-sm danger" id="st-clear">모든 데이터 지우기</button>
    </div>
    <p class="help small">브라우저 데이터를 지우거나 기기를 바꾸면 기록이 사라집니다. 백업 파일을 정기적으로 내려받아 안전한 곳에 보관하세요. 백업 파일에는 손님 정보가 들어 있으니 공유하지 마세요.</p>
  </section>`;
}

export function bind(root, app) {
  const { state } = app;
  const { settings } = state;

  root.querySelector('#st-basic').addEventListener('submit', (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    settings.shopName = String(f.get('shopName')).trim();
    settings.shopContact = String(f.get('shopContact')).trim();
    settings.minContribution = Math.max(0, Number(f.get('minContribution')) || 0);
    settings.windowDays = Math.min(180, Math.max(14, Number(f.get('windowDays')) || 60));
    settings.assumedRevisitRate = Math.min(100, Math.max(0, Number(f.get('assumedRevisitRate')) || 0)) / 100;
    app.save();
    app.resetViews();
    toast('저장했습니다.');
    app.rerender();
  });

  const readMenu = () =>
    [...root.querySelectorAll('#st-menu tbody tr')].map((tr) => {
      const v = (n) => tr.querySelector(`[name="${n}"]`).value;
      return {
        id: tr.dataset.id,
        name: v('name').trim(),
        gender: v('gender'),
        price: Number(v('price')) || 0,
        variableCost: Number(v('variableCost')) || 0,
        cycleDays: Number(v('cycleDays')) || 35,
      };
    });

  root.querySelector('#st-menu').addEventListener('submit', (e) => {
    e.preventDefault();
    const menu = readMenu();
    const dup = menu.find((m, i) => menu.findIndex((x) => x.name === m.name && x.gender === m.gender) !== i);
    if (dup) return toast(`‘${dup.name}(${GENDER_LABEL[dup.gender]})’이 두 번 있습니다.`);
    const bad = menu.find((m) => m.variableCost > m.price);
    if (bad && !confirm(`‘${bad.name}’의 변동비(${won(bad.variableCost)})가 정가보다 큽니다. 그대로 저장할까요?`)) return;
    settings.menu = menu;
    settings.menuIsExample = false;
    app.save();
    toast('시술 메뉴를 저장했습니다.');
    app.rerender();
  });
  root.querySelector('#st-add-row').addEventListener('click', () => {
    settings.menu = readMenu();
    settings.menu.push({ id: uid('m'), name: '새 시술', gender: 'A', price: 30000, variableCost: 8000, cycleDays: 28 });
    app.rerender();
  });
  root.querySelectorAll('[data-remove]').forEach((b) =>
    b.addEventListener('click', () => {
      settings.menu = readMenu().filter((m) => m.id !== b.dataset.remove);
      app.rerender();
    }),
  );

  root.querySelector('#st-backup').addEventListener('click', () => {
    state.meta.lastBackupAt = app.today;
    app.save();
    download(`waxfit-backup-${app.today}.json`, JSON.stringify(state, null, 2), 'application/json');
    app.rerender();
  });
  root.querySelector('#st-restore').addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (!Array.isArray(data.customers) || !Array.isArray(data.visits) || !data.settings) throw new Error('형식');
      if (!confirm(`백업의 손님 ${data.customers.length}명 · 방문 ${data.visits.length}건으로 지금 데이터를 바꿀까요?`)) return;
      app.replaceState(data);
      toast('복원했습니다.');
    } catch {
      toast('WAXFIT 백업 파일이 아닙니다.');
    } finally {
      e.target.value = '';
    }
  });
  root.querySelector('#st-clear').addEventListener('click', () => {
    if (!confirm('손님·방문 기록·저장한 프로모션을 모두 지울까요? 시술 메뉴와 매장 설정은 남습니다. 되돌릴 수 없습니다.')) return;
    app.clearData();
    toast('모든 기록을 지웠습니다.');
    app.rerender();
  });
}
