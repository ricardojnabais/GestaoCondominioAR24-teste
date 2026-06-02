/**
 * Página: Quotas · Admin
 *
 * Matriz de quotas:
 *   Linhas:   10 condóminos
 *   Colunas:  12 meses do ano
 *   Células:  valor pago vs valor esperado (com codificação de cores)
 *
 * Esta tabela é INTEIRAMENTE DERIVADA da coleção receipts (não armazenada).
 * Cada célula soma os recibos válidos onde esse mês aparece em mesReferencia,
 * dividindo proporcionalmente quando o recibo cobre múltiplos meses.
 */

import * as store from '../../store/local-store.js';
import * as receipts from '../../modules/receipts.js';
import * as quotasLedger from '../../modules/quotas-ledger.js';
import * as router from '../router.js';
import * as modalRP from '../modal-registar-pagamento.js';
import { icon } from '../icons.js';
import { formatMoney, monthsOfYear, currentMonthRef } from '../../utils/format.js';

let state = {
  ano: new Date().getFullYear().toString()
};

const MESES_SHORT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun',
                     'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

let containerRef = null;

export async function render(container) {
  containerRef = container;

  container.innerHTML = `
    <div class="app">
      <header class="header">
        <div class="brand" id="brand">
          <div class="brand-mark">${icon('logo-mark', 'brand-mark-svg')}</div>
          <div class="brand-text">
            <div class="name">Gestão do Condomínio AR24</div>
            <div class="sub">Av. Amália Rodrigues · 24</div>
          </div>
        </div>
        <div class="header-actions">
          <button class="btn-hamburger" id="hamburger"><span class="hl"></span><span class="hl"></span><span class="hl"></span></button>
        </div>
      </header>
      <main class="main main-wide">
        <div class="page-header">
          <div class="page-title">
            <button class="btn-home-circle" id="back-home">${icon('ic-home', 'btn-home-icon')}</button>
            <div>
              <div class="breadcrumb">Estado dos Pagamentos</div>
              <h1>Quotas</h1>
            </div>
            <button class="btn primary" id="btn-new" style="margin-left:auto">
              <span>+ Pagamento</span>
            </button>
          </div>
        </div>

        <div class="filters">
          <div class="filter-group">
            <label>Ano</label>
            <select id="f-ano">
              <option value="2024" ${state.ano === '2024' ? 'selected' : ''}>2024</option>
              <option value="2025" ${state.ano === '2025' ? 'selected' : ''}>2025</option>
              <option value="2026" ${state.ano === '2026' ? 'selected' : ''}>2026</option>
            </select>
          </div>
          <div class="filter-group filter-legend">
            <span class="legend-item"><span class="dot ok"></span> Pago</span>
            <span class="legend-item"><span class="dot due"></span> A pagamento</span>
            <span class="legend-item"><span class="dot late"></span> Em atraso</span>
            <span class="legend-item"><span class="dot idle"></span> A vencer</span>
          </div>
          <style>
            .q-cell.due { background: rgba(59,130,246,.12); color: #1d4ed8; }
            .legend-item .dot.due { background: rgba(59,130,246,.25); border: 1px solid #1d4ed8; }
          </style>
        </div>

        <div id="quotas-table"></div>
      </main>
    </div>
  `;

  await renderTable();

  container.querySelector('#brand').addEventListener('click', () => router.navigate('admin/home'));
  container.querySelector('#back-home').addEventListener('click', () => router.navigate('admin/home'));
  container.querySelector('#hamburger').addEventListener('click', () => router.navigate('admin/home'));
  container.querySelector('#f-ano').addEventListener('change', (e) => {
    state.ano = e.target.value;
    renderTable();
  });
  container.querySelector('#btn-new').addEventListener('click', () => {
    modalRP.open({ onSuccess: () => renderTable() });
  });
}

