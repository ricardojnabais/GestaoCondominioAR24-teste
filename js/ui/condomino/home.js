/**
 * Portal do Condómino · Home
 *
 * KPIs pessoais (saldo, situação YTD, próxima quota)
 * + tiles para: Recibos · A Minha Conta · Comunicações · Contas do Condomínio
 */

import * as auth from '../../auth/local-auth.js';
import * as store from '../../store/local-store.js';
import * as router from '../router.js';
import * as receipts from '../../modules/receipts.js';
import * as quotasLedger from '../../modules/quotas-ledger.js';
import * as comunicacoes from '../../modules/comunicacoes.js';
import * as push from '../../modules/push.js';
import { icon } from '../icons.js';
import { formatMoney, currentMonthRef, monthsOfYear } from '../../utils/format.js';

export async function render(container) {
  const session = auth.getSession();
  const tenantName = session?.tenantName || '';
  const fraction = session?.fraction || '';
  const tenantId = session?.tenantId;
  if (!tenantId) {
    container.innerHTML = '<div class="placeholder"><p>Sessão inválida.</p></div>';
    return;
  }

  const tenant = await store.getDoc('tenants', tenantId);
  const ano = new Date().getFullYear().toString();
  const quotaMensal = tenant?.rentByYear?.[ano] || 0;
  const naoLidas = await comunicacoes.contagemNaoLidasCondomino(tenantId);

  // KPIs pessoais
  const saldo = await receipts.saldoCondomino(tenantId);
  const currMes = currentMonthRef();
  const meses = monthsOfYear(ano).filter(m => m <= currMes);
  const hoje = new Date();
  let pagoYTD = 0, totalAtraso = 0, totalAPagamento = 0;
  for (const m of meses) {
    const pago = await receipts.valorPagoNoMes(tenantId, m);
    pagoYTD += pago;
    const estado = quotasLedger.estadoQuotaMref({
      pago_centimos: pago, quota_centimos: quotaMensal, mref: m, hoje,
    });
    if (estado === 'atraso')      totalAtraso += Math.max(0, quotaMensal - pago);
    if (estado === 'a_pagamento') totalAPagamento += Math.max(0, quotaMensal - pago);
  }
  let statusLabel, statusCls, statusVal;
  if (saldo > 0) {
    statusLabel = 'Saldo a favor';
    statusCls = 'kpi-green';
    statusVal = formatMoney(saldo);
  } else if (totalAtraso > 0) {
    statusLabel = 'Em atraso';
    statusCls = 'kpi-red';
    statusVal = '−' + formatMoney(totalAtraso);
  } else if (totalAPagamento > 0) {
    statusLabel = 'A pagamento (até dia 8)';
    statusCls = 'kpi-blue';
    statusVal = formatMoney(totalAPagamento);
  } else {
    statusLabel = 'Quotas em dia';
    statusCls = 'kpi-green';
    statusVal = '✓';
  }

  // Pago no mês corrente?
  const pagoMesAtual = await receipts.valorPagoNoMes(tenantId, currMes);
  const mesAtualNome = nomeMes(parseInt(currMes.split('-')[1], 10));
  const mesAtualLabel = pagoMesAtual >= quotaMensal
    ? '✓ Paga'
    : (pagoMesAtual > 0 ? 'Parcial' : 'Em aberto');
  const mesAtualCls = pagoMesAtual >= quotaMensal ? 'kpi-green'
                    : pagoMesAtual > 0 ? 'kpi-amber'
                    : 'kpi-red';

  container.innerHTML = `
    <style>.kpi-blue { color: #1d4ed8 !important; }</style>
    <div class="app">
      <header class="header">
        <div class="brand">
          <div class="brand-mark">${icon('logo-mark', 'brand-mark-svg')}</div>
          <div class="brand-text">
            <div class="name">Portal do Condómino</div>
            <div class="sub">Av. Amália Rodrigues · 24</div>
          </div>
        </div>
        <div class="header-actions">
          <div class="header-user">
            <div class="hu-name">${escapeHtml(tenantName)}</div>
            <div class="hu-frac">${escapeHtml(fraction)}</div>
          </div>
          <button class="btn-hamburger" id="logout-btn" title="Sair">
            <span class="hl"></span><span class="hl"></span><span class="hl"></span>
          </button>
        </div>
      </header>

      <main class="main">
        <div class="home-header">
          <div class="home-greeting">
            <div class="home-hello">Olá,</div>
            <div class="home-name">${escapeHtml(tenantName)}</div>
            <div class="home-frac">${escapeHtml(fraction)}</div>
          </div>
        </div>

        <div class="home-kpis">
          <div class="kpi-card kpi-primary">
            <div class="kpi-lbl">Quota Mensal</div>
            <div class="kpi-val">${formatMoney(quotaMensal)}</div>
            <div class="kpi-sub">${tenant?.permilage || 0}‰ permilagem</div>
          </div>
          <div class="kpi-card ${statusCls}">
            <div class="kpi-lbl">${statusLabel}</div>
            <div class="kpi-val">${statusVal}</div>
            <div class="kpi-sub">${pagoYTD > 0 ? formatMoney(pagoYTD) + ' pagos em ' + ano : 'Sem pagamentos em ' + ano}</div>
          </div>
          <div class="kpi-card ${mesAtualCls}">
            <div class="kpi-lbl">${mesAtualNome}</div>
            <div class="kpi-val">${mesAtualLabel}</div>
            <div class="kpi-sub">${pagoMesAtual > 0 ? formatMoney(pagoMesAtual) + ' pago' : 'sem registo'}</div>
          </div>
        </div>

        <div id="push-banner" style="display:none"></div>

        <div class="menu-tiles">
          <a class="menu-tile" data-route="condomino/recibos">
            <div class="mt-icon-wrap">${icon('ic-receipt', 'mt-icon')}</div>
            <div class="mt-name">Os Meus Recibos</div>
          </a>
          <a class="menu-tile" data-route="condomino/conta">
            <div class="mt-icon-wrap">${icon('ic-quota-in', 'mt-icon')}</div>
            <div class="mt-name">A Minha Conta</div>
          </a>
          <a class="menu-tile" data-route="condomino/comunicacoes">
            <div class="mt-icon-wrap">
              ${icon('ic-chat', 'mt-icon')}
              ${naoLidas > 0 ? `<span class="mt-badge">${naoLidas}</span>` : ''}
            </div>
            <div class="mt-name">Comunicações${naoLidas > 0 ? ` · ${naoLidas}` : ''}</div>
          </a>
          <a class="menu-tile" data-route="condomino/contas">
            <div class="mt-icon-wrap">${icon('ic-bank', 'mt-icon')}</div>
            <div class="mt-name">Contas do Condomínio</div>
          </a>
          <a class="menu-tile span-2" data-route="condomino/dados">
            <div class="mt-icon-wrap">${icon('ic-settings', 'mt-icon')}</div>
            <div class="mt-name">Os Meus Dados</div>
          </a>
        </div>
      </main>
    </div>
  `;

  const doLogout = () => { auth.logout(); router.navigate('login'); };
  container.querySelector('#logout-btn').addEventListener('click', doLogout);

  container.querySelectorAll('[data-route]').forEach(el => {
    el.addEventListener('click', (e) => {
      e.preventDefault();
      router.navigate(el.dataset.route);
    });
  });

  // Banner subscrição push · adiado para v2.0 (com Firebase Cloud Messaging)
  // renderPushBanner(container, tenantId, tenantName).catch(e => console.warn('push banner:', e));
}

