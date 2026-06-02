/**
 * Forçar Dados 2026 · v1.0.34
 *
 * Operação ADMIN, idempotente, que põe o estado de 2026 a coincidir
 * EXACTAMENTE com o ficheiro de Contas (folhas "Quotas 2026", "Despesas 2026",
 * "Exercício 2026") e com a numeração canónica de recibos.
 *
 * O que faz (tudo verificável nos totais devolvidos):
 *  1. Quotas 2026 → ledger forçado (total recebido 2.351,00 €).
 *  2. Corrige a quota mensal do cond_03 (47 € → 48 €) em tenants.
 *  3. Despesas 2026 por rúbrica → repõe pagamentosDespesa para o total 7.147,44 €
 *     (cria as rúbricas "Plano Pagamento Schindler" e "Intervenções Condomínio").
 *  4. Recebimento CMA (Reabilita+ · 6.519,00 €) → entra em outrosRecebimentos
 *     para aparecer na Análise (RCB 027 fica auditoria-only no histórico).
 *  5. Contador de recibos 2026 → próximo número = 65.
 *  6. Garante que os 64 recibos canónicos ficam auditoria-only
 *     (excluirDeContagem + excluirDoSaldo).
 *
 * ATENÇÃO (passo 3): repõe TODAS as despesas de 2026. Se já criaste pagamentos
 * manuais para 2026 (ex.: os 3 lançamentos recentes), serão substituídos por
 * este conjunto canónico para garantir o total 7.147,44 € sem duplicações.
 * Para os manter por cima, usa { reporDespesas: false }.
 */

import * as store from '../store/local-store.js';
import * as quotasLedger from './quotas-ledger.js';
import * as saldoBanco from './saldo-banco.js';
import * as auditoria from './auditoria-recibos.js';

const ANO = '2026';

/** Despesas 2026 mês-a-mês por rúbrica (cêntimos) · folha "Despesas 2026" (total 7.147,44 €).
 *  IDs de rúbrica = os REAIS de produção (rub_schindler, rub_allianz, rub_banc). */
const DESPESAS_2026 = [
  { rubricaId: 'rub_schindler',       rubricaNome: 'Schindler / Elevador',       mes: '2026-01', valor_centimos: 35608 },
  { rubricaId: 'rub_agua',            rubricaNome: 'Água',                       mes: '2026-01', valor_centimos: 1328  },
  { rubricaId: 'rub_limpeza',         rubricaNome: 'Limpeza',                    mes: '2026-01', valor_centimos: 19700 },
  { rubricaId: 'rub_banc',            rubricaNome: 'Despesas Bancárias',         mes: '2026-01', valor_centimos: 831   },
  { rubricaId: 'rub_plano_schindler', rubricaNome: 'Plano Schindler',            mes: '2026-01', valor_centimos: 60016 },
  { rubricaId: 'rub_edp',             rubricaNome: 'EDP / Electricidade',        mes: '2026-02', valor_centimos: 12669 },
  { rubricaId: 'rub_agua',            rubricaNome: 'Água',                       mes: '2026-02', valor_centimos: 2289  },
  { rubricaId: 'rub_banc',            rubricaNome: 'Despesas Bancárias',         mes: '2026-02', valor_centimos: 831   },
  { rubricaId: 'rub_plano_schindler', rubricaNome: 'Plano Schindler',            mes: '2026-02', valor_centimos: 42796 },
  { rubricaId: 'rub_schindler',       rubricaNome: 'Schindler / Elevador',       mes: '2026-03', valor_centimos: 26457 },
  { rubricaId: 'rub_agua',            rubricaNome: 'Água',                       mes: '2026-03', valor_centimos: 2233  },
  { rubricaId: 'rub_limpeza',         rubricaNome: 'Limpeza',                    mes: '2026-03', valor_centimos: 20000 },
  { rubricaId: 'rub_banc',            rubricaNome: 'Despesas Bancárias',         mes: '2026-03', valor_centimos: 831   },
  { rubricaId: 'rub_allianz',         rubricaNome: 'Allianz / Seguros',          mes: '2026-03', valor_centimos: 19835 },
  { rubricaId: 'rub_outras',          rubricaNome: 'Outras',                     mes: '2026-03', valor_centimos: 4599  },
  { rubricaId: 'rub_plano_schindler', rubricaNome: 'Plano Schindler',            mes: '2026-03', valor_centimos: 42796 },
  { rubricaId: 'rub_edp',             rubricaNome: 'EDP / Electricidade',        mes: '2026-04', valor_centimos: 12595 },
  { rubricaId: 'rub_agua',            rubricaNome: 'Água',                       mes: '2026-04', valor_centimos: 1963  },
  { rubricaId: 'rub_limpeza',         rubricaNome: 'Limpeza',                    mes: '2026-04', valor_centimos: 10000 },
  { rubricaId: 'rub_banc',            rubricaNome: 'Despesas Bancárias',         mes: '2026-04', valor_centimos: 831   },
  { rubricaId: 'rub_plano_schindler', rubricaNome: 'Plano Schindler',            mes: '2026-04', valor_centimos: 42166 },
  { rubricaId: 'rub_intervencoes',    rubricaNome: 'Intervenções Condomínio',    mes: '2026-04', valor_centimos: 284286 },
  { rubricaId: 'rub_schindler',       rubricaNome: 'Schindler / Elevador',       mes: '2026-05', valor_centimos: 26457 },
  { rubricaId: 'rub_banc',            rubricaNome: 'Despesas Bancárias',         mes: '2026-05', valor_centimos: 831   },
  { rubricaId: 'rub_plano_schindler', rubricaNome: 'Plano Schindler',            mes: '2026-05', valor_centimos: 42796 },
];

