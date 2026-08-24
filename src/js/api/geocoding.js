/**
 * geocoding.js — Nominatim (OpenStreetMap) geocoding client
 *
 * Responsibilities:
 *  - Wraps the Nominatim /search endpoint
 *  - Cancels in-flight requests when a new one is triggered (AbortController)
 *  - Returns a normalised array of { name, displayName, lat, lon } matches
 *
 * Rate-limit note (Nominatim terms):
 *  - Max 1 request/second per unique IP
 *  - Requires a meaningful User-Agent / referer
 *  - Acceptable for portfolio traffic; NOT production-grade
 *
 * The caller (search.js) adds debouncing; this module handles
 * only the HTTP concern + cancellation.
 */

const NOMINATIM_BASE  = 'https://nominatim.openstreetmap.org/search';
const USER_AGENT      = 'DecisionRoute/1.0 (portfolio project)';
const MAX_RESULTS     = 5;

/** @type {AbortController|null} — tracks the current in-flight geocode request */
let _currentController = null;

/**
 * @typedef {Object} GeoResult
 * @property {string} name        — Short display name for dropdown (e.g. "Chennai")
 * @property {string} displayName — Full place name for aria-label / tooltip
 * @property {number} lat
 * @property {number} lon
 * @property {string} type        — OSM place type (e.g. "city", "village")
 */

/**
 * Geocodes a free-text query using Nominatim.
 * Cancels any previous in-flight geocode request automatically.
 *
 * @param {string} query — raw user input
 * @returns {Promise<GeoResult[]>} — resolves with [] on empty / cancelled
 */
export async function geocode(query) {
  const trimmed = query.trim();
  if (!trimmed || trimmed.length < 2) return [];

  // Cancel the previous request if still pending
  if (_currentController) {
    _currentController.abort();
  }
  _currentController = new AbortController();
  const { signal } = _currentController;

  const url = new URL(NOMINATIM_BASE);
  url.searchParams.set('q',              trimmed);
  url.searchParams.set('format',         'json');
  url.searchParams.set('addressdetails', '0');
  url.searchParams.set('limit',          String(MAX_RESULTS));
  url.searchParams.set('dedupe',         '1');

  try {
    const res = await fetch(url.toString(), {
      signal,
      headers: {
        'User-Agent': USER_AGENT,
        // Referer helps Nominatim enforce fair-use attribution
        'Referer': window.location.origin,
      },
    });

    if (!res.ok) {
      throw new Error(`Nominatim HTTP ${res.status}`);
    }

    /** @type {Array<Record<string, any>>} */
    const raw = await res.json();
    _currentController = null;

    return raw.map(item => ({
      name        : _buildShortName(item),
      displayName : item.display_name ?? '',
      lat         : parseFloat(item.lat),
      lon         : parseFloat(item.lon),
      type        : item.type ?? 'place',
    }));

  } catch (err) {
    if (err.name === 'AbortError') {
      // Expected — a new request superseded this one; return silently
      return [];
    }
    _currentController = null;
    throw err;
  }
}

/**
 * Cancels any in-flight geocode request immediately.
 * Call this when the input field is cleared or component is destroyed.
 */
export function cancelGeocode() {
  if (_currentController) {
    _currentController.abort();
    _currentController = null;
  }
}

/**
 * Builds a concise label from a Nominatim result.
 * Nominatim's display_name is often very long; we extract the first 2 segments.
 *
 * @param {Record<string, any>} item
 * @returns {string}
 */
function _buildShortName(item) {
  if (!item.display_name) return 'Unknown place';
  const parts = item.display_name.split(',').map(p => p.trim());
  // Take first two meaningful parts (city, state) for readability
  return parts.slice(0, 2).join(', ');
}
