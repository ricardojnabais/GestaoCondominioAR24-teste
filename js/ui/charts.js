/**
 * Helpers SVG para gráficos.
 * Vanilla · sem dependências externas.
 * Tamanho responsivo · viewBox + preserveAspectRatio.
 *
 * Cada função recebe `data` e devolve string HTML (SVG) pronta para injectar.
 */

import { formatMoney } from '../utils/format.js';

const COLORS = {
  primary:   '#1E54C7',
  primaryDk: '#1640A0',
  green:     '#10B981',
  red:       '#EF4444',
  amber:     '#F59E0B',
  blueLight: '#3D7DD8',
  gray:      '#9CA3AF',
  grayLt:    '#E5E7EB'
};

const RUBRICA_COLORS = [
  '#1E54C7', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6',
  '#06B6D4', '#EC4899', '#84CC16', '#6366F1', '#F97316'
];

/**
 * Barras agrupadas (receitas vs despesas por mês).
 * @param {Array} data - [{ label, receitas_centimos, despesas_centimos }]
 */
export function barChartReceitasDespesas(data) {
  const W = 700, H = 280;
  const padding = { top: 20, right: 12, bottom: 36, left: 56 };
  const innerW = W - padding.left - padding.right;
  const innerH = H - padding.top - padding.bottom;

  const maxV = Math.max(
    ...data.map(d => Math.max(d.receitas_centimos || 0, d.despesas_centimos || 0)),
    1
  );
  // Tornar a escala em €
  const yMax = Math.ceil(maxV / 100 / 50) * 50 * 100;  // múltiplo de 50€ acima
  const yTicks = 5;
  const tickStep = yMax / yTicks;

  const barGroupW = innerW / data.length;
  const barW = barGroupW * 0.36;
  const gap = barGroupW * 0.08;

  // Helper: x para um grupo
  const xGroup = (i) => padding.left + i * barGroupW;
  const yFor = (v) => padding.top + innerH - (v / yMax) * innerH;

  // Grid + ticks
  const gridLines = [];
  for (let i = 0; i <= yTicks; i++) {
    const v = tickStep * i;
    const y = yFor(v);
    gridLines.push(`<line x1="${padding.left}" y1="${y}" x2="${W - padding.right}" y2="${y}" stroke="${COLORS.grayLt}" stroke-width="1"/>`);
    gridLines.push(`<text x="${padding.left - 8}" y="${y + 4}" text-anchor="end" font-size="10" fill="${COLORS.gray}" font-family="system-ui">${formatMoney(v, false)}</text>`);
  }

  // Barras
  const bars = [];
  data.forEach((d, i) => {
    const cx = xGroup(i) + barGroupW / 2;
    const x1 = cx - barW - gap / 2;
    const x2 = cx + gap / 2;
    const hR = (d.receitas_centimos || 0) / yMax * innerH;
    const hD = (d.despesas_centimos || 0) / yMax * innerH;
    const yR = yFor(d.receitas_centimos || 0);
    const yD = yFor(d.despesas_centimos || 0);

    bars.push(`<rect x="${x1}" y="${yR}" width="${barW}" height="${hR}" fill="${COLORS.green}" rx="2"><title>Receitas ${d.label}: ${formatMoney(d.receitas_centimos)}</title></rect>`);
    bars.push(`<rect x="${x2}" y="${yD}" width="${barW}" height="${hD}" fill="${COLORS.red}" rx="2"><title>Despesas ${d.label}: ${formatMoney(d.despesas_centimos)}</title></rect>`);

    // Label do mês
    bars.push(`<text x="${cx}" y="${H - padding.bottom + 16}" text-anchor="middle" font-size="11" fill="${COLORS.gray}" font-family="system-ui" font-weight="600">${d.label}</text>`);
  });

  return `
    <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" class="chart-svg">
      ${gridLines.join('')}
      ${bars.join('')}
    </svg>
    <div class="chart-legend">
      <span class="cl-item"><span class="cl-dot" style="background:${COLORS.green}"></span> Receitas</span>
      <span class="cl-item"><span class="cl-dot" style="background:${COLORS.red}"></span> Despesas</span>
    </div>
  `;
}

/**
 * Donut chart (despesas por rúbrica).
 * @param {Array} data - [{ nome, total_centimos }]
 */
