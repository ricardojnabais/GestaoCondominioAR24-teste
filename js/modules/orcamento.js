/**
 * Módulo Orçamento Anual · v2.
 *
 * Modelo:
 *   {
 *     id, ano, versao, estado, criadoEm/Por, aprovadoEm/Por,
 *     saldoInicial_centimos,
 *
 *     quotas: {
 *       incrementoPct,
 *       arredondamento: 'cent' | 'meio' | 'inteiro',
 *       quotasMensaisPorTenant: { tenantId → centimos },
 *       quotasMensaisAnoAnt:    { tenantId → centimos }
 *     },
 *
 *     outrasReceitas: [{ id, descricao, valor_centimos }],
 *
 *     despesas: {
 *       incrementoPctMassa,
 *       porRubrica:  { rubricaId → centimos anuais },
 *       realizadoAnoAnt: { rubricaId → centimos anuais },
 *       manuais: [{ id, descricao, valor_centimos }]
 *     },
 *
 *     fundoReserva_centimos, observacoes
 *   }
 *
 * Versionamento: rascunho → aprovado → arquivado (rever = v+1).
 * Aprovar aplica automaticamente quotas a tenant.rentByYear[ano].
 */

import * as store from '../store/local-store.js';
import * as rubricas from './rubricas.js';
import * as despesas from './despesas.js';

function uid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 'id-' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

// ───────────────────────── ANOS DISPONÍVEIS ─────────────────────────

export function anosDisponiveis() {
  const atual = new Date().getFullYear();
  return [String(atual), String(atual + 1)];
}

export function anoPorDefeito() {
  return String(new Date().getFullYear() + 1);
}

// ───────────────────────── CRUD ─────────────────────────

export async function obterAtivo(ano) {
  const todos = await store.queryDocs('orcamentos', { ano });
  return todos.find(o => o.estado !== 'arquivado') || null;
}

export async function criarRascunho(ano, operatorName) {
  const existente = await obterAtivo(ano);
  if (existente) {
    if (existente.estado === 'rascunho') return existente;
    throw new Error('Já existe orçamento aprovado para este ano. Use "Editar como nova versão".');
  }
  const base = await prepararBaseDoAnoAnterior(ano);
  const novo = {
    id: `orc-${ano}-${uid().slice(0, 8)}`,
    ano,
    versao: 1,
    estado: 'rascunho',
    criadoEm: Date.now(),
    criadoPor: operatorName || null,
    aprovadoEm: null,
    aprovadoPor: null,
    saldoInicial_centimos: 0,
    quotas: {
      incrementoPct: 0,
      arredondamento: 'inteiro',
      quotasMensaisAnoAnt: base.quotasAnoAnt,
      quotasMensaisPorTenant: { ...base.quotasAnoAnt }
    },
    outrasReceitas: [],
    despesas: {
      incrementoPctMassa: 0,
      realizadoAnoAnt: base.despesasRealizadoAnoAnt,
      porRubrica: { ...base.despesasPorRubricaPrev },
      manuais: []
    },
    fundoReserva_centimos: 0,
    observacoes: ''
  };
  return await store.setDoc('orcamentos', novo);
}

async function prepararBaseDoAnoAnterior(ano) {
  const anoAnt = String(parseInt(ano, 10) - 1);
  const tenants = await store.listDocs('tenants');
  const quotasAnoAnt = {};
  for (const t of tenants) {
    let valor = t.rentByYear?.[anoAnt];
    if (!valor && t.rentByYear) {
      const anos = Object.keys(t.rentByYear).map(Number).sort((a, b) => b - a);
      for (const y of anos) {
        if (y < parseInt(ano, 10)) {
          valor = t.rentByYear[String(y)];
          if (valor) break;
        }
      }
    }
    quotasAnoAnt[t.id] = valor || 0;
  }

  const rubsAtivas = await rubricas.listar();
  const totaisAnoAnt = await despesas.totalPorRubrica(anoAnt);
  const despesasRealizadoAnoAnt = {};
  const despesasPorRubricaPrev = {};
  for (const r of rubsAtivas) {
    if (r.terminadaEm) continue;
    const realizado = totaisAnoAnt[r.id]?.total || 0;
    despesasRealizadoAnoAnt[r.id] = realizado;
    despesasPorRubricaPrev[r.id] = realizado;
  }
  return { quotasAnoAnt, despesasRealizadoAnoAnt, despesasPorRubricaPrev };
}

