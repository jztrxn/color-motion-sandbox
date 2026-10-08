// =====================================================================
//  testpatterns.js — built-in pictures, so the app works without an upload.
//  Each function returns a <canvas>. Random patterns use a fixed seed,
//  so they come out identical every time.
// =====================================================================

const TEST_PATTERNS = {
  'Hue wheel': drawHueWheel,
  'Red/green dot plate': drawDotPlate,
  'Color swatches': drawSwatches,
};

// Hue goes around the circle; saturation increases from the center outward.
function drawHueWheel(size = 600) {
  const canvas = makeCanvas(size, size);
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(size, size);
  const c = size / 2, radius = size * 0.46;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - c, dy = c - y;               // dy: up is positive
      const r = Math.hypot(dx, dy);
      let rgb = [0.5, 0.5, 0.5];
      if (r <= radius) {
        const hue = (Math.atan2(dy, dx) * 180 / Math.PI + 360) % 360;
        rgb = hsvToRgb(hue, r / radius, 1);
      }
      const i = 4 * (y * size + x);
      img.data[i] = rgb[0] * 255; img.data[i + 1] = rgb[1] * 255;
      img.data[i + 2] = rgb[2] * 255; img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

// Ishihara-style plate: red-ish dots form a "12" among green-ish dots.
function drawDotPlate(size = 600) {
  const canvas = makeCanvas(size, size);
  const ctx = canvas.getContext('2d');

  // Draw the hidden number into a mask
  const mask = makeCanvas(size, size);
  const mctx = mask.getContext('2d');
  mctx.fillStyle = '#000';
  mctx.font = `bold ${Math.round(size * 0.55)}px Helvetica, Arial, sans-serif`;
  mctx.textAlign = 'center';
  mctx.textBaseline = 'middle';
  mctx.fillText('12', size / 2, size / 2 + size * 0.03);
  const maskData = mctx.getImageData(0, 0, size, size).data;
  const inFigure = (x, y) => maskData[4 * (Math.round(y) * size + Math.round(x)) + 3] > 128;

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, size, size);

  const rand = seededRandom(12345);
  const figureColors = ['#d9694a', '#e08a5a', '#c95f3f', '#e39b6b', '#cf7a4c'];
  const groundColors = ['#8fa65a', '#a2b56a', '#7f9a53', '#b2bf78', '#98aa62'];
  const c = size / 2, plateR = size * 0.47;
  const dots = [];

  for (let tries = 0; tries < 20000; tries++) {
    const r = size * (0.008 + rand() * 0.022);
    const x = c + (rand() * 2 - 1) * plateR, y = c + (rand() * 2 - 1) * plateR;
    if (Math.hypot(x - c, y - c) + r > plateR) continue;
    if (dots.some(d => Math.hypot(d.x - x, d.y - y) < d.r + r + 1)) continue;
    dots.push({ x, y, r });
    const palette = inFigure(x, y) ? figureColors : groundColors;
    ctx.fillStyle = palette[Math.floor(rand() * palette.length)];
    ctx.beginPath();
    ctx.arc(x, y, r, 0, 2 * Math.PI);
    ctx.fill();
  }
  return canvas;
}

// Columns of hues, rows from full saturation (top) down to gray (bottom).
function drawSwatches(width = 600, height = 400) {
  const canvas = makeCanvas(width, height);
  const ctx = canvas.getContext('2d');
  const hues = [0, 60, 120, 180, 240, 300];
  const sats = [1, 0.66, 0.33, 0];
  const cw = width / hues.length, ch = height / sats.length;
  hues.forEach((h, i) => sats.forEach((s, j) => {
    const [r, g, b] = hsvToRgb(h, s, 0.85);
    ctx.fillStyle = `rgb(${r * 255},${g * 255},${b * 255})`;
    ctx.fillRect(Math.round(i * cw), Math.round(j * ch), Math.ceil(cw), Math.ceil(ch));
  }));
  return canvas;
}


// ---- helpers ---------------------------------------------------------

function makeCanvas(w, h) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  return canvas;
}

// hue in degrees, s and v in 0..1  ->  [r, g, b] in 0..1
function hsvToRgb(h, s, v) {
  const f = n => {
    const k = (n + h / 60) % 6;
    return v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
  };
  return [f(5), f(3), f(1)];
}

// Small repeatable random-number generator (mulberry32).
function seededRandom(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
