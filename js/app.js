/**
 * App bootstrap. Inicializa store, auth, router e regista todas as rotas.
 *
 * Versão de teste · localStorage. Para migrar para Firebase no futuro:
 *  1. Substituir imports de `./store/local-store.js` → `./store/firestore-store.js`
 *  2. Substituir `./auth/local-auth.js` → `./auth/firebase-auth.js`
 *  3. Manter o resto da app intocado (mesma API).
 */

import * as auth from './auth/local-auth.js';
import * as store from './store/local-store.js';
import * as router from './ui/router.js';
import { seedIfEmpty } from './store/seed-data.js';
import { mountIconSprite } from './ui/icons.js';
import { makePlaceholder } from './ui/placeholder.js';

import * as loginPage from './ui/login.js';
import * as adminHome from './ui/admin/home.js';
import * as adminRecibos from './ui/admin/recibos.js';
import * as adminQuotas from './ui/admin/quotas.js';
import * as adminBanco from './ui/admin/banco.js';
import * as adminDespesas from './ui/admin/despesas.js';
import * as adminRubricas from './ui/admin/rubricas.js';
import * as adminPlanos from './ui/admin/planos.js';
import * as adminAnalise from './ui/admin/analise.js';
import * as adminOrcamento from './ui/admin/orcamento.js';
import * as adminDefinicoesMenu from './ui/admin/definicoes-menu.js';
import * as adminDefinicoesDados from './ui/admin/definicoes-condominio.js';
import * as adminComunicacoes from './ui/admin/comunicacoes.js';
import * as adminUtilizadores from './ui/admin/utilizadores.js';
import * as adminCondominos from './ui/admin/condominos.js';
import * as adminImportarDados from './ui/admin/importar-dados.js';
import * as adminNotificacoes from './ui/admin/notificacoes.js';
import * as adminDespesasMensal from './ui/admin/despesas-mensal.js';
import * as adminEmAberto from './ui/admin/em-aberto.js';
import * as condominoHome from './ui/condomino/home.js';
import * as condominoRecibos from './ui/condomino/recibos.js';
import * as condominoConta from './ui/condomino/conta.js';
import * as condominoContas from './ui/condomino/contas-condominio.js';
import * as condominoComunicacoes from './ui/condomino/comunicacoes.js';
import * as condominoDados from './ui/condomino/dados.js';
import * as drawer from './ui/drawer.js';
import * as authMod from './auth/local-auth.js';

// ─── Bootstrap ────────────────────────────────────────────

