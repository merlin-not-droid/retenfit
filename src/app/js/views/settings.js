// 매장 설정: 기준 숫자, 매장 진단(이번 달 추천용), 시술 메뉴, 데이터 백업·복원
import { COMPETITION_LABEL, PRICE_POSITION_LABEL, TRADE_AREA_LABEL } from '../recommend.js';
import { defaultShop, GENDER_LABEL, uid } from '../state.js';
import { download, html, num, raw, toast, won } from '../ui.js';

const options = (labels, value) =>
  Object.entries(labels).map(([k, label]) => html`<option value="${k}" ${String(k) === String(value) ? raw('selected') : ''}>${label}</option>`);

function shopPanel(settings) {
  const s = { ...defaultShop(), ...(settings.shop ?? {}) };
  const percent = (v) => Math.round((Number(v) || 0) * 100);
  return html`
  <section class="panel" id="shop-diagnosis">
    <h2>매장 진단 <span class="badge">이번 달 추천에 사용</span></h2>
    <p class="help">방문 기록에는 없는 매장 정보입니다. 상권·가격대·예약 여유에 따라 추천 프로모션과 할인 수준이 달라집니다. 정확하지 않아도 괜찮으니 대략 입력하세요.</p>
    ${s.configured ? '' : html`<p class="alert caution">아직 입력하지 않아 기본값으로 추천하고 있습니다.</p>`}
    <form id="st-shop" class="form-grid">
      <label class="field">상권 <select name="tradeArea">${options(TRADE_AREA_LABEL, s.tradeArea)}</select></label>
      <label class="field">가격대 <select name="pricePosition">${options(PRICE_POSITION_LABEL, s.pricePosition)}</select>
        <span class="hint">주변 왁싱샵과 비교한 우리 가격</span></label>
      <label class="field">개업 연월 <input name="openedOn" type="month" value="${s.openedOn}" placeholder="2026-03"></label>
      <label class="field">일하는 사람 수 <input name="staffCount" type="number" min="1" max="20" value="${s.staffCount}" required></label>
      <label class="field">한 달 최대 시술 건수 <input name="capacityPerMonth" type="number" min="1" step="1" value="${s.capacityPerMonth}" required>
        <span class="hint">모든 예약이 찼을 때 받을 수 있는 건수</span></label>
      <label class="field">요즘 예약률(%) <input name="utilization" type="number" min="0" max="100" value="${percent(s.utilization)}" required></label>
      <label class="field">자주 비는 시간 비율(%) <input name="offPeakSlack" type="number" min="0" max="100" value="${percent(s.offPeakSlack)}" required>
        <span class="hint">평일 낮처럼 잘 안 차는 시간이 전체 영업시간에서 차지하는 비율</span></label>
      <label class="field">반경 500m 왁싱샵 수 <input name="competitorDensity" type="number" min="0" max="100" value="${s.competitorDensity}" required></label>
      <label class="field">주변의 첫 방문 할인 경쟁 <select name="competitorDiscountIntensity">${options(Object.fromEntries(COMPETITION_LABEL.map((l, i) => [i, l])), s.competitorDiscountIntensity)}</select></label>
      <label class="field">온라인 후기 수 <input name="reviewCount" type="number" min="0" value="${s.reviewCount}" required></label>
      <label class="field">평점(5점 만점) <input name="rating" type="number" min="0" max="5" step="0.1" value="${s.rating}" required></label>
      <label class="field">월 프로모션 예산(원) <input name="monthlyPromoBudget" type="number" min="0" step="1000" value="${s.monthlyPromoBudget}" required>
        <span class="hint">할인·선물 등에 한 달 동안 쓸 수 있는 금액</span></label>
      <label class="field">아직 안 쓴 선불 잔액(원) <input name="prepaidOutstanding" type="number" min="0" step="any" value="${s.prepaidOutstanding}">
        <span class="hint">회수권·정액권으로 받았지만 아직 시술하지 않은 금액</span></label>
      <label class="field check"><input type="checkbox" name="hasOnlineBooking" ${s.hasOnlineBooking ? raw('checked') : ''}> 온라인 예약을 받고 있음</label>
      <div class="btn-row end span-all"><button class="btn btn-primary" type="submit">매장 진단 저장</button></div>
    </form>
  </section>`;
}

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

  ${shopPanel(settings)}

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

  root.querySelector('#st-shop').addEventListener('submit', (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const num0 = (k, lo, hi) => Math.min(hi, Math.max(lo, Number(f.get(k)) || 0));
    settings.shop = {
      ...defaultShop(),
      configured: true,
      tradeArea: String(f.get('tradeArea')),
      pricePosition: String(f.get('pricePosition')),
      openedOn: /^\d{4}-\d{2}$/.test(String(f.get('openedOn'))) ? String(f.get('openedOn')) : '',
      staffCount: num0('staffCount', 1, 20),
      capacityPerMonth: num0('capacityPerMonth', 1, 100000),
      utilization: num0('utilization', 0, 100) / 100,
      offPeakSlack: num0('offPeakSlack', 0, 100) / 100,
      competitorDensity: num0('competitorDensity', 0, 100),
      competitorDiscountIntensity: num0('competitorDiscountIntensity', 0, 3),
      reviewCount: num0('reviewCount', 0, 1e6),
      rating: num0('rating', 0, 5),
      monthlyPromoBudget: num0('monthlyPromoBudget', 0, 1e9),
      prepaidOutstanding: num0('prepaidOutstanding', 0, 1e10),
      hasOnlineBooking: f.get('hasOnlineBooking') === 'on',
    };
    app.save();
    toast('매장 진단을 저장했습니다. ‘이번 달 추천’에 바로 반영됩니다.');
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
