import { Tower } from '../types';

// Helper: generate all permutations of an array
function getPermutations<T>(arr: T[]): T[][] {
  if (arr.length <= 1) return [arr];
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i++) {
    const rest = [...arr.slice(0, i), ...arr.slice(i + 1)];
    for (const perm of getPermutations(rest)) {
      result.push([arr[i], ...perm]);
    }
  }
  return result;
}

// Arrange 6 closest towers into a hexagon around a center point
export function hexagonifyTowers(
  centerX: number,
  centerY: number,
  towers: Tower[]
): { tower: Tower; newX: number; newY: number }[] {
  // 1. Find 6 closest towers by distance
  const withDistance = towers.map(t => ({
    tower: t,
    distance: Math.sqrt((centerX - t.x) ** 2 + (centerY - t.y) ** 2),
  }));
  withDistance.sort((a, b) => a.distance - b.distance);
  const closest6 = withDistance.slice(0, 6);

  if (closest6.length < 6) return [];

  // 2. Find easternmost tower (highest X) - this stays fixed
  const easternmost = closest6.reduce((e, c) =>
    c.tower.x > e.tower.x ? c : e
  );

  // 3. Radius = distance from center to easternmost
  const radius = easternmost.distance;
  if (radius === 0) return [];

  // 4. Calculate hexagon target positions relative to easternmost tower
  const eastAngle = Math.atan2(easternmost.tower.y - centerY, easternmost.tower.x - centerX);
  const angles = [60, 120, 180, 240, 300].map(d => eastAngle + d * Math.PI / 180);
  const targets = angles.map(a => ({
    x: centerX + radius * Math.cos(a),
    y: centerY + radius * Math.sin(a),
  }));

  // 5. Optimal assignment: find permutation that minimizes total movement
  const otherTowers = closest6.filter(t => t.tower.id !== easternmost.tower.id);
  const permutations = getPermutations([0, 1, 2, 3, 4]);

  let bestPerm = permutations[0];
  let bestDist = Infinity;
  for (const perm of permutations) {
    let totalDist = 0;
    for (let i = 0; i < 5; i++) {
      const t = otherTowers[i].tower;
      const target = targets[perm[i]];
      totalDist += Math.sqrt((t.x - target.x) ** 2 + (t.y - target.y) ** 2);
    }
    if (totalDist < bestDist) {
      bestDist = totalDist;
      bestPerm = perm;
    }
  }

  // 6. Build result with optimal assignment
  const result = [
    { tower: easternmost.tower, newX: easternmost.tower.x, newY: easternmost.tower.y }
  ];
  for (let i = 0; i < 5; i++) {
    const target = targets[bestPerm[i]];
    result.push({
      tower: otherTowers[i].tower,
      newX: target.x,
      newY: target.y,
    });
  }

  return result;
}
