/**
 * Modal: Detalhe de Comunicação.
 *
 * Mostra a thread completa, permite responder e alterar estado.
 * Marca automaticamente como lido pelo leitor ao abrir.
 *
 * @param {Object} opts
 * @param {string} opts.comId - id da comunicação
 * @param {'admin'|'condomino'} opts.modo - perspetiva de quem está a ver
 * @param {string} [opts.tenantId] - se modo=condomino, o id do condómino
 * @param {string} [opts.operatorName] - nome de quem responde
 * @param {Function} [opts.onUpdate] - callback após qualquer alteração
 */

import * as comunicacoes from '../modules/comunicacoes.js';
import * as store from '../store/local-store.js';
import { icon } from './icons.js';

let modalEl = null;
let currentOpts = null;
let currentCom = null;

const TIPO_LABEL = {
  problema: 'Problema',
  sugestao: 'Sugestão',
  institucional: 'Comunicado Institucional',
  individual: 'Comunicação Individual'
};

const TIPO_ICONE = {
  problema: '⚠️',
  sugestao: '💡',
  institucional: '📢',
  individual: '✉️'
};

const ESTADO_LABEL = {
  aberto: 'Aberto',
  em_curso: 'Em curso',
  completo: 'Concluído'
};

export async function open(opts) {
  currentOpts = opts;
  currentCom = await store.getDoc('comunicacoes', opts.comId);
  if (!currentCom) {
    alert('Comunicação não encontrada.');
    return;
  }

  // Marcar como lido por este leitor
  const leitor = opts.modo === 'admin' ? 'admin' : opts.tenantId;
  await comunicacoes.marcarLido(opts.comId, leitor);
  // Refresh local
  currentCom = await store.getDoc('comunicacoes', opts.comId);

  if (modalEl) modalEl.remove();
  modalEl = document.createElement('div');
  modalEl.className = 'modal-overlay';
  modalEl.innerHTML = buildHTML();
  document.body.appendChild(modalEl);
  document.body.style.overflow = 'hidden';
  bindEvents();
}

export function close() {
  if (modalEl) { modalEl.remove(); modalEl = null; }
  document.body.style.overflow = '';
  if (currentOpts?.onUpdate) currentOpts.onUpdate();
}

function buildHTML() {
  const c = currentCom;
  const isAdmin = currentOpts.modo === 'admin';
  const destinatariosLabel = labelDestinatarios(c);
  const podeResponder = c.estado !== 'completo';

  return `
    <div class="modal modal-md modal-thread">
      <div class="modal-head">
        <div>
          <div class="th-tipo">${TIPO_ICONE[c.tipo]} ${TIPO_LABEL[c.tipo]}</div>
          <h2>${escapeHtml(c.assunto)}</h2>
        </div>
        <button class="modal-close" id="th-close">×</button>
      </div>

      <div class="modal-body">
        <div class="th-meta">
          <div class="th-meta-row">
            <span class="th-meta-lbl">De</span>
            <span class="th-meta-val">${c.remetenteNome}${c.remetenteFracao ? ' · ' + c.remetenteFracao : ''}</span>
          </div>
          <div class="th-meta-row">
            <span class="th-meta-lbl">Para</span>
            <span class="th-meta-val">${destinatariosLabel}</span>
          </div>
          <div class="th-meta-row">
            <span class="th-meta-lbl">Estado</span>
            <span class="th-badge th-badge-${c.estado}">${ESTADO_LABEL[c.estado]}</span>
          </div>
        </div>

        <div class="th-thread">
          ${buildBubble(c, isAdmin, true)}
          ${(c.respostas || []).map(r => buildBubble({
            mensagem: r.texto,
            criadoPor: r.criadoPor,
            data: r.data,
            origem: r.origem
          }, isAdmin, false)).join('')}
        </div>

        ${podeResponder ? `
        <div class="th-reply">
          <textarea id="th-reply-text" placeholder="Escreve a tua resposta..."></textarea>
          <button class="btn primary" id="th-reply-send" disabled>Enviar resposta</button>
        </div>
        ` : `
        <div class="th-closed-msg">
          Esta comunicação foi marcada como concluída em ${formatTs(c.fechadoEm)}${c.fechadoPor ? ' por ' + c.fechadoPor : ''}.
          ${isAdmin ? '' : '<br>Cria uma nova mensagem se precisares.'}
        </div>
        `}
      </div>

      ${isAdmin ? `
      <div class="modal-foot">
        ${c.estado !== 'aberto' ? `<button class="btn" id="th-reopen">Reabrir</button>` : ''}
        ${c.estado !== 'em_curso' && c.estado !== 'completo' ? `<button class="btn" id="th-em-curso">Marcar em curso</button>` : ''}
        ${c.estado !== 'completo' ? `<button class="btn primary" id="th-completar">Marcar como concluído</button>` : ''}
      </div>
      ` : `
      <div class="modal-foot">
        <button class="btn ghost" id="th-fechar-bottom">Fechar</button>
      </div>
      `}
    </div>
  `;
}

