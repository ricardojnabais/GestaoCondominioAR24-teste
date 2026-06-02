/**
 * Comunicações · canal bilateral admin ↔ condóminos.
 *
 * Tipos:
 *   - 'problema'      · condómino reporta algo a corrigir
 *   - 'sugestao'      · condómino sugere algo
 *   - 'institucional' · admin envia para todos (convocatórias, obras, ...)
 *   - 'individual'    · admin envia para 1 condómino (quotas em atraso, ...)
 *
 * Estado:
 *   - 'aberto'    · ainda não foi tratado
 *   - 'em_curso'  · admin acusou recepção / está a resolver
 *   - 'completo'  · resolvido / arquivado
 *
 * Thread: mensagem original + array de respostas (texto, criadoPor, data, origem).
 *
 * Tracking de leitura: `lidoPor[id]` é o timestamp em que esse leitor abriu pela
 * última vez. Comparado com `ultimaAtividadeEm` da comunicação para saber se há
 * novidade. `id` é 'admin' (qualquer um dos admins partilha leitura) ou o tenantId.
 *
 * Para comunicados a 'todos', um único documento serve todos os condóminos.
 * Cada um marca individualmente como lido.
 */

import * as store from '../store/local-store.js';
import { todayISO } from '../utils/format.js';

const TIPOS_VALIDOS = ['problema', 'sugestao', 'institucional', 'individual'];
const ESTADOS_VALIDOS = ['aberto', 'em_curso', 'completo'];

/**
 * Condómino cria nova comunicação para a administração.
 */
export async function criarPorCondomino(data) {
  if (!data.tenantId) throw new Error('Falta o condómino remetente.');
  if (!['problema', 'sugestao'].includes(data.tipo)) {
    throw new Error('Tipo inválido. Usa "problema" ou "sugestao".');
  }
  if (!data.assunto?.trim()) throw new Error('Indica um assunto.');
  if (!data.mensagem?.trim()) throw new Error('Escreve a mensagem.');

  const tenant = await store.getDoc('tenants', data.tenantId);
  if (!tenant) throw new Error('Condómino não encontrado.');

  const now = Date.now();
  const doc = {
    tipo: data.tipo,
    direcao: 'condomino->admin',
    remetenteId: data.tenantId,
    remetenteNome: tenant.name,
    remetenteFracao: tenant.fraction,
    destinatarios: ['admin'],
    assunto: data.assunto.trim(),
    mensagem: data.mensagem.trim(),
    data: todayISO(),
    criadoPor: tenant.name,
    estado: 'aberto',
    fechadoEm: null,
    fechadoPor: null,
    respostas: [],
    lidoPor: { [data.tenantId]: now },  // remetente já leu
    ultimaAtividadeEm: now,
    createdAt: now
  };
  return await store.setDoc('comunicacoes', doc);
}

/**
 * Admin cria nova comunicação.
 *   - tipo 'institucional' · destinatarios = ['todos']
 *   - tipo 'individual'    · destinatarios = ['cond_xx']
 */
export async function criarPorAdmin(data, operatorName) {
  if (!['institucional', 'individual'].includes(data.tipo)) {
    throw new Error('Tipo inválido. Usa "institucional" ou "individual".');
  }
  if (!data.assunto?.trim()) throw new Error('Indica um assunto.');
  if (!data.mensagem?.trim()) throw new Error('Escreve a mensagem.');

  let destinatarios;
  if (data.tipo === 'institucional') {
    destinatarios = ['todos'];
  } else {
    if (!data.tenantId) throw new Error('Falta o condómino destinatário.');
    const tenant = await store.getDoc('tenants', data.tenantId);
    if (!tenant) throw new Error('Condómino destinatário não encontrado.');
    destinatarios = [data.tenantId];
  }

  const now = Date.now();
  const doc = {
    tipo: data.tipo,
    direcao: 'admin->condomino',
    remetenteId: 'admin',
    remetenteNome: operatorName || 'Administração',
    destinatarios,
    assunto: data.assunto.trim(),
    mensagem: data.mensagem.trim(),
    data: todayISO(),
    criadoPor: operatorName || 'Administração',
    estado: 'aberto',
    fechadoEm: null,
    fechadoPor: null,
    respostas: [],
    lidoPor: { admin: now },  // admin que criou já leu
    ultimaAtividadeEm: now,
    createdAt: now
  };
  return await store.setDoc('comunicacoes', doc);
}

/**
 * Adicionar resposta à thread.
 * @param {string} comId
 * @param {string} texto
 * @param {'admin'|'condomino'} origem
 * @param {string} autorNome
 */
