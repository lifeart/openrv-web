# Mu API Compatibility Layer

The `src/compat/` module provides a compatibility bridge between desktop OpenRV's Mu scripting API and the openrv-web JavaScript runtime. It lets existing Mu-based scripts and integrations work in the browser with minimal changes.

The layer exposes `window.rv.commands` and `window.rv.extra_commands`, mirroring the namespaces that Mu scripts use in desktop OpenRV.

---

## Quick Start

```js
import { registerMuCompat } from './compat';

// Call after window.openrv (OpenRVAPI) is initialized.
// Safe to call multiple times; subsequent calls are no-ops.
const { commands, extra_commands } = registerMuCompat();

// Now use the Mu-style API:
commands.play();
commands.setFrame(100);
extra_commands.togglePlay();

// Or access globally:
window.rv.commands.play();
window.rv.extra_commands.stepForward(5);
```

### Prerequisite

`window.openrv` (the core [OpenRVAPI](scripting-api.md)) must be initialized before calling any command. The compat layer lazily resolves it on each call, so registration order does not matter as long as the API exists before the first command runs.

---

## API Reference

### `window.rv.commands` (MuCommands)

#### Introspection

| Method | Signature | Description |
|---|---|---|
| `isSupported` | `(name: string) => true \| false \| 'partial'` | Check if a command is supported |
| `isAsync` | `(name: string) => boolean` | Check if a command returns a Promise |

#### Playback & Transport

| Command | Signature | Status | Description |
|---|---|---|---|
| `play` | `() => void` | DIRECT | Start playback |
| `stop` | `() => void` | DIRECT | Pause playback |
| `isPlaying` | `() => boolean` | DIRECT | Check if playing |
| `setFrame` | `(frame: number) => void` | DIRECT | Seek to a specific frame |
| `frame` | `() => number` | DIRECT | Get current frame number |
| `frameStart` | `() => number` | ADD | Get frame range start (local state) |
| `frameEnd` | `() => number` | DIRECT | Get total frames |
| `setFPS` | `(fps: number) => void` | ADD | Set FPS override (local state) |
| `fps` | `() => number` | PARTIAL | Get effective FPS (override or media) |
| `realFPS` | `() => number` | ADD | Get measured FPS (stub: returns nominal) |
| `setRealtime` | `(realtime: boolean) => void` | DIRECT | Set realtime playback mode |
| `isRealtime` | `() => boolean` | DIRECT | Check if realtime mode is active |
| `setInc` | `(inc: number) => void` | ADD | Set playback direction (1 or -1) |
| `inc` | `() => number` | ADD | Get playback increment |
| `setPlayMode` | `(mode: number) => void` | DIRECT | Set loop mode (0=Loop, 1=Once, 2=PingPong) |
| `playMode` | `() => number` | DIRECT | Get loop mode as integer constant |
| `inPoint` | `() => number` | DIRECT | Get in-point frame |
| `outPoint` | `() => number` | DIRECT | Get out-point frame |
| `setInPoint` | `(frame: number) => void` | DIRECT | Set in-point frame |
| `setOutPoint` | `(frame: number) => void` | DIRECT | Set out-point frame |
| `skipped` | `() => number` | ADD | Skipped frames since last reset |
| `isCurrentFrameIncomplete` | `() => boolean` | ADD | Always returns false |
| `isCurrentFrameError` | `() => boolean` | ADD | Always returns false |
| `isBuffering` | `() => boolean` | ADD | Always returns false |
| `mbps` | `() => number` | ADD | I/O throughput in Mbps |
| `resetMbps` | `() => void` | ADD | Reset throughput counter |

#### Audio

| Command | Signature | Status | Description |
|---|---|---|---|
| `scrubAudio` | `(enable: boolean, chunkDuration?: number, loopCount?: number) => void` | PARTIAL | Enable/disable audio scrub. `chunkDuration` and `loopCount` are ignored. |

#### View & Display

