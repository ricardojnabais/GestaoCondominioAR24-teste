/**
 * Quotas Ledger · v1.0.34
 *
 * PROBLEMA QUE RESOLVE
 * --------------------
 * Até à v1.0.33 a tabela de Quotas era DERIVADA dos recibos (via mesReferencia).
 * Os 64 recibos canónicos de 2026 misturavam meses de 2025 e 2026 e duplicavam
 * valores, pelo que o alinhamento partiu a contagem. O workaround (excluirDeContagem
 * em todos os canónicos) deixou a tabela VAZIA.
 *
 * NOVA ABORDAGEM
 * --------------
 * As quotas 2026 deixam de ser derivadas dos recibos. Passam a viver num
 * "ledger" explícito e forçado, guardado num único doc `meta/quotas2026`:
 *
 *   {
 *     id: 'quotas2026',
 *     ano: '2026',
 *     quotaMensal: { cond_01: 3200, ... },      // cêntimos (referência)
 *     pagamentos:  { cond_01: { '2026-05': 3200, ... }, ... }, // cêntimos por mês pago
 *     forcadoEm, origem
 *   }
 *
 * - Os 64 recibos canónicos ficam auditoria-only (numeração intacta, próximo = 65).
 * - A matriz inicial é forçada para coincidir EXACTAMENTE com a folha
 *   "Quotas 2026" do ficheiro de Contas (total recebido 2026 = 2.351,00 €).
 * - A partir de Junho/2026, cada novo recibo de quota (emitido pela app, nº 65+)
 *   actualiza este ledger. Pagamentos de meses em atraso entram como quota nova.
 *
 * Vantagem: nenhuma coleção nova (evita o checklist das 4 etapas e o bug v1.0.26).
 */

import * as store from '../store/local-store.js';

export const LEDGER_ID = 'quotas2026';
export const ANO = '2026';

/** Quota mensal por fração em 2026 (cêntimos) · folha "Quotas 2026", linha 5. */
export const QUOTA_MENSAL_2026 = {
  cond_01: 3200, // R/C Esq · João Vaz
  cond_02: 3700, // R/C Dto · Filipe Solha
  cond_03: 4800, // 1.º Esq · Leonel Venâncio  (48 € — corrige os 47 € do seed antigo)
  cond_04: 3600, // 1.º Dto · Sílvia Gonçalves
  cond_05: 4900, // 2.º Esq · Ricardo Nabais Cordeiro
  cond_06: 3600, // 2.º Dto · António Figueiredo
  cond_07: 4700, // 3.º Esq · Nuno Pereira Silva
  cond_08: 3600, // 3.º Dto · Lurdes Serafim
  cond_09: 5100, // 4.º Esq · J. C. Monteiro
  cond_10: 3600, // 4.º Dto · Vitor Barata
};

/**
 * Último mês PAGO por fração (inclusive), em 2026.
 * Fonte: folha "Quotas 2026" (bloco Receitas 2026 + linha 23 "Última quota paga").
 *   cond_07 só pagou Jan-Mar (em atraso Abr/Mai) → 94 € em falta.
 *   cond_03 pagou até Junho · cond_09 pagou o ano todo (Jan-Dez).
 * Total recebido 2026 = 2.351,00 € (validado).
 */
const ULTIMO_MES_PAGO_2026 = {
  cond_01: 5,  cond_02: 5,  cond_03: 6,  cond_04: 5,  cond_05: 5,
  cond_06: 5,  cond_07: 3,  cond_08: 5,  cond_09: 12, cond_10: 5,
};

/** Constrói a matriz de pagamentos forçada (cêntimos) a partir das tabelas acima. */
export function construirMatrizForcada() {
  const pagamentos = {};
  for (const [tid, ultimoMes] of Object.entries(ULTIMO_MES_PAGO_2026)) {
    pagamentos[tid] = {};
    for (let m = 1; m <= ultimoMes; m++) {
      const mref = `${ANO}-${String(m).padStart(2, '0')}`;
      pagamentos[tid][mref] = QUOTA_MENSAL_2026[tid];
    }
  }
  return pagamentos;
}

/** Lê o ledger 2026 (ou null se ainda não foi forçado). */
export async function getLedger() {
  return store.getDoc('meta', LEDGER_ID);
}

/**
 * Valor de quota pago por um condómino num mês (cêntimos).
 *  - 2026: SEMPRE servido pelo ledger (0 se ainda não foi forçado).
 *    Nunca lê recibos → impossível duplicar.
 *  - Outros anos: devolve null (o chamador usa o cálculo legado por recibos).
 */
export async function valorPagoNoMes2026(tenantId, mesRef) {
  if (!mesRef || !mesRef.startsWith(ANO)) return null;
  const ledger = await getLedger();
  return ledger?.pagamentos?.[tenantId]?.[mesRef] || 0;
}

/** Quota mensal de referência de um condómino (cêntimos). */
export function quotaMensal(tenantId) {
  return QUOTA_MENSAL_2026[tenantId] || 0;
}

/**
 * Regista no ledger o pagamento de quotas 2026 (chamado após emitir recibo real).
 * @param {string} tenantId
 * @param {Array<string>} meses - ['2026-06', ...] (apenas meses de 2026 são aplicados)
 * @param {number} valorTotal_centimos - valor coberto pelas quotas (sem extras)
 *
 * Distribui o valor coberto pelos meses indicados. Se cobrir totalmente o mês,
 * marca a quota cheia; caso contrário soma o que falta (suporta pagamentos parciais).
 */
