/**
 * routing.js — OSRM (Open Source Routing Machine) client
 *
 * Why OSRM instead of OpenRouteService:
 *   OSRM's public demo server is completely free, requires no API key,
 *   is CORS-enabled, and can be called directly from the browser.
 *   This eliminates the need for the /api/route proxy entirely.
 *
 * Endpoint: https://router.project-osrm.org/route/v1/driving/{coords}
 *   - Free, no key, open data (OpenStreetMap)
 *   - Returns up to 3 alternative routes
 *   - Geometry is returned as decoded GeoJSON (no polyline decoder needed)
 *
 * Race-condition guarantee (preserved from original design):
 *   Every call to fetchRoutes() cancels the previous in-flight request via
 *   AbortController. If a user triggers A then B in quick succession,
 *   A is aborted before it can overwrite B's result.
 *
 * OSRM response shape:
 *   {
 *     code: "Ok",
 *     routes: [{
 *       geometry: { type: "LineString", coordinates: [[lon,lat], ...] },
 *       legs: [{ distance, duration, summary }],
 *       distance: <metres>,
 *       duration: <seconds>
 *     }],
 *     waypoints: [{ location: [lon, lat], name: "Street" }, ...]
 *   }
 */

const OSRM_BASE = 'https://router.project-osrm.org/route/v1/driving';

/** @type {AbortController|null} */
let _routeController = null;

/**
 * Fetches up to 3 alternative driving routes using OSRM.
 * No API key required. Cancels any previous in-flight request.
 *
 * @param {{ lat: number, lon: number }} origin
 * @param {{ lat: number, lon: number }} destination
 * @returns {Promise<Object>} raw OSRM response
 * @throws {RoutingError|AbortError}
 */
export async function fetchRoutes(origin, destination) {
  // Cancel any previous request to prevent stale responses
  if (_routeController) {
    _routeController.abort();
  }
  _routeController = new AbortController();
  const { signal } = _routeController;

  // OSRM coordinate format: lon,lat (semicolon-separated)
  const coords = `${origin.lon},${origin.lat};${destination.lon},${destination.lat}`;

  const url = new URL(`${OSRM_BASE}/${coords}`);
  url.searchParams.set('alternatives', '3');       // request up to 3 route alternatives
  url.searchParams.set('geometries',   'geojson'); // decoded coordinates (no polyline decoder needed)
  url.searchParams.set('overview',     'full');    // full resolution geometry for map rendering
  url.searchParams.set('steps',        'false');   // no turn-by-turn (reduces payload)
  url.searchParams.set('annotations',  'false');   // no per-node metadata

  try {
    const res = await fetch(url.toString(), { signal });
    _routeController = null;

    if (!res.ok) {
      throw new RoutingError(`OSRM HTTP ${res.status}`, res.status);
    }

    const data = await res.json();

    // OSRM signals routing failures via the `code` field (not HTTP status)
    if (data.code !== 'Ok') {
      throw new RoutingError(
        `OSRM: ${data.message ?? data.code ?? 'Route not found'}`,
        null
      );
    }

    return data;

  } catch (err) {
    if (err.name === 'AbortError') throw err; // expected — superseded by newer call
    _routeController = null;
    throw err instanceof RoutingError ? err : new RoutingError(err.message, null);
  }
}

/**
 * Cancels any in-flight routing request.
 */
export function cancelRouting() {
  if (_routeController) {
    _routeController.abort();
    _routeController = null;
  }
}

/**
 * Typed error class for routing failures.
 * `status` is the HTTP status code (null for OSRM-level errors like NoRoute).
 */
export class RoutingError extends Error {
  /** @param {string} message @param {number|null} [status] */
  constructor(message, status = null) {
    super(message);
    this.name   = 'RoutingError';
    this.status = status;
  }
}
