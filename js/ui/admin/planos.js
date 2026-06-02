/**
 * Página: Planos de Pagamento · Admin
 * Lista de planos + criar novo + ver detalhe.
 */

import * as planos from '../../modules/planos.js';
import * as prestacoes from '../../modules/prestacoes.js';
import * as router from '../router.js';
import * as modalNovoPlano from '../modal-novo-plano.js';
import * as modalDetalhe from '../modal-detalhe-plano.js';
import { icon } from '../icons.js';
import { formatMoney } from '../../utils/format.js';

let containerRef = null;
let state = { estado: '' };

const ESTADO_LABEL = {
  ativo: 'Ativo',
  concluido: 'Concluído',
  cancelado: 'Cancelado'
};

export async function render(container) {
  containerRef = container;

  // Atualizar estados em atraso
  await prestacoes.atualizarEstadosAtraso();

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
              <div class="breadcrumb">Obras e Intervenções Extraordinárias</div>
              <h1>Planos de Pagamento</h1>
            </div>
            <button class="btn primary" id="btn-new" style="margin-left:auto">+ Novo Plano</button>
          </div>
        </div>

        <div class="filters">
          <div class="filter-group">
            <label>Estado</label>
            <select id="f-estado">
              <option value="">— Todos —</option>
              <option value="ativo">Ativos</option>
              <option value="concluido">Concluídos</option>
              <option value="cancelado">Cancelados</option>
            </select>
          </div>
        </div>

        <div id="lista"></div>
      </main>
    </div>
  `;

  await renderList();

  container.querySelector('#brand').addEventListener('click', () => router.navigate('admin/home'));
  container.querySelector('#back-home').addEventListener('click', () => router.navigate('admin/home'));
  container.querySelector('#hamburger').addEventListener('click', () => router.navigate('admin/home'));
  container.querySelector('#btn-new').addEventListener('click', () => {
    modalNovoPlano.open({ onSuccess: () => renderList() });
  });
  container.querySelector('#f-estado').addEventListener('change', (e) => {
    state.estado = e.target.value;
    renderList();
  });
}

async function renderList() {
  const filtros = {};
  if (state.estado) filtros.estado = state.estado;

  const list = await planos.listar(filtros);

  if (list.length === 0) {
    containerRef.querySelector('#lista').innerHTML = `
      <div class="placeholder">
        <h3>Sem planos para estes filtros</h3>
        <p>Cria o primeiro plano de pagamento com "+ Novo Plano".</p>
      </div>
    `;
    return;
  }

  // Para cada plano, calcular progresso
  const rows = [];
  for (const p of list) {
    const prog = await planos.progresso(p.id);
    rows.push({ plano: p, prog });
  }

  containerRef.querySelector('#lista').innerHTML = `
    <div class="planos-list">
      ${rows.map(buildCard).join('')}
    </div>
  `;

  containerRef.querySelectorAll('.plano-card').forEach(el => {
    el.addEventListener('click', () => {
      modalDetalhe.open(el.dataset.id, { onUpdate: () => renderList() });
    });
  });
}

function buildCard({ plano, prog }) {
  const estadoCls = plano.estado === 'ativo' ? 'em_curso' : (plano.estado === 'concluido' ? 'completo' : 'aberto');
  const baseLbl = {
    permilagem: 'permilagem',
    valor_fixo: 'valor fixo',
    manual: 'manual'
  }[plano.baseCalculo] || plano.baseCalculo;

  return `
    <div class="plano-card" data-id="${plano.id}">
      <div class="pc-head">
        <div class="pc-info">
          <div class="pc-nome">${escapeHtml(plano.nome)}</div>
          <div class="pc-meta">
            ${formatMoney(plano.valorTotal_centimos)} · ${plano.numeroPrestacoes} prestações · ${baseLbl}
            <br>
            ${plano.dataInicio} → ${plano.dataPrevisaoFim}
          </div>
        </div>
        <span class="th-badge th-badge-${estadoCls}">${ESTADO_LABEL[plano.estado] || plano.estado}</span>
      </div>
      <div class="pc-progress">
        <div class="pp-bar"><div class="pp-bar-fill" style="width:${prog.percentagem}%"></div></div>
        <div class="pc-progress-info">
          <span>${prog.pagas} / ${prog.total} pagas (${prog.percentagem}%)</span>
          <span><strong>${formatMoney(prog.valorPago_centimos)}</strong> / ${formatMoney(prog.valorTotalEsperado_centimos)}</span>
        </div>
        ${prog.emAtraso > 0 ? `<div class="pc-atraso">⚠ ${prog.emAtraso} em atraso</div>` : ''}
      </div>
    </div>
  `;
}

function escapeHtml(s) {
  return (s || '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}
