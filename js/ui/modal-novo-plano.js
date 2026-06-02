/**
 * Modal: Novo Plano de Pagamento.
 *
 * Cria um plano (obra extraordinária, intervenção) com:
 *   - Nome, descrição
 *   - Valor total
 *   - Número de prestações
 *   - Base de cálculo (permilagem / valor fixo / manual)
 *   - Data início (YYYY-MM)
 *
 * Mostra preview da distribuição em tempo real.
 * Se base=manual, permite editar cada valor individualmente.
 */

import * as planos from '../modules/planos.js';
import * as store from '../store/local-store.js';
import * as auth from '../auth/local-auth.js';
import { formatMoney, parseMoney, todayISO } from '../utils/format.js';

let modalEl = null;
let tenants = [];
let onSuccessCallback = null;
let valoresManuais = {};

export async function open(opts = {}) {
  onSuccessCallback = opts.onSuccess || null;
  tenants = await store.listDocs('tenants');
  tenants.sort((a, b) => (a.fraction || '').localeCompare(b.fraction || ''));
  valoresManuais = {};

  if (modalEl) modalEl.remove();
  modalEl = document.createElement('div');
  modalEl.className = 'modal-overlay';
  modalEl.innerHTML = buildHTML();
  document.body.appendChild(modalEl);
  document.body.style.overflow = 'hidden';

  bindEvents();
  refreshPreview();
}

export function close() {
  if (modalEl) { modalEl.remove(); modalEl = null; }
  document.body.style.overflow = '';
}

function buildHTML() {
  // Data início default = próximo mês
  const now = new Date();
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const defaultStart = `${nextMonth.getFullYear()}-${(nextMonth.getMonth() + 1).toString().padStart(2, '0')}`;

  return `
    <div class="modal modal-lg">
      <div class="modal-head">
        <h2>Novo Plano de Pagamento</h2>
        <button class="modal-close" id="np-close">×</button>
      </div>

      <div class="modal-body">
        <div class="field">
          <label>Nome do Plano</label>
          <input type="text" id="np-nome" placeholder="ex: Reabilitação do Telhado 2026" maxlength="120">
        </div>

        <div class="field">
          <label>Descrição (opcional)</label>
          <textarea id="np-desc" rows="2" placeholder="Detalhes da obra ou intervenção..."></textarea>
        </div>

        <div class="field-row">
          <div class="field">
            <label>Valor Total</label>
            <input type="text" id="np-valor" placeholder="0,00" inputmode="decimal">
          </div>
          <div class="field">
            <label>Nº de Prestações</label>
            <input type="number" id="np-num" value="6" min="1" max="60">
          </div>
        </div>

        <div class="field">
          <label>Data de Início (mês da 1.ª prestação)</label>
          <input type="month" id="np-data" value="${defaultStart}">
        </div>

        <div class="field">
          <label>Base de Cálculo</label>
          <div class="radio-group">
            <label class="radio-option">
              <input type="radio" name="base" value="permilagem" checked>
              <div class="radio-content">
                <div class="radio-title">⚖ Por Permilagem</div>
                <div class="radio-sub">Distribui proporcionalmente · cada fração paga consoante a sua quota-parte</div>
              </div>
            </label>
            <label class="radio-option">
              <input type="radio" name="base" value="valor_fixo">
              <div class="radio-content">
                <div class="radio-title">= Igual para Todos</div>
                <div class="radio-sub">Total dividido pelo número de frações · todos pagam o mesmo</div>
              </div>
            </label>
            <label class="radio-option">
              <input type="radio" name="base" value="manual">
              <div class="radio-content">
                <div class="radio-title">✎ Manual</div>
                <div class="radio-sub">Defines manualmente quanto cada condómino paga</div>
              </div>
            </label>
          </div>
        </div>

        <div class="plan-preview" id="np-preview">
          <div class="pp-title">Previsão da Distribuição</div>
          <div id="np-preview-table"></div>
          <div class="pp-footer" id="np-preview-footer"></div>
        </div>
      </div>

      <div class="modal-foot">
        <button class="btn ghost" id="np-cancel">Cancelar</button>
        <button class="btn primary" id="np-submit" disabled>Criar Plano</button>
      </div>
    </div>
  `;
}

function bindEvents() {
  modalEl.querySelector('#np-close').addEventListener('click', close);
  modalEl.querySelector('#np-cancel').addEventListener('click', close);
  modalEl.addEventListener('click', (e) => { if (e.target === modalEl) close(); });

  ['#np-nome', '#np-valor', '#np-num', '#np-data', '#np-desc'].forEach(sel => {
    modalEl.querySelector(sel).addEventListener('input', refreshPreview);
  });
  modalEl.querySelectorAll('input[name="base"]').forEach(r => {
    r.addEventListener('change', () => {
      valoresManuais = {};
      refreshPreview();
    });
  });

  modalEl.querySelector('#np-submit').addEventListener('click', submit);
}

