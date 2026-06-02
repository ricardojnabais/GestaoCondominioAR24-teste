/**
 * Página: Definições · Menu
 *
 * Hub principal das definições. Mostra 3 áreas:
 *   - Dados do Condomínio (nome, NIF, morada, IBAN...)
 *   - Utilizadores (contas dos condóminos)
 *   - Rúbricas de Despesa
 */

import * as router from '../router.js';
import { icon } from '../icons.js';

export async function render(container) {
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
              <div class="breadcrumb">Configuração da Aplicação</div>
              <h1>Definições</h1>
            </div>
          </div>
        </div>

        <div class="settings-menu">
          <a class="settings-card-link" data-route="admin/definicoes-dados">
            <div class="scl-ic">${icon('ic-settings', 'scl-ic-svg')}</div>
            <div class="scl-info">
              <div class="scl-title">Dados do Condomínio</div>
              <div class="scl-desc">Nome, morada, NIF, IBAN e contactos · usados nos recibos PDF</div>
            </div>
            <div class="scl-arrow">›</div>
          </a>

          <a class="settings-card-link" data-route="admin/condominos">
            <div class="scl-ic">${icon('ic-settings', 'scl-ic-svg')}</div>
            <div class="scl-info">
              <div class="scl-title">Condóminos</div>
              <div class="scl-desc">Dados pessoais, fração, permilagem, quotas anuais · adicionar e desativar</div>
            </div>
            <div class="scl-arrow">›</div>
          </a>

          <a class="settings-card-link" data-route="admin/utilizadores">
            <div class="scl-ic">${icon('ic-settings', 'scl-ic-svg')}</div>
            <div class="scl-info">
              <div class="scl-title">Acessos ao Portal</div>
              <div class="scl-desc">Credenciais dos condóminos · criar acesso, repor password, desativar</div>
            </div>
            <div class="scl-arrow">›</div>
          </a>

          <a class="settings-card-link" data-route="admin/rubricas">
            <div class="scl-ic">${icon('ic-settings', 'scl-ic-svg')}</div>
            <div class="scl-info">
              <div class="scl-title">Rúbricas de Despesa</div>
              <div class="scl-desc">Categorias usadas para classificar pagamentos · criar, terminar, reativar</div>
            </div>
            <div class="scl-arrow">›</div>
          </a>

          <a class="settings-card-link" data-route="admin/importar-dados">
            <div class="scl-ic">${icon('ic-settings', 'scl-ic-svg')}</div>
            <div class="scl-info">
              <div class="scl-title">Importar Dados (JSON)</div>
              <div class="scl-desc">Backup / restauro · carregar histórico AR24 ou snapshot exportado</div>
            </div>
            <div class="scl-arrow">›</div>
          </a>
        </div>
      </main>
    </div>
  `;

  container.querySelector('#brand').addEventListener('click', () => router.navigate('admin/home'));
  container.querySelector('#back-home').addEventListener('click', () => router.navigate('admin/home'));
  container.querySelector('#hamburger').addEventListener('click', () => router.navigate('admin/home'));

  container.querySelectorAll('[data-route]').forEach(el => {
    el.addEventListener('click', (e) => {
      e.preventDefault();
      router.navigate(el.dataset.route);
    });
  });
}
