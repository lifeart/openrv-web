# DCC Integration

OpenRV Web ships a **generic WebSocket bridge** for connecting to Digital Content Creation (DCC) applications. The bridge provides a small, application-agnostic message protocol for loading media, synchronizing frames, syncing color settings, and receiving annotations/notes. It is not tied to any specific DCC tool -- the same protocol works with Nuke, Maya, Houdini, or any application that can open a WebSocket and send JSON messages.

---

::: tip Who uses this
Compositors, lighters, and animators use the DCC bridge for roundtrip review. A bridge server running alongside the DCC application can push frames to OpenRV Web for review with scopes and the show LUT, and receive annotations back -- without saving files or switching applications. The bridge server is something your pipeline or TD team builds for each DCC tool; OpenRV Web provides the viewer-side protocol.
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

The bridge server runs on the artist's workstation and requires no cloud infrastructure. The browser connects to `localhost`, so no network traversal or firewall configuration is needed for single-machine setups. For remote setups, the bridge server address can be configured in the OpenRV Web settings (see [Configuring the DCC Endpoint](#configuring-the-dcc-endpoint) below).

---

## Configuring the DCC Endpoint

There are two ways to tell OpenRV Web where the DCC bridge server is running:

### 1. URL Query Parameter (one-time)

Append `?dcc=<ws-url>` to the page URL:

```
https://your-host/openrv?dcc=ws://localhost:9200
```

This is useful for quick, one-off connections. The query parameter always takes highest priority.

### 2. Persisted Setting (across sessions)

OpenRV Web can persist the DCC bridge endpoint in the browser's localStorage so you do not need to add `?dcc=` to the URL every time. The setting is stored under the key `openrv-dcc-endpoint` and includes two fields:

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `endpoint` | string | `""` | WebSocket URL (e.g. `ws://localhost:9200`). Empty means disabled. |
| `autoConnect` | boolean | `true` | Whether to auto-connect on page load when a persisted endpoint exists. |

You can set the endpoint programmatically:

```ts
import { setDCCPrefs } from './integrations/DCCSettings';

// Persist the DCC bridge endpoint
setDCCPrefs({ endpoint: 'ws://localhost:9200' });

// Disable auto-connect (bridge only activates via ?dcc= param)
setDCCPrefs({ autoConnect: false });

// Clear the persisted endpoint
import { clearDCCPrefs } from './integrations/DCCSettings';
clearDCCPrefs();
```

The DCC endpoint setting is also included in the preferences export/import/reset flow managed by `PreferencesManager`.

### Priority Order

When OpenRV Web starts, it resolves the DCC endpoint in this order:

1. **`?dcc=` query parameter** -- highest priority, always wins
2. **Persisted endpoint** -- used when `autoConnect` is `true` and no query parameter is present
3. **No bridge** -- if neither source provides a URL, no DCC bridge is created

---

## Example DCC Integration Patterns

The sections below describe **example integration patterns** that a pipeline or TD team could build on the DCC side using the generic bridge protocol. OpenRV Web does **not** ship Nuke-, Maya-, or Houdini-specific bridge modules -- these are reference designs showing how the four inbound commands (`loadMedia`, `syncFrame`, `syncColor`, `ping`) and the outbound events (`frameChanged`, `colorChanged`, `annotationAdded`, `noteAdded`) can be wired to DCC-specific workflows.

### Nuke

A Nuke-side bridge server (e.g., a Python plugin using `nuke.callbacks`) could implement:

- **Send to viewer**: Render the current frame or frame range and send a `loadMedia` message with the output path so OpenRV Web loads the result for review.
- **Flipbook replacement**: Route flipbook renders to a local path and send `loadMedia`, using OpenRV Web as an external flipbook viewer instead of Nuke's built-in one.
- **Node selection sync**: Listen for node selection changes in Nuke's callback system and send `loadMedia` with the selected Read/Write node's file path.
- **Annotation round-trip**: Listen for `annotationAdded` events from the bridge and convert them into Nuke overlay data for reference during compositing.

