/**
 * Shared harmonic field computation utilities.
 * Extracted from SimulatorMode for reuse by SettlementMode sidebar.
 */

import {
  Tower,
  HarmonicField,
  TowerContribution,
  SimulatorHyperparameters,
  SettlementStability,
  SettlementBalance,
} from '../types';
import { TOWER_TYPE_INDEX, MAX_TOWER_CANDIDATES } from '../config/constants';

// ============ Geometry Helpers ============

/**
 * Check if two line segments intersect (proper intersection, not just touching)
 */
function segmentsIntersect(
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  p3: { x: number; y: number },
  p4: { x: number; y: number }
): boolean {
  const d1x = p2.x - p1.x;
  const d1y = p2.y - p1.y;
  const d2x = p4.x - p3.x;
  const d2y = p4.y - p3.y;

  const cross = d1x * d2y - d1y * d2x;
  if (Math.abs(cross) < 1e-10) return false;

  const dx = p3.x - p1.x;
  const dy = p3.y - p1.y;

  const t = (dx * d2y - dy * d2x) / cross;
  const u = (dx * d1y - dy * d1x) / cross;

  const epsilon = 1e-6;
  return t > epsilon && t < 1 - epsilon && u > epsilon && u < 1 - epsilon;
}

/**
 * Check if candidate tower is blocked by a barrier segment
 */
function isBlockedByBarrier(
  point: { x: number; y: number },
  candidate: { x: number; y: number },
  barrierStart: { x: number; y: number },
  barrierEnd: { x: number; y: number }
): boolean {
  if (!segmentsIntersect(point, candidate, barrierStart, barrierEnd)) {
    return false;
  }

  const distPC = Math.sqrt(
    (candidate.x - point.x) ** 2 + (candidate.y - point.y) ** 2
  );
  const barrierLength = Math.sqrt(
    (barrierEnd.x - barrierStart.x) ** 2 + (barrierEnd.y - barrierStart.y) ** 2
  );

  return distPC > barrierLength;
}

// ============ Tower Contribution Logic ============

/**
 * Get contributing towers using the barrier algorithm.
 * Sorted by distance, with line-of-sight blocking.
 */
export function getContributingTowers(
  x: number,
  y: number,
  towers: Tower[]
): { tower: Tower; distance: number }[] {
  if (towers.length === 0) return [];

  const towersWithDistance = towers.map(tower => ({
    tower,
    distance: Math.sqrt((x - tower.x) ** 2 + (y - tower.y) ** 2),
  }));
  towersWithDistance.sort((a, b) => a.distance - b.distance);

  const candidates = towersWithDistance.slice(0, MAX_TOWER_CANDIDATES);

  const point = { x, y };
  const contributors: { tower: Tower; distance: number }[] = [];
  const barriers: { start: { x: number; y: number }; end: { x: number; y: number } }[] = [];

  for (let i = 0; i < candidates.length; i++) {
    const candidate = candidates[i];
    const candidatePos = { x: candidate.tower.x, y: candidate.tower.y };

    if (i < 2) {
      contributors.push(candidate);
      if (i === 1) {
        barriers.push({
          start: { x: contributors[0].tower.x, y: contributors[0].tower.y },
          end: { x: contributors[1].tower.x, y: contributors[1].tower.y },
        });
      }
      continue;
    }

    let blocked = false;
    for (const barrier of barriers) {
      if (isBlockedByBarrier(point, candidatePos, barrier.start, barrier.end)) {
        blocked = true;
        break;
      }
    }

    if (!blocked) {
      for (const prev of contributors) {
        barriers.push({
          start: { x: prev.tower.x, y: prev.tower.y },
          end: candidatePos,
        });
      }
      contributors.push(candidate);
    }
  }

  return contributors;
}

// ============ Cohesion Computation ============

/**
 * Compute how cohesive a group of tower contributions is (0 = spread out, 1 = all equal)
 */
function computeGroupCohesion(group: TowerContribution[]): number {
  if (group.length <= 1) return 1;

  const contributions = group.map(g => g.contribution);
  const total = contributions.reduce((sum, c) => sum + c, 0);

  if (total === 0) return 1;

  const probs = contributions.map(c => c / total);
  const entropy = -probs.reduce((sum, p) => sum + (p > 0 ? p * Math.log2(p) : 0), 0);
  const maxEntropy = Math.log2(group.length);

  return maxEntropy > 0 ? entropy / maxEntropy : 1;
}

