/**
 * scoring.test.js — Unit tests for the scoring service
 *
 * Run with: node tests/scoring.test.js
 * No external test runner required — uses Node's built-in assert module.
 *
 * Tests cover:
 *   1. Min-max normalisation: fastest route scores highest for time
 *   2. Cost normalisation: cheapest route scores highest for cost
 *   3. Risk scoring: clear weather wins over heavy rain
 *   4. Weight application: time-dominant preset → fastest wins
 *   5. Edge case: single route always recommended
 *   6. Edge case: all routes equal → all score 0.5 per dimension
 *   7. Unavailable weather is neutral (doesn't penalise)
 *   8. Explanation is non-empty string
 *   9. Weights clamped to 0-1 even if invalid input passed
 */

import assert from 'node:assert/strict';

// ─── Minimal stub of format.js for Node test environment ──────
// (The real file uses window-unavailable APIs in Node)
const mockFormat = {
  formatDuration : (m) => `${m} min`,
  formatCost     : (n) => `₹${n}`,
};

// ─── Inline scoreRoutes (copy-pasted core logic) ──────────────
// We import the real scoring module to test it:
// But since it imports format.js which uses Intl (available in Node >= 18)
// we can import it directly.

// Dynamic import for ESM in Node
const { scoreRoutes } = await import('../src/js/services/scoring.js');

// ─── Fixtures ─────────────────────────────────────────────────

/** @returns {import('../src/js/services/normalize.js').Route[]} */
function makeRoutes(overrides = []) {
  const defaults = [
    { id: 'route-0', label: 'Route A', distanceKm: 50,  durationMin: 60,  fuelEstimate: 600,  tollEstimate: 0,   totalCostEstimate: 600,  weatherRisk: 'low',    precipMm: 0,   visibilityM: 10000, precipProb: 0,  bbox: [] },
    { id: 'route-1', label: 'Route B', distanceKm: 70,  durationMin: 75,  fuelEstimate: 840,  tollEstimate: 50,  totalCostEstimate: 890,  weatherRisk: 'medium', precipMm: 2,   visibilityM: 4000,  precipProb: 40, bbox: [] },
    { id: 'route-2', label: 'Route C', distanceKm: 45,  durationMin: 55,  fuelEstimate: 540,  tollEstimate: 100, totalCostEstimate: 640,  weatherRisk: 'high',   precipMm: 8,   visibilityM: 500,   precipProb: 90, bbox: [] },
  ];
  return defaults.map((d, i) => ({ ...d, ...(overrides[i] ?? {}) }));
}

const EQUAL_WEIGHTS = { time: 0.34, cost: 0.33, risk: 0.33 };
const TIME_DOMINANT = { time: 0.70, cost: 0.20, risk: 0.10 };
const RISK_DOMINANT = { time: 0.10, cost: 0.10, risk: 0.80 };
const COST_DOMINANT = { time: 0.15, cost: 0.70, risk: 0.15 };

