import L from 'leaflet';
import { AppState } from '../state/AppState';
import { Settlement, SettlementViewMode } from '../types';
import {
  SETTLEMENT_SIZE,
  NUDGE_GRID,
  NUDGE_TILE_COLORS,
  NUDGE_MARKER_RADIUS,
  NUDGE_SETTLEMENT_COLORS,
} from '../config/constants';
import { computeSettlementSimulatedStatus } from '../utils/harmonicField';

export type SettlementClickHandler = (settlement: Settlement) => void;

export class SettlementMode {
  private map: L.Map;
  private appState: AppState;
  private settlementsLayer: L.LayerGroup;
  private nudgeLayer: L.LayerGroup;
  private clickHandler: (e: L.LeafletMouseEvent) => void;
  private mouseMoveHandler: (e: L.LeafletMouseEvent) => void;
  private mouseUpHandler: (e: L.LeafletMouseEvent) => void;
  private active = false;
  private externalClickHandler: SettlementClickHandler | null = null;
  private draggingSettlementId: string | null = null;

  constructor(map: L.Map, appState: AppState) {
    this.map = map;
    this.appState = appState;

    // Create layer groups - nudge layer below settlements for visibility
    this.nudgeLayer = L.layerGroup().addTo(map);
    this.settlementsLayer = L.layerGroup().addTo(map);

    // Set up event handlers
    this.clickHandler = this.handleMapClick.bind(this);
    this.mouseMoveHandler = this.handleMouseMove.bind(this);
    this.mouseUpHandler = this.handleMouseUp.bind(this);

    // Subscribe to state changes to re-render
    this.appState.subscribe(() => this.render());

    // Initial render
    this.render();
  }

  // Allow external handlers (e.g., RoadMode) to intercept settlement clicks
  setClickHandler(handler: SettlementClickHandler | null): void {
    this.externalClickHandler = handler;
  }

  activate(): void {
    if (this.active) return;
    this.active = true;
    this.map.on('click', this.clickHandler);
    this.map.on('mousemove', this.mouseMoveHandler);
    this.map.on('mouseup', this.mouseUpHandler);
    this.updateStatus();
  }

  deactivate(): void {
    if (!this.active) return;
    this.active = false;
    this.map.off('click', this.clickHandler);
    this.map.off('mousemove', this.mouseMoveHandler);
    this.map.off('mouseup', this.mouseUpHandler);
    this.draggingSettlementId = null;
    // Clear nudge layer when leaving settlement mode
    this.nudgeLayer.clearLayers();
  }

  private handleMapClick(e: L.LeafletMouseEvent): void {
    // Don't add settlement if we're dragging
    if (this.draggingSettlementId) return;

    // Clear selection when clicking on map background
    this.appState.dispatch('SELECT_SETTLEMENT', null);

    const x = e.latlng.lng;
    const y = e.latlng.lat;

    // Add settlement at click location (with empty name)
    this.appState.dispatch('ADD_SETTLEMENT', { x, y });
    this.updateStatus();
  }

  private handleMouseMove(e: L.LeafletMouseEvent): void {
    if (!this.draggingSettlementId) return;

    const x = e.latlng.lng;
    const y = e.latlng.lat;

    // Update settlement position
    const state = this.appState.getState();
    const settlement = state.settlements.settlements.find(s => s.id === this.draggingSettlementId);
    if (settlement) {
      this.appState.dispatch('UPDATE_SETTLEMENT', { ...settlement, x, y });
    }
  }

  private handleMouseUp(_e: L.LeafletMouseEvent): void {
    if (!this.draggingSettlementId) return;

    this.draggingSettlementId = null;
    this.map.dragging.enable();
    this.updateStatus();
    // Re-render nudge heatmap now that dragging is complete
    this.renderNudgeHeatmap();
  }

  private getRadius(size: number): number {
    const clampedSize = Math.min(size, SETTLEMENT_SIZE.radii.length - 1);
    return SETTLEMENT_SIZE.radii[clampedSize];
  }

  private isNudgeMode(viewMode: SettlementViewMode): boolean {
    return viewMode === 'nudge-fine' || viewMode === 'nudge-finer';
  }

