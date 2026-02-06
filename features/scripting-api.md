# Scripting API

## Original OpenRV Implementation
OpenRV provides comprehensive scripting capabilities through Mu and Python:

**Mu Language**:
- Native scripting language for RV
- Source code available for UI components
- Similar syntax to Python/MEL
- Full access to RV internals

**Python Integration**:
- Nearly interchangeable with Mu for customization
- Python 3.11+ support
- Integration with Python ecosystem

**API Capabilities**:
- **Node Management**: Create, delete, configure nodes in processing graph
- **Source Operations**: Add sources, query media info, modify attributes
- **Property Access**: Get/set float, string, int properties on nodes
- **View Control**: Set active view, navigate between views
- **Playback Control**: Play, pause, seek, speed control
- **Event Handling**: Bind functions to events, create custom interactions

**UI Customization**:
- Create custom overlays and HUD widgets
- Modify menu bar structure
- Build custom tools and modes
- Add keyboard shortcuts

**RVIO Extensions**:
- Custom overlays on rendered images
- Leaders and slate generation
- Batch processing automation

**Qt Integration**:
- Access to Qt widgets from Mu
- Signal/slot connections
- Custom UI panels

## Status
Status: Implemented

## Implementation Analysis

### Current State

The scripting-api feature is **NOT IMPLEMENTED** in openrv-web.

The codebase currently has:
- **Internal test helper** (`window.__OPENRV_TEST__`): Exposes app internals for E2E testing only. This is NOT a public API and is only available in test builds. Located in `/src/test-helper.ts`.

The following scripting capabilities do NOT exist:
- Public JavaScript API for player control
- WebSocket API for external control
- Plugin/extension architecture
- Event system for external listeners
- Programmatic access to color pipeline
- Source management API for external scripts

### Existing Internal Architecture (Not Exposed)

The application has well-structured internal components that could be exposed:

| Component | Internal Location | Potential API Surface |
|-----------|------------------|----------------------|
| Session | `/src/core/session/Session.ts` | Playback control, frame navigation, markers |
| Viewer | `/src/ui/components/Viewer.ts` | Zoom, pan, channel modes, stereo |
| ColorControls | `/src/ui/components/ColorControls.ts` | Color adjustments, LUT loading |
| PaintEngine | `/src/paint/PaintEngine.ts` | Annotations, drawing tools |
| Graph | `/src/core/graph/Graph.ts` | Node-based processing graph |

### Event System (Exists Internally)

The application uses `EventEmitter` pattern extensively:
- Session events: `frameChanged`, `playbackChanged`, `sourceLoaded`, `volumeChanged`
- Viewer events: `zoomChanged`, `channelChanged`, `wipeChanged`
- Control events: `stateChanged` on all UI controls

These could be exposed to external scripts but currently are not.

## Requirements

### Core API Requirements
- [x] JavaScript API for player control (NOT IMPLEMENTED)
- [x] Event system for state changes (NOT IMPLEMENTED - internal only)
- [x] Plugin/extension architecture (NOT IMPLEMENTED)
- [x] Playback control methods (NOT IMPLEMENTED)
- [x] Color pipeline access (NOT IMPLEMENTED)
- [x] Source management API (NOT IMPLEMENTED)
- [x] View/session control (NOT IMPLEMENTED)
- [x] Custom UI component support (NOT IMPLEMENTED)
- [x] WebSocket API for external control (NOT IMPLEMENTED)

### Detailed Feature Requirements

1. **Public JavaScript API** (`window.openrv`)
   - [ ] Playback control: play, pause, stop, seek, step
   - [ ] Frame navigation: goToFrame, goToStart, goToEnd
   - [ ] Speed control: setSpeed, getSpeed
   - [ ] Volume control: setVolume, getVolume, mute, unmute
   - [ ] Loop mode control: setLoopMode, getLoopMode
   - [ ] Marker management: addMarker, removeMarker, getMarkers
   - [ ] Source info: getCurrentSource, getSourceList, getDuration, getFPS

2. **Color Pipeline Access**
   - [ ] Exposure, gamma, saturation, contrast adjustments
   - [ ] CDL (slope, offset, power, saturation)
   - [ ] LUT loading and intensity control
   - [ ] Color curves manipulation
   - [ ] Temperature and tint

