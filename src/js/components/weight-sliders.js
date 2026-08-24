/**
 * weight-sliders.js — Preference presets and custom weight sliders
 *
 * Presets define hard-coded weight distributions that map to
 * common user personas:
 *   Balanced   → equal weight for casual travellers
 *   Fastest    → time-dominant for delivery drivers / commuters
 *   Cheapest   → cost-dominant for budget travellers
 *   Safest     → risk-dominant for cautious drivers / families
 *
 * When a user moves a slider manually, all three weights are
 * re-normalised so they always sum to exactly 1.
 *
 * The component reads/writes the `weights` key in the store.
 * Any subscriber (e.g. comparison.js) will automatically re-score.
 */

import { setState, getState, subscribe } from '../state/store.js';

/** @type {Record<string, { time: number, cost: number, risk: number }>} */
const PRESETS = {
  balanced : { time: 0.34, cost: 0.33, risk: 0.33 },
  fastest  : { time: 0.70, cost: 0.20, risk: 0.10 },
  cheapest : { time: 0.20, cost: 0.65, risk: 0.15 },
  safest   : { time: 0.20, cost: 0.20, risk: 0.60 },
};

/** Current active preset key, or null if user has diverged from all presets */
let _activePreset = 'balanced';

/**
 * Initialises slider and preset components. Must be called after DOM ready.
 */
export function initWeightSliders() {
  _bindPresetButtons();
  _bindSliders();
  _bindAdvancedToggle();

  // Reflect initial store state into the slider UI
  _syncSlidersToStore();
}

// ─── Preset buttons ────────────────────────────────────────────

function _bindPresetButtons() {
  const buttons = document.querySelectorAll('.preset-btn');

  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      const preset = btn.dataset.preset;
      if (!PRESETS[preset]) return;

      _activePreset = preset;
      setState({ weights: PRESETS[preset] });

      // Update ARIA pressed states
      buttons.forEach(b => {
        b.setAttribute('aria-pressed', String(b.dataset.preset === preset));
        b.classList.toggle('preset-btn--active', b.dataset.preset === preset);
      });

      // Reflect in slider UI if panel is open
      _syncSlidersToStore();
    });
  });
}

// ─── Sliders ───────────────────────────────────────────────────

function _bindSliders() {
  const sliders = document.querySelectorAll('.weight-slider');

  sliders.forEach(slider => {
    slider.addEventListener('input', () => {
      // Deactivate all presets — user is customising
      _activePreset = null;
      _deselectAllPresets();

      const raw = _readSliderValues();
      const normalised = _normaliseWeights(raw);

      // Write normalised values back to sliders (to show true %)
      _writeSlidersFromWeights(normalised);

      setState({ weights: normalised });
    });
  });
}

/**
 * Reads raw slider integer values (0-100).
 * @returns {{ time: number, cost: number, risk: number }}
 */
function _readSliderValues() {
  return {
    time: parseInt(document.getElementById('weight-time').value, 10),
    cost: parseInt(document.getElementById('weight-cost').value, 10),
    risk: parseInt(document.getElementById('weight-risk').value, 10),
  };
}

/**
 * Normalises raw slider values (0-100 each) so they sum to 1.
 * If total is 0 (all at 0), assigns equal weights.
 * @param {{ time: number, cost: number, risk: number }} raw
 * @returns {{ time: number, cost: number, risk: number }}
 */
function _normaliseWeights(raw) {
  const total = raw.time + raw.cost + raw.risk;
  if (total === 0) return { time: 0.34, cost: 0.33, risk: 0.33 };
  return {
    time : _r3(raw.time / total),
    cost : _r3(raw.cost / total),
    risk : _r3(raw.risk / total),
  };
}

/**
 * Writes store weights back to slider positions and output labels.
 * @param {{ time: number, cost: number, risk: number }} weights — 0-1 fractions
 */
function _writeSlidersFromWeights(weights) {
  _setSlider('weight-time', 'output-time', weights.time);
  _setSlider('weight-cost', 'output-cost', weights.cost);
  _setSlider('weight-risk', 'output-risk', weights.risk);
}

function _setSlider(sliderId, outputId, fraction) {
  const pct    = Math.round(fraction * 100);
  const slider = document.getElementById(sliderId);
  const output = document.getElementById(outputId);

  slider.value               = String(pct);
  slider.setAttribute('aria-valuenow', String(pct));
  output.textContent         = `${pct}%`;
}

/** Syncs slider UI to whatever weights are currently in the store. */
function _syncSlidersToStore() {
  const { weights } = getState();
  _writeSlidersFromWeights(weights);
}

function _deselectAllPresets() {
  document.querySelectorAll('.preset-btn').forEach(b => {
    b.setAttribute('aria-pressed', 'false');
    b.classList.remove('preset-btn--active');
  });
}

// ─── Advanced toggle ───────────────────────────────────────────

function _bindAdvancedToggle() {
  const toggle  = document.getElementById('advanced-toggle');
  const panel   = document.getElementById('advanced-sliders');

  toggle.addEventListener('click', () => {
    const isOpen = toggle.getAttribute('aria-expanded') === 'true';
    const next   = !isOpen;
    toggle.setAttribute('aria-expanded', String(next));
    panel.hidden = !next;

    // Sync sliders when opening in case store changed while closed
    if (next) _syncSlidersToStore();
  });
}

// ─── Utility ───────────────────────────────────────────────────

/** Subscribe to store to keep preset buttons in sync with external weight changes */
export function syncPresetsToStore() {
  return subscribe((next, prev) => {
    if (next.weights === prev.weights) return;
    // If weights exactly match a preset, activate it
    for (const [key, preset] of Object.entries(PRESETS)) {
      if (_weightsMatch(next.weights, preset)) {
        if (_activePreset !== key) {
          _activePreset = key;
          document.querySelectorAll('.preset-btn').forEach(b => {
            const match = b.dataset.preset === key;
            b.setAttribute('aria-pressed', String(match));
            b.classList.toggle('preset-btn--active', match);
          });
        }
        return;
      }
    }
  });
}

function _weightsMatch(a, b) {
  return Math.abs(a.time - b.time) < 0.01 &&
         Math.abs(a.cost - b.cost) < 0.01 &&
         Math.abs(a.risk - b.risk) < 0.01;
}

const _r3 = (n) => Math.round(n * 1000) / 1000;
