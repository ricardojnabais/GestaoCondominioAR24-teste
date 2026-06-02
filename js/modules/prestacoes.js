/**
 * Prestações · 1 documento por (condómino × prestação dentro de um plano).
 *
 * Geradas em massa quando o plano é criado (ver planos.js).
 * Marcadas como pagas quando há recibo emitido.
 * Passam automaticamente a 'em_atraso' quando a data prevista passou.
 */

import * as store from '../store/local-store.js';
import { currentMonthRef } from '../utils/format.js';

/**
 * Listar prestações com filtros opcionais.
 */
export async function listar(filtros = {}) {
  let all = await store.listDocs('prestacoes');
  if (filtros.planoId)  all = all.filter(p => p.planoId === filtros.planoId);
  if (filtros.tenantId) all = all.filter(p => p.tenantId === filtros.tenantId);
  if (filtros.estado)   all = all.filter(p => p.estado === filtros.estado);
  if (filtros.mesReferencia) all = all.filter(p => p.mesReferencia === filtros.mesReferencia);
  // Ordenar por (tenant, numero)
  all.sort((a, b) => {
    const c = (a.fraction || '').localeCompare(b.fraction || '');
    if (c !== 0) return c;
    return (a.numeroPrestacao || 0) - (b.numeroPrestacao || 0);
  });
  return all;
}

/**
 * Listar prestações pendentes (ou em_atraso) de um condómino num plano.
 * Útil para o modal de Registar Pagamento.
 */
export async function pendentesParaCondominoPlano(tenantId, planoId) {
  const all = await listar({ planoId, tenantId });
  return all.filter(p => p.estado === 'pendente' || p.estado === 'em_atraso');
}

/**
 * Marcar prestação como paga, associando o recibo.
 */
export async function marcarPaga(prestacaoId, reciboId) {
  const p = await store.getDoc('prestacoes', prestacaoId);
  if (!p) throw new Error('Prestação não encontrada.');
  if (p.estado === 'paga') throw new Error('Prestação já está paga.');
  if (p.estado === 'cancelada') throw new Error('Prestação foi cancelada.');

  p.estado = 'paga';
  p.reciboId = reciboId;
  p.pagoEm = Date.now();
  return await store.setDoc('prestacoes', p);
}

/**
 * Desmarcar prestação como paga (quando o recibo é cancelado).
 * Volta ao estado pendente/em_atraso.
 */
export async function desmarcarPaga(prestacaoId) {
  const p = await store.getDoc('prestacoes', prestacaoId);
  if (!p) return null;
  if (p.estado !== 'paga') return p;

  // Decidir se vai voltar a 'em_atraso' ou 'pendente' baseado na data
  const now = currentMonthRef();
  p.estado = (p.mesReferencia && p.mesReferencia < now) ? 'em_atraso' : 'pendente';
  p.reciboId = null;
  p.pagoEm = null;
  return await store.setDoc('prestacoes', p);
}

/**
 * Atualizar estado de prestações pendentes que já passaram o mês de referência.
 * Pendente → em_atraso quando mesReferencia < mês atual.
 * Chamada periodicamente (ao abrir páginas relevantes).
 */
export async function atualizarEstadosAtraso() {
  const all = await store.listDocs('prestacoes');
  const mesAtual = currentMonthRef();
  let alteradas = 0;

  for (const p of all) {
    if (p.estado === 'pendente' && p.mesReferencia && p.mesReferencia < mesAtual) {
      p.estado = 'em_atraso';
      await store.setDoc('prestacoes', p);
      alteradas++;
    }
  }
  return alteradas;
}

/**
 * Apurar quanto deve um condómino em prestações pendentes + atraso.
 */
export async function totalEmDivida(tenantId) {
  const all = await listar({ tenantId });
  return all
    .filter(p => p.estado === 'pendente' || p.estado === 'em_atraso')
    .reduce((s, p) => s + (p.valor_centimos || 0), 0);
}
