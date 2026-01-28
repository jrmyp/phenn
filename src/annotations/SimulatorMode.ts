import L from 'leaflet';
import { AppState } from '../state/AppState';
import { HarmonicField, SimulatorLayerType, TowerContribution, ProjectionInfo } from '../types';
import {
  TOWER_TYPE_INDEX,
  TOWER_COLORS,
  HEATMAP_COLORS,
  STABILITY_COLORS,
  HEATMAP_GRID_RESOLUTION,
  MAP_WIDTH,
  MAP_HEIGHT,
  LOW_TOTAL_THRESHOLD,
} from '../config/constants';
import {
  calculateFieldAt,
  getFieldStability as getFieldStabilityUtil,
  calculateStabilityRatio as calculateStabilityRatioUtil,
  calculateStabilityComponents as calculateStabilityComponentsUtil,
} from '../utils/harmonicField';

// TODO: Move these to config/constants.ts (following same pattern as NUDGE_GRID)
// Level 1: Fine grid resolution
const FINE_GRID_RESOLUTION = 10;
const FINE_REFINEMENT_RADIUS = 150;

// Level 2: Finer grid resolution
const FINER_GRID_RESOLUTION = 3;
const FINER_REFINEMENT_RADIUS = 50;

export class SimulatorMode {
  private map: L.Map;
  private appState: AppState;
  private heatmapLayer: L.LayerGroup;
  private markerLayer: L.LayerGroup;
  private refinementMarkerLayer: L.LayerGroup;
  private contributionLineLayer: L.LayerGroup;
  private projectionMarkerLayer: L.LayerGroup;
  private clickMarker: L.CircleMarker | null = null;
  private clickHandler: (e: L.LeafletMouseEvent) => void;
  private active = false;

  constructor(map: L.Map, appState: AppState) {
    this.map = map;
    this.appState = appState;

    // Create layer groups for heatmap and markers (heatmap below markers)
    this.heatmapLayer = L.layerGroup().addTo(map);
    this.contributionLineLayer = L.layerGroup().addTo(map);
    this.projectionMarkerLayer = L.layerGroup().addTo(map);
    this.markerLayer = L.layerGroup().addTo(map);
    this.refinementMarkerLayer = L.layerGroup().addTo(map);

    // Set up event handlers
    this.clickHandler = this.handleMapClick.bind(this);

    // Subscribe to state changes to re-render heatmap and markers
    this.appState.subscribe(() => {
      if (this.active) {
        this.renderHeatmap();
        this.renderRefinementMarkers();
      }
    });
  }

  activate(): void {
    if (this.active) return;
    this.active = true;
    this.map.on('click', this.clickHandler);
    this.renderHeatmap();
    this.renderRefinementMarkers();
    this.renderClickMarker();
    this.updateStatus();
  }

  deactivate(): void {
    if (!this.active) return;
    this.active = false;
    this.map.off('click', this.clickHandler);
    this.heatmapLayer.clearLayers();
    this.contributionLineLayer.clearLayers();
    this.projectionMarkerLayer.clearLayers();
    this.markerLayer.clearLayers();
    this.refinementMarkerLayer.clearLayers();
    this.clickMarker = null;
  }

  private handleMapClick(e: L.LeafletMouseEvent): void {
    const x = e.latlng.lng;
    const y = e.latlng.lat;

    // Alt+click to add/remove refinement point
    if (e.originalEvent.altKey) {
      this.handleRefinementClick(x, y);
      return;
    }

    const { field, contributions } = this.calculateField(x, y);

    // Calculate projections for stability display
    const projectionResult = this.calculateProjections(x, y, contributions);

    // Calculate stability components using the shared function
    const params = this.appState.getState().simulatorHyperparameters;
    const stabilityResult = calculateStabilityComponentsUtil(x, y, contributions, params);

    this.appState.dispatch('SET_SIMULATOR_CLICKED', {
      x,
      y,
      field,
      contributions,
      projections: projectionResult.projections,
      closestProjection: projectionResult.closest,
      secondClosestProjection: projectionResult.secondClosest,
      stabilityRatio: stabilityResult.stability,
      stabilityR: stabilityResult.ratio,
      stabilityG: stabilityResult.gaussian,
    });
    this.renderClickMarker();
    this.renderContributionLines();
    this.renderProjectionMarkers();
    this.updateStatus();
  }

