# Mu API Compatibility Layer: Implementation Plan

## Overview and Motivation

OpenRV's scripting API is built on the **Mu language** and exposed through the `commands` and `extra_commands` modules. Thousands of existing RV scripts, pipeline tools, and studio workflows depend on this API surface. The goal of this compatibility layer is to provide a JavaScript-accessible `window.rv.commands.*` namespace that mirrors the Mu `commands` module, allowing existing RV scripting knowledge and (with minor syntax adaptation) existing scripts to work against openrv-web.

This enables:
- Studios to port existing RV tools/packages to openrv-web with minimal rewriting
- Developers familiar with RV's Mu API to be immediately productive
- A clear migration path from desktop OpenRV to openrv-web

---

## Architecture Decisions

### Access Pattern
```js
// Mu style (original)
commands.play();
commands.setFrame(100);
commands.getFloatProperty("#RVColor.color.gamma");

// JS compatibility layer
window.rv.commands.play();
window.rv.commands.setFrame(100);
window.rv.commands.getFloatProperty("#RVColor.color.gamma");
```

### Module Structure
The compatibility layer should be a **standalone module** (not a plugin) shipped as part of openrv-web's core API:
- `src/compat/MuCommands.ts` -- main compatibility class
- `src/compat/MuExtraCommands.ts` -- extra_commands module equivalents
- `src/compat/MuPropertyBridge.ts` -- property system bridge (get/set typed properties)
- `src/compat/MuNodeBridge.ts` -- node graph operations bridge
- `src/compat/MuEventBridge.ts` -- event/mode system bridge
- `src/compat/types.ts` -- Mu-compatible type definitions (PixelImageInfo, RenderedImageInfo, etc.)
- `src/compat/index.ts` -- barrel export + `window.rv` registration
- `src/compat/stubs.ts` -- stub implementations for N/A commands (with console warnings)

### Sync vs Async
Mu's `commands` module is synchronous. The web API has inherent async constraints (file loading, network, etc.). Strategy:
- **Synchronous commands** (frame, playback state, property get/set, node queries): Keep synchronous -- these map directly to in-memory state.
- **Async operations** (addSource, httpGet, file dialogs, saveSession): Return `Promise<T>`. Document that these differ from Mu's blocking behavior. Provide an optional `await`-less fire-and-forget mode that queues operations.
- **Naming convention**: Async commands keep the same name but return a Promise. A `commands.isAsync(name)` helper tells callers which commands are async.

### Type Differences
Mu is statically typed; JS is dynamic. Strategy:
- Accept loose JS types at the boundary, validate internally, throw `TypeError` for mismatches.
- Mu's `float[]` maps to `number[]` or `Float32Array`.
- Mu's `int[]` maps to `number[]` or `Int32Array`.
- Mu's `string[]` maps to `string[]`.
- Mu's tuple returns `(a, b, c)` map to `{ a, b, c }` objects or arrays depending on context.
- Mu's `nil` maps to `null`.

### Error Handling for Unmapped Commands
Commands categorized as "Not Applicable" will:
1. Exist as named functions on `window.rv.commands` (for discoverability).
2. Log a warning: `"rv.commands.{name}() is not available in openrv-web (requires {reason})"`.
3. Return a sensible default (`null`, `false`, `0`, `[]`) rather than throwing.
4. A global `rv.commands.isSupported(name)` method returns `true`/`false`/`'partial'`.

---

## Full Mapping Table

### Legend
| Symbol | Meaning |
|--------|---------|
| DIRECT | 1:1 equivalent exists in `window.openrv` |
| PARTIAL | Similar functionality but different semantics |
| ADD | Not currently in openrv-web API but feasible to add |
| N/A | Relies on native/Qt/GL features not available in browser |

### Data Types

| Mu Type | JS Equivalent | Notes |
|---------|--------------|-------|
| `MetaEvalInfo` | `{ node: string, nodeType: string, frame: number }` | ADD -- needs graph traversal |
| `PixelImageInfo` | `{ name, x, y, px, py, inside, edge, modelMatrix, ... }` | ADD -- partial (no multi-device) |
| `RenderedImageInfo` | `{ name, index, imageMin, imageMax, width, height, ... }` | ADD -- partial |
| `SourceMediaInfo` | Maps to `SourceInfo` from MediaAPI | PARTIAL -- fewer fields |
| `PropertyInfo` | `{ name, type, dimensions, size, userDefined, info }` | ADD -- needs property system |
| `NodeImageGeometry` | `{ width, height, pixelAspect, orientation }` | ADD |
| `Event` | DOM Event wrapper + custom fields | PARTIAL -- different event model |
| `SettingsValue` | `number \| string \| boolean \| number[] \| string[]` | ADD -- use localStorage |

---

### commands Module -- Playback & Transport

