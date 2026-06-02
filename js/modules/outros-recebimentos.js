/**
 * Outros Recebimentos · receitas que não são quotas nem prestações.
 *
 * Exemplos: devoluções de fornecedores, reembolsos de seguros,
 * juros bancários, donativos, vendas pontuais.
 *
 * Aplica lógica de estorno (igual a despesas e recibos).
 */

import * as store from '../store/local-store.js';
import { todayISO } from '../utils/format.js';

/**
 * Regista um novo recebimento.
 * @param {Object} data
 * @param {number} data.valor_centimos - > 0
 * @param {string} [data.data] - data ISO
 * @param {string} data.descricao
 * @param {string} [data.tenantId] - se associado a um condómino
 * @param {string} [data.origem] - quem pagou
 */
export async function registar(data, operatorName) {
  if (!data.valor_centimos || data.valor_centimos <= 0) throw new Error('Valor inválido.');
  if (!data.descricao || !data.descricao.trim()) throw new Error('Indica uma descrição.');

  const dataRec = data.data || todayISO();
  const ano = dataRec.split('-')[0];

  let tenantName = null;
  if (data.tenantId) {
    const t = await store.getDoc('tenants', data.tenantId);
    if (t) tenantName = t.name;
  }

  const doc = {
    ano,
    data: dataRec,
    valor_centimos: data.valor_centimos,
    descricao: data.descricao.trim(),
    origem: data.origem || tenantName || '—',
    tenantId: data.tenantId || null,
    tenantName,
    cancelado: false,
    estornoDe: null,
    registadoPor: operatorName || null,
    createdAt: Date.now()
  };
  return await store.setDoc('outrosRecebimentos', doc);
}

/**
 * Cancela um recebimento (cria estorno · NÃO apaga).
 */
export async function cancelar(id, motivo, operatorName) {
  const original = await store.getDoc('outrosRecebimentos', id);
  if (!original) throw new Error('Recebimento não encontrado.');
  if (original.cancelado) throw new Error('Recebimento já cancelado.');

  original.cancelado = true;
  original.canceladoEm = Date.now();
  original.canceladoPor = operatorName || null;
  original.motivoCancelamento = motivo || 'Cancelado pelo administrador';
  await store.setDoc('outrosRecebimentos', original);

  const estorno = {
    ano: original.ano,
    data: todayISO(),
    valor_centimos: -original.valor_centimos,
    descricao: `Estorno: ${original.descricao}. ${motivo || ''}`.trim(),
    origem: original.origem,
    tenantId: original.tenantId,
    tenantName: original.tenantName,
    cancelado: false,
    estornoDe: id,
    registadoPor: operatorName || null,
    createdAt: Date.now()
  };
  return await store.setDoc('outrosRecebimentos', estorno);
}

export async function listar(filters = {}) {
  let all = await store.listDocs('outrosRecebimentos');
  if (filters.ano) all = all.filter(d => d.ano === filters.ano);
  if (filters.tenantId) all = all.filter(d => d.tenantId === filters.tenantId);
  all.sort((a, b) => (b.data || '').localeCompare(a.data || ''));
  return all;
}
