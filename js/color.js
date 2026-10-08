// =====================================================================
//  color.js — color math.
//  rgbToLab is a line-by-line port of my_rgb2lab / lab_f from
//  ColorTest_matlab.m (sRGB, D65 white point).
// =====================================================================

// ---- sRGB gamma <-> linear light (one channel, range 0..1) ----------

function srgbToLinear(c) {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function linearToSrgb(c) {
  return c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}


// ---- RGB -> CIELAB  (port of my_rgb2lab) -----------------------------

const LAB_DELTA = 6 / 29;

function labF(t) {
  return t > LAB_DELTA ** 3 ? Math.cbrt(t) : t / (3 * LAB_DELTA ** 2) + 4 / 29;
}

// r, g, b in 0..1  ->  [L, a, b]
function rgbToLab(r, g, b) {
  const R = srgbToLinear(Math.min(Math.max(r, 0), 1));
  const G = srgbToLinear(Math.min(Math.max(g, 0), 1));
  const B = srgbToLinear(Math.min(Math.max(b, 0), 1));

  // linear RGB -> XYZ
  const X = 0.4124564 * R + 0.3575761 * G + 0.1804375 * B;
  const Y = 0.2126729 * R + 0.7151522 * G + 0.0721750 * B;
  const Z = 0.0193339 * R + 0.1191920 * G + 0.9503041 * B;

  // divide by the D65 white point
  const fx = labF(X / 0.95047);
  const fy = labF(Y / 1.00000);
  const fz = labF(Z / 1.08883);

  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}


// ---- RGB -> HSV ------------------------------------------------------

// r, g, b in 0..1  ->  [hue in radians (0..2π), saturation 0..1, value 0..1]
function rgbToHsv(r, g, b) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d > 0) {
    if (max === r)      h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else                h = (r - g) / d + 4;
    h *= Math.PI / 3;
    if (h < 0) h += 2 * Math.PI;
  }
  return [h, max === 0 ? 0 : d / max, max];
}


// ---- Color-vision-deficiency simulation ------------------------------
// Machado, Oliveira & Fernandes (2009), severity 1.0.
// The matrices act on LINEAR RGB.

const VIEWER_MATRICES = {
  protan: [ 0.152286, 1.052583, -0.204868,
            0.114503, 0.786281,  0.099216,
           -0.003882, -0.048116, 1.051998],
  deutan: [ 0.367322, 0.860646, -0.227968,
            0.280085, 0.672501,  0.047413,
           -0.011820, 0.042940,  0.968881],
  tritan: [ 1.255528, -0.076749, -0.178779,
           -0.078411,  0.930809,  0.147602,
            0.004733,  0.691367,  0.303900],
  achromat: [0.2126, 0.7152, 0.0722,
             0.2126, 0.7152, 0.0722,
             0.2126, 0.7152, 0.0722],
};

// Lookup tables so the simulation is fast enough to run on every frame.
const LUT_SIZE = 4096;
const TO_LINEAR_LUT = new Float32Array(LUT_SIZE + 1);
const TO_SRGB_LUT = new Float32Array(LUT_SIZE + 1);
for (let i = 0; i <= LUT_SIZE; i++) {
  TO_LINEAR_LUT[i] = srgbToLinear(i / LUT_SIZE);
  TO_SRGB_LUT[i] = linearToSrgb(i / LUT_SIZE);
}

// Applies the viewer simulation to one pixel in place.
// px is an array [r, g, b] in 0..1 (already clipped).
function simulateViewerPixel(px, matrix) {
  const r = TO_LINEAR_LUT[Math.round(px[0] * LUT_SIZE)];
  const g = TO_LINEAR_LUT[Math.round(px[1] * LUT_SIZE)];
  const b = TO_LINEAR_LUT[Math.round(px[2] * LUT_SIZE)];
  for (let c = 0; c < 3; c++) {
    let v = matrix[3 * c] * r + matrix[3 * c + 1] * g + matrix[3 * c + 2] * b;
    v = Math.min(Math.max(v, 0), 1);
    px[c] = TO_SRGB_LUT[Math.round(v * LUT_SIZE)];
  }
}

// '#rrggbb' -> [r, g, b] in 0..1
function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}
