// =====================================================================
//  export.js — MP4 export and settings files.
//
//  The MP4 is built frame by frame: frame k is drawn at exactly
//  t = k / fps (as in the MATLAB loop) and encoded as H.264 with the
//  browser's built-in encoder (WebCodecs). The frames are then packed into
//  an .mp4 file with mp4-muxer (lib/mp4-muxer.js). Because it doesn't
//  record the screen, the result doesn't depend on how fast the computer is.
// =====================================================================

const APP_VERSION = '1.0';

function canExportMp4() {
  return typeof VideoEncoder !== 'undefined' && typeof VideoFrame !== 'undefined';
}

// H.264 profiles to try, best first. Level 5.1 allows large frame sizes.
const H264_CODECS = ['avc1.640033', 'avc1.4d0033', 'avc1.420033', 'avc1.42001f'];

async function pickEncoderConfig(width, height, fps) {
  // A generous bitrate: fine moving stripes compress poorly.
  const bitrate = Math.max(2e6, Math.round(width * height * fps * 0.5));
  for (const codec of H264_CODECS) {
    const config = { codec, width, height, bitrate, framerate: fps };
    try {
      const { supported } = await VideoEncoder.isConfigSupported(config);
      if (supported) return config;
    } catch (err) { /* try the next one */ }
  }
  return null;
}

// Renders every frame and returns the finished MP4 as a Blob.
// onProgress(fraction) is called as frames are encoded.
async function exportMp4(maps, image, s, onProgress) {
  if (!canExportMp4()) {
    throw new Error('This browser cannot create MP4 files. Please use Chrome, Edge, or Safari 17+.');
  }
  const W = image.width, H = image.height;
  const fps = s.fps, nFrames = s.nFrames;
  const config = await pickEncoderConfig(W, H, fps);
  if (!config) throw new Error(`This browser cannot encode H.264 video at ${W}×${H}. Try a smaller "Max image size".`);

  const muxer = new Mp4Muxer.Muxer({
    target: new Mp4Muxer.ArrayBufferTarget(),
    video: { codec: 'avc', width: W, height: H, frameRate: fps },
    fastStart: 'in-memory',
  });

  let encodeError = null;
  const encoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: err => { encodeError = err; },
  });
  encoder.configure(config);

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  const frameData = ctx.createImageData(W, H);
  const frameDurationUs = 1e6 / fps;

  for (let k = 0; k < nFrames; k++) {
    if (encodeError) throw encodeError;

    const t = k / fps;                                  // t = (frame-1)/fps
    renderFrame(maps, image, s, t, frameData);
    ctx.putImageData(frameData, 0, 0);

    const frame = new VideoFrame(canvas, {
      timestamp: Math.round(k * frameDurationUs),
      duration: Math.round(frameDurationUs),
    });
    encoder.encode(frame, { keyFrame: k % (2 * fps) === 0 });   // keyframe every 2 s
    frame.close();

    // Don't let the encoder fall too far behind
    while (encoder.encodeQueueSize > 8) await new Promise(r => setTimeout(r, 5));
    if (k % 5 === 0) {
      onProgress && onProgress((k + 1) / nFrames);
      await new Promise(r => setTimeout(r, 0));          // let the page repaint
    }
  }

  await encoder.flush();
  if (encodeError) throw encodeError;
  encoder.close();
  muxer.finalize();
  onProgress && onProgress(1);
  return new Blob([muxer.target.buffer], { type: 'video/mp4' });
}


// ---- settings files --------------------------------------------------

// Everything needed to reproduce a video.
function settingsFileContents(s, imageInfo) {
  return JSON.stringify({
    app: 'Color → Motion Sandbox',
    version: APP_VERSION,
    savedAt: new Date().toISOString(),
    image: imageInfo,          // { name, width, height }
    settings: s,
  }, null, 2);
}

// Reads a settings .json and returns the settings it contains.
// Unknown keys are ignored; missing keys keep their default.
async function readSettingsFile(file) {
  const parsed = JSON.parse(await file.text());
  const loaded = parsed.settings || parsed;
  const s = defaultSettings();
  for (const p of PARAMETERS) {
    if (loaded[p.key] !== undefined) s[p.key] = loaded[p.key];
  }
  return { settings: s, image: parsed.image || null };
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
