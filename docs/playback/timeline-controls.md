# Timeline Controls

The timeline is the primary tool for navigating through frames, setting playback ranges, and managing markers. It appears at the bottom of the interface whenever media is loaded.

![Timeline with markers and playback controls](/assets/screenshots/10-timeline-markers.png)

## Timeline Overview

The timeline is an 80-pixel-tall canvas-based component that displays:

- A **track** showing the full frame range with thumbnail previews
- A **playhead** (blue accent line with glow effect) indicating the current frame
- **In/out point brackets** defining the playback range
- **User marks** as colored vertical lines
- **Annotation markers** as yellow triangles below the track
- **Audio waveform** as a semi-transparent blue overlay (when audio is present)
- **Source information** -- media type badge, filename, and resolution
- **Playback status** -- playing/paused, current FPS, and loop mode

## Seeking and Scrubbing

Click anywhere on the timeline track to jump directly to that frame. The playhead moves immediately and the viewer updates.

Click and drag on the timeline to scrub through frames continuously. The current frame updates in real time as the mouse moves, providing a quick way to scan through footage.

Double-click on the timeline to navigate to the nearest annotated frame.

## Thumbnails

The timeline displays preview thumbnails distributed across the track. Thumbnails load progressively after media is loaded and are cached in an LRU cache (up to 150 entries) for fast access. When the window resizes or the source changes, thumbnails recalculate automatically.

Thumbnail generation runs with a concurrency limit of two to avoid blocking the main thread.

## In/Out Points

In and out points define the playback range. When set, playback is constrained to this range -- the playhead loops, stops, or reverses (depending on loop mode) at the boundaries rather than at the start and end of the entire media.

| Action | Keyboard Shortcut |
|--------|------------------|
| Set in point | `I` or `[` |
| Set out point | `O` or `]` |
| Reset in/out to full range | `R` |

In/out points are displayed as blue brackets on the timeline. They cannot cross each other -- the in point is always at or before the out point.

### Mark-to-Mark Range Shifting

When multiple markers are placed on the timeline, consecutive marker pairs define range segments. Use the following shortcuts to snap the in/out range to the next or previous segment:

| Action | Shortcut |
|--------|----------|
| Shift to next mark pair | `Shift+Down` or `Ctrl+Right` |
| Shift to previous mark pair | `Shift+Up` or `Ctrl+Left` |

In loop and ping-pong modes, shifting past the last or first segment wraps around. In once mode, shifting stops at the boundary.

## Frame Counter

The timeline displays frame numbers at both ends of the track. During playback, the status area shows the current frame number, actual vs. target FPS (e.g., "24/24 fps"), and the active loop mode.

## Markers

Markers are user-defined bookmarks at specific frames. They appear as colored vertical lines on the timeline.

| Action | Shortcut |
|--------|----------|
| Add/remove marker at current frame | `M` |
| Open marker panel | `Shift+Alt+M` |

Each marker supports:

- **Color** -- choose from an 8-color palette; click the color circle to cycle
- **Note** -- attach text notes to any marker; press `Ctrl+Enter` to save, `Escape` to cancel
- **Navigation** -- click a marker entry in the panel to jump to that frame

The marker panel (`Shift+Alt+M`) lists all markers with their frame numbers, colors, and notes. It includes buttons to add markers, clear all markers, and delete individual markers.

## Annotation Indicators

Frames with annotations (drawings, text, shapes) display yellow triangle indicators below the timeline track. Navigate between annotated frames with `,` (previous) and `.` (next).

## Cache Indicator

A cache indicator shows the status of cached frames and memory usage, particularly useful during video playback with the mediabunny WebCodecs extractor. Cached frames load instantly; uncached frames may cause a brief buffer while decoding.

## Timeline Editor

For playlist and EDL workflows, the timeline editor provides an extended view with:

- **Cut blocks** -- colored rectangles representing individual clips
- **Drag handles** -- trim in/out points by dragging clip edges
- **Reordering** -- drag clips to new positions
- **Zoom controls** -- slider to adjust pixel density (0.5x to 10x pixels per frame)
- **Frame ruler** -- numbered markers showing frame positions
- **Context menu** -- right-click for delete operations

## Keyboard Reference

| Key | Action |
|-----|--------|
| `Space` | Play / Pause |
| `Left Arrow` | Step one frame backward |
| `Right Arrow` | Step one frame forward |
| `Home` | Go to first frame (or in point) |
| `End` | Go to last frame (or out point) |
| `I` or `[` | Set in point |
| `O` or `]` | Set out point |
| `R` | Reset in/out points |
| `M` | Toggle marker at current frame |
| `,` | Previous annotated frame |
| `.` | Next annotated frame |

---

## Related Pages

- [J/K/L Navigation](jkl-navigation.md) -- shuttle speed controls
- [Loop Modes and Stepping](loop-modes-stepping.md) -- playback loop behavior
- [Annotations Per-Frame Modes](../annotations/per-frame-modes.md) -- ghost and hold modes tied to timeline
- [UI Overview](../getting-started/ui-overview.md) -- full interface layout
