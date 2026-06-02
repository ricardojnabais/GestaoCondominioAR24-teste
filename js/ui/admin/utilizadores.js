/**
 * Página: Utilizadores · Admin
 *
 * Gestão de contas dos condóminos:
 *  - Ver quem tem conta (e quem não tem)
 *  - Criar conta
 *  - Repor / definir password
 *  - Desativar / reativar
 */

import * as utilizadores from '../../modules/utilizadores.js';
import * as auth from '../../auth/local-auth.js';
import * as router from '../router.js';
import { icon } from '../icons.js';

let containerRef = null;

export async function render(container) {
  containerRef = container;

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
              <div class="breadcrumb">Definições · Credenciais</div>
              <h1>Acessos ao Portal</h1>
            </div>
          </div>
        </div>

        <div class="info-card" style="margin-bottom:18px">
          <p style="margin:0;font-size:13px;color:var(--text-muted)">
            Cada condómino tem 1 conta · login com email + password.
            Password inicial = <strong>NIF</strong>.
            Condóminos sem email não podem ter conta — adiciona o email primeiro.
          </p>
        </div>

        <details style="margin-bottom:14px;background:#faf8f2;border:1px solid #e3dcc6;border-radius:10px;padding:8px 14px">
          <summary style="cursor:pointer;font-size:12px;font-weight:600;color:#1a2740">🔐 Manutenção · segurança das passwords</summary>
          <p style="margin:8px 0 4px 0;font-size:12px;color:var(--text)">
            Versões anteriores guardavam passwords em texto plano. A partir desta versão, todas as novas passwords são guardadas como hash PBKDF2. Usa este botão para migrar passwords antigas existentes (operação idempotente).
          </p>
          <button class="btn ghost" id="btn-migrar-pwd" style="font-size:12px">Migrar passwords antigas para hash</button>
          <div id="migrar-pwd-log" style="margin-top:8px;font-family:'JetBrains Mono',monospace;font-size:11px;color:#6b5524;display:none"></div>
        </details>

        <div id="lista"></div>
      </main>
    </div>
  `;

  await renderList();

  container.querySelector('#brand').addEventListener('click', () => router.navigate('admin/home'));
  container.querySelector('#back-home').addEventListener('click', () => router.navigate('admin/home'));
  container.querySelector('#hamburger').addEventListener('click', () => router.navigate('admin/home'));

  // Migração em massa de passwords legacy para hash
  container.querySelector('#btn-migrar-pwd').addEventListener('click', async () => {
    if (!confirm('Migrar todas as passwords em texto plano para hash PBKDF2?\n\nA operação é segura e idempotente · contas já protegidas são saltadas.\n\nContinuar?')) return;

    const btn = container.querySelector('#btn-migrar-pwd');
    const log = container.querySelector('#migrar-pwd-log');
    btn.disabled = true;
    btn.textContent = 'A migrar…';
    log.style.display = '';
    log.textContent = '';

    try {
      const res = await utilizadores.migrarPasswordsParaHash((p) => {
        log.textContent = `${p.hashed + p.skipped}/${p.total} · ${p.current} · ${p.status}`;
      });
      log.innerHTML = `✓ Concluído · <strong>${res.hashed}</strong> migradas, <strong>${res.skipped}</strong> já protegidas (total ${res.total})`;
      btn.textContent = 'Migrar passwords antigas para hash';
      btn.disabled = false;
    } catch (e) {
      log.innerHTML = `✗ Erro: ${e.message}`;
      btn.textContent = 'Migrar passwords antigas para hash';
      btn.disabled = false;
    }
  });
}

async function renderList() {
  const lista = await utilizadores.listarUtilizadores();
  const html = lista.map(buildRow).join('');

  containerRef.querySelector('#lista').innerHTML = `
    <div class="users-list">${html}</div>
  `;

  containerRef.querySelectorAll('[data-action]').forEach(el => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      handleAction(el.dataset.action, el.dataset.id);
    });
  });
}

function buildRow({ tenant, user }) {
  const hasAccount = !!user;
  const isDisabled = user?.disabled;
  const semEmail = !tenant.email?.trim();
  const precisaReset = user?.passwordPrecisaReset;

  const status = !hasAccount
    ? (semEmail ? 'no-email' : 'sem-conta')
    : isDisabled
      ? 'desativada'
      : precisaReset
        ? 'pwd-reset'
        : 'ativa';

  const statusLabels = {
    'no-email': '⚠ Sem email',
    'sem-conta': '○ Sem conta',
    'desativada': '✕ Desativada',
    'pwd-reset': '⚠ Password = NIF',
    'ativa': '✓ Ativa'
  };
  const statusCls = `user-status user-status-${status}`;

  const lastLogin = user?.lastLogin
    ? formatDate(new Date(user.lastLogin).toISOString().slice(0, 10))
    : '—';

  let actions = '';
  if (!hasAccount && !semEmail) {
    actions = `<button class="btn primary" data-action="criar" data-id="${tenant.id}">Criar conta</button>`;
  } else if (hasAccount) {
    actions = `
      <button class="btn" data-action="repor" data-id="${user.id}">Repor password</button>
      <button class="btn" data-action="definir" data-id="${user.id}">Definir password</button>
      ${isDisabled
        ? `<button class="btn" data-action="reativar" data-id="${user.id}">Reativar</button>`
        : `<button class="btn danger" data-action="desativar" data-id="${user.id}">Desativar</button>`}
      <button class="btn danger" data-action="apagar" data-id="${user.id}" title="Apagar conta definitivamente (irreversível)">Apagar</button>
    `;
  }

  return `
    <div class="user-item">
      <div class="user-info">
        <div class="user-line1">
          <strong>${tenant.fraction}</strong>
          <span class="user-name">${tenant.name}</span>
          <span class="${statusCls}">${statusLabels[status]}</span>
        </div>
        <div class="user-line2">
          <span class="user-email">${tenant.email || '— sem email —'}</span>
          ${hasAccount ? `<span class="dot-sep">·</span><span>Último login: ${lastLogin}</span>` : ''}
        </div>
      </div>
      <div class="user-actions">
        ${actions}
      </div>
    </div>
  `;
}

async function handleAction(action, id) {
  const session = auth.getSession();
  const operatorName = session?.operatorName;

  try {
    if (action === 'criar') {
      if (!confirm(`Criar conta para este condómino?\nPassword inicial = NIF do condómino.`)) return;
      const u = await utilizadores.criarConta(id, operatorName);
      alert(`Conta criada.\nEmail: ${u.email}\nPassword inicial: ${u.password} (= NIF)\n\nPede ao condómino para mudar a password no primeiro login.`);
    } else if (action === 'repor') {
      if (!confirm('Repor password ao valor inicial (NIF)?')) return;
      const u = await utilizadores.reporPassword(id, operatorName);
      alert(`Password reposta.\nNova password: ${u.password} (= NIF)\n\nO condómino vai ser obrigado a mudar no próximo login.`);
    } else if (action === 'definir') {
      const novaPwd = prompt('Nova password (mínimo 4 caracteres):');
      if (!novaPwd) return;
      await utilizadores.definirPassword(id, novaPwd, operatorName);
      alert(`Password definida.\n\nNova password: ${novaPwd}\n\nInforma o condómino.`);
    } else if (action === 'desativar') {
      if (!confirm('Desativar esta conta? O condómino deixa de poder fazer login.')) return;
      await utilizadores.desativar(id, operatorName);
    } else if (action === 'reativar') {
      await utilizadores.reactivar(id);
    } else if (action === 'apagar') {
      // Confirmação dupla por ser destrutivo e irreversível
      const u = await utilizadores.listarUtilizadores();
      const alvo = u.find(x => x.user?.id === id);
      const nome = alvo?.tenant?.name || 'este condómino';
      const email = alvo?.user?.email || '—';
      if (!confirm(`APAGAR DEFINITIVAMENTE a conta de:\n\n  ${nome}\n  ${email}\n\nA conta será removida do servidor. Para voltar a permitir o acesso, terás de a criar de novo.\n\nIRREVERSÍVEL. Continuar?`)) return;
      const info = await utilizadores.apagarConta(id, operatorName);
      alert(`Conta apagada.\n\n  ${info.tenantName}\n  ${info.email}\n\nO condómino pode agora ser recriado com email corrigido.`);
    }
    renderList();
  } catch (e) {
    alert('⚠️ Operação falhou\n\n' + e.message);
    console.error('[utilizadores]', e);
  }
}

function formatDate(iso) {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}
