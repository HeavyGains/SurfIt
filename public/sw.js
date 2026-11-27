/* SurfIt offline support. The page is fetched fresh when online (so each deploy shows up straight away)
   and falls back to the cached copy offline; built assets have hashed names, so they're cached on first use. */
const CACHE = 'surfit-v2';

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    /* cache the page and the assets it names, so the very first visit is enough to play offline */
    const res = await fetch('./', { cache: 'no-cache' });
    await c.put('./', res.clone());
    const html = await res.text();
    const assets = [...html.matchAll(/(?:src|href)="\.?\/?(assets\/[^"]+)"/g)].map(m => './' + m[1]);
    await c.addAll(['./manifest.webmanifest', './icon-192.png', './icon-512.png', ...assets]);
    self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      try {
        const res = await fetch(req);
        (await caches.open(CACHE)).put('./', res.clone());
        return res;
      } catch (_) {
        return (await caches.match('./')) || Response.error();
      }
    })());
    return;
  }
  const sameOrigin = url.origin === location.origin;
  const fonts = /fonts\.(googleapis|gstatic)\.com$/.test(url.hostname);
  if (!sameOrigin && !fonts) return;
  e.respondWith((async () => {
    const hit = await caches.match(req);
    if (hit) return hit;
    const res = await fetch(req);
    if (res.ok || res.type === 'opaque') (await caches.open(CACHE)).put(req, res.clone());
    return res;
  })());
});
