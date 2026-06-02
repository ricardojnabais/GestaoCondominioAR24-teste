/**
 * LocalStore · camada de persistência baseada em localStorage.
 *
 * API desenhada para ser facilmente substituível por FirestoreStore
 * no momento da migração para produção. Cada coleção fica numa chave
 * separada do localStorage com prefixo "ar24:" para isolamento.
 *
 * Modelo de cada coleção: array de objetos com `id` único.
 *
 * NOTA IMPORTANTE: localStorage é SÍNCRONO no browser, mas a API aqui
 * é assíncrona (retorna Promises) deliberadamente — para que a migração
 * para Firestore (que é assíncrono) seja transparente.
 */

const PREFIX = 'ar24:';

// ─── helpers internos ─────────────────────────────────────────

function readCollection(name) {
  const raw = localStorage.getItem(PREFIX + name);
  if (!raw) return [];
  try { return JSON.parse(raw); }
  catch (e) {
    console.error(`[LocalStore] coleção "${name}" corrompida, a reinicializar.`, e);
    return [];
  }
}

function writeCollection(name, items) {
  localStorage.setItem(PREFIX + name, JSON.stringify(items));
  emitChange(name);
}

const listeners = new Map();  // collection name → Set of callbacks

function emitChange(name) {
  const callbacks = listeners.get(name);
  if (callbacks) callbacks.forEach(cb => {
    try { cb(); } catch (e) { console.error('[LocalStore] listener erro:', e); }
  });
}

// ─── API pública ──────────────────────────────────────────────

/**
 * Lê todos os documentos de uma coleção.
 * @param {string} collection - nome da coleção (ex: 'tenants', 'receipts')
 * @returns {Promise<Array>}
 */
export async function listDocs(collection) {
  return readCollection(collection);
}

/**
 * Lê um documento específico pelo id.
 * @param {string} collection
 * @param {string} id
 * @returns {Promise<Object|null>}
 */
export async function getDoc(collection, id) {
  const items = readCollection(collection);
  return items.find(d => d.id === id) || null;
}

/**
 * Cria ou atualiza um documento. Se `data.id` existir, faz update; senão, cria com novo id.
 * @param {string} collection
 * @param {Object} data
 * @returns {Promise<Object>} - o documento gravado (com id)
 */
export async function setDoc(collection, data) {
  const items = readCollection(collection);
  const doc = { ...data };
  if (!doc.id) doc.id = generateId();
  const idx = items.findIndex(d => d.id === doc.id);
  if (idx >= 0) items[idx] = doc;
  else items.push(doc);
  writeCollection(collection, items);
  return doc;
}

/**
 * Apaga um documento.
 * @param {string} collection
 * @param {string} id
 * @returns {Promise<boolean>} - true se apagou, false se não existia
 */
export async function deleteDoc(collection, id) {
  const items = readCollection(collection);
  const idx = items.findIndex(d => d.id === id);
  if (idx < 0) return false;
  items.splice(idx, 1);
  writeCollection(collection, items);
  return true;
}

/**
 * Procura documentos com filtros simples (campo === valor).
 * @param {string} collection
 * @param {Object} filters - { campo: valor, ... }
 * @returns {Promise<Array>}
 */
export async function queryDocs(collection, filters = {}) {
  const items = readCollection(collection);
  return items.filter(doc =>
    Object.entries(filters).every(([k, v]) => doc[k] === v)
  );
}

/**
 * Subscreve mudanças numa coleção. Análogo a Firestore onSnapshot.
 * @param {string} collection
 * @param {Function} callback - chamada quando coleção muda
 * @returns {Function} unsubscribe
 */
export function onSnapshot(collection, callback) {
  if (!listeners.has(collection)) listeners.set(collection, new Set());
  listeners.get(collection).add(callback);
  // Chamar logo com estado inicial
  callback(readCollection(collection));
  return () => listeners.get(collection).delete(callback);
}

/**
 * Gera id curto. Para localStorage usamos timestamp + random; suficiente.
 */
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

/**
 * Apaga todas as coleções (útil para testes — usar com cuidado).
 */
export function clearAll() {
  if (!confirm('Vais apagar TODOS os dados locais. Continuar?')) return;
  Object.keys(localStorage)
    .filter(k => k.startsWith(PREFIX))
    .forEach(k => localStorage.removeItem(k));
  location.reload();
}

/**
 * Exporta todas as coleções como JSON (backup local).
 */
export function exportAll() {
  const data = {};
  Object.keys(localStorage)
    .filter(k => k.startsWith(PREFIX))
    .forEach(k => {
      const name = k.replace(PREFIX, '');
      data[name] = readCollection(name);
    });
  return data;
}

/**
 * Importa coleções a partir de JSON.
 * @param {Object} data - { collection: [docs...] }
 */
export function importAll(data) {
  Object.entries(data).forEach(([name, items]) => {
    writeCollection(name, items);
  });
}

/**
 * Importa um SNAPSHOT estruturado (gerado pelo backup ou exportação).
 * Limpa as coleções afectadas e repõe com os dados do snapshot.
 *
 * @param {Object} snapshot - estrutura com chaves:
 *   - meta: objeto cujas chaves viram docs com id em meta/
 *   - tenants, rubricas, receipts, pagamentosDespesa, planos, prestacoes,
 *     orcamentos, outrosRecebimentos, comunicacoes: arrays de docs
 */
export function importarSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') {
    throw new Error('Snapshot inválido.');
  }
  const collectionsParaArray = [
    'tenants', 'rubricas', 'receipts', 'pagamentosDespesa',
    'planos', 'prestacoes', 'orcamentos', 'outrosRecebimentos', 'comunicacoes',
  ];

  // 1. Limpar coleções de dados
  collectionsParaArray.forEach(c => writeCollection(c, []));
  writeCollection('meta', []);

  // 2. Popular arrays
  collectionsParaArray.forEach(c => {
    const arr = snapshot[c];
    if (Array.isArray(arr) && arr.length > 0) {
      writeCollection(c, arr);
    }
  });

  // 3. Meta · cada chave do objeto vira um doc com id
  const meta = snapshot.meta;
  if (meta && typeof meta === 'object') {
    const metaDocs = Object.entries(meta).map(([key, value]) => {
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        return { id: key, ...value };
      }
      return { id: key, valor: value };
    });
    writeCollection('meta', metaDocs);
  }

  // 4. Emitir sinais de mudança para recarregar UI
  [...collectionsParaArray, 'meta'].forEach(c => emitChange(c));

  return {
    ok: true,
    contagens: collectionsParaArray.reduce((acc, c) => {
      acc[c] = (snapshot[c] || []).length;
      return acc;
    }, { meta: Object.keys(meta || {}).length }),
  };
}

// Expor para debugging em consola (não usar em código de produção)
if (typeof window !== 'undefined') {
  window.__store = { listDocs, getDoc, setDoc, deleteDoc, clearAll, exportAll, importAll, importarSnapshot };
}
