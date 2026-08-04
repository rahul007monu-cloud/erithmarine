/**
 * sw.js — Service worker.
 *
 * Strategy:
 *   - App shell (HTML, CSS, JS) is precached and served cache-first, so the
 *     site opens instantly and works offline once visited.
 *   - Navigations fall back to the cached shell when the network is gone.
 *   - /api/* is never cached: a stale vacancy list or a replayed application
 *     would be worse than an error.
 *
 * Bump CACHE_VERSION on every deploy to retire the previous shell.
 */

const CACHE_VERSION = 'ems-v1';
const SHELL_CACHE = `${CACHE_VERSION}-shell`;

const SHELL = [
  './',
  'index.html',
  'css/styles.css',
  'manifest.webmanifest',
  'js/main.js',
  'js/content.js',
  'js/ui/dom.js',
  'js/ui/render.js',
  'js/ui/jobs.js',
  'js/ui/forms.js',
  'js/ui/chat.js',
  'js/ui/pwa.js',
  'js/engine/math.js',
  'js/engine/gl.js',
  'js/engine/geometry.js',
  'js/scene/shaders.js',
  'js/scene/ocean.js',
  'js/scene/renderer.js',
  'js/scene/ship.js',
  'js/scene/interiors.js',
  'js/scene/journey.js',
  'icons/favicon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    // addAll fails the whole install if any single request 404s, so add
    // individually and tolerate gaps (for example a missing icon).
    await Promise.all(SHELL.map(async (url) => {
      try {
        const absolute = new URL(url, self.registration.scope).href;
        await cache.add(new Request(absolute, { cache: 'reload' }));
      } catch (error) {
        console.warn('[sw] could not precache', url, error);
      }
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(
      names.filter((name) => !name.startsWith(CACHE_VERSION)).map((name) => caches.delete(name)),
    );
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.includes('/api/')) return;

  // Navigations: try the network, fall back to the cached shell offline.
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        return await fetch(request);
      } catch {
        const cache = await caches.open(SHELL_CACHE);
        const shellUrl = new URL('index.html', self.registration.scope).href;
        return (await cache.match(shellUrl)) || Response.error();
      }
    })());
    return;
  }

  // Static assets: cache first, then network, refreshing the cache in passing.
  event.respondWith((async () => {
    const cache = await caches.open(SHELL_CACHE);
    const cached = await cache.match(request);
    if (cached) return cached;

    try {
      const response = await fetch(request);
      if (response.ok && response.type === 'basic') {
        cache.put(request, response.clone());
      }
      return response;
    } catch (error) {
      return cached || Response.error();
    }
  })());
});