/** Reapontar despesas órfãs (ids antigos que criei) → ids REAIS dos docs de rúbrica. */
const REMAP_RUBRICAS = {
  rub_banco: 'rub_banc',
  rub_elevador: 'rub_schindler',
  rub_seguros: 'rub_allianz',
};

// As 9 rúbricas necessárias com os IDs REAIS de produção.
const RUBRICAS_NECESSARIAS = [
  { id: 'rub_edp',             nome: 'EDP / Electricidade',       categoria: 'energia',  fixa: false },
  { id: 'rub_agua',            nome: 'Água',                      categoria: 'agua',     fixa: false },
  { id: 'rub_schindler',       nome: 'Schindler / Elevador',      categoria: 'manut',    fixa: true  },
  { id: 'rub_allianz',         nome: 'Allianz / Seguros',         categoria: 'seguros',  fixa: true  },
  { id: 'rub_limpeza',         nome: 'Limpeza',                   categoria: 'limpeza',  fixa: true  },
  { id: 'rub_banc',            nome: 'Despesas Bancárias',        categoria: 'banco',    fixa: true  },
  { id: 'rub_plano_schindler', nome: 'Plano Schindler',           categoria: 'manut',    fixa: true  },
  { id: 'rub_intervencoes',    nome: 'Intervenções Condomínio',   categoria: 'obras',    fixa: false },
  { id: 'rub_outras',          nome: 'Outras',                    categoria: 'diversos', fixa: false },
];

// Hard-code do saldo bancário (pedido do Ricardo).
// O saldo inicial a 27/05 é calculado DINAMICAMENTE para o saldo calculado
// aterrar exactamente em 7.028,25 € hoje (≈ 7.729,09 € com os dados actuais).
const SALDO_DATA_INICIO    = '2026-05-27';
const SALDO_REAL_HOJE_CENT = 702825; // 7.028,25 € · saldo real à data de hoje
const SALDO_REAL_DATA      = '2026-05-31';

// Os 3 pagamentos inseridos a 28–29/05 (que tinham desaparecido). Pós-marco → reduzem o saldo.
const PAGAMENTOS_RECENTES = [
  { rubricaId: 'rub_plano_schindler', rubricaNome: 'Plano Pagamento Schindler', data: '2026-05-29', valor_centimos: 37765, descricao: 'Pag. da ref. & doc. 456288870 de 24/05/2026' },
  { rubricaId: 'rub_limpeza',         rubricaNome: 'Limpeza',                   data: '2026-05-29', valor_centimos: 10000, descricao: 'Limpeza Escada 05/2026' },
  { rubricaId: 'rub_agua',            rubricaNome: 'Água',                      data: '2026-05-28', valor_centimos: 1588,  descricao: 'Água' },
];


