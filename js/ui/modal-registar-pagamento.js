/**
 * Modal: Registar Pagamento.
 *
 * Suporta dois tipos:
 *   - Quota Mensal · chips são meses do ano, esperado = quota mensal × meses
 *   - Prestação de Plano · escolhe plano, chips são prestações pendentes
 *
 * Em ambos: gestão de saldo a favor (excesso + saldoUsado).
 */

import * as store from '../store/local-store.js';
import * as receipts from '../modules/receipts.js';
import * as planos from '../modules/planos.js';
import * as prestacoes from '../modules/prestacoes.js';
import { todayISO, formatMoney, parseMoney, formatMonth, monthsOfYear } from '../utils/format.js';

let modalEl = null;
let tenants = [];
let planosAtivos = [];
let prestacoesAtuais = [];   // prestações listadas quando tipo=prestação
let onSuccessCallback = null;
let saldoTenantAtual = 0;

export async function open(opts = {}) {
  tenants = await store.listDocs('tenants');
  tenants.sort((a, b) => (a.fraction || '').localeCompare(b.fraction || ''));
  planosAtivos = await planos.listar({ estado: 'ativo' });
  // Atualizar atrasos para garantir frescura
  await prestacoes.atualizarEstadosAtraso();

  onSuccessCallback = opts.onSuccess || null;

  if (modalEl) modalEl.remove();
  modalEl = document.createElement('div');
  modalEl.className = 'modal-overlay';
  modalEl.innerHTML = buildHTML(opts);
  document.body.appendChild(modalEl);
  document.body.style.overflow = 'hidden';

  bindEvents();
  popularSeletorAno();
  await refreshSaldoCard();
  await refreshChips();
  refreshComputation();
}

function popularSeletorAno() {
  const anoAtual = parseInt(todayISO().split('-')[0]);
  const opts = [];
  // Ano atual + 2 anos anteriores
  for (let y = anoAtual; y >= anoAtual - 2; y--) {
    opts.push(`<option value="${y}" ${y === anoAtual ? 'selected' : ''}>${y}${y < anoAtual ? ' (atrasado)' : ''}</option>`);
  }
  const sel = modalEl.querySelector('#rp-ano-quota');
  if (sel) sel.innerHTML = opts.join('');
}

export function close() {
  if (modalEl) { modalEl.remove(); modalEl = null; }
  document.body.style.overflow = '';
}

