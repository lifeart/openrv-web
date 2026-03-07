# Network Sync and Collaboration

OpenRV Web supports real-time collaborative review sessions where multiple users view the same content simultaneously with synchronized playback, view controls, and annotations. Network sync transforms the application from a single-user viewer into a shared review environment accessible from any browser.

---

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

Participants join an existing room by entering the room code provided by the host.

1. Click the **Network** button in the header bar
2. Enter the room code in the **Room Code** field
3. Click **Join Room**

Alternatively, the host can copy a shareable URL using the **Copy Link** button. Opening this URL in a browser automatically populates the room code and initiates a join.

Invalid or non-existent room codes produce an error message. If the room has reached its maximum participant count, a "Room is full" error is displayed.

---

## User Presence

When connected to a room, all participants are visible in the connection panel and as avatar overlays in the viewer.

- The **connection panel** shows a list of connected users with their names and roles. The host is labeled "You (Host)."
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

---

## Connection Technology

OpenRV Web uses **WebSocket** connections (Secure WebSocket, `wss://`) for all sync communication. WebSocket provides low-latency bidirectional messaging suitable for real-time playback synchronization.

### URL-Based Signaling

Room connection is established through URL-based signaling. The shareable room URL encodes the room code and server endpoint, allowing one-click joining without manual code entry.

### PIN Encryption

For sensitive review content, rooms can be secured with a PIN code. When a PIN is set during room creation, all participants must enter the PIN to join. The PIN encrypts the room access token, preventing unauthorized access even if the room code is intercepted.

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

## Media Transfer

Each participant loads media independently. The room does not transfer media files between participants. All users must have access to the same media files, whether through:

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

**Quick disconnect**: Press `Shift+Ctrl+N` to disconnect from the current room immediately.

---

## Related Pages

- [Session Management](session-management.md) -- Saving and restoring session state
- [Review Workflow](review-workflow.md) -- Dailies and collaborative review processes
- [Scripting API](scripting-api.md) -- Programmatic control of playback and view state
