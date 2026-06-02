/**
 * Página: Orçamento Anual · v2
 *
 * Secções:
 *  - Resumo
 *  - Quotas dos Condóminos (incremento % + arredondamento + tabela por fração)
 *  - Outras Receitas (lista livre)
 *  - Despesas por Rúbrica (pré-preenchidas, majoração %, edição individual)
 *  - Despesas Manuais (lista livre)
 *  - Saldo Inicial + Fundo de Reserva + Observações
 *  - Ações (Gravar / Aprovar / Editar versão / Descartar)
 */

import * as orcamento from '../../modules/orcamento.js';
import * as rubricas from '../../modules/rubricas.js';
import * as store from '../../store/local-store.js';
import * as exportExcel from '../../modules/export-excel.js';
import * as auth from '../../auth/local-auth.js';
import * as router from '../router.js';
import { icon } from '../icons.js';
import { formatMoney } from '../../utils/format.js';

let state = { ano: orcamento.anoPorDefeito(), orcamento: null, tenants: [] };
let containerRef = null;

export async function render(container) {
  containerRef = container;
  const anos = orcamento.anosDisponiveis();
  if (!anos.includes(state.ano)) state.ano = orcamento.anoPorDefeito();

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
              <div class="breadcrumb">Previsão Anual</div>
              <h1>Orçamento</h1>
            </div>
            <div style="margin-left:auto;display:flex;gap:8px;align-items:center">
              <select id="f-ano" class="ano-select">
                ${anos.map(a => `<option value="${a}" ${state.ano === a ? 'selected' : ''}>${a}</option>`).join('')}
              </select>
              <button class="btn primary" id="btn-excel-orc" style="display:none">📊 Exportar Excel</button>
            </div>
          </div>
        </div>
        <div id="orc-body"></div>
      </main>
    </div>
  `;

  state.tenants = (await store.listDocs('tenants')).sort((a, b) => (a.fraction || '').localeCompare(b.fraction || ''));
  await renderBody();

  container.querySelector('#brand').addEventListener('click', () => router.navigate('admin/home'));
  container.querySelector('#back-home').addEventListener('click', () => router.navigate('admin/home'));
  container.querySelector('#hamburger').addEventListener('click', () => router.navigate('admin/home'));
  container.querySelector('#f-ano').addEventListener('change', (e) => {
    state.ano = e.target.value;
    renderBody();
  });
  container.querySelector('#btn-excel-orc').addEventListener('click', exportarExcel);
}

async function exportarExcel() {
  const btn = containerRef.querySelector('#btn-excel-orc');
  btn.disabled = true;
  const original = btn.textContent;
  btn.textContent = 'A gerar...';
  try {
    await exportExcel.exportarOrcamentoAno(state.ano);
    btn.textContent = '✓ Descarregado';
    setTimeout(() => { btn.textContent = original; btn.disabled = false; }, 1800);
  } catch (e) {
    alert('Erro: ' + e.message);
    btn.textContent = original;
    btn.disabled = false;
  }
}

async function renderBody() {
  const bodyEl = containerRef.querySelector('#orc-body');
  state.orcamento = await orcamento.obterAtivo(state.ano);
  const historico = await orcamento.historicoVersoes(state.ano);

  // Botão Excel só aparece quando existe orçamento (rascunho ou aprovado)
  const btnExcel = containerRef.querySelector('#btn-excel-orc');
  if (btnExcel) btnExcel.style.display = state.orcamento ? '' : 'none';

  if (!state.orcamento) {
    const anoAnt = String(parseInt(state.ano, 10) - 1);
    bodyEl.innerHTML = `
      <div class="info-card" style="text-align:center;padding:40px 20px">
        <div style="font-size:36px;margin-bottom:12px">📋</div>
        <h3 style="margin:0 0 8px 0">Sem orçamento para ${state.ano}</h3>
        <p style="margin:0 0 16px 0;color:var(--text-muted);font-size:13px">
          Vai ser pré-populado com:<br>
          • Quotas mensais do ano ${anoAnt}<br>
          • Despesas realizadas por rúbrica em ${anoAnt}
        </p>
        <button class="btn primary" id="btn-criar">+ Criar Rascunho ${state.ano}</button>
      </div>
    `;
    containerRef.querySelector('#btn-criar').addEventListener('click', async () => {
      try {
        const session = auth.getSession();
        await orcamento.criarRascunho(state.ano, session?.operatorName);
        renderBody();
      } catch (e) { alert(e.message); }
    });
    return;
  }

  const orc = state.orcamento;
  const totais = orcamento.calcularTotais(orc);
  const editable = orc.estado === 'rascunho';
  const rubsLista = await rubricas.listar();

  bodyEl.innerHTML = `
    ${renderEstadoBanner(orc, historico)}
    ${renderResumo(totais, editable, orc)}
    ${renderQuotas(orc, editable)}
    ${renderOutrasReceitas(orc, editable)}
    ${renderDespesasRubricas(orc, rubsLista, editable)}
    ${renderDespesasManuais(orc, editable)}
    ${renderObservacoes(orc, editable)}
    ${renderActions(orc, editable)}
    ${historico.length > 1 ? renderHistorico(historico) : ''}
  `;

  bindEvents();
}

// ───────────────────────── BLOCOS ─────────────────────────

function renderEstadoBanner(orc, historico) {
  const cls = orc.estado === 'aprovado' ? 'banner-ok' : 'banner-amber';
  const label = orc.estado === 'aprovado'
    ? `Aprovado · v${orc.versao} · ${formatDateTime(orc.aprovadoEm)}${orc.aprovadoPor ? ' por ' + orc.aprovadoPor : ''}`
    : `Rascunho · v${orc.versao}`;
  return `
    <div class="orc-banner ${cls}">
      <strong>${label}</strong>
      ${historico.length > 1 ? `<span class="banner-meta">${historico.length} versões no histórico</span>` : ''}
    </div>
  `;
}

function renderResumo(t, editable, orc) {
  const resCls = t.resultadoEsperado >= 0 ? 'resumo-positive' : 'resumo-negative';
  return `
    <div class="orc-resumo">
      <div class="resumo-line">
        <span class="rl-label">Saldo Inicial Transitado</span>
        ${editable
          ? `<input type="text" class="rl-input" id="r-saldo-inicial" value="${centavosToEur(t.saldoInicial)}">`
          : `<span class="rl-val">${formatMoney(t.saldoInicial)}</span>`}
      </div>
      <div class="resumo-line">
        <span class="rl-label">+ Quotas Previstas (anual)</span>
        <span class="rl-val positive">${formatMoney(t.valorAnualQuotas)}</span>
      </div>
      <div class="resumo-line">
        <span class="rl-label">+ Outras Receitas</span>
        <span class="rl-val positive">${formatMoney(t.outrasReceitas)}</span>
      </div>
      <div class="resumo-line">
        <span class="rl-label">− Despesas por Rúbrica</span>
        <span class="rl-val negative">${formatMoney(t.despesasPorRub)}</span>
      </div>
      <div class="resumo-line">
        <span class="rl-label">− Despesas Manuais</span>
        <span class="rl-val negative">${formatMoney(t.despesasManuais)}</span>
      </div>
      <div class="resumo-line">
        <span class="rl-label">− Fundo de Reserva</span>
        ${editable
          ? `<input type="text" class="rl-input" id="r-fundo" value="${centavosToEur(t.fundoReserva)}">`
          : `<span class="rl-val negative">${formatMoney(t.fundoReserva)}</span>`}
      </div>
      <div class="resumo-line resumo-total ${resCls}">
        <span class="rl-label">= Resultado Esperado</span>
        <span class="rl-val">${formatMoney(t.resultadoEsperado)}</span>
      </div>
    </div>
  `;
}

function renderQuotas(orc, editable) {
  const anoAnt = String(parseInt(orc.ano, 10) - 1);
  const pct = orc.quotas?.incrementoPct || 0;
  const arr = orc.quotas?.arredondamento || 'inteiro';
  const quotasAnt = orc.quotas?.quotasMensaisAnoAnt || {};
  const quotasNov = orc.quotas?.quotasMensaisPorTenant || {};

  // Total mensal (calculado em tempo real para mostrar no fim da tabela)
  const totalMensal = Object.values(quotasNov).reduce((s, v) => s + (v || 0), 0);
  const totalAnual = totalMensal * 12;

  const rows = state.tenants.map(t => {
    const ant = quotasAnt[t.id] || 0;
    const nov = quotasNov[t.id] || 0;
    const anual = nov * 12;
    const variacao = ant > 0 ? Math.round((nov - ant) / ant * 100) : null;
    return `
      <tr data-tid="${t.id}">
        <td class="tq-frac">${escapeHtml(t.fraction || '')}</td>
        <td class="tq-name">${escapeHtml(t.name || '')}</td>
        <td class="tq-perm">${t.permilage || 0}‰</td>
        <td class="tq-ant">${formatMoney(ant)}</td>
        <td class="tq-nov">
          ${editable
            ? `<input type="text" class="tq-nov-input" data-tid="${t.id}" value="${centavosToEur(nov)}">`
            : `<span>${formatMoney(nov)}</span>`}
          ${variacao !== null && variacao !== 0
            ? `<span class="tq-var ${variacao > 0 ? 'var-up' : 'var-down'}">${variacao > 0 ? '+' : ''}${variacao}%</span>`
            : ''}
        </td>
        <td class="tq-anu">${formatMoney(anual)}</td>
      </tr>
    `;
  }).join('');

  return `
    <div class="orc-section">
      <h3>Quotas dos Condóminos</h3>
      <p class="orc-help">Base: quotas mensais de ${anoAnt}. Define um incremento percentual e o arredondamento.
        Podes também ajustar cada quota manualmente. <strong>Ao aprovar, estas quotas substituem as actuais para ${orc.ano}.</strong></p>

      ${editable ? `
        <div class="orc-control-line">
          <label>Incremento percentual
            <input type="text" class="ctrl-input" id="q-pct" value="${pct}" placeholder="0">
            <span class="unit">%</span>
          </label>
          <label>Arredondamento
            <select class="ctrl-input" id="q-arr">
              <option value="cent"    ${arr === 'cent' ? 'selected' : ''}>Sem (€0,01)</option>
              <option value="meio"    ${arr === 'meio' ? 'selected' : ''}>€0,50</option>
              <option value="inteiro" ${arr === 'inteiro' ? 'selected' : ''}>€1,00 (inteiro)</option>
            </select>
          </label>
          <button class="btn" id="btn-recalc-quotas">↻ Aplicar a todos</button>
        </div>
      ` : ''}

      <div class="tab-quotas-wrap">
        <table class="tab-quotas">
          <thead>
            <tr>
              <th>Fração</th>
              <th>Condómino</th>
              <th class="num">Permil.</th>
              <th class="num">${anoAnt}</th>
              <th class="num">${orc.ano} mensal</th>
              <th class="num">${orc.ano} anual</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
          <tfoot>
            <tr>
              <td colspan="4" class="tq-tot-lbl">Totais</td>
              <td class="num"><strong>${formatMoney(totalMensal)}</strong> / mês</td>
              <td class="num"><strong>${formatMoney(totalAnual)}</strong> / ano</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  `;
}

function renderOutrasReceitas(orc, editable) {
  const rows = (orc.outrasReceitas || []).map(r => `
    <div class="rec-row" data-id="${r.id}">
      ${editable
        ? `<input type="text" class="rec-desc" placeholder="Descrição (ex: Cessão telecom)" value="${escapeAttr(r.descricao)}">`
        : `<span class="rec-desc-ro">${escapeHtml(r.descricao)}</span>`}
      ${editable
        ? `<input type="text" class="rec-val" placeholder="0,00" value="${centavosToEur(r.valor_centimos)}">`
        : `<span class="rec-val-ro">${formatMoney(r.valor_centimos)}</span>`}
      ${editable ? `<button class="btn-icon-mini" data-action="rec-del" title="Remover">✕</button>` : ''}
    </div>
  `).join('');
  return `
    <div class="orc-section">
      <h3>Outras Receitas</h3>
      <p class="orc-help">Para receitas pontuais ou recorrentes que não sejam quotas (cessões, juros, etc.).</p>
      <div id="receitas-list">${rows}</div>
      ${editable ? `<button class="btn ghost" id="btn-rec-add">+ Adicionar Receita</button>` : ''}
    </div>
  `;
}

function renderDespesasRubricas(orc, rubsLista, editable) {
  const anoAnt = String(parseInt(orc.ano, 10) - 1);
  const ativas = rubsLista.filter(r => !r.terminadaEm);
  const realizadoAnt = orc.despesas?.realizadoAnoAnt || {};
  const porRub = orc.despesas?.porRubrica || {};
  const pctMassa = orc.despesas?.incrementoPctMassa || 0;

  const rows = ativas.map(r => {
    const ant = realizadoAnt[r.id] || 0;
    const novo = porRub[r.id] || 0;
    const variacao = ant > 0 ? Math.round((novo - ant) / ant * 100) : null;
    return `
      <tr data-rid="${r.id}">
        <td class="td-rub-name">${escapeHtml(r.nome)}</td>
        <td class="num">${formatMoney(ant)}</td>
        <td class="num">
          ${editable
            ? `<input type="text" class="td-rub-val" data-rid="${r.id}" value="${centavosToEur(novo)}">`
            : `<span>${formatMoney(novo)}</span>`}
          ${variacao !== null && variacao !== 0
            ? `<span class="tq-var ${variacao > 0 ? 'var-up' : 'var-down'}">${variacao > 0 ? '+' : ''}${variacao}%</span>`
            : ''}
        </td>
      </tr>
    `;
  }).join('');

  const semAtivas = ativas.length === 0
    ? `<p class="orc-help" style="color:var(--text-muted)">Sem rúbricas ativas. Cria-as em <em>Definições → Rúbricas</em>.</p>`
    : '';

  return `
    <div class="orc-section">
      <h3>Despesas Previstas por Rúbrica</h3>
      <p class="orc-help">Pré-preenchidas com o realizado em ${anoAnt}. Aplica majoração em massa ou edita cada uma.</p>

      ${editable && ativas.length > 0 ? `
        <div class="orc-control-line">
          <label>Majoração em massa
            <input type="text" class="ctrl-input" id="d-pct" value="${pctMassa}" placeholder="0">
            <span class="unit">%</span>
          </label>
          <button class="btn" id="btn-recalc-despesas">↻ Aplicar a todas</button>
        </div>
      ` : ''}

      ${semAtivas}
      ${ativas.length > 0 ? `
        <div class="tab-quotas-wrap">
          <table class="tab-quotas">
            <thead>
              <tr>
                <th>Rúbrica</th>
                <th class="num">Realizado ${anoAnt}</th>
                <th class="num">Previsto ${orc.ano}</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      ` : ''}
    </div>
  `;
}

function renderDespesasManuais(orc, editable) {
  const rows = (orc.despesas?.manuais || []).map(m => `
    <div class="rec-row" data-id="${m.id}">
      ${editable
        ? `<input type="text" class="dm-desc" placeholder="Descrição (ex: Pintura do prédio)" value="${escapeAttr(m.descricao)}">`
        : `<span class="rec-desc-ro">${escapeHtml(m.descricao)}</span>`}
      ${editable
        ? `<input type="text" class="dm-val" placeholder="0,00" value="${centavosToEur(m.valor_centimos)}">`
        : `<span class="rec-val-ro">${formatMoney(m.valor_centimos)}</span>`}
      ${editable ? `<button class="btn-icon-mini" data-action="dm-del" title="Remover">✕</button>` : ''}
    </div>
  `).join('');
  return `
    <div class="orc-section">
      <h3>Despesas Manuais</h3>
      <p class="orc-help">Despesas pontuais não enquadradas nas rúbricas regulares (ex: obras extraordinárias).</p>
      <div id="manuais-list">${rows}</div>
      ${editable ? `<button class="btn ghost" id="btn-dm-add">+ Adicionar Despesa Manual</button>` : ''}
    </div>
  `;
}

function renderObservacoes(orc, editable) {
  return `
    <div class="orc-section">
      <h3>Observações</h3>
      ${editable
        ? `<textarea id="r-obs" rows="3" placeholder="Notas, justificações para a assembleia...">${escapeHtml(orc.observacoes || '')}</textarea>`
        : `<div class="obs-ro">${orc.observacoes ? escapeHtml(orc.observacoes) : '<em style="color:var(--text-muted)">Sem observações</em>'}</div>`}
    </div>
  `;
}

function renderActions(orc, editable) {
  if (editable) {
    return `
      <div class="orc-actions">
        <button class="btn ghost" id="btn-descartar">Descartar Rascunho</button>
        <button class="btn" id="btn-guardar">Gravar Rascunho</button>
        <button class="btn primary" id="btn-aprovar">Aprovar Orçamento</button>
      </div>
    `;
  }
  return `<div class="orc-actions"><button class="btn primary" id="btn-rever">Editar como Nova Versão</button></div>`;
}

function renderHistorico(historico) {
  return `
    <details class="orc-historico">
      <summary><strong>Histórico</strong> · ${historico.length} versões</summary>
      <div class="hist-list">
        ${historico.map(h => `
          <div class="hist-row hist-${h.estado}">
            <span class="hr-versao">v${h.versao}</span>
            <span class="hr-estado">${h.estado}</span>
            <span class="hr-data">${h.aprovadoEm ? `Aprovado ${formatDateTime(h.aprovadoEm)}` : `Criado ${formatDateTime(h.criadoEm)}`}</span>
            <span class="hr-por">${h.aprovadoPor || h.criadoPor || ''}</span>
          </div>
        `).join('')}
      </div>
    </details>
  `;
}

// ───────────────────────── EVENTOS ─────────────────────────

function bindEvents() {
  const orc = state.orcamento;
  const editable = orc.estado === 'rascunho';

  if (editable) {
    const btnRecQuotas = containerRef.querySelector('#btn-recalc-quotas');
    if (btnRecQuotas) btnRecQuotas.addEventListener('click', recalcQuotas);

    const btnRecDesp = containerRef.querySelector('#btn-recalc-despesas');
    if (btnRecDesp) btnRecDesp.addEventListener('click', recalcDespesas);

    const btnRecAdd = containerRef.querySelector('#btn-rec-add');
    if (btnRecAdd) btnRecAdd.addEventListener('click', addReceita);

    const btnDmAdd = containerRef.querySelector('#btn-dm-add');
    if (btnDmAdd) btnDmAdd.addEventListener('click', addManual);

    containerRef.querySelectorAll('[data-action="rec-del"]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = e.target.closest('.rec-row').dataset.id;
        if (confirm('Remover esta receita?')) removeReceita(id);
      });
    });
    containerRef.querySelectorAll('[data-action="dm-del"]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = e.target.closest('.rec-row').dataset.id;
        if (confirm('Remover esta despesa manual?')) removeManual(id);
      });
    });

    containerRef.querySelector('#btn-descartar').addEventListener('click', descartar);
    containerRef.querySelector('#btn-guardar').addEventListener('click', () => guardar(true));
    containerRef.querySelector('#btn-aprovar').addEventListener('click', aprovar);
  } else {
    containerRef.querySelector('#btn-rever').addEventListener('click', rever);
  }
}

async function recalcQuotas() {
  await guardarSilencioso();
  const orc = state.orcamento;
  // Ler pct + arredondamento dos inputs
  const pct = parseFloat((containerRef.querySelector('#q-pct').value || '0').replace(',', '.')) || 0;
  const arr = containerRef.querySelector('#q-arr').value;
  orc.quotas.incrementoPct = pct;
  orc.quotas.arredondamento = arr;
  orc.quotas.quotasMensaisPorTenant = orcamento.recalcularQuotas(orc);
  await orcamento.atualizar(orc.id, { quotas: orc.quotas });
  await renderBody();
}

async function recalcDespesas() {
  await guardarSilencioso();
  const orc = state.orcamento;
  const pct = parseFloat((containerRef.querySelector('#d-pct').value || '0').replace(',', '.')) || 0;
  orc.despesas.incrementoPctMassa = pct;
  orc.despesas.porRubrica = orcamento.recalcularDespesas(orc);
  await orcamento.atualizar(orc.id, { despesas: orc.despesas });
  await renderBody();
}

async function addReceita() {
  await guardarSilencioso();
  const orc = state.orcamento;
  orc.outrasReceitas = orc.outrasReceitas || [];
  orc.outrasReceitas.push({ id: localUid(), descricao: '', valor_centimos: 0 });
  await orcamento.atualizar(orc.id, { outrasReceitas: orc.outrasReceitas });
  renderBody();
}

async function removeReceita(id) {
  const orc = state.orcamento;
  orc.outrasReceitas = (orc.outrasReceitas || []).filter(r => r.id !== id);
  await orcamento.atualizar(orc.id, { outrasReceitas: orc.outrasReceitas });
  renderBody();
}

async function addManual() {
  await guardarSilencioso();
  const orc = state.orcamento;
  orc.despesas.manuais = orc.despesas.manuais || [];
  orc.despesas.manuais.push({ id: localUid(), descricao: '', valor_centimos: 0 });
  await orcamento.atualizar(orc.id, { despesas: orc.despesas });
  renderBody();
}

async function removeManual(id) {
  const orc = state.orcamento;
  orc.despesas.manuais = (orc.despesas.manuais || []).filter(m => m.id !== id);
  await orcamento.atualizar(orc.id, { despesas: orc.despesas });
  renderBody();
}

async function guardar(feedback) {
  const orc = state.orcamento;
  const updates = colherInputs(orc);
  try {
    await orcamento.atualizar(orc.id, updates);
    state.orcamento = await orcamento.obterAtivo(state.ano);
    if (feedback) {
      const btn = containerRef.querySelector('#btn-guardar');
      const o = btn.textContent;
      btn.textContent = '✓ Guardado';
      setTimeout(() => { btn.textContent = o; }, 1500);
      await renderBody();  // re-render para mostrar totais atualizados
    }
  } catch (e) { alert('Erro a guardar: ' + e.message); }
}

async function guardarSilencioso() {
  if (state.orcamento?.estado === 'rascunho') await guardar(false);
}

function colherInputs(orc) {
  const updates = {};

  const elSaldo = containerRef.querySelector('#r-saldo-inicial');
  if (elSaldo) updates.saldoInicial_centimos = eurToCentavos(elSaldo.value);

  const elFundo = containerRef.querySelector('#r-fundo');
  if (elFundo) updates.fundoReserva_centimos = eurToCentavos(elFundo.value);

  const elObs = containerRef.querySelector('#r-obs');
  if (elObs) updates.observacoes = elObs.value.trim();

  // Quotas: ler pct, arredondamento, e overrides manuais
  const elPctQ = containerRef.querySelector('#q-pct');
  const elArrQ = containerRef.querySelector('#q-arr');
  if (elPctQ && elArrQ) {
    const quotasNov = {};
    containerRef.querySelectorAll('.tq-nov-input').forEach(inp => {
      quotasNov[inp.dataset.tid] = eurToCentavos(inp.value);
    });
    updates.quotas = {
      ...orc.quotas,
      incrementoPct: parseFloat((elPctQ.value || '0').replace(',', '.')) || 0,
      arredondamento: elArrQ.value,
      quotasMensaisPorTenant: quotasNov
    };
  }

  // Outras receitas
  const receitasNovas = [];
  containerRef.querySelectorAll('#receitas-list .rec-row').forEach(row => {
    receitasNovas.push({
      id: row.dataset.id,
      descricao: row.querySelector('.rec-desc')?.value.trim() || '',
      valor_centimos: eurToCentavos(row.querySelector('.rec-val')?.value)
    });
  });
  updates.outrasReceitas = receitasNovas;

  // Despesas
  const elPctD = containerRef.querySelector('#d-pct');
  const porRub = {};
  containerRef.querySelectorAll('.td-rub-val').forEach(inp => {
    porRub[inp.dataset.rid] = eurToCentavos(inp.value);
  });
  const manuais = [];
  containerRef.querySelectorAll('#manuais-list .rec-row').forEach(row => {
    manuais.push({
      id: row.dataset.id,
      descricao: row.querySelector('.dm-desc')?.value.trim() || '',
      valor_centimos: eurToCentavos(row.querySelector('.dm-val')?.value)
    });
  });
  updates.despesas = {
    ...orc.despesas,
    incrementoPctMassa: elPctD ? (parseFloat((elPctD.value || '0').replace(',', '.')) || 0) : (orc.despesas?.incrementoPctMassa || 0),
    porRubrica: porRub,
    manuais
  };

  return updates;
}

async function aprovar() {
  if (!confirm(
    `Aprovar este orçamento? \n\n` +
    `IMPORTANTE: as quotas mensais calculadas substituem automaticamente as quotas actuais de cada condómino para o ano ${state.ano}.\n\n` +
    `Edições futuras criam nova versão (a atual fica arquivada).`
  )) return;
  try {
    await guardar(false);
    const session = auth.getSession();
    await orcamento.aprovar(state.orcamento.id, session?.operatorName);
    renderBody();
  } catch (e) { alert('Erro: ' + e.message); }
}

async function rever() {
  if (!confirm('Editar o orçamento aprovado? Será criada uma nova versão em rascunho. A actual fica arquivada.')) return;
  try {
    const session = auth.getSession();
    await orcamento.editarComoNovaVersao(state.ano, session?.operatorName);
    renderBody();
  } catch (e) { alert('Erro: ' + e.message); }
}

async function descartar() {
  if (!confirm('Descartar este rascunho? Esta acção é definitiva.')) return;
  try {
    await orcamento.descartarRascunho(state.orcamento.id);
    state.orcamento = null;
    renderBody();
  } catch (e) { alert('Erro: ' + e.message); }
}

// ───────────────────────── HELPERS ─────────────────────────

function centavosToEur(c) {
  if (!c) return '0,00';
  return (c / 100).toFixed(2).replace('.', ',');
}
function eurToCentavos(s) {
  if (!s) return 0;
  const cleaned = String(s).replace(/\s/g, '').replace(/\./g, '').replace(',', '.');
  const n = parseFloat(cleaned);
  if (isNaN(n)) return 0;
  return Math.round(n * 100);
}
function formatDateTime(ts) {
  if (!ts) return '';
  return new Date(ts).toLocaleString('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
function escapeAttr(s) { return (s || '').replace(/"/g, '&quot;'); }
function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
function localUid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 'id-' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}