| # | Mu Command | Signature (Mu) | Category | openrv-web Mapping | Notes |
|---|-----------|----------------|----------|-------------------|-------|
| 1 | `play` | `(void;)` | DIRECT | `openrv.playback.play()` | |
| 2 | `stop` | `(void;)` | DIRECT | `openrv.playback.pause()` | Mu `stop()` stops playback; maps to pause |
| 3 | `isPlaying` | `(bool;)` | DIRECT | `openrv.playback.isPlaying()` | |
| 4 | `setFrame` | `(void; int)` | DIRECT | `openrv.playback.seek(frame)` | |
| 5 | `frame` | `(int;)` | DIRECT | `openrv.playback.getCurrentFrame()` | |
| 6 | `frameStart` | `(int;)` | PARTIAL | `1` (always 1-based in openrv-web) | ADD: expose session.frameStart |
| 7 | `frameEnd` | `(int;)` | DIRECT | `openrv.playback.getTotalFrames()` | |
| 8 | `setFPS` | `(void; float)` | ADD | Need `session.setFPS()` | Currently read-only via `media.getFPS()` |
| 9 | `fps` | `(float;)` | DIRECT | `openrv.media.getFPS()` | |
| 10 | `realFPS` | `(float;)` | ADD | Need measured FPS tracking | Renderer would track actual frame rate |
| 11 | `setRealtime` | `(void; bool)` | DIRECT | `openrv.playback.setPlaybackMode(mode)` | `true` -> `'realtime'`, `false` -> `'playAllFrames'` |
| 12 | `isRealtime` | `(bool;)` | DIRECT | `openrv.playback.getPlaybackMode() === 'realtime'` | |
| 13 | `setInc` | `(void; int)` | ADD | Need playback direction API | Controls forward/reverse (`1` or `-1`) |
| 14 | `inc` | `(int;)` | ADD | Need playback direction getter | |
| 15 | `setPlayMode` | `(void; int)` | DIRECT | `openrv.loop.setMode(mode)` | `PlayLoop`->`'loop'`, `PlayOnce`->`'once'`, `PlayPingPong`->`'pingpong'` |
| 16 | `playMode` | `(int;)` | DIRECT | `openrv.loop.getMode()` | Returns string instead of int constant |
| 17 | `inPoint` | `(int;)` | DIRECT | `openrv.loop.getInPoint()` | |
| 18 | `outPoint` | `(int;)` | DIRECT | `openrv.loop.getOutPoint()` | |
| 19 | `setInPoint` | `(void; int)` | DIRECT | `openrv.loop.setInPoint(frame)` | |
| 20 | `setOutPoint` | `(void; int)` | DIRECT | `openrv.loop.setOutPoint(frame)` | |
| 21 | `skipped` | `(int;)` | ADD | Need frame skip counter | Track in playback loop |
| 22 | `isCurrentFrameIncomplete` | `(bool;)` | ADD | Need decode status tracking | |
| 23 | `isCurrentFrameError` | `(bool;)` | ADD | Need error state per frame | |
| 24 | `isBuffering` | `(bool;)` | ADD | Need buffering state | |
| 25 | `mbps` | `(float;)` | ADD | Need I/O throughput measurement | |
| 26 | `resetMbps` | `(void;)` | ADD | Paired with mbps | |

### commands Module -- Audio

| # | Mu Command | Signature (Mu) | Category | openrv-web Mapping | Notes |
|---|-----------|----------------|----------|-------------------|-------|
| 27 | `scrubAudio` | `(void; bool, float, int)` | PARTIAL | `openrv.audio.setAudioScrubEnabled(bool)` | Mu has chunkDuration/loopCount params |
| 28 | `setAudioCacheMode` | `(void; int)` | N/A | No cache modes in web | Web uses browser media cache |
| 29 | `audioCacheMode` | `(int;)` | N/A | | |

### commands Module -- View & Display

| # | Mu Command | Signature (Mu) | Category | openrv-web Mapping | Notes |
|---|-----------|----------------|----------|-------------------|-------|
| 30 | `redraw` | `(void;)` | ADD | Need explicit redraw trigger | Renderer should expose `requestRedraw()` |
| 31 | `viewSize` | `(vector int[2];)` | ADD | Need canvas size getter | `[canvas.width, canvas.height]` |
| 32 | `setViewSize` | `(void; int, int)` | ADD | Need canvas resize API | |
| 33 | `resizeFit` | `(void;)` | PARTIAL | `openrv.view.fitToWindow()` | |
| 34 | `fullScreenMode` | `(void; bool)` | ADD | Use Fullscreen API | `document.documentElement.requestFullscreen()` |
| 35 | `isFullScreen` | `(bool;)` | ADD | `document.fullscreenElement !== null` | |
| 36 | `center` | `(void;)` | N/A | Browser window positioning not available | |
| 37 | `close` | `(void;)` | N/A | Cannot close browser tab from script | |
| 38 | `setWindowTitle` | `(void; string)` | ADD | `document.title = title` | |
| 39 | `setFiltering` | `(void; int)` | ADD | Need texture filter mode API | Map GL_NEAREST/GL_LINEAR to enum |
| 40 | `getFiltering` | `(int;)` | ADD | Paired with setFiltering | |
| 41 | `setBGMethod` | `(void; string)` | ADD | Need background mode API | 'black', 'checker', 'grey18', 'grey50', 'crosshatch' |
| 42 | `bgMethod` | `(string;)` | ADD | Paired with setBGMethod | |
| 43 | `setMargins` | `(void; float[], bool)` | ADD | Need margin support | |
| 44 | `margins` | `(float[];)` | ADD | Paired with setMargins | |
| 45 | `setHardwareStereoMode` | `(void; bool)` | N/A | No quad-buffer stereo on web | |
| 46 | `stereoSupported` | `(bool;)` | N/A | Always returns `false` | |
| 47 | `contentAspect` | `(float;)` | PARTIAL | Compute from `media.getResolution()` | `width / height` |
| 48 | `devicePixelRatio` | `(float;)` | DIRECT | `window.devicePixelRatio` | |

### commands Module -- Frame Marks

| # | Mu Command | Signature (Mu) | Category | openrv-web Mapping | Notes |
|---|-----------|----------------|----------|-------------------|-------|
| 49 | `markFrame` | `(void; int, bool)` | DIRECT | `openrv.markers.add(frame)` / `.remove(frame)` | Bool param toggles add/remove |
| 50 | `isMarked` | `(bool; int)` | DIRECT | `openrv.markers.get(frame) !== null` | |
| 51 | `markedFrames` | `(int[];)` | DIRECT | `openrv.markers.getAll().map(m => m.frame)` | |

### commands Module -- Source Management