function refreshPreview() {
  const nome = modalEl.querySelector('#np-nome').value.trim();
  const valor = parseMoney(modalEl.querySelector('#np-valor').value) || 0;
  const num = parseInt(modalEl.querySelector('#np-num').value, 10) || 0;
  const base = modalEl.querySelector('input[name="base"]:checked').value;
  const submit = modalEl.querySelector('#np-submit');

  if (!nome || valor <= 0 || num < 1 || num > 60) {
    modalEl.querySelector('#np-preview-table').innerHTML = `
      <p style="text-align:center;color:var(--text-muted);font-size:13px;padding:20px 0">
        Preenche o valor e o número de prestações para ver a distribuição.
      </p>
    `;
    modalEl.querySelector('#np-preview-footer').innerHTML = '';
    submit.disabled = true;
    return;
  }

  let dist;
  try {
    if (base === 'manual') {
      // Para manual, preencher com valores existentes ou 0
      for (const t of tenants) {
        if (valoresManuais[t.id] === undefined) {
          valoresManuais[t.id] = 0;
        }
      }
      dist = planos.calcularDistribuicao(valor, base, tenants, valoresManuais);
    } else {
      dist = planos.calcularDistribuicao(valor, base, tenants);
    }
  } catch (e) {
    modalEl.querySelector('#np-preview-table').innerHTML = `<p class="error-msg">${e.message}</p>`;
    submit.disabled = true;
    return;
  }

  const rows = tenants.map(t => {
    const d = dist[t.id];
    const total = d?.totalDevido_centimos || 0;
    const prestMensal = Math.floor(total / num);
    const isManual = base === 'manual';
    return `
      <tr>
        <td>
          <div class="pp-tenant-frac">${t.fraction}</div>
          <div class="pp-tenant-name">${t.name}${base === 'permilagem' ? ` · ${t.permilage}‰` : ''}</div>
        </td>
        <td>
          ${isManual
            ? `<input type="text" class="pp-input" data-tenant="${t.id}" value="${(total/100).toFixed(2).replace('.', ',')}" placeholder="0,00">`
            : `<strong>${formatMoney(total)}</strong>`}
        </td>
        <td class="num"><strong>${formatMoney(prestMensal)}</strong></td>
      </tr>
    `;
  }).join('');

  modalEl.querySelector('#np-preview-table').innerHTML = `
    <table class="pp-table">
      <thead>
        <tr><th>Condómino</th><th>Total a Pagar</th><th class="num">${num}× de</th></tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;

  // Se manual, bind handlers aos inputs
  if (base === 'manual') {
    modalEl.querySelectorAll('.pp-input').forEach(input => {
      input.addEventListener('input', (e) => {
        const tenantId = e.target.dataset.tenant;
        valoresManuais[tenantId] = parseMoney(e.target.value) || 0;
        refreshPreviewFooter();
      });
    });
  }

  refreshPreviewFooter();
  submit.disabled = false;
}

function refreshPreviewFooter() {
  const valor = parseMoney(modalEl.querySelector('#np-valor').value) || 0;
  const num = parseInt(modalEl.querySelector('#np-num').value, 10) || 0;
  const base = modalEl.querySelector('input[name="base"]:checked').value;

  let soma = 0;
  if (base === 'manual') {
    soma = Object.values(valoresManuais).reduce((s, v) => s + (v || 0), 0);
  } else {
    try {
      const dist = planos.calcularDistribuicao(valor, base, tenants);
      soma = Object.values(dist).reduce((s, d) => s + d.totalDevido_centimos, 0);
    } catch (e) { soma = 0; }
  }

  const diff = soma - valor;
  const submit = modalEl.querySelector('#np-submit');

  let footer = `
    <div class="pp-foot-line"><span>Total inserido</span> <strong>${formatMoney(valor)}</strong></div>
    <div class="pp-foot-line"><span>Soma distribuída</span> <strong>${formatMoney(soma)}</strong></div>
  `;

  if (Math.abs(diff) > 1) {
    footer += `<div class="pp-foot-line warn"><span>Diferença</span> <strong>${formatMoney(diff)}</strong></div>`;
    if (base === 'manual') {
      submit.disabled = Math.abs(diff) > 100;  // 1€ tolerância
      footer += `<div class="pp-warn">⚠ A soma manual tem de bater com o valor total (tolerância 1€).</div>`;
    } else if (base === 'valor_fixo') {
      footer += `<div class="pp-hint">ℹ Em distribuição igual, podem sobrar/faltar cêntimos por arredondamento. Aceitável.</div>`;
    }
  }

  modalEl.querySelector('#np-preview-footer').innerHTML = footer;
}

async function submit() {
  const nome = modalEl.querySelector('#np-nome').value.trim();
  const desc = modalEl.querySelector('#np-desc').value.trim();
  const valor = parseMoney(modalEl.querySelector('#np-valor').value);
  const num = parseInt(modalEl.querySelector('#np-num').value, 10);
  const dataIni = modalEl.querySelector('#np-data').value;
  const base = modalEl.querySelector('input[name="base"]:checked').value;

  if (!confirm(`Criar plano "${nome}"?\n\nVai gerar ${num} prestações × ${tenants.length} condóminos = ${num * tenants.length} prestações.\nNão é possível alterar depois.`)) return;

  try {
    const session = auth.getSession();
    const data = {
      nome,
      descricao: desc,
      valorTotal_centimos: valor,
      numeroPrestacoes: num,
      dataInicio: dataIni,
      baseCalculo: base
    };
    if (base === 'manual') data.valoresManuais = valoresManuais;

    const p = await planos.criar(data, session?.operatorName);
    close();
    alert(`Plano "${p.nome}" criado.\n\n${num * tenants.length} prestações geradas.\nPrimeira prestação: ${dataIni}.`);
    if (onSuccessCallback) onSuccessCallback(p);
  } catch (e) {
    alert('Erro: ' + e.message);
  }
}