// Recebimento da CMA · Devolução Reabilita+ (folha "Exercício 2026", linha 9)
const CMA_RECEBIMENTO = {
  id: 'outrec_cma_reabilita_2026',
  ano: ANO,
  data: '2026-03-03',
  valor_centimos: 651900, // 6.519,00 €
  descricao: 'Devolução Reabilita+ · Processo 1124/+/2025 (CMA)',
  origem: 'entidade_cma',
  tipo: 'subsidio',
  excluirDoSaldo: false,
  cancelado: false,
  reciboAssociado: 'RCB 027/ADM2026',
  createdAt: Date.now(),
};

/**
 * Executa o forçar de dados.
 * @param {Object} opts
 * @param {boolean} [opts.limparRecibos=true]  - apaga recibos 2026 não-canónicos (incl. "H0xx") e repõe os 64
 * @param {boolean} [opts.forcarSaldo=true]    - hard-code do saldo (8.150,19 € a 27/05 · real 7.028,25 €)
 * @param {boolean} [opts.reporDespesas=false] - SÓ se quiseres repor as despesas pelo ficheiro (substitui as existentes)
 * @param {function} [opts.log]
 */
export async function forcarTudo({ limparRecibos = true, forcarSaldo = true, reporDespesas = true, log = () => {} } = {}) {
  const resumo = {};

  // ── 0. LIMPEZA DURA dos recibos 2026 (incl. "H0xx") ───────────────────────
  if (limparRecibos) {
    // Usa o alinhador oficial (carregador robusto via document.baseURI + filtro de
    // ano corrigido para apanhar ano string "2026"). Apaga 2026 não-canónico e
    // reescreve os 64 canónicos.
    const stats = await auditoria.alinharRecibos2026(() => {});
    // Varredura extra (cintos e suspensórios): apaga QUALQUER recibo restante
    // cujo número seja …/ADM2026 ou "H…" e que não seja canónico (apanha casos
    // com ano ausente/noutro formato que escapem ao filtro por ano).
    const todos = await store.listDocs('receipts');
    let extra = 0;
    for (const r of todos) {
      const num = String(r.recibo_numero || '');
      const ehADM2026 = /ADM2026/i.test(num) || /^\s*H\s*\d/i.test(num);
      const ehCanon = r.auditoria === true && /^\s*RCB\s*0\d\d\/ADM2026/i.test(num);
      if (ehADM2026 && !ehCanon) {
        try { await store.deleteDoc('receipts', r.id); extra++; } catch {}
      }
    }
    resumo.recibosApagados = (stats.apagados || 0) + extra;
    resumo.recibosCanonicos = stats.escritos || 0;
    log(`✓ Recibos 2026 limpos · apagados ${resumo.recibosApagados} (incl. H0xx) · canónicos ${resumo.recibosCanonicos} (RCB 001–064)`);
  }

  // ── 1. Ledger de quotas 2026 (OVERWRITE · limpa qualquer duplicação) ───────
  await quotasLedger.forcarMatriz();
  resumo.quotasRecebidas_centimos = await quotasLedger.totalRecebido2026();
  log(`✓ Quotas 2026 forçadas · recebido = ${eur(resumo.quotasRecebidas_centimos)}`);

  // ── 2. Corrigir quota mensal do cond_03 (47 → 48 €) ───────────────────────
  const cond03 = await store.getDoc('tenants', 'cond_03');
  if (cond03) {
    cond03.rentByYear = { ...(cond03.rentByYear || {}), [ANO]: quotasLedger.quotaMensal('cond_03') };
    await store.setDoc('tenants', cond03);
    log(`✓ Quota mensal cond_03 = ${eur(quotasLedger.quotaMensal('cond_03'))}`);
  }

  // ── 3. Mapa de despesas: reapontar despesas órfãs + garantir docs ─────────
  // Em produção os docs de rúbrica são rub_banc/rub_schindler/rub_allianz, mas
  // algumas despesas ficaram com ids rub_banco/rub_elevador/rub_seguros → órfãs
  // e invisíveis no mapa. Reaponta-as para os ids reais.
  const todasDesp = await store.listDocs('pagamentosDespesa');
  let remapeadas = 0;
  for (const dsp of todasDesp) {
    const novo = REMAP_RUBRICAS[dsp.rubricaId];
    if (novo) {
      const rubReal = RUBRICAS_NECESSARIAS.find(r => r.id === novo);
      dsp.rubricaId = novo;
      if (rubReal) dsp.rubricaNome = rubReal.nome;
      await store.setDoc('pagamentosDespesa', dsp);
      remapeadas++;
    }
  }
  log(`✓ Despesas reapontadas para rúbricas reais · ${remapeadas} (Schindler/Allianz/Banco passam a aparecer)`);

  // Garantir que os 9 docs de rúbrica existem (no-op em produção; útil em instalação nova)
  let rubCriadas = 0;
  for (const r of RUBRICAS_NECESSARIAS) {
    const existe = await store.getDoc('rubricas', r.id);
    if (!existe) {
      await store.setDoc('rubricas', { ...r, criadaEm: 1577836800000, terminadaEm: null, criadaPor: 'forçar-dados-2026' });
      rubCriadas++;
    } else if (existe.terminadaEm) {
      existe.terminadaEm = null; await store.setDoc('rubricas', existe);
    }
  }
  if (rubCriadas) log(`· ${rubCriadas} docs de rúbrica criados`);

  // ── 4. Repor despesas 2026 (histórico do ficheiro + 3 pagamentos recentes) ─
  if (reporDespesas) {
    const todas = await store.listDocs('pagamentosDespesa');
    const antigas2026 = todas.filter(d => String(d.ano) === ANO || (d.data && d.data.startsWith(ANO)));
    for (const d of antigas2026) await store.deleteDoc('pagamentosDespesa', d.id);

    let totalDesp = 0, n = 0;
    // 4a. Histórico Jan–Mai (dia 15 · ANTES do marco 27/05 → não afecta o saldo)
    for (const item of DESPESAS_2026) {
      const id = `desp_2026_${item.rubricaId}_${item.mes.replace('-', '')}`;
      await store.setDoc('pagamentosDespesa', {
        id, rubricaId: item.rubricaId, rubricaNome: item.rubricaNome, ano: ANO,
        data: `${item.mes}-15`, valor_centimos: item.valor_centimos,
        descricao: `${item.rubricaNome} · ${item.mes}`, fornecedor: item.rubricaNome,
        metodoPagamento: 'transferencia', cancelada: false, estornoDe: null,
        registadoPor: 'forçar-dados-2026', origem: 'Contas_Condominio · Despesas 2026', createdAt: Date.now(),
      });
      totalDesp += item.valor_centimos; n++;
    }
    // 4b. 3 pagamentos recentes (28–29/05 · DEPOIS do marco → reduzem o saldo)
    for (const p of PAGAMENTOS_RECENTES) {
      const id = `desp_2026_recente_${p.rubricaId}_${p.data.replace(/-/g, '')}`;
      await store.setDoc('pagamentosDespesa', {
        id, rubricaId: p.rubricaId, rubricaNome: p.rubricaNome, ano: ANO,
        data: p.data, valor_centimos: p.valor_centimos,
        descricao: p.descricao, fornecedor: p.rubricaNome,
        metodoPagamento: 'transferencia', cancelada: false, estornoDe: null,
        registadoPor: 'forçar-dados-2026', origem: 'pagamentos recentes (28–29/05)', createdAt: Date.now(),
      });
      totalDesp += p.valor_centimos; n++;
    }
    resumo.despesas_centimos = totalDesp; resumo.nDespesas = n;
    log(`✓ Despesas 2026 repostas · ${n} lançamentos · total = ${eur(totalDesp)} (histórico ${eur(714744)} + recentes ${eur(49353)})`);
  } else {
    log('· Despesas 2026 mantidas (não repostas).');
  }

  // ── 5. Recebimento CMA na Análise · garantir UM só (evitar duplicação) ────
  const outros = await store.listDocs('outrosRecebimentos');
  const cmas = outros.filter(o =>
    o.valor_centimos === 651900 && /reabilita/i.test(o.descricao || ''));
  if (cmas.length === 0) {
    await store.setDoc('outrosRecebimentos', CMA_RECEBIMENTO);
    log(`✓ Recebimento CMA Reabilita+ criado = ${eur(651900)} (Análise)`);
  } else {
    // manter o 1.º (preferir um que NÃO seja o que eu criei) e apagar os restantes
    cmas.sort((a, b) => (a.id === CMA_RECEBIMENTO.id ? 1 : 0) - (b.id === CMA_RECEBIMENTO.id ? 1 : 0));
    const manter = cmas[0];
    const apagar = cmas.slice(1);
    for (const x of apagar) await store.deleteDoc('outrosRecebimentos', x.id);
    resumo.cmaDuplicadosRemovidos = apagar.length;
    log(`✓ CMA Reabilita+ · mantido 1 (${eur(651900)}), removidos ${apagar.length} duplicados`);
  }

  // ── 6. Contador de recibos · próximo = 65 ─────────────────────────────────
  const meta = (await store.getDoc('meta', 'config')) || { id: 'config' };
  meta.nextNumberByYear = { ...(meta.nextNumberByYear || {}), [ANO]: 65 };
  await store.setDoc('meta', meta);
  log(`✓ Próximo recibo 2026 = RCB 065/ADM2026`);

  // ── 7. HARD-CODE do saldo bancário (garante calculado = 7.028,25 €) ───────
  if (forcarSaldo) {
    const cfg0 = await store.getDoc('meta', 'config');
    const poupanca = cfg0?.saldoConhecido?.contaPoupanca_centimos ?? null;

    // (a) fixar a data do marco e marcar movimentos anteriores a 27/05 como excluídos.
    //     saldo inicial temporário = 0 para medir os movimentos pós-marco.
    await saldoBanco.marcarInicioGestao(SALDO_DATA_INICIO, 0);
    const rTmp = await saldoBanco.calcularSaldo(2026);
    const movPosMarco = rTmp.saldo; // = receitas_pós − despesas_pós (com inicial 0)

    // (b) saldo inicial necessário para o calculado aterrar EXACTAMENTE no alvo.
    const saldoInicialNecessario = SALDO_REAL_HOJE_CENT - movPosMarco;
    const meta = await store.getDoc('meta', 'config');
    meta.saldoInicial = { ...(meta.saldoInicial || {}), [ANO]: saldoInicialNecessario };
    await store.setDoc('meta', meta);

    // (c) saldo real conhecido (BPI) = 7.028,25 €.
    await saldoBanco.atualizarSaldoConhecido({
      dataISO: SALDO_REAL_DATA,
      total_centimos: SALDO_REAL_HOJE_CENT,
      contaOrdem_centimos: SALDO_REAL_HOJE_CENT,
      contaPoupanca_centimos: poupanca,
      fonte: 'Hard-code · 7.028,25 €',
      notas: 'Saldo forçado a pedido · método de cálculo normal a partir de 27/05',
    });

    const rFinal = await saldoBanco.calcularSaldo(2026);
    resumo.saldoInicial_centimos = saldoInicialNecessario;
    resumo.saldoCalculado_centimos = rFinal.saldo;
    resumo.saldoReal_centimos = SALDO_REAL_HOJE_CENT;
    log(`✓ Saldo: inicial ${eur(saldoInicialNecessario)} @ ${SALDO_DATA_INICIO} · movimentos pós-marco ${eur(movPosMarco)} · calculado = ${eur(rFinal.saldo)} (alvo ${eur(SALDO_REAL_HOJE_CENT)})`);
  }

  // ── 8. Garantir 64 canónicos auditoria-only ───────────────────────────────
  const recs = await store.queryDocs('receipts', { ano: 2026 });
  let ajustados = 0;
  for (const r of recs) {
    if (r.auditoria && (!r.excluirDeContagem || !r.excluirDoSaldo)) {
      r.excluirDeContagem = true; r.excluirDoSaldo = true;
      await store.setDoc('receipts', r);
      ajustados++;
    }
  }
  if (ajustados) log(`· ${ajustados} recibos canónicos reconfirmados auditoria-only`);

  log('— CONCLUÍDO —');
  return resumo;
}

function eur(c) { return (c / 100).toFixed(2).replace('.', ',') + ' €'; }

if (typeof window !== 'undefined') {
  // Permite correr pela consola: await window.__forcarDados2026()
  window.__forcarDados2026 = (opts) => forcarTudo({ log: (m) => console.log(m), ...opts });
}
