// 왁싱샵 소개 페이지: 가상 매장 데이터를 대시보드와 같은 코드로 계산해 보여 줍니다
import { changeRows, fill, monthLabel, planRows, previousMonth, showFailure } from '../assets/js/preview-ui.js';
import { recordFromPlan } from '../assets/js/promo-engine/index.js';
import { today } from './app/js/dates.js';
import { buildRecommendation } from './app/js/recommend.js';
import { sampleState } from './app/js/sample.js';

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
  fill('hero-plan', planRows(second.plan, 3));
  fill('hero-month', `${monthLabel(period)} 추천`);
  fill('month-before-title', `${monthLabel(lastPeriod)} 추천`);
  fill('month-before', planRows(first.plan));
  fill('month-now-title', `${monthLabel(period)}에 달라진 점`);
  fill('month-now', changeRows(second.plan.changes));
}

try {
  monthsPanels();
} catch (e) {
  console.error(e);
  showFailure(['hero-plan', 'month-before', 'month-now']);
}
