/**
 * Firebase Auth · Admin Sign-In via Google OAuth
 *
 * Workflow:
 *  1. signInAdmin() · abre popup Google · validação email contra whitelist
 *  2. Após login Google bem-sucedido, retorna user
 *  3. App pede ao utilizador para seleccionar operador (Ricardo | Filipe)
 *  4. selectOperator() · grava operador em sessionStorage
 *  5. signOutAdmin() · termina sessão Firebase
 *
 * Whitelist é definida em `meta.config.administracao.emailsAutorizados`.
 */

// Conta partilhada que pode entrar como admin
const ADMIN_EMAILS_FALLBACK = ['condoamira24@gmail.com'];

async function getAllowedEmails() {
  try {
    const store = await import('../store/local-store.js');
    const config = await store.getDoc('meta', 'config');
    const lista = config?.administracao?.emailsAutorizados;
    if (Array.isArray(lista) && lista.length > 0) return lista.map(e => e.toLowerCase());
  } catch (e) { /* fallback */ }
  return ADMIN_EMAILS_FALLBACK;
}

export function isFirebaseAvailable() {
  return !!(window.__firebase?.auth && window.__firebase?.authFns);
}

export function currentFirebaseUser() {
  return window.__firebase?.auth?.currentUser || null;
}

/**
 * Abrir popup Google Sign-In. Valida email contra whitelist.
 * Em iOS Safari standalone, popup pode não funcionar · usa redirect como fallback.
 */
export async function signInAdmin() {
  if (!isFirebaseAvailable()) {
    throw new Error('Firebase Auth não disponível · configura firebase-config.js');
  }
  const { auth, authFns } = window.__firebase;
  const { GoogleAuthProvider, signInWithPopup, signInWithRedirect } = authFns;

  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });

  let user;
  try {
    const result = await signInWithPopup(auth, provider);
    user = result.user;
  } catch (err) {
    // Popup bloqueado · fallback para redirect
    if (err.code === 'auth/popup-blocked' || err.code === 'auth/popup-closed-by-user') {
      console.warn('[FirebaseAuth] Popup falhou · a tentar redirect:', err.code);
      await signInWithRedirect(auth, provider);
      return null; // a página recarrega · resultado vem em getRedirectResult
    }
    throw err;
  }

  return await validateAndSetup(user);
}

/**
 * Após signInWithRedirect, chamar isto no boot para apanhar o resultado.
 */
export async function checkRedirectResult() {
  if (!isFirebaseAvailable()) return null;
  const { auth, authFns } = window.__firebase;
  try {
    const result = await authFns.getRedirectResult(auth);
    if (result?.user) return await validateAndSetup(result.user);
  } catch (e) {
    console.warn('[FirebaseAuth] getRedirectResult:', e);
  }
  return null;
}

async function validateAndSetup(user) {
  const email = (user.email || '').toLowerCase();
  const allowed = await getAllowedEmails();
  if (!allowed.includes(email)) {
    await signOutAdmin();
    throw new Error(`Email ${email} não está autorizado como administrador.\n\nAdministradores autorizados: ${allowed.join(', ')}`);
  }
  return {
    uid: user.uid,
    email,
    displayName: user.displayName || '',
    photoURL: user.photoURL || ''
  };
}

export async function signOutAdmin() {
  if (!isFirebaseAvailable()) return;
  const { auth, authFns } = window.__firebase;
  try { await authFns.signOut(auth); } catch (e) { console.warn(e); }
}

export function onAuthStateChanged(cb) {
  if (!isFirebaseAvailable()) {
    cb(null);
    return () => {};
  }
  const { auth, authFns } = window.__firebase;
  return authFns.onAuthStateChanged(auth, cb);
}
