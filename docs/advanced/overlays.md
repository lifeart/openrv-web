# Overlays and Guides

OpenRV Web provides a comprehensive set of visual overlays and guide systems that display metadata, safety zones, diagnostic information, and production graphics on top of the viewed image. Overlays are non-destructive and render independently of the source media. All overlay settings are saved with the session state.

---

## Timecode Overlay

The timecode overlay displays the current frame position in SMPTE timecode format (HH:MM:SS:FF) on the viewer canvas. This overlay is essential for frame-accurate communication during review sessions.

### Display Options

- **Position**: Top-left, top-right, bottom-left, or bottom-right corner of the viewer
- **Format**: SMPTE timecode (HH:MM:SS:FF), frame number, or both
- **Background**: Semi-transparent background box for readability against any image content
- **Font size**: Small, medium, or large

The timecode is derived from the current frame number and the session frame rate. For sources with embedded timecode metadata, the source timecode is displayed alongside the session timecode.

Toggle the timecode overlay from its dedicated button in the **View** tab toolbar (keyboard shortcut: Alt+Shift+T). Right-click the button to access display settings.

---

## Safe Areas

![Safe area guides overlay](/assets/screenshots/25-safe-areas.png)

Safe area overlays mark the broadcast-safe and title-safe regions of the frame, following industry standards for television and streaming delivery.

### Standard Safe Areas

| Zone | Percentage | Purpose |
|------|-----------|---------|
| Action safe | 93% | All important action must fall within this area to avoid being cut off by consumer displays |
| Title safe | 90% | All text and graphics must fall within this area for legibility on edge-cropping displays |
| Custom | User-defined | Specify any percentage for production-specific safe zones |

### Display

Safe areas are rendered as semi-transparent bordered rectangles centered on the frame. The border color and opacity are configurable. When multiple safe zones are active simultaneously, each uses a distinct color for clarity.

Safe area overlays respect the current crop settings. If crop is active, safe areas are calculated relative to the cropped region rather than the full image.

---

## Clipping Overlay

The clipping overlay highlights pixels that are at or beyond the minimum (0.0, pure black) or maximum (1.0, pure white) values. Clipped regions are displayed as colored overlays:

- **Shadow clipping**: Pixels at 0.0 are overlaid in blue, indicating crushed blacks
- **Highlight clipping**: Pixels at 1.0 are overlaid in red, indicating blown-out highlights
- **Both clipping**: Pixels that clip in all channels simultaneously receive a distinct highlight

The clipping overlay operates on the post-correction image (after exposure, contrast, and other color adjustments), making it useful for evaluating whether a grade is pushing values into clipping.

### Threshold Configuration

The clipping thresholds can be adjusted from their default 0.0/1.0 positions. For example, setting the highlight threshold to 0.95 will flag pixels that are approaching but not yet at full white, providing an early warning before values clip.

---

## Missing Frame Indicator

When an image sequence has gaps (missing frame numbers), the missing frame indicator replaces the viewer content with a clearly visible warning state:

- A **red X** pattern fills the viewer area
- The missing frame number is displayed prominently
- The timeline highlights the missing frame position

This overlay prevents the common mistake of assuming a missing frame is simply a duplicate of the previous frame. Missing frame detection is automatic for image sequences and requires no manual configuration.

---

## EXR Data/Display Window

EXR images can have different data windows and display windows. The data window defines the rectangle of actual pixel data; the display window defines the intended viewing rectangle.

When the data window differs from the display window, this overlay draws:

- A **blue rectangle** marking the data window boundary
- A **yellow rectangle** marking the display window boundary
- Semi-transparent fill in the region between the two windows

This is particularly useful when reviewing overscan content, partial renders, or multi-pass compositing where different elements have different data extents.

The EXR window overlay is enabled from its dedicated button in the **View** tab toolbar. Right-click the button to access settings. The overlay activates automatically when an EXR file with mismatched data/display windows is detected.

---

## Matte Overlay

The matte overlay applies an opaque or semi-transparent mask to simulate a delivery aspect ratio without permanently cropping the image. This differs from the crop tool in that the matte overlay always shows the full image with darkened regions, whereas crop can hide the masked content entirely.

### Controls

- **Aspect ratio**: Select from standard presets (2.39:1, 1.85:1, 16:9, 4:3, 1:1) or enter a custom ratio
- **Opacity**: Control the darkness of the matte region, from fully transparent (0%) to fully opaque (100%)
- **Center point**: Offset the matte from the image center for asymmetric framing evaluation

The matte overlay is toggled from its dedicated button in the **View** tab toolbar. Right-click the button to access settings. It can also be configured via the scripting API:

```javascript
// Enable matte with 2.39:1 aspect and 80% opacity
openrv.view.setMatte({ aspect: 2.39, opacity: 0.8 });

// Query current matte settings
const matte = openrv.view.getMatte();
console.log(matte.aspect, matte.opacity, matte.show);

// Disable the matte overlay
openrv.view.clearMatte();
```

