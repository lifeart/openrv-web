# Tone Mapping

Tone mapping compresses the dynamic range of scene-referred linear light values into the displayable range of a monitor. Without tone mapping, HDR content and even well-exposed linear renders appear with clipped highlights and crushed detail. OpenRV Web provides multiple tone mapping operators (TMOs), each with distinct characteristics suited to different content types.

![Tone mapping controls](/assets/screenshots/23-tone-mapping.png)

---

## Why Tone Map

Scene-referred linear data can contain values far exceeding 1.0 (super-whites from light sources, reflections, or HDR video). Standard displays can only reproduce values from 0.0 to 1.0 (or up to the display's peak luminance for HDR monitors). Tone mapping applies a carefully designed curve that:

- Preserves shadow detail and midtone contrast
- Gradually compresses highlights into the displayable range
- Maintains perceptual color relationships

Without tone mapping, a simple clamp at 1.0 destroys all highlight information above that threshold.

---

## Unified HDR Headroom Convention

All non-Drago operators in OpenRV Web share a single peak-white renormalization convention so that operators can be A/B compared at any display headroom without an unfair dynamic-range mismatch:

```
scaled = color / hdrHeadroom         // normalize so peak white = 1.0
mapped = <operator-specific curve>(scaled)
result = mapped * hdrHeadroom         // re-scale output peak to display headroom
```

Properties this guarantees:

- **At SDR (`hdrHeadroom = 1.0`)** every operator reduces to its canonical SDR curve. SDR rendering is bit-for-bit unchanged.
- **At HDR (`hdrHeadroom > 1.0`)** every operator produces output in `[0, hdrHeadroom]` and preserves display-side headroom uniformly.
- **Peak-white invariance**: `f(H * x, H) = H * f(x, 1)` for every non-Drago operator, so swapping operators on the same scene yields comparable output ranges instead of one operator being silently brighter than another.

The HDR headroom value is queried from the host display and clamped to `[1, 100]`; non-finite values fall back to `1.0` at the WebGL2 and WebGPU entry points, and the shaders defensively floor the divisor to `1e-6`.

::: tip Drago is the exception
**Drago is intentionally outside the unified convention.** It is physically parameterized via scene average luminance (`Lwa`) and scene peak luminance (`Lmax`), and folds display headroom into `Lmax` (`Lmax_effective = Lmax * hdrHeadroom`). The `Bias` parameter shapes the logarithmic curve and `Brightness` acts as the post-multiplier. For Drago, headroom is expressed by the operator's own physical parameters rather than by an external pre/post scale.
:::

---

## Available Operators

### Reinhard

A simple, physically motivated operator that maps luminance through the function `L / (1 + L)`. This provides gentle highlight compression with a natural rolloff.

**Parameters:**
- **White Point** (default 4.0) -- the scene luminance value that maps to display white. Higher values preserve more highlight detail at the cost of overall brightness.

**Best for:** General-purpose viewing, CG renders with moderate dynamic range, quick previews.

### Filmic (Uncharted 2)

A multi-segment curve originally designed for real-time rendering in video games. Produces results reminiscent of analog film with a characteristic toe (shadow lift) and shoulder (highlight rolloff).

**Parameters:**
- **Exposure Bias** (default 2.0) -- pre-scales input values before the curve. Higher values brighten the image before compression.
- **White Point** (default 11.2) -- the input value mapped to display white.

**Best for:** CG content, game engine output, content that benefits from a filmic response.

### ACES

The Academy Color Encoding System reference rendering transform (RRT). This is the standard tone mapping curve used across the film industry for ACES-managed projects. It provides consistent, predictable highlight handling with a distinct shoulder shape.

**Best for:** Film and VFX production, ACES-managed pipelines, matching theatrical and broadcast deliverables.

### AgX

A modern tone mapping approach developed by Troy Sobotka and adopted by Blender 4.x. AgX provides excellent hue preservation during highlight compression, avoiding the color shifts (particularly in saturated reds and blues) that some other operators exhibit.

**Best for:** CG renders with highly saturated colors, archviz, product visualization.

### PBR Neutral

The Khronos PBR Neutral tone mapper designed for physically-based rendering. Provides minimal creative opinion while correctly handling PBR material values.

**Best for:** Material review, PBR asset validation, neutral technical viewing.

### GT (Gran Turismo)

Per-channel tone mapping developed by Hajime Uchimura for Gran Turismo Sport. Applies the compression independently to each color channel, preserving hue at the cost of some desaturation in extreme highlights.

**Best for:** Automotive visualization, real-time rendering review, content with specular highlights.

### ACES Hill

An alternative ACES approximation by Stephen Hill that provides a computationally efficient approximation of the ACES RRT with good accuracy across the typical exposure range.

**Best for:** Fast preview of ACES-like rendering, interactive sessions where performance matters.

### Drago

An adaptive logarithmic tone mapping operator (Drago et al.) that uses scene statistics (average and peak luminance) to drive the compression. A configurable bias parameter (default 0.85) controls the interpolation between logarithmic and linear mapping.

**Parameters:**
- **Bias** (default 0.85) -- controls the compression curve shape. Lower values produce more aggressive compression.
- **Scene average luminance** (`Lwa`) -- measured from the image, used to anchor the adaptation.
- **Scene peak luminance** (`Lmax`) -- measured from the image, defines the upper extent of the input range. The display headroom is folded in here (`Lmax_effective = Lmax * hdrHeadroom`).
- **Brightness** -- post-multiplier applied after the curve.

**Headroom convention:** Drago is the **physically parameterized exception** to the unified peak-white renormalization convention used by every other operator. Its headroom behavior is expressed through `Lmax` and `Brightness` instead of an external pre-divide / post-multiply pair. CPU and GPU paths use the same `Lmax * hdrHeadroom` scaling for parity.

**Best for:** Scenes with very high dynamic range where automatic adaptation to content brightness is desired.

---

## Pipeline Position

Tone mapping is applied at stage 7 in the rendering pipeline, after all creative color grading (exposure, CDL, curves, LUT, HSL qualifier, film emulation) and before display transfer functions, gamut mapping, and output encoding.

This placement ensures that:
1. Grading operations have access to the full HDR range of the source material.
2. The tone mapping curve receives the final graded image before display encoding.
3. Display transfer functions (sRGB, Rec.709, gamma) operate on the compressed, display-referred result.

Press `Shift+Alt+J` to toggle tone mapping on or off.

---

::: tip VFX Use Case
For ACES-managed shows, use the **ACES** operator to match the Reference Rendering Transform (RRT) used in theatrical and broadcast deliverables. During HDR dailies review, consider leaving tone mapping off and using the display's native HDR capabilities (HLG/PQ output) to evaluate the full dynamic range of the source material. Switch to **Reinhard** for a quick neutral preview when comparing multiple shots that haven't been graded yet.
:::

::: warning
Tone mapping is a destructive, non-invertible operation. When reviewing CG lighting or compositing work, be aware that the tone mapper's highlight rolloff and hue shifts may mask issues (or create false ones) in the source render. Toggle tone mapping on and off (`Shift+Alt+J`) to compare the raw linear data against the display-mapped result.
:::

## Choosing the Right Operator

| Content Type | Recommended Operator |
|-------------|---------------------|
| Film/VFX dailies (ACES pipeline) | ACES or ACES Hill |
| CG renders (Blender, Unreal, Unity) | AgX or Filmic |
| HDR video (HLG/PQ sources) | Reinhard or ACES |
| Product/archviz visualization | PBR Neutral or AgX |
| Quick preview of any content | Reinhard (simplest, fewest artifacts) |
| Matching theatrical delivery | ACES |
| Very high dynamic range scenes | Drago (adaptive to content luminance) |

When in doubt, start with **Reinhard** for a neutral preview, then switch to **ACES** or **AgX** for a more polished result. Use the operator parameters to fine-tune highlight handling for the specific content.

---

## Scripting API

```javascript
// Enable ACES tone mapping
window.openrv.color.setToneMapping({
  operator: 'aces',
  enabled: true
});

// Set Reinhard with custom white point
window.openrv.color.setToneMapping({
  operator: 'reinhard',
  whitePoint: 6.0,
  enabled: true
});

// Disable tone mapping
window.openrv.color.setToneMapping({ enabled: false });
```

---

## Related Pages

- [Display Profiles](display-profiles.md) -- display transfer functions applied after tone mapping
- [Primary Color Controls](primary-controls.md) -- exposure and contrast adjustments applied before tone mapping
- [Log Curve Presets](log-curves.md) -- input linearization for camera log footage
- [OCIO Integration](ocio.md) -- ACES view transforms as an alternative to standalone tone mapping
- [Rendering Pipeline](../guides/rendering-pipeline.md) -- tone mapping position in the full pipeline (stage 7)
- [Histogram](../scopes/histogram.md) -- verify tonal distribution after tone mapping