/**
 * Compute cohesion for dimension values (similar to tower cohesion but for raw values)
 */
function computeDimensionCohesion(values: number[]): number {
  if (values.length <= 1) return 1;

  const total = values.reduce((sum, v) => sum + v, 0);
  if (total === 0) return 1;

  const probs = values.map(v => v / total);
  const entropy = -probs.reduce((sum, p) => sum + (p > 0 ? p * Math.log2(p) : 0), 0);
  const maxEntropy = Math.log2(values.length);

  return maxEntropy > 0 ? entropy / maxEntropy : 1;
}

// ============ Per-Tower Dampening ============

/**
 * Calculate per-tower dampening using reverse cascading (largest group first)
 */
function calculatePerTowerDampening(
  contributions: TowerContribution[],
  params: SimulatorHyperparameters
): Map<TowerContribution, number> {
  const result = new Map<TowerContribution, number>();

  if (contributions.length === 0) return result;

  const sorted = contributions.slice().sort((a, b) => b.contribution - a.contribution);

  for (const tc of sorted) {
    result.set(tc, 1.0);
  }

  if (sorted.length === 1) return result;

  const topContribution = sorted[0].contribution;
  if (topContribution === 0) return result;

  let maxCoalitionSize = 6;
  for (let k = sorted.length; k >= 1; k--) {
    const group = sorted.slice(0, k);
    const cohesion = computeGroupCohesion(group);
    if (cohesion > 0.9) {
      maxCoalitionSize = k;
      break;
    }
  }

  for (let k = sorted.length - 1; k >= 1; k--) {
    const leaders = sorted.slice(0, k);
    const followers = sorted.slice(k);

    const cohesion = computeGroupCohesion(leaders);
    const leaderFloor = leaders[leaders.length - 1].contribution;

    const isInsideLargerCoalition = k < maxCoalitionSize;
    const cohesionDiscount = isInsideLargerCoalition ? 0.3 : 1.0;
    const coalitionStrength = cohesion * Math.log2(k + 1) * cohesionDiscount;

    for (const follower of followers) {
      const followerGap = (leaderFloor - follower.contribution) / topContribution;
      const roundDampening = followerGap * coalitionStrength * params.dampeningStrength;

      const currentDampening = result.get(follower) ?? 1;
      result.set(follower, currentDampening * (1 - Math.min(roundDampening, 0.5)));
    }
  }

  for (const [tc, damp] of result) {
    result.set(tc, Math.max(damp, params.minDampening));
  }

  return result;
}

// ============ Main Field Calculation ============

/**
 * Calculate the harmonic field at a point.
 */
export function calculateFieldAt(
  x: number,
  y: number,
  towers: Tower[],
  params: SimulatorHyperparameters
): { field: HarmonicField; contributions: TowerContribution[] } {
  const dimensions = new Array(9).fill(params.backgroundValue);
  const contributingTowers = getContributingTowers(x, y, towers);
  const dimensionContributions = new Array(9).fill(0);
  const referenceDistance = 100;

  const towerContributions: TowerContribution[] = [];

  for (const { tower, distance } of contributingTowers) {
    const effectiveDistance = Math.max(distance, 1);
    const normalizedDistance = effectiveDistance / referenceDistance;
    const contribution = tower.power / Math.pow(normalizedDistance, params.distanceDamping);

    towerContributions.push({
      tower,
      distance,
      contribution,
    });
  }

  const dampeningMap = calculatePerTowerDampening(towerContributions, params);

  for (const tc of towerContributions) {
    const dampening = dampeningMap.get(tc) ?? 1;
    tc.dampening = dampening;
    tc.dampenedContribution = tc.contribution * dampening;

    const dimIndex = TOWER_TYPE_INDEX[tc.tower.type];
    if (dimIndex !== undefined) {
      dimensionContributions[dimIndex] += tc.dampenedContribution;
    }
  }

  for (let i = 0; i < 9; i++) {
    dimensions[i] += dimensionContributions[i];
  }

  return { field: { dimensions }, contributions: towerContributions };
}

// ============ Field Analysis ============

/**
 * Calculate field balance index: how many dimensions are in the leading coalition.
 * Returns 1 for single dominant dimension (dominated), 2 for frontier, 3+ for tripoint.
 */
