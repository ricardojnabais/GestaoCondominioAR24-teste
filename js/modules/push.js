/**
 * Push Notifications · cliente · v1.0.17
 *
 * Workflow:
 *  1. checkSuporte() · diz se o device suporta push
 *  2. obterPermissao() · pede ao utilizador (Notification.requestPermission)
 *  3. subscrever() · cria subscription com VAPID public key e envia ao backend
 *  4. dessubscrever() · remove subscription
 *
 * Config:
 *   meta.config.push = {
 *     apiUrl: 'https://ar24.vercel.app',
 *     vapidPublic: 'BIxxxxxxxx...' (opcional · pode vir do backend)
 *   }
 */
import * as store from '../store/local-store.js';

const STATE_KEY = 'push_state';

function urlBase64ToUint8Array(b64) {
  const padding = '='.repeat((4 - (b64.length % 4)) % 4);
  const base64 = (b64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export function checkSuporte() {
  return ('serviceWorker' in navigator) && ('PushManager' in window) && ('Notification' in window);
}

export function permissaoAtual() {
  if (!('Notification' in window)) return 'unsupported';
  return Notification.permission; // 'default' | 'granted' | 'denied'
}

async function obterConfig() {
  const config = await store.getDoc('meta', 'config');
  return config?.push || null;
}

export async function obterVapidPublic() {
  const cfg = await obterConfig();
  if (cfg?.vapidPublic) return cfg.vapidPublic;
  // Buscar do backend
  if (!cfg?.apiUrl) throw new Error('URL Vercel não configurada (Definições → Notificações).');
  const res = await fetch(`${cfg.apiUrl}/api/vapid-public`);
  if (!res.ok) throw new Error('Falhou buscar chave VAPID');
  const data = await res.json();
  if (!data.publicKey) throw new Error('Backend não tem VAPID_PUBLIC_KEY configurada');
  return data.publicKey;
}

export async function obterSubscriptionAtual() {
  if (!checkSuporte()) return null;
  const reg = await navigator.serviceWorker.ready;
  return await reg.pushManager.getSubscription();
}

/**
 * Pede permissão e cria subscription.
 * @param {object} opts - { tenantId, tenantName, deviceLabel }
 * @returns {Promise<{ok: boolean, subscription?, error?}>}
 */
export async function subscrever(opts) {
  if (!checkSuporte()) return { ok: false, error: 'Browser sem suporte para push notifications.' };
  const cfg = await obterConfig();
  if (!cfg?.apiUrl) return { ok: false, error: 'URL Vercel não configurada.' };

  // Permissão
  let perm = Notification.permission;
  if (perm === 'default') perm = await Notification.requestPermission();
  if (perm !== 'granted') return { ok: false, error: 'Permissão de notificações negada.' };

  const vapid = await obterVapidPublic();
  const reg = await navigator.serviceWorker.ready;

  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapid)
    });
  }

  // Enviar ao backend
  const body = {
    tenantId: opts.tenantId,
    tenantName: opts.tenantName,
    subscription: sub.toJSON(),
    deviceLabel: opts.deviceLabel || detetarDevice()
  };

  const res = await fetch(`${cfg.apiUrl}/api/subscribe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const txt = await res.text();
    return { ok: false, error: 'Backend falhou: ' + txt };
  }

  // Guardar estado local
  await store.setDoc('meta', { id: STATE_KEY, ativo: true, tenantId: opts.tenantId, subscribedAt: Date.now(), endpoint: sub.endpoint });

  return { ok: true, subscription: sub };
}

export async function dessubscrever(tenantId) {
  const cfg = await obterConfig();
  if (!checkSuporte()) return { ok: false };

  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (sub) {
    if (cfg?.apiUrl) {
      try {
        await fetch(`${cfg.apiUrl}/api/unsubscribe`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tenantId, endpoint: sub.endpoint })
        });
      } catch (e) { console.warn('Falhou unsubscribe backend:', e); }
    }
    await sub.unsubscribe();
  }
  await store.setDoc('meta', { id: STATE_KEY, ativo: false, dessubscribedAt: Date.now() });
  return { ok: true };
}

/**
 * Estado atual da subscription deste device · útil para UI.
 */
export async function estado() {
  const suporte = checkSuporte();
  if (!suporte) return { suporte: false };
  const perm = permissaoAtual();
  const sub = await obterSubscriptionAtual();
  const state = await store.getDoc('meta', STATE_KEY);
  const cfg = await obterConfig();
  return {
    suporte: true,
    permissao: perm,
    inscrito: !!sub,
    endpoint: sub?.endpoint || null,
    tenantId: state?.tenantId || null,
    configurado: !!cfg?.apiUrl,
    pwaInstalada: window.matchMedia?.('(display-mode: standalone)')?.matches || navigator.standalone === true
  };
}

/**
 * Envia notificação (admin only).
 */
export async function notificar({ title, body, url, destinatarios = 'todos' }) {
  const cfg = await obterConfig();
  if (!cfg?.apiUrl) throw new Error('URL Vercel não configurada.');
  if (!cfg?.adminApiKey) throw new Error('ADMIN_API_KEY não configurada (Definições → Notificações).');

  const res = await fetch(`${cfg.apiUrl}/api/notify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': cfg.adminApiKey },
    body: JSON.stringify({ title, body, url, destinatarios })
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error('Backend: ' + txt);
  }
  return await res.json();
}

/**
 * Listar subscriptions (admin only).
 */
export async function listarSubscriptions() {
  const cfg = await obterConfig();
  if (!cfg?.apiUrl) throw new Error('URL Vercel não configurada.');
  if (!cfg?.adminApiKey) throw new Error('ADMIN_API_KEY não configurada.');
  const res = await fetch(`${cfg.apiUrl}/api/subscriptions`, {
    headers: { 'x-api-key': cfg.adminApiKey }
  });
  if (!res.ok) throw new Error('Backend: ' + await res.text());
  return (await res.json()).subscriptions || [];
}

function detetarDevice() {
  const ua = navigator.userAgent;
  if (/iPhone/.test(ua)) return 'iPhone';
  if (/iPad/.test(ua)) return 'iPad';
  if (/Android/.test(ua)) return 'Android';
  if (/Mac/.test(ua)) return 'Mac';
  if (/Windows/.test(ua)) return 'Windows';
  return 'Web';
}

if (typeof window !== 'undefined') window.__push = { estado, subscrever, dessubscrever, notificar, listarSubscriptions };
