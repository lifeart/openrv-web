# LUT Loading and Management

Look-Up Tables (LUTs) encode precomputed color transforms that can replicate complex grading operations, film stock emulations, and color space conversions in constant time per pixel. OpenRV Web supports loading external LUT files and provides built-in film emulation presets, all processed on the GPU for real-time performance.

---

## 1D vs 3D LUTs

### 1D LUTs

A 1D LUT applies an independent curve to each color channel. Each input value maps to a single output value per channel. 1D LUTs handle gamma correction, contrast curves, and per-channel color balance, but cannot model cross-channel interactions such as hue rotation or color matrix transforms.

### 3D LUTs

A 3D LUT maps every possible (R, G, B) input triplet to a new output triplet. The data is arranged as a cube where each axis represents one input channel. 3D LUTs can encode any color transform including hue shifts, saturation changes, film stock emulations, and complete color space conversions.

OpenRV Web uses tetrahedral interpolation for 3D LUT sampling on the GPU, which provides higher accuracy than trilinear interpolation at the lattice boundaries. The LUT data is uploaded as a WebGL2 3D texture with `RGB32F` precision for full floating-point accuracy.

---

## Supported Formats

| Format | Extension | Type | Description |
|--------|-----------|------|-------------|
| Adobe/Resolve Cube | `.cube` | 1D and 3D | Industry standard. Supports `TITLE`, `DOMAIN_MIN`, `DOMAIN_MAX`. |
| Autodesk 3DL | `.3dl` | 1D and 3D | Lustre/Flame format. Integer values auto-normalized. |
| Rising Sun CSP | `.csp` | 1D and 3D | CineSpace format with per-channel pre-LUT shapers. |
| IRIDAS ITX | `.itx` | 3D | IRIDAS SpeedGrade format. |
| IRIDAS Look | `.look` | 3D | XML-based IRIDAS format. |
| Houdini LUT | `.lut` | 1D and 3D | Houdini channel (C) and 3D types. |
| Nuke Vectorfield | `.nk` | 3D | Nuke exported vectorfield format. |
| Pandora MGA | `.mga` | 3D | Pandora color corrector format. |
| RV 3D LUT | (native) | 3D | OpenRV native 3D format. |
| RV Channel LUT | (native) | 1D | OpenRV native 1D format. |

---

## Loading a LUT

1. Open the color controls panel (press `C`).
2. In the **LUT** section at the bottom, click the **Load** button.
3. Select a LUT file in any supported format.
4. The LUT is applied immediately to the viewport.

The active LUT name appears below the Load button for quick identification.

To clear the current LUT, click the **Clear** button. The image reverts to its ungraded state.

---

## Intensity Slider

The LUT intensity slider (0% to 100%) controls how strongly the LUT affects the image. At 100%, the full LUT transform is applied. At 0%, the original image is displayed. Intermediate values linearly blend between the original and LUT-processed colors.

This is implemented in the GPU shader as:

```
color = mix(original, lutResult, intensity)
```

Use the intensity slider to:
- Preview a LUT at partial strength before committing
- Dial in a film emulation without fully replacing the original look
- A/B compare the LUT effect by dragging between 0% and 100%

---

## Three-Slot LUT Pipeline

OpenRV Web supports three independent LUT slots, each serving a distinct role in the pipeline:

| Slot | Name | Scope | Pipeline Position | Purpose |
|------|------|-------|-------------------|---------|
| 1 | File LUT | Per-source | Stage 0e-alt (after EOTF) | Input device transform. Replaces automatic input primaries conversion. |
| 2 | Look LUT | Per-source | Stage 6d (after CDL/curves) | Creative color grade. The primary LUT slot for look development. |
| 3 | Display LUT | Session-wide | Stage 7d (after output primaries) | Display calibration. Applied to all sources after gamut mapping. |

Each slot has its own intensity control and operates independently. The Look LUT is the slot exposed through the color controls panel Load button.

---

## Film Emulation Presets

OpenRV Web includes built-in film emulation presets that generate programmatic 17x17x17 3D LUTs:

| Preset | Category | Description |
|--------|----------|-------------|
| Warm Film | Film | Warm golden tones reminiscent of Kodak film stocks |
| Cool Chrome | Film | Cool silver tones with blue shadows |
| Bleach Bypass | Film | Desaturated with increased contrast |
| Cross Process | Creative | Color-shifted look from cross-processing |
| Monochrome | B&W | Classic black and white conversion using Rec. 709 weights |
| Teal & Orange | Creative | Hollywood-style teal shadows with orange highlights |
| Vintage Fade | Creative | Lifted blacks with faded pastel tones |
| High Contrast | Technical | S-curve contrast enhancement |
| Low Contrast | Technical | Reduced contrast for a flat starting point |
| Identity (Bypass) | Technical | No color change -- for testing the LUT pipeline |

Film emulation presets are selected from the LUT presets dropdown and applied as 3D LUTs through the Look LUT slot.

---

## Scripting API

```javascript
// Load a LUT from a File object
window.openrv.color.loadLUT(fileObject);

// Set LUT intensity
window.openrv.color.setLUTIntensity(0.75); // 75%

// Clear the active LUT
window.openrv.color.clearLUT();

// Apply a film emulation preset
window.openrv.color.applyLUTPreset('warm-film');
```

---

## Related Pages

- [LUT System Technical Reference](../guides/lut-system.md) -- format specifications, interpolation algorithms, memory layout, and GPU implementation details
- [OCIO Integration](ocio.md) -- LUT interaction with OCIO color management
- [Primary Color Controls](primary-controls.md) -- primary color adjustments
- [Rendering Pipeline](../guides/rendering-pipeline.md) -- three LUT slots in the full pipeline
