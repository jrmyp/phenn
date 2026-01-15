import L from 'leaflet';
import { AppState } from '../state/AppState';
import { Point } from '../types';
import { STYLES, CLOSE_LOOP_THRESHOLD, MAP_WIDTH, MAP_HEIGHT, MAP_FILL } from '../config/constants';

export class CoastlineMode {
  private map: L.Map;
  private appState: AppState;
  private fillLayer: L.LayerGroup;
  private pointsLayer: L.LayerGroup;
  private linesLayer: L.LayerGroup;
  private pendingLayer: L.LayerGroup;
  private clickHandler: (e: L.LeafletMouseEvent) => void;
  private active = false;

  constructor(map: L.Map, appState: AppState) {
    this.map = map;
    this.appState = appState;

    // Create layer groups for organization (fill layer at bottom)
    this.fillLayer = L.layerGroup().addTo(map);
    this.linesLayer = L.layerGroup().addTo(map);
    this.pointsLayer = L.layerGroup().addTo(map);
    this.pendingLayer = L.layerGroup().addTo(map);

    // Set up click handler
    this.clickHandler = this.handleMapClick.bind(this);

    // Subscribe to state changes to re-render
    this.appState.subscribe(() => this.render());

    // Initial render
    this.render();
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
    const state = this.appState.getState();

    // Only handle clicks in add mode
    if (state.coastlineSubMode !== 'add') return;

    const x = e.latlng.lng;
    const y = e.latlng.lat;

    // Check if we should close the loop (clicked near the first point)
    if (!state.coastline.isClosed && state.coastline.points.length >= 3) {
      const firstPoint = state.coastline.points[0];
      const distance = this.calculateDistance(x, y, firstPoint.x, firstPoint.y);

      if (distance < CLOSE_LOOP_THRESHOLD) {
        this.appState.dispatch('CLOSE_COASTLINE', null);
        this.updateStatus('Coastline closed! You can now edit the coastline.');
        return;
      }
    }

    // Add the point
    this.appState.dispatch('ADD_POINT', { x, y });
    this.updateStatus();
  }

  private calculateDistance(x1: number, y1: number, x2: number, y2: number): number {
    // Calculate distance in map coordinates, then convert to approximate pixels
    const dx = x2 - x1;
    const dy = y2 - y1;
    const mapDistance = Math.sqrt(dx * dx + dy * dy);

    // Get current zoom to convert to pixels
    const zoom = this.map.getZoom();
    const scale = Math.pow(2, zoom);

    return mapDistance * scale;
  }

  private render(): void {
    const state = this.appState.getState();
    const { coastline } = state;

    // Clear existing layers
    this.fillLayer.clearLayers();
    this.pointsLayer.clearLayers();
    this.linesLayer.clearLayers();
    this.pendingLayer.clearLayers();

    // Render ocean/continent fill when background is hidden and coastline is closed
    if (!state.isBackgroundVisible && coastline.isClosed && coastline.points.length >= 3) {
      this.renderFill(coastline.points);
    }

    if (coastline.points.length === 0) return;

    // Draw line segments
    const lineCoords: L.LatLngExpression[] = coastline.points.map((p) => [p.y, p.x]);

    if (lineCoords.length >= 2) {
      // If closed, add first point at the end to complete the polygon
      if (coastline.isClosed) {
        lineCoords.push(lineCoords[0]);
      }

      const polyline = L.polyline(lineCoords, {
        color: coastline.isClosed
          ? STYLES.coastline.committed.color
          : STYLES.coastline.pending.color,
        weight: STYLES.coastline.committed.weight,
      });

      this.linesLayer.addLayer(polyline);
    }

    // Draw points
    coastline.points.forEach((point, index) => {
      const isFirst = index === 0;
      const marker = L.circleMarker([point.y, point.x], {
        radius: isFirst && !coastline.isClosed ? STYLES.point.radius + 2 : STYLES.point.radius,
        fillColor: isFirst && !coastline.isClosed ? '#00ff00' : STYLES.point.fillColor,
        fillOpacity: STYLES.point.fillOpacity,
        color: STYLES.point.color,
        weight: STYLES.point.weight,
      });

      // Add tooltip showing point index
      marker.bindTooltip(`Point ${index + 1}`, {
        permanent: false,
        direction: 'top',
      });

      this.pointsLayer.addLayer(marker);
    });

    // Draw pending edit if any
    if (state.pendingEdit && state.pendingEdit.points.length > 0) {
      const pendingCoords: L.LatLngExpression[] = state.pendingEdit.points.map((p) => [
        p.y,
        p.x,
      ]);

      if (pendingCoords.length >= 2) {
        const pendingLine = L.polyline(pendingCoords, {
          color: STYLES.coastline.pending.color,
          weight: STYLES.coastline.pending.weight,
          dashArray: '5, 5',
        });
        this.pendingLayer.addLayer(pendingLine);
      }

      // Draw pending points
      state.pendingEdit.points.forEach((point) => {
        const marker = L.circleMarker([point.y, point.x], {
          radius: STYLES.point.radius,
          fillColor: '#0066ff',
          fillOpacity: STYLES.point.fillOpacity,
          color: STYLES.point.color,
          weight: STYLES.point.weight,
        });
        this.pendingLayer.addLayer(marker);
      });
    }
  }

  private renderFill(coastlinePoints: Point[]): void {
    // Create ocean rectangle covering the entire map
    const oceanBounds: L.LatLngBoundsExpression = [
      [0, 0],
      [MAP_HEIGHT, MAP_WIDTH],
    ];

    const oceanRect = L.rectangle(oceanBounds, {
      color: 'none',
      weight: 0,
      fillColor: MAP_FILL.ocean,
      fillOpacity: 1,
      interactive: false,
    });
    this.fillLayer.addLayer(oceanRect);

    // Create continent polygon from coastline points
    const continentCoords: L.LatLngExpression[] = coastlinePoints.map((p) => [p.y, p.x]);

    const continentPolygon = L.polygon(continentCoords, {
      color: 'none',
      weight: 0,
      fillColor: MAP_FILL.continent,
      fillOpacity: 1,
      interactive: false,
    });
    this.fillLayer.addLayer(continentPolygon);
  }

  private updateStatus(message?: string): void {
    const statusEl = document.getElementById('status-text');
    if (!statusEl) return;

    if (message) {
      statusEl.textContent = message;
      return;
    }

    const state = this.appState.getState();
    const pointCount = state.coastline.points.length;

    if (state.coastline.isClosed) {
      statusEl.textContent = 'Coastline is complete. Edit mode not yet implemented.';
    } else if (pointCount === 0) {
      statusEl.textContent = 'Click on the map to add coastline points.';
    } else if (pointCount < 3) {
      statusEl.textContent = `${pointCount} point(s) added. Add at least ${3 - pointCount} more to close the loop.`;
    } else {
      statusEl.textContent = `${pointCount} points. Click near the green point to close the coastline, or continue adding points.`;
    }
  }

  getPointAtLocation(x: number, y: number): Point | null {
    const state = this.appState.getState();
    const threshold = CLOSE_LOOP_THRESHOLD;

    for (const point of state.coastline.points) {
      const distance = this.calculateDistance(x, y, point.x, point.y);
      if (distance < threshold) {
        return point;
      }
    }

    return null;
  }
}