| # | Mu Command | Signature (Mu) | Category | openrv-web Mapping | Notes |
|---|-----------|----------------|----------|-------------------|-------|
| 52 | `sources` | `(tuple[];)` | PARTIAL | `openrv.media.getCurrentSource()` | Mu returns all sources; web has single-source model |
| 53 | `addSource` | `(void; string[], string)` | ADD | Need `session.addSource(url)` | Async -- returns Promise |
| 54 | `addSources` | `(void; string[], string, bool)` | ADD | Batch version of addSource | |
| 55 | `addSourceVerbose` | `(string; string[], string)` | ADD | Returns created node name | |
| 56 | `addSourcesVerbose` | `(string[]; string[][], ...)` | ADD | Batch version | |
| 57 | `addSourceBegin` / `addSourceEnd` | `(void;)` | ADD | Batch optimization brackets | |
| 58 | `addToSource` | `(void; string, string)` | ADD | Add layer to existing source | |
| 59 | `setSourceMedia` | `(void; string, string[])` | ADD | Replace media in source | |
| 60 | `relocateSource` | `(void; string, string)` | ADD | Replace media path | |
| 61 | `sourceMedia` | `(tuple; string)` | ADD | Get media paths from source node | |
| 62 | `sourceMediaInfo` | `(SourceMediaInfo; string, string)` | PARTIAL | `openrv.media.getCurrentSource()` | Fewer fields; need per-source lookup |
| 63 | `sourceAttributes` | `((string,string)[]; string)` | ADD | Need image metadata API | EXR attributes, EXIF, etc. |
| 64 | `sourceDataAttributes` | `((string,byte[])[]; string)` | ADD | Binary attribute access (ICC profiles) | |
| 65 | `sourcePixelValue` | `(vector float[4]; string, int, int)` | ADD | Need pixel sampling API | Read from texture or decoded buffer |
| 66 | `sourceDisplayChannelNames` | `(string[]; string)` | ADD | Channel name mapping | |
| 67 | `sourcesAtFrame` | `(string[]; int)` | ADD | Which sources are active at frame | |
| 68 | `getCurrentImageSize` | `(vector float[2];)` | PARTIAL | `openrv.media.getResolution()` | Deprecated in Mu; returns {width, height} |
| 69 | `newImageSource` | `(string; string, int, int, ...)` | ADD | Create in-memory image source | |
| 70 | `newImageSourcePixels` | `(void; string, int, ...)` | ADD | Set pixels for image source | |
| 71 | `clearSession` | `(void;)` | ADD | Need `session.clear()` | |

### commands Module -- Source Media Representations

| # | Mu Command | Signature (Mu) | Category | openrv-web Mapping | Notes |
|---|-----------|----------------|----------|-------------------|-------|
| 72 | `addSourceMediaRep` | `(string; string, string, string[])` | ADD | Multi-resolution/proxy support | |
| 73 | `setActiveSourceMediaRep` | `(void; string, string)` | ADD | Switch active media rep | |
| 74 | `sourceMediaRep` | `(string; string)` | ADD | Get active rep name | |
| 75 | `sourceMediaReps` | `(string[]; string)` | ADD | List available reps | |
| 76 | `sourceMediaRepsAndNodes` | `((string,string)[]; string)` | ADD | Rep name + node pairs | |
| 77 | `sourceMediaRepSwitchNode` | `(string; string)` | ADD | Get switch node for source | |
| 78 | `sourceMediaRepSourceNode` | `(string; string)` | ADD | Get source node for rep | |

### commands Module -- Node Graph

| # | Mu Command | Signature (Mu) | Category | openrv-web Mapping | Notes |
|---|-----------|----------------|----------|-------------------|-------|
| 79 | `nodes` | `(string[];)` | ADD | List all graph nodes | Need node graph API |
| 80 | `nodeType` | `(string; string)` | ADD | Get node type by name | |
| 81 | `newNode` | `(string; string, string)` | ADD | Create node in graph | |
| 82 | `deleteNode` | `(void; string)` | ADD | Delete node from graph | |
| 83 | `nodeConnections` | `((string[],string[]); string, bool)` | ADD | Get input/output connections | |
| 84 | `setNodeInputs` | `(void; string, string[])` | ADD | Wire node inputs | |
| 85 | `testNodeInputs` | `(bool; string, string[])` | ADD | Cycle detection test | |
| 86 | `nodesInGroup` | `(string[]; string)` | ADD | List nodes in a group | |
| 87 | `nodeGroup` | `(string; string)` | ADD | Get parent group of node | |
| 88 | `nodeExists` | `(bool; string)` | ADD | Check node existence | |
| 89 | `nodesOfType` | `(string[]; string)` | ADD | Find nodes by type | |
| 90 | `viewNode` | `(string;)` | ADD | Current view root node | |
| 91 | `viewNodes` | `(string[];)` | ADD | All viewable nodes | |
| 92 | `setViewNode` | `(void; string)` | ADD | Switch view root | |
| 93 | `previousViewNode` | `(string;)` | ADD | View history navigation | |
| 94 | `nextViewNode` | `(string;)` | ADD | View history navigation | |
| 95 | `nodeImageGeometry` | `(NodeImageGeometry; string)` | ADD | Output geometry of a node | |

### commands Module -- Properties

| # | Mu Command | Signature (Mu) | Category | openrv-web Mapping | Notes |
|---|-----------|----------------|----------|-------------------|-------|
| 96 | `getFloatProperty` | `(float[]; string, int, int)` | ADD | Need property system | Core to Mu compat |
| 97 | `getIntProperty` | `(int[]; string, int, int)` | ADD | | |
| 98 | `getStringProperty` | `(string[]; string, int, int)` | ADD | | |
| 99 | `getByteProperty` | `(byte[]; string, int, int)` | ADD | | |
| 100 | `getHalfProperty` | `(half[]; string, int, int)` | ADD | | |
| 101 | `setFloatProperty` | `(void; string, float[], bool)` | ADD | | |
| 102 | `setIntProperty` | `(void; string, int[], bool)` | ADD | | |
| 103 | `setStringProperty` | `(void; string, string[], bool)` | ADD | | |
| 104 | `setByteProperty` | `(void; string, byte[], bool)` | ADD | | |
| 105 | `setHalfProperty` | `(void; string, half[], bool)` | ADD | | |
| 106 | `insertFloatProperty` | `(void; string, float[], int)` | ADD | | |
| 107 | `insertIntProperty` | `(void; string, int[], int)` | ADD | | |
| 108 | `insertStringProperty` | `(void; string, string[], int)` | ADD | | |
| 109 | `insertByteProperty` | `(void; string, byte[], int)` | ADD | | |
| 110 | `insertHalfProperty` | `(void; string, half[], int)` | ADD | | |
| 111 | `newProperty` | `(void; string, int, int)` | ADD | Create typed property | |
| 112 | `newNDProperty` | `(void; string, int, (int,int,int,int))` | ADD | Multi-dim property | |
| 113 | `deleteProperty` | `(void; string)` | ADD | | |
| 114 | `properties` | `(string[]; string)` | ADD | List properties on node | |
| 115 | `propertyInfo` | `(PropertyInfo; string)` | ADD | Property metadata | |
| 116 | `propertyExists` | `(bool; string)` | ADD | Check property existence | |

