/**
 * weather.js — Open-Meteo API client
 *
 * Open-Meteo is free, has no API key, and is CORS-enabled — safe
 * to call directly from browser JS.
 *
 * We request:
 *   - hourly precipitation (mm)   → rain risk signal
 *   - hourly visibility (m)        → fog/hazard signal
 *   - precipitation_probability   → combined risk scoring
 *
 * We look at the next 3 hours from "now" at the given coordinate
 * (destination or route midpoint) and reduce to a single risk level.
 *
 * Risk levels:
 *   low       — <0.5 mm precip AND visibility > 5000 m
 *   medium    — 0.5–5 mm precip OR visibility 1000–5000 m
 *   high      — >5 mm precip OR visibility < 1000 m
 */

const OPEN_METEO_BASE = 'https://api.open-meteo.com/v1/forecast';

/**
 * @typedef {'low'|'medium'|'high'|'unavailable'} WeatherRiskLevel
 */

/**
 * @typedef {Object} WeatherResult
 * @property {WeatherRiskLevel} riskLevel
 * @property {number|null}      precipMm      — avg precipitation over next 3h (mm)
 * @property {number|null}      visibilityM   — avg visibility over next 3h (m)
 * @property {number|null}      precipProb    — avg precipitation probability (%)
 */

/**
 * Fetches weather data at a lat/lon coordinate and returns a risk assessment.
 *
 * @param {number} lat
 * @param {number} lon
 * @returns {Promise<WeatherResult>}
 */
export async function fetchWeatherRisk(lat, lon) {
  const url = new URL(OPEN_METEO_BASE);
  url.searchParams.set('latitude',    lat.toFixed(4));
  url.searchParams.set('longitude',   lon.toFixed(4));
  url.searchParams.set('hourly',      'precipitation,visibility,precipitation_probability');
  url.searchParams.set('forecast_days', '1');
  url.searchParams.set('timezone',    'auto');

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`Open-Meteo HTTP ${res.status}`);

  const data = await res.json();

  const { hourly } = data;
  if (!hourly) throw new Error('Unexpected Open-Meteo response shape');

  // Find the index of the current hour in the hourly time array
  const now      = new Date();
  const nowHour  = now.toISOString().slice(0, 13);       // "YYYY-MM-DDTHH"
  const times    = hourly.time ?? [];
  let startIdx   = times.findIndex(t => t.startsWith(nowHour));
  if (startIdx === -1) startIdx = 0;                      // fallback: first entry

  // Average over the next 3 hours (journey window)
  const window = 3;
  const slice  = (arr) => (arr ?? []).slice(startIdx, startIdx + window);

  const precipValues = slice(hourly.precipitation);
  const visValues    = slice(hourly.visibility);
  const probValues   = slice(hourly.precipitation_probability);

  const avg = (arr) => arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : null;

  const precipMm    = avg(precipValues);
  const visibilityM = avg(visValues);
  const precipProb  = avg(probValues);

  const riskLevel = _classifyRisk(precipMm, visibilityM);

  return { riskLevel, precipMm, visibilityM, precipProb };
}

/**
 * Classifies weather risk from precipitation and visibility values.
 * @param {number|null} precipMm
 * @param {number|null} visibilityM
 * @returns {WeatherRiskLevel}
 */
function _classifyRisk(precipMm, visibilityM) {
  if (precipMm === null || visibilityM === null) return 'unavailable';

  if (precipMm > 5 || visibilityM < 1000) return 'high';
  if (precipMm > 0.5 || visibilityM < 5000) return 'medium';
  return 'low';
}

/**
 * Computes the geographic midpoint of a route for weather lookup.
 * ORS routes include a bounding box; we take its centre.
 *
 * @param {Array<number>} bbox — [minLon, minLat, maxLon, maxLat]
 * @returns {{ lat: number, lon: number }}
 */
export function midpointFromBbox(bbox) {
  const [minLon, minLat, maxLon, maxLat] = bbox;
  return {
    lat: (minLat + maxLat) / 2,
    lon: (minLon + maxLon) / 2,
  };
}
