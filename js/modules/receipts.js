/**
 * Recibos · CRUD + lógica de emissão.
 *
 * Cada recibo é UM documento. O campo `mesReferencia` é um ARRAY que
 * pode conter 1 ou vários meses (ex: pagamento anual = 12 meses no array).
 *
 * Lógica crítica:
 *  - emissão atribui número sequencial atomicamente
 *  - distribuição automática quando há múltiplos meses
 *  - cancelamento cria recibo de estorno (NUNCA apaga)
 */

import * as store from '../store/local-store.js';
import * as numeracao from './numeracao.js';
import * as quotasLedger from './quotas-ledger.js';
import { todayISO } from '../utils/format.js';

/**
 * Cria um novo recibo.
 *
 * @param {Object} data
 * @param {string} data.tenantId - obrigatório
 * @param {string} data.tipo - 'quota' | 'prestacao' | 'outro'
 * @param {Array<string>} data.mesReferencia - meses abrangidos (YYYY-MM)
 * @param {number} data.valor_centimos - dinheiro recebido em mão
 * @param {number} [data.excesso_centimos] - quanto deste valor é excesso (vai para saldo)
 * @param {number} [data.saldoUsado_centimos] - quanto saldo prévio foi usado para acertar
 * @param {string} [data.data] - data ISO (default: hoje)
 * @param {string} [data.descricao] - texto livre
 * @param {string} [data.planoId] - se for prestação de plano
 * @param {Array<string>} [data.prestacoesIds] - ids das prestações pagas (se tipo=prestacao)
 * @returns {Promise<Object>} - documento gravado
 */
export async function emitir(data) {
  // Validações
  if (!data.tenantId) throw new Error('Falta o condómino.');
  if (!data.tipo) throw new Error('Falta o tipo de recibo.');
  if (!data.valor_centimos || data.valor_centimos <= 0) throw new Error('Valor inválido.');
  if (!data.mesReferencia || data.mesReferencia.length === 0) {
    throw new Error('Indique pelo menos um mês de referência.');
  }
  if (data.tipo === 'prestacao' && (!data.planoId || !data.prestacoesIds || data.prestacoesIds.length === 0)) {
    throw new Error('Para prestações: plano e prestações são obrigatórios.');
  }

  const dataRecibo = data.data || todayISO();
  const ano = dataRecibo.split('-')[0];

  // Atribuir número sequencial
  const { numero, formatado } = await numeracao.nextReceiptNumber(ano);

  const tenant = await store.getDoc('tenants', data.tenantId);
  if (!tenant) throw new Error(`Condómino "${data.tenantId}" não existe.`);

  // Descrição inteligente se não fornecida
  let descricao = data.descricao;
  if (!descricao) {
    if (data.tipo === 'prestacao') {
      const plano = await store.getDoc('planos', data.planoId);
      const numLabel = data.prestacoesIds.length === 1 ? '1 prestação' : `${data.prestacoesIds.length} prestações`;
      descricao = `${numLabel} · ${plano?.nome || 'Plano'}`;
    } else {
      descricao = autoDescricao(data.tipo, data.mesReferencia);
    }
  }

  const doc = {
    recibo_numero: formatado,
    recibo_seq: numero,
    ano,
    tenantId: data.tenantId,
    tenantName: tenant.name,
    fraction: tenant.fraction,
    data: dataRecibo,
    valor_centimos: data.valor_centimos,
    excesso_centimos: data.excesso_centimos || 0,
    saldoUsado_centimos: data.saldoUsado_centimos || 0,
    mesReferencia: [...data.mesReferencia].sort(),
    descricao,
    tipo: data.tipo,
    planoId: data.planoId || null,
    prestacoesIds: data.prestacoesIds || null,
    cancelado: false,
    estornoDe: null,
    createdAt: Date.now()
  };

  const saved = await store.setDoc('receipts', doc);

  // v1.0.34 · recibos de quota REAIS (não auditoria-only) actualizam o ledger 2026.
  // A quota coberta = valor recebido + saldo usado − excesso (igual a quotaCobertaPorRecibo).
  if (data.tipo === 'quota' && !doc.excluirDeContagem && !doc.auditoria) {
    try {
      const quotaCoberta = (doc.valor_centimos || 0)
        + (doc.saldoUsado_centimos || 0)
        - (doc.excesso_centimos || 0);
      await quotasLedger.registarPagamento(doc.tenantId, doc.mesReferencia, quotaCoberta);
    } catch (e) {
      console.warn('[receipts] Falhou actualizar ledger de quotas:', e);
    }
  }

  // Se for de prestações, marcar cada uma como paga
  if (data.tipo === 'prestacao' && data.prestacoesIds) {
    for (const prestId of data.prestacoesIds) {
      try {
        const p = await store.getDoc('prestacoes', prestId);
        if (p && p.estado !== 'paga' && p.estado !== 'cancelada') {
          p.estado = 'paga';
          p.reciboId = saved.id;
          p.pagoEm = Date.now();
          await store.setDoc('prestacoes', p);
        }
      } catch (e) {
        console.warn(`Falhou marcar prestação ${prestId} como paga:`, e);
      }
    }
  }

  return saved;
}

