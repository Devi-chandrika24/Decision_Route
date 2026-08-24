/**
 * route-card.js — Renders a single route comparison card
 *
 * Uses realvjy's 3dicons hosted on Wikimedia Commons.
 * Adds a 3D CSS perspective-tilt effect on mousemove — GPU-accelerated
 * via will-change:transform declared in components.css.
 *
 * The tilt resets on mouseleave with a spring transition.
 */

import {
  formatDuration,
  formatDistance,
  formatCost,
  formatScore,
} from '../utils/format.js';

/** 3D icon URLs for weather risk levels */
const WEATHER_ICONS = {
  low         : { url: 'https://upload.wikimedia.org/wikipedia/commons/7/7c/Sun-dynamic-color.png?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=original',          label: 'Clear conditions',   cls: 'weather-badge--low' },
  medium      : { url: 'https://upload.wikimedia.org/wikipedia/commons/5/5e/Umbrella-dynamic-color.png?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=original',     label: 'Light rain',          cls: 'weather-badge--medium' },
  high        : { url: 'https://upload.wikimedia.org/wikipedia/commons/f/f1/Flash-dynamic-color.png?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=original',        label: 'Heavy rain / fog',    cls: 'weather-badge--high' },
  unavailable : { url: 'https://upload.wikimedia.org/wikipedia/commons/0/0e/Thumb-down-dynamic-color.png?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=original',   label: 'Weather unavailable', cls: 'weather-badge--unavailable' },
};

/** 3D Icons for metrics */
const METRIC_ICONS = {
  time: 'https://upload.wikimedia.org/wikipedia/commons/3/3f/Clock-dynamic-color.png?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=original',
  distance: 'https://upload.wikimedia.org/wikipedia/commons/c/c5/Location-dynamic-color.png?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=original',
  cost: 'https://upload.wikimedia.org/wikipedia/commons/2/22/Money-dynamic-color.png?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=original',
  toll: 'https://upload.wikimedia.org/wikipedia/commons/0/09/3d-coin-dynamic-color.png?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=original',
  trophy: 'https://upload.wikimedia.org/wikipedia/commons/1/13/Trophy-dynamic-color.png?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=original'
};

/**
 * Creates a route card DOM element for the given scored route.
 *
 * @param {import('../services/scoring.js').ScoredRoute} route
 * @param {number} maxScore — highest score in the result set (for proportional bar)
 * @returns {HTMLElement}
 */
