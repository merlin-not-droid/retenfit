// 자동 생성 — 직접 고치지 마세요. promo-engine/src/engine.ts를 고친 뒤 scripts/build-browser.mjs로 다시 만듭니다.
                                                                                                                                                
import { OBJECTIVES } from './types.js';
import { CATALOG } from './catalog.js';
import { barrierScores, diagnose } from './diagnose.js';
                                              
import { contextualPrior, evaluate } from './score.js';
import { responseMultiplier } from './intensity.js';
import { isProvenGood, monthlyChanges, priorRecords, rotationFor } from './monthly.js';
import { assemble } from './portfolio.js';
                                                      
import { hashString, rng } from './util.js';

                                   
                                                    
                            
                                            
                             
                                     
                          
                                                 
                  
                              
                            
                    
                            
                  
 

/**
 * 지난달과 똑같은 조합이면, 유지할 근거가 가장 약한 장치부터 빼 보면서 새 장치가 들어오는 조합을 찾는다.
 * 효과가 확인된 장치는 빼지 않는다. 예산·일손 제약을 지키는 조합이 없으면 그대로 둔다.
 */
function withSomethingNew(pool              , store              , diag           , lastIds                    )                  {
  const first = assemble(pool, store, diag);
  if (!lastIds) return first;
  const isNew = (e            ) => !lastIds.has(e.device.id);
  if (first.selected.some(isNew) || !pool.some((e) => isNew(e) && e.score > 0)) return first;
  const removable = [...first.selected].filter((e) => !isProvenGood(e.posterior)).reverse();
  for (const out of removable) {
    const next = assemble(pool.filter((e) => e.device.id !== out.device.id), store, diag);
    if (next.selected.some(isNew) && next.selected.length >= first.selected.length) {
      next.skipped.push({ id: out.device.id, reason: `${out.device.name} — 이번 달은 새로운 시도를 위해 쉬어 갑니다` });
      return next;
    }
  }
  return first;
}

/** 매장 1곳의 이번 기간 추천 플랜 */
export function recommend(store              , opts                   = {})       {
  const catalog = opts.catalog ?? CATALOG;
  const listSize = opts.listSize ?? 4;
  const minFit = opts.minFit ?? 0.6;
  const period = opts.period ?? String(store.month);
  const hasMonthlyHistory = /^\d{4}-\d{2}$/.test(period);
  const diag = diagnose(store);
  const rand = rng(hashString(`${store.id}|${opts.period ?? store.month}`));
  const stable = Boolean(store.preferences?.stableMode);

  const storeIndex = new Map                      ((opts.stores ?? []).map((x) => [x.id, x]));
  storeIndex.set(store.id, store);
  const barrierCache = new Map                                                                    ();
  const barriersOf = (s              ) => {
    if (!barrierCache.has(s.id)) barrierCache.set(s.id, s.id === store.id ? diag.barriers : barrierScores(s));
    return barrierCache.get(s.id) ;
  };

  const all                                  = { acquire: [], convert: [], loyalize: [], retain: [] };
  const excluded                   = [];
  for (const d of catalog) {
    if (!d.businessTypes.includes(store.businessType)) continue;
    const evidence             = [];
    for (const r of opts.results ?? []) {
      if (r.promotionId !== d.id) continue;
      const s = storeIndex.get(r.storeId);
      if (!s) continue;
      // 실험 강도가 기준 강도와 다르면 사전 효과도 그 강도로 환산해야 보정계수가 치우치지 않는다
      const atLevel = r.level !== undefined ? responseMultiplier(d.lever, r.level, s) : 1;
      evidence.push({ store: s, result: r, priorUplift: contextualPrior(d, s, barriersOf(s)).prior * atLevel });
    }
    for (const o of OBJECTIVES) {
      if ((d.objectives[o] ?? 0) < minFit) continue;
      const ev = evaluate(d, o, store, { diag, evidence, rand, stable });
      if ('excluded' in ev) {
        if (!excluded.some((x) => x.id === d.id)) excluded.push({ id: d.id, reason: ev.excluded });
        continue;
      }
      if (hasMonthlyHistory) {
        const rotation = rotationFor(d.id, ev.posterior, period, opts.history);
        ev.score *= rotation.factor;
        ev.rotation = rotation;
        if (rotation.note) ev.reasons.push(rotation.note);
      }
      all[o].push(ev);
    }
  }
  for (const o of OBJECTIVES) all[o].sort((a, b) => b.score - a.score);

  const last = hasMonthlyHistory ? priorRecords(opts.history, period)[0] : null;
  const { selected, skipped } = withSomethingNew(
    OBJECTIVES.flatMap((o) => all[o]),
    store,
    diag,
    last ? new Set(last.selected.map((x) => x.id)) : null,
  );
  const byObjective = Object.fromEntries(OBJECTIVES.map((o) => [o, all[o].slice(0, listSize)]))                                   ;
  const totals = selected.reduce(
    (t, e) => ({
      costPerMonth: t.costPerMonth + e.recommended.costPerMonth,
      eip: t.eip + e.recommended.eip,
      extraVisits: t.extraVisits + (e.device.segment === 'regular' ? 0 : e.recommended.extraSuccesses),
    }),
    { costPerMonth: 0, eip: 0, extraVisits: 0 },
  );
  const plan       = {
    storeId: store.id, storeName: store.name, diagnosis: diag, byObjective, selected, excluded, skipped, totals,
    changes: { period, previous: null, added: [], kept: [], dropped: [], learned: [] },
  };
  plan.changes = monthlyChanges(plan, period, hasMonthlyHistory ? opts.history : undefined, opts.results, OBJECTIVES.flatMap((o) => all[o]));
  return plan;
}

/** 두 플랜이 얼마나 비슷한지(선택 장치 자카드 유사도) — 획일화 감시 지표 */
export function planSimilarity(a      , b      )         {
  const A = new Set(a.selected.map((e) => e.device.id));
  const B = new Set(b.selected.map((e) => e.device.id));
  const inter = [...A].filter((x) => B.has(x)).length;
  const union = new Set([...A, ...B]).size;
  return union ? inter / union : 0;
}
