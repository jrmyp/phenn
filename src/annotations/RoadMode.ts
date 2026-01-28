import L from 'leaflet';
import { AppState } from '../state/AppState';
import { Settlement, Road, RoadWaypoint } from '../types';
import { ROAD_STYLE, SETTLEMENT_SIZE, BEZIER_CONFIG, NUDGE_GRID } from '../config/constants';
import { fitBezierToWaypoints, getRoadRenderPoints } from '../utils/bezierOptimization';
import { computeSettlementSimulatedStatus } from '../utils/harmonicField';

// Distance threshold for removing an existing waypoint (in map units)
const WAYPOINT_REMOVE_THRESHOLD = 30;

// Waypoint visual style
const WAYPOINT_STYLE = {
  radius: 6,
  fillColor: '#ffcc00',
  fillOpacity: 1,
  color: '#000000',
  weight: 2,
};

export class RoadMode {
  private appState: AppState;
  private map: L.Map;
  private roadsLayer: L.LayerGroup;
  private waypointsLayer: L.LayerGroup;
  private highlightLayer: L.LayerGroup;
  private nudgeLayer: L.LayerGroup;
  private active = false;

  constructor(map: L.Map, appState: AppState) {
    this.appState = appState;
    this.map = map;

    // Create layer groups for roads (below settlements), waypoints, nudge tiles, and highlights
    this.nudgeLayer = L.layerGroup().addTo(map);
    this.roadsLayer = L.layerGroup().addTo(map);
    this.waypointsLayer = L.layerGroup().addTo(map);
    this.highlightLayer = L.layerGroup().addTo(map);

    // Subscribe to state changes to re-render
    this.appState.subscribe(() => this.render());

    // Initial render
    this.render();
  }

  activate(): void {
    if (this.active) return;
    this.active = true;

    // Listen for map clicks to add waypoints
    this.map.on('click', this.handleMapClick);

    this.updateStatus();
  }

  deactivate(): void {
    if (!this.active) return;
    this.active = false;

    // Remove map click listener
    this.map.off('click', this.handleMapClick);

    // Clear any pending road start and selection
    this.appState.dispatch('SET_PENDING_ROAD_START', null);
    this.appState.dispatch('SELECT_ROAD', null);
    this.highlightLayer.clearLayers();
    this.waypointsLayer.clearLayers();
    this.nudgeLayer.clearLayers();
  }

  // Handle map clicks for adding waypoints
  private handleMapClick = (e: L.LeafletMouseEvent): void => {
    if (!this.active) return;

    const state = this.appState.getState();
    const selectedRoadId = state.selectedRoadId;

    // Only handle alt-clicks when a road is selected
    if (!e.originalEvent.altKey || !selectedRoadId) return;

    const road = state.roads.roads.find(r => r.id === selectedRoadId);
    if (!road) return;

    // Convert latlng to x,y (Leaflet uses [lat, lng] = [y, x])
    const x = e.latlng.lng;
    const y = e.latlng.lat;

    // Check if clicking near an existing waypoint to remove it
    const waypoints = road.waypoints || [];
    const existingWaypointIndex = this.findNearbyWaypoint(waypoints, x, y);

    if (existingWaypointIndex >= 0) {
      // Remove the waypoint
      const newWaypoints = [...waypoints];
      newWaypoints.splice(existingWaypointIndex, 1);
      this.appState.dispatch('UPDATE_ROAD', {
        ...road,
        waypoints: newWaypoints,
        // Clear control points so they get recalculated
        cp1x: undefined,
        cp1y: undefined,
        cp2x: undefined,
        cp2y: undefined,
      });
    } else {
      // Add a new waypoint
      const newWaypoint: RoadWaypoint = {
        id: Math.random().toString(36).substring(2, 11),
        x,
        y,
      };
      this.appState.dispatch('UPDATE_ROAD', {
        ...road,
        waypoints: [...waypoints, newWaypoint],
        // Clear control points so they get recalculated
        cp1x: undefined,
        cp1y: undefined,
        cp2x: undefined,
        cp2y: undefined,
      });
    }
  };

  private findNearbyWaypoint(waypoints: RoadWaypoint[], x: number, y: number): number {
    for (let i = 0; i < waypoints.length; i++) {
      const wp = waypoints[i];
      const dist = Math.sqrt((wp.x - x) ** 2 + (wp.y - y) ** 2);
      if (dist < WAYPOINT_REMOVE_THRESHOLD) {
        return i;
      }
    }
    return -1;
  }

