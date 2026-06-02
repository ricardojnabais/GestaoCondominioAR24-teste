/**
 * Página: Menu Principal · Admin
 */

import * as auth from '../../auth/local-auth.js';
import * as store from '../../store/local-store.js';
import * as router from '../router.js';
import * as saldoBanco from '../../modules/saldo-banco.js';
import * as analise from '../../modules/analise.js';
import * as comunicacoes from '../../modules/comunicacoes.js';
import * as modalRP from '../modal-registar-pagamento.js';
import * as modalND from '../modal-nova-despesa.js';
import { icon } from '../icons.js';
import { formatMoney } from '../../utils/format.js';

export async function render(container) {
  const session = auth.getSession();
  const operatorName = session?.operatorName || 'Operador';
  const naoLidas = await comunicacoes.contagemNaoLidasAdmin();

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
          <button class="btn-hamburger" id="hamburger" title="Menu">
            <span class="hl"></span><span class="hl"></span><span class="hl"></span>
          </button>
        </div>
      </header>

      <main class="main">
        <div class="home-header">
          <div class="home-greeting">
            <div class="home-hello">Olá,</div>
            <div class="home-name">${operatorName}</div>
          </div>
        </div>

        <div class="home-kpis" id="home-kpis"><div class="kpi-loader">…</div></div>

        <div class="menu-tiles">
          <a class="menu-tile" data-action="registar-pagamento">
            <div class="mt-icon-wrap">${icon('ic-quota-in', 'mt-icon')}</div>
            <div class="mt-name">Inserir Quota</div>
          </a>
          <a class="menu-tile" data-route="admin/recibos">
            <div class="mt-icon-wrap">${icon('ic-receipt', 'mt-icon')}</div>
            <div class="mt-name">Enviar Recibo</div>
          </a>
          <a class="menu-tile" data-action="nova-despesa">
            <div class="mt-icon-wrap">${icon('ic-payment-out', 'mt-icon')}</div>
            <div class="mt-name">Inserir Pagamento</div>
          </a>
          <a class="menu-tile" data-route="admin/quotas">
            <div class="mt-icon-wrap">${icon('ic-search-list', 'mt-icon')}</div>
            <div class="mt-name">Quotas</div>
          </a>
          <a class="menu-tile" data-route="admin/planos">
            <div class="mt-icon-wrap">${icon('ic-receipt', 'mt-icon')}</div>
            <div class="mt-name">Planos</div>
          </a>
          <a class="menu-tile" data-route="admin/em-aberto">
            <div class="mt-icon-wrap">${icon('ic-payment-out', 'mt-icon')}</div>
            <div class="mt-name">Em Aberto</div>
          </a>
          <a class="menu-tile" data-route="admin/banco">
            <div class="mt-icon-wrap">${icon('ic-bank', 'mt-icon')}</div>
            <div class="mt-name">Situação Bancária</div>
          </a>
          <a class="menu-tile" data-route="admin/analise">
            <div class="mt-icon-wrap">${icon('ic-dashboard', 'mt-icon')}</div>
            <div class="mt-name">Análise</div>
          </a>
          <a class="menu-tile" data-route="admin/orcamento">
            <div class="mt-icon-wrap">${icon('ic-quota-in', 'mt-icon')}</div>
            <div class="mt-name">Orçamento</div>
          </a>
          <a class="menu-tile span-2" data-route="admin/comunicacoes">
            <div class="mt-icon-wrap">
              ${icon('ic-chat', 'mt-icon')}
              ${naoLidas > 0 ? `<span class="mt-badge">${naoLidas}</span>` : ''}
            </div>
            <div class="mt-name">Comunicações${naoLidas > 0 ? ` · ${naoLidas}` : ''}</div>
          </a>
          <a class="menu-tile span-2" data-route="admin/definicoes">
            <div class="mt-icon-wrap">${icon('ic-settings', 'mt-icon')}</div>
            <div class="mt-name">Definições</div>
          </a>
        </div>
      </main>
    </div>
  `;

  await refreshSaldo(container);

  container.querySelectorAll('.menu-tile').forEach(tile => {
    tile.addEventListener('click', () => {
      const route = tile.dataset.route;
      const action = tile.dataset.action;

      if (action === 'registar-pagamento') {
        modalRP.open({
          onSuccess: () => refreshSaldo(container)
        });
        return;
      }
      if (action === 'nova-despesa') {
        modalND.open({
          onSuccess: () => refreshSaldo(container)
        });
        return;
      }
      if (route) router.navigate(route);
    });
  });

  container.querySelector('#hamburger').addEventListener('click', () => {
    if (confirm('Terminar sessão?')) {
      auth.logout();
      router.navigate('login');
    }
  });

  container.querySelector('#brand').addEventListener('click', () => {
    router.navigate('admin/home');
  });
}

async function refreshSaldo(container) {
  const year = new Date().getFullYear().toString();
  const kpis = await analise.kpisYTD(year);
  const el = container.querySelector('#home-kpis');
  if (!el) return;

  const taxaCls = kpis.taxaCobrancaYTD >= 90 ? 'kpi-green'
                : kpis.taxaCobrancaYTD >= 70 ? 'kpi-amber'
                : 'kpi-red';
  const atrasoCls = kpis.condominosEmAtraso > 0 ? 'kpi-red' : 'kpi-green';

  el.innerHTML = `
    <a class="kpi-card kpi-primary" data-route="admin/banco">
      <div class="kpi-lbl">Saldo Bancário</div>
      <div class="kpi-val">${formatMoney(kpis.saldoBancarioAtual_centimos)}</div>
      <div class="kpi-sub">Atual</div>
    </a>
    <a class="kpi-card ${taxaCls}" data-route="admin/quotas">
      <div class="kpi-lbl">Cobrança YTD</div>
      <div class="kpi-val">${kpis.taxaCobrancaYTD}%</div>
      <div class="kpi-sub">${formatMoney(kpis.recebidoYTD_centimos)} / ${formatMoney(kpis.esperadoYTD_centimos)}</div>
    </a>
    <a class="kpi-card ${atrasoCls}" data-route="admin/quotas">
      <div class="kpi-lbl">Em Atraso</div>
      <div class="kpi-val">${kpis.condominosEmAtraso}<span class="kpi-of">/${kpis.totalCondominos}</span></div>
      <div class="kpi-sub">${formatMoney(kpis.totalEmAtraso_centimos)} em falta</div>
    </a>
  `;

  // Rebind cliques nos KPIs (são <a> com data-route)
  el.querySelectorAll('[data-route]').forEach(node => {
    node.addEventListener('click', (e) => {
      e.preventDefault();
      router.navigate(node.dataset.route);
    });
  });
}
