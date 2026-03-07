# Color Wheels (Lift/Gamma/Gain)

The three-way color correction wheels provide an intuitive interface for adjusting color balance independently in the shadows, midtones, and highlights. This is the same grading paradigm used in professional color correction suites such as DaVinci Resolve, Baselight, and desktop OpenRV.

---

## Concept

Three-way color correction divides the image into tonal zones based on luminance:

- **Lift (Shadows):** Affects the darkest portions of the image. The lift wheel adds a color offset to pixels weighted by their shadow content using a `smoothstep(0.5, 0.0, luminance)` falloff.
- **Gamma (Midtones):** Affects the mid-brightness region. The gamma wheel applies a power-function adjustment weighted to midtones, computed as `1.0 - shadowWeight - highlightWeight`.
- **Gain (Highlights):** Affects the brightest portions of the image. The gain wheel applies a multiplicative color scaling weighted by a `smoothstep(0.5, 1.0, luminance)` highlight mask.

These three zones overlap smoothly, ensuring no hard transitions between tonal regions.

---

## Opening the Color Wheels

Press `Shift+Alt+W` to toggle the color wheels panel. The panel can also be activated from the Color tab in the context toolbar.

---

## Interactive Wheels

Each wheel displays a circular color picker. Dragging the center point toward a color shifts that tonal zone toward that hue:

- **Drag toward red:** Warm up the zone (shadows become reddish, midtones gain warmth, or highlights turn golden).
- **Drag toward blue:** Cool down the zone.
- **Center position:** Neutral (no color shift).

The distance from center controls the intensity of the shift. Larger offsets produce stronger color corrections.

### Master Wheel

A fourth **Master** wheel applies the same type of offset across the entire tonal range. Use it for quick global color shifts without adjusting each zone independently.

---

## Color Preview Ring

Each wheel is surrounded by a color preview ring that shows the current tonal distribution of the image within that zone. This provides immediate visual feedback on how the correction affects shadow, midtone, and highlight color balance.

---

## Gang and Link Controls

- **Gang:** Lock the R, G, and B channels together so that adjusting one channel adjusts all three equally. This limits correction to luminance-only changes within each zone.
- **Link:** Synchronize all three wheels so that adjusting one wheel applies a proportional correction to the others. Useful for global color temperature shifts across all tonal zones simultaneously.

---

## Pipeline Position

Color wheels are applied at stage 6a in the rendering pipeline, after primary adjustments (exposure, contrast, saturation, highlights/shadows) and before CDL, curves, and LUT grading. This placement allows primary corrections to establish the tonal foundation before zone-based color shaping.

The GPU shader computes luminance using Rec. 709 weights and applies each zone's correction in a single pass:

```
// Lift (additive in shadows)
color += liftColor * shadowWeight

// Gain (multiplicative in highlights)
color *= 1.0 + gainColor * highlightWeight

// Gamma (power in midtones)
color = pow(color, 1.0 / (1.0 + gammaColor)) * midWeight + color * (1.0 - midWeight)
```

---

## Typical Workflows

- **Warm highlights, cool shadows:** Push the gain wheel toward orange/yellow and the lift wheel toward blue for a classic cinematic look.
- **Neutralize a color cast:** If shadows appear green, push the lift wheel toward magenta to compensate.
- **Add depth:** Slightly warm the midtones and cool the shadows to create visual separation between foreground and background elements.

---

## Related Pages

- [Primary Color Controls](primary-controls.md) -- exposure, contrast, saturation, and other primary adjustments
- [CDL Workflow](cdl.md) -- ASC CDL slope/offset/power per-channel correction
- [Rendering Pipeline](../guides/rendering-pipeline.md) -- full shader pipeline stage ordering