  private handleRefinementClick(x: number, y: number): void {
    const state = this.appState.getState();
    const refinementPoints = state.simulatorRefinementPoints;

    // Check if clicking near an existing refinement point
    const clickThreshold = 30;
    const nearbyPoint = refinementPoints.find(p => {
      const dx = p.x - x;
      const dy = p.y - y;
      return Math.sqrt(dx * dx + dy * dy) < clickThreshold;
    });

    if (nearbyPoint) {
      // Cycle: level 1 -> level 2 -> remove
      if (nearbyPoint.level === 1) {
        this.appState.dispatch('UPDATE_REFINEMENT_POINT', { id: nearbyPoint.id, level: 2 });
        this.updateStatus('Refinement point upgraded to finer. Alt+click to remove.');
      } else {
        this.appState.dispatch('REMOVE_REFINEMENT_POINT', nearbyPoint.id);
        this.updateStatus('Refinement point removed.');
      }
    } else {
      this.appState.dispatch('ADD_REFINEMENT_POINT', { x, y });
      this.updateStatus('Refinement point added (fine). Alt+click to make finer.');
    }
  }

  private renderClickMarker(): void {
    // Remove existing click marker
    if (this.clickMarker) {
      this.markerLayer.removeLayer(this.clickMarker);
      this.clickMarker = null;
    }

    const state = this.appState.getState();
    const clicked = state.simulatorClickedPoint;

    if (!clicked) return;

    // Create a small crosshair-style marker at the clicked point
    this.clickMarker = L.circleMarker([clicked.y, clicked.x], {
      radius: 6,
      color: '#ffffff',
      weight: 2,
      fillColor: '#ff00ff',
      fillOpacity: 0.8,
    });

    this.markerLayer.addLayer(this.clickMarker);
  }

  private renderContributionLines(): void {
    this.contributionLineLayer.clearLayers();

    const state = this.appState.getState();
    const clicked = state.simulatorClickedPoint;

    if (!clicked || !clicked.contributions) return;

    // Draw thin lines from clicked point to each contributing tower
    for (const contrib of clicked.contributions) {
      const color = TOWER_COLORS[contrib.tower.type] || '#888888';
      const line = L.polyline(
        [
          [clicked.y, clicked.x],
          [contrib.tower.y, contrib.tower.x],
        ],
        {
          color,
          weight: 1,
          opacity: 0.7,
        }
      );
      this.contributionLineLayer.addLayer(line);
    }
  }

  private renderProjectionMarkers(): void {
    this.projectionMarkerLayer.clearLayers();

    const state = this.appState.getState();
    const clicked = state.simulatorClickedPoint;

    if (!clicked || !clicked.projections || clicked.projections.length === 0) return;

    const closest = clicked.closestProjection;
    const secondClosest = clicked.secondClosestProjection;

    for (const projection of clicked.projections) {
      const isClosest = projection === closest;
      const isSecondClosest = projection === secondClosest;

      if (isClosest) {
        // Diamond shape for closest (green)
        const size = 6;
        const diamond = L.polygon(
          [
            [projection.y - size, projection.x],
            [projection.y, projection.x + size],
            [projection.y + size, projection.x],
            [projection.y, projection.x - size],
          ],
          {
            color: '#00ff00',
            weight: 2,
            fillColor: '#00ff00',
            fillOpacity: 0.6,
          }
        );
        this.projectionMarkerLayer.addLayer(diamond);
      } else if (isSecondClosest) {
        // Square shape for second closest (orange)
        const size = 5;
        const square = L.rectangle(
          [
            [projection.y - size, projection.x - size],
            [projection.y + size, projection.x + size],
          ],
          {
            color: '#ff8800',
            weight: 2,
            fillColor: '#ff8800',
            fillOpacity: 0.6,
          }
        );
        this.projectionMarkerLayer.addLayer(square);
      } else {
        // Small gray circle for other projections
        const marker = L.circleMarker([projection.y, projection.x], {
          radius: 4,
          color: '#666666',
          weight: 1,
          fillColor: '#888888',
          fillOpacity: 0.5,
        });
        this.projectionMarkerLayer.addLayer(marker);
      }
    }
  }

