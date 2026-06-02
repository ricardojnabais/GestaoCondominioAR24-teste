/**
 * Modal: Outros Recebimentos.
 *
 * Para receitas pontuais não relacionadas com quotas:
 *   - Devoluções de fornecedores
 *   - Reembolsos de seguros
 *   - Juros bancários
 *   - Donativos pontuais
 */

import * as store from '../store/local-store.js';
import * as outros from '../modules/outros-recebimentos.js';
import * as receipts from '../modules/receipts.js';
import * as auth from '../auth/local-auth.js';
import { todayISO, formatMoney, parseMoney } from '../utils/format.js';

let modalEl = null;
let onSuccessCallback = null;

export async function open(opts = {}) {
  onSuccessCallback = opts.onSuccess || null;
  const tenants = await store.listDocs('tenants');
  tenants.sort((a, b) => (a.fraction || '').localeCompare(b.fraction || ''));

  if (modalEl) modalEl.remove();
  modalEl = document.createElement('div');
  modalEl.className = 'modal-overlay';

  const tenantOpts = tenants.map(t =>
    `<option value="${t.id}">${t.fraction} · ${t.name}</option>`
  ).join('');

  modalEl.innerHTML = `
    <div class="modal modal-md">
      <div class="modal-head">
        <h2>Registar Outro Recebimento</h2>
        <button class="modal-close" id="nr-close">×</button>
      </div>
      <div class="modal-body">
        <p class="hint" style="margin-bottom:14px">
          Para devoluções, reembolsos, juros bancários ou recebimentos
          que não sejam quotas. Para registar uma quota, usa "Inserir Quota" no menu principal.
        </p>

        <div class="field-row">
          <div class="field">
            <label>Data</label>
            <input type="date" id="nr-data" value="${todayISO()}">
          </div>
          <div class="field">
            <label>Valor</label>
            <input type="text" id="nr-valor" placeholder="0,00" inputmode="decimal">
          </div>
        </div>

        <div class="field">
          <label>Descrição</label>
          <input type="text" id="nr-descricao" placeholder="ex: Reembolso seguro, juros conta poupança...">
        </div>

        <div class="field">
          <label>Origem (opcional)</label>
          <input type="text" id="nr-origem" placeholder="Quem pagou? ex: Câmara Municipal da Amadora">
        </div>

        <div class="field">
          <label>NIF de quem pagou (opcional)</label>
          <input type="text" id="nr-nif" placeholder="ex: 501 234 567" inputmode="numeric">
          <div class="hint">Sai no recibo, por baixo de "Recebi de".</div>
        </div>

        <label class="field" style="flex-direction:row;align-items:center;gap:10px;cursor:pointer;margin-top:4px">
          <input type="checkbox" id="nr-recibo" checked style="width:18px;height:18px;flex:0 0 auto">
          <span>Emitir <strong>recibo numerado</strong> (RCB) para este recebimento</span>
        </label>

        <div class="field">
          <label>Associado a condómino (opcional)</label>
          <select id="nr-tenant">
            <option value="">— Nenhum —</option>
            ${tenantOpts}
          </select>
          <div class="hint">Só se este recebimento for diretamente atribuível a uma fração.</div>
        </div>
      </div>
      <div class="modal-foot">
        <button class="btn ghost" id="nr-cancel">Cancelar</button>
        <button class="btn primary" id="nr-submit" disabled>Registar</button>
      </div>
    </div>
  `;
  document.body.appendChild(modalEl);
  document.body.style.overflow = 'hidden';

  bindEvents();
}

export function close() {
  if (modalEl) { modalEl.remove(); modalEl = null; }
  document.body.style.overflow = '';
}

function bindEvents() {
  modalEl.querySelector('#nr-close').addEventListener('click', close);
  modalEl.querySelector('#nr-cancel').addEventListener('click', close);
  modalEl.addEventListener('click', (e) => { if (e.target === modalEl) close(); });

  const checkSubmit = () => {
    const valor = parseMoney(modalEl.querySelector('#nr-valor').value);
    const desc = modalEl.querySelector('#nr-descricao').value.trim();
    modalEl.querySelector('#nr-submit').disabled = !(valor > 0 && desc.length > 0);
  };
  modalEl.querySelector('#nr-valor').addEventListener('input', checkSubmit);
  modalEl.querySelector('#nr-descricao').addEventListener('input', checkSubmit);

  modalEl.querySelector('#nr-submit').addEventListener('click', async () => {
    const data = {
      data: modalEl.querySelector('#nr-data').value,
      valor_centimos: parseMoney(modalEl.querySelector('#nr-valor').value),
      descricao: modalEl.querySelector('#nr-descricao').value.trim(),
      origem: modalEl.querySelector('#nr-origem').value.trim(),
      tenantId: modalEl.querySelector('#nr-tenant').value || null
    };
    const emitirRecibo = modalEl.querySelector('#nr-recibo').checked;
    const nif = modalEl.querySelector('#nr-nif').value.trim();
    const btn = modalEl.querySelector('#nr-submit');
    btn.disabled = true;
    try {
      const session = auth.getSession();
      // 1) Entrada em outros recebimentos — é o que CONTA no saldo e na Análise.
      const r = await outros.registar(data, session?.operatorName);

      // 2) (Opcional) Recibo numerado — só o documento, audit-only (não duplica).
      let recibo = null;
      if (emitirRecibo) {
        recibo = await receipts.emitirRecebimento({
          valor_centimos: data.valor_centimos,
          descricao: data.descricao,
          pagador: data.origem,
          pagadorNif: nif,
          data: data.data,
          outroRecebimentoId: r.id
        });
        // Ligar a entrada ao recibo (para referência/auditoria).
        try { await store.setDoc('outrosRecebimentos', { ...r, reciboNumero: recibo.recibo_numero }); }
        catch (_) {}
      }

      close();
      alert(recibo
        ? `Recebimento registado · ${formatMoney(r.valor_centimos)}\nRecibo ${recibo.recibo_numero} emitido.`
        : `Recebimento registado · ${formatMoney(r.valor_centimos)}`);
      if (onSuccessCallback) onSuccessCallback(recibo || r);
    } catch (e) {
      btn.disabled = false;
      alert('Erro: ' + e.message);
    }
  });
}
