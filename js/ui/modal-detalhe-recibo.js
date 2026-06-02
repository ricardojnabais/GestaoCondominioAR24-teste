/**
 * Modal: Detalhe de Recibo.
 *
 * Mostra todos os campos do recibo + permite ações:
 *  - Cancelar (cria estorno · não apaga)
 *  - Descarregar PDF (placeholder até Fase 4)
 */

import * as store from '../store/local-store.js';
import * as receipts from '../modules/receipts.js';
import * as exportPdf from '../modules/export-pdf.js';
import * as auth from '../auth/local-auth.js';
import { formatMoney, formatDate, formatDateLong, formatMonth } from '../utils/format.js';

let modalEl = null;
let onUpdateCallback = null;

export async function open(receiptId, opts = {}) {
  const recibo = await store.getDoc('receipts', receiptId);
  if (!recibo) {
    alert('Recibo não encontrado.');
    return;
  }
  onUpdateCallback = opts.onUpdate || null;

  if (modalEl) modalEl.remove();
  modalEl = document.createElement('div');
  modalEl.className = 'modal-overlay';
  modalEl.innerHTML = buildHTML(recibo);
  document.body.appendChild(modalEl);
  document.body.style.overflow = 'hidden';

  bindEvents(recibo);
}

export function close() {
  if (modalEl) { modalEl.remove(); modalEl = null; }
  document.body.style.overflow = '';
}

function buildHTML(r) {
  const isEstorno = r.tipo === 'estorno';
  const isCancelled = r.cancelado;
  const meses = (r.mesReferencia || []).slice().sort();
  const mesesStr = meses.map(m => formatMonth(m)).join(', ');

  const statusBadge = isCancelled
    ? '<span class="dr-badge cancelled">CANCELADO</span>'
    : isEstorno
      ? '<span class="dr-badge estorno">ESTORNO</span>'
      : '<span class="dr-badge ok">VÁLIDO</span>';

  return `
    <div class="modal modal-md">
      <div class="modal-head">
        <div>
          <h2>Recibo ${r.recibo_numero}</h2>
          <div class="dr-sub">${statusBadge}</div>
        </div>
        <button class="modal-close" id="dr-close">×</button>
      </div>

      <div class="modal-body">
        <div class="dr-grid">
          <div class="dr-row">
            <div class="dr-lbl">Data</div>
            <div class="dr-val">${formatDateLong(r.data)}</div>
          </div>
          <div class="dr-row">
            <div class="dr-lbl">Condómino</div>
            <div class="dr-val">${r.tenantName || '—'}</div>
          </div>
          <div class="dr-row">
            <div class="dr-lbl">Fração</div>
            <div class="dr-val">${r.fraction || '—'}</div>
          </div>
          <div class="dr-row">
            <div class="dr-lbl">Tipo</div>
            <div class="dr-val">${tipoLabel(r.tipo)}</div>
          </div>
          <div class="dr-row">
            <div class="dr-lbl">Descrição</div>
            <div class="dr-val">${r.descricao || '—'}</div>
          </div>
          <div class="dr-row">
            <div class="dr-lbl">Meses abrangidos</div>
            <div class="dr-val">${mesesStr || '—'}</div>
          </div>
          <div class="dr-row dr-row-highlight">
            <div class="dr-lbl">Valor</div>
            <div class="dr-val dr-amount ${r.valor_centimos < 0 ? 'neg' : 'pos'}">${formatMoney(r.valor_centimos)}</div>
          </div>
          ${r.estornoDe ? `
          <div class="dr-row dr-warn">
            <div class="dr-lbl">Estorno de</div>
            <div class="dr-val">Recibo original ${r.estornoDe}</div>
          </div>
          ` : ''}
          ${r.canceladoEm ? `
          <div class="dr-row dr-warn">
            <div class="dr-lbl">Cancelado em</div>
            <div class="dr-val">${formatDate(new Date(r.canceladoEm).toISOString().slice(0, 10))} · ${r.motivoCancelamento || ''}</div>
          </div>
          ` : ''}
        </div>
      </div>

      <div class="modal-foot">
        <button class="btn ghost" id="dr-cancel-btn">Fechar</button>
        <button class="btn" id="dr-pdf-btn">📄 PDF</button>
        ${!isCancelled && !isEstorno ? `
        <button class="btn danger" id="dr-estornar-btn">Cancelar Recibo</button>
        ` : ''}
      </div>
    </div>
  `;
}

function tipoLabel(tipo) {
  return {
    'quota': 'Quota mensal',
    'prestacao': 'Prestação de plano',
    'estorno': 'Estorno',
    'outro': 'Outro recebimento',
    'recebimento': 'Recebimento'
  }[tipo] || tipo || '—';
}

function bindEvents(recibo) {
  modalEl.querySelector('#dr-close').addEventListener('click', close);
  modalEl.querySelector('#dr-cancel-btn').addEventListener('click', close);
  modalEl.addEventListener('click', (e) => { if (e.target === modalEl) close(); });

  modalEl.querySelector('#dr-pdf-btn').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    btn.textContent = '⏳ A gerar...';
    try {
      const session = auth.getSession();
      const filename = await exportPdf.gerarReciboPDF(recibo.id, session?.operatorName);
      btn.textContent = '✓ Descarregado';
      setTimeout(() => {
        btn.textContent = '📄 PDF';
        btn.disabled = false;
      }, 1800);
      if (onUpdateCallback) onUpdateCallback();
    } catch (err) {
      alert('Erro a gerar PDF: ' + err.message);
      btn.textContent = '📄 PDF';
      btn.disabled = false;
    }
  });

  const estornarBtn = modalEl.querySelector('#dr-estornar-btn');
  if (estornarBtn) {
    estornarBtn.addEventListener('click', async () => {
      const motivo = prompt(`Motivo do cancelamento do recibo ${recibo.recibo_numero}:`, '');
      if (motivo === null) return;
      try {
        await receipts.cancelar(recibo.id, motivo || 'Cancelado pelo administrador');
        alert(`Recibo ${recibo.recibo_numero} cancelado. Foi emitido um estorno automaticamente.`);
        close();
        if (onUpdateCallback) onUpdateCallback();
      } catch (e) {
        alert('Erro: ' + e.message);
      }
    });
  }
}
