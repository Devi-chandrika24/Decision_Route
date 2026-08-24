/**
 * format.js — Presentation-layer formatting helpers
 *
 * All functions are pure — no side effects, no DOM interaction.
 * They take raw numbers/strings and return human-readable strings.
 */

/**
 * Formats a duration in minutes to a human-readable string.
 * @param {number} totalMinutes
 * @returns {string}  e.g. "1 hr 23 min" or "45 min"
 */
export function formatDuration(totalMinutes) {
  const minutes = Math.round(totalMinutes);
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} hr` : `${h} hr ${m} min`;
}

/**
 * Formats a distance in kilometres.
 * @param {number} km
 * @returns {string}  e.g. "12.4 km" or "980 m"
 */
export function formatDistance(km) {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toFixed(1)} km`;
}

/**
 * Formats an estimated toll/cost in Indian Rupees (₹).
 * Uses Intl.NumberFormat for locale-correct number formatting.
 * @param {number} amount — amount in INR
 * @returns {string}  e.g. "₹120" or "₹0 (No toll)"
 */
export function formatCost(amount) {
  if (amount <= 0) return '₹0 (Free)';
  return `₹${new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(amount)}`;
}

/**
 * Converts a weather risk level to a display object.
 * @param {'low'|'medium'|'high'|'unavailable'} level
 * @returns {{ label: string, icon: string, cssClass: string }}
 */
export function formatWeatherRisk(level) {
  const map = {
    low          : { label: 'Clear conditions',  icon: '🌤️',  cssClass: 'weather-badge--low' },
    medium       : { label: 'Light rain',         icon: '🌦️',  cssClass: 'weather-badge--medium' },
    high         : { label: 'Heavy rain / fog',   icon: '⛈️',  cssClass: 'weather-badge--high' },
    unavailable  : { label: 'Weather unavailable',icon: '❓',  cssClass: 'weather-badge--unavailable' },
  };
  return map[level] ?? map.unavailable;
}

/**
 * Returns a percentage string from a 0-1 decimal.
 * @param {number} fraction — e.g. 0.34
 * @returns {string} — e.g. "34%"
 */
export function formatPercent(fraction) {
  return `${Math.round(fraction * 100)}%`;
}

/**
 * Converts a 0-1 score to a 1-10 display score.
 * @param {number} score — normalised score between 0 and 1
 * @returns {string} — e.g. "8.4"
 */
export function formatScore(score) {
  return (score * 10).toFixed(1);
}

/**
 * Truncates a place name for card display.
 * @param {string} name
 * @param {number} [maxLen=30]
 * @returns {string}
 */
export function truncateName(name, maxLen = 30) {
  if (!name || name.length <= maxLen) return name;
  return name.slice(0, maxLen - 1) + '…';
}
