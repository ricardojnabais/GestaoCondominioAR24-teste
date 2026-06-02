/**
 * Service Worker · Gestão do Condomínio AR24
 *
 * Função principal: tornar a app "instalável" como PWA no Chrome desktop
 * e mobile (Android), permitindo gravar com ícone próprio.
 *
 * Estratégia de cache: NETWORK-FIRST com fallback para cache.
 *   → online: vai sempre buscar a versão mais recente à rede
 *   → offline: usa o que tiver em cache (a app continua a funcionar
 *     porque os dados estão em localStorage)
 *
 * Esta estratégia é deliberadamente "fraca" porque a app está em
 * desenvolvimento ativo: queremos que as atualizações sejam sempre
 * vistas imediatamente, mesmo à custa de carregamentos um pouco
 * mais lentos.
 */

const CACHE_VERSION = 'ar24-v2.0-teste';
const ASSETS_TO_PRECACHE = [
  './',
  './index.html',
  './manifest.json',
  './styles/main.css',
  './vendor/exceljs.min.js',
  './vendor/jspdf.umd.min.js',
  './assets/icon-192.png',
  './assets/icon-512.png',
  './assets/apple-touch-icon.png',
  './assets/favicon-32.png'
];

// ─── Install · pré-cache de assets essenciais ───────────────
self.addEventListener('install', (event) => {
  console.log('[SW] install', CACHE_VERSION);
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => {
      return cache.addAll(ASSETS_TO_PRECACHE).catch((err) => {
        // Não bloquear o install se algum asset falhar
        console.warn('[SW] precache parcial:', err);
      });
    })
  );
  self.skipWaiting();
});

// ─── Activate · limpar caches antigos ───────────────────────
self.addEventListener('activate', (event) => {
  console.log('[SW] activate', CACHE_VERSION);
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// ─── Fetch · network-first ──────────────────────────────────
self.addEventListener('fetch', (event) => {
  // Ignorar requests cross-origin (fonts.googleapis, etc.)
  if (!event.request.url.startsWith(self.location.origin)) return;
  // Ignorar requests não-GET
  if (event.request.method !== 'GET') return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Sucesso: atualiza cache em background
        const responseClone = response.clone();
        caches.open(CACHE_VERSION).then((cache) => {
          cache.put(event.request, responseClone);
        }).catch(() => {});
        return response;
      })
      .catch(() => {
        // Falha (offline): tenta a cache
        return caches.match(event.request).then((cached) => {
          if (cached) return cached;
          // Se for navegação e nada em cache, devolve o index.html
          if (event.request.mode === 'navigate') {
            return caches.match('./index.html');
          }
          // Caso contrário, falha
          return new Response('Offline', { status: 503 });
        });
      })
  );
});

// ─── Push Notifications · v1.0.17 ──────────────────────────────────────
self.addEventListener('push', (event) => {
  if (!event.data) return;
  let payload;
  try { payload = event.data.json(); }
  catch { payload = { title: 'AR24', body: event.data.text() }; }

  const { title = 'Condomínio AR24', body = '', url = '/', timestamp = Date.now() } = payload;

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: 'icon192.png',
      badge: 'icon192.png',
      tag: 'ar24-msg-' + timestamp,
      data: { url, timestamp },
      vibrate: [120, 60, 120],
      requireInteraction: false,
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      // Se já há janela aberta, foca · senão abre
      for (const w of wins) {
        if (w.url.includes(self.location.origin)) {
          w.focus();
          if ('navigate' in w) w.navigate(url);
          return;
        }
      }
      return clients.openWindow(url);
    })
  );
});
