// 자동 생성 — 직접 고치지 마세요. promo-engine/src/monthly.ts를 고친 뒤 scripts/build-browser.mjs로 다시 만듭니다.
                                                                                                                                                
import { POLICY } from './config.js';

// 월간 학습 고리: 매달 추천을 기록(MonthlyRecord)하고, 다음 달 추천에 돌려준다.
//   효과가 확인된 장치  → 유지
//   효과가 약한 장치    → 순위를 크게 낮춰 교체
//   지난달 쓰지 않은 장치 → 순위를 낮춤(매장이 원하지 않는 제안을 반복하지 않음)
//   최근에 시도하지 않은 장치 → 가산점(새로운 시도)
// 실험 결과 자체는 learning.ts의 사후 추정으로 들어오고, 여기서는 그 위에 '반복과 교체'만 다룬다.

const monthIndex = (period        ) => Number(period.slice(0, 4)) * 12 + Number(period.slice(5, 7)) - 1;

/** 이번 기간보다 앞선 기록만, 최신순으로 */
export function priorRecords(history                             , period        )                  {
  return (history ?? [])
    .filter((r) => monthIndex(r.period) < monthIndex(period))
    .sort((a, b) => monthIndex(b.period) - monthIndex(a.period));
}

                                                                                         

/** 우리 매장 실험에서 효과가 0보다 크다고 볼 수 있음(단측 90%) */
export function isProvenGood(p           )          {
  return Boolean(p.ownEffect && p.ownEffect.estimate - POLICY.decisionZ * p.ownEffect.se > 0);
}

/** 우리 매장 실험에서 효과가 기대의 절반에도 못 미친다고 볼 수 있음(단측 90%) */
export function isProvenWeak(p           )          {
  return Boolean(p.ownEffect && p.ownEffect.estimate + POLICY.decisionZ * p.ownEffect.se < POLICY.weakShare * p.prior);
}

/** 지난 기록과 실험 결과로 이번 달 이 장치의 순위 계수를 정한다 */
export function rotationFor(deviceId        , p           , period        , history                             )           {
  const records = priorRecords(history, period);
  if (isProvenWeak(p)) return { status: 'weak', factor: POLICY.weakFactor, note: '우리 매장 실험에서 효과가 기대보다 낮아 순위를 낮췄습니다.' };
  if (isProvenGood(p)) return { status: 'proven', factor: POLICY.provenFactor, note: '우리 매장 실험에서 효과가 확인되어 계속 추천합니다.' };
  if (!records.length) return { status: 'first', factor: 1, note: null };

  const inRecord = (r               ) => r.selected.some((x) => x.id === deviceId);
  const last = records[0];
  const lastMonth = monthIndex(last.period) === monthIndex(period) - 1;
  let runs = 0;
  for (let i = 0; i < records.length; i += 1) {
    if (monthIndex(records[i].period) !== monthIndex(period) - 1 - i || !inRecord(records[i])) break;
    runs += 1;
  }

  if (lastMonth && inRecord(last)) {
    if (last.adopted?.includes(deviceId)) {
      if (runs >= POLICY.maxMeasureMonths) return { status: 'fatigued', factor: POLICY.fatigueFactor, note: `${runs}개월째 실행 중이라 다른 장치를 먼저 검토합니다.` };
      return { status: 'measuring', factor: 1, note: '지난달 시작한 실행의 결과를 확인하는 중입니다.' };
    }
    return { status: 'skipped', factor: runs >= 2 ? POLICY.skippedTwiceFactor : POLICY.skippedFactor, note: '지난달 추천을 실행하지 않아 순위를 낮췄습니다.' };
  }
  const recently = records.some((r) => monthIndex(period) - monthIndex(r.period) <= POLICY.noveltyMonths && inRecord(r));
  if (!recently) return { status: 'new', factor: POLICY.noveltyFactor, note: `최근 ${POLICY.noveltyMonths}개월 안에 추천한 적이 없어 새로운 시도로 올렸습니다.` };
  return { status: 'rested', factor: 1, note: null };
}

/** 플랜 → 다음 달 추천에 넘길 기록 */
export function recordFromPlan(plan      , period        , adopted           = [])                {
  const selected                  = plan.selected.map((e) => ({
    id: e.device.id,
    name: e.device.name,
    objective: e.objective,
    level: e.recommended.level,
    label: e.recommended.label,
    eip: Math.round(e.recommended.eip),
    cost: Math.round(e.recommended.costPerMonth),
    evidence: e.posterior.evidence,
  }));
  return { period, selected, adopted };
}

function learnedFrom(results                              , period        , evaluations              ) {
  const seen = new Map                    ();
  for (const e of evaluations) if (!seen.has(e.device.id)) seen.set(e.device.id, e);
  const out                                = [];
  for (const id of new Set((results ?? []).filter((r) => r.period <= period).map((r) => r.promotionId))) {
    const e = seen.get(id);
    if (!e?.posterior.ownEffect) continue;
    const verdict = isProvenGood(e.posterior) ? 'good' : isProvenWeak(e.posterior) ? 'weak' : 'unclear';
    out.push({ id, name: e.device.name, calibration: e.posterior.calibration, evidence: e.posterior.evidence, verdict });
  }
  return out;
}

/**
 * 지난달 대비 무엇이 왜 바뀌었는지(화면에 보여 줄 내용)
 * evaluations: 이번 달 평가한 장치 전체(순위가 크게 내려가 목적별 목록에 없는 장치의 이유까지 찾으려고 받는다)
 */
export function monthlyChanges(plan      , period        , history                             , results                   , evaluations               )                     {
  const last = priorRecords(history, period)[0] ?? null;
  const all = evaluations ?? Object.values(plan.byObjective).flat();
  const added                              = [];
  const kept                             = [];
  for (const e of plan.selected) {
    const before = last?.selected.some((x) => x.id === e.device.id);
    const entry = { id: e.device.id, name: e.device.name, label: e.recommended.label, note: e.rotation?.note ?? null };
    if (before) kept.push({ ...entry, status: e.rotation?.status ?? 'rested' });
    else added.push(entry);
  }
  const dropped                                = [];
  for (const x of last?.selected ?? []) {
    if (plan.selected.some((e) => e.device.id === x.id)) continue;
    const e = all.find((y) => y.device.id === x.id);
    const skipped = plan.skipped.find((s) => s.id === x.id)?.reason;
    const excluded = plan.excluded.find((s) => s.id === x.id)?.reason;
    dropped.push({
      id: x.id,
      name: x.name,
      reason: e?.rotation?.status === 'weak' ? '우리 매장 실험에서 효과가 기대보다 낮았습니다.'
        : e?.rotation?.status === 'skipped' ? '지난달 실행하지 않아 다른 제안으로 바꿨습니다.'
          : excluded ? excluded
            : skipped ? skipped.slice(skipped.indexOf('—') + 1).trim()
              : '이번 달 매장 상황에 더 맞는 제안으로 바꿨습니다.',
    });
  }
  return { period, previous: last?.period ?? null, added, kept, dropped, learned: learnedFrom(results, period, all) };
}
