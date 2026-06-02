/**
 * Página: Recibos · Admin
 *
 * Lista todos os recibos emitidos, com filtros e ação de detalhe.
 * Permite consultar histórico, abrir detalhe, e (em breve) emitir PDF.
 */

import * as receipts from '../../modules/receipts.js';
import * as store from '../../store/local-store.js';
import * as router from '../router.js';
import * as modalRP from '../modal-registar-pagamento.js';
import * as modalNR from '../modal-novo-recebimento.js';
import * as modalDR from '../modal-detalhe-recibo.js';
import { icon } from '../icons.js';
import { formatMoney, formatDate, formatMonth } from '../../utils/format.js';

let state = {
  ano: new Date().getFullYear().toString(),
  tenantId: '',
  tipo: '',
  incluirCancelados: false
};

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
          <button class="btn-hamburger" id="logout-btn"><span class="hl"></span><span class="hl"></span><span class="hl"></span></button>
        </div>
      </header>
      <main class="main">
        <div class="page-header">
          <div class="page-title">
            <button class="btn-home-circle" id="back-home">${icon('ic-home', 'btn-home-icon')}</button>
            <div>
              <div class="breadcrumb">Histórico de Pagamentos</div>
              <h1>Recibos</h1>
            </div>
            <button class="btn primary" id="btn-new" style="margin-left:auto">
              ${icon('ic-quota-in', 'btn-icon-sm')}
              <span>Registar Pagamento</span>
            </button>
            <button class="btn ghost" id="btn-new-receb" style="margin-left:8px">
              ${icon('ic-receipt', 'btn-icon-sm')}
              <span>Recibo de Recebimento</span>
            </button>
          </div>
        </div>

        <div class="filters" id="filters"></div>

        <div id="receipts-list"></div>
      </main>
    </div>
  `;

  await renderFilters();
  await renderList();

  container.querySelector('#brand').addEventListener('click', () => router.navigate('admin/home'));
  container.querySelector('#back-home').addEventListener('click', () => router.navigate('admin/home'));
  container.querySelector('#logout-btn').addEventListener('click', () => router.navigate('admin/home'));
  container.querySelector('#btn-new').addEventListener('click', () => {
    modalRP.open({ onSuccess: () => renderList() });
  });
  container.querySelector('#btn-new-receb').addEventListener('click', () => {
    modalNR.open({ onSuccess: () => renderList() });
  });
}

async function renderFilters() {
  const tenants = await store.listDocs('tenants');
  tenants.sort((a, b) => (a.fraction || '').localeCompare(b.fraction || ''));

  const tenantOpts = tenants.map(t =>
    `<option value="${t.id}" ${state.tenantId === t.id ? 'selected' : ''}>${t.fraction} · ${t.name}</option>`
  ).join('');

  const yearOpts = ['2024', '2025', '2026'].map(y =>
    `<option value="${y}" ${state.ano === y ? 'selected' : ''}>${y}</option>`
  ).join('');

  const html = `
    <div class="filter-group">
      <label>Ano</label>
      <select id="f-ano">${yearOpts}</select>
    </div>
    <div class="filter-group">
      <label>Condómino</label>
      <select id="f-tenant">
        <option value="">— Todos —</option>
        ${tenantOpts}
      </select>
    </div>
    <div class="filter-group">
      <label>Tipo</label>
      <select id="f-tipo">
        <option value="">— Todos —</option>
        <option value="quota" ${state.tipo === 'quota' ? 'selected' : ''}>Quotas</option>
        <option value="prestacao" ${state.tipo === 'prestacao' ? 'selected' : ''}>Prestações</option>
        <option value="recebimento" ${state.tipo === 'recebimento' ? 'selected' : ''}>Recebimentos</option>
        <option value="estorno" ${state.tipo === 'estorno' ? 'selected' : ''}>Estornos</option>
      </select>
    </div>
    <div class="filter-group filter-toggle">
      <label class="checkbox-label">
        <input type="checkbox" id="f-cancelados" ${state.incluirCancelados ? 'checked' : ''}>
        <span>Incluir cancelados</span>
      </label>
    </div>
  `;
  containerRef.querySelector('#filters').innerHTML = html;

  containerRef.querySelector('#f-ano').addEventListener('change', (e) => { state.ano = e.target.value; renderList(); });
  containerRef.querySelector('#f-tenant').addEventListener('change', (e) => { state.tenantId = e.target.value; renderList(); });
  containerRef.querySelector('#f-tipo').addEventListener('change', (e) => { state.tipo = e.target.value; renderList(); });
  containerRef.querySelector('#f-cancelados').addEventListener('change', (e) => { state.incluirCancelados = e.target.checked; renderList(); });
}

async function renderList() {
  const filters = { ano: state.ano };
  if (state.tenantId) filters.tenantId = state.tenantId;
  if (state.tipo) filters.tipo = state.tipo;

  let list = await receipts.listar(filters);
  if (!state.incluirCancelados) {
    list = list.filter(r => !r.cancelado && r.tipo !== 'estorno');
  }

  const totalEntradas = list.filter(r => r.valor_centimos > 0).reduce((s, r) => s + r.valor_centimos, 0);
  const totalSaidas = list.filter(r => r.valor_centimos < 0).reduce((s, r) => s + r.valor_centimos, 0);

  const summaryHtml = `
    <div class="list-summary">
      <div><span class="ls-lbl">Recibos</span> <span class="ls-val">${list.length}</span></div>
      <div><span class="ls-lbl">Total entradas</span> <span class="ls-val pos">${formatMoney(totalEntradas)}</span></div>
      ${totalSaidas < 0 ? `<div><span class="ls-lbl">Total estornos</span> <span class="ls-val neg">${formatMoney(totalSaidas)}</span></div>` : ''}
    </div>
  `;

  if (list.length === 0) {
    containerRef.querySelector('#receipts-list').innerHTML = summaryHtml + `
      <div class="placeholder">
        <h3>Sem recibos para estes filtros</h3>
        <p>Ajusta os filtros ou regista um novo pagamento.</p>
      </div>
    `;
    return;
  }

  const rowsHtml = list.map(r => buildRow(r)).join('');
  containerRef.querySelector('#receipts-list').innerHTML = summaryHtml + `<div class="movements">${rowsHtml}</div>`;

  // Bind click em cada linha
  containerRef.querySelectorAll('.mov[data-id]').forEach(el => {
    el.addEventListener('click', () => {
      modalDR.open(el.dataset.id, { onUpdate: () => renderList() });
    });
  });
}

function buildRow(r) {
  const isEstorno = r.tipo === 'estorno';
  const isReceb = r.tipo === 'recebimento';
  const isCancelled = r.cancelado;
  const meses = (r.mesReferencia || []).slice().sort();
  const mesesStr = meses.length === 1
    ? formatMonth(meses[0], true)
    : (meses.length > 1 ? `${formatMonth(meses[0], true)} → ${formatMonth(meses[meses.length-1], true)} (${meses.length})` : '—');

  const ic = isEstorno ? 'ic-payment-out' : 'ic-receipt';
  const sign = isEstorno ? 'out' : 'in';
  const cls = isCancelled ? 'mov cancelled' : 'mov';
  const valorCls = r.valor_centimos < 0 ? 'neg' : 'pos';

  if (isReceb) {
    return `
    <div class="${cls}" data-id="${r.id}">
      <div class="mov-ic ${sign}">${icon(ic, 'm-ic')}</div>
      <div class="mov-txt">
        <div class="mov-title">
          ${isCancelled ? '<span class="badge-cancelled">CANCELADO</span> ' : ''}
          RCB ${r.recibo_numero} · Recebimento
        </div>
        <div class="mov-meta">
          ${formatDate(r.data)}${r.tenantName && r.tenantName !== '—' ? ' · ' + r.tenantName : ''}
        </div>
        <div class="mov-desc">${r.descricao || ''}</div>
      </div>
      <div class="mov-val ${valorCls}">${formatMoney(r.valor_centimos)}</div>
    </div>
  `;
  }

  return `
    <div class="${cls}" data-id="${r.id}">
      <div class="mov-ic ${sign}">${icon(ic, 'm-ic')}</div>
      <div class="mov-txt">
        <div class="mov-title">
          ${isCancelled ? '<span class="badge-cancelled">CANCELADO</span> ' : ''}
          RCB ${r.recibo_numero} · ${r.fraction || ''}
        </div>
        <div class="mov-meta">
          ${formatDate(r.data)} · ${r.tenantName || ''} · ${mesesStr}
        </div>
        <div class="mov-desc">${r.descricao || ''}</div>
      </div>
      <div class="mov-val ${valorCls}">${formatMoney(r.valor_centimos)}</div>
    </div>
  `;
}