export async function editarComoNovaVersao(ano, operatorName) {
  const aprovado = await obterAtivo(ano);
  if (!aprovado || aprovado.estado !== 'aprovado') {
    throw new Error('Só orçamentos aprovados podem ser revistos.');
  }
  aprovado.estado = 'arquivado';
  aprovado.arquivadoEm = Date.now();
  await store.setDoc('orcamentos', aprovado);
  const novo = {
    ...aprovado,
    id: `orc-${aprovado.ano}-${uid().slice(0, 8)}`,
    versao: (aprovado.versao || 1) + 1,
    estado: 'rascunho',
    criadoEm: Date.now(),
    criadoPor: operatorName || null,
    aprovadoEm: null,
    aprovadoPor: null
  };
  delete novo.arquivadoEm;
  return await store.setDoc('orcamentos', novo);
}

export async function atualizar(orcamentoId, updates) {
  const orc = await store.getDoc('orcamentos', orcamentoId);
  if (!orc) throw new Error('Orçamento não encontrado.');
  if (orc.estado !== 'rascunho') throw new Error('Apenas rascunhos são editáveis.');
  const merged = { ...orc, ...updates, id: orc.id, estado: 'rascunho' };
  return await store.setDoc('orcamentos', merged);
}

export async function aprovar(orcamentoId, operatorName) {
  const orc = await store.getDoc('orcamentos', orcamentoId);
  if (!orc) throw new Error('Orçamento não encontrado.');
  if (orc.estado !== 'rascunho') throw new Error('Apenas rascunhos podem ser aprovados.');
  orc.estado = 'aprovado';
  orc.aprovadoEm = Date.now();
  orc.aprovadoPor = operatorName || null;
  await store.setDoc('orcamentos', orc);
  await aplicarQuotasAosTenants(orc);
  return orc;
}

async function aplicarQuotasAosTenants(orc) {
  const quotas = orc.quotas?.quotasMensaisPorTenant || {};
  const tenants = await store.listDocs('tenants');
  for (const t of tenants) {
    if (quotas[t.id] === undefined) continue;
    t.rentByYear = t.rentByYear || {};
    t.rentByYear[orc.ano] = quotas[t.id];
    await store.setDoc('tenants', t);
  }
}

export async function descartarRascunho(orcamentoId) {
  const orc = await store.getDoc('orcamentos', orcamentoId);
  if (!orc) return;
  if (orc.estado !== 'rascunho') throw new Error('Apenas rascunhos podem ser descartados.');
  await store.deleteDoc('orcamentos', orcamentoId);
}

// ───────────────────────── CÁLCULOS ─────────────────────────

export function calcularQuotaComIncremento(quotaBase_centimos, incrementoPct, arredondamento) {
  const sem = quotaBase_centimos * (1 + (incrementoPct || 0) / 100);
  switch (arredondamento) {
    case 'inteiro': return Math.round(sem / 100) * 100;
    case 'meio':    return Math.round(sem / 50) * 50;
    case 'cent':
    default:        return Math.round(sem);
  }
}

export function recalcularQuotas(orc) {
  const base = orc.quotas?.quotasMensaisAnoAnt || {};
  const pct = orc.quotas?.incrementoPct || 0;
  const arr = orc.quotas?.arredondamento || 'inteiro';
  const out = {};
  for (const [tid, val] of Object.entries(base)) {
    out[tid] = calcularQuotaComIncremento(val, pct, arr);
  }
  return out;
}

export function recalcularDespesas(orc) {
  const base = orc.despesas?.realizadoAnoAnt || {};
  const pct = orc.despesas?.incrementoPctMassa || 0;
  const out = {};
  for (const [rid, val] of Object.entries(base)) {
    out[rid] = Math.round(val * (1 + pct / 100));
  }
  return out;
}