| Command | Signature | Status | Description |
|---|---|---|---|
| `redraw` | `() => void` | STUB | Request viewport repaint via `requestAnimationFrame` |
| `viewSize` | `() => [number, number]` | DIRECT | Get canvas size as `[width, height]` |
| `setViewSize` | `(w: number, h: number) => void` | DIRECT | Set canvas size |
| `resizeFit` | `() => void` | DIRECT | Fit image to viewport |
| `fullScreenMode` | `(enable: boolean) => void` | DIRECT | Enter/exit fullscreen (async internally) |
| `isFullScreen` | `() => boolean` | DIRECT | Check fullscreen state |
| `setWindowTitle` | `(title: string) => void` | DIRECT | Set browser tab title |
| `setFiltering` | `(mode: number) => void` | ADD | Set texture filter (0=Nearest, 1=Linear) |
| `getFiltering` | `() => number` | ADD | Get current filter mode |
| `setBGMethod` | `(method: string) => void` | ADD | Set background method |
| `bgMethod` | `() => string` | ADD | Get background method |
| `setMargins` | `(margins: number[], relative: boolean) => void` | ADD | Set viewport margins |
| `margins` | `() => number[]` | ADD | Get viewport margins |
| `contentAspect` | `() => number` | PARTIAL | Get content aspect ratio (width/height) |
| `devicePixelRatio` | `() => number` | DIRECT | Get device pixel ratio |

#### Frame Marks

| Command | Signature | Status | Description |
|---|---|---|---|
| `markFrame` | `(frame: number, marked: boolean) => void` | DIRECT | Mark or unmark a frame |
| `isMarked` | `(frame: number) => boolean` | DIRECT | Check if a frame is marked |
| `markedFrames` | `() => number[]` | DIRECT | Get all marked frame numbers |

#### N/A Stubs

These commands exist for API compatibility but log a warning and return defaults. Check with `isSupported(name)` -- all return `false`.

| Category | Commands |
|---|---|
| Audio Cache | `setAudioCacheMode`, `audioCacheMode` |
| Window Mgmt | `center`, `close` |
| Stereo | `setHardwareStereoMode`, `stereoSupported` |
| Cache System | `setCacheMode`, `cacheMode`, `isCaching`, `cacheInfo`, `cacheSize`, `clearAllButFrame`, `releaseAllUnusedImages`, `releaseAllCachedImages`, `flushCacheNodeOutput` |
| Session File | `sessionFileName`, `setSessionFileName` |
| Mu Runtime | `eval` |
| File System | `contractSequences`, `sequenceOfFile`, `existingFilesInSequence` |
| LUT | `updateLUT` |
| File Watch | `watchFile` |
| Console | `showConsole`, `isConsoleVisible` |
| Renderer | `setRendererType` |
| Renderer (partial) | `getRendererType` -- returns `"WebGL2"` |
| Cache Dir | `cacheDir` |
| Network Port | `myNetworkPort` |
| Security | `encodePassword`, `decodePassword` |
| Video Devices | `videoDeviceIDString`, `refreshOutputVideoDevice`, `audioTextureID` |
| Qt Widgets | `mainWindowWidget`, `mainViewWidget`, `prefTabWidget`, `sessionBottomToolBar`, `networkAccessManager` |
| Menu Bar | `toggleMenuBar`, `isMenuBarVisible`, `defineModeMenu` |
| Misc | `spoofConnectionStream`, `setDisplayProfilesFromSettings`, `associatedVideoDevice`, `toggleMotionScope`, `cacheUsage` |

---

### `window.rv.extra_commands` (MuExtraCommands)

All extra commands delegate to `MuCommands` or directly to the OpenRV API.

#### Display Feedback

| Command | Signature | Description |
|---|---|---|
| `displayFeedback` | `(message, duration?, glyph?, position?) => void` | Show a HUD message (logs to console, stores for retrieval) |
| `displayFeedbackQueue` | `(message, duration?, glyph?, position?) => void` | Queue a feedback message |
| `displayFeedback2` | `(message, duration?) => void` | Simple feedback (no glyph/position) |
| `displayFeedbackWithSizes` | `(message, duration?, sizes?) => void` | Feedback with custom font sizes |

