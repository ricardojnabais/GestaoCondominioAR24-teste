/**
 * Portal do Condómino · Contas do Condomínio (Transparência)
 *
 * Visão agregada do condomínio para que cada condómino possa consultar:
 *  - Saldo bancário · Receitas/Despesas YTD
 *  - Donut de despesas por rúbrica
 *  - Resumo do orçamento aprovado do ano
 *  - Agregado de atrasos (X em Y, sem nomes)
 */

import * as router from '../router.js';
import * as analise from '../../modules/analise.js';
import * as orcamento from '../../modules/orcamento.js';
import * as charts from '../charts.js';
import { icon } from '../icons.js';
import { formatMoney } from '../../utils/format.js';

let state = { ano: new Date().getFullYear().toString() };
let containerRef = null;

export async function render(container) {
  containerRef = container;
  container.innerHTML = `
    <div class="app">
      <header class="header">
        <div class="brand" id="brand">
          <div class="brand-mark">${icon('logo-mark', 'brand-mark-svg')}</div>
          <div class="brand-text">
            <div class="name">Portal do Condómino</div>
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
              <div class="breadcrumb">Transparência · ${state.ano}</div>
              <h1>Contas do Condomínio</h1>
            </div>
            <div style="margin-left:auto">
              <select id="f-ano" class="ano-select">
                <option value="2025" ${state.ano === '2025' ? 'selected' : ''}>2025</option>
                <option value="2026" ${state.ano === '2026' ? 'selected' : ''}>2026</option>
                <option value="2027" ${state.ano === '2027' ? 'selected' : ''}>2027</option>
              </select>
            </div>
          </div>
        </div>
        <div id="body"></div>
      </main>
    </div>
  `;

  await renderBody();

  container.querySelector('#brand').addEventListener('click', () => router.navigate('condomino/home'));
  container.querySelector('#back-home').addEventListener('click', () => router.navigate('condomino/home'));
  container.querySelector('#hamburger').addEventListener('click', () => router.navigate('condomino/home'));
  container.querySelector('#f-ano').addEventListener('change', e => {
    state.ano = e.target.value;
    renderBody();
  });
}

async function renderBody() {
  const bodyEl = containerRef.querySelector('#body');
  bodyEl.innerHTML = `<div class="placeholder"><p>A calcular...</p></div>`;

  const [kpis, despRubricas, orcSumario] = await Promise.all([
    analise.kpisYTD(state.ano),
    analise.despesasPorRubrica(state.ano),
    orcamento.execucaoSumario(state.ano)
  ]);

  bodyEl.innerHTML = `
    <div class="info-card" style="background:var(--blue-50);border-color:var(--blue-tint);margin-bottom:14px">
      <p style="margin:0;font-size:12.5px;color:var(--text)">
        <strong>Transparência:</strong> esta secção mostra o estado das contas do condomínio em ${state.ano}.
        Para preservar a privacidade, não são divulgados nomes de condóminos em atraso · apenas o número agregado.
      </p>
    </div>

    <div class="home-kpis">
      <div class="kpi-card kpi-primary">
        <div class="kpi-lbl">Saldo Bancário</div>
        <div class="kpi-val">${formatMoney(kpis.saldoBancarioAtual_centimos)}</div>
        <div class="kpi-sub">Atual</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-lbl">Receitas YTD</div>
        <div class="kpi-val">${formatMoney(kpis.recebidoYTD_centimos + kpis.outrosRecYTD_centimos)}</div>
        <div class="kpi-sub">quotas + outros</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-lbl">Despesas YTD</div>
        <div class="kpi-val">${formatMoney(kpis.despesasYTD_centimos)}</div>
        <div class="kpi-sub">no ano ${state.ano}</div>
      </div>
    </div>

    <!-- Situação geral dos condóminos (agregado, sem nomes) -->
    <div class="dashboard-section">
      <h3>Situação Geral dos Condóminos</h3>
      <div class="agreg-grid">
        <div class="agreg-item agreg-green">
          <div class="ai-num">${kpis.totalCondominos - kpis.condominosEmAtraso}</div>
          <div class="ai-lbl">em dia ou com saldo a favor</div>
        </div>
        <div class="agreg-item ${kpis.condominosEmAtraso > 0 ? 'agreg-red' : 'agreg-muted'}">
          <div class="ai-num">${kpis.condominosEmAtraso}</div>
          <div class="ai-lbl">em atraso</div>
        </div>
        <div class="agreg-item agreg-muted">
          <div class="ai-num">${kpis.totalCondominos}</div>
          <div class="ai-lbl">total</div>
        </div>
      </div>
      ${kpis.totalEmAtraso_centimos > 0 ? `
        <p class="orc-help" style="margin-top:10px">
          Valor total em falta no ano: <strong>${formatMoney(kpis.totalEmAtraso_centimos)}</strong>.
          Taxa de cobrança: <strong>${kpis.taxaCobrancaYTD}%</strong>.
        </p>
      ` : `
        <p class="orc-help" style="margin-top:10px;color:var(--green)">
          ✓ Sem condóminos em atraso. Taxa de cobrança: <strong>${kpis.taxaCobrancaYTD}%</strong>.
        </p>
      `}
    </div>

    <!-- Despesas por rúbrica -->
    <div class="dashboard-section">
      <h3>Despesas por Rúbrica</h3>
      ${despRubricas.length > 0 ? charts.donutChartRubricas(despRubricas) : '<div class="chart-empty">Sem despesas registadas em ' + state.ano + '.</div>'}
    </div>

    <!-- Orçamento -->
    ${renderOrcamentoBlock(orcSumario)}
  `;
}

function renderOrcamentoBlock(sumario) {
  if (!sumario || sumario.estado !== 'aprovado') {
    return `
      <div class="dashboard-section">
        <h3>Orçamento ${state.ano}</h3>
        <p class="orc-help">${sumario && sumario.estado === 'rascunho'
          ? 'Em preparação · aguarda aprovação em assembleia.'
          : 'Ainda não foi aprovado um orçamento para este ano.'}</p>
      </div>
    `;
  }

  const pctRec = sumario.receitas.pct;
  const pctDesp = sumario.despesas.pct;
  return `
    <div class="dashboard-section">
      <h3>Orçamento ${state.ano} · v${sumario.versao}</h3>
      <p class="orc-help">Aprovado em ${new Date(sumario.aprovadoEm).toLocaleDateString('pt-PT')}.</p>
      <div class="orc-exec-summary">
        <div class="orc-exec-card">
          <div class="oec-lbl">Receitas</div>
          <div class="oec-val">${formatMoney(sumario.receitas.realizado)}</div>
          <div class="oec-sub">de ${formatMoney(sumario.receitas.orcado)} orçados${pctRec !== null ? ` · ${pctRec}%` : ''}</div>
        </div>
        <div class="orc-exec-card">
          <div class="oec-lbl">Despesas</div>
          <div class="oec-val">${formatMoney(sumario.despesas.realizado)}</div>
          <div class="oec-sub">de ${formatMoney(sumario.despesas.orcado)} orçados${pctDesp !== null ? ` · ${pctDesp}%` : ''}</div>
        </div>
        <div class="orc-exec-card ${sumario.resultadoReal >= 0 ? 'oec-positive' : 'oec-negative'}">
          <div class="oec-lbl">Resultado YTD</div>
          <div class="oec-val">${formatMoney(sumario.resultadoReal)}</div>
          <div class="oec-sub">Esperado: ${formatMoney(sumario.resultadoEsperado)}</div>
        </div>
      </div>
    </div>
  `;
}
