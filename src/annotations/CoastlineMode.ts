import L from 'leaflet';
import { AppState } from '../state/AppState';
import { Point, PendingEdit } from '../types';
import { STYLES, CLOSE_LOOP_THRESHOLD, MAP_WIDTH, MAP_HEIGHT, MAP_FILL } from '../config/constants';

export class CoastlineMode {
  private map: L.Map;
  private appState: AppState;
  private fillLayer: L.LayerGroup;
  private pointsLayer: L.LayerGroup;
  private linesLayer: L.LayerGroup;
  private pendingLayer: L.LayerGroup;
  private replacePreviewLayer: L.LayerGroup;
  private clickHandler: (e: L.LeafletMouseEvent) => void;
  private mouseMoveHandler: (e: L.LeafletMouseEvent) => void;
  private mouseUpHandler: (e: L.LeafletMouseEvent) => void;
  private active = false;
  private draggingPointId: string | null = null;

  constructor(map: L.Map, appState: AppState) {
    this.map = map;
    this.appState = appState;

    // Create layer groups for organization (fill layer at bottom)
    this.fillLayer = L.layerGroup().addTo(map);
    this.linesLayer = L.layerGroup().addTo(map);
    this.replacePreviewLayer = L.layerGroup().addTo(map);
    this.pointsLayer = L.layerGroup().addTo(map);
    this.pendingLayer = L.layerGroup().addTo(map);

    // Set up event handlers
    this.clickHandler = this.handleMapClick.bind(this);
    this.mouseMoveHandler = this.handleMouseMove.bind(this);
    this.mouseUpHandler = this.handleMouseUp.bind(this);
    this.handleMouseDownOnPoint = this.handleMouseDownOnPoint.bind(this);

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
    this.render(); // Show point markers
  }

  deactivate(): void {
    if (!this.active) return;
    this.active = false;
    this.map.off('click', this.clickHandler);
    this.map.off('mousemove', this.mouseMoveHandler);
    this.map.off('mouseup', this.mouseUpHandler);
    this.draggingPointId = null;
    this.render(); // Hide point markers
  }

  private handleMapClick(e: L.LeafletMouseEvent): void {
    const state = this.appState.getState();
    const x = e.latlng.lng;
    const y = e.latlng.lat;

    // Handle closed coastline editing
    if (state.coastline.isClosed) {
      this.handleEditClick(x, y);
      return;
    }

    // Initial drawing mode - only handle 'add' sub-mode
    if (state.coastlineSubMode !== 'add') return;

    // Check if we should close the loop (clicked near the first point)
    if (state.coastline.points.length >= 3) {
      const firstPoint = state.coastline.points[0];
      const distance = this.calculateDistance(x, y, firstPoint.x, firstPoint.y);

      if (distance < CLOSE_LOOP_THRESHOLD) {
        this.appState.dispatch('CLOSE_COASTLINE', null);
        this.updateStatus('Coastline closed! Click points to edit.');
        return;
      }
    }

    // Add the point
    this.appState.dispatch('ADD_POINT', { x, y });
    this.updateStatus();
  }

  private handleEditClick(x: number, y: number): void {
    const state = this.appState.getState();
    const clickedPoint = this.getPointAtLocation(x, y);

    switch (state.coastlineSubMode) {
      case 'add':
        this.handleAddModeClick(x, y, clickedPoint);
        break;
      case 'remove':
        this.handleRemoveModeClick(clickedPoint);
        break;
      case 'move':
        // Move mode uses drag, not click
        break;
    }
  }

  private handleAddModeClick(x: number, y: number, clickedPoint: Point | null): void {
    const state = this.appState.getState();
    const pendingEdit = state.pendingEdit;

    // If no pending edit, we need to start one by clicking an existing point
    if (!pendingEdit) {
      if (clickedPoint) {
        // Start a new replacement edit with this point as the start anchor
        const newPendingEdit: PendingEdit = {
          type: 'replace',
          points: [],
          startAnchorId: clickedPoint.id,
        };
        this.appState.dispatch('SET_PENDING_EDIT', newPendingEdit);
        this.updateStatus(`Start anchor set. Add points, then click another coastline point to end.`);
      } else {
        this.updateStatus('Click on an existing coastline point to start editing.');
      }
      return;
    }

    // We have a pending edit with a start anchor
    if (pendingEdit.startAnchorId && !pendingEdit.endAnchorId) {
      if (clickedPoint && clickedPoint.id !== pendingEdit.startAnchorId) {
        // Clicked on a different existing point - set as end anchor
        const replacedIds = this.findReplacedPointIds(pendingEdit.startAnchorId, clickedPoint.id);
        const updatedEdit: PendingEdit = {
          ...pendingEdit,
          endAnchorId: clickedPoint.id,
          replacedPointIds: replacedIds,
        };
        this.appState.dispatch('SET_PENDING_EDIT', updatedEdit);
        this.updateStatus(`Replacing ${replacedIds.length} points. Click Commit to apply or Cancel to discard.`);
      } else if (!clickedPoint) {
        // Clicked on empty space - add intermediate point
        this.appState.dispatch('ADD_POINT', { x, y });
        this.updateStatus(`${pendingEdit.points.length + 1} new points. Click a coastline point to finish.`);
      } else {
        // Clicked the start anchor again - cancel
        this.appState.dispatch('CANCEL_EDIT', null);
        this.updateStatus('Edit cancelled. Click a coastline point to start again.');
      }
    }
  }

