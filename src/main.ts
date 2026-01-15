import { MapManager } from './map/MapManager';
import { appState } from './state/AppState';
import { CoastlineMode } from './annotations/CoastlineMode';
import { TowerMode } from './annotations/TowerMode';
import { SettlementMode } from './annotations/SettlementMode';
import { RoadMode } from './annotations/RoadMode';
import { loadFromDataFolder, createSaveData, downloadJson } from './utils/persistence';
import { TowerType } from './types';
import { TOWER_SIZE, SETTLEMENT_SIZE } from './config/constants';

// Initialize the application
async function init(): Promise<void> {
  // Try to load saved data
  const savedData = await loadFromDataFolder();
  if (savedData) {
    appState.dispatch('LOAD_STATE', {
      ...appState.getState(),
      coastline: savedData.coastline,
      towers: savedData.towers || { towers: [] },
      settlements: savedData.settlements || { settlements: [] },
      roads: savedData.roads || { roads: [] },
    });
  }

  // Initialize the map
  const mapManager = new MapManager('map-container');
  const map = mapManager.getMap();

  // Initialize annotation modes (order matters for layer stacking)
  const coastlineMode = new CoastlineMode(map, appState);
  const towerMode = new TowerMode(map, appState);
  const roadMode = new RoadMode(map, appState);  // Roads below settlements
  const settlementMode = new SettlementMode(map, appState);

  // Start with coastline mode active
  coastlineMode.activate();

  // Set up mode switching
  const modeButtons = document.querySelectorAll('.mode-btn');
  modeButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const mode = (btn as HTMLElement).dataset.mode;
      if (!mode) return;

      // Update active button
      modeButtons.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');

      // Deactivate all modes, then activate the selected one
      coastlineMode.deactivate();
      towerMode.deactivate();
      settlementMode.deactivate();
      roadMode.deactivate();
      settlementMode.setClickHandler(null);

      if (mode === 'coastline') {
        appState.dispatch('SET_MODE', 'coastline');
        coastlineMode.activate();
        showModeOptions('coastline');
      } else if (mode === 'tower') {
        appState.dispatch('SET_MODE', 'tower-position');
        towerMode.activate();
        showModeOptions('tower');
      } else if (mode === 'settlement') {
        appState.dispatch('SET_MODE', 'settlement-position');
        settlementMode.activate();
        showModeOptions('settlement');
      } else if (mode === 'road') {
        appState.dispatch('SET_MODE', 'road-position');
        roadMode.activate();
        settlementMode.setClickHandler((s) => roadMode.handleSettlementClick(s));
        showModeOptions('road');
      }
    });
  });

  // Set up background toggle button
  const toggleBtn = document.getElementById('toggle-background') as HTMLButtonElement;
  toggleBtn.addEventListener('click', () => {
    const isVisible = mapManager.isBackgroundVisible();
    mapManager.setBackgroundVisible(!isVisible);
    toggleBtn.textContent = isVisible ? 'Show Background' : 'Hide Background';
    appState.dispatch('SET_BACKGROUND_VISIBLE', !isVisible);
  });

  // Set up save button
  const saveBtn = document.getElementById('save-btn') as HTMLButtonElement;
  saveBtn.addEventListener('click', () => {
    const state = appState.getState();
    const saveData = createSaveData(state.coastline, state.towers, state.settlements, state.roads);
    downloadJson(saveData);
    updateStatus('Data saved! Move the downloaded file to src/data/coastline.json');
  });

  // Set up undo button
  const undoBtn = document.getElementById('undo-btn') as HTMLButtonElement;
  undoBtn.addEventListener('click', () => {
    appState.undo();
  });

  // Set up keyboard shortcut for undo
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
      e.preventDefault();
      appState.undo();
    }
  });

  // Initialize mode options UI
  showModeOptions('coastline');

  // Log that the app is ready
  console.log('Phenn Map Annotation Tool initialized');
  if (savedData) {
    const coastlineCount = savedData.coastline.points.length;
    const towerCount = savedData.towers?.towers?.length || 0;
    const settlementCount = savedData.settlements?.settlements?.length || 0;
    const roadCount = savedData.roads?.roads?.length || 0;
    updateStatus(`Loaded ${coastlineCount} coastline pts, ${towerCount} towers, ${settlementCount} settlements, ${roadCount} roads.`);
  }
}

