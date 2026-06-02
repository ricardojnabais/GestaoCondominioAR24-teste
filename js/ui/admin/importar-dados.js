/**
 * Página: Importar Dados · Admin
 *
 * Carrega um snapshot JSON, valida estrutura, mostra preview,
 * e permite importar (substitui tudo o que está no localStorage).
 *
 * Há 2 fontes:
 *  (a) Ficheiro local (input file)
 *  (b) Snapshot pré-validado em data/seed-historico.json (botão "Carregar Histórico AR24")
 */

import * as store from '../../store/local-store.js';
import * as router from '../router.js';
import { icon } from '../icons.js';
import * as auditoria from '../../modules/auditoria-recibos.js';
import * as forcar2026 from '../../modules/forcar-dados-2026.js';

let containerRef = null;
let snapshotPendente = null;

export async function render(container) {
  containerRef = container;
  snapshotPendente = null;

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
              <div class="breadcrumb">Definições · Manutenção</div>
              <h1>Importar Dados</h1>
            </div>
          </div>
        </div>

        <div class="settings-card" style="margin-bottom:14px">
          <h3 style="margin:0 0 8px 0;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--primary)">Cópia de segurança (backup)</h3>
          <p style="margin:0;font-size:13px;color:var(--text)">
            Guarda uma cópia completa dos dados (lida do servidor). No telemóvel, aparece o menu de partilha — escolhe o <strong>Google Drive</strong> ou <strong>Ficheiros</strong> para guardar.
          </p>
          <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">
            <button class="btn primary" id="btn-export-backup">↓ Fazer backup</button>
          </div>
        </div>

        <div class="settings-card" style="margin-bottom:14px">
          <h3 style="margin:0 0 8px 0;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--primary)">Restaurar de um backup</h3>
          <p style="margin:0 0 10px 0;font-size:13px;color:var(--text-muted)">
            Só para recuperação. Importar um ficheiro <strong>substitui TODOS os dados atuais</strong>. Faz um backup antes.
          </p>
          <input type="file" id="file-input" accept=".json,application/json" style="display:none">
          <button class="btn ghost" id="btn-pick-file">Escolher ficheiro de backup…</button>
          <span id="file-name" style="margin-left:8px;font-size:12px;color:var(--text-muted)"></span>
        </div>

        <div id="preview-area"></div>

        <div id="msg-area"></div>

        <div class="settings-card" style="margin-top:24px;border-color:#2d8659">
          <h3 style="margin:0 0 8px 0;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#2d8659">Auditoria · Exportação Anual</h3>
          <p style="margin:0 0 12px 0;font-size:13px;color:var(--text)">
            Exporta os recibos do ano selecionado em formato de auditoria (Excel com 4 folhas: Recibos · Resumo Mensal · Por Condómino · Condóminos).
          </p>
          <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
            <label style="font-size:13px;color:var(--text)">Ano:</label>
            <select id="audit-ano" style="padding:6px 10px;border:1.5px solid var(--border);border-radius:6px;font-family:inherit;font-size:13px"></select>
            <button class="btn primary" id="btn-export-auditoria">📊 Exportar Excel Auditoria</button>
          </div>
          <div id="aud-export-log" style="margin-top:10px;font-family:'JetBrains Mono',monospace;font-size:11px;color:#2d8659;display:none"></div>
        </div>
      </main>
    </div>
  `;

  containerRef.querySelector('#brand').addEventListener('click', () => router.navigate('admin/definicoes'));
  containerRef.querySelector('#back-home').addEventListener('click', () => router.navigate('admin/home'));

  containerRef.querySelector('#btn-export-backup').addEventListener('click', exportBackup);
  containerRef.querySelector('#btn-pick-file').addEventListener('click', () => {
    containerRef.querySelector('#file-input').click();
  });
  containerRef.querySelector('#file-input').addEventListener('change', onFilePicked);

  // Auditoria · selector de ano (anos com recibos, >= 2026)
  await popularAnosAuditoria();
  containerRef.querySelector('#btn-export-auditoria').addEventListener('click', exportAuditoriaClick);
}

async function forcar2026Click() {
  const btn = containerRef.querySelector('#btn-forcar-2026');
  const logEl = containerRef.querySelector('#forcar-log');
  if (!confirm('Forçar dados de 2026?\n\n• Recibos → apaga TODOS os "H0xx" e repõe os 64 canónicos (RCB 001–064), próximo = 65\n• Quotas → 2.351,00 € (matriz exacta, sem duplicação)\n• Despesas → repõe histórico Jan–Mai (7.147,44 €) + 3 pagamentos recentes (493,53 €)\n• Saldo → inicial 7.521,78 € @ 27/05 · saldo real 7.028,25 €\n• Recibos antigos (< 01/06) deixam de exportar\n\nIdempotente. Continuar?')) return;

  btn.disabled = true;
  const txtOriginal = btn.textContent;
  btn.textContent = 'A forçar…';
  logEl.style.display = 'block';
  logEl.textContent = '';
  const log = (m) => { logEl.textContent += m + '\n'; logEl.scrollTop = logEl.scrollHeight; };

  try {
    const resumo = await forcar2026.forcarTudo({ log });
    log('');
    log(`RESUMO · recibos canónicos ${resumo.recibosCanonicos} (apagados ${resumo.recibosApagados}) · quotas ${eur(resumo.quotasRecebidas_centimos)} · saldo real ${eur(resumo.saldoReal_centimos)}`);
    log('Recarrega Quotas, Recibos, Análise e Banco para ver os valores.');
  } catch (e) {
    log('ERRO: ' + e.message);
    console.error(e);
  } finally {
    btn.disabled = false;
    btn.textContent = txtOriginal;
  }
}

function eur(c) { return ((c || 0) / 100).toFixed(2).replace('.', ',') + ' €'; }

async function popularAnosAuditoria() {
  const sel = containerRef.querySelector('#audit-ano');
  if (!sel) return;
  // Buscar anos com recibos · só >= 2026 (anos anteriores são históricos não auditáveis)
  const recibos = await store.listDocs('receipts');
  const anos = [...new Set(recibos.map(r => r.ano).filter(a => typeof a === 'number' && a >= 2026))].sort((a, b) => b - a);
  // Garantir que o ano atual está sempre presente
  const anoAtual = new Date().getFullYear();
  if (anoAtual >= 2026 && !anos.includes(anoAtual)) anos.unshift(anoAtual);
  if (anos.length === 0) anos.push(2026);
  sel.innerHTML = anos.map(a => `<option value="${a}">${a}</option>`).join('');
}

// ─────────────── AUDITORIA ───────────────

function logAud(text) {
  const el = containerRef.querySelector('#aud-log');
  el.style.display = '';
  el.textContent += text + '\n';
  el.scrollTop = el.scrollHeight;
}

async function actualizarEstadoAuditoria() {
  const el = containerRef.querySelector('#aud-estado');
  if (!el) return;
  try {
    const r = await auditoria.compararComDataset();
    let msg = `📋 Dataset canónico: ${r.totalCanonico} recibos · Atualmente em Firestore: ${r.totalAtual}`;
    if (r.totalAtual === r.totalCanonico && r.divergem === 0 && r.apenasAtual === 0) {
      msg = `✓ ${msg} · alinhado`;
      el.style.color = '#2d8659';
    } else {
      const detalhes = [];
      if (r.apenasAtual > 0) detalhes.push(`${r.apenasAtual} extra atual`);
      if (r.apenasDataset > 0) detalhes.push(`${r.apenasDataset} em falta`);
      if (r.divergem > 0) detalhes.push(`${r.divergem} divergem`);
      msg = `⚠ ${msg} · ${detalhes.join(', ')}`;
      el.style.color = '#c0392b';
    }
    el.innerHTML = msg;
  } catch (e) {
    el.textContent = '⚠ Erro: ' + e.message;
    el.style.color = '#c0392b';
  }
}

async function exportAuditoriaClick() {
  const btn = containerRef.querySelector('#btn-export-auditoria');
  const sel = containerRef.querySelector('#audit-ano');
  const ano = parseInt(sel.value, 10);
  const logEl = containerRef.querySelector('#aud-export-log');
  btn.disabled = true; btn.textContent = 'A gerar…';
  logEl.style.display = '';
  logEl.textContent = `A exportar recibos de ${ano}…`;
  try {
    const filename = await auditoria.exportarAuditoria(ano);
    logEl.textContent = `✓ Exportado: ${filename}`;
  } catch (e) {
    logEl.style.color = '#c0392b';
    logEl.textContent = `✗ ${e.message}`;
    alert('Erro a exportar: ' + e.message);
  } finally {
    btn.disabled = false; btn.textContent = '📊 Exportar Excel Auditoria';
  }
}

async function compararAuditoriaClick() {
  const btn = containerRef.querySelector('#btn-comparar-audit');
  btn.disabled = true; btn.textContent = 'A comparar…';
  try {
    const r = await auditoria.compararComDataset();
    logAud(`── Comparação ──`);
    logAud(`Dataset canónico: ${r.totalCanonico} recibos`);
    logAud(`Atual em Firestore: ${r.totalAtual} recibos`);
    logAud(`Iguais: ${r.iguais}`);
    logAud(`Divergem: ${r.divergem}`);
    logAud(`Só no atual (extra): ${r.apenasAtual}`);
    logAud(`Só no canónico (em falta): ${r.apenasDataset}`);
    if (r.divergem > 0) {
      logAud(`\nDivergências (primeiras ${r.divergemDetalhe.length}):`);
      for (const d of r.divergemDetalhe) {
        logAud(`  ${d.recibo}: ${JSON.stringify(d.diffs)}`);
      }
    }
    if (r.totalAtual === r.totalCanonico && r.divergem === 0 && r.apenasAtual === 0) {
      logAud('\n✓ ESTADO ALINHADO · não é preciso fazer nada');
    } else {
      logAud('\n⚠ DESALINHADO · usa "Alinhar recibos 2026 com dataset" para corrigir');
    }
    await actualizarEstadoAuditoria();
  } catch (e) {
    logAud(`✗ Erro: ${e.message}`);
  } finally {
    btn.disabled = false; btn.textContent = '🔍 Comparar com dataset';
  }
}

async function alinharAuditoriaClick() {
  const r1 = await auditoria.compararComDataset();
  const aviso = `⚠ ALINHAMENTO DESTRUTIVO\n\n` +
    `Dataset canónico: ${r1.totalCanonico} recibos\n` +
    `Atualmente em Firestore: ${r1.totalAtual} recibos\n\n` +
    `O sistema vai:\n` +
    `  • Apagar ${r1.apenasAtual} recibo(s) que não estão no dataset\n` +
    `  • Sobrescrever ${r1.totalCanonico} com a versão canónica\n` +
    `  • Manter os recibos de anos anteriores intactos\n\n` +
    `IRREVERSÍVEL. Faz backup antes se quiseres ponto de retorno.\n\n` +
    `Continuar?`;
  if (!confirm(aviso)) return;
  if (!confirm('Confirmas? Esta operação NÃO pode ser desfeita.')) return;

  const btn = containerRef.querySelector('#btn-alinhar-audit');
  btn.disabled = true; btn.textContent = 'A alinhar…';
  const logEl = containerRef.querySelector('#aud-log');
  logEl.style.display = '';
  logEl.textContent = '── Alinhamento ──\n';

  try {
    const stats = await auditoria.alinharRecibos2026((p) => {
      if (p.stage === 'loading') logAud(p.detail);
      else if (p.stage === 'reading') logAud(p.detail);
      else if (p.stage === 'cleaning') logEl.textContent = logEl.textContent.replace(/\nApagados: \d+.*\n?$/, '') + `\nApagados: ${p.current}/${p.total} · ${p.detail || ''}`;
      else if (p.stage === 'writing') logEl.textContent = logEl.textContent.replace(/\nEscritos: \d+.*\n?$/, '') + `\nEscritos: ${p.current}/${p.total} · ${p.detail || ''}`;
      else if (p.stage === 'done') logAud('\n' + p.detail);
    });
    logAud(`\n── Resultado ──`);
    logAud(`Lidos do dataset: ${stats.lidos}`);
    logAud(`Apagados (extra): ${stats.apagados}`);
    logAud(`Escritos: ${stats.escritos}`);
    if (stats.erros.length > 0) {
      logAud(`\n⚠ Erros: ${stats.erros.length}`);
      for (const e of stats.erros.slice(0, 10)) logAud(`  ${e}`);
    } else {
      logAud('\n✓ ALINHAMENTO COMPLETO · sem erros');
    }
    await actualizarEstadoAuditoria();
  } catch (e) {
    logAud(`\n✗ FALHA: ${e.message}`);
    alert('Alinhamento falhou: ' + e.message);
  } finally {
    btn.disabled = false; btn.textContent = '⚠ Alinhar recibos 2026 com dataset';
  }
}

async function actualizarEstadoMigracao() {
  const elEstado = containerRef.querySelector('#migrar-estado');
  const btnMigrar = containerRef.querySelector('#btn-migrar');
  const btnVoltar = containerRef.querySelector('#btn-voltar-local');
  if (!elEstado) return;

  const backend = localStorage.getItem('ar24_storage_backend') || 'local';
  const firebaseOk = !!window.__firebase?.db;

  let msg = '';
  if (backend === 'firestore') {
    msg = '☁ Backend ativo: <strong>Firestore (cloud)</strong>. Pode voltar a localStorage abaixo.';
    btnMigrar.style.display = 'none';
    btnVoltar.style.display = '';
  } else if (!firebaseOk) {
    msg = '⚠ Firebase não está inicializado. Preenche <code>firebase-config.js</code> antes de migrar.';
    btnMigrar.disabled = true;
  } else {
    msg = `🗄 Backend ativo: <strong>localStorage</strong>. Migração disponível.`;
  }
  elEstado.innerHTML = msg;
}

async function backupOnlyClick() {
  try {
    const { backupLocal } = await import('../../modules/migrar-firestore.js');
    const meta = await backupLocal();
    logMigracao(`✓ Backup descarregado · ${Object.values(meta.coleccoes).reduce((s,n)=>s+n,0)} docs totais`);
  } catch (e) {
    logMigracao(`✗ Erro: ${e.message}`);
  }
}

async function migrarClick() {
  if (!confirm('Iniciar migração para Firestore?\n\n1. Será criado um backup automático em JSON descarregado.\n2. Todos os dados do localStorage serão escritos no Firestore.\n3. O backend muda para Firestore e a app recarrega.\n\nContinuar?')) return;

  const log = containerRef.querySelector('#migrar-log');
  log.style.display = '';
  log.textContent = '';

  const btnMigrar = containerRef.querySelector('#btn-migrar');
  btnMigrar.disabled = true;
  btnMigrar.textContent = 'A migrar…';

  try {
    const { migrar, activarBackendFirestore } = await import('../../modules/migrar-firestore.js');
    const resultado = await migrar((p) => {
      logMigracao(`[${p.etapa}] ${p.msg}`);
    });

    logMigracao('');
    logMigracao('─── Resultado ───');
    logMigracao(`Backup: ${resultado.backupMeta.dataExport}`);
    logMigracao(`Total escritos: ${resultado.totalEscritos}`);
    logMigracao('');
    logMigracao('Coleção · Local · Firestore');
    for (const [col, n] of Object.entries(resultado.contagemLocal)) {
      const f = resultado.contagemFirestore[col];
      const ok = n === f ? '✓' : (f === -1 ? '⚠' : '✗');
      logMigracao(`  ${ok} ${col.padEnd(22)} ${String(n).padStart(4)} → ${String(f).padStart(4)}`);
    }

    if (!resultado.ok) {
      logMigracao('');
      logMigracao(`⚠ ${resultado.inconsistencias.length} inconsistências encontradas. Verifica a tabela.`);
      logMigracao('Recomendação: NÃO mudar de backend ainda. Investigar as colecções acima.');
      btnMigrar.disabled = false;
      btnMigrar.textContent = '☁ Migrar para Firestore';
      return;
    }

    logMigracao('');
    logMigracao('✓ Migração validada. A activar Firestore como backend em 3s…');
    setTimeout(activarBackendFirestore, 3000);
  } catch (e) {
    logMigracao(`✗ ERRO: ${e.message}`);
    console.error('Migração:', e);
    btnMigrar.disabled = false;
    btnMigrar.textContent = '☁ Migrar para Firestore';
  }
}

async function voltarLocalClick() {
  if (!confirm('Voltar a usar localStorage?\n\nOs dados em Firestore não são apagados. O backend volta a ler apenas do localStorage do device.\n\nNota: os dados no localStorage podem estar desatualizados se foram escritos em Firestore por outros devices.\n\nContinuar?')) return;
  const { voltarBackendLocal } = await import('../../modules/migrar-firestore.js');
  voltarBackendLocal();
}

function logMigracao(linha) {
  const log = containerRef.querySelector('#migrar-log');
  if (!log) return;
  log.textContent += (log.textContent ? '\n' : '') + linha;
  log.scrollTop = log.scrollHeight;
}

async function exportBackup() {
  try {
    const dump = await store.exportAll();
    const totalDocs = Object.values(dump).reduce((s, v) => s + (Array.isArray(v) ? v.length : 0), 0);
    if (totalDocs === 0) throw new Error('backup vazio — verifica que estás ligado ao Firestore.');
    const json = JSON.stringify(dump, null, 2);
    const filename = `backup-AR24-${new Date().toISOString().slice(0, 10)}.json`;

    // No telemóvel: abrir o menu de partilha para guardar direto no Drive/Ficheiros.
    try {
      const file = new File([json], filename, { type: 'application/json' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: 'Backup AR24' });
        showMsg(`✓ Backup pronto · ${totalDocs} documentos. Escolhe o Google Drive no menu de partilha.`, 'ok');
        return;
      }
    } catch (err) {
      if (err && err.name === 'AbortError') { showMsg('Partilha cancelada.', 'error'); return; }
      // qualquer outro erro de partilha → cai no descarregamento normal
    }

    // Computador (ou se a partilha não estiver disponível): descarregar ficheiro.
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    showMsg(`✓ Backup exportado · ${totalDocs} documentos.`, 'ok');
  } catch (e) {
    showMsg('Erro ao exportar: ' + e.message, 'error');
  }
}

async function carregarHistoricoAR24() {
  // DESATIVADO (v1.0.42) por segurança. Importar o seed-historico reintroduziria
  // os 86 recibos "H" (que duplicam as quotas de 2026), dados pré-2026 (que vivem
  // no Google Drive do condomínio) e 71 movimentos BPI antigos que alterariam o saldo.
  // Função mantida apenas como referência; não importa nada.
  showMsg('Carregar Histórico está desativado por segurança. O histórico anterior a 2026 está no Google Drive do condomínio — reimportá-lo aqui voltaria a duplicar as quotas de 2026 e a alterar o saldo.', 'error');
}

function onFilePicked(e) {
  const file = e.target.files[0];
  if (!file) return;
  containerRef.querySelector('#file-name').textContent = file.name;
  const reader = new FileReader();
  reader.onload = ev => {
    try {
      const json = JSON.parse(ev.target.result);
      snapshotPendente = json;
      renderPreview(json, file.name);
    } catch (err) {
      showMsg('JSON inválido: ' + err.message, 'error');
    }
  };
  reader.readAsText(file);
}

function renderPreview(snapshot, fonteLabel) {
  const area = containerRef.querySelector('#preview-area');
  // Tentar 2 estruturas: snapshot estruturado OU dump bruto
  const isEstruturado = snapshot.tenants && Array.isArray(snapshot.tenants);
  let resumo;
  if (isEstruturado) {
    resumo = {
      tenants: (snapshot.tenants || []).length,
      rubricas: (snapshot.rubricas || []).length,
      recibos: (snapshot.receipts || []).length,
      despesas: (snapshot.pagamentosDespesa || []).length,
      planos: (snapshot.planos || []).length,
      prestacoes: (snapshot.prestacoes || []).length,
      orcamentos: (snapshot.orcamentos || []).length,
      outrosRecebimentos: (snapshot.outrosRecebimentos || []).length,
      comunicacoes: (snapshot.comunicacoes || []).length,
    };
  } else {
    // Dump bruto (formato exportAll)
    resumo = Object.fromEntries(
      Object.entries(snapshot).map(([k, v]) => [k, Array.isArray(v) ? v.length : 1])
    );
  }
  const info = snapshot.__importInfo
    ? `<p style="margin:0 0 10px 0;font-size:12px;color:var(--text-muted)">
         Gerado: ${snapshot.__importInfo.geradoEm || '—'} ·
         Período: ${snapshot.__importInfo.periodo || '—'}
       </p>`
    : '';

  area.innerHTML = `
    <div class="settings-card" style="border-color:var(--amber)">
      <h3 style="margin:0 0 6px 0;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--primary)">Pré-visualização · ${escapeHtml(fonteLabel)}</h3>
      ${info}
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:8px;margin-bottom:12px">
        ${Object.entries(resumo).map(([k, v]) => `
          <div style="background:var(--blue-50);padding:8px 10px;border-radius:6px">
            <div style="font-size:10px;text-transform:uppercase;color:var(--text-muted);font-weight:600">${escapeHtml(k)}</div>
            <div style="font-size:18px;font-weight:700;color:var(--primary)">${v}</div>
          </div>
        `).join('')}
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end">
        <button class="btn ghost" id="btn-cancel">Cancelar</button>
        <button class="btn primary btn-danger" id="btn-confirm">⚠ Apagar Tudo e Importar</button>
      </div>
    </div>
  `;

  area.querySelector('#btn-cancel').addEventListener('click', () => {
    snapshotPendente = null;
    area.innerHTML = '';
  });
  area.querySelector('#btn-confirm').addEventListener('click', confirmarImportacao);
}

async function confirmarImportacao() {
  if (!snapshotPendente) return;
  if (!confirm('Última confirmação: vais APAGAR TUDO o que está atualmente na app e substituir pelo snapshot. Continuar?')) {
    return;
  }
  try {
    const isEstruturado = snapshotPendente.tenants && Array.isArray(snapshotPendente.tenants);
    if (isEstruturado) {
      const res = store.importarSnapshot(snapshotPendente);
      showMsg(`✓ Importação concluída. ${Object.entries(res.contagens).map(([k,v]) => `${k}: ${v}`).join(' · ')}`, 'ok');
    } else {
      store.importAll(snapshotPendente);
      showMsg('✓ Importação concluída.', 'ok');
    }
    setTimeout(() => {
      location.reload();
    }, 1500);
  } catch (e) {
    showMsg('Erro: ' + e.message, 'error');
  }
}

function showMsg(text, kind) {
  const el = containerRef.querySelector('#msg-area');
  el.innerHTML = `<div class="save-msg save-msg-${kind}" style="margin-top:12px;padding:10px 14px;border-radius:8px;font-size:13px">${escapeHtml(text)}</div>`;
}

function escapeHtml(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
