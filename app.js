/**
 * Raw Mix Design Application
 * =========================
 * Calculates cement raw mix proportions based on target parameters.
 */

// ===== Default Material Composition Data =====
const DEFAULT_MATERIALS = ['Clinker', 'Gypsum', 'Batu Kapur', 'Trass'];
const DEFAULT_PROPERTIES = ['LOI', 'SO3', 'BTL', 'H2O'];

const DEFAULT_DATA = {
  Clinker:     { LOI: 0.24,  SO3: 0.30,  BTL: 0.25,  H2O: 0.10 },
  Gypsum:      { LOI: 20.58, SO3: 42.68, BTL: 4.27,  H2O: 15.00 },
  'Batu Kapur':{ LOI: 40.60, SO3: 0.30,  BTL: 0.83,  H2O: 9.00 },
  Trass:       { LOI: 10.60, SO3: 0.07,  BTL: 66.30, H2O: 29.00 },
  CKD:         { LOI: 37.08, SO3: 0.03,  BTL: 12.10, H2O: 0.20 },
  'Fly Ash':   { LOI: 0.38,  SO3: 0.58,  BTL: 64.00, H2O: 0.40 },
};

// ===== App State =====
let materialData = JSON.parse(JSON.stringify(DEFAULT_DATA));
let materials = [...DEFAULT_MATERIALS, 'CKD', 'Fly Ash']; // CKD & FA added as default custom materials
let lastResult = null; // stores last solver result

// ===== Product Type & Feeder Mode =====
function getProductType() {
  const el = document.getElementById('productType');
  return el ? el.value : 'PCC';
}

function getFeederMode() {
  const el = document.getElementById('feederMode');
  return el ? el.value : 'normal';
}

function calcIndexClinker(LOI, SO3, BTL) {
  const type = getProductType();
  if (type === 'OPC') {
    return 100 - (BTL + (100 / 44 * LOI) + (0.8006 * SO3));
  }
  // PCC (default)
  return 100 - (BTL + (100 / 44 * LOI) + (2.15 * SO3));
}

// ===== DOM Ready =====
document.addEventListener('DOMContentLoaded', () => {
  loadData();
  renderCompositionTable();
  setupTargetListeners();
  setupLockControls();
  setupActualSection();
  setupMaterialControls();
  setupSidebar();
  setupSimulation();
});

// ===== SIDEBAR NAVIGATION =====
function setupSidebar() {
  const items = document.querySelectorAll('.sidebar-item');
  const pages = document.querySelectorAll('.page');

  items.forEach(item => {
    item.addEventListener('click', () => {
      const pageId = item.dataset.page;

      // Update sidebar active
      items.forEach(i => i.classList.remove('active'));
      item.classList.add('active');

      // Switch page
      pages.forEach(p => p.classList.remove('active'));
      document.getElementById(pageId).classList.add('active');

      // Close mobile sidebar
      document.getElementById('sidebar').classList.remove('open');

      // If switching to simulation, re-render the table
      if (pageId === 'pageSimulation') renderSimTable();
      if (pageId === 'pageSimulationWet') renderSimulationWetTable();
    });
  });

  const productToggle = document.getElementById('productType');
  if (productToggle) {
    productToggle.addEventListener('change', () => {
      if (lastResult) calculateProportions();
    });
  }

  const feederToggle = document.getElementById('feederMode');
  if (feederToggle) {
    feederToggle.addEventListener('change', () => {
      // Re-render actual UI when mode changes
      renderActualTable();
      if (lastResult) {
        calculateProportions();
      }
    });
  }

  // Mobile toggle
  const toggle = document.getElementById('sidebarToggle');
  if (toggle) {
    toggle.addEventListener('click', () => {
      document.getElementById('sidebar').classList.toggle('open');
    });
  }
}

// ===== SIMULATION PAGE =====
function setupSimulation() {
  renderSimTable();
  renderSimulationWetTable();
  document.getElementById('btnSimCalculate').addEventListener('click', runSimulation);
  document.getElementById('btnSimWetCalculate').addEventListener('click', runSimulationWet);
}

function renderSimTable() {
  const headRow = document.getElementById('simTableHead');
  const dataRow = document.getElementById('simTableRow');

  // Preserve existing values to avoid reset on tab switch
  const existingValues = {};
  document.querySelectorAll('.sim-input').forEach(input => {
    existingValues[input.dataset.material] = input.value;
  });

  // Build headers and inputs
  headRow.innerHTML = '';
  dataRow.innerHTML = '';

  materials.forEach(m => {
    const isClinic = (m === 'Clinker');
    const val = existingValues[m] || '0';

    headRow.innerHTML += `<th>${m}</th>`;

    if (isClinic) {
      dataRow.innerHTML += `<td><input type="number" class="cell-input sim-input" id="simClinker" data-material="${m}" value="${val}" readonly title="Auto: 100% - total lainnya" style="opacity:0.6;cursor:not-allowed;"></td>`;
    } else {
      dataRow.innerHTML += `<td><input type="number" step="0.01" class="cell-input sim-input" data-material="${m}" value="${val}" placeholder="0"></td>`;
    }
  });

  // Attach live update for Clinker
  dataRow.querySelectorAll('.sim-input:not([readonly])').forEach(input => {
    input.addEventListener('input', updateSimClinker);
  });

  updateSimClinker();
}

// ===== LOCAL STORAGE =====
function saveData() {
  localStorage.setItem('rmd_materials', JSON.stringify(materials));
  localStorage.setItem('rmd_materialData', JSON.stringify(materialData));
}

function loadData() {
  const savedMaterials = localStorage.getItem('rmd_materials');
  const savedData = localStorage.getItem('rmd_materialData');
  
  if (savedMaterials && savedData) {
    try {
      materials = JSON.parse(savedMaterials);
      materialData = JSON.parse(savedData);
    } catch (e) {
      console.error('Error loading data', e);
    }
  }
}

function updateSimClinker() {
  let total = 0;
  document.querySelectorAll('.sim-input:not([readonly])').forEach(input => {
    total += parseFloat(input.value) || 0;
  });
  const clinkerInput = document.getElementById('simClinker');
  if (clinkerInput) {
    clinkerInput.value = (100 - total).toFixed(2);
  }
}

function runSimulation() {
  const dryProp = {};
  document.querySelectorAll('.sim-input').forEach(input => {
    dryProp[input.dataset.material] = parseFloat(input.value) || 0;
  });

  // Check total
  let total = 0;
  Object.values(dryProp).forEach(v => total += v);

  // Calculate LOI, BTL, SO3
  let LOI = 0, BTL = 0, SO3 = 0;
  materials.forEach(m => {
    const p = dryProp[m];
    LOI += p * materialData[m].LOI / 100;
    SO3 += p * materialData[m].SO3 / 100;
    BTL += p * materialData[m].BTL / 100;
  });

  const indexClinker = calcIndexClinker(LOI, SO3, BTL);
  const productType = getProductType();

  // Display results
  const container = document.getElementById('simResults');
  container.innerHTML = '';

  const params = [
    { name: 'LOI', value: LOI },
    { name: 'SO3', value: SO3 },
    { name: 'BTL', value: BTL },
  ];

  params.forEach(p => {
    container.innerHTML += `
      <div class="proportion-row">
        <span class="proportion-name">${p.name}</span>
        <span class="proportion-value">${p.value.toFixed(3)}</span>
      </div>`;
  });

  // Index Clinker highlight
  container.innerHTML += `
    <div class="proportion-row index-clinker-row">
      <span class="proportion-name">Index Clinker <span class="badge badge-highlight">${productType}</span></span>
      <span class="proportion-value index-clinker-value">${indexClinker.toFixed(3)}</span>
      <span class="deviation-badge index-clinker-badge">
        Basis Mutu (${productType})
      </span>
    </div>`;

  // Clinker value note
  container.innerHTML += `
    <div class="proportion-row" style="margin-top:8px;opacity:0.6;">
      <span class="proportion-name">Total Dry</span>
      <span class="proportion-value">${total.toFixed(2)}%</span>
    </div>`;

  // Calculate Wet Proportions (Simulasi Setpoint)
  const wetProp = {};
  let totalWet = 0;
  materials.forEach(m => {
    // k = (100 - H2O) / 100. Dry = Wet_raw * k => Wet_raw = Dry / k
    const k = (100 - materialData[m].H2O) / 100;
    wetProp[m] = (dryProp[m] / k) || 0;
    totalWet += wetProp[m];
  });
  
  // Normalize
  if (totalWet > 0) {
    materials.forEach(m => {
      wetProp[m] = (wetProp[m] / totalWet) * 100;
    });
  }

  // Mix Ratio display
  const mode = getFeederMode();
  if (mode === 'mix' && wetProp['Batu Kapur'] !== undefined && wetProp['Trass'] !== undefined) {
    const totalMix = wetProp['Batu Kapur'] + wetProp['Trass'];
    if (totalMix > 0) {
      const pctKapur = (wetProp['Batu Kapur'] / totalMix * 100).toFixed(1);
      const pctTrass = (wetProp['Trass'] / totalMix * 100).toFixed(1);
      container.innerHTML += `
        <div class="proportion-row" style="margin-top:8px; padding-top:8px; border-top:1px dashed var(--border-color);">
          <span class="proportion-name text-accent">⚙️ Rasio Mix (Basah)</span>
          <span class="proportion-value text-accent" style="width:auto;">B.Kapur ${pctKapur}% : Trass ${pctTrass}%</span>
        </div>`;
    }
  }

  // Display Wet Proportions
  const wetHead = document.getElementById('simWetTableHead');
  const wetRow = document.getElementById('simWetTableRow');
  wetHead.innerHTML = '';
  wetRow.innerHTML = '';
  
  materials.forEach(m => {
    wetHead.innerHTML += `<th>${m}</th>`;
    wetRow.innerHTML += `<td style="font-weight:600;color:var(--text-accent);">${(wetProp[m] || 0).toFixed(2)}</td>`;
  });

  document.getElementById('simResultSection').classList.remove('hidden');
  document.getElementById('simResultSection').scrollIntoView({ behavior: 'smooth' });
}