  private renderRefinementMarkers(): void {
    this.refinementMarkerLayer.clearLayers();

    const state = this.appState.getState();
    const refinementPoints = state.simulatorRefinementPoints;

    for (const point of refinementPoints) {
      // Level 1 = cyan, Level 2 = gold
      const color = point.level === 1 ? '#00ffff' : '#ffd700';
      const radius = point.level === 1 ? FINE_REFINEMENT_RADIUS : FINER_REFINEMENT_RADIUS;

      // Show refinement area as a dashed circle
      const circle = L.circle([point.y, point.x], {
        radius,
        color,
        weight: 1,
        dashArray: '4, 4',
        fill: false,
      });

      // Small center marker
      const marker = L.circleMarker([point.y, point.x], {
        radius: 4,
        color,
        weight: 2,
        fillColor: color,
        fillOpacity: 0.5,
      });

      this.refinementMarkerLayer.addLayer(circle);
      this.refinementMarkerLayer.addLayer(marker);
    }
  }

  calculateField(x: number, y: number): { field: HarmonicField; contributions: TowerContribution[] } {
    const state = this.appState.getState();
    const { towers } = state.towers;
    const params = state.simulatorHyperparameters;
    return calculateFieldAt(x, y, towers, params);
  }

  // Calculate projections of point P onto lines formed by all pairs of contributors
  // Returns projection geometry only; stability is calculated separately via calculateStabilityComponents
  calculateProjections(
    x: number,
    y: number,
    contributions: TowerContribution[]
  ): { projections: ProjectionInfo[]; closest?: ProjectionInfo; secondClosest?: ProjectionInfo } {
    const projections: ProjectionInfo[] = [];

    // Need at least 2 contributors to form a pair
    if (contributions.length < 2) {
      return { projections };
    }

    // Enumerate all pairs
    for (let i = 0; i < contributions.length; i++) {
      for (let j = i + 1; j < contributions.length; j++) {
        const towerA = contributions[i].tower;
        const towerB = contributions[j].tower;

        // Project point P onto the line through towerA and towerB
        // vec_line = B - A
        const lineX = towerB.x - towerA.x;
        const lineY = towerB.y - towerA.y;

        // vec_to_p = P - A
        const toPX = x - towerA.x;
        const toPY = y - towerA.y;

        // t = dot(vec_to_p, vec_line) / dot(vec_line, vec_line)
        const lineLengthSq = lineX * lineX + lineY * lineY;
        if (lineLengthSq === 0) continue; // Skip if towers are at same position

        const t = (toPX * lineX + toPY * lineY) / lineLengthSq;

        // projection = A + t * vec_line
        const projX = towerA.x + t * lineX;
        const projY = towerA.y + t * lineY;

        // Distance from point to projection
        const distance = Math.sqrt((x - projX) ** 2 + (y - projY) ** 2);

        projections.push({ x: projX, y: projY, towerA, towerB, distance });
      }
    }

    if (projections.length === 0) {
      return { projections };
    }

    // Sort by distance to find closest and second closest
    const sorted = projections.slice().sort((a, b) => a.distance - b.distance);
    const closest = sorted[0];
    const secondClosest = sorted.length > 1 ? sorted[1] : sorted[0];

    return { projections, closest, secondClosest };
  }