#### Session State Queries

| Command | Signature | Description |
|---|---|---|
| `isSessionEmpty` | `() => boolean` | Check if no media is loaded |
| `isNarrowed` | `() => boolean` | Check if in/out points narrow playback range |
| `isPlayable` | `() => boolean` | Check if enough frames to play |
| `isPlayingForwards` | `() => boolean` | Playing forward? |
| `isPlayingBackwards` | `() => boolean` | Playing backward? |

#### Playback Toggles

| Command | Signature | Description |
|---|---|---|
| `togglePlay` | `() => void` | Toggle play/pause |
| `toggleForwardsBackwards` | `() => void` | Toggle playback direction |
| `toggleRealtime` | `() => void` | Toggle realtime mode |
| `toggleFullScreen` | `() => void` | Toggle fullscreen |

#### View Transform

| Command | Signature | Description |
|---|---|---|
| `setScale` | `(scale: number) => void` | Set zoom level |
| `scale` | `() => number` | Get zoom level |
| `setTranslation` | `([x, y]: [number, number]) => void` | Set pan offset |
| `translation` | `() => [number, number]` | Get pan offset |
| `frameImage` | `() => void` | Fit image in viewport |

#### Frame Stepping

| Command | Signature | Description |
|---|---|---|
| `stepForward` | `(n?: number) => void` | Step forward by n frames (default 1) |
| `stepBackward` | `(n?: number) => void` | Step backward by n frames (default 1) |
| `stepForward1` | `() => void` | Step forward 1 frame |
| `stepBackward1` | `() => void` | Step backward 1 frame |
| `stepForward10` | `() => void` | Step forward 10 frames |
| `stepBackward10` | `() => void` | Step backward 10 frames |
| `stepForward100` | `() => void` | Step forward 100 frames |
| `stepBackward100` | `() => void` | Step backward 100 frames |

#### Misc

| Command | Signature | Description |
|---|---|---|
| `numFrames` | `() => number` | Total number of frames |
| `centerResizeFit` | `() => void` | Fit and center image |
| `currentImageAspect` | `() => number` | Current image aspect ratio |

---

## Bridge Modules

These standalone classes are not mounted on `window.rv` by default. Import and instantiate them directly from the `src/compat/` directory.

### MuSourceBridge

Source management bridge providing approximately 27 commands for listing, adding, querying, and modifying media sources. Includes source media queries, display channel names, image source creation, and media representation management.

```js
import { MuSourceBridge } from './compat';

const sources = new MuSourceBridge();
const list = sources.sources();                   // List all source names
const info = sources.sourceMediaInfo('source0');   // Get media info for a source
sources.addSource(['/path/to/media.exr']);           // Add a new source
const size = sources.getCurrentImageSize();        // [width, height]
```

**Key methods:** `sources`, `sourcesAtFrame`, `sourceGeometry`, `addSource`, `addSources`, `addSourceVerbose`, `addSourceBegin`, `addSourceEnd`, `sourceMedia`, `sourceMediaInfo`, `sourceMediaInfoList`, `setSourceMedia`, `addToSource`, `relocateSource`, `sourceAttributes`, `sourceDataAttributes`, `sourcePixelValue`, `sourceDisplayChannelNames`, `newImageSource`, `newImageSourcePixels`, `getCurrentImageSize`, `clearSession`, `addSourceMediaRep`, `setActiveSourceMediaRep`

### MuPropertyBridge

Typed property store using Mu-style `node.component.property` dot-path addressing.