function buildHTML(opts) {
  const today = todayISO();
  const tenantOptions = tenants.map(t =>
    `<option value="${t.id}" ${t.id === opts.tenantId ? 'selected' : ''}>${t.fraction} · ${t.name}</option>`
  ).join('');

  const planoOptions = planosAtivos.map(p =>
    `<option value="${p.id}">${p.nome}</option>`
  ).join('');

  const temPlanos = planosAtivos.length > 0;

  return `
    <div class="modal modal-md">
      <div class="modal-head">
        <h2>Registar Pagamento</h2>
        <button class="modal-close" id="rp-close">×</button>
      </div>

      <div class="modal-body">
        <div class="field">
          <label>Condómino</label>
          <select id="rp-tenant">
            <option value="">— Escolher —</option>
            ${tenantOptions}
          </select>
        </div>

        <div id="rp-saldo-card" class="saldo-card" style="display:none">
          <div class="saldo-card-ic">€</div>
          <div class="saldo-card-info">
            <div class="saldo-card-lbl">Saldo a favor</div>
            <div class="saldo-card-val" id="rp-saldo-val">0,00 €</div>
          </div>
        </div>

        <div class="field-row">
          <div class="field">
            <label>Data do Pagamento</label>
            <input type="date" id="rp-data" value="${today}">
          </div>
          <div class="field">
            <label>Tipo</label>
            <select id="rp-tipo">
              <option value="quota">Quota Mensal</option>
              <option value="prestacao" ${!temPlanos ? 'disabled' : ''}>${temPlanos ? 'Prestação de Plano' : 'Prestação · sem planos ativos'}</option>
            </select>
          </div>
        </div>

        <div class="field" id="rp-plano-wrap" style="display:none">
          <label>Plano de Pagamento</label>
          <select id="rp-plano">
            <option value="">— Escolher plano —</option>
            ${planoOptions}
          </select>
        </div>

        <div class="field" id="rp-ano-wrap">
          <label>Ano dos meses a cobrir</label>
          <select id="rp-ano-quota"></select>
          <div class="hint">Para liquidar dívidas atrasadas, seleciona o ano correspondente</div>
        </div>

        <div class="field">
          <label id="rp-chips-label">Mês(es) Abrangidos · Clica para selecionar</label>
          <div class="chips-grid" id="rp-meses"></div>
          <div class="hint" id="rp-chips-hint">Selecciona vários para pagamentos semestrais ou anuais</div>
        </div>

        <div class="field">
          <label>Valor Total Recebido</label>
          <input type="text" id="rp-valor" placeholder="0,00" inputmode="decimal">
        </div>

        <div id="rp-usar-saldo-wrap" class="usar-saldo-wrap" style="display:none">
          <label class="checkbox-label">
            <input type="checkbox" id="rp-usar-saldo">
            <span>Usar saldo a favor (<strong id="rp-usar-saldo-val">0,00 €</strong>) para acertar</span>
          </label>
        </div>

        <div id="rp-distribuicao" class="distribuicao-panel" style="display:none">
          <div class="dp-title">Distribuição</div>
          <div id="rp-distribuicao-rows"></div>
          <div class="dp-totals">
            <div><span>Esperado</span> <strong id="rp-esperado">0,00 €</strong></div>
            <div><span>Inserido</span> <strong id="rp-inserido">0,00 €</strong></div>
            <div id="rp-saldo-aplicado-row" style="display:none">
              <span>+ Saldo aplicado</span> <strong id="rp-saldo-aplicado">0,00 €</strong>
            </div>
            <div class="dp-diff"><span>Diferença</span> <strong id="rp-diff">0,00 €</strong></div>
          </div>
          <div id="rp-aviso" class="dp-aviso" style="display:none"></div>
        </div>

        <div class="field">
          <label>Descrição (opcional)</label>
          <input type="text" id="rp-descricao" placeholder="(gerada automaticamente se vazio)">
        </div>
      </div>

      <div class="modal-foot">
        <button class="btn ghost" id="rp-cancel">Cancelar</button>
        <button class="btn primary" id="rp-submit" disabled>Emitir Recibo</button>
      </div>
    </div>
  `;
}

function bindEvents() {
  modalEl.querySelector('#rp-close').addEventListener('click', close);
  modalEl.querySelector('#rp-cancel').addEventListener('click', close);
  modalEl.addEventListener('click', (e) => { if (e.target === modalEl) close(); });

  modalEl.querySelector('#rp-tenant').addEventListener('change', async () => {
    await refreshSaldoCard();
    await refreshChips();
    refreshComputation();
  });
  modalEl.querySelector('#rp-tipo').addEventListener('change', async () => {
    const isPrest = modalEl.querySelector('#rp-tipo').value === 'prestacao';
    modalEl.querySelector('#rp-plano-wrap').style.display = isPrest ? 'block' : 'none';
    modalEl.querySelector('#rp-ano-wrap').style.display = isPrest ? 'none' : 'block';
    modalEl.querySelector('#rp-chips-label').textContent = isPrest
      ? 'Prestações Pendentes · Clica para selecionar'
      : 'Mês(es) Abrangidos · Clica para selecionar';
    modalEl.querySelector('#rp-chips-hint').textContent = isPrest
      ? 'Cada chip é uma prestação. Podes selecionar várias para pagar de uma vez.'
      : 'Selecciona vários para pagamentos semestrais ou anuais';
    await refreshChips();
    refreshComputation();
  });
  modalEl.querySelector('#rp-ano-quota').addEventListener('change', async () => {
    await refreshChips();
    refreshComputation();
  });
  modalEl.querySelector('#rp-plano').addEventListener('change', async () => {
    await refreshChips();
    refreshComputation();
  });

  modalEl.querySelector('#rp-valor').addEventListener('input', refreshComputation);
  modalEl.querySelector('#rp-usar-saldo').addEventListener('change', refreshComputation);
  modalEl.querySelector('#rp-submit').addEventListener('click', submit);
}