export function getFieldBalanceIndex(field: HarmonicField): number {
  const dimensions = field.dimensions;
  const sorted = dimensions.slice().sort((a, b) => b - a);
  const top = sorted[0];

  if (top === 0) return 1;

  let coalitionSize = 1;

  for (let k = 2; k <= sorted.length; k++) {
    const group = sorted.slice(0, k);
    const cohesion = computeDimensionCohesion(group);

    if (cohesion > 0.99) {
      coalitionSize = k;
    } else {
      break;
    }
  }

  return coalitionSize;
}

/**
 * Result of stability calculation with all components.
 */
export interface StabilityResult {
  ratio: number;      // R = closest / secondClosest
  gaussian: number;   // G = exp(-d² / (2σ²))
  stability: number;  // S = max(R, G)
}

/**
 * Calculate all stability components for a point.
 * - R = distance to closest / distance to second closest projection
 * - G = Gaussian of second closest distance: exp(-d² / (2σ²))
 * - S = max(R, G)
 */
export function calculateStabilityComponents(
  x: number,
  y: number,
  contributions: TowerContribution[],
  params: SimulatorHyperparameters
): StabilityResult {
  if (contributions.length < 2) {
    return { ratio: 1, gaussian: 1, stability: 1 };
  }

  const distances: number[] = [];

  for (let i = 0; i < contributions.length; i++) {
    for (let j = i + 1; j < contributions.length; j++) {
      const towerA = contributions[i].tower;
      const towerB = contributions[j].tower;

      const lineX = towerB.x - towerA.x;
      const lineY = towerB.y - towerA.y;
      const toPX = x - towerA.x;
      const toPY = y - towerA.y;

      const lineLengthSq = lineX * lineX + lineY * lineY;
      if (lineLengthSq === 0) continue;

      const t = (toPX * lineX + toPY * lineY) / lineLengthSq;
      const projX = towerA.x + t * lineX;
      const projY = towerA.y + t * lineY;

      const distance = Math.sqrt((x - projX) ** 2 + (y - projY) ** 2);
      distances.push(distance);
    }
  }

  if (distances.length < 2) {
    return { ratio: 1, gaussian: 1, stability: 1 };
  }

  distances.sort((a, b) => a - b);
  const closest = distances[0];
  const secondClosest = distances[1];

  const ratio = secondClosest > 0 ? closest / secondClosest : 1;
  const variance = params.stabilityGaussianVariance;
  const gaussian = Math.exp(-(secondClosest ** 2) / (2 * variance ** 2));
  const stability = Math.max(ratio, gaussian);

  return { ratio, gaussian, stability };
}

/**
 * Calculate stability ratio for a point (convenience wrapper).
 * Returns S = max(R, G).
 */
// TODO: rename to calculateStabilityValue for clarity (not just ratio)
export function calculateStabilityRatio(
  x: number,
  y: number,
  contributions: TowerContribution[],
  params: SimulatorHyperparameters
): number {
  return calculateStabilityComponents(x, y, contributions, params).stability;
}

// ============ Status Conversion Functions ============

/**
 * Convert stability count (coalition size) to balance type.
 */
// TODO: rename to balanceIndexToBalance for clarity (with renamed variables)
export function stabilityCountToBalance(stabilityCount: number): SettlementBalance {
  if (stabilityCount === 1) return 'dominated';
  if (stabilityCount === 2) return 'frontier';
  return 'tripoint';
}

/**
 * Convert stability ratio to stability type.
 * ratio near 0 = near boundary = low stability
 * ratio near 1 = stable interior = high stability
 */
// TODO: rename to stabilityValueToStability for clarity (not just ratio)
export function stabilityRatioToStability(ratio: number): SettlementStability {
  if (ratio > 0.7) return 'high';
  if (ratio >= 0.3) return 'medium';
  return 'low';
}

// ============ High-Level Settlement Status ============

export interface SettlementSimulatedStatus {
  stability: SettlementStability;
  balance: SettlementBalance;
}

/**
 * Compute simulated status for a settlement at the given position.
 */
export function computeSettlementSimulatedStatus(
  x: number,
  y: number,
  towers: Tower[],
  params: SimulatorHyperparameters
): SettlementSimulatedStatus {
  const { field, contributions } = calculateFieldAt(x, y, towers, params);

  const stabilityCount = getFieldBalanceIndex(field);
  const stabilityRatio = calculateStabilityRatio(x, y, contributions, params);

  return {
    stability: stabilityRatioToStability(stabilityRatio),
    balance: stabilityCountToBalance(stabilityCount),
  };
}