```js
import { MuPropertyBridge } from './compat/MuPropertyBridge';

const props = new MuPropertyBridge();

// Create a property
props.newProperty('myNode.color.gain', MuPropertyType.Float, 4);
props.setFloatProperty('myNode.color.gain', [1.0, 1.0, 1.0, 1.0]);

// Read it back
const gain = props.getFloatProperty('myNode.color.gain'); // [1.0, 1.0, 1.0, 1.0]

// Hash shorthand: #TypeName.component.property resolves to first matching node
const value = props.getFloatProperty('#myNode.color.gain');

// Listen for changes
const unsub = props.onPropertyChanged((path, value) => {
  console.log(`${path} changed to`, value);
});
```

**Methods:** `getFloatProperty`, `getIntProperty`, `getHalfProperty`, `getByteProperty`, `getStringProperty`, `setFloatProperty`, `setIntProperty`, `setHalfProperty`, `setByteProperty`, `setStringProperty`, `insertFloatProperty`, `insertIntProperty`, `insertStringProperty`, `insertByteProperty`, `insertHalfProperty`, `newProperty`, `newNDProperty`, `deleteProperty`, `properties`, `propertyInfo`, `propertyExists`, `onPropertyChanged`, `setStored`, `clear`, `size`

### MuNodeBridge

Node graph operations wrapping the `Graph` and `NodeFactory`.

```js
import { MuNodeBridge } from './compat/MuNodeBridge';

const bridge = new MuNodeBridge(graph);

const name = bridge.newNode('RVColor', 'myColor');
bridge.setNodeInputs(name, ['sourceNode']);
const [inputs, outputs] = bridge.nodeConnections(name);
bridge.setViewNode(name);
```

**Methods:** `nodes`, `nodeType`, `nodeExists`, `nodesOfType`, `newNode`, `deleteNode`, `nodeConnections`, `setNodeInputs`, `testNodeInputs`, `nodesInGroup`, `nodeGroup`, `addNodeToGroup`, `viewNode`, `viewNodes`, `setViewNode`, `previousViewNode`, `nextViewNode`, `addViewableNode`, `removeViewableNode`, `nodeImageGeometry`

### MuEventBridge

Bridges Mu-style event tables and mode system to DOM events.

```js
import { MuEventBridge } from './compat/MuEventBridge';

const events = new MuEventBridge();

// Define a minor mode
events.defineMinorMode('myMode', 10,
  [['key-down--a', (ev) => console.log('A pressed'), 'Handle A key']],
  [], // override bindings
);
events.activateMode('myMode');

// Wire DOM events from a canvas
events.wireDOMEvents(canvasElement);

// Manual event dispatch
events.sendInternalEvent('my-custom-event', 'payload', 'myMode');

// Cleanup
events.dispose();
```

**Methods:** `bind`, `bindRegex`, `unbind`, `unbindRegex`, `defineMinorMode`, `activateMode`, `deactivateMode`, `isModeActive`, `activeModes`, `pushEventTable`, `popEventTable`, `activeEventTables`, `setEventTableBBox`, `bindings`, `bindingDocumentation`, `sendInternalEvent`, `wireDOMEvents`, `dispose`

### MuEvalBridge

Graph evaluation traversal and image query commands. Provides coordinate transforms between screen/event space and image space, meta-evaluation of the node graph, and rendered image queries.

```js
import { MuEvalBridge } from './compat/MuEvalBridge';

const evalBridge = new MuEvalBridge(graph, nodeBridge);

// Set the current view transform state
evalBridge.setViewTransform({ viewWidth: 1920, viewHeight: 1080, scale: 1, translation: [0, 0], imageWidth: 1920, imageHeight: 1080 });

// Convert event coordinates to image space
const [ix, iy] = evalBridge.eventToImageSpace('source0', [mouseX, mouseY]);

// Query rendered images
const images = evalBridge.renderedImages();
```

**Key methods:** `metaEvaluate`, `metaEvaluateClosestByType`, `closestNodesOfType`, `mapPropertyToGlobalFrames`, `renderedImages`, `imagesAtPixel`, `imageGeometry`, `imageGeometryByIndex`, `imageGeometryByTag`, `eventToImageSpace`, `eventToCameraSpace`, `setViewTransform`

