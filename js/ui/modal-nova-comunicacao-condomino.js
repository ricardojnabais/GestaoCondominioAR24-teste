/**
 * Modal: Nova Comunicação (perspetiva Condómino).
 *
 * Condómino envia:
 *   - Reportar problema  (luz patamar, elevador, lixo, ...)
 *   - Fazer sugestão     (melhorias, novas regras, ...)
 */

import * as comunicacoes from '../modules/comunicacoes.js';

let modalEl = null;
let onSuccessCallback = null;
let currentTenantId = null;

export async function open(opts) {
  if (!opts.tenantId) throw new Error('tenantId obrigatório.');
  currentTenantId = opts.tenantId;
  onSuccessCallback = opts.onSuccess || null;

  if (modalEl) modalEl.remove();
  modalEl = document.createElement('div');
  modalEl.className = 'modal-overlay';
  modalEl.innerHTML = `
    <div class="modal modal-md">
      <div class="modal-head">
        <h2>Fale com a Administração</h2>
        <button class="modal-close" id="ncc-close">×</button>
      </div>

      <div class="modal-body">
        <div class="field">
          <label>Tipo de comunicação</label>
          <div class="radio-group">
            <label class="radio-option">
              <input type="radio" name="tipo" value="problema" checked>
              <div class="radio-content">
                <div class="radio-title">⚠️ Reportar Problema</div>
                <div class="radio-sub">Algo não está a funcionar ou precisa de intervenção<br>(luz, elevador, infiltrações, ruído...)</div>
              </div>
            </label>
            <label class="radio-option">
              <input type="radio" name="tipo" value="sugestao">
              <div class="radio-content">
                <div class="radio-title">💡 Fazer Sugestão</div>
                <div class="radio-sub">Ideias de melhoria ou propostas<br>(novas regras, alterações, partilha de informação)</div>
              </div>
            </label>
          </div>
        </div>

        <div class="field">
          <label>Assunto</label>
          <input type="text" id="ncc-assunto" placeholder="ex: Luz do patamar 2.º andar avariada" maxlength="120">
        </div>

        <div class="field">
          <label>Descrição</label>
          <textarea id="ncc-mensagem" rows="6" placeholder="Descreve o problema ou sugestão em detalhe..."></textarea>
        </div>
      </div>

      <div class="modal-foot">
        <button class="btn ghost" id="ncc-cancel">Cancelar</button>
        <button class="btn primary" id="ncc-submit" disabled>Enviar à administração</button>
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
  modalEl.querySelector('#ncc-close').addEventListener('click', close);
  modalEl.querySelector('#ncc-cancel').addEventListener('click', close);
  modalEl.addEventListener('click', (e) => { if (e.target === modalEl) close(); });

  const checkSubmit = () => {
    const assunto = modalEl.querySelector('#ncc-assunto').value.trim();
    const msg = modalEl.querySelector('#ncc-mensagem').value.trim();
    modalEl.querySelector('#ncc-submit').disabled = !(assunto && msg);
  };
  modalEl.querySelector('#ncc-assunto').addEventListener('input', checkSubmit);
  modalEl.querySelector('#ncc-mensagem').addEventListener('input', checkSubmit);

  modalEl.querySelector('#ncc-submit').addEventListener('click', submit);
}

async function submit() {
  const tipo = modalEl.querySelector('input[name="tipo"]:checked').value;
  const assunto = modalEl.querySelector('#ncc-assunto').value.trim();
  const mensagem = modalEl.querySelector('#ncc-mensagem').value.trim();

  try {
    const c = await comunicacoes.criarPorCondomino({
      tenantId: currentTenantId,
      tipo, assunto, mensagem
    });
    close();
    alert(`Mensagem enviada à administração.\n\nReceberás resposta nesta mesma área.`);
    if (onSuccessCallback) onSuccessCallback(c);
  } catch (e) {
    alert('Erro: ' + e.message);
  }
}
