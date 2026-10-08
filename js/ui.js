// =====================================================================
//  ui.js — connects the page to the algorithm:
//  builds the control panel, loads images, plays the animation,
//  and runs export. Nothing here changes how the stimulus looks;
//  that is all in motion.js and settings.js.
// =====================================================================

const $ = id => document.getElementById(id);

const state = {
  settings: defaultSettings(),
  source: null,          // the picture as loaded (full resolution)
  sourceName: '',
  image: null,           // scaled image { width, height, rgb }
  colors: null,          // from analyzeColors()
  maps: null,            // from buildMotionMaps()
  frame: 0,              // current frame index (0-based)
  playing: true,
  pendingRebuild: null,  // 'image' | 'colors' | 'maps' | 'frame' | null
  exporting: false,
};

const REBUILD_ORDER = ['frame', 'maps', 'colors', 'image'];

const viewCanvas = $('viewCanvas');
const viewCtx = viewCanvas.getContext('2d');
const originalCanvas = $('originalCanvas');
const originalCtx = originalCanvas.getContext('2d');
let frameData = null;
const panelRows = {};    // key -> { row, input, valueEl, readoutEl }


// ---------------------------------------------------------------------
//  Control panel (built from PARAMETERS in settings.js)
// ---------------------------------------------------------------------
function buildPanel() {
  const panel = $('panel');
  const groups = {};

  for (const p of PARAMETERS) {
    if (!groups[p.group]) {
      const details = document.createElement('details');
      details.open = true;
      details.innerHTML = `<summary>${p.group}</summary>`;
      panel.appendChild(details);
      groups[p.group] = details;
    }

    const row = document.createElement('div');
    row.className = 'param' + (p.type === 'checkbox' ? ' checkbox' : '');
    const id = 'param-' + p.key;
    let input;

    if (p.type === 'range') {
      input = Object.assign(document.createElement('input'),
        { type: 'range', id, min: p.min, max: p.max, step: p.step });
    } else if (p.type === 'select') {
      input = document.createElement('select');
      input.id = id;
      for (const o of p.options) input.add(new Option(o.label, o.value));
    } else if (p.type === 'checkbox') {
      input = Object.assign(document.createElement('input'), { type: 'checkbox', id });
    } else if (p.type === 'color') {
      input = Object.assign(document.createElement('input'), { type: 'color', id });
    }

    const head = document.createElement('div');
    head.className = 'param-head';
    const label = Object.assign(document.createElement('label'), { htmlFor: id, textContent: p.label });
    const valueEl = Object.assign(document.createElement('span'), { className: 'param-value mono' });

    if (p.type === 'checkbox') {
      head.append(input, label);
    } else {
      head.append(label, valueEl);
    }
    row.appendChild(head);
    if (p.type !== 'checkbox') row.appendChild(input);

    const readoutEl = Object.assign(document.createElement('div'), { className: 'param-readout' });
    if (p.readout) row.appendChild(readoutEl);
    if (p.help) row.appendChild(Object.assign(document.createElement('p'), { className: 'param-help', textContent: p.help }));

    input.addEventListener('input', () => {
      let v;
      if (p.type === 'range') v = Number(input.value);
      else if (p.type === 'checkbox') v = input.checked;
      else v = input.value;
      state.settings[p.key] = v;
      $('presetSelect').value = '';
      updatePanelLabels();
      requestRebuild(p.rebuild || 'maps');
    });

    groups[p.group].appendChild(row);
    panelRows[p.key] = { row, input, valueEl, readoutEl, param: p };
  }
}

// Copies state.settings into every control (after a preset or file load).
function syncPanel() {
  for (const key in panelRows) {
    const { input, param } = panelRows[key];
    const v = state.settings[key];
    if (param.type === 'checkbox') input.checked = !!v;
    else input.value = v;
  }
  updatePanelLabels();
}

// Updates value labels, readouts, and hides controls that don't apply.
function updatePanelLabels() {
  const s = state.settings;
  for (const key in panelRows) {
    const { row, valueEl, readoutEl, param } = panelRows[key];
    if (param.type === 'range') {
      valueEl.textContent = formatNumber(s[key], param.step) + (param.unit ? ' ' + param.unit : '');
    } else if (param.type === 'color') {
      valueEl.textContent = s[key];
    }
    if (param.readout) readoutEl.textContent = param.readout(s);
    row.hidden = param.showIf ? !param.showIf(s) : false;
  }
}

function formatNumber(v, step) {
  const decimals = step < 1 ? Math.max(0, -Math.floor(Math.log10(step))) : 0;
  return Number(v).toFixed(decimals);
}


// ---------------------------------------------------------------------
//  Rebuilding after a change
// ---------------------------------------------------------------------
function requestRebuild(level) {
  const current = state.pendingRebuild;
  if (!current || REBUILD_ORDER.indexOf(level) > REBUILD_ORDER.indexOf(current)) {
    state.pendingRebuild = level;
  }
}