### commands Module -- Graph Evaluation

| # | Mu Command | Signature (Mu) | Category | openrv-web Mapping | Notes |
|---|-----------|----------------|----------|-------------------|-------|
| 117 | `metaEvaluate` | `(MetaEvalInfo[]; int, string, string)` | ADD | Graph traversal without rendering | |
| 118 | `metaEvaluateClosestByType` | `(MetaEvalInfo[]; int, string, string)` | ADD | Stop at first matching type | |
| 119 | `closestNodesOfType` | `(string[]; string, string, int)` | ADD | Find nearest nodes by type | |
| 120 | `mapPropertyToGlobalFrames` | `(int[]; string, int, string)` | ADD | Frame remapping | |

### commands Module -- Image Query

| # | Mu Command | Signature (Mu) | Category | openrv-web Mapping | Notes |
|---|-----------|----------------|----------|-------------------|-------|
| 121 | `renderedImages` | `(RenderedImageInfo[];)` | ADD | Currently rendered images | |
| 122 | `imagesAtPixel` | `(PixelImageInfo[]; vec2, string, bool)` | ADD | Hit-test images at screen point | |
| 123 | `imageGeometry` | `(vec2[]; string)` | ADD | Image corners in view space | |
| 124 | `imageGeometryByIndex` | `(vec2[]; int)` | ADD | Corners by render index | |
| 125 | `imageGeometryByTag` | `(vec2[]; string, string)` | ADD | Corners by tag | |
| 126 | `eventToImageSpace` | `(vec2; string, vec2, bool)` | ADD | Screen to image coords | |
| 127 | `eventToCameraSpace` | `(vec2; string, vec2)` | ADD | Screen to camera coords | |

### commands Module -- Event System

| # | Mu Command | Signature (Mu) | Category | openrv-web Mapping | Notes |
|---|-----------|----------------|----------|-------------------|-------|
| 128 | `bind` | `(void; string, string, string, (void;Event), string)` | PARTIAL | `openrv.events.on(event, callback)` | Mu has mode/table scoping |
| 129 | `bindRegex` | `(void; string, string, string, regex, ...)` | ADD | Regex event binding | |
| 130 | `unbind` | `(void; string, string, string)` | PARTIAL | `openrv.events.off(event, callback)` | |
| 131 | `unbindRegex` | `(void; string, string, regex)` | ADD | | |
| 132 | `sendInternalEvent` | `(void; string, string, string)` | ADD | Custom event dispatch | |
| 133 | `defineMinorMode` | `(void; string, ...)` | ADD | Mode-based event tables | Complex; needs mode manager |
| 134 | `activateMode` | `(void; string)` | ADD | | |
| 135 | `deactivateMode` | `(void; string)` | ADD | | |
| 136 | `isModeActive` | `(bool; string)` | ADD | | |
| 137 | `activeModes` | `(string[];)` | ADD | | |
| 138 | `pushEventTable` | `(void; string)` | ADD | Event table stack | |
| 139 | `popEventTable` | `(void; string)` | ADD | | |
| 140 | `activeEventTables` | `(string[];)` | ADD | | |
| 141 | `setEventTableBBox` | `(void; string, string, ...)` | ADD | | |
| 142 | `bindings` | `((string,string)[];)` | ADD | List active bindings | |
| 143 | `bindingDocumentation` | `(string; string, string, string)` | ADD | | |
| 144 | `defineModeMenu` | `(void; string, Menu, bool)` | N/A | No native menu bar | Could map to web menus |

### commands Module -- Session Management

| # | Mu Command | Signature (Mu) | Category | openrv-web Mapping | Notes |
|---|-----------|----------------|----------|-------------------|-------|
| 145 | `sessionName` | `(string;)` | ADD | Need session name API | |
| 146 | `sessionNames` | `(string[];)` | ADD | Multi-session not yet supported | |
| 147 | `setSessionName` | `(void; string)` | ADD | | |
| 148 | `sessionFileName` | `(string;)` | N/A | No local file system | |
| 149 | `setSessionFileName` | `(void; string)` | N/A | | |
| 150 | `saveSession` | `(void; string, bool, bool, bool)` | ADD | Serialize to JSON/blob download | |
| 151 | `newSession` | `(void; string[])` | ADD | Create fresh session | |
| 152 | `clearSession` | `(void;)` | ADD | Clear all sources | |
| 153 | `setFrameStart` | `(void; int)` | ADD | Set frame range start | |
| 154 | `setFrameEnd` | `(void; int)` | ADD | Set frame range end | |

### commands Module -- Cache

| # | Mu Command | Signature (Mu) | Category | openrv-web Mapping | Notes |
|---|-----------|----------------|----------|-------------------|-------|
| 155 | `setCacheMode` | `(void; int)` | N/A | Browser manages caching | |
| 156 | `cacheMode` | `(int;)` | N/A | | |
| 157 | `isCaching` | `(bool;)` | N/A | | |
| 158 | `cacheInfo` | `(tuple;)` | N/A | | |
| 159 | `cacheSize` | `(int;)` | N/A | | |
| 160 | `clearAllButFrame` | `(void; int)` | N/A | | |
| 161 | `reload` | `(void; int, int)` | ADD | Re-fetch/re-decode source | |
| 162 | `loadChangedFrames` | `(void; string[])` | ADD | Reload changed files | |
| 163 | `releaseAllUnusedImages` | `(void;)` | N/A | GC handles memory | |
| 164 | `releaseAllCachedImages` | `(void;)` | N/A | | |
| 165 | `flushCacheNodeOutput` | `(void; string)` | N/A | | |

