import L from 'leaflet';
import { AppState } from '../state/AppState';
import { Settlement } from '../types';
import { SETTLEMENT_SIZE } from '../config/constants';

export type SettlementClickHandler = (settlement: Settlement) => void;

export class SettlementMode {
  private map: L.Map;
  private appState: AppState;
  private settlementsLayer: L.LayerGroup;
  private clickHandler: (e: L.LeafletMouseEvent) => void;
  private mouseMoveHandler: (e: L.LeafletMouseEvent) => void;
  private mouseUpHandler: (e: L.LeafletMouseEvent) => void;
  private active = false;
  private externalClickHandler: SettlementClickHandler | null = null;
  private draggingSettlementId: string | null = null;

  constructor(map: L.Map, appState: AppState) {
    this.map = map;
    this.appState = appState;

    // Create layer group for settlements
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
  }

  private getRadius(size: number): number {
    const clampedSize = Math.min(size, SETTLEMENT_SIZE.radii.length - 1);
    return SETTLEMENT_SIZE.radii[clampedSize];
  }

  private render(): void {
    const state = this.appState.getState();
    const { settlements } = state.settlements;

    // Clear existing layer
    this.settlementsLayer.clearLayers();

    // Draw each settlement as a circle with optional label
    settlements.forEach((settlement) => {
      const radius = this.getRadius(settlement.size);
      const isHollow = settlement.size === 0;
      const isSelected = state.selectedSettlementId === settlement.id;

      const circle = L.circleMarker([settlement.y, settlement.x], {
        radius,
        color: isSelected ? '#00ff00' : SETTLEMENT_SIZE.strokeColor,
        weight: isSelected ? 3 : SETTLEMENT_SIZE.strokeWidth,
        fillColor: SETTLEMENT_SIZE.fillColor,
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