async function refreshSaldoCard() {
  const tenantId = modalEl.querySelector('#rp-tenant').value;
  const card = modalEl.querySelector('#rp-saldo-card');
  const usarWrap = modalEl.querySelector('#rp-usar-saldo-wrap');

  if (!tenantId) {
    saldoTenantAtual = 0;
    card.style.display = 'none';
    usarWrap.style.display = 'none';
    return;
  }

  saldoTenantAtual = await receipts.saldoCondomino(tenantId);

  if (saldoTenantAtual > 0) {
    modalEl.querySelector('#rp-saldo-val').textContent = formatMoney(saldoTenantAtual);
    modalEl.querySelector('#rp-usar-saldo-val').textContent = formatMoney(saldoTenantAtual);
    card.style.display = 'flex';
  } else {
    card.style.display = 'none';
    usarWrap.style.display = 'none';
  }
}

/**
 * Carregar chips consoante o tipo selecionado.
 * Para Quota: 12 meses do ano atual.
 * Para Prestação: prestações pendentes/atraso do condómino no plano.
 */
async function refreshChips() {
  const tenantId = modalEl.querySelector('#rp-tenant').value;
  const tipo = modalEl.querySelector('#rp-tipo').value;
  const grid = modalEl.querySelector('#rp-meses');
  prestacoesAtuais = [];

  if (tipo === 'quota') {
    const year = modalEl.querySelector('#rp-ano-quota')?.value || todayISO().split('-')[0];
    const months = monthsOfYear(year);
    grid.innerHTML = months.map(m =>
      `<button type="button" class="chip-month" data-kind="quota" data-month="${m}">
        ${formatMonth(m, true).split(' ')[0]}
      </button>`
    ).join('');
    bindChipsClick();

    // Marcar estado dos chips (pago/parcial)
    if (tenantId) {
      const tenant = tenants.find(t => t.id === tenantId);
      for (const chip of grid.querySelectorAll('.chip-month')) {
        const month = chip.dataset.month;
        const ano = month.split('-')[0];
        const quotaMensal = tenant?.rentByYear?.[ano] || 0;
        const pago = await receipts.valorPagoNoMes(tenantId, month);
        chip.classList.remove('disabled', 'partial');
        if (pago > 0 && pago >= quotaMensal) {
          chip.classList.add('disabled');
          chip.title = `Já pago: ${formatMoney(pago)}`;
        } else if (pago > 0) {
          chip.classList.add('partial');
          chip.title = `Pago parcial: ${formatMoney(pago)} de ${formatMoney(quotaMensal)}`;
        }
      }
    }
  } else if (tipo === 'prestacao') {
    const planoId = modalEl.querySelector('#rp-plano').value;
    if (!planoId || !tenantId) {
      grid.innerHTML = `<div class="hint" style="grid-column:1/-1;padding:14px;text-align:center">Escolhe primeiro o plano e o condómino.</div>`;
      return;
    }
    const pend = await prestacoes.pendentesParaCondominoPlano(tenantId, planoId);
    prestacoesAtuais = pend;
    if (pend.length === 0) {
      grid.innerHTML = `<div class="hint" style="grid-column:1/-1;padding:14px;text-align:center">Não há prestações pendentes para este condómino neste plano.</div>`;
      return;
    }
    grid.innerHTML = pend.map(p => {
      const isAtraso = p.estado === 'em_atraso';
      const [y, m] = p.mesReferencia.split('-');
      const meses = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
      return `
        <button type="button" class="chip-month chip-prest ${isAtraso ? 'partial' : ''}" data-kind="prest" data-prest-id="${p.id}" data-month="${p.mesReferencia}" data-valor="${p.valor_centimos}" title="${isAtraso ? 'Em atraso · ' : ''}${formatMoney(p.valor_centimos)}">
          <div>${meses[parseInt(m, 10) - 1]} ${y.slice(2)}</div>
          <div style="font-size:10.5px;opacity:.8">${formatMoney(p.valor_centimos, false)}</div>
        </button>
      `;
    }).join('');
    bindChipsClick();
  }
}

