/**
 * Router · gestor de navegação entre páginas.
 *
 * As páginas são módulos com função `render(container, params?)` exportada.
 * O router mantém o estado atual e desmonta a página anterior antes de
 * montar a nova. As páginas podem registar callbacks de limpeza.
 */

import * as auth from '../auth/local-auth.js';
import { APP_VERSION } from '../version.js';

const routes = new Map();
let currentRoute = null;
let currentCleanup = null;

/**
 * Regista uma rota.
 * @param {string} path - identificador (ex: 'admin/home', 'condomino/recibos')
 * @param {Object} module - módulo com `render(container, params?)` e opcional `cleanup()`
 * @param {Object} opts - { requiresAuth: 'admin' | 'condomino' | null }
 */
export function register(path, module, opts = {}) {
  routes.set(path, { module, opts });
}

/**
 * Navega para uma rota. Aborta se a rota requer auth que não temos.
 * @param {string} path
 * @param {Object} params - parâmetros a passar ao render
 */
export async function navigate(path, params = {}) {
  const route = routes.get(path);
  if (!route) {
    console.error(`[router] Rota desconhecida: ${path}`);
    return;
  }

  // Auth check
  const required = route.opts.requiresAuth;
  if (required === 'admin' && !auth.isAdmin()) {
    console.warn(`[router] ${path} requer admin, a redirecionar para login.`);
    return navigate('login');
  }
  if (required === 'condomino' && !auth.isCondomino()) {
    console.warn(`[router] ${path} requer condomino, a redirecionar para login.`);
    return navigate('login');
  }

  // Cleanup da rota anterior
  if (currentCleanup) {
    try { currentCleanup(); } catch (e) { console.warn('[router] cleanup erro:', e); }
    currentCleanup = null;
  }

  // Render
  const container = document.getElementById('app-root');
  container.innerHTML = '';

  try {
    const result = await route.module.render(container, params);
    currentRoute = path;
    currentCleanup = (typeof result === 'function') ? result
                     : (route.module.cleanup || null);
    // Mostrar a versão na barra azul (header) de qualquer página · fonte única em version.js
    try {
      const header = container.querySelector('.header');
      if (header && !header.querySelector('.app-version')) {
        if (getComputedStyle(header).position === 'static') header.style.position = 'relative';
        const v = document.createElement('span');
        v.className = 'app-version';
        v.textContent = APP_VERSION;
        v.style.cssText = 'position:absolute;right:14px;bottom:6px;font-size:10px;font-weight:600;letter-spacing:.3px;color:rgba(255,255,255,.65);pointer-events:none;z-index:5';
        header.appendChild(v);
      }
    } catch (_) {}
    // Atualizar URL hash para deep linking (sem reload)
    if (window.history && window.history.replaceState) {
      window.history.replaceState(null, '', '#' + path);
    }
    container.scrollTo?.(0, 0);
  } catch (e) {
    console.error(`[router] erro a renderizar ${path}:`, e);
    container.innerHTML = `<div style="padding:40px;text-align:center">
      <h2>Erro</h2><p>${e.message}</p>
      <button onclick="location.reload()">Recarregar</button>
    </div>`;
  }
}

export function getCurrentRoute() { return currentRoute; }

/**
 * Roteia consoante o estado de auth.
 */
export function routeByAuthState() {
  const session = auth.getSession();
  if (!session) return navigate('login');
  if (session.role === 'admin') return navigate('admin/home');
  if (session.role === 'condomino') return navigate('condomino/home');
}
