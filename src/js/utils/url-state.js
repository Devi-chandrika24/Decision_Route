/**
 * url-state.js — URL query parameter state persistence
 *
 * Makes route comparisons shareable and bookmarkable.
 * The URL encodes origin and destination as human-readable query params:
 *
 *   http://localhost:3000/?from=Chennai&to=Vellore
 *
 * On page load, if these params are present, the search inputs are
 * pre-filled and a search is triggered automatically.
 *
 * Design decisions:
 *  - We only persist origin/destination names (not lat/lon) to keep URLs
 *    short and human-readable. The geocoding step re-runs on load.
 *  - We do NOT persist weights — preferences are personal and session-specific.
 *  - We use replaceState (not pushState) so back-button doesn't loop.
 *
 * Usage:
 *   import { writeUrlState, readUrlState } from './url-state.js';
 *
 *   // After search:
 *   writeUrlState('Chennai', 'Bangalore');
 *   // → URL becomes ?from=Chennai&to=Bangalore
 *
 *   // On page load:
 *   const { from, to } = readUrlState();
 *   // → { from: 'Chennai', to: 'Bangalore' } or { from: null, to: null }
 */

/**
 * Reads origin and destination from the current URL query string.
 * @returns {{ from: string|null, to: string|null }}
 */
export function readUrlState() {
  const params = new URLSearchParams(window.location.search);
  return {
    from : params.get('from') || null,
    to   : params.get('to')   || null,
  };
}

/**
 * Writes origin and destination into the URL without triggering navigation.
 * @param {string} from — origin location name
 * @param {string} to   — destination location name
 */
export function writeUrlState(from, to) {
  if (!from || !to) return;

  const params = new URLSearchParams();
  params.set('from', from);
  params.set('to',   to);

  const newUrl = `${window.location.pathname}?${params.toString()}`;
  window.history.replaceState({ from, to }, '', newUrl);
}

/**
 * Clears the URL query string (for reset/error states).
 */
export function clearUrlState() {
  window.history.replaceState({}, '', window.location.pathname);
}

/**
 * Generates a shareable URL string for the given origin/destination.
 * Used by the Share button.
 * @param {string} from
 * @param {string} to
 * @returns {string} — absolute URL
 */
export function buildShareUrl(from, to) {
  const params = new URLSearchParams({ from, to });
  return `${window.location.origin}${window.location.pathname}?${params.toString()}`;
}
