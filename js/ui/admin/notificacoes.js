/**
 * Página Admin · Configuração de Notificações Push · v1.0.17
 */
import * as store from '../../store/local-store.js';
import * as router from '../router.js';
import * as push from '../../modules/push.js';
import { icon } from '../icons.js';
import { formatDate } from '../../utils/format.js';

let containerRef = null;

export async function render(container) {
  containerRef = container;
  const config = (await store.getDoc('meta', 'config')) || {};
  const p = config.push || {};

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
              <div class="breadcrumb">Definições</div>
              <h1>Notificações Push</h1>
            </div>
          </div>
        </div>

        <div class="orc-card" style="margin-bottom:16px">
          <h3 style="margin-top:0">Configuração Backend</h3>
          <p class="orc-help">Endereço da função Vercel + chave de API admin. Necessário para envio de notificações.</p>

          <div class="field">
            <label>URL da Vercel Function</label>
            <input type="text" id="n-url" value="${escapeAttr(p.apiUrl || '')}" placeholder="https://ar24-push.vercel.app">
            <div class="hint">URL principal do projeto Vercel · sem barra final</div>
          </div>

          <div class="field">
            <label>Admin API Key</label>
            <input type="password" id="n-key" value="${escapeAttr(p.adminApiKey || '')}" placeholder="cadeia secreta · deve coincidir com ADMIN_API_KEY na Vercel">
            <div class="hint">Esta chave é enviada no header das chamadas de envio</div>
          </div>

          <div class="field">
            <label>VAPID Public Key (opcional · se preenchida, evita 1 fetch)</label>
            <input type="text" id="n-vapid" value="${escapeAttr(p.vapidPublic || '')}" placeholder="BIxxxxxx...">
          </div>

          <div style="display:flex;gap:8px;margin-top:14px">
            <button class="btn primary" id="n-save">Guardar</button>
            <button class="btn ghost" id="n-test">Testar (envia notif. a este device)</button>
          </div>
          <div id="n-msg" style="margin-top:10px"></div>
        </div>

        <div class="orc-card">
          <h3 style="margin-top:0">Subscrições registadas</h3>
          <div id="n-list">Carregando…</div>
        </div>
      </main>
    </div>
  `;

  container.querySelector('#brand').addEventListener('click', () => router.navigate('admin/home'));
  container.querySelector('#back-home').addEventListener('click', () => router.navigate('admin/home'));
  container.querySelector('#hamburger').addEventListener('click', () => router.navigate('admin/home'));

  container.querySelector('#n-save').addEventListener('click', salvar);
  container.querySelector('#n-test').addEventListener('click', testar);

  await listarInscritos();
}

async function salvar() {
  const apiUrl = containerRef.querySelector('#n-url').value.trim().replace(/\/$/, '');
  const adminApiKey = containerRef.querySelector('#n-key').value.trim();
  const vapidPublic = containerRef.querySelector('#n-vapid').value.trim();

  const config = (await store.getDoc('meta', 'config')) || { id: 'config' };
  config.push = { apiUrl, adminApiKey, vapidPublic };
  await store.setDoc('meta', config);

  msg('✓ Configuração guardada.', 'ok');
  await listarInscritos();
}

async function testar() {
  try {
    msg('A subscrever este device…', 'info');
    const session = window.__auth?.getSession?.();
    const tenantId = 'admin-' + (session?.operatorName || 'unknown').replace(/\s/g, '');
    const r = await push.subscrever({ tenantId, tenantName: session?.operatorName || 'Admin', deviceLabel: 'Admin teste' });
    if (!r.ok) { msg('✗ ' + r.error, 'error'); return; }

    msg('A enviar notificação de teste…', 'info');
    const res = await push.notificar({
      title: 'Teste · Condomínio AR24',
      body: 'Se vês isto, push notifications estão a funcionar! 🎉',
      destinatarios: [tenantId]
    });
    msg(`✓ Enviadas ${res.enviados}, falhadas ${res.falhados}.`, 'ok');
    await listarInscritos();
  } catch (e) {
    msg('✗ ' + e.message, 'error');
  }
}

async function listarInscritos() {
  const el = containerRef.querySelector('#n-list');
  try {
    const subs = await push.listarSubscriptions();
    if (subs.length === 0) {
      el.innerHTML = '<div class="placeholder"><p>Sem subscrições registadas. Os condóminos têm de ativar nas suas apps.</p></div>';
      return;
    }
    // Agrupar por tenantId
    const porTenant = {};
    subs.forEach(s => {
      if (!porTenant[s.tenantId]) porTenant[s.tenantId] = [];
      porTenant[s.tenantId].push(s);
    });
    el.innerHTML = `
      <table class="table-clean" style="width:100%">
        <thead><tr><th>Condómino</th><th>Devices</th><th>Última atividade</th></tr></thead>
        <tbody>
          ${Object.entries(porTenant).map(([tid, lista]) => `
            <tr>
              <td><strong>${escapeAttr(lista[0].tenantName || tid)}</strong></td>
              <td>${lista.map(s => `<span class="chip-sm">${escapeAttr(s.deviceLabel)}</span>`).join(' ')}</td>
              <td>${formatDate(new Date(Math.max(...lista.map(s => s.lastSeenAt))).toISOString().slice(0,10))}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  } catch (e) {
    el.innerHTML = `<div class="placeholder"><p>Erro: ${escapeAttr(e.message)}</p></div>`;
  }
}

function msg(text, kind) {
  const el = containerRef.querySelector('#n-msg');
  const cls = kind === 'ok' ? 'save-msg-success' : kind === 'error' ? 'save-msg-error' : '';
  el.innerHTML = `<div class="save-msg ${cls}">${escapeAttr(text)}</div>`;
}

function escapeAttr(s) {
  if (s == null) return '';
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
