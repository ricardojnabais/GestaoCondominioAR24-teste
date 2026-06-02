/**
 * Saldo Bancário · v1.0.17
 *
 * Fórmulas:
 *   Para o ano do MARCO de início de gestão (`meta.config.dataInicioGestao`):
 *     saldoCalculado = saldoInicial(year) + Σ(receipts pós-marco, não-excluídos) +
 *                      Σ(outros pós-marco) − Σ(despesas pós-marco)
 *
 *   Para anos anteriores ao marco (puramente histórico):
 *     saldoCalculado = saldoInicial(year) + Σ(receipts year) + Σ(outros year) − Σ(despesas year)
 *     (sem filtro `excluirDoSaldo` · cálculo histórico tradicional)
 *
 *   Para anos posteriores ao marco:
 *     saldoCalculado = saldoInicial(year) + Σ(receipts year) + Σ(outros year) − Σ(despesas year)
 *     (todos os movimentos contam · são todos pós-marco)
 */
import * as store from '../store/local-store.js';

/**
 * Calcula o saldo bancário previsto para o ano dado.
 * @param {string|number} year
 * @returns {Promise<{saldo, receitas, despesas, saldoInicial, saldoConhecido, diferenca, marco}>}
 */
export async function calcularSaldo(year) {
  const yearStr = String(year);
  const meta = await store.getDoc('meta', 'config');
  const saldoInicial = (meta?.saldoInicial?.[yearStr]) || 0;
  const saldoConhecido = meta?.saldoConhecido || null;
  const dataInicio = meta?.dataInicioGestao || null;
  const anoMarco = dataInicio ? dataInicio.slice(0, 4) : null;
  const ehAnoMarco = (anoMarco === yearStr);

  // Carregar dados
  const allReceipts = await store.queryDocs('receipts', { ano: yearStr });
  const allOutros = await store.queryDocs('outrosRecebimentos', { ano: yearStr });
  const todasDespesas = await store.listDocs('pagamentosDespesa');
  const despesasAno = todasDespesas.filter(d => d.data && d.data.startsWith(yearStr));

  // Aplicar filtros segundo o ano em relação ao marco
  let receiptsValidos, outrosValidos, despesasValidas;
  if (ehAnoMarco) {
    // Tudo o que foi importado tem excluirDoSaldo=true · só contam emissões pós-go-live
    receiptsValidos = allReceipts.filter(r => !r.cancelado && !r.excluirDoSaldo);
    outrosValidos = allOutros.filter(o => !o.excluirDoSaldo);
    despesasValidas = despesasAno.filter(d => !d.cancelado && !d.excluirDoSaldo);
  } else {
    // Ano histórico ou futuro · cálculo tradicional (ignora flag)
    receiptsValidos = allReceipts.filter(r => !r.cancelado);
    outrosValidos = allOutros;
    despesasValidas = despesasAno.filter(d => !d.cancelado);
  }

  const totReceipts = receiptsValidos.reduce((s, r) => s + (r.valor_centimos || 0), 0);
  const totOutros = outrosValidos.reduce((s, o) => s + (o.valor_centimos || 0), 0);
  const totDespesas = despesasValidas.reduce((s, d) => s + (d.valor_centimos || 0), 0);

  const receitas = totReceipts + totOutros;
  const saldo = saldoInicial + receitas - totDespesas;

  // Diferença vs saldo conhecido (só se data conhecida for do mesmo ano)
  let diferenca = null;
  if (saldoConhecido?.data?.startsWith(yearStr)) {
    diferenca = saldoConhecido.total_centimos - saldo;
  }

  return {
    saldo,
    receitas,
    despesas: totDespesas,
    saldoInicial,
    saldoConhecido,
    diferenca,
    marco: ehAnoMarco ? { dataInicio, ano: anoMarco } : null
  };
}

/**
 * Atualiza saldo real BPI (valor conhecido).
 */
export async function atualizarSaldoConhecido({ dataISO, total_centimos, contaOrdem_centimos, contaPoupanca_centimos, fonte, notas }) {
  const meta = (await store.getDoc('meta', 'config')) || { id: 'config' };
  meta.saldoConhecido = {
    data: dataISO,
    total_centimos,
    contaOrdem_centimos: contaOrdem_centimos ?? null,
    contaPoupanca_centimos: contaPoupanca_centimos ?? null,
    fonte: fonte || '',
    notas: notas || ''
  };
  await store.setDoc('meta', meta);
  return meta.saldoConhecido;
}

/**
 * Marca início de gestão e define saldo inicial do ano de marco.
 * @param {string} dataISO - "YYYY-MM-DD"
 * @param {number} saldoInicial_centimos
 */
export async function marcarInicioGestao(dataISO, saldoInicial_centimos) {
  const meta = (await store.getDoc('meta', 'config')) || { id: 'config' };
  const ano = dataISO.slice(0, 4);

  meta.dataInicioGestao = dataISO;
  meta.saldoInicial = meta.saldoInicial || {};
  meta.saldoInicial[ano] = saldoInicial_centimos;
  await store.setDoc('meta', meta);

  // Marcar recibos, despesas, outros pré-marco com excluirDoSaldo=true
  const allReceipts = await store.listDocs('receipts');
  for (const r of allReceipts) {
    if (r.data && r.data < dataISO && !r.excluirDoSaldo) {
      r.excluirDoSaldo = true;
      await store.setDoc('receipts', r);
    }
  }
  const allDespesas = await store.listDocs('pagamentosDespesa');
  for (const d of allDespesas) {
    if (d.data && d.data < dataISO && !d.excluirDoSaldo) {
      d.excluirDoSaldo = true;
      await store.setDoc('pagamentosDespesa', d);
    }
  }
  const allOutros = await store.listDocs('outrosRecebimentos');
  for (const o of allOutros) {
    if (o.data && o.data < dataISO && !o.excluirDoSaldo) {
      o.excluirDoSaldo = true;
      await store.setDoc('outrosRecebimentos', o);
    }
  }

  return { dataInicioGestao: dataISO, saldoInicial: saldoInicial_centimos };
}
