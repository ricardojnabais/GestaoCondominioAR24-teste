/**
 * Informação do Condomínio.
 *
 * Guardada num único documento na coleção 'meta' com id='condominio'.
 * Carregada do seed na primeira inicialização e editável via UI.
 */

import * as store from '../store/local-store.js';

const DEFAULT_INFO = {
  id: 'condominio',
  nome: 'Condomínio Av. Amália Rodrigues, 24',
  morada: 'Av. Amália Rodrigues, 24',
  codigoPostal: '2650-437',
  localidade: 'AMADORA',
  nif: '901589381',
  email: 'condoamira24@gmail.com',
  iban: '',
  telefone: ''
};

/**
 * Obtém a info do condomínio. Cria default se não existir.
 */
export async function obter() {
  let info = await store.getDoc('meta', 'condominio');
  if (!info) {
    info = await store.setDoc('meta', { ...DEFAULT_INFO });
  }
  return info;
}

/**
 * Atualiza campos da info do condomínio.
 */
export async function atualizar(updates) {
  const current = await obter();
  const novo = { ...current, ...updates, id: 'condominio' };
  return await store.setDoc('meta', novo);
}

/**
 * NIF formatado com espaços (ex: "901 589 381").
 */
export function nifFormatado(nif) {
  if (!nif) return '';
  const s = String(nif).replace(/\s/g, '');
  if (s.length !== 9) return s;
  return `${s.slice(0, 3)} ${s.slice(3, 6)} ${s.slice(6, 9)}`;
}
