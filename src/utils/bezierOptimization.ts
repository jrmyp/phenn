/**
 * Bézier curve utilities for roads with manual waypoints.
 * Fits control points to pass through/near user-placed waypoints.
 */

import { RoadWaypoint } from '../types';
import { BEZIER_CONFIG } from '../config/constants';

export interface BezierControlPoints {
  cp1x: number;
  cp1y: number;
  cp2x: number;
  cp2y: number;
}

/**
 * Evaluate a cubic Bézier curve at parameter t (0 to 1).
 * Uses the standard cubic Bézier formula: B(t) = (1-t)³P₀ + 3(1-t)²tP₁ + 3(1-t)t²P₂ + t³P₃
 */
export function evaluateBezier(
  startX: number, startY: number,
  cp1x: number, cp1y: number,
  cp2x: number, cp2y: number,
  endX: number, endY: number,
  t: number
): { x: number; y: number } {
  const mt = 1 - t;
  const mt2 = mt * mt;
  const mt3 = mt2 * mt;
  const t2 = t * t;
  const t3 = t2 * t;

  return {
    x: mt3 * startX + 3 * mt2 * t * cp1x + 3 * mt * t2 * cp2x + t3 * endX,
    y: mt3 * startY + 3 * mt2 * t * cp1y + 3 * mt * t2 * cp2y + t3 * endY,
  };
}

/**
 * Sample points along a Bézier curve.
 */
export function sampleBezierCurve(
  startX: number, startY: number,
  cp1x: number, cp1y: number,
  cp2x: number, cp2y: number,
  endX: number, endY: number,
  numSamples: number
): { x: number; y: number }[] {
  const points: { x: number; y: number }[] = [];
  for (let i = 0; i <= numSamples; i++) {
    const t = i / numSamples;
    points.push(evaluateBezier(startX, startY, cp1x, cp1y, cp2x, cp2y, endX, endY, t));
  }
  return points;
}

/**
 * Calculate the t-parameter for a waypoint based on its projection onto the start-end line.
 * Returns a value between 0 and 1.
 */
function calculateTParameter(
  startX: number, startY: number,
  endX: number, endY: number,
  waypointX: number, waypointY: number
): number {
  const dx = endX - startX;
  const dy = endY - startY;
  const lengthSq = dx * dx + dy * dy;

  if (lengthSq < 1) {
    return 0.5; // Degenerate case: start and end very close
  }

  // Project waypoint onto the line and calculate t
  const t = ((waypointX - startX) * dx + (waypointY - startY) * dy) / lengthSq;

  // Clamp to reasonable range (allow slightly outside 0-1 for waypoints beyond endpoints)
  return Math.max(0.05, Math.min(0.95, t));
}

/**
 * Fit Bézier control points to pass through/near waypoints.
 *
 * With 0 waypoints: returns control points on straight line (no curve)
 * With 1 waypoint: fits curve to pass through that point
 * With 2+ waypoints: least-squares fit to minimize distance to all waypoints
 */
export function fitBezierToWaypoints(
  startX: number, startY: number,
  endX: number, endY: number,
  waypoints: RoadWaypoint[]
): BezierControlPoints {
  // No waypoints: straight line (control points at 1/3 and 2/3 along line)
  if (waypoints.length === 0) {
    return {
      cp1x: startX + (endX - startX) / 3,
      cp1y: startY + (endY - startY) / 3,
      cp2x: startX + 2 * (endX - startX) / 3,
      cp2y: startY + 2 * (endY - startY) / 3,
    };
  }

  // Calculate t-parameters for all waypoints
  const waypointsWithT = waypoints.map(wp => ({
    x: wp.x,
    y: wp.y,
    t: calculateTParameter(startX, startY, endX, endY, wp.x, wp.y),
  })).sort((a, b) => a.t - b.t);

  // Single waypoint: solve for symmetric control points
  if (waypointsWithT.length === 1) {
    return fitSingleWaypoint(startX, startY, endX, endY, waypointsWithT[0]);
  }

  // Multiple waypoints: least-squares fit
  return fitMultipleWaypoints(startX, startY, endX, endY, waypointsWithT);
}

/**
 * Fit control points for a single waypoint.
 * The curve will pass exactly through the waypoint at its t-parameter.
 */
