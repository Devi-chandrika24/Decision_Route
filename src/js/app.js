/**
 * app.js — Application entry point & orchestrator
 *
 * Bootstraps all components, wires the search → routing → weather → score
 * data flow, manages the offline banner, URL state, and share button.
 *
 * Data flow (happy path):
 *   1. User confirms origin + destination (or restored from URL params)
 *   2. setState({ searchPhase: 'routing' })
 *   3. fetchRoutes() → AbortController-guarded POST /api/route (GeoJSON)
 *   4. In parallel: fetchWeatherRisk() for each route's midpoint
 *   5. normalizeRoutes(orsData, weatherResults) → Route[] (includes .coordinates)
 *   6. cacheSet(origin, destination, routes)
 *   7. setState({ routes, searchPhase: 'done' })
 *   8. comparison.js re-renders cards via store subscription
 *   9. map.js draws polylines via renderMap()
 *   10. writeUrlState(origin.name, destination.name)
 *
 * Failure modes:
 *   - fetchRoutes fails entirely    → cache fallback → error state
 *   - fetchRoutes returns no routes → no-route state
 *   - fetchWeatherRisk fails        → routes shown, risk = 'unavailable', partial banner
 *   - Both fail + cache exists      → show cached results, offline banner
 *   - Both fail + no cache          → error state
 *   - navigator.onLine === false    → skip fetches, read cache immediately
 */

import { setState, getState, subscribe } from './state/store.js';
import { initSearch, onLocationsReady }  from './components/search.js';
import { initWeightSliders, syncPresetsToStore } from './components/weight-sliders.js';
import { initComparison }                from './components/comparison.js';
import { initMap, renderMap, hideMap }   from './components/map.js';
import { fetchRoutes, cancelRouting }    from './api/routing.js';
import { fetchWeatherRisk }              from './api/weather.js';
import { normalizeRoutes, extractMidpoints } from './services/normalize.js';
import { scoreRoutes }                   from './services/scoring.js';
import { cacheGet, cacheSet }            from './services/cache.js';
import { readUrlState, writeUrlState, clearUrlState, buildShareUrl } from './utils/url-state.js';

// ─── Bootstrap ────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  // Mount components (order matters: store must exist before subscriptions)
  initComparison();      // subscribes to store
  initSearch();          // binds search inputs
  initWeightSliders();   // binds preset + sliders
  syncPresetsToStore();  // keeps preset highlight in sync
  initMap();             // registers map section element

  // Register Service Worker for PWA support
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch(err => {
        console.warn('Service worker registration failed:', err);
      });
    });
  }

  // Wire search confirmation to routing flow
  onLocationsReady(_handleSearch);

  // Re-render map whenever routes change (weights change don't affect map)
  subscribe((next, prev) => {
    if (next.routes !== prev.routes) {
      if (next.routes.length > 0 && next.searchPhase === 'done') {
        const scored = scoreRoutes(next.routes, next.weights);
        renderMap(scored);
      } else {
        hideMap();
      }
    }
  });

  // Retry buttons
  window.addEventListener('dr:retry', _retryLastSearch);
  document.getElementById('retry-btn')?.addEventListener('click', _retryLastSearch);

  // Share button
  document.getElementById('share-btn')?.addEventListener('click', _handleShare);

  // Online/offline detection
  window.addEventListener('online',  _handleOnlineStatusChange);
  window.addEventListener('offline', _handleOnlineStatusChange);

  _handleOnlineStatusChange();

  // ── URL state restore on page load ──────────────────────────
  const { from, to } = readUrlState();
  if (from && to) {
    _restoreFromUrl(from, to);
  }
});

// ─── Last search memory (for retry) ───────────────────────────

let _lastOrigin      = null;
let _lastDestination = null;

// ─── URL restore ──────────────────────────────────────────────

/**
 * Pre-fills the search inputs and auto-triggers a search from URL params.
 * We geocode both places, then run the full search pipeline.
 */
async function _restoreFromUrl(fromName, toName) {
  // Pre-fill input values visually
  const originInput = document.getElementById('origin-input');
  const destInput   = document.getElementById('dest-input');
  if (originInput) originInput.value = fromName;
  if (destInput)   destInput.value   = toName;

  setState({ searchPhase: 'routing' });

  // Geocode both to get coordinates
  try {
    const { geocode } = await import('./api/geocoding.js');
    const [originResults, destResults] = await Promise.all([
      geocode(fromName),
      geocode(toName),
    ]);

    const origin = originResults[0];
    const dest   = destResults[0];

    if (!origin || !dest) {
      setState({ searchPhase: 'idle' });
      clearUrlState();
      return;
    }

    // Set store so search.js fields are synced
    setState({
      origin     : { name: origin.name, lat: origin.lat, lon: origin.lon },
      destination: { name: dest.name, lat: dest.lat, lon: dest.lon },
    });

    // Enable search button
    const searchBtn = document.getElementById('search-btn');
    if (searchBtn) searchBtn.disabled = false;

    await _handleSearch(origin, dest);
  } catch {
    setState({ searchPhase: 'idle' });
    clearUrlState();
  }
}

