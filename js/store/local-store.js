/**
 * Store · facade que escolhe o backend em runtime.
 *
 * Backends:
 *   - 'local' (default) · localStorage via local-store-impl.js
 *   - 'firestore'       · Cloud Firestore via firestore-store.js
 *
 * Para alternar:
 *   localStorage.setItem('ar24_storage_backend', 'firestore'); location.reload();
 *
 * 60+ ficheiros importam de 'local-store.js' · este facade preserva a API
 * sem que mais nada precise mudar.
 */

import * as localImpl from './local-store-impl.js';
import { firebaseReady } from './firebase-config.js';

const BACKEND_KEY = 'ar24_storage_backend';

// Aguardar inicialização do Firebase (garante window.__firebase pronto)
await firebaseReady;

// Decidir backend:
//  1. Override explícito no localStorage (debug/fallback)
//  2. Senão, se Firebase configurado → Firestore (default em produção)
//  3. Senão → localStorage
const override = (typeof localStorage !== 'undefined' && localStorage.getItem(BACKEND_KEY)) || null;
const firebaseConfigurado = !!(typeof window !== 'undefined' && window.__firebase?.db);
const backend = override || (firebaseConfigurado ? 'firestore' : 'local');

let activeStore = localImpl;

if (backend === 'firestore') {
  try {
    const firestoreStore = await import('./firestore-store.js');
    await firestoreStore.bootstrap();
    activeStore = firestoreStore;
    console.log('[Store] Backend ativo: Firestore' + (override ? ' (override)' : ' (auto · Firebase configurado)'));
  } catch (e) {
    console.error('[Store] Firestore falhou · fallback para localStorage:', e);
  }
} else {
  console.log('[Store] Backend ativo: localStorage');
}

// Re-export · API idêntica para os 60+ ficheiros
export const listDocs = (...a) => activeStore.listDocs(...a);
export const getDoc = (...a) => activeStore.getDoc(...a);
export const setDoc = (...a) => activeStore.setDoc(...a);
export const deleteDoc = (...a) => activeStore.deleteDoc(...a);
export const queryDocs = (...a) => activeStore.queryDocs(...a);
export const onSnapshot = (...a) => activeStore.onSnapshot(...a);
export const exportAll = (...a) => activeStore.exportAll(...a);
export const importAll = (...a) => activeStore.importAll(...a);
export const importarSnapshot = (...a) =>
  activeStore.importarSnapshot ? activeStore.importarSnapshot(...a) : activeStore.importAll(...a);
export const clearAll = (...a) => activeStore.clearAll(...a);

// verifyDocOnServer · só existe em Firestore (no localStorage retorna true sempre,
// porque a "verificação no servidor" não se aplica)
export const verifyDocOnServer = async (col, id) => {
  if (typeof activeStore.verifyDocOnServer === 'function') {
    return activeStore.verifyDocOnServer(col, id);
  }
  return true; // localStorage · operação sempre confirmada localmente
};

// Utilitários do selector
export function getBackend() { return backend; }
export function setBackend(name) {
  if (!['local', 'firestore'].includes(name)) throw new Error("Backend inválido (use 'local' ou 'firestore')");
  localStorage.setItem(BACKEND_KEY, name);
  return name;
}

if (typeof window !== 'undefined') {
  window.__store = {
    listDocs, getDoc, setDoc, deleteDoc, queryDocs, exportAll, importAll, importarSnapshot, clearAll,
    getBackend, setBackend
  };
}