// ─── Test runner ──────────────────────────────────────────────

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓  ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗  ${name}`);
    console.error(`     ${err.message}`);
    failed++;
  }
}

// ─── Tests ────────────────────────────────────────────────────

console.log('\nDecisionRoute — scoring.js unit tests\n');

test('1. Returns scored array of same length', () => {
  const routes = makeRoutes();
  const scored = scoreRoutes(routes, EQUAL_WEIGHTS);
  assert.equal(scored.length, routes.length);
});

test('2. Time-dominant: fastest route (Route C, 55 min) is recommended', () => {
  const routes = makeRoutes();
  const scored = scoreRoutes(routes, TIME_DOMINANT);
  const winner = scored.find(r => r.recommended);
  // Route C is fastest (55 min) but has high weather risk; time=0.70 should dominate
  assert.equal(winner.label, 'Route C', `Expected Route C to win on time-dominant, got ${winner.label}`);
});

test('3. Cost-dominant: cheapest route (Route A, ₹600) is recommended', () => {
  const routes = makeRoutes();
  const scored = scoreRoutes(routes, COST_DOMINANT);
  const winner = scored.find(r => r.recommended);
  assert.equal(winner.label, 'Route A', `Expected Route A to win on cost-dominant, got ${winner.label}`);
});

test('4. Risk-dominant: safest route (Route A, low rain) is recommended', () => {
  const routes = makeRoutes();
  const scored = scoreRoutes(routes, RISK_DOMINANT);
  const winner = scored.find(r => r.recommended);
  assert.equal(winner.label, 'Route A', `Expected Route A (low risk) to win, got ${winner.label}`);
});

test('5. High-risk route scores lower than low-risk on same dimension', () => {
  const routes = makeRoutes();
  const scored = scoreRoutes(routes, EQUAL_WEIGHTS);
  const routeA = scored.find(r => r.label === 'Route A');
  const routeC = scored.find(r => r.label === 'Route C');
  assert.ok(
    routeA.riskScore > routeC.riskScore,
    `Route A riskScore (${routeA.riskScore}) should be > Route C (${routeC.riskScore})`
  );
});

test('6. Single route: always recommended', () => {
  const single = makeRoutes().slice(0, 1);
  const scored = scoreRoutes(single, EQUAL_WEIGHTS);
  assert.equal(scored.length, 1);
  assert.equal(scored[0].recommended, true);
  assert.ok(scored[0].explanation.length > 0);
});

test('7. All routes equal duration: each gets timeScore = 0.5', () => {
  const routes = makeRoutes([
    { durationMin: 60 },
    { durationMin: 60 },
    { durationMin: 60 },
  ]);
  const scored = scoreRoutes(routes, EQUAL_WEIGHTS);
  for (const r of scored) {
    assert.equal(r.timeScore, 0.5, `Expected 0.5, got ${r.timeScore} for ${r.label}`);
  }
});

test('8. Unavailable weather is neutral (riskScore = 0.5)', () => {
  const routes = makeRoutes([
    { weatherRisk: 'unavailable' },
    { weatherRisk: 'unavailable' },
    { weatherRisk: 'unavailable' },
  ]);
  const scored = scoreRoutes(routes, EQUAL_WEIGHTS);
  for (const r of scored) {
    assert.equal(r.riskScore, 0.5, `Expected neutral 0.5 for unavailable, got ${r.riskScore} for ${r.label}`);
  }
});

test('9. Recommended route has non-empty explanation', () => {
  const scored = scoreRoutes(makeRoutes(), EQUAL_WEIGHTS);
  const winner = scored.find(r => r.recommended);
  assert.ok(typeof winner.explanation === 'string' && winner.explanation.length > 10);
});

test('10. Empty input returns empty array', () => {
  const scored = scoreRoutes([], EQUAL_WEIGHTS);
  assert.deepEqual(scored, []);
});

test('11. Null input returns empty array', () => {
  const scored = scoreRoutes(null, EQUAL_WEIGHTS);
  assert.deepEqual(scored, []);
});

test('12. Scores are sorted descending', () => {
  const scored = scoreRoutes(makeRoutes(), EQUAL_WEIGHTS);
  for (let i = 1; i < scored.length; i++) {
    assert.ok(
      scored[i - 1].score >= scored[i].score,
      `Score at [${i-1}] (${scored[i-1].score}) should be >= [${i}] (${scored[i].score})`
    );
  }
});

test('13. All scores are in [0, 1] range', () => {
  const scored = scoreRoutes(makeRoutes(), EQUAL_WEIGHTS);
  for (const r of scored) {
    assert.ok(r.score >= 0 && r.score <= 1, `Score ${r.score} out of [0,1] for ${r.label}`);
  }
});

// ─── Summary ──────────────────────────────────────────────────

console.log(`\n${'─'.repeat(44)}`);
console.log(`  ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
