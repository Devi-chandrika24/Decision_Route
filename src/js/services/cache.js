/**
 * cache.js — IndexedDB-backed route result cache
 *
 * Architecture:
 *   Primary storage: IndexedDB (persists across sessions, quota-managed by browser)
 *   Fallback storage: localStorage (synchronous; used when IDB is unavailable)
 *
 * Cache key: "${origin}|${destination}|${YYYY-MM-DD-HH}"
 *   Keyed by hour so results are considered fresh for the current hour
 *   and automatically stale afterwards (weather changes, traffic changes).
 *
 * Quota handling:
 *   If IndexedDB throws a QuotaExceededError, we prune the oldest 50% of
 *   entries before retrying.  If localStorage overflows, we silently drop
 *   the write (read of stale data beats crashing the app).
 *
 * Usage:
 *   import { cacheGet, cacheSet } from './cache.js';
 *
 *   // Store a result
 *   await cacheSet('Chennai', 'Bangalore', scoredRoutes);
 *
 *   // Retrieve it
 *   const cached = await cacheGet('Chennai', 'Bangalore');
 *   if (cached) renderRoutes(cached, { fromCache: true });
 */

const DB_NAME    = 'decision-route-cache';
const DB_VERSION = 1;
const STORE_NAME = 'routes';

/** @type {IDBDatabase|null} */
let _db = null;

/** Flag set to true if IDB is unavailable (private mode, old browser, etc.) */
let _idbUnavailable = false;

// ─── IndexedDB lifecycle ───────────────────────────────────────

/**
 * Opens (or upgrades) the IndexedDB database.
 * @returns {Promise<IDBDatabase>}
 */
async function _openDB() {
  if (_db) return _db;

  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'cacheKey' });
        store.createIndex('timestamp', 'timestamp', { unique: false });
      }
    };

    req.onsuccess  = (event) => { _db = event.target.result; resolve(_db); };
    req.onerror    = ()      => reject(new Error('IndexedDB open failed'));
    req.onblocked  = ()      => reject(new Error('IndexedDB blocked'));
  });
}

// ─── Public API ────────────────────────────────────────────────

/**
 * Reads a cached route result.
 * @param {string} origin
 * @param {string} destination
 * @returns {Promise<Array<import('./scoring.js').ScoredRoute>|null>}
 */
export async function cacheGet(origin, destination) {
  const key = _buildKey(origin, destination);

  if (!_idbUnavailable) {
    try {
      const db     = await _openDB();
      const entry  = await _idbGet(db, key);
      if (entry) return entry.routes;
    } catch (err) {
      console.warn('[cache] IDB read failed, falling back to localStorage:', err.message);
      _idbUnavailable = true;
    }
  }

  return _lsGet(key);
}

/**
 * Writes a route result to the cache.
 * @param {string} origin
 * @param {string} destination
 * @param {Array<import('./scoring.js').ScoredRoute>} routes
 * @returns {Promise<void>}
 */
export async function cacheSet(origin, destination, routes) {
  const key   = _buildKey(origin, destination);
  const entry = { cacheKey: key, timestamp: Date.now(), routes };

  if (!_idbUnavailable) {
    try {
      const db = await _openDB();
      await _idbPut(db, entry);
      return;
    } catch (err) {
      if (_isQuotaError(err)) {
        console.warn('[cache] IDB quota exceeded — pruning oldest 50%...');
        await _pruneIDB();
        try {
          const db = await _openDB();
          await _idbPut(db, entry);
          return;
        } catch (retryErr) {
          console.warn('[cache] IDB still full after prune:', retryErr.message);
        }
      } else {
        console.warn('[cache] IDB write failed, falling back to localStorage:', err.message);
        _idbUnavailable = true;
      }
    }
  }

  _lsSet(key, entry);
}

// ─── IndexedDB helpers ─────────────────────────────────────────

function _idbGet(db, key) {
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).get(key);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror   = () => reject(req.error);
  });
}

function _idbPut(db, entry) {
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(STORE_NAME, 'readwrite');
    const req = tx.objectStore(STORE_NAME).put(entry);
    req.onsuccess = () => resolve();
    req.onerror   = () => reject(req.error);
  });
}

/**
 * Removes the oldest 50% of entries when quota is exceeded.
 */
async function _pruneIDB() {
  try {
    const db = await _openDB();
    const all = await new Promise((resolve, reject) => {
      const tx  = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).index('timestamp').getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror   = () => reject(req.error);
    });

    // Sort oldest-first, delete the bottom half
    all.sort((a, b) => a.timestamp - b.timestamp);
    const toDelete = all.slice(0, Math.ceil(all.length / 2));

    await new Promise((resolve, reject) => {
      const tx    = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      for (const entry of toDelete) store.delete(entry.cacheKey);
      tx.oncomplete = () => resolve();
      tx.onerror    = () => reject(tx.error);
    });
  } catch (err) {
    console.warn('[cache] Prune failed:', err.message);
  }
}

// ─── localStorage fallback ─────────────────────────────────────

const LS_PREFIX = 'dr_cache_';

function _lsGet(key) {
  try {
    const raw = localStorage.getItem(LS_PREFIX + key);
    if (!raw) return null;
    return JSON.parse(raw).routes ?? null;
  } catch {
    return null;
  }
}

function _lsSet(key, entry) {
  try {
    localStorage.setItem(LS_PREFIX + key, JSON.stringify(entry));
  } catch (err) {
    // QuotaExceededError in localStorage — drop silently, app keeps working
    console.warn('[cache] localStorage write failed (quota?):', err.message);
  }
}

// ─── Utilities ─────────────────────────────────────────────────

/**
 * Builds the cache key for the current hour.
 * Keys are case-insensitive and trimmed for consistency.
 */
function _buildKey(origin, destination) {
  const now    = new Date();
  const hourTag = `${now.getFullYear()}-${_pad(now.getMonth() + 1)}-${_pad(now.getDate())}-${_pad(now.getHours())}`;
  return `${origin.toLowerCase().trim()}|${destination.toLowerCase().trim()}|${hourTag}`;
}

function _pad(n) { return String(n).padStart(2, '0'); }

function _isQuotaError(err) {
  return (
    err?.name === 'QuotaExceededError' ||
    err?.code === 22 ||
    (err?.message ?? '').includes('quota')
  );
}