  // Calculate stability ratio for heatmap rendering (lightweight, no full projection list)
  private calculateStabilityRatio(x: number, y: number, contributions: TowerContribution[]): number {
    const params = this.appState.getState().simulatorHyperparameters;
    return calculateStabilityRatioUtil(x, y, contributions, params);
  }

  private renderHeatmap(): void {
    const state = this.appState.getState();
    const activeLayer = state.simulatorActiveLayer;

    this.heatmapLayer.clearLayers();

    // Only render if a layer is selected
    if (activeLayer === null) return;

    const refinementPoints = state.simulatorRefinementPoints;
    const coarseRes = HEATMAP_GRID_RESOLUTION;
    const fineRes = FINE_GRID_RESOLUTION;
    const finerRes = FINER_GRID_RESOLUTION;

    // Split refinement points by level
    const level1Points = refinementPoints.filter(p => p.level === 1);
    const level2Points = refinementPoints.filter(p => p.level === 2);

    // Track rendered cells to avoid duplicates (key = "x,y,resolution")
    const renderedFiner = new Set<string>();
    const renderedFine = new Set<string>();

    // Pass 1: render finer grid (3px) around level-2 points
    for (const refPoint of level2Points) {
      const minX = Math.max(0, refPoint.x - FINER_REFINEMENT_RADIUS);
      const maxX = Math.min(MAP_WIDTH, refPoint.x + FINER_REFINEMENT_RADIUS);
      const minY = Math.max(0, refPoint.y - FINER_REFINEMENT_RADIUS);
      const maxY = Math.min(MAP_HEIGHT, refPoint.y + FINER_REFINEMENT_RADIUS);

      for (let x = Math.floor(minX / finerRes) * finerRes; x < maxX; x += finerRes) {
        for (let y = Math.floor(minY / finerRes) * finerRes; y < maxY; y += finerRes) {
          const cx = x + finerRes / 2;
          const cy = y + finerRes / 2;
          const dx = cx - refPoint.x;
          const dy = cy - refPoint.y;
          if (Math.sqrt(dx * dx + dy * dy) > FINER_REFINEMENT_RADIUS) continue;

          const key = `${x},${y}`;
          if (renderedFiner.has(key)) continue;
          renderedFiner.add(key);

          this.renderCell(x, y, finerRes, activeLayer);
        }
      }
    }

    // Pass 2: render fine grid (10px) around level-1 points, skipping areas covered by finer
    for (const refPoint of level1Points) {
      const minX = Math.max(0, refPoint.x - FINE_REFINEMENT_RADIUS);
      const maxX = Math.min(MAP_WIDTH, refPoint.x + FINE_REFINEMENT_RADIUS);
      const minY = Math.max(0, refPoint.y - FINE_REFINEMENT_RADIUS);
      const maxY = Math.min(MAP_HEIGHT, refPoint.y + FINE_REFINEMENT_RADIUS);

      for (let x = Math.floor(minX / fineRes) * fineRes; x < maxX; x += fineRes) {
        for (let y = Math.floor(minY / fineRes) * fineRes; y < maxY; y += fineRes) {
          const cx = x + fineRes / 2;
          const cy = y + fineRes / 2;
          const dx = cx - refPoint.x;
          const dy = cy - refPoint.y;
          if (Math.sqrt(dx * dx + dy * dy) > FINE_REFINEMENT_RADIUS) continue;

          // Skip if this area is covered by a finer point
          const inFiner = level2Points.some(p => {
            const d = Math.sqrt((cx - p.x) ** 2 + (cy - p.y) ** 2);
            return d < FINER_REFINEMENT_RADIUS;
          });
          if (inFiner) continue;

          const key = `${x},${y}`;
          if (renderedFine.has(key)) continue;
          renderedFine.add(key);

          this.renderCell(x, y, fineRes, activeLayer);
        }
      }
    }

    // Pass 3: render coarse grid, skipping cells covered by fine or finer grids
    for (let x = 0; x < MAP_WIDTH; x += coarseRes) {
      for (let y = 0; y < MAP_HEIGHT; y += coarseRes) {
        const cellCenterX = x + coarseRes / 2;
        const cellCenterY = y + coarseRes / 2;

        // Check if this coarse cell overlaps with any level-1 refinement area
        const inLevel1 = level1Points.some(p => {
          const dx = cellCenterX - p.x;
          const dy = cellCenterY - p.y;
          return Math.sqrt(dx * dx + dy * dy) < FINE_REFINEMENT_RADIUS + coarseRes;
        });

        // Check if this coarse cell overlaps with any level-2 refinement area
        const inLevel2 = level2Points.some(p => {
          const dx = cellCenterX - p.x;
          const dy = cellCenterY - p.y;
          return Math.sqrt(dx * dx + dy * dy) < FINER_REFINEMENT_RADIUS + coarseRes;
        });

        if (inLevel1 || inLevel2) continue;

        this.renderCell(x, y, coarseRes, activeLayer);
      }
    }
  }

