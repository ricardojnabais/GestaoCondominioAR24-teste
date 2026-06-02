/**
 * LocalAuth · autenticação local (admin Firebase Google + condómino email/password).
 *
 * Estados possíveis:
 *  - admin:    operador autenticado via Firebase Auth Google Sign-In
 *  - condomino: condómino autenticado pelo seu email + password
 *  - null:     sem sessão
 *
 * SEGURANÇA · PASSWORDS:
 * As passwords dos condóminos são guardadas como HASH PBKDF2-SHA256 (100k iter)
 * com salt único de 16 bytes (ver password-hash.js). Texto plano NUNCA é persistido.
 * Documentos legacy com `password` em texto plano são auto-migrados para hash
 * no primeiro login bem-sucedido. Há também migração em massa disponível ao admin
 * em Definições → Importar Dados → "Migrar passwords antigas para hash".
 */

import * as store from '../store/local-store.js';

const SESSION_KEY = 'ar24:session';

let currentSession = null;
const sessionListeners = new Set();

// ─── inicialização ────────────────────────────────────────

/**
 * Carrega sessão guardada (se existir) e notifica listeners.
 */
export async function initAuth() {
  const raw = sessionStorage.getItem(SESSION_KEY);
  if (raw) {
    try {
      currentSession = JSON.parse(raw);
    } catch (e) {
      sessionStorage.removeItem(SESSION_KEY);
    }
  }
  notifyListeners();
}

// ─── login admin ──────────────────────────────────────────

/**
 * Login admin. Suporta 2 modos:
 *  - Modo legacy (sem Firebase): operatorName + nada · valida contra whitelist local
 *  - Modo Firebase: { firebaseUser, operatorName } · firebaseUser já validado via Google Sign-In
 *
 * @param {string|object} operatorOrPayload
 */
export async function loginAdmin(operatorOrPayload) {
  let operatorName, email, firebaseUid = null, photoURL = null;

  if (typeof operatorOrPayload === 'object' && operatorOrPayload.firebaseUser) {
    // Modo Firebase · user já autenticado, só falta seleccionar operador
    operatorName = operatorOrPayload.operatorName;
    email = operatorOrPayload.firebaseUser.email;
    firebaseUid = operatorOrPayload.firebaseUser.uid;
    photoURL = operatorOrPayload.firebaseUser.photoURL || null;
  } else {
    // Modo legacy · só operatorName
    operatorName = operatorOrPayload;
    const meta = await store.getDoc('meta', 'config');
    email = meta?.administracao?.emailContaCondominio || '';
  }

  // Validar operatorName contra whitelist da app
  const meta = await store.getDoc('meta', 'config');
  if (!meta || !meta.administracao.nomes.includes(operatorName)) {
    throw new Error(`Operador "${operatorName}" não autorizado.`);
  }

  setSession({
    role: 'admin',
    operatorName,
    email,
    firebaseUid,
    photoURL,
    loginAt: Date.now()
  });
}

// ─── login condómino ──────────────────────────────────────

/**
 * Login do condómino com email + password.
 * @param {string} email
 * @param {string} password
 * @returns {Promise<Object>} - sessão criada
 */
export async function loginCondomino(email, password) {
  const users = await store.queryDocs('users', { email: email.trim().toLowerCase() });
  if (users.length === 0) {
    throw new Error('Email não registado. Pede ao administrador para criar a tua conta.');
  }
  const user = users[0];

  // Validação de password · 2 caminhos
  let ok = false;
  let migrar = false;

  if (user.passwordHash && user.passwordSalt) {
    // Novo formato: PBKDF2
    const { verifyPassword } = await import('./password-hash.js');
    ok = await verifyPassword(password, {
      hash: user.passwordHash,
      salt: user.passwordSalt,
      algo: user.passwordAlgo
    });
  } else if (user.password !== undefined) {
    // Formato legacy · texto plano. Validar e auto-migrar para hash.
    ok = (user.password === password);
    migrar = ok;
  }

  if (!ok) throw new Error('Password incorreta.');
  if (user.disabled) throw new Error('Conta desativada. Contacta o administrador.');

  // Auto-migração silenciosa: passwords antigas em texto plano são convertidas em hash
  if (migrar) {
    try {
      const { hashPassword } = await import('./password-hash.js');
      const { hash, salt, algo } = await hashPassword(password);
      user.passwordHash = hash;
      user.passwordSalt = salt;
      user.passwordAlgo = algo;
      delete user.password;
      delete user.passwordPlain;
      console.log('[auth] Password migrada para hash:', user.email);
    } catch (e) {
      console.warn('[auth] Auto-migração de password falhou:', e);
    }
  }

  // Lookup do tenant correspondente
  const tenants = await store.queryDocs('tenants', { email });
  if (tenants.length === 0) {
    throw new Error('Email não corresponde a nenhuma fração registada.');
  }
  const tenant = tenants[0];

  // Update last login
  user.lastLogin = Date.now();
  await store.setDoc('users', user);

  setSession({
    role: 'condomino',
    userId: user.id,
    tenantId: tenant.id,
    tenantName: tenant.name,
    fraction: tenant.fraction,
    email,
    mustChangePassword: !!user.mustChangePassword,
    loginAt: Date.now()
  });
}

// ─── criação de utilizador (pelo admin) ───────────────────

/**
 * Cria conta de condómino. Só chamável quando admin está autenticado.
 * @param {string} email
 * @param {string} tempPassword - password temporária (condómino muda no 1.º acesso)
 */
