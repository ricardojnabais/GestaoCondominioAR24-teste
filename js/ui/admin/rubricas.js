/**
 * Página: Rúbricas · Admin
 * Gerir categorias de despesa. Criar, terminar, reativar.
 */

import * as rubricas from '../../modules/rubricas.js';
import * as auth from '../../auth/local-auth.js';
import * as router from '../router.js';
import { icon } from '../icons.js';
import { formatDate } from '../../utils/format.js';

let containerRef = null;
let showTerminated = false;

export async function render(container) {
  containerRef = container;

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
              <div class="breadcrumb">Categorias de Despesa</div>
              <h1>Rúbricas</h1>
            </div>
            <button class="btn primary" id="btn-new" style="margin-left:auto">+ Nova rúbrica</button>
          </div>
        </div>

        <div class="filters">
          <div class="filter-group filter-toggle">
            <label class="checkbox-label">
              <input type="checkbox" id="f-show-term">
              <span>Mostrar rúbricas terminadas</span>
            </label>
          </div>
        </div>

        <div id="rubs-list"></div>
      </main>
    </div>
  `;

  await renderList();

  container.querySelector('#brand').addEventListener('click', () => router.navigate('admin/home'));
  container.querySelector('#back-home').addEventListener('click', () => router.navigate('admin/home'));
  container.querySelector('#hamburger').addEventListener('click', () => router.navigate('admin/home'));
  container.querySelector('#f-show-term').addEventListener('change', (e) => {
    showTerminated = e.target.checked;
    renderList();
  });
  container.querySelector('#btn-new').addEventListener('click', criarNova);
}

async function renderList() {
  let list = await rubricas.listar();
  if (!showTerminated) list = list.filter(r => !r.terminadaEm);

  const activas = list.filter(r => !r.terminadaEm);
  const terminadas = list.filter(r => r.terminadaEm);

  if (list.length === 0) {
    containerRef.querySelector('#rubs-list').innerHTML = `
      <div class="placeholder">
        <h3>Sem rúbricas</h3>
        <p>Cria a primeira com "+ Nova rúbrica".</p>
      </div>
    `;
    return;
  }

  let html = '';
  if (activas.length > 0) {
    html += `<div class="section-title">Ativas (${activas.length})</div>`;
    html += `<div class="rub-list">${activas.map(buildRow).join('')}</div>`;
  }
  if (terminadas.length > 0 && showTerminated) {
    html += `<div class="section-title">Terminadas (${terminadas.length})</div>`;
    html += `<div class="rub-list">${terminadas.map(buildRow).join('')}</div>`;
  }

  containerRef.querySelector('#rubs-list').innerHTML = html;

  containerRef.querySelectorAll('[data-action="terminar"]').forEach(el => {
    el.addEventListener('click', () => terminarRubrica(el.dataset.id));
  });
  containerRef.querySelectorAll('[data-action="reactivar"]').forEach(el => {
    el.addEventListener('click', () => reativarRubrica(el.dataset.id));
  });
}

function buildRow(r) {
  const isAtiva = !r.terminadaEm;
  const createdAt = formatDate(new Date(r.criadaEm).toISOString().slice(0, 10));
  const endedAt = r.terminadaEm
    ? formatDate(new Date(r.terminadaEm).toISOString().slice(0, 10))
    : null;

  return `
    <div class="rub-item ${isAtiva ? 'active' : 'terminated'}">
      <div class="rub-info">
        <div class="rub-name-main">${r.nome}</div>
        <div class="rub-meta">
          Criada em ${createdAt}${r.criadaPor ? ` por ${r.criadaPor}` : ''}
          ${endedAt ? ` · Terminada em ${endedAt}` : ''}
        </div>
      </div>
      <div class="rub-actions">
        ${isAtiva
          ? `<button class="btn danger" data-action="terminar" data-id="${r.id}">Terminar</button>`
          : `<button class="btn" data-action="reactivar" data-id="${r.id}">Reativar</button>`}
      </div>
    </div>
  `;
}

async function criarNova() {
  const nome = prompt('Nome da nova rúbrica:');
  if (!nome || !nome.trim()) return;
  try {
    const session = auth.getSession();
    await rubricas.criar({ nome: nome.trim() }, session?.operatorName);
    renderList();
  } catch (e) {
    alert('Erro: ' + e.message);
  }
}

async function terminarRubrica(id) {
  if (!confirm('Terminar esta rúbrica? Não desaparece — fica visível em filtros históricos mas deixa de estar disponível para novas despesas.')) return;
  try {
    const session = auth.getSession();
    await rubricas.terminar(id, session?.operatorName);
    renderList();
  } catch (e) {
    alert('Erro: ' + e.message);
  }
}

async function reativarRubrica(id) {
  if (!confirm('Reativar esta rúbrica? Volta a ficar disponível para novas despesas.')) return;
  try {
    await rubricas.reactivar(id);
    renderList();
  } catch (e) {
    alert('Erro: ' + e.message);
  }
}