### commands Module -- Export

| # | Mu Command | Signature (Mu) | Category | openrv-web Mapping | Notes |
|---|-----------|----------------|----------|-------------------|-------|
| 166 | `exportCurrentFrame` | `(void; string)` | ADD | Canvas toBlob -> download | Use exporter plugin system |
| 167 | `exportCurrentSourceFrame` | `(void; string)` | ADD | Save raw source image | |

### commands Module -- File Dialogs

| # | Mu Command | Signature (Mu) | Category | openrv-web Mapping | Notes |
|---|-----------|----------------|----------|-------------------|-------|
| 168 | `openMediaFileDialog` | `(string[]; bool, int, string, string, string)` | PARTIAL | `<input type="file">` or File System Access API | Returns Promise; limited filtering |
| 169 | `openFileDialog` | `(string[]; bool, bool, bool, string, string)` | PARTIAL | Same as above | |
| 170 | `saveFileDialog` | `(string; bool, string, string, bool)` | PARTIAL | `showSaveFilePicker()` | Requires Chromium FSAA |
| 171 | `alertPanel` | `(int; bool, int, string, string, string, string, string)` | PARTIAL | `window.confirm()` / custom modal | |

### commands Module -- Network / Remote

| # | Mu Command | Signature (Mu) | Category | openrv-web Mapping | Notes |
|---|-----------|----------------|----------|-------------------|-------|
| 172 | `httpGet` | `(void; string, string[], ...)` | PARTIAL | `fetch()` API | Different callback model -> Promise |
| 173 | `httpPost` | `(void; string, string, string[], ...)` | PARTIAL | `fetch()` with POST | |
| 174 | `httpPut` | `(void; string, byte[], string[], ...)` | PARTIAL | `fetch()` with PUT | |
| 175 | `remoteSendMessage` | `(void; string, string[])` | ADD | WebSocket/WebRTC bridge | |
| 176 | `remoteSendEvent` | `(void; string, string, string, string[])` | ADD | | |
| 177 | `remoteSendDataEvent` | `(void; string, string, string, byte[], ...)` | ADD | | |
| 178 | `remoteConnections` | `(string[];)` | ADD | | |
| 179 | `remoteApplications` | `(string[];)` | ADD | | |
| 180 | `remoteContacts` | `(string[];)` | ADD | | |
| 181 | `remoteLocalContactName` | `(string;)` | ADD | | |
| 182 | `setRemoteLocalContactName` | `(void; string)` | ADD | | |
| 183 | `remoteConnect` | `(void; string, string, int)` | ADD | | |
| 184 | `remoteDisconnect` | `(void; string)` | ADD | | |
| 185 | `remoteNetwork` | `(void; bool)` | ADD | | |
| 186 | `remoteNetworkStatus` | `(int;)` | ADD | | |
| 187 | `remoteDefaultPermission` | `(int;)` | ADD | | |
| 188 | `setRemoteDefaultPermission` | `(void; int)` | ADD | | |
| 189 | `spoofConnectionStream` | `(void; string, float)` | N/A | Debug/test only | |

### commands Module -- Settings / Preferences

| # | Mu Command | Signature (Mu) | Category | openrv-web Mapping | Notes |
|---|-----------|----------------|----------|-------------------|-------|
| 190 | `readSetting` | `(SettingsValue; string, string, SettingsValue)` | ADD | `localStorage` or IndexedDB | |
| 191 | `writeSetting` | `(void; string, string, SettingsValue)` | ADD | | |

### commands Module -- Misc / Utilities

| # | Mu Command | Signature (Mu) | Category | openrv-web Mapping | Notes |
|---|-----------|----------------|----------|-------------------|-------|
| 192 | `eval` | `(string; string)` | N/A | No Mu runtime in browser | Could eval JS instead |
| 193 | `data` | `(State;)` | ADD | Application state object | Compat State shim |
| 194 | `contractSequences` | `(string[]; string[])` | N/A | File system operation | |
| 195 | `sequenceOfFile` | `(string; string)` | N/A | File system operation | |
| 196 | `existingFilesInSequence` | `(string[]; string)` | N/A | File system operation | |
| 197 | `fileKind` | `(int; string)` | PARTIAL | Can detect by extension | No FS probing |
| 198 | `commandLineFlag` | `(string; string)` | PARTIAL | URL query params | `new URLSearchParams(location.search)` |
| 199 | `readLUT` | `(void; string, string)` | ADD | Load LUT file (fetch + parse) | |
| 200 | `updateLUT` | `(void;)` | N/A | Deprecated in Mu | |
| 201 | `readProfile` | `(void; string, string, bool, string)` | ADD | Profile load/apply | |
| 202 | `writeProfile` | `(void; string, string)` | ADD | Profile export | |
| 203 | `startTimer` | `(void;)` | ADD | `performance.now()` based | |
| 204 | `elapsedTime` | `(float;)` | ADD | | |
| 205 | `theTime` | `(float;)` | ADD | `performance.now() / 1000` | |
| 206 | `stopTimer` | `(void;)` | ADD | | |
| 207 | `isTimerRunning` | `(bool;)` | ADD | | |
| 208 | `loadTotal` | `(int;)` | ADD | Progressive loading counter | |
| 209 | `loadCount` | `(int;)` | ADD | | |
| 210 | `setProgressiveSourceLoading` | `(void; bool)` | ADD | Async loading toggle | |
| 211 | `progressiveSourceLoading` | `(bool;)` | ADD | | |
| 212 | `waitForProgressiveLoading` | `(void;)` | ADD | Returns Promise in web | |
| 213 | `startPreloadingMedia` | `(void; string)` | ADD | Prefetch via `fetch()` | |
| 214 | `setCursor` | `(void; int)` | PARTIAL | `document.body.style.cursor` | Map Mu constants to CSS cursors |
| 215 | `watchFile` | `(void; string, bool)` | N/A | No file watching in browser | |
| 216 | `showConsole` | `(void;)` | N/A | Browser has devtools | |
| 217 | `isConsoleVisible` | `(bool;)` | N/A | | |
| 218 | `setRendererType` | `(void; string)` | N/A | Unused in Mu too | |
| 219 | `getRendererType` | `(string;)` | N/A | | |
| 220 | `optionsPlay` | `(int;)` | PARTIAL | URL param `?autoplay=1` | |
| 221 | `optionsPlayReset` | `(void;)` | ADD | | |
| 222 | `optionsNoPackages` | `(int;)` | PARTIAL | URL param `?nopackages=1` | |
| 223 | `openUrl` | `(void; string)` | ADD | `window.open(url)` | |
| 224 | `putUrlOnClipboard` | `(void; string)` | ADD | `navigator.clipboard.writeText()` | |
| 225 | `cacheDir` | `(string;)` | N/A | No local cache dir | |
| 226 | `sessionFromUrl` | `(void; string)` | ADD | Parse rvlink URL | |
| 227 | `myNetworkPort` | `(int;)` | N/A | No server socket in browser | |
| 228 | `myNetworkHost` | `(string;)` | PARTIAL | `location.hostname` | |
| 229 | `encodePassword` / `decodePassword` | `(string; string)` | N/A | Security concern | |
| 230 | `videoDeviceIDString` | `(string; string, string, int)` | N/A | No video output devices | |
| 231 | `refreshOutputVideoDevice` | `(void;)` | N/A | | |
| 232 | `audioTextureID` | `(int;)` | N/A | GL texture ID meaningless | |

