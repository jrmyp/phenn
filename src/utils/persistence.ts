import { CoastlineData, TowerData, SettlementData, RoadData } from '../types';

const DATA_PATH = '/src/data/coastline.json';

export interface SavedData {
  version: 1;
  coastline: CoastlineData;
  towers: TowerData;
  settlements: SettlementData;
  roads: RoadData;
  savedAt: string;
}

export function createSaveData(
  coastline: CoastlineData,
  towers: TowerData,
  settlements: SettlementData,
  roads: RoadData
): SavedData {
  return {
    version: 1,
    coastline,
    towers,
    settlements,
    roads,
    savedAt: new Date().toISOString(),
  };
}

export function downloadJson(data: SavedData, filename = 'coastline.json'): void {
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();

  URL.revokeObjectURL(url);
}

export async function loadFromDataFolder(): Promise<SavedData | null> {
  try {
    const response = await fetch(DATA_PATH);
    if (!response.ok) {
      console.log('No saved data found at', DATA_PATH);
      return null;
    }
    const data: SavedData = await response.json();
    console.log('Loaded data from', DATA_PATH, 'saved at', data.savedAt);
    return data;
  } catch (error) {
    console.log('Could not load data:', error);
    return null;
  }
}
