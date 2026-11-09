import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ACQUISITION, RETENTION } from '../src/wax/app/js/catalog.js';
import { CATALOG_BY_ID, WAX_TO_ENGINE } from '../src/assets/js/promo-engine/index.js';
import { buildRecommendation, monthsSince, promotionMessage, rankOptions, shopContext } from '../src/wax/app/js/recommend.js';
import { sampleState } from '../src/wax/app/js/sample.js';
import { defaultShop, defaultState } from '../src/wax/app/js/state.js';
import { render } from '../src/wax/app/js/views/recommend.js';

const asOf = '2026-11-05';
const planIds = (r) => r.plan.selected.map((e) => e.device.id).sort().join(',');

test('왁싱샵 프로모션 10종이 모두 추천 엔진 장치와 연결된다', () => {
  for (const p of [...ACQUISITION, ...RETENTION]) {
    const id = WAX_TO_ENGINE[p.id];
    assert.ok(id && CATALOG_BY_ID[id], `${p.id} → 엔진 장치 없음`);
  }
});

test('매장 진단 → 엔진 입력: 개업 개월 수·범위 보정', () => {
  assert.equal(monthsSince('2026-02', asOf), 9);
  assert.equal(monthsSince('', asOf), null);
  const ctx = shopContext({ shop: { ...defaultShop(), openedOn: '2025-11', utilization: 1.4, competitorDiscountIntensity: 9 } }, asOf);
  assert.equal(ctx.monthsOpen, 12);
  assert.equal(ctx.utilization, 1);
  assert.equal(ctx.competitorDiscountIntensity, 3);
  // 저장된 설정에 매장 진단이 없어도(이전 버전 백업) 기본값으로 동작
  assert.equal(shopContext({}, asOf).tradeArea, 'residential');
});

test('샘플 데이터로 이번 달 추천: 플랜·왁싱샵 옵션 순위·안내 문구', () => {
  const r = buildRecommendation(sampleState(asOf), asOf);
  assert.ok(r.configured && r.dataReady);
  assert.ok(r.plan.selected.length >= 1 && r.plan.selected.length <= 3, '2인 매장은 동시 운영 3개 이하');
  assert.ok(r.plan.totals.costPerMonth <= 400000, '월 예산 안');
  const acq = rankOptions(r, ACQUISITION);
  const ranks = [...acq.values()].map((x) => x.rank).sort();
  assert.deepEqual(ranks, ranks.map((_, i) => i + 1), '순위는 1부터 연속');
  for (const x of acq.values()) if (x.rate !== null) assert.ok(x.rate >= 0 && x.rate <= 0.7);
  for (const e of r.plan.selected) {
    const text = promotionMessage(e, { shopName: '샘플 왁싱샵', shopContact: '010-0000-0000' });
    assert.ok(!text.includes('원가') && !text.includes('{benefit}'), text);
    if (e.device.requires?.consent) assert.ok(text.startsWith('(광고) 샘플 왁싱샵') && text.includes('수신거부'));
  }
});

test('매장 진단이 다르면 추천이 달라진다(획일화 방지)', () => {
  const base = sampleState(asOf);
  const busy = structuredClone(base);
  busy.settings.shop = { ...busy.settings.shop, tradeArea: 'residential', pricePosition: 'premium', utilization: 0.9, offPeakSlack: 0.05, staffCount: 1, monthlyPromoBudget: 150000 };
  const a = buildRecommendation(base, asOf);
  const b = buildRecommendation(busy, asOf);
  assert.notEqual(planIds(a), planIds(b));
  // 예약률 90% 매장은 신규 유입 할인을 5% 넘게 허용하지 않음
  for (const e of b.plan.byObjective.acquire) {
    if (e.device.segment !== 'prospect' || !['percent', 'amount'].includes(e.device.lever.kind)) continue;
    const max = e.levels.filter((l) => l.marginOk).map((l) => (e.device.lever.kind === 'amount' ? l.level / b.store.avgTicket : l.level * (e.device.lever.base ?? 1)));
    assert.ok(max.every((v) => v <= 0.05 + 1e-9), `${e.device.id}`);
  }
});

test('기록이 없는 새 매장도 오류 없이 기본값으로 추천하고 안내한다', () => {
  const r = buildRecommendation(defaultState(), asOf);
  assert.equal(r.configured, false);
  assert.equal(r.dataReady, false);
  assert.ok(r.plan.selected.length >= 1);
  const out = String(render({ recommendation: () => r }));
  assert.ok(out.includes('매장 진단을 아직 입력하지 않아'));
  assert.ok(out.includes('방문 기록이 적어'));
});

test('이번 달 추천 화면: 목적 비중·장벽·실행 플랜이 그려진다', () => {
  const r = buildRecommendation(sampleState(asOf), asOf);
  const out = String(render({ recommendation: () => r }));
  for (const text of ['이번 달 실행 플랜', '어디서 이익이 새나요', '손님을 막는 심리 장벽', '목적별 다른 선택지', '왜 우리 매장에 이 추천인가요?', '이번 달 달라진 점']) assert.ok(out.includes(text), text);
  assert.equal((out.match(/<h1>/g) ?? []).length, 1);
  assert.ok(!out.includes('undefined') && !out.includes('NaN'));
});