// ===== SIMULASI BASAH =====
function renderSimulationWetTable() {
  const thead = document.getElementById('simWetInputTableHead');
  const tbody = document.getElementById('simWetInputTableRow');
  
  // Preserve existing values to avoid reset on tab switch
  const existingValues = {};
  document.querySelectorAll('.sim-wet-input').forEach(input => {
    existingValues[input.dataset.material] = input.value;
  });

  thead.innerHTML = '';
  tbody.innerHTML = '';

  materials.forEach(m => {
    const isClinic = (m === 'Clinker');
    const val = existingValues[m] || '0';

    thead.innerHTML += `<th>${m}</th>`;

    if (isClinic) {
      // Clinker (calculated)
      tbody.innerHTML += `<td>
        <input type="number" id="simWetClinker" class="cell-input sim-wet-input" data-material="${m}" value="${val}" readonly title="Auto: 100% - total lainnya" style="opacity:0.6;cursor:not-allowed;">
      </td>`;
    } else {
      tbody.innerHTML += `<td>
        <input type="number" step="0.01" class="cell-input sim-wet-input" data-material="${m}" value="${val}" placeholder="0">
      </td>`;
    }
  });

  // Attach live update for Clinker
  tbody.querySelectorAll('.sim-wet-input:not([readonly])').forEach(input => {
    input.addEventListener('input', updateSimWetClinker);
  });

  updateSimWetClinker();
}

function updateSimWetClinker() {
  let total = 0;
  document.querySelectorAll('.sim-wet-input').forEach((input, idx) => {
    if (idx > 0) total += parseFloat(input.value) || 0;
  });
  const clinkerInput = document.getElementById('simWetClinker');
  if (clinkerInput) {
    clinkerInput.value = (100 - total).toFixed(2);
  }
}

function runSimulationWet() {
  const wetProp = {};
  document.querySelectorAll('.sim-wet-input').forEach(input => {
    wetProp[input.dataset.material] = parseFloat(input.value) || 0;
  });

  // Check total
  let totalWet = 0;
  Object.values(wetProp).forEach(v => totalWet += v);

  // Convert Wet to Dry: Dry_raw = Wet * k, k = (100 - H2O) / 100
  const dryRaw = {};
  let totalDryRaw = 0;
  materials.forEach(m => {
    const k = (100 - materialData[m].H2O) / 100;
    dryRaw[m] = wetProp[m] * k;
    totalDryRaw += dryRaw[m];
  });

  // Normalize Dry Proportions to 100%
  const dryProp = {};
  if (totalDryRaw > 0) {
    materials.forEach(m => {
      dryProp[m] = (dryRaw[m] / totalDryRaw) * 100;
    });
  } else {
    materials.forEach(m => dryProp[m] = 0);
  }

  // Calculate LOI, BTL, SO3 from normalized Dry
  let LOI = 0, BTL = 0, SO3 = 0;
  materials.forEach(m => {
    const p = dryProp[m];
    LOI += p * materialData[m].LOI / 100;
    SO3 += p * materialData[m].SO3 / 100;
    BTL += p * materialData[m].BTL / 100;
  });

  const indexClinker = calcIndexClinker(LOI, SO3, BTL);
  const productType = getProductType();

  // Display results
  const container = document.getElementById('simWetResults');
  container.innerHTML = '';

  const params = [
    { name: 'LOI', value: LOI },
    { name: 'SO3', value: SO3 },
    { name: 'BTL', value: BTL },
  ];

  params.forEach(p => {
    container.innerHTML += `
      <div class="proportion-row">
        <span class="proportion-name">${p.name}</span>
        <span class="proportion-value">${p.value.toFixed(3)}</span>
      </div>`;
  });

  // Index Clinker highlight
  container.innerHTML += `
    <div class="proportion-row index-clinker-row">
      <span class="proportion-name">Index Clinker <span class="badge badge-highlight">${productType}</span></span>
      <span class="proportion-value index-clinker-value">${indexClinker.toFixed(3)}</span>
      <span class="deviation-badge index-clinker-badge">
        Basis Mutu (${productType})
      </span>
    </div>`;

  // Total Wet note
  container.innerHTML += `
    <div class="proportion-row" style="margin-top:8px;opacity:0.6;">
      <span class="proportion-name">Total Wet</span>
      <span class="proportion-value">${totalWet.toFixed(2)}%</span>
    </div>`;

  // Mix Ratio display
  const mode = getFeederMode();
  if (mode === 'mix' && wetProp['Batu Kapur'] !== undefined && wetProp['Trass'] !== undefined) {
    const trassVal = wetProp['Trass'];
    if (trassVal > 0) {
      const ratio = (wetProp['Batu Kapur'] / trassVal).toFixed(1);
      container.innerHTML += `
        <div class="proportion-row" style="margin-top:8px; padding-top:8px; border-top:1px dashed var(--border-color);">
          <span class="proportion-name text-accent">⚙️ Rasio Mix (Basah)</span>
          <span class="proportion-value text-accent" style="width:auto;">B.Kapur ${ratio} : Trass 1.0</span>
        </div>`;
    }
  }

  // Display Dry Proportions
  const dryHead = document.getElementById('simWetToDryTableHead');
  const dryRow = document.getElementById('simWetToDryTableRow');
  dryHead.innerHTML = '';
  dryRow.innerHTML = '';
  
  materials.forEach(m => {
    dryHead.innerHTML += `<th>${m}</th>`;
    dryRow.innerHTML += `<td style="font-weight:600;color:var(--text-accent);">${(dryProp[m] || 0).toFixed(2)}</td>`;
  });

  document.getElementById('simWetResultSection').classList.remove('hidden');
  document.getElementById('simWetResultSection').scrollIntoView({ behavior: 'smooth' });
}

// ===== MATERIAL MANAGEMENT =====
function setupMaterialControls() {
  document.getElementById('btnAddMaterial').addEventListener('click', addMaterial);
  document.getElementById('btnRemoveMaterial').addEventListener('click', removeMaterial);

  // Allow Enter key to add material
  document.getElementById('newMaterialName').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') addMaterial();
  });

  updateRemoveButton();
}

function addMaterial() {
  const input = document.getElementById('newMaterialName');
  let name = input.value.trim();
  if (!name) {
    input.focus();
    return;
  }

  // Capitalize first letter of each word
  name = name.replace(/\b\w/g, c => c.toUpperCase());

  // Check duplicate
  if (materials.includes(name)) {
    alert(`Material "${name}" sudah ada.`);
    return;
  }

  // Add to state
  materials.push(name);
  materialData[name] = { LOI: 0, SO3: 0, BTL: 0, H2O: 0 };
  saveData();

  // Refresh all UI
  refreshAll();

  input.value = '';
  input.focus();
}

