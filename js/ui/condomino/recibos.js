/**
 * Portal do Condómino · Os Meus Recibos
 *
 * Lista de recibos do próprio condómino.
 * Filtro por ano. Clique abre detalhe (modal simples) com download PDF.
 */

import * as auth from '../../auth/local-auth.js';
import * as router from '../router.js';
import * as receipts from '../../modules/receipts.js';
import * as exportPdf from '../../modules/export-pdf.js';
import { icon } from '../icons.js';
import { formatMoney, formatDate } from '../../utils/format.js';

let state = { ano: new Date().getFullYear().toString() };
let containerRef = null;

export async function render(container) {
  containerRef = container;
  const session = auth.getSession();
  const tenantId = session?.tenantId;
  if (!tenantId) {
    container.innerHTML = '<div class="placeholder"><p>Sessão inválida.</p></div>';
    return;
  }

  container.innerHTML = `
    <div class="app">
      <header class="header">
        <div class="brand" id="brand">
          <div class="brand-mark">${icon('logo-mark', 'brand-mark-svg')}</div>
          <div class="brand-text">
            <div class="name">Portal do Condómino</div>
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
              <div class="breadcrumb">Histórico Pessoal</div>
              <h1>Os Meus Recibos</h1>
            </div>
            <div style="margin-left:auto">
              <select id="f-ano" class="ano-select">
                <option value="2024" ${state.ano === '2024' ? 'selected' : ''}>2024</option>
                <option value="2025" ${state.ano === '2025' ? 'selected' : ''}>2025</option>
                <option value="2026" ${state.ano === '2026' ? 'selected' : ''}>2026</option>
                <option value="2027" ${state.ano === '2027' ? 'selected' : ''}>2027</option>
              </select>
            </div>
          </div>
        </div>
        <div id="lista"></div>
      </main>
    </div>
  `;

  containerRef.querySelector('#brand').addEventListener('click', () => router.navigate('condomino/home'));
  containerRef.querySelector('#back-home').addEventListener('click', () => router.navigate('condomino/home'));
  containerRef.querySelector('#hamburger').addEventListener('click', () => router.navigate('condomino/home'));
  containerRef.querySelector('#f-ano').addEventListener('change', e => {
    state.ano = e.target.value;
    renderLista(tenantId);
  });

  await renderLista(tenantId);
}

async function renderLista(tenantId) {
  const listEl = containerRef.querySelector('#lista');
  const recs = (await receipts.listar({ tenantId, ano: state.ano }))
    .filter(r => !r.cancelado || r.estornoDe)  // mostra estornos, esconde recibos puramente cancelados
    .sort((a, b) => (b.data || '').localeCompare(a.data || ''));

  if (recs.length === 0) {
    listEl.innerHTML = `
      <div class="placeholder" style="text-align:center;padding:40px 20px">
        <div style="font-size:32px;margin-bottom:8px">📄</div>
        <p style="color:var(--text-muted)">Sem recibos em ${state.ano}.</p>
      </div>
    `;
    return;
  }

  listEl.innerHTML = `
    <div class="rec-cards">
      ${recs.map(r => buildCard(r)).join('')}
    </div>
  `;

  listEl.querySelectorAll('.rec-card').forEach(card => {
    card.addEventListener('click', () => abrirDetalhe(card.dataset.id));
  });
}

function buildCard(r) {
  const isEstorno = !!r.estornoDe;
  const cls = isEstorno ? 'rec-card-estorno' : 'rec-card';
  const tipo = r.tipo === 'quota' ? 'Quota'
              : r.tipo === 'prestacao' ? 'Prestação'
              : r.tipo === 'outro' ? 'Outro'
              : r.tipo;
  const meses = (r.mesReferencia || []).length;
  const mesesTxt = meses === 1 ? `1 mês` : meses > 0 ? `${meses} meses` : '';

  return `
    <div class="${cls}" data-id="${r.id}">
      <div class="rcc-head">
        <div class="rcc-num">${r.recibo_numero || ''}</div>
        <div class="rcc-data">${formatDate(r.data)}</div>
      </div>
      <div class="rcc-desc">${escapeHtml(r.descricao || tipo)}</div>
      <div class="rcc-meta">
        <span class="rcc-tipo">${tipo}${mesesTxt ? ' · ' + mesesTxt : ''}</span>
        <span class="rcc-val">${formatMoney(r.valor_centimos)}</span>
      </div>
      ${isEstorno ? '<div class="rcc-badge">Estorno</div>' : ''}
    </div>
  `;
}

async function abrirDetalhe(reciboId) {
  const r = await (await import('../../store/local-store.js')).getDoc('receipts', reciboId);
  if (!r) return;

  const session = auth.getSession();
  if (r.tenantId !== session?.tenantId) {
    alert('Sem acesso a este recibo.');
    return;
  }

  // Modal simplificado · só visualização + download
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal">
      <div class="modal-head">
        <h3>Recibo ${escapeHtml(r.recibo_numero || '')}</h3>
        <button class="btn-close" id="rc-close">✕</button>
      </div>
      <div class="modal-body">
        <div class="info-row"><span class="info-lbl">Data</span><span class="info-val">${formatDate(r.data)}</span></div>
        <div class="info-row"><span class="info-lbl">Tipo</span><span class="info-val">${r.tipo}</span></div>
        <div class="info-row"><span class="info-lbl">Descrição</span><span class="info-val">${escapeHtml(r.descricao || '')}</span></div>
        ${(r.mesReferencia || []).length > 0 ? `<div class="info-row"><span class="info-lbl">Meses</span><span class="info-val">${r.mesReferencia.join(', ')}</span></div>` : ''}
        <div class="info-row"><span class="info-lbl">Valor recebido</span><span class="info-val val-emph">${formatMoney(r.valor_centimos)}</span></div>
        ${r.excesso_centimos > 0 ? `<div class="info-row"><span class="info-lbl">Excesso (para saldo)</span><span class="info-val">${formatMoney(r.excesso_centimos)}</span></div>` : ''}
        ${r.saldoUsado_centimos > 0 ? `<div class="info-row"><span class="info-lbl">Saldo usado</span><span class="info-val">${formatMoney(r.saldoUsado_centimos)}</span></div>` : ''}
        ${r.estornoDe ? `<div class="info-card" style="background:var(--amber-light);margin-top:8px;font-size:12px">Este recibo é um estorno.</div>` : ''}
      </div>
      <div class="modal-actions">
        <button class="btn ghost" id="rc-cancel">Fechar</button>
        <button class="btn primary" id="rc-pdf">📄 Descarregar PDF</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  const close = () => modal.remove();
  modal.querySelector('#rc-close').addEventListener('click', close);
  modal.querySelector('#rc-cancel').addEventListener('click', close);
  modal.addEventListener('click', e => { if (e.target === modal) close(); });

  modal.querySelector('#rc-pdf').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    btn.textContent = '⏳ A gerar...';
    try {
      await exportPdf.gerarReciboPDF(r.id, session?.tenantName);
      btn.textContent = '✓ Descarregado';
      setTimeout(close, 1200);
    } catch (err) {
      alert('Erro: ' + err.message);
      btn.disabled = false;
      btn.textContent = '📄 Descarregar PDF';
    }
  });
}

function escapeHtml(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
