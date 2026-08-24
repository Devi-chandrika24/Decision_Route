/**
 * normalize.js — Integrates raw OSRM + Open-Meteo responses into
 * consistent Route objects consumed by the rest of the application.
 *
 * OSRM response shape (per route):
 *   {
 *     geometry: { type: "LineString", coordinates: [[lon,lat], ...] },
 *     legs: [{ distance, duration, summary }],
 *     distance: <total metres>,
 *     duration: <total seconds>
 *   }
 *
 * Toll estimation:
 *   OSRM doesn't provide toll data. We use a flat heuristic:
 *   ~25% of Indian national highways have tolls, so we estimate
 *   toll = distanceKm × 0.25 × INR_TOLL_RATE
 *   Clearly labelled as an estimate in the UI.
 */

import { midpointFromBbox } from '../api/weather.js';

/** Rough toll cost per km on Indian highways (INR) — estimate */
const TOLL_RATE_INR_PER_KM = 2.5;

/** Coverage factor: ~25% of highway km are typically tolled */
const TOLL_COVERAGE_FACTOR = 0.25;

/** Fuel + maintenance: assumes average car at ₹12/km */
const FUEL_RATE_INR_PER_KM = 12;

/** Route label letters */
const LABELS = ['A', 'B', 'C', 'D', 'E'];

/**
 * @typedef {Object} Route
 * @property {string}  id
 * @property {string}  label
 * @property {number}  distanceKm
 * @property {number}  durationMin
 * @property {number}  fuelEstimate       — INR
 * @property {number}  tollEstimate       — INR (heuristic)
 * @property {number}  totalCostEstimate  — INR
 * @property {import('../api/weather.js').WeatherRiskLevel} weatherRisk
 * @property {number|null} precipMm
 * @property {number|null} visibilityM
 * @property {number|null} precipProb
 * @property {Array<number>}          bbox         — [minLon, minLat, maxLon, maxLat]
 * @property {Array<[number,number]>} coordinates  — [[lon,lat], ...] for Leaflet
 */

/**
 * Normalises raw OSRM routes + weather results into Route objects.
 *
 * @param {Object}   osrmResponse   — raw response from OSRM API
 * @param {Array<import('../api/weather.js').WeatherResult|null>} weatherResults
 * @returns {Route[]}
 */
export function normalizeRoutes(osrmResponse, weatherResults) {
  const rawRoutes = osrmResponse?.routes;

  if (!Array.isArray(rawRoutes) || rawRoutes.length === 0) {
    return [];
  }

  return rawRoutes.map((raw, idx) => {
    // OSRM places distance/duration at root level of each route
    const distanceKm  = _mToKm(raw.distance ?? 0);
    const durationMin = _secToMin(raw.duration ?? 0);

    // Coordinates from GeoJSON geometry (already decoded by OSRM)
    const coordinates = raw.geometry?.coordinates ?? [];

    // Compute bounding box from coordinate array
    const bbox = _computeBbox(coordinates);

    // Toll heuristic (OSRM has no toll data)
    const tollEstimate  = _round(distanceKm * TOLL_COVERAGE_FACTOR * TOLL_RATE_INR_PER_KM);
    const fuelEstimate  = _round(distanceKm * FUEL_RATE_INR_PER_KM);

    // Weather — merge if available, mark unavailable if fetch failed
    const weather      = weatherResults[idx] ?? null;
    const weatherRisk  = weather?.riskLevel ?? 'unavailable';
    const precipMm     = weather?.precipMm     ?? null;
    const visibilityM  = weather?.visibilityM  ?? null;
    const precipProb   = weather?.precipProb   ?? null;

    return {
      id                : `route-${idx}`,
      label             : `Route ${LABELS[idx] ?? idx + 1}`,
      distanceKm,
      durationMin,
      fuelEstimate,
      tollEstimate,
      totalCostEstimate : fuelEstimate + tollEstimate,
      weatherRisk,
      precipMm,
      visibilityM,
      precipProb,
      bbox,
      coordinates,
    };
  });
}

/**
 * Extracts midpoint coordinates for each route's weather lookup.
 * Uses the middle coordinate of the route geometry.
 *
 * @param {Object} osrmResponse
 * @returns {Array<{ lat: number, lon: number }>}
 */
export function extractMidpoints(osrmResponse) {
  const routes = osrmResponse?.routes ?? [];
  return routes.map(r => {
    const coords = r.geometry?.coordinates ?? [];
    if (coords.length === 0) return { lat: 0, lon: 0 };
    const mid = coords[Math.floor(coords.length / 2)];
    return { lat: mid[1], lon: mid[0] };   // OSRM: [lon, lat] → flip for weather API
  });
}

// ── Private helpers ────────────────────────────────────────────

/**
 * Computes an axis-aligned bounding box from a coordinate array.
 * @param {Array<[number,number]>} coords — [[lon,lat], ...]
 * @returns {[number,number,number,number]} [minLon, minLat, maxLon, maxLat]
 */
function _computeBbox(coords) {
  if (!coords.length) return [0, 0, 0, 0];
  let minLon = Infinity, minLat = Infinity;
  let maxLon = -Infinity, maxLat = -Infinity;
  for (const [lon, lat] of coords) {
    if (lon < minLon) minLon = lon;
    if (lon > maxLon) maxLon = lon;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  }
  return [minLon, minLat, maxLon, maxLat];
}

const _mToKm    = (m) => Math.round((m / 1000) * 10) / 10;
const _secToMin = (s) => Math.round(s / 60);
const _round    = (n) => Math.round(n);
