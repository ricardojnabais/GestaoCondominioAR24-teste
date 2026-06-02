/**
 * Página de Login · admin (Google Sign-In + operator) e condómino (email/password)
 */

import * as auth from '../auth/local-auth.js';
import * as firebaseAuth from '../auth/firebase-auth.js';
import * as store from '../store/local-store.js';
import * as router from './router.js';
import { icon } from './icons.js';
import { APP_VERSION } from '../version.js';

export async function render(container) {
  const meta = await store.getDoc('meta', 'config');
  const adminNames = meta?.administracao?.nomes || ['Ricardo Nabais Cordeiro', 'Filipe Solha'];
  const firebaseReady = firebaseAuth.isFirebaseAvailable();

  // Se voltámos de signInWithRedirect, processar resultado
  if (firebaseReady) {
    try {
      const redirectUser = await firebaseAuth.checkRedirectResult();
      if (redirectUser) {
        // Já validado · abrir selector de operador
        return openOperatorPicker(container, redirectUser, adminNames);
      }
    } catch (e) { console.warn('redirect result:', e); }
  }

  container.innerHTML = `
    <div class="login">
      <div class="login-card">
        <div class="login-mark">${icon('logo-full', 'login-mark-svg')}</div>
        <div class="login-sub">Av. Amália Rodrigues, 24 · Amadora</div>
        <div class="login-title">Gestão do Condomínio</div>
        <div class="login-desc">Escolhe como queres entrar</div>

        <div class="login-tabs">
          <button class="login-tab active" data-tab="admin">
            ${icon('ic-settings', 'lt-icon')}
            <span>Administrador</span>
          </button>
          <button class="login-tab" data-tab="condomino">
            ${icon('ic-home', 'lt-icon')}
            <span>Condómino</span>
          </button>
        </div>

        <div id="login-admin-form">
          ${firebaseReady ? `
            <p class="login-method-info">
              Entrar com a conta Google da administração
            </p>
            <button class="btn-google" id="btn-google-signin">
              <svg width="18" height="18" viewBox="0 0 18 18" style="margin-right:8px;vertical-align:middle">
                <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"/>
                <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"/>
                <path fill="#FBBC05" d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"/>
                <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"/>
              </svg>
              Entrar com Google
            </button>
            <p class="login-hint" style="margin-top:10px;font-size:11px;color:var(--text-muted);text-align:center">
              Apenas contas autorizadas têm acesso
            </p>
          ` : `
            <p class="login-method-info">
              Firebase não configurado · seleciona operador (modo local)
            </p>
            <div class="field">
              <label>Operador</label>
              <select id="admin-operator">
                ${adminNames.map(n => `<option value="${n}">${n}</option>`).join('')}
              </select>
            </div>
            <button class="btn-google" id="btn-login-admin-legacy">Entrar como Administrador</button>
          `}
        </div>

        <div id="login-condomino-form" style="display:none">
          <p class="login-method-info">Entrada com email e password</p>
          <div class="field">
            <label>Email</label>
            <input type="email" id="cond-email" placeholder="o.teu.email@exemplo.pt" autocomplete="email">
          </div>
          <div class="field">
            <label>Password</label>
            <input type="password" id="cond-password" placeholder="••••••••" autocomplete="current-password">
          </div>
          <button class="btn-google" id="btn-login-condomino">Entrar</button>
          <button class="login-link" id="link-forgot">Esqueci-me da password</button>
        </div>

        <div id="login-error" style="margin-top:12px;color:var(--red);font-size:13px;text-align:center;display:none"></div>

        <div class="login-foot">Av. Amália Rodrigues 24 · 10 frações<br><span style="opacity:.6;font-size:11px">${APP_VERSION}</span></div>
      </div>
    </div>
  `;

  // Tab switching
  container.querySelectorAll('.login-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const mode = tab.dataset.tab;
      container.querySelectorAll('.login-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      container.querySelector('#login-admin-form').style.display = mode === 'admin' ? 'block' : 'none';
      container.querySelector('#login-condomino-form').style.display = mode === 'condomino' ? 'block' : 'none';
      clearError();
    });
  });

  // Admin login · Google
  const btnGoogle = container.querySelector('#btn-google-signin');
  if (btnGoogle) {
    btnGoogle.addEventListener('click', async () => {
      clearError();
      btnGoogle.disabled = true;
      btnGoogle.textContent = 'A abrir Google…';
      try {
        const user = await firebaseAuth.signInAdmin();
        if (user) openOperatorPicker(container, user, adminNames);
        // se for null (redirect), a página vai recarregar e processa em checkRedirectResult
      } catch (e) {
        showError(e.message);
        btnGoogle.disabled = false;
        btnGoogle.textContent = 'Entrar com Google';
      }
    });
  }

  // Admin login · legacy (sem Firebase)
  const btnLegacy = container.querySelector('#btn-login-admin-legacy');
  if (btnLegacy) {
    btnLegacy.addEventListener('click', async () => {
      clearError();
      const op = container.querySelector('#admin-operator').value;
      try {
        await auth.loginAdmin(op);
        router.navigate('admin/home');
      } catch (e) {
        showError(e.message);
      }
    });
  }

  // Condómino login
  container.querySelector('#btn-login-condomino').addEventListener('click', async () => {
    clearError();
    const email = container.querySelector('#cond-email').value;
    const password = container.querySelector('#cond-password').value;
    try {
      await auth.loginCondomino(email, password);
      router.navigate('condomino/home');
    } catch (e) {
      showError(e.message);
    }
  });

  container.querySelector('#link-forgot').addEventListener('click', () => {
    alert('Pede ao administrador para fazer reset à tua password.');
  });

  function showError(msg) {
    const el = container.querySelector('#login-error');
    el.textContent = msg;
    el.style.display = 'block';
  }
  function clearError() {
    container.querySelector('#login-error').style.display = 'none';
  }
}