### Maya

A Maya-side bridge server (e.g., a Python plugin using `maya.cmds` / `maya.api`) could implement:

- **Playblast to viewer**: Capture a playblast and send `loadMedia` with the output path for frame-accurate review in OpenRV Web.
- **Camera sync**: Map Maya camera changes to `syncFrame` messages, or use `syncColor` to push exposure/gamma values matching the Maya viewport.
- **Shot context**: Encode shot name and frame range into `loadMedia` messages so OpenRV Web displays the correct context.

### Houdini

A Houdini-side bridge server (e.g., a Python SOP/ROP callback or shelf tool) could implement:

- **Render to viewer**: Send `loadMedia` after a Mantra, Karma, or other render completes, pointing to the output file.
- **Flipbook integration**: Route Houdini's MPlay output path to a `loadMedia` message, using OpenRV Web as the flipbook viewer.
- **Frame sync**: Use `syncFrame` to keep the Houdini and OpenRV Web timelines in lockstep during playback.

---

::: tip VFX Use Case
With a DCC-side bridge server in place, the traditional "render, save, open in RV" workflow becomes a direct push from the comp to the viewer. A compositor's Nuke plugin can send `loadMedia` after rendering a frame, and OpenRV Web immediately displays it with scopes, false color, and the show LUT -- without leaving Nuke. Similarly, a Maya bridge plugin can route playblasts directly to OpenRV Web for frame-accurate review.
:::

::: info Pipeline Note
ShotGrid integration closes the production tracking loop: review a shot in OpenRV Web, set the status to "Approved" or "Needs Revision," and the change is reflected in ShotGrid immediately. Notes and annotations are published as version notes with frame references, so artists see exactly which frame the feedback applies to. This eliminates the need to manually transcribe review notes from a screening into the tracking system.
:::

## Inbound Commands (DCC to Viewer)

The bridge server sends the following command types to OpenRV Web:

| Command | Description |
|---------|-------------|
| `loadMedia` | Load a media file by path or URL. Requires a `path` field; optional `frame` field to seek after loading. |
| `syncFrame` | Navigate to a specific frame. Requires a numeric `frame` field. |
| `syncColor` | Sync color settings. Optional fields: `exposure`, `gamma`, `temperature`, `tint` (all numeric), and `lutPath` (string). |
| `ping` | Health check for connection monitoring. The bridge responds with a `pong` message. |

Commands are JSON messages sent over the WebSocket connection. Each message must include a `type` field matching one of the commands above. An optional `id` field can be included for request-response correlation, and an optional `timestamp` field (ISO 8601) for logging. OpenRV Web validates each command and responds with an `error` message (code `UNKNOWN_TYPE`, `INVALID_PARAMS`, `INVALID_MESSAGE`, or `PARSE_ERROR`) if the message is malformed or unrecognized.

---

## Outbound Events (Viewer to DCC)

OpenRV Web sends the following event types back to the DCC application:

| Event | Description |
|-------|-------------|
| `frameChanged` | Current frame position updated. Includes `frame` and `totalFrames` fields. |
| `colorChanged` | Color correction values changed. Includes `exposure`, `gamma`, `temperature`, and `tint` fields. |
| `annotationAdded` | New annotation added. Includes `frame`, `annotationType` (`pen`, `text`, or `shape`), and `annotationId` fields. |
| `noteAdded` | New review note added. Includes `frame`, `text`, `author`, `status`, and `noteId` fields. |
| `error` | Error response. Includes `code` and `message` fields. Sent when an inbound message is invalid or unrecognized. |
| `ping` | Outbound heartbeat sent by the bridge for connection health monitoring. |
| `pong` | Heartbeat response to an inbound `ping`. |

These outbound messages allow a DCC-side bridge server to react to viewer activity -- for example, a Nuke plugin could listen for `frameChanged` to keep its viewer in sync, or record `noteAdded` events as annotations in the project file. What the DCC side does with these events is up to the bridge server implementation.

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