  private handleRemoveModeClick(clickedPoint: Point | null): void {
    if (clickedPoint) {
      const state = this.appState.getState();
      // Don't allow removing if it would leave fewer than 3 points
      if (state.coastline.points.length <= 3) {
        this.updateStatus('Cannot remove: coastline needs at least 3 points.');
        return;
      }
      this.appState.dispatch('REMOVE_POINT', clickedPoint.id);
      this.updateStatus(`Point removed. ${state.coastline.points.length - 1} points remaining.`);
    } else {
      this.updateStatus('Click on a coastline point to remove it.');
    }
  }

  private handleMouseDownOnPoint(pointId: string, e: L.LeafletMouseEvent): void {
    const state = this.appState.getState();
    if (state.coastlineSubMode !== 'move' || !state.coastline.isClosed) return;

    this.draggingPointId = pointId;
    this.map.dragging.disable(); // Disable map panning while dragging
    L.DomEvent.stopPropagation(e);
    this.updateStatus('Dragging point... release to place.');
  }

  private handleMouseMove(e: L.LeafletMouseEvent): void {
    if (!this.draggingPointId) return;

    const x = e.latlng.lng;
    const y = e.latlng.lat;

    // Update point position in real-time
    this.appState.dispatch('MOVE_POINT', { id: this.draggingPointId, x, y });
  }

  private handleMouseUp(_e: L.LeafletMouseEvent): void {
    if (!this.draggingPointId) return;

    this.draggingPointId = null;
    this.map.dragging.enable(); // Re-enable map panning
    this.updateStatus('Point moved. Drag another point or switch modes.');
  }

