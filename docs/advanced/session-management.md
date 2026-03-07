# Session Management

Session management in OpenRV Web preserves the complete state of a review session -- media references, color corrections, annotations, playback position, view configuration, and more. The system provides manual snapshots, automatic saving with crash recovery, and a portable session file format.

This is the canonical reference for all session persistence features. For a brief overview of the `.orvproject` save/load workflow, see [Session Save and Load](../export/sessions.md).

---

## The .orvproject Format

OpenRV Web uses the `.orvproject` file format for session persistence. This is a JSON file containing a versioned schema that captures every aspect of the current viewer state.

### What Is Saved

| Category | Saved Data |
|----------|------------|
| Media references | File paths, names, types, dimensions, duration, FPS |
| Playback state | Current frame, in/out points, FPS, loop mode, volume, muted state |
| Markers | Frame number, note text, color for each marker |
| Annotations | All pen strokes, shapes, and text per frame; ghost/hold settings |
| Color adjustments | Exposure, gamma, contrast, saturation, brightness, temperature, tint, highlights, shadows, whites, blacks |
| CDL values | Slope, offset, power, saturation |
| View state | Zoom level, pan position |
| Transform | Rotation, flip, scale, translate |
| Crop | Enabled state and crop region |
| Lens distortion | K1, K2, center parameters |
| Wipe/Compare | Wipe mode, position, angle |
| Layer stack | Layer blend modes and opacity |
| LUT | LUT file path reference and blend intensity |
| Filters | Blur, sharpen settings |
| Playlist | Clip list with in/out points and loop mode |

### Schema Versioning

Each `.orvproject` file includes a `version` number. When the schema evolves in future releases, the loader applies migration logic to upgrade older files to the current format. This ensures backward compatibility -- sessions saved in earlier versions of OpenRV Web remain loadable.

---

## Saving a Session

Save the current session state using one of these methods:

- Click the **Save** button in the header bar
- Use the Export menu and select **Save Project**
- Press `Ctrl+S`

The browser downloads a `.orvproject` file named after the current project name.

### Blob URL Handling

When media was loaded from the local filesystem via drag-and-drop or file picker, the browser represents it using blob URLs (`blob:https://...`). These URLs are session-specific and become invalid after the browser tab is closed.

The serializer handles this automatically:

1. During save, blob URLs are detected and the media reference is flagged with `requiresReload: true`
2. The invalid URL is cleared from the saved file to prevent confusion
3. During load, any media reference with `requiresReload: true` triggers a file reload dialog

This means locally-loaded files must be re-selected when opening a saved session. Files loaded from persistent URLs (HTTP, network shares) are reloaded automatically.

---

## Loading a Session

To load a previously saved session:

1. Open the file picker or drag a `.orvproject` file onto the viewer
2. The application validates the file structure and checks the schema version
3. For each media reference:
   - If the media URL is accessible, it is loaded automatically
   - If the media requires reload (blob URL), a **File Reload Dialog** appears
4. All viewer state is restored: color corrections, annotations, playback position, view settings, and more

### File Reload Dialog

The file reload dialog appears for each media reference that cannot be automatically reloaded. It displays:

- The expected filename
- A file input for selecting the replacement file
- A filename mismatch warning (if the selected file has a different name than expected)
- **Load** button (disabled until a file is selected)
- **Skip** button (continues without loading that media, showing a warning)

Multiple reload prompts appear sequentially if the session contains several locally-loaded files.

---

## Snapshots

Snapshots capture the complete session state at a specific moment, allowing quick rollback to previous review states. Snapshots are stored in the browser's IndexedDB and are accessible through the Snapshot Panel.

### Creating a Snapshot

Open the Snapshot Panel and click **Create Snapshot**. Provide a name and optional description. The current session state, including all color corrections, annotations, and playback position, is captured.

Snapshots can also be created automatically. Auto-checkpoints are generated before major operations (e.g., loading new media, clearing annotations) to provide a safety net.

### Snapshot Panel

Open the Snapshot Panel from the header bar button or with the keyboard shortcut `Shift+Alt+H`.

The panel provides:

- **Search**: Filter snapshots by name or description
- **Filter dropdown**: Show all snapshots, manual only, or auto-checkpoints only
- **Snapshot cards**: Each card displays the snapshot name, description, type badge (MANUAL in blue, AUTO in yellow), preview information (source name, frame number, annotation count, color grade status), timestamp, and file size
- **Action buttons per card**: Restore, Rename, Export, Delete
- **Clear All**: Remove all snapshots from storage

### Restoring a Snapshot

Click **Restore** on a snapshot card to replace the current session state with the captured state. This is a destructive operation -- the current state is overwritten. Create a new snapshot first if the current state needs to be preserved.

