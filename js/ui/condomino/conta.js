/**
 * Portal do Condómino · A Minha Conta
 *
 * Quota mensal · matriz pagamentos do ano (12 meses) · planos ativos do próprio
 * + dados de pagamento (IBAN do condomínio).
 */

import * as auth from '../../auth/local-auth.js';
import * as store from '../../store/local-store.js';
import * as router from '../router.js';
import * as receipts from '../../modules/receipts.js';
import * as quotasLedger from '../../modules/quotas-ledger.js';
import * as planos from '../../modules/planos.js';
import * as condominioInfo from '../../modules/condominio-info.js';
import { icon } from '../icons.js';
import { formatMoney, currentMonthRef, monthsOfYear } from '../../utils/format.js';

const MES_NOMES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

let state = { ano: new Date().getFullYear().toString() };

export async function render(container) {
  const session = auth.getSession();
  const tenantId = session?.tenantId;
  if (!tenantId) {
    container.innerHTML = '<div class="placeholder"><p>Sessão inválida.</p></div>';
    return;
  }

  const tenant = await store.getDoc('tenants', tenantId);
  const cond = await condominioInfo.obter();
  const quotaMensal = tenant?.rentByYear?.[state.ano] || 0;
  const months = monthsOfYear(state.ano);
  const curr = currentMonthRef();
  const saldo = await receipts.saldoCondomino(tenantId);

  // Status de cada mês
  let pagoYTD = 0, esperadoYTD = 0;
  let totalAtraso = 0, totalAPagamento = 0;
  const matriz = [];
  for (const m of months) {
    const pago = await receipts.valorPagoNoMes(tenantId, m);
    const mesNum = parseInt(m.split('-')[1], 10);
    // v1.0.40 · estado com tolerância do dia 8
    const status = quotasLedger.estadoQuotaMref({
      pago_centimos: pago, quota_centimos: quotaMensal, mref: m,
    });
    matriz.push({ mes: m, mesNum, mesNome: MES_NOMES[mesNum - 1], pago, status });
    if (status === 'atraso')      totalAtraso += Math.max(0, quotaMensal - pago);
    if (status === 'a_pagamento') totalAPagamento += Math.max(0, quotaMensal - pago);
    if (m <= curr) {
      pagoYTD += pago;
      esperadoYTD += quotaMensal;
    }
  }

  // Planos do próprio (com prestações pendentes)
  const planosOwn = await listarPlanosCondomino(tenantId);

  let statusGeral;
  if (saldo > 0) statusGeral = { label: 'Saldo a favor', val: formatMoney(saldo), cls: 'kpi-green' };
  else if (totalAtraso > 0) statusGeral = { label: 'Em atraso', val: '−' + formatMoney(totalAtraso), cls: 'kpi-red' };
  else if (totalAPagamento > 0) statusGeral = { label: 'A pagamento (até dia 8)', val: formatMoney(totalAPagamento), cls: 'kpi-blue' };
  else statusGeral = { label: 'Em dia', val: '✓', cls: 'kpi-green' };

  container.innerHTML = `
    <style>
      .mes-a-pagamento { background: rgba(59,130,246,.12); border-color: #1d4ed8; }
      .mes-a-pagamento .mc-icon { color: #1d4ed8; }
      .mes-a-pagamento .mc-val  { color: #1d4ed8; font-weight: 600; }
      .kpi-blue { color: #1d4ed8 !important; }
    </style>
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
              <div class="breadcrumb">Situação Pessoal · ${state.ano}</div>
              <h1>A Minha Conta</h1>
            </div>
          </div>
        </div>

        <!-- Resumo pessoal -->
        <div class="info-card" style="margin-bottom:14px">
          <div class="info-row"><span class="info-lbl">Fração</span><span class="info-val">${escapeHtml(tenant?.fraction || '')}</span></div>
          <div class="info-row"><span class="info-lbl">Permilagem</span><span class="info-val">${tenant?.permilage || 0}‰</span></div>
          <div class="info-row"><span class="info-lbl">Quota mensal ${state.ano}</span><span class="info-val val-emph">${formatMoney(quotaMensal)}</span></div>
          ${tenant?.nif ? `<div class="info-row"><span class="info-lbl">NIF</span><span class="info-val">${escapeHtml(tenant.nif)}</span></div>` : ''}
        </div>

        <!-- KPIs YTD -->
        <div class="home-kpis">
          <div class="kpi-card kpi-primary">
            <div class="kpi-lbl">Pago em ${state.ano}</div>
            <div class="kpi-val">${formatMoney(pagoYTD)}</div>
            <div class="kpi-sub">de ${formatMoney(esperadoYTD)} esperados</div>
          </div>
          <div class="kpi-card ${statusGeral.cls}">
            <div class="kpi-lbl">${statusGeral.label}</div>
            <div class="kpi-val">${statusGeral.val}</div>
            <div class="kpi-sub">situação atual</div>
          </div>
        </div>

        <!-- Matriz de mensalidades -->
        <div class="dashboard-section">
          <h3>Mensalidades ${state.ano}</h3>
          <div class="mes-grid">
            ${matriz.map(buildMesCell).join('')}
          </div>
        </div>

        <!-- Planos próprios -->
        ${planosOwn.length > 0 ? `
          <div class="dashboard-section">
            <h3>Os Meus Planos de Pagamento</h3>
            <div class="planos-mini">
              ${planosOwn.map(p => buildPlanoCard(p)).join('')}
            </div>
          </div>
        ` : ''}

        <!-- Como pagar -->
        ${cond?.iban ? `
          <div class="dashboard-section">
            <h3>Como Pagar</h3>
            <p class="orc-help">Faz transferência bancária para o IBAN do condomínio. Indica como referência <strong>${escapeHtml(tenant?.fraction || '')} · ${MES_NOMES[parseInt(curr.split('-')[1], 10) - 1]} ${state.ano}</strong>.</p>
            <div class="iban-box">
              <div class="iban-lbl">IBAN</div>
              <div class="iban-val" id="iban-text">${escapeHtml(cond.iban)}</div>
              <button class="btn-icon-mini" id="copy-iban" title="Copiar">📋</button>
            </div>
            ${cond.email ? `<p class="orc-help" style="margin-top:8px">Dúvidas? Contacta a administração: <a href="mailto:${escapeHtml(cond.email)}">${escapeHtml(cond.email)}</a></p>` : ''}
          </div>
        ` : ''}
      </main>
    </div>
  `;

  container.querySelector('#brand').addEventListener('click', () => router.navigate('condomino/home'));
  container.querySelector('#back-home').addEventListener('click', () => router.navigate('condomino/home'));
  container.querySelector('#hamburger').addEventListener('click', () => router.navigate('condomino/home'));

  const ibanBtn = container.querySelector('#copy-iban');
  if (ibanBtn) {
    ibanBtn.addEventListener('click', () => {
      navigator.clipboard?.writeText(cond.iban).then(() => {
        ibanBtn.textContent = '✓';
        setTimeout(() => { ibanBtn.textContent = '📋'; }, 1500);
      });
    });
  }
}