export function donutChartRubricas(data) {
  const W = 380, H = 280;
  const cx = 130, cy = 130;
  const rOut = 110, rIn = 70;

  const total = data.reduce((s, d) => s + d.total_centimos, 0);
  if (total === 0) {
    return `<div class="chart-empty">Sem despesas registadas no período.</div>`;
  }

  let angle = -Math.PI / 2;  // start at top
  const slices = [];
  const legend = [];

  data.forEach((d, i) => {
    if (d.total_centimos === 0) return;
    const frac = d.total_centimos / total;
    const startAngle = angle;
    const endAngle = angle + frac * 2 * Math.PI;
    const color = RUBRICA_COLORS[i % RUBRICA_COLORS.length];
    const pct = Math.round(frac * 100);

    // Path do donut slice
    const x1 = cx + rOut * Math.cos(startAngle);
    const y1 = cy + rOut * Math.sin(startAngle);
    const x2 = cx + rOut * Math.cos(endAngle);
    const y2 = cy + rOut * Math.sin(endAngle);
    const x3 = cx + rIn * Math.cos(endAngle);
    const y3 = cy + rIn * Math.sin(endAngle);
    const x4 = cx + rIn * Math.cos(startAngle);
    const y4 = cy + rIn * Math.sin(startAngle);
    const largeArc = frac > 0.5 ? 1 : 0;

    const path = `M ${x1} ${y1} A ${rOut} ${rOut} 0 ${largeArc} 1 ${x2} ${y2} L ${x3} ${y3} A ${rIn} ${rIn} 0 ${largeArc} 0 ${x4} ${y4} Z`;
    slices.push(`<path d="${path}" fill="${color}" stroke="${COLORS.grayLt}" stroke-width="1.5"><title>${d.nome}: ${formatMoney(d.total_centimos)} (${pct}%)</title></path>`);

    legend.push(`
      <div class="dl-item">
        <span class="dl-dot" style="background:${color}"></span>
        <span class="dl-name">${d.nome}</span>
        <span class="dl-val">${formatMoney(d.total_centimos)} <span class="dl-pct">${pct}%</span></span>
      </div>
    `);

    angle = endAngle;
  });

  // Centro · total
  const centroTexto = `
    <text x="${cx}" y="${cy - 6}" text-anchor="middle" font-size="10" fill="${COLORS.gray}" font-family="system-ui" font-weight="700">TOTAL</text>
    <text x="${cx}" y="${cy + 16}" text-anchor="middle" font-size="15" fill="#0F1A2E" font-family="system-ui" font-weight="800">${formatMoney(total)}</text>
  `;

  return `
    <div class="donut-wrap">
      <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" class="chart-svg donut-svg">
        ${slices.join('')}
        ${centroTexto}
      </svg>
      <div class="donut-legend">${legend.join('')}</div>
    </div>
  `;
}

/**
 * Line chart (evolução do saldo bancário).
 * @param {Array} data - [{ label, saldoFimMes_centimos }]
 */
export function lineChartSaldo(data) {
  const W = 700, H = 220;
  const padding = { top: 20, right: 12, bottom: 36, left: 60 };
  const innerW = W - padding.left - padding.right;
  const innerH = H - padding.top - padding.bottom;

  const vals = data.map(d => d.saldoFimMes_centimos);
  const maxV = Math.max(...vals, 0);
  const minV = Math.min(...vals, 0);
  const range = Math.max(maxV - minV, 1);
  const yMax = maxV + range * 0.1;
  const yMin = minV - range * 0.05;
  const yRange = yMax - yMin;

  const xFor = (i) => padding.left + (i / Math.max(data.length - 1, 1)) * innerW;
  const yFor = (v) => padding.top + innerH - ((v - yMin) / yRange) * innerH;

  // Linha base zero
  const yZero = yFor(0);

  // Gráfico · path
  const pts = data.map((d, i) => `${xFor(i)},${yFor(d.saldoFimMes_centimos)}`).join(' ');
  const areaPts = `${xFor(0)},${yFor(yMin)} ${pts} ${xFor(data.length - 1)},${yFor(yMin)} Z`;

  // Eixo Y · 4 ticks
  const yTicks = [];
  for (let i = 0; i <= 4; i++) {
    const v = yMin + (yRange * i / 4);
    const y = yFor(v);
    yTicks.push(`<line x1="${padding.left}" y1="${y}" x2="${W - padding.right}" y2="${y}" stroke="${COLORS.grayLt}" stroke-width="1" stroke-dasharray="2,2"/>`);
    yTicks.push(`<text x="${padding.left - 8}" y="${y + 4}" text-anchor="end" font-size="10" fill="${COLORS.gray}" font-family="system-ui">${formatMoney(v, false)}</text>`);
  }

  // Pontos · cada mês
  const dots = data.map((d, i) => `
    <circle cx="${xFor(i)}" cy="${yFor(d.saldoFimMes_centimos)}" r="3" fill="${COLORS.primary}">
      <title>${d.label}: ${formatMoney(d.saldoFimMes_centimos)}</title>
    </circle>
  `).join('');

  // Labels X
  const xLabels = data.map((d, i) =>
    `<text x="${xFor(i)}" y="${H - padding.bottom + 16}" text-anchor="middle" font-size="11" fill="${COLORS.gray}" font-family="system-ui" font-weight="600">${d.label}</text>`
  ).join('');

  return `
    <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" class="chart-svg">
      ${yTicks.join('')}
      ${yZero >= padding.top && yZero <= padding.top + innerH ? `<line x1="${padding.left}" y1="${yZero}" x2="${W - padding.right}" y2="${yZero}" stroke="${COLORS.gray}" stroke-width="1.2"/>` : ''}
      <polygon points="${areaPts}" fill="${COLORS.primary}" fill-opacity="0.12"/>
      <polyline points="${pts}" fill="none" stroke="${COLORS.primary}" stroke-width="2.5" stroke-linejoin="round"/>
      ${dots}
      ${xLabels}
    </svg>
  `;
}
