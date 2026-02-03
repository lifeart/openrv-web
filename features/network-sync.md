# Network Sync and Remote Collaboration

## Original OpenRV Implementation
OpenRV implements a chat-like network protocol over TCP/IP for remote collaboration:

**Network Features**:
- Connection between two or more RV instances
- Custom program integration with RV
- Network dialog for configuration (identity, port, connection management)

**Synchronized Elements**:
- Frame changes and playback controls (always synced)
- Color adjustments per source
- Pan and zoom operations
- Stereo settings
- Audio settings and soundtrack management
- Image format parameters

**Remote Control**:
- Custom programs can control RV playback remotely
- Pixel streaming from external applications (e.g., RenderMan display drivers)
- Integration with custom control devices
- "rvshell" reference implementation available

**Internet Connectivity**:
- SSH tunneling for peer-to-peer encrypted connections
- VPN support for secure remote collaboration

**RVLINK Protocol**:
- URL-based protocol for launching RV with specific content
- Can be used to share review links

**Security Considerations**:
- Connections execute scripting commands with local user permissions
- Limited authentication for remote connections
- Generally unencrypted traffic (use SSH/VPN for security)

## Status
- [x] Not implemented
- [ ] Partially implemented
- [ ] Fully implemented

## Implementation Analysis

**Current State**: The network sync feature is **not implemented**. A search of the codebase reveals:

- No WebSocket, Socket.IO, or WebRTC implementations
- No `SyncManager`, `NetworkManager`, or `CollaborationManager` classes
- No room/session management for remote collaboration
- No peer-to-peer connection handling

**Existing Infrastructure** that can be leveraged:

1. **EventEmitter** (`/src/utils/EventEmitter.ts`) - Event-driven architecture for state changes
2. **Session** (`/src/core/session/Session.ts`) - Manages playback state, emits events:
   - `frameChanged` - Current frame position
   - `playbackChanged` - Play/pause state
   - `playbackSpeedChanged` - Speed changes
   - `volumeChanged`, `mutedChanged` - Audio state
   - `inOutChanged` - In/out point changes
   - `loopModeChanged` - Loop state
3. **Viewer** (`/src/ui/components/Viewer.ts`) - Manages view state (pan, zoom, channel)
4. **ColorControls** - Color adjustment state

## Requirements

### Core Requirements
- Real-time playback synchronization across clients
- Frame position sync with minimal latency (<100ms)
- Playback state sync (play/pause/speed/direction)
- WebSocket-based communication (browser-compatible)
- Room/session management with unique room codes
- User presence indicators (connected users list)
- Reconnection handling with state recovery
- Host/participant role distinction

### Optional Sync Elements (User-Configurable)
- Color correction sync
- View sync (pan/zoom)
- In/out point sync
- Loop mode sync
- Channel mode sync
- Annotation sync (live drawing)