  private getSettlementMatchStatus(settlement: Settlement): {
    stabilityMatch: boolean;
    balanceMatch: boolean;
    hasCanonical: boolean;
  } {
    const state = this.appState.getState();
    const canonical = settlement.canonicalStatus;

    if (!canonical || (!canonical.stability && !canonical.balance)) {
      return { stabilityMatch: false, balanceMatch: false, hasCanonical: false };
    }

    const simStatus = computeSettlementSimulatedStatus(
      settlement.x,
      settlement.y,
      state.towers.towers,
      state.simulatorHyperparameters
    );

    const stabilityMatch = !!canonical.stability && canonical.stability === simStatus.stability;
    const balanceMatch = !!canonical.balance && canonical.balance === simStatus.balance;

    return { stabilityMatch, balanceMatch, hasCanonical: true };
  }

  private getSettlementMarkerColor(settlement: Settlement, viewMode: SettlementViewMode): string {
    if (!this.isNudgeMode(viewMode)) {
      return SETTLEMENT_SIZE.fillColor;
    }

    const { stabilityMatch, balanceMatch, hasCanonical } = this.getSettlementMatchStatus(settlement);

    if (!hasCanonical) {
      return NUDGE_SETTLEMENT_COLORS.unset;
    }

    if (stabilityMatch && balanceMatch) {
      return NUDGE_SETTLEMENT_COLORS.allMatch;
    }

    if (stabilityMatch || balanceMatch) {
      return NUDGE_SETTLEMENT_COLORS.partial;
    }

    return NUDGE_SETTLEMENT_COLORS.noMatch;
  }

  private getSettlementNeighborIds(settlementId: string): Set<string> {
    const state = this.appState.getState();
    const neighborIds = new Set<string>();

    for (const road of state.roads.roads) {
      if (road.startSettlementId === settlementId) {
        neighborIds.add(road.endSettlementId);
      } else if (road.endSettlementId === settlementId) {
        neighborIds.add(road.startSettlementId);
      }
    }

    return neighborIds;
  }

