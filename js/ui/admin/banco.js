/**
 * Página: Banco · Admin
 *
 * Lista cronológica de TODOS os movimentos bancários do ano:
 *   - Recibos (entradas, exceto estornos que são saídas)
 *   - Outros recebimentos (entradas)
 *   - Pagamentos de despesa (saídas)
 *
 * Para cada linha calcula-se o saldo acumulado após o movimento.
 */

import * as store from '../../store/local-store.js';
import * as saldoBanco from '../../modules/saldo-banco.js';
import * as router from '../router.js';
import * as modalDR from '../modal-detalhe-recibo.js';
import { icon } from '../icons.js';
import { formatMoney, formatDate } from '../../utils/format.js';

let state = {
  ano: new Date().getFullYear().toString(),
  tipo: 'saidas'  // 'todos' | 'entradas' | 'saidas' · default em saídas (foco em pagamentos)
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
              <div class="breadcrumb">Movimentos do Exercício</div>
              <h1>Situação Bancária</h1>
            </div>
          </div>
        </div>

        <div id="saldo-resumo"></div>

        <div class="filters">
          <div class="filter-group">
            <label>Ano</label>
            <select id="f-ano">
              <option value="2024" ${state.ano === '2024' ? 'selected' : ''}>2024</option>
              <option value="2025" ${state.ano === '2025' ? 'selected' : ''}>2025</option>
              <option value="2026" ${state.ano === '2026' ? 'selected' : ''}>2026</option>
            </select>
          </div>
          <div class="filter-group">
            <label>Tipo</label>
            <select id="f-tipo">
              <option value="todos" ${state.tipo === 'todos' ? 'selected' : ''}>Todos</option>
              <option value="entradas" ${state.tipo === 'entradas' ? 'selected' : ''}>Só entradas</option>
              <option value="saidas" ${state.tipo === 'saidas' ? 'selected' : ''}>Só saídas</option>
            </select>
          </div>
        </div>

        <div id="banco-lista"></div>
      </main>
    </div>
  `;

  await renderAll();

  container.querySelector('#brand').addEventListener('click', () => router.navigate('admin/home'));
  container.querySelector('#back-home').addEventListener('click', () => router.navigate('admin/home'));
  container.querySelector('#hamburger').addEventListener('click', () => router.navigate('admin/home'));
  container.querySelector('#f-ano').addEventListener('change', (e) => { state.ano = e.target.value; renderAll(); });
  container.querySelector('#f-tipo').addEventListener('change', (e) => { state.tipo = e.target.value; renderAll(); });
}

async function renderAll() {
  const ano = state.ano;
  const { saldo, receitas, despesas, saldoInicial, saldoConhecido, diferenca, marco } = await saldoBanco.calcularSaldo(ano);

  // Bloco superior · saldo real BPI + saldo calculado + diferença
  const saldoConhecidoHtml = saldoConhecido ? `
    <div class="bank-real-card">
      <div class="brc-head">
        <span class="brc-lbl">Saldo Real BPI · ${formatDate(saldoConhecido.data)}</span>
        <button class="btn-link" id="btn-edit-saldo-real">Atualizar</button>
      </div>
      <div class="brc-total">${formatMoney(saldoConhecido.contaOrdem_centimos || saldoConhecido.total_centimos)}</div>
      <div class="brc-breakdown">
        <span><strong>${formatMoney(saldoConhecido.contaOrdem_centimos || saldoConhecido.total_centimos)}</strong> Conta à Ordem · em gestão</span>
        ${saldoConhecido.contaPoupanca_centimos ? `<span class="poup-aside"><strong>${formatMoney(saldoConhecido.contaPoupanca_centimos)}</strong> Poupança · reservado</span>` : ''}
      </div>
      ${diferenca !== null && Math.abs(diferenca) >= 100 ? `
        <div class="brc-diff ${diferenca > 0 ? 'pos' : 'neg'}">
          Diferença vs calculado:
          <strong>${diferenca > 0 ? '+' : ''}${formatMoney(diferenca)}</strong>
          ${diferenca > 0 ? '· o BPI tem mais do que o esperado' : '· o BPI tem menos do que o esperado'}
        </div>
      ` : (diferenca !== null && Math.abs(diferenca) < 100 ? `
        <div class="brc-diff ok">✓ Calculado bate com o real (margem < 1€)</div>
      ` : '')}
    </div>
  ` : `
    <div class="bank-real-card empty">
      <div class="brc-head">
        <span class="brc-lbl">Saldo Real BPI</span>
        <button class="btn-link" id="btn-edit-saldo-real">Registar</button>
      </div>
      <p style="margin:6px 0 0 0;font-size:12px;color:var(--text-muted)">
        Sem registo · clica em "Registar" para introduzir o saldo atual do BPI.
      </p>
    </div>
  `;

  // Resumo no topo
  containerRef.querySelector('#saldo-resumo').innerHTML = `
    ${saldoConhecidoHtml}
    <div class="bank-summary">
      <div class="bs-lbl">Saldo Calculado · ${ano}${marco ? ` · desde ${formatDate(marco.dataInicio)}` : ''}</div>
      <div class="bs-value">${formatMoney(saldo)}</div>
      <div class="bs-formula">
        <span title="${marco ? `Saldo inicial à data ${formatDate(marco.dataInicio)}` : 'Saldo inicial'}">${formatMoney(saldoInicial)}</span>
        <span class="op">+</span>
        <span class="rec" title="${marco ? 'Receitas após o marco' : 'Receitas'}">${formatMoney(receitas)}</span>
        <span class="op">−</span>
        <span class="desp" title="${marco ? 'Despesas após o marco' : 'Despesas'}">${formatMoney(despesas)}</span>
      </div>
      ${marco ? `<div class="bs-marco-hint">Início de gestão: <strong>${formatDate(marco.dataInicio)}</strong> · movimentos anteriores são apenas histórico</div>` : ''}
    </div>
  `;

  // Listener do botão de saldo real
  const btnEdit = containerRef.querySelector('#btn-edit-saldo-real');
  if (btnEdit) {
    btnEdit.addEventListener('click', () => abrirModalSaldoReal(saldoConhecido));
  }

  // Construir lista de movimentos
  // Quando é o ano do marco · só movimentos pós-go-live (importados têm excluirDoSaldo=true)
  const filtroMarco = marco ? (m => !m.excluirDoSaldo) : (m => true);

  const receipts = (await store.queryDocs('receipts', { ano })).filter(filtroMarco).map(r => ({
    id: r.id,
    data: r.data,
    descricao: r.descricao,
    detalhe: `${r.fraction || ''} · ${r.tenantName || ''} · RCB ${r.recibo_numero || ''}`,
    valor: r.valor_centimos,
    tipo: r.valor_centimos < 0 ? 'estorno' : 'recibo',
    sourceId: r.id,
    sourceCol: 'receipts',
    cancelado: r.cancelado
  }));

  const outros = (await store.queryDocs('outrosRecebimentos', { ano })).filter(filtroMarco).map(o => ({
    id: 'o-' + o.id,
    data: o.data,
    descricao: o.descricao,
    detalhe: 'Outro recebimento',
    valor: o.valor_centimos,
    tipo: 'outro',
    sourceId: o.id,
    sourceCol: 'outrosRecebimentos'
  }));

  const despesasList = (await store.listDocs('pagamentosDespesa'))
    .filter(d => d.data && d.data.startsWith(ano))
    .filter(filtroMarco)
    .map(d => ({
      id: 'd-' + d.id,
      data: d.data,
      descricao: d.descricao,
      detalhe: d.fornecedor || 'Despesa',
      valor: -Math.abs(d.valor_centimos),
      tipo: 'despesa',
      sourceId: d.id,
      sourceCol: 'pagamentosDespesa'
    }));

  let movimentos = [...receipts, ...outros, ...despesasList];

  // Filtro por tipo
  if (state.tipo === 'entradas') movimentos = movimentos.filter(m => m.valor > 0);
  if (state.tipo === 'saidas') movimentos = movimentos.filter(m => m.valor < 0);

  // Ordenar por data crescente (para calcular saldo acumulado)
  movimentos.sort((a, b) =>
    (a.data || '').localeCompare(b.data || '') || (a.id || '').localeCompare(b.id || '')
  );

  // Calcular saldo acumulado linha a linha
  let acumulado = saldoInicial;
  movimentos.forEach(m => {
    if (m.cancelado) return;  // cancelados não contam para o saldo
    acumulado += m.valor;
    m.saldoApos = acumulado;
  });

  // Mostrar do mais recente para o mais antigo
  movimentos.reverse();

  if (movimentos.length === 0) {
    containerRef.querySelector('#banco-lista').innerHTML = `
      <div class="placeholder">
        <h3>Sem movimentos para estes filtros</h3>
      </div>
    `;
    return;
  }

  const rowsHtml = movimentos.map(m => buildRow(m)).join('');
  containerRef.querySelector('#banco-lista').innerHTML = `
    <div class="bank-totals">
      <div class="bt-item">
        <div class="bt-lbl">Saldo inicial</div>
        <div class="bt-val">${formatMoney(saldoInicial)}</div>
      </div>
      <div class="bt-item">
        <div class="bt-lbl">Entradas</div>
        <div class="bt-val pos">+${formatMoney(receitas)}</div>
      </div>
      <div class="bt-item">
        <div class="bt-lbl">Saídas</div>
        <div class="bt-val neg">−${formatMoney(despesas)}</div>
      </div>
      <div class="bt-item">
        <div class="bt-lbl">Saldo actual</div>
        <div class="bt-val"><strong>${formatMoney(saldo)}</strong></div>
      </div>
    </div>
    <div class="movements">${rowsHtml}</div>
  `;

  // Click em linha de recibo abre o detalhe
  containerRef.querySelectorAll('.mov[data-source-col="receipts"]').forEach(el => {
    el.addEventListener('click', () => modalDR.open(el.dataset.sourceId, { onUpdate: () => renderAll() }));
  });
}

function buildRow(m) {
  const isIn = m.valor > 0;
  const sign = isIn ? 'in' : 'out';
  const ic = isIn ? 'ic-quota-in' : 'ic-payment-out';
  const cls = m.cancelado ? 'mov cancelled' : 'mov';
  const interactive = m.sourceCol === 'receipts' ? 'cursor:pointer' : '';

  return `
    <div class="${cls}" data-source-id="${m.sourceId}" data-source-col="${m.sourceCol}" style="${interactive}">
      <div class="mov-ic ${sign}">${icon(ic, 'm-ic')}</div>
      <div class="mov-txt">
        <div class="mov-title">
          ${m.cancelado ? '<span class="badge-cancelled">CANC</span> ' : ''}
          ${m.descricao || m.detalhe}
        </div>
        <div class="mov-meta">${formatDate(m.data)} · ${m.detalhe}</div>
      </div>
      <div class="mov-right">
        <div class="mov-val ${isIn ? 'pos' : 'neg'}">${isIn ? '+' : ''}${formatMoney(m.valor)}</div>
        ${m.saldoApos !== undefined ? `<div class="mov-saldo">Saldo: ${formatMoney(m.saldoApos)}</div>` : ''}
      </div>
    </div>
  `;
}

/**
 * Abre modal para registar/atualizar o saldo real observado no BPI.
 */
function abrirModalSaldoReal(atual) {
  const hoje = new Date().toISOString().slice(0, 10);
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal">
      <div class="modal-head">
        <h3>${atual ? 'Atualizar' : 'Registar'} Saldo Real BPI</h3>
        <button class="btn-close" id="sr-close">✕</button>
      </div>
      <div class="modal-body">
        <p class="orc-help">
          Introduz os saldos atuais lidos do BPI Net Empresas. Servem como ancoragem para detectar descalibração com o saldo calculado pela app.
        </p>
        <div class="modal-alert-warn">
          ⚠ <strong>Atenção:</strong> a alteração manual do saldo pode gerar discrepância com o saldo calculado pela app (recibos – despesas + saldo inicial). Usa apenas se queres ancorar ao valor real do banco.
        </div>
        <div class="field">
          <label>Data da observação</label>
          <input type="date" id="sr-data" value="${atual?.data || hoje}">
        </div>
        <div class="field-row">
          <div class="field">
            <label>Conta à Ordem (€)</label>
            <input type="text" id="sr-co" value="${atual ? (atual.contaOrdem_centimos / 100).toFixed(2).replace('.', ',') : ''}" placeholder="7521,78">
          </div>
          <div class="field">
            <label>Conta Poupança (€)</label>
            <input type="text" id="sr-poup" value="${atual ? (atual.contaPoupanca_centimos / 100).toFixed(2).replace('.', ',') : '704,34'}" placeholder="704,34">
          </div>
        </div>
        <div class="field">
          <label>Notas (opcional)</label>
          <input type="text" id="sr-notas" value="${escapeAttr(atual?.notas || '')}" maxlength="100" placeholder="ex: posição integrada BPI">
        </div>
        <div id="sr-msg"></div>
      </div>
      <div class="modal-actions">
        <button class="btn ghost" id="sr-cancel">Cancelar</button>
        <button class="btn primary" id="sr-save">Guardar</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  const close = () => modal.remove();
  modal.querySelector('#sr-close').addEventListener('click', close);
  modal.querySelector('#sr-cancel').addEventListener('click', close);
  modal.addEventListener('click', e => { if (e.target === modal) close(); });

  modal.querySelector('#sr-save').addEventListener('click', async () => {
    const data = modal.querySelector('#sr-data').value;
    const co = eurToCent(modal.querySelector('#sr-co').value);
    const poup = eurToCent(modal.querySelector('#sr-poup').value);
    const notas = modal.querySelector('#sr-notas').value.trim();
    if (!data) {
      modal.querySelector('#sr-msg').innerHTML = '<div class="save-msg save-msg-error">Data obrigatória.</div>';
      return;
    }
    try {
      await saldoBanco.setSaldoConhecido({ data, contaOrdem_centimos: co, contaPoupanca_centimos: poup, notas });
      close();
      await renderAll();
    } catch (e) {
      modal.querySelector('#sr-msg').innerHTML = `<div class="save-msg save-msg-error">${e.message}</div>`;
    }
  });
}

function eurToCent(s) {
  if (!s) return 0;
  const cleaned = String(s).replace(/\s/g, '').replace(/\./g, '').replace(',', '.');
  const n = parseFloat(cleaned);
  if (isNaN(n)) return 0;
  return Math.round(n * 100);
}

function escapeAttr(s) { return String(s || '').replace(/"/g, '&quot;'); }
