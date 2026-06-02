/**
 * Rúbricas · categorias de despesa do condomínio.
 *
 * Modelo:
 *   id, nome, categoria, fixa,
 *   criadaEm (timestamp), criadaPor (operador),
 *   terminadaEm (timestamp | null), terminadaPor (operador | null)
 *
 * Regra: nunca se APAGA uma rúbrica. Quando deixa de ser usada,
 * "termina-se" (terminadaEm = Date.now()). Despesas históricas mantêm-se
 * associadas. Listagens em modais novos mostram apenas rúbricas ATIVAS.
 * Filtros em relatórios mostram TODAS (com indicador visual).
 */

import * as store from '../store/local-store.js';

/**
 * Lista todas as rúbricas.
 * @param {Object} [filters] - { ativasApenas: bool }
 */
export async function listar(filters = {}) {
  let all = await store.listDocs('rubricas');
  if (filters.ativasApenas) {
    all = all.filter(r => !r.terminadaEm);
  }
  all.sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));
  return all;
}

/**
 * Cria uma nova rúbrica.
 * @param {Object} data - { nome, categoria?, fixa? }
 * @param {string} operatorName - quem está a criar
 */
export async function criar(data, operatorName) {
  if (!data.nome || !data.nome.trim()) {
    throw new Error('Indica um nome para a rúbrica.');
  }
  const nome = data.nome.trim();

  // Verificar duplicados (case-insensitive)
  const existing = await store.listDocs('rubricas');
  if (existing.some(r => r.nome.toLowerCase() === nome.toLowerCase())) {
    throw new Error(`Já existe uma rúbrica "${nome}".`);
  }

  const doc = {
    nome,
    categoria: data.categoria || 'diversos',
    fixa: !!data.fixa,
    criadaEm: Date.now(),
    criadaPor: operatorName || null,
    terminadaEm: null,
    terminadaPor: null
  };
  return await store.setDoc('rubricas', doc);
}

/**
 * Termina uma rúbrica (não apaga). Despesas históricas continuam associadas.
 * Não permitir terminar se tiver despesas no ano corrente.
 */
export async function terminar(rubricaId, operatorName) {
  const r = await store.getDoc('rubricas', rubricaId);
  if (!r) throw new Error('Rúbrica não encontrada.');
  if (r.terminadaEm) throw new Error('Rúbrica já estava terminada.');

  // Validar que não há despesas em curso (mês corrente do ano)
  const anoActual = new Date().getFullYear().toString();
  const despesasAno = await store.queryDocs('pagamentosDespesa', { ano: anoActual });
  const usoRecente = despesasAno.filter(d =>
    d.rubricaId === rubricaId &&
    !d.cancelada &&
    (Date.now() - new Date(d.data).getTime() < 60 * 24 * 60 * 60 * 1000)  // últimos 60 dias
  );
  if (usoRecente.length > 0) {
    throw new Error(
      `Esta rúbrica tem ${usoRecente.length} despesa(s) registada(s) nos últimos 60 dias. ` +
      `Confirma que deixa mesmo de ser usada antes de terminar.`
    );
  }

  r.terminadaEm = Date.now();
  r.terminadaPor = operatorName || null;
  return await store.setDoc('rubricas', r);
}

/**
 * Reativa uma rúbrica terminada.
 */
export async function reactivar(rubricaId) {
  const r = await store.getDoc('rubricas', rubricaId);
  if (!r) throw new Error('Rúbrica não encontrada.');
  r.terminadaEm = null;
  r.terminadaPor = null;
  return await store.setDoc('rubricas', r);
}

/**
 * Devolve as rúbricas ativas (atalho).
 */
export async function ativas() {
  return listar({ ativasApenas: true });
}