  private renderNudgeHeatmap(): void {
    const state = this.appState.getState();
    const viewMode = state.settlementViewMode;

    // Skip rendering during drag to avoid expensive recomputation
    if (this.draggingSettlementId) {
      return;
    }

    // Clear existing nudge tiles
    this.nudgeLayer.clearLayers();

    // Only render in nudge modes when settlement mode is active
    if (!this.active || !this.isNudgeMode(viewMode)) {
      return;
    }

    const gridConfig = viewMode === 'nudge-fine' ? NUDGE_GRID.fine : NUDGE_GRID.finer;
    const { resolution, radius } = gridConfig;
    const { settlements } = state.settlements;
    const towers = state.towers.towers;
    const params = state.simulatorHyperparameters;

    // Only show nudge tiles for selected settlement and its road neighbors
    const selectedId = state.selectedSettlementId;
    const neighborIds = selectedId ? this.getSettlementNeighborIds(selectedId) : new Set<string>();
    const showTilesForIds = selectedId ? new Set([selectedId, ...neighborIds]) : new Set<string>();

    // For each settlement with canonical status, render grid around it
    settlements.forEach((settlement) => {
      const canonical = settlement.canonicalStatus;
      if (!canonical || (!canonical.stability && !canonical.balance)) {
        return;
      }

      // Only show nudge tiles for selected settlement and its neighbors
      if (!showTilesForIds.has(settlement.id)) {
        return;
      }

      // Add teal dashed circle to show nudge area boundary
      const boundaryCircle = L.circle([settlement.y, settlement.x], {
        radius,
        color: '#00ffff',  // Cyan/teal
        weight: 1,
        dashArray: '4, 4',
        fill: false,
      });
      this.nudgeLayer.addLayer(boundaryCircle);

      const minX = settlement.x - radius;
      const maxX = settlement.x + radius;
      const minY = settlement.y - radius;
      const maxY = settlement.y + radius;

      // Iterate over grid cells
      for (let x = Math.floor(minX / resolution) * resolution; x < maxX; x += resolution) {
        for (let y = Math.floor(minY / resolution) * resolution; y < maxY; y += resolution) {
          // Check if cell center is within radius
          const cx = x + resolution / 2;
          const cy = y + resolution / 2;
          const dx = cx - settlement.x;
          const dy = cy - settlement.y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist > radius) continue;

          // Compute simulated status at cell center
          const simStatus = computeSettlementSimulatedStatus(cx, cy, towers, params);

          // Determine match status
          const stabilityMatch = !!canonical.stability && canonical.stability === simStatus.stability;
          const balanceMatch = !!canonical.balance && canonical.balance === simStatus.balance;

          // Determine tile color
          let tileColor: string | null = null;
          if (stabilityMatch && balanceMatch) {
            tileColor = NUDGE_TILE_COLORS.bothMatch;
          } else if (stabilityMatch) {
            tileColor = NUDGE_TILE_COLORS.stabilityMatch;
          } else if (balanceMatch) {
            tileColor = NUDGE_TILE_COLORS.balanceMatch;
          }

          // Only render if there's a match
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
    });
  }

  private render(): void {
    const state = this.appState.getState();
    const { settlements } = state.settlements;
    const viewMode = state.settlementViewMode;

    // Clear existing layers
    this.settlementsLayer.clearLayers();

    // Render nudge heatmap first (below settlements)
    this.renderNudgeHeatmap();

    const isNudge = this.isNudgeMode(viewMode);

    // Draw each settlement as a circle with optional label
    settlements.forEach((settlement) => {
      // Use uniform small radius in nudge mode, normal radius otherwise
      const radius = isNudge ? NUDGE_MARKER_RADIUS : this.getRadius(settlement.size);
      const isHollow = !isNudge && settlement.size === 0;
      const isSelected = state.selectedSettlementId === settlement.id;

      // Get marker fill color (based on match status in nudge mode)
      const fillColor = this.getSettlementMarkerColor(settlement, viewMode);

      const circle = L.circleMarker([settlement.y, settlement.x], {
        radius,
        color: isSelected ? '#00ff00' : SETTLEMENT_SIZE.strokeColor,
        weight: isSelected ? 3 : SETTLEMENT_SIZE.strokeWidth,
        fillColor,
        fillOpacity: isHollow ? 0 : 1,
      });

      // Add tooltip with settlement info
      let tooltipText: string;
      if (settlement.name) {
        tooltipText = `${settlement.name} (size ${settlement.size})`;
      } else if (settlement.size === 0) {
        tooltipText = 'Empty';
      } else {
        tooltipText = `Settlement (size ${settlement.size})`;
      }
      circle.bindTooltip(tooltipText, { permanent: false, direction: 'top' });

      // Add click handler for selecting/removing settlements
      circle.on('click', (e) => {
        L.DomEvent.stopPropagation(e);

        // If external handler is set (e.g., road mode), use it for plain clicks
        if (this.externalClickHandler && !e.originalEvent.shiftKey) {
          this.externalClickHandler(settlement);
          return;
        }

        if (e.originalEvent.shiftKey) {
          // Shift+click to remove
          this.appState.dispatch('REMOVE_SETTLEMENT', settlement.id);
          this.appState.dispatch('SELECT_SETTLEMENT', null);
        } else {
          // Plain click to select
          this.appState.dispatch('SELECT_SETTLEMENT', settlement.id);
        }
      });

      // Add mousedown handler for Ctrl+drag to move
      circle.on('mousedown', (e) => {
        L.DomEvent.stopPropagation(e);
        if (e.originalEvent.ctrlKey) {
          this.draggingSettlementId = settlement.id;
          this.map.dragging.disable();
        }
      });

      this.settlementsLayer.addLayer(circle);

      // Add name label if present
      if (settlement.name) {
        const label = L.marker([settlement.y - radius - SETTLEMENT_SIZE.labelOffset, settlement.x], {
          icon: L.divIcon({
            className: 'settlement-label',
            html: `<span style="
              color: #000;
              font-size: 12px;
              font-weight: 500;
              text-shadow: 1px 1px 0 #fff, -1px -1px 0 #fff, 1px -1px 0 #fff, -1px 1px 0 #fff;
              white-space: nowrap;
            ">${settlement.name}</span>`,
            iconSize: [0, 0],
            iconAnchor: [0, 0],
          }),
        });
        this.settlementsLayer.addLayer(label);
      }
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
    const count = state.settlements.settlements.length;
    const size = state.selectedSettlementSize;

    statusEl.textContent = `Click to place settlement (size: ${size}). ${count} settlement(s). Click to select, Shift+click remove, Ctrl+drag move.`;
  }
}
