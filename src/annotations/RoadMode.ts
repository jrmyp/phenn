import L from 'leaflet';
import { AppState } from '../state/AppState';
import { Settlement } from '../types';
import { ROAD_STYLE, SETTLEMENT_SIZE } from '../config/constants';

export class RoadMode {
  private map: L.Map;
  private appState: AppState;
  private roadsLayer: L.LayerGroup;
  private highlightLayer: L.LayerGroup;
  private active = false;

  constructor(map: L.Map, appState: AppState) {
    this.map = map;
    this.appState = appState;

    // Create layer groups for roads (below settlements) and highlights
    this.roadsLayer = L.layerGroup().addTo(map);
    this.highlightLayer = L.layerGroup().addTo(map);

    // Subscribe to state changes to re-render
    this.appState.subscribe(() => this.render());

    // Initial render
    this.render();
  }

  activate(): void {
    if (this.active) return;
    this.active = true;
    this.updateStatus();
  }

  deactivate(): void {
    if (!this.active) return;
    this.active = false;
    // Clear any pending road start
    this.appState.dispatch('SET_PENDING_ROAD_START', null);
    this.highlightLayer.clearLayers();
  }

  // Called by SettlementMode when a settlement is clicked in road mode
  handleSettlementClick(settlement: Settlement): void {
    if (!this.active) return;

    const state = this.appState.getState();
    const pendingStartId = state.pendingRoadStartId;

    if (!pendingStartId) {
      // First click - set start settlement
      this.appState.dispatch('SET_PENDING_ROAD_START', settlement.id);
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

    // Clear existing layers
    this.roadsLayer.clearLayers();
    this.highlightLayer.clearLayers();

    // Draw each road
    roads.forEach((road) => {
      const startSettlement = this.getSettlementById(road.startSettlementId);
      const endSettlement = this.getSettlementById(road.endSettlementId);

      if (!startSettlement || !endSettlement) return;

      const line = L.polyline(
        [
          [startSettlement.y, startSettlement.x],
          [endSettlement.y, endSettlement.x],
        ],
        {
          color: ROAD_STYLE.color,
          weight: ROAD_STYLE.weight,
          dashArray: road.safe ? undefined : ROAD_STYLE.dashArray,
        }
      );

      // Add tooltip
      const safeText = road.safe ? 'Safe' : 'Unsafe';
      line.bindTooltip(`${safeText} road`, { permanent: false, direction: 'center' });

      // Add click handler for removing roads
      line.on('click', (e) => {
        L.DomEvent.stopPropagation(e);
        if (e.originalEvent.shiftKey) {
          this.appState.dispatch('REMOVE_ROAD', road.id);
        } else if (this.active && e.originalEvent.altKey) {
          // Alt+click to toggle safe/unsafe
          this.appState.dispatch('UPDATE_ROAD', { ...road, safe: !road.safe });
        }
      });

      this.roadsLayer.addLayer(line);
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

    if (state.pendingRoadStartId) {
      const settlement = this.getSettlementById(state.pendingRoadStartId);
      const name = settlement?.name || 'settlement';
      statusEl.textContent = `Click another settlement to create ${safeText} road from ${name}. Click same to cancel.`;
    } else {
      statusEl.textContent = `Click a settlement to start a ${safeText} road. ${roadCount} road(s). Shift+click road to remove, Alt+click to toggle safe.`;
    }
  }
}
