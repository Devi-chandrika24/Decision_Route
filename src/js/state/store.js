/**
 * store.js — Minimal pub-sub state store
 *
 * Architecture:
 *   Producers call setState(partialUpdate)
 *   Consumers call subscribe(listener) → receive full next state on every change
 *   Any module can read the current snapshot with getState()
 *
 * Design decisions:
 *   - No dependencies, no proxy magic, no virtual DOM.
 *   - Immutable snapshots via Object.freeze to catch accidental mutations early.
 *   - Listeners receive (nextState, prevState) so components can diff selectively.
 *
 * Usage example:
 *
 *   import { getState, setState, subscribe } from './store.js';
 *
 *   // Subscribe to changes
 *   const unsub = subscribe((next, prev) => {
 *     if (next.routes !== prev.routes) renderRoutes(next.routes);
 *   });
 *
 *   // Update state (shallow merge)
 *   setState({ searchPhase: 'loading' });
 *
 *   // Read current state
 *   const { weights } = getState();
 *
 *   // Unsubscribe when component is destroyed
 *   unsub();
 */

/** @typedef {'idle'|'geocoding'|'routing'|'done'|'error'|'no-route'|'offline'} SearchPhase */

/**
 * @typedef {Object} AppState
 * @property {SearchPhase}   searchPhase    - Current data-fetching lifecycle stage
 * @property {{ name:string, lat:number, lon:number }|null} origin
 * @property {{ name:string, lat:number, lon:number }|null} destination
 * @property {import('../services/normalize.js').Route[]}   routes       - Normalized route objects
 * @property {{ time:number, cost:number, risk:number }}    weights      - 0-1 dimension weights (sum ≈ 1)
 * @property {string|null}   errorMessage   - Human-readable error text for error state
 * @property {boolean}       isOffline      - True when serving cached data
 * @property {boolean}       weatherPartial - True when weather API failed; routes still shown
 */

/** @type {AppState} */
const INITIAL_STATE = Object.freeze({
  searchPhase    : 'idle',
  origin         : null,
  destination    : null,
  routes         : [],
  weights        : { time: 0.34, cost: 0.33, risk: 0.33 },
  errorMessage   : null,
  isOffline      : false,
  weatherPartial : false,
});

/** @type {AppState} */
let _state = INITIAL_STATE;

/** @type {Set<Function>} */
const _listeners = new Set();

/**
 * Returns a frozen snapshot of the current application state.
 * @returns {Readonly<AppState>}
 */
export function getState() {
  return _state;
}

/**
 * Merges partial update into state, then notifies all subscribers.
 * @param {Partial<AppState>} partial
 */
export function setState(partial) {
  const prev  = _state;
  _state      = Object.freeze({ ...prev, ...partial });

  for (const listener of _listeners) {
    try {
      listener(_state, prev);
    } catch (err) {
      // A subscriber crash must not prevent other subscribers from receiving the update
      console.error('[store] Subscriber threw an error:', err);
    }
  }
}

/**
 * Registers a listener that receives (nextState, prevState) on every state change.
 * Returns an unsubscribe function.
 * @param {(next: Readonly<AppState>, prev: Readonly<AppState>) => void} listener
 * @returns {() => void} unsubscribe
 */
export function subscribe(listener) {
  if (typeof listener !== 'function') {
    throw new TypeError('[store] subscribe() expects a function');
  }
  _listeners.add(listener);
  return () => _listeners.delete(listener);
}

/**
 * Resets the entire store back to initial state.
 * Useful for testing or hard-reset flows.
 */
export function resetState() {
  setState(INITIAL_STATE);
}