// ─── Main search handler ───────────────────────────────────────

/**
 * @param {{ name: string, lat: number, lon: number }} origin
 * @param {{ name: string, lat: number, lon: number }} destination
 */
async function _handleSearch(origin, destination) {
  _lastOrigin      = origin;
  _lastDestination = destination;

  // If offline, jump straight to cache
  if (!navigator.onLine) {
    await _serveFromCache(origin, destination, true);
    return;
  }

  setState({
    searchPhase    : 'routing',
    routes         : [],
    errorMessage   : null,
    isOffline      : false,
    weatherPartial : false,
  });

  hideMap();
  _showOfflineBanner(false);

  try {
    // ── Step 1: Fetch routes (GeoJSON) ────────────────────────
    let orsData;
    try {
      orsData = await fetchRoutes(origin, destination);
    } catch (err) {
      if (err.name === 'AbortError') return;
      const served = await _serveFromCache(origin, destination, false);
      if (!served) _showError(_friendlyRoutingError(err));
      return;
    }

    // ── Step 2: Check for empty results ──────────────────────
    if (!orsData?.routes?.length) {
      setState({ searchPhase: 'no-route' });
      return;
    }

    // ── Step 3: Fetch weather for each route's midpoint ──────
    const midpoints      = extractMidpoints(orsData);
    const weatherResults = await _fetchWeatherForAll(midpoints);
    const weatherPartial = weatherResults.some(r => r === null);

    // ── Step 4: Normalise (includes coordinates for map) ─────
    const routes = normalizeRoutes(orsData, weatherResults);

    // ── Step 5: Cache ─────────────────────────────────────────
    try {
      await cacheSet(origin.name, destination.name, routes);
    } catch (cacheErr) {
      console.warn('[app] Cache write failed:', cacheErr.message);
    }

    // ── Step 6: Write URL state ───────────────────────────────
    writeUrlState(origin.name, destination.name);

    // ── Step 7: Update store → triggers re-render + map ──────
    setState({ routes, searchPhase: 'done', weatherPartial });

  } catch (err) {
    console.error('[app] Unhandled error in _handleSearch:', err);
    _showError('Something went wrong. Please try again.');
  }
}

// ─── Weather fetch (parallel, fail-soft) ──────────────────────

async function _fetchWeatherForAll(midpoints) {
  return Promise.all(
    midpoints.map(mp =>
      fetchWeatherRisk(mp.lat, mp.lon).catch(err => {
        console.warn('[app] Weather fetch failed for midpoint:', err.message);
        return null;
      })
    )
  );
}

// ─── Cache fallback ────────────────────────────────────────────

async function _serveFromCache(origin, destination, isOfflineMode) {
  try {
    const cached = await cacheGet(origin.name, destination.name);
    if (cached && cached.length > 0) {
      setState({
        routes         : cached,
        searchPhase    : 'done',
        isOffline      : isOfflineMode,
        weatherPartial : cached.some(r => r.weatherRisk === 'unavailable'),
      });
      _showOfflineBanner(true);
      return true;
    }
  } catch (cacheErr) {
    console.warn('[app] Cache read failed:', cacheErr.message);
  }
  return false;
}

// ─── Share button ─────────────────────────────────────────────

function _handleShare() {
  const { origin, destination } = getState();
  if (!origin || !destination) return;

  const url = buildShareUrl(origin.name, destination.name);

  // Prefer native share sheet on mobile; fall back to clipboard
  if (navigator.share && /Mobi|Android/i.test(navigator.userAgent)) {
    navigator.share({
      title: `DecisionRoute: ${origin.name} → ${destination.name}`,
      url,
    }).catch(() => {/* user dismissed */});
  } else {
    navigator.clipboard.writeText(url).then(() => {
      const toast = document.getElementById('share-toast');
      if (!toast) return;
      toast.hidden = false;
      setTimeout(() => { toast.hidden = true; }, 2500);
    }).catch(() => {/* clipboard denied */});
  }
}

// ─── Error display ─────────────────────────────────────────────

function _showError(message) {
  setState({ searchPhase: 'error', errorMessage: message });
}

function _friendlyRoutingError(err) {
  if (err?.message?.includes('NoRoute') || err?.message?.includes('not found')) {
    return 'No drivable road found between these locations. Try locations closer together.';
  }
  if (err?.status >= 500) return 'The routing service is temporarily unavailable. Please try again shortly.';
  return 'Could not reach the routing service. Check your internet connection and try again.';
}

// ─── Retry ────────────────────────────────────────────────────

async function _retryLastSearch() {
  if (_lastOrigin && _lastDestination) {
    cancelRouting();
    await _handleSearch(_lastOrigin, _lastDestination);
  }
}

// ─── Online / offline banner ──────────────────────────────────

function _handleOnlineStatusChange() {
  const online = navigator.onLine;
  const { isOffline } = getState();
  if (!online && isOffline) {
    _showOfflineBanner(true);
  } else if (online && !isOffline) {
    _showOfflineBanner(false);
  }
}

function _showOfflineBanner(show) {
  const banner = document.getElementById('offline-banner');
  if (banner) banner.hidden = !show;
}