function buildBubble(item, isAdmin, isOriginal) {
  const isFromAdmin = item.origem === 'admin' || (isOriginal && (item.remetenteId === 'admin' || item.direcao === 'admin->condomino'));
  // Bubble alignment depende de quem está a ver vs quem escreveu
  const side = (isAdmin && isFromAdmin) || (!isAdmin && !isFromAdmin) ? 'me' : 'them';
  const cls = `th-bubble th-bubble-${side} ${isFromAdmin ? 'from-admin' : 'from-cond'}`;

  return `
    <div class="${cls}">
      <div class="th-bubble-meta">
        <strong>${item.criadoPor || (isFromAdmin ? 'Administração' : '—')}</strong>
        <span>${formatTs(item.data)}</span>
      </div>
      <div class="th-bubble-text">${escapeHtml(item.mensagem).replace(/\n/g, '<br>')}</div>
    </div>
  `;
}

function labelDestinatarios(c) {
  if (!c.destinatarios) return '—';
  if (c.destinatarios.includes('admin')) return 'Administração';
  if (c.destinatarios.includes('todos')) return 'Todos os condóminos';
  // Individual: tenta resolver nome
  return c.destinatarios.join(', ');
}

function bindEvents() {
  modalEl.querySelector('#th-close').addEventListener('click', close);
  modalEl.addEventListener('click', (e) => { if (e.target === modalEl) close(); });

  const fecharBtn = modalEl.querySelector('#th-fechar-bottom');
  if (fecharBtn) fecharBtn.addEventListener('click', close);

  // Resposta
  const txt = modalEl.querySelector('#th-reply-text');
  const send = modalEl.querySelector('#th-reply-send');
  if (txt && send) {
    txt.addEventListener('input', () => {
      send.disabled = !txt.value.trim();
    });
    send.addEventListener('click', enviarResposta);
  }

  // Ações admin
  const reopen = modalEl.querySelector('#th-reopen');
  if (reopen) reopen.addEventListener('click', () => alterarEstado('aberto'));
  const emCurso = modalEl.querySelector('#th-em-curso');
  if (emCurso) emCurso.addEventListener('click', () => alterarEstado('em_curso'));
  const completar = modalEl.querySelector('#th-completar');
  if (completar) completar.addEventListener('click', async () => {
    if (!confirm('Marcar esta comunicação como concluída? O remetente deixa de poder responder.')) return;
    alterarEstado('completo');
  });
}

async function enviarResposta() {
  const txt = modalEl.querySelector('#th-reply-text');
  const texto = txt.value.trim();
  if (!texto) return;

  const origem = currentOpts.modo === 'admin' ? 'admin' : 'condomino';
  const autor = currentOpts.operatorName
    || (currentOpts.modo === 'condomino' ? currentCom.remetenteNome : 'Administração');

  try {
    await comunicacoes.adicionarResposta(currentOpts.comId, texto, origem, autor);
    // Recarregar e re-render
    currentCom = await store.getDoc('comunicacoes', currentOpts.comId);
    modalEl.innerHTML = buildHTML();
    bindEvents();
  } catch (e) {
    alert('Erro: ' + e.message);
  }
}

async function alterarEstado(novo) {
  try {
    await comunicacoes.alterarEstado(currentOpts.comId, novo, currentOpts.operatorName);
    currentCom = await store.getDoc('comunicacoes', currentOpts.comId);
    modalEl.innerHTML = buildHTML();
    bindEvents();
  } catch (e) {
    alert('Erro: ' + e.message);
  }
}

function formatTs(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const today = new Date();
  const isToday = d.toDateString() === today.toDateString();
  if (isToday) {
    return `Hoje · ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
  }
  return `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()} · ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
}

function escapeHtml(s) {
  return (s || '').replace(/[&<>"']/g, m => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[m]));
}