function bindChipsClick() {
  modalEl.querySelectorAll('.chip-month').forEach(chip => {
    chip.addEventListener('click', () => {
      if (chip.classList.contains('disabled')) return;
      chip.classList.toggle('selected');
      refreshComputation();
    });
  });
}

function getSelectedChips() {
  return Array.from(modalEl.querySelectorAll('.chip-month.selected'));
}

async function refreshComputation() {
  const tenantId = modalEl.querySelector('#rp-tenant').value;
  const tipo = modalEl.querySelector('#rp-tipo').value;
  const selectedChips = getSelectedChips();
  const valor = parseMoney(modalEl.querySelector('#rp-valor').value) || 0;
  const usarSaldo = modalEl.querySelector('#rp-usar-saldo').checked;

  const panel = modalEl.querySelector('#rp-distribuicao');
  const submit = modalEl.querySelector('#rp-submit');
  const usarWrap = modalEl.querySelector('#rp-usar-saldo-wrap');

  if (!tenantId || selectedChips.length === 0) {
    panel.style.display = 'none';
    submit.disabled = true;
    usarWrap.style.display = 'none';
    return;
  }

  let esperado = 0;
  const rowsHtml = [];

  if (tipo === 'quota') {
    const tenant = tenants.find(t => t.id === tenantId);
    const ano = selectedChips[0].dataset.month.split('-')[0];
    const quotaMensal = tenant?.rentByYear?.[ano] || 0;

    for (const chip of selectedChips) {
      const m = chip.dataset.month;
      const jaPago = await receipts.valorPagoNoMes(tenantId, m);
      const emFalta = Math.max(0, quotaMensal - jaPago);
      esperado += emFalta;
      if (jaPago > 0) {
        rowsHtml.push(`
          <div class="dp-row dp-row-partial">
            <div class="dp-row-info">
              <div class="dp-month">${formatMonth(m)} <span class="dp-tag">parcial</span></div>
              <div class="dp-detail">Já pago ${formatMoney(jaPago)} de ${formatMoney(quotaMensal)}</div>
            </div>
            <strong>${formatMoney(emFalta)}</strong>
          </div>
        `);
      } else {
        rowsHtml.push(`
          <div class="dp-row">
            <span>${formatMonth(m)}</span>
            <strong>${formatMoney(quotaMensal)}</strong>
          </div>
        `);
      }
    }
  } else if (tipo === 'prestacao') {
    for (const chip of selectedChips) {
      const v = parseInt(chip.dataset.valor, 10) || 0;
      const m = chip.dataset.month;
      esperado += v;
      const prest = prestacoesAtuais.find(p => p.id === chip.dataset.prestId);
      const numLabel = prest ? `Prestação ${prest.numeroPrestacao}/${prest.totalPrestacoes}` : 'Prestação';
      const isAtraso = prest?.estado === 'em_atraso';
      rowsHtml.push(`
        <div class="dp-row ${isAtraso ? 'dp-row-partial' : ''}">
          <div class="dp-row-info">
            <div class="dp-month">${formatMonth(m)} <span class="dp-tag" style="background:var(--primary)">${numLabel}</span>${isAtraso ? '<span class="dp-tag">em atraso</span>' : ''}</div>
          </div>
          <strong>${formatMoney(v)}</strong>
        </div>
      `);
    }
  }

  // Calcular saldoUsado / excesso
  let saldoUsado = 0;
  let excesso = 0;
  let diff = valor - esperado;
  if (diff > 0) {
    excesso = diff;
  } else if (diff < 0 && usarSaldo && saldoTenantAtual > 0) {
    saldoUsado = Math.min(saldoTenantAtual, -diff);
    diff = diff + saldoUsado;
  }

  if (saldoTenantAtual > 0 && valor < esperado) {
    usarWrap.style.display = 'block';
  } else {
    usarWrap.style.display = 'none';
  }

  modalEl.querySelector('#rp-distribuicao-rows').innerHTML = rowsHtml.join('');
  modalEl.querySelector('#rp-esperado').textContent = formatMoney(esperado);
  modalEl.querySelector('#rp-inserido').textContent = formatMoney(valor);

  const saldoRow = modalEl.querySelector('#rp-saldo-aplicado-row');
  if (saldoUsado > 0) {
    saldoRow.style.display = 'flex';
    modalEl.querySelector('#rp-saldo-aplicado').textContent = formatMoney(saldoUsado);
  } else {
    saldoRow.style.display = 'none';
  }

  const diffEl = modalEl.querySelector('#rp-diff');
  diffEl.textContent = formatMoney(diff);
  diffEl.className = diff === 0 ? 'ok' : (diff > 0 ? 'pos' : 'neg');

  const aviso = modalEl.querySelector('#rp-aviso');
  if (valor > 0) {
    aviso.style.display = 'block';
    if (diff === 0 && excesso === 0 && saldoUsado === 0) {
      aviso.className = 'dp-aviso ok';
      aviso.innerHTML = `✓ Valor confere com o esperado.`;
    } else if (diff === 0 && saldoUsado > 0) {
      aviso.className = 'dp-aviso ok';
      aviso.innerHTML = `✓ Acertado com ${formatMoney(saldoUsado)} de saldo. Saldo final: ${formatMoney(saldoTenantAtual - saldoUsado)}.`;
    } else if (excesso > 0) {
      aviso.className = 'dp-aviso warn';
      aviso.innerHTML = `⚠ Excesso de <strong>${formatMoney(excesso)}</strong> · disponível como saldo a favor. Saldo final: <strong>${formatMoney(saldoTenantAtual + excesso)}</strong>.`;
    } else if (diff < 0) {
      aviso.className = 'dp-aviso warn';
      aviso.innerHTML = `⚠ Valor em falta: <strong>${formatMoney(-diff)}</strong>.`;
    } else {
      aviso.style.display = 'none';
    }
  } else {
    aviso.style.display = 'none';
  }

  panel.style.display = 'block';
  submit.disabled = !(tenantId && selectedChips.length > 0 && valor > 0);

  modalEl.dataset.excesso = excesso;
  modalEl.dataset.saldoUsado = saldoUsado;
}

