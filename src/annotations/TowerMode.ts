import L from 'leaflet';
import { AppState } from '../state/AppState';
import { Tower } from '../types';
import { TOWER_COLORS, TOWER_SIZE } from '../config/constants';

export class TowerMode {
  private map: L.Map;
  private appState: AppState;
  private towersLayer: L.LayerGroup;
  private clickHandler: (e: L.LeafletMouseEvent) => void;
  private mouseMoveHandler: (e: L.LeafletMouseEvent) => void;
  private mouseUpHandler: (e: L.LeafletMouseEvent) => void;
  private active = false;
  private draggingTowerId: string | null = null;

  constructor(map: L.Map, appState: AppState) {
    this.map = map;
    this.appState = appState;

    // Create layer group for towers
    this.towersLayer = L.layerGroup().addTo(map);

    // Set up event handlers
    this.clickHandler = this.handleMapClick.bind(this);
    this.mouseMoveHandler = this.handleMouseMove.bind(this);
    this.mouseUpHandler = this.handleMouseUp.bind(this);

    // Subscribe to state changes to re-render
    this.appState.subscribe(() => this.render());

    // Initial render
    this.render();
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
    this.draggingTowerId = null;
  }

  private handleMapClick(e: L.LeafletMouseEvent): void {
    // Don't add tower if we're dragging
    if (this.draggingTowerId) return;

    // Clear selection when clicking on map background
    this.appState.dispatch('SELECT_TOWER', null);

    const x = e.latlng.lng;
    const y = e.latlng.lat;

    // Add tower at click location
    this.appState.dispatch('ADD_TOWER', { x, y });
    this.updateStatus();
  }

  private handleMouseMove(e: L.LeafletMouseEvent): void {
    if (!this.draggingTowerId) return;

    const x = e.latlng.lng;
    const y = e.latlng.lat;

    // Update tower position
    const state = this.appState.getState();
    const tower = state.towers.towers.find(t => t.id === this.draggingTowerId);
    if (tower) {
      this.appState.dispatch('UPDATE_TOWER', { ...tower, x, y });
    }
  }

  private handleMouseUp(_e: L.LeafletMouseEvent): void {
    if (!this.draggingTowerId) return;

    this.draggingTowerId = null;
    this.map.dragging.enable();
    this.updateStatus();
  }

  private getTowerDimensions(power: number): { width: number; height: number } {
    // Linear interpolation between min and max dimensions based on power
    const t = (power - TOWER_SIZE.minPower) / (TOWER_SIZE.maxPower - TOWER_SIZE.minPower);
    const width = TOWER_SIZE.baseWidth + t * (TOWER_SIZE.maxWidth - TOWER_SIZE.baseWidth);
    const height = TOWER_SIZE.baseHeight + t * (TOWER_SIZE.maxHeight - TOWER_SIZE.baseHeight);
    return { width, height };
  }

  private render(): void {
    const state = this.appState.getState();
    const { towers } = state.towers;

    // Clear existing layer
    this.towersLayer.clearLayers();

    // Draw each tower as a rectangle
    towers.forEach((tower) => {
      const { width, height } = this.getTowerDimensions(tower.power);
      const color = TOWER_COLORS[tower.type] || '#888888';

      // Create rectangle bounds centered on tower position
      // Rectangle extends upward from the point (like a tower standing on the ground)
      const bounds: L.LatLngBoundsExpression = [
        [tower.y, tower.x - width / 2],           // Bottom-left
        [tower.y + height, tower.x + width / 2],  // Top-right
      ];

      const isSelected = state.selectedTowerId === tower.id;
      const rect = L.rectangle(bounds, {
        color: isSelected ? '#00ff00' : '#000000',
        weight: isSelected ? 3 : 1,
        fillColor: color,
        fillOpacity: 0.8,
      });

      // Add tooltip with tower info
      rect.bindTooltip(
        `${tower.type.charAt(0).toUpperCase() + tower.type.slice(1)} Tower\nPower: ${tower.power}`,
        { permanent: false, direction: 'top' }
      );

      // Add click handler for selecting/removing towers
      rect.on('click', (e) => {
        L.DomEvent.stopPropagation(e);
        if (e.originalEvent.shiftKey) {
          this.appState.dispatch('REMOVE_TOWER', tower.id);
          this.appState.dispatch('SELECT_TOWER', null);
        } else {
          // Select the tower
          this.appState.dispatch('SELECT_TOWER', tower.id);
        }
      });

      // Add mousedown handler for Ctrl+drag to move
      rect.on('mousedown', (e) => {
        L.DomEvent.stopPropagation(e);
        if (e.originalEvent.ctrlKey) {
          this.draggingTowerId = tower.id;
          this.map.dragging.disable();
        }
      });

      this.towersLayer.addLayer(rect);
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
    const towerCount = state.towers.towers.length;
    const type = state.selectedTowerType;
    const power = state.selectedTowerPower;

    statusEl.textContent = `Click to place ${type} tower (power: ${power}). ${towerCount} tower(s). Click to select, Shift+click remove, Ctrl+drag move.`;
  }

  getTowerAtLocation(x: number, y: number): Tower | null {
    const state = this.appState.getState();
    const threshold = 20;

    for (const tower of state.towers.towers) {
      const dx = Math.abs(x - tower.x);
      const dy = Math.abs(y - tower.y);
      const { width, height } = this.getTowerDimensions(tower.power);

      if (dx < width / 2 + threshold && dy < height + threshold) {
        return tower;
      }
    }

    return null;
  }
}
