// =====================================================================
//  settings.js — EVERY adjustable parameter lives here.
// =====================================================================
//
//  The control panel on the right of the app is built automatically
//  from the PARAMETERS list below. To add, remove, or change a slider,
//  edit this file only.
//
//  Each entry has:
//    key      name used in the code (settings.<key>) and in saved .json files
//    group    which panel section it appears in
//    label    text shown next to the control
//    type     'range' (slider), 'select' (dropdown), 'checkbox', or 'color'
//    default  starting value
//    min/max/step/unit   for sliders
//    options  for dropdowns: [{ value, label }]
//    help     plain-English explanation (shown under the control)
//    rebuild  what has to be recomputed when it changes:
//               'image'  - reload/rescale the picture (slowest)
//               'colors' - re-analyze the colors
//               'maps'   - rebuild the motion maps (default)
//               'frame'  - just redraw (fastest)
//    showIf   (optional) only show this control when the function returns true
//    readout  (optional) extra live info shown under the value
//
//  Names in [brackets] in the help text are the matching variable in
//  ColorTest_matlab.m.
// =====================================================================

const PARAMETERS = [

  // ------------------------------------------------ Color -> direction
  {
    key: 'colorSpace', group: 'Color → direction', label: 'Color model',
    type: 'select', default: 'lab', rebuild: 'colors',
    options: [
      { value: 'lab', label: 'CIELAB hue (MATLAB)' },
      { value: 'hsv', label: 'HSV color wheel' },
      { value: 'labRedGreen', label: 'Red–green axis only (red →, green ←)' },
    ],
    help: 'How "hue" is measured. CIELAB hue: pure red is 40° and pure green is 136°, so they move only about 96° apart. HSV: red 0°, green 120°. "Red–green axis only" uses just CIELAB a* (the red-versus-green signal): reddish pixels move right and greenish pixels move left, and the speed comes from how strongly red or green they are.',
  },
  {
    key: 'hueOffset', group: 'Color → direction', label: 'Rotate directions',
    type: 'range', default: 0, min: -180, max: 180, step: 1, unit: '°',
    help: 'Adds this angle to every direction. Use it to choose which color moves right, up, and so on.',
  },
  {
    key: 'mirrorWheel', group: 'Color → direction', label: 'Mirror the color wheel',
    type: 'checkbox', default: false,
    help: 'Runs the hue → direction wheel the other way round (clockwise instead of counter-clockwise).',
  },

  // ------------------------------------------------ Color -> speed
  {
    key: 'minTemporalFreq', group: 'Color → speed', label: 'Slowest speed',
    type: 'range', default: 0.2, min: 0, max: 10, step: 0.1, unit: 'Hz',
    help: 'Stripes per second passing a point, for the least colorful pixels. [minTemporalFreq]',
  },
  {
    key: 'maxTemporalFreq', group: 'Color → speed', label: 'Fastest speed',
    type: 'range', default: 5.0, min: 0, max: 10, step: 0.1, unit: 'Hz',
    help: 'Stripes per second passing a point, for the most colorful pixels. [maxTemporalFreq]',
  },
  {
    key: 'chromaNormalization', group: 'Color → speed', label: 'Speed scale',
    type: 'select', default: 'imageMax',
    options: [
      { value: 'imageMax', label: 'Relative to this image (MATLAB)' },
      { value: 'fixed', label: 'Fixed scale (same in every image)' },
    ],
    help: '"Relative" makes the most colorful pixel in each image the fastest, so the same red can move at different speeds in different images. "Fixed" gives a color the same speed in every image.',
  },
  {
    key: 'chromaReference', group: 'Color → speed', label: 'Chroma for full speed',
    type: 'range', default: 100, min: 5, max: 150, step: 1, unit: '',
    showIf: s => s.chromaNormalization === 'fixed',
    help: 'Chroma (colorfulness) that reaches the fastest speed. CIELAB chroma: pure sRGB red ≈ 105, green ≈ 120. HSV: saturation × 100.',
  },
  {
    key: 'chromaGamma', group: 'Color → speed', label: 'Chroma gamma',
    type: 'range', default: 0.6, min: 0.1, max: 3, step: 0.05, unit: '',
    help: 'Below 1, small differences between weak colors give bigger speed differences. 1 = straight line. [chromaGamma]',
  },
  {
    key: 'minChroma', group: 'Color → speed', label: 'Gray threshold',
    type: 'range', default: 0, min: 0, max: 50, step: 1, unit: '',
    help: 'Pixels with less chroma than this get no stripes at all. 0 = every pixel moves, even pure gray, as in MATLAB.',
  },
  {
    key: 'speedMode', group: 'Color → speed', label: 'Speed set per',
    type: 'select', default: 'pixel',
    options: [
      { value: 'pixel', label: 'Pixel (MATLAB)' },
      { value: 'block', label: 'Block (average)' },
    ],
    help: 'Per pixel: neighboring pixels with slightly different chroma drift apart over time and the stripes can turn noisy. Per block: every pixel in a block moves at the block\'s average speed, which keeps the stripes clean.',
  },

  // ------------------------------------------------ Grating (the stripes)
  {
    key: 'spatialFreq', group: 'Stripes', label: 'Spatial frequency',
    type: 'range', default: 2, min: 0.25, max: 10, step: 0.25, unit: '',
    readout: s => `≈ ${(s.blockSize / (2 * s.spatialFreq)).toFixed(1)} px from one stripe to the next`,
    help: 'How closely packed the stripes are. Same units as MATLAB: cycles per half-block. [spatialFreq]',
  },
  {
    key: 'waveform', group: 'Stripes', label: 'Stripe shape',
    type: 'select', default: 'sine',
    options: [
      { value: 'sine', label: 'Smooth (sine, MATLAB)' },
      { value: 'square', label: 'Hard-edged bars (square)' },
    ],
    help: 'Smooth light-to-dark waves, or solid bars with hard edges.',
  },
  {
    key: 'gratingCoords', group: 'Stripes', label: 'Stripe layout',
    type: 'select', default: 'block',
    options: [
      { value: 'block', label: 'Restart in each block (MATLAB)' },
      { value: 'global', label: 'Continuous across the image' },
    ],
    help: 'MATLAB lays out the stripes separately inside each block, which leaves visible seams. "Continuous" runs them across the whole image so blocks join up.',
  },
  {
    key: 'maxMotionContrast', group: 'Stripes', label: 'Stripe strength',
    type: 'range', default: 0.30, min: 0, max: 1, step: 0.01, unit: '', rebuild: 'frame',
    help: 'How visible the stripes are on top of the image. [maxMotionContrast]',
  },
  {
    key: 'barMode', group: 'Stripes', label: 'How stripes are drawn',
    type: 'select', default: 'add', rebuild: 'frame',
    options: [
      { value: 'add', label: 'Add light / dark (MATLAB)' },
      { value: 'mix', label: 'Blend toward two colors' },
    ],
    help: '"Add" brightens and darkens the image (a white bar color = MATLAB). "Blend" fades the image toward the bar color on bright stripes and toward the dark color on dark stripes.',
  },
  {
    key: 'barColor', group: 'Stripes', label: 'Bar color',
    type: 'color', default: '#ffffff', rebuild: 'frame',
    help: 'Color of the bright stripes. White = brightness-only stripes, as in MATLAB.',
  },
  {
    key: 'darkBarColor', group: 'Stripes', label: 'Dark bar color',
    type: 'color', default: '#000000', rebuild: 'frame',
    showIf: s => s.barMode === 'mix',
    help: 'Color of the dark stripes (blend mode only).',
  },

  // ------------------------------------------------ Blocks
  {
    key: 'blockSize', group: 'Blocks', label: 'Block size',
    type: 'range', default: 36, min: 4, max: 200, step: 1, unit: 'px',
    help: 'The image is cut into square blocks and each block gets its own patch of stripes. [blockSize]',
  },
  {
    key: 'blockOverlap', group: 'Blocks', label: 'Block overlap',
    type: 'select', default: '0',
    options: [
      { value: '0', label: 'None (MATLAB)' },
      { value: '0.25', label: '25%' },
      { value: '0.5', label: '50%' },
      { value: '0.75', label: '75%' },
    ],
    help: 'Overlapping blocks blend smoothly into each other. With no overlap (MATLAB), the soft edges have no effect except to blank the outermost row and column of every block.',
  },
  {
    key: 'useWindow', group: 'Blocks', label: 'Soft block edges (Hann window)',
    type: 'checkbox', default: true,
    help: 'Fades each block\'s stripes toward its edges. Only really matters when blocks overlap.',
  },

  // ------------------------------------------------ Viewing
  {
    key: 'baseImageStrength', group: 'Viewing', label: 'Show original colors',
    type: 'range', default: 1, min: 0, max: 1, step: 0.05, unit: '', rebuild: 'frame',
    help: '1 = full image under the stripes (MATLAB). 0 = plain gray, so you see the motion alone.',
  },
  {
    key: 'simulateViewer', group: 'Viewing', label: 'Simulate viewer',
    type: 'select', default: 'normal', rebuild: 'frame',
    options: [
      { value: 'normal', label: 'Normal color vision' },
      { value: 'protan', label: 'Protanopia (no red cones)' },
      { value: 'deutan', label: 'Deuteranopia (no green cones)' },
      { value: 'tritan', label: 'Tritanopia (no blue cones)' },
      { value: 'achromat', label: 'Grayscale (no color)' },
    ],
    help: 'Shows roughly what a color-deficient viewer would see (Machado et al. 2009). Exports are simulated too, so set this back to Normal before exporting the real stimulus.',
  },
  {
    key: 'showOriginal', group: 'Viewing', label: 'Show original side by side',
    type: 'checkbox', default: false, rebuild: 'frame',
    help: 'Shows the unchanged image next to the animation. It is not included in the export.',
  },

  // ------------------------------------------------ Output
  {
    key: 'fps', group: 'Output / movie', label: 'Frames per second',
    type: 'range', default: 30, min: 1, max: 60, step: 1, unit: 'fps', rebuild: 'frame',
    help: '[fps]',
  },
  {
    key: 'nFrames', group: 'Output / movie', label: 'Number of frames',
    type: 'range', default: 120, min: 1, max: 900, step: 1, unit: '', rebuild: 'frame',
    readout: s => `= ${(s.nFrames / s.fps).toFixed(2)} seconds`,
    help: '[nFrames]',
  },
  {
    key: 'maxImageSize', group: 'Output / movie', label: 'Max image size',
    type: 'range', default: 600, min: 100, max: 1600, step: 10, unit: 'px', rebuild: 'image',
    help: 'Larger images are scaled down so their longest side is at most this. Bigger is sharper but slower. Width and height are rounded down to even numbers, which MP4 needs.',
  },
];


// ---------------------------------------------------------------------
//  PRESETS — named sets of values. Anything not listed keeps its default.
// ---------------------------------------------------------------------
const PRESETS = {
  'MATLAB original': {
    // Every default above already matches ColorTest_matlab.m.
    // MATLAB uses the full image resolution, so the size limit is raised.
    maxImageSize: 1600,
  },
  'Improved': {
    chromaNormalization: 'fixed',
    chromaReference: 100,
    minChroma: 5,
    speedMode: 'block',
    gratingCoords: 'global',
    blockOverlap: '0.5',
  },
};


// Returns a fresh settings object filled with every default value.
function defaultSettings() {
  const s = {};
  for (const p of PARAMETERS) s[p.key] = p.default;
  return s;
}

// Returns the settings for a named preset (defaults + the preset's changes).
function presetSettings(name) {
  return Object.assign(defaultSettings(), PRESETS[name] || {});
}
