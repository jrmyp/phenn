import {
  AppStateData,
  StateListener,
  StateChangeEvent,
  ActionType,
  Point,
  CoastlineSubMode,
  AnnotationMode,
  PendingEdit,
  Tower,
  TowerType,
  Settlement,
  Road,
} from '../types';
import { TOWER_SIZE, SETTLEMENT_SIZE } from '../config/constants';

function generateId(): string {
  return Math.random().toString(36).substring(2, 11);
}

function createInitialState(): AppStateData {
  return {
    currentMode: 'coastline',
    coastlineSubMode: 'add',
    coastline: {
      points: [],
      isClosed: false,
    },
    towers: {
      towers: [],
    },
    settlements: {
      settlements: [],
    },
    roads: {
      roads: [],
    },
    pendingEdit: null,
    isBackgroundVisible: true,
    selectedTowerType: 'aquagen',
    selectedTowerPower: TOWER_SIZE.defaultPower,
    selectedSettlementSize: SETTLEMENT_SIZE.defaultSize,
    selectedRoadSafe: true,
    pendingRoadStartId: null,
    selectedTowerId: null,
    selectedSettlementId: null,
  };
}

export class AppState {
  private state: AppStateData;
  private listeners: Set<StateListener> = new Set();
  private history: AppStateData[] = [];
  private maxHistory = 50;

  constructor(initialState?: AppStateData) {
    this.state = initialState ?? createInitialState();
  }

  getState(): Readonly<AppStateData> {
    return this.state;
  }

