# Session Compatibility

> *Portions of this guide are adapted from [OpenRV Reference Manual, Chapter 6](https://github.com/AcademySoftwareFoundation/OpenRV), (c) Contributors to the OpenRV Project, Apache 2.0. Content has been rewritten for the TypeScript/WebGL2 implementation of OpenRV Web.*

---

## Overview

OpenRV Web provides bidirectional session interoperability: it can **import desktop RV session files** (.rv) with full node graph reconstruction, and it has its own **native session format** (.orvproject) with auto-save, snapshot versioning, and crash recovery.

This guide covers the RV/GTO session format, the node mapping between desktop RV and OpenRV Web, supported and unsupported features, and a practical migration guide for teams moving from desktop RV to the browser-based workflow.

---

## RV Session Format (GTO)

Desktop OpenRV saves sessions in the **GTO (Graph Topology Object)** binary format. A GTO file serializes the complete node graph as a collection of named objects, each containing typed properties organized into components.

### GTO Structure

A GTO file consists of:

- **Objects**: Named entities corresponding to nodes in the graph. Each object has a protocol string identifying its node type (e.g., `RVFileSource`, `RVSequenceGroup`, `RVStackGroup`)
- **Components**: Named property groups within an object (e.g., `media`, `color`, `transform`, `cut`)
- **Properties**: Typed data values within a component. GTO supports integers, floats, strings, and arrays of these types

### Property Types

GTO supports the following property data types, all of which are handled by the `gto-js` parser:

| GTO Type | TypeScript Mapping | Example Usage |
|----------|-------------------|---------------|
| int (scalar) | number | Frame numbers, indices |
| int (array) | number[] | EDL frame lists, marker positions |
| float (scalar) | number | Exposure, opacity, wipe position |
| float (array) | number[] | CDL slope/offset/power (RGB triplets), color values |
| string | string | File paths, node names, display names |
| string (array) | string[] | Source media paths, view node references |
| byte (array) | Uint8Array | Binary data (annotations, thumbnails) |

### How OpenRV Web Reads GTO

The `GTOGraphLoader` (`src/core/session/GTOGraphLoader.ts`) uses the `gto-js` library to parse the binary GTO format. The loading process:

1. **Parse binary data**: The `gto-js` parser reads the GTO header, object table, and property data
2. **Extract session metadata**: The `RVSession` object provides global settings (current frame, FPS, in/out points, markers, display name, comment)
3. **Map protocols to node types**: Each GTO object's protocol string is mapped to an OpenRV Web node type using the `PROTOCOL_TO_NODE_TYPE` lookup table
4. **Create nodes**: `NodeFactory.create(type)` instantiates nodes for each recognized protocol
5. **Restore properties**: GTO properties are transferred to the node's `PropertyContainer`
6. **Reconstruct connections**: Input/output connections specified in the GTO data are re-established between nodes
7. **Build the graph**: The reconstructed nodes are added to a `Graph` instance with the correct output node

---

## Node Mapping

The following table shows how desktop RV node types map to OpenRV Web node types:

### Source Nodes

| RV Protocol | OpenRV Web Node | Description |
|-------------|----------------|-------------|
| `RVFileSource` | `FileSourceNode` | Single image file |
| `RVImageSource` | `FileSourceNode` | Image source (alias for RVFileSource) |
| `RVMovieSource` | `VideoSourceNode` | Video file |
| `RVSequenceSource` | `SequenceSourceNode` | Image sequence |
| `RVMovieProc` | `ProceduralSourceNode` | Procedural test patterns |

### Group Nodes

| RV Protocol | OpenRV Web Node | Description |
|-------------|----------------|-------------|
| `RVSequenceGroup` | `SequenceGroupNode` | Linear playback of sources |
| `RVStackGroup` | `StackGroupNode` | Layered compositing with blend modes |
| `RVLayoutGroup` | `LayoutGroupNode` | Grid/spatial arrangement |
| `RVSwitchGroup` | `SwitchGroupNode` | A/B switching |
| `RVFolderGroup` | `FolderGroupNode` | Organizational container |
| `RVRetimeGroup` | `RetimeGroupNode` | Speed/time remapping |

### Effect and Processing Nodes

| RV Protocol | OpenRV Web Node | Status |
|-------------|----------------|--------|
| `RVCDL` | `CDLNode` | Supported |
| `RVColor` | Color adjustments | Properties mapped to session color state |
| `RVTransform2D` | Transform state | Properties mapped to session transform |
| `RVLensWarp` | Lens distortion state | Properties mapped to session lens params |
| `RVLinearize` | Linearize state | Transfer function selection |
| `RVCacheLUT` | `CacheLUTNode` | Pre-cache LUT application |
| `RVLookLUT` | LUT state | Look LUT reference |
| `RVRetime` | Retime properties | Mapped to RetimeGroupNode |

### Display and View Nodes

| RV Protocol | OpenRV Web Node | Status |
|-------------|----------------|--------|
| `RVDisplayColor` | Display color state | Properties read for display configuration |
| `RVDisplayStereo` | Stereo display state | Stereo mode and settings |
| `RVSourceStereo` | Source stereo state | Per-source stereo configuration |
| `RVViewGroup` | View state | View configuration container |
| `RVDisplayGroup` | Display state | Display configuration container |
| `RVViewPipelineGroup` | Pipeline state | View pipeline configuration |
| `RVOverlay` | Overlay state | HUD and overlay settings |
| `RVFormat` | Format state | Pixel format configuration |
| `RVChannelMap` | Channel state | Channel remapping |

### Color Management Nodes

| RV Protocol | OpenRV Web Node | Status |
|-------------|----------------|--------|
| `RVOCIO` | OCIO state | OCIO color space settings (partially implemented) |
| `RVICCTransform` | ICC state | ICC profile transforms |

---

## Supported Features

The following table summarizes which desktop RV session features are supported when loading .rv files in OpenRV Web:

| Feature Category | Feature | Status | Notes |
|-----------------|---------|--------|-------|
| **Sources** | File source references | Supported | Path stored; user prompted to re-select files |
| | Image sequences | Supported | Pattern and frame range restored |
| | Video sources | Supported | Requires re-loading the video file |
| | Procedural sources (.movieproc) | Supported | Full URL parsing with OpenRV aliases |
| **Views** | Sequence view | Supported | EDL data, durations, frame mapping |
| | Stack view | Supported | Composite type, per-layer blend modes |
| | Layout view | Supported | Grid configuration, spacing |
| | Switch view | Supported | Active input index |
| | Folder organization | Supported | Pass-through container |
| | Retime | Supported | Scale, offset, reverse, explicit mapping, warp keyframes |
| **Color** | Exposure, brightness, contrast, saturation | Supported | Mapped to color adjustment state |
| | Hue rotation | Supported | Mapped to color state |
| | CDL (Slope, Offset, Power, Saturation) | Supported | Full SOP + Sat |
| | Color temperature / tint | Supported | Mapped to color state |
| **Playback** | Current frame | Supported | Restored on load |
| | In/out points | Supported | Frame range restored |
| | FPS | Supported | Playback rate restored |
| | Markers | Supported | Frame positions with notes and colors |
| | Loop mode | Supported | Loop, once, bounce |
| | Frame increment | Supported | Step size for frame advance |
| **Annotations** | Paint strokes | Supported | Per-frame annotations |
| | Paint effects (ghost, hold) | Supported | Effect modes restored |
| **Stereo** | Stereo mode | Supported | All software stereo modes |
| | Eye swap | Supported | Left/right reversal |
| | Convergence offset | Supported | Horizontal parallax adjustment |
| | Per-eye transforms | Supported | Geometric correction |
| **Session Metadata** | Display name | Supported | Session title |
| | Comment | Supported | Descriptive text |
| | Creation context / origin | Supported | Session provenance |
| | Background color | Supported | Canvas background |
| **Transform** | 2D transform (rotate, flip, scale) | Supported | Mapped to session transform state |
| | Lens distortion | Supported | K1, K2, center point |
| | Crop region | Supported | Enabled flag, region bounds |
| **LUT** | LUT file reference | Supported | Path stored; file must be re-loaded |
| | LUT intensity | Supported | Blend amount (0-1) |
| **Not Supported** | Mu/Python scripts | Not supported | No scripting engine in browser |
| | Custom plugin node types | Not supported | Only built-in node types recognized |
| | Hardware display calibration | Not supported | No OS-level display access |
| | Embedded OCIO configs | Partially supported | Config must be re-loaded separately |
| | Audio tracks (RVSoundTrack) | Recognized | Node created but audio not decoded from GTO |
| | Waveform display node | Recognized | Node type stored but not rendered |

---

## Session State Schema

The `SessionState` interface (`src/core/session/SessionState.ts`) defines the serializable state at schema version 2. Note that some viewer states (OCIO, tone mapping, stereo, difference matte, curves, and others) are not yet included in the schema and revert to defaults on reload. See the [Known Omissions](../advanced/session-management.md#known-omissions) section in the session management docs for the full list.

| Field | Type | Description |
|-------|------|-------------|
| `version` | number | Schema version (currently 2) |
| `name` | string | Project name |
| `createdAt` | string | ISO 8601 creation timestamp |
| `modifiedAt` | string | ISO 8601 last-modified timestamp |
| `media` | MediaReference[] | Source file references |
| `playback` | PlaybackState | Frame, in/out, FPS, loop mode, volume, marks |
| `paint` | SerializedPaintState | Per-frame annotations and paint effects |
| `view` | ViewState | Zoom and pan position |
| `color` | ColorAdjustments | Brightness, contrast, saturation, exposure, gamma |
| `cdl` | CDLValues | ASC CDL Slope, Offset, Power, Saturation |
| `filters` | FilterSettings | Blur, sharpen parameters |
| `transform` | Transform2D | Rotation, flip, scale, translate |
| `crop` | CropState | Crop region |
| `lens` | LensDistortionParams | K1, K2, center point |
| `wipe` | WipeState | Wipe mode and position |
| `stack` | StackLayer[] | Layer stack configuration |
| `noiseReduction` | NoiseReductionParams? | Noise reduction settings |
| `watermark` | WatermarkState? | Watermark overlay |
| `lutPath` | string? | LUT file reference (path only, not embedded) |
| `lutIntensity` | number | LUT blend amount (0-1) |
| `par` | PARState? | Pixel aspect ratio correction |
| `backgroundPattern` | BackgroundPatternState? | Alpha visualization pattern |
| `playlist` | PlaylistState? | Multi-clip playlist |
| `notes` | Note[]? | Review notes and comments |
| `versionGroups` | VersionGroup[]? | Version comparison groups |
| `statuses` | StatusEntry[]? | Shot status entries |
| `graph` | SerializedGraph? | Node graph topology (v2+) |

---

## Migration Guide: Desktop RV to OpenRV Web

### Step 1: Open the .rv Session File

Load the .rv session file into OpenRV Web via the file picker or drag-and-drop. The GTOGraphLoader parses the binary GTO data and reconstructs the node graph.

### Step 2: Re-link Media Files

Desktop RV sessions store **absolute filesystem paths** for source media. Since the browser cannot access local filesystems directly, OpenRV Web will prompt you to re-select each media file:

1. A file reload dialog appears for each source reference
2. The dialog shows the expected filename from the original session
3. Select the matching file from your local filesystem
4. If the filename differs, a mismatch warning is displayed
5. Click "Skip" to continue without loading a particular source

For image sequences, you may need to select all frame files at once.

### Step 3: Verify Restored State

After media files are linked, verify that the session state has been correctly restored:

- **View arrangement**: Check that sources appear in the correct order (sequence) or layers (stack)
- **Color corrections**: Verify that exposure, CDL, and color adjustments match the desktop session
- **Playback settings**: Confirm FPS, in/out points, and markers are present
- **Annotations**: Check that per-frame paint annotations appear correctly

### Step 4: Re-apply Unsupported Features

The following features from the desktop session will need manual re-application:

| Feature | Action Required |
|---------|----------------|
| OCIO configuration | Re-load the .ocio config file via the OCIO panel |
| Custom Mu/Python scripts | No equivalent; functionality must be achieved through built-in tools |
| Plugin-dependent node types | These nodes are skipped during import |
| Hardware display calibration | Use the browser's built-in color management |
| LUT files referenced by path | Re-load LUT files via the LUT panel |

### Step 5: Save as .orvproject

Once the session is verified, save it in the native format:

1. Click the **Save** button in the header bar (there is no keyboard shortcut for project save; `Ctrl+S` exports the current frame)
2. The session is exported as an `.orvproject` JSON file
3. Media references with blob URLs are marked with `requiresReload: true`
4. Subsequent loads of the .orvproject will prompt for file re-selection

---

## Native Session Management

### .orvproject Format

OpenRV Web's native session format is a JSON file containing the `SessionState`. Note that some viewer states are not yet included in the serialized output; see [Known Omissions](../advanced/session-management.md#known-omissions). The `SessionSerializer` handles:

- **Save**: `toJSON()` collects state from the session, paint engine, and viewer. Blob URLs are detected and flagged with `requiresReload: true` to prevent saving invalid URLs
- **Load**: `loadFromFile()` validates the JSON structure, checks the schema version, and applies migrations if needed. For media with `requiresReload: true`, a file reload dialog prompts the user to re-select each file
- **Migration**: Automatic migration from schema version 1 to version 2. The version field enables forward compatibility as the schema evolves

### Auto-Save

The `AutoSaveManager` provides automatic session persistence:

- **Storage**: IndexedDB database (`openrv-web-autosave`)
- **Interval**: Configurable from 1 to 30 minutes (default: 5 minutes)
- **Debouncing**: Multiple rapid changes are batched within a debounce window
- **Max versions**: Configurable limit (1-100, default: 10) with auto-pruning of oldest entries
- **Crash recovery**: On startup, the manager checks for a clean shutdown flag. If missing (indicating a crash or forced close), it emits a `recoveryAvailable` event so the UI can offer to restore the most recent auto-save

**Auto-save indicator states**:

| State | Visual | Description |
|-------|--------|-------------|
| idle | Cloud icon, muted | Shows relative time since last save |
| saving | Cloud icon, pulsing | Save in progress |
| saved | Cloud-check icon, green | Successfully saved (3 seconds) |
| error | Cloud-off icon, red | Save failed (clickable for retry) |
| disabled | Cloud-off icon, muted | Auto-save is turned off |

### Snapshots

The `SnapshotManager` provides manual and automatic versioned snapshots:

- **Storage**: IndexedDB database (`openrv-web-snapshots`)
- **Types**: Manual snapshots (user-created, up to 50) and auto-checkpoints (system-created before major operations, up to 10)
- **Preview metadata**: Each snapshot stores source name, current frame, annotation count, and whether a color grade is active
- **Operations**: Create, restore, rename, export (portable JSON), import, delete, clear all
- **Search and filter**: Snapshots can be searched by name/description and filtered by type (All / Manual / Auto)

### Playlist Management

The `PlaylistManager` handles multi-clip editorial workflows:

- **Clip management**: Add, remove, reorder clips with automatic global frame recalculation
- **Frame mapping**: Converts global timeline frames to clip-local frame numbers
- **Loop modes**: Single clip loop, all clips loop, and no-loop with `playlistEnded` event
- **EDL import/export**: Import RV EDL files; export CMX3600 EDL for NLE interchange
- **Navigation**: `advance()` and `goBack()` handle clip boundary transitions

### Session Graph Persistence

Starting with schema version 2, the `.orvproject` format includes an optional `graph` field containing the serialized node graph topology. The graph is only present when a node graph has been explicitly constructed (e.g., multi-source sessions, imported RV sessions). Simple single-file viewing sessions typically do not produce a graph. When the `graph` field is present, it preserves:

- Node types and IDs
- Input/output connections between nodes
- Property values for all nodes
- The active output node

When the `graph` field is absent (version 1 projects or simple sessions without an explicit graph), OpenRV Web falls back to reconstructing a default graph from the media references and playback state.

### IndexedDB Storage Architecture

OpenRV Web uses two separate IndexedDB databases for persistent storage:

| Database | Purpose | Contents |
|----------|---------|----------|
| `openrv-web-autosave` | Auto-save entries | Session state snapshots with timestamps and metadata |
| `openrv-web-snapshots` | Manual and auto snapshots | Versioned session snapshots with preview metadata |

Both databases use auto-incrementing integer keys and store the full `SessionState` object as a structured clone. Storage quota is monitored via the Storage API, and warnings are emitted when available space drops below a threshold.

### Blob URL Lifecycle

A critical aspect of session persistence is the handling of blob URLs. When a user loads a local file, the browser creates a blob URL via `URL.createObjectURL()`. These URLs are:

- **Session-scoped**: Valid only within the current browser tab
- **Not serializable**: Invalid after browser close, navigation, or crash
- **Detectable**: Start with `blob:` prefix

The `SessionSerializer` handles this by:

1. Detecting blob URLs during save
2. Setting `requiresReload: true` on the media reference
3. Clearing the path to prevent saving invalid URLs
4. On load, prompting the user to re-select each file via the file reload dialog

This ensures that saved sessions remain portable and valid, even when media files are not available at the original URL.

### Version Migration

The session state schema includes a version number for forward compatibility. When loading a session with an older schema version, the `SessionSerializer` applies migrations automatically:

- **v1 to v2**: Adds the `graph` field for node graph topology persistence, adds `noiseReduction` and `watermark` fields, adds `playlist`, `notes`, `versionGroups`, and `statuses` fields

Future schema changes will follow the same migration pattern, ensuring that older `.orvproject` files remain loadable.

---

## Related Pages

- [Node Graph Architecture](node-graph-architecture.md) -- Detailed documentation of node types and the DAG evaluation model
- [File Formats](file-formats.md) -- Format support for source files referenced in sessions
- [Stereo 3D Viewing](stereo-3d-viewing.md) -- Stereo settings persistence in sessions