function doRebuild() {
  const level = state.pendingRebuild;
  state.pendingRebuild = null;
  if (!level || !state.source) return;
  const s = state.settings;
  const rank = REBUILD_ORDER.indexOf(level);
  const t0 = performance.now();

  if (rank >= 3) {
    state.image = prepareImage(state.source, s.maxImageSize);
    for (const c of [viewCanvas, originalCanvas]) {
      c.width = state.image.width;
      c.height = state.image.height;
    }
    frameData = viewCtx.createImageData(state.image.width, state.image.height);
  }
  if (rank >= 2) state.colors = analyzeColors(state.image, s.colorSpace);
  if (rank >= 1) state.maps = buildMotionMaps(state.image, state.colors, s);

  // Playback range
  if (state.frame >= s.nFrames) state.frame = 0;
  $('frameSlider').max = s.nFrames - 1;

  // Side-by-side original
  $('originalFigure').hidden = !s.showOriginal;
  if (s.showOriginal) {
    const orig = originalCtx.createImageData(state.image.width, state.image.height);
    renderOriginal(state.image, s, orig);
    originalCtx.putImageData(orig, 0, 0);
  }
  const viewerLabel = s.simulateViewer === 'normal' ? '' :
    ' — ' + panelRows.simulateViewer.input.selectedOptions[0].textContent;
  $('viewCaption').textContent = 'Animated' + viewerLabel;
  $('originalCaption').textContent = 'Original' + viewerLabel;

  const buildMs = performance.now() - t0;
  drawFrame();
  setStatus(`${state.sourceName} · ${state.image.width}×${state.image.height} px · ` +
            `${state.maps.nEntries.toLocaleString()} stripe samples · rebuilt in ${buildMs.toFixed(0)} ms`);
}

// Scales the source picture down to maxSize and makes width/height even.
function prepareImage(source, maxSize) {
  const sw = source.naturalWidth || source.width;
  const sh = source.naturalHeight || source.height;
  const scale = Math.min(1, maxSize / Math.max(sw, sh));
  const W = Math.max(2, Math.floor(sw * scale / 2) * 2);
  const H = Math.max(2, Math.floor(sh * scale / 2) * 2);

  const canvas = makeCanvas(W, H);
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, W, H);
  const data = ctx.getImageData(0, 0, W, H).data;

  // RGBA bytes -> r,g,b floats in 0..1  (MATLAB: im2double; gray images are already r=g=b)
  const rgb = new Float32Array(W * H * 3);
  for (let p = 0; p < W * H; p++) {
    rgb[3 * p] = data[4 * p] / 255;
    rgb[3 * p + 1] = data[4 * p + 1] / 255;
    rgb[3 * p + 2] = data[4 * p + 2] / 255;
  }
  return { width: W, height: H, rgb };
}


// ---------------------------------------------------------------------
//  Playback
// ---------------------------------------------------------------------
function drawFrame() {
  if (!state.maps) return;
  const s = state.settings;
  renderFrame(state.maps, state.image, s, state.frame / s.fps, frameData);
  viewCtx.putImageData(frameData, 0, 0);
  $('frameSlider').value = state.frame;
  $('timeLabel').textContent =
    `frame ${state.frame + 1} / ${s.nFrames} · ${(state.frame / s.fps).toFixed(2)} s`;
}

let lastTick = null, carry = 0;
function tick(now) {
  if (!state.exporting) {
    if (state.pendingRebuild) doRebuild();

    if (state.playing && state.maps && lastTick !== null) {
      const s = state.settings;
      carry += (now - lastTick) / 1000;
      const frameTime = 1 / s.fps;
      if (carry >= frameTime) {
        const steps = Math.floor(carry / frameTime);
        carry -= steps * frameTime;
        carry = Math.min(carry, frameTime);       // don't try to catch up after a stall
        state.frame = (state.frame + steps) % s.nFrames;
        drawFrame();
      }
    }
  }
  lastTick = now;
  requestAnimationFrame(tick);
}

function setPlaying(playing) {
  state.playing = playing;
  carry = 0;
  $('playBtn').textContent = playing ? 'Pause' : 'Play';
}


// ---------------------------------------------------------------------
//  Loading images and settings
// ---------------------------------------------------------------------
function loadImageFile(file) {
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => {
    setSource(img, file.name);
    URL.revokeObjectURL(url);
  };
  img.onerror = () => setStatus(`Could not read “${file.name}” as an image.`);
  img.src = url;
}

function setSource(source, name) {
  state.source = source;
  state.sourceName = name;
  state.frame = 0;
  requestRebuild('image');
}