  // Called by SettlementMode when a settlement is clicked in road mode
  handleSettlementClick(settlement: Settlement): void {
    if (!this.active) return;

    const state = this.appState.getState();
    const pendingStartId = state.pendingRoadStartId;

    if (!pendingStartId) {
      // First click - set start settlement
      this.appState.dispatch('SET_PENDING_ROAD_START', settlement.id);
      // Clear road selection when starting to create a new road
      this.appState.dispatch('SELECT_ROAD', null);
      this.updateStatus();
    } else if (pendingStartId === settlement.id) {
      // Clicked same settlement - cancel
      this.appState.dispatch('SET_PENDING_ROAD_START', null);
      this.updateStatus();
    } else {
      // Second click - create road
      this.appState.dispatch('ADD_ROAD', {
        startSettlementId: pendingStartId,
        endSettlementId: settlement.id,
      });
      this.updateStatus();
    }
  }

  private getSettlementById(id: string): Settlement | undefined {
    const state = this.appState.getState();
    return state.settlements.settlements.find((s) => s.id === id);
  }

  private render(): void {
    const state = this.appState.getState();
    const { roads } = state.roads;
    const viewMode = state.roadViewMode;
    const selectedRoadId = state.selectedRoadId;

    // Clear existing layers
    this.roadsLayer.clearLayers();
    this.waypointsLayer.clearLayers();
    this.highlightLayer.clearLayers();
    this.nudgeLayer.clearLayers();

    // Render nudge heatmap first (below roads)
    if (viewMode === 'nudge') {
      this.renderNudgeHeatmap();
    }

    // Draw each road
    roads.forEach((road) => {
      const startSettlement = this.getSettlementById(road.startSettlementId);
      const endSettlement = this.getSettlementById(road.endSettlementId);

      if (!startSettlement || !endSettlement) return;

      const isSelected = road.id === selectedRoadId;
      let line: L.Polyline;

      if (viewMode === 'frontier' || viewMode === 'nudge') {
        // Curves view: draw Bézier curves
        line = this.renderCurveRoad(road, startSettlement, endSettlement, isSelected);
      } else {
        // Default view: draw straight line
        line = L.polyline(
          [
            [startSettlement.y, startSettlement.x],
            [endSettlement.y, endSettlement.x],
          ],
          {
            color: isSelected ? '#ff6600' : ROAD_STYLE.color,
            weight: isSelected ? ROAD_STYLE.weight + 2 : ROAD_STYLE.weight,
            dashArray: road.safe ? undefined : ROAD_STYLE.dashArray,
          }
        );
      }

      // Add tooltip
      const safeText = road.safe ? 'Safe' : 'Unsafe';
      const waypoints = road.waypoints || [];
      const waypointText = waypoints.length > 0 ? ` (${waypoints.length} waypoints)` : '';
      line.bindTooltip(`${safeText} road${waypointText}`, { permanent: false, direction: 'center' });

      // Add click handler
      line.on('click', (e) => {
        L.DomEvent.stopPropagation(e);
        if (e.originalEvent.shiftKey) {
          // Shift+click to remove road
          this.appState.dispatch('REMOVE_ROAD', road.id);
          if (selectedRoadId === road.id) {
            this.appState.dispatch('SELECT_ROAD', null);
          }
        } else if (this.active) {
          // Click to select/deselect
          if (selectedRoadId === road.id) {
            this.appState.dispatch('SELECT_ROAD', null);
          } else {
            this.appState.dispatch('SELECT_ROAD', road.id);
            // Clear pending road creation when selecting
            this.appState.dispatch('SET_PENDING_ROAD_START', null);
          }
        }
      });

      this.roadsLayer.addLayer(line);

      // Draw waypoints for selected road (always visible when selected)
      if (isSelected && this.active) {
        this.renderWaypoints(road);
      }
    });

    // Highlight pending start settlement
    if (this.active && state.pendingRoadStartId) {
      const startSettlement = this.getSettlementById(state.pendingRoadStartId);
      if (startSettlement) {
        const radius = SETTLEMENT_SIZE.radii[Math.min(startSettlement.size, SETTLEMENT_SIZE.radii.length - 1)];
        const highlight = L.circleMarker([startSettlement.y, startSettlement.x], {
          radius: radius + 4,
          color: ROAD_STYLE.color,
          weight: 3,
          fill: false,
        });
        this.highlightLayer.addLayer(highlight);
      }
    }

    // Update status when active
    if (this.active) {
      this.updateStatus();
    }
  }

