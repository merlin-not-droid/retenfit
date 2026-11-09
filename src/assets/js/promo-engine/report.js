// 자동 생성 — 직접 고치지 마세요. promo-engine/src/report.ts를 고친 뒤 scripts/build-browser.mjs로 다시 만듭니다.
                                                   
import { BARRIERS, BARRIER_LABEL, OBJECTIVES, OBJECTIVE_LABEL, SUCCESS_LABEL } from './types.js';
import { fmtWon, pct } from './util.js';

export function fmtMonths(m        )         {
  if (!Number.isFinite(m) || m > 24) return '매장 단독 판정 어려움 → 유사 매장 결과와 합산';
  if (m < 1) return '1개월 이내';
  return `약 ${Math.ceil(m)}개월`;
}

const EVIDENCE = { prior: '사전 가정', similar: '유사 매장 실험 반영', own: '우리 매장 실험 반영' }         ;

function line(e            , i        , detail         )           {
  const unit = SUCCESS_LABEL[e.device.segment];
  const out = [
    `   ${i + 1}. ${e.device.name}  ⟨${OBJECTIVE_LABEL[e.objective]}⟩  ${e.device.lever.kind === 'none' ? '비가격' : `추천 ${e.recommended.label}${e.maxAllowed && e.maxAllowed.label !== e.recommended.label ? ` · 한도 ${e.maxAllowed.label}` : ''}`}`,
    `      예상 월 +${e.recommended.extraSuccesses.toFixed(1)}${unit} · 비용 ${fmtWon(e.recommended.costPerMonth)} · 12개월 기대 순이익 ${fmtWon(e.recommended.eip)} · 근거 ${EVIDENCE[e.posterior.evidence]}`,
  ];
  if (detail) {
    for (const r of e.reasons.slice(1, 4)) out.push(`      · ${r}`);
    out.push(`      · 측정: ${e.measurement.metric} / 비교군 ${pct(e.measurement.controlShare)} / 판정 ${fmtMonths(e.measurement.monthsToDecide)}`);
    for (const w of e.warnings) out.push(`      ! ${w}`);
  }
  return out;
}

export function formatPlan(p      , opts                                             = {})         {
  const d = p.diagnosis;
  const L           = [`■ ${p.storeName}`];
  const objs = [...d.objectives].sort((a, b) => b.weight - a.weight);
  L.push(`  목적 비중: ${objs.map((o) => `${OBJECTIVE_LABEL[o.objective]} ${pct(o.weight)}`).join(' · ')}`);
  L.push(`  └ ${objs[0].reason}`);
  const strong = BARRIERS.map((b) => d.barriers[b]).sort((a, b) => b.score - a.score).slice(0, 4);
  L.push(`  강한 심리 장벽: ${strong.map((b) => `${BARRIER_LABEL[b.barrier]} ${b.score.toFixed(2)}`).join(' · ')}`);
  for (const n of d.notes) L.push(`  ※ ${n}`);
  L.push('  이번 달 실행 플랜');
  p.selected.forEach((e, i) => L.push(...line(e, i, Boolean(opts.detail))));
  L.push(`  합계: 월 비용 ${fmtWon(p.totals.costPerMonth)} · 12개월 기대 순이익 ${fmtWon(p.totals.eip)}`);
  if (opts.candidates) {
    for (const o of OBJECTIVES) {
      const list = p.byObjective[o];
      if (!list.length) continue;
      const top = list[0].score || 1;
      L.push(`  [${OBJECTIVE_LABEL[o]} 후보] ${list.map((e) => `${e.device.name}(${Math.round((100 * e.score) / top)})`).join(' > ')}`);
    }
    if (p.excluded.length) L.push(`  [제외] ${p.excluded.map((x) => `${x.id}: ${x.reason}`).join(' / ')}`);
  }
  return L.join('\n');
}
