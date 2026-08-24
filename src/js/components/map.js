/**
 * map.js — Interactive route map using Leaflet.js
 *
 * Leaflet is loaded via CDN in index.html (free, open-source, no API key).
 * Tiles are from OpenStreetMap (same licence as Nominatim — free).
 *
 * Responsibilities:
 *  - Initialize the Leaflet map once on first call
 *  - Render up to 3 color-coded polylines (recommended = green, others = blue/purple)
 *  - Fit map bounds to show all routes
 *  - Show/hide map section based on search state
 *  - Clean up previous layers before drawing new routes
 *
 * Design decisions:
 *  - Map is lazy-initialized on first route render (not on page load)
 *    to avoid wasting resources during the idle/empty state
 *  - Coordinates come from ORS GeoJSON (already decoded [lon, lat] pairs)
 *    Leaflet wants [lat, lon] — we swap inside this module
 *  - No marker clustering needed for 2–3 waypoints
 */

/** Route color palette — index matches route order */
const ROUTE_COLORS = [
  '#6c63ff',  // Route A — primary purple (recommended glow)
  '#3ec6e0',  // Route B — teal
  '#a78bfa',  // Route C — violet
];

/** Recommended route gets a heavier, glowing stroke */
const ROUTE_WEIGHTS = {
  recommended : 6,
  normal      : 4,
};

/** @type {L.Map|null} */
let _map = null;

/** @type {L.LayerGroup|null} — holds all route polylines + markers */
let _routeLayer = null;

/** @type {HTMLElement|null} */
let _mapSection = null;

/**
 * Initialises the map component references. Call after DOM ready.
 */
export function initMap() {
  _mapSection = document.getElementById('map-section');
}

/**
 * Renders all routes on the map.
 * Lazily creates the Leaflet map on first call.
 *
 * @param {import('../services/scoring.js').ScoredRoute[]} routes
 *   — scored routes with .coordinates [[lon,lat], ...] and .recommended
 */
export function renderMap(routes) {
  if (!routes || routes.length === 0) {
    hideMap();
    return;
  }

  // Filter out routes that have no coordinates (e.g. from cache before GeoJSON upgrade)
  const routesWithCoords = routes.filter(r => r.coordinates && r.coordinates.length > 0);
  if (routesWithCoords.length === 0) {
    hideMap();
    return;
  }

  showMap();

  // Lazy-initialize the Leaflet map
  if (!_map) {
    _initLeafletMap();
  }

  // Clear previous layers
  if (_routeLayer) {
    _routeLayer.clearLayers();
  } else {
    _routeLayer = L.layerGroup().addTo(_map);
  }

  // Draw polylines — recommended route drawn last (on top)
  const sorted = [...routesWithCoords].sort((a, b) =>
    (b.recommended ? 1 : 0) - (a.recommended ? 1 : 0)
  ).reverse();

  const allBounds = [];

  sorted.forEach((route, visualIdx) => {
    // ORS gives [lon, lat]; Leaflet wants [lat, lon]
    const latLngs = route.coordinates.map(([lon, lat]) => [lat, lon]);

    if (latLngs.length === 0) return;
    allBounds.push(...latLngs);

    const colorIdx = parseInt(route.id.replace('route-', ''), 10);
    const color    = ROUTE_COLORS[colorIdx % ROUTE_COLORS.length];
    const weight   = route.recommended ? ROUTE_WEIGHTS.recommended : ROUTE_WEIGHTS.normal;
    const opacity  = route.recommended ? 1.0 : 0.65;

    const polyline = L.polyline(latLngs, {
      color,
      weight,
      opacity,
      lineJoin  : 'round',
      lineCap   : 'round',
      // Recommended gets a subtle shadow via className
      className : route.recommended ? 'route-polyline route-polyline--recommended' : 'route-polyline',
    });

    polyline.bindTooltip(
      `<strong>${route.label}</strong>${route.recommended ? ' ⭐ Recommended' : ''}<br>
       ⏱ ${_fmt(route.durationMin)} · 📏 ${route.distanceKm.toFixed(1)} km`,
      { sticky: true, className: 'map-tooltip' }
    );

    polyline.addTo(_routeLayer);
  });

  // Add origin & destination markers using the first route's endpoints
  const firstRoute = routesWithCoords[0];
  if (firstRoute.coordinates.length >= 2) {
    const [oLon, oLat] = firstRoute.coordinates[0];
    const [dLon, dLat] = firstRoute.coordinates[firstRoute.coordinates.length - 1];

    _addMarker(oLat, oLon, '🚦', 'Origin', _routeLayer);
    _addMarker(dLat, dLon, '🏁', 'Destination', _routeLayer);
  }

  // Fit bounds to show all routes
  if (allBounds.length > 0) {
    _map.fitBounds(allBounds, { padding: [32, 32], maxZoom: 14 });
  }
}

/**
 * Hides the map section.
 */
export function hideMap() {
  if (_mapSection) _mapSection.hidden = true;
}

/**
 * Shows the map section.
 */
export function showMap() {
  if (_mapSection) {
    _mapSection.hidden = false;
    // Force Leaflet to recalculate size after display:none → visible transition
    if (_map) {
      setTimeout(() => _map.invalidateSize(), 50);
    }
  }
}

// ── Private ────────────────────────────────────────────────────

function _initLeafletMap() {
  _map = L.map('leaflet-map', {
    zoomControl      : true,
    attributionControl: true,
    preferCanvas     : true,   // faster rendering for polylines
  });

  // OpenStreetMap tiles — free, open licence
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution : '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom     : 19,
  }).addTo(_map);
}

/**
 * Adds an emoji marker (DivIcon) to the layer.
 */
function _addMarker(lat, lon, emoji, title, layer) {
  const icon = L.divIcon({
    className : 'map-emoji-marker',
    html      : `<span title="${title}" role="img" aria-label="${title}">${emoji}</span>`,
    iconSize  : [32, 32],
    iconAnchor: [16, 16],
  });
  L.marker([lat, lon], { icon, title, alt: title }).addTo(layer);
}

/** Format minutes for tooltip */
function _fmt(min) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h > 0 ? `${h}h ${m}m` : `${m} min`;
}
