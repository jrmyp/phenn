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

export interface Settlement {
  id: string;
  x: number;
  y: number;
  name: string;  // Can be empty for size 0
  size: number;  // 0 = hollow circle, 1+ = filled circles of increasing size
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
  | 'road-properties';

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
  // Road placement state
  selectedRoadSafe: boolean;
  pendingRoadStartId: string | null;  // First settlement clicked when creating road
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
  | 'ADD_ROAD'
  | 'REMOVE_ROAD'
  | 'UPDATE_ROAD'
  | 'SET_ROAD_SAFE'
  | 'SET_PENDING_ROAD_START';

export interface StateChangeEvent<T = unknown> {
  type: ActionType;
  payload: T;
  previousState: AppStateData;
  newState: AppStateData;
}

export type StateListener = (event: StateChangeEvent) => void;
