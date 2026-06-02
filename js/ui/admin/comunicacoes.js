/**
 * Página: Comunicações · Admin
 * Lista filtrável + abre modais.
 */

import * as comunicacoes from '../../modules/comunicacoes.js';
import * as router from '../router.js';
import * as auth from '../../auth/local-auth.js';
import * as modalNCA from '../modal-nova-comunicacao-admin.js';
import * as modalDet from '../modal-detalhe-comunicacao.js';
import { icon } from '../icons.js';

let containerRef = null;
let state = {
  direcao: '',   // '' | 'condomino->admin' | 'admin->condomino'
  estado: '',    // '' | 'aberto' | 'em_curso' | 'completo'
  tipo: ''       // '' | 'problema' | 'sugestao' | 'institucional' | 'individual'
};

const TIPO_ICONE = { problema: '⚠️', sugestao: '💡', institucional: '📢', individual: '✉️' };
const TIPO_LABEL = { problema: 'Problema', sugestao: 'Sugestão', institucional: 'Institucional', individual: 'Individual' };
const ESTADO_LABEL = { aberto: 'Aberto', em_curso: 'Em curso', completo: 'Concluído' };

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
              <div class="breadcrumb">Canal Administração ↔ Condóminos</div>
              <h1>Comunicação</h1>
            </div>
            <button class="btn primary" id="btn-new" style="margin-left:auto">+ Nova</button>
          </div>
        </div>

        <div class="filters" id="filters"></div>
        <div id="resumo"></div>
        <div id="lista"></div>
      </main>
    </div>
  `;

  renderFilters();
  await renderList();

  container.querySelector('#brand').addEventListener('click', () => router.navigate('admin/home'));
  container.querySelector('#back-home').addEventListener('click', () => router.navigate('admin/home'));
  container.querySelector('#hamburger').addEventListener('click', () => router.navigate('admin/home'));
  container.querySelector('#btn-new').addEventListener('click', () => {
    modalNCA.open({ onSuccess: () => renderList() });
  });
}

function renderFilters() {
  containerRef.querySelector('#filters').innerHTML = `
    <div class="filter-group">
      <label>Direção</label>
      <select id="f-dir">
        <option value="">— Todas —</option>
        <option value="condomino->admin" ${state.direcao === 'condomino->admin' ? 'selected' : ''}>Recebidas</option>
        <option value="admin->condomino" ${state.direcao === 'admin->condomino' ? 'selected' : ''}>Enviadas</option>
      </select>
    </div>
    <div class="filter-group">
      <label>Tipo</label>
      <select id="f-tipo">
        <option value="">— Todos —</option>
        <option value="problema" ${state.tipo === 'problema' ? 'selected' : ''}>Problema</option>
        <option value="sugestao" ${state.tipo === 'sugestao' ? 'selected' : ''}>Sugestão</option>
        <option value="institucional" ${state.tipo === 'institucional' ? 'selected' : ''}>Institucional</option>
        <option value="individual" ${state.tipo === 'individual' ? 'selected' : ''}>Individual</option>
      </select>
    </div>
    <div class="filter-group">
      <label>Estado</label>
      <select id="f-estado">
        <option value="">— Todos —</option>
        <option value="aberto" ${state.estado === 'aberto' ? 'selected' : ''}>Aberto</option>
        <option value="em_curso" ${state.estado === 'em_curso' ? 'selected' : ''}>Em curso</option>
        <option value="completo" ${state.estado === 'completo' ? 'selected' : ''}>Concluído</option>
      </select>
    </div>
  `;

  containerRef.querySelector('#f-dir').addEventListener('change', (e) => { state.direcao = e.target.value; renderList(); });
  containerRef.querySelector('#f-tipo').addEventListener('change', (e) => { state.tipo = e.target.value; renderList(); });
  containerRef.querySelector('#f-estado').addEventListener('change', (e) => { state.estado = e.target.value; renderList(); });
}

async function renderList() {
  const filtros = {};
  if (state.direcao) filtros.direcao = state.direcao;
  if (state.tipo) filtros.tipo = state.tipo;
  if (state.estado) filtros.estado = state.estado;

  const list = await comunicacoes.listarParaAdmin(filtros);

  // Resumo
  const naoLidas = list.filter(c => comunicacoes.isNaoLidaPor(c, 'admin')).length;
  const abertas = list.filter(c => c.estado === 'aberto').length;
  const emCurso = list.filter(c => c.estado === 'em_curso').length;

  containerRef.querySelector('#resumo').innerHTML = `
    <div class="list-summary">
      <div><span class="ls-lbl">Total</span> <span class="ls-val">${list.length}</span></div>
      <div><span class="ls-lbl">Não lidas</span> <span class="ls-val ${naoLidas > 0 ? 'neg' : ''}">${naoLidas}</span></div>
      <div><span class="ls-lbl">Abertas</span> <span class="ls-val">${abertas}</span></div>
      <div><span class="ls-lbl">Em curso</span> <span class="ls-val">${emCurso}</span></div>
    </div>
  `;

  if (list.length === 0) {
    containerRef.querySelector('#lista').innerHTML = `
      <div class="placeholder">
        <h3>Sem comunicações para estes filtros</h3>
        <p>Cria uma nova com "+ Nova".</p>
      </div>
    `;
    return;
  }

  containerRef.querySelector('#lista').innerHTML = `
    <div class="com-list">${list.map(buildRow).join('')}</div>
  `;

  containerRef.querySelectorAll('.com-item').forEach(el => {
    el.addEventListener('click', () => {
      const session = auth.getSession();
      modalDet.open({
        comId: el.dataset.id,
        modo: 'admin',
        operatorName: session?.operatorName || 'Administração',
        onUpdate: () => renderList()
      });
    });
  });
}

function buildRow(c) {
  const naoLida = comunicacoes.isNaoLidaPor(c, 'admin');
  const respN = (c.respostas || []).length;
  const destLabel = c.destinatarios?.includes('admin') ? 'para admin'
                 : c.destinatarios?.includes('todos') ? 'para todos'
                 : (c.destinatarios?.[0] || '');

  return `
    <div class="com-item ${naoLida ? 'unread' : ''}" data-id="${c.id}">
      <div class="com-tipo">${TIPO_ICONE[c.tipo] || '•'}</div>
      <div class="com-body">
        <div class="com-line1">
          ${naoLida ? '<span class="com-dot"></span>' : ''}
          <strong class="com-assunto">${escapeHtml(c.assunto)}</strong>
          ${respN > 0 ? `<span class="com-resp">+${respN}</span>` : ''}
        </div>
        <div class="com-line2">
          ${c.remetenteNome}${c.remetenteFracao ? ' · ' + c.remetenteFracao : ''}
          <span class="dot-sep">·</span>
          <span class="com-dest">${destLabel}</span>
          <span class="dot-sep">·</span>
          ${formatDate(c.data)}
        </div>
      </div>
      <div class="com-badges">
        <span class="th-badge th-badge-${c.estado}">${ESTADO_LABEL[c.estado]}</span>
      </div>
    </div>
  `;
}

function escapeHtml(s) {
  return (s || '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}

function formatDate(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}
