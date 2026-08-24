/**
 * sw.js — Service Worker for DecisionRoute PWA
 *
 * Strategy: Cache-First for static assets, Network-Only for API calls.
 *
 * Why this strategy:
 *   Static assets (HTML, CSS, JS) rarely change in production — serving
 *   from cache makes the app load instantly offline and on slow connections.
 *   API calls (/api/route, Nominatim, Open-Meteo) must always be fresh;
 *   stale route data is worse than no data. The IndexedDB layer in cache.js
 *   handles route-data persistence separately.
 *
 * Cache versioning:
 *   CACHE_NAME includes a version suffix. When this string changes, the
 *   `activate` handler deletes the old cache — preventing stale assets
 *   from being served forever (the classic SW gotcha).
 *
 * Scope: only static assets listed in STATIC_ASSETS are pre-cached.
 *   Third-party CDN resources (Leaflet, fonts) are cached on first use.
 */

const CACHE_NAME    = 'decision-route-v1';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/css/variables.css',
  '/css/layout.css',
  '/css/components.css',
  '/js/app.js',
  '/js/state/store.js',
  '/js/api/geocoding.js',
  '/js/api/routing.js',
  '/js/api/weather.js',
  '/js/services/normalize.js',
  '/js/services/scoring.js',
  '/js/services/cache.js',
  '/js/components/search.js',
  '/js/components/weight-sliders.js',
  '/js/components/route-card.js',
  '/js/components/comparison.js',
  '/js/components/map.js',
  '/js/utils/debounce.js',
  '/js/utils/format.js',
  '/js/utils/url-state.js',
  '/manifest.json',
];

// ── Install: pre-cache static assets ──────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS))
  );
  // Activate immediately without waiting for old SW to finish
  self.skipWaiting();
});

// ── Activate: delete stale caches ─────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      )
    )
  );
  // Take control of all open clients immediately
  self.clients.claim();
});

// ── Fetch: Cache-First for static, Network-Only for API ───────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Pass-through: API calls, non-GET requests, cross-origin dynamic APIs
  if (
    request.method !== 'GET'                          ||
    url.pathname.startsWith('/api/')                  ||
    url.hostname.includes('openrouteservice.org')     ||
    url.hostname.includes('nominatim.openstreetmap')  ||
    url.hostname.includes('open-meteo.com')
  ) {
    return; // let browser handle normally
  }

  // Cache-First for everything else (static assets + CDN)
  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached;

      return fetch(request).then(response => {
        // Only cache successful, non-opaque responses
        if (!response || response.status !== 200 || response.type === 'error') {
          return response;
        }

        const toCache = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(request, toCache));
        return response;
      });
    }).catch(() => {
      // Network failed and not in cache — for HTML, serve offline shell
      if (request.destination === 'document') {
        return caches.match('/index.html');
      }
    })
  );
});
