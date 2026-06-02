/**
 * Planos de Pagamento (obras, intervenções extraordinárias).
 *
 * Modelo:
 *   Plano · 1 documento por obra
 *     - valorTotal, numPrestacoes, baseCalculo, dataInicio, estado
 *     - distribuição snapshot por condómino (preserva permilagens à data)
 *
 *   Prestação · 1 documento por (condómino × prestação)
 *     - planoId, tenantId, numeroPrestacao, valor, mesReferencia, estado
 *     - reciboId quando paga
 *
 * Geração: ao criar plano, geram-se TODAS as prestações imediatamente.
 *          10 condóminos × N prestações = 10N documentos.
 *
 * Bases de cálculo:
 *   - 'permilagem'  · valor = total × permilage / 1000 / numPrestacoes
 *   - 'valor_fixo'  · valor = total / numCondominos / numPrestacoes (igual a todos)
 *   - 'manual'      · admin define valor total por condómino manualmente
 */

import * as store from '../store/local-store.js';

export const BASES_CALCULO = ['permilagem', 'valor_fixo', 'manual'];
export const ESTADOS_PLANO = ['ativo', 'concluido', 'cancelado'];

/**
 * Helper: soma N meses a um string YYYY-MM.
 */
function addMonths(yyyyMm, n) {
  const [y, m] = yyyyMm.split('-').map(Number);
  const totalMonths = (y * 12 + (m - 1)) + n;
  const newY = Math.floor(totalMonths / 12);
  const newM = (totalMonths % 12) + 1;
  return `${newY}-${newM.toString().padStart(2, '0')}`;
}

/**
 * Calcular a distribuição por condómino dado o valor total e base de cálculo.
 *
 * @param {number} valorTotal_centimos
 * @param {string} baseCalculo
 * @param {Array} tenants
 * @param {Object} [valoresManuais] - { tenantId: cêntimos } · obrigatório se base=manual
 * @returns {Object} - { tenantId: { totalDevido_centimos, permilage, tenantName, fraction } }
 */
export function calcularDistribuicao(valorTotal_centimos, baseCalculo, tenants, valoresManuais) {
  if (!BASES_CALCULO.includes(baseCalculo)) throw new Error('Base de cálculo inválida.');
  if (!tenants || tenants.length === 0) throw new Error('Não há condóminos.');

  const dist = {};

  if (baseCalculo === 'permilagem') {
    const somaPermilagens = tenants.reduce((s, t) => s + (t.permilage || 0), 0);
    if (somaPermilagens === 0) throw new Error('Permilagens estão a zero.');
    for (const t of tenants) {
      const total = Math.round(valorTotal_centimos * t.permilage / somaPermilagens);
      dist[t.id] = {
        totalDevido_centimos: total,
        permilage: t.permilage,
        tenantName: t.name,
        fraction: t.fraction
      };
    }
  } else if (baseCalculo === 'valor_fixo') {
    const porCondomino = Math.round(valorTotal_centimos / tenants.length);
    for (const t of tenants) {
      dist[t.id] = {
        totalDevido_centimos: porCondomino,
        permilage: t.permilage,
        tenantName: t.name,
        fraction: t.fraction
      };
    }
  } else if (baseCalculo === 'manual') {
    if (!valoresManuais) throw new Error('Falta a distribuição manual.');
    for (const t of tenants) {
      const v = valoresManuais[t.id];
      if (v === undefined || v === null) throw new Error(`Falta valor para ${t.name}.`);
      if (v < 0) throw new Error(`Valor negativo para ${t.name}.`);
      dist[t.id] = {
        totalDevido_centimos: v,
        permilage: t.permilage,
        tenantName: t.name,
        fraction: t.fraction
      };
    }
  }

  return dist;
}

/**
 * Criar plano + gerar todas as prestações.
 */