### commands Module -- UI Widgets (Qt-specific)

| # | Mu Command | Signature (Mu) | Category | openrv-web Mapping | Notes |
|---|-----------|----------------|----------|-------------------|-------|
| 233 | `mainWindowWidget` | `(qt.QWidget;)` | N/A | No Qt | |
| 234 | `mainViewWidget` | `(qt.QWidget;)` | N/A | | |
| 235 | `prefTabWidget` | `(qt.QWidget;)` | N/A | | |
| 236 | `sessionBottomToolBar` | `(qt.QToolBar;)` | N/A | | |
| 237 | `networkAccessManager` | `(qt.QNetworkAccessManager;)` | N/A | Use `fetch()` instead | |
| 238 | `popupMenu` | `(void; Event, Menu)` | ADD | Custom context menu | HTML/CSS menu |
| 239 | `toggleMenuBar` | `(void;)` | N/A | No native menu bar | |
| 240 | `isMenuBarVisible` | `(bool;)` | N/A | | |
| 241 | `showTopViewToolbar` | `(void; bool)` | ADD | Toggle toolbar visibility | Web toolbar component |
| 242 | `showBottomViewToolbar` | `(void; bool)` | ADD | | |
| 243 | `isTopViewToolbarVisible` | `(bool;)` | ADD | | |
| 244 | `isBottomViewToolbarVisible` | `(bool;)` | ADD | | |
| 245 | `setUIBlocked` | `(void; bool)` | ADD | Overlay div blocking input | |

### commands Module -- Undo

| # | Mu Command | Signature (Mu) | Category | openrv-web Mapping | Notes |
|---|-----------|----------------|----------|-------------------|-------|
| 246 | `undoPathSwapVars` | `(void;)` | ADD | Need undo system | |
| 247 | `redoPathSwapVars` | `(void;)` | ADD | | |

---

### extra_commands Module