async function submit() {
  const tenantId = modalEl.querySelector('#rp-tenant').value;
  const data = modalEl.querySelector('#rp-data').value;
  const tipo = modalEl.querySelector('#rp-tipo').value;
  const valor = parseMoney(modalEl.querySelector('#rp-valor').value);
  const descricao = modalEl.querySelector('#rp-descricao').value.trim();

  const excesso = parseInt(modalEl.dataset.excesso || '0', 10);
  const saldoUsado = parseInt(modalEl.dataset.saldoUsado || '0', 10);

  const chips = getSelectedChips();
  let payload;

  if (tipo === 'quota') {
    const meses = chips.map(c => c.dataset.month).sort();
    payload = {
      tenantId, tipo: 'quota', data,
      mesReferencia: meses,
      valor_centimos: valor,
      excesso_centimos: excesso,
      saldoUsado_centimos: saldoUsado,
      descricao: descricao || undefined
    };
  } else if (tipo === 'prestacao') {
    const planoId = modalEl.querySelector('#rp-plano').value;
    if (!planoId) return alert('Falta escolher o plano.');
    const prestacoesIds = chips.map(c => c.dataset.prestId);
    const meses = chips.map(c => c.dataset.month).sort();
    payload = {
      tenantId, tipo: 'prestacao', data,
      planoId,
      prestacoesIds,
      mesReferencia: meses,
      valor_centimos: valor,
      excesso_centimos: excesso,
      saldoUsado_centimos: saldoUsado,
      descricao: descricao || undefined
    };
  }

  try {
    const recibo = await receipts.emitir(payload);
    close();
    const tenant = tenants.find(t => t.id === tenantId);
    await mostrarPosEmissao(recibo, tenant, { saldoUsado, excesso });
    if (onSuccessCallback) onSuccessCallback(recibo);
  } catch (e) {
    alert('Erro: ' + e.message);
  }
}

