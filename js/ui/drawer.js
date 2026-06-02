/**
 * Drawer · menu lateral deslizante.
 *
 * Componente único reutilizado por admin e condómino.
 * Substitui o comportamento antigo do botão hamburger (que apenas voltava à home).
 */

import * as auth from '../auth/local-auth.js';
import * as router from './router.js';
import * as comunicacoes from '../modules/comunicacoes.js';
import { icon } from './icons.js';

/**
 * Abre o drawer com os items adequados ao role.
 */
export async function open(role) {
  const session = auth.getSession();
  if (!session) return;

  // Construir items conforme o role
  const items = role === 'admin'
    ? await buildAdminItems()
    : await buildCondominoItems(session.tenantId);

  const userBlock = role === 'admin'
    ? `<div class="dr-user-name">${escapeHtml(session.operatorName || 'Administração')}</div>
       <div class="dr-user-sub">Administração</div>`
    : `<div class="dr-user-name">${escapeHtml(session.tenantName || '')}</div>
       <div class="dr-user-sub">${escapeHtml(session.fraction || '')}</div>`;

  // Overlay + drawer
  const overlay = document.createElement('div');
  overlay.className = 'drawer-overlay';
  overlay.innerHTML = `
    <aside class="drawer">
      <header class="drawer-head">
        <div class="drawer-user">${userBlock}</div>
        <button class="drawer-close" id="dr-close" aria-label="Fechar">✕</button>
      </header>
      <nav class="drawer-nav">
        ${items.map(buildItem).join('')}
      </nav>
      <footer class="drawer-foot">
        <button class="drawer-logout" id="dr-logout">
          <span class="dr-li-ic">⎋</span>
          <span class="dr-li-name">Terminar Sessão</span>
        </button>
      </footer>
    </aside>
  `;
  document.body.appendChild(overlay);

  // Animação de entrada
  requestAnimationFrame(() => overlay.classList.add('drawer-open'));

  const close = () => {
    overlay.classList.remove('drawer-open');
    setTimeout(() => overlay.remove(), 220);
  };

  overlay.querySelector('#dr-close').addEventListener('click', close);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });
  overlay.querySelector('#dr-logout').addEventListener('click', () => {
    auth.logout();
    close();
    setTimeout(() => router.navigate('login'), 200);
  });

  overlay.querySelectorAll('[data-route]').forEach(el => {
    el.addEventListener('click', () => {
      const route = el.dataset.route;
      close();
      setTimeout(() => router.navigate(route), 150);
    });
  });

  // ESC para fechar
  const onKey = (e) => {
    if (e.key === 'Escape') { close(); document.removeEventListener('keydown', onKey); }
  };
  document.addEventListener('keydown', onKey);
}

// ───────────────────────── ITEMS ─────────────────────────

async function buildAdminItems() {
  return [
    { route: 'admin/home',           icon: 'ic-home',         label: 'Início' },
    { sep: true, label: 'Operações' },
    { route: 'admin/quotas',         icon: 'ic-quota-in',     label: 'Quotas' },
    { route: 'admin/recibos',        icon: 'ic-receipt',      label: 'Recibos' },
    { route: 'admin/banco',          icon: 'ic-bank',         label: 'Situação Bancária' },
    { route: 'admin/despesas',       icon: 'ic-payment-out',  label: 'Despesas' },
    { route: 'admin/planos',         icon: 'ic-quota-in',     label: 'Planos de Pagamento' },
    { route: 'admin/em-aberto',      icon: 'ic-payment-out',  label: 'Em Aberto' },
    { sep: true, label: 'Visão e Gestão' },
    { route: 'admin/analise',        icon: 'ic-dashboard',    label: 'Análise' },
    { route: 'admin/despesas-mensal',icon: 'ic-dashboard',    label: 'Mapa Mensal de Despesas' },
    { route: 'admin/orcamento',      icon: 'ic-quota-in',     label: 'Orçamento' },
    { route: 'admin/comunicacoes',   icon: 'ic-chat',         label: 'Comunicações' },
    { sep: true, label: 'Definições' },
    { route: 'admin/condominos',     icon: 'ic-settings',     label: 'Condóminos' },
    { route: 'admin/utilizadores',   icon: 'ic-settings',     label: 'Acessos ao Portal' },
    { route: 'admin/rubricas',       icon: 'ic-settings',     label: 'Rúbricas' },
    { route: 'admin/definicoes-dados', icon: 'ic-settings',   label: 'Dados do Condomínio' },
    // { route: 'admin/notificacoes',     icon: 'ic-settings',   label: 'Notificações Push' },  // v2.0
    { route: 'admin/importar-dados', icon: 'ic-settings',     label: 'Importar Dados (JSON)' }
  ];
}

async function buildCondominoItems(tenantId) {
  let naoLidas = 0;
  if (tenantId) {
    try { naoLidas = await comunicacoes.contagemNaoLidasCondomino(tenantId); }
    catch (e) { /* silent */ }
  }
  return [
    { route: 'condomino/home',     icon: 'ic-home',         label: 'Início' },
    { sep: true, label: 'A Minha Área' },
    { route: 'condomino/recibos',  icon: 'ic-receipt',      label: 'Os Meus Recibos' },
    { route: 'condomino/conta',    icon: 'ic-quota-in',     label: 'A Minha Conta' },
    { route: 'condomino/comunicacoes', icon: 'ic-chat',         label: 'Comunicações', badge: naoLidas },
    { sep: true, label: 'Condomínio' },
    { route: 'condomino/contas',   icon: 'ic-bank',         label: 'Contas do Condomínio' },
    { sep: true, label: 'Conta Pessoal' },
    { route: 'condomino/dados',    icon: 'ic-settings',     label: 'Os Meus Dados' }
  ];
}

function buildItem(it) {
  if (it.sep) {
    return `<div class="drawer-sep">${escapeHtml(it.label || '')}</div>`;
  }
  return `
    <button class="drawer-item" data-route="${it.route}">
      <span class="dr-li-ic">${icon(it.icon, 'dr-li-svg')}</span>
      <span class="dr-li-name">${escapeHtml(it.label)}</span>
      ${it.badge > 0 ? `<span class="dr-li-badge">${it.badge}</span>` : ''}
    </button>
  `;
}

function escapeHtml(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
