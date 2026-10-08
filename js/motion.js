// =====================================================================
//  motion.js — the color → motion algorithm.
//
//  It runs in three stages so the live preview stays fast:
//
//    1. analyzeColors()   once per image:     hue + chroma of every pixel
//    2. buildMotionMaps() once per settings change:
//                          direction, speed and block layout of the stripes
//    3. renderFrame()     once per frame:     draw the stripes at time t
//                                             on top of the image
//
//  The steps follow ColorTest_matlab.m. Comments in [brackets] name the
//  matching MATLAB variable.
//
//  An "image" here is { width, height, rgb } where rgb is a Float32Array
//  of r,g,b,r,g,b,... values in 0..1 (the MATLAB `img` after im2double).
// =====================================================================

const EPS = 2.220446049250313e-16;   // same as MATLAB's eps


// ---------------------------------------------------------------------
//  STAGE 1 — hue and chroma of every pixel
//  [labImg, hueAngle, chroma]
//
//  Each pixel's color is first written as two numbers (c1, c2), a point
//  on a color plane:
//      CIELAB          c1 = a*            c2 = b*
//      HSV             c1 = 100·S·cos H   c2 = 100·S·sin H
//      red–green axis  c1 = a*            c2 = 0
//  Then hue = the angle of that point and chroma = its distance from gray.
//
//  If smoothingRadius > 0, c1 and c2 are blurred first, so neighboring
//  pixels get nearly the same direction and speed. Blurring (c1, c2)
//  rather than the hue angle handles wrap-around correctly: 350° and 10°
//  average to 0°, not 180°.
// ---------------------------------------------------------------------
function analyzeColors(image, colorSpace, smoothingRadius = 0) {
  const W = image.width, H = image.height, N = W * H;
  const c1 = new Float32Array(N);
  const c2 = new Float32Array(N);
  const rgb = image.rgb;

  for (let i = 0; i < N; i++) {
    const r = rgb[3 * i], g = rgb[3 * i + 1], b = rgb[3 * i + 2];
    if (colorSpace === 'hsv') {
      const [h, sat] = rgbToHsv(r, g, b);
      c1[i] = 100 * sat * Math.cos(h);
      c2[i] = 100 * sat * Math.sin(h);
    } else if (colorSpace === 'labRedGreen') {
      const [, A] = rgbToLab(r, g, b);
      c1[i] = A;                              // a* > 0 (reddish) → right, a* < 0 (greenish) → left
      c2[i] = 0;
    } else {
      const [, A, B] = rgbToLab(r, g, b);
      c1[i] = A;
      c2[i] = B;
    }
  }

  if (smoothingRadius > 0) {
    blurComponent(c1, W, H, smoothingRadius);
    blurComponent(c2, W, H, smoothingRadius);
  }

  const hue = new Float32Array(N);      // radians
  const chroma = new Float32Array(N);   // CIELAB chroma, HSV saturation × 100, or |a*|
  for (let i = 0; i < N; i++) {
    hue[i] = Math.atan2(c2[i], c1[i]);                  // hueAngle = atan2(b, a)
    chroma[i] = Math.sqrt(c1[i] * c1[i] + c2[i] * c2[i]); // chroma = sqrt(a.^2 + b.^2)
  }
  return { hue, chroma };
}

// Blurs one W×H channel in place. Three passes of a box blur
// (horizontal, then vertical) closely approximate a Gaussian blur, and
// the time it takes doesn't depend on the radius. Edges repeat the
// border pixel.
function blurComponent(values, W, H, radius) {
  const r = Math.round(radius);
  const temp = new Float32Array(values.length);
  for (let pass = 0; pass < 3; pass++) {
    boxBlurLines(values, temp, W, H, r, 1, W);   // along rows
    boxBlurLines(temp, values, H, W, r, W, 1);   // along columns
  }
}

// Box-blurs `count` lines of `length` samples from src into dst.
// step = distance between samples in a line, lineStep = between lines.
function boxBlurLines(src, dst, length, count, r, step, lineStep) {
  const width = 2 * r + 1;
  for (let line = 0; line < count; line++) {
    const start = line * lineStep;
    const at = k => src[start + Math.min(Math.max(k, 0), length - 1) * step];
    let sum = 0;
    for (let k = -r; k <= r; k++) sum += at(k);
    for (let k = 0; k < length; k++) {
      dst[start + k * step] = sum / width;
      sum += at(k + r + 1) - at(k - r);
    }
  }
}