/**
 * Após Google Sign-In bem-sucedido · escolher quem está a usar.
 */
function openOperatorPicker(container, firebaseUser, adminNames) {
  container.innerHTML = `
    <div class="login">
      <div class="login-card">
        <div class="login-mark">${icon('logo-full', 'login-mark-svg')}</div>
        <div class="login-sub">Av. Amália Rodrigues, 24 · Amadora</div>
        <div class="login-title">Quem está a usar?</div>
        <div class="login-desc" style="text-align:center;margin-bottom:18px">
          Login Google · <strong>${firebaseUser.email}</strong>
        </div>

        <div class="operator-picker">
          ${adminNames.map(n => `
            <button class="op-btn" data-name="${escapeAttr(n)}">
              <div class="op-avatar">${initials(n)}</div>
              <div class="op-name">${escapeAttr(n)}</div>
            </button>
          `).join('')}
        </div>

        <button class="login-link" id="op-cancel" style="margin-top:18px">Cancelar · trocar de conta Google</button>
        <div id="login-error" style="margin-top:12px;color:var(--red);font-size:13px;text-align:center;display:none"></div>
      </div>
    </div>
  `;

  container.querySelectorAll('.op-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const operatorName = btn.dataset.name;
      try {
        await auth.loginAdmin({ firebaseUser, operatorName });
        const router = await import('./router.js');
        router.navigate('admin/home');
      } catch (e) {
        const el = container.querySelector('#login-error');
        el.textContent = e.message;
        el.style.display = 'block';
      }
    });
  });

  container.querySelector('#op-cancel').addEventListener('click', async () => {
    await firebaseAuth.signOutAdmin();
    render(container);
  });
}

function initials(name) {
  return name.split(/\s+/).slice(0, 2).map(p => p[0]?.toUpperCase() || '').join('');
}
function escapeAttr(s) {
  return String(s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
