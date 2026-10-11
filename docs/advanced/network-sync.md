# Network Sync and Collaboration

OpenRV Web supports real-time collaborative review sessions where multiple users view the same content simultaneously with synchronized playback, view controls, and annotations.

---

::: tip Who uses this
Distributed VFX teams use network sync to run remote review sessions across studios and time zones. A supervisor in London and a client in LA can review the same frame simultaneously -- no file uploads, no third-party platform, no per-seat fees.
:::

## Room Creation

A review session begins when a host creates a room. The host is the user who initiates the session and has authority over playback state.

To create a room:

1. Click the **Network** button in the header bar (users icon, right side)
2. Click **Create Room** in the connection panel
3. A room code is generated in the format `XXXX-XXXX`

The room code uniquely identifies the session. Share this code with participants so they can join.

**Keyboard shortcut**: Press `Shift+N` to open the network panel directly.

---

## Joining a Room

Rooms are end-to-end encrypted, so participants join with the host's **invite link**, not the room code alone.

1. The host clicks **Copy Invite URL** in the Network panel and sends the link to participants
2. The host sends the room **PIN** separately (for example by phone or a different chat)
3. Participants open the link (or paste it into the **Room Code** field and click **Join Room**) and enter the PIN

Opening the link prefills the room code. If the room has a PIN, typing it in the Network panel joins the room. If the host cleared the PIN, the link joins without any manual steps. The PIN is never part of the link.

Invalid or non-existent room codes produce an error message. If the room has reached its maximum participant count, a "Room is full" error is displayed. Malformed or corrupted share links display an error notification explaining that the link could not be processed.

---

## User Presence

When connected to a room, all participants are visible in the connection panel and as avatar overlays in the viewer.

- The **connection panel** shows a list of connected users with their names and roles. Your own entry is labeled "You (Host)" if you are the host, or "You" otherwise. Other host users are labeled "Host."
- **Presence avatars** appear in the top-right corner of the viewer as colored circles with user initials. Each user is assigned a distinct color. Hovering over an avatar shows the user name.
- The **network button badge** displays the current participant count.

Toast notifications announce user activity:
- "User joined the room" when a participant connects
- "User left the room" when a participant disconnects

---

## Sync Settings

Not all state needs to be synchronized at all times. The sync settings panel (visible when connected) provides per-category toggles:

| Setting | Default | Syncs |
|---------|---------|-------|
| Playback | Enabled | Play/pause, frame position, speed, direction, loop mode, in/out points |
| View (Pan/Zoom) | Enabled | Pan offset, zoom level, channel isolation mode |
| Color Adjustments | Disabled | Exposure, gamma, contrast, saturation, CDL, LUT settings |
| Annotations | Disabled | Live drawing, text, shapes |

Disabling a sync category means that changes in that category made by any participant are not propagated. This allows individual users to independently adjust color or annotations without affecting the shared view.

Sync settings persist across reconnection events.

---

## Host and Participant Roles

The room creator is the **host**. All other users are **participants**.

- **Host authority**: For playback position and state, the host is the source of truth. When conflicts arise (e.g., two users seek to different frames simultaneously), the host's state wins.
- **Participant control**: Participants can still control playback locally. Their actions are sent to the room and applied if sync is enabled. However, in conflict scenarios, the host's state takes precedence.
- **Host disconnect**: If the host disconnects and reconnects, they regain host status. If the host permanently leaves, the room may be closed depending on server configuration.
- **Viewer role**: The host can switch any participant between **Reviewer** and **Viewer** from the user list. Viewers follow along but their playback, view, color, annotation and note changes are ignored by everyone else.
- **Host-only actions**: Only the host can send the initial session state, assign roles, or replace the full note list. State, annotations and notes sent by anyone else are ignored.

---

## Connection Technology

OpenRV Web uses **WebSocket** connections (Secure WebSocket, `wss://`) as the primary transport for sync communication and signaling. WebSocket provides low-latency bidirectional messaging suitable for real-time playback synchronization. For media transfer and direct peer-to-peer data exchange, **WebRTC** data channels are used alongside WebSocket.

### URL-Based Signaling

Room connection is established through URL-based signaling. The invite URL carries the room code as a query parameter and the room key in the URL fragment (the part after `#`). Browsers never send the fragment to the signaling server or any web server. Malformed or corrupted signaling URLs display an error notification to the user rather than failing silently.

### End-to-End Encryption and the PIN

Every room gets a fresh random 128-bit room key when it is created. All traffic between participants (playback, view, color, annotations, notes, session state, media transfer and WebRTC signaling) is encrypted with AES-GCM under a key derived from the room key, the room code and the PIN. The relay server only sees the room code and who is connected; it cannot read or forge room messages, and it cannot relabel a message as coming from another participant.