  private renderCurveRoad(
    road: Road,
    startSettlement: Settlement,
    endSettlement: Settlement,
    isSelected: boolean
  ): L.Polyline {
    // Get render points (will be curve if control points exist, straight line otherwise)
    const points = getRoadRenderPoints(
      startSettlement.x, startSettlement.y,
      endSettlement.x, endSettlement.y,
      road.cp1x, road.cp1y,
      road.cp2x, road.cp2y
    );

    // Convert to Leaflet coordinates
    const latlngs: L.LatLngExpression[] = points.map(p => [p.y, p.x]);

    return L.polyline(latlngs, {
      color: isSelected ? '#ff6600' : BEZIER_CONFIG.frontierColor,
      weight: isSelected ? BEZIER_CONFIG.frontierWeight + 2 : BEZIER_CONFIG.frontierWeight,
      dashArray: road.safe ? undefined : BEZIER_CONFIG.frontierDashArray,
    });
  }

  private renderWaypoints(road: Road): void {
    const waypoints = road.waypoints || [];
    for (const wp of waypoints) {
      const marker = L.circleMarker([wp.y, wp.x], WAYPOINT_STYLE);
      marker.bindTooltip('Alt+click to remove', { permanent: false, direction: 'top' });
      this.waypointsLayer.addLayer(marker);
    }
  }

