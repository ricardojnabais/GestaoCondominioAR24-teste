/**
 * Modal: Detalhe de Plano de Pagamento.
 * Mostra matriz condóminos × prestações com estados.
 */

import * as planos from '../modules/planos.js';
import * as prestacoes from '../modules/prestacoes.js';
import * as auth from '../auth/local-auth.js';
import { formatMoney } from '../utils/format.js';

let modalEl = null;
let currentPlanoId = null;
let onUpdateCallback = null;

const ESTADO_LABEL = {
  pendente: 'Pendente',
  paga: 'Paga',
  em_atraso: 'Em atraso',
  cancelada: 'Cancelada'
};

const MESES_SHORT = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

export async function open(planoId, opts = {}) {
  currentPlanoId = planoId;
  onUpdateCallback = opts.onUpdate || null;

  // Atualizar estados de atraso antes de abrir
  await prestacoes.atualizarEstadosAtraso();

  await render();
}

export function close() {
  if (modalEl) { modalEl.remove(); modalEl = null; }
  document.body.style.overflow = '';
  if (onUpdateCallback) onUpdateCallback();
}

async function render() {
  const plano = await planos.obter(currentPlanoId);
  if (!plano) { alert('Plano não encontrado.'); return; }
  const prog = await planos.progresso(plano.id);
  const todasPrestacoes = await prestacoes.listar({ planoId: plano.id });

  // Agrupar prestações por condómino
  const porTenant = {};
  for (const p of todasPrestacoes) {
    if (!porTenant[p.tenantId]) porTenant[p.tenantId] = [];
    porTenant[p.tenantId].push(p);
  }
  // Ordenar cada condómino por numeroPrestacao
  for (const t in porTenant) {
    porTenant[t].sort((a, b) => (a.numeroPrestacao || 0) - (b.numeroPrestacao || 0));
  }

  if (modalEl) modalEl.remove();
  modalEl = document.createElement('div');
  modalEl.className = 'modal-overlay';
  modalEl.innerHTML = buildHTML(plano, prog, porTenant);
  document.body.appendChild(modalEl);
  document.body.style.overflow = 'hidden';

  bindEvents(plano);
}