| # | Mu Command | Signature (Mu) | Category | openrv-web Mapping | Notes |
|---|-----------|----------------|----------|-------------------|-------|
| 248 | `displayFeedback` | `(void; string, float, Glyph, float[])` | ADD | HUD/toast notification | |
| 249 | `displayFeedbackQueue` | `(void; string, float, Glyph, float[])` | ADD | Queued toast | |
| 250 | `displayFeedback2` | `(void; string, float)` | ADD | Alias | |
| 251 | `displayFeedbackWithSizes` | `(void; string, float, float[])` | ADD | | |
| 252 | `isSessionEmpty` | `(bool;)` | DIRECT | `!openrv.media.hasMedia()` | |
| 253 | `isNarrowed` | `(bool;)` | ADD | In/out differs from full range | |
| 254 | `isPlayable` | `(bool;)` | ADD | `frameEnd != frameStart` | |
| 255 | `isPlayingForwards` | `(bool;)` | ADD | `isPlaying && inc > 0` | |
| 256 | `isPlayingBackwards` | `(bool;)` | ADD | `isPlaying && inc < 0` | |
| 257 | `togglePlay` | `(void;)` | DIRECT | `openrv.playback.toggle()` | |
| 258 | `toggleForwardsBackwards` | `(void;)` | ADD | Reverse playback direction | |
| 259 | `toggleRealtime` | `(void;)` | ADD | Toggle realtime mode | |
| 260 | `toggleFullScreen` | `(void;)` | ADD | Fullscreen API toggle | |
| 261 | `setScale` | `(void; float)` | DIRECT | `openrv.view.setZoom(s)` | |
| 262 | `scale` | `(float;)` | DIRECT | `openrv.view.getZoom()` | |
| 263 | `setTranslation` | `(void; Vec2)` | DIRECT | `openrv.view.setPan(x, y)` | |
| 264 | `translation` | `(Vec2;)` | DIRECT | `openrv.view.getPan()` | |
| 265 | `frameImage` | `(void;)` | DIRECT | `openrv.view.fitToWindow()` | Reset pan/zoom to fit |
| 266 | `stepForward` | `(void; int)` | DIRECT | `openrv.playback.step(n)` | |
| 267 | `stepBackward` | `(void; int)` | DIRECT | `openrv.playback.step(-n)` | |
| 268 | `stepForward1` | `(void;)` | DIRECT | `openrv.playback.step(1)` | |
| 269 | `stepBackward1` | `(void;)` | DIRECT | `openrv.playback.step(-1)` | |
| 270 | `stepForward10` | `(void;)` | DIRECT | `openrv.playback.step(10)` | |
| 271 | `stepBackward10` | `(void;)` | DIRECT | `openrv.playback.step(-10)` | |
| 272 | `stepForward100` | `(void;)` | DIRECT | `openrv.playback.step(100)` | |
| 273 | `stepBackward100` | `(void;)` | DIRECT | `openrv.playback.step(-100)` | |
| 274 | `numFrames` | `(int;)` | DIRECT | `openrv.playback.getTotalFrames()` | |
| 275 | `toggleFilter` | `(void;)` | ADD | Toggle nearest/linear | |
| 276 | `reloadInOut` | `(void;)` | ADD | Reload in-point to out-point range | |
| 277 | `centerResizeFit` | `(void;)` | PARTIAL | `openrv.view.fitToWindow()` | |
| 278 | `currentImageAspect` | `(float;)` | PARTIAL | Compute from resolution | |
| 279 | `sourceImageStructure` | `(tuple; string, string)` | ADD | Image structure query | |
| 280 | `cacheUsage` | `(tuple;)` | N/A | No cache system | |
| 281 | `set` (overloaded) | `(void; string, T)` | ADD | Property set shorthand | |
| 282 | `appendToProp` | `(void; string, string)` | ADD | Append to string property | |
| 283 | `removeFromProp` | `(void; string, string)` | ADD | Remove from string property | |
| 284 | `existsInProp` | `(bool; string, string)` | ADD | Check string in property | |
| 285 | `sourceMetaInfoAtFrame` | `(MetaEvalInfo; int, string)` | ADD | | |
| 286 | `sourceFrame` | `(int; int, string)` | ADD | Local frame at global frame | |
| 287 | `associatedNode` | `(string; string, string)` | ADD | Find associated node by type | |
| 288 | `associatedNodes` | `(string[]; string, string)` | ADD | Find all associated nodes | |
| 289 | `nodesInEvalPath` | `(string[]; int, string, string)` | ADD | Nodes in evaluation path | |
| 290 | `nodesUnderPointer` | `(string[][]; Event, string)` | ADD | | |
| 291 | `topLevelGroup` | `(string; string)` | ADD | Walk up to top group | |
| 292 | `nodesInGroupOfType` | `(string[]; string, string)` | ADD | | |
| 293 | `uiName` | `(string; string)` | ADD | Human-readable node name | |
| 294 | `setUIName` | `(void; string, string)` | ADD | Set node display name | |
| 295 | `isViewNode` | `(bool; string)` | ADD | Check if node is viewable | |
| 296 | `cycleNodeInputs` | `(void; string, bool)` | ADD | Rotate input order | |
| 297 | `popInputToTop` | `(void; string, int\|string)` | ADD | Reorder inputs | |
| 298 | `inputNodeUserNameAtFrame` | `(string; int, string)` | ADD | | |
| 299 | `sequenceBoundaries` | `(int[]; string)` | ADD | EDL cut points | |
| 300 | `findAnnotatedFrames` | `(int[]; string)` | ADD | Frames with paint annotations | |
| 301 | `toggleMotionScope` | `(void;)` | N/A | Complex UI mode | |
| 302 | `toggleSync` | `(void;)` | ADD | Network sync toggle | |
| 303 | `activateSync` | `(void;)` | ADD | | |
| 304 | `activatePackageModeEntry` | `(Mode; string)` | ADD | Plugin activation | |
| 305 | `deactivatePackageModeEntry` | `(Mode; string)` | ADD | Plugin deactivation | |
| 306 | `setDisplayProfilesFromSettings` | `(string[];)` | N/A | No device profiles | |
| 307 | `associatedVideoDevice` | `(string; string)` | N/A | No video devices | |
| 308 | `loadCurrentSourcesChangedFrames` | `(void;)` | ADD | | |

---

## Summary Statistics

| Category | Count | Percentage |
|----------|-------|-----------|
| DIRECT | ~35 | ~11% |
| PARTIAL | ~18 | ~6% |
| ADD (feasible) | ~195 | ~63% |
| N/A | ~60 | ~19% |
| **Total** | **~308** | **100%** |

---

## Implementation Phases

### Phase 1: Core Playback & Transport (Week 1-2)
**Commands covered:** ~35 (DIRECT mappings + simple ADDs)

Wrap all existing `window.openrv` methods in Mu-compatible function names. This is the lowest effort / highest value phase.

**Files to create:**
- `src/compat/MuCommands.ts` -- core class with playback, audio, view, loop, marker wrappers
- `src/compat/constants.ts` -- Mu constants (`PlayLoop`, `PlayOnce`, `PlayPingPong`, `CacheOff`, etc.)
- `src/compat/index.ts` -- registers `window.rv.commands`

**New API methods needed on openrv-web:**
- `session.frameStart` / `session.frameEnd` getters
- `session.playbackDirection` (+1/-1)
- `session.setFPS(fps)`
- Fullscreen helpers

**Effort:** ~3-4 days

### Phase 2: Property System Bridge (Week 3-4)
**Commands covered:** ~25 (all get/set/insert/new/delete property commands)

This is the backbone of Mu scripting -- nearly every non-trivial script reads or writes node properties.

**Files to create:**
- `src/compat/MuPropertyBridge.ts`
- `src/core/properties/PropertyStore.ts` -- typed property storage with `#node.component.name` paths

**New API methods needed:**
- A node property system: `PropertyStore` class supporting typed properties with Mu-style dot-path addressing
- Property type constants (`IntType`, `FloatType`, `StringType`, etc.)

**Effort:** ~5-7 days

### Phase 3: Node Graph API (Week 5-6)
**Commands covered:** ~20 (node CRUD, connections, groups, types)

Expose openrv-web's internal graph structure through Mu-compatible APIs.

**Files to create:**
- `src/compat/MuNodeBridge.ts`

**New API methods needed:**
- `NodeGraph` class exposing node listing, creation, connection, type queries
- View node management (viewNode, setViewNode, viewNodes, history)

**Effort:** ~5-7 days

### Phase 4: Source Management (Week 7-8)
**Commands covered:** ~20 (addSource, sourceMedia, sourceMediaInfo, media reps)

**Files to create/modify:**
- Extend `src/compat/MuCommands.ts` with source management
- `src/core/session/SourceManager.ts` -- if not existing

