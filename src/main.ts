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

      // Clear selections when switching modes
      appState.dispatch('SELECT_TOWER', null);
      appState.dispatch('SELECT_SETTLEMENT', null);

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

  // Set up commit/cancel buttons
  const commitBtn = document.getElementById('commit-btn') as HTMLButtonElement;
  const cancelBtn = document.getElementById('cancel-btn') as HTMLButtonElement;

  commitBtn.addEventListener('click', () => {
    appState.dispatch('COMMIT_EDIT', null);
    updateStatus('Edit committed.');
  });

  cancelBtn.addEventListener('click', () => {
    appState.dispatch('CANCEL_EDIT', null);
    updateStatus('Edit cancelled.');
  });

  // Track previous selection state for UI updates
  let prevSelectedTowerId: string | null = null;
  let prevSelectedSettlementId: string | null = null;

  // Update commit/cancel button states and refresh UI based on state changes
  appState.subscribe(() => {
    const state = appState.getState();
    const pendingEdit = state.pendingEdit;

    // Enable commit only when we have a complete replacement (both anchors set)
    const canCommit = pendingEdit?.type === 'replace' &&
                      pendingEdit?.startAnchorId &&
                      pendingEdit?.endAnchorId;

    // Enable cancel when we have any pending edit
    const canCancel = pendingEdit !== null;

    commitBtn.disabled = !canCommit;
    cancelBtn.disabled = !canCancel;

    // Refresh coastline options UI when coastline state changes
    if (state.currentMode === 'coastline') {
      const optionsEl = document.getElementById('mode-options');
      const hasEditUI = optionsEl?.querySelector('input[name="coastline-submode"]');
      if (state.coastline.isClosed && !hasEditUI) {
        showModeOptions('coastline');
      }
    }

    // Refresh tower options UI when selection changes
    if (state.currentMode === 'tower-position' && state.selectedTowerId !== prevSelectedTowerId) {
      prevSelectedTowerId = state.selectedTowerId;
      showModeOptions('tower');
    }

    // Refresh settlement options UI when selection changes
    if (state.currentMode === 'settlement-position' && state.selectedSettlementId !== prevSelectedSettlementId) {
      prevSelectedSettlementId = state.selectedSettlementId;
      showModeOptions('settlement');
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
    const state = appState.getState();
    if (state.coastline.isClosed) {
      // Coastline editing mode
      optionsEl.innerHTML = `
        <h2>Edit Coastline</h2>
        <div class="submode-options">
          <label>
            <input type="radio" name="coastline-submode" value="add" ${state.coastlineSubMode === 'add' ? 'checked' : ''} />
            Replace segment
          </label>
          <label>
            <input type="radio" name="coastline-submode" value="remove" ${state.coastlineSubMode === 'remove' ? 'checked' : ''} />
            Remove point
          </label>
          <label>
            <input type="radio" name="coastline-submode" value="move" ${state.coastlineSubMode === 'move' ? 'checked' : ''} />
            Move point
          </label>
        </div>
        <p class="mode-hint" id="coastline-hint">Click a point to start replacing a segment.</p>
      `;

      // Wire up sub-mode radio buttons
      const radios = optionsEl.querySelectorAll('input[name="coastline-submode"]');
      radios.forEach((radio) => {
        radio.addEventListener('change', () => {
          const value = (radio as HTMLInputElement).value as 'add' | 'remove' | 'move';
          appState.dispatch('SET_COASTLINE_SUBMODE', value);
          // Cancel any pending edit when switching modes
          appState.dispatch('CANCEL_EDIT', null);
          updateCoastlineHint(value);
        });
      });
    } else {
      // Initial coastline drawing mode
      optionsEl.innerHTML = `
        <h2>Coastline Options</h2>
        <p class="mode-hint">Click to add points. Click near first point to close.</p>
      `;
    }
  } else if (mode === 'tower') {
    const state = appState.getState();
    const selectedTower = state.selectedTowerId
      ? state.towers.towers.find(t => t.id === state.selectedTowerId)
      : null;

    if (selectedTower) {
      // Editing existing tower
      optionsEl.innerHTML = `
        <h2>Edit Tower</h2>
        <div class="option-group">
          <label for="tower-type">Type:</label>
          <select id="tower-type">
            <option value="aquagen" ${selectedTower.type === 'aquagen' ? 'selected' : ''}>Aquagen</option>
            <option value="aerogen" ${selectedTower.type === 'aerogen' ? 'selected' : ''}>Aerogen</option>
            <option value="petrogen" ${selectedTower.type === 'petrogen' ? 'selected' : ''}>Petrogen</option>
            <option value="biogen" ${selectedTower.type === 'biogen' ? 'selected' : ''}>Biogen</option>
            <option value="thermogen" ${selectedTower.type === 'thermogen' ? 'selected' : ''}>Thermogen</option>
            <option value="photogen" ${selectedTower.type === 'photogen' ? 'selected' : ''}>Photogen</option>
            <option value="keraunogen" ${selectedTower.type === 'keraunogen' ? 'selected' : ''}>Keraunogen</option>
            <option value="kinegen" ${selectedTower.type === 'kinegen' ? 'selected' : ''}>Kinegen</option>
            <option value="piezogen" ${selectedTower.type === 'piezogen' ? 'selected' : ''}>Piezogen</option>
          </select>
        </div>
        <div class="option-group">
          <label for="tower-power">Power: <span id="power-value">${selectedTower.power}</span></label>
          <input type="range" id="tower-power" min="${TOWER_SIZE.minPower}" max="${TOWER_SIZE.maxPower}" value="${selectedTower.power}" />
        </div>
        <div id="action-buttons">
          <button id="apply-tower-btn">Apply</button>
          <button id="deselect-tower-btn">Deselect</button>
        </div>
      `;

      // Store pending edits locally
      let pendingType = selectedTower.type;
      let pendingPower = selectedTower.power;

      const typeSelect = document.getElementById('tower-type') as HTMLSelectElement;
      typeSelect.addEventListener('change', () => {
        pendingType = typeSelect.value as TowerType;
      });

      const powerSlider = document.getElementById('tower-power') as HTMLInputElement;
      const powerValue = document.getElementById('power-value') as HTMLSpanElement;
      powerSlider.addEventListener('input', () => {
        pendingPower = parseInt(powerSlider.value, 10);
        powerValue.textContent = pendingPower.toString();
      });

      const applyBtn = document.getElementById('apply-tower-btn') as HTMLButtonElement;
      applyBtn.addEventListener('click', () => {
        appState.dispatch('UPDATE_TOWER', { ...selectedTower, type: pendingType, power: pendingPower });
        updateStatus('Tower updated.');
      });

      const deselectBtn = document.getElementById('deselect-tower-btn') as HTMLButtonElement;
      deselectBtn.addEventListener('click', () => {
        appState.dispatch('SELECT_TOWER', null);
      });
    } else {
      // Placing new tower
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

      const typeSelect = document.getElementById('tower-type') as HTMLSelectElement;
      typeSelect.addEventListener('change', () => {
        appState.dispatch('SET_TOWER_TYPE', typeSelect.value as TowerType);
      });

      const powerSlider = document.getElementById('tower-power') as HTMLInputElement;
      const powerValue = document.getElementById('power-value') as HTMLSpanElement;
      powerSlider.addEventListener('input', () => {
        const power = parseInt(powerSlider.value, 10);
        powerValue.textContent = power.toString();
        appState.dispatch('SET_TOWER_POWER', power);
      });
    }
  } else if (mode === 'settlement') {
    const state = appState.getState();
    const selectedSettlement = state.selectedSettlementId
      ? state.settlements.settlements.find(s => s.id === state.selectedSettlementId)
      : null;

    if (selectedSettlement) {
      // Editing existing settlement
      optionsEl.innerHTML = `
        <h2>Edit Settlement</h2>
        <div class="option-group">
          <label for="settlement-name">Name:</label>
          <input type="text" id="settlement-name" value="${selectedSettlement.name}" placeholder="Enter name..." />
        </div>
        <div class="option-group">
          <label for="settlement-size">Size: <span id="size-value">${selectedSettlement.size}</span></label>
          <input type="range" id="settlement-size" min="${SETTLEMENT_SIZE.minSize}" max="${SETTLEMENT_SIZE.maxSize}" value="${selectedSettlement.size}" />
        </div>
        <div id="action-buttons">
          <button id="apply-settlement-btn">Apply</button>
          <button id="deselect-settlement-btn">Deselect</button>
        </div>
      `;

      // Store pending edits locally
      let pendingName = selectedSettlement.name;
      let pendingSize = selectedSettlement.size;

      const nameInput = document.getElementById('settlement-name') as HTMLInputElement;
      nameInput.addEventListener('input', () => {
        pendingName = nameInput.value;
      });

      const sizeSlider = document.getElementById('settlement-size') as HTMLInputElement;
      const sizeValue = document.getElementById('size-value') as HTMLSpanElement;
      sizeSlider.addEventListener('input', () => {
        pendingSize = parseInt(sizeSlider.value, 10);
        sizeValue.textContent = pendingSize.toString();
      });

      const applyBtn = document.getElementById('apply-settlement-btn') as HTMLButtonElement;
      applyBtn.addEventListener('click', () => {
        appState.dispatch('UPDATE_SETTLEMENT', { ...selectedSettlement, name: pendingName, size: pendingSize });
        updateStatus('Settlement updated.');
      });

      const deselectBtn = document.getElementById('deselect-settlement-btn') as HTMLButtonElement;
      deselectBtn.addEventListener('click', () => {
        appState.dispatch('SELECT_SETTLEMENT', null);
      });
    } else {
      // Placing new settlement
      optionsEl.innerHTML = `
        <h2>Settlement Options</h2>
        <div class="option-group">
          <label for="settlement-size">Size: <span id="size-value">${state.selectedSettlementSize}</span></label>
          <input type="range" id="settlement-size" min="${SETTLEMENT_SIZE.minSize}" max="${SETTLEMENT_SIZE.maxSize}" value="${state.selectedSettlementSize}" />
        </div>
      `;

      const sizeSlider = document.getElementById('settlement-size') as HTMLInputElement;
      const sizeValue = document.getElementById('size-value') as HTMLSpanElement;
      sizeSlider.addEventListener('input', () => {
        const size = parseInt(sizeSlider.value, 10);
        sizeValue.textContent = size.toString();
        appState.dispatch('SET_SETTLEMENT_SIZE', size);
      });
    }
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

function updateCoastlineHint(subMode: 'add' | 'remove' | 'move'): void {
  const hintEl = document.getElementById('coastline-hint');
  if (!hintEl) return;

  switch (subMode) {
    case 'add':
      hintEl.textContent = 'Click a point to start replacing a segment.';
      break;
    case 'remove':
      hintEl.textContent = 'Click a point to remove it.';
      break;
    case 'move':
      hintEl.textContent = 'Drag a point to move it.';
      break;
  }
}

// Wait for DOM to be ready
document.addEventListener('DOMContentLoaded', init);
