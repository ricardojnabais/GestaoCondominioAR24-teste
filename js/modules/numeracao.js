/**
 * Numeração de recibos por ano.
 *
 * Cada recibo tem um número sequencial dentro do ano: "055/ADM2026".
 * Guardamos o próximo número em `meta.nextNumberByYear[ano]`.
 *
 * IMPORTANTE: a chamada `nextReceiptNumber()` ATOMICAMENTE incrementa
 * o contador e devolve o número. Não chamar especulativamente.
 */

import * as store from '../store/local-store.js';

/**
 * Reserva e devolve o próximo número de recibo do ano.
 * @param {string} year - ex: "2026"
 * @returns {Promise<{numero: number, formatado: string}>}
 */
export async function nextReceiptNumber(year) {
  const meta = await store.getDoc('meta', 'config');
  if (!meta) throw new Error('Meta config não encontrada.');

  if (!meta.nextNumberByYear) meta.nextNumberByYear = {};
  const current = meta.nextNumberByYear[year] || 1;
  const next = current + 1;

  meta.nextNumberByYear[year] = next;
  await store.setDoc('meta', meta);

  return {
    numero: current,
    formatado: `${String(current).padStart(3, '0')}/ADM${year}`
  };
}

/**
 * Vê o próximo número sem o consumir (preview).
 */
export async function peekNextReceiptNumber(year) {
  const meta = await store.getDoc('meta', 'config');
  const current = (meta?.nextNumberByYear?.[year]) || 1;
  return {
    numero: current,
    formatado: `${String(current).padStart(3, '0')}/ADM${year}`
  };
}

/**
 * Repõe o contador (apenas se necessário · admin).
 */
export async function setReceiptCounter(year, value) {
  const meta = await store.getDoc('meta', 'config');
  if (!meta.nextNumberByYear) meta.nextNumberByYear = {};
  meta.nextNumberByYear[year] = value;
  await store.setDoc('meta', meta);
}