**New API methods needed:**
- `session.addSource(urls, tag?)` returning Promise
- `session.clearSession()`
- Source media rep system (switch between representations)
- Source attribute queries

**Effort:** ~5-7 days

### Phase 5: Event System & Modes (Week 9-10)
**Commands covered:** ~18 (bind, unbind, modes, event tables)

The Mu event model is fundamentally different from DOM events. This phase builds a mode manager.

**Files to create:**
- `src/compat/MuEventBridge.ts`
- `src/compat/ModeManager.ts` -- minor/major mode system with event tables

**New API methods needed:**
- Mode-scoped event binding with reject/accept semantics
- Event table stack (push/pop)
- BBox-scoped pointer event filtering

**Effort:** ~7-10 days

### Phase 6: Graph Evaluation & Image Query (Week 11-12)
**Commands covered:** ~12 (metaEvaluate, imagesAtPixel, imageGeometry, etc.)

**Files to create:**
- `src/compat/MuEvalBridge.ts`

**New API methods needed:**
- Meta-evaluation that traverses the IP graph without rendering
- Pixel hit-testing against rendered images
- Coordinate space transforms (event -> image, event -> camera)

**Effort:** ~7-10 days

### Phase 7: Network, Settings, Utilities (Week 13-14)
**Commands covered:** ~30 (http, remote, settings, timers, misc)

**Files to create:**
- `src/compat/MuNetworkBridge.ts` -- WebSocket-based remote API
- `src/compat/MuSettingsBridge.ts` -- localStorage-backed settings
- `src/compat/MuUtilsBridge.ts` -- timers, file kind detection, URL handling

**New API methods needed:**
- Remote connection manager (WebSocket/WebRTC)
- Settings store backed by localStorage/IndexedDB
- Timer utilities

**Effort:** ~5-7 days

### Phase 8: Stubs, Docs, Polish (Week 15-16)
**Commands covered:** all N/A commands (~60)

**Files to create:**
- `src/compat/stubs.ts` -- all N/A functions with warning logs
- `src/compat/MuCommands.test.ts` -- comprehensive tests

**Work:**
- Generate stub functions for all N/A commands
- Write migration guide documenting differences
- Add `rv.commands.isSupported(name)` introspection
- Add TypeScript declaration file for external consumers

**Effort:** ~3-5 days

---

## File Structure

```
src/compat/
  index.ts                 -- barrel export, window.rv registration
  MuCommands.ts            -- commands module wrapper (Phase 1)
  MuExtraCommands.ts       -- extra_commands wrapper (Phase 1)
  MuPropertyBridge.ts      -- property get/set system (Phase 2)
  MuNodeBridge.ts          -- node graph operations (Phase 3)
  MuEventBridge.ts         -- event binding/modes (Phase 5)
  MuEvalBridge.ts          -- graph evaluation queries (Phase 6)
  MuNetworkBridge.ts       -- remote/http operations (Phase 7)
  MuSettingsBridge.ts      -- read/writeSetting (Phase 7)
  MuUtilsBridge.ts         -- timers, file utils (Phase 7)
  ModeManager.ts           -- mode/event table system (Phase 5)
  constants.ts             -- Mu constant values (Phase 1)
  types.ts                 -- PixelImageInfo, RenderedImageInfo, etc.
  stubs.ts                 -- N/A command stubs with warnings (Phase 8)
  __tests__/
    MuCommands.test.ts
    MuPropertyBridge.test.ts
    MuNodeBridge.test.ts
    MuEventBridge.test.ts
    integration.test.ts    -- end-to-end Mu script compat tests
```

---

## Estimated Total Effort

| Phase | Scope | Effort |
|-------|-------|--------|
| Phase 1: Core Playback | 35 commands | 3-4 days |
| Phase 2: Properties | 25 commands | 5-7 days |
| Phase 3: Node Graph | 20 commands | 5-7 days |
| Phase 4: Sources | 20 commands | 5-7 days |
| Phase 5: Events & Modes | 18 commands | 7-10 days |
| Phase 6: Graph Eval | 12 commands | 7-10 days |
| Phase 7: Network/Settings | 30 commands | 5-7 days |
| Phase 8: Stubs & Polish | 60 stubs + docs | 3-5 days |
| **Total** | **~308 commands** | **~40-57 days** |

---

## New openrv-web API Methods Required

These are methods that do not currently exist in openrv-web and must be added to support the compatibility layer. Grouped by subsystem:

### Session / Playback
- `session.frameStart` / `session.frameEnd` (expose frame range boundaries)
- `session.setFPS(fps: number)` (override playback FPS)
- `session.playbackDirection: 1 | -1` (forward/reverse)
- `session.setPlaybackDirection(dir: 1 | -1)`
- `session.clearSession()` (remove all sources)
- `session.addSource(urls: string[], tag?: string): Promise<string>` (load media)
- `session.isBuffering: boolean`

### Property System (new subsystem)
- `PropertyStore` class with typed property CRUD
- `#TypeName` path resolution (find nearest node of type)
- Property info/existence queries

### Node Graph (new subsystem)
- `NodeGraph.nodes(): string[]`
- `NodeGraph.nodeType(name: string): string`
- `NodeGraph.newNode(type: string, name: string): string`
- `NodeGraph.deleteNode(name: string)`
- `NodeGraph.connections(name: string): { inputs: string[], outputs: string[] }`
- `NodeGraph.setInputs(name: string, inputs: string[])`
- `NodeGraph.viewNode(): string` / `setViewNode(name: string)`

### Renderer
- `renderer.requestRedraw()`
- `renderer.setFiltering(mode: 'nearest' | 'linear')`
- `renderer.getFiltering(): 'nearest' | 'linear'`
- `renderer.setBackground(method: string)`

### View
- `viewer.getViewSize(): { width: number, height: number }`
- `viewer.setViewSize(width: number, height: number)`

### Utilities
- Fullscreen API wrapper
- Timer API (`startTimer`, `stopTimer`, `elapsedTime`)
- Settings store (localStorage-backed `readSetting`/`writeSetting`)
