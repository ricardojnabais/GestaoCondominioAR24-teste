/**
 * Em Aberto · cálculos para a vista admin.
 * Atualizado v1.0.14 · 3 dimensões só:
 *   1. dividas arrastadas (meta.config.dividasAnoAnterior)
 *   2. quotas em atraso do ano corrente (calc dinâmico via mesReferencia)
 *   3. prestações em atraso (planos ativos, estado!=paga)
 */

import * as store from '../store/local-store.js';
import * as quotasLedger from './quotas-ledger.js';

/**
 * Dívidas arrastadas explícitas registadas no meta.
 */
export async function dividasArrastadas(anoCorrente = new Date().getFullYear()) {
  const config = await store.getDoc('meta', 'config');
  const dividas = config?.dividasAnoAnterior?.[String(anoCorrente)];
  if (!dividas) return [];
  return Object.values(dividas).map(d => ({
    tenantId: d.tenantId,
    tenantName: d.tenantName,
    fraction: d.fraction,
    valor_centimos: d.valor_centimos,
    origem: d.origem || `Dívida ano anterior`,
    detalhe: d.detalhe || '',
  }));
}

/**
 * Quotas em atraso do ano corrente · só meses já passados (incluindo o atual).
 * Usa r.mesReferencia para calcular cobertura.
 */
export async function quotasAtrasoAnoCorrente(ano = new Date().getFullYear()) {
  const anoStr = String(ano);
  const tenants = await store.listDocs('tenants');

  // Construir matriz cobertura: tenantId → 'YYYY-MM' → valor_cent pago
  const cobertura = {};

  // v1.0.35 · 2026 vem SEMPRE do ledger explícito (nunca dos recibos → sem duplicação).
  if (anoStr === quotasLedger.ANO) {
    const ledger2026 = await quotasLedger.getLedger();
    if (ledger2026?.pagamentos) {
      for (const [tid, meses] of Object.entries(ledger2026.pagamentos)) {
        cobertura[tid] = { ...meses };
      }
    }
  } else {
    const receipts = await store.listDocs('receipts');
    receipts.forEach(r => {
      // Recibos marcados como "histórico/auditoria-only" não contam para quotas
      if (r.excluirDeContagem) return;
      if (r.cancelado || r.tipo !== 'quota') return;
      if (!Array.isArray(r.mesReferencia) || r.mesReferencia.length === 0) return;
      const valPorMes = (r.valor_centimos || 0) / r.mesReferencia.length;
      r.mesReferencia.forEach(mref => {
        if (!cobertura[r.tenantId]) cobertura[r.tenantId] = {};
        cobertura[r.tenantId][mref] = (cobertura[r.tenantId][mref] || 0) + valPorMes;
      });
    });
  }

  const hoje = new Date();

  const resultado = [];
  for (const t of tenants) {
    if (t.inativoEm) continue;
    const quotaMensal = t.rentByYear?.[anoStr];
    if (!quotaMensal) continue;

    let totalEmFalta = 0;
    const mesesFalta = [];
    for (let m = 1; m <= 12; m++) {
      const mref = `${anoStr}-${String(m).padStart(2, '0')}`;
      const pago = cobertura[t.id]?.[mref] || 0;
      // v1.0.40 · só é "em atraso" depois do dia 8; o período 1-8 do mês corrente
      // está "a pagamento" e NÃO entra nas dívidas.
      const estado = quotasLedger.estadoQuotaMes({
        pago_centimos: pago, quota_centimos: quotaMensal, ano, mes: m, hoje,
      });
      if (estado === 'atraso' && pago < quotaMensal - 100) { // tolerância 1€
        totalEmFalta += quotaMensal - pago;
        mesesFalta.push(m);
      }
    }

    if (totalEmFalta > 0) {
      resultado.push({
        tenantId: t.id,
        tenantName: t.name,
        fraction: t.fraction,
        totalEmFalta,
        mesesFalta,
        quotaMensal,
      });
    }
  }

  resultado.sort((a, b) => b.totalEmFalta - a.totalEmFalta);
  return resultado;
}

/**
 * Prestações em atraso de planos ativos.
 * Considera prestações com estado != 'paga' e valor > 0.
 */
export async function prestacoesAtraso() {
  const planos = await store.listDocs('planos');
  const prestacoes = await store.listDocs('prestacoes');
  const tenants = await store.listDocs('tenants');
  const tenantMap = {};
  tenants.forEach(t => { tenantMap[t.id] = t; });

  const resultado = [];
  for (const plano of planos) {
    if (plano.estado !== 'ativo') continue;
    const prestPlano = prestacoes.filter(p => p.planoId === plano.id);

    // Agrupar por tenant
    const porTenant = {};
    prestPlano.forEach(p => {
      if (!porTenant[p.tenantId]) porTenant[p.tenantId] = { pendentes: [], totalPendente: 0 };
      if (p.estado !== 'paga' && (p.valor_centimos || 0) > 0) {
        porTenant[p.tenantId].pendentes.push(p);
        porTenant[p.tenantId].totalPendente += p.valor_centimos;
      }
    });

    for (const [tid, info] of Object.entries(porTenant)) {
      if (info.totalPendente <= 0) continue;
      const t = tenantMap[tid];
      resultado.push({
        planoId: plano.id,
        planoNome: plano.nome,
        tenantId: tid,
        tenantName: t?.name || '?',
        fraction: t?.fraction || '',
        totalPendente: info.totalPendente,
        nPrestacoes: info.pendentes.length,
      });
    }
  }

  resultado.sort((a, b) => b.totalPendente - a.totalPendente);
  return resultado;
}

/**
 * Atualizar / remover dívida arrastada (após pagamento).
 */
export async function limparDividaArrastada(ano, tenantId) {
  const config = await store.getDoc('meta', 'config');
  if (!config?.dividasAnoAnterior?.[String(ano)]?.[tenantId]) return;
  delete config.dividasAnoAnterior[String(ano)][tenantId];
  // Limpar ano se vazio
  if (Object.keys(config.dividasAnoAnterior[String(ano)]).length === 0) {
    delete config.dividasAnoAnterior[String(ano)];
  }
  await store.setDoc('meta', config);
}