### Exporting and Importing Snapshots

Individual snapshots can be exported as standalone JSON files using the **Export** button. Exported snapshots can be imported on another machine or shared with colleagues.

### Storage Limits

- Maximum manual snapshots: 50
- Maximum auto-checkpoints: 10
- When limits are exceeded, the oldest entries are automatically pruned

---

## Auto-Save

The auto-save system automatically persists the session state to IndexedDB at regular intervals. This provides crash recovery without manual intervention.

### Configuration

Auto-save behavior is configurable:

| Setting | Range | Default |
|---------|-------|---------|
| Interval | 1--30 minutes | 5 minutes |
| Enabled | On / Off | On |
| Max versions | 1--100 | 10 |

Changes to auto-save configuration take effect immediately. The interval value is clamped to the valid range.

### How Auto-Save Works

1. When the session state changes (frame position, color adjustment, annotation, etc.), the auto-save manager marks the state as "dirty"
2. Multiple changes within a short window are debounced -- rapid edits do not trigger multiple saves
3. At the configured interval, if dirty state exists, the current state is written to IndexedDB
4. Old auto-save entries beyond the `maxVersions` limit are pruned automatically

### Auto-Save Indicator

A visual indicator in the header bar shows the auto-save status:

| State | Icon | Display |
|-------|------|---------|
| Idle | Cloud | Relative time since last save (e.g., "2 min ago") |
| Saving | Cloud with pulse animation | "Saving..." |
| Saved | Cloud with checkmark | "Saved" (returns to idle after 3 seconds) |
| Error | Cloud-off, error color | "Save failed" (clickable to retry) |
| Disabled | Cloud-off, muted color | "Auto-save off" |

### Crash Recovery

On application startup, the auto-save manager checks for a clean shutdown flag:

1. During normal operation, a "running" flag is set in IndexedDB
2. On clean shutdown (tab close with beforeunload handler), the flag is cleared
3. If the application starts and finds the "running" flag still set, a crash or unexpected closure occurred
4. The system emits a `recoveryAvailable` event, and the UI offers to restore from the most recent auto-save entry

Crash recovery restores the full session state, including media references (which may require file reloading for local files), color corrections, annotations, and playback position.

### Session Recovery After Browser Restart

After a browser restart, locally-loaded media files are referenced by blob URLs that are no longer valid. The session recovery system detects these invalid blob URLs and displays file re-selection prompts for each affected media source. The user selects the original files from disk, and the session resumes with all color corrections, annotations, and playback state intact. This ensures that no review work is lost even when the browser is closed unexpectedly or the system restarts.

---

## Storage Quota

Browser storage quotas vary by browser and device. The auto-save manager can check available storage:

- When the Storage API is available, quota information (used and total bytes) is accessible
- A warning is emitted when storage usage exceeds 80% of the available quota
- If storage is critically low, auto-save may fail; the error indicator appears in the header

To free storage, delete old snapshots and auto-save entries from the Snapshot Panel.

---

## History Panel

Press `Shift+Alt+H` to open the History Panel, which provides a unified view of both manual snapshots and auto-save entries. The panel supports:

- Chronological listing of all saved states
- Filtering by type (manual snapshot, auto-checkpoint, auto-save)
- Quick restore to any previous state
- Bulk delete operations

The History Panel is the primary interface for navigating session history and performing recovery operations.

---

## RV/GTO Session Compatibility

OpenRV Web can import desktop RV session files (.rv) that use the GTO (Graph Topology Object) binary format. The importer maps RV's node graph structure to OpenRV Web's internal state:

- **Source nodes** are mapped to media references
- **Color and CDL properties** are applied to the color pipeline
- **Transform properties** (rotation, flip, scale) are restored
- **Stereo settings** are mapped to the stereo control
- **Sequence/playlist structure** is reconstructed from RV's group nodes

Not all RV session features have web equivalents. Unsupported properties (e.g., hardware stereo mode, Mu/Python script references, custom node types) are logged as warnings during import but do not prevent the session from loading.

For detailed information on the RV session format, node mapping tables, and migration guidance, see [Session Compatibility](../guides/session-compatibility.md).

---

## Related Pages

- [Session Save and Load](../export/sessions.md) -- Brief overview and save/load workflow
- [Session Compatibility](../guides/session-compatibility.md) -- RV/GTO format details, node mapping, migration guide
- [Playlist Management](playlist.md) -- Playlist state included in session persistence
- [Review Workflow](review-workflow.md) -- Using sessions in dailies and review processes
- [Exporting Annotations](../annotations/export.md) -- Export annotations independently from the session
