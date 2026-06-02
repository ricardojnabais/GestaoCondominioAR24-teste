/**
 * Migração de localStorage → Firestore
 *
 * Workflow:
 *   1. Backup do localStorage em JSON descarregado
 *   2. Conexão Firestore (lazy import)
 *   3. Para cada colecção · batch write (max 400 por batch)
 *   4. Validação · contagem por colecção
 *   5. Switch backend para 'firestore' em localStorage
 *   6. Caller faz reload
 */

import * as localImpl from '../store/local-store-impl.js';

const COLLECTIONS = [
  'meta', 'tenants', 'users', 'receipts', 'pagamentosDespesa', 'rubricas',
  'planos', 'prestacoes', 'outrosRecebimentos', 'movimentosBPI',
  'comunicacoes', 'orcamentos'
];

/**
 * Conta documentos no localStorage por colecção.
 */
export async function contagemLocal() {
  const out = {};
  for (const col of COLLECTIONS) {
    const items = await localImpl.listDocs(col);
    out[col] = items.length;
  }
  return out;
}

/**
 * Conta documentos no Firestore por colecção · usa getDocs (sem subscrição).
 */
export async function contagemFirestore() {
  if (!window.__firebase?.db) throw new Error('Firebase não disponível');
  const { collection, getDocs } = window.__firebase.firestoreFns;
  const db = window.__firebase.db;
  const out = {};
  for (const col of COLLECTIONS) {
    try {
      const snap = await getDocs(collection(db, col));
      out[col] = snap.size;
    } catch (e) {
      out[col] = -1; // erro
    }
  }
  return out;
}

/**
 * Gera backup JSON do localStorage e força download no browser.
 */
export async function backupLocal() {
  const snapshot = {};
  for (const col of COLLECTIONS) {
    snapshot[col] = await localImpl.listDocs(col);
  }
  const meta = {
    versao: 'pre-migracao-firestore',
    dataExport: new Date().toISOString(),
    coleccoes: Object.fromEntries(Object.entries(snapshot).map(([k,v]) => [k, v.length]))
  };
  const blob = new Blob([JSON.stringify({ meta, snapshot }, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `ar24-backup-pre-firestore-${new Date().toISOString().slice(0,10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return meta;
}

/**
 * Executa a migração completa.
 * @param {function} onProgress - callback({msg, etapa, ...})
 * @returns {object} - { ok, contagemLocal, contagemFirestore, totalEscritos }
 */
export async function migrar(onProgress = () => {}) {
  if (!window.__firebase?.db) {
    throw new Error('Firebase não está inicializado · confere firebase-config.js');
  }
  const { collection, doc, writeBatch } = window.__firebase.firestoreFns;
  const db = window.__firebase.db;

  // 1. Backup
  onProgress({ msg: 'A criar backup do localStorage…', etapa: 1 });
  const backupMeta = await backupLocal();

  // 2. Contagem inicial
  onProgress({ msg: 'A contar documentos locais…', etapa: 2 });
  const cLocal = await contagemLocal();
  const total = Object.values(cLocal).reduce((s, n) => s + n, 0);

  // 3. Migrar coleção a coleção
  let totalEscritos = 0;
  for (const col of COLLECTIONS) {
    const items = await localImpl.listDocs(col);
    if (items.length === 0) continue;

    onProgress({
      msg: `A escrever ${items.length} docs em "${col}"…`,
      etapa: 3,
      col,
      progresso: totalEscritos,
      total
    });

    // Batch · max 400 ops por batch (limite Firestore 500, margem)
    for (let i = 0; i < items.length; i += 400) {
      const chunk = items.slice(i, i + 400);
      const batch = writeBatch(db);
      for (const item of chunk) {
        const id = item.id || `${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
        const { id: _omit, ...payload } = item;
        batch.set(doc(db, col, id), payload, { merge: false });
      }
      await batch.commit();
      totalEscritos += chunk.length;
    }
  }

  // 4. Validação · esperar 2s pelo backend, depois contar
  onProgress({ msg: 'A validar contagem em Firestore…', etapa: 4 });
  await new Promise(r => setTimeout(r, 2000));
  const cFire = await contagemFirestore();

  // 5. Verificar consistência
  const inconsistencias = [];
  for (const col of COLLECTIONS) {
    if (cLocal[col] !== cFire[col]) {
      inconsistencias.push({ col, local: cLocal[col], firestore: cFire[col] });
    }
  }

  return {
    ok: inconsistencias.length === 0,
    backupMeta,
    contagemLocal: cLocal,
    contagemFirestore: cFire,
    inconsistencias,
    totalEscritos
  };
}

/**
 * Activa Firestore como backend e força reload.
 */
export function activarBackendFirestore() {
  localStorage.setItem('ar24_storage_backend', 'firestore');
  setTimeout(() => location.reload(), 300);
}

/**
 * Voltar a localStorage.
 */
export function voltarBackendLocal() {
  localStorage.setItem('ar24_storage_backend', 'local');
  setTimeout(() => location.reload(), 300);
}

if (typeof window !== 'undefined') {
  window.__migrar = { migrar, backupLocal, contagemLocal, contagemFirestore, activarBackendFirestore, voltarBackendLocal };
}
