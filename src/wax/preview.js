// 왁싱샵 소개 페이지: 가상 매장 데이터를 대시보드와 같은 코드로 계산해 보여 줍니다
import { changeRows, esc, fill, initTabs, money, monthLabel, pct, planRows, previousMonth, showFailure } from '../assets/js/preview-ui.js';
import { recordFromPlan } from '../assets/js/promo-engine/index.js';
import { analyze, NO_PROMOTION } from './app/js/analytics.js';
import { today } from './app/js/dates.js';
import { evaluateAcquisition } from './app/js/economics.js';
import { buildRecommendation } from './app/js/recommend.js';
import { sampleState } from './app/js/sample.js';
import { GENDER_LABEL, nextVisitInfo, STATUS_LABEL } from './app/js/state.js';

function monthsPanels() {
  const asOf = today();
  const period = asOf.slice(0, 7);
  const lastPeriod = previousMonth(period);
  const lastAsOf = `${lastPeriod}-20`;
  const first = buildRecommendation(sampleState(lastAsOf), lastAsOf);
  const now = sampleState(asOf);
  // 지난달 첫 번째 추천만 실행했다고 가정한 예시
  now.monthlyPlans = [recordFromPlan(first.plan, lastPeriod, first.plan.selected.slice(0, 1).map((e) => e.device.id))];
  const second = buildRecommendation(now, asOf);
  fill('hero-plan', planRows(second.plan));
  fill('hero-month', `${monthLabel(period)} 추천`);
  fill('month-before-title', `${monthLabel(lastPeriod)} 추천`);
  fill('month-before', planRows(first.plan));
  fill('month-now-title', `${monthLabel(period)}에 달라진 점`);
  fill('month-now', changeRows(second.plan.changes));
}

function storesPanels() {
  const asOf = today();
  const openedMonthsAgo = (n) => {
    const d = new Date(`${asOf.slice(0, 7)}-01T00:00:00Z`);
    d.setUTCMonth(d.getUTCMonth() - n);
    return d.toISOString().slice(0, 7);
  };
  const a = sampleState(asOf);
  a.settings.shop = { ...a.settings.shop, tradeArea: 'station', openedOn: openedMonthsAgo(4), staffCount: 1, capacityPerMonth: 140, utilization: 0.4, offPeakSlack: 0.5, reviewCount: 9, rating: 4.6, competitorDensity: 8, competitorDiscountIntensity: 3, monthlyPromoBudget: 200000 };
  const b = sampleState(asOf);
  b.settings.shop = { ...b.settings.shop, tradeArea: 'residential', openedOn: openedMonthsAgo(40), staffCount: 3, capacityPerMonth: 320, utilization: 0.78, offPeakSlack: 0.15, reviewCount: 240, rating: 4.8, competitorDensity: 2, competitorDiscountIntensity: 0, monthlyPromoBudget: 600000 };
  fill('store-a', planRows(buildRecommendation(a, asOf).plan));
  fill('store-b', planRows(buildRecommendation(b, asOf).plan));
}

function tabPanels() {
  const asOf = today();
  const state = sampleState(asOf);
  const rows = state.customers
    .map((c) => ({ c, info: nextVisitInfo(c, state.visits, state.settings, asOf) }))
    .filter(({ info }) => ['soon', 'overdue'].includes(info.status))
    .sort((x, y) => x.info.daysLeft - y.info.daysLeft)
    .slice(0, 6);
  fill('tab-due-body', rows.length
    ? `<div class="table-scroll"><table class="mini-table"><thead><tr><th scope="col">손님</th><th scope="col">시술</th><th scope="col" class="num">주기</th><th scope="col">다음 방문</th><th scope="col">상태</th></tr></thead><tbody>
      ${rows.map(({ c, info }) => `<tr><td><b>${esc(c.alias ?? c.name ?? c.id)}</b><small>${esc(GENDER_LABEL[c.gender] ?? '')}</small></td><td>${esc(info.lastService)}</td><td class="num">${info.cycleDays}일</td><td>${esc(info.nextDate)}</td><td>${esc(STATUS_LABEL[info.status])}</td></tr>`).join('')}
      </tbody></table></div>`
    : '<p class="muted">다시 올 때가 된 손님이 없습니다.</p>');

  const price = 70000;
  const variableCost = 20000;
  const minContribution = 10000;
  const rates = [0.1, 0.2, 0.3, 0.5, 0.7];
  fill('tab-discount-body', `<p class="muted">브라질리언(여성) 정가 ${money(price)}, 1회 변동비 ${money(variableCost)}, 최소 이익 ${money(minContribution)}, 재방문율 40%로 가정했을 때</p>
    <div class="table-scroll"><table class="mini-table"><thead><tr><th scope="col" class="num">첫 방문 할인</th><th scope="col" class="num">첫 결제액</th><th scope="col" class="num">첫 방문 이익</th><th scope="col" class="num">회수에 필요한 재방문율</th><th scope="col">판단</th></tr></thead><tbody>
    ${rates.map((discountRate) => {
    const r = evaluateAcquisition({ price, variableCost, discountRate, minContribution, revisitRate: 0.4 });
    const zone = { safe: '재방문으로 회수', caution: '회수 부족', danger: '최소 이익 미달' }[r.zone];
    return `<tr><td class="num">${pct(discountRate)}</td><td class="num">${money(r.first.paid)}</td><td class="num">${money(r.first.contribution)}</td><td class="num">${pct(r.recoveryRate)}</td><td>${zone}</td></tr>`;
  }).join('')}</tbody></table></div>`);

  const costOf = (v) => (typeof v.variableCost === 'number' ? v.variableCost : 20000);
  const genders = new Map(state.customers.map((c) => [c.id, c.gender]));
  const r = analyze(state.visits, { windowDays: state.settings.windowDays, asOf, gender: 'all', genderOf: (id) => genders.get(id), costOf });
  fill('tab-promo-body', `<div class="table-scroll"><table class="mini-table"><thead><tr><th scope="col">프로모션</th><th scope="col" class="num">관찰 완료</th><th scope="col" class="num">재방문율</th><th scope="col" class="num">손님 1명당 이익</th></tr></thead><tbody>
    ${r.byPromotion.map((g) => `<tr><td><b>${esc(g.label === NO_PROMOTION ? '프로모션 없음' : g.label)}</b></td><td class="num">${g.completed}명</td><td class="num">${pct(g.rate)}</td><td class="num">${money(g.contributionPerCustomer)}</td></tr>`).join('')}
    </tbody></table></div>`);
}

initTabs(document.getElementById('preview'));
const tasks = [[monthsPanels, ['hero-plan', 'month-before', 'month-now']], [storesPanels, ['store-a', 'store-b']], [tabPanels, ['tab-due-body', 'tab-discount-body', 'tab-promo-body']]];
for (const [task, ids] of tasks) {
  try {
    task();
  } catch (e) {
    console.error(e);
    showFailure(ids);
  }
}