// ---------------------------------------------------------------------
//  STAGE 2 — motion maps
//
//  The result is a flat list of "entries". Each entry is one pixel inside
//  one block, holding:
//      pixel   which image pixel it belongs to
//      phase   where that pixel sits along the stripe pattern (radians)
//      omega   how fast the pattern moves there (radians per second)
//      weight  how much this block counts for that pixel (window ÷ total)
//  With no overlap each pixel has one entry. With overlap it has several,
//  which get blended together.
// ---------------------------------------------------------------------
function buildMotionMaps(image, colors, s) {
  const W = image.width, H = image.height, N = W * H;

  // ---- Step A: direction of motion for each pixel  [theta = hueAngle]
  const theta = new Float32Array(N);
  const offset = s.hueOffset * Math.PI / 180;
  const wheelSign = s.mirrorWheel ? -1 : 1;
  for (let i = 0; i < N; i++) theta[i] = wheelSign * colors.hue[i] + offset;

  // ---- Step B: speed for each pixel  [chromaNorm, localTemporalFreq]
  let normalizer;
  if (s.chromaNormalization === 'imageMax') {
    normalizer = 0;                                   // max(chroma(:))
    for (let i = 0; i < N; i++) normalizer = Math.max(normalizer, colors.chroma[i]);
  } else {
    normalizer = s.chromaReference;
  }

  const temporalFreq = new Float32Array(N);   // stripes per second (Hz)
  const moves = new Uint8Array(N);            // 0 = below the gray threshold
  const levels = Number(s.speedLevels);       // 0 = continuous (MATLAB)
  for (let i = 0; i < N; i++) {
    let strength = Math.min(colors.chroma[i] / (normalizer + EPS), 1);
    strength = Math.pow(strength, s.chromaGamma);
    // Round to a few fixed speeds, so pixels in the same step never drift apart
    if (levels >= 2) strength = Math.round(strength * (levels - 1)) / (levels - 1);
    temporalFreq[i] = s.minTemporalFreq + strength * (s.maxTemporalFreq - s.minTemporalFreq);
    moves[i] = colors.chroma[i] >= s.minChroma ? 1 : 0;
  }

  // ---- Step C: lay out the blocks  [nBlockY, nBlockX, y1:y2, x1:x2]
  const B = s.blockSize;
  const stepPx = Math.max(1, Math.round(B * (1 - Number(s.blockOverlap))));
  const xStarts = blockStarts(W, B, stepPx);
  const yStarts = blockStarts(H, B, stepPx);

  let nEntries = 0;
  for (const y0 of yStarts) for (const x0 of xStarts) {
    nEntries += (Math.min(y0 + B, H) - y0) * (Math.min(x0 + B, W) - x0);
  }

  const pixel = new Int32Array(nEntries);
  const phase = new Float32Array(nEntries);
  const omega = new Float32Array(nEntries);
  const weight = new Float32Array(nEntries);
  const weightSum = new Float32Array(N);       // [weightSum]

  // ---- Step D: fill in every block
  let e = 0;
  for (const y0 of yStarts) {
    for (const x0 of xStarts) {
      const localH = Math.min(y0 + B, H) - y0;
      const localW = Math.min(x0 + B, W) - x0;

      const wx = s.useWindow ? hannWindow(localW) : ones(localW);   // [local_hann]
      const wy = s.useWindow ? hannWindow(localH) : ones(localH);

      // Speed for the whole block, if speed is set per block
      let blockFreq = null;
      if (s.speedMode === 'block') {
        let sum = 0, count = 0;
        for (let iy = 0; iy < localH; iy++) for (let ix = 0; ix < localW; ix++) {
          const p = (y0 + iy) * W + (x0 + ix);
          if (moves[p]) { sum += temporalFreq[p]; count++; }
        }
        blockFreq = count > 0 ? sum / count : s.minTemporalFreq;
      }

      for (let iy = 0; iy < localH; iy++) {
        for (let ix = 0; ix < localW; ix++) {
          const x = x0 + ix, y = y0 + iy, p = y * W + x;

          // Position of this pixel in "stripe coordinates"  [X, Y]
          let X, Y;
          if (s.gratingCoords === 'block') {
            // MATLAB: meshgrid(linspace(-1,1,localW), linspace(-1,1,localH))
            X = localW === 1 ? 1 : -1 + 2 * ix / (localW - 1);
            Y = localH === 1 ? 1 : -1 + 2 * iy / (localH - 1);
          } else {
            // Same scale (half a block = 1 unit), shared across the image
            X = x / (B / 2);
            Y = y / (B / 2);
          }

          // directionAxis = X.*cos(theta) + Y.*sin(theta)
          const directionAxis = X * Math.cos(theta[p]) + Y * Math.sin(theta[p]);
          const f = blockFreq !== null ? blockFreq : temporalFreq[p];
          const w = wy[iy] * wx[ix];                 // window = wy * wx

          pixel[e] = p;
          phase[e] = 2 * Math.PI * s.spatialFreq * directionAxis;
          omega[e] = 2 * Math.PI * f;
          weight[e] = w * moves[p];
          weightSum[p] += w;
          e++;
        }
      }
    }
  }

  // ---- Step E: divide by the total window weight  [./ (weightSum + eps)]
  for (let k = 0; k < nEntries; k++) weight[k] /= (weightSum[pixel[k]] + EPS);

  return {
    width: W, height: H, nEntries, pixel, phase, omega, weight,
    overlay: new Float32Array(N),   // reused every frame  [motionOverlay]
  };
}

