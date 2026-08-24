/**
 * search.js — Search input component with geocode autocomplete
 *
 * Responsibilities:
 *  - Binds to the two location input fields in index.html
 *  - Debounces user input at 300ms before triggering geocoding
 *  - Renders a disambiguation dropdown when Nominatim returns >1 result
 *  - Handles full keyboard navigation: ↑↓ Arrow, Enter, Escape
 *  - Exposes `onLocationsReady(callback)` so app.js can react to confirmed selections
 *  - Manages ARIA attributes for combobox/listbox accessibility
 */

import { geocode, cancelGeocode } from '../api/geocoding.js';
import { debounce } from '../utils/debounce.js';
import { setState, getState } from '../state/store.js';

const DEBOUNCE_MS = 300;

/** @type {((origin: GeoResult, dest: GeoResult) => void)|null} */
let _onReadyCallback = null;

// ─── Shared state for both fields ─────────────────────────────
const fields = {
  origin: {
    inputEl       : null,
    clearBtn      : null,
    suggestionsEl : null,
    wrapperEl     : null,
    selectedResult: null,    // { name, displayName, lat, lon, type }
  },
  dest: {
    inputEl       : null,
    clearBtn      : null,
    suggestionsEl : null,
    wrapperEl     : null,
    selectedResult: null,
  },
};

/** Index of the currently keyboard-highlighted suggestion (-1 = none) */
let _highlightIndex = { origin: -1, dest: -1 };

/**
 * Initialises the search component. Must be called after DOM ready.
 */
export function initSearch() {
  // Wire up DOM references
  fields.origin.inputEl       = document.getElementById('origin-input');
  fields.origin.clearBtn      = fields.origin.inputEl.parentElement.querySelector('.search-field__clear');
  fields.origin.suggestionsEl = document.getElementById('origin-suggestions');
  fields.origin.wrapperEl     = document.getElementById('origin-input').closest('.search-field');

  fields.dest.inputEl       = document.getElementById('dest-input');
  fields.dest.clearBtn      = fields.dest.inputEl.parentElement.querySelector('.search-field__clear');
  fields.dest.suggestionsEl = document.getElementById('dest-suggestions');
  fields.dest.wrapperEl     = document.getElementById('dest-input').closest('.search-field');

  _bindField('origin', fields.origin);
  _bindField('dest',   fields.dest);

  // Swap button
  document.getElementById('swap-btn').addEventListener('click', _handleSwap);

  // Search form submit
  document.getElementById('search-form').addEventListener('submit', _handleFormSubmit);
}

/**
 * Registers a callback invoked when both locations are confirmed.
 * @param {(origin: object, dest: object) => void} callback
 */
export function onLocationsReady(callback) {
  _onReadyCallback = callback;
}

// ─── Field binding ─────────────────────────────────────────────

function _bindField(fieldId, field) {
  const debouncedGeocode = debounce(_fetchSuggestions.bind(null, fieldId, field), DEBOUNCE_MS);

  field.inputEl.addEventListener('input', () => {
    const val = field.inputEl.value.trim();

    // Reset confirmed selection when user types again
    if (field.selectedResult) {
      field.selectedResult = null;
      _updateSearchButton();
    }

    field.clearBtn.hidden = !val;

    if (!val) {
      debouncedGeocode.cancel();
      cancelGeocode();
      _closeSuggestions(fieldId, field);
      return;
    }
    debouncedGeocode(val);
  });

  field.inputEl.addEventListener('keydown', (e) => _handleKeydown(e, fieldId, field));

  field.clearBtn.addEventListener('click', () => {
    field.inputEl.value       = '';
    field.inputEl.focus();
    field.selectedResult      = null;
    field.clearBtn.hidden     = true;
    debouncedGeocode.cancel();
    _closeSuggestions(fieldId, field);
    _updateSearchButton();
  });

  // Close dropdown when clicking outside
  document.addEventListener('click', (e) => {
    if (!field.wrapperEl.contains(e.target)) {
      _closeSuggestions(fieldId, field);
    }
  });
}

// ─── Geocoding & rendering ─────────────────────────────────────

async function _fetchSuggestions(fieldId, field, query) {
  try {
    const results = await geocode(query);
    if (!results.length) {
      _closeSuggestions(fieldId, field);
      return;
    }
    _renderSuggestions(fieldId, field, results);
  } catch (err) {
    if (err.name !== 'AbortError') {
      console.warn('[search] Geocode error:', err.message);
      _closeSuggestions(fieldId, field);
    }
  }
}

/**
 * @param {string} fieldId
 * @param {object} field
 * @param {import('../api/geocoding.js').GeoResult[]} results
 */