async function mostrarPosEmissao(recibo, tenant, info) {
  const condominio = await store.getDoc('meta', 'condominio') || {};
  const template = condominio?.templateEmailRecibo || templateEmailDefault();

  // Substituir placeholders
  const corpo = template
    .replace(/{nome}/g, recibo.tenantName || tenant?.name || '')
    .replace(/{fraction}/g, recibo.fraction || tenant?.fraction || '')
    .replace(/{numero}/g, recibo.recibo_numero || '')
    .replace(/{valor}/g, formatMoney(recibo.valor_centimos))
    .replace(/{descricao}/g, recibo.descricao || '')
    .replace(/{data}/g, recibo.data || '')
    .replace(/{condominio}/g, condominio.nome || 'Condomínio AR24')
    .replace(/{morada}/g, condominio.morada || 'Av. Amália Rodrigues, 24')
    .replace(/{iban}/g, condominio.iban || '— IBAN não definido —')
    .replace(/{email_condominio}/g, condominio.email || '');
  const assunto = `Recibo ${recibo.recibo_numero} · ${condominio.nome || 'Condomínio AR24'}`;
  const email = tenant?.email || '';

  let extra = '';
  if (info.saldoUsado > 0) extra += `<div class="post-info">Saldo usado: ${formatMoney(info.saldoUsado)}</div>`;
  if (info.excesso > 0) extra += `<div class="post-info">Excesso · saldo a favor: ${formatMoney(info.excesso)}</div>`;

  const dlg = document.createElement('div');
  dlg.className = 'modal-overlay';
  dlg.innerHTML = `
    <div class="modal">
      <div class="modal-head">
        <h3>✓ Recibo Emitido</h3>
        <button class="btn-close" id="pe-close">✕</button>
      </div>
      <div class="modal-body">
        <div class="post-success">
          <div class="post-num">${recibo.recibo_numero}</div>
          <div class="post-val">${formatMoney(recibo.valor_centimos)}</div>
        </div>
        ${extra}
        <div class="post-actions" style="margin-top:18px;display:flex;gap:10px;flex-wrap:wrap">
          <button class="btn" id="pe-pdf">📄 Ver PDF</button>
          <button class="btn primary" id="pe-email" ${!email ? 'disabled title="O condómino não tem email registado"' : ''}>📧 Enviar por Email</button>
          <button class="btn ghost" id="pe-ok">Fechar</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(dlg);
  const close = () => dlg.remove();
  dlg.querySelector('#pe-close').addEventListener('click', close);
  dlg.querySelector('#pe-ok').addEventListener('click', close);
  dlg.querySelector('#pe-pdf').addEventListener('click', async () => {
    const { gerarReciboPDF } = await import('../modules/export-pdf.js');
    const { getSession } = await import('../auth/local-auth.js');
    const session = getSession();
    await gerarReciboPDF(recibo.id, session?.operatorName || '');
  });
  if (email) {
    dlg.querySelector('#pe-email').addEventListener('click', () => {
      const mailto = `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(assunto)}&body=${encodeURIComponent(corpo)}`;
      window.location.href = mailto;
    });
  }
}

function templateEmailDefault() {
  return `Caro(a) {nome},

Junto envio o recibo n.º {numero}, referente a {descricao}, no valor de {valor}, emitido a {data}.

Para sua referência:
• Fração: {fraction}
• Condomínio: {condominio}

Para pagamentos por transferência bancária, utilize:
• IBAN: {iban}
• Titular: {condominio}
• Referência: indicar a fração ({fraction}) e o mês de referência

Em caso de dúvida, contacte a administração através de {email_condominio}.

Com os melhores cumprimentos,
A Administração
{condominio}
{morada}`;
}