The PIN is a second factor: when a PIN is set, someone who obtains the invite link still cannot read or send anything without it. Because the room key is random, the PIN cannot be guessed offline from captured traffic. Messages that are not encrypted with the room's key are dropped, and a participant with the wrong PIN sees a warning instead of room content.

Anyone with both the link and the PIN can take part, so share them only with the intended reviewers.

### Latency Compensation

The sync protocol includes timestamp-based latency compensation:

1. Each sync message carries a sender timestamp
2. Ping/pong messages measure round-trip time (RTT) between participants
3. Frame position is predicted based on playback state and measured RTT
4. Minor frame differences (within a 2-frame threshold) are tolerated without forced resync to avoid visual stuttering

---

::: tip VFX Use Case
Network sync enables remote cinesync-style review sessions where the director, VFX supervisor, and client can all view the same frame simultaneously from different locations. The host (typically the VFX supervisor or coordinator) controls playback while participants follow along. Disable color sync so each participant can view on their own calibrated display without overriding each other's display profiles.
:::

::: info Pipeline Note
For remote dailies with a director or client, create the room with a PIN for security -- review content is typically confidential before release. Share the room link via a secure channel. Each participant must load the same media files locally, so ensure the review package has been distributed to all sites before the session begins.
:::

## WebRTC Peer Connections

In addition to WebSocket-based sync, OpenRV Web supports direct peer-to-peer connections via WebRTC for lower-latency communication. NAT traversal uses public STUN and TURN servers (Google, Cloudflare, OpenRelay) so peers behind firewalls and NATs can establish direct connections. URL-based signaling enables serverless P2P connection setup -- participants exchange connection offers through encoded URLs without needing a dedicated signaling server. If a WebRTC invite link is malformed, expired, or already consumed, the application displays an error notification explaining why the link could not be processed.

## Media Transfer

Each participant typically loads media independently. However, when direct file access is not available, the media transfer system supports request/offer/chunk-based sharing between peers. A participant who joins with an empty session can request media from the host. The host is asked to approve every request before any file is sent, and the participant is asked to accept the incoming size. Files are read and sent one chunk at a time with flow control, so large transfers do not need to fit in memory. Each participant can have one transfer in progress at a time. For standard workflows, all users should have access to the same media files through:

- Shared network storage (NFS, SMB)
- Cloud storage URLs
- Local copies of the same files

When the host loads new media, a notification is sent to participants indicating the media name, allowing them to load the same file on their end.

---

## Reconnection

Network interruptions are handled automatically:

1. On disconnect, an immediate reconnection attempt is made
2. Subsequent attempts use exponential backoff: 1 second, 2 seconds, 4 seconds, 8 seconds, up to a maximum of 30 seconds
3. After successful reconnection, a full state sync is requested from the host to bring the participant up to date
4. After 10 failed attempts, the system stops retrying and presents a manual reconnect option
5. Toast notifications keep the user informed: "Connection lost. Reconnecting...", "Reconnected successfully"

A sync status indicator in the header bar shows the current connection state:
- **Green checkmark**: Synced and up to date
- **Yellow spinner**: Syncing in progress
- **Red warning**: Conflict detected, manual intervention may be needed
- **Gray icon**: Disconnected / offline

**Quick disconnect**: Press `Ctrl+Shift+Alt+N` to disconnect from the current room immediately.

---

## Remote Cursors

When cursor sync is active, each participant's mouse position is broadcast to the room and displayed as a colored cursor overlay on every other participant's viewer.

### Appearance

Each remote cursor is rendered as an **SVG arrow** filled with the participant's assigned color and outlined in dark semi-transparent stroke. A **name label** appears beside the arrow, displayed as white text on a colored badge matching the participant's color. The label uses an 11px font with a 3px border-radius for readability.

### Coordinate Mapping

Cursor positions are transmitted as **normalized coordinates** in the 0--1 range. The overlay maps these values to the current viewer display dimensions, so cursors appear at the correct relative position regardless of each participant's window size or zoom level.

### Fade-Out Behavior

Cursors that have not received an update for **5 seconds** begin a 2-second fade-out transition. Once the fade completes (7 seconds total inactivity), the cursor element is removed from the DOM entirely. Any new movement from that participant recreates the cursor at full opacity.

### Automatic Cleanup

When a participant **disconnects** from the room, their cursor is removed immediately via the `removeCursor` method. When the local user **leaves** the room or the overlay is deactivated, all remote cursors are cleared at once. The overlay itself is hidden (set to `display: none`) when collaboration is not active.

---

## Related Pages

- [Session Management](session-management.md) -- Saving and restoring session state
- [Review Workflow](review-workflow.md) -- Dailies and collaborative review processes
- [Scripting API](scripting-api.md) -- Programmatic control of playback and view state
