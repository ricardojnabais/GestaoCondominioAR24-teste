/**
 * Portal do Condómino · Os Meus Dados
 *
 * Visualização dos dados pessoais (read-only para campos definidos pela admin)
 * + edição do telefone de contacto (campo opcional)
 * + alteração da própria password
 */

import * as auth from '../../auth/local-auth.js';
import * as store from '../../store/local-store.js';
import * as router from '../router.js';
import { icon } from '../icons.js';

let containerRef = null;

export async function render(container) {
  containerRef = container;
  const session = auth.getSession();
  const tenantId = session?.tenantId;
  if (!tenantId) {
    container.innerHTML = '<div class="placeholder"><p>Sessão inválida.</p></div>';
    return;
  }
  await renderBody(tenantId);
}

async function renderBody(tenantId) {
  const tenant = await store.getDoc('tenants', tenantId);
  containerRef.innerHTML = `
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
              <div class="breadcrumb">Conta Pessoal</div>
              <h1>Os Meus Dados</h1>
            </div>
          </div>
        </div>

        <!-- Dados read-only -->
        <div class="settings-card" style="margin-bottom:14px">
          <p class="orc-help">Dados definidos pela administração do condomínio. Para alterações contacta a administração.</p>
          <div class="info-row"><span class="info-lbl">Nome</span><span class="info-val">${escapeHtml(tenant.name || '')}</span></div>
          <div class="info-row"><span class="info-lbl">Email</span><span class="info-val">${escapeHtml(tenant.email || '—')}</span></div>
          <div class="info-row"><span class="info-lbl">NIF</span><span class="info-val">${escapeHtml(tenant.nif || '—')}</span></div>
          <div class="info-row"><span class="info-lbl">Fração</span><span class="info-val">${escapeHtml(tenant.fraction || '—')}</span></div>
          <div class="info-row"><span class="info-lbl">Permilagem</span><span class="info-val">${tenant.permilage || 0}‰</span></div>
        </div>

        <!-- Telefone editável -->
        <div class="settings-card" style="margin-bottom:14px">
          <h3 style="font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--primary);margin:0 0 10px 0">Telefone de Contacto</h3>
          <p class="orc-help">Opcional · usado apenas pela administração em caso de necessidade de contacto direto.</p>
          <div class="field">
            <label>Telefone</label>
            <input type="tel" id="d-telefone" value="${escapeAttr(tenant.telefone || '')}" maxlength="20" placeholder="ex: 912 345 678">
          </div>
          <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:8px">
            <button class="btn primary" id="btn-save-telefone">Guardar Telefone</button>
          </div>
          <div id="msg-telefone"></div>
        </div>

        <!-- Alterar Password -->
        <div class="settings-card">
          <h3 style="font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--primary);margin:0 0 10px 0">Alterar Password</h3>
          <p class="orc-help">A password é usada para entrar no portal. Mantém-na em segredo.</p>
          <div class="field">
            <label>Password Atual</label>
            <input type="password" id="d-pwd-old" autocomplete="current-password">
          </div>
          <div class="field-row">
            <div class="field">
              <label>Nova Password</label>
              <input type="password" id="d-pwd-new" autocomplete="new-password" minlength="6">
            </div>
            <div class="field">
              <label>Confirmar Nova Password</label>
              <input type="password" id="d-pwd-new2" autocomplete="new-password" minlength="6">
            </div>
          </div>
          <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:8px">
            <button class="btn primary" id="btn-save-pwd">Alterar Password</button>
          </div>
          <div id="msg-pwd"></div>
        </div>
      </main>
    </div>
  `;

  containerRef.querySelector('#brand').addEventListener('click', () => router.navigate('condomino/home'));
  containerRef.querySelector('#back-home').addEventListener('click', () => router.navigate('condomino/home'));

  containerRef.querySelector('#btn-save-telefone').addEventListener('click', () => saveTelefone(tenantId));
  containerRef.querySelector('#btn-save-pwd').addEventListener('click', () => savePassword(tenantId));
}

async function saveTelefone(tenantId) {
  const valor = containerRef.querySelector('#d-telefone').value.trim();
  // Validação simples: só dígitos, espaços, +, -, ()
  if (valor && !/^[\d\s+\-()]{4,20}$/.test(valor)) {
    showMsg('#msg-telefone', 'Formato de telefone inválido.', 'error');
    return;
  }
  const tenant = await store.getDoc('tenants', tenantId);
  const mudou = valor !== (tenant.telefone || '');
  tenant.telefone = valor;
  if (mudou) {
    tenant.telefoneAtualizadoEm = Date.now();
  }
  await store.setDoc('tenants', tenant);
  showMsg('#msg-telefone', '✓ Telefone guardado.', 'ok');
}

async function savePassword(tenantId) {
  const oldPwd = containerRef.querySelector('#d-pwd-old').value;
  const newPwd = containerRef.querySelector('#d-pwd-new').value;
  const newPwd2 = containerRef.querySelector('#d-pwd-new2').value;

  if (!oldPwd) {
    showMsg('#msg-pwd', 'Indica a password atual.', 'error');
    return;
  }
  if (newPwd.length < 6) {
    showMsg('#msg-pwd', 'A nova password tem que ter pelo menos 6 caracteres.', 'error');
    return;
  }
  if (newPwd !== newPwd2) {
    showMsg('#msg-pwd', 'A confirmação não coincide com a nova password.', 'error');
    return;
  }
  if (newPwd === oldPwd) {
    showMsg('#msg-pwd', 'A nova password é igual à actual.', 'error');
    return;
  }

  try {
    await auth.changeOwnPassword(oldPwd, newPwd);
    showMsg('#msg-pwd', '✓ Password alterada com sucesso.', 'ok');
    containerRef.querySelector('#d-pwd-old').value = '';
    containerRef.querySelector('#d-pwd-new').value = '';
    containerRef.querySelector('#d-pwd-new2').value = '';
  } catch (e) {
    showMsg('#msg-pwd', e.message || 'Erro ao alterar password.', 'error');
  }
}

function showMsg(selector, text, kind) {
  const el = containerRef.querySelector(selector);
  el.className = `save-msg save-msg-${kind}`;
  el.textContent = text;
  setTimeout(() => { el.textContent = ''; el.className = ''; }, 4000);
}

function escapeAttr(s) { return (s || '').replace(/"/g, '&quot;'); }
function escapeHtml(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
