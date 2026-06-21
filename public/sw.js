/* EasyVideoEditor service worker — offline support.
 *
 * Strategy:
 *  - Navigations: network-first, fall back to the cached app shell when offline.
 *  - Same-origin assets (JS/CSS/wasm/ffmpeg core): stale-while-revalidate.
 *
 * IMPORTANT: cached Responses keep the original headers, so the COOP/COEP
 * headers the host sends on first load are preserved offline — FFmpeg.wasm
 * (SharedArrayBuffer) keeps working without a network connection.
 *
 * Cross-origin requests (e.g. Google Fonts) are left untouched so we never
 * cache opaque responses that could silently break the page.
 */
const VERSION = 'eve-v1';
const SHELL_CACHE = `shell-${VERSION}`;
const RUNTIME_CACHE = `runtime-${VERSION}`;

self.addEventListener('install', () => {
  // Activate the new worker as soon as it finishes installing.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys.filter((k) => !k.endsWith(VERSION)).map((k) => caches.delete(k)),
    );
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // skip cross-origin

  // SPA navigations: try the network, fall back to the cached shell offline.
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        const cache = await caches.open(SHELL_CACHE);
        cache.put('/index.html', fresh.clone());
        return fresh;
      } catch {
        const cache = await caches.open(SHELL_CACHE);
        return (
          (await cache.match('/index.html')) ||
          (await cache.match(req)) ||
          Response.error()
        );
      }
    })());
    return;
  }

  // Static assets: serve from cache immediately, refresh in the background.
  event.respondWith((async () => {
    const cache = await caches.open(RUNTIME_CACHE);
    const cached = await cache.match(req);
    const network = fetch(req)
      .then((res) => {
        if (res && res.status === 200 && res.type === 'basic') cache.put(req, res.clone());
        return res;
      })
      .catch(() => cached);
    return cached || network;
  })());
});