function _renderSuggestions(fieldId, field, results) {
  const ul = field.suggestionsEl;
  ul.innerHTML = '';
  _highlightIndex[fieldId] = -1;

  results.forEach((result, idx) => {
    const li = document.createElement('li');
    li.className = 'suggestion-item';
    li.setAttribute('role',     'option');
    li.setAttribute('tabindex', '-1');
    li.setAttribute('id',       `${fieldId}-suggestion-${idx}`);

    li.innerHTML = `
      <span class="suggestion-item__icon" aria-hidden="true">${_placeIcon(result.type)}</span>
      <span class="suggestion-item__content">
        <span class="suggestion-item__name">${_esc(result.name)}</span>
        <span class="suggestion-item__meta">${_esc(result.displayName)}</span>
      </span>
    `;

    li.addEventListener('click',        () => _selectResult(fieldId, field, result));
    li.addEventListener('mousedown',    (e)  => e.preventDefault()); // keep input focused
    li.addEventListener('pointerenter', () => _setHighlight(fieldId, field, idx));

    ul.appendChild(li);
  });

  ul.hidden = false;
  field.wrapperEl.setAttribute('aria-expanded', 'true');
}

function _closeSuggestions(fieldId, field) {
  field.suggestionsEl.hidden = true;
  field.suggestionsEl.innerHTML = '';
  field.wrapperEl.setAttribute('aria-expanded', 'false');
  _highlightIndex[fieldId] = -1;
}

// ─── Selection ─────────────────────────────────────────────────

/**
 * @param {string} fieldId
 * @param {object} field
 * @param {import('../api/geocoding.js').GeoResult} result
 */
function _selectResult(fieldId, field, result) {
  field.inputEl.value   = result.name;
  field.selectedResult  = result;
  field.clearBtn.hidden = false;
  _closeSuggestions(fieldId, field);
  _updateSearchButton();

  // Update store with selected location
  if (fieldId === 'origin') {
    setState({ origin: { name: result.name, lat: result.lat, lon: result.lon } });
  } else {
    setState({ destination: { name: result.name, lat: result.lat, lon: result.lon } });
  }
}

// ─── Keyboard navigation ───────────────────────────────────────

function _handleKeydown(e, fieldId, field) {
  const items = field.suggestionsEl.querySelectorAll('.suggestion-item');
  const count = items.length;
  if (!count && e.key !== 'Escape') return;

  switch (e.key) {
    case 'ArrowDown': {
      e.preventDefault();
      const next = (_highlightIndex[fieldId] + 1) % count;
      _setHighlight(fieldId, field, next);
      break;
    }
    case 'ArrowUp': {
      e.preventDefault();
      const prev = (_highlightIndex[fieldId] - 1 + count) % count;
      _setHighlight(fieldId, field, prev);
      break;
    }
    case 'Enter': {
      if (_highlightIndex[fieldId] >= 0) {
        e.preventDefault();
        items[_highlightIndex[fieldId]].click();
      }
      break;
    }
    case 'Escape':
      _closeSuggestions(fieldId, field);
      break;
  }
}

function _setHighlight(fieldId, field, idx) {
  const items = field.suggestionsEl.querySelectorAll('.suggestion-item');
  items.forEach(el => el.removeAttribute('aria-selected'));
  if (idx >= 0 && idx < items.length) {
    items[idx].setAttribute('aria-selected', 'true');
    items[idx].scrollIntoView({ block: 'nearest' });
  }
  _highlightIndex[fieldId] = idx;
}

// ─── Swap ──────────────────────────────────────────────────────

function _handleSwap() {
  const origVal  = fields.origin.inputEl.value;
  const destVal  = fields.dest.inputEl.value;
  const origRes  = fields.origin.selectedResult;
  const destRes  = fields.dest.selectedResult;

  fields.origin.inputEl.value     = destVal;
  fields.dest.inputEl.value       = origVal;
  fields.origin.selectedResult    = destRes;
  fields.dest.selectedResult      = origRes;

  // Sync clear button visibility
  fields.origin.clearBtn.hidden = !destVal;
  fields.dest.clearBtn.hidden   = !origVal;

  // Sync store
  const { origin, destination } = getState();
  setState({ origin: destination, destination: origin });

  _updateSearchButton();
}

// ─── Form submit ───────────────────────────────────────────────

function _handleFormSubmit(e) {
  e.preventDefault();
  const o = fields.origin.selectedResult;
  const d = fields.dest.selectedResult;
  if (o && d && _onReadyCallback) {
    _onReadyCallback(o, d);
  }
}

// ─── Search button gating ──────────────────────────────────────

function _updateSearchButton() {
  const btn = document.getElementById('search-btn');
  const ready = !!(fields.origin.selectedResult && fields.dest.selectedResult);
  btn.disabled = !ready;
}

// ─── Tiny helpers ──────────────────────────────────────────────

function _esc(str) {
  // Minimal HTML entity escaping to prevent XSS in suggestion text
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function _placeIcon(type) {
  const map = {
    city     : '🏙️', town: '🏘️', village: '🏡', suburb: '🏘️',
    county   : '🗺️', state: '🗺️', country: '🌍',
    road     : '🛣️', highway: '🛣️',
    station  : '🚉', airport: '✈️',
    default  : '📍',
  };
  return map[type] ?? map.default;
}