/**
 * Gera descrição automática a partir do tipo e meses.
 */
function autoDescricao(tipo, meses) {
  const MES_LONG = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
                    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

  if (tipo === 'quota') {
    if (meses.length === 1) {
      const [y, m] = meses[0].split('-');
      return `Quota mensal ${MES_LONG[parseInt(m) - 1]} ${y}`;
    }
    // Múltiplos meses
    const sorted = [...meses].sort();
    const [yA, mA] = sorted[0].split('-');
    const [yB, mB] = sorted[sorted.length - 1].split('-');
    const isContiguous = isContiguousSequence(sorted);
    if (isContiguous && yA === yB) {
      return `Quotas ${MES_LONG[parseInt(mA) - 1]} a ${MES_LONG[parseInt(mB) - 1]} ${yA}`;
    }
    if (isContiguous) {
      return `Quotas ${MES_LONG[parseInt(mA) - 1]} ${yA} a ${MES_LONG[parseInt(mB) - 1]} ${yB}`;
    }
    return `Quotas (${meses.length} meses)`;
  }
  if (tipo === 'prestacao') return `Prestação ${meses.length > 1 ? `(${meses.length} prestações)` : ''}`;
  return 'Recebimento';
}

function isContiguousSequence(sortedMonths) {
  for (let i = 1; i < sortedMonths.length; i++) {
    const expected = nextMonth(sortedMonths[i - 1]);
    if (sortedMonths[i] !== expected) return false;
  }
  return true;
}

function nextMonth(monthRef) {
  let [y, m] = monthRef.split('-').map(Number);
  m++;
  if (m > 12) { m = 1; y++; }
  return `${y}-${String(m).padStart(2, '0')}`;
}

/**
 * Cancela um recibo (cria estorno · NÃO apaga).
 * Cria um novo doc com valor negativo e estornoDe = recibo original.
 */
export async function cancelar(receiptId, motivo) {
  const original = await store.getDoc('receipts', receiptId);
  if (!original) throw new Error('Recibo não encontrado.');
  if (original.cancelado) throw new Error('Recibo já estornado.');

  // Marcar o original
  original.cancelado = true;
  original.canceladoEm = Date.now();
  original.motivoCancelamento = motivo || 'Cancelado pelo administrador';
  await store.setDoc('receipts', original);

  // Se era recibo de prestações, reverter o estado das prestações
  if (original.tipo === 'prestacao' && original.prestacoesIds) {
    for (const prestId of original.prestacoesIds) {
      try {
        const p = await store.getDoc('prestacoes', prestId);
        if (p && p.estado === 'paga' && p.reciboId === receiptId) {
          // Voltar a pendente ou em_atraso baseado na data
          const { currentMonthRef } = await import('../utils/format.js');
          const mesAtual = currentMonthRef();
          p.estado = (p.mesReferencia && p.mesReferencia < mesAtual) ? 'em_atraso' : 'pendente';
          p.reciboId = null;
          p.pagoEm = null;
          await store.setDoc('prestacoes', p);
        }
      } catch (e) {
        console.warn(`Falhou desmarcar prestação ${prestId}:`, e);
      }
    }
  }

  // Criar estorno
  const ano = original.data.split('-')[0];
  const { numero, formatado } = await numeracao.nextReceiptNumber(ano);

  const estorno = {
    recibo_numero: formatado,
    recibo_seq: numero,
    ano,
    tenantId: original.tenantId,
    tenantName: original.tenantName,
    fraction: original.fraction,
    data: todayISO(),
    valor_centimos: -original.valor_centimos,  // NEGATIVO
    mesReferencia: original.mesReferencia,
    descricao: `Estorno do recibo ${original.recibo_numero}. ${motivo || ''}`.trim(),
    tipo: 'estorno',
    estornoDe: receiptId,
    createdAt: Date.now()
  };
  return await store.setDoc('receipts', estorno);
}

/**
 * Lista recibos · filtros opcionais.
 * @param {Object} [filters] - { tenantId, ano, tipo, mesReferencia, planoId }
 */
export async function listar(filters = {}) {
  let all = await store.listDocs('receipts');

  if (filters.tenantId) all = all.filter(r => r.tenantId === filters.tenantId);
  if (filters.ano) all = all.filter(r => r.ano === filters.ano);
  if (filters.tipo) all = all.filter(r => r.tipo === filters.tipo);
  if (filters.planoId) all = all.filter(r => r.planoId === filters.planoId);
  if (filters.mesReferencia) {
    all = all.filter(r => Array.isArray(r.mesReferencia) && r.mesReferencia.includes(filters.mesReferencia));
  }

  // Ordenar por data desc
  all.sort((a, b) => (b.data || '').localeCompare(a.data || '') ||
                     (b.recibo_seq || 0) - (a.recibo_seq || 0));
  return all;
}

