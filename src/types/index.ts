// ============ Core Geometry Types ============

export interface Point {
  x: number;
  y: number;
  id: string;
}

export interface Segment {
  id: string;
  startPointId: string;
  endPointId: string;
}

// ============ Coastline Types ============

export interface CoastlineData {
  points: Point[];
  isClosed: boolean;
}

// ============ Settlement Types ============

export type SettlementStability = 'high' | 'medium' | 'low';
export type SettlementBalance = 'dominated' | 'frontier' | 'tripoint';
export type SettlementTerrain = 'nice' | 'difficult' | 'hostile';
export type SettlementViewMode = 'default' | 'nudge-fine' | 'nudge-finer';

export interface SettlementCanonicalStatus {
  stability?: SettlementStability;
  balance?: SettlementBalance;
  terrain?: SettlementTerrain;
}

export interface Settlement {
  id: string;
  x: number;
  y: number;
  name: string;  // Can be empty for size 0
  size: number;  // 0 = hollow circle, 1+ = filled circles of increasing size
  canonicalStatus?: SettlementCanonicalStatus;
}

export interface SettlementData {
  settlements: Settlement[];
}

// ============ Road Types ============

export interface Road {
  id: string;
  startSettlementId: string;
  endSettlementId: string;
  safe: boolean;  // true = solid line, false = dotted line
}

export interface RoadData {
  roads: Road[];
}

// ============ Tower Types ============

export type TowerType = 'aquagen' | 'aerogen' | 'petrogen' | 'biogen' | 'thermogen' | 'photogen' | 'keraunogen' | 'kinegen' | 'piezogen';

export interface Tower {
  id: string;
  x: number;
  y: number;
  type: TowerType;
  power: number; // 100-500, default 200
}

export interface TowerData {
  towers: Tower[];
}

// ============ Harmonic Simulator Types ============

export interface HarmonicField {
  dimensions: number[]; // 9 values, one per tower type
}

export interface TowerContribution {
  tower: Tower;
  distance: number;
  contribution: number;           // Raw calculated field contribution
  dampening?: number;             // Dampening factor (1 = none, 0.1 = heavy)
  dampenedContribution?: number;  // contribution * dampening
}

export interface ProjectionInfo {
  x: number;
  y: number;
  towerA: Tower;
  towerB: Tower;
  distance: number;  // Distance from the point to this projection
}

export interface SimulatorHyperparameters {
  backgroundValue: number;       // Default: 10
  distanceDamping: number;       // Power-law exponent, default: 1.5
  dampeningStrength: number;     // Dampening multiplier, default: 0.6
  minDampening: number;          // Floor for dampening, default: 0.1
  stabilityGaussianVariance: number;  // Variance for Gaussian term in stability, default: 5
}

export interface SimulatorClickedPoint {
  x: number;
  y: number;
  field: HarmonicField;
  contributions: TowerContribution[];  // Towers that contributed to this field
  projections?: ProjectionInfo[];      // All line projections for stability display
  closestProjection?: ProjectionInfo;  // Projection nearest to clicked point
  secondClosestProjection?: ProjectionInfo; // Second nearest projection
  stabilityRatio?: number;             // S = max(R, G)
  stabilityR?: number;                 // R = closest_distance / second_closest_distance
  stabilityG?: number;                 // G = gaussian of second closest distance
}

// Refinement point for finer mesh resolution
export interface RefinementPoint {
  id: string;
  x: number;
  y: number;
  level: 1 | 2;  // 1 = fine (10px, 150px radius), 2 = finer (3px, 50px radius)
}

// Special layer types beyond the 9 tower type dimensions
export type SimulatorLayerType =
  | number           // 0-8 for individual tower type dimensions
  | 'total'          // Sum of all dimensions
  | 'low-total'      // Sum of all dimensions, only showing tiles in 0-500 range
  | 'dominant'       // Color by dominant dimension (strict winner)
  | 'balance'        // Dominant dimension, but frontier areas shown differently
  | 'contributor-count'  // Number of contributing towers (1-10 scale)
  | 'stability'      // Ratio of distance to closest/furthest barycenter
  | null;            // No heatmap

export interface PendingEdit {
  type: 'add' | 'replace';
  points: Point[];              // Points being added
  startAnchorId?: string;       // When replacing: existing point to start from
  endAnchorId?: string;         // When replacing: existing point to end at
  replacedPointIds?: string[];  // IDs of points being replaced
}

// ============ Application State Types ============

export type AnnotationMode =
  | 'coastline'
  | 'tower-position'
  | 'tower-properties'
  | 'settlement-position'
  | 'settlement-properties'
  | 'road-position'
  | 'road-properties'
  | 'simulator';

export type CoastlineSubMode = 'add' | 'remove' | 'move';

export interface AppStateData {
  currentMode: AnnotationMode;
  coastlineSubMode: CoastlineSubMode;
  coastline: CoastlineData;
  towers: TowerData;
  settlements: SettlementData;
  roads: RoadData;
  pendingEdit: PendingEdit | null;
  isBackgroundVisible: boolean;
  // Tower placement state
  selectedTowerType: TowerType;
  selectedTowerPower: number;
  // Settlement placement state
  selectedSettlementSize: number;
  settlementViewMode: SettlementViewMode;
  // Road placement state
  selectedRoadSafe: boolean;
  pendingRoadStartId: string | null;  // First settlement clicked when creating road
  // Selection state for editing
  selectedTowerId: string | null;
  selectedSettlementId: string | null;
  // Simulator state
  simulatorHyperparameters: SimulatorHyperparameters;
  simulatorActiveLayer: SimulatorLayerType;  // Layer to display in heatmap
  simulatorClickedPoint: SimulatorClickedPoint | null;
  simulatorRefinementPoints: RefinementPoint[];  // Points with finer mesh resolution
}

// ============ Event Types ============

export type ActionType =
  | 'SET_MODE'
  | 'SET_COASTLINE_SUBMODE'
  | 'ADD_POINT'
  | 'REMOVE_POINT'
  | 'MOVE_POINT'
  | 'SET_PENDING_EDIT'
  | 'COMMIT_EDIT'
  | 'CANCEL_EDIT'
  | 'CLOSE_COASTLINE'
  | 'SET_BACKGROUND_VISIBLE'
  | 'LOAD_STATE'
  | 'UNDO'
  | 'ADD_TOWER'
  | 'REMOVE_TOWER'
  | 'UPDATE_TOWER'
  | 'SET_TOWER_TYPE'
  | 'SET_TOWER_POWER'
  | 'ADD_SETTLEMENT'
  | 'REMOVE_SETTLEMENT'
  | 'UPDATE_SETTLEMENT'
  | 'SET_SETTLEMENT_SIZE'
  | 'SET_SETTLEMENT_VIEW_MODE'
  | 'ADD_ROAD'
  | 'REMOVE_ROAD'
  | 'UPDATE_ROAD'
  | 'SET_ROAD_SAFE'
  | 'SET_PENDING_ROAD_START'
  | 'SELECT_TOWER'
  | 'SELECT_SETTLEMENT'
  | 'SET_SIMULATOR_HYPERPARAMETERS'
  | 'SET_SIMULATOR_LAYER'
  | 'SET_SIMULATOR_CLICKED'
  | 'ADD_REFINEMENT_POINT'
  | 'REMOVE_REFINEMENT_POINT'
  | 'UPDATE_REFINEMENT_POINT';

export interface StateChangeEvent<T = unknown> {
  type: ActionType;
  payload: T;
  previousState: AppStateData;
  newState: AppStateData;
}

export type StateListener = (event: StateChangeEvent) => void;
