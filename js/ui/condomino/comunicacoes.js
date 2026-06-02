/**
 * Página: Fale com a Administração · Condómino
 *
 * Lista das comunicações do condómino + comunicados gerais.
 */

import * as comunicacoes from '../../modules/comunicacoes.js';
import * as auth from '../../auth/local-auth.js';
import * as router from '../router.js';
import * as modalNCC from '../modal-nova-comunicacao-condomino.js';
import * as modalDet from '../modal-detalhe-comunicacao.js';
import { icon } from '../icons.js';

let containerRef = null;
let currentTenantId = null;
let currentTenantName = null;

const TIPO_ICONE = { problema: '⚠️', sugestao: '💡', institucional: '📢', individual: '✉️' };
const ESTADO_LABEL = { aberto: 'Aberto', em_curso: 'Em curso', completo: 'Concluído' };

export async function render(container) {
  containerRef = container;

  const session = auth.getSession();
  currentTenantId = session?.tenantId;
  currentTenantName = session?.tenantName || '';

  if (!currentTenantId) {
    container.innerHTML = `<div class="placeholder"><h3>Sessão inválida</h3></div>`;
    return;
  }

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
      </header>
      <main class="main">
        <div class="page-header">
          <div class="page-title">
            <button class="btn-home-circle" id="back-home">${icon('ic-home', 'btn-home-icon')}</button>
            <div>
              <div class="breadcrumb">Canal directo</div>
              <h1>Fale com a Administração</h1>
            </div>
            <button class="btn primary" id="btn-new" style="margin-left:auto">+ Nova mensagem</button>
          </div>
        </div>

        <div id="resumo"></div>
        <div id="lista"></div>
      </main>
    </div>
  `;

  await renderList();

  container.querySelector('#brand').addEventListener('click', () => router.navigate('condomino/home'));
  container.querySelector('#back-home').addEventListener('click', () => router.navigate('condomino/home'));
  container.querySelector('#btn-new').addEventListener('click', () => {
    modalNCC.open({
      tenantId: currentTenantId,
      onSuccess: () => renderList()
    });
  });
}

async function renderList() {
  const list = await comunicacoes.listarParaCondomino(currentTenantId);
  const naoLidas = list.filter(c => comunicacoes.isNaoLidaPor(c, currentTenantId)).length;
  const abertas = list.filter(c => c.estado !== 'completo').length;

  containerRef.querySelector('#resumo').innerHTML = `
    <div class="list-summary">
      <div><span class="ls-lbl">Total</span> <span class="ls-val">${list.length}</span></div>
      <div><span class="ls-lbl">Não lidas</span> <span class="ls-val ${naoLidas > 0 ? 'neg' : ''}">${naoLidas}</span></div>
      <div><span class="ls-lbl">Em curso</span> <span class="ls-val">${abertas}</span></div>
    </div>
  `;

  if (list.length === 0) {
    containerRef.querySelector('#lista').innerHTML = `
      <div class="placeholder">
        <h3>Ainda não há comunicações</h3>
        <p>Carrega em "+ Nova mensagem" para reportar um problema ou fazer uma sugestão à administração.</p>
      </div>
    `;
    return;
  }

  containerRef.querySelector('#lista').innerHTML = `
    <div class="com-list">${list.map(buildRow).join('')}</div>
  `;

  containerRef.querySelectorAll('.com-item').forEach(el => {
    el.addEventListener('click', () => {
      modalDet.open({
        comId: el.dataset.id,
        modo: 'condomino',
        tenantId: currentTenantId,
        operatorName: currentTenantName,
        onUpdate: () => renderList()
      });
    });
  });
}

function buildRow(c) {
  const naoLida = comunicacoes.isNaoLidaPor(c, currentTenantId);
  const respN = (c.respostas || []).length;
  const ehMinha = c.remetenteId === currentTenantId;
  const origemLabel = ehMinha ? 'enviada por mim'
                   : c.remetenteId === 'admin' ? `de ${c.remetenteNome || 'Administração'}`
                   : c.remetenteNome;

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
          ${origemLabel}
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
