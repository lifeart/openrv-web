# Display Profiles and Color Output

Display profiles control the final stage of the color pipeline -- converting graded, tone-mapped linear light values into the signal encoding expected by the physical display device. OpenRV Web provides transfer function selection, display gamma and brightness overrides, HDR output modes, gamut mapping, and automatic display capabilities detection.

![Display profiles and transfer function selection](/assets/screenshots/31-display-profiles.png)

---

## Transfer Functions

The display transfer function converts linear light values to the non-linear encoding that displays expect. Select the transfer function that matches the monitor's calibration:

| Transfer Function | Label | Description |
|-------------------|-------|-------------|
| Linear (Bypass) | Linear | No encoding applied. Use for HDR displays or when viewing raw linear data. |
| sRGB (IEC 61966-2-1) | sRGB | The standard encoding for computer monitors. Includes a linear segment near black and a power curve (~2.2 effective gamma). Default setting. |
| Rec. 709 OETF | 709 | The HD broadcast standard transfer function. Similar to sRGB but with a different linear segment threshold and a 0.45 power. |
| Gamma 2.2 | 2.2 | Pure power function with exponent 2.2. Simpler than sRGB, commonly used in game engines. |
| Gamma 2.4 | 2.4 | Pure power function with exponent 2.4. Standard for dim-surround viewing environments (cinema, grading suites). |
| Custom Gamma | Custom | User-specified gamma value from 0.1 to 10.0. |

### Cycling Profiles

Press `Shift+Alt+D` to cycle through the available display profiles: Linear, sRGB, Rec. 709, Gamma 2.2, Gamma 2.4. The active profile name appears in the viewer status area.

---

## Display Gamma Override

| Property | Value |
|----------|-------|
| Range | 0.1 to 4.0 |
| Default | 1.0 |

The display gamma override applies an additional power function on top of the selected transfer function. This compensates for monitor-specific gamma response that deviates from the nominal curve. At 1.0, no additional compensation is applied.

The override is applied at pipeline stage 8c, after the transfer function encoding and before the brightness multiplier. The formula is:

```
output = pow(transferEncoded, 1.0 / displayGamma)
```

---

## Display Brightness

| Property | Value |
|----------|-------|
| Range | 0.0 to 2.0 |
| Default | 1.0 |

Display brightness applies a final multiplicative scaling to all channels. This adjusts the overall output level without affecting the transfer function shape. Use it to match the brightness of the viewer to the physical monitor's peak luminance or to compensate for ambient lighting conditions.

Applied at pipeline stage 8d, this is the last adjustment before color inversion and channel isolation.

---

## HDR Output

OpenRV Web detects and supports HDR display capabilities when available. HDR output preserves values above 1.0 (SDR reference white) through the entire pipeline, allowing super-white highlights to reach the display at their intended luminance.

### HDR Modes

| Mode | Description |
|------|-------------|
| SDR | Standard dynamic range. Values are clamped to 0.0-1.0. Default for non-HDR displays. |
| HLG | Hybrid Log-Gamma output via `rec2100-hlg` WebGL drawing buffer color space. |
| PQ | Perceptual Quantizer (ST 2084) output via `rec2100-pq` WebGL drawing buffer color space. |
| Extended | Extended-range SDR via `drawingBufferStorage()` with float16 backbuffer and `configureHighDynamicRange()`. |

The active HDR mode is determined automatically based on browser and display capabilities. HDR headroom (the ratio of display peak luminance to SDR reference white) is propagated through the shader as the `u_hdrHeadroom` uniform.

### Supported Display Gamuts

| Gamut | CSS Media Query | Description |
|-------|----------------|-------------|
| sRGB | `(color-gamut: srgb)` | Standard gamut. Covers approximately 35% of visible colors. |
| Display-P3 | `(color-gamut: p3)` | Wide gamut used by modern Apple displays, cinema projectors. ~25% wider than sRGB. |
| Rec. 2020 | `(color-gamut: rec2020)` | Ultra-wide gamut for HDR broadcast. Covers ~75% of visible colors. |

When the display supports P3 or Rec. 2020, and WebGL2 supports the corresponding `drawingBufferColorSpace`, OpenRV Web automatically activates the wider gamut for more accurate color reproduction.

---

## Display Capabilities Detection

At startup, OpenRV Web probes the browser environment to determine available capabilities:

| Capability | Detection Method |
|------------|-----------------|
| Display gamut | `matchMedia('(color-gamut: p3)')` and `(color-gamut: rec2020)` |
| Display HDR | `matchMedia('(dynamic-range: high)')` |
| WebGL P3 output | `drawingBufferColorSpace = 'display-p3'` test |
| WebGL HLG/PQ output | `drawingBufferColorSpace = 'rec2100-hlg'` / `'rec2100-pq'` test |
| WebGPU availability | `'gpu' in navigator` |
| Float16 canvas | OffscreenCanvas with `colorType: 'float16'` test |
| VideoFrame upload | `typeof VideoFrame !== 'undefined'` |

All detection results are cached in a `DisplayCapabilities` object. No throwaway canvases or contexts persist after probing -- they are cleaned up immediately.

The **active color space** (sRGB or Display-P3) is resolved from the combination of user preference and detected capabilities. A preference of `auto` selects P3 when both the display and WebGL support it.

---

::: info Pipeline Note
Choosing the correct display profile is essential for accurate delivery review. Use **Rec.709** when reviewing broadcast/episodic deliverables on a calibrated reference monitor. Use **sRGB** for web and streaming delivery. Use **Gamma 2.4** for DI suite and grading theater environments (dim surround). For theatrical DCPs, the target is **DCI-P3**. Mismatched display profiles are the most common cause of "it looked different on my monitor" issues across departments.
:::

::: tip VFX Use Case
When reviewing on a wide-gamut display (P3 or Rec.2020), enable the **highlight out-of-gamut** diagnostic mode to identify colors that will be clipped when the deliverable is mastered to a narrower gamut like Rec.709. This catches issues before the final conform where out-of-gamut colors would shift unpredictably.
:::

## Gamut Mapping

When source content has a wider gamut than the display (for example, Rec. 2020 source on an sRGB monitor), gamut mapping brings out-of-gamut colors into the displayable range. Two modes are available:

- **Clip:** Simply clamps out-of-gamut values to the target gamut boundary. Fast but can produce hue shifts.
- **Compress:** Applies a perceptual compression that preserves hue relationships at the cost of some saturation reduction.

Gamut mapping is applied at pipeline stage 7a, after tone mapping and before the display LUT. An optional **highlight out-of-gamut** mode overlays a diagnostic color on pixels that exceed the target gamut, helping identify problematic areas.

---

## Scripting API

```javascript
// Set display profile
window.openrv.color.setDisplayProfile({
  transferFunction: 'rec709',
  displayGamma: 1.0,
  displayBrightness: 1.0
});

// Query display capabilities
const caps = window.openrv.color.getDisplayCapabilities();
console.log(caps.displayGamut);    // 'srgb' | 'p3' | 'rec2020'
console.log(caps.displayHDR);      // true | false
console.log(caps.activeHDRMode);   // 'sdr' | 'hlg' | 'pq' | 'extended'
```

---

## Related Pages

- [Tone Mapping](tone-mapping.md) -- HDR tone mapping operators applied before display output
- [Log Curve Presets](log-curves.md) -- input linearization (the other end of the pipeline)
- [OCIO Integration](ocio.md) -- OCIO display and view transforms
- [LUT Loading](lut.md) -- display LUT slot for monitor calibration
- [Rendering Pipeline](../guides/rendering-pipeline.md) -- display output stages 8a-8d in the pipeline
