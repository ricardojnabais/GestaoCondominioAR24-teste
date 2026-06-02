/**
 * Dados iniciais para a versão de teste (localStorage).
 *
 * Carrega-se apenas se as coleções estiverem vazias (primeiro arranque).
 * Os 10 condóminos reais são preservados; valores de quotas vêm do backup
 * Firestore (condominio-backup-2026-05-04.json).
 */

import * as store from './local-store.js';

const ADMIN_EMAILS = [
  'ricardojnabais@gmail.com',
  'fsolha@gmail.com'
];

const TENANTS_SEED = [
  { id: 'cond_01', name: 'João Vaz',                fraction: 'R/C Esquerdo',  nif: '129465380', permilage: 79,  rentByYear: { '2026': 3200 }, email: '' },
  { id: 'cond_02', name: 'Filipe Solha',            fraction: 'R/C Direito',   nif: '219481342', permilage: 91,  rentByYear: { '2026': 3700 }, email: 'fsolha@gmail.com' },
  { id: 'cond_03', name: 'Leonel Venâncio',         fraction: '1.º Esquerdo',  nif: '209959746', permilage: 119, rentByYear: { '2026': 4800 }, email: 'leonelvenancio@gmail.com' },
  { id: 'cond_04', name: 'Sílvia Gonçalves',        fraction: '1.º Direito',   nif: '195084381', permilage: 87,  rentByYear: { '2026': 3600 }, email: 'spsg.silvia@gmail.com' },
  { id: 'cond_05', name: 'Ricardo Nabais Cordeiro', fraction: '2.º Esquerdo',  nif: '214490041', permilage: 121, rentByYear: { '2026': 4900 }, email: 'ricardojnabais@gmail.com' },
  { id: 'cond_06', name: 'António Figueiredo',      fraction: '2.º Direito',   nif: '101744137', permilage: 88,  rentByYear: { '2026': 3600 }, email: 'antoniopalmafigueiredo45@gmail.com' },
  { id: 'cond_07', name: 'Nuno P. Silva',           fraction: '3.º Esquerdo',  nif: '195611004', permilage: 115, rentByYear: { '2026': 4700 }, email: 'nunosp71@gmail.com' },
  { id: 'cond_08', name: 'Lurdes Serafim',          fraction: '3.º Direito',   nif: '127143980', permilage: 88,  rentByYear: { '2026': 3600 }, email: 'Jorgevtorres@gmail.com' },
  { id: 'cond_09', name: 'J. C. Monteiro',          fraction: '4.º Esquerdo',  nif: '182258637', permilage: 125, rentByYear: { '2026': 5100 }, email: 'carmontauto@gmail.com' },
  { id: 'cond_10', name: 'Vitor Barata',            fraction: '4.º Direito',   nif: '178132730', permilage: 87,  rentByYear: { '2026': 3600 }, email: 'vmhbarata@gmail.com' }
];

// Valores em cêntimos (€/100)
const META_SEED = {
  condominio: {
    nome: 'Condomínio Av. Amália Rodrigues, 24',
    morada: 'Av. Amália Rodrigues, 24, 2650-437 Amadora',
    nif: '901589381',
    iban: 'PT50 ...',
  },
  administracao: {
    nomes: ['Ricardo Nabais Cordeiro', 'Filipe Solha'],
    emails: ADMIN_EMAILS,
    emailContaCondominio: 'condoamira24@gmail.com'
  },
  saldoInicial: {
    '2026': 321400  // 3.214,00 €
  },
  nextNumberByYear: {
    '2024': 89,
    '2025': 147,
    '2026': 65
  },
  parametros: {
    inflacaoDefault: 0.10,
    moeda: 'EUR',
    locale: 'pt-PT'
  }
};

