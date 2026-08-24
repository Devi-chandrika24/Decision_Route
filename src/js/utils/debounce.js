/**
 * debounce.js — Reusable debounce utility
 *
 * Returns a debounced version of `fn` that only executes after
 * `delayMs` have elapsed since the last invocation.
 *
 * Crucially it also exposes a `.cancel()` method so callers can
 * clear a pending invocation (e.g., on component unmount).
 *
 * Usage:
 *   const search = debounce(fetchSuggestions, 300);
 *   input.addEventListener('input', search);
 *   // later…
 *   search.cancel(); // prevent the last pending call
 *
 * @template {(...args: any[]) => any} T
 * @param {T} fn        — function to debounce
 * @param {number} delayMs — quiet period in milliseconds
 * @returns {T & { cancel: () => void }}
 */
export function debounce(fn, delayMs) {
  let timerId = null;

  function debounced(...args) {
    clearTimeout(timerId);
    timerId = setTimeout(() => {
      timerId = null;
      fn.apply(this, args);
    }, delayMs);
  }

  /** Cancel any pending invocation without executing it. */
  debounced.cancel = function cancel() {
    clearTimeout(timerId);
    timerId = null;
  };

  return /** @type {T & { cancel: () => void }} */ (debounced);
}
