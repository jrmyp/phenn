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
  private active = false;
  private externalClickHandler: SettlementClickHandler | null = null;

  constructor(map: L.Map, appState: AppState) {
    this.map = map;
    this.appState = appState;

    // Create layer group for settlements
    this.settlementsLayer = L.layerGroup().addTo(map);

    // Set up click handler
    this.clickHandler = this.handleMapClick.bind(this);

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
    this.updateStatus();
  }

  deactivate(): void {
    if (!this.active) return;
    this.active = false;
    this.map.off('click', this.clickHandler);
  }

  private handleMapClick(e: L.LeafletMouseEvent): void {
    const x = e.latlng.lng;
    const y = e.latlng.lat;

    // Add settlement at click location
    this.appState.dispatch('ADD_SETTLEMENT', { x, y });
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

      const circle = L.circleMarker([settlement.y, settlement.x], {
        radius,
        color: SETTLEMENT_SIZE.strokeColor,
        weight: SETTLEMENT_SIZE.strokeWidth,
        fillColor: SETTLEMENT_SIZE.fillColor,
        fillOpacity: isHollow ? 0 : 1,
      });

      // Add tooltip with settlement info
      const tooltipText = settlement.name
        ? `${settlement.name} (size ${settlement.size})`
        : `Settlement (size ${settlement.size})`;
      circle.bindTooltip(tooltipText, { permanent: false, direction: 'top' });

      // Add click handler for selecting/removing settlements
      circle.on('click', (e) => {
        L.DomEvent.stopPropagation(e);

        // If external handler is set (e.g., road mode), use it for plain clicks
        if (this.externalClickHandler && !e.originalEvent.shiftKey && !e.originalEvent.altKey) {
          this.externalClickHandler(settlement);
          return;
        }

        if (e.originalEvent.shiftKey) {
          // Shift+click to remove
          this.appState.dispatch('REMOVE_SETTLEMENT', settlement.id);
        } else if (e.originalEvent.altKey) {
          // Alt+click to edit name
          this.promptForName(settlement);
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

  private promptForName(settlement: Settlement): void {
    const newName = prompt('Settlement name:', settlement.name);
    if (newName !== null) {
      this.appState.dispatch('UPDATE_SETTLEMENT', {
        ...settlement,
        name: newName,
      });
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
    const count = state.settlements.settlements.length;
    const size = state.selectedSettlementSize;

    statusEl.textContent = `Click to place settlement (size: ${size}). ${count} settlement(s) placed. Shift+click to remove, Alt+click to rename.`;
  }
}
