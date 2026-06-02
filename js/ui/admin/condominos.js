/**
 * Página: Condóminos · Admin
 *
 * Gestão CRUD dos condóminos (tenants).
 * Separa-se de "Acessos ao Portal" (que gere credenciais).
 *
 * Lista: fração, nome, permilagem, NIF, quota atual, telefone, estado
 * Ações: Adicionar · Editar · Desativar/Reactivar · (Soft-delete)
 */

import * as store from '../../store/local-store.js';
import * as utilizadores from '../../modules/utilizadores.js';
import * as auth from '../../auth/local-auth.js';
import * as orcamento from '../../modules/orcamento.js';
import * as router from '../router.js';
import { icon } from '../icons.js';
import { formatMoney } from '../../utils/format.js';

let containerRef = null;
let state = { incluirInativos: false };

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
              <div class="breadcrumb">Definições · Gestão de Condóminos</div>
              <h1>Condóminos</h1>
            </div>
            <div style="margin-left:auto">
              <button class="btn primary" id="btn-add">+ Adicionar Condómino</button>
            </div>
          </div>
        </div>

        <div id="permilage-stats"></div>
        <div class="settings-card" style="margin-bottom:14px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
          <label style="display:flex;align-items:center;gap:8px;font-size:13px">
            <input type="checkbox" id="incluir-inativos" ${state.incluirInativos ? 'checked' : ''}>
            Mostrar condóminos inativos
          </label>
          <span style="font-size:12px;color:var(--text-muted)">Telefones com badge laranja foram atualizados pelo próprio condómino</span>
        </div>

        <div id="lista"></div>
      </main>
    </div>
  `;

  containerRef.querySelector('#brand').addEventListener('click', () => router.navigate('admin/definicoes'));
  containerRef.querySelector('#back-home').addEventListener('click', () => router.navigate('admin/home'));
  containerRef.querySelector('#btn-add').addEventListener('click', () => abrirModalNovo());
  containerRef.querySelector('#incluir-inativos').addEventListener('change', e => {
    state.incluirInativos = e.target.checked;
    renderLista();
  });

  await renderLista();
}

async function renderLista() {
  const listEl = containerRef.querySelector('#lista');
  const statsEl = containerRef.querySelector('#permilage-stats');
  const tenants = await store.listDocs('tenants');
  const filtered = tenants
    .filter(t => state.incluirInativos || !t.inativoEm)
    .sort((a, b) => (a.fraction || '').localeCompare(b.fraction || ''));

  const utilizadoresLista = await utilizadores.listarUtilizadores();
  const userByTenantId = Object.fromEntries(
    utilizadoresLista.filter(u => u.tenant).map(u => [u.tenant.id, u.user])
  );

  // Soma de permilagens (apenas ativos)
  const ativos = tenants.filter(t => !t.inativoEm);
  const somaPermilagem = ativos.reduce((s, t) => s + (t.permilage || 0), 0);
  const permilageStatusCls = somaPermilagem === 1000 ? 'banner-ok' : 'banner-amber';

  statsEl.innerHTML = `
    <div class="orc-banner ${permilageStatusCls}">
      <strong>${ativos.length} condóminos ativos · soma de permilagens: ${somaPermilagem}‰</strong>
      ${somaPermilagem !== 1000 ? `<span class="banner-meta">⚠ Deveria ser exatamente 1000‰</span>` : '<span class="banner-meta">✓ Total correto</span>'}
    </div>
  `;

  if (filtered.length === 0) {
    listEl.innerHTML = `<div class="placeholder"><p>Sem condóminos.</p></div>`;
    return;
  }

  listEl.innerHTML = `
    <div class="cond-cards">
      ${filtered.map(t => buildCondCard(t, userByTenantId[t.id])).join('')}
    </div>
  `;

  listEl.querySelectorAll('[data-action="edit"]').forEach(btn => {
    btn.addEventListener('click', () => abrirModalEditar(btn.dataset.id));
  });
  listEl.querySelectorAll('[data-action="toggle-ativo"]').forEach(btn => {
    btn.addEventListener('click', () => toggleAtivo(btn.dataset.id));
  });
}

function buildCondCard(t, user) {
  const ano = new Date().getFullYear().toString();
  const quota = t.rentByYear?.[ano] || 0;
  const cls = t.inativoEm ? 'cond-card cond-card-inativo' : 'cond-card';
  const userTag = user
    ? user.disabledAt
      ? '<span class="cc-tag tag-amber">Acesso desativado</span>'
      : '<span class="cc-tag tag-green">Acesso ativo</span>'
    : '<span class="cc-tag tag-muted">Sem acesso ao portal</span>';
  const adminTag = t.isAdmin ? '<span class="cc-tag tag-primary">Admin</span>' : '';
  const inativoTag = t.inativoEm ? '<span class="cc-tag tag-red">INATIVO</span>' : '';

  const telefone = t.telefone || '—';
  const telefoneEditedTag = t.telefoneAtualizadoEm && t.telefone
    ? `<span class="tel-edited-tag" title="Editado pelo próprio em ${new Date(t.telefoneAtualizadoEm).toLocaleString('pt-PT')}">●</span>`
    : '';

  return `
    <div class="${cls}">
      <div class="cc-head">
        <div class="cc-frac">${escapeHtml(t.fraction || '—')}</div>
        <div class="cc-tags">${adminTag} ${userTag} ${inativoTag}</div>
      </div>
      <div class="cc-name">${escapeHtml(t.name)}</div>
      <div class="cc-grid">
        <div><span class="cc-lbl">Permilagem</span><span class="cc-val">${t.permilage || 0}‰</span></div>
        <div><span class="cc-lbl">Quota ${ano}</span><span class="cc-val">${formatMoney(quota)}</span></div>
        <div><span class="cc-lbl">NIF</span><span class="cc-val">${escapeHtml(t.nif || '—')}</span></div>
        <div><span class="cc-lbl">Telefone ${telefoneEditedTag}</span><span class="cc-val">${escapeHtml(telefone)}</span></div>
        <div style="grid-column:1 / -1"><span class="cc-lbl">Email</span><span class="cc-val">${escapeHtml(t.email || '—')}</span></div>
      </div>
      <div class="cc-actions">
        <button class="btn ghost" data-action="edit" data-id="${t.id}">Editar</button>
        ${t.inativoEm
          ? `<button class="btn" data-action="toggle-ativo" data-id="${t.id}">Reactivar</button>`
          : `<button class="btn ghost btn-danger" data-action="toggle-ativo" data-id="${t.id}">Desativar</button>`}
      </div>
    </div>
  `;
}

// ───────────────────────── MODAL · NOVO/EDITAR ─────────────────────────

async function abrirModalNovo() {
  const t = {
    id: `cond_${String(Date.now()).slice(-6)}`,
    name: '',
    fraction: '',
    permilage: 0,
    nif: '',
    email: '',
    telefone: '',
    rentByYear: {},
    isAdmin: false,
    _novo: true
  };
  abrirModal(t);
}

async function abrirModalEditar(tenantId) {
  const t = await store.getDoc('tenants', tenantId);
  if (!t) return;
  abrirModal(t);
}

async function abrirModal(t) {
  const ano = new Date().getFullYear().toString();
  const anoSeg = String(parseInt(ano, 10) + 1);
  const quotaAno = t.rentByYear?.[ano] || 0;
  const quotaSeg = t.rentByYear?.[anoSeg] || 0;

  // Verificar se há orçamento aprovado para cada ano (que "trava" a edição)
  const orcAno = await orcamento.obterAtivo(ano);
  const orcSeg = await orcamento.obterAtivo(anoSeg);
  const quotaAnoTravada = orcAno?.estado === 'aprovado';
  const quotaSegTravada = orcSeg?.estado === 'aprovado';

  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal modal-wide">
      <div class="modal-head">
        <h3>${t._novo ? 'Novo Condómino' : 'Editar Condómino · ' + escapeHtml(t.fraction || '')}</h3>
        <button class="btn-close" id="cm-close">✕</button>
      </div>
      <div class="modal-body">
        <div class="field-row">
          <div class="field">
            <label>Nome *</label>
            <input type="text" id="f-name" value="${escapeAttr(t.name)}" maxlength="80">
          </div>
          <div class="field">
            <label>Fração *</label>
            <input type="text" id="f-fraction" value="${escapeAttr(t.fraction)}" maxlength="20" placeholder="ex: 2.º Esquerdo">
          </div>
        </div>
        <div class="field-row">
          <div class="field">
            <label>Permilagem *</label>
            <input type="number" id="f-permilage" value="${t.permilage || 0}" min="0" max="1000">
          </div>
          <div class="field">
            <label>NIF</label>
            <input type="text" id="f-nif" value="${escapeAttr(t.nif)}" maxlength="9">
          </div>
        </div>
        <div class="field-row">
          <div class="field">
            <label>Email</label>
            <input type="email" id="f-email" value="${escapeAttr(t.email)}" maxlength="80" placeholder="usado para login no portal">
          </div>
          <div class="field">
            <label>Telefone ${t.telefoneAtualizadoEm ? `<span class="tel-edited-tag" title="Editado pelo próprio">●</span>` : ''}</label>
            <input type="tel" id="f-telefone" value="${escapeAttr(t.telefone)}" maxlength="20">
            ${t.telefoneAtualizadoEm ? `<small style="display:block;font-size:11px;color:var(--text-muted);margin-top:3px">Atualizado pelo condómino em ${new Date(t.telefoneAtualizadoEm).toLocaleString('pt-PT')}</small>` : ''}
          </div>
        </div>

        <div class="field" style="margin-top:6px">
          <label style="display:flex;align-items:center;gap:8px;font-weight:600">
            <input type="checkbox" id="f-isAdmin" ${t.isAdmin ? 'checked' : ''}>
            Marcar como administrador (pode aceder ao painel admin)
          </label>
        </div>

        <hr style="margin:14px 0;border:none;border-top:1px solid var(--border)">

        <h4 style="margin:0 0 8px 0;font-size:12px;text-transform:uppercase;letter-spacing:.4px;color:var(--text-muted)">Quotas Mensais</h4>
        <div class="field-row">
          <div class="field">
            <label>Quota ${ano} ${quotaAnoTravada ? `<span class="tel-edited-tag" title="Definida pelo Orçamento ${ano} v${orcAno.versao}">🔒</span>` : ''}</label>
            <input type="text" id="f-quota-ano" value="${centavosToEur(quotaAno)}" ${quotaAnoTravada ? 'disabled' : ''}>
            ${quotaAnoTravada ? `<small style="display:block;font-size:11px;color:var(--text-muted);margin-top:3px">Definida pelo Orçamento ${ano} v${orcAno.versao}. Para alterar, cria nova versão do orçamento.</small>` : ''}
          </div>
          <div class="field">
            <label>Quota ${anoSeg} ${quotaSegTravada ? `<span class="tel-edited-tag" title="Definida pelo Orçamento ${anoSeg} v${orcSeg.versao}">🔒</span>` : ''}</label>
            <input type="text" id="f-quota-seg" value="${centavosToEur(quotaSeg)}" ${quotaSegTravada ? 'disabled' : ''}>
            ${quotaSegTravada ? `<small style="display:block;font-size:11px;color:var(--text-muted);margin-top:3px">Definida pelo Orçamento ${anoSeg} v${orcSeg.versao}.</small>` : ''}
          </div>
        </div>

        ${t._novo ? `
          <hr style="margin:14px 0;border:none;border-top:1px solid var(--border)">
          <div class="field">
            <label style="display:flex;align-items:center;gap:8px;font-weight:600">
              <input type="checkbox" id="f-criarUser" checked>
              Criar acesso ao portal (utilizador com password temporária)
            </label>
            <small style="display:block;font-size:11px;color:var(--text-muted);margin-top:4px">A password temporária será apresentada após gravar. Email obrigatório.</small>
          </div>
        ` : ''}

        <div id="cm-msg"></div>
      </div>
      <div class="modal-actions">
        <button class="btn ghost" id="cm-cancel">Cancelar</button>
        <button class="btn primary" id="cm-save">${t._novo ? 'Criar Condómino' : 'Guardar Alterações'}</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  const close = () => modal.remove();
  modal.querySelector('#cm-close').addEventListener('click', close);
  modal.querySelector('#cm-cancel').addEventListener('click', close);
  modal.addEventListener('click', e => { if (e.target === modal) close(); });

  modal.querySelector('#cm-save').addEventListener('click', async () => {
    const name = modal.querySelector('#f-name').value.trim();
    const fraction = modal.querySelector('#f-fraction').value.trim();
    const permilage = parseInt(modal.querySelector('#f-permilage').value, 10) || 0;
    const nif = modal.querySelector('#f-nif').value.trim();
    const email = modal.querySelector('#f-email').value.trim().toLowerCase();
    const telefone = modal.querySelector('#f-telefone').value.trim();
    const isAdmin = modal.querySelector('#f-isAdmin').checked;
    const criarUser = t._novo ? modal.querySelector('#f-criarUser').checked : false;

    if (!name || !fraction) {
      showModalMsg(modal, 'Nome e Fração são obrigatórios.', 'error');
      return;
    }
    if (permilage < 1 || permilage > 1000) {
      showModalMsg(modal, 'Permilagem deve estar entre 1 e 1000.', 'error');
      return;
    }
    if (nif && !/^\d{9}$/.test(nif)) {
      showModalMsg(modal, 'NIF inválido (9 dígitos).', 'error');
      return;
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      showModalMsg(modal, 'Email com formato inválido.', 'error');
      return;
    }
    if (criarUser && !email) {
      showModalMsg(modal, 'Email é obrigatório para criar acesso ao portal.', 'error');
      return;
    }

    // Detectar alteração manual do telefone pelo admin (limpa flag de "editado pelo próprio")
    const telefoneMudou = telefone !== (t.telefone || '');

    // Atualizar / criar tenant
    const novoTenant = {
      ...t,
      name, fraction, permilage, nif, email, telefone, isAdmin,
      rentByYear: { ...(t.rentByYear || {}) }
    };
    delete novoTenant._novo;

    if (!quotaAnoTravada) {
      const v = eurToCentavos(modal.querySelector('#f-quota-ano').value);
      if (v > 0) novoTenant.rentByYear[ano] = v;
    }
    if (!quotaSegTravada) {
      const v = eurToCentavos(modal.querySelector('#f-quota-seg').value);
      if (v > 0) novoTenant.rentByYear[anoSeg] = v;
    }

    // Se admin editou o telefone, limpar a flag (mas se NÃO mudou, manter)
    if (telefoneMudou) {
      delete novoTenant.telefoneAtualizadoEm;
    }

    try {
      await store.setDoc('tenants', novoTenant);

      // Criar utilizador se pedido
      let pwdTemp = null;
      if (criarUser) {
        pwdTemp = await utilizadores.criarConta(novoTenant.id, auth.getSession()?.operatorName);
      }

      close();
      if (pwdTemp) {
        alert(`Condómino criado.\n\nAcesso ao portal:\nEmail: ${email}\nPassword temporária: ${pwdTemp}\n\nComunica esta password ao condómino. Ele pode alterá-la em "Os Meus Dados" no portal.`);
      }
      await renderLista();
    } catch (err) {
      showModalMsg(modal, 'Erro: ' + err.message, 'error');
    }
  });
}

// ───────────────────────── DESATIVAR / REACTIVAR ─────────────────────────

async function toggleAtivo(tenantId) {
  const t = await store.getDoc('tenants', tenantId);
  if (!t) return;

  if (t.inativoEm) {
    // Reactivar
    if (!confirm(`Reactivar ${t.name} (${t.fraction})?`)) return;
    delete t.inativoEm;
    delete t.inativoPor;
    await store.setDoc('tenants', t);
    renderLista();
    return;
  }

  // Desativar
  const utilizadoresLista = await utilizadores.listarUtilizadores();
  const user = utilizadoresLista.find(u => u.tenant?.id === tenantId)?.user;

  let msg = `Desativar ${t.name} (${t.fraction})?\n\n` +
            `O condómino fica marcado como inativo:\n` +
            `• Deixa de aparecer nas listas e cobranças\n` +
            `• Recibos e histórico mantêm-se\n` +
            `• Pode ser reactivado a qualquer momento\n\n`;

  if (user && !user.disabledAt) {
    msg += `Também tem acesso ao portal ativo (${user.email}).\n`;
    msg += `Queres desativar também o acesso?\n`;
    msg += `[OK] Desativar tudo  ·  [Cancelar] Apenas o condómino`;
  }

  const confirmar = confirm(msg);
  if (confirmar === false && !user) return;  // utilizador cancelou simples

  t.inativoEm = Date.now();
  t.inativoPor = auth.getSession()?.operatorName || null;
  await store.setDoc('tenants', t);

  if (user && !user.disabledAt && confirmar) {
    await utilizadores.desativar(user.id, auth.getSession()?.operatorName);
  }
  renderLista();
}

// ───────────────────────── HELPERS ─────────────────────────

function showModalMsg(modal, text, kind) {
  const el = modal.querySelector('#cm-msg');
  el.className = `save-msg save-msg-${kind}`;
  el.textContent = text;
  setTimeout(() => { el.textContent = ''; el.className = ''; }, 4500);
}

function centavosToEur(c) {
  if (!c) return '0,00';
  return (c / 100).toFixed(2).replace('.', ',');
}
function eurToCentavos(s) {
  if (!s) return 0;
  const cleaned = String(s).replace(/\s/g, '').replace(/\./g, '').replace(',', '.');
  const n = parseFloat(cleaned);
  if (isNaN(n)) return 0;
  return Math.round(n * 100);
}
function escapeAttr(s) { return (s || '').replace(/"/g, '&quot;'); }
function escapeHtml(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