  private renderCell(x: number, y: number, size: number, activeLayer: SimulatorLayerType): void {
    const centerX = x + size / 2;
    const centerY = y + size / 2;
    const result = this.calculateField(centerX, centerY);
    const color = this.getColorForLayer(result.field, activeLayer, result.contributions, centerX, centerY);

    if (!color) return;

    const bounds: L.LatLngBoundsExpression = [
      [y, x],
      [y + size, x + size],
    ];

    const rect = L.rectangle(bounds, {
      color: 'transparent',
      weight: 0,
      fillColor: color,
      fillOpacity: 0.5,
    });

    this.heatmapLayer.addLayer(rect);
  }

  private getColorForLayer(
    field: HarmonicField,
    activeLayer: SimulatorLayerType,
    contributions?: TowerContribution[],
    pointX?: number,
    pointY?: number
  ): string | null {
    if (activeLayer === null) return null;

    if (typeof activeLayer === 'number') {
      // Individual dimension
      return this.valueToColor(field.dimensions[activeLayer]);
    }

    if (activeLayer === 'total') {
      // Sum of all dimensions
      const total = this.getTotalIntensity(field);
      return this.valueToColor(total / 3); // Normalize to similar scale
    }

    if (activeLayer === 'low-total') {
      // Sum of all dimensions, but only show tiles below threshold
      const total = this.getTotalIntensity(field);
      if (total > LOW_TOTAL_THRESHOLD) return null; // Don't render high-intensity tiles
      return this.lowTotalValueToColor(total);
    }

    if (activeLayer === 'dominant') {
      // Color by dominant dimension
      const dominant = this.getDominantDimension(field);
      return dominant.color;
    }

    if (activeLayer === 'balance') {
      // Dominant dimension, but show frontier areas with gray
      const stability = this.getFieldStability(field);
      if (stability >= 2) {
        // Frontier: shade of gray based on stability (darker = more contested)
        // stability 2 = light gray, higher = darker
        const grayLevel = Math.max(0.15, 0.5 - (stability - 2) * 0.1);
        const grayValue = Math.round(grayLevel * 255);
        return `rgb(${grayValue}, ${grayValue}, ${grayValue})`;
      }
      const dominant = this.getDominantDimension(field);
      return dominant.color;
    }

    if (activeLayer === 'contributor-count') {
      // Color based on number of contributing towers
      const count = contributions?.length ?? 0;
      if (count === 0) {
        return '#111111'; // Very dark for no contributors
      }
      // Map 1-8 contributors to visible color range (starting from cyan, not dark blue)
      // 1 contributor starts at value ~100 (cyan), 8+ maxes at 500 (red)
      const normalizedCount = Math.min(count, 8);
      const value = 80 + (normalizedCount / 8) * 420;
      return this.valueToColor(value);
    }

    if (activeLayer === 'stability') {
      // Color based on stability ratio (distance to closest / distance to furthest barycenter)
      if (!contributions || contributions.length < 2 || pointX === undefined || pointY === undefined) {
        return '#888888'; // Neutral gray for insufficient contributors
      }
      const ratio = this.calculateStabilityRatio(pointX, pointY, contributions);
      return this.stabilityRatioToColor(ratio);
    }

    return null;
  }