### ModeManager

Lower-level mode/event-table engine used by `MuEventBridge`. Supports minor modes with priority ordering, override/global binding tables, and reject/accept event dispatch semantics.

### MuNetworkBridge

HTTP requests and remote WebSocket connections.

```js
import { MuNetworkBridge } from './compat/MuNetworkBridge';

const net = new MuNetworkBridge();

// HTTP (returns Promise)
const resp = await net.httpGet('https://example.com/api');
console.log(resp.status, resp.body);

// Remote connections
net.remoteNetwork(true);
net.remoteConnect('peer', 'localhost', 45128);
net.remoteSendEvent('sync-frame', '', '42');
```

**Methods:** `httpGet`, `httpPost`, `httpPut`, `remoteConnect`, `remoteDisconnect`, `remoteSendMessage`, `remoteSendEvent`, `remoteSendDataEvent`, `remoteConnections`, `remoteApplications`, `remoteContacts`, `remoteLocalContactName`, `setRemoteLocalContactName`, `remoteNetwork`, `remoteNetworkStatus`, `remoteDefaultPermission`, `setRemoteDefaultPermission`, `dispose`

### MuSettingsBridge

Persistent settings backed by `localStorage` with namespaced keys (`openrv-setting:{group}:{key}`).

```js
import { MuSettingsBridge } from './compat/MuSettingsBridge';

const settings = new MuSettingsBridge();

settings.writeSetting('ui', 'showTimeline', true);
const show = settings.readSetting('ui', 'showTimeline', false); // true
```

**Methods:** `readSetting`, `writeSetting`, `hasSetting`, `removeSetting`, `listSettings`, `clearGroup`, `clearAll`

### MuUtilsBridge

Timers, file kind detection, URL/clipboard, cursor, progressive loading.

```js
import { MuUtilsBridge } from './compat/MuUtilsBridge';

const utils = new MuUtilsBridge();

utils.startTimer();
// ... do work ...
console.log(utils.elapsedTime()); // seconds

utils.fileKind('shot.exr');  // FileKind.ImageFile (1)
utils.setCursor(2);          // pointer cursor
utils.openUrl('https://example.com');
```

**Methods:** `startTimer`, `stopTimer`, `elapsedTime`, `theTime`, `isTimerRunning`, `fileKind`, `openUrl`, `putUrlOnClipboard`, `commandLineFlag`, `optionsPlay`, `optionsNoPackages`, `optionsPlayReset`, `setCursor`, `myNetworkHost`, `loadTotal`, `loadCount`, `setProgressiveSourceLoading`, `progressiveSourceLoading`, `waitForProgressiveLoading`, `startPreloadingMedia`, `setLoadCounters`, `setWindowTitle`, `fullScreenMode`, `isFullScreen`, `toggleFullScreen`, `devicePixelRatio`

---

## Constants

Exported from `src/compat/constants.ts` and re-exported from the barrel.

```js
import {
  PlayLoop,          // 0
  PlayOnce,          // 1
  PlayPingPong,      // 2
  FilterNearest,     // 0
  FilterLinear,      // 1
  CacheOff,          // 0  (N/A)
  CacheBuffer,       // 1  (N/A)
  CacheGreedy,       // 2  (N/A)
  AudioCacheOff,     // 0  (N/A)
  AudioCacheBuffer,  // 1  (N/A)
  CursorDefault,     // 0
  CursorCrosshair,   // 1
  CursorPointer,     // 2
  CursorWait,        // 3
  CursorText,        // 4
  CursorMove,        // 5
  CursorNotAllowed,  // 6
  CursorHelp,        // 7
  BG_METHODS,        // ['black', 'checker', 'grey18', 'grey50', 'crosshatch']
} from './compat';
```

Types module also exports `FileKind`, `MuPropertyType`, `MuPropertyTypeNames`, and `MuCursor` lookup tables.

