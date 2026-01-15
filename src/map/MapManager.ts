import L from 'leaflet';
import {
  MAP_WIDTH,
  MAP_HEIGHT,
  MAP_IMAGE_PATH,
  MIN_ZOOM,
  MAX_ZOOM,
  ZOOM_SNAP,
} from '../config/constants';

export class MapManager {
  private map: L.Map;
  private imageOverlay: L.ImageOverlay;
  private bounds: L.LatLngBoundsExpression;

  constructor(containerId: string) {
    // Define bounds based on image dimensions
    // Using [y, x] format for Leaflet (lat, lng)
    // Note: In CRS.Simple, we use [y, x] where y increases upward
    this.bounds = [
      [0, 0],                      // Southwest corner (bottom-left)
      [MAP_HEIGHT, MAP_WIDTH],     // Northeast corner (top-right)
    ];

    // Initialize map with simple CRS (no geographic projection)
    this.map = L.map(containerId, {
      crs: L.CRS.Simple,
      minZoom: MIN_ZOOM,
      maxZoom: MAX_ZOOM,
      zoomSnap: ZOOM_SNAP,
      maxBounds: this.bounds,
      maxBoundsViscosity: 1.0,
    });

    // Add the image overlay
    this.imageOverlay = L.imageOverlay(MAP_IMAGE_PATH, this.bounds).addTo(this.map);

    // Fit the map view to the image
    this.map.fitBounds(this.bounds);
  }

  getMap(): L.Map {
    return this.map;
  }

  getImageOverlay(): L.ImageOverlay {
    return this.imageOverlay;
  }

  setBackgroundVisible(visible: boolean): void {
    if (visible) {
      this.imageOverlay.setOpacity(1);
    } else {
      this.imageOverlay.setOpacity(0);
    }
  }

  isBackgroundVisible(): boolean {
    return this.imageOverlay.options.opacity === 1;
  }

  // Convert screen coordinates to map coordinates
  screenToMap(point: L.Point): L.LatLng {
    return this.map.containerPointToLatLng(point);
  }

  // Convert map coordinates to screen coordinates
  mapToScreen(latlng: L.LatLng): L.Point {
    return this.map.latLngToContainerPoint(latlng);
  }
}