function fitSingleWaypoint(
  startX: number, startY: number,
  endX: number, endY: number,
  waypoint: { x: number; y: number; t: number }
): BezierControlPoints {
  const { x: wx, y: wy, t } = waypoint;

  // B(t) = (1-t)³P₀ + 3(1-t)²tP₁ + 3(1-t)t²P₂ + t³P₃
  // We want B(t) = waypoint, solve for P₁ and P₂

  const mt = 1 - t;
  const mt2 = mt * mt;
  const mt3 = mt2 * mt;
  const t2 = t * t;
  const t3 = t2 * t;

  // The point on curve from endpoints only
  const endpointContribX = mt3 * startX + t3 * endX;
  const endpointContribY = mt3 * startY + t3 * endY;

  // What the control points need to contribute
  const neededX = wx - endpointContribX;
  const neededY = wy - endpointContribY;

  // Coefficients for P₁ and P₂
  const coef1 = 3 * mt2 * t;
  const coef2 = 3 * mt * t2;

  // For a single point, we have 1 equation but 2 unknowns.
  // Use symmetric solution: offset both control points equally perpendicular to line
  // P₁ = linePoint(1/3) + offset, P₂ = linePoint(2/3) + offset

  const baseP1x = startX + (endX - startX) / 3;
  const baseP1y = startY + (endY - startY) / 3;
  const baseP2x = startX + 2 * (endX - startX) / 3;
  const baseP2y = startY + 2 * (endY - startY) / 3;

  // Contribution from base control points
  const baseContribX = coef1 * baseP1x + coef2 * baseP2x;
  const baseContribY = coef1 * baseP1y + coef2 * baseP2y;

  // How much offset we need
  const offsetNeededX = neededX - baseContribX;
  const offsetNeededY = neededY - baseContribY;

  // Distribute offset equally to both control points
  const totalCoef = coef1 + coef2;
  if (totalCoef < 0.001) {
    // t is very close to 0 or 1, use base points
    return { cp1x: baseP1x, cp1y: baseP1y, cp2x: baseP2x, cp2y: baseP2y };
  }

  const offsetX = offsetNeededX / totalCoef;
  const offsetY = offsetNeededY / totalCoef;

  return {
    cp1x: baseP1x + offsetX,
    cp1y: baseP1y + offsetY,
    cp2x: baseP2x + offsetX,
    cp2y: baseP2y + offsetY,
  };
}

/**
 * Fit control points for multiple waypoints using least-squares.
 * Minimizes the sum of squared distances from curve to waypoints.
 */
function fitMultipleWaypoints(
  startX: number, startY: number,
  endX: number, endY: number,
  waypoints: { x: number; y: number; t: number }[]
): BezierControlPoints {
  // Build the least-squares system: minimize ||Ax - b||²
  // where x = [cp1x, cp2x, cp1y, cp2y]ᵀ
  //
  // For each waypoint at t:
  // B(t).x = mt³·startX + 3mt²t·cp1x + 3mt·t²·cp2x + t³·endX = wp.x
  // B(t).y = mt³·startY + 3mt²t·cp1y + 3mt·t²·cp2y + t³·endY = wp.y

  // We solve x and y independently (they're decoupled in Bézier)

  // Build matrices for x-coordinates
  const n = waypoints.length;
  const A: number[][] = []; // n x 2 matrix
  const bx: number[] = [];  // n x 1 vector
  const by: number[] = [];  // n x 1 vector

  for (const wp of waypoints) {
    const t = wp.t;
    const mt = 1 - t;
    const mt2 = mt * mt;
    const mt3 = mt2 * mt;
    const t2 = t * t;
    const t3 = t2 * t;

    const coef1 = 3 * mt2 * t;
    const coef2 = 3 * mt * t2;

    A.push([coef1, coef2]);
    bx.push(wp.x - mt3 * startX - t3 * endX);
    by.push(wp.y - mt3 * startY - t3 * endY);
  }

  // Solve normal equations: AᵀA·x = Aᵀb
  // For 2x2 system, solve directly

  // AᵀA
  let ata00 = 0, ata01 = 0, ata11 = 0;
  let atbx0 = 0, atbx1 = 0;
  let atby0 = 0, atby1 = 0;

  for (let i = 0; i < n; i++) {
    const a0 = A[i][0];
    const a1 = A[i][1];

    ata00 += a0 * a0;
    ata01 += a0 * a1;
    ata11 += a1 * a1;

    atbx0 += a0 * bx[i];
    atbx1 += a1 * bx[i];

    atby0 += a0 * by[i];
    atby1 += a1 * by[i];
  }

  // Solve 2x2 system using Cramer's rule
  const det = ata00 * ata11 - ata01 * ata01;

  if (Math.abs(det) < 1e-10) {
    // Near-singular matrix, fall back to averaging waypoints
    const avgX = waypoints.reduce((s, w) => s + w.x, 0) / n;
    const avgY = waypoints.reduce((s, w) => s + w.y, 0) / n;
    return fitSingleWaypoint(startX, startY, endX, endY, { x: avgX, y: avgY, t: 0.5 });
  }

  const cp1x = (ata11 * atbx0 - ata01 * atbx1) / det;
  const cp2x = (ata00 * atbx1 - ata01 * atbx0) / det;

  const cp1y = (ata11 * atby0 - ata01 * atby1) / det;
  const cp2y = (ata00 * atby1 - ata01 * atby0) / det;

  return { cp1x, cp1y, cp2x, cp2y };
}

/**
 * Get polyline points for rendering a road.
 * If control points exist, renders as Bézier curve, otherwise straight line.
 */
export function getRoadRenderPoints(
  startX: number, startY: number,
  endX: number, endY: number,
  cp1x?: number, cp1y?: number,
  cp2x?: number, cp2y?: number
): { x: number; y: number }[] {
  if (cp1x !== undefined && cp1y !== undefined &&
      cp2x !== undefined && cp2y !== undefined) {
    return sampleBezierCurve(
      startX, startY,
      cp1x, cp1y,
      cp2x, cp2y,
      endX, endY,
      BEZIER_CONFIG.samplePointsRendering
    );
  }

  // No control points, return straight line
  return [{ x: startX, y: startY }, { x: endX, y: endY }];
}