---

## Migration Guide

### Playback

```js
// Mu
commands.play();
commands.setFrame(100);
let f = commands.frame();
commands.setPlayMode(PlayLoop);

// JS (identical)
window.rv.commands.play();
window.rv.commands.setFrame(100);
let f = window.rv.commands.frame();
window.rv.commands.setPlayMode(PlayLoop);
```

### Properties

```js
// Mu
commands.setFloatProperty("#RVColor.color.gain", float[] {1.2, 1.0, 0.8, 1.0});
float[] gain = commands.getFloatProperty("#RVColor.color.gain");

// JS
const props = new MuPropertyBridge();
props.newProperty('#RVColor.color.gain', MuPropertyType.Float, 4);
props.setFloatProperty('#RVColor.color.gain', [1.2, 1.0, 0.8, 1.0]);
const gain = props.getFloatProperty('#RVColor.color.gain');
```

### Events and Modes

```js
// Mu
commands.defineMinorMode("myMode", nil, nil,
  [("key-down--a", myHandler, "Do something on A")], ...);
commands.activateMode("myMode");

// JS
const events = new MuEventBridge();
events.defineMinorMode('myMode', 10,
  [['key-down--a', myHandler, 'Do something on A']],
  [],
);
events.activateMode('myMode');
```

### Settings

```js
// Mu
commands.writeSetting("MyPackage", "option", 42);
int val = commands.readSetting("MyPackage", "option", 0);

// JS
const settings = new MuSettingsBridge();
settings.writeSetting('MyPackage', 'option', 42);
const val = settings.readSetting('MyPackage', 'option', 0);
```

### HTTP Requests

```js
// Mu (callback-based)
commands.httpGet(url, headers, myCallback, nil);

// JS (Promise-based)
const resp = await net.httpGet(url, headers);
```

---

## Differences from Desktop OpenRV

### Async commands

`fullScreenMode()` returns a Promise internally (Fullscreen API is async). Most other commands are synchronous. Check with `commands.isAsync(name)`.

HTTP methods on `MuNetworkBridge` (`httpGet`, `httpPost`, `httpPut`) return Promises instead of using callbacks.

### Type handling

- Mu's `float[]` becomes `number[]` in JS.
- Mu's `int` and `float` are both `number`.
- Property type is tracked via `MuPropertyType` constants (Float=0, Int=1, String=2, Byte=3, Half=4).
- Boolean coercion: `scrubAudio` applies `Boolean()` to its first argument for safety.

### N/A stubs

Commands that depend on desktop-only features (file system, Qt widgets, hardware stereo, Mu eval, cache system) are provided as stubs. They:
- Log a `console.warn` explaining why they are unavailable
- Return a sensible default (empty string, 0, false, null, or empty array)
- Are registered with support status `false`

### No `eval()`

`commands.eval()` (Mu code evaluation) is stubbed. There is no Mu runtime in the browser.

---

## Checking Command Support

```js
import { isSupported, getSupportedCommands } from './compat/stubs';

// Single command
isSupported('play');           // true
isSupported('setCacheMode');   // false
isSupported('getRendererType'); // 'partial'

// Instance method on MuCommands
window.rv.commands.isSupported('setFrame'); // true

// List everything
const all = getSupportedCommands(); // Array<[name, true | false | 'partial']>
```

A status of `'partial'` means the command works but with reduced functionality compared to desktop OpenRV (e.g., `scrubAudio` ignores chunk duration/loop count; `getRendererType` always returns `"WebGL2"`).

---

## Related Pages

- [Scripting API](scripting-api.md) -- The core `window.openrv` API that the compat layer delegates to
- [DCC Integration](dcc-integration.md) -- WebSocket-based external application control
- [Node Graph Architecture](../guides/node-graph-architecture.md) -- Understanding the node graph that MuNodeBridge and MuEvalBridge operate on
- [Session Compatibility](../guides/session-compatibility.md) -- RV session file support
