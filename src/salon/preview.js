// 미용실 소개 페이지: 가상 매장 데이터를 대시보드와 같은 코드로 계산해 보여 줍니다
import { changeRows, esc, fill, initTabs, money, monthLabel, planRows, previousMonth, showFailure } from '../assets/js/preview-ui.js';
import { recordFromPlan } from '../assets/js/promo-engine/index.js';
import { crossSellRecommendations } from './app/js/ai.js';
import { DEFAULTS, clone, demoCustomers, economics } from './app/js/core.js';
import { dashboardModel, initializeDashboard, promoTitle, promotionGroups, today } from './app/js/dashboard.js';
import { buildSalonRecommendation } from './app/js/recommend.js';

function sampleStore(asOf = today(), over = {}) {
  const state = {
    settings: { ...clone(DEFAULTS), asOf, month: asOf.slice(0, 7), ...over },
    customers: demoCustomers(asOf),
    source: 'sample',
    plans: [],
  };
  initializeDashboard(state);
  return state;
}

function monthsPanels() {
  const now = sampleStore();
  const period = now.settings.month;
  const lastPeriod = previousMonth(period);
  const before = sampleStore(`${lastPeriod}-20`);
  const first = buildSalonRecommendation(before);
  // 지난달 첫 번째 추천만 실행했다고 가정한 예시
  const record = recordFromPlan(first.plan, lastPeriod, first.plan.selected.slice(0, 1).map((e) => e.device.id));
  now.monthlyPlans = [record];
  const second = buildSalonRecommendation(now);
  fill('hero-plan', planRows(second.plan));
  fill('hero-month', `${monthLabel(period)} 추천`);
  fill('month-before-title', `${monthLabel(lastPeriod)} 추천`);
  fill('month-before', planRows(first.plan));
  fill('month-now-title', `${monthLabel(period)}에 달라진 점`);
  fill('month-now', changeRows(second.plan.changes));
}

function storesPanels() {
  const asOf = today();
  const established = sampleStore(asOf);
  established.settings.shop = { configured: true, tradeArea: 'residential', openedOn: '2019-03', competitorDensity: 3, competitorDiscountIntensity: 1, reviewCount: 180, rating: 4.7, offPeakSlack: 0.2, hasOnlineBooking: true };
  const small = sampleStore(asOf, { salon: '가상 1인 샵', stylists: 1, stylistSalary: 2200000, assistants: 0, assistantSalary: 0, rent: 900000, otherFixed: 400000, budget: 150000, targetProfit: 800000 });
  small.settings.services = small.settings.services.map((v) => ({ ...v, price: Math.round(v.price * 0.8 / 1000) * 1000, volume: Math.round(v.volume * 0.45), competitor: v.competitor }));
  small.customers = small.customers.filter((_, i) => i % 3 === 0).map((c) => ({ ...c, visits: Math.min(c.visits, 2) }));
  const openedAt = new Date(`${asOf.slice(0, 7)}-01T00:00:00Z`);
  openedAt.setUTCMonth(openedAt.getUTCMonth() - 4);
  const opened = openedAt.toISOString().slice(0, 7);
  small.settings.shop = { configured: true, tradeArea: 'university', openedOn: opened, competitorDensity: 9, competitorDiscountIntensity: 3, reviewCount: 6, rating: 4.3, offPeakSlack: 0.45, hasOnlineBooking: true };
  initializeDashboard(small);
  fill('store-a', planRows(buildSalonRecommendation(established).plan));
  fill('store-b', planRows(buildSalonRecommendation(small).plan));
}

function tabPanels() {
  const state = sampleStore();
  const d = dashboardModel(state);
  fill('tab-risk-body', d.risk.length
    ? `<div class="table-scroll"><table class="mini-table"><thead><tr><th scope="col">고객</th><th scope="col" class="num">평소 간격</th><th scope="col" class="num">지난 일수</th><th scope="col">신호</th></tr></thead><tbody>
      ${d.risk.slice(0, 6).map((c) => `<tr><td><b>${esc(c.id)}</b><small>${c.visits}회 방문</small></td><td class="num">${c.cycle}일</td><td class="num">${c.elapsed}일<small>${c.ratio.toFixed(1)}배</small></td><td>${c.late ? '간격 늘어남' : ''}${c.late && c.down ? ' · ' : ''}${c.down ? '펌·염색에서 커트로' : ''}</td></tr>`).join('')}
      </tbody></table></div>`
    : '<p class="muted">멀어지는 단골이 없습니다.</p>');
  const groups = promotionGroups(state);
  fill('tab-offer-body', `<div class="table-scroll"><table class="mini-table"><thead><tr><th scope="col">고객군</th><th scope="col">제안</th><th scope="col" class="num">1회 잔여이익</th><th scope="col" class="num">목표이익</th></tr></thead><tbody>
    ${groups.map((g) => {
    const p = g.recommended;
    const e = economics(state.settings, p.service, p);
    return `<tr><td><b>${esc(g.name)}</b><small>대상 ${g.audience.length}명</small></td><td>${esc(promoTitle(p))}</td><td class="num">${money(e.residual)}</td><td class="num">${money(e.target)}<small>${e.safe ? '충족' : '미달'}</small></td></tr>`;
  }).join('')}</tbody></table></div>`);
  const cross = crossSellRecommendations(state.customers, state.settings, undefined, state.growthSettings);
  fill('tab-cross-body', cross.rows.length
    ? `<div class="table-scroll"><table class="mini-table"><thead><tr><th scope="col">고객</th><th scope="col" class="num">커트</th><th scope="col">비슷한 손님의 펌 이력</th></tr></thead><tbody>
      ${cross.rows.slice(0, 6).map((r) => `<tr><td><b>${esc(r.id)}</b></td><td class="num">${r.customer.history.cut}회</td><td>${r.peers.length}명 중 ${r.positivePeers}명</td></tr>`).join('')}
      </tbody></table></div><p class="muted cta-note">비슷한 손님의 이력을 보여 줄 뿐, 구매 확률이 아닙니다. 실제 관심은 상담에서 확인합니다.</p>`
    : '<p class="muted">비교할 이력이 더 필요합니다.</p>');
}

initTabs(document.getElementById('preview'));
const tasks = [[monthsPanels, ['hero-plan', 'month-before', 'month-now']], [storesPanels, ['store-a', 'store-b']], [tabPanels, ['tab-risk-body', 'tab-offer-body', 'tab-cross-body']]];
for (const [task, ids] of tasks) {
  try {
    task();
  } catch (e) {
    console.error(e);
    showFailure(ids);
  }
}