async function renderTable() {
  const ano = state.ano;
  const months = monthsOfYear(ano);
  const currentMonth = currentMonthRef();

  const tenants = await store.listDocs('tenants');
  tenants.sort((a, b) => (a.fraction || '').localeCompare(b.fraction || ''));

  // Calcular células
  const rows = [];
  let totalSaldosGlobal = 0;

  for (const t of tenants) {
    const quotaMensal = t.rentByYear?.[ano] || 0;
    const cells = [];
    let totalPago = 0;
    let totalEsperado = 0;

    for (const m of months) {
      const pago = await receipts.valorPagoNoMes(t.id, m);
      const isPast = m <= currentMonth;
      totalPago += pago;
      if (isPast) totalEsperado += quotaMensal;

      // v1.0.40 · estado com tolerância do dia 8 (pago / a_pagamento / atraso / futuro)
      const estado = quotasLedger.estadoQuotaMref({
        pago_centimos: pago, quota_centimos: quotaMensal, mref: m,
      });
      const mapaCls = { pago: 'ok', a_pagamento: 'due', atraso: 'late', futuro: 'idle' };
      const cls = 'q-cell ' + (mapaCls[estado] || 'idle');
      cells.push({ pago, quotaMensal, cls, m, isPast, estado });
    }

    // Saldo a favor (excesso − saldoUsado)
    const saldoFavor = await receipts.saldoCondomino(t.id);
    totalSaldosGlobal += saldoFavor;

    rows.push({ tenant: t, cells, totalPago, totalEsperado, saldoFavor });
  }

  // Totais por mês
  const monthTotals = months.map((_, i) =>
    rows.reduce((sum, r) => sum + r.cells[i].pago, 0)
  );
  const monthExpected = months.map((m, i) =>
    rows.reduce((sum, r) => sum + (m <= currentMonth ? r.cells[i].quotaMensal : 0), 0)
  );

  // Render
  const headHtml = `
    <thead>
      <tr>
        <th class="sticky-col">Fração / Condómino</th>
        ${months.map((m, i) => {
          const cls = m === currentMonth ? 'curr' : (m > currentMonth ? 'future' : '');
          return `<th class="${cls}">${MESES_SHORT[i]}</th>`;
        }).join('')}
        <th class="num total-col">Total</th>
        <th class="num saldo-col">Saldo</th>
      </tr>
    </thead>
  `;

  const bodyHtml = rows.map(r => `
    <tr>
      <td class="sticky-col">
        <div class="q-row-tenant">
          <div class="q-frac">${r.tenant.fraction}</div>
          <div class="q-name">${r.tenant.name}</div>
          <div class="q-quota">${formatMoney(r.tenant.rentByYear?.[ano] || 0)}/mês · ${r.tenant.permilage}‰</div>
        </div>
      </td>
      ${r.cells.map(c => `
        <td class="${c.cls}" title="${formatMoney(c.pago)} de ${formatMoney(c.quotaMensal)}">
          ${c.pago > 0 ? `<span class="cell-val">${formatMoney(c.pago, false)}</span>` : ''}
        </td>
      `).join('')}
      <td class="num total-col">
        <strong>${formatMoney(r.totalPago)}</strong>
        ${r.totalPago < r.totalEsperado ? `<div class="missing">−${formatMoney(r.totalEsperado - r.totalPago)}</div>` : ''}
      </td>
      <td class="num saldo-col ${r.saldoFavor > 0 ? 'has-saldo' : ''}">
        ${r.saldoFavor > 0 ? `<strong>+${formatMoney(r.saldoFavor)}</strong>` : '—'}
      </td>
    </tr>
  `).join('');

  const footHtml = `
    <tfoot>
      <tr>
        <td class="sticky-col"><strong>TOTAL</strong></td>
        ${monthTotals.map((tot) => `
          <td class="num"><strong>${tot > 0 ? formatMoney(tot, false) : '—'}</strong></td>
        `).join('')}
        <td class="num total-col">
          <strong>${formatMoney(monthTotals.reduce((a, b) => a + b, 0))}</strong>
        </td>
        <td class="num saldo-col">
          ${totalSaldosGlobal > 0 ? `<strong>+${formatMoney(totalSaldosGlobal)}</strong>` : '—'}
        </td>
      </tr>
    </tfoot>
  `;

  const html = `
    ${await renderDividasArrastadas(ano)}
    <div class="quotas-summary">
      <div class="qs-stat">
        <div class="qs-lbl">Recebido YTD</div>
        <div class="qs-val pos">${formatMoney(monthTotals.reduce((a, b) => a + b, 0))}</div>
      </div>
      <div class="qs-stat">
        <div class="qs-lbl">Esperado YTD</div>
        <div class="qs-val">${formatMoney(monthExpected.reduce((a, b) => a + b, 0))}</div>
      </div>
      <div class="qs-stat">
        <div class="qs-lbl">Em falta</div>
        <div class="qs-val ${monthExpected.reduce((a, b) => a + b, 0) - monthTotals.reduce((a, b) => a + b, 0) > 0 ? 'neg' : 'pos'}">
          ${formatMoney(monthExpected.reduce((a, b) => a + b, 0) - monthTotals.reduce((a, b) => a + b, 0))}
        </div>
      </div>
      <div class="qs-stat">
        <div class="qs-lbl">Saldos a favor</div>
        <div class="qs-val ${totalSaldosGlobal > 0 ? 'pos' : ''}">${formatMoney(totalSaldosGlobal)}</div>
      </div>
    </div>
    <div class="table-wrap quotas-table-wrap">
      <table class="quotas-table">${headHtml}<tbody>${bodyHtml}</tbody>${footHtml}</table>
    </div>
  `;
  containerRef.querySelector('#quotas-table').innerHTML = html;
}

async function renderDividasArrastadas(ano) {
  const config = await store.getDoc('meta', 'config');
  const dividas = config?.dividasAnoAnterior?.[ano];
  if (!dividas || Object.keys(dividas).length === 0) return '';

  const itens = Object.values(dividas);
  const total = itens.reduce((s, d) => s + (d.valor_centimos || 0), 0);

  return `
    <div class="divida-arrastada-banner">
      <div class="dab-head">
        <span class="dab-icon">⚠</span>
        <span class="dab-title">Dívidas arrastadas de anos anteriores</span>
        <span class="dab-total">${formatMoney(total)}</span>
      </div>
      <div class="dab-list">
        ${itens.map(d => `
          <div class="dab-item">
            <span class="dab-tenant">${d.fraction} · ${d.tenantName}</span>
            <span class="dab-origem">${d.origem}</span>
            <span class="dab-valor neg">${formatMoney(d.valor_centimos)}</span>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}
