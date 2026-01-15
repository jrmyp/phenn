// Map dimensions (original image size)
export const MAP_WIDTH = 3811;
export const MAP_HEIGHT = 2710;

// Path to the map image asset
export const MAP_IMAGE_PATH = '/src/assets/map_v1.jpeg';

// Zoom constraints
export const MIN_ZOOM = -2;
export const MAX_ZOOM = 2;
export const ZOOM_SNAP = 0.25;

// Visual styles for annotations
export const STYLES = {
  coastline: {
    committed: { color: '#000000', weight: 2 },
    pending: { color: '#0066ff', weight: 2 },
    toBeReplaced: { color: '#ff6600', weight: 2 },
    invalid: { color: '#ff0000', weight: 2 },
  },
  point: {
    radius: 6,
    fillColor: '#ffffff',
    fillOpacity: 1,
    color: '#000000',
    weight: 2,
  },
  pointHover: {
    radius: 8,
    fillColor: '#ffff00',
  },
};

// Snapping distance (in pixels) for closing the coastline loop
export const CLOSE_LOOP_THRESHOLD = 20;

// Tower configuration
export const TOWER_COLORS: Record<string, string> = {
  aquagen: '#0088ff',     // blue
  aerogen: '#00cccc',     // cyan
  petrogen: '#ffcc00',    // yellow
  biogen: '#00aa00',      // green
  thermogen: '#ff3300',   // red
  photogen: '#000000',    // black
  keraunogen: '#ff8800',  // orange
  kinegen: '#ff88cc',     // pink
  piezogen: '#888888',    // grey
};

// Tower size scaling: power 100-500 maps to these dimensions
export const TOWER_SIZE = {
  minPower: 100,
  maxPower: 500,
  defaultPower: 200,
  // Base dimensions at power 100
  baseWidth: 12,
  baseHeight: 24,
  // Max dimensions at power 500
  maxWidth: 24,
  maxHeight: 48,
};

// Settlement configuration
export const SETTLEMENT_SIZE = {
  minSize: 0,
  maxSize: 5,
  defaultSize: 1,
  // Radius for each size level (index = size)
  radii: [6, 8, 11, 15, 20, 26],
  // Colors
  fillColor: '#ffffff',
  strokeColor: '#000000',
  strokeWidth: 2,
  // Label offset below circle
  labelOffset: 8,
};

// Road configuration
export const ROAD_STYLE = {
  color: '#8B4513',  // Brown
  weight: 3,
  // Dash pattern for unsafe roads
  dashArray: '8, 8',
};

// Map fill colors when background is hidden
export const MAP_FILL = {
  ocean: '#cce5ff',     // Pale blue
  continent: '#fff8dc', // Cream
};