export function createRouteCard(route, maxScore) {
  const isRec    = route.recommended;
  const barWidth = maxScore > 0 ? Math.round((route.score / maxScore) * 100) : 0;
  const weather  = WEATHER_ICONS[route.weatherRisk] ?? WEATHER_ICONS.unavailable;

  const article = document.createElement('article');
  article.className = `route-card glass-card${isRec ? ' route-card--recommended' : ''}`;
  article.setAttribute('role', 'listitem');
  article.setAttribute('aria-label', `${route.label}${isRec ? ', recommended' : ''}`);

  article.innerHTML = `
    <header class="route-card__header">
      <span class="route-card__label">${_esc(route.label)}</span>
      ${isRec ? `
        <span class="route-card__badge">
          <img src="${METRIC_ICONS.trophy}" alt="Trophy" class="badge-3dicon" aria-hidden="true" /> Recommended
        </span>` : ''}
    </header>

    <div class="route-card__metrics" role="group" aria-label="${_esc(route.label)} metrics">

      <div class="metric">
        <img src="${METRIC_ICONS.time}" alt="Time" class="metric__3dicon" aria-hidden="true" />
        <span class="metric__value">${_esc(formatDuration(route.durationMin))}</span>
        <span class="metric__label">Travel time</span>
      </div>

      <div class="metric">
        <img src="${METRIC_ICONS.distance}" alt="Distance" class="metric__3dicon" aria-hidden="true" />
        <span class="metric__value">${_esc(formatDistance(route.distanceKm))}</span>
        <span class="metric__label">Distance</span>
      </div>

      <div class="metric">
        <img src="${METRIC_ICONS.cost}" alt="Cost" class="metric__3dicon" aria-hidden="true" />
        <span class="metric__value">${_esc(formatCost(route.totalCostEstimate))}</span>
        <span class="metric__label">Est. total cost*</span>
      </div>

      <div class="metric">
        <img src="${METRIC_ICONS.toll}" alt="Toll" class="metric__3dicon" aria-hidden="true" />
        <span class="metric__value">${_esc(formatCost(route.tollEstimate))}</span>
        <span class="metric__label">Toll estimate*</span>
      </div>

    </div>

    <div class="weather-badge ${_esc(weather.cls)}"
         role="status"
         aria-label="Weather risk: ${_esc(weather.label)}">
      <img src="${_esc(weather.url)}" alt="${_esc(weather.label)}" class="weather-badge__3dicon" aria-hidden="true" />
      <span>${_esc(weather.label)}</span>
      ${route.precipMm !== null
        ? `<span class="weather-detail" style="margin-left:auto;font-size:0.75rem;opacity:0.7">${route.precipMm.toFixed(1)} mm</span>`
        : ''}
    </div>

    <div>
      <div class="route-card__score-bar"
           role="progressbar"
           aria-label="Decision score: ${formatScore(route.score)} out of 10"
           aria-valuenow="${Math.round(route.score * 100)}"
           aria-valuemin="0" aria-valuemax="100">
        <div class="score-bar__fill" style="width:${barWidth}%"></div>
      </div>
      <div class="route-card__score-label">
        <span>Decision score</span>
        <span><strong>${formatScore(route.score)}</strong>/10</span>
      </div>
    </div>
  `;

  // ── 3D Tilt effect ─────────────────────────────────────────
  _attach3DTilt(article);

  return article;
}

/**
 * Attaches a GPU-accelerated 3D perspective-tilt effect.
 * The card tilts toward the cursor on mousemove and springs back on leave.
 *
 * @param {HTMLElement} el
 */
function _attach3DTilt(el) {
  const MAX_TILT = 8; // degrees

  el.addEventListener('mousemove', (e) => {
    const rect = el.getBoundingClientRect();
    const cx   = rect.left + rect.width  / 2;
    const cy   = rect.top  + rect.height / 2;
    const dx   = (e.clientX - cx) / (rect.width  / 2);  // -1 to 1
    const dy   = (e.clientY - cy) / (rect.height / 2);  // -1 to 1

    const rotY =  dx * MAX_TILT;
    const rotX = -dy * MAX_TILT;

    el.style.transform    = `perspective(900px) rotateX(${rotX}deg) rotateY(${rotY}deg) translateY(-4px) scale(1.015)`;
    el.style.transition   = 'transform 60ms linear, box-shadow 60ms linear';
    el.style.zIndex       = '10';
  });

  el.addEventListener('mouseleave', () => {
    el.style.transform  = '';
    el.style.transition = 'transform 400ms cubic-bezier(0.34,1.56,0.64,1), box-shadow 250ms ease, border-color 250ms ease';
    el.style.zIndex     = '';
  });
}

/**
 * Creates a skeleton card placeholder used during loading.
 * @returns {HTMLElement}
 */
export function createSkeletonCard() {
  const div = document.createElement('div');
  div.className = 'skeleton-card';
  div.setAttribute('aria-hidden', 'true');
  div.innerHTML = `
    <div class="skeleton-line skeleton-line--wide"></div>
    <div class="skeleton-line"></div>
    <div class="skeleton-line skeleton-line--narrow"></div>
    <div class="skeleton-line"></div>
    <div class="skeleton-badge"></div>
  `;
  return div;
}

// ─── Helpers ──────────────────────────────────────────────────
function _esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