  private renderNudgeHeatmap(): void {
    const state = this.appState.getState();
    const selectedRoadId = state.selectedRoadId;

    if (!selectedRoadId) return;

    const road = state.roads.roads.find(r => r.id === selectedRoadId);
    if (!road) return;

    const waypoints = road.waypoints || [];
    if (waypoints.length === 0) return;

    const gridConfig = NUDGE_GRID.fine;
    const { resolution, radius } = gridConfig;
    const towers = state.towers.towers;
    const params = state.simulatorHyperparameters;

    // For each waypoint, render grid around it showing frontier/tripoint tiles
    for (const wp of waypoints) {
      // Add cyan dashed circle to show nudge area boundary
      const boundaryCircle = L.circle([wp.y, wp.x], {
        radius,
        color: '#00ffff',
        weight: 1,
        dashArray: '4, 4',
        fill: false,
      });
      this.nudgeLayer.addLayer(boundaryCircle);

      const minX = wp.x - radius;
      const maxX = wp.x + radius;
      const minY = wp.y - radius;
      const maxY = wp.y + radius;

      // Iterate over grid cells
      for (let x = Math.floor(minX / resolution) * resolution; x < maxX; x += resolution) {
        for (let y = Math.floor(minY / resolution) * resolution; y < maxY; y += resolution) {
          // Check if cell center is within radius
          const cx = x + resolution / 2;
          const cy = y + resolution / 2;
          const dx = cx - wp.x;
          const dy = cy - wp.y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist > radius) continue;

          // Compute simulated status at cell center
          const simStatus = computeSettlementSimulatedStatus(cx, cy, towers, params);

          // Only show frontier or tripoint tiles
          let tileColor: string | null = null;
          if (simStatus.balance === 'frontier') {
            tileColor = '#2196F3';  // Blue for frontier
          } else if (simStatus.balance === 'tripoint') {
            tileColor = '#9C27B0';  // Purple for tripoint
          }

          if (tileColor) {
            const bounds: L.LatLngBoundsExpression = [
              [y, x],
              [y + resolution, x + resolution],
            ];

            const rect = L.rectangle(bounds, {
              color: 'transparent',
              weight: 0,
              fillColor: tileColor,
              fillOpacity: 0.5,
            });

            this.nudgeLayer.addLayer(rect);
          }
        }
      }
    }
  }

  // Public method to optimize selected road's curve
  optimizeSelectedRoad(): void {
    const state = this.appState.getState();
    const selectedRoadId = state.selectedRoadId;
    if (!selectedRoadId) return;

    const road = state.roads.roads.find(r => r.id === selectedRoadId);
    if (!road) return;

    const startSettlement = this.getSettlementById(road.startSettlementId);
    const endSettlement = this.getSettlementById(road.endSettlementId);
    if (!startSettlement || !endSettlement) return;

    // Fit Bézier to waypoints
    const cp = fitBezierToWaypoints(
      startSettlement.x, startSettlement.y,
      endSettlement.x, endSettlement.y,
      road.waypoints || []
    );

    // Update road with new control points
    this.appState.dispatch('UPDATE_ROAD', { ...road, ...cp });
  }

  // Public method to clear waypoints for selected road
  clearSelectedRoadWaypoints(): void {
    const state = this.appState.getState();
    const selectedRoadId = state.selectedRoadId;
    if (!selectedRoadId) return;

    const road = state.roads.roads.find(r => r.id === selectedRoadId);
    if (!road) return;

    this.appState.dispatch('UPDATE_ROAD', {
      ...road,
      waypoints: [],
      cp1x: undefined,
      cp1y: undefined,
      cp2x: undefined,
      cp2y: undefined,
    });
  }

  // Public method to snap waypoints to nearest frontier/tripoint tiles
  snapWaypointsToFrontier(): void {
    const state = this.appState.getState();
    const selectedRoadId = state.selectedRoadId;
    if (!selectedRoadId) return;

    const road = state.roads.roads.find(r => r.id === selectedRoadId);
    if (!road) return;

    const waypoints = road.waypoints || [];
    if (waypoints.length === 0) return;

    const gridConfig = NUDGE_GRID.fine;
    const { resolution, radius } = gridConfig;
    const towers = state.towers.towers;
    const params = state.simulatorHyperparameters;

    // For each waypoint, find the closest frontier/tripoint tile
    const newWaypoints: RoadWaypoint[] = waypoints.map(wp => {
      let closestTile: { x: number; y: number } | null = null;
      let closestDist = Infinity;

      const minX = wp.x - radius;
      const maxX = wp.x + radius;
      const minY = wp.y - radius;
      const maxY = wp.y + radius;

      // Search grid cells around the waypoint
      for (let x = Math.floor(minX / resolution) * resolution; x < maxX; x += resolution) {
        for (let y = Math.floor(minY / resolution) * resolution; y < maxY; y += resolution) {
          const cx = x + resolution / 2;
          const cy = y + resolution / 2;
          const dx = cx - wp.x;
          const dy = cy - wp.y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist > radius) continue;

          // Compute simulated status at cell center
          const simStatus = computeSettlementSimulatedStatus(cx, cy, towers, params);

          // Only consider frontier or tripoint tiles
          if (simStatus.balance === 'frontier' || simStatus.balance === 'tripoint') {
            if (dist < closestDist) {
              closestDist = dist;
              closestTile = { x: cx, y: cy };
            }
          }
        }
      }

      // If found a matching tile, snap to it; otherwise keep original position
      if (closestTile) {
        return { ...wp, x: closestTile.x, y: closestTile.y };
      }
      return wp;
    });

    // Update road with new waypoint positions
    this.appState.dispatch('UPDATE_ROAD', {
      ...road,
      waypoints: newWaypoints,
      // Clear control points so they get recalculated
      cp1x: undefined,
      cp1y: undefined,
      cp2x: undefined,
      cp2y: undefined,
    });
  }

  private updateStatus(message?: string): void {
    const statusEl = document.getElementById('status-text');
    if (!statusEl) return;

    if (message) {
      statusEl.textContent = message;
      return;
    }

    const state = this.appState.getState();
    const roadCount = state.roads.roads.length;
    const safeText = state.selectedRoadSafe ? 'safe' : 'unsafe';
    const selectedRoad = state.selectedRoadId
      ? state.roads.roads.find(r => r.id === state.selectedRoadId)
      : null;

    if (state.pendingRoadStartId) {
      const settlement = this.getSettlementById(state.pendingRoadStartId);
      const name = settlement?.name || 'settlement';
      statusEl.textContent = `Click another settlement to create ${safeText} road from ${name}. Click same to cancel.`;
    } else if (selectedRoad) {
      const startName = this.getSettlementById(selectedRoad.startSettlementId)?.name || 'settlement';
      const endName = this.getSettlementById(selectedRoad.endSettlementId)?.name || 'settlement';
      statusEl.textContent = `Selected: ${startName} → ${endName}. Alt+click to add/remove waypoints. Click road to deselect.`;
    } else {
      statusEl.textContent = `Click a settlement to start a ${safeText} road, or click a road to select it. ${roadCount} road(s). Shift+click to remove.`;
    }
  }
}