const RUBRICAS_SEED = [
  { id: 'rub_edp',       nome: 'EDP Eletricidade',  categoria: 'energia',   fixa: false, criadaEm: 1577836800000, terminadaEm: null },
  { id: 'rub_agua',      nome: 'Água',              categoria: 'agua',      fixa: false, criadaEm: 1577836800000, terminadaEm: null },
  { id: 'rub_elevador',  nome: 'Schindler Elevador',categoria: 'manut',     fixa: true,  criadaEm: 1577836800000, terminadaEm: null },
  { id: 'rub_seguros',   nome: 'Allianz Seguros',   categoria: 'seguros',   fixa: true,  criadaEm: 1577836800000, terminadaEm: null },
  { id: 'rub_limpeza',   nome: 'Limpeza',           categoria: 'limpeza',   fixa: true,  criadaEm: 1577836800000, terminadaEm: null },
  { id: 'rub_banco',     nome: 'Despesas Bancárias',categoria: 'banco',     fixa: true,  criadaEm: 1577836800000, terminadaEm: null },
  { id: 'rub_plano_schindler', nome: 'Plano Pagamento Schindler', categoria: 'manut', fixa: true, criadaEm: 1577836800000, terminadaEm: null },
  { id: 'rub_intervencoes',    nome: 'Intervenções Condomínio',   categoria: 'obras', fixa: false, criadaEm: 1577836800000, terminadaEm: null },
  { id: 'rub_outras',    nome: 'Outras',            categoria: 'diversos',  fixa: false, criadaEm: 1577836800000, terminadaEm: null }
];

// Recibos de exemplo (subset, ano 2026)
const RECEIPTS_SEED = [
  {
    id: 'rcb_2026_055', recibo_numero: '055/ADM2026', ano: '2026',
    tenantId: 'cond_05', data: '2026-05-08',
    valor_centimos: 4900, mesReferencia: ['2026-05'],
    descricao: 'Quota mensal Maio 2026', tipo: 'quota'
  },
  {
    id: 'rcb_2026_054', recibo_numero: '054/ADM2026', ano: '2026',
    tenantId: 'cond_02', data: '2026-05-05',
    valor_centimos: 3700, mesReferencia: ['2026-05'],
    descricao: 'Quota mensal Maio 2026', tipo: 'quota'
  },
  {
    id: 'rcb_2026_052', recibo_numero: '052/ADM2026', ano: '2026',
    tenantId: 'cond_10', data: '2026-04-28',
    valor_centimos: 7200, mesReferencia: ['2026-03', '2026-04'],
    descricao: 'Quotas Março e Abril 2026', tipo: 'quota'
  }
];

// ─── função principal ───────────────────────────────────────

export async function seedIfEmpty() {
  const existing = await store.listDocs('tenants');
  if (existing.length > 0) {
    console.log('[seed] Dados já existem, a saltar seed inicial.');
    return false;
  }

  console.log('[seed] Primeiro arranque — a carregar dados de teste.');

  // Tenants
  for (const t of TENANTS_SEED) await store.setDoc('tenants', t);

  // Meta (uso especial · um doc só)
  await store.setDoc('meta', { id: 'config', ...META_SEED });

  // Rubricas
  for (const r of RUBRICAS_SEED) await store.setDoc('rubricas', r);

  // Receipts de exemplo
  for (const r of RECEIPTS_SEED) await store.setDoc('receipts', r);

  // Coleções vazias por agora (preenchidas via UI)
  await store.setDoc('users', { id: '__init', created: Date.now() });
  await store.deleteDoc('users', '__init');

  // ─── Criar utilizadores para os condóminos com email ───
  // Password inicial = NIF (8 dígitos). Admin pode repor depois.
  // Os tenants sem email (ex: cond_01 João Vaz) ficam sem conta · admin
  // tem de adicionar email primeiro.
  for (const t of TENANTS_SEED) {
    if (!t.email) continue;
    await store.setDoc('users', {
      id: `user_${t.id}`,
      email: t.email.trim().toLowerCase(),
      password: t.nif,                    // ⚠ password inicial igual ao NIF
      passwordPrecisaReset: true,          // flag para forçar mudança no primeiro login
      tenantId: t.id,
      tenantName: t.name,
      fraction: t.fraction,
      criadoEm: Date.now(),
      criadoPor: 'seed',
      disabled: false,
      lastLogin: null
    });
  }

  console.log('[seed] Concluído.');
  return true;
}

/**
 * Reset hard: apaga tudo e re-faz seed. Útil para testes.
 */
export async function resetAndSeed() {
  if (!confirm('Apagar todos os dados de teste e voltar ao estado inicial?')) return;
  store.clearAll();
}
