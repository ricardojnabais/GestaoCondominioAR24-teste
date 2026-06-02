/**
 * Página placeholder para rotas ainda não implementadas.
 * Mostra título da rota + botão voltar ao menu principal.
 */

import * as auth from '../auth/local-auth.js';
import * as router from './router.js';
import { icon } from './icons.js';

export function makePlaceholder(title, subtitle = '') {
  return {
    async render(container) {
      const role = auth.isAdmin() ? 'admin' : 'condomino';
      const home = role + '/home';

      container.innerHTML = `
        <div class="app">
          <header class="header">
            <div class="brand">
              <div class="brand-mark">${icon('logo-mark', 'brand-mark-svg')}</div>
              <div class="brand-text">
                <div class="name">Gestão do Condomínio AR24</div>
                <div class="sub">${role === 'admin' ? 'Administração' : 'Vista do Condómino'}</div>
              </div>
            </div>
          </header>
          <main class="main">
            <div class="page-header">
              <div class="page-title">
                <button class="btn-home-circle" id="back-home" title="Menu Principal">
                  ${icon('ic-home', 'btn-home-icon')}
                </button>
                <div>
                  <div class="breadcrumb">${subtitle || 'Em construção'}</div>
                  <h1>${title}</h1>
                </div>
              </div>
            </div>
            <div class="placeholder">
              <h3>Esta página está em construção</h3>
              <p>Será implementada na próxima fase do desenvolvimento.<br>
              Por agora, o objetivo é validar que o login, navegação e<br>
              persistência local estão a funcionar.</p>
            </div>
          </main>
        </div>
      `;
      container.querySelector('#back-home').addEventListener('click', () => {
        router.navigate(home);
      });
    }
  };
}
