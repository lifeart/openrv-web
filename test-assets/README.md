# Test Assets

This directory contains test assets for E2E and visual testing of OpenRV Web.

## LUT Files

### gamma_2.2.cube
1D LUT file that applies a gamma 2.2 curve. Used for testing 1D LUT loading and application.

### custom_domain_1d.cube
1D LUT with custom DOMAIN_MIN (0.1) and DOMAIN_MAX (0.9). Used for testing domain clamping behavior.

## Images

### neutral-gray.png
Solid 128,128,128 gray image (256×256). Used for:
- YCbCr waveform testing (should show Cb/Cr at 50%)
- Color calibration baseline

### red-swatch.png
Solid red (255,0,0) image (256×256). Used for:
- YCbCr testing (high Cr, low Cb)
- Color channel isolation testing

### noisy-image.png
Gray image with visible random noise (256×256). Used for:
- Noise reduction filter testing
- Filter effectiveness measurement

### edge-with-noise.png
Sharp vertical edge with noise (256×256). Used for:
- Edge preservation testing in noise reduction
- Bilateral filter quality verification

### logo.png
Simple white text logo on transparent background (100×40). Used for:
- Watermark overlay testing
- Position/scale/opacity testing

## Sequences

### sequence-with-gaps/
Image sequence with intentionally missing frames for testing:
- frame_0001.png
- frame_0002.png
- (frame_0003.png missing)
- frame_0004.png
- frame_0005.png

Used for:
- Missing frame detection
- Timeline marker testing
- Missing frame overlay testing

## Generating Images

To regenerate the PNG images, install the `canvas` package and run:

```bash
pnpm add -D canvas
npx tsx test-assets/generate-test-images.ts
```

## JPEG 2000 / HTJ2K (`jpeg2000/`)

Tiny lossless fixtures used by `src/formats/JP2Decoder.wasm.test.ts` (real WASM decode).
All are 16×8. "rgb8" pixels are `(16x, 32y, 255-16x)`.

| File | Format | Content | Generated with |
|------|--------|---------|----------------|
| `rgb8.jp2` | JP2 box, classic J2K | rgb8 | Pillow `save(irreversible=False)` |
| `rgb8.j2k` | raw classic codestream, 2 decomposition levels | rgb8 | Pillow `save(irreversible=False, num_resolutions=3)` |
| `gray8.jp2` | JP2 box, classic J2K | L = 16x | Pillow |
| `rgba8.jp2` | JP2 box, classic J2K, 4 components | rgb8 + alpha 128 | Pillow (unsupported by the OpenJPEG wrapper; error-path test) |
| `gray16.j2k` | raw classic codestream, 16-bit | `(4096x + 16y) & 0xffff` | Pillow (`I;16`) |
| `rgb8_codestream.jhc` | raw HTJ2K codestream, 2 levels | rgb8 | `@cornerstonejs/codec-openjph` `HTJ2KEncoder` |
| `rgb8.jph` | JPH box file wrapping the above | rgb8 | hand-built boxes (`jP  `, `ftyp jph `, `jp2h`, `jp2c`) |
| `rgba8.jhc` | raw HTJ2K codestream, 4 components | rgb8 + alpha 128 | `HTJ2KEncoder` |
| `gray12.j2c` | raw HTJ2K codestream, 12-bit | `256x + y` | `HTJ2KEncoder` |
| `signed16.j2c` | raw HTJ2K codestream, signed 16-bit | `-32768 + 512 * (y*16 + x)` | `HTJ2KEncoder` |