function removeMaterial() {
  // Only allow removing custom materials (not default ones)
  if (materials.length <= DEFAULT_MATERIALS.length) return;

  const removed = materials.pop();
  delete materialData[removed];
  saveData();

  refreshAll();
}

function refreshAll() {
  renderCompositionTable();
  setupLockControls();
  renderActualTable();
  setupPasteHandler();
  updateRemoveButton();

  // Clear previous results since material list changed
  lastResult = null;
  ['resultSection', 'comparisonSection', 'averageSection', 'recalcSection', 'deviationSection'].forEach(id => {
    const el = document.getElementById(id);
    if (el && id !== 'comparisonSection') el.classList.add('hidden');
  });
}

function updateRemoveButton() {
  const btn = document.getElementById('btnRemoveMaterial');
  btn.style.display = 'none'; // No longer needed, each column has its own delete
}

// ===== 1. COMPOSITION TABLE =====
function renderCompositionTable() {
  const thead = document.querySelector('#compositionTable thead tr');
  const tbody = document.querySelector('#compositionTable tbody');

  // Header with controls
  thead.innerHTML = '<th>Komponen</th>';
  materials.forEach((m, idx) => {
    const isDefault = DEFAULT_MATERIALS.includes(m);
    thead.innerHTML += `
      <th>
        <div class="col-header">
          <span class="col-header-name">${m}</span>
          <div class="col-header-actions">
            <button class="col-btn col-btn-rename" title="Rename" onclick="renameMaterial('${m.replace(/'/g, "\\'")}')">✏️</button>
            ${!isDefault ? `<button class="col-btn col-btn-delete" title="Hapus" onclick="removeMaterialByName('${m.replace(/'/g, "\\'")}')">✕</button>` : ''}
          </div>
        </div>
      </th>`;
  });

  // Body
  tbody.innerHTML = '';
  DEFAULT_PROPERTIES.forEach(prop => {
    let row = `<tr><td><div class="row-label">${prop}${prop === 'H2O' ? ' <span class="badge">%</span>' : ''}</div></td>`;
    materials.forEach(m => {
      const val = materialData[m][prop];
      row += `<td><input type="number" step="0.01" class="cell-input" 
                data-material="${m}" data-prop="${prop}" 
                value="${val}" title="${m} ${prop}"></td>`;
    });
    row += '</tr>';
    tbody.innerHTML += row;
  });

  // Attach listeners
  tbody.querySelectorAll('.cell-input').forEach(input => {
    input.addEventListener('change', (e) => {
      const mat = e.target.dataset.material;
      const prop = e.target.dataset.prop;
      const val = parseFloat(e.target.value) || 0;
      materialData[mat][prop] = val;
      saveData();
    });
  });
}

// ===== MATERIAL COLUMN ACTIONS =====
function renameMaterial(oldName) {
  const newName = prompt(`Rename "${oldName}" menjadi:`, oldName);
  if (!newName || newName.trim() === '' || newName.trim() === oldName) return;

  const trimmed = newName.trim().replace(/\b\w/g, c => c.toUpperCase());

  // Check duplicate
  if (materials.includes(trimmed) && trimmed !== oldName) {
    alert(`Material "${trimmed}" sudah ada.`);
    return;
  }

  // Update materials array
  const idx = materials.indexOf(oldName);
  if (idx === -1) return;
  materials[idx] = trimmed;

  // Update materialData
  materialData[trimmed] = materialData[oldName];
  if (trimmed !== oldName) delete materialData[oldName];

  // Update DEFAULT_MATERIALS if it was a default
  const defIdx = DEFAULT_MATERIALS.indexOf(oldName);
  if (defIdx !== -1) DEFAULT_MATERIALS[defIdx] = trimmed;

  saveData();
  refreshAll();
}

function removeMaterialByName(name) {
  if (!confirm(`Hapus material "${name}"?`)) return;

  const idx = materials.indexOf(name);
  if (idx === -1) return;

  materials.splice(idx, 1);
  delete materialData[name];

  saveData();
  refreshAll();
}

// ===== 2. LOCK CONTROLS =====
function setupLockControls() {
  const container = document.getElementById('lockControls');
  container.innerHTML = '<div class="lock-title">🔒 Lock Material (Tetapkan proporsi basah/wet)</div>';

  materials.forEach(m => {
    const isCustom = !DEFAULT_MATERIALS.includes(m);
    const div = document.createElement('div');
    div.className = `lock-item ${isCustom ? 'locked' : ''}`;
    div.innerHTML = `
      <input type="checkbox" id="lock_${m.replace(/\s/g,'_')}" data-material="${m}" ${isCustom ? 'checked' : ''}>
      <span class="lock-icon">${isCustom ? '🔒' : '🔓'}</span>
      <span class="lock-name">${m}</span>
      <input type="number" step="0.1" class="lock-value-input" 
             data-material="${m}" value="${isCustom ? '0' : '5'}" min="0" max="100" placeholder="%">
    `;

    const cb = div.querySelector('input[type="checkbox"]');
    cb.addEventListener('change', () => {
      div.classList.toggle('locked', cb.checked);
      div.querySelector('.lock-icon').textContent = cb.checked ? '🔒' : '🔓';
    });

    div.addEventListener('click', (e) => {
      if (e.target.tagName !== 'INPUT' || e.target.type !== 'number') {
        cb.checked = !cb.checked;
        cb.dispatchEvent(new Event('change'));
      }
    });

    container.appendChild(div);
  });
}

// ===== 3. TARGET & SOLVER =====
function setupTargetListeners() {
  document.getElementById('btnCalculate').addEventListener('click', runSolver);
  document.getElementById('btnReset').addEventListener('click', resetAll);
}

function getTargets() {
  return {
    LOI: parseFloat(document.getElementById('targetLOI').value) || 0,
    BTL: parseFloat(document.getElementById('targetBTL').value) || 0,
    SO3: parseFloat(document.getElementById('targetSO3').value) || 0,
  };
}

/**
 * Returns locked materials with their WET (basah) proportion values.
 * The solver will convert these to dry basis internally.
 */
function getLockedMaterials() {
  const locked = {};
  document.querySelectorAll('#lockControls .lock-item.locked').forEach(item => {
    const mat = item.querySelector('input[type="checkbox"]').dataset.material;
    const val = parseFloat(item.querySelector('.lock-value-input').value) || 0;
    locked[mat] = val; // wet proportion
  });
  return locked; // { materialName: wetProportion }
}

/**
 * Convert locked wet proportions to dry proportions.
 * wet_i = dry_i / (1 - H2O_i) * (100 / totalWetFactor)
 * Since we only know locked wet proportions, we convert:
 *   dry_i = wet_i * (1 - H2O_i)
 * Then normalize so total dry = desired dry total.
 */
function convertLockedWetToDry(lockedWet) {
  const lockedDry = {};
  Object.entries(lockedWet).forEach(([mat, wetPct]) => {
    const h2o = materialData[mat].H2O / 100;
    lockedDry[mat] = wetPct * (1 - h2o);
  });
  return lockedDry;
}

/**
 * SOLVER: Find proportions that meet targets.
 * 
 * When materials are locked, the lock value represents WET (basah) proportion.
 * 
 * We solve for wet proportions w_i where sum(w_i) = 100.
 * Dry proportion of material i: d_i = w_i * (1 - H2O_i/100)
 * 
 * Chemistry constraints (in dry basis):
 *   sum(d_i * LOI_i) / sum(d_i) = target_LOI (weighted average over dry mass)
 * 
 * Rearranging:
 *   sum(d_i * (LOI_i - target_LOI)) = 0
 *   sum(w_i * (1-h2o_i) * (LOI_i - target_LOI)) = 0
 * 
 * This is LINEAR in w_i, perfect for our solver!
 */
function runSolver() {
  const targets = getTargets();
  const lockedWet = getLockedMaterials(); // wet proportions
  const statusEl = document.getElementById('solverStatus');

  // Validate targets
  if (targets.LOI === 0 && targets.BTL === 0 && targets.SO3 === 0) {
    showStatus(statusEl, 'error', '⚠️ Masukkan minimal satu target (LOI, BTL, atau SO3)');
    return;
  }

  // Free materials
  const freeMats = materials.filter(m => !(m in lockedWet));
  
  if (freeMats.length < 1) {
    showStatus(statusEl, 'error', '⚠️ Setidaknya satu material harus tidak di-lock');
    return;
  }

  // Calculate locked contribution (in wet basis)
  let lockedWetSum = 0;
  Object.values(lockedWet).forEach(v => lockedWetSum += v);

  const remainingWetSum = 100 - lockedWetSum;
  if (remainingWetSum <= 0) {
    showStatus(statusEl, 'error', '⚠️ Total proporsi basah yang di-lock sudah melebihi 100%');
    return;
  }

  // Helper: factor for material m: k_m = (1 - H2O_m/100)
  const k = {};
  materials.forEach(m => { k[m] = 1 - materialData[m].H2O / 100; });

  // Calculate locked contribution to each target constraint
  // sum(w_i * k_i * (LOI_i - target_LOI)) = 0 for all materials
  // Locked part: sum_locked(wl * kl * (LOI_l - target_LOI))
  let lockedTermLOI = 0, lockedTermSO3 = 0, lockedTermBTL = 0;
  Object.entries(lockedWet).forEach(([mat, wetPct]) => {
    lockedTermLOI += wetPct * k[mat] * (materialData[mat].LOI - targets.LOI);
    lockedTermSO3 += wetPct * k[mat] * (materialData[mat].SO3 - targets.SO3);
    lockedTermBTL += wetPct * k[mat] * (materialData[mat].BTL - targets.BTL);
  });

  // Build system Ax = b, where x = wet proportions of free materials
  const n = freeMats.length;
  const rows = [];
  const b = [];

  // Constraint 1: sum(w_free) = remainingWetSum
  rows.push(freeMats.map(() => 1));
  b.push(remainingWetSum);

  // Target constraints (linearized)
  const activeTargets = [];
  if (targets.LOI !== 0) {
    rows.push(freeMats.map(m => k[m] * (materialData[m].LOI - targets.LOI)));
    b.push(-lockedTermLOI);
    activeTargets.push('LOI');
  }
  if (targets.SO3 !== 0) {
    rows.push(freeMats.map(m => k[m] * (materialData[m].SO3 - targets.SO3)));
    b.push(-lockedTermSO3);
    activeTargets.push('SO3');
  }
  if (targets.BTL !== 0) {
    rows.push(freeMats.map(m => k[m] * (materialData[m].BTL - targets.BTL)));
    b.push(-lockedTermBTL);
    activeTargets.push('BTL');
  }

  const m = rows.length; // equations

  let solution;

  if (m === n) {
    solution = solveGaussJordan(rows, b, n);
  } else if (m < n) {
    solution = solveLeastSquares(rows, b, n, m, remainingWetSum);
  } else {
    solution = solveLeastSquaresOverdetermined(rows, b, n, m);
  }

  if (!solution) {
    showStatus(statusEl, 'error', '⚠️ Tidak ditemukan solusi. Coba ubah target atau lock material yang berbeda.');
    return;
  }

  // Check for negative solutions
  const hasNegative = solution.some(v => v < -0.5);
  if (hasNegative) {
    showStatus(statusEl, 'error', '⚠️ Solusi menghasilkan proporsi negatif. Coba ubah target atau lock material yang berbeda.');
    return;
  }

  // Clamp small negatives to 0
  solution = solution.map(v => Math.max(0, v));

  // Build complete wet proportions
  const wetProportions = {};
  materials.forEach(m => {
    if (m in lockedWet) {
      wetProportions[m] = lockedWet[m];
    }
  });
  freeMats.forEach((m, i) => {
    wetProportions[m] = solution[i];
  });

  // Convert wet to dry proportions
  const dryProportions = {};
  let totalDry = 0;
  materials.forEach(m => {
    dryProportions[m] = wetProportions[m] * k[m];
    totalDry += dryProportions[m];
  });
  // Normalize dry to sum to 100
  materials.forEach(m => {
    dryProportions[m] = (dryProportions[m] / totalDry) * 100;
  });

  // Calculate achieved values (from dry proportions)
  const achieved = { LOI: 0, SO3: 0, BTL: 0 };
  materials.forEach(m => {
    const p = dryProportions[m];
    achieved.LOI += p * materialData[m].LOI / 100;
    achieved.SO3 += p * materialData[m].SO3 / 100;
    achieved.BTL += p * materialData[m].BTL / 100;
  });

  lastResult = { dryProportions, wetProportions, achieved, targets };

  // Display results
  displayResults(dryProportions, wetProportions, achieved, targets);
  showStatus(statusEl, 'success', '✅ Proporsi berhasil dihitung!');
}

// ===== Linear Algebra Solver: Gauss-Jordan =====
function solveGaussJordan(A, b, n) {
  // Augmented matrix
  const aug = A.map((row, i) => [...row, b[i]]);

  for (let col = 0; col < n; col++) {
    // Find pivot
    let maxRow = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(aug[row][col]) > Math.abs(aug[maxRow][col])) {
        maxRow = row;
      }
    }
    [aug[col], aug[maxRow]] = [aug[maxRow], aug[col]];

    if (Math.abs(aug[col][col]) < 1e-12) return null;

    // Scale pivot row
    const pivot = aug[col][col];
    for (let j = col; j <= n; j++) {
      aug[col][j] /= pivot;
    }

    // Eliminate
    for (let row = 0; row < n; row++) {
      if (row !== col) {
        const factor = aug[row][col];
        for (let j = col; j <= n; j++) {
          aug[row][j] -= factor * aug[col][j];
        }
      }
    }
  }

  return aug.map(row => row[n]);
}

// ===== Least Squares for Under-determined System =====
function solveLeastSquares(A, b, n, m, targetSum) {
  // Use non-negative least squares with iterative approach
  // Start with equal distribution, then adjust
  const maxIter = 5000;
  const lr = 0.005;
  
  // Initialize with equal proportions
  let x = new Array(n).fill(targetSum / n);

  for (let iter = 0; iter < maxIter; iter++) {
    // Calculate gradients for each constraint
    let totalGrad = new Array(n).fill(0);

    for (let eq = 0; eq < m; eq++) {
      let predicted = 0;
      for (let j = 0; j < n; j++) {
        predicted += A[eq][j] * x[j];
      }
      const error = predicted - b[eq];

      for (let j = 0; j < n; j++) {
        totalGrad[j] += 2 * error * A[eq][j];
      }
    }

    // Regularization: minimize deviation from equal distribution
    const avg = targetSum / n;
    for (let j = 0; j < n; j++) {
      totalGrad[j] += 0.001 * (x[j] - avg);
    }

    // Update
    for (let j = 0; j < n; j++) {
      x[j] -= lr * totalGrad[j];
      if (x[j] < 0) x[j] = 0;
    }

    // Project onto sum constraint
    let sum = x.reduce((a, b) => a + b, 0);
    if (sum > 0) {
      x = x.map(v => v * targetSum / sum);
    }
  }

  return x;
}

// ===== Least Squares for Over-determined System =====
function solveLeastSquaresOverdetermined(A, b, n, m) {
  // A^T * A * x = A^T * b
  const ATA = Array.from({ length: n }, () => new Array(n).fill(0));
  const ATb = new Array(n).fill(0);

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      for (let k = 0; k < m; k++) {
        ATA[i][j] += A[k][i] * A[k][j];
      }
    }
    for (let k = 0; k < m; k++) {
      ATb[i] += A[k][i] * b[k];
    }
  }

  return solveGaussJordan(ATA, ATb, n);
}

// ===== 4. DISPLAY RESULTS =====
function displayResults(dryProp, wetProp, achieved, targets) {
  const resultSection = document.getElementById('resultSection');
  resultSection.classList.remove('hidden');
  resultSection.scrollIntoView({ behavior: 'smooth', block: 'start' });

  // Dry proportions
  const dryContainer = document.getElementById('dryProportions');
  dryContainer.innerHTML = '';
  let dryTotal = 0;
  const maxDry = Math.max(...materials.map(m => dryProp[m]));
  materials.forEach(m => {
    const val = dryProp[m];
    dryTotal += val;
    dryContainer.innerHTML += `
      <div class="proportion-row">
        <span class="proportion-name">${m}</span>
        <div class="proportion-bar">
          <div class="proportion-bar-fill" style="width: ${(val / maxDry * 100)}%"></div>
        </div>
        <span class="proportion-value">${val.toFixed(2)}%</span>
      </div>`;
  });
  dryContainer.innerHTML += `
    <div class="proportion-total">
      <span>Total</span>
      <span>${dryTotal.toFixed(2)}%</span>
    </div>`;

  // Wet proportions
  const wetContainer = document.getElementById('wetProportions');
  wetContainer.innerHTML = '';
  let wetTotal = 0;
  const maxWet = Math.max(...materials.map(m => wetProp[m]));
  materials.forEach(m => {
    const val = wetProp[m];
    wetTotal += val;
    wetContainer.innerHTML += `
      <div class="proportion-row">
        <span class="proportion-name">${m}</span>
        <div class="proportion-bar">
          <div class="proportion-bar-fill" style="width: ${(val / maxWet * 100)}%"></div>
        </div>
        <span class="proportion-value">${val.toFixed(2)}%</span>
      </div>`;
  });
  wetContainer.innerHTML += `
    <div class="proportion-total">
      <span>Total</span>
      <span>${wetTotal.toFixed(2)}%</span>
    </div>`;

  // Mix Ratio display for RMD Target Output
  const mode = getFeederMode();
  if (mode === 'mix' && wetProp['Batu Kapur'] !== undefined && wetProp['Trass'] !== undefined) {
    const trassVal = wetProp['Trass'];
    if (trassVal > 0) {
      const ratio = (wetProp['Batu Kapur'] / trassVal).toFixed(1);
      wetContainer.innerHTML += `
        <div class="proportion-row" style="margin-top:12px; padding-top:12px; border-top:1px dashed var(--border-color);">
          <span class="proportion-name text-accent">⚙️ Rasio Mix (Basah)</span>
          <span class="proportion-value text-accent" style="width:auto;">B.Kapur ${ratio} : Trass 1.0</span>
        </div>`;
    }
  }

  // Achieved values
  const achievedContainer = document.getElementById('achievedValues');
  achievedContainer.innerHTML = '';
  ['LOI', 'SO3', 'BTL'].forEach(prop => {
    const target = targets[prop];
    const actual = achieved[prop];
    const delta = actual - target;
    const pctDelta = target !== 0 ? (delta / target * 100) : 0;

    let statusClass = 'good';
    if (Math.abs(pctDelta) > 5) statusClass = 'warning';
    if (Math.abs(pctDelta) > 10) statusClass = 'critical';

    achievedContainer.innerHTML += `
      <div class="proportion-row">
        <span class="proportion-name">${prop}</span>
        <span class="proportion-value">${actual.toFixed(3)}</span>
        <span class="deviation-badge ${statusClass}">
          Target: ${target.toFixed(3)} | Δ ${delta >= 0 ? '+' : ''}${delta.toFixed(3)}
        </span>
      </div>`;
  });

  // Index Clinker Basis Mutu
  const indexClinker = calcIndexClinker(achieved.LOI, achieved.SO3, achieved.BTL);
  const productType = getProductType();
  achievedContainer.innerHTML += `
    <div class="proportion-row index-clinker-row">
      <span class="proportion-name">Index Clinker <span class="badge badge-highlight">${productType}</span></span>
      <span class="proportion-value index-clinker-value">${indexClinker.toFixed(3)}</span>
      <span class="deviation-badge index-clinker-badge">
        Basis Mutu (${productType})
      </span>
    </div>`;

  // Show the comparison section
  document.getElementById('comparisonSection').classList.remove('hidden');
}

// ===== 5. ACTUAL 24-HOUR DATA SYSTEM =====
function setupActualSection() {
  renderActualTable();
  setupPasteHandler();
  document.getElementById('btnAnalyze').addEventListener('click', runAnalysis);
  document.getElementById('btnExportPDF').addEventListener('click', exportPDF);
  document.getElementById('btnClearActual').addEventListener('click', clearActualData);
}

function renderActualTable() {
  const mode = getFeederMode();
  let displayMaterials = [];
  
  if (mode === 'mix') {
    // Replace Batu Kapur and Trass with Mix Material
    materials.forEach(m => {
      if (m === 'Batu Kapur') {
        displayMaterials.push('Mix Material');
      } else if (m !== 'Trass') {
        displayMaterials.push(m);
      }
    });
  } else {
    displayMaterials = [...materials];
  }

  // Rebuild the entire thead
  const thead = document.querySelector('#actualDataTable thead tr');
  thead.innerHTML = '<th style="width: 40px; text-align: center;"><input type="checkbox" id="selectAllActual" checked title="Pilih Semua"></th><th>Jam</th><th>LOI</th><th>SO3</th><th>BTL</th>';
  displayMaterials.forEach(m => {
    const th = document.createElement('th');
    th.textContent = m + ' (%)';
    th.style.fontSize = '0.75rem';
    thead.appendChild(th);
  });

  // Create 24 rows
  const tbody = document.getElementById('actualDataBody');
  tbody.innerHTML = '';

  for (let i = 1; i <= 24; i++) {
    const tr = document.createElement('tr');
    // Checkbox and Jam column
    tr.innerHTML = `<td style="text-align:center;"><input type="checkbox" class="row-checkbox" data-row="${i}" checked></td>
                    <td style="text-align:center;font-weight:600;color:var(--text-muted);">${String(i).padStart(2, '0')}:00</td>`;

    // LOI, SO3, BTL inputs
    ['LOI', 'SO3', 'BTL'].forEach(prop => {
      tr.innerHTML += `<td><input type="number" step="0.01" class="cell-input actual-param" 
                        data-row="${i}" data-prop="${prop}" placeholder="-"></td>`;
    });

    // Material wet composition inputs
    displayMaterials.forEach(m => {
      tr.innerHTML += `<td><input type="number" step="0.01" class="cell-input actual-comp" 
                        data-row="${i}" data-material="${m}" placeholder="-"></td>`;
    });

    tbody.appendChild(tr);
  }

  // Setup 'Select All' event listener
  const selectAll = document.getElementById('selectAllActual');
  if (selectAll) {
    selectAll.addEventListener('change', (e) => {
      document.querySelectorAll('.row-checkbox').forEach(cb => {
        cb.checked = e.target.checked;
      });
    });
  }

  // Handle individual checkboxes unchecking the 'Select All'
  document.querySelectorAll('.row-checkbox').forEach(cb => {
    cb.addEventListener('change', () => {
      const allChecked = document.querySelectorAll('.row-checkbox:not(:checked)').length === 0;
      document.getElementById('selectAllActual').checked = allChecked;
    });
  });
}

/**
 * PASTE HANDLER: Allows pasting Excel data (TSV) into the 24-hour table.
 * 
 * How it works:
 * - User copies cells from Excel (which are tab-separated, rows are newline-separated)
 * - User clicks on any input in the table and presses Ctrl+V
 * - The handler figures out which row and column the cursor is in
 * - It fills in data starting from that cell, going right then down
 * - Columns order: LOI, SO3, BTL, Clinker, Gypsum, Batu Kapur, Trass, CKD
 * - If data has fewer/more columns, it handles gracefully
 */
function setupPasteHandler() {
  const tableBody = document.getElementById('actualDataBody');

  tableBody.addEventListener('paste', (e) => {
    const activeEl = document.activeElement;
    if (!activeEl || !activeEl.classList.contains('cell-input')) return;

    // Get clipboard text
    const clipboardData = e.clipboardData || window.clipboardData;
    const pastedText = clipboardData.getData('text');
    if (!pastedText.trim()) return;

    e.preventDefault(); // prevent default single-cell paste

    // Parse TSV: rows split by newline, columns split by tab
    const rows = pastedText.trim().split(/\r?\n/);

    // Determine starting position
    const startRow = parseInt(activeEl.dataset.row) || 1;

    // Figure out the column index of the focused input
    const colOrder = buildColumnOrder();
    const focusedColIdx = getColumnIndex(activeEl, colOrder);

    let filledRows = 0;

    rows.forEach((rowText, rowOffset) => {
      const currentRow = startRow + rowOffset;
      if (currentRow > 24) return;

      const cells = rowText.split('\t');

      cells.forEach((cellValue, colOffset) => {
        const targetColIdx = focusedColIdx + colOffset;
        if (targetColIdx >= colOrder.length) return;

        const col = colOrder[targetColIdx];
        const input = getInputByRowAndCol(currentRow, col);
        if (input) {
          // Clean value: handle comma as decimal separator, strip whitespace
          let cleanVal = cellValue.trim().replace(',', '.');
          // Remove % sign if present
          cleanVal = cleanVal.replace('%', '');
          const numVal = parseFloat(cleanVal);
          if (!isNaN(numVal)) {
            input.value = numVal;
            // Trigger change event
            input.dispatchEvent(new Event('change', { bubbles: true }));
          }
        }
      });

      filledRows++;
    });

    // Show feedback
    showStatus(
      document.getElementById('analyzeStatus'),
      'success',
      `📋 Data dari Excel berhasil di-paste! ${filledRows} baris terisi.`
    );
  });
}

/**
 * Build the column order array for the actual data table.
 * Returns array of { type: 'param'|'comp', key: string }
 */
// ===== PASTE HANDLER OVERRIDE =====
function buildColumnOrder() {
  const mode = getFeederMode();
  let displayMaterials = [];
  if (mode === 'mix') {
    materials.forEach(m => {
      if (m === 'Batu Kapur') displayMaterials.push('Mix Material');
      else if (m !== 'Trass') displayMaterials.push(m);
    });
  } else {
    displayMaterials = [...materials];
  }

  const cols = [];
  ['LOI', 'SO3', 'BTL'].forEach(prop => cols.push({ type: 'param', key: prop }));
  displayMaterials.forEach(m => cols.push({ type: 'comp', key: m }));
  return cols;
}

/**
 * Get the column index of a given input element.
 */
function getColumnIndex(inputEl, colOrder) {
  if (inputEl.classList.contains('actual-param')) {
    const prop = inputEl.dataset.prop;
    return colOrder.findIndex(c => c.type === 'param' && c.key === prop);
  } else if (inputEl.classList.contains('actual-comp')) {
    const mat = inputEl.dataset.material;
    return colOrder.findIndex(c => c.type === 'comp' && c.key === mat);
  }
  return 0;
}

/**
 * Get input element by row number and column descriptor.
 */
function getInputByRowAndCol(row, col) {
  if (col.type === 'param') {
    return document.querySelector(`.actual-param[data-row="${row}"][data-prop="${col.key}"]`);
  } else {
    return document.querySelector(`.actual-comp[data-row="${row}"][data-material="${col.key}"]`);
  }
}

function runAnalysis() {
  const statusEl = document.getElementById('analyzeStatus');

  const mode = getFeederMode();
  let displayMaterials = [];
  if (mode === 'mix') {
    materials.forEach(m => {
      if (m === 'Batu Kapur') displayMaterials.push('Mix Material');
      else if (m !== 'Trass') displayMaterials.push(m);
    });
  } else {
    displayMaterials = [...materials];
  }

  // Collect all rows with data
  const rows = [];
  for (let i = 1; i <= 24; i++) {
    // Check if row is selected to be included in analysis
    const isChecked = document.querySelector(`.row-checkbox[data-row="${i}"]`)?.checked;
    if (!isChecked) continue;
    const loi = getActualVal(i, 'LOI');
    const so3 = getActualVal(i, 'SO3');
    const btl = getActualVal(i, 'BTL');

    // Check if this row has any chemistry data
    if (loi === null && so3 === null && btl === null) continue;

    const comp = {};
    let hasComp = false;
    displayMaterials.forEach(m => {
      const val = getActualComp(i, m);
      comp[m] = val;
      if (val !== null) hasComp = true;
    });

    rows.push({
      hour: i,
      LOI: loi || 0,
      SO3: so3 || 0,
      BTL: btl || 0,
      comp: comp,
      hasComp: hasComp,
    });
  }

  if (rows.length === 0) {
    showStatus(statusEl, 'error', '⚠️ Masukkan minimal satu baris data aktual.');
    return;
  }

  // Calculate averages
  const avgParams = { LOI: 0, SO3: 0, BTL: 0 };
  const avgComp = {};
  displayMaterials.forEach(m => avgComp[m] = 0);

  let compCount = 0;

  rows.forEach(r => {
    avgParams.LOI += r.LOI;
    avgParams.SO3 += r.SO3;
    avgParams.BTL += r.BTL;
    if (r.hasComp) {
      compCount++;
      displayMaterials.forEach(m => {
        avgComp[m] += (r.comp[m] || 0);
      });
    }
  });

  const n = rows.length;
  avgParams.LOI /= n;
  avgParams.SO3 /= n;
  avgParams.BTL /= n;

  if (compCount > 0) {
    displayMaterials.forEach(m => avgComp[m] /= compCount);
  }

  // Step 2: Display averaged values
  displayAverageSummary(avgParams, avgComp, compCount > 0);

  // Step 3: Re-solve using average LOI/SO3/BTL as targets
  const lockedWet = getLockedMaterials();

  // Override lockedWet for custom/non-default materials based on actual input
  if (compCount > 0) {
    materials.forEach(m => {
      if (!DEFAULT_MATERIALS.includes(m) && avgComp[m] !== undefined && avgComp[m] > 0) {
        lockedWet[m] = avgComp[m]; // Force RMD baseline to match actual input
      }
    });
  }

  const recalcResult = solveWithTargets(avgParams, lockedWet);

  if (!recalcResult) {
    showStatus(statusEl, 'error', '⚠️ Tidak dapat menghitung proporsi RMD dari data aktual.');
    return;
  }

  // Step 4: Display recalculated proportions
  displayRecalculated(recalcResult);

  // Step 5: Compare actual composition vs ideal
  if (compCount > 0) {
    displayDeviation(avgComp, recalcResult.wetProportions);
    generateConclusion(avgParams, avgComp, recalcResult);
  } else {
    // No composition data, just show parameter summary
    displayDeviationParamsOnly(avgParams, recalcResult);
    generateConclusionParamsOnly(avgParams);
  }

  showStatus(statusEl, 'success', `✅ Analisis berhasil! ${n} baris data diproses.`);

  // Show Export PDF button
  const btnExport = document.getElementById('btnExportPDF');
  if (btnExport) btnExport.style.display = 'inline-flex';
}

function getActualVal(row, prop) {
  const el = document.querySelector(`.actual-param[data-row="${row}"][data-prop="${prop}"]`);
  if (!el || el.value === '') return null;
  return parseFloat(el.value);
}

function getActualComp(row, material) {
  const el = document.querySelector(`.actual-comp[data-row="${row}"][data-material="${material}"]`);
  if (!el || el.value === '') return null;
  return parseFloat(el.value);
}


/**
 * Re-solve the raw mix with given targets.
 * lockedWet contains wet proportions; solver works in wet basis.
 */
function solveWithTargets(targets, lockedWet) {
  const freeMats = materials.filter(m => !(m in lockedWet));
  if (freeMats.length < 1) return null;

  let lockedWetSum = 0;
  Object.values(lockedWet).forEach(v => lockedWetSum += v);
  const remainingWetSum = 100 - lockedWetSum;
  if (remainingWetSum <= 0) return null;

  const k = {};
  materials.forEach(m => { k[m] = 1 - materialData[m].H2O / 100; });

  let lockedTermLOI = 0, lockedTermSO3 = 0, lockedTermBTL = 0;
  Object.entries(lockedWet).forEach(([mat, wetPct]) => {
    lockedTermLOI += wetPct * k[mat] * (materialData[mat].LOI - targets.LOI);
    lockedTermSO3 += wetPct * k[mat] * (materialData[mat].SO3 - targets.SO3);
    lockedTermBTL += wetPct * k[mat] * (materialData[mat].BTL - targets.BTL);
  });

  const nFree = freeMats.length;
  const rows = [];
  const b = [];

  rows.push(freeMats.map(() => 1));
  b.push(remainingWetSum);

  if (targets.LOI !== 0) {
    rows.push(freeMats.map(m => k[m] * (materialData[m].LOI - targets.LOI)));
    b.push(-lockedTermLOI);
  }
  if (targets.SO3 !== 0) {
    rows.push(freeMats.map(m => k[m] * (materialData[m].SO3 - targets.SO3)));
    b.push(-lockedTermSO3);
  }
  if (targets.BTL !== 0) {
    rows.push(freeMats.map(m => k[m] * (materialData[m].BTL - targets.BTL)));
    b.push(-lockedTermBTL);
  }

  const eqCount = rows.length;
  let solution;

  if (eqCount === nFree) {
    solution = solveGaussJordan(rows, b, nFree);
  } else if (eqCount < nFree) {
    solution = solveLeastSquares(rows, b, nFree, eqCount, remainingWetSum);
  } else {
    solution = solveLeastSquaresOverdetermined(rows, b, nFree, eqCount);
  }

  if (!solution) return null;
  if (solution.some(v => v < -0.5)) return null;
  solution = solution.map(v => Math.max(0, v));

  // Build wet proportions
  const wetProportions = {};
  materials.forEach(m => { if (m in lockedWet) wetProportions[m] = lockedWet[m]; });
  freeMats.forEach((m, i) => { wetProportions[m] = solution[i]; });

  // Convert wet to dry
  const dryProportions = {};
  let totalDry = 0;
  materials.forEach(m => {
    dryProportions[m] = wetProportions[m] * k[m];
    totalDry += dryProportions[m];
  });
  materials.forEach(m => {
    dryProportions[m] = (dryProportions[m] / totalDry) * 100;
  });

  const achieved = { LOI: 0, SO3: 0, BTL: 0 };
  materials.forEach(m => {
    achieved.LOI += dryProportions[m] * materialData[m].LOI / 100;
    achieved.SO3 += dryProportions[m] * materialData[m].SO3 / 100;
    achieved.BTL += dryProportions[m] * materialData[m].BTL / 100;
  });

  return { dryProportions, wetProportions, achieved, targets };
}

// ===== 6. DISPLAY FUNCTIONS =====
function displayAverageSummary(avgParams, avgComp, hasComp) {
  const avgSection = document.getElementById('averageSection');
  avgSection.classList.remove('hidden');

  // Parameter summary
  const tbody = document.getElementById('averageSummaryTable');
  tbody.innerHTML = '';

  ['LOI', 'SO3', 'BTL'].forEach(prop => {
    const avg = avgParams[prop];

    tbody.innerHTML += `
      <tr>
        <td><strong>${prop}</strong></td>
        <td style="font-weight:600;color:var(--text-accent);">${avg.toFixed(3)}</td>
      </tr>`;
  });

  // Composition average row
  if (hasComp) {
    const headRow = document.getElementById('avgCompHead');
    const mode = getFeederMode();
    let displayMaterials = [];
    if (mode === 'mix') {
      materials.forEach(m => {
        if (m === 'Batu Kapur') displayMaterials.push('Mix Material');
        else if (m !== 'Trass') displayMaterials.push(m);
      });
    } else {
      displayMaterials = [...materials];
    }
    
    headRow.innerHTML = '<th>Parameter</th>';
    displayMaterials.forEach(m => { headRow.innerHTML += `<th>${m}</th>`; });
    headRow.innerHTML += '<th>Total</th>';

    const dataRow = document.getElementById('avgCompRow');
    dataRow.innerHTML = '<td><strong>Rata-rata (%)</strong></td>';
    let total = 0;
    displayMaterials.forEach(m => {
      dataRow.innerHTML += `<td style="font-weight:600;color:var(--text-accent);">${(avgComp[m] || 0).toFixed(2)}</td>`;
      total += (avgComp[m] || 0);
    });
    dataRow.innerHTML += `<td style="font-weight:700;color:var(--text-primary);">${total.toFixed(2)}</td>`;
  }
}

function displayRecalculated(result) {
  const section = document.getElementById('recalcSection');
  section.classList.remove('hidden');

  const mode = getFeederMode();
  let displayMaterials = [];
  if (mode === 'mix') {
    materials.forEach(m => {
      if (m === 'Batu Kapur') displayMaterials.push('Mix Material');
      else if (m !== 'Trass') displayMaterials.push(m);
    });
  } else {
    displayMaterials = [...materials];
  }

  const dryPropRaw = result.dryProportions;
  const wetPropRaw = result.wetProportions;

  const dryProp = { ...dryPropRaw };
  const wetProp = { ...wetPropRaw };

  if (mode === 'mix') {
    dryProp['Mix Material'] = (dryProp['Batu Kapur'] || 0) + (dryProp['Trass'] || 0);
    wetProp['Mix Material'] = (wetProp['Batu Kapur'] || 0) + (wetProp['Trass'] || 0);
  }

  // Dry
  const dryContainer = document.getElementById('recalcDryProportions');
  dryContainer.innerHTML = '';
  let dryTotal = 0;
  const maxDry = Math.max(...displayMaterials.map(m => dryProp[m]));
  displayMaterials.forEach(m => {
    const val = dryProp[m];
    dryTotal += val;
    dryContainer.innerHTML += `
      <div class="proportion-row">
        <span class="proportion-name">${m}</span>
        <div class="proportion-bar">
          <div class="proportion-bar-fill" style="width: ${(val / maxDry * 100)}%"></div>
        </div>
        <span class="proportion-value">${val.toFixed(2)}%</span>
      </div>`;
  });
  dryContainer.innerHTML += `
    <div class="proportion-total">
      <span>Total</span>
      <span>${dryTotal.toFixed(2)}%</span>
    </div>`;

  // Wet
  const wetContainer = document.getElementById('recalcWetProportions');
  wetContainer.innerHTML = '';
  let wetTotal = 0;
  const maxWet = Math.max(...displayMaterials.map(m => wetProp[m]));
  displayMaterials.forEach(m => {
    const val = wetProp[m];
    wetTotal += val;
    wetContainer.innerHTML += `
      <div class="proportion-row">
        <span class="proportion-name">${m}</span>
        <div class="proportion-bar">
          <div class="proportion-bar-fill" style="width: ${(val / maxWet * 100)}%"></div>
        </div>
        <span class="proportion-value">${val.toFixed(2)}%</span>
      </div>`;
  });
  wetContainer.innerHTML += `
    <div class="proportion-total">
      <span>Total</span>
      <span>${wetTotal.toFixed(2)}%</span>
    </div>`;

  // Mix Ratio display
  if (mode === 'mix' && wetPropRaw['Batu Kapur'] !== undefined && wetPropRaw['Trass'] !== undefined) {
    const trassVal = wetPropRaw['Trass'];
    if (trassVal > 0) {
      const ratio = (wetPropRaw['Batu Kapur'] / trassVal).toFixed(1);
      wetContainer.innerHTML += `
        <div class="proportion-row" style="margin-top:12px; padding-top:12px; border-top:1px dashed var(--border-color);">
          <span class="proportion-name text-accent">⚙️ Rasio Mix (Basah)</span>
          <span class="proportion-value text-accent" style="width:auto;">B.Kapur ${ratio} : Trass 1.0</span>
        </div>`;
    }
  }
}

function displayDeviation(avgComp, idealWet) {
  const section = document.getElementById('deviationSection');
  section.classList.remove('hidden');

  const compTable = document.getElementById('comparisonTable');
  compTable.innerHTML = '';

  const mode = getFeederMode();
  let displayMaterials = [];
  if (mode === 'mix') {
    materials.forEach(m => {
      if (m === 'Batu Kapur') displayMaterials.push('Mix Material');
      else if (m !== 'Trass') displayMaterials.push(m);
    });
  } else {
    displayMaterials = [...materials];
  }

  const effectiveIdealWet = { ...idealWet };
  if (mode === 'mix') {
    effectiveIdealWet['Mix Material'] = (idealWet['Batu Kapur'] || 0) + (idealWet['Trass'] || 0);
  }

  displayMaterials.forEach(m => {
    const actual = avgComp[m];
    const ideal = effectiveIdealWet[m];
    const delta = ideal - actual;
    const pctDelta = ideal !== 0 ? (delta / ideal * 100) : 0;

    let statusClass = 'good', statusLabel = '✅ OK';
    if (Math.abs(pctDelta) > 0.5) { statusClass = 'warning'; statusLabel = '⚠️ Deviasi'; }
    if (Math.abs(pctDelta) > 2.0) { statusClass = 'critical'; statusLabel = '❌ Signifikan'; }

    compTable.innerHTML += `
      <tr>
        <td><strong>${m}</strong></td>
        <td>${actual.toFixed(2)}</td>
        <td>${ideal.toFixed(2)}</td>
        <td style="color: ${delta >= 0 ? 'var(--info)' : 'var(--danger)'}; font-weight:600">
          ${delta >= 0 ? '+' : ''}${delta.toFixed(2)}
        </td>
        <td>${pctDelta >= 0 ? '+' : ''}${pctDelta.toFixed(1)}%</td>
        <td><span class="deviation-badge ${statusClass}">${statusLabel}</span></td>
      </tr>`;
  });
}

function displayDeviationParamsOnly(avgParams, recalcResult) {
  const section = document.getElementById('deviationSection');
  section.classList.remove('hidden');

  const compTable = document.getElementById('comparisonTable');
  compTable.innerHTML = '';

  const mode = getFeederMode();
  let displayMaterials = [];
  if (mode === 'mix') {
    materials.forEach(m => {
      if (m === 'Batu Kapur') displayMaterials.push('Mix Material');
      else if (m !== 'Trass') displayMaterials.push(m);
    });
  } else {
    displayMaterials = [...materials];
  }

  // Compare original design wet vs recalculated wet
  const originalWet = { ...lastResult.wetProportions };
  const idealWet = { ...recalcResult.wetProportions };

  if (mode === 'mix') {
    originalWet['Mix Material'] = (originalWet['Batu Kapur'] || 0) + (originalWet['Trass'] || 0);
    idealWet['Mix Material'] = (idealWet['Batu Kapur'] || 0) + (idealWet['Trass'] || 0);
  }

  displayMaterials.forEach(m => {
    const origVal = originalWet[m];
    const idealVal = idealWet[m];
    const delta = idealVal - origVal;
    const pctDelta = origVal !== 0 ? (delta / origVal * 100) : 0;

    let statusClass = 'good', statusLabel = '✅ OK';
    if (Math.abs(pctDelta) > 0.5) { statusClass = 'warning'; statusLabel = '⚠️ Deviasi'; }
    if (Math.abs(pctDelta) > 2.0) { statusClass = 'critical'; statusLabel = '❌ Signifikan'; }

    compTable.innerHTML += `
      <tr>
        <td><strong>${m}</strong></td>
        <td>${origVal.toFixed(2)}</td>
        <td>${idealVal.toFixed(2)}</td>
        <td style="color: ${delta >= 0 ? 'var(--danger)' : 'var(--info)'}; font-weight:600">
          ${delta >= 0 ? '+' : ''}${delta.toFixed(2)}
        </td>
        <td>${pctDelta >= 0 ? '+' : ''}${pctDelta.toFixed(1)}%</td>
        <td><span class="deviation-badge ${statusClass}">${statusLabel}</span></td>
      </tr>`;
  });
}

// ===== 7. CONCLUSION & PREDICTION =====
function generateConclusion(avgParams, avgComp, recalcResult) {
  const idealWetRaw = recalcResult.wetProportions;
  const predContainer = document.getElementById('predictionCards');
  predContainer.innerHTML = '';

  const mode = getFeederMode();
  let displayMaterials = [];
  if (mode === 'mix') {
    materials.forEach(m => {
      if (m === 'Batu Kapur') displayMaterials.push('Mix Material');
      else if (m !== 'Trass') displayMaterials.push(m);
    });
  } else {
    displayMaterials = [...materials];
  }

  const idealWet = { ...idealWetRaw };
  if (mode === 'mix') {
    idealWet['Mix Material'] = (idealWet['Batu Kapur'] || 0) + (idealWet['Trass'] || 0);
  }

  // Build conclusion text (HIDDEN as per user request to focus on cards)
  const conclusionBox = document.getElementById('conclusionBox');
  conclusionBox.style.display = 'none'; // Hide the entire summary box
  conclusionBox.innerHTML = '';

  // Per-material prediction cards
  displayMaterials.forEach(m => {
    const actual = avgComp[m];
    if (actual === 0) return; // Skip materials with 0% actual usage (as per user request)

    const ideal = idealWet[m];
    const delta = ideal - actual;
    const pctDelta = ideal !== 0 ? (delta / ideal * 100) : 0;

    let status, icon, label, detail;

    if (Math.abs(pctDelta) <= 0.5) {
      status = 'normal';
      icon = '✅';
      label = 'Sesuai';
      detail = `Aktual: ${actual.toFixed(2)}% | RMD: ${ideal.toFixed(2)}%<br>Deviasi ${Math.abs(pctDelta).toFixed(1)}% — dalam toleransi.`;
    } else if (delta > 0) {
      status = 'excess';
      icon = '📈';
      label = 'Berlebih';
      detail = `Aktual: ${actual.toFixed(2)}% | RMD: ${ideal.toFixed(2)}%<br>Nilai desain (RMD) lebih tinggi dari aktual. Material di feeder terindikasi <strong>berlebih</strong>. <strong>Kurangi</strong> rasio ~${Math.abs(delta).toFixed(2)}%.`;
    } else {
      status = 'deficit';
      icon = '📉';
      label = 'Kurang';
      detail = `Aktual: ${actual.toFixed(2)}% | RMD: ${ideal.toFixed(2)}%<br>Nilai desain (RMD) lebih rendah dari aktual. Material di feeder terindikasi <strong>kurang</strong>. <strong>Tambahkan</strong> rasio ~${Math.abs(delta).toFixed(2)}%.`;
    }

    predContainer.innerHTML += `
      <div class="prediction-card ${status}">
        <div class="prediction-icon">${icon}</div>
        <div class="material-name">${m}</div>
        <div class="prediction-detail">
          <strong>${label}</strong><br>
          ${detail}
        </div>
      </div>`;
  });
}

function generateConclusionParamsOnly(avgParams) {
  const conclusionBox = document.getElementById('conclusionBox');
  conclusionBox.style.display = 'block'; // Ensure it's visible for text-only messages
  const predContainer = document.getElementById('predictionCards');
  predContainer.innerHTML = '';

  let html = '<h3 style="margin-bottom:12px;color:var(--text-accent);">📋 Status Parameter</h3>';
  html += '<p style="color:var(--text-secondary);">Rata-rata pencapaian aktual: LOI: <strong>${avgParams.LOI.toFixed(3)}</strong> | SO3: <strong>${avgParams.SO3.toFixed(3)}</strong> | BTL: <strong>${avgParams.BTL.toFixed(3)}</strong></p>';
  html += '<p style="color:var(--text-muted); margin-top:8px; font-size:0.85rem; font-style:italic;">💡 Masukkan data komposisi basah aktual (feeder) untuk melihat analisis deviasi material per jenis.</p>';

  conclusionBox.innerHTML = html;
}

function clearActualData() {
  document.querySelectorAll('#actualDataBody input').forEach(el => { el.value = ''; });
  document.getElementById('averageSection').classList.add('hidden');
  document.getElementById('recalcSection').classList.add('hidden');
  document.getElementById('deviationSection').classList.add('hidden');
  showStatus(document.getElementById('analyzeStatus'), 'info', 'ℹ️ Data aktual telah dikosongkan.');
}

// ===== EXPORT PDF =====
function exportPDF() {
  // Update print header info
  const dateEl = document.getElementById('printDate');
  const prodEl = document.getElementById('printProductType');
  const now = new Date();
  
  const dateStr = now.toLocaleDateString('id-ID', { 
    day: '2-digit', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });

  if (dateEl) dateEl.textContent = `Tanggal Cetak: ${dateStr}`;
  if (prodEl) prodEl.textContent = `Produk: ${getProductType()} (${getFeederMode().toUpperCase()})`;

  // Trigger browser print
  window.print();
}

// ===== UTILITY FUNCTIONS =====
function showStatus(el, type, message) {
  el.className = `status-msg visible ${type}`;
  el.textContent = message;
  setTimeout(() => {
    el.classList.remove('visible');
  }, 5000);
}

function resetAll() {
  materialData = JSON.parse(JSON.stringify(DEFAULT_DATA));
  renderCompositionTable();

  document.getElementById('targetLOI').value = '';
  document.getElementById('targetBTL').value = '';
  document.getElementById('targetSO3').value = '';

  document.getElementById('resultSection').classList.add('hidden');
  document.getElementById('comparisonSection').classList.add('hidden');
  document.getElementById('averageSection').classList.add('hidden');
  document.getElementById('recalcSection').classList.add('hidden');
  document.getElementById('deviationSection').classList.add('hidden');
  
  const btnExport = document.getElementById('btnExportPDF');
  if (btnExport) btnExport.style.display = 'none';

  // Reset locks
  document.querySelectorAll('#lockControls .lock-item').forEach(item => {
    item.classList.remove('locked');
    item.querySelector('.lock-icon').textContent = '🔓';
    item.querySelector('input[type="checkbox"]').checked = false;
  });

  // Clear actual data
  document.querySelectorAll('#actualDataBody input').forEach(el => { el.value = ''; });

  lastResult = null;

  const statusEl = document.getElementById('solverStatus');
  showStatus(statusEl, 'info', 'ℹ️ Semua data telah direset ke default.');
}

