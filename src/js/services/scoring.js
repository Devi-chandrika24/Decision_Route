/**
 * scoring.js — Weighted multi-criteria decision scoring
 *
 * Algorithm:
 *   For each dimension (time, cost, risk), we normalise each route's value
 *   to a 0-1 range relative to the best and worst in the current result set.
 *   A score of 1 = best in this dimension, 0 = worst.
 *
 *   finalScore = (timeScore × timeWeight)
 *              + (costScore × costWeight)
 *              + (riskScore × riskWeight)
 *
 *   Weights are passed in as { time, cost, risk } and must sum to ≈1.
 *   The function does NOT enforce normalisation — the caller (weight-sliders.js)
 *   is responsible. We clamp internally just as a safety net.
 *
 * Edge case handling:
 *   - Only one route → it always wins; explanation says so
 *   - All routes equal on a dimension → everyone scores 0.5 for that dimension
 *   - Weather unavailable → risk score = 0.5 (neutral, not penalised)
 *
 * Output:
 *   Each Route gets a `score` (0-1) and an `explanation` string.
 *   The highest-scoring route gets `recommended: true`.
 */

import { formatDuration, formatCost } from '../utils/format.js';

/** Maps risk level to a 0-1 score (higher = safer = better) */
const RISK_SCORE_MAP = {
  low         : 1.0,
  medium      : 0.5,
  high        : 0.0,
  unavailable : 0.5,   // neutral — don't punish for missing data
};

/**
 * @typedef {import('./normalize.js').Route & {
 *   score: number,
 *   timeScore: number,
 *   costScore: number,
 *   riskScore: number,
 *   recommended: boolean,
 *   explanation: string,
 * }} ScoredRoute
 */

/**
 * Scores an array of Route objects based on dimension weights.
 *
 * @param {import('./normalize.js').Route[]} routes
 * @param {{ time: number, cost: number, risk: number }} weights — should sum to 1
 * @returns {ScoredRoute[]} — sorted by score descending; [0] is recommended
 */
export function scoreRoutes(routes, weights) {
  if (!routes || routes.length === 0) return [];

  // Clamp weights to [0,1] as a safety net
  const w = {
    time: Math.min(1, Math.max(0, weights.time ?? 0.34)),
    cost: Math.min(1, Math.max(0, weights.cost ?? 0.33)),
    risk: Math.min(1, Math.max(0, weights.risk ?? 0.33)),
  };

  // Gather raw dimension values
  const durations = routes.map(r => r.durationMin);
  const costs     = routes.map(r => r.totalCostEstimate);

  // Normalise: returns score array where 1 = best, 0 = worst
  const timeScores = _normalizeAsc(durations);   // lower duration → higher score
  const costScores = _normalizeAsc(costs);        // lower cost → higher score
  const riskScores = routes.map(r => RISK_SCORE_MAP[r.weatherRisk] ?? 0.5);

  // Combine
  const scored = routes.map((route, i) => {
    const timeScore = timeScores[i];
    const costScore = costScores[i];
    const riskScore = riskScores[i];
    const score     = (timeScore * w.time) + (costScore * w.cost) + (riskScore * w.risk);

    return {
      ...route,
      score    : _round(score),
      timeScore: _round(timeScore),
      costScore: _round(costScore),
      riskScore: _round(riskScore),
      recommended: false,  // assigned below
      explanation: '',     // assigned below
    };
  });

  // Sort by score descending
  scored.sort((a, b) => b.score - a.score);

  // Mark the winner
  if (scored.length > 0) {
    scored[0].recommended = true;
    scored[0].explanation = _buildExplanation(scored[0], scored, w);
  }

  return scored;
}

// ── Private helpers ────────────────────────────────────────────

/**
 * Normalises an array so the smallest value → score 1, largest → 0.
 * If all values are equal, everyone gets 0.5.
 *
 * @param {number[]} values
 * @returns {number[]}
 */
function _normalizeAsc(values) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min;

  if (range === 0) return values.map(() => 0.5);

  return values.map(v => (max - v) / range);
}

/**
 * Builds a concise, one-to-two sentence natural-language explanation
 * for why the top route was recommended.
 *
 * @param {ScoredRoute} winner
 * @param {ScoredRoute[]} all
 * @param {{ time: number, cost: number, risk: number }} weights
 * @returns {string}
 */
function _buildExplanation(winner, all, weights) {
  if (all.length === 1) {
    return `${winner.label} is your only available route — ${formatDuration(winner.durationMin)} and ${formatCost(winner.totalCostEstimate)}.`;
  }

  // Find the dominant weight
  const dims = [
    { name: 'time', w: weights.time, score: winner.timeScore },
    { name: 'cost', w: weights.cost, score: winner.costScore },
    { name: 'risk', w: weights.risk, score: winner.riskScore },
  ].sort((a, b) => b.w - a.w);

  const primary   = dims[0];
  const secondary = dims[1];

  const reasons = [];

  if (primary.name === 'time' && winner.timeScore > 0.6) {
    reasons.push(`it's the fastest option at ${formatDuration(winner.durationMin)}`);
  } else if (primary.name === 'cost' && winner.costScore > 0.6) {
    reasons.push(`it's the most affordable at ${formatCost(winner.totalCostEstimate)}`);
  } else if (primary.name === 'risk' && winner.riskScore >= 0.9) {
    reasons.push(`weather conditions are clear on this route`);
  } else {
    // Generic: best overall balance
    reasons.push(`it offers the best balance for your priorities`);
  }

  // Add secondary reason if it's strong
  if (secondary.score > 0.7 && secondary.name !== primary.name) {
    if (secondary.name === 'time')
      reasons.push(`travel time (${formatDuration(winner.durationMin)}) is favourable`);
    else if (secondary.name === 'cost')
      reasons.push(`cost (${formatCost(winner.totalCostEstimate)}) is competitive`);
    else if (secondary.name === 'risk' && winner.riskScore >= 0.9)
      reasons.push(`weather risk is low`);
  }

  const sentence = reasons.length > 1
    ? `${reasons[0]} and ${reasons[1]}.`
    : `${reasons[0]}.`;

  return `We recommend ${winner.label} because ${sentence}`;
}

const _round = (n) => Math.round(n * 1000) / 1000;