export async function adicionarResposta(comId, texto, origem, autorNome) {
  if (!texto?.trim()) throw new Error('Escreve a resposta.');
  const c = await store.getDoc('comunicacoes', comId);
  if (!c) throw new Error('Comunicação não encontrada.');
  if (c.estado === 'completo') throw new Error('Esta comunicação está fechada. Cria uma nova mensagem.');

  const now = Date.now();
  c.respostas = c.respostas || [];
  c.respostas.push({
    texto: texto.trim(),
    criadoPor: autorNome,
    data: now,
    origem
  });
  c.ultimaAtividadeEm = now;

  // Garantir que quem responde fica marcado como lido (já viu o que respondeu)
  c.lidoPor = c.lidoPor || {};
  if (origem === 'admin') {
    c.lidoPor.admin = now;
  } else {
    c.lidoPor[c.remetenteId] = now;
  }

  // Se estava 'aberto' e admin responde, passa a 'em_curso'
  if (origem === 'admin' && c.estado === 'aberto') {
    c.estado = 'em_curso';
  }

  return await store.setDoc('comunicacoes', c);
}

/**
 * Mudar estado.
 */
export async function alterarEstado(comId, novoEstado, operatorName) {
  if (!ESTADOS_VALIDOS.includes(novoEstado)) throw new Error('Estado inválido.');
  const c = await store.getDoc('comunicacoes', comId);
  if (!c) throw new Error('Comunicação não encontrada.');

  c.estado = novoEstado;
  if (novoEstado === 'completo') {
    c.fechadoEm = Date.now();
    c.fechadoPor = operatorName || null;
  } else {
    c.fechadoEm = null;
    c.fechadoPor = null;
  }
  c.ultimaAtividadeEm = Date.now();
  return await store.setDoc('comunicacoes', c);
}

/**
 * Marcar como lido por um leitor ('admin' ou tenantId).
 * Atualiza lidoPor[leitor] = ultimaAtividadeEm.
 */
export async function marcarLido(comId, leitor) {
  const c = await store.getDoc('comunicacoes', comId);
  if (!c) return;
  c.lidoPor = c.lidoPor || {};
  c.lidoPor[leitor] = c.ultimaAtividadeEm || Date.now();
  return await store.setDoc('comunicacoes', c);
}

/**
 * Listar comunicações relevantes para o admin (TODAS).
 */
export async function listarParaAdmin(filtros = {}) {
  let all = await store.listDocs('comunicacoes');
  if (filtros.tipo) all = all.filter(c => c.tipo === filtros.tipo);
  if (filtros.estado) all = all.filter(c => c.estado === filtros.estado);
  if (filtros.direcao) all = all.filter(c => c.direcao === filtros.direcao);
  all.sort((a, b) => (b.ultimaAtividadeEm || 0) - (a.ultimaAtividadeEm || 0));
  return all;
}

/**
 * Listar comunicações visíveis para um condómino:
 *   - As que ele enviou (remetenteId == tenantId)
 *   - As individuais dirigidas a ele (destinatarios inclui tenantId)
 *   - As institucionais (destinatarios == ['todos'])
 */
export async function listarParaCondomino(tenantId, filtros = {}) {
  let all = await store.listDocs('comunicacoes');
  all = all.filter(c =>
    c.remetenteId === tenantId
    || (c.destinatarios && c.destinatarios.includes(tenantId))
    || (c.destinatarios && c.destinatarios.includes('todos'))
  );
  if (filtros.tipo) all = all.filter(c => c.tipo === filtros.tipo);
  if (filtros.estado) all = all.filter(c => c.estado === filtros.estado);
  all.sort((a, b) => (b.ultimaAtividadeEm || 0) - (a.ultimaAtividadeEm || 0));
  return all;
}

/**
 * Contar não-lidas para o admin.
 */
export async function contagemNaoLidasAdmin() {
  const all = await store.listDocs('comunicacoes');
  return all.filter(c => isNaoLidaPor(c, 'admin')).length;
}

/**
 * Contar não-lidas para um condómino.
 */
export async function contagemNaoLidasCondomino(tenantId) {
  const lista = await listarParaCondomino(tenantId);
  return lista.filter(c => isNaoLidaPor(c, tenantId)).length;
}

/**
 * Helper: comunicação está não-lida por este leitor?
 */
export function isNaoLidaPor(c, leitor) {
  const ultima = c.ultimaAtividadeEm || c.createdAt || 0;
  const lido = c.lidoPor?.[leitor] || 0;
  return lido < ultima;
}