  private stabilityRatioToColor(ratio: number): string {
    // 0 = contested (red), 1 = stable (blue)
    const t = Math.max(0, Math.min(1, ratio));
    return this.interpolateColors(t, STABILITY_COLORS);
  }

  // Calculate field stability: how many dimensions are in the leading group
  // Returns 1 for single dominant dimension, 2+ for frontier (multiple competing leaders)
  getFieldStability(field: HarmonicField): number {
    return getFieldStabilityUtil(field);
  }

  private lowTotalValueToColor(value: number): string {
    const t = Math.max(0, Math.min(1, value / LOW_TOTAL_THRESHOLD));
    return this.interpolateColors(t, HEATMAP_COLORS);
  }

  private valueToColor(value: number): string {
    // Typical values: background (30) to ~500+ near towers
    const t = Math.max(0, Math.min(1, value / 500));
    return this.interpolateColors(t, HEATMAP_COLORS);
  }

  private interpolateColors(t: number, colors: string[]): string {
    const colorIndex = t * (colors.length - 1);
    const lowerIndex = Math.floor(colorIndex);
    const upperIndex = Math.min(lowerIndex + 1, colors.length - 1);
    const blend = colorIndex - lowerIndex;

    const lowerColor = this.hexToRgb(colors[lowerIndex]);
    const upperColor = this.hexToRgb(colors[upperIndex]);

    const r = Math.round(lowerColor.r + blend * (upperColor.r - lowerColor.r));
    const g = Math.round(lowerColor.g + blend * (upperColor.g - lowerColor.g));
    const b = Math.round(lowerColor.b + blend * (upperColor.b - lowerColor.b));

    return `rgb(${r}, ${g}, ${b})`;
  }

  private hexToRgb(hex: string): { r: number; g: number; b: number } {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result
      ? {
          r: parseInt(result[1], 16),
          g: parseInt(result[2], 16),
          b: parseInt(result[3], 16),
        }
      : { r: 0, g: 0, b: 0 };
  }

  getDominantDimension(field: HarmonicField): { index: number; name: string; color: string } {
    let maxIndex = 0;
    let maxValue = field.dimensions[0];

    for (let i = 1; i < field.dimensions.length; i++) {
      if (field.dimensions[i] > maxValue) {
        maxValue = field.dimensions[i];
        maxIndex = i;
      }
    }

    const typeNames = Object.keys(TOWER_TYPE_INDEX);
    const typeName = typeNames[maxIndex];

    return {
      index: maxIndex,
      name: typeName.charAt(0).toUpperCase() + typeName.slice(1),
      color: TOWER_COLORS[typeName],
    };
  }

  getTotalIntensity(field: HarmonicField): number {
    return field.dimensions.reduce((sum, val) => sum + val, 0);
  }

  private updateStatus(message?: string): void {
    const statusEl = document.getElementById('status-text');
    if (!statusEl) return;

    if (message) {
      statusEl.textContent = message;
      return;
    }

    const state = this.appState.getState();
    const clicked = state.simulatorClickedPoint;

    if (clicked) {
      const dominant = this.getDominantDimension(clicked.field);
      statusEl.textContent = `Harmonics mode. Click to inspect field. Last: (${Math.round(clicked.x)}, ${Math.round(clicked.y)}) - Dominant: ${dominant.name}`;
    } else {
      statusEl.textContent = 'Harmonics mode. Click anywhere to inspect the harmonic field.';
    }
  }
}
