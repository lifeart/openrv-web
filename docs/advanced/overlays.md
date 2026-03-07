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

Toggle the timecode overlay from the Overlays menu or the context toolbar.

---

## Safe Areas

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

The EXR window overlay is enabled from the Overlays menu and activates automatically when an EXR file with mismatched data/display windows is detected.

---

## Matte Overlay

The matte overlay applies an opaque or semi-transparent mask to simulate a delivery aspect ratio without permanently cropping the image. This differs from the crop tool in that the matte overlay always shows the full image with darkened regions, whereas crop can hide the masked content entirely.

### Controls

- **Aspect ratio**: Select from standard presets (2.39:1, 1.85:1, 16:9, 4:3, 1:1) or enter a custom ratio
- **Opacity**: Control the darkness of the matte region, from fully transparent (0%) to fully opaque (100%)
- **Center point**: Offset the matte from the image center for asymmetric framing evaluation

The matte overlay is accessible via the API:

```javascript
// Enable matte with 2.39:1 aspect and 80% opacity
openrv.matte.enable({ aspect: 2.39, opacity: 0.8 });
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

The watermark overlay tiles a text string or image across the entire frame at low opacity. This is used for:

- Marking review copies as confidential or for internal use only
- Adding recipient identification to distributed media
- Deterring unauthorized distribution of pre-release content

### Controls

- **Text**: The watermark message (e.g., "CONFIDENTIAL", "FOR REVIEW ONLY", recipient name)
- **Font size**: Relative to frame dimensions
- **Opacity**: Low opacity values (10-20%) provide visible marking without obscuring content
- **Rotation**: Angle of the tiled text pattern (default: -30 degrees)
- **Color**: Watermark text color

The watermark renders as an overlay and does not modify the source image. For permanent watermarking, use the frameburn feature during video export.

---

## Perspective Grid

The perspective grid overlay draws a configurable grid pattern on the viewer for composition analysis and alignment verification.

### Grid Types

- **Rule of thirds**: Divides the frame into a 3x3 grid for classical composition evaluation
- **Golden ratio**: Places grid lines at the golden section points (approximately 0.382 and 0.618 of each dimension)
- **Custom grid**: User-defined row and column count for arbitrary grid divisions
- **Crosshair**: Simple center crosshair for alignment checks

### Display Options

- **Color**: Grid line color (default: white with 50% opacity)
- **Line width**: Thin (1px), medium (2px), or thick (3px)
- **Diagonal lines**: Optional diagonal guides from corner to corner

The grid overlay is particularly useful for evaluating composition in dailies reviews and verifying that CG camera framing matches the plate.

---

## Note Overlay

The note overlay displays review notes and annotations as persistent text overlays on the viewer. Unlike the annotation system (which provides per-frame drawing tools), the note overlay shows text associated with the current frame's markers or review notes in a fixed position on screen.

### Display

- Notes are shown in a semi-transparent panel at the bottom of the viewer
- Each note shows the frame number, author (if available), and note text
- Multiple notes for the same frame are stacked vertically
- Navigation arrows allow stepping between noted frames

The note overlay integrates with the marker system. When a marker with a note exists at the current frame, the note text appears automatically in the overlay.

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

All overlays can be toggled from the **Overlays** submenu in the View tab, or from the Overlays section of the context toolbar. Each overlay has an independent enable/disable toggle. A master "Clear All Overlays" option disables all overlays at once.

Overlay states are included in the session state and are preserved in `.orvproject` files and snapshots.

---

## Related Pages

- [False Color and Zebra Stripes](../scopes/false-color-zebra.md) -- Exposure analysis overlays
- [Transforms](transforms.md) -- Crop, uncrop, and aspect ratio tools
- [Rendering Pipeline](../guides/rendering-pipeline.md) -- Pipeline stage ordering
- [Session Management](session-management.md) -- Overlay settings in session persistence
- [Review Workflow](review-workflow.md) -- Using overlays in dailies and review
