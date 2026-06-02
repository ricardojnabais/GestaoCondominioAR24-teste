/**
 * Página: Em Aberto · Admin · v1.0.14
 *
 * 3 secções:
 *  1. Dívidas Arrastadas (anos anteriores)
 *  2. Quotas em Atraso · Ano Corrente
 *  3. Prestações em Atraso (planos ativos)
 */

import * as emAberto from '../../modules/em-aberto.js';
import * as router from '../router.js';
import { icon } from '../icons.js';
import { formatMoney } from '../../utils/format.js';

let containerRef = null;
const MES_ABREV = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

export async function render(container) {
  containerRef = container;
  const anoAtual = new Date().getFullYear();

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
              <div class="breadcrumb">Operações · ${anoAtual}</div>
              <h1>Em Aberto</h1>
            </div>
          </div>
        </div>

        <div id="kpis-top"></div>
        <div id="sec-dividas-arr"></div>
        <div id="sec-quotas-atraso"></div>
        <div id="sec-prest-atraso"></div>
      </main>
    </div>
  `;

  container.querySelector('#back-home').addEventListener('click', () => router.navigate('home'));

  await renderAll();
}

async function renderAll() {
  const anoAtual = new Date().getFullYear();
  const dividas = await emAberto.dividasArrastadas(anoAtual);
  const quotas = await emAberto.quotasAtrasoAnoCorrente(anoAtual);
  const prest = await emAberto.prestacoesAtraso();

  const totDividas = dividas.reduce((s, d) => s + d.valor_centimos, 0);
  const totQuotas = quotas.reduce((s, q) => s + q.totalEmFalta, 0);
  const totPrest = prest.reduce((s, p) => s + p.totalPendente, 0);
  const totGeral = totDividas + totQuotas + totPrest;

  // KPI único
  containerRef.querySelector('#kpis-top').innerHTML = `
    <div class="ea-kpis">
      <div class="ea-kpi ea-kpi-in">
        <div class="ea-kpi-lbl">Total Em Aberto · A Receber</div>
        <div class="ea-kpi-val">${formatMoney(totGeral)}</div>
        <div class="ea-kpi-sub">
          ${dividas.length} dívida(s) arrastada(s) · ${quotas.length} cond. em atraso · ${prest.length} prestação(ões) atrasada(s)
        </div>
      </div>
    </div>
  `;

  // Secção 1: Dívidas arrastadas
  const elD = containerRef.querySelector('#sec-dividas-arr');
  if (dividas.length === 0) {
    elD.innerHTML = `
      <h2 class="ea-sec-title">Dívidas Arrastadas de Anos Anteriores</h2>
      <div class="placeholder"><p>✓ Sem dívidas arrastadas.</p></div>
    `;
  } else {
    elD.innerHTML = `
      <h2 class="ea-sec-title">⚠ Dívidas Arrastadas de Anos Anteriores · ${formatMoney(totDividas)}</h2>
      <div class="ea-cards">
        ${dividas.map(d => `
          <div class="ea-card ea-card-warn">
            <div class="ea-card-head">
              <div>
                <div class="ea-card-name">${escapeHtml(d.tenantName)}</div>
                <div class="ea-card-sub">${escapeHtml(d.fraction)} · ${escapeHtml(d.origem)}</div>
              </div>
              <div class="ea-card-total">
                <span class="ea-total-lbl">Em dívida</span>
                <span class="ea-total-val neg">${formatMoney(d.valor_centimos)}</span>
              </div>
            </div>
            ${d.detalhe ? `<div class="ea-card-detail">${escapeHtml(d.detalhe)}</div>` : ''}
          </div>
        `).join('')}
      </div>
    `;
  }

  // Secção 2: Quotas em atraso ano corrente
  const elQ = containerRef.querySelector('#sec-quotas-atraso');
  if (quotas.length === 0) {
    elQ.innerHTML = `
      <h2 class="ea-sec-title">Quotas em Atraso · ${anoAtual}</h2>
      <div class="placeholder"><p>✓ Não há quotas em atraso no ano corrente.</p></div>
    `;
  } else {
    elQ.innerHTML = `
      <h2 class="ea-sec-title">Quotas em Atraso · ${anoAtual} · ${quotas.length} condómino(s)</h2>
      <div class="ea-cards">
        ${quotas.map(q => `
          <div class="ea-card">
            <div class="ea-card-head">
              <div>
                <div class="ea-card-name">${escapeHtml(q.tenantName)}</div>
                <div class="ea-card-sub">${escapeHtml(q.fraction)} · ${formatMoney(q.quotaMensal)}/mês</div>
              </div>
              <div class="ea-card-total">
                <span class="ea-total-lbl">Em falta</span>
                <span class="ea-total-val neg">${formatMoney(q.totalEmFalta)}</span>
              </div>
            </div>
            <div class="ea-meses-grid">
              ${q.mesesFalta.map(m => `<span class="ea-mes-chip">${MES_ABREV[m-1]}</span>`).join('')}
            </div>
          </div>
        `).join('')}
      </div>
    `;
  }

  // Secção 3: Prestações em atraso
  const elP = containerRef.querySelector('#sec-prest-atraso');
  if (prest.length === 0) {
    elP.innerHTML = `
      <h2 class="ea-sec-title">Prestações em Atraso</h2>
      <div class="placeholder"><p>✓ Sem prestações em atraso.</p></div>
    `;
  } else {
    elP.innerHTML = `
      <h2 class="ea-sec-title">Prestações em Atraso · ${prest.length}</h2>
      <div class="ea-cards">
        ${prest.map(p => `
          <div class="ea-card">
            <div class="ea-card-head">
              <div>
                <div class="ea-card-name">${escapeHtml(p.tenantName)}</div>
                <div class="ea-card-sub">${escapeHtml(p.fraction)} · ${escapeHtml(p.planoNome)}</div>
              </div>
              <div class="ea-card-total">
                <span class="ea-total-lbl">Pendente</span>
                <span class="ea-total-val neg">${formatMoney(p.totalPendente)}</span>
              </div>
            </div>
            <div class="ea-card-detail">${p.nPrestacoes} prestação(ões) por liquidar</div>
          </div>
        `).join('')}
      </div>
    `;
  }
}

function escapeHtml(s) {
  if (s == null) return '';
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