/**
 * Devolve recibos que cobrem um mês específico para um condómino.
 * Usado para construir a tabela de quotas mensais.
 */
export async function recibosDeCondominoNoMes(tenantId, mesRef) {
  const all = await listar({ tenantId });
  return all.filter(r =>
    !r.cancelado &&
    Array.isArray(r.mesReferencia) &&
    r.mesReferencia.includes(mesRef)
  );
}

/**
 * Calcula quanto deste recibo foi efetivamente aplicado às quotas.
 * quotaCoberta = valor_centimos + saldoUsado − excesso
 *
 * Note: valor_centimos é dinheiro real recebido. Excesso vai para o
 * saldo do condómino. SaldoUsado vem do saldo prévio e é aplicado à quota.
 */
function quotaCobertaPorRecibo(recibo) {
  return (recibo.valor_centimos || 0)
       + (recibo.saldoUsado_centimos || 0)
       - (recibo.excesso_centimos || 0);
}

/**
 * Total pago por um condómino num mês específico.
 *
 * Para a tabela de quotas. Soma todos os recibos onde esse mês aparece em
 * mesReferencia, dividindo proporcionalmente a quotaCoberta entre os meses
 * do recibo (no caso de pagamentos múltiplos).
 *
 * Ex: recibo de 216€ (quotaCoberta) por Jan-Jun (6 meses) → 36€ atribuído a cada mês.
 */
export async function valorPagoNoMes(tenantId, mesRef) {
  // v1.0.34 · 2026 é servido pelo ledger explícito (fonte de verdade forçada).
  // Outros anos mantêm o cálculo derivado dos recibos.
  const doLedger = await quotasLedger.valorPagoNoMes2026(tenantId, mesRef);
  if (doLedger !== null) return doLedger;

  const recs = await recibosDeCondominoNoMes(tenantId, mesRef);
  return recs.reduce((sum, r) => {
    const meses = (r.mesReferencia || []).length || 1;
    return sum + Math.round(quotaCobertaPorRecibo(r) / meses);
  }, 0);
}

/**
 * Calcula o saldo a favor de um condómino (saldo do balde).
 *   saldo = Σ(excesso) − Σ(saldoUsado) sobre recibos válidos
 * Valor positivo = condómino tem saldo a favor (créditos).
 * @returns {Promise<number>} - cêntimos
 */
export async function saldoCondomino(tenantId) {
  const all = await listar({ tenantId });
  const validos = all.filter(r => !r.cancelado && !r.estornoDe);
  return validos.reduce((s, r) =>
    s + (r.excesso_centimos || 0) - (r.saldoUsado_centimos || 0)
  , 0);
}

/**
 * v1.0.45 · Emite um recibo NUMERADO de um pagamento recebido que NÃO é quota
 * (ex.: apoio da Câmara, reembolso de seguro, donativo).
 *
 * Importante — contabilidade: este recibo é APENAS o documento.
 * Fica marcado audit-only (excluirDoSaldo + excluirDeContagem = true) para
 * NÃO contar no saldo nem na Análise. O que conta é a entrada em
 * `outrosRecebimentos` (criada no fluxo do modal). Assim, o dinheiro entra
 * uma só vez na contabilidade — mesmo padrão do recibo histórico da Câmara.
 *
 * @param {Object} data
 * @param {number} data.valor_centimos
 * @param {string} data.descricao        - "referente a"
 * @param {string} [data.pagador]        - quem pagou (vai para "Recebi de")
 * @param {string} [data.pagadorNif]     - NIF de quem pagou (opcional, sai no PDF)
 * @param {string} [data.data]           - ISO; default hoje
 * @param {string} [data.outroRecebimentoId] - id da entrada outrosRecebimentos ligada
 * @returns {Promise<Object>} recibo gravado
 */
export async function emitirRecebimento(data) {
  if (!data.valor_centimos || data.valor_centimos <= 0) throw new Error('Valor inválido.');
  if (!data.descricao || !data.descricao.trim()) throw new Error('Falta a descrição.');

  const dataRecibo = data.data || todayISO();
  const ano = dataRecibo.split('-')[0];
  const { numero, formatado } = await numeracao.nextReceiptNumber(ano);

  const doc = {
    recibo_numero: formatado,
    recibo_seq: numero,
    ano,
    tenantId: null,
    tenantName: (data.pagador && data.pagador.trim()) || '—',
    fraction: '—',
    data: dataRecibo,
    valor_centimos: data.valor_centimos,
    excesso_centimos: 0,
    saldoUsado_centimos: 0,
    mesReferencia: [],
    descricao: data.descricao.trim(),
    tipo: 'recebimento',
    pagadorNif: (data.pagadorNif || '').trim() || null,
    planoId: null,
    prestacoesIds: null,
    cancelado: false,
    estornoDe: null,
    excluirDoSaldo: true,
    excluirDeContagem: true,
    recebimentoExterno: true,
    outroRecebimentoId: data.outroRecebimentoId || null,
    createdAt: Date.now()
  };

  return await store.setDoc('receipts', doc);
}