export async function criar(data, operatorName) {
  if (!data.nome?.trim()) throw new Error('Indica o nome do plano.');
  if (!data.valorTotal_centimos || data.valorTotal_centimos <= 0) throw new Error('Valor total inválido.');
  if (!data.numeroPrestacoes || data.numeroPrestacoes < 1 || data.numeroPrestacoes > 60) {
    throw new Error('Número de prestações deve ser entre 1 e 60.');
  }
  if (!BASES_CALCULO.includes(data.baseCalculo)) throw new Error('Base de cálculo inválida.');
  if (!data.dataInicio || !/^\d{4}-\d{2}$/.test(data.dataInicio)) {
    throw new Error('Data de início inválida (use YYYY-MM).');
  }

  const tenants = await store.listDocs('tenants');
  if (tenants.length === 0) throw new Error('Não há condóminos para distribuir o plano.');

  // Calcular distribuição
  const distribuicao = calcularDistribuicao(
    data.valorTotal_centimos,
    data.baseCalculo,
    tenants,
    data.valoresManuais
  );

  // Validar soma (tolerância 1€ por arredondamento)
  const soma = Object.values(distribuicao).reduce((s, d) => s + d.totalDevido_centimos, 0);
  if (Math.abs(soma - data.valorTotal_centimos) > 100 && data.baseCalculo !== 'valor_fixo') {
    // valor_fixo pode ter resto · permilagem deve bater
    console.warn(`Plano · soma distribuição ${soma} vs total ${data.valorTotal_centimos} · diff ${soma - data.valorTotal_centimos}`);
  }

  const ano = data.dataInicio.split('-')[0];
  const dataFim = addMonths(data.dataInicio, data.numeroPrestacoes - 1);

  // Criar o documento do plano
  const plano = {
    nome: data.nome.trim(),
    descricao: data.descricao?.trim() || '',
    ano,
    valorTotal_centimos: data.valorTotal_centimos,
    numeroPrestacoes: data.numeroPrestacoes,
    baseCalculo: data.baseCalculo,
    dataInicio: data.dataInicio,
    dataPrevisaoFim: dataFim,
    distribuicao,
    estado: 'ativo',
    criadoEm: Date.now(),
    criadoPor: operatorName || null,
    canceladoEm: null,
    canceladoPor: null
  };

  const savedPlano = await store.setDoc('planos', plano);

  // Gerar prestações para cada condómino
  for (const [tenantId, info] of Object.entries(distribuicao)) {
    if (info.totalDevido_centimos === 0) continue;  // ignorar quem não deve nada

    // Valor base por prestação · última absorve eventual resto
    const valorBase = Math.floor(info.totalDevido_centimos / data.numeroPrestacoes);
    const valorUltima = info.totalDevido_centimos - valorBase * (data.numeroPrestacoes - 1);

    for (let i = 0; i < data.numeroPrestacoes; i++) {
      const mesRef = addMonths(data.dataInicio, i);
      const isUltima = i === data.numeroPrestacoes - 1;
      const valor = isUltima ? valorUltima : valorBase;

      await store.setDoc('prestacoes', {
        planoId: savedPlano.id,
        planoNome: savedPlano.nome,
        tenantId,
        tenantName: info.tenantName,
        fraction: info.fraction,
        numeroPrestacao: i + 1,
        totalPrestacoes: data.numeroPrestacoes,
        valor_centimos: valor,
        mesReferencia: mesRef,
        dataPrevista: `${mesRef}-15`,
        estado: 'pendente',
        reciboId: null,
        pagoEm: null,
        createdAt: Date.now()
      });
    }
  }

  return savedPlano;
}

/**
 * Cancelar plano · cancela apenas prestações futuras (pagas e em curso ficam).
 */
export async function cancelar(planoId, motivo, operatorName) {
  const p = await store.getDoc('planos', planoId);
  if (!p) throw new Error('Plano não encontrado.');
  if (p.estado === 'cancelado') throw new Error('Plano já estava cancelado.');

  p.estado = 'cancelado';
  p.canceladoEm = Date.now();
  p.canceladoPor = operatorName || null;
  p.motivoCancelamento = motivo || '';
  await store.setDoc('planos', p);

  // Cancelar prestações pendentes (não as pagas)
  const todasPrestacoes = await store.queryDocs('prestacoes', { planoId });
  let canceladas = 0;
  for (const pr of todasPrestacoes) {
    if (pr.estado === 'pendente' || pr.estado === 'em_atraso') {
      pr.estado = 'cancelada';
      pr.canceladaEm = Date.now();
      await store.setDoc('prestacoes', pr);
      canceladas++;
    }
  }

  return { plano: p, prestacoesCanceladas: canceladas };
}

/**
 * Listar planos.
 */
export async function listar(filtros = {}) {
  let all = await store.listDocs('planos');
  if (filtros.estado) all = all.filter(p => p.estado === filtros.estado);
  if (filtros.ano) all = all.filter(p => p.ano === filtros.ano);
  all.sort((a, b) => (b.criadoEm || 0) - (a.criadoEm || 0));
  return all;
}

/**
 * Obter plano por id.
 */
export async function obter(id) {
  return await store.getDoc('planos', id);
}

/**
 * Calcular estado de progresso do plano.
 */
export async function progresso(planoId) {
  const prestacoes = await store.queryDocs('prestacoes', { planoId });
  const total = prestacoes.length;
  const pagas = prestacoes.filter(p => p.estado === 'paga').length;
  const emAtraso = prestacoes.filter(p => p.estado === 'em_atraso').length;
  const pendentes = prestacoes.filter(p => p.estado === 'pendente').length;
  const canceladas = prestacoes.filter(p => p.estado === 'cancelada').length;

  const valorTotalEsperado = prestacoes.reduce((s, p) => s + (p.valor_centimos || 0), 0);
  const valorPago = prestacoes
    .filter(p => p.estado === 'paga')
    .reduce((s, p) => s + (p.valor_centimos || 0), 0);

  return {
    total, pagas, pendentes, emAtraso, canceladas,
    valorTotalEsperado_centimos: valorTotalEsperado,
    valorPago_centimos: valorPago,
    percentagem: total > 0 ? Math.round(pagas / total * 100) : 0
  };
}
