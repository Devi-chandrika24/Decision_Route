/**
 * comparison.js — Renders the route comparison view
 *
 * Subscribes to the store and re-renders whenever:
 *  - searchPhase changes (show correct state panel)
 *  - routes change (re-score and redraw cards)
 *  - weights change (re-score and redraw cards with same routes)
 *
 * State panels managed here:
 *   idle         → state-empty
 *   geocoding    → (nothing, search form handles it)
 *   routing      → state-loading
 *   done         → state-results
 *   error        → state-error
 *   no-route     → state-no-route
 *   offline      → state-results (with offline banner, handled by app.js)
 */

import { subscribe, getState } from '../state/store.js';
import { scoreRoutes }         from '../services/scoring.js';
import { createRouteCard }     from './route-card.js';
import { formatPercent }       from '../utils/format.js';

// ─── Cached DOM references ────────────────────────────────────
let _stateEmpty   = null;
let _stateLoading = null;
let _stateError   = null;
let _stateNoRoute = null;
let _stateResults = null;
let _routeGrid    = null;
let _recText      = null;
let _recMeta      = null;
let _partialWarn  = null;
let _errorMsg     = null;

/**
 * Initialises the comparison component. Must be called after DOM ready.
 */
export function initComparison() {
  _stateEmpty   = document.getElementById('state-empty');
  _stateLoading = document.getElementById('state-loading');
  _stateError   = document.getElementById('state-error');
  _stateNoRoute = document.getElementById('state-no-route');
  _stateResults = document.getElementById('state-results');
  _routeGrid    = document.getElementById('route-grid');
  _recText      = document.getElementById('recommendation-text');
  _recMeta      = document.getElementById('recommendation-meta');
  _partialWarn  = document.getElementById('partial-warning');
  _errorMsg     = document.getElementById('error-message');

  // Retry button
  document.getElementById('error-retry-btn')?.addEventListener('click', () => {
    window.dispatchEvent(new CustomEvent('dr:retry'));
  });

  // Subscribe to state changes
  subscribe(_onStateChange);

  // Render initial idle state
  _showPanel('idle');
}

// ─── State change handler ─────────────────────────────────────

function _onStateChange(next, prev) {
  const phaseChanged  = next.searchPhase  !== prev.searchPhase;
  const routesChanged = next.routes       !== prev.routes;
  const weightsChanged= next.weights      !== prev.weights;
  const errorChanged  = next.errorMessage !== prev.errorMessage;

  if (phaseChanged || errorChanged) {
    _showPanel(next.searchPhase);
  }

  // Re-render cards when routes or weights change (and we're in results view)
  if ((routesChanged || weightsChanged) && next.searchPhase === 'done') {
    _renderRoutes(next.routes, next.weights, next.weatherPartial);
  }
}

// ─── Panel visibility ─────────────────────────────────────────

/**
 * Shows exactly one state panel, hides all others.
 * @param {string} phase
 */
function _showPanel(phase) {
  const allPanels = [_stateEmpty, _stateLoading, _stateError, _stateNoRoute, _stateResults];
  allPanels.forEach(p => { if (p) p.hidden = true; });

  switch (phase) {
    case 'idle':
      _stateEmpty.hidden = false;
      break;
    case 'routing':
    case 'geocoding':
      _stateLoading.hidden = false;
      break;
    case 'error': {
      const { errorMessage } = getState();
      if (_errorMsg) _errorMsg.textContent = errorMessage ?? 'An unexpected error occurred.';
      _stateError.hidden = false;
      break;
    }
    case 'no-route':
      _stateNoRoute.hidden = false;
      break;
    case 'done':
    case 'offline': {
      const { routes, weights, weatherPartial } = getState();
      _stateResults.hidden = false;
      _renderRoutes(routes, weights, weatherPartial);
      break;
    }
    default:
      _stateEmpty.hidden = false;
  }
}

// ─── Route card rendering ─────────────────────────────────────

/**
 * @param {import('../services/normalize.js').Route[]} routes
 * @param {{ time: number, cost: number, risk: number }} weights
 * @param {boolean} weatherPartial
 */
function _renderRoutes(routes, weights, weatherPartial) {
  if (!routes || routes.length === 0) return;

  // Score routes with current weights
  const scored   = scoreRoutes(routes, weights);
  const maxScore = scored[0]?.score ?? 1;

  // Partial weather warning
  if (_partialWarn) {
    _partialWarn.hidden = !weatherPartial;
  }

  // Clear and rebuild card grid
  _routeGrid.innerHTML = '';
  for (const route of scored) {
    const card = createRouteCard(route, maxScore);
    _routeGrid.appendChild(card);
  }

  // Recommendation panel
  const winner = scored.find(r => r.recommended);
  if (winner) {
    if (_recText) _recText.textContent = winner.explanation;
    if (_recMeta) {
      _recMeta.innerHTML = `
        <span class="score-chip">⏱ Time weight: ${formatPercent(weights.time)}</span>
        <span class="score-chip">💰 Cost weight: ${formatPercent(weights.cost)}</span>
        <span class="score-chip">🌧 Risk weight: ${formatPercent(weights.risk)}</span>
      `;
    }
  }
}
