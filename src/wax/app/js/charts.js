// 간단한 SVG 차트 (외부 라이브러리 없음)
import { html, pct } from './ui.js';

const COLORS = { bar: '#1e2a47', muted: '#c9a68e', grid: '#e4d8cc', text: '#655548', ink: '#2a2420' };

/** 좁은 화면에서는 viewBox를 줄여 글자가 함께 작아지지 않게 합니다 */
const isNarrow = () => Boolean(globalThis.matchMedia?.('(max-width: 640px)').matches);

/**
 * 가로 막대 + 95% 신뢰 구간
 * rows: [{ label, rate, ci, note, muted }]
 */
export function rateBars(rows, { title = '재방문율' } = {}) {
  const narrow = isNarrow();
  const width = narrow ? 340 : 600;
  const left = 8;
  const plot = narrow ? 270 : 500;
  const rowH = 58;
  const top = 8;
  const height = top + rows.length * rowH + 28;
  const maxRate = Math.min(1, Math.max(0.2, ...rows.map((r) => (r.ci ? r.ci[1] : r.rate ?? 0))) * 1.1);
  const x = (v) => left + (v / maxRate) * plot;
  const ticks = [0, 0.25, 0.5, 0.75, 1].filter((t) => t <= maxRate + 1e-9);
  const desc = rows.map((r) => `${r.label} ${r.rate === null ? '관찰 완료 손님 없음' : pct(r.rate)}`).join(', ');
  return html`<svg class="chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="${title}: ${desc}">
    ${ticks.map(
      (t) => html`<line x1="${x(t)}" x2="${x(t)}" y1="${top}" y2="${height - 24}" stroke="${COLORS.grid}" ${t ? html`stroke-dasharray="3 4"` : ''}/>
      <text x="${x(t)}" y="${height - 6}" text-anchor="${t ? 'middle' : 'start'}" font-size="12" fill="${COLORS.text}">${pct(t)}</text>`,
    )}
    ${rows.map((r, i) => {
      const y = top + i * rowH;
      const label = html`<text x="${left}" y="${y + 14}" font-size="13" fill="${COLORS.ink}" font-weight="600">${r.label}${r.note && !narrow ? html`<tspan fill="${COLORS.text}" font-weight="400"> · ${r.note}</tspan>` : ''}</text>`;
      if (r.rate === null) {
        return html`${label}<text x="${left}" y="${y + 38}" font-size="12" fill="${COLORS.text}">관찰 기간이 끝난 손님이 아직 없습니다</text>`;
      }
      const w = Math.max(2, x(r.rate) - left);
      const ci = r.ci
        ? html`<g stroke="${COLORS.ink}" stroke-width="1.6"><line x1="${x(r.ci[0])}" x2="${x(r.ci[1])}" y1="${y + 33}" y2="${y + 33}"/><line x1="${x(r.ci[0])}" x2="${x(r.ci[0])}" y1="${y + 27}" y2="${y + 39}"/><line x1="${x(r.ci[1])}" x2="${x(r.ci[1])}" y1="${y + 27}" y2="${y + 39}"/></g>`
        : '';
      const valueX = Math.min(width - 4, Math.max(x(r.rate), r.ci ? x(r.ci[1]) : 0) + 8);
      return html`${label}<rect x="${left}" y="${y + 22}" width="${w}" height="22" rx="4" fill="${r.muted ? COLORS.muted : COLORS.bar}"/>${ci}
        <text x="${valueX}" y="${y + 38}" font-size="13" font-weight="700" fill="${COLORS.bar}" text-anchor="${valueX > width - 40 ? 'end' : 'start'}">${pct(r.rate)}</text>`;
    })}
  </svg>`;
}

/** 월별 신규 손님(막대) + 재방문율(점·선, 관찰 완료 손님 기준) */
export function monthlyChart(monthly) {
  const narrow = isNarrow();
  const width = narrow ? 340 : 600;
  const height = 240;
  const pad = { l: 32, r: 40, t: 16, b: 32 };
  const plotW = width - pad.l - pad.r;
  const plotH = height - pad.t - pad.b;
  const n = monthly.length || 1;
  const step = plotW / n;
  // 칸이 좁으면 월 이름이 겹치므로 건너뛰어 적습니다
  const labelEvery = step < 30 ? 2 : 1;
  // 짝수로 올려 가운데 눈금(절반)이 정수가 되게
  const maxCount = Math.max(4, Math.ceil(Math.max(0, ...monthly.map((m) => m.customers)) / 2) * 2);
  const yCount = (v) => pad.t + plotH - (v / maxCount) * plotH;
  const yRate = (v) => pad.t + plotH - v * plotH;
  const points = monthly
    .map((m, i) => (m.rate === null ? null : [pad.l + step * i + step / 2, yRate(m.rate)]))
    .filter(Boolean);
  const desc = monthly.map((m) => `${Number(m.month.slice(5))}월 신규 ${m.customers}명, 재방문율 ${m.rate === null ? '관찰 중' : pct(m.rate)}`).join(', ');
  return html`<svg class="chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="월별 신규 손님과 재방문율: ${desc}">
    ${[0, 0.5, 1].map((t) => html`<line x1="${pad.l}" x2="${width - pad.r}" y1="${yRate(t)}" y2="${yRate(t)}" stroke="${COLORS.grid}" ${t ? html`stroke-dasharray="3 4"` : ''}/>
      <text x="${width - pad.r + 6}" y="${yRate(t) + 4}" font-size="12" fill="${COLORS.text}">${pct(t)}</text>
      <text x="${pad.l - 6}" y="${yRate(t) + 4}" font-size="12" fill="${COLORS.text}" text-anchor="end">${Math.round(maxCount * t)}</text>`)}
    ${monthly.map((m, i) => {
      const bw = Math.min(36, step * 0.6);
      const cx = pad.l + step * i + step / 2;
      return html`<rect x="${cx - bw / 2}" y="${yCount(m.customers)}" width="${bw}" height="${pad.t + plotH - yCount(m.customers)}" rx="3" fill="${COLORS.muted}"/>
        ${i % labelEvery ? '' : html`<text x="${cx}" y="${height - 10}" font-size="12" fill="${COLORS.text}" text-anchor="middle">${Number(m.month.slice(5))}월</text>`}`;
    })}
    ${points.length > 1 ? html`<polyline points="${points.map((p) => p.join(',')).join(' ')}" fill="none" stroke="${COLORS.bar}" stroke-width="2.5"/>` : ''}
    ${points.map((p) => html`<circle cx="${p[0]}" cy="${p[1]}" r="4.5" fill="${COLORS.bar}" stroke="#fff" stroke-width="1.5"/>`)}
  </svg>`;
}