async function main() {
  console.log('[app] Gestão do Condomínio AR24 · v0.1.0-teste');
  console.log('[app] Modo: localStorage (versão de teste, sem cloud)');

  // 1. Montar SVG sprite (ícones disponíveis para toda a app)
  mountIconSprite();

  // 2. Seed inicial · APENAS em modo localStorage.
  //    Em Firestore, os dados já estão na cloud · nunca fazer seed
  //    (evita popular a cloud com dados de teste num device novo).
  if (store.getBackend() === 'firestore') {
    console.log('[seed] Backend Firestore · seed ignorado (dados na cloud).');
  } else {
    await seedIfEmpty();
  }

  // 3. Inicializar auth
  await auth.initAuth();

  // 3.1 Sincronizar Firebase Auth (admin Google) com sessão local
  try {
    const firebaseAuth = await import('./auth/firebase-auth.js');
    if (firebaseAuth.isFirebaseAvailable()) {
      firebaseAuth.onAuthStateChanged((fbUser) => {
        const session = auth.getSession();
        // Se admin estava logado via Firebase mas Firebase perdeu sessão · logout local
        if (session?.role === 'admin' && session?.firebaseUid && !fbUser) {
          console.log('[Auth] Firebase perdeu sessão · logout local');
          auth.logout();
          router.navigate('login');
        }
      });
    }
  } catch (e) { console.warn('Firebase auth sync:', e); }

  // 4. Registar rotas
  router.register('login', loginPage);
  router.register('admin/home', adminHome, { requiresAuth: 'admin' });
  router.register('condomino/home',         condominoHome,         { requiresAuth: 'condomino' });
  router.register('condomino/recibos',      condominoRecibos,      { requiresAuth: 'condomino' });
  router.register('condomino/conta',        condominoConta,        { requiresAuth: 'condomino' });
  router.register('condomino/contas',       condominoContas,       { requiresAuth: 'condomino' });
  router.register('condomino/dados',        condominoDados,        { requiresAuth: 'condomino' });

  // Rotas reais (Fase 2 + 3a + 4 · comunicações)
  router.register('admin/recibos',         adminRecibos,         { requiresAuth: 'admin' });
  router.register('admin/quotas',          adminQuotas,          { requiresAuth: 'admin' });
  router.register('admin/banco',           adminBanco,           { requiresAuth: 'admin' });
  router.register('admin/despesas',        adminDespesas,        { requiresAuth: 'admin' });
  router.register('admin/rubricas',        adminRubricas,        { requiresAuth: 'admin' });
  router.register('admin/planos',          adminPlanos,          { requiresAuth: 'admin' });
  router.register('admin/analise',         adminAnalise,         { requiresAuth: 'admin' });
  router.register('admin/orcamento',       adminOrcamento,       { requiresAuth: 'admin' });
  router.register('admin/definicoes',      adminDefinicoesMenu,  { requiresAuth: 'admin' });
  router.register('admin/definicoes-dados', adminDefinicoesDados, { requiresAuth: 'admin' });
  router.register('admin/comunicacoes',    adminComunicacoes,    { requiresAuth: 'admin' });
  router.register('admin/utilizadores',    adminUtilizadores,    { requiresAuth: 'admin' });
  router.register('admin/condominos',      adminCondominos,      { requiresAuth: 'admin' });
  router.register('admin/importar-dados',  adminImportarDados,   { requiresAuth: 'admin' });
  router.register('admin/notificacoes',    adminNotificacoes,    { requiresAuth: 'admin' });
  router.register('admin/despesas-mensal', adminDespesasMensal,  { requiresAuth: 'admin' });
  router.register('admin/em-aberto',       adminEmAberto,        { requiresAuth: 'admin' });
  router.register('admin/consultar',       adminRecibos,         { requiresAuth: 'admin' });  // alias

  router.register('condomino/comunicacoes', condominoComunicacoes, { requiresAuth: 'condomino' });

  // Rotas placeholder (a implementar nas próximas fases)
  router.register('admin/quotas-nova',  makePlaceholder('Inserir Quota', 'Modal · Registar Pagamento'), { requiresAuth: 'admin' });
  router.register('admin/despesa-nova', makePlaceholder('Inserir Pagamento', 'Despesa do condomínio'),  { requiresAuth: 'admin' });
  router.register('admin/config',       makePlaceholder('Definições', 'Configurações da app'),          { requiresAuth: 'admin' });

  // 5. Rota inicial
  // Se há hash na URL e está autenticado, vai para esse hash; senão para login.
  const hash = window.location.hash.slice(1);
  if (hash && auth.isAuthenticated()) {
    router.navigate(hash);
  } else {
    router.routeByAuthState();
  }

  // 6. Reagir a mudanças de auth (logout, etc.)
  auth.onAuthChange((session) => {
    if (!session && router.getCurrentRoute() !== 'login') {
      router.navigate('login');
    }
  });

  // 7. Interceção global do botão hamburger · abre o drawer
  // (substitui o comportamento antigo de "voltar à home")
  document.body.addEventListener('click', (e) => {
    const btn = e.target.closest('.btn-hamburger');
    if (!btn) return;
    const session = authMod.getSession();
    if (!session) return;
    // Cancelar handlers locais que possam estar a tentar navegar
    e.preventDefault();
    e.stopImmediatePropagation();
    drawer.open(session.role);
  }, true);  // capture phase · corre antes dos handlers locais
}

// Arrancar quando DOM estiver pronto
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', main);
} else {
  main();
}

// ─── Registar Service Worker (PWA installable) ───────────────
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js')
      .then((reg) => {
        console.log('[app] Service Worker registado, scope:', reg.scope);
      })
      .catch((err) => {
        console.warn('[app] Service Worker não registou:', err);
      });
  });
}

// Error handler global
window.addEventListener('error', (e) => {
  console.error('[app] erro global:', e.error || e.message);
});
window.addEventListener('unhandledrejection', (e) => {
  console.error('[app] promise rejeitada:', e.reason);
});