### Security Requirements
- Secure WebSocket connections (wss://)
- Room authentication with access codes
- Rate limiting for sync messages
- Message validation and sanitization

## UI/UX Specification

### Network Control Button (Header Bar)
- **Location**: Header bar, right side utility group, before Help button
- **Icon**: `users` or `share` icon from Icons.ts
- **States**:
  - Disconnected: Icon only, muted color
  - Connected: Icon with user count badge, accent color
  - Connecting: Icon with loading indicator

### Connection Panel (Dropdown)
- **Trigger**: Click network button
- **Width**: 280px (--panel-width-md)
- **Position**: Fixed, below button, z-index 9999

**Disconnected State**:
```
+---------------------------+
| Network Sync              |
+---------------------------+
| Create Room    [Button]   |
+---------------------------+
| -- or --                  |
+---------------------------+
| Room Code: [__________]   |
| [Join Room]               |
+---------------------------+
```

**Connected State**:
```
+---------------------------+
| Room: ABCD-1234     [X]   |
+---------------------------+
| Connected Users:          |
| * You (Host)              |
| * User 2                  |
| * User 3                  |
+---------------------------+
| Sync Settings:            |
| [x] Playback              |
| [x] View (Pan/Zoom)       |
| [ ] Color Adjustments     |
| [ ] Annotations           |
+---------------------------+
| [Copy Link] [Leave]       |
+---------------------------+
```

### User Presence Indicators
- **Location**: Viewer overlay, top-right corner
- **Display**: User avatars/initials in circles
- **Colors**: Distinct color per user
- **Tooltip**: User name on hover

### Sync Status Indicator
- **Location**: Header bar, next to network button
- **States**:
  - Synced: Green checkmark
  - Syncing: Yellow spinner
  - Conflict: Red warning (manual intervention needed)
  - Offline: Gray disconnected icon

### Toast Notifications
- "User joined the room"
- "User left the room"
- "Connection lost. Reconnecting..."
- "Reconnected successfully"
- "Failed to connect. Please try again."

### Keyboard Shortcuts
- `Shift+N`: Toggle network panel
- `Shift+Ctrl+N`: Quick disconnect

## Technical Notes

### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                          App.ts                                  │
├─────────────────────────────────────────────────────────────────┤
│  NetworkControl (UI)                                             │
│       │                                                          │
│       ├── emits: createRoom, joinRoom, leaveRoom                │
│       ├── emits: syncSettingsChanged                            │
│       └── displays: connectionState, users, roomCode            │
├─────────────────────────────────────────────────────────────────┤
│  NetworkSyncManager                                              │
│       │                                                          │
│       ├── WebSocketClient                                        │
│       │     └── handles: connect, disconnect, reconnect         │
│       │                                                          │
│       ├── SyncStateManager                                       │
│       │     └── handles: conflict resolution, state merging     │
│       │                                                          │
│       └── MessageHandler                                         │
│             └── handles: serialize, deserialize, validate       │
├─────────────────────────────────────────────────────────────────┤
│  Session (existing)                                              │
│       │                                                          │
│       └── NetworkSyncManager listens to:                        │
│             - frameChanged                                       │
│             - playbackChanged                                    │
│             - playbackSpeedChanged                               │
│             - inOutChanged                                       │
│             - loopModeChanged                                    │
├─────────────────────────────────────────────────────────────────┤
│  Viewer (existing)                                               │
│       │                                                          │
│       └── NetworkSyncManager listens to:                        │
│             - panChanged                                         │
│             - zoomChanged                                        │
│             - channelChanged                                     │
└─────────────────────────────────────────────────────────────────┘
```

### Proposed File Structure

```
src/network/
├── NetworkSyncManager.ts      # Main orchestrator
├── WebSocketClient.ts         # WebSocket connection handling
├── SyncStateManager.ts        # State synchronization logic
├── MessageProtocol.ts         # Message types and serialization
├── RoomManager.ts             # Room creation and joining
└── types.ts                   # Shared type definitions

src/ui/components/
├── NetworkControl.ts          # Network button and panel UI
└── UserPresenceOverlay.ts     # User avatars overlay
```

### Message Protocol

```typescript
// Base message structure
interface SyncMessage {
  type: SyncMessageType;
  roomId: string;
  userId: string;
  timestamp: number;
  payload: unknown;
}

// Message types
type SyncMessageType =
  | 'room.create'
  | 'room.join'
  | 'room.leave'
  | 'room.users'
  | 'sync.playback'
  | 'sync.frame'
  | 'sync.view'
  | 'sync.color'
  | 'sync.annotation'
  | 'user.presence'
  | 'error';

// Playback sync payload
interface PlaybackSyncPayload {
  isPlaying: boolean;
  currentFrame: number;
  playbackSpeed: number;
  playDirection: number;
  loopMode: LoopMode;
  timestamp: number; // For latency compensation
}

// View sync payload
interface ViewSyncPayload {
  pan: { x: number; y: number };
  zoom: number;
  channelMode: ChannelMode;
}
```

### Latency Compensation

1. **Timestamp-based sync**: Each message includes sender timestamp
2. **RTT calculation**: Ping/pong messages measure round-trip time
3. **Frame prediction**: Predict frame position based on playback state and RTT
4. **Threshold-based update**: Only sync if frame difference > threshold (e.g., 2 frames)

### Conflict Resolution

- **Last-write-wins**: For simple state (play/pause, zoom)
- **Host authority**: For playback position, host is source of truth
- **Merge strategy**: For annotations, merge non-overlapping changes

### Reconnection Strategy

1. Attempt immediate reconnect on disconnect
2. Exponential backoff: 1s, 2s, 4s, 8s, max 30s
3. Request full state sync on reconnect
4. Max 10 reconnection attempts before giving up

### Server Requirements (Out of Scope)

This specification assumes a WebSocket server exists. Server requirements:
- Room creation and management
- User authentication (optional, via room codes)
- Message broadcasting to room participants
- State persistence for reconnection
- Scalability considerations for multiple rooms

**Suggested server stack**: Node.js with `ws` or `socket.io`, Redis for pub/sub

## E2E Test Cases

### Connection Tests

| Test ID | Description | Steps | Expected Result |
|---------|-------------|-------|-----------------|
| NET-001 | Network button is visible | 1. Load app | Network button visible in header bar |
| NET-002 | Network panel opens on click | 1. Click network button | Panel opens with create/join options |
| NET-003 | Network panel closes on outside click | 1. Open panel 2. Click outside | Panel closes |
| NET-004 | Network panel closes on Escape | 1. Open panel 2. Press Escape | Panel closes |
| NET-005 | Create room generates room code | 1. Click Create Room | Room code displayed (format: XXXX-XXXX) |
| NET-006 | Join room validates code format | 1. Enter invalid code 2. Click Join | Error message shown |
| NET-007 | Join room connects to valid room | 1. Enter valid code 2. Click Join | Status changes to connected |
| NET-008 | Leave room disconnects | 1. Connect to room 2. Click Leave | Status changes to disconnected |
| NET-009 | Copy link copies shareable URL | 1. Connect 2. Click Copy Link | URL copied to clipboard |
| NET-010 | Keyboard shortcut opens panel | 1. Press Shift+N | Network panel opens |

### Presence Tests

| Test ID | Description | Steps | Expected Result |
|---------|-------------|-------|-----------------|
| NET-020 | Host sees self in user list | 1. Create room | "You (Host)" shown in users |
| NET-021 | New user appears in list | 1. Create room 2. User2 joins | User2 appears in user list |
| NET-022 | Left user removed from list | 1. 2 users in room 2. User2 leaves | User2 removed from list |
| NET-023 | User count badge updates | 1. Create room 2. Users join | Badge shows correct count |
| NET-024 | Presence overlay shows avatars | 1. Multiple users connected | Avatars visible in viewer |
| NET-025 | Toast shown on user join | 1. User joins room | Toast: "User joined the room" |
| NET-026 | Toast shown on user leave | 1. User leaves room | Toast: "User left the room" |

### Playback Sync Tests

| Test ID | Description | Steps | Expected Result |
|---------|-------------|-------|-----------------|
| NET-030 | Play/pause syncs to participants | 1. Host presses Space | All participants start/stop playback |
| NET-031 | Frame position syncs on seek | 1. Host seeks to frame 50 | Participants jump to frame 50 |
| NET-032 | Frame advances sync during playback | 1. Host plays 2. Wait 2 seconds | Participant frame within 2 of host |
| NET-033 | Playback speed syncs | 1. Host changes speed to 2x | Participants speed changes to 2x |
| NET-034 | Play direction syncs | 1. Host presses J (reverse) | Participants play in reverse |
| NET-035 | Loop mode syncs | 1. Host toggles loop mode | Participants loop mode changes |
| NET-036 | In/out points sync | 1. Host sets in point at 10 | Participants in point is 10 |
| NET-037 | Sync disabled respects setting | 1. Disable playback sync 2. Host plays | Participant playback unchanged |

### View Sync Tests

| Test ID | Description | Steps | Expected Result |
|---------|-------------|-------|-----------------|
| NET-040 | Pan syncs when enabled | 1. Enable view sync 2. Host pans | Participant view pans |
| NET-041 | Zoom syncs when enabled | 1. Enable view sync 2. Host zooms to 200% | Participant zoom is 200% |
| NET-042 | Channel mode syncs when enabled | 1. Enable view sync 2. Host selects Red channel | Participant shows Red channel |
| NET-043 | View sync disabled respects setting | 1. Disable view sync 2. Host zooms | Participant zoom unchanged |

### Reconnection Tests

| Test ID | Description | Steps | Expected Result |
|---------|-------------|-------|-----------------|
| NET-050 | Reconnects after brief disconnect | 1. Simulate network drop 2. Restore network | Auto-reconnects, state preserved |
| NET-051 | Shows reconnecting indicator | 1. Disconnect | "Reconnecting..." indicator shown |
| NET-052 | Syncs state after reconnect | 1. Reconnect after host changed frame | Frame syncs to current host frame |
| NET-053 | Max retries shows error | 1. Disconnect 2. Block reconnect 10 times | Error message, manual reconnect option |
| NET-054 | Toast on reconnect success | 1. Reconnect successfully | Toast: "Reconnected successfully" |

### Error Handling Tests

| Test ID | Description | Steps | Expected Result |
|---------|-------------|-------|-----------------|
| NET-060 | Invalid room code shows error | 1. Try to join non-existent room | Error: "Room not found" |
| NET-061 | Full room shows error | 1. Try to join full room | Error: "Room is full" |
| NET-062 | Server error handled gracefully | 1. Server returns 500 | Error message, retry option |
| NET-063 | Network offline handled | 1. Go offline 2. Try to create room | Error: "No network connection" |

### Sync Settings Tests

| Test ID | Description | Steps | Expected Result |
|---------|-------------|-------|-----------------|
| NET-070 | Default sync settings | 1. Connect to room | Playback enabled, view enabled, others disabled |
| NET-071 | Toggle playback sync | 1. Uncheck playback sync | Playback no longer syncs |
| NET-072 | Toggle view sync | 1. Uncheck view sync | Pan/zoom no longer syncs |
| NET-073 | Settings persist across reconnect | 1. Change settings 2. Reconnect | Settings preserved |

## Unit Test Cases

### NetworkSyncManager Tests (`/src/network/NetworkSyncManager.test.ts`)

| Test ID | Description |
|---------|-------------|
| NSM-001 | Initializes in disconnected state |
| NSM-002 | createRoom generates valid room code |
| NSM-003 | createRoom connects to server |
| NSM-004 | joinRoom validates room code format |
| NSM-005 | joinRoom sends join message |
| NSM-006 | leaveRoom sends leave message |
| NSM-007 | leaveRoom disconnects WebSocket |
| NSM-010 | Emits connectionStateChanged on connect |
| NSM-011 | Emits connectionStateChanged on disconnect |
| NSM-012 | Emits usersChanged when user joins |
| NSM-013 | Emits usersChanged when user leaves |
| NSM-020 | Subscribes to Session frameChanged |
| NSM-021 | Sends sync message on frameChanged |
| NSM-022 | Subscribes to Session playbackChanged |
| NSM-023 | Sends sync message on playbackChanged |
| NSM-024 | Ignores local changes from sync messages |
| NSM-030 | Applies remote playback state |
| NSM-031 | Applies remote frame position |
| NSM-032 | Applies remote view state |
| NSM-033 | Respects sync settings when applying |
| NSM-040 | Handles reconnection attempt |
| NSM-041 | Applies exponential backoff |
| NSM-042 | Requests state sync after reconnect |
| NSM-043 | Gives up after max retries |
| NSM-050 | dispose() cleans up subscriptions |
| NSM-051 | dispose() closes WebSocket |

### WebSocketClient Tests (`/src/network/WebSocketClient.test.ts`)

| Test ID | Description |
|---------|-------------|
| WSC-001 | Connects to WebSocket URL |
| WSC-002 | Handles connection open |
| WSC-003 | Handles connection close |
| WSC-004 | Handles connection error |
| WSC-005 | Sends JSON messages |
| WSC-006 | Receives and parses JSON messages |
| WSC-007 | Emits message events |
| WSC-010 | Implements ping/pong heartbeat |
| WSC-011 | Calculates RTT from pong |
| WSC-012 | Detects connection timeout |
| WSC-020 | Reconnects on unexpected close |
| WSC-021 | Applies backoff delay |
| WSC-022 | Limits reconnection attempts |
| WSC-030 | Validates message schema |
| WSC-031 | Rejects malformed messages |

### SyncStateManager Tests (`/src/network/SyncStateManager.test.ts`)

| Test ID | Description |
|---------|-------------|
| SSM-001 | Stores local state |
| SSM-002 | Stores remote state |
| SSM-003 | Detects state conflict |
| SSM-004 | Resolves conflict with last-write-wins |
| SSM-005 | Resolves playback conflict with host authority |
| SSM-010 | Calculates frame prediction from RTT |
| SSM-011 | Applies latency compensation |
| SSM-012 | Skips update within threshold |
| SSM-020 | Merges non-conflicting annotation changes |
| SSM-021 | Detects annotation conflict |

### MessageProtocol Tests (`/src/network/MessageProtocol.test.ts`)

| Test ID | Description |
|---------|-------------|
| MPR-001 | Serializes playback sync message |
| MPR-002 | Deserializes playback sync message |
| MPR-003 | Serializes view sync message |
| MPR-004 | Deserializes view sync message |
| MPR-005 | Validates message type |
| MPR-006 | Validates required fields |
| MPR-007 | Handles unknown message type |
| MPR-010 | Generates unique message ID |
| MPR-011 | Includes timestamp in message |

### NetworkControl Tests (`/src/ui/components/NetworkControl.test.ts`)

| Test ID | Description |
|---------|-------------|
| NCC-001 | Renders network button |
| NCC-002 | Opens panel on click |
| NCC-003 | Closes panel on outside click |
| NCC-004 | Shows disconnected state UI |
| NCC-005 | Shows connected state UI |
| NCC-006 | Shows connecting state UI |
| NCC-010 | Emits createRoom on button click |
| NCC-011 | Validates room code input |
| NCC-012 | Emits joinRoom with code |
| NCC-013 | Emits leaveRoom on leave click |
| NCC-020 | Displays user list |
| NCC-021 | Updates user list on change |
| NCC-022 | Shows user count badge |
| NCC-030 | Toggle sync settings emit events |
| NCC-031 | Copies room link to clipboard |

## Files (Proposed)

### New Files to Create
- `/src/network/NetworkSyncManager.ts` - Main sync orchestrator
- `/src/network/NetworkSyncManager.test.ts` - Unit tests
- `/src/network/WebSocketClient.ts` - WebSocket connection handling
- `/src/network/WebSocketClient.test.ts` - Unit tests
- `/src/network/SyncStateManager.ts` - State synchronization logic
- `/src/network/SyncStateManager.test.ts` - Unit tests
- `/src/network/MessageProtocol.ts` - Message types and serialization
- `/src/network/MessageProtocol.test.ts` - Unit tests
- `/src/network/types.ts` - Shared type definitions
- `/src/ui/components/NetworkControl.ts` - Network button and panel UI
- `/src/ui/components/NetworkControl.test.ts` - Unit tests
- `/src/ui/components/UserPresenceOverlay.ts` - User avatars overlay
- `/e2e/network-sync.spec.ts` - E2E tests

### Files to Modify
- `/src/App.ts` - Add NetworkControl to header bar
- `/src/ui/components/shared/Icons.ts` - Add network-related icons (users, share, wifi)
- `/src/utils/KeyBindings.ts` - Add Shift+N shortcut
- `/src/test-helper.ts` - Expose network state for testing

## Implementation Priority

1. **Phase 1: Core Infrastructure**
   - WebSocketClient with reconnection
   - MessageProtocol with validation
   - Basic NetworkSyncManager

2. **Phase 2: Room Management**
   - Room creation and joining
   - User presence tracking
   - NetworkControl UI

3. **Phase 3: Playback Sync**
   - Frame position sync
   - Play/pause sync
   - Speed and direction sync

4. **Phase 4: View Sync**
   - Pan/zoom sync
   - Channel mode sync

5. **Phase 5: Advanced Features**
   - Annotation sync
   - Color adjustment sync
   - Latency compensation

6. **Phase 6: Polish**
   - Reconnection UX
   - Error handling
   - Performance optimization

## Dependencies

- WebSocket server (external, not part of this specification)
- No new npm dependencies required for client (native WebSocket API)
- Optional: `uuid` for generating room codes (or use crypto.randomUUID)

## Notes

- This specification focuses on the client-side implementation
- A WebSocket server is required but is out of scope for this document
- Consider using a managed service (e.g., Ably, Pusher) for MVP
- WebRTC could be explored for peer-to-peer connections in future
- Mobile/touch support should be considered for user presence overlay