// Block start positions along one side: 0, step, 2·step, ... until the end is covered.
function blockStarts(length, blockSize, stepPx) {
  const starts = [];
  for (let start = 0; ; start += stepPx) {
    starts.push(start);
    if (start + blockSize >= length) break;
  }
  return starts;
}

// Toolbox-free Hann window  [local_hann]
function hannWindow(n) {
  if (n <= 1) return ones(n);
  const w = new Float32Array(n);
  for (let i = 0; i < n; i++) w[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (n - 1));
  return w;
}

function ones(n) {
  return new Float32Array(n).fill(1);
}


// ---------------------------------------------------------------------
//  STAGE 3 — draw one frame at time t (seconds)
//  out: an ImageData of the same size as the image.
// ---------------------------------------------------------------------
function renderFrame(maps, image, s, t, out) {
  // ---- Moving stripes  [grating = sin(2*pi*spatialFreq*directionAxis - phase)]
  const overlay = maps.overlay;
  overlay.fill(0);
  const square = s.waveform === 'square';
  for (let k = 0; k < maps.nEntries; k++) {
    let v = Math.sin(maps.phase[k] - maps.omega[k] * t);
    if (square) v = v >= 0 ? 1 : -1;
    overlay[maps.pixel[k]] += maps.weight[k] * v;
  }

  // ---- Put the stripes on top of the image  [frameImg = img + contrast*overlay]
  const contrast = s.maxMotionContrast;
  const baseStrength = s.baseImageStrength;
  const bar = hexToRgb(s.barColor);
  const dark = hexToRgb(s.darkBarColor);
  const matrix = VIEWER_MATRICES[s.simulateViewer] || null;
  const rgb = image.rgb, data = out.data, px = [0, 0, 0];

  for (let p = 0; p < overlay.length; p++) {
    const o = overlay[p];
    for (let c = 0; c < 3; c++) {
      // the picture underneath (fades to mid-gray as baseStrength → 0)
      const base = rgb[3 * p + c] * baseStrength + 0.5 * (1 - baseStrength);
      let v;
      if (s.barMode === 'add') {
        v = base + contrast * o * bar[c];
      } else {
        const alpha = Math.min(contrast * Math.abs(o), 1);
        v = base * (1 - alpha) + (o > 0 ? bar[c] : dark[c]) * alpha;
      }
      px[c] = Math.min(Math.max(v, 0), 1);       // min(max(frameImg,0),1)
    }
    if (matrix) simulateViewerPixel(px, matrix);
    data[4 * p]     = Math.round(px[0] * 255);
    data[4 * p + 1] = Math.round(px[1] * 255);
    data[4 * p + 2] = Math.round(px[2] * 255);
    data[4 * p + 3] = 255;
  }
}

// Draws the unchanged image (with the viewer simulation, if any).
function renderOriginal(image, s, out) {
  const matrix = VIEWER_MATRICES[s.simulateViewer] || null;
  const rgb = image.rgb, data = out.data, px = [0, 0, 0];
  const N = image.width * image.height;
  for (let p = 0; p < N; p++) {
    px[0] = rgb[3 * p]; px[1] = rgb[3 * p + 1]; px[2] = rgb[3 * p + 2];
    if (matrix) simulateViewerPixel(px, matrix);
    data[4 * p]     = Math.round(px[0] * 255);
    data[4 * p + 1] = Math.round(px[1] * 255);
    data[4 * p + 2] = Math.round(px[2] * 255);
    data[4 * p + 3] = 255;
  }
}