3. **View Control**
   - [ ] Zoom: setZoom, getZoom, fitToWindow
   - [ ] Pan: setPan, getPan, resetPan
   - [ ] Channel isolation: setChannel, getChannel
   - [ ] Stereo mode control
   - [ ] Wipe/compare mode control
   - [ ] Scope visibility control

4. **Event System**
   - [ ] Subscribe/unsubscribe to events
   - [ ] Playback events: onPlay, onPause, onFrameChange
   - [ ] Media events: onSourceLoaded, onSourceChanged
   - [ ] UI events: onZoomChanged, onPanChanged
   - [ ] Error events: onError

5. **Plugin Architecture**
   - [ ] Plugin registration and lifecycle
   - [ ] Plugin configuration storage
   - [ ] Custom panel/overlay injection
   - [ ] Custom keyboard shortcut registration

6. **WebSocket API (External Control)**
   - [ ] Connect/disconnect to external controllers
   - [ ] Command protocol for remote control
   - [ ] State synchronization
   - [ ] Multi-client support

## UI/UX Specification

### No Direct UI

The scripting API is primarily programmatic and does not have a dedicated UI panel. However, it enables:
- Custom overlays and HUD widgets created by plugins
- External application integration
- Automation scripts

### Developer Console Access

The API should be accessible via browser developer console:
```javascript
// Example usage from console
window.openrv.play();
window.openrv.seek(100);
window.openrv.setColor({ exposure: 0.5 });
```

### Plugin Manager (Future UI)

If a plugin architecture is implemented, a Plugin Manager panel could be added:
- List installed plugins
- Enable/disable plugins
- Plugin settings
- Plugin marketplace (future)

## Technical Notes

### Proposed API Architecture

```
window.openrv (Public API)
    |
    +-- playback
    |   +-- play()
    |   +-- pause()
    |   +-- toggle()
    |   +-- stop()
    |   +-- seek(frame: number)
    |   +-- step(direction: 1 | -1)
    |   +-- setSpeed(speed: number)
    |   +-- getSpeed(): number
    |   +-- isPlaying(): boolean
    |   +-- getCurrentFrame(): number
    |
    +-- media
    |   +-- load(url: string): Promise<void>
    |   +-- getCurrentSource(): SourceInfo | null
    |   +-- getDuration(): number
    |   +-- getFPS(): number
    |   +-- getResolution(): { width: number, height: number }
    |
    +-- audio
    |   +-- setVolume(volume: number)
    |   +-- getVolume(): number
    |   +-- mute()
    |   +-- unmute()
    |   +-- isMuted(): boolean
    |
    +-- loop
    |   +-- setMode(mode: 'once' | 'loop' | 'pingpong')
    |   +-- getMode(): string
    |   +-- setInPoint(frame: number)
    |   +-- setOutPoint(frame: number)
    |   +-- getInPoint(): number
    |   +-- getOutPoint(): number
    |   +-- clearInOut()
    |
    +-- view
    |   +-- setZoom(level: number)
    |   +-- getZoom(): number
    |   +-- fitToWindow()
    |   +-- setPan(x: number, y: number)
    |   +-- getPan(): { x: number, y: number }
    |   +-- setChannel(mode: 'rgb' | 'red' | 'green' | 'blue' | 'alpha' | 'luma')
    |   +-- getChannel(): string
    |
    +-- color
    |   +-- setAdjustments(adjustments: Partial<ColorAdjustments>)
    |   +-- getAdjustments(): ColorAdjustments
    |   +-- reset()
    |   +-- setCDL(cdl: CDLValues)
    |   +-- getCDL(): CDLValues
    |   +-- loadLUT(url: string): Promise<void>
    |   +-- clearLUT()
    |
    +-- markers
    |   +-- add(frame: number, note?: string, color?: string)
    |   +-- remove(frame: number)
    |   +-- getAll(): Marker[]
    |   +-- clear()
    |   +-- goToNext()
    |   +-- goToPrevious()
    |
    +-- events
    |   +-- on(event: string, callback: Function): () => void
    |   +-- off(event: string, callback: Function)
    |   +-- once(event: string, callback: Function): () => void
    |
    +-- version: string
    +-- isReady(): boolean
```

