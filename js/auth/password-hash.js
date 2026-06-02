/**
 * Password hashing · PBKDF2-SHA256 via Web Crypto API.
 *
 * Sem dependências externas. Funciona em todos os browsers modernos.
 *
 * Estratégia:
 *  - Salt aleatório de 16 bytes por password
 *  - 100.000 iterações de PBKDF2-SHA256
 *  - Hash de 32 bytes (256 bits)
 *  - Tudo guardado em base64
 *  - Algoritmo versionado em `passwordAlgo` para futuras migrações
 */

const ALGO_VERSION = 'PBKDF2-SHA256-100k';
const ITERATIONS = 100_000;
const SALT_BYTES = 16;
const HASH_BYTES = 32;

function bytesToBase64(bytes) {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function base64ToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function derive(password, saltBytes) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: saltBytes, iterations: ITERATIONS, hash: 'SHA-256' },
    keyMaterial,
    HASH_BYTES * 8
  );
  return new Uint8Array(bits);
}

/**
 * Faz hash de uma password.
 * @param {string} password - texto plano
 * @returns {Promise<{hash:string,salt:string,algo:string}>} base64 encoded
 */
export async function hashPassword(password) {
  if (typeof password !== 'string' || password.length === 0) {
    throw new Error('Password vazia.');
  }
  const saltBytes = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const hashBytes = await derive(password, saltBytes);
  return {
    hash: bytesToBase64(hashBytes),
    salt: bytesToBase64(saltBytes),
    algo: ALGO_VERSION
  };
}

/**
 * Verifica uma password contra um hash guardado.
 * @param {string} password - texto plano fornecido pelo utilizador
 * @param {{hash:string,salt:string,algo:string}} stored
 * @returns {Promise<boolean>}
 */
export async function verifyPassword(password, stored) {
  if (!stored || !stored.hash || !stored.salt) return false;
  if (stored.algo !== ALGO_VERSION) {
    console.warn('[password] Algoritmo desconhecido:', stored.algo);
    return false;
  }
  try {
    const saltBytes = base64ToBytes(stored.salt);
    const hashBytes = await derive(password, saltBytes);
    const expected = base64ToBytes(stored.hash);
    if (hashBytes.length !== expected.length) return false;
    // Comparação constant-time para mitigar timing attacks
    let diff = 0;
    for (let i = 0; i < hashBytes.length; i++) diff |= hashBytes[i] ^ expected[i];
    return diff === 0;
  } catch (e) {
    console.error('[password] verify falhou:', e);
    return false;
  }
}

export { ALGO_VERSION };
