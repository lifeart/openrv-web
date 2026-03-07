# Advanced Comparison Features

![Quad view showing four sources simultaneously](/assets/screenshots/56-quad-view.png)

Beyond the standard A/B comparison tools, OpenRV Web provides quad view, reference image management, matte overlay, and multi-layer stack capabilities for complex review scenarios.

## Quad View

Quad view divides the viewer into four quadrants, each displaying a different source (A, B, C, D). This mode is useful for comparing multiple versions or render passes simultaneously without switching between sources.

Each quadrant operates independently, showing its assigned source at the current frame. All four quadrants stay in sync during playback.

## Reference Image Manager

The Reference Image Manager captures and stores a snapshot of the current frame as a reference image. This reference can then be compared against live footage using several view modes.

### Capturing a Reference

Use the Reference Image Manager to capture the current viewer content. The captured image is stored in memory and remains available throughout the session.

### View Modes

| Mode | Description |
|------|-------------|
| Split horizontal | Reference on left, live on right |
| Split vertical | Reference on top, live on bottom |
| Overlay | Reference overlaid on live with adjustable opacity |
| Side by side | Reference and live displayed in adjacent panels |
| Toggle | Press to switch between reference and live |

The reference image comparison is independent of the A/B source system. It allows comparing the current graded frame against a previously captured state -- useful for evaluating whether color corrections improve on a starting point.

## Matte Overlay

The matte overlay adds a letterbox or pillarbox mask to the viewer with configurable aspect ratio and opacity. Common uses include:

- **Aspect ratio preview** -- visualize how the image appears at delivery aspect ratio (e.g., 2.39:1 for widescreen cinema)
- **Safe area reference** -- mask out areas outside the intended crop
- **Client presentation** -- show final framing during review sessions

### Configuration

- **Aspect ratio** -- set the matte to any desired ratio (e.g., 1.85:1, 2.39:1, 16:9)
- **Opacity** -- adjust the darkness of the matte bars (0--100%)
- **Center point** -- offset the matte center if the composition is not centered

Matte settings persist across frame changes and are included in session state.

## Multi-Layer Stack

The multi-layer stack allows combining multiple sources with blend modes and per-layer opacity and visibility controls. This is useful for compositing review where layers need to be toggled on and off.

Each layer in the stack supports:

- **Visibility toggle** -- show or hide the layer
- **Opacity** -- adjust the layer contribution (0--100%)
- **Blend mode** -- select how the layer combines with layers below

The stack is ordered from bottom (background) to top (foreground), following standard compositing conventions.

## Comparison Annotations

Annotations can be drawn during A/B compare mode. Annotations are tied to the source they were drawn on, so switching between A and B preserves each source's annotation layer independently.

## Practical Workflows

### Dailies Review

1. Load the latest render as source A
2. Load the previous approved version as source B
3. Use split screen to compare side by side
4. Switch to difference matte to verify changes are limited to intended areas
5. Add markers at frames that need attention

### Color Grading Review

1. Load the ungraded source
2. Apply color corrections
3. Use wipe mode to compare original vs. graded
4. Capture a reference image before making further adjustments
5. Use the reference overlay to compare the current grade against the saved state

### Multi-Version Comparison

1. Load up to four versions of a shot
2. Enable quad view to see all versions simultaneously
3. Play through the shot to compare motion and timing
4. Switch to A/B toggle for detailed frame-by-frame comparison

---

## Related Pages

- [A/B Switching](ab-switching.md) -- basic two-source comparison
- [Wipe Mode](wipe-mode.md) -- original vs. graded comparison
- [Split Screen](split-screen.md) -- side-by-side display
- [Difference Matte](difference-matte.md) -- pixel difference visualization
- [Blend Modes](blend-modes.md) -- onion skin, flicker, and blend
