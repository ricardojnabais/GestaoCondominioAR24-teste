/**
 * Modal: Registar Despesa do Condomínio (saída).
 *
 * Permite escolher rúbrica (das ativas), introduzir valor, data, descrição.
 * Botão "+ Nova rúbrica" abre prompt para criar rúbrica on-the-fly.
 */

import * as rubricas from '../modules/rubricas.js';
import * as despesas from '../modules/despesas.js';
import * as auth from '../auth/local-auth.js';
import { todayISO, formatMoney, parseMoney } from '../utils/format.js';

let modalEl = null;
let onSuccessCallback = null;

const METODOS = [
  { v: 'transferencia', l: 'Transferência bancária' },
  { v: 'debito',        l: 'Débito direto' },
  { v: 'mb',            l: 'Multibanco' },
  { v: 'cheque',        l: 'Cheque' },
  { v: 'numerario',     l: 'Numerário' },
  { v: 'outro',         l: 'Outro' }
];

export async function open(opts = {}) {
  onSuccessCallback = opts.onSuccess || null;
  if (modalEl) modalEl.remove();
  modalEl = document.createElement('div');
  modalEl.className = 'modal-overlay';
  modalEl.innerHTML = await buildHTML();
  document.body.appendChild(modalEl);
  document.body.style.overflow = 'hidden';
  bindEvents();
}

export function close() {
  if (modalEl) { modalEl.remove(); modalEl = null; }
  document.body.style.overflow = '';
}

async function buildHTML() {
  const ativas = await rubricas.ativas();
  const rubricasOpts = ativas.map(r =>
    `<option value="${r.id}">${r.nome}</option>`
  ).join('');

  const metodosOpts = METODOS.map(m =>
    `<option value="${m.v}">${m.l}</option>`
  ).join('');

  return `
    <div class="modal modal-md">
      <div class="modal-head">
        <h2>Registar Pagamento (Despesa)</h2>
        <button class="modal-close" id="nd-close">×</button>
      </div>

      <div class="modal-body">
        <div class="field">
          <label>
            Rúbrica
            <button type="button" class="link-mini" id="nd-new-rubrica">+ Nova rúbrica</button>
          </label>
          <select id="nd-rubrica">
            <option value="">— Escolher —</option>
            ${rubricasOpts}
          </select>
        </div>

        <div class="field-row">
          <div class="field">
            <label>Data do Pagamento</label>
            <input type="date" id="nd-data" value="${todayISO()}">
          </div>
          <div class="field">
            <label>Valor</label>
            <input type="text" id="nd-valor" placeholder="0,00" inputmode="decimal">
          </div>
        </div>

        <div class="field">
          <label>Fornecedor / Destinatário</label>
          <input type="text" id="nd-fornecedor" placeholder="(opcional · usa nome da rúbrica se vazio)">
        </div>

        <div class="field">
          <label>Descrição</label>
          <input type="text" id="nd-descricao" placeholder="ex: Fatura abril, manutenção mensal...">
        </div>

        <div class="field">
          <label>Método de Pagamento</label>
          <select id="nd-metodo">
            ${metodosOpts}
          </select>
        </div>
      </div>

      <div class="modal-foot">
        <button class="btn ghost" id="nd-cancel">Cancelar</button>
        <button class="btn primary" id="nd-submit" disabled>Registar Despesa</button>
      </div>
    </div>
  `;
}

function bindEvents() {
  modalEl.querySelector('#nd-close').addEventListener('click', close);
  modalEl.querySelector('#nd-cancel').addEventListener('click', close);
  modalEl.addEventListener('click', (e) => { if (e.target === modalEl) close(); });

  const checkSubmit = () => {
    const rubricaId = modalEl.querySelector('#nd-rubrica').value;
    const valor = parseMoney(modalEl.querySelector('#nd-valor').value);
    modalEl.querySelector('#nd-submit').disabled = !(rubricaId && valor > 0);
  };
  modalEl.querySelector('#nd-rubrica').addEventListener('change', checkSubmit);
  modalEl.querySelector('#nd-valor').addEventListener('input', checkSubmit);

  modalEl.querySelector('#nd-new-rubrica').addEventListener('click', async (e) => {
    e.preventDefault();
    const nome = prompt('Nome da nova rúbrica:');
    if (!nome) return;
    try {
      const session = auth.getSession();
      const nova = await rubricas.criar({ nome: nome.trim() }, session?.operatorName);
      // Adicionar ao dropdown e selecionar
      const select = modalEl.querySelector('#nd-rubrica');
      const opt = document.createElement('option');
      opt.value = nova.id;
      opt.textContent = nova.nome;
      opt.selected = true;
      select.appendChild(opt);
      // Reordenar alfabeticamente (simples)
      const opts = Array.from(select.options).slice(1);  // ignorar "Escolher"
      opts.sort((a, b) => a.text.localeCompare(b.text));
      select.innerHTML = '<option value="">— Escolher —</option>';
      opts.forEach(o => select.appendChild(o));
      select.value = nova.id;
      checkSubmit();
    } catch (err) {
      alert('Erro: ' + err.message);
    }
  });

  modalEl.querySelector('#nd-submit').addEventListener('click', submit);
}

async function submit() {
  const data = {
    rubricaId: modalEl.querySelector('#nd-rubrica').value,
    data: modalEl.querySelector('#nd-data').value,
    valor_centimos: parseMoney(modalEl.querySelector('#nd-valor').value),
    fornecedor: modalEl.querySelector('#nd-fornecedor').value.trim(),
    descricao: modalEl.querySelector('#nd-descricao').value.trim(),
    metodoPagamento: modalEl.querySelector('#nd-metodo').value
  };

  try {
    const session = auth.getSession();
    const d = await despesas.registar(data, session?.operatorName);
    close();
    alert(`Despesa registada · ${formatMoney(d.valor_centimos)}\nFornecedor: ${d.fornecedor}`);
    if (onSuccessCallback) onSuccessCallback(d);
  } catch (e) {
    alert('Erro: ' + e.message);
  }
}