export async function createUser(email, tempPassword) {
  if (currentSession?.role !== 'admin') {
    throw new Error('Apenas o administrador pode criar contas.');
  }
  email = email.trim().toLowerCase();
  if (!email || !tempPassword) throw new Error('Email e password obrigatórios.');

  // Validar que email corresponde a um condómino
  const tenants = await store.queryDocs('tenants', { email });
  if (tenants.length === 0) {
    throw new Error(`Email "${email}" não corresponde a nenhuma fração registada.`);
  }

  // Verificar se já existe
  const existing = await store.queryDocs('users', { email });
  if (existing.length > 0) {
    throw new Error(`Já existe uma conta para "${email}".`);
  }

  const { hashPassword } = await import('./password-hash.js');
  const { hash, salt, algo } = await hashPassword(tempPassword);
  const user = {
    email,
    passwordHash: hash,
    passwordSalt: salt,
    passwordAlgo: algo,
    role: 'condomino',
    tenantId: tenants[0].id,
    createdAt: Date.now(),
    createdBy: currentSession.operatorName,
    mustChangePassword: true,
    disabled: false
  };
  await store.setDoc('users', user);
  return { ...user, password: tempPassword }; // texto plano só na resposta
}

/**
 * Reset de password (admin envia password temporária ao condómino).
 */
export async function resetPassword(email, newTempPassword) {
  if (currentSession?.role !== 'admin') {
    throw new Error('Apenas o administrador pode fazer reset.');
  }
  const users = await store.queryDocs('users', { email: email.trim().toLowerCase() });
  if (users.length === 0) throw new Error('Utilizador não encontrado.');
  const user = users[0];
  const { hashPassword } = await import('./password-hash.js');
  const { hash, salt, algo } = await hashPassword(newTempPassword);
  user.passwordHash = hash;
  user.passwordSalt = salt;
  user.passwordAlgo = algo;
  delete user.password;
  delete user.passwordPlain;
  user.mustChangePassword = true;
  user.passwordResetAt = Date.now();
  user.passwordResetBy = currentSession.operatorName;
  await store.setDoc('users', user);
}

/**
 * Apaga conta de condómino (admin).
 */
export async function deleteUser(email) {
  if (currentSession?.role !== 'admin') {
    throw new Error('Apenas o administrador pode apagar contas.');
  }
  const users = await store.queryDocs('users', { email: email.trim().toLowerCase() });
  if (users.length === 0) throw new Error('Utilizador não encontrado.');
  await store.deleteDoc('users', users[0].id);
}

/**
 * Condómino muda a sua própria password.
 */
export async function changeOwnPassword(currentPassword, newPassword) {
  if (currentSession?.role !== 'condomino') {
    throw new Error('Acessível apenas a condóminos autenticados.');
  }
  if (!newPassword || newPassword.length < 4) {
    throw new Error('A nova password tem de ter pelo menos 4 caracteres.');
  }
  const user = await store.getDoc('users', currentSession.userId);
  if (!user) throw new Error('Utilizador não encontrado.');

  // Validar password atual (hash ou legacy)
  let ok = false;
  if (user.passwordHash && user.passwordSalt) {
    const { verifyPassword } = await import('./password-hash.js');
    ok = await verifyPassword(currentPassword, {
      hash: user.passwordHash, salt: user.passwordSalt, algo: user.passwordAlgo
    });
  } else if (user.password !== undefined) {
    ok = (user.password === currentPassword);
  }
  if (!ok) throw new Error('Password atual incorreta.');

  // Guardar nova password como hash
  const { hashPassword } = await import('./password-hash.js');
  const { hash, salt, algo } = await hashPassword(newPassword);
  user.passwordHash = hash;
  user.passwordSalt = salt;
  user.passwordAlgo = algo;
  delete user.password;
  delete user.passwordPlain;
  user.mustChangePassword = false;
  user.passwordPrecisaReset = false;
  user.passwordChangedAt = Date.now();
  await store.setDoc('users', user);
  currentSession.mustChangePassword = false;
  saveSession();
}

// ─── logout ───────────────────────────────────────────────

export async function logout() {
  // Se foi sessão Firebase Admin, fazer signOut do Firebase
  if (currentSession?.role === 'admin' && currentSession?.firebaseUid) {
    try {
      const { signOutAdmin } = await import('./firebase-auth.js');
      await signOutAdmin();
    } catch (e) { console.warn('signOut firebase:', e); }
  }
  currentSession = null;
  sessionStorage.removeItem(SESSION_KEY);
  notifyListeners();
}

// ─── sessão atual ─────────────────────────────────────────

export function getSession() {
  return currentSession;
}

export function isAdmin() {
  return currentSession?.role === 'admin';
}

export function isCondomino() {
  return currentSession?.role === 'condomino';
}

export function isAuthenticated() {
  return !!currentSession;
}

// ─── listeners ────────────────────────────────────────────

export function onAuthChange(callback) {
  sessionListeners.add(callback);
  callback(currentSession);  // chama com estado atual
  return () => sessionListeners.delete(callback);
}

// ─── internos ─────────────────────────────────────────────

function setSession(session) {
  currentSession = session;
  saveSession();
  notifyListeners();
}

function saveSession() {
  if (currentSession) {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(currentSession));
  } else {
    sessionStorage.removeItem(SESSION_KEY);
  }
}

function notifyListeners() {
  sessionListeners.forEach(cb => {
    try { cb(currentSession); } catch (e) { console.error('[auth] listener erro:', e); }
  });
}

// Debug helper
if (typeof window !== 'undefined') {
  window.__auth = { getSession, isAdmin, isCondomino, logout };
}