  private findReplacedPointIds(startId: string, endId: string): string[] {
    const state = this.appState.getState();
    const points = state.coastline.points;
    const n = points.length;

    // Find indices
    const startIdx = points.findIndex(p => p.id === startId);
    const endIdx = points.findIndex(p => p.id === endId);

    if (startIdx === -1 || endIdx === -1) return [];

    // Calculate both paths (clockwise and counter-clockwise)
    const pathCW: string[] = [];
    const pathCCW: string[] = [];

    // Clockwise: start+1 to end-1
    let i = (startIdx + 1) % n;
    while (i !== endIdx) {
      pathCW.push(points[i].id);
      i = (i + 1) % n;
    }

    // Counter-clockwise: start-1 to end+1
    i = (startIdx - 1 + n) % n;
    while (i !== endIdx) {
      pathCCW.push(points[i].id);
      i = (i - 1 + n) % n;
    }

    // Return the shorter path
    return pathCW.length <= pathCCW.length ? pathCW : pathCCW;
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
    const { coastline, pendingEdit } = state;

    // Clear existing layers
    this.fillLayer.clearLayers();
    this.pointsLayer.clearLayers();
    this.linesLayer.clearLayers();
    this.pendingLayer.clearLayers();
    this.replacePreviewLayer.clearLayers();

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

    // Only draw point markers when in coastline mode
    if (!this.active) return;

    // Get anchor IDs for highlighting
    const startAnchorId = pendingEdit?.startAnchorId;
    const endAnchorId = pendingEdit?.endAnchorId;
    const replacedIds = new Set(pendingEdit?.replacedPointIds || []);

    // Draw points
    coastline.points.forEach((point, index) => {
      const isFirst = index === 0;
      const isStartAnchor = point.id === startAnchorId;
      const isEndAnchor = point.id === endAnchorId;
      const isReplaced = replacedIds.has(point.id);

      // Determine point styling
      let fillColor = STYLES.point.fillColor;
      let radius = STYLES.point.radius;
      let strokeColor = STYLES.point.color;
      let strokeWeight = STYLES.point.weight;

      if (isStartAnchor || isEndAnchor) {
        fillColor = '#00ff00'; // Green for anchors
        radius = STYLES.point.radius + 3;
        strokeWeight = 3;
      } else if (isReplaced) {
        fillColor = '#ff6600'; // Orange for points being replaced
        radius = STYLES.point.radius + 1;
      } else if (isFirst && !coastline.isClosed) {
        fillColor = '#00ff00';
        radius = STYLES.point.radius + 2;
      }

      const marker = L.circleMarker([point.y, point.x], {
        radius,
        fillColor,
        fillOpacity: STYLES.point.fillOpacity,
        color: strokeColor,
        weight: strokeWeight,
      });

      // Add tooltip showing point index
      marker.bindTooltip(`Point ${index + 1}`, {
        permanent: false,
        direction: 'top',
      });

      // Add mousedown handler for dragging in move mode
      if (state.coastlineSubMode === 'move' && coastline.isClosed) {
        marker.on('mousedown', (e) => {
          this.handleMouseDownOnPoint(point.id, e as L.LeafletMouseEvent);
        });
        // Add class for cursor styling (applied after marker is added to map)
        marker.on('add', () => {
          const el = marker.getElement();
          if (el) el.classList.add('draggable-point');
        });
      }

      this.pointsLayer.addLayer(marker);
    });

    // Draw replacement preview (the segment being replaced shown in orange)
    if (pendingEdit?.startAnchorId && pendingEdit?.endAnchorId && pendingEdit?.replacedPointIds) {
      this.renderReplacementPreview(pendingEdit);
    }

    // Draw pending edit points and lines
    if (pendingEdit && pendingEdit.points.length > 0) {
      // Build the full pending path including anchors
      const pendingPath: L.LatLngExpression[] = [];

      // Add start anchor
      if (pendingEdit.startAnchorId) {
        const startAnchor = coastline.points.find(p => p.id === pendingEdit.startAnchorId);
        if (startAnchor) {
          pendingPath.push([startAnchor.y, startAnchor.x]);
        }
      }

      // Add pending points
      pendingEdit.points.forEach(p => {
        pendingPath.push([p.y, p.x]);
      });

      // Add end anchor
      if (pendingEdit.endAnchorId) {
        const endAnchor = coastline.points.find(p => p.id === pendingEdit.endAnchorId);
        if (endAnchor) {
          pendingPath.push([endAnchor.y, endAnchor.x]);
        }
      }

      if (pendingPath.length >= 2) {
        const pendingLine = L.polyline(pendingPath, {
          color: '#0066ff', // Blue for new segment
          weight: STYLES.coastline.pending.weight + 1,
          dashArray: '8, 4',
        });
        this.pendingLayer.addLayer(pendingLine);
      }

      // Draw pending points
      pendingEdit.points.forEach((point) => {
        const marker = L.circleMarker([point.y, point.x], {
          radius: STYLES.point.radius + 1,
          fillColor: '#0066ff',
          fillOpacity: STYLES.point.fillOpacity,
          color: STYLES.point.color,
          weight: STYLES.point.weight,
        });
        this.pendingLayer.addLayer(marker);
      });
    } else if (pendingEdit?.startAnchorId && !pendingEdit?.endAnchorId) {
      // Only start anchor selected, no pending points yet - show hint line to cursor would be nice
      // For now, just highlight that we're waiting for more input
    }
  }

  private renderReplacementPreview(pendingEdit: PendingEdit): void {
    const state = this.appState.getState();
    const points = state.coastline.points;

    if (!pendingEdit.replacedPointIds || pendingEdit.replacedPointIds.length === 0) return;

    // Build path of points being replaced
    const startAnchor = points.find(p => p.id === pendingEdit.startAnchorId);
    const endAnchor = points.find(p => p.id === pendingEdit.endAnchorId);

    if (!startAnchor || !endAnchor) return;

    const replacedPath: L.LatLngExpression[] = [[startAnchor.y, startAnchor.x]];

    // Add replaced points in order
    const startIdx = points.findIndex(p => p.id === pendingEdit.startAnchorId);
    const endIdx = points.findIndex(p => p.id === pendingEdit.endAnchorId);
    const n = points.length;

    // Determine direction based on which path is shorter
    const pathCW: Point[] = [];
    let i = (startIdx + 1) % n;
    while (i !== endIdx) {
      pathCW.push(points[i]);
      i = (i + 1) % n;
    }

    const pathCCW: Point[] = [];
    i = (startIdx - 1 + n) % n;
    while (i !== endIdx) {
      pathCCW.push(points[i]);
      i = (i - 1 + n) % n;
    }

    const replacedPoints = pathCW.length <= pathCCW.length ? pathCW : pathCCW;
    replacedPoints.forEach(p => {
      replacedPath.push([p.y, p.x]);
    });

    replacedPath.push([endAnchor.y, endAnchor.x]);

    // Draw the segment being replaced in orange/red
    const replaceLine = L.polyline(replacedPath, {
      color: '#ff6600',
      weight: STYLES.coastline.committed.weight + 2,
      opacity: 0.7,
    });
    this.replacePreviewLayer.addLayer(replaceLine);
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