async function loadSettingsFile(file) {
  try {
    const { settings, image } = await readSettingsFile(file);
    state.settings = settings;
    $('presetSelect').value = '';
    syncPanel();
    requestRebuild('image');
    if (image && image.name && image.name !== state.sourceName) {
      alert(`Settings loaded.\n\nThey were saved with the image “${image.name}” ` +
            `(${image.width}×${image.height}). Open that image to reproduce the same video.`);
    }
  } catch (err) {
    alert('Could not read that settings file:\n' + err.message);
  }
}

function baseName() {
  return (state.sourceName || 'image').replace(/\.[^.]+$/, '').replace(/[^\w\-]+/g, '_');
}

function saveSettings() {
  const info = state.image ? { name: state.sourceName, width: state.image.width, height: state.image.height } : null;
  const blob = new Blob([settingsFileContents(state.settings, info)], { type: 'application/json' });
  downloadBlob(blob, `${baseName()}_motion_settings.json`);
}

async function runExport() {
  if (!state.maps || state.exporting) return;
  if (state.pendingRebuild) doRebuild();
  if (state.settings.simulateViewer !== 'normal' &&
      !confirm('"Simulate viewer" is on, so the exported video will show the simulated colors, not the real stimulus.\n\nExport anyway?')) {
    return;
  }

  state.exporting = true;
  $('exportOverlay').hidden = false;
  $('exportMessage').textContent = `Exporting ${state.settings.nFrames} frames…`;
  try {
    const s = Object.assign({}, state.settings);
    const blob = await exportMp4(state.maps, state.image, s,
      f => { $('exportProgress').value = f; });
    downloadBlob(blob, `${baseName()}_motion.mp4`);
    saveSettings();     // the matching settings file, for reproducing it later
    setStatus(`Exported ${baseName()}_motion.mp4 (${(blob.size / 1e6).toFixed(1)} MB) and its settings file.`);
  } catch (err) {
    alert('Export failed:\n' + err.message);
  } finally {
    state.exporting = false;
    $('exportOverlay').hidden = true;
    $('exportProgress').value = 0;
    drawFrame();
  }
}

function setStatus(text) {
  $('status').textContent = text;
}


// ---------------------------------------------------------------------
//  Wiring up the page
// ---------------------------------------------------------------------
function init() {
  buildPanel();
  syncPanel();

  for (const name in TEST_PATTERNS) $('patternSelect').add(new Option(name, name));
  for (const name in PRESETS) $('presetSelect').add(new Option(name, name));

  $('openImageBtn').onclick = () => $('imageInput').click();
  $('imageInput').onchange = e => {
    if (e.target.files[0]) loadImageFile(e.target.files[0]);
    e.target.value = '';
  };
  $('patternSelect').onchange = e => {
    const name = e.target.value;
    if (name) setSource(TEST_PATTERNS[name](), name);
  };
  $('presetSelect').onchange = e => {
    if (!e.target.value) return;
    state.settings = presetSettings(e.target.value);
    syncPanel();
    requestRebuild('image');
  };
  $('saveSettingsBtn').onclick = saveSettings;
  $('loadSettingsBtn').onclick = () => $('settingsInput').click();
  $('settingsInput').onchange = e => {
    if (e.target.files[0]) loadSettingsFile(e.target.files[0]);
    e.target.value = '';
  };
  $('exportBtn').onclick = runExport;
  if (!canExportMp4()) {
    $('exportBtn').disabled = true;
    $('exportBtn').title = 'MP4 export needs Chrome, Edge, or Safari 17+.';
  }

  $('playBtn').onclick = () => setPlaying(!state.playing);
  $('frameSlider').oninput = e => {
    setPlaying(false);
    state.frame = Number(e.target.value);
    drawFrame();
  };
  document.addEventListener('keydown', e => {
    const tag = e.target.tagName;
    if (e.code === 'Space' && tag !== 'INPUT' && tag !== 'SELECT' && tag !== 'BUTTON') {
      e.preventDefault();
      setPlaying(!state.playing);
    }
  });

  // Drag and drop: images or settings files anywhere on the page
  let dragDepth = 0;
  window.addEventListener('dragenter', e => { e.preventDefault(); dragDepth++; $('dropHint').hidden = false; });
  window.addEventListener('dragleave', () => { if (--dragDepth <= 0) { dragDepth = 0; $('dropHint').hidden = true; } });
  window.addEventListener('dragover', e => e.preventDefault());
  window.addEventListener('drop', e => {
    e.preventDefault();
    dragDepth = 0;
    $('dropHint').hidden = true;
    const file = e.dataTransfer.files[0];
    if (!file) return;
    if (file.name.toLowerCase().endsWith('.json')) loadSettingsFile(file);
    else loadImageFile(file);
  });

  // Start with a test pattern so there is something to look at
  $('patternSelect').value = 'Red/green dot plate';
  setSource(TEST_PATTERNS['Red/green dot plate'](), 'Red/green dot plate');
  requestAnimationFrame(tick);
}

init();