function buildMesCell(m) {
  const map = {
    pago:        { cls: 'mes-pago',        icon: '✓' },
    a_pagamento: { cls: 'mes-a-pagamento', icon: '€' },
    atraso:      { cls: 'mes-em-falta',    icon: '✕' },
    futuro:      { cls: 'mes-futuro',      icon: '·' },
  };
  const cfg = map[m.status] || map.futuro;
  const valor = m.pago > 0 ? formatMoney(m.pago) : '';
  return `
    <div class="mes-cell ${cfg.cls}">
      <div class="mc-mes">${m.mesNome.slice(0, 3)}</div>
      <div class="mc-icon">${cfg.icon}</div>
      <div class="mc-val">${valor}</div>
    </div>
  `;
}

function buildPlanoCard(p) {
  const pct = p.progresso.percentagem;
  return `
    <div class="plano-mini">
      <div class="pm-head">
        <strong>${escapeHtml(p.plano.nome)}</strong>
        <span>${pct}%</span>
      </div>
      <div class="pp-bar"><div class="pp-bar-fill" style="width:${pct}%"></div></div>
      <div class="pm-stats">
        ${p.progresso.pagas} de ${p.progresso.total} prestações pagas
        ${p.progresso.emAtraso > 0 ? ` · <strong style="color:var(--red)">⚠ ${p.progresso.emAtraso} em atraso</strong>` : ''}
      </div>
    </div>
  `;
}

async function listarPlanosCondomino(tenantId) {
  // Procurar prestações deste tenant e agrupar por plano
  const prestacoes = await store.queryDocs('prestacoes', { tenantId });
  if (prestacoes.length === 0) return [];

  const planosIds = [...new Set(prestacoes.map(p => p.planoId))];
  const out = [];
  for (const pid of planosIds) {
    const plano = await store.getDoc('planos', pid);
    if (!plano || plano.estado !== 'ativo') continue;

    const minhas = prestacoes.filter(pr => pr.planoId === pid);
    const pagas = minhas.filter(pr => pr.estado === 'paga').length;
    const emAtraso = minhas.filter(pr => pr.estado === 'atraso').length;
    out.push({
      plano,
      progresso: {
        total: minhas.length,
        pagas,
        emAtraso,
        percentagem: minhas.length > 0 ? Math.round(pagas / minhas.length * 100) : 0
      }
    });
  }
  return out;
}

function escapeHtml(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
