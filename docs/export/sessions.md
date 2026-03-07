# Session Save and Load

![Session save with state summary](/assets/screenshots/51-session-save.png)

OpenRV Web saves the complete state of a review session to a `.orvproject` file. This includes all media references, color corrections, annotations, playback settings, and viewer configuration.

This page provides an overview of session persistence. For detailed coverage of snapshots, auto-save, and crash recovery, see [Session Management](../advanced/session-management.md).

## Saving a Session

Click the Save button in the header bar or use the Export menu to save the current session. The browser downloads a `.orvproject` file containing a JSON representation of the session state.

### What Is Saved

| Category | Saved Data |
|----------|------------|
| **Media references** | File paths, names, types, dimensions, duration, FPS |
| **Playback state** | Current frame, in/out points, FPS, loop mode, volume, muted state |
| **Markers** | Frame, note, color for each marker |
| **Annotations** | All pen strokes, shapes, text per frame; ghost/hold settings |
| **Color** | Exposure, gamma, contrast, saturation, brightness, temperature, tint, vibrance, clarity, highlights, shadows, whites, blacks |
| **CDL** | Slope, offset, power, saturation |
| **View** | Zoom level, pan position |
| **Transform** | Rotation, flip, scale, translate |
| **Crop** | Crop enabled state and region |
| **Lens distortion** | K1, K2, center parameters |
| **Wipe/Compare** | Wipe mode, position, angle |
| **Layer stack** | Layer blend modes and opacity |
| **LUT** | LUT file path reference and intensity |
| **Filters** | Blur, sharpen settings |
| **Playlist** | Clip list with in/out points and loop mode |

## Loading a Session

Load a `.orvproject` file through the file picker (select the `.orvproject` file type) or by dragging the file onto the viewer.

### Blob URL Handling

Files loaded from the local filesystem use temporary blob URLs that become invalid after the browser closes. When a saved session contains blob URL references:

1. The serializer marks those media references with `requiresReload: true`
2. On load, a file reload dialog appears for each affected reference
3. The user can select the original file, skip the reference, or cancel

A filename mismatch warning appears if the selected file differs from the expected filename.

## RV/GTO Session Files

OpenRV Web also loads original OpenRV `.rv` and `.gto` session files. The GTO parser reconstructs the node graph and restores:

- Playback ranges
- Channel selection
- Scope configurations
- Paint effects and annotations

GTO sessions are read-only imports -- they are not re-exported in GTO format. Session changes are saved as `.orvproject` files.

## Migration

The `.orvproject` format includes a version number. When loading a session saved with an older format version, the serializer applies migrations to update the data structure. Missing fields receive default values to ensure backward compatibility.

## Auto-Save and Snapshots

For protection against data loss, OpenRV Web provides:

- **Auto-save** -- periodic saves to IndexedDB with configurable intervals (1--30 minutes)
- **Snapshots** -- named version history with preview and restore capability
- **Crash recovery** -- detection of unclean shutdown with recovery from the most recent auto-save

These features are covered in detail in the [Session Management](../advanced/session-management.md) page.

---

## Related Pages

- [Session Management](../advanced/session-management.md) -- snapshots, auto-save, crash recovery
- [Frame Export](frame-export.md) -- export individual frames
- [Video Export](video-export.md) -- export encoded video
- [EDL and OTIO](edl-otio.md) -- export edit decision lists
- [Exporting Annotations](../annotations/export.md) -- annotation-specific export as JSON or PDF