export async function registarPagamento(tenantId, meses, valorTotal_centimos) {
  const meses2026 = (meses || []).filter(m => m && m.startsWith(ANO));
  if (meses2026.length === 0) return null;

  let ledger = await getLedger();
  if (!ledger) {
    // v1.0.35 · cria ledger VAZIO (NUNCA a matriz inteira).
    // Inicializar com a matriz forçada aqui era o que causava a duplicação
    // (matriz 1× + pagamento 1× = 2× em todos os meses).
    ledger = {
      id: LEDGER_ID, ano: ANO,
      quotaMensal: { ...QUOTA_MENSAL_2026 },
      pagamentos: {},
      criadoEm: new Date().toISOString(),
      origem: 'criado por registo de pagamento',
    };
  }
  if (!ledger.pagamentos[tenantId]) ledger.pagamentos[tenantId] = {};

  const porMes = Math.round((valorTotal_centimos || 0) / meses2026.length);
  for (const mref of meses2026.sort()) {
    const atual = ledger.pagamentos[tenantId][mref] || 0;
    ledger.pagamentos[tenantId][mref] = atual + porMes;
  }
  ledger.atualizadoEm = new Date().toISOString();
  return store.setDoc('meta', ledger);
}

/**
 * FORÇA a matriz 2026 para coincidir exactamente com a folha "Quotas 2026".
 * Sobrescreve o ledger inteiro (operação idempotente).
 */
export async function forcarMatriz({ silent = false } = {}) {
  const doc = {
    id: LEDGER_ID,
    ano: ANO,
    quotaMensal: { ...QUOTA_MENSAL_2026 },
    pagamentos: construirMatrizForcada(),
    forcadoEm: new Date().toISOString(),
    origem: 'Contas_Condominio · folha "Quotas 2026" · forçado v1.0.34',
  };
  const saved = await store.setDoc('meta', doc);
  if (!silent) {
    const total = Object.values(doc.pagamentos)
      .reduce((s, m) => s + Object.values(m).reduce((a, b) => a + b, 0), 0);
    console.log(`[quotas-ledger] Matriz 2026 forçada · total recebido = ${(total / 100).toFixed(2)} €`);
  }
  return saved;
}

/** Total de quotas recebidas em 2026 segundo o ledger (cêntimos). */
export async function totalRecebido2026() {
  const ledger = await getLedger();
  if (!ledger?.pagamentos) return 0;
  return Object.values(ledger.pagamentos)
    .reduce((s, m) => s + Object.values(m).reduce((a, b) => a + b, 0), 0);
}

/* ─────────────────────────────────────────────────────────────────────────
 * ESTADO DA QUOTA MENSAL (v1.0.40)
 * Dia-limite de pagamento = dia 8 do próprio mês.
 *   - 'pago'         : pago na totalidade
 *   - 'a_pagamento'  : dentro do prazo (dia 1 a 8 do mês), ainda não pago
 *   - 'atraso'       : após o dia 8 (ou mês passado), ainda não pago
 *   - 'futuro'       : mês ainda não começou
 * ──────────────────────────────────────────────────────────────────────── */
export const DIA_LIMITE_PAGAMENTO = 8;

export const ESTADO_QUOTA = {
  pago:        { label: 'Pago',        cor: '#047857', bg: 'rgba(16,185,129,.12)' },
  a_pagamento: { label: 'A pagamento', cor: '#1d4ed8', bg: 'rgba(59,130,246,.12)' },
  atraso:      { label: 'Em atraso',   cor: '#B91C1C', bg: 'rgba(239,68,68,.10)'  },
  futuro:      { label: 'A vencer',    cor: '#6b7280', bg: 'transparent'          },
};

/**
 * Calcula o estado de uma quota mensal tendo em conta a data-limite (dia 8).
 * @param {number} pago_centimos  valor já pago no mês
 * @param {number} quota_centimos quota esperada do mês
 * @param {number} ano  ano (ex.: 2026)
 * @param {number} mes  mês 1-12
 * @param {Date}   hoje data de referência (default: agora)
 */
export function estadoQuotaMes({ pago_centimos = 0, quota_centimos = 0, ano, mes, hoje = new Date() }) {
  if (quota_centimos > 0 && pago_centimos >= quota_centimos) return 'pago';
  const inicio = new Date(ano, mes - 1, 1, 0, 0, 0, 0);
  const limite = new Date(ano, mes - 1, DIA_LIMITE_PAGAMENTO, 23, 59, 59, 999);
  if (hoje > limite) return 'atraso';        // passou o dia 8 (ou mês anterior)
  if (hoje >= inicio) return 'a_pagamento';  // dia 1 a 8 do mês corrente
  return 'futuro';                            // mês ainda não começou
}

/** Mesmo cálculo a partir de uma referência 'YYYY-MM'. */
export function estadoQuotaMref({ pago_centimos, quota_centimos, mref, hoje = new Date() }) {
  const ano = Number(mref.slice(0, 4));
  const mes = Number(mref.slice(5, 7));
  return estadoQuotaMes({ pago_centimos, quota_centimos, ano, mes, hoje });
}