Matte settings persist when changing frames and are saved with the session state.

---

## Bug Overlay

The bug overlay places a small, persistent logo or graphic element in a corner of the frame. In broadcast and streaming workflows, this is commonly used for:

- Network logos ("bugs") that must remain visible at all times
- Production company watermarks for internal review copies
- Rating or classification badges

### Configuration

- **Image**: Upload a PNG or SVG file for the bug graphic
- **Position**: Any corner of the frame (top-left, top-right, bottom-left, bottom-right)
- **Size**: Scale relative to the frame dimensions
- **Opacity**: Control transparency for subtle watermarking

The bug overlay is also used during video export to burn the logo into the output file.

---

## Watermark Overlay

The watermark overlay places a single image at a chosen position on the frame. This is used for:

- Marking review copies with a logo or badge
- Adding recipient identification to distributed media
- Deterring unauthorized distribution of pre-release content

### Controls

- **Image**: Upload a PNG, JPEG, WebP, or SVG file for the watermark graphic
- **Position**: Nine preset positions on a 3x3 grid (top-left through bottom-right) or a custom X/Y coordinate
- **Scale**: Resize the image relative to its original dimensions (10%-200%)
- **Opacity**: Control transparency (0-100%)
- **Margin**: Pixel offset from the frame edge when using a preset position

The watermark renders as an overlay and does not modify the source image. For permanent watermarking, use the frameburn feature during video export.

---

## Perspective Grid

The perspective grid overlay is a perspective-correction mesh used for verifying and adjusting perspective distortion in the viewed image. It is not a composition guide — for rule-of-thirds, center crosshair, and aspect-ratio guides, see [Safe Areas](#safe-areas).

### How It Works

The overlay draws an 8x8 subdivision grid that is mapped to four draggable corner handles. Dragging any corner repositions the grid lines to follow a perspective transform, allowing you to visually align the grid with vanishing points and architectural lines in the image.

### Controls

- **Corner handles**: Four circular handles at each corner of the grid. Drag a handle to warp the grid into the desired perspective
- **Grid lines**: Fixed 8x8 subdivision mesh rendered in a light blue color
- **Enable/disable**: The overlay can be toggled on or off; when disabled the grid and handles are hidden

The perspective grid overlay emits a `cornersChanged` event whenever a handle is moved, which feeds into the perspective-correction transform pipeline.

---

## Note Overlay

The note overlay draws colored bars on the timeline canvas to indicate frame ranges that have review notes. It is a timeline-level feature, not a viewer overlay.

### Display

- Each note is rendered as a thin horizontal bar just below the timeline track
- Bars are color-coded by status: amber for open, green for resolved, gray for won't-fix
- Bar width corresponds to the note's frame range; single-frame notes have a minimum width of 2px for visibility
- Only top-level notes are shown (replies are excluded)
- Only notes matching the current source index are drawn

The note overlay listens for `notesChanged` events on the session and triggers a timeline redraw when notes are added, updated, or removed.

---

## False Color and Zebra Stripes

For exposure analysis overlays including false color mapping and animated zebra stripes, see [False Color and Zebra Stripes](../scopes/false-color-zebra.md). These diagnostic overlays are documented alongside the scopes system because they operate on luminance analysis data and are typically used in conjunction with the histogram and waveform scopes.

---

## Overlay Stacking Order

When multiple overlays are active simultaneously, they are composited in a fixed order from bottom (closest to the image) to top (closest to the viewer):

1. EXR data/display window
2. Matte overlay
3. Clipping indicators
4. Safe area guides
5. Perspective grid
6. Watermark
7. Bug overlay
8. Timecode display
9. Note overlay
10. Missing frame indicator (replaces all others when active)

This ordering ensures that diagnostic overlays remain visible above decorative elements, and that the missing frame indicator is never obscured.

---

## Enabling and Disabling Overlays

Most overlays are controlled from individual toggle buttons in the **View** tab toolbar (spotlight, matte, bug, EXR window, info strip, timecode, FPS indicator, missing frame indicator). The watermark overlay is controlled from the **Effects** tab. Each overlay has an independent enable/disable toggle, and right-clicking a button opens its settings menu.

Overlay states are included in the session state and are preserved in `.orvproject` files and snapshots.

---

## Related Pages

- [False Color and Zebra Stripes](../scopes/false-color-zebra.md) -- Exposure analysis overlays
- [Transforms](transforms.md) -- Crop, uncrop, and aspect ratio tools
- [Rendering Pipeline](../guides/rendering-pipeline.md) -- Pipeline stage ordering
- [Session Management](session-management.md) -- Overlay settings in session persistence
- [Review Workflow](review-workflow.md) -- Using overlays in dailies and review
