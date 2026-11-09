// 자동 생성 — 직접 고치지 마세요. promo-engine/src/portfolio.ts를 고친 뒤 scripts/build-browser.mjs로 다시 만듭니다.
                                                                                          
import { OBJECTIVE_LABEL } from './types.js';
import { defaultMaxConcurrent } from './config.js';

// 3단계 조합: 목적별 후보 중에서 '이번 달 실행 플랜'을 고른다.
// 효용 = 점수 × (0.5 + 목적 비중).
// (1) 우선 목적(비중 1위, 20% 이상이면 2위까지)의 상위 후보 조합 중 제약을 지키는 효용 합 최대를 먼저 고르고
// (2) 남은 자리를 효용 순으로 채운다. 제약: 동시 운영 수·예산·예약 여유·운영 부담·혜택 중복·같은 장벽 중복.

const PRICE_KINDS = new Set(['percent', 'amount', 'ladder', 'bonus']);

function cosine(a            , b            )         {
  const keys = new Set([...Object.keys(a.device.barriers), ...Object.keys(b.device.barriers)])                ;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (const k of keys) {
    const x = a.device.barriers[k] ?? 0;
    const y = b.device.barriers[k] ?? 0;
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

const addsVisits = (e            ) => (e.device.segment === 'regular' ? 0 : e.recommended.extraSuccesses);

                                                                                                      

export function assemble(candidates              , s              , diag           )                  {
  const weight = Object.fromEntries(diag.objectives.map((o) => [o.objective, o.weight]))                             ;
  const utility = (e            ) => e.score * (0.5 + weight[e.objective]);
  const maxN = s.preferences?.maxConcurrent ?? defaultMaxConcurrent(s.staffCount);
  const slackVisits = Math.max(s.capacityPerMonth * (1 - s.utilization), 1);

  // 같은 장치가 여러 목적에 올라오면 효용이 큰 쪽만 남긴다
  const best = new Map                    ();
  for (const e of candidates) {
    if (e.score <= 0) continue;
    const prev = best.get(e.device.id);
    if (!prev || utility(e) > utility(prev)) best.set(e.device.id, e);
  }
  const pool = [...best.values()].sort((a, b) => utility(b) - utility(a));

  const blockReason = (list              , e            )                => {
    if (list.length >= maxN) return `동시 운영 한도 ${maxN}개`;
    for (const x of list) {
      if (x.device.conflicts?.includes(e.device.id) || e.device.conflicts?.includes(x.device.id)) return `‘${x.device.name}’과 혜택이 겹침`;
      if (PRICE_KINDS.has(x.device.lever.kind) && PRICE_KINDS.has(e.device.lever.kind) && x.device.segment === e.device.segment)
        return `같은 고객군에 가격 혜택 중복(‘${x.device.name}’)`;
      if (cosine(x, e) > 0.85) return `같은 심리 장벽을 겨냥한 ‘${x.device.name}’이 이미 선택됨`;
    }
    const cost = list.reduce((a, x) => a + x.recommended.costPerMonth, 0);
    if (cost + e.recommended.costPerMonth > s.monthlyPromoBudget) return '월 프로모션 예산 초과';
    const visits = list.reduce((a, x) => a + addsVisits(x), 0);
    if (!e.device.requires?.offPeak && visits + addsVisits(e) > slackVisits) return '추가 방문을 받을 예약 여유 부족';
    const complexity = list.reduce((a, x) => a + x.device.complexity, 0);
    if (complexity + e.device.complexity > maxN * 2) return '운영 부담 한도 초과';
    return null;
  };
  const feasible = (list              ) => list.every((e, i) => !blockReason(list.slice(0, i), e));
  const total = (list              ) => list.reduce((a, e) => a + utility(e), 0);

  // (1) 우선 목적 조합 탐색
  const priority = [...diag.objectives].sort((a, b) => b.weight - a.weight).filter((o, i) => i === 0 || o.weight >= 0.2).slice(0, 2);
  const tops = priority.map((o) => [null, ...pool.filter((e) => e.objective === o.objective).slice(0, 5)]);
  let selected               = [];
  const combos                          = tops.length === 2 ? tops[0].flatMap((a) => tops[1].map((b) => [a, b])) : (tops[0] ?? []).map((a) => [a]);
  for (const c of combos) {
    const list = c.filter((x)                  => x !== null);
    if (feasible(list) && total(list) > total(selected)) selected = list;
  }

  // (2) 남은 자리를 효용 순으로
  const skipped                             = [];
  for (const e of pool) {
    if (selected.includes(e)) continue;
    const why = blockReason(selected, e);
    if (why) skipped.push({ id: e.device.id, reason: `${e.device.name}(${OBJECTIVE_LABEL[e.objective]}) — ${why}` });
    else selected.push(e);
  }
  selected.sort((a, b) => utility(b) - utility(a));
  return { selected, skipped };
}
