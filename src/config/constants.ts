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

// Simulator configuration
export const SIMULATOR_DEFAULTS = {
  backgroundValue: 10,
  distanceDamping: 1.2,
  dampeningStrength: 15.0,
  minDampening: 0.1,
};

// Grid resolution for heatmap sampling (pixels between sample points)
export const HEATMAP_GRID_RESOLUTION = 40;

// Maximum number of tower candidates to consider for field calculation
export const MAX_TOWER_CANDIDATES = 10;

// Heatmap color scale (low to high intensity)
export const HEATMAP_COLORS = [
  '#000033',  // Very dark blue (minimal)
  '#0000ff',  // Blue (low)
  '#00ffff',  // Cyan
  '#00ff00',  // Green
  '#ffff00',  // Yellow
  '#ff8800',  // Orange
  '#ff0000',  // Red (high)
];

// Stability layer color scale (ratio 0 = contested, 1 = stable)
export const STABILITY_COLORS = [
  '#ff0000',  // Red (ratio 0 - very close to a barycenter, contested)
  '#ff8800',  // Orange
  '#ffff00',  // Yellow
  '#88ff88',  // Light green
  '#00ff00',  // Green
  '#00ffff',  // Cyan
  '#0088ff',  // Blue (ratio 1 - all barycenters equidistant, stable)
];

// Tower type to dimension index mapping
export const TOWER_TYPE_INDEX: Record<string, number> = {
  aquagen: 0,
  aerogen: 1,
  petrogen: 2,
  biogen: 3,
  thermogen: 4,
  photogen: 5,
  keraunogen: 6,
  kinegen: 7,
  piezogen: 8,
};

// Dimension index to tower type name (for display)
export const DIMENSION_NAMES = [
  'Aquagen',
  'Aerogen',
  'Petrogen',
  'Biogen',
  'Thermogen',
  'Photogen',
  'Keraunogen',
  'Kinegen',
  'Piezogen',
];