### Implementation Files (To Be Created)

| File | Purpose |
|------|---------|
| `/src/api/OpenRVAPI.ts` | Main API class |
| `/src/api/PlaybackAPI.ts` | Playback control methods |
| `/src/api/MediaAPI.ts` | Media/source information |
| `/src/api/AudioAPI.ts` | Volume control |
| `/src/api/ViewAPI.ts` | View control methods |
| `/src/api/ColorAPI.ts` | Color adjustment methods |
| `/src/api/MarkersAPI.ts` | Marker management |
| `/src/api/EventsAPI.ts` | Event subscription |
| `/src/api/index.ts` | API export and registration |

### Security Considerations

- API access should be sandboxed to prevent XSS
- LUT/media loading should validate URLs (same-origin or CORS)
- Rate limiting for rapid API calls
- Consider read-only mode option

### Versioning

The API should be versioned:
```javascript
window.openrv.version // "1.0.0"
```

Breaking changes should increment major version.

## E2E Test Cases

The following E2E tests should be implemented when the scripting API is built. Test file: `/e2e/scripting-api.spec.ts`

### API Availability Tests

| Test ID | Description | Priority |
|---------|-------------|----------|
| SCRIPT-001 | window.openrv exists after app initialization | Critical |
| SCRIPT-002 | openrv.version returns valid semver string | High |
| SCRIPT-003 | openrv.isReady() returns true when app is loaded | Critical |
| SCRIPT-004 | All major API namespaces exist (playback, media, audio, etc.) | Critical |

### Playback Control Tests

| Test ID | Description | Priority |
|---------|-------------|----------|
| SCRIPT-010 | openrv.playback.play() starts playback | Critical |
| SCRIPT-011 | openrv.playback.pause() stops playback | Critical |
| SCRIPT-012 | openrv.playback.toggle() toggles play/pause state | High |
| SCRIPT-013 | openrv.playback.stop() stops and seeks to start | Medium |
| SCRIPT-014 | openrv.playback.seek(frame) navigates to correct frame | Critical |
| SCRIPT-015 | openrv.playback.seek() clamps to valid frame range | High |
| SCRIPT-016 | openrv.playback.step(1) advances one frame | High |
| SCRIPT-017 | openrv.playback.step(-1) goes back one frame | High |
| SCRIPT-018 | openrv.playback.setSpeed(2) doubles playback speed | Medium |
| SCRIPT-019 | openrv.playback.setSpeed() clamps to valid range | Medium |
| SCRIPT-020 | openrv.playback.getSpeed() returns current speed | Medium |
| SCRIPT-021 | openrv.playback.isPlaying() returns correct boolean | High |
| SCRIPT-022 | openrv.playback.getCurrentFrame() returns current frame | Critical |

### Media Information Tests

| Test ID | Description | Priority |
|---------|-------------|----------|
| SCRIPT-030 | openrv.media.getCurrentSource() returns null when no media | High |
| SCRIPT-031 | openrv.media.getCurrentSource() returns source info after load | Critical |
| SCRIPT-032 | openrv.media.getDuration() returns frame count | High |
| SCRIPT-033 | openrv.media.getFPS() returns correct framerate | High |
| SCRIPT-034 | openrv.media.getResolution() returns width and height | High |
| SCRIPT-035 | openrv.media.load(url) loads valid media file | Medium |
| SCRIPT-036 | openrv.media.load() rejects with error for invalid URL | Medium |

### Audio Control Tests

| Test ID | Description | Priority |
|---------|-------------|----------|
| SCRIPT-040 | openrv.audio.setVolume(0.5) sets volume to 50% | High |
| SCRIPT-041 | openrv.audio.getVolume() returns current volume | High |
| SCRIPT-042 | openrv.audio.mute() mutes audio | High |
| SCRIPT-043 | openrv.audio.unmute() unmutes audio | High |
| SCRIPT-044 | openrv.audio.isMuted() returns correct state | High |
| SCRIPT-045 | openrv.audio.setVolume() clamps to 0-1 range | Medium |

