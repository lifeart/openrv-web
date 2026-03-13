# DCC Integration

OpenRV Web provides a bridge for connecting to Digital Content Creation (DCC) applications, enabling bidirectional communication between the viewer and tools such as Nuke, Maya, and Houdini. This integration allows artists to send frames from their compositing or 3D application directly to the browser-based viewer, and to push review notes and status updates back to the DCC or production tracking systems.

---

::: tip Who uses this
Compositors, lighters, and animators use DCC integration for seamless roundtrip review with Nuke, Maya, and Houdini. Push a frame from your comp directly to OpenRV Web, check it with scopes and the show LUT, then send annotations back -- without saving files or switching applications.
:::

## DCC Bridge Architecture

The DCC bridge uses a **WebSocket** connection between OpenRV Web (running in the browser) and a lightweight bridge server process running alongside the DCC application. The bridge server translates between the DCC's internal scripting API and the OpenRV Web message protocol.

The typical deployment is:

```
DCC Application (Nuke/Maya/Houdini)
        |
        v
  Bridge Server (local WebSocket, port 9200)
        |
        v
  OpenRV Web (browser, connects to ws://localhost:9200)
```

The bridge server runs on the artist's workstation and requires no cloud infrastructure. The browser connects to `localhost`, so no network traversal or firewall configuration is needed for single-machine setups. For remote setups, the bridge server address can be configured in the OpenRV Web settings.

---

## Supported Applications

### Nuke

The Nuke bridge supports:

- **Send to viewer**: Render the current frame or frame range from Nuke and push the result to OpenRV Web for review. Supports EXR output with AOV layers.
- **Flipbook replacement**: Use OpenRV Web as an external flipbook viewer, replacing Nuke's built-in viewer for playback and color analysis.
- **Node selection sync**: Selecting a Read or Write node in Nuke can automatically load the corresponding media in OpenRV Web.
- **Annotation round-trip**: Annotations created in OpenRV Web can be sent back to Nuke as overlay data for reference during compositing.

### Maya

The Maya bridge supports:

- **Playblast to viewer**: Capture a playblast from the Maya viewport and send it to OpenRV Web for frame-accurate review.
- **Camera sync**: Synchronize the Maya camera with the OpenRV Web viewer for look-through comparison.
- **Shot context**: Push the current shot name, frame range, and camera metadata to OpenRV Web for display in the header and overlays.

### Houdini

The Houdini bridge supports:

- **Render to viewer**: Send Mantra, Karma, or other renderer output directly to OpenRV Web.
- **Flipbook integration**: Route Houdini's MPlay output to OpenRV Web instead.
- **Metadata pass-through**: Propagate render metadata (render time, memory usage, sample count) to the OpenRV Web info display.

---

::: tip VFX Use Case
The Nuke bridge replaces the traditional "render, save, open in RV" workflow with a direct push from the comp to the viewer. Compositors can send the current frame from Nuke to OpenRV Web to immediately check it with scopes, false color, and the show LUT -- without leaving Nuke. For Maya, routing playblasts directly to OpenRV Web gives animators frame-accurate review with timecode and markers, which the built-in Maya playblast viewer does not support.
:::

::: info Pipeline Note
ShotGrid integration closes the production tracking loop: review a shot in OpenRV Web, set the status to "Approved" or "Needs Revision," and the change is reflected in ShotGrid immediately. Notes and annotations are published as version notes with frame references, so artists see exactly which frame the feedback applies to. This eliminates the need to manually transcribe review notes from a screening into the tracking system.
:::

## Inbound Commands (DCC to Viewer)

The bridge server sends the following command types to OpenRV Web:

| Command | Description |
|---------|-------------|
| `load` | Load a media file by path or URL |
| `seek` | Navigate to a specific frame |
| `setFrameRange` | Set the in/out point range |
| `setMetadata` | Update shot name, status, and custom metadata fields |
| `setColorSpace` | Set the input color space for loaded media |
| `ping` | Health check for connection monitoring |

Commands are JSON messages sent over the WebSocket connection. OpenRV Web validates and applies each command, updating the viewer state accordingly.

---

## Outbound Commands (Viewer to DCC)

OpenRV Web can send information back to the DCC application:

| Command | Description |
|---------|-------------|
| `frameChanged` | Current frame position updated |
| `annotationCreated` | New annotation or note added |
| `statusChanged` | Shot status updated (approved, needs revision, etc.) |
| `colorChanged` | Color correction values changed |

These outbound messages enable workflows where an artist reviews in the browser and the DCC application responds -- for example, jumping Nuke's viewer to the same frame, or recording review notes directly in the DCC project file.

---

## ShotGrid Integration

OpenRV Web integrates with Autodesk ShotGrid (formerly Shotgun) for production tracking:

- **Version loading**: Load versions directly from ShotGrid by pasting a version URL or using the ShotGrid panel in OpenRV Web.
- **Note publishing**: Publish review notes and annotations from OpenRV Web back to ShotGrid as version notes, with frame references and thumbnails.
- **Status updates**: Change version status (e.g., mark as "Approved" or "Revisions Needed") directly from the viewer. Status changes are written back to ShotGrid via the API.
- **Playlist sync**: ShotGrid playlists can be imported into OpenRV Web as review playlists, maintaining clip order and metadata.

ShotGrid integration requires a valid API key configured in the ShotGrid panel's config section. Authentication uses the ShotGrid REST API with token-based access.

---

## Related Pages

- [Scripting API](scripting-api.md) -- Programmatic control via `window.openrv`
- [Review Workflow](review-workflow.md) -- Shot status tracking and dailies processes
- [Network Sync](network-sync.md) -- Collaborative review sessions
- [Session Management](session-management.md) -- Saving and restoring viewer state