async function renderPushBanner(container, tenantId, tenantName) {
  const el = container.querySelector('#push-banner');
  if (!el) return;

  const st = await push.estado();

  // Backend não configurado · esconder banner (admin ainda não preparou)
  if (!st.configurado) return;

  // Browser sem suporte
  if (!st.suporte) {
    el.style.display = 'block';
    el.innerHTML = `
      <div class="push-warn">
        <strong>Aviso:</strong> este browser não suporta notificações.
        Em iOS instala a app no ecrã principal (Partilhar → "Adicionar ao Ecrã Principal").
      </div>`;
    return;
  }

  // iPhone Safari não instalado como PWA · push não funciona
  const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent);
  if (isIOS && !st.pwaInstalada) {
    el.style.display = 'block';
    el.innerHTML = `
      <div class="push-warn">
        <strong>📱 Para receber notificações no iPhone:</strong>
        toca em <strong>Partilhar</strong> ↑ no Safari e escolhe
        <strong>"Adicionar ao Ecrã Principal"</strong>. Depois abre a app pelo ícone.
      </div>`;
    return;
  }

  // Já inscrito · botão discreto para desativar
  if (st.inscrito && st.permissao === 'granted') {
    el.style.display = 'block';
    el.innerHTML = `
      <div class="push-ok">
        <span>✓ Notificações ativas neste dispositivo</span>
        <button class="btn-link" id="push-off">Desativar</button>
      </div>`;
    el.querySelector('#push-off').addEventListener('click', async () => {
      if (!confirm('Desativar notificações neste dispositivo?')) return;
      const r = await push.dessubscrever(tenantId);
      if (r.ok) renderPushBanner(container, tenantId, tenantName);
    });
    return;
  }

  // Permissão negada · indicação para reverter
  if (st.permissao === 'denied') {
    el.style.display = 'block';
    el.innerHTML = `
      <div class="push-warn">
        Notificações foram bloqueadas. Vai a Definições do iOS → Notificações → AR24 e ativa.
      </div>`;
    return;
  }

  // Estado normal · CTA para subscrever
  el.style.display = 'block';
  el.innerHTML = `
    <div class="push-cta">
      <div class="push-cta-text">
        <strong>🔔 Receber notificações</strong>
        <span>Avisos de novas comunicações do condomínio.</span>
      </div>
      <button class="btn primary" id="push-on">Ativar</button>
    </div>`;
  el.querySelector('#push-on').addEventListener('click', async () => {
    const btn = el.querySelector('#push-on');
    btn.disabled = true; btn.textContent = 'A ativar…';
    try {
      const r = await push.subscrever({
        tenantId, tenantName,
        deviceLabel: detetarDevice()
      });
      if (r.ok) {
        renderPushBanner(container, tenantId, tenantName);
      } else {
        alert('Não foi possível ativar: ' + r.error);
        btn.disabled = false; btn.textContent = 'Ativar';
      }
    } catch (e) {
      alert('Erro: ' + e.message);
      btn.disabled = false; btn.textContent = 'Ativar';
    }
  });
}

function detetarDevice() {
  const ua = navigator.userAgent;
  if (/iPhone/.test(ua)) return 'iPhone';
  if (/iPad/.test(ua)) return 'iPad';
  if (/Android/.test(ua)) return 'Android';
  return 'Web';
}

function nomeMes(m) {
  return ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'][m - 1];
}

function escapeHtml(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
