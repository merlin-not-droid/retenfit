// WAXFIT 앱 뼈대: 화면 전환(#/경로), 저장, 공용 계산 도우미
import { analyze } from './analytics.js';
import { diffDays, today } from './dates.js';
import { sampleState } from './sample.js';
import { defaultState, loadState, menuItem, saveState } from './state.js';
import { html, toast } from './ui.js';
import * as acquisition from './views/acquisition.js';
import * as analyticsView from './views/analytics.js';
import * as customers from './views/customers.js';
import * as retention from './views/retention.js';
import * as settingsView from './views/settings.js';

const ROUTES = { acquisition, retention, analytics: analyticsView, customers, settings: settingsView };
const DEFAULT_ROUTE = 'acquisition';
const MIN_COMPLETED = 20; // 실제 재방문율을 쓰려면 관찰 완료 손님이 이만큼은 있어야 함

const loaded = loadState();
let genderIndex = new Map();
let lastRoute = null;

const app = {
  state: loaded.state,
  persistent: loaded.persistent,
  today: today(),

  save() {
    reindex();
    if (!saveState(app.state) && app.persistent) toast('저장하지 못했습니다. 브라우저 저장 공간을 확인해 주세요.');
  },
  rerender: () => render(),
  genderOf: (id) => genderIndex.get(id) ?? null,
  costOf(visit) {
    if (typeof visit.variableCost === 'number' && Number.isFinite(visit.variableCost)) return visit.variableCost;
    return menuItem(app.state.settings, visit.service, app.genderOf(visit.customerId))?.variableCost ?? null;
  },
  /** 성별 재방문율: 관찰 완료 손님이 충분하면 실제 값, 아니면 설정의 가정값 */
  revisitRateFor(gender) {
    const { settings, visits } = app.state;
    const r = analyze(visits, { windowDays: settings.windowDays, asOf: app.today, gender, genderOf: app.genderOf });
    if (r.totals.completed >= MIN_COMPLETED) return { rate: r.totals.rate, completed: r.totals.completed, source: 'data' };
    return { rate: settings.assumedRevisitRate, completed: r.totals.completed, source: 'assumed' };
  },
  clearData() {
    Object.assign(app.state, { customers: [], visits: [], plans: [] });
    app.state.meta.demo = false;
    app.save();
  },
  replaceState(data) {
    const base = defaultState();
    app.state = {
      ...base,
      ...data,
      settings: { ...base.settings, ...data.settings },
      meta: { ...base.meta, ...data.meta },
    };
    app.save();
    app.resetViews();
    render();
  },
  resetViews() {
    analyticsView.reset?.();
  },
};
function reindex() {
  genderIndex = new Map(app.state.customers.map((c) => [c.id, c.gender]));
}
reindex();

function loadSample() {
  const hasOwn = !app.state.meta.demo && (app.state.customers.length || !app.state.settings.menuIsExample);
  if (hasOwn && !confirm('지금 데이터와 매장 설정을 샘플 데이터로 바꿀까요? 먼저 백업해 두기를 권합니다.')) return;
  app.replaceState(sampleState(app.today));
  toast('샘플 데이터(가상 손님)를 불러왔습니다.');
}

function banner() {
  const { state } = app;
  const items = [];
  if (!app.persistent) {
    items.push(html`<p class="banner bad">이 브라우저에서는 기록이 저장되지 않습니다(사생활 보호 모드 등). 창을 닫으면 사라지니 일반 창에서 쓰세요.</p>`);
  }
  if (loaded.corrupted) items.push(html`<p class="banner bad">저장된 데이터를 읽지 못해 빈 상태로 시작했습니다. 백업 파일이 있다면 매장 설정에서 복원하세요.</p>`);
  if (state.meta.demo) {
    items.push(html`<div class="banner info"><p><b>샘플 데이터</b>(가상의 손님)를 보고 있습니다. 실제 매장 결과가 아닙니다.</p><button type="button" class="btn btn-line btn-sm" data-action="start-own">샘플 지우고 내 매장 시작</button></div>`);
  } else if (!state.customers.length && !state.visits.length) {
    items.push(html`<div class="banner welcome"><p><b>WAXFIT 데모</b>입니다. 가입 없이 쓸 수 있고, 기록은 이 기기에만 저장됩니다.</p>
      <div class="btn-row"><button type="button" class="btn btn-primary btn-sm" data-action="load-sample">샘플 데이터로 둘러보기</button><a class="btn btn-line btn-sm" href="#/settings">내 매장 숫자 입력</a></div></div>`);
  } else if (state.visits.length) {
    const days = state.meta.lastBackupAt ? diffDays(state.meta.lastBackupAt, app.today) : null;
    if (days === null || days >= 14) {
      items.push(html`<p class="banner info">${days === null ? '아직 백업한 적이 없습니다.' : `마지막 백업 후 ${days}일 지났습니다.`} <a href="#/settings">백업 파일 내려받기</a></p>`);
    }
  }
  return html`${items}`;
}

/** 다시 그린 뒤에도 키보드 포커스가 같은 입력에 머물도록 */
function focusKey(el) {
  if (!el || el === document.body || !el.closest('#view, #banner')) return null;
  if (el.id) return `#${CSS.escape(el.id)}`;
  if (el.name) return `[name="${CSS.escape(el.name)}"]${el.type === 'radio' ? `[value="${CSS.escape(el.value)}"]` : ''}`;
  return null;
}

function render() {
  const route = /^#\/(\w+)/.exec(location.hash)?.[1];
  const key = ROUTES[route] ? route : DEFAULT_ROUTE;
  const view = ROUTES[key];
  const sameRoute = key === lastRoute;
  const focus = sameRoute ? focusKey(document.activeElement) : null;
  const scroll = window.scrollY;

  document.querySelectorAll('.app-tabs a').forEach((a) => {
    if (a.dataset.route === key) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  document.getElementById('shop-name').textContent = app.state.settings.shopName || '내 매장';
  const bannerBox = document.getElementById('banner');
  bannerBox.innerHTML = String(banner());
  const root = document.getElementById('view');
  root.innerHTML = String(view.render(app));
  view.bind?.(root, app);

  document.querySelectorAll('[data-action="load-sample"]').forEach((b) => b.addEventListener('click', loadSample));
  document.querySelectorAll('[data-action="start-own"]').forEach((b) =>
    b.addEventListener('click', () => {
      if (!confirm('샘플 손님과 방문 기록을 지우고 빈 상태로 시작할까요? (시술 메뉴는 예시 값으로 남습니다)')) return;
      app.clearData();
      render();
    }),
  );
  document.title = `${view.title} | WAXFIT 앱`;

  if (sameRoute) {
    window.scrollTo(0, scroll);
    if (focus) document.querySelector(focus)?.focus({ preventScroll: true });
  } else {
    if (lastRoute !== null) {
      window.scrollTo(0, 0);
      root.focus({ preventScroll: true });
    }
    lastRoute = key;
  }
}

window.addEventListener('hashchange', render);
window.addEventListener('storage', (e) => {
  // 다른 탭에서 바뀐 경우 다시 읽기
  if (e.key && e.key.startsWith('waxfit:')) {
    app.state = loadState().state;
    reindex(); // 다시 저장하지 않음 (탭끼리 저장을 주고받지 않도록)
    render();
  }
});
render();