### Loop Control Tests

| Test ID | Description | Priority |
|---------|-------------|----------|
| SCRIPT-050 | openrv.loop.setMode('loop') enables looping | High |
| SCRIPT-051 | openrv.loop.setMode('once') disables looping | High |
| SCRIPT-052 | openrv.loop.setMode('pingpong') enables pingpong | Medium |
| SCRIPT-053 | openrv.loop.getMode() returns current mode | High |
| SCRIPT-054 | openrv.loop.setInPoint(10) sets in point | High |
| SCRIPT-055 | openrv.loop.setOutPoint(50) sets out point | High |
| SCRIPT-056 | openrv.loop.getInPoint() returns in point | Medium |
| SCRIPT-057 | openrv.loop.getOutPoint() returns out point | Medium |
| SCRIPT-058 | openrv.loop.clearInOut() resets in/out points | Medium |

### View Control Tests

| Test ID | Description | Priority |
|---------|-------------|----------|
| SCRIPT-060 | openrv.view.setZoom(2) sets 200% zoom | High |
| SCRIPT-061 | openrv.view.getZoom() returns current zoom | High |
| SCRIPT-062 | openrv.view.fitToWindow() fits image to viewport | High |
| SCRIPT-063 | openrv.view.setPan(100, 50) sets pan offset | Medium |
| SCRIPT-064 | openrv.view.getPan() returns pan coordinates | Medium |
| SCRIPT-065 | openrv.view.setChannel('red') isolates red channel | High |
| SCRIPT-066 | openrv.view.getChannel() returns current channel | High |
| SCRIPT-067 | openrv.view.setChannel() validates mode string | Medium |

### Color Control Tests

| Test ID | Description | Priority |
|---------|-------------|----------|
| SCRIPT-070 | openrv.color.setAdjustments({ exposure: 0.5 }) changes exposure | High |
| SCRIPT-071 | openrv.color.getAdjustments() returns all adjustments | High |
| SCRIPT-072 | openrv.color.reset() restores default values | High |
| SCRIPT-073 | setAdjustments with partial object merges correctly | Medium |
| SCRIPT-074 | openrv.color.setCDL() sets CDL values | Medium |
| SCRIPT-075 | openrv.color.getCDL() returns CDL values | Medium |
| SCRIPT-076 | openrv.color.loadLUT() loads cube file (async) | Low |
| SCRIPT-077 | openrv.color.clearLUT() removes active LUT | Low |

### Marker Tests

| Test ID | Description | Priority |
|---------|-------------|----------|
| SCRIPT-080 | openrv.markers.add(10) adds marker at frame 10 | High |
| SCRIPT-081 | openrv.markers.add(10, 'note') adds marker with note | Medium |
| SCRIPT-082 | openrv.markers.add(10, 'note', '#ff0000') adds colored marker | Medium |
| SCRIPT-083 | openrv.markers.remove(10) removes marker at frame | High |
| SCRIPT-084 | openrv.markers.getAll() returns all markers | High |
| SCRIPT-085 | openrv.markers.clear() removes all markers | Medium |
| SCRIPT-086 | openrv.markers.goToNext() navigates to next marker | Medium |
| SCRIPT-087 | openrv.markers.goToPrevious() navigates to previous marker | Medium |

### Event System Tests

| Test ID | Description | Priority |
|---------|-------------|----------|
| SCRIPT-090 | openrv.events.on('frameChange', fn) registers callback | Critical |
| SCRIPT-091 | Callback receives correct event data | Critical |
| SCRIPT-092 | openrv.events.off() removes callback | High |
| SCRIPT-093 | openrv.events.once() fires only once | High |
| SCRIPT-094 | on() returns unsubscribe function | High |
| SCRIPT-095 | Multiple callbacks can be registered | Medium |
| SCRIPT-096 | 'play' event fires when playback starts | High |
| SCRIPT-097 | 'pause' event fires when playback stops | High |
| SCRIPT-098 | 'sourceLoaded' event fires when media loads | High |
| SCRIPT-099 | 'error' event fires on API errors | Medium |

### Integration Tests