  subscribe(listener: StateListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  dispatch<T>(type: ActionType, payload: T): void {
    const previousState = this.deepClone(this.state);

    // Save to history (except for undo itself)
    if (type !== 'UNDO') {
      this.history.push(previousState);
      if (this.history.length > this.maxHistory) {
        this.history.shift();
      }
    }

    // Apply the update based on action type
    this.state = this.reduce(this.state, type, payload);

    // Notify all listeners
    const event: StateChangeEvent<T> = {
      type,
      payload,
      previousState,
      newState: this.state,
    };

    this.listeners.forEach((listener) => listener(event));
  }

  undo(): boolean {
    if (this.history.length === 0) return false;
    const previousState = this.history.pop()!;
    const currentState = this.state;
    this.state = previousState;

    const event: StateChangeEvent<null> = {
      type: 'UNDO',
      payload: null,
      previousState: currentState,
      newState: this.state,
    };

    this.listeners.forEach((listener) => listener(event));
    return true;
  }

  private reduce<T>(state: AppStateData, type: ActionType, payload: T): AppStateData {
    switch (type) {
      case 'SET_MODE':
        return { ...state, currentMode: payload as AnnotationMode };

      case 'SET_COASTLINE_SUBMODE':
        return { ...state, coastlineSubMode: payload as CoastlineSubMode };

      case 'SET_BACKGROUND_VISIBLE':
        return { ...state, isBackgroundVisible: payload as boolean };

      case 'ADD_POINT': {
        const { x, y } = payload as { x: number; y: number };
        const newPoint: Point = { id: generateId(), x, y };

        // If coastline is closed, we're editing - need to use pending edit
        if (state.coastline.isClosed) {
          // Start a new pending edit if not already in one
          const pendingEdit: PendingEdit = state.pendingEdit ?? {
            type: 'replace',
            points: [],
          };
          return {
            ...state,
            pendingEdit: {
              ...pendingEdit,
              points: [...pendingEdit.points, newPoint],
            },
          };
        }

        // Initial drawing: add point directly to coastline
        return {
          ...state,
          coastline: {
            ...state.coastline,
            points: [...state.coastline.points, newPoint],
          },
        };
      }

      case 'CLOSE_COASTLINE':
        return {
          ...state,
          coastline: {
            ...state.coastline,
            isClosed: true,
          },
        };

      case 'SET_PENDING_EDIT':
        return { ...state, pendingEdit: payload as PendingEdit | null };

      case 'COMMIT_EDIT': {
        if (!state.pendingEdit) return state;

        // For initial drawing, just close the coastline
        if (state.pendingEdit.type === 'add') {
          return {
            ...state,
            coastline: {
              points: [...state.coastline.points, ...state.pendingEdit.points],
              isClosed: true,
            },
            pendingEdit: null,
          };
        }

        // For replacement edits, apply the replacement logic
        if (state.pendingEdit.type === 'replace' &&
            state.pendingEdit.startAnchorId &&
            state.pendingEdit.endAnchorId) {
          const points = state.coastline.points;
          const n = points.length;
          const startIdx = points.findIndex(p => p.id === state.pendingEdit!.startAnchorId);
          const endIdx = points.findIndex(p => p.id === state.pendingEdit!.endAnchorId);

          if (startIdx === -1 || endIdx === -1) {
            return { ...state, pendingEdit: null };
          }

          // Determine which direction we're replacing (shorter path)
          const pathCW: number[] = [];
          let i = (startIdx + 1) % n;
          while (i !== endIdx) {
            pathCW.push(i);
            i = (i + 1) % n;
          }

          const pathCCW: number[] = [];
          i = (startIdx - 1 + n) % n;
          while (i !== endIdx) {
            pathCCW.push(i);
            i = (i - 1 + n) % n;
          }

          const useCW = pathCW.length <= pathCCW.length;

          // Build new points array
          const newPoints: Point[] = [];
          const newPendingPoints = state.pendingEdit.points;

          if (useCW) {
            // Going clockwise: keep points before start, insert new points after start,
            // then skip to end and continue
            for (let j = 0; j <= startIdx; j++) {
              newPoints.push(points[j]);
            }
            // Insert new points
            newPoints.push(...newPendingPoints);
            // Continue from end to the end of array
            for (let j = endIdx; j < n; j++) {
              newPoints.push(points[j]);
            }
          } else {
            // Going counter-clockwise: more complex - need to reverse the new points
            // Build: end..start_of_array, then new points (reversed), then start..end_of_array
            for (let j = 0; j <= endIdx; j++) {
              newPoints.push(points[j]);
            }
            // Insert new points in reverse order (since we're going CCW)
            const reversedNew = [...newPendingPoints].reverse();
            newPoints.push(...reversedNew);
            // Continue from start to end of array
            for (let j = startIdx; j < n; j++) {
              newPoints.push(points[j]);
            }
          }

          return {
            ...state,
            coastline: {
              ...state.coastline,
              points: newPoints,
            },
            pendingEdit: null,
          };
        }

        return {
          ...state,
          pendingEdit: null,
        };
      }

      case 'CANCEL_EDIT':
        return { ...state, pendingEdit: null };

      case 'REMOVE_POINT': {
        const pointId = payload as string;
        return {
          ...state,
          coastline: {
            ...state.coastline,
            points: state.coastline.points.filter((p) => p.id !== pointId),
          },
        };
      }

      case 'MOVE_POINT': {
        const { id, x, y } = payload as { id: string; x: number; y: number };
        return {
          ...state,
          coastline: {
            ...state.coastline,
            points: state.coastline.points.map((p) =>
              p.id === id ? { ...p, x, y } : p
            ),
          },
        };
      }

      case 'LOAD_STATE':
        return payload as AppStateData;

      case 'UNDO':
        // Handled separately in undo()
        return state;

      // Tower actions
      case 'ADD_TOWER': {
        const { x, y } = payload as { x: number; y: number };
        const newTower: Tower = {
          id: generateId(),
          x,
          y,
          type: state.selectedTowerType,
          power: state.selectedTowerPower,
        };
        return {
          ...state,
          towers: {
            towers: [...state.towers.towers, newTower],
          },
        };
      }

      case 'REMOVE_TOWER': {
        const towerId = payload as string;
        return {
          ...state,
          towers: {
            towers: state.towers.towers.filter((t) => t.id !== towerId),
          },
        };
      }

      case 'UPDATE_TOWER': {
        const updatedTower = payload as Tower;
        return {
          ...state,
          towers: {
            towers: state.towers.towers.map((t) =>
              t.id === updatedTower.id ? updatedTower : t
            ),
          },
        };
      }

      case 'SET_TOWER_TYPE':
        return { ...state, selectedTowerType: payload as TowerType };

      case 'SET_TOWER_POWER':
        return { ...state, selectedTowerPower: payload as number };

      // Settlement actions
      case 'ADD_SETTLEMENT': {
        const { x, y } = payload as { x: number; y: number };
        const newSettlement: Settlement = {
          id: generateId(),
          x,
          y,
          name: '',
          size: state.selectedSettlementSize,
        };
        return {
          ...state,
          settlements: {
            settlements: [...state.settlements.settlements, newSettlement],
          },
        };
      }

      case 'REMOVE_SETTLEMENT': {
        const settlementId = payload as string;
        return {
          ...state,
          settlements: {
            settlements: state.settlements.settlements.filter((s) => s.id !== settlementId),
          },
        };
      }

      case 'UPDATE_SETTLEMENT': {
        const updatedSettlement = payload as Settlement;
        return {
          ...state,
          settlements: {
            settlements: state.settlements.settlements.map((s) =>
              s.id === updatedSettlement.id ? updatedSettlement : s
            ),
          },
        };
      }

      case 'SET_SETTLEMENT_SIZE':
        return { ...state, selectedSettlementSize: payload as number };

      // Road actions
      case 'ADD_ROAD': {
        const { startSettlementId, endSettlementId } = payload as { startSettlementId: string; endSettlementId: string };
        const newRoad: Road = {
          id: generateId(),
          startSettlementId,
          endSettlementId,
          safe: state.selectedRoadSafe,
        };
        return {
          ...state,
          roads: {
            roads: [...state.roads.roads, newRoad],
          },
          pendingRoadStartId: null,
        };
      }

      case 'REMOVE_ROAD': {
        const roadId = payload as string;
        return {
          ...state,
          roads: {
            roads: state.roads.roads.filter((r) => r.id !== roadId),
          },
        };
      }

      case 'UPDATE_ROAD': {
        const updatedRoad = payload as Road;
        return {
          ...state,
          roads: {
            roads: state.roads.roads.map((r) =>
              r.id === updatedRoad.id ? updatedRoad : r
            ),
          },
        };
      }

      case 'SET_ROAD_SAFE':
        return { ...state, selectedRoadSafe: payload as boolean };

      case 'SET_PENDING_ROAD_START':
        return { ...state, pendingRoadStartId: payload as string | null };

      case 'SELECT_TOWER':
        return { ...state, selectedTowerId: payload as string | null };

      case 'SELECT_SETTLEMENT':
        return { ...state, selectedSettlementId: payload as string | null };

      default:
        return state;
    }
  }

  private deepClone<T>(obj: T): T {
    return JSON.parse(JSON.stringify(obj));
  }
}

// Create a singleton instance
export const appState = new AppState();
