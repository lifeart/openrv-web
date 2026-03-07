# Pixel Probe

The pixel probe provides a real-time readout of exact color values under the cursor. It is essential for precise color evaluation, verifying exposure levels, and confirming that specific pixel values meet requirements.

![Pixel probe overlay showing color values](/assets/screenshots/16-pixel-probe.png)

## Enabling the Pixel Probe

Press `Shift+I` to toggle the pixel probe. A floating overlay appears near the cursor and follows it across the viewer. An eyedropper icon in the View tab toolbar also toggles the probe. Press `Shift+I` again or `Escape` to close it.

## Display Information

The probe overlay shows:

| Field | Description |
|-------|-------------|
| **Coordinates** | Pixel position (X, Y) in source image space |
| **Color swatch** | Preview of the sampled color |
| **RGB** | Integer RGB values (0--255) |
| **RGB 0-1** | Floating-point RGB values (0.0--1.0) |
| **HSL** | Hue (degrees), Saturation (%), Lightness (%) |
| **HEX** | Hexadecimal color code (#RRGGBB) |
| **IRE** | Luminance in IRE units using Rec.709 coefficients |

## Format Selector

Buttons at the bottom of the overlay allow selecting which format to emphasize:

- **RGB** -- integer format
- **0-1** -- floating-point format
- **HSL** -- hue/saturation/lightness
- **HEX** -- hexadecimal
- **IRE** -- broadcast luminance

The selected format is highlighted. All formats are always visible in the overlay regardless of selection.

## Lock Position

Click on the canvas while the probe is enabled to lock the probe at the current position. The lock indicator icon in the overlay header changes to show the locked state. While locked, moving the mouse does not update the probe values -- they remain fixed at the locked position.

Click on the canvas again to unlock and resume live tracking.

Locking is useful for comparing values at a specific pixel across different frames during playback or after color adjustments.

## Copy to Clipboard

Click on any value row in the overlay to copy that value to the system clipboard. This makes it easy to record specific pixel values for documentation, bug reports, or communication with other artists.

## IRE Luminance

The IRE value represents perceived brightness using Rec.709 coefficients:

- Y = 0.2126 * R + 0.7152 * G + 0.0722 * B

| IRE Value | Interpretation |
|-----------|---------------|
| 0 IRE | Absolute black |
| ~18 IRE | Mid-gray (18% reflectance) |
| 100 IRE | Reference white |
| > 100 IRE | Super-white / HDR values |

## State Persistence

The pixel probe visibility persists when changing frames and when switching tabs. Enabling the probe on frame 1, stepping to frame 50, and switching from the View tab to the Color tab does not disable the probe.

## Overlay Positioning

The probe overlay follows the cursor with an offset to avoid obscuring the sampled pixel. When the cursor approaches the edge of the viewport, the overlay repositions to stay within visible bounds.

The overlay uses a semi-transparent dark background with rounded corners, box shadow, and a minimum width of 180 pixels.

## Scripting API

Pixel probe state is accessible through the view API:

```javascript
// Toggle pixel probe
// (Primarily controlled via keyboard shortcut Shift+I)
```

---

## Related Pages

- [Histogram](histogram.md) -- overall value distribution
- [Waveform Monitor](waveform.md) -- spatial brightness analysis
- [False Color and Zebra](false-color-zebra.md) -- exposure visualization overlays
- [Channel Isolation](../playback/channel-isolation.md) -- view individual channel values
