/**
 * Despesas · CRUD com lógica de estorno (idêntico ao receipts).
 *
 * Cada despesa é UM documento. Quando se "cancela", cria-se um documento
 * de estorno com valor negativo e a despesa original fica marcada
 * como `cancelada = true`. Nunca se apaga.
 *
 * Numeração: as despesas não têm número sequencial obrigatório (não há
 * documento legal). O id Firestore é suficiente.
 */

import * as store from '../store/local-store.js';
import { todayISO } from '../utils/format.js';

/**
 * Regista uma nova despesa.
 *
 * @param {Object} data
 * @param {string} data.rubricaId - obrigatório
 * @param {number} data.valor_centimos - obrigatório, > 0 (será negativizado para saldo)
 * @param {string} [data.data] - data ISO (default: hoje)
 * @param {string} [data.descricao] - texto livre
 * @param {string} [data.fornecedor] - quem recebeu
 * @param {string} [data.metodoPagamento] - 'transferencia' | 'debito' | 'mb' | 'cheque' | 'outro'
 * @param {string} operatorName - quem regista (para audit)
 */
export async function registar(data, operatorName) {
  // Validações
  if (!data.rubricaId) throw new Error('Falta a rúbrica.');
  if (!data.valor_centimos || data.valor_centimos <= 0) throw new Error('Valor inválido.');

  const rubrica = await store.getDoc('rubricas', data.rubricaId);
  if (!rubrica) throw new Error('Rúbrica não encontrada.');

  const dataDespesa = data.data || todayISO();
  const ano = dataDespesa.split('-')[0];

  const doc = {
    rubricaId: data.rubricaId,
    rubricaNome: rubrica.nome,
    ano,
    data: dataDespesa,
    valor_centimos: data.valor_centimos,
    descricao: data.descricao || rubrica.nome,
    fornecedor: data.fornecedor || rubrica.nome,
    metodoPagamento: data.metodoPagamento || 'transferencia',
    cancelada: false,
    estornoDe: null,
    registadoPor: operatorName || null,
    createdAt: Date.now()
  };

  return await store.setDoc('pagamentosDespesa', doc);
}

/**
 * Cancela uma despesa (cria estorno · NÃO apaga).
 * O estorno aparece como valor NEGATIVO da despesa (= entrada no saldo).
 */
export async function cancelar(despesaId, motivo, operatorName) {
  const original = await store.getDoc('pagamentosDespesa', despesaId);
  if (!original) throw new Error('Despesa não encontrada.');
  if (original.cancelada) throw new Error('Despesa já cancelada.');
  if (original.estornoDe) throw new Error('Não é possível cancelar um estorno.');

  // Marcar original
  original.cancelada = true;
  original.canceladaEm = Date.now();
  original.canceladaPor = operatorName || null;
  original.motivoCancelamento = motivo || 'Cancelada pelo administrador';
  await store.setDoc('pagamentosDespesa', original);

  // Criar registo de estorno
  const estorno = {
    rubricaId: original.rubricaId,
    rubricaNome: original.rubricaNome,
    ano: original.ano,
    data: todayISO(),
    valor_centimos: -original.valor_centimos,  // negativo = entrada no saldo
    descricao: `Estorno: ${original.descricao}. ${motivo || ''}`.trim(),
    fornecedor: original.fornecedor,
    metodoPagamento: original.metodoPagamento,
    cancelada: false,
    estornoDe: despesaId,
    registadoPor: operatorName || null,
    createdAt: Date.now()
  };
  return await store.setDoc('pagamentosDespesa', estorno);
}

/**
 * Lista despesas com filtros opcionais.
 */
export async function listar(filters = {}) {
  let all = await store.listDocs('pagamentosDespesa');

  if (filters.ano) all = all.filter(d => d.ano === filters.ano);
  if (filters.rubricaId) all = all.filter(d => d.rubricaId === filters.rubricaId);

  // Ordenar por data desc
  all.sort((a, b) => (b.data || '').localeCompare(a.data || ''));
  return all;
}

/**
 * Total gasto por ano (entradas - estornos).
 */
export async function totalAno(ano) {
  const all = await listar({ ano });
  return all.reduce((s, d) => s + (d.valor_centimos || 0), 0);
}

/**
 * Total gasto por ano agrupado por rúbrica.
 * @returns {Object} - { rubricaId: { nome, total } }
 */
export async function totalPorRubrica(ano) {
  const all = await listar({ ano });
  const agg = {};
  for (const d of all) {
    if (d.cancelada) continue;
    if (!agg[d.rubricaId]) agg[d.rubricaId] = { nome: d.rubricaNome, total: 0 };
    agg[d.rubricaId].total += d.valor_centimos;
  }
  return agg;
}