| Test ID | Description | Priority |
|---------|-------------|----------|
| SCRIPT-100 | Sequential API calls execute in order | High |
| SCRIPT-101 | Rapid API calls do not cause race conditions | High |
| SCRIPT-102 | API state matches UI state after API calls | Critical |
| SCRIPT-103 | UI changes trigger corresponding events | High |
| SCRIPT-104 | API works correctly during playback | High |

## Unit Test Cases

Unit tests should be implemented for each API module. Test files in `/src/api/*.test.ts`

### OpenRVAPI Core Tests

| Test ID | Description |
|---------|-------------|
| API-U001 | Constructor initializes all sub-modules |
| API-U002 | Version string is valid semver |
| API-U003 | isReady() returns false before init |
| API-U004 | isReady() returns true after init |
| API-U005 | Initialization is idempotent |

### PlaybackAPI Tests

| Test ID | Description |
|---------|-------------|
| API-U010 | play() calls session.play() |
| API-U011 | pause() calls session.pause() |
| API-U012 | toggle() toggles playback state |
| API-U013 | stop() pauses and seeks to start |
| API-U014 | seek() validates frame number |
| API-U015 | seek() clamps to valid range |
| API-U016 | step(1) increments frame |
| API-U017 | step(-1) decrements frame |
| API-U018 | setSpeed() validates speed value |
| API-U019 | setSpeed() clamps to valid range (0.25-8) |
| API-U020 | getSpeed() returns session speed |
| API-U021 | isPlaying() returns session state |
| API-U022 | getCurrentFrame() returns session frame |

### ViewAPI Tests

| Test ID | Description |
|---------|-------------|
| API-U030 | setZoom() validates zoom level |
| API-U031 | setZoom() calls viewer method |
| API-U032 | getZoom() returns viewer zoom |
| API-U033 | fitToWindow() calls viewer fit |
| API-U034 | setPan() sets viewer pan |
| API-U035 | getPan() returns viewer pan |
| API-U036 | setChannel() validates mode string |
| API-U037 | setChannel() calls channelSelect method |
| API-U038 | getChannel() returns current channel |

### EventsAPI Tests

| Test ID | Description |
|---------|-------------|
| API-U050 | on() registers callback |
| API-U051 | on() returns unsubscribe function |
| API-U052 | off() removes callback |
| API-U053 | once() fires callback once only |
| API-U054 | Multiple callbacks for same event |
| API-U055 | Invalid event name throws error |
| API-U056 | Callback receives correct event data |
| API-U057 | dispose() cleans up all listeners |

### ColorAPI Tests

| Test ID | Description |
|---------|-------------|
| API-U060 | setAdjustments() validates values |
| API-U061 | setAdjustments() merges partial updates |
| API-U062 | getAdjustments() returns copy of state |
| API-U063 | reset() restores default values |
| API-U064 | setCDL() validates CDL values |
| API-U065 | getCDL() returns current CDL |
| API-U066 | loadLUT() returns promise |
| API-U067 | loadLUT() rejects for invalid URL |
| API-U068 | clearLUT() removes active LUT |

### MarkersAPI Tests

| Test ID | Description |
|---------|-------------|
| API-U070 | add() validates frame number |
| API-U071 | add() creates marker with defaults |
| API-U072 | add() accepts note and color |
| API-U073 | remove() deletes marker |
| API-U074 | remove() is no-op for non-existent |
| API-U075 | getAll() returns array copy |
| API-U076 | clear() removes all markers |
| API-U077 | goToNext() seeks to next marker |
| API-U078 | goToPrevious() seeks to previous |
| API-U079 | goToNext() wraps at end (if loop mode) |

## Implementation Priority

### Phase 1: Core Playback API (MVP)
1. Public `window.openrv` object
2. Playback control (play, pause, seek, step)
3. Basic media info (duration, FPS, frame)
4. Event system (frameChange, play, pause)

### Phase 2: View and Audio Control
1. Zoom and pan control
2. Channel isolation
3. Volume control
4. Loop mode control

### Phase 3: Color Pipeline Access
1. Color adjustments API
2. CDL control
3. LUT loading

### Phase 4: Advanced Features
1. Marker management
2. WebSocket external control
3. Plugin architecture
