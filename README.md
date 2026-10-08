# Color → Motion Sandbox

Adds moving stripes to an image so that **color is also shown as motion**:

- **Hue → direction** the stripes move
- **Saturation / chroma → speed**

It is a browser version of `ColorTest_matlab.m`, with sliders for every setting, a live preview, and MP4 export.

## Opening it

**Double-click `index.html`.** It opens in your web browser. There is nothing to install and no internet connection is needed.

Use **Chrome, Edge, or Safari 17+**. Firefox can show the preview but may not be able to export MP4s.

To share it, send the whole folder (zipped). `index.html` needs the `js/` and `lib/` folders and `styles.css` beside it.

## Using it

1. **Load a picture.** Click **Open image…**, or drag an image anywhere onto the page. Color or grayscale both work. You can also pick a built-in **Test pattern**.
2. **Adjust the sliders** on the right. The animation updates immediately, and every control has a short explanation underneath.
3. **Presets:**
   - **MATLAB original**: the same behavior as `ColorTest_matlab.m`. These are also the default settings.
   - **Improved**: fixes some issues with the original:
     - the same color gets the same speed in every image
     - gray areas don't move
     - stripes don't break up into noise
     - blocks blend smoothly instead of showing seams
4. **Export MP4.** This saves two files:
   - `<image>_motion.mp4`: the movie
   - `<image>_motion_settings.json`: every setting that was used

   If the browser asks whether to allow multiple downloads, click **Allow**.
5. **Reproducing a video later.** Open the same image, then use **Load settings…** (or drag the `.json` onto the page). The same image with the same settings always gives the same frames.

**Simulate viewer** (under *Viewing*) shows roughly what someone with protanopia, deuteranopia or tritanopia would see, so you can check whether the motion alone separates the colors. Set it back to *Normal* before exporting the real stimulus. The app warns you if you forget.

## Where things are in the code

| File | What it does | Edit it to… |
|---|---|---|
| `js/settings.js` | **Every parameter**: default, range, explanation; plus the presets | change defaults, add a slider, add a preset |
| `js/motion.js` | The algorithm, step by step, labelled with the matching MATLAB variable names | change how color turns into motion |
| `js/color.js` | Color conversions (port of `my_rgb2lab`), color-blindness simulation | change color math |
| `js/testpatterns.js` | Built-in test images | add a test image |
| `js/export.js` | MP4 and settings-file export | change video quality or format |
| `js/ui.js`, `index.html`, `styles.css` | The page and controls | change the layout |
| `lib/mp4-muxer.js` | Third-party MP4 file writer (MIT license) | nothing; leave it as is |

After editing any file, **reload the page** in the browser to see the change.

### Adding a new parameter

1. Add an entry to `PARAMETERS` in `js/settings.js` (copy an existing one). The slider appears automatically.
2. Use it in `js/motion.js` as `s.yourKey`.

## Differences from the MATLAB script

With the **MATLAB original** preset, the output follows `ColorTest_matlab.m`. The color conversion and the stripe formula were checked number-for-number against it. The differences:

- The image is scaled so its longest side is at most **Max image size**, and width/height are rounded down to even numbers (MP4 requires this). Set Max image size to at least the image's size to keep full resolution.
- Video is H.264 from the browser's encoder, so compression artifacts can differ slightly from MATLAB's `VideoWriter`.