function buildHTML(plano, prog, porTenant) {
  const baseLbl = {
    permilagem: 'Por permilagem',
    valor_fixo: 'Igual para todos',
    manual: 'Manual'
  }[plano.baseCalculo] || plano.baseCalculo;

  const estadoBadge = `<span class="th-badge th-badge-${plano.estado === 'ativo' ? 'em_curso' : (plano.estado === 'concluido' ? 'completo' : 'aberto')}">${plano.estado.toUpperCase()}</span>`;

  const tenantsOrdered = Object.entries(porTenant)
    .map(([id, prests]) => ({
      id,
      fraction: prests[0]?.fraction || '',
      tenantName: prests[0]?.tenantName || '',
      prests
    }))
    .sort((a, b) => (a.fraction || '').localeCompare(b.fraction || ''));

  // Header de prestações (1, 2, 3, ..., N) com meses
  const numPrests = plano.numeroPrestacoes;
  const headerCells = [];
  for (let i = 0; i < numPrests; i++) {
    const [y, m] = (tenantsOrdered[0]?.prests[i]?.mesReferencia || plano.dataInicio).split('-');
    headerCells.push(`<th class="ppt-h">${MESES_SHORT[parseInt(m,10) - 1]}<br><span class="ppt-y">${y}</span></th>`);
  }

  const bodyRows = tenantsOrdered.map(t => {
    const cells = t.prests.map(p => {
      const cls = `ppt-cell ppt-${p.estado}`;
      const tooltip = `${ESTADO_LABEL[p.estado]} · ${formatMoney(p.valor_centimos)}`;
      return `<td class="${cls}" title="${tooltip}">${formatMoney(p.valor_centimos, false)}</td>`;
    }).join('');
    const totalDevido = t.prests.reduce((s, p) => s + p.valor_centimos, 0);
    const totalPago = t.prests.filter(p => p.estado === 'paga').reduce((s, p) => s + p.valor_centimos, 0);
    return `
      <tr>
        <td class="ppt-tenant">
          <div class="ppt-frac">${t.fraction}</div>
          <div class="ppt-name">${t.tenantName}</div>
        </td>
        ${cells}
        <td class="num ppt-total">
          <strong>${formatMoney(totalPago)}</strong>
          <div class="ppt-of">de ${formatMoney(totalDevido)}</div>
        </td>
      </tr>
    `;
  }).join('');

  return `
    <div class="modal modal-xl">
      <div class="modal-head">
        <div style="flex:1">
          <div class="th-tipo">Plano de Pagamento</div>
          <h2>${escapeHtml(plano.nome)}</h2>
          <div class="dr-sub">${estadoBadge}</div>
        </div>
        <button class="modal-close" id="pd-close">×</button>
      </div>

      <div class="modal-body">
        <div class="plan-info-grid">
          <div class="pig-item">
            <div class="pig-lbl">Valor Total</div>
            <div class="pig-val">${formatMoney(plano.valorTotal_centimos)}</div>
          </div>
          <div class="pig-item">
            <div class="pig-lbl">Prestações</div>
            <div class="pig-val">${plano.numeroPrestacoes}× ${formatMoney(Math.round(plano.valorTotal_centimos / plano.numeroPrestacoes))}</div>
          </div>
          <div class="pig-item">
            <div class="pig-lbl">Base de Cálculo</div>
            <div class="pig-val">${baseLbl}</div>
          </div>
          <div class="pig-item">
            <div class="pig-lbl">Início → Fim</div>
            <div class="pig-val">${plano.dataInicio} → ${plano.dataPrevisaoFim}</div>
          </div>
        </div>

        <div class="plan-progress">
          <div class="pp-bar"><div class="pp-bar-fill" style="width:${prog.percentagem}%"></div></div>
          <div class="pp-stats">
            <span><strong>${prog.pagas}</strong> / ${prog.total} prestações pagas (${prog.percentagem}%)</span>
            <span class="pp-stats-money">${formatMoney(prog.valorPago_centimos)} de ${formatMoney(prog.valorTotalEsperado_centimos)}</span>
          </div>
          ${prog.emAtraso > 0 ? `<div class="pp-warn-atraso">⚠ ${prog.emAtraso} prestação${prog.emAtraso > 1 ? 'ões' : ''} em atraso</div>` : ''}
        </div>

        ${plano.descricao ? `<div class="plan-desc">${escapeHtml(plano.descricao)}</div>` : ''}

        <div class="ppt-wrap">
          <table class="ppt-table">
            <thead>
              <tr>
                <th class="ppt-tenant-h">Condómino</th>
                ${headerCells.join('')}
                <th class="num ppt-total-h">Pago / Total</th>
              </tr>
            </thead>
            <tbody>${bodyRows}</tbody>
          </table>
        </div>

        <div class="ppt-legend">
          <span class="legend-item"><span class="dot ppt-paga"></span> Paga</span>
          <span class="legend-item"><span class="dot ppt-pendente"></span> Pendente</span>
          <span class="legend-item"><span class="dot ppt-em_atraso"></span> Em atraso</span>
          <span class="legend-item"><span class="dot ppt-cancelada"></span> Cancelada</span>
        </div>
      </div>

      <div class="modal-foot">
        <button class="btn ghost" id="pd-close-bottom">Fechar</button>
        ${plano.estado === 'ativo' ? `<button class="btn danger" id="pd-cancelar">Cancelar Plano</button>` : ''}
      </div>
    </div>
  `;
}

function bindEvents(plano) {
  modalEl.querySelector('#pd-close').addEventListener('click', close);
  modalEl.querySelector('#pd-close-bottom').addEventListener('click', close);
  modalEl.addEventListener('click', (e) => { if (e.target === modalEl) close(); });

  const cancelBtn = modalEl.querySelector('#pd-cancelar');
  if (cancelBtn) {
    cancelBtn.addEventListener('click', async () => {
      const motivo = prompt(`Cancelar o plano "${plano.nome}"?\n\nPrestações futuras pendentes/atrasadas serão canceladas. Prestações já pagas mantêm-se.\n\nMotivo:`, '');
      if (motivo === null) return;
      try {
        const session = auth.getSession();
        const r = await planos.cancelar(plano.id, motivo, session?.operatorName);
        alert(`Plano cancelado.\n${r.prestacoesCanceladas} prestações foram canceladas.`);
        await render();
      } catch (e) {
        alert('Erro: ' + e.message);
      }
    });
  }
}

function escapeHtml(s) {
  return (s || '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}
