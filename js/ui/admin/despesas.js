/**
 * Página: Despesas · Admin
 * Lista filtrável de despesas + modal de detalhe (cancelar).
 */

import * as despesas from '../../modules/despesas.js';
import * as rubricas from '../../modules/rubricas.js';
import * as router from '../router.js';
import * as modalND from '../modal-nova-despesa.js';
import * as auth from '../../auth/local-auth.js';
import { icon } from '../icons.js';
import { formatMoney, formatDate } from '../../utils/format.js';

let state = {
  ano: new Date().getFullYear().toString(),
  rubricaId: '',
  incluirCanceladas: false
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
          <button class="btn-hamburger" id="hamburger"><span class="hl"></span><span class="hl"></span><span class="hl"></span></button>
        </div>
      </header>
      <main class="main">
        <div class="page-header">
          <div class="page-title">
            <button class="btn-home-circle" id="back-home">${icon('ic-home', 'btn-home-icon')}</button>
            <div>
              <div class="breadcrumb">Pagamentos do Condomínio</div>
              <h1>Despesas</h1>
            </div>
            <button class="btn primary" id="btn-new" style="margin-left:auto">+ Despesa</button>
          </div>
        </div>

        <div class="filters" id="filters"></div>
        <div id="resumo-rubricas"></div>
        <div id="despesas-list"></div>
      </main>
    </div>
  `;

  await renderFilters();
  await renderList();

  container.querySelector('#brand').addEventListener('click', () => router.navigate('admin/home'));
  container.querySelector('#back-home').addEventListener('click', () => router.navigate('admin/home'));
  container.querySelector('#hamburger').addEventListener('click', () => router.navigate('admin/home'));
  container.querySelector('#btn-new').addEventListener('click', () => {
    modalND.open({ onSuccess: () => { renderList(); renderFilters(); } });
  });
}

async function renderFilters() {
  const todas = await rubricas.listar();
  const rubricasOpts = todas.map(r => {
    const terminada = r.terminadaEm ? ' (terminada)' : '';
    return `<option value="${r.id}" ${state.rubricaId === r.id ? 'selected' : ''}>${r.nome}${terminada}</option>`;
  }).join('');

  const yearOpts = ['2024', '2025', '2026'].map(y =>
    `<option value="${y}" ${state.ano === y ? 'selected' : ''}>${y}</option>`
  ).join('');

  containerRef.querySelector('#filters').innerHTML = `
    <div class="filter-group">
      <label>Ano</label>
      <select id="f-ano">${yearOpts}</select>
    </div>
    <div class="filter-group">
      <label>Rúbrica</label>
      <select id="f-rub">
        <option value="">— Todas —</option>
        ${rubricasOpts}
      </select>
    </div>
    <div class="filter-group filter-toggle">
      <label class="checkbox-label">
        <input type="checkbox" id="f-canc" ${state.incluirCanceladas ? 'checked' : ''}>
        <span>Incluir canceladas</span>
      </label>
    </div>
  `;

  containerRef.querySelector('#f-ano').addEventListener('change', (e) => { state.ano = e.target.value; renderList(); });
  containerRef.querySelector('#f-rub').addEventListener('change', (e) => { state.rubricaId = e.target.value; renderList(); });
  containerRef.querySelector('#f-canc').addEventListener('change', (e) => { state.incluirCanceladas = e.target.checked; renderList(); });
}

async function renderList() {
  const filters = { ano: state.ano };
  if (state.rubricaId) filters.rubricaId = state.rubricaId;

  let list = await despesas.listar(filters);
  if (!state.incluirCanceladas) {
    list = list.filter(d => !d.cancelada && !d.estornoDe);
  }

  // Totais por rúbrica
  const agg = await despesas.totalPorRubrica(state.ano);
  const totalAno = Object.values(agg).reduce((s, r) => s + r.total, 0);

  let aggHtml = '';
  if (Object.keys(agg).length > 0) {
    const rows = Object.values(agg).sort((a, b) => b.total - a.total);
    aggHtml = `
      <div class="rub-summary">
        <div class="rub-summary-head">Total ${state.ano} por rúbrica</div>
        ${rows.map(r => {
          const pct = totalAno > 0 ? Math.round(r.total / totalAno * 100) : 0;
          return `
            <div class="rub-row">
              <div class="rub-name">${r.nome}</div>
              <div class="rub-bar"><div class="rub-fill" style="width:${pct}%"></div></div>
              <div class="rub-val">${formatMoney(r.total)} <span class="rub-pct">${pct}%</span></div>
            </div>
          `;
        }).join('')}
        <div class="rub-row rub-total">
          <div class="rub-name"><strong>TOTAL</strong></div>
          <div></div>
          <div class="rub-val"><strong>${formatMoney(totalAno)}</strong></div>
        </div>
      </div>
    `;
  }
  containerRef.querySelector('#resumo-rubricas').innerHTML = aggHtml;

  if (list.length === 0) {
    containerRef.querySelector('#despesas-list').innerHTML = `
      <div class="placeholder">
        <h3>Sem despesas para estes filtros</h3>
        <p>Regista uma nova com o botão "+ Despesa".</p>
      </div>
    `;
    return;
  }

  const rowsHtml = list.map(d => buildRow(d)).join('');
  containerRef.querySelector('#despesas-list').innerHTML = `<div class="movements">${rowsHtml}</div>`;

  containerRef.querySelectorAll('.mov[data-id]').forEach(el => {
    el.addEventListener('click', () => onClickDespesa(el.dataset.id));
  });
}

async function onClickDespesa(id) {
  // Simples por agora: prompt para confirmar cancelamento
  const d = (await despesas.listar({ ano: state.ano })).find(x => x.id === id);
  if (!d) return;

  if (d.cancelada || d.estornoDe) {
    alert(`Despesa: ${d.descricao}\nValor: ${formatMoney(d.valor_centimos)}\nData: ${formatDate(d.data)}\nEstado: ${d.cancelada ? 'CANCELADA' : 'ESTORNO'}\n${d.motivoCancelamento || ''}`);
    return;
  }

  const acao = confirm(
    `Despesa: ${d.descricao}\nFornecedor: ${d.fornecedor}\nValor: ${formatMoney(d.valor_centimos)}\nData: ${formatDate(d.data)}\nMétodo: ${d.metodoPagamento}\n\nCancelar esta despesa? (cria estorno automaticamente)`
  );
  if (!acao) return;

  const motivo = prompt('Motivo do cancelamento:', '');
  if (motivo === null) return;
  try {
    const session = auth.getSession();
    await despesas.cancelar(d.id, motivo, session?.operatorName);
    alert('Despesa cancelada. Foi emitido um estorno.');
    renderList();
  } catch (e) {
    alert('Erro: ' + e.message);
  }
}

function buildRow(d) {
  const isEstorno = d.estornoDe;
  const isCancelled = d.cancelada;
  const sign = isEstorno ? 'in' : 'out';
  const ic = isEstorno ? 'ic-quota-in' : 'ic-payment-out';
  const cls = isCancelled ? 'mov cancelled' : 'mov';
  const valorCls = d.valor_centimos < 0 ? 'pos' : 'neg';
  const valor = d.valor_centimos < 0 ? formatMoney(-d.valor_centimos) : formatMoney(d.valor_centimos);
  const prefix = d.valor_centimos < 0 ? '+' : '−';

  return `
    <div class="${cls}" data-id="${d.id}">
      <div class="mov-ic ${sign}">${icon(ic, 'm-ic')}</div>
      <div class="mov-txt">
        <div class="mov-title">
          ${isCancelled ? '<span class="badge-cancelled">CANC</span> ' : ''}
          ${isEstorno ? '<span class="badge-cancelled" style="background:var(--amber-light);color:#92400E">ESTORNO</span> ' : ''}
          ${d.descricao}
        </div>
        <div class="mov-meta">${formatDate(d.data)} · ${d.rubricaNome} · ${d.fornecedor || ''}</div>
      </div>
      <div class="mov-val ${valorCls}">${prefix}${valor}</div>
    </div>
  `;
}