export function calcularTotais(orc) {
  const quotasMensais = orc.quotas?.quotasMensaisPorTenant || {};
  const totalMensalQuotas = Object.values(quotasMensais).reduce((s, v) => s + (v || 0), 0);
  const valorAnualQuotas = totalMensalQuotas * 12;
  const outrasReceitas = (orc.outrasReceitas || [])
    .reduce((s, r) => s + (r.valor_centimos || 0), 0);
  const receitasTotal = valorAnualQuotas + outrasReceitas;
  const despesasPorRub = Object.values(orc.despesas?.porRubrica || {})
    .reduce((s, v) => s + (v || 0), 0);
  const despesasManuais = (orc.despesas?.manuais || [])
    .reduce((s, m) => s + (m.valor_centimos || 0), 0);
  const despesasTotal = despesasPorRub + despesasManuais;
  const fundoReserva = orc.fundoReserva_centimos || 0;
  const saldoInicial = orc.saldoInicial_centimos || 0;
  const resultadoEsperado = saldoInicial + receitasTotal - despesasTotal - fundoReserva;
  return {
    saldoInicial, valorAnualQuotas, totalMensalQuotas, outrasReceitas,
    receitasTotal, despesasPorRub, despesasManuais, despesasTotal,
    fundoReserva, resultadoEsperado
  };
}

// ───────────────────────── EXECUÇÃO (Análise) ─────────────────────────

export async function execucaoPorRubrica(ano) {
  const orc = await obterAtivo(ano);
  if (!orc || orc.estado === 'rascunho') return [];
  const realizadoPorRub = await despesas.totalPorRubrica(ano);
  const listaRub = await rubricas.listar();
  const mapaNomes = Object.fromEntries(listaRub.map(r => [r.id, r.nome]));
  const linhas = [];
  const todosIds = new Set([
    ...Object.keys(orc.despesas?.porRubrica || {}),
    ...Object.keys(realizadoPorRub)
  ]);
  for (const rubId of todosIds) {
    const orcado = orc.despesas?.porRubrica?.[rubId] || 0;
    const realizado = realizadoPorRub[rubId]?.total || 0;
    const pct = orcado > 0 ? Math.round(realizado / orcado * 100) : null;
    let status;
    if (orcado === 0) status = realizado > 0 ? 'fora-orcamento' : 'sem-movimento';
    else if (realizado > orcado) status = 'ultrapassado';
    else if (realizado >= orcado * 0.8) status = 'alerta';
    else status = 'ok';
    linhas.push({
      rubricaId: rubId,
      nome: mapaNomes[rubId] || realizadoPorRub[rubId]?.nome || 'Rúbrica eliminada',
      orcado_centimos: orcado,
      realizado_centimos: realizado,
      diferenca_centimos: orcado - realizado,
      percentagem: pct,
      status
    });
  }
  const ordem = { 'ultrapassado': 0, 'fora-orcamento': 1, 'alerta': 2, 'ok': 3, 'sem-movimento': 4 };
  linhas.sort((a, b) => {
    const oa = ordem[a.status], ob = ordem[b.status];
    if (oa !== ob) return oa - ob;
    return b.realizado_centimos - a.realizado_centimos;
  });
  return linhas;
}

export async function execucaoSumario(ano) {
  const orc = await obterAtivo(ano);
  if (!orc) return null;
  const totais = calcularTotais(orc);
  const realizadoDespesas = await despesas.totalAno(ano);
  // Recibos marcados "histórico/auditoria-only" não contam para realizado vs orçado
  const recs = (await store.queryDocs('receipts', { ano }))
    .filter(r => !r.cancelado && !r.excluirDeContagem)
    .reduce((s, r) => s + (r.valor_centimos || 0), 0);
  const outros = (await store.queryDocs('outrosRecebimentos', { ano }))
    .filter(o => !o.cancelado)
    .reduce((s, o) => s + (o.valor_centimos || 0), 0);
  const realizadoReceitas = recs + outros;
  return {
    estado: orc.estado,
    versao: orc.versao,
    aprovadoEm: orc.aprovadoEm,
    aprovadoPor: orc.aprovadoPor,
    receitas: {
      orcado: totais.receitasTotal,
      realizado: realizadoReceitas,
      pct: totais.receitasTotal > 0 ? Math.round(realizadoReceitas / totais.receitasTotal * 100) : null
    },
    despesas: {
      orcado: totais.despesasTotal,
      realizado: realizadoDespesas,
      pct: totais.despesasTotal > 0 ? Math.round(realizadoDespesas / totais.despesasTotal * 100) : null
    },
    fundoReserva: totais.fundoReserva,
    saldoInicial: totais.saldoInicial,
    resultadoEsperado: totais.resultadoEsperado,
    resultadoReal: totais.saldoInicial + realizadoReceitas - realizadoDespesas
  };
}

export async function historicoVersoes(ano) {
  const list = await store.queryDocs('orcamentos', { ano });
  return list.sort((a, b) => (b.versao || 1) - (a.versao || 1));
}