function showModeOptions(mode: string): void {
  const optionsEl = document.getElementById('mode-options');
  if (!optionsEl) return;

  if (mode === 'coastline') {
    optionsEl.innerHTML = `
      <h2>Coastline Options</h2>
      <p class="mode-hint">Click to add points. Click near first point to close.</p>
    `;
  } else if (mode === 'tower') {
    const state = appState.getState();
    optionsEl.innerHTML = `
      <h2>Tower Options</h2>
      <div class="option-group">
        <label for="tower-type">Type:</label>
        <select id="tower-type">
          <option value="aquagen" ${state.selectedTowerType === 'aquagen' ? 'selected' : ''}>Aquagen</option>
          <option value="aerogen" ${state.selectedTowerType === 'aerogen' ? 'selected' : ''}>Aerogen</option>
          <option value="petrogen" ${state.selectedTowerType === 'petrogen' ? 'selected' : ''}>Petrogen</option>
          <option value="biogen" ${state.selectedTowerType === 'biogen' ? 'selected' : ''}>Biogen</option>
          <option value="thermogen" ${state.selectedTowerType === 'thermogen' ? 'selected' : ''}>Thermogen</option>
          <option value="photogen" ${state.selectedTowerType === 'photogen' ? 'selected' : ''}>Photogen</option>
          <option value="keraunogen" ${state.selectedTowerType === 'keraunogen' ? 'selected' : ''}>Keraunogen</option>
          <option value="kinegen" ${state.selectedTowerType === 'kinegen' ? 'selected' : ''}>Kinegen</option>
          <option value="piezogen" ${state.selectedTowerType === 'piezogen' ? 'selected' : ''}>Piezogen</option>
        </select>
      </div>
      <div class="option-group">
        <label for="tower-power">Power: <span id="power-value">${state.selectedTowerPower}</span></label>
        <input type="range" id="tower-power" min="${TOWER_SIZE.minPower}" max="${TOWER_SIZE.maxPower}" value="${state.selectedTowerPower}" />
      </div>
    `;

    // Wire up tower type selector
    const typeSelect = document.getElementById('tower-type') as HTMLSelectElement;
    typeSelect.addEventListener('change', () => {
      appState.dispatch('SET_TOWER_TYPE', typeSelect.value as TowerType);
    });

    // Wire up tower power slider
    const powerSlider = document.getElementById('tower-power') as HTMLInputElement;
    const powerValue = document.getElementById('power-value') as HTMLSpanElement;
    powerSlider.addEventListener('input', () => {
      const power = parseInt(powerSlider.value, 10);
      powerValue.textContent = power.toString();
      appState.dispatch('SET_TOWER_POWER', power);
    });
  } else if (mode === 'settlement') {
    const state = appState.getState();
    optionsEl.innerHTML = `
      <h2>Settlement Options</h2>
      <div class="option-group">
        <label for="settlement-size">Size: <span id="size-value">${state.selectedSettlementSize}</span></label>
        <input type="range" id="settlement-size" min="${SETTLEMENT_SIZE.minSize}" max="${SETTLEMENT_SIZE.maxSize}" value="${state.selectedSettlementSize}" />
      </div>
      <p class="mode-hint">Alt+click settlement to rename.</p>
    `;

    // Wire up settlement size slider
    const sizeSlider = document.getElementById('settlement-size') as HTMLInputElement;
    const sizeValue = document.getElementById('size-value') as HTMLSpanElement;
    sizeSlider.addEventListener('input', () => {
      const size = parseInt(sizeSlider.value, 10);
      sizeValue.textContent = size.toString();
      appState.dispatch('SET_SETTLEMENT_SIZE', size);
    });
  } else if (mode === 'road') {
    const state = appState.getState();
    optionsEl.innerHTML = `
      <h2>Road Options</h2>
      <div class="option-group">
        <label>
          <input type="checkbox" id="road-safe" ${state.selectedRoadSafe ? 'checked' : ''} />
          Safe road (solid line)
        </label>
      </div>
      <p class="mode-hint">Click two settlements to connect. Alt+click road to toggle safe.</p>
    `;

    // Wire up safe checkbox
    const safeCheckbox = document.getElementById('road-safe') as HTMLInputElement;
    safeCheckbox.addEventListener('change', () => {
      appState.dispatch('SET_ROAD_SAFE', safeCheckbox.checked);
    });
  }
}

function updateStatus(message: string): void {
  const statusEl = document.getElementById('status-text');
  if (statusEl) {
    statusEl.textContent = message;
  }
}

// Wait for DOM to be ready
document.addEventListener('DOMContentLoaded', init);
