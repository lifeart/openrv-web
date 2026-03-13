# Issues

This file tracks findings from exploratory review and targeted validation runs.

## Confirmed Issues

### 249. Mu compat ND properties lose their declared shape after any set or insert operation

- Severity: Medium
- Area: Mu compatibility / property system
- Evidence:
  - `newNDProperty(...)` correctly stores the declared multi-dimensional shape in `prop.dimensions` when the property is created in [src/compat/MuPropertyBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuPropertyBridge.ts#L236) through [src/compat/MuPropertyBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuPropertyBridge.ts#L254).
  - Every write path then overwrites that metadata with a flat one-dimensional shape: `setStringProperty(...)` sets `prop.dimensions = [values.length]` in [src/compat/MuPropertyBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuPropertyBridge.ts#L154) through [src/compat/MuPropertyBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuPropertyBridge.ts#L165), `_setNumericProperty(...)` does the same in [src/compat/MuPropertyBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuPropertyBridge.ts#L397) through [src/compat/MuPropertyBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuPropertyBridge.ts#L410), and both insert helpers flatten dimensions in [src/compat/MuPropertyBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuPropertyBridge.ts#L177) through [src/compat/MuPropertyBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuPropertyBridge.ts#L189) and [src/compat/MuPropertyBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuPropertyBridge.ts#L412) through [src/compat/MuPropertyBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuPropertyBridge.ts#L431).
  - The tests only verify that `newNDProperty(...)` starts with the right `[4, 4]` dimensions in [src/compat/__tests__/MuPropertyBridge.test.ts](/Users/lifeart/Repos/openrv-web/src/compat/__tests__/MuPropertyBridge.test.ts#L78) through [src/compat/__tests__/MuPropertyBridge.test.ts#L85); there is no coverage for writing to an ND property and preserving its shape metadata.
- Impact:
  - Mu-compatible scripts can create a matrix- or tensor-shaped property and have its metadata silently collapse to a flat vector after the first update.
  - That breaks any downstream logic that relies on `propertyInfo().dimensions` to understand the property's declared structure.

### 250. Mu compat `closestNodesOfType()` returns farther matches too, instead of only the nearest layer of matches

- Severity: Medium
- Area: Mu compatibility / graph evaluation
- Evidence:
  - `closestNodesOfType(...)` uses BFS, but it keeps traversing upstream even after it finds a node of the target type, collecting every later match into the result array in [src/compat/MuEvalBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuEvalBridge.ts#L164) through [src/compat/MuEvalBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuEvalBridge.ts#L190).
  - Because the search does not stop at the first matching depth, a branched graph with both near and far matches will return the far ones too, despite the API name and docs saying “closest nodes of a given type.”
  - The current tests only cover single-depth or same-depth cases and explicitly accept multiple returned matches without checking that farther-depth matches are excluded in [src/compat/__tests__/MuEvalBridge.test.ts](/Users/lifeart/Repos/openrv-web/src/compat/__tests__/MuEvalBridge.test.ts#L166) through [src/compat/__tests__/MuEvalBridge.test.ts#L196).
- Impact:
  - Mu-compatible scripts asking for the nearest upstream nodes of a type can receive a broader set that includes non-nearest ancestors.
  - That changes graph-query semantics in a way that can select the wrong control or source node when scripts expect the first matching layer only.

### 251. Mu compat `metaEvaluateClosestByType()` chooses the first depth-first match, not the actual closest match in branched graphs

- Severity: Medium
- Area: Mu compatibility / graph evaluation
- Evidence:
  - `metaEvaluateClosestByType(...)` delegates to `_traverseEvalChainUntilType(...)`, which performs a depth-first recursive walk over `node.inputs` and returns as soon as any branch finds the target type in [src/compat/MuEvalBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuEvalBridge.ts#L139) through [src/compat/MuEvalBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuEvalBridge.ts#L151) and [src/compat/MuEvalBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuEvalBridge.ts#L471) through [src/compat/MuEvalBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuEvalBridge.ts#L505).
  - In a branched graph, that means the returned path depends on input iteration order, not on which matching node is actually topologically closest to the start node.
  - The existing tests exercise only a single linear chain, so they confirm “first encountered in DFS” behavior rather than true closest-match behavior in [src/compat/__tests__/MuEvalBridge.test.ts](/Users/lifeart/Repos/openrv-web/src/compat/__tests__/MuEvalBridge.test.ts#L135) through [src/compat/__tests__/MuEvalBridge.test.ts](/Users/lifeart/Repos/openrv-web/src/compat/__tests__/MuEvalBridge.test.ts#L159).
- Impact:
  - Mu-compatible scripts can get a path to the wrong matching node when multiple upstream branches contain the requested type.
  - That makes “closest by type” unstable across graph shapes and input ordering, which is a logic bug rather than just an approximation.

### 252. Mu compat source-list fallbacks can return phantom source names that the rest of the source API cannot resolve

- Severity: Medium
- Area: Mu compatibility / source management
- Evidence:
  - When there are no local source records, `sources()` fabricates an entry from `openrv.media.getCurrentSource()` and returns its `name` as a source identifier in [src/compat/MuSourceBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuSourceBridge.ts#L124) through [src/compat/MuSourceBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuSourceBridge.ts#L147).
  - `sourcesAtFrame(...)` does the same fallback and returns `current.name` even though no corresponding local `SourceRecord` exists in [src/compat/MuSourceBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuSourceBridge.ts#L158) through [src/compat/MuSourceBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuSourceBridge.ts#L179).
  - Almost every other source command resolves through `_getSource(...)`, which only looks in the local `_sources` map and throws if the name is absent in [src/compat/MuSourceBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuSourceBridge.ts#L785) through [src/compat/MuSourceBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuSourceBridge.ts#L790).
  - The fallback tests explicitly validate that `sources()` and `sourcesAtFrame()` return the OpenRV current source name `test-source` when no local sources exist in [src/compat/__tests__/MuSourceBridge.test.ts](/Users/lifeart/Repos/openrv-web/src/compat/__tests__/MuSourceBridge.test.ts#L43) through [src/compat/__tests__/MuSourceBridge.test.ts#L48) and [src/compat/__tests__/MuSourceBridge.test.ts](/Users/lifeart/Repos/openrv-web/src/compat/__tests__/MuSourceBridge.test.ts#L71) through [src/compat/__tests__/MuSourceBridge.test.ts#L74), but there is no test that follow-up source queries can actually use that returned name.
- Impact:
  - Mu-compatible scripts can enumerate a source name from `sources()` or `sourcesAtFrame()` and then immediately fail when calling `sourceMedia(...)`, `sourceMediaInfo(...)`, `sourceAttributes(...)`, or other source methods on that same name.
  - This also makes the bridge internally inconsistent, because source discovery can report a source while `hasSource(...)` and `sourceCount()` still say there are no local sources.

### 253. Mu compat `properties('#TypeName')` does not honor the documented hash-path semantics

- Severity: Medium
- Area: Mu compatibility / property system
- Evidence:
  - The `properties(nodeName)` API is documented as accepting either a node name or `#TypeName` in [src/compat/MuPropertyBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuPropertyBridge.ts#L270) through [src/compat/MuPropertyBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuPropertyBridge.ts#L285).
  - Its implementation does not use `_resolveKey(...)` or any hash resolution logic; it merely strips `#` and does `key.startsWith(prefix + '.')` in [src/compat/MuPropertyBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuPropertyBridge.ts#L276) through [src/compat/MuPropertyBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuPropertyBridge.ts#L284).
  - That behavior is inconsistent with the rest of the hash-path API, where `_resolveKey(...)` matches exact names or node names containing the type token for `#TypeName.component.property` lookups in [src/compat/MuPropertyBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuPropertyBridge.ts#L343) through [src/compat/MuPropertyBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuPropertyBridge.ts#L380).
  - The tests cover normal `properties('myNode')` usage and hash-path resolution for `get*`, `propertyInfo`, and `propertyExists`, but there is no coverage for `properties('#TypeName')` in [src/compat/__tests__/MuPropertyBridge.test.ts](/Users/lifeart/Repos/openrv-web/src/compat/__tests__/MuPropertyBridge.test.ts#L134) through [src/compat/__tests__/MuPropertyBridge.test.ts#L151) and [src/compat/__tests__/MuPropertyBridge.test.ts](/Users/lifeart/Repos/openrv-web/src/compat/__tests__/MuPropertyBridge.test.ts#L331) through [src/compat/__tests__/MuPropertyBridge.test.ts#L356).
- Impact:
  - Mu-compatible scripts can successfully use `#TypeName.component.property` in point lookups and then get a contradictory empty or incomplete result when they try to list properties with `properties('#TypeName')`.
  - That inconsistency makes hash-based property discovery unreliable and can break tooling that first enumerates properties by type and then reads them individually.

### 254. Mu compat `fileKind()` misclassifies normal signed or query-string media URLs as unknown files

- Severity: Medium
- Area: Mu compatibility / file-kind detection
- Evidence:
  - `fileKind(path)` determines the extension by calling `getExtension(path)` and lowercasing the substring after the last literal `.` in [src/compat/MuUtilsBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuUtilsBridge.ts#L83) through [src/compat/MuUtilsBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuUtilsBridge.ts#L143).
  - `getExtension(...)` does not strip query strings or fragments; it simply returns `path.slice(lastDot + 1)` in [src/compat/MuUtilsBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuUtilsBridge.ts#L351) through [src/compat/MuUtilsBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuUtilsBridge.ts#L355).
  - A common browser URL like `https://example.com/shot.exr?token=abc` therefore yields the extension `exr?token=abc`, which will not match any supported extension list.
  - The tests only cover bare filenames such as `test.exr`, `video.mp4`, and `TEST.EXR`; there is no coverage for URL-style inputs with `?` or `#` in [src/compat/__tests__/MuEventBridge.test.ts](/Users/lifeart/Repos/openrv-web/src/compat/__tests__/MuEventBridge.test.ts#L558) through [src/compat/__tests__/MuEventBridge.test.ts](/Users/lifeart/Repos/openrv-web/src/compat/__tests__/MuEventBridge.test.ts#L599).
- Impact:
  - Mu-compatible scripts that classify browser-delivered media URLs can get `UnknownFile` for ordinary signed image, movie, LUT, or CDL URLs.
  - That breaks detection logic exactly in the web scenarios where browser-style URLs are most common.

### 255. Mu compat `remoteConnect()` forces `wss` for every non-local host, which blocks valid plain-`ws` remotes

- Severity: Medium
- Area: Mu compatibility / remote networking
- Evidence:
  - `remoteConnect(name, host, port)` selects `ws` only for `localhost` or `127.0.0.1`; every other host is forced to `wss` in [src/compat/MuNetworkBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuNetworkBridge.ts#L85) through [src/compat/MuNetworkBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuNetworkBridge.ts#L87).
  - The method does not inspect the current page protocol, allow an explicit scheme, or provide any override for environments where a non-local remote is legitimately served over plain `ws`.
  - The compat tests only check the disabled-network warning path and never exercise actual socket URL construction in [src/compat/__tests__/MuEventBridge.test.ts](/Users/lifeart/Repos/openrv-web/src/compat/__tests__/MuEventBridge.test.ts#L671) through [src/compat/__tests__/MuEventBridge.test.ts](/Users/lifeart/Repos/openrv-web/src/compat/__tests__/MuEventBridge.test.ts#L677).
- Impact:
  - Mu-compatible scripts cannot connect to a valid non-local RV peer that is exposed over plain WebSocket, even in environments where that is expected and allowed.
  - This is a logic bug in connection setup rather than a browser limitation, because the bridge chooses the scheme before the connection attempt even starts.

### 256. Mu compat hash-path property resolution is insertion-order dependent when multiple node names contain the same type token

- Severity: Medium
- Area: Mu compatibility / property system
- Evidence:
  - For hash paths like `#TypeName.component.property`, `_resolveKey(...)` first checks an exact node-name match and then returns the first stored key whose node name merely `includes(typeName)` in [src/compat/MuPropertyBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuPropertyBridge.ts#L360) through [src/compat/MuPropertyBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuPropertyBridge.ts#L378).
  - Because the fallback search iterates `this._store.keys()` directly, the chosen property depends on insertion order when multiple node names contain the same token and share the same component/property suffix.
  - There is no disambiguation by actual node type, graph structure, or strongest match beyond exact node-name equality.
  - The current tests cover only a single matching hash target at a time in [src/compat/__tests__/MuPropertyBridge.test.ts](/Users/lifeart/Repos/openrv-web/src/compat/__tests__/MuPropertyBridge.test.ts#L331) through [src/compat/__tests__/MuPropertyBridge.test.ts](/Users/lifeart/Repos/openrv-web/src/compat/__tests__/MuPropertyBridge.test.ts#L356), so ambiguous multi-match behavior is unverified.
- Impact:
  - Mu-compatible scripts can read or overwrite the wrong property when multiple nodes happen to contain the same type token in their names.
  - That makes hash-path access nondeterministic at the API level, because the result depends on property insertion order rather than a stable graph identity rule.

### 257. Mu compat playback-health commands are marked supported but only expose hardcoded or never-updated local state

- Severity: Medium
- Area: Mu compatibility / playback telemetry
- Evidence:
  - `skipped()` returns the private `_skippedFrames` field, but production source search finds no non-test code that ever increments or synchronizes that field; it is only initialized to `0` in [src/compat/MuCommands.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuCommands.ts#L134) and read in [src/compat/MuCommands.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuCommands.ts#L301) through [src/compat/MuCommands.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuCommands.ts#L304).
  - `mbps()` likewise returns the private `_mbps` field, and `resetMbps()` only sets that same local field back to `0` in [src/compat/MuCommands.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuCommands.ts#L135) and [src/compat/MuCommands.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuCommands.ts#L321) through [src/compat/MuCommands.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuCommands.ts#L329); there is no non-test writer that records real throughput.
  - `isCurrentFrameIncomplete()`, `isCurrentFrameError()`, and `isBuffering()` are all marked supported in the command manifest in [src/compat/MuCommands.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuCommands.ts#L97) through [src/compat/MuCommands.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuCommands.ts#L100), but their implementations are hardcoded `false` in [src/compat/MuCommands.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuCommands.ts#L306) through [src/compat/MuCommands.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuCommands.ts#L319) despite the real app having buffering state in [src/core/session/SessionPlayback.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionPlayback.ts#L148), [src/core/session/PlaybackEngine.ts](/Users/lifeart/Repos/openrv-web/src/core/session/PlaybackEngine.ts#L371), and [src/core/session/Session.ts](/Users/lifeart/Repos/openrv-web/src/core/session/Session.ts#L616).
  - The compat tests explicitly validate the inert behavior: `skipped()` returns `0`, `mbps()` returns `0`, and the three health booleans return `false` in [src/compat/__tests__/MuCommands.test.ts](/Users/lifeart/Repos/openrv-web/src/compat/__tests__/MuCommands.test.ts#L295) through [src/compat/__tests__/MuCommands.test.ts](/Users/lifeart/Repos/openrv-web/src/compat/__tests__/MuCommands.test.ts#L315).
- Impact:
  - Mu-compatible scripts can query playback health and receive clean-looking values even while the real player is buffering, skipping frames, or experiencing decode issues.
  - That is more misleading than an unsupported-path warning because the API reports a valid state snapshot that never came from the actual playback engine.

### 258. Mu compat media-representation node APIs return fabricated node names that are never created in a real graph

- Severity: Medium
- Area: Mu compatibility / source representations
- Evidence:
  - `addSourceMediaRep(...)` synthesizes `nodeName = \`${sourceName}_${repName}_source\`` and `switchNodeName = \`${sourceName}_switch\`` and stores them only inside the local representation record in [src/compat/MuSourceBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuSourceBridge.ts#L573) through [src/compat/MuSourceBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuSourceBridge.ts#L595).
  - The method never creates corresponding nodes in a graph, never talks to `window.openrv`, and never wires representation switching into the live session.
  - `sourceMediaRepsAndNodes(...)`, `sourceMediaRepSwitchNode(...)`, and `sourceMediaRepSourceNode(...)` simply read back those stored string fields in [src/compat/MuSourceBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuSourceBridge.ts#L635) through [src/compat/MuSourceBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuSourceBridge.ts#L660).
  - The tests only assert that the returned strings contain the rep or switch names, not that those nodes actually exist anywhere in a graph or session in [src/compat/__tests__/MuSourceBridge.test.ts](/Users/lifeart/Repos/openrv-web/src/compat/__tests__/MuSourceBridge.test.ts#L507) through [src/compat/__tests__/MuSourceBridge.test.ts](/Users/lifeart/Repos/openrv-web/src/compat/__tests__/MuSourceBridge.test.ts#L615).
- Impact:
  - Mu-compatible scripts can receive plausible source-representation node names and then fail when they try to use them as real node identities.
  - That is especially misleading because the API shape implies graph-backed media-rep wiring, but the returned node IDs are only local placeholders.

### 259. Mu compat event-table BBox `tag` is accepted and stored but never participates in dispatch

- Severity: Medium
- Area: Mu compatibility / event dispatch
- Evidence:
  - `setEventTableBBox(tableName, tag, x, y, w, h)` stores the supplied `tag` alongside the bounding box in [src/compat/ModeManager.ts](/Users/lifeart/Repos/openrv-web/src/compat/ModeManager.ts#L142) through [src/compat/ModeManager.ts](/Users/lifeart/Repos/openrv-web/src/compat/ModeManager.ts#L150).
  - `dispatchEvent(...)` only checks the numeric rectangle and never reads or compares `bbox.tag` in [src/compat/ModeManager.ts](/Users/lifeart/Repos/openrv-web/src/compat/ModeManager.ts#L204) through [src/compat/ModeManager.ts](/Users/lifeart/Repos/openrv-web/src/compat/ModeManager.ts#L210).
  - `MuEventBridge.setEventTableBBox(...)` exposes that same `tag` parameter directly in [src/compat/MuEventBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuEventBridge.ts#L158) through [src/compat/MuEventBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuEventBridge.ts#L166).
  - The tests only verify inside/outside rectangle filtering and never exercise tag semantics in [src/compat/__tests__/MuEventBridge.test.ts](/Users/lifeart/Repos/openrv-web/src/compat/__tests__/MuEventBridge.test.ts#L273) through [src/compat/__tests__/MuEventBridge.test.ts](/Users/lifeart/Repos/openrv-web/src/compat/__tests__/MuEventBridge.test.ts#L310).
- Impact:
  - Mu-compatible code can pass a tag expecting tag-scoped hit testing and get no behavioral difference at all.
  - That makes the API misleading for any integration that relies on tagged regions rather than a single bare rectangle per event table.

### 260. Mu compat `wireDOMEvents()` double-registers listeners if called more than once on the same target

- Severity: Medium
- Area: Mu compatibility / DOM event wiring
- Evidence:
  - Each `wireDOMEvents(target)` call unconditionally adds fresh `keydown`, `keyup`, `pointerdown`, `pointerup`, `pointermove`, and `wheel` listeners to the target in [src/compat/MuEventBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuEventBridge.ts#L208) through [src/compat/MuEventBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuEventBridge.ts#L219).
  - The bridge keeps only cleanup callbacks in `domListenerCleanups`; it does not track which targets were already wired or deduplicate handlers in [src/compat/MuEventBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuEventBridge.ts#L15) through [src/compat/MuEventBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuEventBridge.ts#L16) and [src/compat/MuEventBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuEventBridge.ts#L208) through [src/compat/MuEventBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuEventBridge.ts#L220).
  - That means a second call on the same target will dispatch each DOM event twice until `dispose()` runs.
  - There is no compat test covering repeated `wireDOMEvents(...)` on the same element.
- Impact:
  - Mu-compatible integrations that reinitialize or rewire the same canvas/element can end up with duplicated key and pointer handling.
  - Because the failure mode is repeated event dispatch rather than an explicit error, it can look like random double-triggering in interactive tools.

### 261. Mu compat fullscreen helpers do not track the Safari/WebKit fullscreen path that the main app supports

- Severity: Medium
- Area: Mu compatibility / fullscreen control
- Evidence:
  - `MuCommands.fullScreenMode(...)` only calls the standard `requestFullscreen` / `exitFullscreen` methods and does not catch rejected fullscreen promises in [src/compat/MuCommands.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuCommands.ts#L391) through [src/compat/MuCommands.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuCommands.ts#L399).
  - `MuCommands.isFullScreen()` checks only `document.fullscreenElement` in [src/compat/MuCommands.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuCommands.ts#L401) through [src/compat/MuCommands.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuCommands.ts#L405).
  - `MuUtilsBridge.fullScreenMode(...)` at least catches promise rejection, but it also uses only the standard API and `MuUtilsBridge.isFullScreen()` likewise checks only `document.fullscreenElement` in [src/compat/MuUtilsBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuUtilsBridge.ts#L312) through [src/compat/MuUtilsBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuUtilsBridge.ts#L329).
  - The shipped app’s real fullscreen manager explicitly supports the WebKit-prefixed path and state via `webkitRequestFullscreen`, `webkitExitFullscreen`, and `webkitFullscreenElement` in [src/utils/ui/FullscreenManager.ts](/Users/lifeart/Repos/openrv-web/src/utils/ui/FullscreenManager.ts#L62) through [src/utils/ui/FullscreenManager.ts](/Users/lifeart/Repos/openrv-web/src/utils/ui/FullscreenManager.ts#L110).
- Impact:
  - Mu-compatible scripts can fail to enter fullscreen, or incorrectly think fullscreen is off, in Safari-like environments where the main app itself still handles fullscreen correctly.
  - On the `MuCommands` path, denied fullscreen can also surface as an unhandled promise rejection instead of a contained warning.

### 262. Mu compat active media-representation selection never changes what `sourceMedia()` or `sourceMediaInfo()` report

- Severity: Medium
- Area: Mu compatibility / source representations
- Evidence:
  - `setActiveSourceMediaRep(...)` only updates `source.activeRep` in [src/compat/MuSourceBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuSourceBridge.ts#L602) through [src/compat/MuSourceBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuSourceBridge.ts#L610).
  - `sourceMedia(...)` ignores `activeRep` and always returns `source.mediaPaths` from the base source record in [src/compat/MuSourceBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuSourceBridge.ts#L341) through [src/compat/MuSourceBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuSourceBridge.ts#L344).
  - `sourceMediaInfo(...)` likewise ignores `activeRep` and always reports `file: source.mediaPaths[0]` plus the base source dimensions/range in [src/compat/MuSourceBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuSourceBridge.ts#L350) through [src/compat/MuSourceBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuSourceBridge.ts#L381).
  - The tests confirm that active representation can be switched via `sourceMediaRep(name)` in [src/compat/__tests__/MuSourceBridge.test.ts](/Users/lifeart/Repos/openrv-web/src/compat/__tests__/MuSourceBridge.test.ts#L524) through [src/compat/__tests__/MuSourceBridge.test.ts](/Users/lifeart/Repos/openrv-web/src/compat/__tests__/MuSourceBridge.test.ts#L538), but there is no test that `sourceMedia(...)` or `sourceMediaInfo(...)` reflect that switch.
- Impact:
  - Mu-compatible scripts can switch a source to `proxy` or another representation and still have follow-up media queries report the old base media.
  - That breaks representation-aware workflows because the bridge advertises rep switching while its own read APIs continue to describe a different source state.

### 263. Mu compat `imagesAtPixel()` returns all rendered images, not just images under the queried point

- Severity: Medium
- Area: Mu compatibility / image-query scripting
- Evidence:
  - The API documentation says `imagesAtPixel(...)` should return “images under the point” in [src/compat/MuEvalBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuEvalBridge.ts#L226) through [src/compat/MuEvalBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuEvalBridge.ts#L234).
  - The implementation computes `inside` and `edge`, but then unconditionally pushes a result for every rendered image as long as `_screenToImage(...)` returns coordinates in [src/compat/MuEvalBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuEvalBridge.ts#L239) through [src/compat/MuEvalBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuEvalBridge.ts#L263).
  - That means a point far outside the image still returns that image with `inside: false`, which the current tests explicitly accept in [src/compat/__tests__/MuEvalBridge.test.ts](/Users/lifeart/Repos/openrv-web/src/compat/__tests__/MuEvalBridge.test.ts#L274) through [src/compat/__tests__/MuEvalBridge.test.ts](/Users/lifeart/Repos/openrv-web/src/compat/__tests__/MuEvalBridge.test.ts#L279).
  - On multi-image renders, the method will therefore report all images with projected coordinates rather than filtering to the actual hit set.
- Impact:
  - Mu-compatible hit-testing scripts can treat non-hit images as if they were returned by the query, unless they add their own extra filtering.
  - That makes the command semantically misleading because its name and docs promise a filtered hit result, but the implementation returns a per-image projection table instead.

### 264. Mu compat `imageGeometryByTag()` ignores the tag argument entirely

- Severity: Medium
- Area: Mu compatibility / image-query scripting
- Evidence:
  - `imageGeometryByTag(imageName, _tag)` explicitly comments that tags are not implemented and simply forwards to `imageGeometry(imageName)` in [src/compat/MuEvalBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuEvalBridge.ts#L305) through [src/compat/MuEvalBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuEvalBridge.ts#L307).
  - That means the `tag` parameter never influences the selected geometry, even though the API name and signature imply tag-based selection.
  - The current test only verifies that the method falls back to name-based lookup and does not check any tag distinction in [src/compat/__tests__/MuEvalBridge.test.ts](/Users/lifeart/Repos/openrv-web/src/compat/__tests__/MuEvalBridge.test.ts#L420) through [src/compat/__tests__/MuEvalBridge.test.ts](/Users/lifeart/Repos/openrv-web/src/compat/__tests__/MuEvalBridge.test.ts#L426).
- Impact:
  - Mu-compatible scripts cannot query per-tag image geometry even though the command surface suggests they can.
  - This is another silent semantic mismatch because callers can vary the tag and receive the same answer every time.

### 265. Mu compat `eventToImageSpace()` ignores its `useLocalCoords` flag

- Severity: Medium
- Area: Mu compatibility / coordinate transforms
- Evidence:
  - The method signature includes `_useLocalCoords = false` and the documentation describes it as controlling whether local coordinates are used in [src/compat/MuEvalBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuEvalBridge.ts#L313) through [src/compat/MuEvalBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuEvalBridge.ts#L319).
  - The implementation never branches on `_useLocalCoords`; it follows the same code path regardless of the flag value in [src/compat/MuEvalBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuEvalBridge.ts#L320) through [src/compat/MuEvalBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuEvalBridge.ts#L333).
  - There is no compat test covering differing outputs for `useLocalCoords = true` versus `false`.
- Impact:
  - Mu-compatible tools that expect local-coordinate conversion can pass `true` and still get the global/default coordinate behavior.
  - That can break overlay or node-local interaction logic because the flag is accepted but semantically inert.

### 266. Mu compat `sourcesAtFrame()` ignores the requested frame when it falls back to the current OpenRV source

- Severity: Medium
- Area: Mu compatibility / source queries
- Evidence:
  - `sourcesAtFrame(frame)` correctly filters local `SourceRecord`s against `startFrame` and `endFrame` in [src/compat/MuSourceBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuSourceBridge.ts#L158) through [src/compat/MuSourceBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuSourceBridge.ts#L167).
  - If no local source matches, the fallback path simply appends `getOpenRV().media.getCurrentSource().name` without comparing the requested frame to any duration or range in [src/compat/MuSourceBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuSourceBridge.ts#L169) through [src/compat/MuSourceBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuSourceBridge.ts#L178).
  - The mock current source used in tests even exposes a `duration` field, but the fallback path does not consult it in [src/compat/__tests__/MuSourceBridge.test.ts](/Users/lifeart/Repos/openrv-web/src/compat/__tests__/MuSourceBridge.test.ts#L6) through [src/compat/__tests__/MuSourceBridge.test.ts](/Users/lifeart/Repos/openrv-web/src/compat/__tests__/MuSourceBridge.test.ts#L22).
  - The existing fallback test only checks frame `1`, so the out-of-range behavior is untested in [src/compat/__tests__/MuSourceBridge.test.ts](/Users/lifeart/Repos/openrv-web/src/compat/__tests__/MuSourceBridge.test.ts#L71) through [src/compat/__tests__/MuSourceBridge.test.ts](/Users/lifeart/Repos/openrv-web/src/compat/__tests__/MuSourceBridge.test.ts#L74).
- Impact:
  - Mu-compatible scripts can ask which sources are active at an out-of-range frame and still be told that the current OpenRV source is active.
  - That makes the fallback semantics inconsistent with the local-source path and unreliable for timeline-aware tooling.

### 267. Mu compat `sourceMediaInfoList()` omits the same fallback current source that `sources()` exposes

- Severity: Medium
- Area: Mu compatibility / source queries
- Evidence:
  - `sources()` returns a fabricated fallback entry from `openrv.media.getCurrentSource()` when there are no local sources in [src/compat/MuSourceBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuSourceBridge.ts#L124) through [src/compat/MuSourceBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuSourceBridge.ts#L147).
  - `sourceMediaInfoList()` does not use that fallback path at all; it only maps over `this._sources.values()` in [src/compat/MuSourceBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuSourceBridge.ts#L389) through [src/compat/MuSourceBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuSourceBridge.ts#L393).
  - So in the “no local sources, but current OpenRV source exists” case, the bridge can report one source via `sources()` and zero sources via `sourceMediaInfoList()`.
  - The current tests cover local-source listing for `sourceMediaInfoList()`, but not its behavior in the fallback-only case in [src/compat/__tests__/MuSourceBridge.test.ts](/Users/lifeart/Repos/openrv-web/src/compat/__tests__/MuSourceBridge.test.ts#L284) through [src/compat/__tests__/MuSourceBridge.test.ts](/Users/lifeart/Repos/openrv-web/src/compat/__tests__/MuSourceBridge.test.ts#L292).
- Impact:
  - Mu-compatible scripts can get contradictory answers from adjacent source-listing APIs depending on whether they ask for names or info objects.
  - That inconsistency makes the fallback source model harder to consume and easy to mis-handle in integrations.

### 268. Mu compat fallback `sources()` entries put the source name in the `media` field instead of a media path

- Severity: Medium
- Area: Mu compatibility / source queries
- Evidence:
  - When no local sources exist, `sources()` returns a fallback object using `media: current.name` in [src/compat/MuSourceBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuSourceBridge.ts#L133) through [src/compat/MuSourceBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuSourceBridge.ts#L141).
  - The mocked `getCurrentSource()` payload used by the tests contains only metadata such as `name`, `type`, `width`, `height`, `duration`, and `fps`; it does not contain an actual media path in [src/compat/__tests__/MuSourceBridge.test.ts](/Users/lifeart/Repos/openrv-web/src/compat/__tests__/MuSourceBridge.test.ts#L6) through [src/compat/__tests__/MuSourceBridge.test.ts](/Users/lifeart/Repos/openrv-web/src/compat/__tests__/MuSourceBridge.test.ts#L22).
  - So the fallback `media` value is, by construction, not the same kind of data that locally tracked source entries return in their `media` field.
  - The current fallback test only asserts the returned `name` and does not validate the `media` field content in [src/compat/__tests__/MuSourceBridge.test.ts](/Users/lifeart/Repos/openrv-web/src/compat/__tests__/MuSourceBridge.test.ts#L43) through [src/compat/__tests__/MuSourceBridge.test.ts](/Users/lifeart/Repos/openrv-web/src/compat/__tests__/MuSourceBridge.test.ts#L48).
- Impact:
  - Mu-compatible scripts consuming `sources()` can interpret the fallback entry’s `media` value as a real path and then mis-handle it in file/path-based workflows.
  - This is another schema inconsistency inside the same API, because local entries expose media paths while fallback entries expose source identifiers.

### 269. Mu compat `setNodeInputs()` is not atomic and can leave a node partially rewired after a later connection failure

- Severity: Medium
- Area: Mu compatibility / node graph editing
- Evidence:
  - `setNodeInputs(name, inputNames)` resolves all input nodes first, then immediately disconnects all existing inputs via `node.disconnectAllInputs()` in [src/compat/MuNodeBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuNodeBridge.ts#L178) through [src/compat/MuNodeBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuNodeBridge.ts#L188).
  - It then connects the new inputs one by one in a loop, relying on `Graph.connect(...)` to detect cycles in [src/compat/MuNodeBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuNodeBridge.ts#L189) through [src/compat/MuNodeBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuNodeBridge.ts#L192).
  - `Graph.connect(...)` can throw `Connection would create a cycle` after earlier connections have already been applied in [src/core/graph/Graph.ts](/Users/lifeart/Repos/openrv-web/src/core/graph/Graph.ts#L57) through [src/core/graph/Graph.ts](/Users/lifeart/Repos/openrv-web/src/core/graph/Graph.ts#L68).
  - There is no rollback path to restore the original inputs if one of the later connections fails.
- Impact:
  - Mu-compatible scripts can attempt to replace a node’s inputs and end up with a partially applied graph mutation instead of either the old inputs or the full new set.
  - That makes graph editing brittle because a single invalid input in the requested set can silently destroy the previous connection layout before the method throws.

### 270. Mu compat `nodeConnections(..., traverseGroups)` ignores the `traverseGroups` flag

- Severity: Medium
- Area: Mu compatibility / node graph queries
- Evidence:
  - The API signature exposes `nodeConnections(name, traverseGroups)` and documents the second parameter as controlling whether group nodes are traversed in [src/compat/MuNodeBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuNodeBridge.ts#L152) through [src/compat/MuNodeBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuNodeBridge.ts#L159).
  - The implementation names that parameter `_traverseGroups` and never branches on it in [src/compat/MuNodeBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuNodeBridge.ts#L160) through [src/compat/MuNodeBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuNodeBridge.ts#L165).
  - So the method always returns the direct `node.inputs` and `node.outputs` lists, regardless of the caller’s traversal request.
  - The existing tests only cover the default direct-connection behavior and do not exercise `traverseGroups = true` in [src/compat/__tests__/MuNodeBridge.test.ts](/Users/lifeart/Repos/openrv-web/src/compat/__tests__/MuNodeBridge.test.ts#L134) through [src/compat/__tests__/MuNodeBridge.test.ts](/Users/lifeart/Repos/openrv-web/src/compat/__tests__/MuNodeBridge.test.ts#L148).
- Impact:
  - Mu-compatible scripts cannot use this API to flatten or traverse through group nodes even though the flag suggests they can.
  - That creates another silent semantic mismatch, because callers can pass `true` and receive the exact same answer as `false`.

### 271. Mu compat `imagesAtPixel()` ignores its `useStencil` flag

- Severity: Medium
- Area: Mu compatibility / image-query scripting
- Evidence:
  - The API signature exposes `imagesAtPixel(point, viewNodeName, useStencil)` and documents `useStencil` as controlling precise hit testing in [src/compat/MuEvalBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuEvalBridge.ts#L226) through [src/compat/MuEvalBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuEvalBridge.ts#L234).
  - The implementation names the parameter `_useStencil` and never branches on it anywhere in [src/compat/MuEvalBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuEvalBridge.ts#L235) through [src/compat/MuEvalBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuEvalBridge.ts#L266).
  - There is no compat test covering different behavior for `useStencil = true`.
- Impact:
  - Mu-compatible scripts can request stencil-accurate hit testing and still receive the same coarse projected result as the default path.
  - That is another silent no-op flag in the image-query API surface.

### 272. Mu compat `eventToCameraSpace()` ignores the supplied view-node argument

- Severity: Medium
- Area: Mu compatibility / coordinate transforms
- Evidence:
  - The method signature is `eventToCameraSpace(viewNodeName, eventPoint)` in [src/compat/MuEvalBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuEvalBridge.ts#L336) through [src/compat/MuEvalBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuEvalBridge.ts#L345).
  - The implementation names the parameter `_viewNodeName` and computes camera coordinates solely from the global `_viewTransform` in [src/compat/MuEvalBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuEvalBridge.ts#L346) through [src/compat/MuEvalBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuEvalBridge.ts#L355).
  - There is no branch that resolves or uses the named view node, and the tests call the method with an empty string rather than validating per-view-node behavior in [src/compat/__tests__/MuEvalBridge.test.ts](/Users/lifeart/Repos/openrv-web/src/compat/__tests__/MuEvalBridge.test.ts#L489) through [src/compat/__tests__/MuEvalBridge.test.ts](/Users/lifeart/Repos/openrv-web/src/compat/__tests__/MuEvalBridge.test.ts#L518).
- Impact:
  - Mu-compatible tools cannot query camera-space coordinates relative to a specific view node even though the method signature suggests they can.
  - In multi-view or graph-aware contexts, that makes the returned coordinates depend only on whatever global transform was last injected.

### 273. Mu settings helpers can throw in blocked-storage environments even though read/write paths are guarded

- Severity: Medium
- Area: Mu compatibility / settings persistence
- Evidence:
  - `readSetting(...)` and `writeSetting(...)` wrap `localStorage` access in `try/catch` in [src/compat/MuSettingsBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuSettingsBridge.ts#L23) through [src/compat/MuSettingsBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuSettingsBridge.ts#L55).
  - The rest of the API does not: `hasSetting(...)`, `removeSetting(...)`, `listSettings(...)`, `clearGroup(...)`, and `clearAll()` call `localStorage` directly with no protection in [src/compat/MuSettingsBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuSettingsBridge.ts#L60) through [src/compat/MuSettingsBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuSettingsBridge.ts#L123).
  - In browsers or privacy modes where storage access itself throws, the bridge therefore mixes “graceful fallback” behavior for some operations with hard exceptions for adjacent ones.
  - The compat tests only cover normal storage behavior and do not exercise blocked or throwing `localStorage` paths.
- Impact:
  - Mu-compatible integrations can see settings reads/writes quietly degrade while settings enumeration or removal crashes the bridge in the same environment.
  - That inconsistency makes storage failures harder to reason about and can break recovery/cleanup paths specifically when storage is already degraded.

### 274. Mu compat `sendInternalEvent()` discards handler-written `returnContents`

- Severity: Medium
- Area: Mu compatibility / event dispatch
- Evidence:
  - The `MuEvent` type explicitly includes a mutable `returnContents` field “for reject/accept signaling” in [src/compat/types.ts](/Users/lifeart/Repos/openrv-web/src/compat/types.ts#L15) through [src/compat/types.ts](/Users/lifeart/Repos/openrv-web/src/compat/types.ts#L25).
  - `MuEventBridge.sendInternalEvent(...)` creates an event object with `returnContents: ''`, dispatches it, and returns `void` in [src/compat/MuEventBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuEventBridge.ts#L191) through [src/compat/MuEventBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuEventBridge.ts#L200).
  - That means any handler mutation of `event.returnContents` is lost to the caller unless they bypass `MuEventBridge` and directly use `ModeManager.dispatchEvent(...)` with their own event object.
  - The current bridge tests validate only that `sendInternalEvent(...)` creates and dispatches the event object, not that any return payload can be observed by the caller in [src/compat/__tests__/MuEventBridge.test.ts](/Users/lifeart/Repos/openrv-web/src/compat/__tests__/MuEventBridge.test.ts#L341) through [src/compat/__tests__/MuEventBridge.test.ts](/Users/lifeart/Repos/openrv-web/src/compat/__tests__/MuEventBridge.test.ts#L424).
- Impact:
  - Mu-compatible code cannot use the public bridge to get reply data back from internal event handlers even though the event model advertises a return channel.
  - That turns `sendInternalEvent()` into a fire-and-forget dispatch path, which is a semantic mismatch for callers expecting request/response-style event handling.

### 275. `registerMuCompat()` is documented as a no-op on repeat calls but still returns fresh unmounted command objects each time

- Severity: Medium
- Area: Mu compatibility / bootstrap contract
- Evidence:
  - The function comment says repeated calls are safe and “subsequent calls are no-ops” in [src/compat/index.ts](/Users/lifeart/Repos/openrv-web/src/compat/index.ts#L35) through [src/compat/index.ts](/Users/lifeart/Repos/openrv-web/src/compat/index.ts#L40), and the public docs repeat the same promise in [docs/advanced/mu-compat.md](/Users/lifeart/Repos/openrv-web/docs/advanced/mu-compat.md#L12) through [docs/advanced/mu-compat.md](/Users/lifeart/Repos/openrv-web/docs/advanced/mu-compat.md#L16).
  - The implementation still constructs a brand new `MuCommands` and `MuExtraCommands` pair on every call in [src/compat/index.ts](/Users/lifeart/Repos/openrv-web/src/compat/index.ts#L42) through [src/compat/index.ts](/Users/lifeart/Repos/openrv-web/src/compat/index.ts#L53).
  - If `window.rv` already exists, the function leaves the global untouched but still returns the fresh pair, so the returned objects are not the mounted global compat instances in [src/compat/index.ts](/Users/lifeart/Repos/openrv-web/src/compat/index.ts#L46) through [src/compat/index.ts](/Users/lifeart/Repos/openrv-web/src/compat/index.ts#L50).
  - The tests verify only that an existing `window.rv` is not overwritten, not that repeat calls return the already-mounted objects in [src/compat/__tests__/MuCommands.test.ts](/Users/lifeart/Repos/openrv-web/src/compat/__tests__/MuCommands.test.ts#L734) through [src/compat/__tests__/MuCommands.test.ts](/Users/lifeart/Repos/openrv-web/src/compat/__tests__/MuCommands.test.ts#L740).
- Impact:
  - Integrations can call `registerMuCompat()` twice and receive a second compat object graph that is detached from the globally mounted `window.rv` namespace.
  - That breaks the documented “no-op” contract and can split state across multiple compat instances without the caller realizing it.

### 276. Mu compat async introspection says `fullScreenMode` is async, but the command does not actually return a Promise

- Severity: Medium
- Area: Mu compatibility / command introspection
- Evidence:
  - `MuCommands.isAsync(name)` reports `true` for `fullScreenMode` because `ASYNC_COMMANDS` contains that command name in [src/compat/MuCommands.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuCommands.ts#L126) through [src/compat/MuCommands.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuCommands.ts#L173).
  - The public docs reinforce that contract by saying `fullScreenMode()` returns a Promise internally and pointing callers to `commands.isAsync(name)` in [docs/advanced/mu-compat.md](/Users/lifeart/Repos/openrv-web/docs/advanced/mu-compat.md#L486) through [docs/advanced/mu-compat.md](/Users/lifeart/Repos/openrv-web/docs/advanced/mu-compat.md#L490).
  - The actual implementation of `MuCommands.fullScreenMode(...)` returns `void` and just fires the fullscreen calls without awaiting or returning their promises in [src/compat/MuCommands.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuCommands.ts#L391) through [src/compat/MuCommands.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuCommands.ts#L399).
  - The tests only validate that `isAsync('fullScreenMode')` is `true`; they do not check the runtime return value of `fullScreenMode(...)` in [src/compat/__tests__/MuCommands.test.ts](/Users/lifeart/Repos/openrv-web/src/compat/__tests__/MuCommands.test.ts#L135) through [src/compat/__tests__/MuCommands.test.ts](/Users/lifeart/Repos/openrv-web/src/compat/__tests__/MuCommands.test.ts#L140).
- Impact:
  - A caller can use the official introspection path, conclude that `fullScreenMode` is awaitable, and then receive `undefined` instead of a promise.
  - That makes the async-command contract unreliable exactly where the docs tell callers to depend on it.

### 278. `MediaCacheManager` claims graceful OPFS fallback, but browsers without `createWritable()` still initialize and then fail writes noisily

- Severity: Medium
- Area: Caching / storage fallback
- Evidence:
  - The class header says it is “Designed to degrade gracefully” and that when storage is unavailable “all public methods become safe no-ops” in [src/cache/MediaCacheManager.ts](/Users/lifeart/Repos/openrv-web/src/cache/MediaCacheManager.ts#L1) through [src/cache/MediaCacheManager.ts](/Users/lifeart/Repos/openrv-web/src/cache/MediaCacheManager.ts#L9).
  - `initialize()` succeeds as long as `navigator.storage.getDirectory()` and IndexedDB work; it does not probe `createWritable()` support before marking the manager initialized in [src/cache/MediaCacheManager.ts](/Users/lifeart/Repos/openrv-web/src/cache/MediaCacheManager.ts#L94) through [src/cache/MediaCacheManager.ts](/Users/lifeart/Repos/openrv-web/src/cache/MediaCacheManager.ts#L117).
  - Later, `put(...)` always calls `writeFile(...)`, and `writeFile(...)` throws `createWritable not supported` whenever the file handle lacks that method in [src/cache/MediaCacheManager.ts](/Users/lifeart/Repos/openrv-web/src/cache/MediaCacheManager.ts#L154) through [src/cache/MediaCacheManager.ts](/Users/lifeart/Repos/openrv-web/src/cache/MediaCacheManager.ts#L187) and [src/cache/MediaCacheManager.ts](/Users/lifeart/Repos/openrv-web/src/cache/MediaCacheManager.ts#L331) through [src/cache/MediaCacheManager.ts](/Users/lifeart/Repos/openrv-web/src/cache/MediaCacheManager.ts#L352).
  - The code comment even calls this branch a “fallback,” but the implementation is a hard failure rather than a no-op path.
- Impact:
  - On partial-OPFS environments, media caching can look initialized and then fail on every background write instead of cleanly disabling itself.
  - That creates repeated error churn and violates the cache layer’s advertised fallback contract.

### 301. RV/GTO import diagnostics for skipped nodes and degraded modes are emitted internally but never surfaced to users

- Severity: Medium
- Area: Session import / diagnostic visibility
- Evidence:
  - `SessionGraph` emits `skippedNodes` and `degradedModes` when RV/GTO import drops nodes or downgrades composite modes in [src/core/session/SessionGraph.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionGraph.ts#L396) through [src/core/session/SessionGraph.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionGraph.ts#L412).
  - The production persistence handlers only subscribe to `annotationsLoaded`, `sessionLoaded`, `frameChanged`, `inOutChanged`, `marksChanged`, `fpsChanged`, `paintEffectsLoaded`, `matteChanged`, `metadataChanged`, and `settingsLoaded` in [src/handlers/persistenceHandlers.ts](/Users/lifeart/Repos/openrv-web/src/handlers/persistenceHandlers.ts#L14) through [src/handlers/persistenceHandlers.ts](/Users/lifeart/Repos/openrv-web/src/handlers/persistenceHandlers.ts#L65).
  - The RV/GTO open path in [src/AppPersistenceManager.ts](/Users/lifeart/Repos/openrv-web/src/AppPersistenceManager.ts#L371) through [src/AppPersistenceManager.ts](/Users/lifeart/Repos/openrv-web/src/AppPersistenceManager.ts#L398) loads the session and resyncs some controls, but shows no success/warning summary for skipped nodes or degraded modes.
- Impact:
  - Users can import an RV/GTO session with known dropped nodes or downgraded blend modes and receive no UI-level indication that the import was lossy.
  - That makes session interchange failures harder to detect than they need to be, even though the loader already computes the exact diagnostics.

### 302. Media representation failures and automatic fallbacks are emitted internally, but the app never surfaces them

- Severity: Medium
- Area: Media representations / degraded-runtime visibility
- Evidence:
  - `MediaRepresentationManager` emits `representationError` when a representation load/switch fails and `fallbackActivated` when it silently moves to another representation in [src/core/session/MediaRepresentationManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/MediaRepresentationManager.ts#L212) through [src/core/session/MediaRepresentationManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/MediaRepresentationManager.ts#L223) and [src/core/session/MediaRepresentationManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/MediaRepresentationManager.ts#L252) through [src/core/session/MediaRepresentationManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/MediaRepresentationManager.ts#L263).
  - `SessionMedia` forwards both events onto the session in [src/core/session/SessionMedia.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionMedia.ts#L139) through [src/core/session/SessionMedia.ts#L146](/Users/lifeart/Repos/openrv-web/src/core/session/SessionMedia.ts#L146).
  - Production code subscribes to `representationChanged`, but a search finds no non-test subscriber for `representationError` or `fallbackActivated`; the live app hooks only `representationChanged` in [src/AppPlaybackWiring.ts](/Users/lifeart/Repos/openrv-web/src/AppPlaybackWiring.ts#L124) and [src/App.ts](/Users/lifeart/Repos/openrv-web/src/App.ts#L185).
- Impact:
  - If a preferred representation fails and the app falls back to another one, users get no visible indication that playback quality or source selection degraded.
  - That makes proxy/original/HDR representation problems harder to detect and diagnose than the underlying event model would allow.

### 303. Network Sync ignores `roomLeft`, so disconnect-driven room exits can leave stale room info in the panel

- Severity: Medium
- Area: Network sync / UI state truthfulness
- Evidence:
  - `NetworkSyncManager` emits `roomLeft` both on normal room exit and when a guest-side serverless/WebRTC peer disconnect tears the room down in [src/network/NetworkSyncManager.ts](/Users/lifeart/Repos/openrv-web/src/network/NetworkSyncManager.ts#L438) through [src/network/NetworkSyncManager.ts](/Users/lifeart/Repos/openrv-web/src/network/NetworkSyncManager.ts#L447) and [src/network/NetworkSyncManager.ts](/Users/lifeart/Repos/openrv-web/src/network/NetworkSyncManager.ts#L1348) through [src/network/NetworkSyncManager.ts](/Users/lifeart/Repos/openrv-web/src/network/NetworkSyncManager.ts#L1355).
  - `AppNetworkBridge` subscribes to `connectionStateChanged`, `roomCreated`, `roomJoined`, `usersChanged`, `error`, and `rttUpdated`, but not `roomLeft`, in [src/AppNetworkBridge.ts](/Users/lifeart/Repos/openrv-web/src/AppNetworkBridge.ts#L414) through [src/AppNetworkBridge.ts](/Users/lifeart/Repos/openrv-web/src/AppNetworkBridge.ts#L466).
  - The only place that explicitly clears room info and users in the UI is the direct `leaveRoom` click handler in [src/AppNetworkBridge.ts](/Users/lifeart/Repos/openrv-web/src/AppNetworkBridge.ts#L119) through [src/AppNetworkBridge.ts](/Users/lifeart/Repos/openrv-web/src/AppNetworkBridge.ts#L129), while `NetworkControl.setConnectionState(...)` does not clear `roomInfo` or `users` in [src/ui/components/NetworkControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/NetworkControl.ts#L985) through [src/ui/components/NetworkControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/NetworkControl.ts#L999) and [src/ui/components/NetworkControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/NetworkControl.ts#L1070) through [src/ui/components/NetworkControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/NetworkControl.ts#L1085).
- Impact:
  - If the room ends because of a remote/serverless disconnect instead of the local `Leave` button, the Network Sync UI can stay populated with stale room code, users, and share-link state while showing a disconnected connection state.
  - That makes collaboration teardown harder to understand and can mislead users into thinking they are still attached to the previous room context.

### 304. Playback buffering and decode-timeout diagnostics are emitted internally, but the app never surfaces them

- Severity: Medium
- Area: Playback / degraded-runtime visibility
- Evidence:
  - `PlaybackEngine` emits `buffering` and `frameDecodeTimeout` during starvation handling, and the code explicitly comments that buffering is emitted “so UI shows a loading indicator” in [src/core/session/PlaybackEngine.ts](/Users/lifeart/Repos/openrv-web/src/core/session/PlaybackEngine.ts#L813) through [src/core/session/PlaybackEngine.ts](/Users/lifeart/Repos/openrv-web/src/core/session/PlaybackEngine.ts#L824).
  - `SessionPlayback` forwards both events onto the session in [src/core/session/SessionPlayback.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionPlayback.ts#L603) through [src/core/session/SessionPlayback.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionPlayback.ts#L612).
  - The main session-event bridge only wires `frameChanged`, `sourceLoaded`, `unsupportedCodec`, and `playbackChanged`-driven updates in [src/AppSessionBridge.ts](/Users/lifeart/Repos/openrv-web/src/AppSessionBridge.ts#L124) through [src/AppSessionBridge.ts](/Users/lifeart/Repos/openrv-web/src/AppSessionBridge.ts#L180), and a production-code search finds no non-test subscriber for `buffering` or `frameDecodeTimeout`.
- Impact:
  - When playback stalls waiting for frames or skips an undecodable frame after a timeout, the app has no built-in loading/timeout feedback even though the engine already computes that state.
  - Users can experience frozen or degraded playback with no explanation beyond the image not advancing as expected.

### 305. `NetworkSyncManager` emits toast-style collaboration feedback, but the production app never consumes it

- Severity: Medium
- Area: Network sync / user feedback
- Evidence:
  - `NetworkSyncManager` emits `toastMessage` for state-sync timeouts, reconnect progress/outcomes, peer join/leave activity, and other collaboration feedback in [src/network/NetworkSyncManager.ts](/Users/lifeart/Repos/openrv-web/src/network/NetworkSyncManager.ts#L632) through [src/network/NetworkSyncManager.ts](/Users/lifeart/Repos/openrv-web/src/network/NetworkSyncManager.ts#L635), [src/network/NetworkSyncManager.ts](/Users/lifeart/Repos/openrv-web/src/network/NetworkSyncManager.ts#L764) through [src/network/NetworkSyncManager.ts](/Users/lifeart/Repos/openrv-web/src/network/NetworkSyncManager.ts#L794), and [src/network/NetworkSyncManager.ts](/Users/lifeart/Repos/openrv-web/src/network/NetworkSyncManager.ts#L958) through [src/network/NetworkSyncManager.ts](/Users/lifeart/Repos/openrv-web/src/network/NetworkSyncManager.ts#L980).
  - `AppNetworkBridge` only subscribes to `connectionStateChanged`, `roomCreated`, `roomJoined`, `usersChanged`, `error`, and `rttUpdated` in [src/AppNetworkBridge.ts](/Users/lifeart/Repos/openrv-web/src/AppNetworkBridge.ts#L414) through [src/AppNetworkBridge.ts](/Users/lifeart/Repos/openrv-web/src/AppNetworkBridge.ts#L466).
  - A production-code search finds no non-test subscriber for `toastMessage`, `userJoined`, or `userLeft`.
- Impact:
  - The collaboration stack generates useful runtime feedback like “connection lost,” “reconnected,” and “user joined,” but the shipped app drops it.
  - Users only see the low-level panel state mutate, with no transient explanation for reconnects, sync failures, or peer activity.

### 306. Media-cache failures are emitted internally, but the shipped app never surfaces them

- Severity: Medium
- Area: Media cache / degraded-runtime visibility
- Evidence:
  - `MediaCacheManager` advertises evented cache lifecycle/error reporting and emits `error`, `entryAdded`, and `cleared` from initialization, write, and clear paths in [src/cache/MediaCacheManager.ts](/Users/lifeart/Repos/openrv-web/src/cache/MediaCacheManager.ts#L1) through [src/cache/MediaCacheManager.ts](/Users/lifeart/Repos/openrv-web/src/cache/MediaCacheManager.ts#L9), [src/cache/MediaCacheManager.ts](/Users/lifeart/Repos/openrv-web/src/cache/MediaCacheManager.ts#L118) through [src/cache/MediaCacheManager.ts](/Users/lifeart/Repos/openrv-web/src/cache/MediaCacheManager.ts#L121), [src/cache/MediaCacheManager.ts](/Users/lifeart/Repos/openrv-web/src/cache/MediaCacheManager.ts#L182) through [src/cache/MediaCacheManager.ts](/Users/lifeart/Repos/openrv-web/src/cache/MediaCacheManager.ts#L187), and [src/cache/MediaCacheManager.ts](/Users/lifeart/Repos/openrv-web/src/cache/MediaCacheManager.ts#L252) through [src/cache/MediaCacheManager.ts](/Users/lifeart/Repos/openrv-web/src/cache/MediaCacheManager.ts#L255).
  - The app constructs the cache manager and only fire-and-forget initializes it with a debug log fallback in [src/App.ts](/Users/lifeart/Repos/openrv-web/src/App.ts#L710) through [src/App.ts](/Users/lifeart/Repos/openrv-web/src/App.ts#L713).
  - A production-code search finds no `cacheManager.on(...)` subscriber, and the only fuller cache UI (`CacheManagementPanel`) is itself documented as not mounted in production in [src/ui/components/CacheManagementPanel.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/CacheManagementPanel.ts#L1) through [src/ui/components/CacheManagementPanel.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/CacheManagementPanel.ts#L12).
- Impact:
  - If OPFS caching fails during init, writes, or cache clearing, the shipped app provides no user-facing signal that the cache is unavailable or malfunctioning.
  - That makes cache-backed reload/resilience behavior harder to trust or diagnose than the internal event model suggests.

### 307. The adaptive `FrameCacheController` subsystem is fully implemented but never instantiated in production

- Severity: Medium
- Area: Playback cache architecture
- Evidence:
  - `FrameCacheController` is described as the central frame-caching coordinator with region/lookahead modes, memory-pressure management, and pre-roll warm-up in [src/cache/FrameCacheController.ts](/Users/lifeart/Repos/openrv-web/src/cache/FrameCacheController.ts#L1) through [src/cache/FrameCacheController.ts](/Users/lifeart/Repos/openrv-web/src/cache/FrameCacheController.ts#L15).
  - Its companion config explicitly defines UI labels/tooltips and even a cache-mode cycle “for `Shift+C` keyboard shortcut” in [src/config/CacheConfig.ts](/Users/lifeart/Repos/openrv-web/src/config/CacheConfig.ts#L1) through [src/config/CacheConfig.ts](/Users/lifeart/Repos/openrv-web/src/config/CacheConfig.ts#L37) and [src/config/CacheConfig.ts](/Users/lifeart/Repos/openrv-web/src/config/CacheConfig.ts#L92) through [src/config/CacheConfig.ts](/Users/lifeart/Repos/openrv-web/src/config/CacheConfig.ts#L95).
  - A production-code search finds no `new FrameCacheController(...)` outside tests, and the shipped controls only create the simpler passive `CacheIndicator` in [src/services/controls/createPanelControls.ts](/Users/lifeart/Repos/openrv-web/src/services/controls/createPanelControls.ts#L71) through [src/services/controls/createPanelControls.ts](/Users/lifeart/Repos/openrv-web/src/services/controls/createPanelControls.ts#L72), which itself just reflects session/viewer cache stats and a clear button in [src/ui/components/CacheIndicator.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/CacheIndicator.ts#L1) through [src/ui/components/CacheIndicator.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/CacheIndicator.ts#L9) and [src/ui/components/CacheIndicator.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/CacheIndicator.ts#L169) through [src/ui/components/CacheIndicator.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/CacheIndicator.ts#L192).
- Impact:
  - The app carries a substantial adaptive frame-cache design, but the shipped runtime never actually turns it on.
  - That leaves cache modes, warm-up behavior, and memory-pressure coordination effectively test-only despite the surrounding config and UI-oriented metadata.

### 308. Collaboration permission roles affect sync behavior, but the shipped UI never reflects or enforces them locally

- Severity: Medium
- Area: Network sync / collaboration permissions
- Evidence:
  - `NetworkSyncManager` exposes real participant roles, defaults unknown users to `reviewer`, and uses `viewer` to suppress outgoing sync via `canUserSync(...)`, `sendAnnotationSync(...)`, and `sendNoteSync(...)` in [src/network/NetworkSyncManager.ts](/Users/lifeart/Repos/openrv-web/src/network/NetworkSyncManager.ts#L210) through [src/network/NetworkSyncManager.ts](/Users/lifeart/Repos/openrv-web/src/network/NetworkSyncManager.ts#L236) and [src/network/NetworkSyncManager.ts](/Users/lifeart/Repos/openrv-web/src/network/NetworkSyncManager.ts#L547) through [src/network/NetworkSyncManager.ts](/Users/lifeart/Repos/openrv-web/src/network/NetworkSyncManager.ts#L594).
  - Incoming host permission changes are applied and emitted as `participantPermissionChanged` in [src/network/NetworkSyncManager.ts](/Users/lifeart/Repos/openrv-web/src/network/NetworkSyncManager.ts#L1105) through [src/network/NetworkSyncManager.ts](/Users/lifeart/Repos/openrv-web/src/network/NetworkSyncManager.ts#L1113).
  - A production-code search finds no `participantPermissionChanged` subscriber in app wiring, and the visible network panel only renders a `Host` badge with no reviewer/viewer state or permission controls in [src/ui/components/NetworkControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/NetworkControl.ts#L1278) through [src/ui/components/NetworkControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/NetworkControl.ts#L1320).
- Impact:
  - A user can be downgraded to `viewer` and silently stop sending synced notes or annotations while the local UI still presents normal collaboration controls.
  - The permission system exists at the transport layer, but the shipped interface gives no clear indication of current role or why collaboration actions stopped propagating.

### 309. `SessionManager` is documented as a central session subsystem, but it is never instantiated in production

- Severity: Low
- Area: Session graph architecture
- Evidence:
  - `SessionManager` presents itself as the “Central orchestrator for graph mutations, view history, tree model, and media-graph bridge” in [src/core/session/SessionManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionManager.ts#L1) through [src/core/session/SessionManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionManager.ts#L7).
  - The docs-generation templates also present `SessionManager` as part of the session-system architecture and include its source file in the generated module set in [docs/scripts/lib/templates.ts](/Users/lifeart/Repos/openrv-web/docs/scripts/lib/templates.ts#L288) through [docs/scripts/lib/templates.ts](/Users/lifeart/Repos/openrv-web/docs/scripts/lib/templates.ts#L304) and [docs/scripts/modules.ts](/Users/lifeart/Repos/openrv-web/docs/scripts/modules.ts#L46) through [docs/scripts/modules.ts](/Users/lifeart/Repos/openrv-web/docs/scripts/modules.ts#L52).
  - A production-code search finds no `new SessionManager()` outside tests.
- Impact:
  - The repo carries a documented graph-mutation/view-history service that is effectively test-only in the shipped app.
  - That makes the published session architecture ahead of production wiring for any future graph-browser or view-history workflows that would depend on this manager.

### 310. Editing a multi-cut timeline collapses session `pingpong` looping into plain playlist looping

- Severity: Medium
- Area: Timeline editing / playback loop semantics
- Evidence:
  - Core session playback supports `once`, `loop`, and `pingpong` loop modes in [src/core/types/session.ts](/Users/lifeart/Repos/openrv-web/src/core/types/session.ts#L1) and [src/core/session/PlaybackEngine.ts](/Users/lifeart/Repos/openrv-web/src/core/session/PlaybackEngine.ts#L850) through [src/core/session/PlaybackEngine.ts](/Users/lifeart/Repos/openrv-web/src/core/session/PlaybackEngine.ts#L943).
  - When `TimelineEditorService` applies edits that produce multiple cuts, it hands playback over to `PlaylistManager` and maps the session loop mode with `const mappedMode = this.session.loopMode === 'once' ? 'none' : 'all'` in [src/services/TimelineEditorService.ts](/Users/lifeart/Repos/openrv-web/src/services/TimelineEditorService.ts#L410) through [src/services/TimelineEditorService.ts](/Users/lifeart/Repos/openrv-web/src/services/TimelineEditorService.ts#L412).
  - `PlaylistManager` only supports `none`, `single`, and `all` in [src/core/session/PlaylistManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/PlaylistManager.ts#L52) and [src/core/session/PlaylistManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/PlaylistManager.ts#L486).
- Impact:
  - If a user is in `pingpong` loop mode and then edits or creates a multi-cut timeline, playback silently degrades to simple wraparound looping.
  - That changes loop behavior as a side effect of editing structure, not of any explicit loop-mode choice by the user.

### 311. RVEDL entries with unmatched source paths are silently rebound to loaded source `0`

- Severity: Medium
- Area: RVEDL import / timeline source mapping
- Evidence:
  - `TimelineEditorService.buildEDLFromRVEDLEntries(...)` resolves RVEDL source paths by basename against loaded sources in [src/services/TimelineEditorService.ts](/Users/lifeart/Repos/openrv-web/src/services/TimelineEditorService.ts#L220) through [src/services/TimelineEditorService.ts](/Users/lifeart/Repos/openrv-web/src/services/TimelineEditorService.ts#L249).
  - When no match is found, it explicitly falls back to `sourceIndex = 0` “so the cut structure is still visible” in [src/services/TimelineEditorService.ts](/Users/lifeart/Repos/openrv-web/src/services/TimelineEditorService.ts#L251) through [src/services/TimelineEditorService.ts](/Users/lifeart/Repos/openrv-web/src/services/TimelineEditorService.ts#L252).
  - The resulting mapped EDL is then loaded straight into the timeline editor as if it were resolved successfully in [src/services/TimelineEditorService.ts](/Users/lifeart/Repos/openrv-web/src/services/TimelineEditorService.ts#L348) through [src/services/TimelineEditorService.ts](/Users/lifeart/Repos/openrv-web/src/services/TimelineEditorService.ts#L353).
- Impact:
  - An RVEDL that references media the app cannot actually match will still render a timeline, but those cuts can point at the wrong loaded source instead of remaining visibly unresolved.
  - That makes timeline review look superficially successful while silently corrupting clip-to-media mapping.

### 312. Imported RVEDL cuts are ignored whenever the session already has playlist clips

- Severity: Medium
- Area: RVEDL import / timeline precedence
- Evidence:
  - `SessionGraph.loadEDL(...)` stores RVEDL entries and emits `edlLoaded` in [src/core/session/SessionGraph.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionGraph.ts#L244) through [src/core/session/SessionGraph.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionGraph.ts#L259).
  - `TimelineEditorService.syncFromGraph()` checks playlist clips before it checks `session.edlEntries`; if any playlist clips exist, it immediately loads those and returns in [src/services/TimelineEditorService.ts](/Users/lifeart/Repos/openrv-web/src/services/TimelineEditorService.ts#L334) through [src/services/TimelineEditorService.ts](/Users/lifeart/Repos/openrv-web/src/services/TimelineEditorService.ts#L345).
  - The RVEDL branch only runs afterward, in [src/services/TimelineEditorService.ts](/Users/lifeart/Repos/openrv-web/src/services/TimelineEditorService.ts#L348) through [src/services/TimelineEditorService.ts](/Users/lifeart/Repos/openrv-web/src/services/TimelineEditorService.ts#L353).
- Impact:
  - If a user imports an RVEDL into a session that already has playlist clips, the timeline editor continues to show the old playlist structure instead of the newly imported edit list.
  - That makes RVEDL import feel ineffective or broken in exactly the scenarios where users are likely comparing or replacing an existing cut structure.

### 313. Shot status tracking exists in session/export code, but the shipped app exposes no real status UI

- Severity: Medium
- Area: Review workflow / status tracking
- Evidence:
  - The session layer ships a real `StatusManager` with per-source status state, counts, colors, serialization, and change callbacks in [src/core/session/StatusManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/StatusManager.ts#L1) through [src/core/session/StatusManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/StatusManager.ts#L190).
  - Production consumers are effectively limited to export and ShotGrid integration: `generateReport(...)` reads `session.statusManager` in [src/AppPlaybackWiring.ts](/Users/lifeart/Repos/openrv-web/src/AppPlaybackWiring.ts#L293), and ShotGrid push/pull maps statuses through [src/integrations/ShotGridIntegrationBridge.ts](/Users/lifeart/Repos/openrv-web/src/integrations/ShotGridIntegrationBridge.ts#L182) through [src/integrations/ShotGridIntegrationBridge.ts#L247).
  - A production-code search finds no real UI code using `session.statusManager`, `getStatus(...)`, or `setStatus(...)` in the shipped header, QC tab, or source panels, while the QC toolbar itself only mounts scopes/analysis/pixel-probe controls in [src/services/tabContent/buildQCTab.ts](/Users/lifeart/Repos/openrv-web/src/services/tabContent/buildQCTab.ts#L17) through [src/services/tabContent/buildQCTab.ts#L130).
  - The current docs and UI overview still describe shot-status controls as part of QC/review flow in [docs/advanced/review-workflow.md](/Users/lifeart/Repos/openrv-web/docs/advanced/review-workflow.md#L22) through [docs/advanced/review-workflow.md#L26) and [docs/getting-started/ui-overview.md](/Users/lifeart/Repos/openrv-web/docs/getting-started/ui-overview.md#L71).
- Impact:
  - Users can load, save, export, and even sync status data indirectly, but they cannot actually set or inspect shot status through the shipped app UI.
  - That leaves a core review-workflow feature implemented underneath the app yet unavailable in the normal production workflow.

### 314. Version management is implemented underneath the session layer, but the shipped app never wires it to UI or auto-detection

- Severity: Medium
- Area: Review workflow / version management
- Evidence:
  - `VersionManager` implements grouping, next/previous navigation, active-version switching, and filename-based auto-detection in [src/core/session/VersionManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/VersionManager.ts#L1) through [src/core/session/VersionManager.ts#L349).
  - The auto-detection entry point `autoDetectGroups(...)` exists in [src/core/session/VersionManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/VersionManager.ts#L273) through [src/core/session/VersionManager.ts#L324), but a production-code search finds no caller outside the manager itself.
  - The only live consumers of version groups are export/report serialization paths such as [src/export/ReportExporter.ts](/Users/lifeart/Repos/openrv-web/src/export/ReportExporter.ts#L120) through [src/export/ReportExporter.ts#L129) and session save/load in [src/core/session/SessionSerializer.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionSerializer.ts#L372) through [src/core/session/SessionSerializer.ts#L376) and [src/core/session/SessionSerializer.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionSerializer.ts#L574) through [src/core/session/SessionSerializer.ts#L577).
  - A production-code search finds no header/QC/source-panel UI that calls `getGroups()`, `getGroupForSource()`, `nextVersion()`, `previousVersion()`, or `setActiveVersion(...)`, even though the shipped docs still promise a header-bar version selector and version list in [docs/advanced/review-workflow.md](/Users/lifeart/Repos/openrv-web/docs/advanced/review-workflow.md#L36) through [docs/advanced/review-workflow.md#L40).
- Impact:
  - Version groups can exist in saved state and reports, but the production app never auto-detects them from filenames and never exposes navigation or selection controls.
  - That makes version management effectively a persistence/export-only subsystem instead of a usable review feature.

### 315. Project restore does not clear old RVEDL state when the new project has no EDL entries

- Severity: Medium
- Area: Project restore / RVEDL state
- Evidence:
  - `.orvproject` save only serializes `edlEntries` when the current session has at least one entry in [src/core/session/SessionSerializer.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionSerializer.ts#L372) through [src/core/session/SessionSerializer.ts#L375).
  - Project load clears media with `session.clearSources()` in [src/core/session/SessionSerializer.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionSerializer.ts#L446) through [src/core/session/SessionSerializer.ts#L447), but `Session.clearSources()` only delegates to media clearing in [src/core/session/Session.ts](/Users/lifeart/Repos/openrv-web/src/core/session/Session.ts#L1208) through [src/core/session/Session.ts#L1214) and does not reset `edlEntries`.
  - Restore only calls `session.setEdlEntries(...)` when `migrated.edlEntries.length > 0` in [src/core/session/SessionSerializer.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionSerializer.ts#L584) through [src/core/session/SessionSerializer.ts#L587).
  - The underlying session graph explicitly stores RVEDL state separately in `_edlEntries` and only clears it when its own `clear()` path runs in [src/core/session/SessionGraph.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionGraph.ts#L202) through [src/core/session/SessionGraph.ts#L221).
- Impact:
  - Loading a project with no RVEDL data after a session that had imported EDL cuts can leave the old edit list hanging around in session state.
  - That creates another stale-state path where the newly loaded project does not fully replace the previous editorial context.

### 316. Review notes do not support priority or category, so the richer dailies workflow is impossible in the shipped app

- Severity: Medium
- Area: Notes / review workflow
- Evidence:
  - The shipped review-workflow guide describes notes with priority, category, and category-based report statistics in [docs/advanced/review-workflow.md](/Users/lifeart/Repos/openrv-web/docs/advanced/review-workflow.md#L64) through [docs/advanced/review-workflow.md](/Users/lifeart/Repos/openrv-web/docs/advanced/review-workflow.md#L68) and [docs/advanced/review-workflow.md](/Users/lifeart/Repos/openrv-web/docs/advanced/review-workflow.md#L106) through [docs/advanced/review-workflow.md](/Users/lifeart/Repos/openrv-web/docs/advanced/review-workflow.md#L111).
  - The actual `Note` model only stores `text`, `author`, frame range, status, reply parent, and color in [src/core/session/NoteManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/NoteManager.ts#L8) through [src/core/session/NoteManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/NoteManager.ts#L23), and the CRUD surface only updates `text`, `status`, or `color` in [src/core/session/NoteManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/NoteManager.ts#L71) through [src/core/session/NoteManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/NoteManager.ts#L120).
  - The shipped `NotePanel` only renders frame, status, author, text, and reply/edit/delete actions; there is no priority/category display or editor in [src/ui/components/NotePanel.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/NotePanel.ts#L522) through [src/ui/components/NotePanel.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/NotePanel.ts#L728).
  - Report generation only pulls raw note text arrays per source in [src/export/ReportExporter.ts](/Users/lifeart/Repos/openrv-web/src/export/ReportExporter.ts#L137) through [src/export/ReportExporter.ts](/Users/lifeart/Repos/openrv-web/src/export/ReportExporter.ts#L164), so there is no data available for category rollups.
- Impact:
  - Reviewers cannot tag notes by department/severity, and supervisors cannot produce the category-based dailies summaries the workflow describes.
  - The shipped note system is materially simpler than the advertised review process, which limits its usefulness in actual production review sessions.

### 317. Review-status semantics are lossy: several documented production states collapse into unrelated local values

- Severity: Medium
- Area: Review workflow / status semantics
- Evidence:
  - The review-workflow guide defines six user-meaningful states: `Pending`, `In Review`, `Revisions Needed`, `Approved`, `Final`, and `On Hold` in [docs/advanced/review-workflow.md](/Users/lifeart/Repos/openrv-web/docs/advanced/review-workflow.md#L11) through [docs/advanced/review-workflow.md](/Users/lifeart/Repos/openrv-web/docs/advanced/review-workflow.md#L20).
  - The actual session layer only supports five different local values: `pending`, `approved`, `needs-work`, `cbb`, and `omit` in [src/core/session/StatusManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/StatusManager.ts#L4) through [src/core/session/StatusManager.ts#L37).
  - ShotGrid integration further collapses multiple upstream statuses into those local buckets in [src/integrations/ShotGridBridge.ts](/Users/lifeart/Repos/openrv-web/src/integrations/ShotGridBridge.ts#L93) through [src/integrations/ShotGridBridge.ts#L103):
    `fin -> approved`, `ip -> pending`, `hld -> pending`, `wtg -> pending`, and `vwd -> approved`.
- Impact:
  - Distinct production-review meanings like “final”, “in progress”, and “on hold” cannot survive a local OpenRV Web round-trip as distinct statuses.
  - That makes status-based review/export/sync workflows semantically weaker than the app and docs suggest, even before the missing status UI is addressed.

### 318. Dailies report export ignores playlist structure and always reports every loaded source

- Severity: Medium
- Area: Reports / playlist review workflow
- Evidence:
  - The documented dailies workflow says to load shots as a playlist, review them, then generate a report in [docs/advanced/review-workflow.md](/Users/lifeart/Repos/openrv-web/docs/advanced/review-workflow.md#L97) through [docs/advanced/review-workflow.md](/Users/lifeart/Repos/openrv-web/docs/advanced/review-workflow.md#L113).
  - The production export path wires `reportExportRequested` straight to `generateReport(session, session.noteManager, session.statusManager, session.versionManager, ...)` with no playlist input in [src/AppPlaybackWiring.ts](/Users/lifeart/Repos/openrv-web/src/AppPlaybackWiring.ts#L292) through [src/AppPlaybackWiring.ts#L300).
  - `buildReportRows(...)` then iterates `for (let i = 0; i < session.sourceCount; i++)` and builds one row per loaded source from `session.getSourceByIndex(i)` in [src/export/ReportExporter.ts](/Users/lifeart/Repos/openrv-web/src/export/ReportExporter.ts#L105) through [src/export/ReportExporter.ts#L167).
- Impact:
  - A dailies report cannot honor playlist order, omitted shots, repeated comparison clips, or a curated review subset; it just exports the whole loaded source set.
  - That makes reports diverge from the actual session the reviewer just stepped through whenever playlist structure matters.

### 319. Dailies reports omit core session metadata and the category-based summary the workflow promises

- Severity: Medium
- Area: Reports / review workflow
- Evidence:
  - The review-workflow guide says dailies reports include “Session date, supervisor name, and project identifier” plus “Statistics: total shots reviewed, approval rate, revision counts by category” in [docs/advanced/review-workflow.md](/Users/lifeart/Repos/openrv-web/docs/advanced/review-workflow.md#L106) through [docs/advanced/review-workflow.md](/Users/lifeart/Repos/openrv-web/docs/advanced/review-workflow.md#L111).
  - The actual `ReportOptions` only carry `title` and optional `dateRange` in [src/export/ReportExporter.ts](/Users/lifeart/Repos/openrv-web/src/export/ReportExporter.ts#L30) through [src/export/ReportExporter.ts#L37), and the production call site passes only `format`, `include*` flags, and `title` in [src/AppPlaybackWiring.ts](/Users/lifeart/Repos/openrv-web/src/AppPlaybackWiring.ts#L292) through [src/AppPlaybackWiring.ts#L299).
  - HTML generation only renders the title, optional `dateRange`, and a simple count-by-status summary in [src/export/ReportExporter.ts](/Users/lifeart/Repos/openrv-web/src/export/ReportExporter.ts#L239) through [src/export/ReportExporter.ts#L249) and [src/export/ReportExporter.ts](/Users/lifeart/Repos/openrv-web/src/export/ReportExporter.ts#L294) through [src/export/ReportExporter.ts#L296).
- Impact:
  - Exported dailies reports cannot capture who ran the session, what project it belonged to, or any category-based review statistics.
  - That makes the generated reports much less useful for real production circulation than the workflow suggests.

### 320. Dailies reports flatten notes to raw text and lose per-note frame/timecode context

- Severity: Medium
- Area: Reports / notes export
- Evidence:
  - The workflow describes note exports as formatted reports with “timecodes and note text” in [docs/advanced/review-workflow.md](/Users/lifeart/Repos/openrv-web/docs/advanced/review-workflow.md#L83) through [docs/advanced/review-workflow.md](/Users/lifeart/Repos/openrv-web/docs/advanced/review-workflow.md#L89).
  - `buildReportRows(...)` only reads `noteManager.getNotesForSource(i).map((n) => n.text)` in [src/export/ReportExporter.ts](/Users/lifeart/Repos/openrv-web/src/export/ReportExporter.ts#L137) through [src/export/ReportExporter.ts#L139), so note frame ranges, authors, timestamps, and threading never enter the report model.
  - CSV and HTML export then serialize those notes as a single joined text field per source in [src/export/ReportExporter.ts](/Users/lifeart/Repos/openrv-web/src/export/ReportExporter.ts#L196) through [src/export/ReportExporter.ts#L210) and [src/export/ReportExporter.ts](/Users/lifeart/Repos/openrv-web/src/export/ReportExporter.ts#L252) through [src/export/ReportExporter.ts#L269).
- Impact:
  - The exported report cannot tell artists which exact frame or timecode a specific note belongs to once multiple notes exist on the same source.
  - That reduces the report from a timecoded review artifact to a per-shot text dump, which is much less actionable in production.

### 321. Version-manager navigation is a no-op at runtime because active-version changes never switch the session source

- Severity: Medium
- Area: Version management / session behavior
- Evidence:
  - `VersionManager.nextVersion(...)`, `previousVersion(...)`, and `setActiveVersion(...)` all invoke the `onActiveVersionChanged(...)` callback after updating internal state in [src/core/session/VersionManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/VersionManager.ts#L191) through [src/core/session/VersionManager.ts#L232).
  - `SessionAnnotations` wires that callback to an explicit no-op with the comment “Can be extended for source switching in future” in [src/core/session/SessionAnnotations.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionAnnotations.ts#L37) through [src/core/session/SessionAnnotations.ts#L42).
  - The session only re-emits a generic `versionsChanged` event in [src/core/session/Session.ts](/Users/lifeart/Repos/openrv-web/src/core/session/Session.ts#L316) through [src/core/session/Session.ts#L329); there is no production caller that translates active-version changes into `session.setCurrentSource(...)`.
- Impact:
  - Even if version navigation were exposed through UI, scripting, or future automation, changing the active version group state would not actually change the displayed media.
  - That leaves the version subsystem internally inconsistent: it can record an “active” version without the viewer ever following it.

### 322. ShotGrid version loading never feeds the app’s own version-management system

- Severity: Medium
- Area: ShotGrid integration / version management
- Evidence:
  - When a ShotGrid version is loaded, the integration bridge only loads the media, records a panel-local `versionId -> sourceIndex` mapping, and applies status via `session.statusManager.setStatus(...)` in [src/integrations/ShotGridIntegrationBridge.ts](/Users/lifeart/Repos/openrv-web/src/integrations/ShotGridIntegrationBridge.ts#L171) through [src/integrations/ShotGridIntegrationBridge.ts#L184).
  - The `ShotGridPanel` stores those mappings only in its own `versionSourceMap` / `sourceVersionMap` in [src/ui/components/ShotGridPanel.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/ShotGridPanel.ts#L53) through [src/ui/components/ShotGridPanel.ts#L55) and [src/ui/components/ShotGridPanel.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/ShotGridPanel.ts#L256) through [src/ui/components/ShotGridPanel.ts#L266).
  - A production-code search finds no call from the ShotGrid flow into `session.versionManager`, `createGroup(...)`, `addVersionToGroup(...)`, or `autoDetectGroups(...)`.
- Impact:
  - ShotGrid can surface and load multiple versions of the same shot, but those versions remain isolated inside the ShotGrid panel instead of becoming first-class OpenRV Web version groups.
  - That means report/export/version-navigation features built around `VersionManager` never benefit from the versions users actually loaded through the production tracking integration.

### 323. ShotGrid playlist loading is not real playlist sync; it only fills the browser panel

- Severity: Medium
- Area: ShotGrid integration / playlist workflow
- Evidence:
  - The integration guide says “ShotGrid playlists can be imported into OpenRV Web as review playlists, maintaining clip order and metadata” in [docs/advanced/dcc-integration.md](/Users/lifeart/Repos/openrv-web/docs/advanced/dcc-integration.md#L104) through [docs/advanced/dcc-integration.md#L109).
  - The actual `loadPlaylist` flow only fetches versions and calls `panel.setVersions(versions)` in [src/integrations/ShotGridIntegrationBridge.ts](/Users/lifeart/Repos/openrv-web/src/integrations/ShotGridIntegrationBridge.ts#L115) through [src/integrations/ShotGridIntegrationBridge.ts#L131).
  - A production-code search finds no ShotGrid path that calls `playlistManager`, `replaceClips(...)`, `addClip(...)`, or similar playlist runtime APIs.
- Impact:
  - Entering a ShotGrid playlist ID does not build an OpenRV Web review playlist; it just populates the ShotGrid side panel with version rows.
  - Users still have to load versions manually one by one, so clip order and review-playlist semantics are not actually imported.

### 324. The ShotGrid panel does not support the advertised “paste a version URL” workflow

- Severity: Medium
- Area: ShotGrid integration / UX contract
- Evidence:
  - The integration guide says users can load versions “by pasting a version URL or using the ShotGrid panel” in [docs/advanced/dcc-integration.md](/Users/lifeart/Repos/openrv-web/docs/advanced/dcc-integration.md#L102) through [docs/advanced/dcc-integration.md#L106).
  - The shipped `ShotGridPanel` only supports two query modes, `playlist` and `shot`, toggled in [src/ui/components/ShotGridPanel.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/ShotGridPanel.ts#L331) through [src/ui/components/ShotGridPanel.ts#L335).
  - Its load handler parses the input strictly as a positive integer ID and rejects anything else as invalid in [src/ui/components/ShotGridPanel.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/ShotGridPanel.ts#L337) through [src/ui/components/ShotGridPanel.ts#L359).
- Impact:
  - A real ShotGrid version URL cannot be pasted into the shipped panel even though that is presented as a supported workflow.
  - Users have to manually extract numeric IDs and also cannot query versions directly, only playlists or shots.

### 325. ShotGrid note publishing sends only plain note text, not annotations or thumbnails

- Severity: Medium
- Area: ShotGrid integration / note publishing
- Evidence:
  - The integration guide describes “Publish review notes and annotations ... with frame references and thumbnails” in [docs/advanced/dcc-integration.md](/Users/lifeart/Repos/openrv-web/docs/advanced/dcc-integration.md#L104) through [docs/advanced/dcc-integration.md#L107).
  - The production `pushNotes` flow iterates `session.noteManager.getNotesForSource(sourceIndex)` and calls `bridge.pushNote(...)` with only `text` and an optional `frameRange` in [src/integrations/ShotGridIntegrationBridge.ts](/Users/lifeart/Repos/openrv-web/src/integrations/ShotGridIntegrationBridge.ts#L192) through [src/integrations/ShotGridIntegrationBridge.ts#L224).
  - `ShotGridBridge.pushNote(...)` only serializes `subject`, `content`, and `frame_range` into the REST payload in [src/integrations/ShotGridBridge.ts](/Users/lifeart/Repos/openrv-web/src/integrations/ShotGridBridge.ts#L266) through [src/integrations/ShotGridBridge.ts#L299).
  - The path never reads from the annotation store, never renders thumbnails, and never uploads attachments.
- Impact:
  - Users who rely on annotated frames or visual context cannot actually publish that review artifact back to ShotGrid from the shipped app.
  - The current integration behaves like plain text note posting, which is much less useful than the advertised review-to-tracking workflow.

### 326. The published DCC inbound command set overstates what the bridge actually understands

- Severity: Medium
- Area: DCC integration / protocol contract
- Evidence:
  - The DCC integration guide documents inbound commands `load`, `seek`, `setFrameRange`, `setMetadata`, `setColorSpace`, and `ping` in [docs/advanced/dcc-integration.md](/Users/lifeart/Repos/openrv-web/docs/advanced/dcc-integration.md#L68) through [docs/advanced/dcc-integration.md](/Users/lifeart/Repos/openrv-web/docs/advanced/dcc-integration.md#L80).
  - The actual bridge protocol only defines inbound message types `loadMedia`, `syncFrame`, `syncColor`, and `ping` in [src/integrations/DCCBridge.ts](/Users/lifeart/Repos/openrv-web/src/integrations/DCCBridge.ts#L11) through [src/integrations/DCCBridge.ts#L26).
  - Runtime dispatch in `DCCBridge.handleMessage(...)` only routes those four message types and rejects everything else as `UNKNOWN_TYPE` in [src/integrations/DCCBridge.ts](/Users/lifeart/Repos/openrv-web/src/integrations/DCCBridge.ts#L395) through [src/integrations/DCCBridge.ts#L418).
  - `AppDCCWiring` likewise only subscribes to `loadMedia`, `syncFrame`, and `syncColor` in [src/AppDCCWiring.ts](/Users/lifeart/Repos/openrv-web/src/AppDCCWiring.ts#L84) through [src/AppDCCWiring.ts#L141).
- Impact:
  - Real DCC clients following the published contract for frame-range, metadata, or color-space commands will hit unsupported-message errors instead of getting the documented behavior.
  - That blocks several advertised roundtrip workflows such as pushing shot context, frame ranges, or input color metadata from Maya/Nuke/Houdini into the viewer.

### 327. DCC status roundtrip is documented, but the shipped bridge has no `statusChanged` message path

- Severity: Medium
- Area: DCC integration / status sync
- Evidence:
  - The DCC integration guide documents outbound `statusChanged` messages from the viewer in [docs/advanced/dcc-integration.md](/Users/lifeart/Repos/openrv-web/docs/advanced/dcc-integration.md#L85) through [docs/advanced/dcc-integration.md](/Users/lifeart/Repos/openrv-web/docs/advanced/dcc-integration.md#L96).
  - The actual outbound protocol only defines `frameChanged`, `colorChanged`, `annotationAdded`, `pong`, and `error` in [src/integrations/DCCBridge.ts](/Users/lifeart/Repos/openrv-web/src/integrations/DCCBridge.ts#L22) through [src/integrations/DCCBridge.ts#L27) and [src/integrations/DCCBridge.ts](/Users/lifeart/Repos/openrv-web/src/integrations/DCCBridge.ts#L75) through [src/integrations/DCCBridge.ts#L117).
  - `AppDCCWiring` only forwards `session.frameChanged` and `colorControls.adjustmentsChanged` in [src/AppDCCWiring.ts](/Users/lifeart/Repos/openrv-web/src/AppDCCWiring.ts#L143) through [src/AppDCCWiring.ts#L162); it never subscribes to `session.statusChanged`.
- Impact:
  - A DCC tool cannot rely on OpenRV Web to push review-status changes back over the live bridge, even though that workflow is presented as supported.
  - Any pipeline expecting browser-driven approval or needs-revision updates to flow back into a DCC-side review context will silently get nothing.

### 328. The shipped note workflow only exports JSON, despite the UI/docs presenting HTML and CSV note exports

- Severity: Medium
- Area: Notes / export workflow
- Evidence:
  - The review-workflow guide says notes can be exported as HTML, CSV, and JSON in [docs/advanced/review-workflow.md](/Users/lifeart/Repos/openrv-web/docs/advanced/review-workflow.md#L83) through [docs/advanced/review-workflow.md](/Users/lifeart/Repos/openrv-web/docs/advanced/review-workflow.md#L89).
  - The actual `NotePanel` only exposes `Export` / `Import` buttons for JSON and its export implementation is explicitly “Export all notes to a JSON file download” in [src/ui/components/NotePanel.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/NotePanel.ts#L159) through [src/ui/components/NotePanel.ts#L177) and [src/ui/components/NotePanel.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/NotePanel.ts#L841) through [src/ui/components/NotePanel.ts#L862).
  - The main Export menu’s CSV/HTML options are dailies reports, not note exports, in [src/ui/components/ExportControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/ExportControl.ts#L213) through [src/ui/components/ExportControl.ts#L216).
- Impact:
  - Users looking for note export in spreadsheet/report formats will only find JSON in the actual note workflow.
  - HTML/CSV exports are currently a different report feature with different scope and structure, so the note-export contract is misleading in production.

### 329. Dailies reports include only the current version label, not the version history they advertise

- Severity: Medium
- Area: Reports / version data
- Evidence:
  - The report docs describe “Version info | Version number and history” in [docs/export/edl-otio.md](/Users/lifeart/Repos/openrv-web/docs/export/edl-otio.md#L86) through [docs/export/edl-otio.md](/Users/lifeart/Repos/openrv-web/docs/export/edl-otio.md#L96).
  - `buildReportRows(...)` looks up the version group for a source, then only extracts the single `label` for the current source’s matching entry in [src/export/ReportExporter.ts](/Users/lifeart/Repos/openrv-web/src/export/ReportExporter.ts#L120) through [src/export/ReportExporter.ts#L129).
  - Neither the CSV nor HTML output adds any other version-group entries or history fields in [src/export/ReportExporter.ts](/Users/lifeart/Repos/openrv-web/src/export/ReportExporter.ts#L196) through [src/export/ReportExporter.ts#L210) and [src/export/ReportExporter.ts](/Users/lifeart/Repos/openrv-web/src/export/ReportExporter.ts#L252) through [src/export/ReportExporter.ts#L269).
- Impact:
  - Review reports cannot show a shot’s version lineage or alternative versions, only the one label attached to the exported source row.
  - That makes the report less useful for production review trails where version progression itself matters.

### 330. ShotGrid note sync flattens local note threads and statuses into plain top-level comments

- Severity: Medium
- Area: ShotGrid integration / note round-trip fidelity
- Evidence:
  - Local notes support threaded replies via `parentId` and review state via `status: 'open' | 'resolved' | 'wontfix'` in [src/core/session/NoteManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/NoteManager.ts#L11) through [src/core/session/NoteManager.ts#L23).
  - ShotGrid push iterates every local note for a source and sends only `text` plus optional `frameRange` in [src/integrations/ShotGridIntegrationBridge.ts](/Users/lifeart/Repos/openrv-web/src/integrations/ShotGridIntegrationBridge.ts#L197) through [src/integrations/ShotGridIntegrationBridge.ts#L215) and [src/integrations/ShotGridBridge.ts](/Users/lifeart/Repos/openrv-web/src/integrations/ShotGridBridge.ts#L266) through [src/integrations/ShotGridBridge.ts#L291).
  - ShotGrid pull reconstructs local notes with `addNote(...)` using source/frame/text/author only, with no reply linkage or restored note status in [src/integrations/ShotGridIntegrationBridge.ts](/Users/lifeart/Repos/openrv-web/src/integrations/ShotGridIntegrationBridge.ts#L276) through [src/integrations/ShotGridIntegrationBridge.ts#L308).
- Impact:
  - A threaded review conversation or resolved/won’t-fix state in OpenRV Web cannot survive a ShotGrid sync round-trip as equivalent structured review data.
  - The integration reduces richer local note workflows to a flat list of plain comments, which weakens production review traceability.

### 331. The shipped note UI cannot create or edit frame-range notes even though the note system supports them

- Severity: Medium
- Area: Notes / review workflow
- Evidence:
  - The review-workflow guide says “Notes with frame ranges can be created by setting a start and end frame” in [docs/advanced/review-workflow.md](/Users/lifeart/Repos/openrv-web/docs/advanced/review-workflow.md#L62) through [docs/advanced/review-workflow.md](/Users/lifeart/Repos/openrv-web/docs/advanced/review-workflow.md#L69).
  - The note model itself supports `frameStart` and `frameEnd` in [src/core/session/NoteManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/NoteManager.ts#L11) through [src/core/session/NoteManager.ts#L23).
  - The shipped `NotePanel` add flow always creates notes with `frameStart === frameEnd === currentFrame` in [src/ui/components/NotePanel.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/NotePanel.ts#L332) through [src/ui/components/NotePanel.ts#L348).
  - `NoteManager.updateNote(...)` only edits `text`, `status`, or `color`, and the panel never exposes any UI for changing a note’s frame start/end after creation in [src/core/session/NoteManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/NoteManager.ts#L98) through [src/core/session/NoteManager.ts#L120) and [src/ui/components/NotePanel.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/NotePanel.ts#L808) through [src/ui/components/NotePanel.ts#L818).
- Impact:
  - Users cannot author the frame-range notes that the review workflow describes from the shipped UI.
  - Range support currently exists only in imported data or programmatic paths, which makes multi-frame feedback much less practical in real review sessions.

### 332. Compare overlays never show real version/source labels, even though the review workflow says they do

- Severity: Medium
- Area: Compare UI / review workflow clarity
- Evidence:
  - The review workflow docs explicitly say that when comparing versions, "The version labels appear in the comparison overlay" in [docs/advanced/review-workflow.md](/Users/lifeart/Repos/openrv-web/docs/advanced/review-workflow.md#L42) through [docs/advanced/review-workflow.md](/Users/lifeart/Repos/openrv-web/docs/advanced/review-workflow.md#L44).
  - The split-screen overlay hardcodes its on-canvas labels to plain `A` and `B` in [src/ui/components/ViewerSplitScreen.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/ViewerSplitScreen.ts#L72) through [src/ui/components/ViewerSplitScreen.ts#L97).
  - The wipe overlay hardcodes its labels to `Original` and `Graded` in [src/ui/components/ViewerWipe.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/ViewerWipe.ts#L8) through [src/ui/components/ViewerWipe.ts#L10) and [src/ui/components/ViewerWipe.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/ViewerWipe.ts#L37) through [src/ui/components/ViewerWipe.ts#L59).
  - Production compare wiring only forwards wipe mode/position and A/B source selection into the viewer in [src/AppViewWiring.ts](/Users/lifeart/Repos/openrv-web/src/AppViewWiring.ts#L87) through [src/AppViewWiring.ts#L110), while the viewer's explicit `setWipeLabels(...)` API exists but is not part of that runtime wiring in [src/ui/components/Viewer.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/Viewer.ts#L2664) through [src/ui/components/Viewer.ts#L2669).
- Impact:
  - Users comparing two shot versions in wipe or split-screen mode cannot tell from the on-image overlay which actual version/source is on each side.
  - That makes the shipped compare HUD materially less useful in review sessions than the documentation promises, especially when filenames or version numbers matter more than abstract `A/B` labels.

### 333. Reference `toggle` mode is documented as a switch between live and reference, but the renderer only replaces the frame

- Severity: Medium
- Area: Reference comparison / API semantics
- Evidence:
  - The advanced compare docs describe reference `Toggle` mode as "Press to switch between reference and live" in [docs/compare/advanced-compare.md](/Users/lifeart/Repos/openrv-web/docs/compare/advanced-compare.md#L21) through [docs/compare/advanced-compare.md](/Users/lifeart/Repos/openrv-web/docs/compare/advanced-compare.md#L29).
  - `ReferenceManager` treats `toggle` as a first-class view mode alongside `split-h`, `split-v`, `overlay`, and `side-by-side` in [src/ui/components/ReferenceManager.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/ReferenceManager.ts#L13) through [src/ui/components/ReferenceManager.ts#L18) and [src/ui/components/ReferenceManager.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/ReferenceManager.ts#L40) through [src/ui/components/ReferenceManager.ts#L46).
  - The shipped View tab still only exposes capture and a binary enable/disable button for reference comparison in [src/services/tabContent/buildViewTab.ts](/Users/lifeart/Repos/openrv-web/src/services/tabContent/buildViewTab.ts#L85) through [src/services/tabContent/buildViewTab.ts#L117).
  - In the renderer, `viewMode === 'toggle'` just draws the reference image over the full frame once, the same way a static replacement would, in [src/ui/components/Viewer.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/Viewer.ts#L3920) through [src/ui/components/Viewer.ts#L3925); there is no additional input path there that alternates between live and reference imagery.
- Impact:
  - Anyone using the documented/API-level `toggle` reference mode gets a latched full-frame reference display, not a real switch-back-and-forth comparison mode.
  - That makes one of the advertised reference comparison modes semantically misleading and less useful for quick before/after review.

### 334. Comparison annotations are tied to the `A/B` slot, not to the underlying source they were drawn on

- Severity: Medium
- Area: Paint / compare review data fidelity
- Evidence:
  - The advanced compare docs say comparison annotations are "tied to the source they were drawn on" so switching between A and B preserves each source's annotation layer independently in [docs/compare/advanced-compare.md](/Users/lifeart/Repos/openrv-web/docs/compare/advanced-compare.md#L61) through [docs/compare/advanced-compare.md#L63).
  - The actual paint annotation model has no source identity field; it only stores `version?: 'A' | 'B' | 'all'` on annotations in [src/paint/types.ts](/Users/lifeart/Repos/openrv-web/src/paint/types.ts#L58) through [src/paint/types.ts](/Users/lifeart/Repos/openrv-web/src/paint/types.ts#L69) and [src/paint/types.ts](/Users/lifeart/Repos/openrv-web/src/paint/types.ts#L83) through [src/paint/types.ts](/Users/lifeart/Repos/openrv-web/src/paint/types.ts#L89).
  - When new paint data is created, `PaintEngine` writes only the current annotation version slot into the annotation payload in [src/paint/PaintEngine.ts](/Users/lifeart/Repos/openrv-web/src/paint/PaintEngine.ts#L237) through [src/paint/PaintEngine.ts](/Users/lifeart/Repos/openrv-web/src/paint/PaintEngine.ts#L254) and [src/paint/PaintEngine.ts](/Users/lifeart/Repos/openrv-web/src/paint/PaintEngine.ts#L291) through [src/paint/PaintEngine.ts](/Users/lifeart/Repos/openrv-web/src/paint/PaintEngine.ts#L299).
  - Display filtering also keys entirely off that `A/B` version tag, not a source index or media identifier, in [src/paint/PaintEngine.ts](/Users/lifeart/Repos/openrv-web/src/paint/PaintEngine.ts#L633) through [src/paint/PaintEngine.ts](/Users/lifeart/Repos/openrv-web/src/paint/PaintEngine.ts#L703).
- Impact:
  - If users redraw A/B assignments to different sources, the annotation layer follows the `A` or `B` slot rather than staying attached to the original media source.
  - That makes the shipped comparison-annotation workflow less reliable than documented for real version review, because annotation meaning can drift when compare assignments change.

### 335. Presentation mode does not provide the visual playback HUD that the review docs describe

- Severity: Medium
- Area: Presentation mode / review UX
- Evidence:
  - The review workflow docs say that in presentation mode "A minimal HUD appears briefly when playback state changes (play/pause indicator, frame counter)" in [docs/advanced/review-workflow.md](/Users/lifeart/Repos/openrv-web/docs/advanced/review-workflow.md#L145) through [docs/advanced/review-workflow.md#L151).
  - `PresentationMode` itself only manages hidden elements and cursor auto-hide; its stated responsibility is to hide UI and show only the viewer canvas in [src/utils/ui/PresentationMode.ts](/Users/lifeart/Repos/openrv-web/src/utils/ui/PresentationMode.ts#L1) through [src/utils/ui/PresentationMode.ts#L5), and its enter/exit logic only hides/restores DOM elements plus cursor state in [src/utils/ui/PresentationMode.ts](/Users/lifeart/Repos/openrv-web/src/utils/ui/PresentationMode.ts#L111) through [src/utils/ui/PresentationMode.ts#L165).
  - The live playback-state hook in `LayoutOrchestrator` only announces play/pause changes to the screen-reader announcer in [src/services/LayoutOrchestrator.ts](/Users/lifeart/Repos/openrv-web/src/services/LayoutOrchestrator.ts#L423) through [src/services/LayoutOrchestrator.ts#L428); it does not create any visual presentation HUD.
  - The nearest visual playback overlay, `FPSIndicator`, is a separate optional viewer overlay with its own enable flag and is not tied to presentation mode in [src/ui/components/FPSIndicator.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/FPSIndicator.ts#L193) through [src/ui/components/FPSIndicator.ts#L215).
- Impact:
  - Users entering presentation mode get hidden chrome and cursor auto-hide, but not the transient play/pause plus frame-counter HUD the review workflow promises.
  - That makes playback-state feedback weaker than documented in screening-room or client-review usage, especially once normal UI chrome is hidden.

### 336. The documentation repeatedly sends users to a `View menu` that the shipped app does not actually have

- Severity: Medium
- Area: UI discoverability / documentation contract
- Evidence:
  - Multiple user guides instruct users to access features from the `View menu`, including presentation mode in [docs/advanced/review-workflow.md](/Users/lifeart/Repos/openrv-web/docs/advanced/review-workflow.md#L143), playlist in [docs/advanced/playlist.md](/Users/lifeart/Repos/openrv-web/docs/advanced/playlist.md#L11), stereo display modes in [docs/guides/stereo-3d-viewing.md](/Users/lifeart/Repos/openrv-web/docs/guides/stereo-3d-viewing.md#L17), spherical projection in [docs/playback/viewer-navigation.md](/Users/lifeart/Repos/openrv-web/docs/playback/viewer-navigation.md#L97), and stereo alignment in [docs/advanced/stereo-3d.md](/Users/lifeart/Repos/openrv-web/docs/advanced/stereo-3d.md#L117).
  - The shipped header utility area exposes layout, presentation, external presentation, fullscreen, volume, theme, and docs buttons, but no `View` menu control, in [src/ui/components/layout/HeaderBar.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/layout/HeaderBar.ts#L372) through [src/ui/components/layout/HeaderBar.ts#L425).
  - In production those features are generally surfaced through the View tab/context toolbar or direct header buttons, not a menu structure matching the docs.
- Impact:
  - Users following the docs can waste time looking for a top-level `View menu` that does not exist in the shipped interface.
  - That makes multiple otherwise-real features harder to discover, because the guidance points to the wrong UI affordance class.

### 337. The documentation also relies on a non-existent `Settings panel` for several real workflows

- Severity: Medium
- Area: UI discoverability / configuration workflow
- Evidence:
  - The docs tell users to open the shortcut editor from the `Settings panel` in [docs/reference/keyboard-shortcuts.md](/Users/lifeart/Repos/openrv-web/docs/reference/keyboard-shortcuts.md#L191).
  - The review workflow tells users to enable client mode from the `Settings panel` in [docs/advanced/review-workflow.md](/Users/lifeart/Repos/openrv-web/docs/advanced/review-workflow.md#L131) through [docs/advanced/review-workflow.md](/Users/lifeart/Repos/openrv-web/docs/advanced/review-workflow.md#L133), while the live client-mode implementation explicitly keys off the URL parameter path in [src/ui/components/ClientMode.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/ClientMode.ts#L185) through [src/ui/components/ClientMode.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/ClientMode.ts#L190).
  - The DCC/ShotGrid docs say API-key auth is configured in the `OpenRV Web settings panel` in [docs/advanced/dcc-integration.md](/Users/lifeart/Repos/openrv-web/docs/advanced/dcc-integration.md#L109), but the shipped ShotGrid UI actually embeds configuration inside the ShotGrid panel’s disconnected config section in [src/ui/components/ShotGridPanel.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/ShotGridPanel.ts#L127) through [src/ui/components/ShotGridPanel.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/ShotGridPanel.ts#L130).
  - The keyboard handler only exposes shortcut management through help-driven dialogs, and its own code comments note that the richer shortcut-editor path is not what production currently opens in [src/AppKeyboardHandler.ts](/Users/lifeart/Repos/openrv-web/src/AppKeyboardHandler.ts#L481) through [src/AppKeyboardHandler.ts](/Users/lifeart/Repos/openrv-web/src/AppKeyboardHandler.ts#L487).
  - A production UI search finds no actual `Settings panel` control surface matching those docs.
- Impact:
  - Users trying to follow documentation for shortcut customization, client-mode enablement, or ShotGrid authentication can look for a settings panel that does not exist in the shipped UI.
  - That turns several otherwise-implemented workflows into trial-and-error discovery problems and makes the docs materially less trustworthy.

### 338. The review workflow tells users to press `F` for fullscreen, but the shipped fullscreen shortcut is `F11`

- Severity: Medium
- Area: Documentation / keyboard workflow
- Evidence:
  - The review workflow says "Press `F` for fullscreen mode" before enabling presentation mode in [docs/advanced/review-workflow.md](/Users/lifeart/Repos/openrv-web/docs/advanced/review-workflow.md#L141) through [docs/advanced/review-workflow.md](/Users/lifeart/Repos/openrv-web/docs/advanced/review-workflow.md#L143).
  - The actual default fullscreen binding is `F11` in [src/utils/input/KeyBindings.ts](/Users/lifeart/Repos/openrv-web/src/utils/input/KeyBindings.ts#L662) through [src/utils/input/KeyBindings.ts](/Users/lifeart/Repos/openrv-web/src/utils/input/KeyBindings.ts#L665).
  - The shipped header button tooltip also advertises `Fullscreen (F11)` in [src/ui/components/layout/HeaderBar.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/layout/HeaderBar.ts#L408) through [src/ui/components/layout/HeaderBar.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/layout/HeaderBar.ts#L415).
  - Other user-facing docs agree with `F11`, including [docs/getting-started/ui-overview.md](/Users/lifeart/Repos/openrv-web/docs/getting-started/ui-overview.md#L228) and [docs/reference/keyboard-shortcuts.md](/Users/lifeart/Repos/openrv-web/docs/reference/keyboard-shortcuts.md#L36).
- Impact:
  - Users following the review workflow can press the wrong key and conclude fullscreen/presentation entry is broken.
  - That is especially confusing because presentation mode is documented as a two-step fullscreen-first workflow.

### 339. The session-management guide gives the snapshot panel the history panel's shortcut

- Severity: Medium
- Area: Documentation / session workflow
- Evidence:
  - The session-management guide says "Open the Snapshot Panel ... with the keyboard shortcut `Shift+Alt+H`" in [docs/advanced/session-management.md](/Users/lifeart/Repos/openrv-web/docs/advanced/session-management.md#L98) through [docs/advanced/session-management.md](/Users/lifeart/Repos/openrv-web/docs/advanced/session-management.md#L100).
  - The same guide later uses `Shift+Alt+H` for the History Panel in [docs/advanced/session-management.md](/Users/lifeart/Repos/openrv-web/docs/advanced/session-management.md#L192).
  - The shipped keymap assigns `Shift+Alt+H` to `panel.history` in [src/utils/input/KeyBindings.ts](/Users/lifeart/Repos/openrv-web/src/utils/input/KeyBindings.ts#L562) through [src/utils/input/KeyBindings.ts](/Users/lifeart/Repos/openrv-web/src/utils/input/KeyBindings.ts#L566), while the snapshots panel is actually `Ctrl+Shift+Alt+S` in [src/utils/input/KeyBindings.ts](/Users/lifeart/Repos/openrv-web/src/utils/input/KeyBindings.ts#L572) through [src/utils/input/KeyBindings.ts](/Users/lifeart/Repos/openrv-web/src/utils/input/KeyBindings.ts#L580).
  - The keyboard shortcut reference agrees with the keymap and lists `Shift+Alt+H` for history, not snapshots, in [docs/reference/keyboard-shortcuts.md](/Users/lifeart/Repos/openrv-web/docs/reference/keyboard-shortcuts.md#L161) and [docs/reference/keyboard-shortcuts.md](/Users/lifeart/Repos/openrv-web/docs/reference/keyboard-shortcuts.md#L166).
- Impact:
  - Users following the session-management guide can open the wrong panel when trying to work with snapshots.
  - That is especially confusing because the same guide reuses the same shortcut for two different panels.

### 340. The session-management guide describes the History panel as snapshot/autosave recovery, but the shipped panel is only undo/redo action history

- Severity: Medium
- Area: Documentation / recovery workflow
- Evidence:
  - The session-management guide says the History Panel provides "a unified view of both manual snapshots and auto-save entries" with filtering by snapshot/checkpoint/autosave type and quick restore in [docs/advanced/session-management.md](/Users/lifeart/Repos/openrv-web/docs/advanced/session-management.md#L190) through [docs/advanced/session-management.md](/Users/lifeart/Repos/openrv-web/docs/advanced/session-management.md#L199).
  - The shipped `HistoryPanel` source describes itself as a "Visual panel showing undo/redo history" in [src/ui/components/HistoryPanel.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/HistoryPanel.ts#L1) through [src/ui/components/HistoryPanel.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/HistoryPanel.ts#L7).
  - Its implementation is built entirely on `HistoryManager` action entries and exposes only entry selection plus clear-history behavior in [src/ui/components/HistoryPanel.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/HistoryPanel.ts#L25) through [src/ui/components/HistoryPanel.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/HistoryPanel.ts#L124) and [src/ui/components/HistoryPanel.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/HistoryPanel.ts#L175) through [src/ui/components/HistoryPanel.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/HistoryPanel.ts#L205).
  - Snapshot and autosave recovery are handled by separate systems (`SnapshotPanel`, `SnapshotManager`, `AutoSaveManager`, and `AppPersistenceManager`), not by `HistoryPanel`, as shown in [src/ui/components/SnapshotPanel.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/SnapshotPanel.ts#L1) through [src/ui/components/SnapshotPanel.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/SnapshotPanel.ts#L8) and [src/AppPersistenceManager.ts](/Users/lifeart/Repos/openrv-web/src/AppPersistenceManager.ts#L2) through [src/AppPersistenceManager.ts](/Users/lifeart/Repos/openrv-web/src/AppPersistenceManager.ts#L6).
- Impact:
  - Users looking for crash recovery, auto-checkpoints, or snapshot restore in the History panel will land in the wrong tool entirely.
  - That makes the recovery workflow docs materially misleading, because the described panel does not match the shipped runtime behavior.

### 341. Network-sync docs promise participant avatars in the viewer, but presence only renders inside the connection panel

- Severity: Medium
- Area: Collaboration UI / documentation contract
- Evidence:
  - The network-sync docs say participants are visible "as avatar overlays in the viewer" and that presence avatars appear "in the top-right corner of the viewer" in [docs/advanced/network-sync.md](/Users/lifeart/Repos/openrv-web/docs/advanced/network-sync.md#L41) through [docs/advanced/network-sync.md](/Users/lifeart/Repos/openrv-web/docs/advanced/network-sync.md#L47).
  - The shipped `NetworkControl` renders user avatars only inside `userListContainer` in the connection panel in [src/ui/components/NetworkControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/NetworkControl.ts#L1273) through [src/ui/components/NetworkControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/NetworkControl.ts#L1325).
  - A production-code search finds no viewer-side presence overlay or avatar rendering path outside that panel list; the runtime matches are limited to `NetworkControl`'s panel DOM.
- Impact:
  - Users expecting live participant presence in the viewer itself will not get the on-image collaboration cue the docs describe.
  - That makes collaborative review feel less visible than documented, especially when the network panel is closed during playback.

### 342. Network-sync docs describe a dedicated conflict/warning header state that the shipped indicator cannot represent

- Severity: Medium
- Area: Collaboration status UI / documentation contract
- Evidence:
  - The network-sync guide says the header sync indicator shows a `Red warning` state for conflicts and manual intervention in [docs/advanced/network-sync.md](/Users/lifeart/Repos/openrv-web/docs/advanced/network-sync.md#L139) through [docs/advanced/network-sync.md](/Users/lifeart/Repos/openrv-web/docs/advanced/network-sync.md#L143).
  - The runtime connection-state model only defines `disconnected`, `connecting`, `connected`, `reconnecting`, and `error` in [src/network/types.ts](/Users/lifeart/Repos/openrv-web/src/network/types.ts#L9).
  - `NetworkControl.updateButtonStyle()` only renders three visual cases: connected, connecting/reconnecting, and everything else muted; there is no separate conflict/manual-intervention styling path in [src/ui/components/NetworkControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/NetworkControl.ts#L1133) through [src/ui/components/NetworkControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/NetworkControl.ts#L1148).
  - Conflict detection currently lives in `SyncStateManager` logic only, with no UI consumer found in the production indicator path.
- Impact:
  - Users cannot rely on the header control to distinguish a sync conflict from ordinary disconnection/reconnection states the way the docs describe.
  - That weakens trust in the collaboration status indicator during remote review, because one of the documented states is not actually expressible in the shipped UI.

### 343. The stereo documentation disagrees with itself and with the shipped mode list

- Severity: Medium
- Area: Documentation / stereo workflow
- Evidence:
  - The practical stereo guide says users get "seven primary display modes," then "seven stereo display modes plus the default Off state," and later says the dropdown contains "all eight options" in [docs/advanced/stereo-3d.md](/Users/lifeart/Repos/openrv-web/docs/advanced/stereo-3d.md#L3), [docs/advanced/stereo-3d.md](/Users/lifeart/Repos/openrv-web/docs/advanced/stereo-3d.md#L11), and [docs/advanced/stereo-3d.md](/Users/lifeart/Repos/openrv-web/docs/advanced/stereo-3d.md#L55).
  - The technical stereo guide instead says OpenRV Web supports "ten stereo display modes" and includes `left-only` and `right-only` in the cycle order in [docs/guides/stereo-3d-viewing.md](/Users/lifeart/Repos/openrv-web/docs/guides/stereo-3d-viewing.md#L9), [docs/guides/stereo-3d-viewing.md](/Users/lifeart/Repos/openrv-web/docs/guides/stereo-3d-viewing.md#L17), and [docs/guides/stereo-3d-viewing.md](/Users/lifeart/Repos/openrv-web/docs/guides/stereo-3d-viewing.md#L125).
  - The shipped runtime exposes exactly ten total `StereoMode` values including `off`, with `left-only` and `right-only` present in both the core type and the actual dropdown order in [src/core/types/stereo.ts](/Users/lifeart/Repos/openrv-web/src/core/types/stereo.ts#L1) through [src/core/types/stereo.ts](/Users/lifeart/Repos/openrv-web/src/core/types/stereo.ts#L11) and [src/ui/components/StereoControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/StereoControl.ts#L19) through [src/ui/components/StereoControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/StereoControl.ts#L30).
- Impact:
  - Users cannot trust the stereo guides to tell them how many modes actually exist or which ones `Shift+3` will cycle through.
  - That makes the stereo feature set look unstable even though the runtime behavior is deterministic.

### 344. The stereo guides publish the wrong convergence-offset range for the shipped UI

- Severity: Medium
- Area: Documentation / stereo control contract
- Evidence:
  - The technical stereo guide says the convergence offset range is `-50 to +50` in [docs/guides/stereo-3d-viewing.md](/Users/lifeart/Repos/openrv-web/docs/guides/stereo-3d-viewing.md#L105).
  - The practical stereo guide describes the control as an offset slider and uses example values, but the shipped slider is explicitly clamped to `-20` through `20` with `0.5` steps in [src/ui/components/StereoControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/StereoControl.ts#L213) through [src/ui/components/StereoControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/StereoControl.ts#L219).
  - The same stereo control is the production entry point for mode/offset changes; there is no separate wider-range UI path in the shipped component.
- Impact:
  - Users following the docs can expect correction headroom that the actual control cannot provide.
  - That is especially misleading for stereo review/calibration workflows where the numeric offset range matters.

### 345. Multi-view EXR and alternate stereo-input workflows are documented as integrated, but production hardcodes side-by-side stereo

- Severity: High
- Area: Stereo media workflow / documentation contract
- Evidence:
  - The docs say multi-view EXR "integrates with the stereo viewing system" and can be displayed via stereo mode in [docs/playback/exr-layers.md](/Users/lifeart/Repos/openrv-web/docs/playback/exr-layers.md#L72) through [docs/playback/exr-layers.md](/Users/lifeart/Repos/openrv-web/docs/playback/exr-layers.md#L76), and say separate stereo input plus automatic multi-view stereo-pair mapping are supported in [docs/guides/stereo-3d-viewing.md](/Users/lifeart/Repos/openrv-web/docs/guides/stereo-3d-viewing.md#L79) through [docs/guides/stereo-3d-viewing.md](/Users/lifeart/Repos/openrv-web/docs/guides/stereo-3d-viewing.md#L97) and [docs/advanced/stereo-3d.md](/Users/lifeart/Repos/openrv-web/docs/advanced/stereo-3d.md#L163) through [docs/advanced/stereo-3d.md](/Users/lifeart/Repos/openrv-web/docs/advanced/stereo-3d.md#L171).
  - The `MultiViewEXR` parser/helpers exist, but a production-code search finds no runtime consumer outside the format barrel export in [src/formats/index.ts](/Users/lifeart/Repos/openrv-web/src/formats/index.ts#L14) through [src/formats/index.ts](/Users/lifeart/Repos/openrv-web/src/formats/index.ts#L20).
  - The shipped viewer stereo path applies `StereoManager.applyStereoMode(...)` / `applyStereoModeWithEyeTransforms(...)` without any input-format argument in [src/ui/components/Viewer.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/Viewer.ts#L2112) through [src/ui/components/Viewer.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/Viewer.ts#L2118), and `Viewer.getStereoPair()` explicitly hardcodes `'side-by-side'` in [src/ui/components/Viewer.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/Viewer.ts#L3050) through [src/ui/components/Viewer.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/Viewer.ts#L3058).
  - `StereoManager` also calls the renderer helpers without supplying any alternate `StereoInputFormat`, so the default side-by-side path is used in [src/ui/components/StereoManager.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/StereoManager.ts#L132) through [src/ui/components/StereoManager.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/StereoManager.ts#L152).
- Impact:
  - Users are told to expect separate-input and multi-view stereo workflows that the shipped viewer does not actually wire end-to-end.
  - That makes stereo EXR review look supported on paper while production behavior remains side-by-side-centric.

### 346. The accessibility overview overclaims live announcements for frame navigation and tool selection

- Severity: Medium
- Area: Accessibility / documentation contract
- Evidence:
  - The UI overview says screen readers are notified for "playback start/stop, frame navigation, source loading, and tool selection" in [docs/getting-started/ui-overview.md](/Users/lifeart/Repos/openrv-web/docs/getting-started/ui-overview.md#L234) through [docs/getting-started/ui-overview.md](/Users/lifeart/Repos/openrv-web/docs/getting-started/ui-overview.md#L236).
  - The production `AriaAnnouncer` wiring in `LayoutOrchestrator` only announces tab changes, file loads, playback start/pause, and playback speed changes in [src/services/LayoutOrchestrator.ts](/Users/lifeart/Repos/openrv-web/src/services/LayoutOrchestrator.ts#L388) through [src/services/LayoutOrchestrator.ts](/Users/lifeart/Repos/openrv-web/src/services/LayoutOrchestrator.ts#L435).
  - `KeyboardActionMap` adds announcements for range-shift actions only, not ordinary frame stepping or generic tool selection, in [src/services/KeyboardActionMap.ts](/Users/lifeart/Repos/openrv-web/src/services/KeyboardActionMap.ts#L343) through [src/services/KeyboardActionMap.ts](/Users/lifeart/Repos/openrv-web/src/services/KeyboardActionMap.ts#L366).
  - A source search for frame-announcement calls finds no production announcement path for normal frame stepping/seek events.
- Impact:
  - Assistive-technology users can rely on the docs for a level of navigation feedback that the shipped app does not consistently provide.
  - That makes the accessibility overview materially overstate what is currently announced at runtime.

### 347. The channel-isolation docs still advertise `Shift+L` as the normal luminance shortcut even though production routes that combo elsewhere

- Severity: Medium
- Area: Documentation / channel-isolation workflow
- Evidence:
  - The channel-isolation guide tells users luminance is on `Shift+L` or `Shift+Y`, and specifically instructs them to switch to luminance with `Shift+L`, in [docs/playback/channel-isolation.md](/Users/lifeart/Repos/openrv-web/docs/playback/channel-isolation.md#L18) and [docs/playback/channel-isolation.md](/Users/lifeart/Repos/openrv-web/docs/playback/channel-isolation.md#L63).
  - The shortcut reference also lists `Shift+L` as `Luminance / Grayscale` and `Shift+Y` as its alias in [docs/reference/keyboard-shortcuts.md](/Users/lifeart/Repos/openrv-web/docs/reference/keyboard-shortcuts.md#L107) and [docs/reference/keyboard-shortcuts.md](/Users/lifeart/Repos/openrv-web/docs/reference/keyboard-shortcuts.md#L108).
  - In the shipped keymap, `Shift+L` is a conflict between `channel.luminance` and `lut.togglePanel` in [src/utils/input/KeyBindings.ts](/Users/lifeart/Repos/openrv-web/src/utils/input/KeyBindings.ts#L418) through [src/utils/input/KeyBindings.ts](/Users/lifeart/Repos/openrv-web/src/utils/input/KeyBindings.ts#L428).
  - `AppKeyboardHandler` explicitly treats `channel.luminance` as a conflicting default and does not register it like a normal direct shortcut, while `channel.grayscale` (`Shift+Y`) remains separately listed in the channel section in [src/AppKeyboardHandler.ts](/Users/lifeart/Repos/openrv-web/src/AppKeyboardHandler.ts#L48), [src/AppKeyboardHandler.ts](/Users/lifeart/Repos/openrv-web/src/AppKeyboardHandler.ts#L205) through [src/AppKeyboardHandler.ts](/Users/lifeart/Repos/openrv-web/src/AppKeyboardHandler.ts#L213), and [src/utils/input/KeyBindings.ts](/Users/lifeart/Repos/openrv-web/src/utils/input/KeyBindings.ts#L430) through [src/utils/input/KeyBindings.ts](/Users/lifeart/Repos/openrv-web/src/utils/input/KeyBindings.ts#L434).
- Impact:
  - Users following the docs can press `Shift+L` and land in LUT-panel behavior instead of luminance view, then conclude channel isolation is unreliable.
  - The only robust documented shortcut here is effectively the alias, not the primary combo the docs emphasize.

### 348. The shortcut docs still advertise `H` and `W` for histogram and waveform even though those defaults are hidden by conflicts

- Severity: Medium
- Area: Documentation / scopes workflow
- Evidence:
  - The shortcut reference lists `H` for histogram and `W` for waveform in [docs/reference/keyboard-shortcuts.md](/Users/lifeart/Repos/openrv-web/docs/reference/keyboard-shortcuts.md#L72) through [docs/reference/keyboard-shortcuts.md](/Users/lifeart/Repos/openrv-web/docs/reference/keyboard-shortcuts.md#L73).
  - The getting-started UI overview repeats those same shortcuts for the panels in [docs/getting-started/ui-overview.md](/Users/lifeart/Repos/openrv-web/docs/getting-started/ui-overview.md#L203) through [docs/getting-started/ui-overview.md](/Users/lifeart/Repos/openrv-web/docs/getting-started/ui-overview.md#L204).
  - In production, `AppKeyboardHandler` marks both `panel.histogram` and `panel.waveform` as conflicting defaults because `H` and `W` are taken by fit-to-height and fit-to-width behavior in [src/AppKeyboardHandler.ts](/Users/lifeart/Repos/openrv-web/src/AppKeyboardHandler.ts#L41) through [src/AppKeyboardHandler.ts](/Users/lifeart/Repos/openrv-web/src/AppKeyboardHandler.ts#L47).
  - The scopes actions still exist in `KeyboardActionMap`, but the conflict handling means the docs are describing shortcuts that are not normally registered for direct use in [src/services/KeyboardActionMap.ts](/Users/lifeart/Repos/openrv-web/src/services/KeyboardActionMap.ts#L442) through [src/services/KeyboardActionMap.ts](/Users/lifeart/Repos/openrv-web/src/services/KeyboardActionMap.ts#L445).
- Impact:
  - Users can follow the official shortcut docs, press `H` or `W`, and get a different viewer action than the scopes panel they were promised.
  - That keeps the scopes area looking broken even when the underlying panels themselves still work through buttons or custom bindings.

### 349. The published shortcut reference assigns several key combos to different actions in the same table

- Severity: Medium
- Area: Documentation / keyboard reference integrity
- Evidence:
  - The shortcut reference lists `Shift+B` both for background pattern cycling and for blue-channel isolation in [docs/reference/keyboard-shortcuts.md](/Users/lifeart/Repos/openrv-web/docs/reference/keyboard-shortcuts.md#L38) and [docs/reference/keyboard-shortcuts.md](/Users/lifeart/Repos/openrv-web/docs/reference/keyboard-shortcuts.md#L105).
  - The same reference lists `Shift+R` both for red-channel isolation and for rotate-left in [docs/reference/keyboard-shortcuts.md](/Users/lifeart/Repos/openrv-web/docs/reference/keyboard-shortcuts.md#L103) and [docs/reference/keyboard-shortcuts.md](/Users/lifeart/Repos/openrv-web/docs/reference/keyboard-shortcuts.md#L127).
  - It also lists `Shift+N` both for resetting channel view and for opening network sync in [docs/reference/keyboard-shortcuts.md](/Users/lifeart/Repos/openrv-web/docs/reference/keyboard-shortcuts.md#L109) and [docs/reference/keyboard-shortcuts.md](/Users/lifeart/Repos/openrv-web/docs/reference/keyboard-shortcuts.md#L163).
  - Those collisions match the production conflict list in `AppKeyboardHandler`, which explicitly notes `Shift+R`, `Shift+B`, and `Shift+N` are reserved by other actions in [src/AppKeyboardHandler.ts](/Users/lifeart/Repos/openrv-web/src/AppKeyboardHandler.ts#L43) through [src/AppKeyboardHandler.ts](/Users/lifeart/Repos/openrv-web/src/AppKeyboardHandler.ts#L45).
- Impact:
  - Users cannot treat the published shortcut table as a reliable source of truth because it contradicts itself before they even try the app.
  - That also makes support/debugging harder, since two different official pages can both appear "correct" while describing the same key differently.

### 350. Multiple docs still teach `Shift+R` / `Shift+B` / `Shift+N` channel shortcuts that production reserves for other actions

- Severity: Medium
- Area: Documentation / channel-isolation workflow
- Evidence:
  - The channel-isolation guide still tells users to use `Shift+R`, `Shift+B`, and `Shift+N` for red, blue, and reset in [docs/playback/channel-isolation.md](/Users/lifeart/Repos/openrv-web/docs/playback/channel-isolation.md#L13) through [docs/playback/channel-isolation.md](/Users/lifeart/Repos/openrv-web/docs/playback/channel-isolation.md#L17) and [docs/playback/channel-isolation.md](/Users/lifeart/Repos/openrv-web/docs/playback/channel-isolation.md#L71).
  - Other docs repeat those same combos as if they are normal live shortcuts, including troubleshooting, EXR-layer review, and histogram guidance in [docs/reference/troubleshooting.md](/Users/lifeart/Repos/openrv-web/docs/reference/troubleshooting.md#L49), [docs/playback/exr-layers.md](/Users/lifeart/Repos/openrv-web/docs/playback/exr-layers.md#L102), and [docs/scopes/histogram.md](/Users/lifeart/Repos/openrv-web/docs/scopes/histogram.md#L66).
  - In the shipped keyboard layer, those three channel actions are explicitly marked as conflicting defaults because `Shift+R`, `Shift+B`, and `Shift+N` are already taken by rotate-left, background-pattern cycling, and network sync in [src/AppKeyboardHandler.ts](/Users/lifeart/Repos/openrv-web/src/AppKeyboardHandler.ts#L43) through [src/AppKeyboardHandler.ts](/Users/lifeart/Repos/openrv-web/src/AppKeyboardHandler.ts#L45).
  - The channel actions still exist in `KeyboardActionMap`, but the conflict handling means the docs are publishing shortcuts that are not the normal production path in [src/services/KeyboardActionMap.ts](/Users/lifeart/Repos/openrv-web/src/services/KeyboardActionMap.ts#L603) through [src/services/KeyboardActionMap.ts](/Users/lifeart/Repos/openrv-web/src/services/KeyboardActionMap.ts#L611).
- Impact:
  - Users following the docs for EXR QC, histogram analysis, or basic troubleshooting can keep pressing keys that are consumed by unrelated actions instead of changing channels.
  - That turns several otherwise-valid workflows into false bug reports because the official docs are teaching shortcuts that production intentionally does not expose as defaults.

### 351. The format-support reference overstates several partially supported formats as if they were fully usable

- Severity: Medium
- Area: Documentation / format support contract
- Evidence:
  - The quick format table presents `EXR` as supporting "multi-view stereo", `Float TIFF` as a supported HDR image format, and `MXF` as a supported video format in [docs/reference/file-formats.md](/Users/lifeart/Repos/openrv-web/docs/reference/file-formats.md#L16), [docs/reference/file-formats.md](/Users/lifeart/Repos/openrv-web/docs/reference/file-formats.md#L20), and [docs/reference/file-formats.md](/Users/lifeart/Repos/openrv-web/docs/reference/file-formats.md#L59).
  - The FAQ likewise lists `MXF` among supported video formats in [docs/reference/faq.md](/Users/lifeart/Repos/openrv-web/docs/reference/faq.md#L29).
  - Production stereo wiring is still side-by-side-centric: `Viewer.getStereoPair()` hardcodes `'side-by-side'`, and the `MultiViewEXR` helpers have no production consumer outside barrel exports in [src/ui/components/Viewer.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/Viewer.ts#L3050) through [src/ui/components/Viewer.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/Viewer.ts#L3058) and [src/formats/index.ts](/Users/lifeart/Repos/openrv-web/src/formats/index.ts#L14) through [src/formats/index.ts](/Users/lifeart/Repos/openrv-web/src/formats/index.ts#L20).
  - The deeper technical guide already admits MXF is metadata-only with "No pixel decode" in [docs/guides/file-formats.md](/Users/lifeart/Repos/openrv-web/docs/guides/file-formats.md#L262) through [docs/guides/file-formats.md](/Users/lifeart/Repos/openrv-web/docs/guides/file-formats.md#L269) and [docs/guides/file-formats.md](/Users/lifeart/Repos/openrv-web/docs/guides/file-formats.md#L418).
  - Existing decoder/runtime behavior also narrows the practical support envelope further than the top-level table suggests:
    - valid float TIFF layouts are rejected outside the decoder’s narrow accepted channel/compression cases
    - EXR multi-view stereo is parsed but not wired to real stereo playback
    - MXF registration does not mean usable frame decode
- Impact:
  - Users reading the top-level support table can assume they can review MXF media or multi-view stereo EXRs end-to-end when the shipped app only provides partial or metadata-level behavior.
  - That makes the support matrix look more complete than the runtime actually is, which is costly when teams plan media handoff formats around it.

### 352. The overlays guide relies on a non-existent `Overlays` submenu and a non-existent `Clear All Overlays` action

- Severity: Medium
- Area: Documentation / overlay controls
- Evidence:
  - The overlays guide tells users to toggle overlays from the `Overlays menu`, says the EXR window overlay is enabled from the `Overlays menu`, and claims all overlays live under an `Overlays` submenu in the View tab with a master `Clear All Overlays` option in [docs/advanced/overlays.md](/Users/lifeart/Repos/openrv-web/docs/advanced/overlays.md#L20), [docs/advanced/overlays.md](/Users/lifeart/Repos/openrv-web/docs/advanced/overlays.md#L86), and [docs/advanced/overlays.md](/Users/lifeart/Repos/openrv-web/docs/advanced/overlays.md#L211) through [docs/advanced/overlays.md](/Users/lifeart/Repos/openrv-web/docs/advanced/overlays.md#L215).
  - A production-code search finds no `Overlays` menu/submenu and no `Clear All Overlays` implementation.
  - The shipped overlay entry points are scattered as individual buttons and controls instead, such as EXR window, info strip, spotlight, and FPS indicator toggles in the View tab and watermark in Effects, as shown in [src/services/tabContent/buildViewTab.ts](/Users/lifeart/Repos/openrv-web/src/services/tabContent/buildViewTab.ts#L375) through [src/services/tabContent/buildViewTab.ts](/Users/lifeart/Repos/openrv-web/src/services/tabContent/buildViewTab.ts#L440) and [src/services/tabContent/buildEffectsTab.ts](/Users/lifeart/Repos/openrv-web/src/services/tabContent/buildEffectsTab.ts#L53) through [src/services/tabContent/buildEffectsTab.ts](/Users/lifeart/Repos/openrv-web/src/services/tabContent/buildEffectsTab.ts#L66).
- Impact:
  - Users following the overlays guide can waste time looking for a centralized menu and bulk-clear action that do not exist in the shipped app.
  - That also obscures the real control layout, because the actual overlay toggles are distributed across separate toolbar buttons and panels.

### 353. The overlays guide says EXR window overlay auto-activates on mismatched windows, but production only loads the bounds and leaves it disabled

- Severity: Medium
- Area: Documentation / EXR overlay behavior
- Evidence:
  - The overlays guide says the EXR window overlay "activates automatically when an EXR file with mismatched data/display windows is detected" in [docs/advanced/overlays.md](/Users/lifeart/Repos/openrv-web/docs/advanced/overlays.md#L86).
  - The runtime default state is still `enabled: false`, and visibility only changes through `toggle()`, `enable()`, or direct state updates in [src/ui/components/EXRWindowOverlay.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/EXRWindowOverlay.ts#L44) through [src/ui/components/EXRWindowOverlay.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/EXRWindowOverlay.ts#L53) and [src/ui/components/EXRWindowOverlay.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/EXRWindowOverlay.ts#L140) through [src/ui/components/EXRWindowOverlay.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/EXRWindowOverlay.ts#L158).
  - On source load, production only calls `setWindows(...)` or `clearWindows()` and never enables the overlay in [src/handlers/sourceLoadedHandlers.ts](/Users/lifeart/Repos/openrv-web/src/handlers/sourceLoadedHandlers.ts#L273) through [src/handlers/sourceLoadedHandlers.ts](/Users/lifeart/Repos/openrv-web/src/handlers/sourceLoadedHandlers.ts#L283).
- Impact:
  - Users can load an EXR with mismatched windows and see no overlay until they manually toggle it, even though the docs present that case as automatic.
  - That makes EXR overscan/data-window review look broken when the actual problem is a bad documentation contract.

### 354. The overlays guide documents a viewer note overlay, but production `NoteOverlay` is only a timeline note-bar helper

- Severity: Medium
- Area: Documentation / notes UI
- Evidence:
  - The overlays guide describes a bottom-of-viewer note panel with frame text, authors, stacked notes, and navigation arrows in [docs/advanced/overlays.md](/Users/lifeart/Repos/openrv-web/docs/advanced/overlays.md#L171) through [docs/advanced/overlays.md](/Users/lifeart/Repos/openrv-web/docs/advanced/overlays.md#L182).
  - The shipped `NoteOverlay` implementation explicitly "draws colored bars on the timeline canvas for notes" and contains only timeline draw logic, not viewer-overlay text UI, in [src/ui/components/NoteOverlay.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/NoteOverlay.ts#L1) through [src/ui/components/NoteOverlay.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/NoteOverlay.ts#L104).
  - App bootstrap wires that object into the timeline, not the viewer, in [src/App.ts](/Users/lifeart/Repos/openrv-web/src/App.ts#L171) through [src/App.ts](/Users/lifeart/Repos/openrv-web/src/App.ts#L177).
  - `OverlayManager` enumerates the actual viewer overlays and does not include any viewer note overlay in [src/ui/components/OverlayManager.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/OverlayManager.ts#L10) through [src/ui/components/OverlayManager.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/OverlayManager.ts#L32) and [src/ui/components/OverlayManager.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/OverlayManager.ts#L45) through [src/ui/components/OverlayManager.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/OverlayManager.ts#L63).
- Impact:
  - Users looking for a live viewer note overlay will not find the panel, arrows, or automatic current-frame note text that the docs describe.
  - The only shipped "note overlay" is a compact timeline mark, so the documentation currently promises a different UI than the app provides.

### 355. The overlays guide documents a tiled text watermark system, but the shipped watermark is only a single positioned image overlay

- Severity: Medium
- Area: Documentation / watermark workflow
- Evidence:
  - The overlays guide says the watermark overlay tiles "a text string or image across the entire frame" and exposes text, rotation, and color controls in [docs/advanced/overlays.md](/Users/lifeart/Repos/openrv-web/docs/advanced/overlays.md#L130) through [docs/advanced/overlays.md](/Users/lifeart/Repos/openrv-web/docs/advanced/overlays.md#L146).
  - The shipped `WatermarkOverlay` is defined as a "Static image overlay" whose state only contains image URL, position, scale, opacity, and margin in [src/ui/components/WatermarkOverlay.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/WatermarkOverlay.ts#L1) through [src/ui/components/WatermarkOverlay.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/WatermarkOverlay.ts#L31).
  - Rendering is a single `drawImage(...)` call at one calculated position, not a tiled text/image pattern, in [src/ui/components/WatermarkOverlay.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/WatermarkOverlay.ts#L199) through [src/ui/components/WatermarkOverlay.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/WatermarkOverlay.ts#L215).
  - The shipped `WatermarkControl` only exposes image upload/removal plus position, scale, opacity, and margin controls in [src/ui/components/WatermarkControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/WatermarkControl.ts#L1) through [src/ui/components/WatermarkControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/WatermarkControl.ts#L8) and [src/ui/components/WatermarkControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/WatermarkControl.ts#L89) through [src/ui/components/WatermarkControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/WatermarkControl.ts#L140).
- Impact:
  - Users expecting confidential tiled text watermarks or recipient-name overlays from the shipped UI will not be able to create them.
  - The current documentation describes a substantially broader watermark feature than the runtime actually implements.

### 356. The overlays guide's `Perspective Grid` section describes composition guides, but production splits those features between Safe Areas and a perspective-correction mesh

- Severity: Medium
- Area: Documentation / overlay feature model
- Evidence:
  - The overlays guide describes a configurable `Perspective Grid` with rule-of-thirds, golden-ratio, custom-grid, and crosshair modes plus color/line-width/diagonal options in [docs/advanced/overlays.md](/Users/lifeart/Repos/openrv-web/docs/advanced/overlays.md#L150) through [docs/advanced/overlays.md](/Users/lifeart/Repos/openrv-web/docs/advanced/overlays.md#L167).
  - The shipped `PerspectiveGridOverlay` is actually a perspective-correction mesh with four draggable corner handles, a fixed 8x8 subdivision count, and fixed colors in [src/ui/components/PerspectiveGridOverlay.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/PerspectiveGridOverlay.ts#L1) through [src/ui/components/PerspectiveGridOverlay.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/PerspectiveGridOverlay.ts#L13) and [src/ui/components/PerspectiveGridOverlay.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/PerspectiveGridOverlay.ts#L78) through [src/ui/components/PerspectiveGridOverlay.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/PerspectiveGridOverlay.ts#L104).
  - The composition-guide pieces the docs mention are instead attached to `SafeAreasOverlay`, which implements rule-of-thirds, center crosshair, aspect-ratio guides, and configurable color/opacity in [src/ui/components/SafeAreasOverlay.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/SafeAreasOverlay.ts#L1) through [src/ui/components/SafeAreasOverlay.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/SafeAreasOverlay.ts#L29), [src/ui/components/SafeAreasOverlay.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/SafeAreasOverlay.ts#L151) through [src/ui/components/SafeAreasOverlay.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/SafeAreasOverlay.ts#L201), and [src/ui/components/SafeAreasOverlay.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/SafeAreasOverlay.ts#L307) through [src/ui/components/SafeAreasOverlay.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/SafeAreasOverlay.ts#L380).
  - There is no production evidence for the documented golden-ratio, arbitrary row/column grid, diagonal-line, or line-width options.
- Impact:
  - Users are taught to look for one configurable perspective-grid feature, but the shipped app splits part of that into Safe Areas and omits the rest entirely.
  - That makes both the composition-guide workflow and the perspective-correction workflow harder to discover because the docs collapse them into a feature model the UI does not match.

### 357. The session export docs tell users to save `.orvproject` files from the Export menu, but production only exposes RV/GTO exports there

- Severity: Medium
- Area: Documentation / session save workflow
- Evidence:
  - The session save/load guide says users can "Click the Save button in the header bar or use the Export menu to save the current session" in [docs/export/sessions.md](/Users/lifeart/Repos/openrv-web/docs/export/sessions.md#L9) through [docs/export/sessions.md](/Users/lifeart/Repos/openrv-web/docs/export/sessions.md#L11).
  - The shipped export dropdown's `Session` section contains only `Save RV Session (.rv)` and `Save RV Session (.gto)` items, not `.orvproject` save, in [src/ui/components/ExportControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/ExportControl.ts#L198) through [src/ui/components/ExportControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/ExportControl.ts#L201).
  - Production `.orvproject` save is triggered from the header save button wiring, not from `ExportControl`, in [src/ui/components/layout/HeaderBar.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/layout/HeaderBar.ts#L237) through [src/ui/components/layout/HeaderBar.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/layout/HeaderBar.ts#L240) and [src/AppPlaybackWiring.ts](/Users/lifeart/Repos/openrv-web/src/AppPlaybackWiring.ts#L59).
- Impact:
  - Users following the session docs can open the Export menu looking for `.orvproject` save and find only RV/GTO export commands.
  - That makes the primary session-save workflow look missing or mislabeled even though it still exists in the header.

### 358. The frame-export docs promise an error message on clipboard denial, but production clipboard export only logs and returns `false`

- Severity: Medium
- Area: Documentation / frame export feedback
- Evidence:
  - The frame-export guide says that if clipboard access is denied, "an error message appears" in [docs/export/frame-export.md](/Users/lifeart/Repos/openrv-web/docs/export/frame-export.md#L40) through [docs/export/frame-export.md](/Users/lifeart/Repos/openrv-web/docs/export/frame-export.md#L42).
  - The actual clipboard helper catches errors, logs `Failed to copy to clipboard`, and only returns `false` in [src/utils/export/FrameExporter.ts](/Users/lifeart/Repos/openrv-web/src/utils/export/FrameExporter.ts#L152) through [src/utils/export/FrameExporter.ts](/Users/lifeart/Repos/openrv-web/src/utils/export/FrameExporter.ts#L163).
  - `Viewer.copyFrameToClipboard(...)` just forwards that boolean result in [src/ui/components/Viewer.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/Viewer.ts#L3361) through [src/ui/components/Viewer.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/Viewer.ts#L3365), and the keyboard/export action path does not surface any alert for a `false` result in [src/services/KeyboardActionMap.ts](/Users/lifeart/Repos/openrv-web/src/services/KeyboardActionMap.ts#L545) through [src/services/KeyboardActionMap.ts](/Users/lifeart/Repos/openrv-web/src/services/KeyboardActionMap.ts#L549).
- Impact:
  - Users can follow the frame-export docs, hit a browser clipboard denial, and receive no user-visible explanation even though the docs promise one.
  - That makes clipboard export failures look random and silent instead of a permissions issue the user can act on.

### 359. The network-sync guide overstates generic one-click joining from share URLs

- Severity: Medium
- Area: Documentation / network sync onboarding
- Evidence:
  - The network-sync guide says opening a copied shareable URL "automatically populates the room code and initiates a join" in [docs/advanced/network-sync.md](/Users/lifeart/Repos/openrv-web/docs/advanced/network-sync.md#L35), and later describes URL-based signaling as one-click joining without manual entry in [docs/advanced/network-sync.md](/Users/lifeart/Repos/openrv-web/docs/advanced/network-sync.md#L88).
  - During URL bootstrap, production only auto-joins the normal room path when both `room` and `pin` are present, in [src/services/SessionURLService.ts](/Users/lifeart/Repos/openrv-web/src/services/SessionURLService.ts#L295) through [src/services/SessionURLService.ts](/Users/lifeart/Repos/openrv-web/src/services/SessionURLService.ts#L299).
  - Plain room links without a PIN are only prefilled into the UI and do not auto-join, since `handleURLBootstrap()` sets the join field from `room` but skips `joinRoom(...)` unless `pinCode` is also present, in [src/services/SessionURLService.ts](/Users/lifeart/Repos/openrv-web/src/services/SessionURLService.ts#L251) through [src/services/SessionURLService.ts](/Users/lifeart/Repos/openrv-web/src/services/SessionURLService.ts#L260) and [src/services/SessionURLService.ts](/Users/lifeart/Repos/openrv-web/src/services/SessionURLService.ts#L295) through [src/services/SessionURLService.ts](/Users/lifeart/Repos/openrv-web/src/services/SessionURLService.ts#L299).
  - Malformed WebRTC share links are also silently ignored during bootstrap because invalid decoded payloads never produce a UI error path in [src/services/SessionURLService.ts](/Users/lifeart/Repos/openrv-web/src/services/SessionURLService.ts#L263) through [src/services/SessionURLService.ts](/Users/lifeart/Repos/openrv-web/src/services/SessionURLService.ts#L293).
- Impact:
  - Users can rely on the docs for generic one-click join behavior that only works for narrower URL shapes than the guide implies.
  - When a copied link does not auto-join or a malformed invite opens silently, the app appears unreliable instead of merely under-documented.

### 360. The crash-recovery docs say the UI offers restore on `recoveryAvailable`, but production never consumes that event

- Severity: Medium
- Area: Documentation / crash recovery workflow
- Evidence:
  - The session-management guide says startup crash detection emits `recoveryAvailable` and "the UI offers to restore from the most recent auto-save entry" in [docs/advanced/session-management.md](/Users/lifeart/Repos/openrv-web/docs/advanced/session-management.md#L163) through [docs/advanced/session-management.md](/Users/lifeart/Repos/openrv-web/docs/advanced/session-management.md#L170).
  - `AutoSaveManager` does define and emit that event during startup recovery detection in [src/core/session/AutoSaveManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/AutoSaveManager.ts#L60) and [src/core/session/AutoSaveManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/AutoSaveManager.ts#L119).
  - A production-code search finds no `on('recoveryAvailable', ...)` subscriber outside tests, so there is no live UI hook for the event.
- Impact:
  - Users following the crash-recovery docs can expect an automatic restore prompt that the shipped app does not actually wire from the emitted event.
  - That makes recovery behavior feel inconsistent and harder to trust after an unclean shutdown.

### 361. The stabilization docs describe controls and viewer progress UI that the shipped stabilization panel does not provide

- Severity: Medium
- Area: Documentation / stabilization workflow
- Evidence:
  - The effects guide describes a short pre-analysis pass with a progress indicator in the viewer, and lists translation and rotation enable/disable controls in [docs/advanced/filters-effects.md](/Users/lifeart/Repos/openrv-web/docs/advanced/filters-effects.md#L85) through [docs/advanced/filters-effects.md](/Users/lifeart/Repos/openrv-web/docs/advanced/filters-effects.md#L90).
  - The shipped `StabilizationControl` only exposes three user-facing controls: `Enabled`, `Smoothing Strength`, and `Crop Amount` in [src/ui/components/StabilizationControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/StabilizationControl.ts#L158) through [src/ui/components/StabilizationControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/StabilizationControl.ts#L203).
  - A production-code search finds no viewer-side stabilization progress indicator or progress UI path.
  - The underlying effect adapter does still mention `stabilizationAutoMotion`, but there is no corresponding shipped panel control for the documented translation/rotation toggles in [src/effects/adapters/StabilizationEffect.ts](/Users/lifeart/Repos/openrv-web/src/effects/adapters/StabilizationEffect.ts#L13) through [src/effects/adapters/StabilizationEffect.ts#L18).
- Impact:
  - Users following the stabilization docs can look for controls and progress feedback that the shipped panel never surfaces.
  - That makes stabilization feel incomplete or broken in production even when the simpler crop/smoothing implementation is working as designed.

### 362. The display-profile guide promises a viewer status-area profile indicator that production does not expose

- Severity: Low
- Area: Documentation / display-profile feedback
- Evidence:
  - The display-profile guide says `Shift+Alt+D` cycles display profiles and that "The active profile name appears in the viewer status area" in [docs/color/display-profiles.md](/Users/lifeart/Repos/openrv-web/docs/color/display-profiles.md#L22) through [docs/color/display-profiles.md](/Users/lifeart/Repos/openrv-web/docs/color/display-profiles.md#L24).
  - The shipped `DisplayProfileControl` does provide the `Shift+Alt+D` shortcut and the dropdown/button UI in [src/ui/components/DisplayProfileControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/DisplayProfileControl.ts#L56) through [src/ui/components/DisplayProfileControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/DisplayProfileControl.ts#L59), but it does not create any separate viewer status indicator.
  - A production-code search for display-profile status rendering only finds the control itself and its tests; there is no viewer HUD/status widget that displays the active profile name.
- Impact:
  - Users following the guide can look for an on-viewer status readout that never appears.
  - That makes profile cycling feel less observable than the docs imply, especially when using only the keyboard shortcut.

### 363. The shortcut-cheat-sheet docs promise outside-click dismissal, but the shipped overlay has no such path

- Severity: Low
- Area: Documentation / shortcut help UI
- Evidence:
  - The keyboard-shortcuts guide says the shortcut cheat sheet "is dismissed by pressing `Escape` or clicking outside the panel" in [docs/reference/keyboard-shortcuts.md](/Users/lifeart/Repos/openrv-web/docs/reference/keyboard-shortcuts.md#L185) through [docs/reference/keyboard-shortcuts.md#L187).
  - The shipped `ShortcutCheatSheet` component only exposes `show()`, `hide()`, `toggle()`, and `isVisible()` around a bare overlay element in [src/ui/components/ShortcutCheatSheet.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/ShortcutCheatSheet.ts#L31) through [src/ui/components/ShortcutCheatSheet.ts#L70); it does not register any outside-click or backdrop-dismiss listener.
  - Production dismissal is wired through the global `panel.close` Escape path, which explicitly hides the cheat sheet when visible in [src/services/KeyboardActionMap.ts](/Users/lifeart/Repos/openrv-web/src/services/KeyboardActionMap.ts#L462) through [src/services/KeyboardActionMap.ts#L466).
- Impact:
  - Users can follow the docs, click outside the `?` overlay, and get no dismissal even though the guide says that interaction should work.
  - That makes the shortcut-help surface feel stuck or inconsistent unless the user already knows the keyboard-only exit path.

### 364. The annotation-import docs promise merge and frame-offset workflows, but the shipped UI always replaces in place

- Severity: Medium
- Area: Documentation / annotation import workflow
- Evidence:
  - The annotation export/import guide says annotation import supports `Merge` and `Frame offset` workflows in [docs/annotations/export.md](/Users/lifeart/Repos/openrv-web/docs/annotations/export.md#L25) through [docs/annotations/export.md#L31).
  - The shipped Export menu exposes only a single `Import Annotations (JSON)` action in [src/ui/components/ExportControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/ExportControl.ts#L205) through [src/ui/components/ExportControl.ts#L209).
  - Production import wiring always calls `applyAnnotationsJSON(...)` with `{ mode: 'replace' }` and tells the user "Existing annotations were replaced" in [src/AppPlaybackWiring.ts](/Users/lifeart/Repos/openrv-web/src/AppPlaybackWiring.ts#L253) through [src/AppPlaybackWiring.ts#L274).
  - The lower-level utility still supports both `mode: 'merge'` and `frameOffset`, but the shipped UI never exposes either option in [src/utils/export/AnnotationJSONExporter.ts](/Users/lifeart/Repos/openrv-web/src/utils/export/AnnotationJSONExporter.ts#L199) through [src/utils/export/AnnotationJSONExporter.ts#L218).
- Impact:
  - Users following the docs can expect to merge imported annotations into an existing review or shift them for retimed media, but the live app only offers destructive replacement.
  - That turns a documented interchange workflow into a lossy overwrite operation unless the user writes code against the utility layer.

### 365. The session-management docs tell users to delete auto-save entries from the Snapshot Panel, but that panel does not manage auto-saves

- Severity: Medium
- Area: Documentation / session-storage cleanup
- Evidence:
  - The session-management guide says, "To free storage, delete old snapshots and auto-save entries from the Snapshot Panel" in [docs/advanced/session-management.md](/Users/lifeart/Repos/openrv-web/docs/advanced/session-management.md#L180) through [docs/advanced/session-management.md#L186).
  - The shipped `SnapshotPanel` is a snapshot browser with `Create Snapshot`, `Import`, and per-snapshot restore/export/delete actions in [src/ui/components/SnapshotPanel.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/SnapshotPanel.ts#L1) through [src/ui/components/SnapshotPanel.ts#L10) and [src/ui/components/SnapshotPanel.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/SnapshotPanel.ts#L187) through [src/ui/components/SnapshotPanel.ts#L249).
  - The underlying `SnapshotManager` models manual snapshots and auto-checkpoints, not `AutoSaveManager` entries, in [src/core/session/SnapshotManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SnapshotManager.ts#L5) through [src/core/session/SnapshotManager.ts#L24) and [src/core/session/SnapshotManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SnapshotManager.ts#L121) through [src/core/session/SnapshotManager.ts#L183).
  - The same docs page separately describes a `History Panel` as the place for auto-save history and recovery in [docs/advanced/session-management.md](/Users/lifeart/Repos/openrv-web/docs/advanced/session-management.md#L190) through [docs/advanced/session-management.md#L199), which does not match the shipped history UI either.
- Impact:
  - Users trying to free storage via the documented panel cannot actually remove auto-save entries there, because that panel only manages snapshots and auto-checkpoints.
  - That makes a concrete maintenance workflow in the docs impossible to complete from the named UI.

### 366. The annotation-export docs say the export items appear only when annotations exist, but the shipped menu shows them all the time

- Severity: Low
- Area: Documentation / export menu behavior
- Evidence:
  - The annotation export page says "Both export options appear in the Export dropdown menu ... when annotations exist in the session" in [docs/annotations/export.md](/Users/lifeart/Repos/openrv-web/docs/annotations/export.md#L84) through [docs/annotations/export.md#L89).
  - The shipped `ExportControl` builds `Export Annotations (JSON)` and `Export Annotations (PDF)` as unconditional menu items in [src/ui/components/ExportControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/ExportControl.ts#L205) through [src/ui/components/ExportControl.ts#L209).
  - There is no production visibility guard around those menu items based on current annotation count; the control builds the same menu structure up front.
- Impact:
  - Users can read the docs and expect the annotation export entries to appear only after creating annotations, but the shipped menu always contains them.
  - That weakens the docs as a guide to real UI state and makes the menu behavior look inconsistent with the documented workflow.

### 367. The FAQ still tells users plain `L` cycles loop mode, but the real shortcut is `Ctrl+L`

- Severity: Low
- Area: Documentation / playback shortcuts
- Evidence:
  - The FAQ says, "Press `L` to cycle between" loop modes in [docs/reference/faq.md](/Users/lifeart/Repos/openrv-web/docs/reference/faq.md#L67) through [docs/reference/faq.md#L69).
  - The canonical keyboard shortcuts page documents `Ctrl+L` for loop-mode cycling in [docs/reference/keyboard-shortcuts.md](/Users/lifeart/Repos/openrv-web/docs/reference/keyboard-shortcuts.md#L52).
  - The shipped header tooltip also advertises `Cycle loop mode (Ctrl+L)` in [src/ui/components/layout/HeaderBar.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/layout/HeaderBar.ts#L325) through [src/ui/components/layout/HeaderBar.ts#L326).
- Impact:
  - Users following the FAQ can press plain `L`, change playback speed instead of loop mode, and conclude the app ignored the documented shortcut.
  - That creates avoidable confusion in a basic playback workflow that already has an overloaded key space.

### 368. The review docs promise a shot-status badge in the header, but production has no such header status UI

- Severity: Medium
- Area: Documentation / review workflow UI
- Evidence:
  - The review workflow guide says, "The current shot status is displayed as a colored badge in the header bar next to the source name" and that it follows the visible clip during playlist playback in [docs/advanced/review-workflow.md](/Users/lifeart/Repos/openrv-web/docs/advanced/review-workflow.md#L26).
  - A production UI search finds status badges only in note and ShotGrid-related surfaces, such as [src/ui/components/NotePanel.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/NotePanel.ts#L522) and [src/ui/components/ShotGridPanel.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/ShotGridPanel.ts#L7), not in the main header bar.
  - There is no corresponding header-bar component or wiring path that reads `StatusManager` and renders a source-adjacent status badge in [src/ui/components/layout/HeaderBar.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/layout/HeaderBar.ts).
- Impact:
  - Users following the review docs can look for a persistent header-level status readout that never appears in the shipped app.
  - That makes shot-status tracking feel partially missing even before users hit the deeper limitation that there is no real production status-management UI.

### 369. The network-sync docs say the header badge shows participant count, but production hides it for a one-person room

- Severity: Low
- Area: Documentation / collaboration header UI
- Evidence:
  - The network-sync guide says, "The network button badge displays the current participant count" in [docs/advanced/network-sync.md](/Users/lifeart/Repos/openrv-web/docs/advanced/network-sync.md#L45) through [docs/advanced/network-sync.md#L47).
  - The shipped `NetworkControl` only shows the badge when `count > 1`; for a solo host or solo reconnect state it explicitly hides the badge in [src/ui/components/NetworkControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/NetworkControl.ts#L1151) through [src/ui/components/NetworkControl.ts#L1158).
- Impact:
  - Users following the docs can expect a visible `1` badge after creating a room, but the shipped header shows no participant count until someone else joins.
  - That makes the header control less informative than the docs imply during the common “host waiting for others” state.

### 370. The network-sync docs say the host is labeled `You (Host)`, but production only shows a plain `Host` badge

- Severity: Low
- Area: Documentation / collaboration participant list
- Evidence:
  - The network-sync guide says the connection panel labels the host as `You (Host)` in [docs/advanced/network-sync.md](/Users/lifeart/Repos/openrv-web/docs/advanced/network-sync.md#L45).
  - The shipped user-list renderer shows `user.name` and, when `user.isHost`, appends a badge whose text is just `Host` in [src/ui/components/NetworkControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/NetworkControl.ts#L1303) through [src/ui/components/NetworkControl.ts#L1320).
  - There is no production self/other distinction in that label path, so the host never gets a literal `You (Host)` treatment.
- Impact:
  - Users following the guide can expect a self-aware host label in the participant list and instead see only a generic host badge.
  - That makes the participant list slightly less clear in collaborative sessions, especially when the stored display name is also generic.

### 371. The playback docs describe a labeled loop-mode button, but production renders an icon-only compact control

- Severity: Low
- Area: Documentation / playback controls
- Evidence:
  - The loop-mode guide says the header button "shows an icon and label (e.g., `Loop`, `Ping`, `Once`) and has a minimum width of 70px" in [docs/playback/loop-modes-stepping.md](/Users/lifeart/Repos/openrv-web/docs/playback/loop-modes-stepping.md#L39).
  - The UI overview likewise says the loop control "displays current mode (Loop, Ping, Once)" in [docs/getting-started/ui-overview.md](/Users/lifeart/Repos/openrv-web/docs/getting-started/ui-overview.md#L84).
  - The shipped header creates the loop button with a `28px` minimum width in [src/ui/components/layout/HeaderBar.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/layout/HeaderBar.ts#L325) through [src/ui/components/layout/HeaderBar.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/layout/HeaderBar.ts#L328).
  - Runtime updates replace the button contents with SVG only and move the text label into `aria-label`, not visible UI, in [src/ui/components/layout/HeaderBar.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/layout/HeaderBar.ts#L1346) through [src/ui/components/layout/HeaderBar.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/layout/HeaderBar.ts#L1360).
- Impact:
  - Users following the docs can look for visible `Loop` / `Ping` / `Once` text in the header and instead find only a compact icon.
  - That makes the current mode less glanceable than the documentation implies, especially for users still learning the transport controls.

### 372. Production 360 auto-detection throws away spherical metadata and falls back to aspect ratio only

- Severity: Medium
- Area: Viewer / spherical projection
- Evidence:
  - The viewer-navigation guide says 360 detection works via metadata or 2:1 aspect ratio in [docs/playback/viewer-navigation.md](/Users/lifeart/Repos/openrv-web/docs/playback/viewer-navigation.md#L90) through [docs/playback/viewer-navigation.md](/Users/lifeart/Repos/openrv-web/docs/playback/viewer-navigation.md#L97).
  - The detection helper does support explicit `isSpherical` and `projectionType === 'equirectangular'` metadata in [src/render/SphericalProjection.ts](/Users/lifeart/Repos/openrv-web/src/render/SphericalProjection.ts#L320) through [src/render/SphericalProjection.ts](/Users/lifeart/Repos/openrv-web/src/render/SphericalProjection.ts#L333).
  - But the production source-load path calls `detect360Content({}, width, height)` with an empty metadata object in [src/services/LayoutOrchestrator.ts](/Users/lifeart/Repos/openrv-web/src/services/LayoutOrchestrator.ts#L409) through [src/services/LayoutOrchestrator.ts](/Users/lifeart/Repos/openrv-web/src/services/LayoutOrchestrator.ts#L417).
- Impact:
  - Metadata-tagged 360 content that is not close to 2:1 will not auto-enable spherical viewing even though the underlying detector supports that path.
  - Explicit non-spherical metadata also cannot suppress 2:1 false positives, because production never forwards the metadata to the detector.

### 373. Plain media loads leave the header title at `Untitled` unless the user manually renames the session

- Severity: Medium
- Area: Header UI / session context
- Evidence:
  - Fresh session metadata starts with an empty `displayName` in [src/core/session/SessionGraph.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionGraph.ts#L60) through [src/core/session/SessionGraph.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionGraph.ts#L66).
  - The header’s main title renders `metadata.displayName || 'Untitled'` in [src/ui/components/layout/HeaderBar.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/layout/HeaderBar.ts#L590) through [src/ui/components/layout/HeaderBar.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/layout/HeaderBar.ts#L597).
  - The normal `sourceLoaded` handler updates info panels, crop dimensions, OCIO state, and HDR behavior, but it never assigns a display name from the loaded source in [src/handlers/sourceLoadedHandlers.ts](/Users/lifeart/Repos/openrv-web/src/handlers/sourceLoadedHandlers.ts#L166) through [src/handlers/sourceLoadedHandlers.ts](/Users/lifeart/Repos/openrv-web/src/handlers/sourceLoadedHandlers.ts#L190).
  - A production-code search finds `setDisplayName(...)` only in the manual rename path and session-metadata internals, not in the standard file-load flow, as shown by [src/ui/components/layout/HeaderBar.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/layout/HeaderBar.ts#L587).
- Impact:
  - After loading ordinary media from a clean session, the header’s primary label can still say `Untitled` instead of reflecting the file the user is reviewing.
  - That removes a basic piece of glanceable context from the main chrome and makes docs that talk about header-adjacent source context feel more misleading than they need to.

### 374. Snapshot creation is hardwired to anonymous quick-save behavior instead of the documented name-and-description flow

- Severity: Medium
- Area: Snapshot workflow / documentation
- Evidence:
  - The session-management guide says users should click `Create Snapshot` and then "Provide a name and optional description" in [docs/advanced/session-management.md](/Users/lifeart/Repos/openrv-web/docs/advanced/session-management.md#L94).
  - The shipped Snapshot panel’s `Create Snapshot` button only emits a bare `createRequested` event with no prompt UI or metadata form in [src/ui/components/SnapshotPanel.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/SnapshotPanel.ts#L198) through [src/ui/components/SnapshotPanel.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/SnapshotPanel.ts#L211).
  - Production wiring maps that event directly to `persistenceManager.createQuickSnapshot()` in [src/AppPlaybackWiring.ts](/Users/lifeart/Repos/openrv-web/src/AppPlaybackWiring.ts#L327) through [src/AppPlaybackWiring.ts](/Users/lifeart/Repos/openrv-web/src/AppPlaybackWiring.ts#L329).
  - `createQuickSnapshot()` auto-generates a timestamp name like `Snapshot 10:42:13 PM` and never supplies a description to `snapshotManager.createSnapshot(...)` in [src/AppPersistenceManager.ts](/Users/lifeart/Repos/openrv-web/src/AppPersistenceManager.ts#L165) through [src/AppPersistenceManager.ts](/Users/lifeart/Repos/openrv-web/src/AppPersistenceManager.ts#L181).
- Impact:
  - Users cannot name or describe a snapshot at creation time even though the docs present that as the normal workflow.
  - That makes the snapshot list harder to curate for real review sessions, especially when multiple checkpoints are created close together.

### 375. Auto-save settings expose only 1-50 saved versions even though the manager and docs support 1-100

- Severity: Low
- Area: Auto-save settings UI / documentation
- Evidence:
  - The session-management guide documents `Max versions` as `1--100` in [docs/advanced/session-management.md](/Users/lifeart/Repos/openrv-web/docs/advanced/session-management.md#L136) through [docs/advanced/session-management.md](/Users/lifeart/Repos/openrv-web/docs/advanced/session-management.md#L140).
  - `AutoSaveManager` also clamps `maxVersions` to `1..100` in [src/core/session/AutoSaveManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/AutoSaveManager.ts#L552).
  - But the shipped auto-save settings popover creates its `Max versions` range input with `max = '50'` in [src/ui/components/AutoSaveIndicator.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/AutoSaveIndicator.ts#L318) through [src/ui/components/AutoSaveIndicator.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/AutoSaveIndicator.ts#L327).
  - The same component’s config import/storage path still accepts values up to `100` in [src/ui/components/AutoSaveIndicator.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/AutoSaveIndicator.ts#L463) through [src/ui/components/AutoSaveIndicator.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/AutoSaveIndicator.ts#L464), so the narrower limit is UI-only.
- Impact:
  - Users cannot set the documented upper half of the supported retention range from the shipped UI.
  - That also means imported or persisted values above 50 are outside the control’s visible authored range, which makes the settings surface less trustworthy.

### 376. Auto-checkpoints are documented as broad safety nets before major operations, but production only creates them for restore and project-load flows

- Severity: Medium
- Area: Snapshots / recovery workflow / documentation
- Evidence:
  - The session-management guide says, "Auto-checkpoints are generated before major operations (e.g., loading new media, clearing annotations)" in [docs/advanced/session-management.md](/Users/lifeart/Repos/openrv-web/docs/advanced/session-management.md#L96).
  - Production only defines checkpoint creation in [src/AppPersistenceManager.ts](/Users/lifeart/Repos/openrv-web/src/AppPersistenceManager.ts#L194) through [src/AppPersistenceManager.ts](/Users/lifeart/Repos/openrv-web/src/AppPersistenceManager.ts#L212).
  - A production-code search shows live call sites only before snapshot restore and project/session load in [src/AppPersistenceManager.ts](/Users/lifeart/Repos/openrv-web/src/AppPersistenceManager.ts#L227) through [src/AppPersistenceManager.ts](/Users/lifeart/Repos/openrv-web/src/AppPersistenceManager.ts#L234), [src/AppPersistenceManager.ts](/Users/lifeart/Repos/openrv-web/src/AppPersistenceManager.ts#L349) through [src/AppPersistenceManager.ts](/Users/lifeart/Repos/openrv-web/src/AppPersistenceManager.ts#L356), and [src/AppPersistenceManager.ts](/Users/lifeart/Repos/openrv-web/src/AppPersistenceManager.ts#L385) through [src/AppPersistenceManager.ts](/Users/lifeart/Repos/openrv-web/src/AppPersistenceManager.ts#L393).
  - There is no corresponding checkpoint wiring around ordinary media loads, annotation clearing, or similar destructive editing paths.
- Impact:
  - Users can trust auto-checkpoints to protect routine destructive actions that the shipped app never checkpoints.
  - That makes the documented safety net much narrower than it sounds, especially during active review/editing work where people are not explicitly loading projects.

### 378. Snapshot descriptions are searchable and displayable, but the shipped UI never lets users author or edit them

- Severity: Low
- Area: Snapshot workflow / UI completeness
- Evidence:
  - The Snapshot panel supports searching by description and renders description text on cards in [src/ui/components/SnapshotPanel.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/SnapshotPanel.ts#L130) through [src/ui/components/SnapshotPanel.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/SnapshotPanel.ts#L145) and [src/ui/components/SnapshotPanel.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/SnapshotPanel.ts#L385) through [src/ui/components/SnapshotPanel.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/SnapshotPanel.ts#L398).
  - The shipped actions only expose create, import, restore, rename, export, delete, and clear-all in [src/ui/components/SnapshotPanel.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/SnapshotPanel.ts#L197) through [src/ui/components/SnapshotPanel.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/SnapshotPanel.ts#L260) and [src/ui/components/SnapshotPanel.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/SnapshotPanel.ts#L540) through [src/ui/components/SnapshotPanel.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/SnapshotPanel.ts#L569).
  - The underlying manager does have an `updateDescription(...)` API in [src/core/session/SnapshotManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SnapshotManager.ts#L405) through [src/core/session/SnapshotManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SnapshotManager.ts#L420), but a production-code search finds no live caller for it.
- Impact:
  - In normal production use, snapshot descriptions are effectively import-only metadata even though the panel treats them like a first-class searchable field.
  - That makes the description search/filter path much less useful for real in-app snapshot curation than the UI suggests.

### 380. The auto-save interval setting is mostly bypassed by a hardcoded 2-second save path

- Severity: Medium
- Area: Auto-save timing semantics
- Evidence:
  - The session-management guide says the system saves "at the configured interval" after state becomes dirty in [docs/advanced/session-management.md](/Users/lifeart/Repos/openrv-web/docs/advanced/session-management.md#L142) through [docs/advanced/session-management.md](/Users/lifeart/Repos/openrv-web/docs/advanced/session-management.md#L147).
  - `AutoSaveManager` does have an interval timer keyed off the configured minutes value in [src/core/session/AutoSaveManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/AutoSaveManager.ts#L219) through [src/core/session/AutoSaveManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/AutoSaveManager.ts#L226).
  - But every `markDirty(...)` call also starts a separate hardcoded `2000ms` debounce that directly saves the session in [src/core/session/AutoSaveManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/AutoSaveManager.ts#L276) through [src/core/session/AutoSaveManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/AutoSaveManager.ts#L290).
  - Production invokes that dirty-mark path for routine review interactions like frame changes, marks, annotations, and effects in [src/handlers/persistenceHandlers.ts](/Users/lifeart/Repos/openrv-web/src/handlers/persistenceHandlers.ts#L36) through [src/handlers/persistenceHandlers.ts](/Users/lifeart/Repos/openrv-web/src/handlers/persistenceHandlers.ts#L39) and [src/App.ts](/Users/lifeart/Repos/openrv-web/src/App.ts#L781) through [src/App.ts](/Users/lifeart/Repos/openrv-web/src/App.ts#L784).
- Impact:
  - In normal use, the selected interval is not the real cadence users get; most changes are saved after about two seconds of inactivity instead.
  - That makes the interval control misleading and changes the storage/performance tradeoff users think they are configuring.

### 381. Snapshot import bypasses the documented snapshot-retention limits

- Severity: Low
- Area: Snapshot storage / import workflow
- Evidence:
  - The session-management guide documents hard limits of 50 manual snapshots and 10 auto-checkpoints in [docs/advanced/session-management.md](/Users/lifeart/Repos/openrv-web/docs/advanced/session-management.md#L118) through [docs/advanced/session-management.md#L122).
  - Normal in-app snapshot creation enforces those limits by pruning after `createSnapshot(...)` and `createAutoCheckpoint(...)` in [src/core/session/SnapshotManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SnapshotManager.ts#L124) through [src/core/session/SnapshotManager.ts#L152) and [src/core/session/SnapshotManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SnapshotManager.ts#L159) through [src/core/session/SnapshotManager.ts#L188).
  - But `importSnapshot(...)` writes the imported snapshot and notifies listeners without calling any prune path in [src/core/session/SnapshotManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SnapshotManager.ts#L508) through [src/core/session/SnapshotManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SnapshotManager.ts#L539).
- Impact:
  - Users can exceed the documented retention limits simply by importing snapshot files, so the storage model behaves differently depending on how entries were created.
  - That makes the snapshot limits less trustworthy and can leave more retained state than the UI/docs imply.

### 382. The session export docs say RV/GTO sessions are import-only, but the shipped Export menu still saves `.rv` and `.gto`

- Severity: Low
- Area: Documentation / session export workflow
- Evidence:
  - The session export guide says, "GTO sessions are read-only imports -- they are not re-exported in GTO format. Session changes are saved as `.orvproject` files" in [docs/export/sessions.md](/Users/lifeart/Repos/openrv-web/docs/export/sessions.md#L47) through [docs/export/sessions.md](/Users/lifeart/Repos/openrv-web/docs/export/sessions.md#L56).
  - The shipped Export control still adds `Save RV Session (.rv)` and `Save RV Session (.gto)` menu items in [src/ui/components/ExportControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/ExportControl.ts#L200) through [src/ui/components/ExportControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/ExportControl.ts#L201).
  - Those menu actions are wired in production to `persistenceManager.saveRvSession(format)` in [src/AppPlaybackWiring.ts](/Users/lifeart/Repos/openrv-web/src/AppPlaybackWiring.ts#L248) through [src/AppPlaybackWiring.ts](/Users/lifeart/Repos/openrv-web/src/AppPlaybackWiring.ts#L250), and that path really writes `.rv` / `.gto` files in [src/AppPersistenceManager.ts](/Users/lifeart/Repos/openrv-web/src/AppPersistenceManager.ts#L319) through [src/AppPersistenceManager.ts](/Users/lifeart/Repos/openrv-web/src/AppPersistenceManager.ts#L333).
- Impact:
  - Users reading the docs can conclude RV/GTO export is unavailable and miss a shipped workflow that the UI still exposes.
  - That also makes the session-format story harder to trust because the docs and the export menu disagree on a basic capability boundary.

### 383. The file-reload docs promise a real Cancel path, but production treats close and Escape the same as Skip

- Severity: Medium
- Area: Session restore / blob reload workflow
- Evidence:
  - The session export guide says the user can "select the original file, skip the reference, or cancel" in [docs/export/sessions.md](/Users/lifeart/Repos/openrv-web/docs/export/sessions.md#L39) through [docs/export/sessions.md](/Users/lifeart/Repos/openrv-web/docs/export/sessions.md#L45).
  - The shipped file-reload dialog only renders `Browse`, `Load`, and `Skip` actions in [src/ui/components/shared/Modal.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/shared/Modal.ts#L724) through [src/ui/components/shared/Modal.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/shared/Modal.ts#L742).
  - Closing the dialog or pressing `Escape` resolves `null` through the same code path as Skip in [src/ui/components/shared/Modal.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/shared/Modal.ts#L588) through [src/ui/components/shared/Modal.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/shared/Modal.ts#L595) and [src/ui/components/shared/Modal.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/shared/Modal.ts#L709) through [src/ui/components/shared/Modal.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/shared/Modal.ts#L715).
  - `SessionSerializer.fromJSON()` treats any `null` result as a skipped reload and continues loading with a warning in [src/core/session/SessionSerializer.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionSerializer.ts#L475) through [src/core/session/SessionSerializer.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionSerializer.ts#L489).
- Impact:
  - Users cannot actually cancel the whole restore/reload flow from that dialog even though the docs say they can.
  - Dismissing the prompt can silently degrade the restored session instead of aborting the operation, which is materially different from a true cancel action.

### 385. The restore-time file picker narrows non-video reloads to `image/*` instead of the app's full supported media set

- Severity: Medium
- Area: Session restore / media reload compatibility
- Evidence:
  - The app's normal media picker accepts the full supported extension list through `SUPPORTED_MEDIA_ACCEPT`, including pro image formats such as EXR, DPX, TIFF, and RAW extensions, in [src/utils/media/SupportedMediaFormats.ts](/Users/lifeart/Repos/openrv-web/src/utils/media/SupportedMediaFormats.ts#L10) through [src/utils/media/SupportedMediaFormats.ts](/Users/lifeart/Repos/openrv-web/src/utils/media/SupportedMediaFormats.ts#L42) and [src/utils/media/SupportedMediaFormats.ts](/Users/lifeart/Repos/openrv-web/src/utils/media/SupportedMediaFormats.ts#L117) through [src/utils/media/SupportedMediaFormats.ts](/Users/lifeart/Repos/openrv-web/src/utils/media/SupportedMediaFormats.ts#L124).
  - The main header file input uses that broader accept string in [src/ui/components/layout/HeaderBar.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/layout/HeaderBar.ts#L219).
  - But the session-restore path hardcodes `accept = 'image/*'` for every non-video reload prompt in [src/core/session/SessionSerializer.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionSerializer.ts#L472) through [src/core/session/SessionSerializer.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionSerializer.ts#L476).
  - This is an inference from the picker filter: many browser file pickers use `accept` to hide or de-prioritize files whose MIME types are not recognized as generic web images, even when the app itself supports those extensions.
- Impact:
  - Recovering supported local EXR/DPX/RAW-style media can become harder than loading the same files through the normal Open Media entry point.
  - That makes the restore workflow less capable than the app's advertised format support, specifically in the crash/project-recovery path where users most need reliable file reattachment.

### 386. The docs say `.orvproject` files can be dragged onto the viewer, but the viewer drop handler does not support them

- Severity: Medium
- Area: Project loading / drag-and-drop
- Evidence:
  - The session export guide says users can load a `.orvproject` "through the file picker ... or by dragging the file onto the viewer" in [docs/export/sessions.md](/Users/lifeart/Repos/openrv-web/docs/export/sessions.md#L35).
  - The session-management guide repeats the same viewer-drop workflow in [docs/advanced/session-management.md](/Users/lifeart/Repos/openrv-web/docs/advanced/session-management.md#L67).
  - The viewer drop handler only special-cases `.rvedl`, `.rv`, and `.gto`, then falls through to sequence/media loading in [src/ui/components/ViewerInputHandler.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/ViewerInputHandler.ts#L709) through [src/ui/components/ViewerInputHandler.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/ViewerInputHandler.ts#L819).
  - A dropped `.orvproject` therefore reaches `session.loadFile(file)` in the generic file loop, but `loadFile(...)` only accepts media types detected as image/video and rejects unknown extensions in [src/core/session/SessionMedia.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionMedia.ts#L379) through [src/core/session/SessionMedia.ts#L393](/Users/lifeart/Repos/openrv-web/src/core/session/SessionMedia.ts#L393).
- Impact:
  - Users following the documented drag-and-drop project workflow will get a load error instead of opening the project.
  - That makes project restore behavior inconsistent between the explicit Open Project button and the viewer’s drop zone.

### 387. The RV/GTO companion-file resolution path is effectively unreachable from the shipped Open Project picker

- Severity: Medium
- Area: Project loading / session sidecars
- Evidence:
  - `openProject(file, companionFiles)` explicitly supports additional media/CDL sidecar files for `.rv` / `.gto` resolution in [src/AppPersistenceManager.ts](/Users/lifeart/Repos/openrv-web/src/AppPersistenceManager.ts#L339) through [src/AppPersistenceManager.ts](/Users/lifeart/Repos/openrv-web/src/AppPersistenceManager.ts#L341) and [src/AppPersistenceManager.ts](/Users/lifeart/Repos/openrv-web/src/AppPersistenceManager.ts#L396) through [src/AppPersistenceManager.ts](/Users/lifeart/Repos/openrv-web/src/AppPersistenceManager.ts#L402).
  - The header wiring forwards all selected files from the hidden project input to that API in [src/AppPlaybackWiring.ts](/Users/lifeart/Repos/openrv-web/src/AppPlaybackWiring.ts#L60) through [src/AppPlaybackWiring.ts](/Users/lifeart/Repos/openrv-web/src/AppPlaybackWiring.ts#L61).
  - But the shipped project input only accepts `.orvproject,.rv,.gto,.rvedl` in [src/ui/components/layout/HeaderBar.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/layout/HeaderBar.ts#L226) through [src/ui/components/layout/HeaderBar.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/layout/HeaderBar.ts#L231), so users cannot normally select the non-session media/CDL companion files that the resolver expects.
- Impact:
  - The code supports basename-based RV/GTO sidecar recovery, but the primary shipped Open Project picker does not let users provide the needed sidecar files.
  - In practice that leaves drag-and-drop as the only obvious path for companion resolution, which makes the “Open Project” flow less capable than the underlying implementation suggests.

### 388. The Open Project picker allows multiple files, but the app still treats only the first selected file as the real project

- Severity: Low
- Area: Project loading / picker behavior
- Evidence:
  - The shipped hidden project input is configured with `multiple = true` in [src/ui/components/layout/HeaderBar.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/layout/HeaderBar.ts#L226) through [src/ui/components/layout/HeaderBar.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/layout/HeaderBar.ts#L229).
  - `handleProjectOpen(...)` forwards the entire `FileList` as-is in [src/ui/components/layout/HeaderBar.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/layout/HeaderBar.ts#L1503) through [src/ui/components/layout/HeaderBar.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/layout/HeaderBar.ts#L1508).
  - But production wiring always calls `openProject(files[0]!, files.slice(1))`, so only the first selected file is treated as the actual project/session and every remaining file is demoted to a companion slot in [src/AppPlaybackWiring.ts](/Users/lifeart/Repos/openrv-web/src/AppPlaybackWiring.ts#L60) through [src/AppPlaybackWiring.ts](/Users/lifeart/Repos/openrv-web/src/AppPlaybackWiring.ts#L61).
  - In the `.orvproject` branch, those extra selected files are ignored entirely because `companionFiles` are only used for `.rv` / `.gto` handling in [src/AppPersistenceManager.ts](/Users/lifeart/Repos/openrv-web/src/AppPersistenceManager.ts#L348) through [src/AppPersistenceManager.ts](/Users/lifeart/Repos/openrv-web/src/AppPersistenceManager.ts#L384) and [src/AppPersistenceManager.ts](/Users/lifeart/Repos/openrv-web/src/AppPersistenceManager.ts#L396) through [src/AppPersistenceManager.ts](/Users/lifeart/Repos/openrv-web/src/AppPersistenceManager.ts#L402).
- Impact:
  - The picker UI suggests multi-file project opening is meaningful, but selecting multiple project/session files has ambiguous or ignored results.
  - That makes the Open Project affordance less predictable than the single-project mental model the runtime actually implements.

### 389. The `Open project` picker also accepts `.rvedl`, even though that path does not open a project

- Severity: Low
- Area: Project loading UI / EDL workflow
- Evidence:
  - The shipped project input accepts `.orvproject,.rv,.gto,.rvedl` in [src/ui/components/layout/HeaderBar.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/layout/HeaderBar.ts#L226) through [src/ui/components/layout/HeaderBar.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/layout/HeaderBar.ts#L229).
  - The same button is presented simply as `Open project` in [src/ui/components/layout/HeaderBar.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/layout/HeaderBar.ts#L243).
  - But the `.rvedl` branch in `openProject(...)` only parses EDL text and calls `session.loadEDL(text)`; it does not restore project/session state in [src/AppPersistenceManager.ts](/Users/lifeart/Repos/openrv-web/src/AppPersistenceManager.ts#L418) through [src/AppPersistenceManager.ts](/Users/lifeart/Repos/openrv-web/src/AppPersistenceManager.ts#L423).
- Impact:
  - The project-opening affordance bundles a timeline-import format that behaves fundamentally differently from a real project/session load.
  - That makes the button’s semantics fuzzy and increases the chance that users expect a session replacement when they are really just importing an edit list.

### 390. `SnapshotManager` advertises a `snapshotRestored` event, but production never emits it

- Severity: Low
- Area: Snapshot subsystem / event contract
- Evidence:
  - `SnapshotManagerEvents` declares `snapshotRestored` in [src/core/session/SnapshotManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SnapshotManager.ts#L43) through [src/core/session/SnapshotManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SnapshotManager.ts#L52).
  - A production-code search finds no `emit('snapshotRestored', ...)` call anywhere in `src`; the only hit is the event type declaration itself.
  - The real restore path lives in `AppPersistenceManager.restoreSnapshot(...)`, which performs the restore and user alerts without going back through any `SnapshotManager` restore event in [src/AppPersistenceManager.ts](/Users/lifeart/Repos/openrv-web/src/AppPersistenceManager.ts#L218) through [src/AppPersistenceManager.ts](/Users/lifeart/Repos/openrv-web/src/AppPersistenceManager.ts#L274).
- Impact:
  - Any runtime code written against the advertised snapshot-manager event surface cannot observe completed snapshot restores.
  - That makes the snapshot event contract less trustworthy than the create/delete/rename paths, which do emit corresponding events.

### 391. Snapshot backend initialization failures are swallowed while the snapshot UI stays enabled

- Severity: Medium
- Area: Snapshot workflow / startup robustness
- Evidence:
  - Snapshot manager startup errors are caught and only logged in [src/AppPersistenceManager.ts](/Users/lifeart/Repos/openrv-web/src/AppPersistenceManager.ts#L437) through [src/AppPersistenceManager.ts](/Users/lifeart/Repos/openrv-web/src/AppPersistenceManager.ts#L442).
  - The snapshot panel is still created as a normal shipped control in [src/services/controls/createPanelControls.ts](/Users/lifeart/Repos/openrv-web/src/services/controls/createPanelControls.ts#L75) and remains wired to create/restore actions in [src/AppPlaybackWiring.ts](/Users/lifeart/Repos/openrv-web/src/AppPlaybackWiring.ts#L328) through [src/AppPlaybackWiring.ts](/Users/lifeart/Repos/openrv-web/src/AppPlaybackWiring.ts#L329).
  - Those actions only fail later, at use time, when `createQuickSnapshot()` calls `snapshotManager.createSnapshot(...)` in [src/AppPersistenceManager.ts](/Users/lifeart/Repos/openrv-web/src/AppPersistenceManager.ts#L165) through [src/AppPersistenceManager.ts](/Users/lifeart/Repos/openrv-web/src/AppPersistenceManager.ts#L184), or when panel loads hit the inline error path.
- Impact:
  - The app can boot with a broken snapshot backend while still presenting snapshots as an available feature.
  - That delays failure until the user actually tries to rely on snapshots, which is worse than disabling or clearly marking the feature unavailable up front.

### 392. Auto-save failure feedback self-clears after five seconds even when the failure is unresolved

- Severity: Medium
- Area: Auto-save status UI
- Evidence:
  - On `error`, the indicator switches to `Save failed` but immediately schedules an automatic reset back to `idle` after five seconds in [src/ui/components/AutoSaveIndicator.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/AutoSaveIndicator.ts#L159) through [src/ui/components/AutoSaveIndicator.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/AutoSaveIndicator.ts#L161).
  - The visible error state itself is the retry affordance described by `Save failed` and `Auto-save failed - click to retry` in [src/ui/components/AutoSaveIndicator.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/AutoSaveIndicator.ts#L514) through [src/ui/components/AutoSaveIndicator.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/AutoSaveIndicator.ts#L520).
  - After that reset, the same control falls back to the generic idle/unsaved messaging in [src/ui/components/AutoSaveIndicator.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/AutoSaveIndicator.ts#L532) through [src/ui/components/AutoSaveIndicator.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/AutoSaveIndicator.ts#L546), even though no successful save happened.
  - The docs only describe `Save failed` as the error state and do not mention that it auto-dismisses on its own in [docs/advanced/session-management.md](/Users/lifeart/Repos/openrv-web/docs/advanced/session-management.md#L153) through [docs/advanced/session-management.md](/Users/lifeart/Repos/openrv-web/docs/advanced/session-management.md#L159).
- Impact:
  - A persistent auto-save failure can look transient and effectively disappear from the header without user action.
  - That makes the indicator less trustworthy exactly when users need it to remain explicit about data-loss risk.

### 393. The `Open media file` control is also a session and EDL importer, not just a media picker

- Severity: Low
- Area: Header file-open UI semantics
- Evidence:
  - The header button is titled `Open media file` in [src/ui/components/layout/HeaderBar.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/layout/HeaderBar.ts#L234) through [src/ui/components/layout/HeaderBar.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/layout/HeaderBar.ts#L235).
  - But its hidden input accepts not just supported media formats, but also `.rv`, `.gto`, and `.rvedl` in [src/ui/components/layout/HeaderBar.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/layout/HeaderBar.ts#L216) through [src/ui/components/layout/HeaderBar.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/layout/HeaderBar.ts#L220).
  - The same handler explicitly branches into RV/GTO session import and RVEDL import before ordinary media loading in [src/ui/components/layout/HeaderBar.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/layout/HeaderBar.ts#L1382) through [src/ui/components/layout/HeaderBar.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/layout/HeaderBar.ts#L1439).
- Impact:
  - The shipped main file-open affordance does more than its label suggests, which makes session import paths harder to discover correctly and easier to misunderstand.
  - That overlaps awkwardly with the separate `Open project` affordance, since both buttons can open non-media session-like files through different semantics.

### 394. Locally loaded image sequences do not round-trip through project save/load with a real reload path

- Severity: High
- Area: Project persistence / image sequences
- Evidence:
  - Sequence sources are created with `url: ''` in [src/core/session/SessionMedia.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionMedia.ts#L691) through [src/core/session/SessionMedia.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionMedia.ts#L700).
  - `serializeMedia(...)` only marks media as `requiresReload` when `source.url` is a blob URL in [src/core/session/SessionSerializer.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionSerializer.ts#L388) through [src/core/session/SessionSerializer.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionSerializer.ts#L407), so locally loaded sequences with an empty URL are saved without a reload prompt marker.
  - On load, `fromJSON()` does not reconstruct sequences; it just warns `Sequence "<name>" requires manual file selection` in the `ref.type === 'sequence'` branch in [src/core/session/SessionSerializer.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionSerializer.ts#L509) through [src/core/session/SessionSerializer.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionSerializer.ts#L512).
  - The docs, however, say that media references which cannot be automatically reloaded trigger a file reload dialog and that locally loaded media can be re-selected so the session resumes intact in [docs/advanced/session-management.md](/Users/lifeart/Repos/openrv-web/docs/advanced/session-management.md#L57) and [docs/advanced/session-management.md](/Users/lifeart/Repos/openrv-web/docs/advanced/session-management.md#L174).
- Impact:
  - A locally loaded image sequence cannot come back through normal project load/recovery with the same guided reload experience as other local media.
  - Instead the sequence effectively degrades into a warning-only manual reconstruction problem, which is a significant persistence gap for review sessions built around sequences.

### 395. `.rv` / `.gto` imports behave differently depending on whether users choose `Open media file` or `Open project`

- Severity: Medium
- Area: Session import workflow consistency
- Evidence:
  - The `Open media file` path loads RV/GTO sessions directly via `session.loadFromGTO(...)` in [src/ui/components/layout/HeaderBar.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/layout/HeaderBar.ts#L1419) through [src/ui/components/layout/HeaderBar.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/layout/HeaderBar.ts#L1436).
  - The `Open project` path routes the same file types through `AppPersistenceManager.openProject(...)`, which first creates a safety checkpoint and then performs extra control resync after `loadFromGTO(...)` in [src/AppPersistenceManager.ts](/Users/lifeart/Repos/openrv-web/src/AppPersistenceManager.ts#L385) through [src/AppPersistenceManager.ts](/Users/lifeart/Repos/openrv-web/src/AppPersistenceManager.ts#L413).
  - So the same `.rv` / `.gto` payload goes through materially different runtime steps depending on which header button the user used.
- Impact:
  - Users can get different rollback safety and different post-load UI truthfulness for the same session file based solely on which affordance they clicked.
  - That makes session import behavior less predictable than it should be and increases the chance of subtle “works one way but not the other” reports.

### 396. Discarding crash recovery wipes the entire auto-save history, not just the recovered entry

- Severity: Medium
- Area: Auto-save recovery / destructive actions
- Evidence:
  - Startup recovery only asks about the single most recent entry in [src/AppPersistenceManager.ts](/Users/lifeart/Repos/openrv-web/src/AppPersistenceManager.ts#L462) through [src/AppPersistenceManager.ts](/Users/lifeart/Repos/openrv-web/src/AppPersistenceManager.ts#L478).
  - If the user chooses `Discard`, the app immediately calls `autoSaveManager.clearAll()` in [src/AppPersistenceManager.ts](/Users/lifeart/Repos/openrv-web/src/AppPersistenceManager.ts#L479) through [src/AppPersistenceManager.ts](/Users/lifeart/Repos/openrv-web/src/AppPersistenceManager.ts#L481).
  - `clearAll()` removes the entire auto-save store, not just the one prompt-driving entry, in [src/core/session/AutoSaveManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/AutoSaveManager.ts#L479) through [src/core/session/AutoSaveManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/AutoSaveManager.ts#L495).
- Impact:
  - Declining one recovery prompt also erases older auto-save history that the user was never asked about individually.
  - That makes the recovery discard path more destructive than the UI wording suggests and can destroy fallback restore points unexpectedly.

### 397. Clean auto-save recovery has no success state when the recovered session contains no media

- Severity: Low
- Area: Auto-save recovery feedback
- Evidence:
  - `recoverAutoSave(...)` deletes the recovered entry after a clean restore in [src/AppPersistenceManager.ts](/Users/lifeart/Repos/openrv-web/src/AppPersistenceManager.ts#L527) through [src/AppPersistenceManager.ts](/Users/lifeart/Repos/openrv-web/src/AppPersistenceManager.ts#L529).
  - It only shows a success alert inside the `if (loadedMedia > 0)` branch in [src/AppPersistenceManager.ts](/Users/lifeart/Repos/openrv-web/src/AppPersistenceManager.ts#L531) through [src/AppPersistenceManager.ts](/Users/lifeart/Repos/openrv-web/src/AppPersistenceManager.ts#L535), with no `else` branch for state-only recovery.
  - The same persistence manager does provide explicit `state only` feedback for project load and snapshot restore in [src/AppPersistenceManager.ts](/Users/lifeart/Repos/openrv-web/src/AppPersistenceManager.ts#L265) through [src/AppPersistenceManager.ts](/Users/lifeart/Repos/openrv-web/src/AppPersistenceManager.ts#L268) and [src/AppPersistenceManager.ts](/Users/lifeart/Repos/openrv-web/src/AppPersistenceManager.ts#L380) through [src/AppPersistenceManager.ts](/Users/lifeart/Repos/openrv-web/src/AppPersistenceManager.ts#L383).
- Impact:
  - A clean recovery of settings, annotations, or other state-only work can complete and delete the auto-save entry without telling the user it succeeded.
  - That makes state-only recovery look like a no-op even though the app has already consumed the only recovery record.

### 398. `SnapshotManager` advertises an `error` event, but production never emits it

- Severity: Low
- Area: Snapshot API contract
- Evidence:
  - `SnapshotManagerEvents` declares an `error` event in [src/core/session/SnapshotManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SnapshotManager.ts#L43) through [src/core/session/SnapshotManager.ts#L56](/Users/lifeart/Repos/openrv-web/src/core/session/SnapshotManager.ts#L56).
  - A production-code search finds no `emit('error', ...)` call anywhere in `src` for `SnapshotManager`; the class only throws, rejects, or logs on failure.
  - For example, initialization failures are rethrown from [src/core/session/SnapshotManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SnapshotManager.ts#L80) through [src/core/session/SnapshotManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SnapshotManager.ts#L87), and snapshot-list refresh failures are only logged in [src/core/session/SnapshotManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SnapshotManager.ts#L532) through [src/core/session/SnapshotManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SnapshotManager.ts#L536).
- Impact:
  - Runtime code written against the advertised snapshot-manager event surface cannot observe snapshot backend failures through the documented event channel.
  - That makes the snapshot event contract less trustworthy than the create/delete/rename paths, which do emit their corresponding events.

### 399. Startup recovery can degrade into a silent no-op if the chosen auto-save entry disappears before load

- Severity: Low
- Area: Auto-save recovery edge cases
- Evidence:
  - The startup recovery flow prompts against the most recent entry and then calls `recoverAutoSave(mostRecent.id)` in [src/AppPersistenceManager.ts](/Users/lifeart/Repos/openrv-web/src/AppPersistenceManager.ts#L462) through [src/AppPersistenceManager.ts](/Users/lifeart/Repos/openrv-web/src/AppPersistenceManager.ts#L478).
  - `AutoSaveManager.getAutoSave(...)` explicitly returns `null` when the entry is missing in [src/core/session/AutoSaveManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/AutoSaveManager.ts#L427) through [src/core/session/AutoSaveManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/AutoSaveManager.ts#L444).
  - But `recoverAutoSave(...)` only handles the `if (state)` branch in [src/AppPersistenceManager.ts](/Users/lifeart/Repos/openrv-web/src/AppPersistenceManager.ts#L503) through [src/AppPersistenceManager.ts](/Users/lifeart/Repos/openrv-web/src/AppPersistenceManager.ts#L537), with no `else` alert or retry path when the entry is gone.
  - By contrast, snapshot restore does surface the same missing-record condition with `Snapshot not found` in [src/AppPersistenceManager.ts](/Users/lifeart/Repos/openrv-web/src/AppPersistenceManager.ts#L222) through [src/AppPersistenceManager.ts](/Users/lifeart/Repos/openrv-web/src/AppPersistenceManager.ts#L224).
- Impact:
  - A user can accept crash recovery and see nothing happen if the selected auto-save entry vanished or became unreadable between listing and loading.
  - That makes one of the most safety-critical recovery paths fail more quietly than the equivalent snapshot workflow.

### 400. Selecting an `.rvedl` together with media files still loads only the EDL and ignores the accompanying media selection

- Severity: Medium
- Area: EDL import / file-open workflow
- Evidence:
  - The header file-picker path checks for `.rvedl` first and returns immediately after loading just that file in [src/ui/components/layout/HeaderBar.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/layout/HeaderBar.ts#L1383) through [src/ui/components/layout/HeaderBar.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/layout/HeaderBar.ts#L1416).
  - The viewer drag-and-drop path uses the same precedence and also returns immediately after EDL load in [src/ui/components/ViewerInputHandler.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/ViewerInputHandler.ts#L710) through [src/ui/components/ViewerInputHandler.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/ViewerInputHandler.ts#L739).
  - Both flows explicitly tell the user to `Load the corresponding media files to resolve them` in the EDL success alert even when those media files were already part of the same selection in [src/ui/components/layout/HeaderBar.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/layout/HeaderBar.ts#L1399) through [src/ui/components/layout/HeaderBar.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/layout/HeaderBar.ts#L1405) and [src/ui/components/ViewerInputHandler.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/ViewerInputHandler.ts#L724) through [src/ui/components/ViewerInputHandler.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/ViewerInputHandler.ts#L730).
- Impact:
  - Users cannot do a one-shot “EDL plus matching source files” import even when they select or drop everything together.
  - That makes the EDL workflow less useful in the exact relinking scenario where bulk selection would be most helpful.

### 401. Multi-select session import from `Open media file` only honors the first `.rv` / `.gto` file and silently demotes the rest to sidecars

- Severity: Medium
- Area: Session import / file-open workflow
- Evidence:
  - The shipped `Open media file` input explicitly enables multi-select in [src/ui/components/layout/HeaderBar.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/layout/HeaderBar.ts#L217) through [src/ui/components/layout/HeaderBar.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/layout/HeaderBar.ts#L222).
  - But the loader only picks a single session file via `fileArray.find(...)` in [src/ui/components/layout/HeaderBar.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/layout/HeaderBar.ts#L1420) through [src/ui/components/layout/HeaderBar.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/layout/HeaderBar.ts#L1424), then drops every other selected file into the `availableFiles` sidecar map in [src/ui/components/layout/HeaderBar.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/layout/HeaderBar.ts#L1425) through [src/ui/components/layout/HeaderBar.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/layout/HeaderBar.ts#L1435).
  - The viewer drag-and-drop path uses the same first-match behavior in [src/ui/components/ViewerInputHandler.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/ViewerInputHandler.ts#L743) through [src/ui/components/ViewerInputHandler.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/ViewerInputHandler.ts#L758).
- Impact:
  - Selecting multiple RV/GTO sessions does not import multiple sessions or ask the user which one to open; only the first one wins.
  - The remaining session files are silently treated like companion assets, which makes the multi-select affordance misleading and can hide user error during session import.

### 402. GTO import can keep the previous session title/comment when the new file leaves them blank

- Severity: Medium
- Area: RV/GTO import / session metadata restore
- Evidence:
  - `SessionGraph.loadFromGTO(...)` does not reset `_metadata` before parsing a new GTO file in [src/core/session/SessionGraph.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionGraph.ts#L267) through [src/core/session/SessionGraph.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionGraph.ts#L299).
  - The GTO parser only assigns `sessionInfo.displayName` and `sessionInfo.comment` when the root values are non-empty strings in [src/core/session/GTOGraphLoader.ts](/Users/lifeart/Repos/openrv-web/src/core/session/GTOGraphLoader.ts#L408) through [src/core/session/GTOGraphLoader.ts](/Users/lifeart/Repos/openrv-web/src/core/session/GTOGraphLoader.ts#L418).
  - Metadata is only reapplied when at least one parsed metadata field is truthy or explicitly defined in [src/core/session/SessionGraph.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionGraph.ts#L374) through [src/core/session/SessionGraph.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionGraph.ts#L397).
- Impact:
  - Importing a second RV/GTO session that intentionally leaves the session name/comment blank can keep the previous session’s title/comment in the running app.
  - That makes GTO session import non-idempotent for core session identity, not just for review data.

### 403. Mixed `.rvedl` plus `.rv` or `.gto` selections always load only the EDL and silently ignore the session file

- Severity: Medium
- Area: Session import / file-open precedence
- Evidence:
  - Both main ingest paths check for `.rvedl` before they check for `.rv` / `.gto` and return immediately after the EDL branch in [src/ui/components/layout/HeaderBar.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/layout/HeaderBar.ts#L1382) through [src/ui/components/layout/HeaderBar.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/layout/HeaderBar.ts#L1416) and [src/ui/components/ViewerInputHandler.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/ViewerInputHandler.ts#L709) through [src/ui/components/ViewerInputHandler.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/ViewerInputHandler.ts#L739).
  - The `.rv` / `.gto` session-file branches only run afterward in [src/ui/components/layout/HeaderBar.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/layout/HeaderBar.ts#L1420) through [src/ui/components/layout/HeaderBar.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/layout/HeaderBar.ts#L1443) and [src/ui/components/ViewerInputHandler.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/ViewerInputHandler.ts#L743) through [src/ui/components/ViewerInputHandler.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/ViewerInputHandler.ts#L763).
- Impact:
  - Selecting or dropping an EDL together with the RV/GTO session it belongs to does not give the user both pieces of the workflow; the session file is silently skipped.
  - That makes mixed review-bundle imports less predictable and increases the chance that users think they opened a full session when they only imported cut metadata.

### 404. Project/snapshot restore can leave stale playlist transitions active when the incoming state has none

- Severity: Medium
- Area: Playlist persistence / transition state restore
- Evidence:
  - `SessionSerializer.fromJSON(...)` restores playlist state via `playlistManager.setState(migrated.playlist)` when present, or clears only the playlist manager when absent in [src/core/session/SessionSerializer.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionSerializer.ts#L571) through [src/core/session/SessionSerializer.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionSerializer.ts#L579).
  - `PlaylistManager.setState(...)` only pushes transitions into the separate `TransitionManager` when `state.transitions` exists in [src/core/session/PlaylistManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/PlaylistManager.ts#L547) through [src/core/session/PlaylistManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/PlaylistManager.ts#L573).
  - `PlaylistManager.clear()` removes clips but does not clear the linked `TransitionManager` in [src/core/session/PlaylistManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/PlaylistManager.ts#L523) through [src/core/session/PlaylistManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/PlaylistManager.ts#L527), and `TransitionManager` has its own independent state plus explicit `clear()` API in [src/core/session/TransitionManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/TransitionManager.ts#L229) through [src/core/session/TransitionManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/TransitionManager.ts#L234).
  - Both playlist duration math and panel export/rendering read that separate transition state through [src/core/session/PlaylistManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/PlaylistManager.ts#L432) through [src/core/session/PlaylistManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/PlaylistManager.ts#L433) and [src/ui/components/PlaylistPanel.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/PlaylistPanel.ts#L779) through [src/ui/components/PlaylistPanel.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/PlaylistPanel.ts#L798).
- Impact:
  - Loading a project/snapshot with no playlist transitions can inherit overlap behavior from a previous session’s transitions.
  - That makes restored playlist timing and later playlist edits/export less trustworthy because transition state is not actually replaced with the incoming state.

### 406. Restored playlist playhead position is effectively ignored because enablement sync runs before `currentFrame` restore

- Severity: Medium
- Area: Playlist persistence / restore behavior
- Evidence:
  - `SessionSerializer.fromJSON(...)` restores session playback state first and only then calls `playlistManager.setState(migrated.playlist)` in [src/core/session/SessionSerializer.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionSerializer.ts#L566) through [src/core/session/SessionSerializer.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionSerializer.ts#L574).
  - Inside `PlaylistManager.setState(...)`, enabling playlist mode happens before `currentFrame` is assigned back from saved state in [src/core/session/PlaylistManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/PlaylistManager.ts#L562) through [src/core/session/PlaylistManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/PlaylistManager.ts#L566).
  - The production `enabledChanged` handler immediately syncs the runtime to a target global frame derived from the current session source/frame or the first clip, not from the saved playlist `currentFrame`, in [src/AppPlaybackWiring.ts](/Users/lifeart/Repos/openrv-web/src/AppPlaybackWiring.ts#L764) through [src/AppPlaybackWiring.ts](/Users/lifeart/Repos/openrv-web/src/AppPlaybackWiring.ts#L793).
  - After `currentFrame` is finally assigned inside `PlaylistManager.setState(...)`, no follow-up event or resync is triggered.
- Impact:
  - A restored project/snapshot/auto-save can bring playlist mode back enabled without reopening at the saved global playlist position.
  - That makes playlist persistence incomplete in a user-visible way: the clip list comes back, but the review position within it does not reliably resume.

### 408. Restored playlist transitions do not trigger a redraw, so the timeline/panel can open in a stale cut-only state

- Severity: Medium
- Area: Playlist persistence / UI sync
- Evidence:
  - `PlaylistManager.setState(...)` emits `clipsChanged` before it restores transitions through `transitionManager.setState(...)` in [src/core/session/PlaylistManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/PlaylistManager.ts#L547) through [src/core/session/PlaylistManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/PlaylistManager.ts#L573).
  - `TransitionManager.setState(...)` replaces internal state silently and does not emit `transitionChanged` or `transitionsReset` in [src/core/session/TransitionManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/TransitionManager.ts#L265) through [src/core/session/TransitionManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/TransitionManager.ts#L267).
  - The visible playlist panel redraws from `clipsChanged` and `transitionChanged` only in [src/ui/components/PlaylistPanel.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/PlaylistPanel.ts#L309) and [src/ui/components/PlaylistPanel.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/PlaylistPanel.ts#L868) through [src/ui/components/PlaylistPanel.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/PlaylistPanel.ts#L871), while the timeline redraws from `clipsChanged`, `enabledChanged`, `transitionChanged`, and `transitionsReset` in [src/ui/components/Timeline.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/Timeline.ts#L338) through [src/ui/components/Timeline.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/Timeline.ts#L341).
- Impact:
  - Loading a project/snapshot with saved transitions can initially show the playlist/timeline as if cuts have no transitions until some later user action forces a redraw.
  - That makes restored transition state look unreliable even when it exists in memory.

### 409. Timeline/EDL edits that rebuild the playlist ignore transition-adjusted clip start frames

- Severity: High
- Area: Playlist editing / transition correctness
- Evidence:
  - `PlaylistManager.replaceClips(...)` rebuilds clips with sequential `globalStartFrame` values and emits `clipsChanged`, but never calls `recalculateGlobalFrames()` afterward in [src/core/session/PlaylistManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/PlaylistManager.ts#L156) through [src/core/session/PlaylistManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/PlaylistManager.ts#L184).
  - That method is the path that actually applies overlap-adjusted clip positions when a `TransitionManager` exists in [src/core/session/PlaylistManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/PlaylistManager.ts#L411) through [src/core/session/PlaylistManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/PlaylistManager.ts#L416).
  - The main production caller is `TimelineEditorService.applyEditsToPlaylist(...)`, which uses `playlistManager.replaceClips(clips)` after timeline/EDL edits in [src/services/TimelineEditorService.ts](/Users/lifeart/Repos/openrv-web/src/services/TimelineEditorService.ts#L368) through [src/services/TimelineEditorService.ts](/Users/lifeart/Repos/openrv-web/src/services/TimelineEditorService.ts#L382).
- Impact:
  - Editing/reapplying the playlist through the timeline can snap clip start frames back to cut-style sequential positions even when transitions still exist.
  - That makes transition-enabled timelines drift after edit operations: transition configs remain, but the clip layout they are supposed to overlap is rebuilt incorrectly.

### 411. Partial project/snapshot restore replays source-indexed review state without remapping it to surviving sources

- Severity: High
- Area: Persistence / partial restore / source-linked data integrity
- Evidence:
  - Several serialized subsystems store raw source indices: playback in [src/core/session/SessionState.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionState.ts#L63) through [src/core/session/SessionState.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionState.ts#L77), playlist clips in [src/core/session/PlaylistManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/PlaylistManager.ts#L18) through [src/core/session/PlaylistManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/PlaylistManager.ts#L40), notes in [src/core/session/NoteManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/NoteManager.ts#L11) through [src/core/session/NoteManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/NoteManager.ts#L24), version groups in [src/core/session/VersionManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/VersionManager.ts#L11) through [src/core/session/VersionManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/VersionManager.ts#L27), and statuses in [src/core/session/StatusManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/StatusManager.ts#L16) through [src/core/session/StatusManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/StatusManager.ts#L21).
  - `SessionSerializer.fromJSON(...)` computes `mediaIndexMap`, but only uses it for representations, not for any of those source-indexed subsystems, in [src/core/session/SessionSerializer.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionSerializer.ts#L450) through [src/core/session/SessionSerializer.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionSerializer.ts#L563).
  - The restore path feeds saved source-indexed state straight back into runtime managers with `playlistManager.setState(migrated.playlist)`, `noteManager.fromSerializable(migrated.notes)`, `versionManager.fromSerializable(migrated.versionGroups)`, and `statusManager.fromSerializable(migrated.statuses)` in [src/core/session/SessionSerializer.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionSerializer.ts#L570) through [src/core/session/SessionSerializer.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionSerializer.ts#L620).
- Impact:
  - If a restore comes back with missing or skipped media, playlists, notes, version groups, and statuses can end up attached to the wrong surviving source indices.
  - That turns partial recovery into data reassociation, not just data loss: review context can move to the wrong shot without any warning that indices drifted.

### 412. Auto-save, snapshot, and checkpoint labels are derived from the current source name instead of the session name

- Severity: Medium
- Area: Persistence UX / recovery labeling
- Evidence:
  - The auto-save dirty path names saved state with `session.currentSource?.name || 'Untitled'` in [src/AppPersistenceManager.ts](/Users/lifeart/Repos/openrv-web/src/AppPersistenceManager.ts#L121) through [src/AppPersistenceManager.ts](/Users/lifeart/Repos/openrv-web/src/AppPersistenceManager.ts#L133).
  - Manual retry, quick snapshot creation, and auto-checkpoint creation reuse that same source-name fallback in [src/AppPersistenceManager.ts](/Users/lifeart/Repos/openrv-web/src/AppPersistenceManager.ts#L139) through [src/AppPersistenceManager.ts](/Users/lifeart/Repos/openrv-web/src/AppPersistenceManager.ts#L185) and [src/AppPersistenceManager.ts](/Users/lifeart/Repos/openrv-web/src/AppPersistenceManager.ts#L194) through [src/AppPersistenceManager.ts](/Users/lifeart/Repos/openrv-web/src/AppPersistenceManager.ts#L208).
  - Recovery UI then presents those stored names back to the user, for example `A previous session "${mostRecent.name}" was found...` in [src/AppPersistenceManager.ts](/Users/lifeart/Repos/openrv-web/src/AppPersistenceManager.ts#L461) through [src/AppPersistenceManager.ts](/Users/lifeart/Repos/openrv-web/src/AppPersistenceManager.ts#L470).
- Impact:
  - Recovery entries are labeled by whichever source happened to be current, not by the actual session title the user sees in the header.
  - In multi-source or manually renamed sessions, that makes snapshots and crash-recovery prompts materially harder to identify and trust.

### 413. RV/GTO export filenames are derived from the current source, not the session identity being saved

- Severity: Medium
- Area: RV/GTO export / session naming
- Evidence:
  - `saveRvSession(...)` picks `session.currentSource?.name` as the filename base and falls back to literal `session` in [src/AppPersistenceManager.ts](/Users/lifeart/Repos/openrv-web/src/AppPersistenceManager.ts#L319) through [src/AppPersistenceManager.ts](/Users/lifeart/Repos/openrv-web/src/AppPersistenceManager.ts#L330).
  - That export path ignores `session.metadata.displayName`, even though the app exposes editable session naming in the header and the GTO exporter itself writes `metadata.displayName` into the embedded RV session root name in [src/core/session/SessionGTOExporter.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionGTOExporter.ts#L1502) through [src/core/session/SessionGTOExporter.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionGTOExporter.ts#L1505).
- Impact:
  - A renamed review session can export under a different current-source filename than the session name stored inside the file.
  - In multi-source sessions, users get export filenames that reflect whichever source happened to be active rather than the session they think they are saving.

### 414. RV/GTO companion-file resolution silently collapses duplicate basenames

- Severity: Medium
- Area: RV/GTO import / companion-file resolution
- Evidence:
  - `openProject(...)` builds `availableFiles` as a `Map<string, File>` keyed only by `f.name` in [src/AppPersistenceManager.ts](/Users/lifeart/Repos/openrv-web/src/AppPersistenceManager.ts#L396) through [src/AppPersistenceManager.ts](/Users/lifeart/Repos/openrv-web/src/AppPersistenceManager.ts#L403).
  - The RV/GTO loader then resolves referenced movie/CDL sidecars purely by basename with `movie.split(/[/\\\\]/).pop()` and `file.split(/[/\\\\]/).pop()` in [src/core/session/GTOGraphLoader.ts](/Users/lifeart/Repos/openrv-web/src/core/session/GTOGraphLoader.ts#L710) through [src/core/session/GTOGraphLoader.ts](/Users/lifeart/Repos/openrv-web/src/core/session/GTOGraphLoader.ts#L716) and [src/core/session/GTOGraphLoader.ts](/Users/lifeart/Repos/openrv-web/src/core/session/GTOGraphLoader.ts#L2009) through [src/core/session/GTOGraphLoader.ts](/Users/lifeart/Repos/openrv-web/src/core/session/GTOGraphLoader.ts#L2013).
  - When two companion files share the same basename, the later `Map.set(f.name, f)` silently overwrites the earlier one before import even starts.
- Impact:
  - Session bundles that include same-named media or same-named CDL files from different directories can resolve to the wrong companion file with no warning.
  - That makes basename-based RV/GTO recovery brittle for real production packages, where duplicate filenames across shots or plates are common.

### 415. RV/GTO import cannot explicitly restore the “all scopes off” state

- Severity: Medium
- Area: RV/GTO import / scope visibility restore
- Evidence:
  - `parseScopes(...)` builds a full `ScopesState`, but returns it only when at least one scope is `true`; if all four scopes are off, it returns `null` in [src/core/session/GTOSettingsParser.ts](/Users/lifeart/Repos/openrv-web/src/core/session/GTOSettingsParser.ts#L667) through [src/core/session/GTOSettingsParser.ts](/Users/lifeart/Repos/openrv-web/src/core/session/GTOSettingsParser.ts#L699).
  - `parseInitialSettings(...)` only includes `settings.scopes` when `parseScopes(dto)` returned a value in [src/core/session/GTOSettingsParser.ts](/Users/lifeart/Repos/openrv-web/src/core/session/GTOSettingsParser.ts#L65) through [src/core/session/GTOSettingsParser.ts](/Users/lifeart/Repos/openrv-web/src/core/session/GTOSettingsParser.ts#L68).
  - The live `settingsLoaded` handler only hides/shows scopes when `settings.scopes` exists in [src/handlers/persistenceHandlers.ts](/Users/lifeart/Repos/openrv-web/src/handlers/persistenceHandlers.ts#L134) through [src/handlers/persistenceHandlers.ts](/Users/lifeart/Repos/openrv-web/src/handlers/persistenceHandlers.ts#L171).
- Impact:
  - Importing an RV/GTO session with no scopes enabled cannot actively close scopes that were already open in the current app session.
  - That leaves QC scope visibility dependent on prior local state instead of the imported session’s state.

### 416. RV/GTO settings parsing extracts `linearize`, `outOfRange`, and `channelSwizzle`, but production never applies them

- Severity: High
- Area: RV/GTO import / color-state restore
- Evidence:
  - `GTOViewSettings` explicitly includes `linearize`, `outOfRange`, and `channelSwizzle` in [src/core/session/SessionTypes.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionTypes.ts#L54) through [src/core/session/SessionTypes.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionTypes.ts#L70).
  - `parseInitialSettings(...)` really parses and emits those fields in [src/core/session/GTOSettingsParser.ts](/Users/lifeart/Repos/openrv-web/src/core/session/GTOSettingsParser.ts#L70) through [src/core/session/GTOSettingsParser.ts](/Users/lifeart/Repos/openrv-web/src/core/session/GTOSettingsParser.ts#L92).
  - The only live `settingsLoaded` consumer is `handleSettingsLoaded(...)` in [src/handlers/persistenceHandlers.ts](/Users/lifeart/Repos/openrv-web/src/handlers/persistenceHandlers.ts#L63) through [src/handlers/persistenceHandlers.ts](/Users/lifeart/Repos/openrv-web/src/handlers/persistenceHandlers.ts#L175), and it has no branches for `linearize`, `outOfRange`, or `channelSwizzle`.
  - A production-code search finds no other non-test `settingsLoaded` consumer that would apply those fields.
- Impact:
  - RV/GTO sessions can carry parsed linearization, out-of-range, and channel-swizzle color settings that never reach the live viewer.
  - That makes imported color output incomplete even when the parser successfully recovered the settings from the session file.

### 417. RV/GTO restore contract includes `filterSettings`, but the parser never populates them

- Severity: Medium
- Area: RV/GTO import / filter-state restore
- Evidence:
  - `GTOViewSettings` includes `filterSettings?: FilterSettings` in [src/core/session/SessionTypes.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionTypes.ts#L54) through [src/core/session/SessionTypes.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionTypes.ts#L67).
  - The live `settingsLoaded` handler has a real `if (settings.filterSettings)` branch that pushes that state into the filter control in [src/handlers/persistenceHandlers.ts](/Users/lifeart/Repos/openrv-web/src/handlers/persistenceHandlers.ts#L82) through [src/handlers/persistenceHandlers.ts](/Users/lifeart/Repos/openrv-web/src/handlers/persistenceHandlers.ts#L83).
  - But `parseInitialSettings(...)` has no `parseFilterSettings(...)` step at all; it parses color, CDL, transform, lens, crop, channel mode, stereo, scopes, linearize, noise reduction, uncrop, out-of-range, and channel swizzle only in [src/core/session/GTOSettingsParser.ts](/Users/lifeart/Repos/openrv-web/src/core/session/GTOSettingsParser.ts#L24) through [src/core/session/GTOSettingsParser.ts#L95).
- Impact:
  - The restore pipeline advertises filter-state restore, but RV/GTO import never supplies that state to the live handler.
  - That leaves imported filter behavior dependent on other side effects instead of the documented settings-restore path.

### 418. RV/GTO restore contract includes stereo eye transforms and stereo align mode, but the parser never populates them

- Severity: Medium
- Area: RV/GTO import / stereo-state restore
- Evidence:
  - `GTOViewSettings` includes both `stereoEyeTransform` and `stereoAlignMode` in [src/core/session/SessionTypes.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionTypes.ts#L61) through [src/core/session/SessionTypes.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionTypes.ts#L65).
  - The live `settingsLoaded` handler has corresponding restore branches that call `context.getStereoEyeTransformControl().setState(...)` and `context.getStereoAlignControl().setMode(...)` in [src/handlers/persistenceHandlers.ts](/Users/lifeart/Repos/openrv-web/src/handlers/persistenceHandlers.ts#L128) through [src/handlers/persistenceHandlers.ts](/Users/lifeart/Repos/openrv-web/src/handlers/persistenceHandlers.ts#L132).
  - But `parseInitialSettings(...)` never parses or assigns either field; the parser only handles `stereo` and then moves on to scopes and other settings in [src/core/session/GTOSettingsParser.ts](/Users/lifeart/Repos/openrv-web/src/core/session/GTOSettingsParser.ts#L60) through [src/core/session/GTOSettingsParser.ts#L92).
  - A production-code search found no other non-test parser path that fills `settings.stereoEyeTransform` or `settings.stereoAlignMode`.
- Impact:
  - Even where the app has live restore plumbing for advanced stereo state, RV/GTO import never feeds it.
  - That makes stereo session interchange less complete than the restore contract and handler structure suggest.

### 419. RV/GTO import cannot explicitly clear CDL, transform, or lens state when those nodes are present but inactive

- Severity: High
- Area: RV/GTO import / stale state reset
- Evidence:
  - `parseCDL(...)` skips inactive CDL components with `active === 0` and returns `null` if it finds no active CDL payload in [src/core/session/GTOSettingsParser.ts](/Users/lifeart/Repos/openrv-web/src/core/session/GTOSettingsParser.ts#L347) through [src/core/session/GTOSettingsParser.ts](/Users/lifeart/Repos/openrv-web/src/core/session/GTOSettingsParser.ts#L367).
  - `parseTransform(...)` returns `null` immediately when the transform node has `active === 0` in [src/core/session/GTOSettingsParser.ts](/Users/lifeart/Repos/openrv-web/src/core/session/GTOSettingsParser.ts#L373) through [src/core/session/GTOSettingsParser.ts](/Users/lifeart/Repos/openrv-web/src/core/session/GTOSettingsParser.ts#L418).
  - `parseLens(...)` does the same for inactive lens-warp nodes in [src/core/session/GTOSettingsParser.ts](/Users/lifeart/Repos/openrv-web/src/core/session/GTOSettingsParser.ts#L424) through [src/core/session/GTOSettingsParser.ts](/Users/lifeart/Repos/openrv-web/src/core/session/GTOSettingsParser.ts#L545).
  - The live restore path only applies those settings when the parsed fields exist, via `if (settings.cdl)`, `if (settings.transform)`, and `if (settings.lens)` in [src/handlers/persistenceHandlers.ts](/Users/lifeart/Repos/openrv-web/src/handlers/persistenceHandlers.ts#L89) through [src/handlers/persistenceHandlers.ts](/Users/lifeart/Repos/openrv-web/src/handlers/persistenceHandlers.ts#L100).
- Impact:
  - Importing an RV/GTO session that explicitly disables CDL, transform, or lens warp cannot actively restore those features to default/off if the current app session already had them enabled.
  - That leaves image state dependent on prior local session history instead of the imported session file.

### 420. RV/GTO import ignores inactive RVColor and RVDisplayColor flags, so disabled grading can still be applied

- Severity: High
- Area: RV/GTO import / color-state restore
- Evidence:
  - The export/serialization contract treats `active` as meaningful for both RVColor and RVDisplayColor. `ColorSerializer.buildColorObject(...)` writes `color.active` from `settings.active !== false ? 1 : 0` in [src/core/session/serializers/ColorSerializer.ts](/Users/lifeart/Repos/openrv-web/src/core/session/serializers/ColorSerializer.ts#L926) through [src/core/session/serializers/ColorSerializer.ts](/Users/lifeart/Repos/openrv-web/src/core/session/serializers/ColorSerializer.ts#L953), and `ColorSerializer.buildDisplayColorObject(...)` does the same in [src/core/session/serializers/ColorSerializer.ts](/Users/lifeart/Repos/openrv-web/src/core/session/serializers/ColorSerializer.ts#L1000) through [src/core/session/serializers/ColorSerializer.ts](/Users/lifeart/Repos/openrv-web/src/core/session/serializers/ColorSerializer.ts#L1026).
  - That contract is locked in by tests asserting `active=false` serializes to `0` for both node types in [src/core/session/serializers/ColorSerializer.test.ts](/Users/lifeart/Repos/openrv-web/src/core/session/serializers/ColorSerializer.test.ts#L1175) through [src/core/session/serializers/ColorSerializer.test.ts](/Users/lifeart/Repos/openrv-web/src/core/session/serializers/ColorSerializer.test.ts#L1178) and [src/core/session/serializers/ColorSerializer.test.ts](/Users/lifeart/Repos/openrv-web/src/core/session/serializers/ColorSerializer.test.ts#L1322) through [src/core/session/serializers/ColorSerializer.test.ts](/Users/lifeart/Repos/openrv-web/src/core/session/serializers/ColorSerializer.test.ts#L1325).
  - But `parseColorAdjustments(...)` reads RVColor and RVDisplayColor values without checking `color.active` at all in [src/core/session/GTOSettingsParser.ts](/Users/lifeart/Repos/openrv-web/src/core/session/GTOSettingsParser.ts#L240) through [src/core/session/GTOSettingsParser.ts](/Users/lifeart/Repos/openrv-web/src/core/session/GTOSettingsParser.ts#L317).
  - `parseOutOfRange(...)` likewise reads `RVDisplayColor.color.outOfRange` without honoring `color.active` in [src/core/session/GTOSettingsParser.ts](/Users/lifeart/Repos/openrv-web/src/core/session/GTOSettingsParser.ts#L748) through [src/core/session/GTOSettingsParser.ts](/Users/lifeart/Repos/openrv-web/src/core/session/GTOSettingsParser.ts#L760).
  - The live restore path then applies any parsed color adjustments directly through `context.getColorControls().setAdjustments(...)` in [src/handlers/persistenceHandlers.ts](/Users/lifeart/Repos/openrv-web/src/handlers/persistenceHandlers.ts#L79) through [src/handlers/persistenceHandlers.ts](/Users/lifeart/Repos/openrv-web/src/handlers/persistenceHandlers.ts#L81).
- Impact:
  - An imported RV/GTO file can explicitly mark RVColor or RVDisplayColor inactive and still have its exposure, gamma, brightness, or out-of-range state applied on load.
  - That makes disabled grading/display-color nodes behave as if they were enabled, which is the opposite of what the serialized `active=0` contract says.

### 421. RV/GTO settings restore ignores standalone RVColorCDL nodes and only reads embedded CDL components

- Severity: Medium
- Area: RV/GTO import / CDL restore coverage
- Evidence:
  - `parseCDL(...)` only reads CDL data from `RVColor` and `RVLinearize` protocol nodes in [src/core/session/GTOSettingsParser.ts](/Users/lifeart/Repos/openrv-web/src/core/session/GTOSettingsParser.ts#L323) through [src/core/session/GTOSettingsParser.ts](/Users/lifeart/Repos/openrv-web/src/core/session/GTOSettingsParser.ts#L367).
  - The repo’s own serializer/exporter defines standalone `RVColorCDL` objects as a first-class GTO shape via `ColorSerializer.buildColorCDLObject(...)` in [src/core/session/serializers/ColorSerializer.ts](/Users/lifeart/Repos/openrv-web/src/core/session/serializers/ColorSerializer.ts#L581) through [src/core/session/serializers/ColorSerializer.ts](/Users/lifeart/Repos/openrv-web/src/core/session/serializers/ColorSerializer.ts#L604) and `SessionGTOExporter.buildColorCDLObject(...)` in [src/core/session/SessionGTOExporter.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionGTOExporter.ts#L1082) through [src/core/session/SessionGTOExporter.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionGTOExporter.ts#L1085).
  - The graph loader also recognizes both `RVColorCDL` and `RVColorACESLogCDL` as real import protocols and parses their properties in [src/core/session/GTOGraphLoader.ts](/Users/lifeart/Repos/openrv-web/src/core/session/GTOGraphLoader.ts#L1987) through [src/core/session/GTOGraphLoader.ts](/Users/lifeart/Repos/openrv-web/src/core/session/GTOGraphLoader.ts#L2007).
  - The live restore path does have a real `if (settings.cdl)` branch that would apply parsed CDL values through `context.getCDLControl().setCDL(...)` in [src/handlers/persistenceHandlers.ts](/Users/lifeart/Repos/openrv-web/src/handlers/persistenceHandlers.ts#L89) through [src/handlers/persistenceHandlers.ts](/Users/lifeart/Repos/openrv-web/src/handlers/persistenceHandlers.ts#L90).
- Impact:
  - RV/GTO files that express CDL as standalone `RVColorCDL` or `RVColorACESLogCDL` nodes can be recognized by the loader layer but still fail to restore grading through the live `settingsLoaded` path.
  - That leaves CDL interchange narrower than the repo’s own serializer, exporter, and graph-loader contracts imply.

### 422. RV/GTO settings restore only understands embedded RVColor data and ignores most standalone color-node protocols

- Severity: Medium
- Area: RV/GTO import / color interchange coverage
- Evidence:
  - The repo exposes standalone GTO builders for `RVColorExposure`, `RVColorCurve`, `RVColorSaturation`, `RVColorVibrance`, `RVColorShadow`, `RVColorHighlight`, `RVColorGrayScale`, `RVColorLinearToSRGB`, `RVColorSRGBToLinear`, and `RVPrimaryConvert` in [src/core/session/serializers/ColorSerializer.ts](/Users/lifeart/Repos/openrv-web/src/core/session/serializers/ColorSerializer.ts#L443) through [src/core/session/serializers/ColorSerializer.ts](/Users/lifeart/Repos/openrv-web/src/core/session/serializers/ColorSerializer.ts#L654), re-exported through [src/core/session/SessionGTOExporter.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionGTOExporter.ts#L1026) through [src/core/session/SessionGTOExporter.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionGTOExporter.ts#L1106).
  - `GTOGraphLoader` also treats those protocols as real importable node types and parses their properties in [src/core/session/GTOGraphLoader.ts](/Users/lifeart/Repos/openrv-web/src/core/session/GTOGraphLoader.ts#L1888) through [src/core/session/GTOGraphLoader.ts](/Users/lifeart/Repos/openrv-web/src/core/session/GTOGraphLoader.ts#L2138).
  - But the live settings parser only restores color adjustments from `RVColor` and `RVDisplayColor`, plus the narrower dedicated parsers for CDL and linearize in [src/core/session/GTOSettingsParser.ts](/Users/lifeart/Repos/openrv-web/src/core/session/GTOSettingsParser.ts#L24) through [src/core/session/GTOSettingsParser.ts](/Users/lifeart/Repos/openrv-web/src/core/session/GTOSettingsParser.ts#L95) and [src/core/session/GTOSettingsParser.ts](/Users/lifeart/Repos/openrv-web/src/core/session/GTOSettingsParser.ts#L238) through [src/core/session/GTOSettingsParser.ts](/Users/lifeart/Repos/openrv-web/src/core/session/GTOSettingsParser.ts#L317).
  - The app’s live grading model is broader than that parser surface: `ColorAdjustments` still includes fields like `vibrance`, `highlights`, and `shadows` in [src/core/types/color.ts](/Users/lifeart/Repos/openrv-web/src/core/types/color.ts#L3) through [src/core/types/color.ts](/Users/lifeart/Repos/openrv-web/src/core/types/color.ts#L18), and the restore handler would apply any parsed adjustments via `setAdjustments(...)` in [src/handlers/persistenceHandlers.ts](/Users/lifeart/Repos/openrv-web/src/handlers/persistenceHandlers.ts#L79) through [src/handlers/persistenceHandlers.ts](/Users/lifeart/Repos/openrv-web/src/handlers/persistenceHandlers.ts#L81).
- Impact:
  - RV/GTO files that represent grading with standalone color nodes can be recognized by the loader layer yet still lose exposure/curve/vibrance/shadow/highlight/grayscale/conversion intent in the live restore path.
  - That leaves color interchange materially narrower than the repo’s own serializer/exporter/loader surface suggests.

### 423. RV/GTO import cannot clear markers when the file carries an empty marks array

- Severity: Medium
- Area: RV/GTO import / marker restore
- Evidence:
  - `GTOGraphLoader` reads `session.marks`, but only assigns `sessionInfo.marks` when the filtered array has `length > 0` in [src/core/session/GTOGraphLoader.ts](/Users/lifeart/Repos/openrv-web/src/core/session/GTOGraphLoader.ts#L293) through [src/core/session/GTOGraphLoader.ts](/Users/lifeart/Repos/openrv-web/src/core/session/GTOGraphLoader.ts#L299).
  - `SessionGraph.loadFromGTO(...)` only calls `markerManager.setFromFrameNumbers(...)` when `result.sessionInfo.marks` is present in [src/core/session/SessionGraph.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionGraph.ts#L321) through [src/core/session/SessionGraph.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionGraph.ts#L329).
  - The marker manager itself does support explicit clearing through `setFromFrameNumbers([])`, which resets the map and emits change notifications in [src/core/session/MarkerManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/MarkerManager.ts#L256) through [src/core/session/MarkerManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/MarkerManager.ts#L271).
- Impact:
  - Importing an RV/GTO session that explicitly contains zero markers cannot clear markers left over from the current session.
  - Marker state therefore depends on previous local state instead of the imported file whenever the incoming marks payload is empty.

### 424. RV/GTO crop restore derives source dimensions from RVFileSource only, so still-image sessions can import with a full-frame crop

- Severity: Medium
- Area: RV/GTO import / crop restore
- Evidence:
  - `SessionGTOExporter.buildSourceGroupObjects(...)` emits still sources as `RVImageSource`, not `RVFileSource`, while still attaching the same `proxy.size` dimensions in [src/core/session/SessionGTOExporter.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionGTOExporter.ts#L597) through [src/core/session/SessionGTOExporter.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionGTOExporter.ts#L635).
  - `SessionGraph.parseSession(...)` derives `sourceWidth` and `sourceHeight` only from `dto.byProtocol('RVFileSource')` in [src/core/session/SessionGraph.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionGraph.ts#L515) through [src/core/session/SessionGraph.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionGraph.ts#L547).
  - `parseCrop(...)` needs non-zero source dimensions to convert pixel crop bounds into normalized region values; otherwise it falls back to `{ x: 0, y: 0, width: 1, height: 1 }` even when crop coordinates are present in [src/core/session/GTOSettingsParser.ts](/Users/lifeart/Repos/openrv-web/src/core/session/GTOSettingsParser.ts#L568) through [src/core/session/GTOSettingsParser.ts](/Users/lifeart/Repos/openrv-web/src/core/session/GTOSettingsParser.ts#L585).
  - `SessionGraph.parseSession(...)` feeds those derived dimensions directly into `_parseInitialSettings(dto, { width: sourceWidth, height: sourceHeight })` in [src/core/session/SessionGraph.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionGraph.ts#L552).
- Impact:
  - RV/GTO sessions built around still images can carry a valid crop but restore it as an enabled full-frame region because the parser never discovers the image dimensions.
  - Crop behavior therefore differs by source protocol, even though the exporter writes the same `proxy.size` data for both still and file/video sources.

### 425. RV/GTO paint-annotation import uses a default 1.0 aspect ratio for RVImageSource sessions

- Severity: Medium
- Area: RV/GTO import / annotation geometry
- Evidence:
  - `SessionGraph.parseSession(...)` computes `aspectRatio` only while iterating `dto.byProtocol('RVFileSource')` in [src/core/session/SessionGraph.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionGraph.ts#L515) through [src/core/session/SessionGraph.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionGraph.ts#L547).
  - Still-image sessions are exported as `RVImageSource` objects, not `RVFileSource`, in [src/core/session/SessionGTOExporter.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionGTOExporter.ts#L597) through [src/core/session/SessionGTOExporter.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionGTOExporter.ts#L635).
  - `SessionGraph.parseSession(...)` then passes the derived `aspectRatio` into `annotationStore.parsePaintAnnotations(dto, aspectRatio)` in [src/core/session/SessionGraph.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionGraph.ts#L549) through [src/core/session/SessionGraph.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionGraph.ts#L550).
  - `AnnotationStore` uses that aspect ratio directly when converting OpenRV coordinates for pen strokes and text annotations in [src/core/session/AnnotationStore.ts](/Users/lifeart/Repos/openrv-web/src/core/session/AnnotationStore.ts#L440) through [src/core/session/AnnotationStore.ts](/Users/lifeart/Repos/openrv-web/src/core/session/AnnotationStore.ts#L465) and [src/core/session/AnnotationStore.ts](/Users/lifeart/Repos/openrv-web/src/core/session/AnnotationStore.ts#L537) through [src/core/session/AnnotationStore.ts](/Users/lifeart/Repos/openrv-web/src/core/session/AnnotationStore.ts#L554).
- Impact:
  - Paint annotations imported from still-image RV/GTO sessions can be placed incorrectly whenever the image aspect ratio is not 1:1.
  - The same annotation payload therefore restores differently depending on whether the source was serialized as `RVImageSource` or `RVFileSource`.

### 426. RV/GTO import cannot clear notes, version groups, or shot statuses when the incoming session data is empty

- Severity: High
- Area: RV/GTO import / stale review-session data
- Evidence:
  - `SessionGraph.loadFromGTO(...)` explicitly claims it will “always call, even for empty arrays, to clear old data” for notes, version groups, and statuses in [src/core/session/SessionGraph.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionGraph.ts#L347) through [src/core/session/SessionGraph.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionGraph.ts#L359).
  - But `GTOGraphLoader` only assigns `sessionInfo.notes` when `notes.length > 0` in [src/core/session/GTOGraphLoader.ts](/Users/lifeart/Repos/openrv-web/src/core/session/GTOGraphLoader.ts#L460) through [src/core/session/GTOGraphLoader.ts](/Users/lifeart/Repos/openrv-web/src/core/session/GTOGraphLoader.ts#L495), only assigns `sessionInfo.versionGroups` when `versionGroups.length > 0` in [src/core/session/GTOGraphLoader.ts](/Users/lifeart/Repos/openrv-web/src/core/session/GTOGraphLoader.ts#L499) through [src/core/session/GTOGraphLoader.ts](/Users/lifeart/Repos/openrv-web/src/core/session/GTOGraphLoader.ts#L547), and only assigns `sessionInfo.statuses` when `parsedStatuses.length > 0` in [src/core/session/GTOGraphLoader.ts](/Users/lifeart/Repos/openrv-web/src/core/session/GTOGraphLoader.ts#L625) through [src/core/session/GTOGraphLoader.ts](/Users/lifeart/Repos/openrv-web/src/core/session/GTOGraphLoader.ts#L649).
  - The managers themselves do support explicit clearing on empty arrays: `NoteManager.fromSerializable([])` clears notes in [src/core/session/NoteManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/NoteManager.ts#L316) through [src/core/session/NoteManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/NoteManager.ts#L330), `VersionManager.fromSerializable([])` clears groups in [src/core/session/VersionManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/VersionManager.ts#L338) through [src/core/session/VersionManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/VersionManager.ts#L343), and `StatusManager.fromSerializable([])` clears statuses in [src/core/session/StatusManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/StatusManager.ts#L178) through [src/core/session/StatusManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/StatusManager.ts#L183).
- Impact:
  - Importing an RV/GTO session with no notes, no version groups, or no statuses cannot clear the old review data already present in the app.
  - That leaves review metadata dependent on previous local state, directly contradicting the comments in the live import path.

### 427. RV/GTO multi-source imports derive crop and annotation geometry from inconsistent source dimensions

- Severity: Medium
- Area: RV/GTO import / multi-source restore
- Evidence:
  - `SessionGraph.parseSession(...)` walks every `RVFileSource`, but only records `sourceWidth` / `sourceHeight` from the first source while overwriting `aspectRatio` on every later source in [src/core/session/SessionGraph.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionGraph.ts#L515) through [src/core/session/SessionGraph.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionGraph.ts#L535).
  - It then feeds the first source dimensions into `_parseInitialSettings(dto, { width: sourceWidth, height: sourceHeight })` for crop parsing in [src/core/session/SessionGraph.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionGraph.ts#L552).
  - The same method passes the last-seen `aspectRatio` into `annotationStore.parsePaintAnnotations(dto, aspectRatio)` in [src/core/session/SessionGraph.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionGraph.ts#L549) through [src/core/session/SessionGraph.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionGraph.ts#L550).
  - `parseCrop(...)` converts crop bounds using the supplied width/height in [src/core/session/GTOSettingsParser.ts](/Users/lifeart/Repos/openrv-web/src/core/session/GTOSettingsParser.ts#L568) through [src/core/session/GTOSettingsParser.ts](/Users/lifeart/Repos/openrv-web/src/core/session/GTOSettingsParser.ts#L579), while `AnnotationStore` converts paint coordinates using the supplied aspect ratio in [src/core/session/AnnotationStore.ts](/Users/lifeart/Repos/openrv-web/src/core/session/AnnotationStore.ts#L440) through [src/core/session/AnnotationStore.ts](/Users/lifeart/Repos/openrv-web/src/core/session/AnnotationStore.ts#L465).
- Impact:
  - In multi-source RV/GTO sessions with differing source sizes or aspect ratios, crop restore is normalized against the first source while paint annotations are normalized against the last one.
  - That makes imported geometry depend on source ordering rather than the authored session state.

### 428. Share-link compare state cannot explicitly clear an unassigned B source

- Severity: Medium
- Area: URL sharing / A-B compare restore
- Evidence:
  - Share-link capture omits `sourceBIndex` whenever the session has no B assignment by serializing it only when `session.sourceBIndex >= 0` in [src/services/SessionURLService.ts](/Users/lifeart/Repos/openrv-web/src/services/SessionURLService.ts#L122) through [src/services/SessionURLService.ts](/Users/lifeart/Repos/openrv-web/src/services/SessionURLService.ts#L145).
  - URL-state encoding also strips absent `sourceBIndex` entirely in [src/core/session/SessionURLManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionURLManager.ts#L128) through [src/core/session/SessionURLManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionURLManager.ts#L155).
  - But share-link apply only calls `session.setSourceB(...)` when `state.sourceBIndex` is present and never calls `session.clearSourceB()` when it is absent in [src/services/SessionURLService.ts](/Users/lifeart/Repos/openrv-web/src/services/SessionURLService.ts#L184) through [src/services/SessionURLService.ts](/Users/lifeart/Repos/openrv-web/src/services/SessionURLService.ts#L220).
  - The live playback/session stack does have an explicit clear path for B assignments via `clearSourceB()` in [src/core/session/SessionPlayback.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionPlayback.ts#L352) through [src/core/session/SessionPlayback.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionPlayback.ts#L357) and [src/core/session/ABCompareManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/ABCompareManager.ts#L141) through [src/core/session/ABCompareManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/ABCompareManager.ts#L151).
- Impact:
  - If the sender has no B source assigned, the recipient can keep a stale local B assignment after opening the share link.
  - That makes share-link compare state depend on the receiver's prior local compare setup instead of the sender's actual state.

### 429. Share links claim to share comparison state, but clean recipients can only reconstruct one media source

- Severity: Medium
- Area: URL sharing / compare-state interoperability
- Evidence:
  - The share-link subsystem explicitly describes URL sharing as including “comparison state” in [src/core/session/SessionURLManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionURLManager.ts#L1) through [src/core/session/SessionURLManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionURLManager.ts#L6).
  - But `SessionURLState` carries only a single `sourceUrl`, not a source list, in [src/core/session/SessionURLManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionURLManager.ts#L16) through [src/core/session/SessionURLManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionURLManager.ts#L39).
  - Capture fills that field from only `session.currentSource?.url` in [src/services/SessionURLService.ts](/Users/lifeart/Repos/openrv-web/src/services/SessionURLService.ts#L120) through [src/services/SessionURLService.ts](/Users/lifeart/Repos/openrv-web/src/services/SessionURLService.ts#L145).
  - On a clean recipient, apply will load at most that one URL before restoring compare state in [src/services/SessionURLService.ts](/Users/lifeart/Repos/openrv-web/src/services/SessionURLService.ts#L152) through [src/services/SessionURLService.ts](/Users/lifeart/Repos/openrv-web/src/services/SessionURLService.ts#L189).
  - A/B compare only becomes available when a valid B source exists, as enforced by [src/core/session/ABCompareManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/ABCompareManager.ts#L76) through [src/core/session/ABCompareManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/ABCompareManager.ts#L79) and [src/core/session/SessionPlayback.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionPlayback.ts#L379) through [src/core/session/SessionPlayback.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionPlayback.ts#L382).
- Impact:
  - A share link from a multi-source A/B review can carry compare indices and wipe state but still fail to reconstruct the compared media on a clean recipient.
  - The receiver ends up with partial compare state and only one loaded source, which undermines the feature's stated “comparison state” promise.

### 430. Share-link media load failures are silent to users

- Severity: Medium
- Area: URL sharing / error handling
- Evidence:
  - When a share link contains `sourceUrl`, `applySessionURLState(...)` attempts `session.loadSourceFromUrl(...)` only inside a local `try/catch` in [src/services/SessionURLService.ts](/Users/lifeart/Repos/openrv-web/src/services/SessionURLService.ts#L152) through [src/services/SessionURLService.ts](/Users/lifeart/Repos/openrv-web/src/services/SessionURLService.ts#L164).
  - On failure, that path only emits `console.warn(...)` and then continues applying view state in [src/services/SessionURLService.ts](/Users/lifeart/Repos/openrv-web/src/services/SessionURLService.ts#L158) through [src/services/SessionURLService.ts](/Users/lifeart/Repos/openrv-web/src/services/SessionURLService.ts#L164).
  - The startup bootstrap path does surface user-facing messages for malformed WebRTC links through `networkControl.showInfo(...)` in [src/services/SessionURLService.ts](/Users/lifeart/Repos/openrv-web/src/services/SessionURLService.ts#L265) through [src/services/SessionURLService.ts](/Users/lifeart/Repos/openrv-web/src/services/SessionURLService.ts#L302), but there is no equivalent user-facing branch for `sourceUrl` load failures.
- Impact:
  - Expired signed URLs, blocked network media, or unsupported remote media can open as a blank or stale viewer with no actionable explanation.
  - The failure mode is effectively “open the app and log to console,” which is not usable for ordinary recipients of a share link.

### 431. Media-bearing share links only load the shared media on an empty session

- Severity: High
- Area: URL sharing / session bootstrap
- Evidence:
  - `applySessionURLState(...)` attempts `loadSourceFromUrl(...)` only behind `if (session.sourceCount === 0 && state.sourceUrl && session.loadSourceFromUrl)` in [src/services/SessionURLService.ts](/Users/lifeart/Repos/openrv-web/src/services/SessionURLService.ts#L148) through [src/services/SessionURLService.ts](/Users/lifeart/Repos/openrv-web/src/services/SessionURLService.ts#L164).
  - When the recipient already has any media loaded, the same method skips `sourceUrl` entirely and proceeds to apply frame/source/view state to the existing session in [src/services/SessionURLService.ts](/Users/lifeart/Repos/openrv-web/src/services/SessionURLService.ts#L166) through [src/services/SessionURLService.ts](/Users/lifeart/Repos/openrv-web/src/services/SessionURLService.ts#L220).
  - Share-link capture still records the sender's current `sourceUrl` in [src/services/SessionURLService.ts](/Users/lifeart/Repos/openrv-web/src/services/SessionURLService.ts#L122) through [src/services/SessionURLService.ts](/Users/lifeart/Repos/openrv-web/src/services/SessionURLService.ts#L145), so the shared media identity is available but intentionally ignored once the receiver is not on a blank session.
- Impact:
  - Opening a media-bearing share link while you already have anything loaded can apply the sender's frame/view/compare state to the wrong local media instead of the shared media.
  - That makes share links context-sensitive: the same link behaves differently depending on whether the recipient opens it in a fresh app state or not.

### 432. Share-link parsing validates `sourceIndex`, but not A/B compare indices

- Severity: Medium
- Area: URL sharing / compare-state validation
- Evidence:
  - `parseState(...)` rejects invalid primary `sourceIndex` values, but accepts any numeric `sai` / `sbi` as `sourceAIndex` / `sourceBIndex` in [src/core/session/SessionURLManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionURLManager.ts#L196) through [src/core/session/SessionURLManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionURLManager.ts#L205).
  - `applySessionURLState(...)` clamps the primary `sourceIndex` before applying it, but forwards `sourceAIndex` and `sourceBIndex` raw to the session in [src/services/SessionURLService.ts](/Users/lifeart/Repos/openrv-web/src/services/SessionURLService.ts#L169) through [src/services/SessionURLService.ts](/Users/lifeart/Repos/openrv-web/src/services/SessionURLService.ts#L189).
  - The A/B manager silently ignores out-of-range compare indices rather than clearing or clamping them in [src/core/session/ABCompareManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/ABCompareManager.ts#L124) through [src/core/session/ABCompareManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/ABCompareManager.ts#L138).
  - The same restore path does have an explicit B-clear API available, but URL-state apply never uses it in [src/core/session/ABCompareManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/ABCompareManager.ts#L141) through [src/core/session/ABCompareManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/ABCompareManager.ts#L151).
- Impact:
  - Malformed or source-count-mismatched share links can leave stale local A/B assignments behind even though the primary source index is sanitized.
  - Compare-state restore is therefore less deterministic than normal source restore and can depend on the receiver's prior session state.

### 433. Malformed normal session share links fail silently during URL bootstrap

- Severity: Medium
- Area: URL sharing / bootstrap error handling
- Evidence:
  - `decodeSessionState(...)` returns `null` for empty, invalid, or unparsable `#s=...` payloads in [src/core/session/SessionURLManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionURLManager.ts#L65) through [src/core/session/SessionURLManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionURLManager.ts#L83).
  - `handleURLBootstrap()` only applies shared state when `decodeSessionState(...)` returns a value and otherwise does nothing in [src/services/SessionURLService.ts](/Users/lifeart/Repos/openrv-web/src/services/SessionURLService.ts#L312) through [src/services/SessionURLService.ts](/Users/lifeart/Repos/openrv-web/src/services/SessionURLService.ts#L315).
  - The test suite codifies that behavior as “handles invalid hash gracefully (no crash)” with no user-facing message in [src/services/SessionURLService.test.ts](/Users/lifeart/Repos/openrv-web/src/services/SessionURLService.test.ts#L423) through [src/services/SessionURLService.test.ts#L430).
  - By contrast, the same bootstrap service explicitly calls `networkControl.showInfo(...)` for malformed WebRTC links in [src/services/SessionURLService.ts](/Users/lifeart/Repos/openrv-web/src/services/SessionURLService.ts#L296) through [src/services/SessionURLService.ts#L302).
- Impact:
  - A corrupted or truncated normal share URL can open the app with no state applied and no explanation of why the link failed.
  - The behavior is inconsistent with malformed WebRTC links, which do surface actionable feedback.

### 434. Malformed WebSocket sync messages are dropped silently with no error path

- Severity: Medium
- Area: Collaboration / WebSocket protocol handling
- Evidence:
  - `WebSocketClient.handleMessage(...)` deserializes incoming strings and immediately returns when `deserializeMessage(...)` fails, under the explicit comment `Reject malformed messages silently`, in [src/network/WebSocketClient.ts](/Users/lifeart/Repos/openrv-web/src/network/WebSocketClient.ts#L196) through [src/network/WebSocketClient.ts#L203).
  - `NetworkSyncManager` depends on the client's `message` and `error` events for protocol handling and user-facing error propagation in [src/network/NetworkSyncManager.ts](/Users/lifeart/Repos/openrv-web/src/network/NetworkSyncManager.ts#L759) through [src/network/NetworkSyncManager.ts#L806).
  - The current tests codify the silent-drop behavior by asserting malformed messages do not reach any handler in [src/network/WebSocketClient.test.ts](/Users/lifeart/Repos/openrv-web/src/network/WebSocketClient.test.ts#L194) through [src/network/WebSocketClient.test.ts#L205).
- Impact:
  - A server/proxy that sends malformed or truncated sync payloads can cause missed collaboration updates with no toast, no error event, and no visible explanation.
  - That makes protocol corruption look like random state drift rather than a diagnosable network failure.

### 435. Inbound WebSocket `ping` messages never send the `pong` response the protocol advertises

- Severity: Medium
- Area: Collaboration / WebSocket protocol compatibility
- Evidence:
  - The protocol layer defines a first-class `createPongMessage(...)` helper specifically “in response to a ping” in [src/network/MessageProtocol.ts](/Users/lifeart/Repos/openrv-web/src/network/MessageProtocol.ts#L275) through [src/network/MessageProtocol.ts#L281).
  - `WebSocketClient.handleMessage(...)` also documents inbound `ping` handling as “responding with pong,” but the actual branch only calls `resetHeartbeatTimeout()` and returns in [src/network/WebSocketClient.ts](/Users/lifeart/Repos/openrv-web/src/network/WebSocketClient.ts#L205) through [src/network/WebSocketClient.ts#L214).
  - A production source search finds no callsite that sends `createPongMessage(...)` from `WebSocketClient`.
- Impact:
  - Inference: any server or relay that expects the browser client to answer protocol `ping` messages with `pong` can treat the client as unhealthy even while the local UI thinks the socket is fine.
  - At minimum, the shipped client behavior does not match its own protocol helper and inline comment, which makes cross-implementation interoperability brittle.

### 436. Outbound collaboration updates can be dropped silently when realtime transport send fails

- Severity: Medium
- Area: Collaboration / outbound transport reliability
- Evidence:
  - `WebSocketClient.send(...)` explicitly returns `false` when the socket is not open or serialization/send throws in [src/network/WebSocketClient.ts](/Users/lifeart/Repos/openrv-web/src/network/WebSocketClient.ts#L109) through [src/network/WebSocketClient.ts#L124).
  - `NetworkSyncManager.dispatchRealtimeMessage(...)` only checks that WebSocket return value, then tries the serverless data channel once and ignores whether that fallback also returned `false` in [src/network/NetworkSyncManager.ts](/Users/lifeart/Repos/openrv-web/src/network/NetworkSyncManager.ts#L1221) through [src/network/NetworkSyncManager.ts#L1238).
  - All of the live sync senders (`sendPlaybackSync`, `sendFrameSync`, `sendViewSync`, `sendColorSync`, `sendAnnotationSync`, `sendNoteSync`, `sendCursorPosition`, media-sync messages, and permission changes) route through that same helper in [src/network/NetworkSyncManager.ts](/Users/lifeart/Repos/openrv-web/src/network/NetworkSyncManager.ts#L463) through [src/network/NetworkSyncManager.ts#L742).
- Impact:
  - During transport flaps or serialization failures, local sync changes can be treated as sent even though neither WebSocket nor serverless peer transport accepted the message.
  - From the user’s perspective, collaboration can drift silently instead of surfacing an actionable transport failure.

### 437. The auto-save failure alert points users to a nonexistent `File > Save Project` path

- Severity: Low
- Area: Persistence UX / recovery messaging
- Evidence:
  - When auto-save initialization fails, the app shows the alert text `You can still save manually via File > Save Project.` in [src/AppPersistenceManager.ts](/Users/lifeart/Repos/openrv-web/src/AppPersistenceManager.ts#L486) through [src/AppPersistenceManager.ts#L493).
  - The shipped UI exposes save as an icon button and header event, not through any `File` menu, in [src/ui/components/layout/HeaderBar.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/layout/HeaderBar.ts#L237) and [src/AppPlaybackWiring.ts](/Users/lifeart/Repos/openrv-web/src/AppPlaybackWiring.ts#L60).
- Impact:
  - In one of the app’s higher-stress failure modes, the fallback guidance points users to UI that does not exist.
  - That makes the recovery message less useful exactly when the user most needs a clear manual-save path.

### 438. DCC `loadMedia` misroutes signed or query-string video URLs through the image path

- Severity: Medium
- Area: DCC integration / media loading
- Evidence:
  - Inbound DCC `loadMedia` routing derives the extension with `path.split('.').pop()?.toLowerCase()` in [src/AppDCCWiring.ts](/Users/lifeart/Repos/openrv-web/src/AppDCCWiring.ts#L184) through [src/AppDCCWiring.ts#L190).
  - That check does not strip query strings or hash fragments, so a URL like `shot.mov?token=abc` yields `mov?token=abc`, which fails the `VIDEO_EXTENSIONS` test in [src/AppDCCWiring.ts](/Users/lifeart/Repos/openrv-web/src/AppDCCWiring.ts#L79) and [src/AppDCCWiring.ts](/Users/lifeart/Repos/openrv-web/src/AppDCCWiring.ts#L190).
  - The DCC protocol explicitly allows `path` to be a file path or URL in [src/integrations/DCCBridge.ts](/Users/lifeart/Repos/openrv-web/src/integrations/DCCBridge.ts#L35).
- Impact:
  - DCC tools that send signed review URLs or CDN URLs can have video media routed into `loadImage(...)` instead of `loadVideo(...)`.
  - That makes DCC media loading less reliable for the exact URL-based workflows the protocol claims to support.

### 439. DCC LUT sync requests can apply out of order when multiple LUT URLs arrive quickly

- Severity: Medium
- Area: DCC integration / color sync ordering
- Evidence:
  - Each inbound `syncColor` with `lutPath` kicks off `fetchAndApplyLUT(...)` without awaiting or cancelling prior requests in [src/AppDCCWiring.ts](/Users/lifeart/Repos/openrv-web/src/AppDCCWiring.ts#L228) through [src/AppDCCWiring.ts#L242).
  - `fetchAndApplyLUT(...)` is asynchronous and applies its result directly to `colorControls.setLUT(...)` and `viewer.setLUT(...)` when the fetch/parse completes in [src/AppDCCWiring.ts](/Users/lifeart/Repos/openrv-web/src/AppDCCWiring.ts#L95) through [src/AppDCCWiring.ts](/Users/lifeart/Repos/openrv-web/src/AppDCCWiring.ts#L119).
  - There is no generation token, cancellation, or “latest request wins” check anywhere in the DCC LUT-sync path.
- Impact:
  - Inference: if a slower older LUT request resolves after a newer one, it can overwrite the newer DCC color state and leave the viewer on stale LUT content.
  - That makes rapid DCC-driven look switching race-sensitive instead of deterministic.

### 440. URL-based media loading bypasses the app's decoder stack and breaks remote EXR or other decoder-backed images

- Severity: Medium
- Area: Share links / DCC integration / URL media loading
- Evidence:
  - `Session.loadSourceFromUrl(...)` classifies URL media only as “known video extension” vs “everything else,” and routes every non-video URL into `loadImage(...)` in [src/core/session/Session.ts](/Users/lifeart/Repos/openrv-web/src/core/session/Session.ts#L1119) through [src/core/session/Session.ts](/Users/lifeart/Repos/openrv-web/src/core/session/Session.ts#L1139).
  - `SessionMedia.loadImage(...)` then loads the URL through a plain `HTMLImageElement` in [src/core/session/SessionMedia.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionMedia.ts#L400) through [src/core/session/SessionMedia.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionMedia.ts#L434), bypassing the `FileSourceNode` and decoder-backed file pipeline used for EXR, TIFF, RAW previews, and other advanced formats in [src/core/session/SessionMedia.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionMedia.ts#L437) through [src/core/session/SessionMedia.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionMedia.ts#L515).
  - Share-link bootstrap uses `session.loadSourceFromUrl(...)` for `sourceUrl` reconstruction in [src/services/SessionURLService.ts](/Users/lifeart/Repos/openrv-web/src/services/SessionURLService.ts#L152) through [src/services/SessionURLService.ts](/Users/lifeart/Repos/openrv-web/src/services/SessionURLService.ts#L157), and DCC `loadMedia` sends non-video URLs through `session.loadImage(...)` in [src/AppDCCWiring.ts](/Users/lifeart/Repos/openrv-web/src/AppDCCWiring.ts#L184) through [src/AppDCCWiring.ts](/Users/lifeart/Repos/openrv-web/src/AppDCCWiring.ts#L221).
- Impact:
  - Remote EXR plates, float TIFFs, and other formats that only work through the decoder/file pipeline cannot be reconstructed from share links or loaded via URL-based DCC commands even though the app broadly advertises support for those formats.
  - URL workflows are materially less capable than file workflows, which makes remote review/integration flows unreliable for high-end image formats.

### 441. URL-based media loading cannot detect extensionless or routed video URLs and falls back to the image path

- Severity: Medium
- Area: Share links / DCC integration / URL media detection
- Evidence:
  - `Session.loadSourceFromUrl(...)` extracts the media type only from the last pathname extension in [src/core/session/Session.ts](/Users/lifeart/Repos/openrv-web/src/core/session/Session.ts#L1131) through [src/core/session/Session.ts](/Users/lifeart/Repos/openrv-web/src/core/session/Session.ts#L1137); if there is no recognizable extension, it unconditionally calls `loadImage(...)` in [src/core/session/Session.ts](/Users/lifeart/Repos/openrv-web/src/core/session/Session.ts#L1139).
  - DCC `loadMedia` uses the same extension-only heuristic with `path.split('.').pop()?.toLowerCase()` in [src/AppDCCWiring.ts](/Users/lifeart/Repos/openrv-web/src/AppDCCWiring.ts#L186) through [src/AppDCCWiring.ts](/Users/lifeart/Repos/openrv-web/src/AppDCCWiring.ts#L190).
  - The file-loading side of the app explicitly documents a more reliable magic-number-first detection strategy for real files in [docs/guides/file-formats.md](/Users/lifeart/Repos/openrv-web/docs/guides/file-formats.md#L11), but the URL path never gets equivalent sniffing or content-type-based detection.
- Impact:
  - CDN or API-style video URLs such as `/media/12345`, `/stream/latest`, or signed routes without a terminal extension can be treated as still images and fail to load correctly.
  - The app's URL-based loading is weaker than its file-loading path in a way that is hard for integrators and share-link users to predict from the UI.

### 442. The DCC bridge heartbeat timeout is effectively dead, and its keepalive path sends unsolicited `pong` messages instead

- Severity: Medium
- Area: DCC integration / connection health
- Evidence:
  - `DCCBridgeConfig` exposes both `heartbeatInterval` and `heartbeatTimeout`, and the bridge stores `heartbeatTimeoutTimer` plus `_lastPongTime` state in [src/integrations/DCCBridge.ts](/Users/lifeart/Repos/openrv-web/src/integrations/DCCBridge.ts#L141) through [src/integrations/DCCBridge.ts](/Users/lifeart/Repos/openrv-web/src/integrations/DCCBridge.ts#L198).
  - The only runtime heartbeat loop just sends `{ type: 'pong' }` on an interval in [src/integrations/DCCBridge.ts](/Users/lifeart/Repos/openrv-web/src/integrations/DCCBridge.ts#L508) through [src/integrations/DCCBridge.ts](/Users/lifeart/Repos/openrv-web/src/integrations/DCCBridge.ts#L518).
  - `handlePing(...)` updates `_lastPongTime` and replies with `pong` in [src/integrations/DCCBridge.ts](/Users/lifeart/Repos/openrv-web/src/integrations/DCCBridge.ts#L463) through [src/integrations/DCCBridge.ts](/Users/lifeart/Repos/openrv-web/src/integrations/DCCBridge.ts#L466), but production search finds no code that ever schedules `heartbeatTimeoutTimer` or evaluates `_lastPongTime` against `heartbeatTimeout`.
- Impact:
  - Inference: a DCC peer that stops responding at the protocol level can remain in a healthy-looking `connected` state until the browser WebSocket itself closes, because the bridge never enforces its own heartbeat timeout.
  - The runtime behavior also does not match the advertised ping/pong health model, which makes cross-tool heartbeat expectations brittle.

### 443. Outbound DCC sync events can be dropped silently when the bridge is not writable

- Severity: Medium
- Area: DCC integration / outbound reliability
- Evidence:
  - `DCCBridge.send(...)` returns `false` immediately when no WebSocket is open, and only emits an `error` event when a `ws.send(...)` call itself throws in [src/integrations/DCCBridge.ts](/Users/lifeart/Repos/openrv-web/src/integrations/DCCBridge.ts#L266) through [src/integrations/DCCBridge.ts](/Users/lifeart/Repos/openrv-web/src/integrations/DCCBridge.ts#L280).
  - The app-level outbound DCC wiring ignores those return values for frame sync, color sync, and annotation sync in [src/AppDCCWiring.ts](/Users/lifeart/Repos/openrv-web/src/AppDCCWiring.ts#L246) through [src/AppDCCWiring.ts](/Users/lifeart/Repos/openrv-web/src/AppDCCWiring.ts#L276).
  - That means the `frameChanged`, `colorChanged`, and `annotationAdded` paths have no retry, queue, or user/tool feedback when the bridge is temporarily disconnected or otherwise unwritable.
- Impact:
  - DCC-driven review sync can quietly stop propagating outbound viewer changes even though the local app continues to behave normally.
  - From the DCC side, lost updates look like random desynchronization rather than an explicit transport failure.

### 444. The DCC guide promises a configurable bridge endpoint, but production only supports `?dcc=` URL bootstrap

- Severity: Low
- Area: Documentation / DCC connection setup
- Evidence:
  - The DCC guide says the browser connects to `ws://localhost:9200` and that for remote setups “the bridge server address can be configured in the OpenRV Web settings” in [docs/advanced/dcc-integration.md](/Users/lifeart/Repos/openrv-web/docs/advanced/dcc-integration.md#L24) through [docs/advanced/dcc-integration.md](/Users/lifeart/Repos/openrv-web/docs/advanced/dcc-integration.md#L27).
  - Production bootstrap only creates the bridge when a `dcc` query parameter is present in the page URL, in [src/App.ts](/Users/lifeart/Repos/openrv-web/src/App.ts#L603) through [src/App.ts](/Users/lifeart/Repos/openrv-web/src/App.ts#L617).
  - A production-code search finds no DCC settings panel, no persisted DCC endpoint preference, and no other runtime entry point for configuring a bridge URL outside that query-param path.
- Impact:
  - Users following the guide can look for a settings-driven DCC connection flow that the shipped app does not provide.
  - Remote or repeated DCC setups are less usable than documented because the endpoint must be supplied out-of-band in the launch URL.

### 445. The DCC guide promises browser review notes back to the DCC, but the shipped bridge only reports paint annotations

- Severity: Low
- Area: Documentation / DCC review roundtrip
- Evidence:
  - The DCC guide says artists can “push review notes and status updates back to the DCC” and that outbound viewer messages include `annotationCreated` in [docs/advanced/dcc-integration.md](/Users/lifeart/Repos/openrv-web/docs/advanced/dcc-integration.md#L3) through [docs/advanced/dcc-integration.md](/Users/lifeart/Repos/openrv-web/docs/advanced/dcc-integration.md#L4) and [docs/advanced/dcc-integration.md](/Users/lifeart/Repos/openrv-web/docs/advanced/dcc-integration.md#L89) through [docs/advanced/dcc-integration.md](/Users/lifeart/Repos/openrv-web/docs/advanced/dcc-integration.md#L96).
  - The actual outbound protocol defines `annotationAdded`, not `annotationCreated`, and it has no note message type at all in [src/integrations/DCCBridge.ts](/Users/lifeart/Repos/openrv-web/src/integrations/DCCBridge.ts#L26) through [src/integrations/DCCBridge.ts](/Users/lifeart/Repos/openrv-web/src/integrations/DCCBridge.ts#L27) and [src/integrations/DCCBridge.ts](/Users/lifeart/Repos/openrv-web/src/integrations/DCCBridge.ts#L91) through [src/integrations/DCCBridge.ts](/Users/lifeart/Repos/openrv-web/src/integrations/DCCBridge.ts#L117).
  - Production wiring only forwards `paintEngine.strokeAdded` through `sendAnnotationAdded(...)` in [src/AppDCCWiring.ts](/Users/lifeart/Repos/openrv-web/src/AppDCCWiring.ts#L267) through [src/AppDCCWiring.ts](/Users/lifeart/Repos/openrv-web/src/AppDCCWiring.ts#L276), and there is no runtime subscriber to note-manager changes in the DCC path.
- Impact:
  - Users and integrators can expect note-level review roundtrip from the guide, but the shipped bridge only reports paint annotations.
  - That makes the documented DCC review loop sound richer than the real protocol and can mislead pipeline implementers about what feedback types they will receive.

### 446. The DCC guide overstates app-specific Nuke, Maya, and Houdini workflows that the shipped bridge does not model

- Severity: Medium
- Area: Documentation / DCC feature scope
- Evidence:
  - The DCC guide presents concrete app-specific features such as Nuke node-selection sync and flipbook replacement, Maya camera sync and shot-context push, and Houdini flipbook/MPlay integration in [docs/advanced/dcc-integration.md](/Users/lifeart/Repos/openrv-web/docs/advanced/dcc-integration.md#L33) through [docs/advanced/dcc-integration.md](/Users/lifeart/Repos/openrv-web/docs/advanced/dcc-integration.md#L61).
  - The actual shipped bridge protocol only exposes four inbound message types (`loadMedia`, `syncFrame`, `syncColor`, `ping`) and a small outbound set (`frameChanged`, `colorChanged`, `annotationAdded`, `pong`, `error`) in [src/integrations/DCCBridge.ts](/Users/lifeart/Repos/openrv-web/src/integrations/DCCBridge.ts#L23) through [src/integrations/DCCBridge.ts](/Users/lifeart/Repos/openrv-web/src/integrations/DCCBridge.ts#L27) and [src/integrations/DCCBridge.ts](/Users/lifeart/Repos/openrv-web/src/integrations/DCCBridge.ts#L112) through [src/integrations/DCCBridge.ts](/Users/lifeart/Repos/openrv-web/src/integrations/DCCBridge.ts#L117).
  - App wiring only connects those generic media/frame/color/annotation paths in [src/AppDCCWiring.ts](/Users/lifeart/Repos/openrv-web/src/AppDCCWiring.ts#L172) through [src/AppDCCWiring.ts](/Users/lifeart/Repos/openrv-web/src/AppDCCWiring.ts#L280), and a production-code search finds no Nuke-, Maya-, or Houdini-specific bridge module or runtime feature layer.
- Impact:
  - Pipeline teams reading the guide can expect first-class DCC-specific workflows that the shipped browser app does not actually expose as protocol or UI features.
  - The real integration surface is a generic WebSocket media/frame/color bridge, not the richer per-application workflow the docs currently imply.

### 447. The network-sync guide promises a manual reconnect option after retry exhaustion, but the shipped UI exposes none

- Severity: Low
- Area: Documentation / collaboration recovery UX
- Evidence:
  - The network-sync guide says that after 10 failed reconnect attempts, "the system stops retrying and presents a manual reconnect option" in [docs/advanced/network-sync.md](/Users/lifeart/Repos/openrv-web/docs/advanced/network-sync.md#L133) through [docs/advanced/network-sync.md](/Users/lifeart/Repos/openrv-web/docs/advanced/network-sync.md#L137).
  - When reconnect attempts are exhausted, `NetworkSyncManager` only emits a toast/error pair with `Failed to reconnect. Please try again.` in [src/network/NetworkSyncManager.ts](/Users/lifeart/Repos/openrv-web/src/network/NetworkSyncManager.ts#L785) through [src/network/NetworkSyncManager.ts](/Users/lifeart/Repos/openrv-web/src/network/NetworkSyncManager.ts#L794).
  - The shipped `NetworkControl` has disconnected, connecting, and connected panels, but no reconnect button or dedicated retry action; the disconnected panel only offers create/join flows in [src/ui/components/NetworkControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/NetworkControl.ts#L350) through [src/ui/components/NetworkControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/NetworkControl.ts#L544).
- Impact:
  - Users following the guide can expect an explicit reconnect affordance that never appears after retry exhaustion.
  - In practice, recovery falls back to manually recreating or rejoining the room through the generic disconnected UI rather than a dedicated reconnect path.

### 448. Cursor sharing is active in the collaboration stack, but the shipped sync-settings UI gives users no cursor toggle

- Severity: Medium
- Area: Collaboration UI / settings completeness
- Evidence:
  - The live sync model defines `cursor` as a first-class sync category and enables it by default in [src/network/types.ts](/Users/lifeart/Repos/openrv-web/src/network/types.ts#L30) through [src/network/types.ts](/Users/lifeart/Repos/openrv-web/src/network/types.ts#L48).
  - The runtime has a dedicated `sendCursorPosition(...)` path gated by `syncSettings.cursor` in [src/network/NetworkSyncManager.ts](/Users/lifeart/Repos/openrv-web/src/network/NetworkSyncManager.ts#L521) through [src/network/NetworkSyncManager.ts](/Users/lifeart/Repos/openrv-web/src/network/NetworkSyncManager.ts#L538).
  - The shipped Network Sync panel only renders checkboxes for `playback`, `view`, `color`, and `annotations`; it never exposes `cursor` in [src/ui/components/NetworkControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/NetworkControl.ts#L787) through [src/ui/components/NetworkControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/NetworkControl.ts#L821).
  - The FAQ still advertises cursor-position sync as part of collaboration in [docs/reference/faq.md](/Users/lifeart/Repos/openrv-web/docs/reference/faq.md#L73) through [docs/reference/faq.md](/Users/lifeart/Repos/openrv-web/docs/reference/faq.md#L79), but the main Network Sync guide's settings table likewise omits any cursor toggle in [docs/advanced/network-sync.md](/Users/lifeart/Repos/openrv-web/docs/advanced/network-sync.md#L52) through [docs/advanced/network-sync.md](/Users/lifeart/Repos/openrv-web/docs/advanced/network-sync.md#L68).
- Impact:
  - Users can have remote cursor sharing turned on by default without any shipped UI to inspect or disable it.
  - The collaboration docs describe cursor sync as part of the product, but the actual settings surface makes it look like only four categories are controllable.

### 449. Remote cursor sync is transported and tracked, but the shipped app never renders or consumes it

- Severity: Medium
- Area: Collaboration runtime wiring
- Evidence:
  - Incoming `sync.cursor` messages are handled, sanitized, stored in `_remoteCursors`, and emitted as `syncCursor` events in [src/network/NetworkSyncManager.ts](/Users/lifeart/Repos/openrv-web/src/network/NetworkSyncManager.ts#L870) and [src/network/NetworkSyncManager.ts](/Users/lifeart/Repos/openrv-web/src/network/NetworkSyncManager.ts#L1091) through [src/network/NetworkSyncManager.ts](/Users/lifeart/Repos/openrv-web/src/network/NetworkSyncManager.ts#L1099).
  - `NetworkSyncManager` also exposes `remoteCursors` as public state in [src/network/NetworkSyncManager.ts](/Users/lifeart/Repos/openrv-web/src/network/NetworkSyncManager.ts#L226) through [src/network/NetworkSyncManager.ts](/Users/lifeart/Repos/openrv-web/src/network/NetworkSyncManager.ts#L228).
  - A production-code search finds `syncCursor` subscribers only in tests; there is no live subscriber in app wiring, viewer code, or UI components outside [src/network/CollaborationEnhancements.test.ts](/Users/lifeart/Repos/openrv-web/src/network/CollaborationEnhancements.test.ts#L269), [src/network/CollaborationEnhancements.test.ts](/Users/lifeart/Repos/openrv-web/src/network/CollaborationEnhancements.test.ts#L717), and [src/network/CollaborationEnhancements.test.ts](/Users/lifeart/Repos/openrv-web/src/network/CollaborationEnhancements.test.ts#L791).
  - Likewise, a production-code search finds no use of `remoteCursors` outside `NetworkSyncManager` itself.
  - The FAQ still tells users that collaboration syncs cursor position in [docs/reference/faq.md](/Users/lifeart/Repos/openrv-web/docs/reference/faq.md#L73) through [docs/reference/faq.md](/Users/lifeart/Repos/openrv-web/docs/reference/faq.md#L79).
- Impact:
  - Cursor-sharing traffic can flow over the collaboration stack without producing any visible or actionable result in the shipped app.
  - Users and integrators can expect shared remote cursors from the advertised feature set, but production stops at transport/state bookkeeping.

### 450. The FAQ still says URL-based loading is not implemented, but production already loads media from `sourceUrl` share links

- Severity: Low
- Area: Documentation / URL-loading feature scope
- Evidence:
  - The FAQ answer to "Can I load files from a URL?" says "URL-based loading is not currently implemented" in [docs/reference/faq.md](/Users/lifeart/Repos/openrv-web/docs/reference/faq.md#L39) through [docs/reference/faq.md](/Users/lifeart/Repos/openrv-web/docs/reference/faq.md#L41).
  - The session URL flow serializes a `sourceUrl` into shared state in [src/services/SessionURLService.ts](/Users/lifeart/Repos/openrv-web/src/services/SessionURLService.ts#L122) through [src/services/SessionURLService.ts](/Users/lifeart/Repos/openrv-web/src/services/SessionURLService.ts#L145).
  - On a clean session, `SessionURLService.applySessionURLState(...)` attempts `session.loadSourceFromUrl(state.sourceUrl)` before applying the rest of the shared state in [src/services/SessionURLService.ts](/Users/lifeart/Repos/openrv-web/src/services/SessionURLService.ts#L148) through [src/services/SessionURLService.ts](/Users/lifeart/Repos/openrv-web/src/services/SessionURLService.ts#L164).
  - The app-level network bootstrap mirrors the same behavior in [src/AppNetworkBridge.ts](/Users/lifeart/Repos/openrv-web/src/AppNetworkBridge.ts#L1091) through [src/AppNetworkBridge.ts](/Users/lifeart/Repos/openrv-web/src/AppNetworkBridge.ts#L1101).
- Impact:
  - The documentation understates a real runtime capability that already exists in share-link/bootstrap flows.
  - Users and integrators reading the FAQ can conclude URL-based review links are impossible, even though the app does support a narrower live `sourceUrl` path today.

### 451. The FAQ describes collaboration as peer-to-peer WebRTC, but the normal room lifecycle is WebSocket-based

- Severity: Low
- Area: Documentation / collaboration architecture
- Evidence:
  - The FAQ says collaborative review features "use peer-to-peer WebRTC connections" and that collaboration "uses WebRTC peer-to-peer connections for real-time collaboration" in [docs/reference/faq.md](/Users/lifeart/Repos/openrv-web/docs/reference/faq.md#L15) and [docs/reference/faq.md](/Users/lifeart/Repos/openrv-web/docs/reference/faq.md#L73) through [docs/reference/faq.md](/Users/lifeart/Repos/openrv-web/docs/reference/faq.md#L75).
  - The collaboration types and main transport are explicitly defined as WebSocket-based in [src/network/types.ts](/Users/lifeart/Repos/openrv-web/src/network/types.ts#L1) through [src/network/types.ts](/Users/lifeart/Repos/openrv-web/src/network/types.ts#L5) and [src/network/WebSocketClient.ts](/Users/lifeart/Repos/openrv-web/src/network/WebSocketClient.ts#L2) through [src/network/WebSocketClient.ts](/Users/lifeart/Repos/openrv-web/src/network/WebSocketClient.ts#L16).
  - Normal `createRoom(...)` and `joinRoom(...)` both connect `wsClient` first and only then send `room.create` / `room.join` in [src/network/NetworkSyncManager.ts](/Users/lifeart/Repos/openrv-web/src/network/NetworkSyncManager.ts#L380) through [src/network/NetworkSyncManager.ts](/Users/lifeart/Repos/openrv-web/src/network/NetworkSyncManager.ts#L395) and [src/network/NetworkSyncManager.ts](/Users/lifeart/Repos/openrv-web/src/network/NetworkSyncManager.ts#L401) through [src/network/NetworkSyncManager.ts](/Users/lifeart/Repos/openrv-web/src/network/NetworkSyncManager.ts#L426).
  - The network guide itself describes WebSocket as the primary sync transport and WebRTC as an additional path in [docs/advanced/network-sync.md](/Users/lifeart/Repos/openrv-web/docs/advanced/network-sync.md#L82) through [docs/advanced/network-sync.md](/Users/lifeart/Repos/openrv-web/docs/advanced/network-sync.md#L115).
- Impact:
  - The FAQ makes collaboration sound like a pure WebRTC system even though production normally depends on a WebSocket room service for create/join and sync transport.
  - Operators reading only the FAQ can underestimate the server/runtime dependencies of the shipped collaboration flow.

### 452. The FAQ says collaboration data stays peer-to-peer, but production falls back to WebSocket for state and media transfer

- Severity: Medium
- Area: Documentation / collaboration data path
- Evidence:
  - The FAQ says "No media passes through any server -- all data flows directly between peers" in [docs/reference/faq.md](/Users/lifeart/Repos/openrv-web/docs/reference/faq.md#L79).
  - `sendSessionStateResponse(...)` is explicitly implemented to try WebRTC first and then fall back to realtime transport in [src/network/NetworkSyncManager.ts](/Users/lifeart/Repos/openrv-web/src/network/NetworkSyncManager.ts#L642) through [src/network/NetworkSyncManager.ts](/Users/lifeart/Repos/openrv-web/src/network/NetworkSyncManager.ts#L668).
  - That realtime path routes through `dispatchRealtimeMessage(...)`, which prefers `wsClient.send(message)` before any serverless peer channel in [src/network/NetworkSyncManager.ts](/Users/lifeart/Repos/openrv-web/src/network/NetworkSyncManager.ts#L1222) through [src/network/NetworkSyncManager.ts](/Users/lifeart/Repos/openrv-web/src/network/NetworkSyncManager.ts#L1232).
  - Media transfer requests are also sent through that same realtime/WebSocket path by default in [src/network/NetworkSyncManager.ts](/Users/lifeart/Repos/openrv-web/src/network/NetworkSyncManager.ts#L670) through [src/network/NetworkSyncManager.ts](/Users/lifeart/Repos/openrv-web/src/network/NetworkSyncManager.ts#L681).
- Impact:
  - The FAQ overstates the privacy and deployment model of collaboration by implying that shared state and media bytes never traverse a server-backed transport.
  - In production, state/media exchange can use the WebSocket path when peer transport is unavailable, so the all-peer-to-peer claim is false.

### 453. The FAQ says locally loaded files never leave the machine, but collaboration media sync can transmit them to other participants

- Severity: Medium
- Area: Documentation / privacy and data movement
- Evidence:
  - The FAQ says files loaded through drag-and-drop or the file picker "never leave the machine" in [docs/reference/faq.md](/Users/lifeart/Repos/openrv-web/docs/reference/faq.md#L15).
  - The collaboration bridge can request local media from another participant through `requestMediaSync(...)` in [src/network/NetworkSyncManager.ts](/Users/lifeart/Repos/openrv-web/src/network/NetworkSyncManager.ts#L670) through [src/network/NetworkSyncManager.ts](/Users/lifeart/Repos/openrv-web/src/network/NetworkSyncManager.ts#L681).
  - The app wiring responds to those requests by reading local file data and sending chunk payloads back through `sendMediaChunk(...)` / `sendMediaComplete(...)` in [src/AppNetworkBridge.ts](/Users/lifeart/Repos/openrv-web/src/AppNetworkBridge.ts#L292) through [src/AppNetworkBridge.ts](/Users/lifeart/Repos/openrv-web/src/AppNetworkBridge.ts#L391) and [src/network/NetworkSyncManager.ts](/Users/lifeart/Repos/openrv-web/src/network/NetworkSyncManager.ts#L723) through [src/network/NetworkSyncManager.ts](/Users/lifeart/Repos/openrv-web/src/network/NetworkSyncManager.ts#L746).
  - Those media chunks are sent over the same realtime transport helper in [src/network/NetworkSyncManager.ts](/Users/lifeart/Repos/openrv-web/src/network/NetworkSyncManager.ts#L1222) through [src/network/NetworkSyncManager.ts](/Users/lifeart/Repos/openrv-web/src/network/NetworkSyncManager.ts#L1232).
- Impact:
  - The FAQ understates how collaboration can move user-selected local media off the originating machine.
  - Users relying on that privacy statement can miss the fact that review peers may receive transferred file contents during sync workflows.

### 454. The self-hosting docs present static hosting as sufficient, but the shipped collaboration flow still expects separate signaling infrastructure

- Severity: Low
- Area: Documentation / deployment requirements
- Evidence:
  - The FAQ says users can self-host by deploying the built `dist/` files "to any web server or static hosting service" in [docs/reference/faq.md](/Users/lifeart/Repos/openrv-web/docs/reference/faq.md#L21) through [docs/reference/faq.md](/Users/lifeart/Repos/openrv-web/docs/reference/faq.md#L23).
  - The installation guide likewise says the production build is "a collection of static files" and that "No server-side runtime is required" in [docs/getting-started/installation.md](/Users/lifeart/Repos/openrv-web/docs/getting-started/installation.md#L55) through [docs/getting-started/installation.md](/Users/lifeart/Repos/openrv-web/docs/getting-started/installation.md#L68).
  - The same installation guide exposes `VITE_NETWORK_SIGNALING_SERVERS` as an environment variable for collaborative review sessions in [docs/getting-started/installation.md](/Users/lifeart/Repos/openrv-web/docs/getting-started/installation.md#L90) through [docs/getting-started/installation.md](/Users/lifeart/Repos/openrv-web/docs/getting-started/installation.md#L96).
  - Production collaboration config ships with a WebSocket signaling URL in [src/network/types.ts](/Users/lifeart/Repos/openrv-web/src/network/types.ts#L445) through [src/network/types.ts](/Users/lifeart/Repos/openrv-web/src/network/types.ts#L453), and normal room create/join still go through `wsClient.connect(...)` in [src/network/NetworkSyncManager.ts](/Users/lifeart/Repos/openrv-web/src/network/NetworkSyncManager.ts#L380) through [src/network/NetworkSyncManager.ts](/Users/lifeart/Repos/openrv-web/src/network/NetworkSyncManager.ts#L426).
- Impact:
  - The deployment docs make the full app sound entirely static-hosted even though the advertised collaboration feature still has external signaling/runtime dependencies in normal operation.
  - Self-hosters can deploy the static app successfully and still be surprised when collaborative review is unavailable or misconfigured.

### 455. The installation guide still says Node 18+ is enough, but the current toolchain declares Node 20.19+ or 22.12+

- Severity: Medium
- Area: Documentation / local build prerequisites
- Evidence:
  - The installation guide still lists "Node.js 18 or later" as the prerequisite in [docs/getting-started/installation.md](/Users/lifeart/Repos/openrv-web/docs/getting-started/installation.md#L21) through [docs/getting-started/installation.md](/Users/lifeart/Repos/openrv-web/docs/getting-started/installation.md#L27).
  - The repository now declares `engines.node` as `^20.19.0 || >=22.12.0` in [package.json](/Users/lifeart/Repos/openrv-web/package.json#L119) through [package.json](/Users/lifeart/Repos/openrv-web/package.json#L121).
  - The locked toolchain reflects that newer floor as well, with `vite@7.3.1` requiring `^20.19.0 || >=22.12.0` and `vitest@4.0.18` requiring Node 20+ in [pnpm-lock.yaml](/Users/lifeart/Repos/openrv-web/pnpm-lock.yaml#L2209) through [pnpm-lock.yaml](/Users/lifeart/Repos/openrv-web/pnpm-lock.yaml#L2211) and [pnpm-lock.yaml](/Users/lifeart/Repos/openrv-web/pnpm-lock.yaml#L2261) through [pnpm-lock.yaml](/Users/lifeart/Repos/openrv-web/pnpm-lock.yaml#L2263).
- Impact:
  - A developer following the published installation guide can start from a supported-looking Node 18 setup and still fail during install/build.
  - The prerequisite docs no longer match the actual package/toolchain contract the repo enforces.

### 456. The browser-requirements guide says Presentation Mode depends on the Fullscreen API, but the runtime mode is separate

- Severity: Low
- Area: Documentation / browser feature requirements
- Evidence:
  - The browser-requirements guide says "Presentation mode (clean display with cursor auto-hide) also depends on this API" under the Fullscreen API section in [docs/getting-started/browser-requirements.md](/Users/lifeart/Repos/openrv-web/docs/getting-started/browser-requirements.md#L71) through [docs/getting-started/browser-requirements.md](/Users/lifeart/Repos/openrv-web/docs/getting-started/browser-requirements.md#L73).
  - `PresentationMode` is implemented as a DOM/UI-hiding mode with cursor auto-hide in [src/utils/ui/PresentationMode.ts](/Users/lifeart/Repos/openrv-web/src/utils/ui/PresentationMode.ts#L1) through [src/utils/ui/PresentationMode.ts#L17), and its state transitions only hide/restore elements and cursor behavior in [src/utils/ui/PresentationMode.ts](/Users/lifeart/Repos/openrv-web/src/utils/ui/PresentationMode.ts#L52) through [src/utils/ui/PresentationMode.ts](/Users/lifeart/Repos/openrv-web/src/utils/ui/PresentationMode.ts#L89).
  - A production-code search of the PresentationMode implementation finds no Fullscreen API call or dependency.
- Impact:
  - The docs overstate the browser requirement for Presentation Mode and make the feature sound unavailable without Fullscreen support.
  - In production, fullscreen and presentation are separate behaviors, so troubleshooting/browser-support guidance becomes less accurate than it should be.

### 457. The image-sequences guide says the detected pattern is shown in sequence information, but the shipped UI never surfaces `sequenceInfo.pattern`

- Severity: Low
- Area: Documentation / image-sequence UI
- Evidence:
  - The image-sequences guide says "The detected pattern is displayed using hash notation ... in the sequence information" in [docs/playback/image-sequences.md](/Users/lifeart/Repos/openrv-web/docs/playback/image-sequences.md#L35).
  - Production code does store the pattern in sequence state and serialization, for example in [src/core/session/loaders/SequenceRepresentationLoader.ts](/Users/lifeart/Repos/openrv-web/src/core/session/loaders/SequenceRepresentationLoader.ts#L59) and [src/core/session/SessionSerializer.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionSerializer.ts#L411).
  - A production-code search finds no UI consumer of `sequenceInfo.pattern` or `sequencePattern`; outside persistence/internal loaders, those fields are not rendered anywhere in the shipped interface.
- Impact:
  - Users reading the sequence docs can expect a visible sequence-pattern readout that never appears in the actual UI.
  - The runtime keeps the pattern as internal metadata, but the documented “sequence information” surface is not real.

### 458. The image-sequences guide presents `detectMissingFrames()` and `isFrameMissing()` as programmatic affordances, but they are internal utilities, not public API

- Severity: Low
- Area: Documentation / scripting surface
- Evidence:
  - The image-sequences guide says missing frames can be queried programmatically via `detectMissingFrames()` and `isFrameMissing(frame)` in [docs/playback/image-sequences.md](/Users/lifeart/Repos/openrv-web/docs/playback/image-sequences.md#L43) through [docs/playback/image-sequences.md](/Users/lifeart/Repos/openrv-web/docs/playback/image-sequences.md#L44).
  - Those functions exist only as exports from the internal utility module [src/utils/media/SequenceLoader.ts](/Users/lifeart/Repos/openrv-web/src/utils/media/SequenceLoader.ts#L268) and [src/utils/media/SequenceLoader.ts](/Users/lifeart/Repos/openrv-web/src/utils/media/SequenceLoader.ts#L290).
  - The shipped public API surface in [src/api/OpenRVAPI.ts](/Users/lifeart/Repos/openrv-web/src/api/OpenRVAPI.ts#L42) through [src/api/OpenRVAPI.ts](/Users/lifeart/Repos/openrv-web/src/api/OpenRVAPI.ts#L98) exposes no sequence/missing-frame module or helper methods for those calls.
- Impact:
  - The docs make internal loader helpers sound like supported scripting features even though end users do not get them through `window.openrv`.
  - That can mislead automation/integration users who treat the page as public-app behavior rather than internal source layout.

### 459. The image-sequences guide says sequence FPS can be configured, but its example only calls `getFPS()` and omits the real public setter

- Severity: Low
- Area: Documentation / scripting surface
- Evidence:
  - The image-sequences guide says "The session FPS can be configured" but the code sample only calls `window.openrv.media.getFPS()` in [docs/playback/image-sequences.md](/Users/lifeart/Repos/openrv-web/docs/playback/image-sequences.md#L56) through [docs/playback/image-sequences.md#L60).
  - The public API does expose `getPlaybackFPS()` and `setPlaybackFPS(...)` for this purpose in [src/api/MediaAPI.ts](/Users/lifeart/Repos/openrv-web/src/api/MediaAPI.ts#L86) through [src/api/MediaAPI.ts](/Users/lifeart/Repos/openrv-web/src/api/MediaAPI.ts#L119).
  - The same page's scripting section never mentions those methods and instead only documents `getFPS()` in [docs/playback/image-sequences.md](/Users/lifeart/Repos/openrv-web/docs/playback/image-sequences.md#L84) through [docs/playback/image-sequences.md#L88).
- Impact:
  - Readers get told that sequence FPS is configurable but are not shown the public method that actually does it.
  - That makes the page's scripting guidance incomplete and nudges users toward the wrong API surface.

### 460. The browser-support docs present External Presentation as a working BroadcastChannel feature, but the shipped feature is already broken at runtime

- Severity: Low
- Area: Documentation / browser compatibility
- Evidence:
  - The browser-requirements page says BroadcastChannel "enables the External Presentation feature, which synchronizes frame, playback, and color state" in [docs/getting-started/browser-requirements.md](/Users/lifeart/Repos/openrv-web/docs/getting-started/browser-requirements.md#L65) through [docs/getting-started/browser-requirements.md#L67).
  - The browser-compatibility matrix likewise lists `BroadcastChannel (ext. presentation)` as an available feature by browser in [docs/reference/browser-compatibility.md](/Users/lifeart/Repos/openrv-web/docs/reference/browser-compatibility.md#L34) through [docs/reference/browser-compatibility.md#L38).
  - The runtime problem is already visible in production code: the external presentation window is a blank shell that only updates frame text while ignoring real viewer rendering/playback/color state, as documented in issue `29` with evidence in [src/ui/components/ExternalPresentation.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/ExternalPresentation.ts#L132) through [src/ui/components/ExternalPresentation.ts#L244) and [src/App.ts](/Users/lifeart/Repos/openrv-web/src/App.ts#L546) through [src/App.ts](/Users/lifeart/Repos/openrv-web/src/App.ts#L566).
- Impact:
  - The compatibility docs make External Presentation sound like a reliable browser-capability question, when the stronger limitation is that the shipped feature itself is not functionally complete.
  - Users can spend time diagnosing browser support for a feature that is already broken independent of API availability.

### 461. The browser-requirements page presents WebRTC as required for network sync, but the normal collaboration path is WebSocket-based

- Severity: Low
- Area: Documentation / browser feature requirements
- Evidence:
  - The browser-requirements page says "WebRTC powers peer-to-peer connections for collaborative review sessions ... Required only for network sync features" in [docs/getting-started/browser-requirements.md](/Users/lifeart/Repos/openrv-web/docs/getting-started/browser-requirements.md#L77) through [docs/getting-started/browser-requirements.md#L79).
  - Normal room create/join flows do not require `RTCPeerConnection`; they go straight through `wsClient.connect(...)` in [src/network/NetworkSyncManager.ts](/Users/lifeart/Repos/openrv-web/src/network/NetworkSyncManager.ts#L377) through [src/network/NetworkSyncManager.ts#L418).
  - `canUseWebRTC()` is only checked for the serverless/WebRTC-specific paths and peer-transfer helpers in [src/network/NetworkSyncManager.ts](/Users/lifeart/Repos/openrv-web/src/network/NetworkSyncManager.ts#L275), [src/network/NetworkSyncManager.ts](/Users/lifeart/Repos/openrv-web/src/network/NetworkSyncManager.ts#L668), and [src/network/NetworkSyncManager.ts](/Users/lifeart/Repos/openrv-web/src/network/NetworkSyncManager.ts#L1542) through [src/network/NetworkSyncManager.ts](/Users/lifeart/Repos/openrv-web/src/network/NetworkSyncManager.ts#L1547).
- Impact:
  - The page overstates WebRTC as a baseline requirement for collaboration when the shipped app’s ordinary room/sync path is primarily WebSocket-driven.
  - Browser-support guidance becomes less accurate, especially for deployments that use collaboration without peer-to-peer fallback paths.

### 462. The UI overview says all interactive controls are semantic and properly labeled, but the shipped UI still has mouse-only/non-semantic interactions

- Severity: Low
- Area: Documentation / accessibility claims
- Evidence:
  - The UI overview says "All interactive controls use semantic HTML elements with appropriate ARIA labels and roles" in [docs/getting-started/ui-overview.md](/Users/lifeart/Repos/openrv-web/docs/getting-started/ui-overview.md#L236) through [docs/getting-started/ui-overview.md#L238).
  - The shipped Pixel Probe exposes copyable value rows as mouse-only `div`s rather than real buttons in [src/ui/components/PixelProbe.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/PixelProbe.ts#L358) through [src/ui/components/PixelProbe.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/PixelProbe.ts#L403), which is already captured as issue `75`.
  - The left/right inspector accordion headers are still mouse-only click targets rather than keyboard-operable disclosure controls in [src/ui/layout/panels/LeftPanelContent.ts](/Users/lifeart/Repos/openrv-web/src/ui/layout/panels/LeftPanelContent.ts#L169) through [src/ui/layout/panels/LeftPanelContent.ts#L206) and [src/ui/layout/panels/RightPanelContent.ts](/Users/lifeart/Repos/openrv-web/src/ui/layout/panels/RightPanelContent.ts#L178) through [src/ui/layout/panels/RightPanelContent.ts#L214), already captured as issue `65`.
- Impact:
  - The overview overstates the current accessibility quality of the shipped UI.
  - Users and auditors can infer a more consistently semantic control surface than the runtime actually provides.

### 463. The UI overview advertises the Info panel as a metadata panel, but production wiring only keeps cursor-color updates alive

- Severity: Low
- Area: Documentation / UI capability description
- Evidence:
  - The UI overview panel table describes `Info panel` as `Filename, resolution, frame, FPS` in [docs/getting-started/ui-overview.md](/Users/lifeart/Repos/openrv-web/docs/getting-started/ui-overview.md#L207) through [docs/getting-started/ui-overview.md#L213).
  - The `InfoPanel` component is implemented to show that richer metadata in [src/ui/components/InfoPanel.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/InfoPanel.ts#L1) through [src/ui/components/InfoPanel.ts#L301).
  - In production wiring, the only live update path is the viewer cursor-color callback in [src/services/LayoutOrchestrator.ts](/Users/lifeart/Repos/openrv-web/src/services/LayoutOrchestrator.ts#L569) through [src/services/LayoutOrchestrator.ts#L576), which is already captured as issue `101`.
- Impact:
  - The getting-started docs make the Info panel sound far more useful than it is in the shipped app.
  - Users can open that panel expecting source/frame metadata and instead get a mostly cursor-color readout.

### 464. The UI overview still teaches `H` and `W` as direct Histogram/Waveform shortcuts even though those defaults are hidden by conflicts

- Severity: Low
- Area: Documentation / keyboard shortcuts
- Evidence:
  - The UI overview panel table still lists `Histogram | H` and `Waveform | W` in [docs/getting-started/ui-overview.md](/Users/lifeart/Repos/openrv-web/docs/getting-started/ui-overview.md#L200) through [docs/getting-started/ui-overview.md#L205).
  - In production, those direct defaults are hidden from registration because `H` and `W` are reserved by other actions in [src/AppKeyboardHandler.ts](/Users/lifeart/Repos/openrv-web/src/AppKeyboardHandler.ts#L43) through [src/AppKeyboardHandler.ts](/Users/lifeart/Repos/openrv-web/src/AppKeyboardHandler.ts#L45).
  - The underlying runtime conflict is already confirmed in issues `1` and `2`.
- Impact:
  - New users can learn broken shortcuts directly from the getting-started overview page.
  - That increases first-use friction for scopes and makes the UI overview less trustworthy as a quick reference.

### 465. The EDL/OTIO guide overstates the main-app import/export paths; those workflows are still mostly confined to the Playlist panel

- Severity: Low
- Area: Documentation / editorial workflow UX
- Evidence:
  - The EDL/OTIO guide says users can export EDL "from the Playlist panel or the Export menu" in [docs/export/edl-otio.md](/Users/lifeart/Repos/openrv-web/docs/export/edl-otio.md#L7) through [docs/export/edl-otio.md#L9).
  - The shipped main `ExportControl` has no EDL or OTIO actions; its menu sections are frame/sequence/video/session/annotations/reports only in [src/ui/components/ExportControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/ExportControl.ts#L170) through [src/ui/components/ExportControl.ts#L220).
  - The same guide says OTIO files can be imported by loading them "through the file picker or drag and drop" in [docs/export/edl-otio.md](/Users/lifeart/Repos/openrv-web/docs/export/edl-otio.md#L59) through [docs/export/edl-otio.md#L67).
  - The normal header file picker and viewer drag-drop paths only special-case `.rvedl`, `.rv`, and `.gto` before falling back to ordinary media loading in [src/ui/components/layout/HeaderBar.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/layout/HeaderBar.ts#L1382) through [src/ui/components/layout/HeaderBar.ts#L1455) and [src/ui/components/ViewerInputHandler.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/ViewerInputHandler.ts#L709) through [src/ui/components/ViewerInputHandler.ts#L761).
  - OTIO import is actually wired through the Playlist panel’s dedicated import input in [src/ui/components/PlaylistPanel.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/PlaylistPanel.ts#L795) through [src/ui/components/PlaylistPanel.ts#L830).
- Impact:
  - Editorial users following the guide can look for EDL export in the header Export menu and generic OTIO drag/drop import, then conclude the app ignored them.
  - The real workflow is narrower and more panel-specific than the guide currently suggests.

### 466. The EDL/OTIO guide presents the Conform/Re-link panel as a working local-file relinker, but its browse actions are still production stubs

- Severity: Low
- Area: Documentation / editorial relink workflow
- Evidence:
  - The EDL/OTIO guide says the Conform/Re-link panel allows "Selecting replacement files from the local filesystem" and that once media is relinked the timeline plays correctly in [docs/export/edl-otio.md](/Users/lifeart/Repos/openrv-web/docs/export/edl-otio.md#L67) through [docs/export/edl-otio.md#L74).
  - `ConformPanel` does implement UI affordances for per-clip browse and folder browse, but those buttons only dispatch `conform-browse` and `conform-browse-folder` custom events in [src/ui/components/ConformPanel.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/ConformPanel.ts#L363) through [src/ui/components/ConformPanel.ts#L376).
  - A production-code search finds no app-level handler for those custom events, which is already captured as issue `51`.
  - The fuzzy filename suggestion logic is real inside the panel in [src/ui/components/ConformPanel.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/ConformPanel.ts#L71) through [src/ui/components/ConformPanel.ts#L186), but the local-file browsing workflow described by the docs is not actually wired through the app.
- Impact:
  - The guide makes the conform workflow sound end-to-end usable when the most important relink entry points still dead-end in production.
  - Editorial users can reach the panel, see browse actions, and assume they missed something when the app simply does not handle them.

### 467. The OTIO import docs claim markers are imported, but the shipped parser does not read OTIO marker data at all

- Severity: Low
- Area: Documentation / OTIO feature coverage
- Evidence:
  - The EDL/OTIO guide's supported-elements table lists `Markers | Imported as timeline markers` in [docs/export/edl-otio.md](/Users/lifeart/Repos/openrv-web/docs/export/edl-otio.md#L49) through [docs/export/edl-otio.md#L56).
  - The shipped OTIO parser only models clips, gaps, transitions, tracks, stacks, timelines, media references, and metadata in [src/utils/media/OTIOParser.ts](/Users/lifeart/Repos/openrv-web/src/utils/media/OTIOParser.ts#L9) through [src/utils/media/OTIOParser.ts#L155).
  - `parseTrack(...)` only handles `Clip.1`, `Gap.1`, and `Transition.1` children in [src/utils/media/OTIOParser.ts](/Users/lifeart/Repos/openrv-web/src/utils/media/OTIOParser.ts#L217) through [src/utils/media/OTIOParser.ts#L286), and `PlaylistManager.fromOTIO(...)` only consumes the parser's clips/transitions output in [src/core/session/PlaylistManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/PlaylistManager.ts#L674) through [src/core/session/PlaylistManager.ts#L703).
- Impact:
  - Editorial users can expect OTIO note/marker round-trip that the shipped importer simply does not perform.
  - That makes the supported-elements table materially richer than the real OTIO ingest path.

### 468. The OTIO import docs say metadata is preserved for display, but the live playlist import path drops OTIO metadata

- Severity: Low
- Area: Documentation / OTIO feature coverage
- Evidence:
  - The OTIO guide's supported-elements table says `Metadata | Preserved for display` in [docs/export/edl-otio.md](/Users/lifeart/Repos/openrv-web/docs/export/edl-otio.md#L49) through [docs/export/edl-otio.md#L56).
  - `OTIOParser` does capture clip/transition metadata in [src/utils/media/OTIOParser.ts](/Users/lifeart/Repos/openrv-web/src/utils/media/OTIOParser.ts#L242) and [src/utils/media/OTIOParser.ts](/Users/lifeart/Repos/openrv-web/src/utils/media/OTIOParser.ts#L267).
  - But `PlaylistManager.fromOTIO(...)` only imports clip names, source resolution, and frame ranges; it never stores or forwards `clip.metadata` into playlist/UI state in [src/core/session/PlaylistManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/PlaylistManager.ts#L674) through [src/core/session/PlaylistManager.ts#L703).
  - A production-code search finds no playlist/timeline UI path that renders OTIO metadata after import.
- Impact:
  - The docs promise richer editorial context than the shipped OTIO workflow actually preserves.
  - Users can expect imported metadata to remain inspectable in the app when it is currently discarded during import.

### 469. The OTIO import docs say gaps and transitions are recognized, but the shipped playlist import path linearizes clips and drops both structures

- Severity: Low
- Area: Documentation / OTIO feature coverage
- Evidence:
  - The OTIO guide says `Gaps` are recognized as empty regions and `Transitions` are recognized during import in [docs/export/edl-otio.md](/Users/lifeart/Repos/openrv-web/docs/export/edl-otio.md#L49) through [docs/export/edl-otio.md#L56).
  - The single-track parser used by live import returns only `clips`, `fps`, and `totalFrames`; it does not expose transitions in the `OTIOParseResult` returned by `parseOTIO(...)` in [src/utils/media/OTIOParser.ts](/Users/lifeart/Repos/openrv-web/src/utils/media/OTIOParser.ts#L315) through [src/utils/media/OTIOParser.ts#L337).
  - `PlaylistManager.fromOTIO(...)` consumes only `result.clips` and calls `addClip(...)` for each one in [src/core/session/PlaylistManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/PlaylistManager.ts#L674) through [src/core/session/PlaylistManager.ts#L703).
  - `addClip(...)` rebuilds a simple sequential playlist with contiguous `globalStartFrame` values in [src/core/session/PlaylistManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/PlaylistManager.ts#L133) through [src/core/session/PlaylistManager.ts#L159), so OTIO gap spacing and transition overlap data are not preserved in the imported playlist.
- Impact:
  - The docs make OTIO import sound structurally richer than the runtime actually is.
  - Users can expect editorial gaps and transitions to survive import semantics when the shipped workflow collapses them into a plain cut list.

### 470. OTIO import is lossy: the live playlist import path collapses editorial structure into a plain clip list

- Severity: Medium
- Area: OTIO import / editorial fidelity
- Evidence:
  - The only production OTIO import path is `PlaylistManager.fromOTIO(...)`, which uses the backward-compatible single-track `parseOTIO(...)` helper in [src/core/session/PlaylistManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/PlaylistManager.ts#L674) through [src/core/session/PlaylistManager.ts#L703) and [src/utils/media/OTIOParser.ts](/Users/lifeart/Repos/openrv-web/src/utils/media/OTIOParser.ts#L315) through [src/utils/media/OTIOParser.ts#L337).
  - That single-track parse result returns only clips plus timing, not transition objects, even though the richer `parseOTIOMultiTrack(...)` path exists separately in [src/utils/media/OTIOParser.ts](/Users/lifeart/Repos/openrv-web/src/utils/media/OTIOParser.ts#L347) through [src/utils/media/OTIOParser.ts#L382).
  - `fromOTIO(...)` then imports each resolved clip via `addClip(...)`, which rebuilds a contiguous cut-only playlist with fresh sequential `globalStartFrame` values in [src/core/session/PlaylistManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/PlaylistManager.ts#L133) through [src/core/session/PlaylistManager.ts#L159).
  - OTIO parser metadata is captured transiently, but `fromOTIO(...)` drops it; OTIO markers are not parsed at all.
- Impact:
  - Importing OTIO into the shipped app silently degrades the editorial timeline into a much simpler playlist model.
  - Gaps, transitions, markers, and metadata context can disappear without any explicit warning that the import was lossy.

### 471. The UI overview advertises snapshots as named captures, but the shipped create flow does not prompt for a snapshot name

- Severity: Low
- Area: Documentation / snapshot workflow
- Evidence:
  - The UI overview panel table describes `Snapshots` as `Named session snapshots` in [docs/getting-started/ui-overview.md](/Users/lifeart/Repos/openrv-web/docs/getting-started/ui-overview.md#L208) through [docs/getting-started/ui-overview.md#L211).
  - The shipped Snapshot panel's create button only emits a bare `createRequested` event with no naming or description prompt in [src/ui/components/SnapshotPanel.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/SnapshotPanel.ts#L198) through [src/ui/components/SnapshotPanel.ts#L211).
  - Snapshot descriptions are effectively import-only metadata in the current UI, as already captured in issue `380`.
- Impact:
  - The getting-started docs make manual snapshot naming sound like a first-class part of the shipped capture workflow.
  - Users opening the panel can expect a naming step that never appears during normal snapshot creation.

### 472. The advanced-compare docs present Quad View as a shipped feature, but the live UI itself marks it as preview-only and unwired

- Severity: Low
- Area: Documentation / compare workflow
- Evidence:
  - The advanced-compare page describes Quad View as a working mode where four quadrants each display a different source and stay in sync during playback in [docs/compare/advanced-compare.md](/Users/lifeart/Repos/openrv-web/docs/compare/advanced-compare.md#L7) through [docs/compare/advanced-compare.md](/Users/lifeart/Repos/openrv-web/docs/compare/advanced-compare.md#L11).
  - The shipped Compare dropdown now labels Quad View with a `preview` badge and an explicit tooltip saying it is “not yet connected to the viewer rendering pipeline” in [src/ui/components/CompareControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/CompareControl.ts#L585) through [src/ui/components/CompareControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/CompareControl.ts#L593).
  - Production view wiring still only subscribes to wipe, A/B, difference matte, and blend-mode events; quad-view changes only produce a warning in [src/AppViewWiring.ts](/Users/lifeart/Repos/openrv-web/src/AppViewWiring.ts#L87) through [src/AppViewWiring.ts](/Users/lifeart/Repos/openrv-web/src/AppViewWiring.ts#L143).
- Impact:
  - The docs teach Quad View as ready for real multi-version review even though the shipped UI itself warns that it is only a preview surface.
  - That makes the comparison docs more optimistic than the app and sets users up to trust a mode that is still non-functional in production.

### 473. The advanced-compare docs teach a full Reference Image Manager workflow, but the shipped UI only exposes capture plus a binary toggle

- Severity: Low
- Area: Documentation / compare workflow
- Evidence:
  - The advanced-compare page presents five reference comparison modes and describes overlay opacity as part of the user-facing workflow in [docs/compare/advanced-compare.md](/Users/lifeart/Repos/openrv-web/docs/compare/advanced-compare.md#L13) through [docs/compare/advanced-compare.md#L31).
  - The shipped View tab only mounts two reference actions: `Capture reference frame` and `Toggle reference comparison` in [src/services/tabContent/buildViewTab.ts](/Users/lifeart/Repos/openrv-web/src/services/tabContent/buildViewTab.ts#L85) through [src/services/tabContent/buildViewTab.ts](/Users/lifeart/Repos/openrv-web/src/services/tabContent/buildViewTab.ts#L117).
  - `ReferenceManager` still carries `viewMode`, `opacity`, and `wipePosition` as real state in [src/ui/components/ReferenceManager.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/ReferenceManager.ts#L25) through [src/ui/components/ReferenceManager.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/ReferenceManager.ts#L30), but there is no shipped UI for changing those fields.
- Impact:
  - The docs make reference comparison look like a configurable end-user tool when the shipped interface only exposes the narrowest on/off subset.
  - Users following the page will look for mode and opacity controls that do not exist in the real app.

### 474. The advanced-compare docs present Matte Overlay as part of the review toolkit even though the shipped compare/view UI never exposes it

- Severity: Low
- Area: Documentation / compare workflow
- Evidence:
  - The advanced-compare page lists Matte Overlay as one of the core advanced comparison capabilities and describes aspect, opacity, and center-point configuration in [docs/compare/advanced-compare.md](/Users/lifeart/Repos/openrv-web/docs/compare/advanced-compare.md#L33) through [docs/compare/advanced-compare.md#L47).
  - The viewer does implement a matte overlay and exposes it through [src/ui/components/Viewer.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/Viewer.ts#L3792) through [src/ui/components/Viewer.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/Viewer.ts#L3795), with overlay creation in [src/ui/components/OverlayManager.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/OverlayManager.ts#L111) through [src/ui/components/OverlayManager.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/OverlayManager.ts#L113).
  - The shipped View tab control surface contains compare, layout, stereo, ghost, reference, stack, PAR, background-pattern, and other display buttons, but no matte-overlay entry in [src/services/tabContent/buildViewTab.ts](/Users/lifeart/Repos/openrv-web/src/services/tabContent/buildViewTab.ts#L31) through [src/services/tabContent/buildViewTab.ts](/Users/lifeart/Repos/openrv-web/src/services/tabContent/buildViewTab.ts#L439).
- Impact:
  - The compare docs make Matte Overlay sound like part of the normal review toolbox when the shipped UI still provides no way to enable or configure it.
  - That sends users to the comparison docs for a feature they cannot actually reach from the app.

### 475. The advanced-compare docs say comparison annotations follow the underlying source, but production still keys them to the active `A/B` slot

- Severity: Low
- Area: Documentation / compare annotations
- Evidence:
  - The advanced-compare page says “Annotations are tied to the source they were drawn on” and that switching between A and B preserves each source’s annotation layer independently in [docs/compare/advanced-compare.md](/Users/lifeart/Repos/openrv-web/docs/compare/advanced-compare.md#L61) through [docs/compare/advanced-compare.md#L63).
  - Production paint wiring still forwards `session.currentAB` into the annotation version selector in [src/services/LayoutOrchestrator.ts](/Users/lifeart/Repos/openrv-web/src/services/LayoutOrchestrator.ts#L645).
  - The underlying compare state that drives that routing is only `A` or `B`, not a stable source identity, in [src/core/session/ABCompareManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/ABCompareManager.ts#L26) through [src/core/session/ABCompareManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/ABCompareManager.ts#L43).
- Impact:
  - The docs imply source-stable comparison annotations, but the shipped behavior can drift when A/B assignments change.
  - Reviewers can trust the docs and assume an annotation belongs to a media source when production is still anchoring it to the compare slot instead.

### 476. The overlays guide says embedded source timecode is shown alongside session timecode, but the shipped overlay only renders one timecode plus a frame counter

- Severity: Low
- Area: Documentation / timecode overlay
- Evidence:
  - The overlays guide says that for sources with embedded timecode metadata, “the source timecode is displayed alongside the session timecode” in [docs/advanced/overlays.md](/Users/lifeart/Repos/openrv-web/docs/advanced/overlays.md#L18).
  - The shipped `TimecodeOverlay` only renders two text rows: a single formatted timecode string and an optional `Frame N / total` counter in [src/ui/components/TimecodeOverlay.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/TimecodeOverlay.ts#L73) through [src/ui/components/TimecodeOverlay.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/TimecodeOverlay.ts#L97) and [src/ui/components/TimecodeOverlay.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/TimecodeOverlay.ts#L119) through [src/ui/components/TimecodeOverlay.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/TimecodeOverlay.ts#L129).
  - The overlay state only supports position, font size, frame-counter visibility, and background opacity in [src/ui/components/TimecodeOverlay.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/TimecodeOverlay.ts#L18) through [src/ui/components/TimecodeOverlay.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/TimecodeOverlay.ts#L33); there is no second source-timecode field or metadata binding in the component.
- Impact:
  - The docs promise a richer review overlay than the shipped implementation actually provides.
  - Users expecting both session and embedded source timecode on screen will only get a single timecode readout.

### 477. The overlays guide documents adjustable clipping thresholds, but the shipped clipping overlay hardcodes its trigger values

- Severity: Low
- Area: Documentation / clipping overlay
- Evidence:
  - The overlays guide says clipping thresholds can be adjusted away from the default `0.0/1.0` positions and gives `0.95` as a practical example in [docs/advanced/overlays.md](/Users/lifeart/Repos/openrv-web/docs/advanced/overlays.md#L56) through [docs/advanced/overlays.md](/Users/lifeart/Repos/openrv-web/docs/advanced/overlays.md#L58).
  - The shipped `ClippingOverlayState` has no threshold fields; it only carries enable/show-highlights/show-shadows/color/opacity in [src/ui/components/ClippingOverlay.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/ClippingOverlay.ts#L12) through [src/ui/components/ClippingOverlay.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/ClippingOverlay.ts#L29).
  - The actual clip checks are hardcoded to `r/g/b <= 1` for shadows and `r/g/b >= 254` or `luma >= 254` for highlights in [src/ui/components/ClippingOverlay.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/ClippingOverlay.ts#L63) through [src/ui/components/ClippingOverlay.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/ClippingOverlay.ts#L72).
- Impact:
  - The docs present an early-warning threshold workflow that the shipped overlay simply cannot perform.
  - Users looking for configurable near-clipping detection will find only a fixed binary implementation.

### 478. The overlays guide describes a single “missing frame indicator” behavior, but production ships multiple modes and the default does not replace the viewer content

- Severity: Low
- Area: Documentation / missing-frame behavior
- Evidence:
  - The overlays guide says the missing-frame indicator “replaces the viewer content” with a red-X warning state and highlights the missing frame on the timeline in [docs/advanced/overlays.md](/Users/lifeart/Repos/openrv-web/docs/advanced/overlays.md#L62) through [docs/advanced/overlays.md](/Users/lifeart/Repos/openrv-web/docs/advanced/overlays.md#L70).
  - The shipped View tab exposes four distinct missing-frame modes, `Off`, `Frame`, `Hold`, and `Black`, in [src/services/tabContent/buildViewTab.ts](/Users/lifeart/Repos/openrv-web/src/services/tabContent/buildViewTab.ts#L191) through [src/services/tabContent/buildViewTab.ts](/Users/lifeart/Repos/openrv-web/src/services/tabContent/buildViewTab.ts#L199).
  - In the renderer, only `black` truly replaces the viewed image; `hold` reuses a nearby frame and the default `show-frame` path continues drawing the current source image while separately showing the overlay in [src/ui/components/Viewer.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/Viewer.ts#L1521) through [src/ui/components/Viewer.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/Viewer.ts#L1558).
  - The shipped `MissingFrameOverlay` itself is a centered warning icon plus frame number, not a red-X fill pattern, in [src/ui/components/MissingFrameOverlay.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/MissingFrameOverlay.ts#L31) through [src/ui/components/MissingFrameOverlay.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/MissingFrameOverlay.ts#L69).
- Impact:
  - The docs describe one fixed missing-frame experience, but the real app exposes multiple viewer behaviors and defaults to a much less destructive overlay mode.
  - That can mislead users about what will happen during sequence review and what the current missing-frame setting actually controls.

### 479. The overlays guide advertises timecode “format” modes, but the shipped overlay cannot switch to frame-only display

- Severity: Low
- Area: Documentation / timecode overlay
- Evidence:
  - The overlays guide says the timecode overlay supports “SMPTE timecode, frame number, or both” in [docs/advanced/overlays.md](/Users/lifeart/Repos/openrv-web/docs/advanced/overlays.md#L12) through [docs/advanced/overlays.md#L16).
  - The shipped `TimecodeOverlayState` has no format enum; it only exposes `showFrameCounter` alongside the always-rendered timecode row in [src/ui/components/TimecodeOverlay.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/TimecodeOverlay.ts#L18) through [src/ui/components/TimecodeOverlay.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/TimecodeOverlay.ts#L33).
  - `update()` always writes a formatted timecode string and only conditionally shows the extra frame-counter row in [src/ui/components/TimecodeOverlay.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/TimecodeOverlay.ts#L119) through [src/ui/components/TimecodeOverlay.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/TimecodeOverlay.ts#L129).
- Impact:
  - The docs promise a frame-only display mode that the shipped overlay does not actually support.
  - Users can hide the frame counter, but they cannot replace timecode with frame numbers the way the page describes.

### 480. The overlays guide says safe areas respect crop, but the shipped safe-areas overlay is still driven by uncropped display dimensions

- Severity: Low
- Area: Documentation / safe-areas behavior
- Evidence:
  - The overlays guide says that when crop is active, safe areas “are calculated relative to the cropped region rather than the full image” in [docs/advanced/overlays.md](/Users/lifeart/Repos/openrv-web/docs/advanced/overlays.md#L40) through [docs/advanced/overlays.md](/Users/lifeart/Repos/openrv-web/docs/advanced/overlays.md#L42).
  - `SafeAreasOverlay` itself only draws against `offsetX`, `offsetY`, `displayWidth`, and `displayHeight`; it has no crop-state input or crop-rectangle logic in [src/ui/components/SafeAreasOverlay.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/SafeAreasOverlay.ts#L137) through [src/ui/components/SafeAreasOverlay.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/SafeAreasOverlay.ts#L239).
  - `OverlayManager.updateDimensions(...)` always feeds the safe-areas overlay raw viewer width/height with zero offsets, not a cropped sub-rectangle, in [src/ui/components/OverlayManager.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/OverlayManager.ts#L127) through [src/ui/components/OverlayManager.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/OverlayManager.ts#L137).
  - By contrast, crop is applied later in the viewer image pipeline via `cropManager.clearOutsideCropRegion(...)` in [src/ui/components/Viewer.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/Viewer.ts#L2012) and [src/ui/components/Viewer.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/Viewer.ts#L2213), not through overlay-dimension remapping.
- Impact:
  - The docs describe crop-aware framing guides, but the shipped safe-areas overlay is still positioned against the full display box.
  - Reviewers relying on safe areas after cropping can trust the guides more than the runtime wiring actually justifies.

### 481. The overlays guide says the timeline highlights missing-frame positions, but the shipped timeline has no missing-frame rendering path

- Severity: Low
- Area: Documentation / sequence review UX
- Evidence:
  - The overlays guide says the missing-frame indicator includes a timeline highlight for the missing-frame position in [docs/advanced/overlays.md](/Users/lifeart/Repos/openrv-web/docs/advanced/overlays.md#L64) through [docs/advanced/overlays.md](/Users/lifeart/Repos/openrv-web/docs/advanced/overlays.md#L70).
  - A production-code search finds missing-frame handling in the viewer and overlay components, but no missing-frame rendering or highlight logic in `Timeline.ts`; the relevant matches are limited to [src/ui/components/Viewer.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/Viewer.ts#L1521) through [src/ui/components/Viewer.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/Viewer.ts#L1558) and [src/ui/components/MissingFrameOverlay.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/MissingFrameOverlay.ts#L1) through [src/ui/components/MissingFrameOverlay.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/MissingFrameOverlay.ts#L108).
  - The timeline-related repo hits for “missing frame” are tests and the View-tab mode selector, not a shipped timeline highlight implementation, as shown by [src/services/tabContent/buildViewTab.ts](/Users/lifeart/Repos/openrv-web/src/services/tabContent/buildViewTab.ts#L185) through [src/services/tabContent/buildViewTab.ts](/Users/lifeart/Repos/openrv-web/src/services/tabContent/buildViewTab.ts#L357).
- Impact:
  - The docs promise a second visual cue in the timeline that the shipped app does not provide.
  - Sequence reviewers can search for a timeline indicator that simply is not implemented in production.

### 482. The overlays guide publishes industry-safe percentages that do not match the shipped safe-areas overlay

- Severity: Low
- Area: Documentation / safe-areas behavior
- Evidence:
  - The overlays guide says Action Safe is `93%` and Title Safe is `90%` in [docs/advanced/overlays.md](/Users/lifeart/Repos/openrv-web/docs/advanced/overlays.md#L30) through [docs/advanced/overlays.md](/Users/lifeart/Repos/openrv-web/docs/advanced/overlays.md#L33).
  - The shipped overlay implementation documents and draws Action Safe at `90%` and Title Safe at `80%` in [src/ui/components/SafeAreasOverlay.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/SafeAreasOverlay.ts#L3) through [src/ui/components/SafeAreasOverlay.ts#L9) and [src/ui/components/SafeAreasOverlay.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/SafeAreasOverlay.ts#L154) through [src/ui/components/SafeAreasOverlay.ts#L160).
  - The shipped control labels also say `Action Safe (90%)` and `Title Safe (80%)` in [src/ui/components/SafeAreasControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/SafeAreasControl.ts#L129) through [src/ui/components/SafeAreasControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/SafeAreasControl.ts#L133).
- Impact:
  - The docs teach a different framing geometry than the actual overlay draws.
  - Reviewers can rely on the written percentages and assume the on-screen guides follow them when production uses materially smaller safe boxes instead.

### 483. The overlays guide describes custom per-zone safe areas and distinct colors, but the shipped safe-areas overlay only has fixed title/action boxes with one shared color

- Severity: Low
- Area: Documentation / safe-areas feature coverage
- Evidence:
  - The overlays guide says there is a `Custom` safe area where users can “specify any percentage” and that multiple safe zones each use “a distinct color for clarity” in [docs/advanced/overlays.md](/Users/lifeart/Repos/openrv-web/docs/advanced/overlays.md#L30) through [docs/advanced/overlays.md](/Users/lifeart/Repos/openrv-web/docs/advanced/overlays.md#L39).
  - The shipped `SafeAreasState` has only two safe-zone toggles, `titleSafe` and `actionSafe`; there is no custom-percentage field in [src/ui/components/SafeAreasOverlay.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/SafeAreasOverlay.ts#L16) through [src/ui/components/SafeAreasOverlay.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/SafeAreasOverlay.ts#L24).
  - The overlay also has a single `guideColor` applied to all guides in [src/ui/components/SafeAreasOverlay.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/SafeAreasOverlay.ts#L22) through [src/ui/components/SafeAreasOverlay.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/SafeAreasOverlay.ts#L24) and [src/ui/components/SafeAreasOverlay.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/SafeAreasOverlay.ts#L148) through [src/ui/components/SafeAreasOverlay.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/SafeAreasOverlay.ts#L160).
  - The shipped control surface only exposes binary toggles for the fixed safe boxes plus composition guides in [src/ui/components/SafeAreasControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/SafeAreasControl.ts#L127) through [src/ui/components/SafeAreasControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/SafeAreasControl.ts#L151).
- Impact:
  - The docs promise a more flexible broadcast-safe workflow than the runtime actually supports.
  - Users can look for user-defined percentages or color-coded zones that simply are not part of the shipped overlay model.

### 484. The overlays guide says “both clipping” gets its own distinct highlight, but the shipped clipping overlay only chooses highlight-or-shadow coloring

- Severity: Low
- Area: Documentation / clipping overlay
- Evidence:
  - The overlays guide says pixels that clip in all channels simultaneously receive “a distinct highlight” in [docs/advanced/overlays.md](/Users/lifeart/Repos/openrv-web/docs/advanced/overlays.md#L48) through [docs/advanced/overlays.md](/Users/lifeart/Repos/openrv-web/docs/advanced/overlays.md#L52).
  - The shipped `ClippingOverlay` only checks two branches: highlight-clipped pixels are blended with `highlightColor`, otherwise shadow-clipped pixels are blended with `shadowColor`, in [src/ui/components/ClippingOverlay.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/ClippingOverlay.ts#L63) through [src/ui/components/ClippingOverlay.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/ClippingOverlay.ts#L79).
  - There is no third “both clipped” state or separate color in `ClippingOverlayState`, which only carries highlight and shadow colors in [src/ui/components/ClippingOverlay.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/ClippingOverlay.ts#L12) through [src/ui/components/ClippingOverlay.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/ClippingOverlay.ts#L29).
- Impact:
  - The docs describe a richer clipping diagnostic than the shipped overlay can render.
  - Users can expect a special simultaneous-clipping signal, but production collapses that case into the ordinary highlight path.

### 485. The overlays guide says overlay states are preserved in session files and snapshots, but the `.orvproject` serializer only persists watermark among the viewer overlays

- Severity: Low
- Area: Documentation / overlay persistence
- Evidence:
  - The overlays guide says “All overlay settings are saved with the session state” and that overlay states are preserved in `.orvproject` files and snapshots in [docs/advanced/overlays.md](/Users/lifeart/Repos/openrv-web/docs/advanced/overlays.md#L3) and [docs/advanced/overlays.md](/Users/lifeart/Repos/openrv-web/docs/advanced/overlays.md#L215).
  - The serialized session schema only contains an explicit overlay field for `watermark` in [src/core/session/SessionState.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionState.ts#L131) through [src/core/session/SessionState.ts#L132).
  - `SessionSerializer.toJSON()` saves `watermark`, but does not read `getTimecodeOverlay()`, `getSafeAreasOverlay()`, `getClippingOverlay()`, `getInfoStripOverlay()`, `getFPSIndicator()`, `getEXRWindowOverlay()`, `getSpotlightOverlay()`, or `getBugOverlay()` anywhere in the serialization path in [src/core/session/SessionSerializer.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionSerializer.ts#L338) through [src/core/session/SessionSerializer.ts#L368).
  - Snapshots and auto-saves reuse the same lossy serializer through `AppPersistenceManager`, so this persistence gap is not limited to `.orvproject` files, as already established by issues `138` and `139`.
- Impact:
  - The overlays guide makes the session system sound much more complete for viewer overlays than the shipped persistence model actually is.
  - Users can save a review session expecting overlay state to round-trip when most overlay toggles and settings are still omitted from the serialized payload.

### 486. The overlays guide says bug overlays are burned into video export, but the shipped export flow never consults bug-overlay state

- Severity: Low
- Area: Documentation / export workflow
- Evidence:
  - The overlays guide says “The bug overlay is also used during video export to burn the logo into the output file” in [docs/advanced/overlays.md](/Users/lifeart/Repos/openrv-web/docs/advanced/overlays.md#L126).
  - The only production bug-overlay wiring is viewer-side through `OverlayManager.getBugOverlay()` and `Viewer.getBugOverlay()` in [src/ui/components/OverlayManager.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/OverlayManager.ts#L246) through [src/ui/components/OverlayManager.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/OverlayManager.ts#L252) and [src/ui/components/Viewer.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/Viewer.ts#L3858) through [src/ui/components/Viewer.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/Viewer.ts#L3859).
  - A production-code search finds no video-export path that reads bug-overlay state; the export-side logo handling that does exist belongs to slate rendering in [src/export/SlateRenderer.ts](/Users/lifeart/Repos/openrv-web/src/export/SlateRenderer.ts#L45) through [src/export/SlateRenderer.ts](/Users/lifeart/Repos/openrv-web/src/export/SlateRenderer.ts#L50) and [src/export/SlateRenderer.ts](/Users/lifeart/Repos/openrv-web/src/export/SlateRenderer.ts#L304) through [src/export/SlateRenderer.ts](/Users/lifeart/Repos/openrv-web/src/export/SlateRenderer.ts#L316).
- Impact:
  - The docs promise a broadcast-logo export workflow that is not connected to the shipped bug-overlay feature.
  - Users can set up a viewer bug/logo expecting it to burn into exports, then discover that the export pipeline ignores it entirely.

### 487. The false-color docs advertise custom presets, but the shipped false-color system exposes no way to define them

- Severity: Low
- Area: Documentation / false-color workflow
- Evidence:
  - The false-color guide says “Custom false color presets allow defining specific color-to-exposure mappings” in [docs/scopes/false-color-zebra.md](/Users/lifeart/Repos/openrv-web/docs/scopes/false-color-zebra.md#L38) through [docs/scopes/false-color-zebra.md#L39).
  - The runtime type does include a `custom` preset key in [src/ui/components/FalseColor.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/FalseColor.ts#L23), but it is just aliased to `STANDARD_PALETTE` in [src/ui/components/FalseColor.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/FalseColor.ts#L134) through [src/ui/components/FalseColor.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/FalseColor.ts#L138).
  - The shipped preset UI only exposes `Standard`, `ARRI`, and `RED` in [src/ui/components/FalseColor.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/FalseColor.ts#L262) through [src/ui/components/FalseColor.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/FalseColor.ts#L268), and `FalseColorControl` simply renders that list in [src/ui/components/FalseColorControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/FalseColorControl.ts#L184) through [src/ui/components/FalseColorControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/FalseColorControl.ts#L212).
- Impact:
  - The docs promise a studio-customizable false-color workflow that the shipped app does not implement.
  - Users can look for custom mapping controls or APIs that simply are not present in production.

### 488. The false-color docs say ARRI skin tones appear green, but the shipped ARRI palette maps that range to grey/yellow instead

- Severity: Low
- Area: Documentation / false-color interpretation
- Evidence:
  - The guide says skin tones should appear green on the ARRI scale, approximately `40-50 IRE`, in [docs/scopes/false-color-zebra.md](/Users/lifeart/Repos/openrv-web/docs/scopes/false-color-zebra.md#L46) and [docs/scopes/false-color-zebra.md](/Users/lifeart/Repos/openrv-web/docs/scopes/false-color-zebra.md#L90).
  - The shipped ARRI legend maps `78-102` to greenish low-mid tones, but `103-128` to grey and `129-153` to yellow in [src/ui/components/FalseColor.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/FalseColor.ts#L104) through [src/ui/components/FalseColor.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/FalseColor.ts#L116).
  - The False Color control renders its legend directly from that palette in [src/ui/components/FalseColor.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/FalseColor.ts#L278) through [src/ui/components/FalseColor.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/FalseColor.ts#L285) and [src/ui/components/FalseColorControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/FalseColorControl.ts#L288) through [src/ui/components/FalseColorControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/FalseColorControl.ts#L324).
- Impact:
  - The guide teaches users to interpret ARRI false color differently from what the shipped palette actually displays.
  - That can produce wrong exposure conclusions during dailies if reviewers trust the docs over the on-screen legend.

### 489. The zebra docs recommend raising HDR thresholds above 100 IRE, but the shipped zebra controls hard-stop at 100

- Severity: Low
- Area: Documentation / zebra controls
- Evidence:
  - The false-color/zebra guide says that for HDR dailies users may need to “raise the high zebra threshold” because HDR signals intentionally carry values above `100 IRE` in [docs/scopes/false-color-zebra.md](/Users/lifeart/Repos/openrv-web/docs/scopes/false-color-zebra.md#L94).
  - The shipped zebra state clamps `highThreshold` and `lowThreshold` to `0-100` in [src/ui/components/ZebraStripes.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/ZebraStripes.ts#L65) through [src/ui/components/ZebraStripes.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/ZebraStripes.ts#L78).
  - The shipped Zebra control also caps the high-threshold slider at `100` in [src/ui/components/ZebraControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/ZebraControl.ts#L116) through [src/ui/components/ZebraControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/ZebraControl.ts#L123).
- Impact:
  - The docs recommend an HDR workflow the shipped control cannot actually perform.
  - Users can be told to “raise” the threshold beyond the SDR ceiling while the real UI enforces 100 as the maximum.

### 490. The histogram docs still say pixel analysis runs on the GPU, but the shipped histogram always computes bins on the CPU

- Severity: Low
- Area: Documentation / histogram implementation
- Evidence:
  - The histogram guide says “Pixel analysis runs on the GPU” in [docs/scopes/histogram.md](/Users/lifeart/Repos/openrv-web/docs/scopes/histogram.md#L68).
  - The shipped `Histogram.update()` path explicitly says histogram data is “always” calculated on the CPU, then only uses GPU acceleration for bar rendering in [src/ui/components/Histogram.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/Histogram.ts#L291) through [src/ui/components/Histogram.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/Histogram.ts#L306).
  - The core histogram calculation itself is the CPU `calculateHistogram(imageData)` call in [src/ui/components/Histogram.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/Histogram.ts#L281) through [src/ui/components/Histogram.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/Histogram.ts#L284).
- Impact:
  - The docs overstate the shipped histogram pipeline and performance model.
  - Users reading the guide can expect GPU-side analysis behavior that production does not implement.

### 491. The waveform docs describe WebGL computation as the runtime model, but the shipped scope still has full CPU fallback paths

- Severity: Low
- Area: Documentation / waveform implementation
- Evidence:
  - The waveform guide says “The waveform is computed using WebGL” in [docs/scopes/waveform.md](/Users/lifeart/Repos/openrv-web/docs/scopes/waveform.md#L59).
  - The shipped `Waveform.update()` only tries the GPU processor first, then falls back to CPU rendering with `this.draw(imageData)` when WebGL scopes are unavailable in [src/ui/components/Waveform.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/Waveform.ts#L247) through [src/ui/components/Waveform.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/Waveform.ts#L266).
  - The HDR float path also has an explicit CPU fallback that converts float data back to `ImageData` and draws it on the CPU in [src/ui/components/Waveform.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/Waveform.ts#L288) through [src/ui/components/Waveform.ts#L293).
- Impact:
  - The docs present the scope as WebGL-computed when the shipped implementation still depends on non-WebGL fallback behavior.
  - That is misleading for users trying to understand degraded behavior on browsers or devices where GPU scopes are unavailable.

### 492. The pixel-probe docs say probe state is exposed through the public view API, but the shipped API has no pixel-probe methods at all

- Severity: Low
- Area: Documentation / public scripting API
- Evidence:
  - The pixel-probe guide says “Pixel probe state is accessible through the view API” in [docs/scopes/pixel-probe.md](/Users/lifeart/Repos/openrv-web/docs/scopes/pixel-probe.md#L82).
  - The same section contains only an empty placeholder snippet instead of an actual method example in [docs/scopes/pixel-probe.md](/Users/lifeart/Repos/openrv-web/docs/scopes/pixel-probe.md#L84) through [docs/scopes/pixel-probe.md](/Users/lifeart/Repos/openrv-web/docs/scopes/pixel-probe.md#L87).
  - The shipped `ViewAPI` exposes zoom, fit, pan, channel, texture filtering, background pattern, and viewport-size methods, but nothing for pixel-probe enable/state/lock/readback in [src/api/ViewAPI.ts](/Users/lifeart/Repos/openrv-web/src/api/ViewAPI.ts#L33) through [src/api/ViewAPI.ts](/Users/lifeart/Repos/openrv-web/src/api/ViewAPI.ts#L284).
  - The broader public scripting guide likewise documents `window.openrv.view` without any probe methods in [docs/advanced/scripting-api.md](/Users/lifeart/Repos/openrv-web/docs/advanced/scripting-api.md#L17) through [docs/advanced/scripting-api.md](/Users/lifeart/Repos/openrv-web/docs/advanced/scripting-api.md#L180).
- Impact:
  - The docs promise probe automation that plugin authors and pipeline users cannot actually call.
  - Readers can spend time looking for a public probe API surface that is not shipped.

### 493. The vectorscope docs describe WebGL rendering as the runtime model, but the shipped vectorscope still has a complete CPU fallback path

- Severity: Low
- Area: Documentation / vectorscope implementation
- Evidence:
  - The vectorscope guide says “The vectorscope is rendered using WebGL for real-time performance” in [docs/scopes/vectorscope.md](/Users/lifeart/Repos/openrv-web/docs/scopes/vectorscope.md#L39) through [docs/scopes/vectorscope.md](/Users/lifeart/Repos/openrv-web/docs/scopes/vectorscope.md#L41).
  - The shipped `Vectorscope.update()` tries the shared GPU scopes processor first, but falls back to `drawCPU(imageData)` when GPU scopes are unavailable in [src/ui/components/Vectorscope.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/Vectorscope.ts#L246) through [src/ui/components/Vectorscope.ts#L272).
  - The HDR float path follows the same pattern and also converts float data back to `ImageData` for CPU rendering when the GPU scopes processor is unavailable in [src/ui/components/Vectorscope.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/Vectorscope.ts#L278) through [src/ui/components/Vectorscope.ts#L314).
- Impact:
  - The docs overstate the runtime architecture of the shipped vectorscope.
  - Users investigating performance or degraded behavior on non-WebGL scope paths are told the wrong implementation story.

### 494. The gamut-diagram docs describe a target-gamut compliance tool, but the shipped diagram only overlays scatter against fixed input/working/display triangles

- Severity: Low
- Area: Documentation / gamut diagram behavior
- Evidence:
  - The gamut-diagram guide says pixels are shown relative to “a target color gamut,” and frames the scope around whether colors fall “within or outside a target color gamut” in [docs/scopes/gamut-diagram.md](/Users/lifeart/Repos/openrv-web/docs/scopes/gamut-diagram.md#L3) through [docs/scopes/gamut-diagram.md](/Users/lifeart/Repos/openrv-web/docs/scopes/gamut-diagram.md#L29).
  - The shipped `GamutDiagram` has no target-gamut selection or compliance state. Its only gamut state is the trio `inputColorSpace`, `workingColorSpace`, and `displayColorSpace` in [src/ui/components/GamutDiagram.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/GamutDiagram.ts#L48) through [src/ui/components/GamutDiagram.ts#L50).
  - The rendered overlay simply draws up to three gamut triangles and a neutral white scatter plot in [src/ui/components/GamutDiagram.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/GamutDiagram.ts#L307) through [src/ui/components/GamutDiagram.ts#L347) and [src/ui/components/GamutDiagram.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/GamutDiagram.ts#L349) through [src/ui/components/GamutDiagram.ts#L474).
  - There is no production path that classifies samples as “inside/outside target gamut,” colors out-of-gamut points differently, or exposes the clip-vs-compress compliance workflow the docs describe.
- Impact:
  - The guide makes the gamut diagram sound like an explicit compliance checker when the shipped visualization is just an unclassified chromaticity scatter over multiple triangles.
  - Users can expect target-gamut diagnostics and out-of-gamut identification that the runtime does not provide.

### 495. The pixel-probe docs say HDR probe values can exceed 100 IRE, but the shipped HDR probe clamps IRE to the 0-100 range

- Severity: Low
- Area: Documentation / pixel probe HDR readout
- Evidence:
  - The pixel-probe guide explicitly says `> 100 IRE` represents “Super-white / HDR values” in [docs/scopes/pixel-probe.md](/Users/lifeart/Repos/openrv-web/docs/scopes/pixel-probe.md#L55) through [docs/scopes/pixel-probe.md#L60).
  - The shipped probe state defines `ire` as `0-100` in [src/ui/components/PixelProbe.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/PixelProbe.ts#L42).
  - In the HDR path, `updateFromHDRValues(...)` computes float luminance and then clamps it to `0..100` before storing and displaying it in [src/ui/components/PixelProbe.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/PixelProbe.ts#L768) through [src/ui/components/PixelProbe.ts#L780).
- Impact:
  - The docs promise a probe readout that can expose HDR luminance above reference white, but the shipped IRE field cannot show that.
  - Users relying on the probe for HDR verification can be misled into thinking values top out at 100 IRE even when the underlying float data is higher.

### 496. The pixel-probe docs say the coordinate readout is in source image space, but the shipped probe reports display-canvas coordinates

- Severity: Low
- Area: Documentation / pixel probe coordinates
- Evidence:
  - The pixel-probe guide says the Coordinates row shows pixel position “in source image space” in [docs/scopes/pixel-probe.md](/Users/lifeart/Repos/openrv-web/docs/scopes/pixel-probe.md#L17).
  - The live sampling path derives coordinates from `getPixelCoordinates(...)`, which maps browser pointer position into `displayWidth` / `displayHeight` canvas pixels, not source dimensions, in [src/ui/components/ViewerInteraction.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/ViewerInteraction.ts#L189) through [src/ui/components/ViewerInteraction.ts#L210).
  - `PixelSamplingManager` passes those display-space coordinates directly into `PixelProbe.updateFromCanvas(...)` and `updateFromHDRValues(...)` in [src/ui/components/PixelSamplingManager.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/PixelSamplingManager.ts#L121), [src/ui/components/PixelSamplingManager.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/PixelSamplingManager.ts#L205), and [src/ui/components/PixelSamplingManager.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/PixelSamplingManager.ts#L310).
  - `PixelProbe` then stores and displays those same values after clamping against `displayWidth` / `displayHeight`, not source width / height, in [src/ui/components/PixelProbe.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/PixelProbe.ts#L666) through [src/ui/components/PixelProbe.ts#L726) and [src/ui/components/PixelProbe.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/PixelProbe.ts#L742) through [src/ui/components/PixelProbe.ts#L780).
- Impact:
  - The docs make the probe sound source-referenced, but the runtime reports viewport-sampled coordinates instead.
  - That can mislead users comparing probe positions against source-frame metadata, EXR pixel locations, or external shot notes.

### 497. The browser-compatibility guide overstates mobile support as “touch-optimized” even though parts of the shipped UI still depend on hover-only or non-touch interaction models

- Severity: Low
- Area: Documentation / mobile support
- Evidence:
  - The browser-compatibility matrix marks iOS Safari and Android Chrome as `Functional (touch-optimized)` in [docs/reference/browser-compatibility.md](/Users/lifeart/Repos/openrv-web/docs/reference/browser-compatibility.md#L66) through [docs/reference/browser-compatibility.md#L71).
  - The same guide immediately admits the interface is still desktop-optimized in [docs/reference/browser-compatibility.md](/Users/lifeart/Repos/openrv-web/docs/reference/browser-compatibility.md#L72).
  - The shipped volume control is explicitly hover-based and only exposes its slider on `pointerenter` / `pointerleave` in [src/ui/components/VolumeControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/VolumeControl.ts#L88) and [src/ui/components/VolumeControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/VolumeControl.ts#L154) through [src/ui/components/VolumeControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/VolumeControl.ts#L174), with the non-hover workaround already captured as issue `116`.
  - The generic virtual-slider interaction helper also bails out for `pointerType === 'touch'` in [src/ui/components/VirtualSliderController.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/VirtualSliderController.ts#L245) through [src/ui/components/VirtualSliderController.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/VirtualSliderController.ts#L266), which means at least some slider-style interactions are intentionally not touch-driven.
- Impact:
  - The docs make the mobile experience sound more intentionally touch-adapted than the shipped UI actually is.
  - Users evaluating tablet/mobile review workflows can expect a more polished touch-first control model than production currently provides.

### 498. The file-format guide promises magic-number-first file detection, but the shipped file-loading path still rejects misnamed or extensionless files before any decoder sniffing runs

- Severity: Low
- Area: Documentation / file loading
- Evidence:
  - The file-format guide says format detection uses a “magic-number-first” strategy and “handles misnamed or extensionless files correctly” in [docs/guides/file-formats.md](/Users/lifeart/Repos/openrv-web/docs/guides/file-formats.md#L11).
  - The real session file-loading entrypoint first calls `detectMediaTypeFromFile(file)` and immediately rejects `unknown` files before any decoder-registry inspection in [src/core/session/SessionMedia.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionMedia.ts#L382) through [src/core/session/SessionMedia.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionMedia.ts#L393).
  - `detectMediaTypeFromFile(...)` is MIME/extension-based only: it checks `video/*`, `image/*`, and known extension sets, then returns `unknown` with no binary sniffing path in [src/utils/media/SupportedMediaFormats.ts](/Users/lifeart/Repos/openrv-web/src/utils/media/SupportedMediaFormats.ts#L76) through [src/utils/media/SupportedMediaFormats.ts](/Users/lifeart/Repos/openrv-web/src/utils/media/SupportedMediaFormats.ts#L98).
  - The same guide later admits browser-native formats bypass `DecoderRegistry` entirely and are handled at `Session.loadImage()` level in [docs/guides/file-formats.md](/Users/lifeart/Repos/openrv-web/docs/guides/file-formats.md#L199).
- Impact:
  - The docs describe a more robust file-identification path than the shipped open-file flow actually provides.
  - Misnamed or extensionless local media can still be rejected up front even if the decoder layer would have recognized the bytes.

### 499. The format docs overstate GIF and animated WebP support as if the app treated them like real animated media, but the shipped loader still models them as single-frame image sources

- Severity: Low
- Area: Documentation / animated browser-native image formats
- Evidence:
  - The top-level format reference explicitly advertises `GIF` with “Animated GIF support” in [docs/reference/file-formats.md](/Users/lifeart/Repos/openrv-web/docs/reference/file-formats.md#L12).
  - The deeper file-format guide also describes browser-native `WebP` and `GIF` as supporting “animation” in [docs/guides/file-formats.md](/Users/lifeart/Repos/openrv-web/docs/guides/file-formats.md#L190) through [docs/guides/file-formats.md](/Users/lifeart/Repos/openrv-web/docs/guides/file-formats.md#L193).
  - The shipped media-type layer still classifies both `.gif` and `.webp` as plain image formats, not video/timeline media, in [src/utils/media/SupportedMediaFormats.ts](/Users/lifeart/Repos/openrv-web/src/utils/media/SupportedMediaFormats.ts#L8) through [src/utils/media/SupportedMediaFormats.ts](/Users/lifeart/Repos/openrv-web/src/utils/media/SupportedMediaFormats.ts#L31).
  - Both `loadImage(...)` and `loadImageFile(...)` create `MediaSource` entries with `type: 'image'` and hardcoded `duration: 1` in [src/core/session/SessionMedia.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionMedia.ts#L409) through [src/core/session/SessionMedia.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionMedia.ts#L417) and [src/core/session/SessionMedia.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionMedia.ts#L449) through [src/core/session/SessionMedia.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionMedia.ts#L456).
- Impact:
  - The docs make animated GIF/WebP sound like proper reviewable moving-image formats, but the shipped session/timeline model still treats them as single-frame stills.
  - Users can expect timeline duration, frame stepping, and normal playback semantics that production does not actually wire for those formats.

### 500. The file-format guide says browser-native images are handled at `Session.loadImage()` level, but real local-file opens route through `FileSourceNode` first

- Severity: Low
- Area: Documentation / image-loading architecture
- Evidence:
  - The file-format guide says browser-native formats are “handled at the `Session.loadImage()` level using the browser’s `<img>` element, bypassing the `DecoderRegistry` entirely” in [docs/guides/file-formats.md](/Users/lifeart/Repos/openrv-web/docs/guides/file-formats.md#L199).
  - The real local-file path in `SessionMedia.loadImageFile(...)` first creates a `FileSourceNode` and calls `fileSourceNode.loadFile(file)` for ordinary image files in [src/core/session/SessionMedia.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionMedia.ts#L441) through [src/core/session/SessionMedia.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionMedia.ts#L456).
  - `FileSourceNode.loadFile(...)` then does its own format branching for EXR/DPX/TIFF/JPEG/AVIF/JXL/HEIC/JP2/RAW before falling back to standard image loading in [src/nodes/sources/FileSourceNode.ts](/Users/lifeart/Repos/openrv-web/src/nodes/sources/FileSourceNode.ts#L1858) through [src/nodes/sources/FileSourceNode.ts](/Users/lifeart/Repos/openrv-web/src/nodes/sources/FileSourceNode.ts#L2045).
  - `Session.loadImage(...)` is instead the URL/image-element path, not the main local-file entrypoint, in [src/core/session/SessionMedia.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionMedia.ts#L399) through [src/core/session/SessionMedia.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionMedia.ts#L431).
- Impact:
  - The guide explains the shipped architecture incorrectly for ordinary local image loads.
  - That makes the format docs misleading for anyone debugging load behavior, decoder fallbacks, or source-node state in production.

### 501. The file-format guide advertises `.ico` support, but the shipped supported-format lists and picker accept string do not include it

- Severity: Low
- Area: Documentation / browser-native image format support
- Evidence:
  - The browser-native formats table lists `ICO | .ico | Icon format` in [docs/guides/file-formats.md](/Users/lifeart/Repos/openrv-web/docs/guides/file-formats.md#L197).
  - The shipped supported image-extension list includes `svg` but does not include `ico` in [src/utils/media/SupportedMediaFormats.ts](/Users/lifeart/Repos/openrv-web/src/utils/media/SupportedMediaFormats.ts#L9) through [src/utils/media/SupportedMediaFormats.ts](/Users/lifeart/Repos/openrv-web/src/utils/media/SupportedMediaFormats.ts#L33).
  - The extension-based classifier therefore has no `.ico` fallback in `detectMediaTypeFromFile(...)` in [src/utils/media/SupportedMediaFormats.ts](/Users/lifeart/Repos/openrv-web/src/utils/media/SupportedMediaFormats.ts#L76) through [src/utils/media/SupportedMediaFormats.ts](/Users/lifeart/Repos/openrv-web/src/utils/media/SupportedMediaFormats.ts#L98).
  - The hidden `Open media file` input uses `SUPPORTED_MEDIA_ACCEPT`, which is built from that same extension list and therefore does not include `.ico`, in [src/utils/media/SupportedMediaFormats.ts](/Users/lifeart/Repos/openrv-web/src/utils/media/SupportedMediaFormats.ts#L100) through [src/utils/media/SupportedMediaFormats.ts](/Users/lifeart/Repos/openrv-web/src/utils/media/SupportedMediaFormats.ts#L121) and [src/ui/components/layout/HeaderBar.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/layout/HeaderBar.ts#L217) through [src/ui/components/layout/HeaderBar.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/layout/HeaderBar.ts#L221).
- Impact:
  - The docs present `.ico` as a supported browser-native format, but the shipped open-media flow does not consistently treat it as one.
  - Users can expect `.ico` files to appear and classify like other listed image formats when the real picker/runtime support is narrower.

### 502. The JPEG gainmap guide documents the wrong HDR reconstruction formula for the shipped decoder

- Severity: Low
- Area: Documentation / JPEG gainmap HDR behavior
- Evidence:
  - The file-format guide says JPEG gainmap reconstruction uses `hdr = sdr_linear * (1 + gainMap * headroom)` in [docs/guides/file-formats.md](/Users/lifeart/Repos/openrv-web/docs/guides/file-formats.md#L123).
  - The shipped JPEG gainmap decoder documents and implements the simplified ISO 21496-1-style exponential model `HDR_linear = sRGB_to_linear(base) * exp2(gainmap * headroom)` in [src/formats/JPEGGainmapDecoder.ts](/Users/lifeart/Repos/openrv-web/src/formats/JPEGGainmapDecoder.ts#L15) through [src/formats/JPEGGainmapDecoder.ts](/Users/lifeart/Repos/openrv-web/src/formats/JPEGGainmapDecoder.ts#L17).
  - The shared gain-map reconstruction path also precomputes gain factors with `Math.exp((i / 255.0) * headroom * Math.LN2)`, which is the same exponential formulation, in [src/formats/GainMapMetadata.ts](/Users/lifeart/Repos/openrv-web/src/formats/GainMapMetadata.ts#L284) through [src/formats/GainMapMetadata.ts](/Users/lifeart/Repos/openrv-web/src/formats/GainMapMetadata.ts#L288).
- Impact:
  - The docs explain the shipped HDR reconstruction math incorrectly.
  - Anyone using the guide to reason about highlight scaling, parity checks, or external reimplementation of the decoder will get the wrong model.

### 503. The file-format guide says all image decoding yields `Float32Array` RGBA data, but standard browser-native image loads still stay as `HTMLImageElement` sources

- Severity: Low
- Area: Documentation / image decode architecture
- Evidence:
  - The guide claims “All image decoding produces **Float32Array** pixel data in RGBA layout” in [docs/guides/file-formats.md](/Users/lifeart/Repos/openrv-web/docs/guides/file-formats.md#L9).
  - The normal `FileSourceNode.load(...)` path for standard JPEG/AVIF and other browser-native images stores the decoded result as `this.image = img` and explicitly leaves `this.cachedIPImage = null` in [src/nodes/sources/FileSourceNode.ts](/Users/lifeart/Repos/openrv-web/src/nodes/sources/FileSourceNode.ts#L655) through [src/nodes/sources/FileSourceNode.ts](/Users/lifeart/Repos/openrv-web/src/nodes/sources/FileSourceNode.ts#L679) and [src/nodes/sources/FileSourceNode.ts](/Users/lifeart/Repos/openrv-web/src/nodes/sources/FileSourceNode.ts#L725) through [src/nodes/sources/FileSourceNode.ts](/Users/lifeart/Repos/openrv-web/src/nodes/sources/FileSourceNode.ts#L749).
  - The URL/image-element path likewise resolves ordinary images into `HTMLImageElement`-backed `MediaSource` objects in [src/core/session/SessionMedia.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionMedia.ts#L399) through [src/core/session/SessionMedia.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionMedia.ts#L431).
  - By contrast, the real `Float32Array` / `IPImage` path is only used for specific HDR/decoder-backed formats such as EXR, gainmap HDR, JXL/HEIC SDR fallback, and other explicit buffer decodes in [src/nodes/sources/FileSourceNode.ts](/Users/lifeart/Repos/openrv-web/src/nodes/sources/FileSourceNode.ts#L989) through [src/nodes/sources/FileSourceNode.ts](/Users/lifeart/Repos/openrv-web/src/nodes/sources/FileSourceNode.ts#L1049) and [src/nodes/sources/FileSourceNode.ts](/Users/lifeart/Repos/openrv-web/src/nodes/sources/FileSourceNode.ts#L1764) through [src/nodes/sources/FileSourceNode.ts](/Users/lifeart/Repos/openrv-web/src/nodes/sources/FileSourceNode.ts#L1782).
- Impact:
  - The docs overstate how uniform the shipped decode pipeline really is.
  - Anyone reading the guide to understand memory behavior, plugin integration, or browser-native image handling will expect a Float32 decode stage that standard images do not actually use.

### 504. The plain-AVIF docs promise a WASM fallback, but the shipped AVIF path is browser-native only

- Severity: Low
- Area: Documentation / AVIF support
- Evidence:
  - The file-format guide says plain AVIF uses “Browser-native decode via `createImageBitmap()` with WASM fallback (`avif.ts`)" in [docs/guides/file-formats.md](/Users/lifeart/Repos/openrv-web/docs/guides/file-formats.md#L156).
  - The actual `avif.ts` module only implements browser-native decode through `createImageBitmap(blob)` and contains no alternate WASM decoder path in [src/formats/avif.ts](/Users/lifeart/Repos/openrv-web/src/formats/avif.ts#L4) through [src/formats/avif.ts](/Users/lifeart/Repos/openrv-web/src/formats/avif.ts#L65).
  - The live `FileSourceNode` path for non-HDR AVIF likewise checks gainmap/HDR markers and then falls back to a blob-backed `Image` load, not a WASM AVIF decoder, in [src/nodes/sources/FileSourceNode.ts](/Users/lifeart/Repos/openrv-web/src/nodes/sources/FileSourceNode.ts#L696) through [src/nodes/sources/FileSourceNode.ts](/Users/lifeart/Repos/openrv-web/src/nodes/sources/FileSourceNode.ts#L760).
- Impact:
  - The docs imply broader plain-AVIF compatibility than the shipped runtime actually provides on browsers without native AVIF support.
  - Readers can expect a decode fallback path that production does not implement.

### 505. The JPEG XL guide promises original color-space metadata, but the shipped SDR JXL decoder always reports `srgb` and only returns format/container metadata

- Severity: Low
- Area: Documentation / JPEG XL metadata
- Evidence:
  - The JPEG XL guide says JXL color space “Varies (sRGB, linear, Display P3, Rec.2020, etc.). Decoded to Float32 with metadata indicating the original color space” in [docs/guides/file-formats.md](/Users/lifeart/Repos/openrv-web/docs/guides/file-formats.md#L113).
  - The shipped SDR JXL decoder hardcodes `colorSpace: 'srgb'` in its return value in [src/formats/JXLDecoder.ts](/Users/lifeart/Repos/openrv-web/src/formats/JXLDecoder.ts#L103) through [src/formats/JXLDecoder.ts](/Users/lifeart/Repos/openrv-web/src/formats/JXLDecoder.ts#L109).
  - The same decoder’s metadata payload only includes `format` and `container`, with no original color-space field, in [src/formats/JXLDecoder.ts](/Users/lifeart/Repos/openrv-web/src/formats/JXLDecoder.ts#L105) through [src/formats/JXLDecoder.ts](/Users/lifeart/Repos/openrv-web/src/formats/JXLDecoder.ts#L109).
  - The runtime only parses JXL container color info for the separate HDR path in `FileSourceNode`, not for the normal SDR WASM decode in [src/nodes/sources/FileSourceNode.ts](/Users/lifeart/Repos/openrv-web/src/nodes/sources/FileSourceNode.ts#L765) through [src/nodes/sources/FileSourceNode.ts](/Users/lifeart/Repos/openrv-web/src/nodes/sources/FileSourceNode.ts#L788).
- Impact:
  - The docs overstate how much original JXL color-space metadata the shipped SDR decode path preserves.
  - Users or integrators can expect richer color metadata from JXL loads than production currently exposes.

### 506. The top-level file-format reference presents HEIC/HEIF as a pure WASM decode path, but the shipped runtime uses native Safari decode first and WASM only as fallback elsewhere

- Severity: Low
- Area: Documentation / HEIC support
- Evidence:
  - The top-level format table says `HEIC/HEIF | .heic, .heif | libheif WASM` in [docs/reference/file-formats.md](/Users/lifeart/Repos/openrv-web/docs/reference/file-formats.md#L15).
  - The deeper file-format guide says browser-native HEIC is used on Safari and WASM is the non-Safari fallback in [docs/guides/file-formats.md](/Users/lifeart/Repos/openrv-web/docs/guides/file-formats.md#L195).
  - The live `FileSourceNode` path matches the deeper guide: it first tries `tryLoadHEICNative(...)` and only then falls back to `loadHEICSDRWasm(...)` in [src/nodes/sources/FileSourceNode.ts](/Users/lifeart/Repos/openrv-web/src/nodes/sources/FileSourceNode.ts#L1993) through [src/nodes/sources/FileSourceNode.ts](/Users/lifeart/Repos/openrv-web/src/nodes/sources/FileSourceNode.ts#L2002).
  - The HEIC WASM decoder itself is documented as a cross-browser fallback for Chrome/Firefox/Edge because Safari already has native HEIC support in [src/formats/HEICWasmDecoder.ts](/Users/lifeart/Repos/openrv-web/src/formats/HEICWasmDecoder.ts#L2) through [src/formats/HEICWasmDecoder.ts](/Users/lifeart/Repos/openrv-web/src/formats/HEICWasmDecoder.ts#L5).
- Impact:
  - The top-level reference misstates how HEIC actually loads in production.
  - Readers can come away with the wrong performance and compatibility expectations for Safari versus other browsers.

### 507. The file-format and image-sequence guides describe missing-frame playback as always “hold last frame,” but the shipped viewer exposes four modes and defaults to `show-frame`

- Severity: Low
- Area: Documentation / image-sequence playback behavior
- Evidence:
  - The file-format guide says that when a sequence has gaps, the viewer “Holds the last available frame during playback when a gap is encountered” in [docs/guides/file-formats.md](/Users/lifeart/Repos/openrv-web/docs/guides/file-formats.md#L324) through [docs/guides/file-formats.md](/Users/lifeart/Repos/openrv-web/docs/guides/file-formats.md#L326).
  - The image-sequences guide makes the same fixed-behavior claim in [docs/playback/image-sequences.md](/Users/lifeart/Repos/openrv-web/docs/playback/image-sequences.md#L46).
  - The shipped View tab exposes four selectable missing-frame modes, `Off`, `Frame`, `Hold`, and `Black`, in [src/services/tabContent/buildViewTab.ts](/Users/lifeart/Repos/openrv-web/src/services/tabContent/buildViewTab.ts#L198) through [src/services/tabContent/buildViewTab.ts](/Users/lifeart/Repos/openrv-web/src/services/tabContent/buildViewTab.ts#L208).
  - The viewer’s live default is `show-frame`, not `hold`, in [src/ui/components/Viewer.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/Viewer.ts#L311).
  - The missing-frame render path branches by mode: `black` forces a black frame, `hold` reuses the previous frame, and the remaining modes use the current-frame path in [src/ui/components/Viewer.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/Viewer.ts#L1522) through [src/ui/components/Viewer.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/Viewer.ts#L1553).
- Impact:
  - The sequence docs present one fixed playback response to gaps, but the shipped app treats missing frames as a user-selectable viewer policy.
  - Users reading those guides can expect hold-last-frame playback even when the default runtime behavior is different.

### 508. The file-format guide still says RV/GTO import reconstructs the complete node graph, but the live importer remains lossy

- Severity: Medium
- Area: Documentation / RV-GTO compatibility
- Evidence:
  - The file-format guide says OpenRV Web can “load and reconstruct the complete node graph” from RV/GTO files in [docs/guides/file-formats.md](/Users/lifeart/Repos/openrv-web/docs/guides/file-formats.md#L342).
  - The same section presents “Graph reconstruction” as a supported capability in [docs/guides/file-formats.md](/Users/lifeart/Repos/openrv-web/docs/guides/file-formats.md#L344).
  - The live importer still records skipped nodes and degraded modes during RV/GTO load in [src/core/session/SessionGraph.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionGraph.ts#L396) through [src/core/session/SessionGraph.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionGraph.ts#L412).
  - `GTOGraphLoader` only maps a limited subset of node protocols, and unsupported-but-recognized nodes are explicitly skipped in [src/core/session/GTOGraphLoader.ts](/Users/lifeart/Repos/openrv-web/src/core/session/GTOGraphLoader.ts#L474) through [src/core/session/GTOGraphLoader.ts](/Users/lifeart/Repos/openrv-web/src/core/session/GTOGraphLoader.ts#L606).
  - The current issue inventory already has concrete runtime losses from that path, including skipped mapped nodes in [ISSUES.md](/Users/lifeart/Repos/openrv-web/ISSUES.md#L227), downgraded stack modes in [ISSUES.md](/Users/lifeart/Repos/openrv-web/ISSUES.md#L279), and unsurfaced import diagnostics in [ISSUES.md](/Users/lifeart/Repos/openrv-web/ISSUES.md#L3425).
- Impact:
  - The guide overstates RV/GTO interchange fidelity and makes the import path sound lossless.
  - Users can trust imported sessions more than the runtime actually warrants, especially when complex RV graphs are involved.

### 509. The file-format guide still describes `.orvproject` as complete viewer state with node-graph topology, but the serializer tracks known gaps and leaves `graph` unwired

- Severity: Medium
- Area: Documentation / native session format
- Evidence:
  - The file-format guide says `.orvproject` is “a JSON-based file containing the complete viewer state” in [docs/guides/file-formats.md](/Users/lifeart/Repos/openrv-web/docs/guides/file-formats.md#L367).
  - The same section lists `node graph topology` in the serialized content in [docs/guides/file-formats.md](/Users/lifeart/Repos/openrv-web/docs/guides/file-formats.md#L371).
  - `SessionSerializer` explicitly tracks multiple viewer-state serialization gaps, including OCIO, display profile, gamut mapping, curves, tone mapping, stereo state, compare state, and several Effects-tab controls, in [src/core/session/SessionSerializer.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionSerializer.ts#L67) through [src/core/session/SessionSerializer.ts#L220).
  - The live serializer also documents that the `graph` field exists in the schema but is still unwired in `.orvproject` save/load in [src/core/session/SessionSerializer.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionSerializer.ts#L328) through [src/core/session/SessionSerializer.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionSerializer.ts#L333).
  - The current issue inventory already contains the corresponding runtime defects: known serialization gaps in [ISSUES.md](/Users/lifeart/Repos/openrv-web/ISSUES.md#L3374), and missing graph persistence in [ISSUES.md](/Users/lifeart/Repos/openrv-web/ISSUES.md#L1467) and [ISSUES.md](/Users/lifeart/Repos/openrv-web/ISSUES.md#L3388).
- Impact:
  - The docs present `.orvproject` as a fuller fidelity format than the serializer actually implements.
  - Users can save projects expecting complete state recovery, then reopen into a materially reduced session.

### 510. The file-format guide still presents OTIO import as clips, gaps, transitions, and track mapping, but the live app flattens it to the first video track’s clip list

- Severity: Medium
- Area: Documentation / OTIO import fidelity
- Evidence:
  - The file-format guide says OTIO import supports “clips, gaps, and transitions” in [docs/guides/file-formats.md](/Users/lifeart/Repos/openrv-web/docs/guides/file-formats.md#L359).
  - The same section says “OTIO tracks map to sequence groups” in [docs/guides/file-formats.md](/Users/lifeart/Repos/openrv-web/docs/guides/file-formats.md#L362).
  - The shipped `parseOTIO(...)` helper is explicitly “single-track, backward-compatible” and “returns clips from the first video track only” in [src/utils/media/OTIOParser.ts](/Users/lifeart/Repos/openrv-web/src/utils/media/OTIOParser.ts#L315) through [src/utils/media/OTIOParser.ts](/Users/lifeart/Repos/openrv-web/src/utils/media/OTIOParser.ts#L333).
  - The only production import path, `PlaylistManager.fromOTIO(...)`, consumes that single-track parse result and imports each clip via `addClip(...)` into a linear playlist in [src/core/session/PlaylistManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/PlaylistManager.ts#L671) through [src/core/session/PlaylistManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/PlaylistManager.ts#L703).
  - The richer `parseOTIOMultiTrack(...)` path exists separately, but the live import path does not use it in [src/utils/media/OTIOParser.ts](/Users/lifeart/Repos/openrv-web/src/utils/media/OTIOParser.ts#L340) through [src/utils/media/OTIOParser.ts](/Users/lifeart/Repos/openrv-web/src/utils/media/OTIOParser.ts#L382).
- Impact:
  - The guide makes OTIO ingest sound structurally richer than the shipped import path actually is.
  - Editorial users can expect gaps, transitions, and multi-track layout to survive import when production still collapses them into a simple clip sequence.

### 511. The EXR docs still describe a WASM / compiled OpenEXR decoder, but the shipped `EXRDecoder.ts` is a pure TypeScript implementation with custom codec helpers

- Severity: Low
- Area: Documentation / EXR implementation details
- Evidence:
  - The file-format guide says EXR uses a “WebAssembly-compiled OpenEXR library (`EXRDecoder.ts`)" in [docs/guides/file-formats.md](/Users/lifeart/Repos/openrv-web/docs/guides/file-formats.md#L25).
  - The top-level format reference also labels EXR as a `WASM decoder` in [docs/reference/file-formats.md](/Users/lifeart/Repos/openrv-web/docs/reference/file-formats.md#L16).
  - The shipped EXR decoder file is a large TypeScript implementation that directly parses headers and decodes scanline/tiled data in [src/formats/EXRDecoder.ts](/Users/lifeart/Repos/openrv-web/src/formats/EXRDecoder.ts#L1) through [src/formats/EXRDecoder.ts](/Users/lifeart/Repos/openrv-web/src/formats/EXRDecoder.ts#L2420).
  - Compression handling is provided by local TypeScript codec modules such as [src/formats/EXRPIZCodec.ts](/Users/lifeart/Repos/openrv-web/src/formats/EXRPIZCodec.ts) and [src/formats/EXRDWACodec.ts](/Users/lifeart/Repos/openrv-web/src/formats/EXRDWACodec.ts), not a compiled OpenEXR WASM module.
  - The decoder registry imports `decodeEXR` directly from that TS path, unlike the JP2 path which explicitly acquires a WASM decoder instance in [src/formats/DecoderRegistry.ts](/Users/lifeart/Repos/openrv-web/src/formats/DecoderRegistry.ts#L487) and [src/formats/DecoderRegistry.ts](/Users/lifeart/Repos/openrv-web/src/formats/DecoderRegistry.ts#L753) through [src/formats/DecoderRegistry.ts](/Users/lifeart/Repos/openrv-web/src/formats/DecoderRegistry.ts#L754).
- Impact:
  - The docs misstate how EXR decode is implemented in production.
  - That gives readers the wrong expectations about bundle composition, performance characteristics, and the decoder’s maintenance surface.

### 512. The normal file-open/classification path omits JPEG 2000 and HTJ2K extensions, even though the decoder stack and docs claim support

- Severity: Medium
- Area: Media loading / file-type detection
- Evidence:
  - The shared supported-image extension list used by the normal media picker contains no `jp2`, `j2k`, `j2c`, `jph`, or `jhc` entries in [src/utils/media/SupportedMediaFormats.ts](/Users/lifeart/Repos/openrv-web/src/utils/media/SupportedMediaFormats.ts#L10) through [src/utils/media/SupportedMediaFormats.ts#L34).
  - The normal `Open media file` input uses that shared accept string in [src/ui/components/layout/HeaderBar.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/layout/HeaderBar.ts#L219).
  - The same shared detector classifies files by MIME first, then by the same extension sets, and returns `unknown` for anything outside them in [src/utils/media/SupportedMediaFormats.ts](/Users/lifeart/Repos/openrv-web/src/utils/media/SupportedMediaFormats.ts#L90) through [src/utils/media/SupportedMediaFormats.ts#L108).
  - Both `SessionMedia.loadFile(...)` and `MediaManager.loadFile(...)` reject `unknown` types as unsupported in [src/core/session/SessionMedia.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionMedia.ts#L412) through [src/core/session/SessionMedia.ts#L418) and [src/core/session/MediaManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/MediaManager.ts#L335) through [src/core/session/MediaManager.ts#L340).
  - The actual format stack does advertise and branch for those extensions: the docs list JPEG 2000 / HTJ2K support in [docs/reference/file-formats.md](/Users/lifeart/Repos/openrv-web/docs/reference/file-formats.md#L22) through [docs/reference/file-formats.md#L23), and `FileSourceNode` explicitly treats `jp2`, `j2k`, `j2c`, `jph`, and `jhc` as JPEG 2000 family inputs in [src/nodes/sources/FileSourceNode.ts](/Users/lifeart/Repos/openrv-web/src/nodes/sources/FileSourceNode.ts#L94) through [src/nodes/sources/FileSourceNode.ts#L98).
- Impact:
  - Local JPEG 2000 / HTJ2K files can fall through the normal file-open path as unsupported when the browser does not provide a helpful MIME type.
  - That leaves decoder support present in the runtime while the primary user-facing load path still makes those formats hard or impossible to open reliably.

### 513. The shared file-open/classification path also omits `.mxf`, so local MXF files can be rejected before the registered MXF parser ever runs

- Severity: Medium
- Area: Media loading / MXF ingestion
- Evidence:
  - The shared supported-video extension lists contain no `mxf` entry in [src/utils/media/SupportedMediaFormats.ts](/Users/lifeart/Repos/openrv-web/src/utils/media/SupportedMediaFormats.ts#L39) through [src/utils/media/SupportedMediaFormats.ts#L63).
  - The normal media picker uses that same `SUPPORTED_MEDIA_ACCEPT` string in [src/ui/components/layout/HeaderBar.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/layout/HeaderBar.ts#L219).
  - `detectMediaTypeFromFile(...)` therefore returns `unknown` for MIME-less `.mxf` files, and the normal load path rejects `unknown` types as unsupported in [src/utils/media/SupportedMediaFormats.ts](/Users/lifeart/Repos/openrv-web/src/utils/media/SupportedMediaFormats.ts#L90) through [src/utils/media/SupportedMediaFormats.ts#L108), [src/core/session/SessionMedia.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionMedia.ts#L412) through [src/core/session/SessionMedia.ts#L418), and [src/core/session/MediaManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/MediaManager.ts#L335) through [src/core/session/MediaManager.ts#L340).
  - The decoder registry still registers an `mxf` parser adapter in [src/formats/DecoderRegistry.ts](/Users/lifeart/Repos/openrv-web/src/formats/DecoderRegistry.ts#L786) through [src/formats/DecoderRegistry.ts#L816), and the public docs still present MXF as a supported format in [docs/reference/file-formats.md](/Users/lifeart/Repos/openrv-web/docs/reference/file-formats.md#L59).
- Impact:
  - A local MXF file can be rejected by the app’s primary file-open path before the metadata parser ever gets a chance to inspect it.
  - That makes MXF support even narrower in practice than the already-limited metadata-only runtime path.

### 514. The image-sequence workflow only recognizes a narrow legacy extension subset, even though the docs say sequences can use any supported image format

- Severity: Medium
- Area: Image sequences / format coverage
- Evidence:
  - The image-sequences guide says sequences can consist of files in “any supported image format,” explicitly listing JPEG XL, JPEG 2000, AVIF, and HEIC in [docs/playback/image-sequences.md](/Users/lifeart/Repos/openrv-web/docs/playback/image-sequences.md#L77) through [docs/playback/image-sequences.md#L85).
  - The sequence loader’s `IMAGE_EXTENSIONS` set only includes `png`, `jpg`, `jpeg`, `webp`, `gif`, `bmp`, `tiff`, `tif`, `exr`, `dpx`, `cin`, and `cineon` in [src/utils/media/SequenceLoader.ts](/Users/lifeart/Repos/openrv-web/src/utils/media/SequenceLoader.ts#L33) through [src/utils/media/SequenceLoader.ts#L46).
  - Sequence detection and inference both run through `filterImageFiles(...)` in the normal open flows in [src/ui/components/layout/HeaderBar.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/layout/HeaderBar.ts#L1449) through [src/ui/components/layout/HeaderBar.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/layout/HeaderBar.ts#L1477) and [src/ui/components/ViewerInputHandler.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/ViewerInputHandler.ts#L773) through [src/ui/components/ViewerInputHandler.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/ViewerInputHandler.ts#L799).
  - `createSequenceInfo(...)` also filters by that same subset before building sequence metadata in [src/utils/media/SequenceLoader.ts](/Users/lifeart/Repos/openrv-web/src/utils/media/SequenceLoader.ts#L227) through [src/utils/media/SequenceLoader.ts](/Users/lifeart/Repos/openrv-web/src/utils/media/SequenceLoader.ts#L235).
- Impact:
  - Multi-file and inferred-sequence workflows do not treat many documented “supported” image families as sequence candidates at all.
  - Users can select AVIF, HEIC, JXL, or JPEG 2000 frame sets and get single-file loading or outright non-sequence behavior instead of the documented sequence workflow.

### 515. The sequence-loading path bypasses the custom decoder stack and decodes frames with `createImageBitmap()`, so documented EXR/DPX/Cineon/HDR sequence workflows are not actually backed by the pro-format loaders

- Severity: High
- Area: Image sequences / decode pipeline
- Evidence:
  - The image-sequences guide says sequences can use professional formats including EXR, DPX, Cineon, Radiance HDR, JPEG XL, JPEG 2000, AVIF, and HEIC in [docs/playback/image-sequences.md](/Users/lifeart/Repos/openrv-web/docs/playback/image-sequences.md#L77) through [docs/playback/image-sequences.md#L86).
  - The same page claims EXR sequences “benefit from the full HDR pipeline including WebAssembly decoding, Float32 precision, and layer/AOV selection” in [docs/playback/image-sequences.md](/Users/lifeart/Repos/openrv-web/docs/playback/image-sequences.md#L87).
  - The actual sequence frame loader always calls `createImageBitmap(frame.file, ...)` in [src/utils/media/SequenceLoader.ts](/Users/lifeart/Repos/openrv-web/src/utils/media/SequenceLoader.ts#L126) through [src/utils/media/SequenceLoader.ts](/Users/lifeart/Repos/openrv-web/src/utils/media/SequenceLoader.ts#L144).
  - `SessionMedia.loadSequence(...)`, `MediaManager.loadSequence(...)`, and `SequenceSourceNode.loadFiles(...)` all depend on `createSequenceInfo(...)` / `loadFrameImage(...)` from that same loader in [src/core/session/SessionMedia.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionMedia.ts#L737) through [src/core/session/SessionMedia.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionMedia.ts#L765), [src/core/session/MediaManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/MediaManager.ts#L791) through [src/core/session/MediaManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/MediaManager.ts#L845), and [src/nodes/sources/SequenceSourceNode.ts](/Users/lifeart/Repos/openrv-web/src/nodes/sources/SequenceSourceNode.ts#L45) through [src/nodes/sources/SequenceSourceNode.ts#L80).
  - By contrast, the dedicated pro-format decoders live elsewhere in the file-loading stack, such as `decodeEXR(...)` in [src/formats/EXRDecoder.ts](/Users/lifeart/Repos/openrv-web/src/formats/EXRDecoder.ts#L2420) and the JPEG 2000 family branch in [src/nodes/sources/FileSourceNode.ts](/Users/lifeart/Repos/openrv-web/src/nodes/sources/FileSourceNode.ts#L2017) through [src/nodes/sources/FileSourceNode.ts](/Users/lifeart/Repos/openrv-web/src/nodes/sources/FileSourceNode.ts#L2024).
- Impact:
  - The shipped sequence workflow does not actually route professional image sequences through the documented decoder/HDR pipeline.
  - That can turn EXR/DPX/Cineon/HDR sequence review into browser-native decode failures or materially different behavior from single-frame loads, while the docs promise full pro-format handling.

### 516. Sequence loads collapse the numeric frame range down to `frames.length`, so missing-frame positions are not preserved as real timeline frames

- Severity: High
- Area: Image sequences / frame-range semantics
- Evidence:
  - `SequenceInfo` separately tracks `startFrame`, `endFrame`, and `missingFrames`, so the loader does know the original numbered range in [src/utils/media/SequenceLoader.ts](/Users/lifeart/Repos/openrv-web/src/utils/media/SequenceLoader.ts#L14) through [src/utils/media/SequenceLoader.ts#L23) and [src/utils/media/SequenceLoader.ts](/Users/lifeart/Repos/openrv-web/src/utils/media/SequenceLoader.ts#L250) through [src/utils/media/SequenceLoader.ts#L261).
  - Despite that, both `SessionMedia.loadSequence(...)` and `MediaManager.loadSequence(...)` set source duration and out-point to `sequenceInfo.frames.length`, not to the numeric frame range, in [src/core/session/SessionMedia.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionMedia.ts#L754) through [src/core/session/SessionMedia.ts#L769) and [src/core/session/MediaManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/MediaManager.ts#L804) through [src/core/session/MediaManager.ts#L821).
  - The viewer then detects “missing frames” by comparing adjacent loaded frame numbers inside that shortened frame list in [src/ui/components/Viewer.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/Viewer.ts#L1198) through [src/ui/components/Viewer.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/Viewer.ts#L1225).
  - The image-sequences guide says the sequence range runs from the lowest to highest frame number and that the timeline displays that total frame count in [docs/playback/image-sequences.md](/Users/lifeart/Repos/openrv-web/docs/playback/image-sequences.md#L50).
- Impact:
  - A gapped sequence like `1001, 1002, 1004` becomes a 3-frame timeline instead of a 4-frame numeric range with an actual missing-frame slot.
  - That makes timeline duration, in/out behavior, and frame-based review semantics drift away from the source numbering the app is simultaneously trying to report.

### 517. The image-sequences guide still describes per-frame blob-URL lifecycle, but the live sequence loader decodes files directly and never creates `frame.url`

- Severity: Low
- Area: Documentation / sequence memory model
- Evidence:
  - The image-sequences guide says sequence memory management includes “Blob URL lifecycle -- blob URLs are created when a frame loads and revoked when released” in [docs/playback/image-sequences.md](/Users/lifeart/Repos/openrv-web/docs/playback/image-sequences.md#L71).
  - The actual sequence frame loader decodes each file directly via `createImageBitmap(frame.file, ...)` in [src/utils/media/SequenceLoader.ts](/Users/lifeart/Repos/openrv-web/src/utils/media/SequenceLoader.ts#L126) through [src/utils/media/SequenceLoader.ts](/Users/lifeart/Repos/openrv-web/src/utils/media/SequenceLoader.ts#L144).
  - `SequenceFrame` still has an optional `url` field, but a repo search finds no production assignment to `frame.url`; only cleanup paths revoke it if present in [src/utils/media/SequenceLoader.ts](/Users/lifeart/Repos/openrv-web/src/utils/media/SequenceLoader.ts#L10), [src/utils/media/SequenceLoader.ts](/Users/lifeart/Repos/openrv-web/src/utils/media/SequenceLoader.ts#L217) through [src/utils/media/SequenceLoader.ts](/Users/lifeart/Repos/openrv-web/src/utils/media/SequenceLoader.ts#L219), and [src/utils/media/SequenceLoader.ts](/Users/lifeart/Repos/openrv-web/src/utils/media/SequenceLoader.ts#L312) through [src/utils/media/SequenceLoader.ts](/Users/lifeart/Repos/openrv-web/src/utils/media/SequenceLoader.ts#L314).
- Impact:
  - The guide describes an older or different sequence-frame memory model than the one the shipped app actually uses.
  - That can mislead anyone debugging sequence memory behavior or trying to understand the current loader’s lifecycle costs.

### 518. The plain-AVIF docs say detection excludes gainmap AVIFs, but `isAvifFile(...)` still returns `true` for any AVIF-brand file and relies on registry ordering instead

- Severity: Low
- Area: Documentation / AVIF detection semantics
- Evidence:
  - The file-format guide says plain AVIF detection is an `ftyp` box with AVIF brands “without gain map auxiliary items” in [docs/guides/file-formats.md](/Users/lifeart/Repos/openrv-web/docs/guides/file-formats.md#L157).
  - The same section separately says gainmap AVIFs are matched first because the plain AVIF decoder is placed later in the registry chain in [docs/guides/file-formats.md](/Users/lifeart/Repos/openrv-web/docs/guides/file-formats.md#L158).
  - The shipped `isAvifFile(...)` implementation explicitly says it “Returns true for any AVIF file, including gainmap AVIFs” in [src/formats/avif.ts](/Users/lifeart/Repos/openrv-web/src/formats/avif.ts#L13) and only checks the `ftyp` brand in [src/formats/avif.ts](/Users/lifeart/Repos/openrv-web/src/formats/avif.ts#L16) through [src/formats/avif.ts](/Users/lifeart/Repos/openrv-web/src/formats/avif.ts#L25).
  - The registry comment matches the implementation: plain AVIF is placed after `avifGainmapDecoder` so ordering, not the detector itself, prevents misclassification in [src/formats/DecoderRegistry.ts](/Users/lifeart/Repos/openrv-web/src/formats/DecoderRegistry.ts#L825).
- Impact:
  - The docs describe the plain AVIF detector as semantically stricter than it really is.
  - That can mislead anyone reasoning about format identification or trying to reuse `isAvifFile(...)` outside the exact registry ordering the app depends on.

### 519. ShotGrid frame-sequence paths are still routed through `session.loadImage(...)`, so `shot.####.exr` is treated like a single image URL instead of a sequence

- Severity: Medium
- Area: ShotGrid integration / sequence loading
- Evidence:
  - The ShotGrid panel now resolves `sg_path_to_frames` as the media URL when that path is present in [src/ui/components/ShotGridPanel.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/ShotGridPanel.ts#L306) through [src/ui/components/ShotGridPanel.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/ShotGridPanel.ts#L307), and the `Load` action is enabled whenever `mediaUrl` exists in [src/ui/components/ShotGridPanel.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/ShotGridPanel.ts#L497).
  - `ShotGridIntegrationBridge` explicitly detects the “frame sequence path” case, logs it, and still routes every non-video URL into `this.session.loadImage(version.code, mediaUrl)` in [src/integrations/ShotGridIntegrationBridge.ts](/Users/lifeart/Repos/openrv-web/src/integrations/ShotGridIntegrationBridge.ts#L162) through [src/integrations/ShotGridIntegrationBridge.ts](/Users/lifeart/Repos/openrv-web/src/integrations/ShotGridIntegrationBridge.ts#L174).
  - `SessionMedia.loadImage(...)` loads that URL through a plain `HTMLImageElement` and creates a single-frame `MediaSource` with `duration: 1` in [src/core/session/SessionMedia.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionMedia.ts#L429) through [src/core/session/SessionMedia.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionMedia.ts#L456).
  - There is no sequence-pattern expansion or sequence-loader handoff in that path; the real sequence flow depends on file batches and `SequenceLoader` helpers instead in [src/ui/components/layout/HeaderBar.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/layout/HeaderBar.ts#L1449) through [src/ui/components/layout/HeaderBar.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/layout/HeaderBar.ts#L1477).
- Impact:
  - ShotGrid versions backed only by frame-sequence paths can reach a loadable UI state and still fail to behave like sequences in production.
  - That leaves one of the app’s main review integrations unable to turn a standard `####` frame path into an actual timeline-backed source.

### 520. The docs present `####` / `%04d` / `@@@@` pattern strings as supported sequence formats, but production does not have a live loader for literal pattern strings

- Severity: Medium
- Area: Documentation / sequence-pattern workflow
- Evidence:
  - The file-format reference lists `Printf`, `Hash`, and `At-sign` entries under `Sequence Formats` in [docs/reference/file-formats.md](/Users/lifeart/Repos/openrv-web/docs/reference/file-formats.md#L69) through [docs/reference/file-formats.md](/Users/lifeart/Repos/openrv-web/docs/reference/file-formats.md#L75).
  - The image-sequences guide and file-format guide both present those same notations as supported pattern forms in [docs/playback/image-sequences.md](/Users/lifeart/Repos/openrv-web/docs/playback/image-sequences.md#L21) through [docs/playback/image-sequences.md](/Users/lifeart/Repos/openrv-web/docs/playback/image-sequences.md#L33) and [docs/guides/file-formats.md](/Users/lifeart/Repos/openrv-web/docs/guides/file-formats.md#L301) through [docs/guides/file-formats.md](/Users/lifeart/Repos/openrv-web/docs/guides/file-formats.md#L309).
  - The only production sequence-ingest path uses numbered files plus `extractPatternFromFilename(...)`, `discoverSequences(...)`, and `inferSequenceFromSingleFile(...)` in [src/utils/media/SequenceLoader.ts](/Users/lifeart/Repos/openrv-web/src/utils/media/SequenceLoader.ts#L479) through [src/utils/media/SequenceLoader.ts](/Users/lifeart/Repos/openrv-web/src/utils/media/SequenceLoader.ts#L644) and is wired from file-batch UI flows in [src/ui/components/layout/HeaderBar.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/layout/HeaderBar.ts#L1449) through [src/ui/components/layout/HeaderBar.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/layout/HeaderBar.ts#L1477) and [src/ui/components/ViewerInputHandler.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/ViewerInputHandler.ts#L773) through [src/ui/components/ViewerInputHandler.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/ViewerInputHandler.ts#L799).
  - The parser helpers for literal pattern strings, `parsePatternNotation(...)`, `toHashNotation(...)`, and `toPrintfNotation(...)`, have no production callers outside tests in [src/utils/media/SequenceLoader.ts](/Users/lifeart/Repos/openrv-web/src/utils/media/SequenceLoader.ts#L426) through [src/utils/media/SequenceLoader.ts](/Users/lifeart/Repos/openrv-web/src/utils/media/SequenceLoader.ts#L457), with repo hits limited to [src/utils/media/SequenceLoader.test.ts](/Users/lifeart/Repos/openrv-web/src/utils/media/SequenceLoader.test.ts#L631) through [src/utils/media/SequenceLoader.test.ts](/Users/lifeart/Repos/openrv-web/src/utils/media/SequenceLoader.test.ts#L700).
- Impact:
  - The docs make literal pattern strings look like a real ingest format when the shipped app still expects concrete numbered files.
  - Integrations or users that hand the app `shot.####.exr` or `frame.%04d.exr` can reasonably expect sequence loading and instead hit unrelated image-URL or unsupported-file behavior.

### 521. `.orvproject` still serializes `sequencePattern` and `frameRange` for sequences, but the restore path never consumes them

- Severity: Medium
- Area: Project persistence / dead sequence metadata
- Evidence:
  - The session-state schema reserves `sequencePattern` and `frameRange` on `MediaReference` for sequences in [src/core/session/SessionState.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionState.ts#L31) through [src/core/session/SessionState.ts#L54).
  - `SessionSerializer.serializeMedia(...)` populates both fields for sequence sources in [src/core/session/SessionSerializer.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionSerializer.ts#L409) through [src/core/session/SessionSerializer.ts#L414).
  - The corresponding load path never consults `ref.sequencePattern` or `ref.frameRange`; for `ref.type === 'sequence'` it only emits `Sequence \"<name>\" requires manual file selection` in [src/core/session/SessionSerializer.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionSerializer.ts#L509) through [src/core/session/SessionSerializer.ts#L512).
  - A repo search shows no production consumer of those restored sequence fields outside serialization/tests; the remaining hits are schema definitions and assertions in [src/core/session/SessionSerializer.test.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionSerializer.test.ts#L278) through [src/core/session/SessionSerializer.test.ts#L279).
- Impact:
  - Sequence-specific metadata is written into project files without contributing anything to real restore behavior.
  - That makes the saved project format look more sequence-aware than the load path actually is and leaves dead state in the schema that users cannot benefit from.

### 522. ShotGrid media loading only recognizes `mp4|mov|webm|mkv` as video, so other otherwise-supported containers are misrouted into `loadImage(...)`

- Severity: Medium
- Area: ShotGrid integration / media type detection
- Evidence:
  - `ShotGridIntegrationBridge` decides whether a version URL is video using `\\.(mp4|mov|webm|mkv)(\\?|$)` in [src/integrations/ShotGridIntegrationBridge.ts](/Users/lifeart/Repos/openrv-web/src/integrations/ShotGridIntegrationBridge.ts#L170).
  - Every non-matching URL is routed into `this.session.loadImage(...)` in [src/integrations/ShotGridIntegrationBridge.ts](/Users/lifeart/Repos/openrv-web/src/integrations/ShotGridIntegrationBridge.ts#L171) through [src/integrations/ShotGridIntegrationBridge.ts](/Users/lifeart/Repos/openrv-web/src/integrations/ShotGridIntegrationBridge.ts#L174).
  - The app’s broader supported video-extension set is materially wider and includes `m4v`, `3gp`, `3g2`, `qt`, `mk3d`, `ogg`, `ogv`, `ogm`, `ogx`, and `avi` in [src/utils/media/SupportedMediaFormats.ts](/Users/lifeart/Repos/openrv-web/src/utils/media/SupportedMediaFormats.ts#L39) through [src/utils/media/SupportedMediaFormats.ts#L63).
- Impact:
  - ShotGrid versions that point at otherwise-supported containers can still be treated like image URLs and fail to load through the correct video path.
  - That makes ShotGrid media support narrower than the rest of the app, even for formats the main file-open flow can already classify as video.

### 523. DCC media loading also uses a narrower hardcoded video-extension list than the rest of the app

- Severity: Medium
- Area: DCC integration / media type detection
- Evidence:
  - `AppDCCWiring` classifies video paths using `VIDEO_EXTENSIONS = ['mp4', 'webm', 'mov', 'avi', 'mkv', 'ogv']` in [src/AppDCCWiring.ts](/Users/lifeart/Repos/openrv-web/src/AppDCCWiring.ts#L85).
  - The incoming `loadMedia` handler routes any extension outside that list into `session.loadImage(...)` in [src/AppDCCWiring.ts](/Users/lifeart/Repos/openrv-web/src/AppDCCWiring.ts#L184) through [src/AppDCCWiring.ts](/Users/lifeart/Repos/openrv-web/src/AppDCCWiring.ts#L221).
  - The app’s broader supported video-extension set is wider and includes `m4v`, `3gp`, `3g2`, `qt`, `mk3d`, `ogg`, `ogm`, and `ogx` in [src/utils/media/SupportedMediaFormats.ts](/Users/lifeart/Repos/openrv-web/src/utils/media/SupportedMediaFormats.ts#L39) through [src/utils/media/SupportedMediaFormats.ts#L63), and `Session.loadSourceFromUrl(...)` likewise recognizes those extra extensions in [src/core/session/Session.ts](/Users/lifeart/Repos/openrv-web/src/core/session/Session.ts#L1141).
- Impact:
  - DCC clients can send clean, extension-bearing video paths that the main app would otherwise accept and still have them misrouted into the image path.
  - That makes DCC media loading less capable than the normal URL/file workflows for several already-supported video containers.

### 524. `.orvproject` restore reloads saved image URLs through `session.loadImage(...)`, so remote decoder-backed images do not round-trip through the project path

- Severity: Medium
- Area: Project persistence / URL-backed media restore
- Evidence:
  - During project load, `SessionSerializer.fromJSON(...)` restores every saved `ref.type === 'image'` entry by calling `await session.loadImage(ref.name, ref.path)` in [src/core/session/SessionSerializer.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionSerializer.ts#L510) through [src/core/session/SessionSerializer.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionSerializer.ts#L513).
  - `session.loadImage(...)` uses the plain `HTMLImageElement` URL path rather than the decoder-backed `FileSourceNode` pipeline, as shown in [src/core/session/SessionMedia.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionMedia.ts#L429) through [src/core/session/SessionMedia.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionMedia.ts#L456).
  - The decoder-backed image path lives in `loadImageFile(...)` / `FileSourceNode.loadFile(...)` instead in [src/core/session/SessionMedia.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionMedia.ts#L468) through [src/core/session/SessionMedia.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionMedia.ts#L515).
  - This is the same underlying capability gap already recorded for share-link and DCC URL loading in [ISSUES.md](/Users/lifeart/Repos/openrv-web/ISSUES.md#L5160), but project restore hardcodes that same weaker path inside the persistence layer.
- Impact:
  - A project file that references remote EXR, float TIFF, RAW-preview, or other decoder-backed image URLs can reopen through a different and weaker load path than the original session used.
  - That makes `.orvproject` URL-backed media restore less faithful than users would expect from a save/load round-trip.

### 525. The DCC `loadMedia` protocol advertises “file path or URL,” but the browser-side loader just forwards raw paths into `img.src` / `video.src`

- Severity: Medium
- Area: DCC integration / protocol contract
- Evidence:
  - The DCC protocol defines inbound `loadMedia.path` as a “File path or URL” in [src/integrations/DCCBridge.ts](/Users/lifeart/Repos/openrv-web/src/integrations/DCCBridge.ts#L38) through [src/integrations/DCCBridge.ts](/Users/lifeart/Repos/openrv-web/src/integrations/DCCBridge.ts#L43).
  - `AppDCCWiring` forwards that `path` string directly into `session.loadVideo(name, path)` or `session.loadImage(name, path)` in [src/AppDCCWiring.ts](/Users/lifeart/Repos/openrv-web/src/AppDCCWiring.ts#L184) through [src/AppDCCWiring.ts](/Users/lifeart/Repos/openrv-web/src/AppDCCWiring.ts#L221).
  - Those session URL loaders then assign the raw string to browser media elements, with `img.src = url` in [src/core/session/SessionMedia.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionMedia.ts#L429) through [src/core/session/SessionMedia.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionMedia.ts#L456) and the corresponding video path in [src/core/session/SessionMedia.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionMedia.ts#L640) through [src/core/session/SessionMedia.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionMedia.ts#L689).
  - Elsewhere in the docs, the app already acknowledges the browser sandbox cannot directly access local filesystems, for example in [docs/guides/session-compatibility.md](/Users/lifeart/Repos/openrv-web/docs/guides/session-compatibility.md#L210).
- Impact:
  - A DCC tool that sends an ordinary host filesystem path can follow the advertised protocol and still fail because the browser cannot resolve that path as a meaningful media URL.
  - That makes the live DCC load contract narrower than the protocol/type comments imply unless the sender converts paths into browser-reachable URLs first.

### 526. The image-sequences guide still presents fixed `5`-frame preload and `20`-frame retention windows, but the live sequence stack now mixes multiple larger cache policies

- Severity: Low
- Area: Documentation / sequence memory behavior
- Evidence:
  - The image-sequences guide says the preload window is “5 frames ahead and behind” and the keep window is “up to 20 frames” in [docs/playback/image-sequences.md](/Users/lifeart/Repos/openrv-web/docs/playback/image-sequences.md#L66) through [docs/playback/image-sequences.md](/Users/lifeart/Repos/openrv-web/docs/playback/image-sequences.md#L72).
  - The direct session/media sequence path does still use `preloadFrames(..., 5)` plus `releaseDistantFrames(..., 20)` during normal fetches in [src/core/session/SessionMedia.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionMedia.ts#L932) through [src/core/session/SessionMedia.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionMedia.ts#L939) and [src/core/session/MediaManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/MediaManager.ts#L842) through [src/core/session/MediaManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/MediaManager.ts#L848).
  - But the same runtime also does a wider initial preload of `10` frames on sequence load in [src/core/session/SessionMedia.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionMedia.ts#L771) and [src/core/session/MediaManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/MediaManager.ts#L824).
  - The node-graph sequence path uses `FramePreloadManager` defaults of `maxCacheSize: 100`, `preloadAhead: 30`, `preloadBehind: 5`, and `scrubWindow: 10` in [src/utils/media/FramePreloadManager.ts](/Users/lifeart/Repos/openrv-web/src/utils/media/FramePreloadManager.ts#L24) through [src/utils/media/FramePreloadManager.ts](/Users/lifeart/Repos/openrv-web/src/utils/media/FramePreloadManager.ts#L34).
- Impact:
  - The guide presents sequence caching as one simple fixed policy, but the shipped runtime now uses different preload/retention behaviors depending on the path and playback state.
  - That can mislead anyone trying to reason about memory usage, hitching, or cache tuning from the docs alone.

### 527. Sequence-style media representations can never use `SequenceRepresentationLoader`, because the live switch path never passes the `isSequence` flag to the loader factory

- Severity: Medium
- Area: Media representations / sequence variants
- Evidence:
  - `RepresentationLoaderFactory` can return `SequenceRepresentationLoader` for `kind === 'frames'`, but only when its third `isSequence` parameter is `true` in [src/core/session/loaders/RepresentationLoaderFactory.ts](/Users/lifeart/Repos/openrv-web/src/core/session/loaders/RepresentationLoaderFactory.ts#L24) through [src/core/session/loaders/RepresentationLoaderFactory.ts#L36).
  - The live representation switch path calls `createRepresentationLoader(representation.kind, hdrResizeTier)` with no `isSequence` argument in [src/core/session/MediaRepresentationManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/MediaRepresentationManager.ts#L182), so `frames` representations always get `FileRepresentationLoader`.
  - `FileRepresentationLoader` requires a single `loaderConfig.file` and throws if one is not present in [src/core/session/loaders/FileRepresentationLoader.ts](/Users/lifeart/Repos/openrv-web/src/core/session/loaders/FileRepresentationLoader.ts#L13) through [src/core/session/loaders/FileRepresentationLoader.ts#L20).
  - The separate `SequenceRepresentationLoader` expects `loaderConfig.files` and constructs sequence metadata from that array in [src/core/session/loaders/SequenceRepresentationLoader.ts](/Users/lifeart/Repos/openrv-web/src/core/session/loaders/SequenceRepresentationLoader.ts#L72) through [src/core/session/loaders/SequenceRepresentationLoader.ts#L89).
- Impact:
  - Any representation intended to model an alternate image-sequence variant is routed into the wrong loader and can fail before it ever gets sequence-aware handling.
  - That leaves the representation system effectively biased toward single-file frame reps even though the codebase contains a dedicated sequence representation loader.

### 528. Sequence representations also cannot round-trip through serialization, because the serialized loader config omits `files` while `SequenceRepresentationLoader` requires them

- Severity: Medium
- Area: Media representations / project persistence
- Evidence:
  - `RepresentationLoaderConfig` supports runtime-only `files?: File[]` for sequence representations in [src/core/types/representation.ts](/Users/lifeart/Repos/openrv-web/src/core/types/representation.ts#L64) through [src/core/types/representation.ts#L79).
  - The serialized representation format explicitly omits `file` and `files` from `loaderConfig` in [src/core/types/representation.ts](/Users/lifeart/Repos/openrv-web/src/core/types/representation.ts#L93) through [src/core/types/representation.ts#L107).
  - `SessionSerializer.fromJSON(...)` restores representations from that serialized loader config and passes it straight into `addRepresentationToSource(...)` in [src/core/session/SessionSerializer.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionSerializer.ts#L527) through [src/core/session/SessionSerializer.ts#L547).
  - `SequenceRepresentationLoader` then throws `SequenceRepresentationLoader: no files provided` whenever `loaderConfig.files` is absent in [src/core/session/loaders/SequenceRepresentationLoader.ts](/Users/lifeart/Repos/openrv-web/src/core/session/loaders/SequenceRepresentationLoader.ts#L72) through [src/core/session/loaders/SequenceRepresentationLoader.ts#L80).
- Impact:
  - Sequence-based alternate representations cannot be faithfully restored from saved project state.
  - The representation serialization format carries enough metadata to look sequence-aware, but not enough runtime data for the actual sequence representation loader to work.

### 529. The representation system still advertises a `streaming` kind, but the live loader factory throws for it

- Severity: Medium
- Area: Media representations / unsupported kind
- Evidence:
  - The shared representation model still defines `RepresentationKind = 'frames' | 'movie' | 'proxy' | 'streaming'` and documents representations as things like “full-res frames, proxy video, streaming URL” in [src/core/types/representation.ts](/Users/lifeart/Repos/openrv-web/src/core/types/representation.ts#L4) through [src/core/types/representation.ts#L12).
  - `getDefaultPriority(...)` also treats `streaming` as a normal representation kind in [src/core/types/representation.ts](/Users/lifeart/Repos/openrv-web/src/core/types/representation.ts#L216) through [src/core/types/representation.ts#L227).
  - The live loader factory throws `Streaming representations are not yet supported` for `kind === 'streaming'` in [src/core/session/loaders/RepresentationLoaderFactory.ts](/Users/lifeart/Repos/openrv-web/src/core/session/loaders/RepresentationLoaderFactory.ts#L38) through [src/core/session/loaders/RepresentationLoaderFactory.ts#L39).
  - `MediaRepresentationManager.switchRepresentation(...)` calls that factory directly during normal representation activation in [src/core/session/MediaRepresentationManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/MediaRepresentationManager.ts#L182) through [src/core/session/MediaRepresentationManager.ts#L197).
- Impact:
  - A representation kind that the shared model treats as valid still fails at the point of actual use.
  - That leaves the representation contract broader than the shipped runtime and makes `streaming` look supported until activation time.

### 530. Non-sequence file, movie, and proxy representations also cannot round-trip through serialization, because the saved loader config strips the `File` objects their live loaders require

- Severity: Medium
- Area: Media representations / project persistence
- Evidence:
  - Representation serialization removes both `file` and `files` from `loaderConfig` before save in [src/core/types/representation.ts](/Users/lifeart/Repos/openrv-web/src/core/types/representation.ts#L234) through [src/core/types/representation.ts](/Users/lifeart/Repos/openrv-web/src/core/types/representation.ts#L246).
  - `SessionSerializer.fromJSON(...)` restores representations from that stripped `loaderConfig` and feeds it straight back into `addRepresentationToSource(...)`, then tries to reactivate the saved `activeRepresentationId` in [src/core/session/SessionSerializer.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionSerializer.ts#L527) through [src/core/session/SessionSerializer.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionSerializer.ts#L560).
  - The normal single-image representation path still uses `FileRepresentationLoader`, which throws `FileRepresentationLoader: no file provided` when `loaderConfig.file` is absent in [src/core/session/loaders/FileRepresentationLoader.ts](/Users/lifeart/Repos/openrv-web/src/core/session/loaders/FileRepresentationLoader.ts#L15) through [src/core/session/loaders/FileRepresentationLoader.ts#L22).
  - The normal `movie` / `proxy` path still uses `VideoRepresentationLoader`, which likewise throws `VideoRepresentationLoader: no file provided` when `loaderConfig.file` is absent in [src/core/session/loaders/VideoRepresentationLoader.ts](/Users/lifeart/Repos/openrv-web/src/core/session/loaders/VideoRepresentationLoader.ts#L21) through [src/core/session/loaders/VideoRepresentationLoader.ts#L29).
- Impact:
  - Saved projects can preserve alternate representation metadata and IDs, but any restored non-sequence representation that still depends on a runtime `File` object can fail as soon as activation is attempted.
  - That leaves representation persistence broken more broadly than the already-logged sequence case: metadata round-trips, but the real loadable media payload does not.

### 531. The shared representation loader contract advertises `path` and `url` configs, but live representation activation still hard-fails unless an in-memory `File` object is present

- Severity: Medium
- Area: Media representations / runtime contract
- Evidence:
  - `RepresentationLoaderConfig` explicitly documents `path` for file-based representations and `url` for URL-based representations in [src/core/types/representation.ts](/Users/lifeart/Repos/openrv-web/src/core/types/representation.ts#L69) through [src/core/types/representation.ts#L85).
  - The shared type tests also treat those fields as normal inputs, for example creating reps with `loaderConfig: { url: 'http://example.com/video.mp4' }` and `loaderConfig: { path: '/path/to/file.exr' }` in [src/core/types/representation.test.ts](/Users/lifeart/Repos/openrv-web/src/core/types/representation.test.ts#L25) through [src/core/types/representation.test.ts#L56).
  - But the live `frames` loader ignores `url` and requires `loaderConfig.file`, throwing `FileRepresentationLoader: no file provided` when it is missing in [src/core/session/loaders/FileRepresentationLoader.ts](/Users/lifeart/Repos/openrv-web/src/core/session/loaders/FileRepresentationLoader.ts#L15) through [src/core/session/loaders/FileRepresentationLoader.ts#L22).
  - The live `movie` / `proxy` loader does the same, throwing `VideoRepresentationLoader: no file provided` whenever `loaderConfig.file` is absent in [src/core/session/loaders/VideoRepresentationLoader.ts](/Users/lifeart/Repos/openrv-web/src/core/session/loaders/VideoRepresentationLoader.ts#L21) through [src/core/session/loaders/VideoRepresentationLoader.ts#L29).
- Impact:
  - A representation config that looks valid by shared types, comments, and tests can still fail at first real activation if it was built from a path or URL instead of a `File`.
  - That leaves the published representation contract broader than the shipped runtime and makes URL-based or path-only variants look supported when they are not.

### 532. Representation-level `opfsCacheKey` is serialized and tested, but no live representation loader or restore path ever uses it

- Severity: Medium
- Area: Media representations / resilience contract
- Evidence:
  - `RepresentationLoaderConfig` explicitly includes `opfsCacheKey` for “resilience against File reference invalidation,” and `SerializedRepresentation` preserves it in [src/core/types/representation.ts](/Users/lifeart/Repos/openrv-web/src/core/types/representation.ts#L73) through [src/core/types/representation.ts#L113).
  - The shared representation tests also assert that `serializeRepresentation(...)` keeps `loaderConfig.opfsCacheKey` in [src/core/types/representation.test.ts](/Users/lifeart/Repos/openrv-web/src/core/types/representation.test.ts#L124) through [src/core/types/representation.test.ts#L167).
  - But the actual OPFS restore logic in `SessionSerializer.fromJSON(...)` only checks the top-level media reference `ref.opfsCacheKey` before reloading the base source in [src/core/session/SessionSerializer.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionSerializer.ts#L387) through [src/core/session/SessionSerializer.ts#L408) and [src/core/session/SessionSerializer.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionSerializer.ts#L458) through [src/core/session/SessionSerializer.ts#L476).
  - The live representation loaders still only read `loaderConfig.file` and throw if it is missing, with no `opfsCacheKey` lookup path in [src/core/session/loaders/FileRepresentationLoader.ts](/Users/lifeart/Repos/openrv-web/src/core/session/loaders/FileRepresentationLoader.ts#L15) through [src/core/session/loaders/FileRepresentationLoader.ts#L25) and [src/core/session/loaders/VideoRepresentationLoader.ts](/Users/lifeart/Repos/openrv-web/src/core/session/loaders/VideoRepresentationLoader.ts#L21) through [src/core/session/loaders/VideoRepresentationLoader.ts#L32).
- Impact:
  - Representation configs can carry an `opfsCacheKey` that appears to promise resilient reload behavior, but losing the original `File` handle still leaves those variants unloadable.
  - That makes the representation persistence model look more fault-tolerant than the real runtime actually is.

### 533. Representation switching claims frame-accurate remapping via `startFrame`, but the live switch path never uses the remap logic

- Severity: Medium
- Area: Media representations / playback continuity
- Evidence:
  - The shared representation model says `startFrame` is “Used for frame-accurate switching” between editorial-offset variants in [src/core/types/representation.ts](/Users/lifeart/Repos/openrv-web/src/core/types/representation.ts#L51) through [src/core/types/representation.ts#L55).
  - `MediaRepresentationManager` does implement `mapFrame(currentFrame, fromRep, toRep, maxFrame?)` for exactly that purpose in [src/core/session/MediaRepresentationManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/MediaRepresentationManager.ts#L297) through [src/core/session/MediaRepresentationManager.ts#L315).
  - But the real `switchRepresentation(...)` path only swaps the active representation, applies the shim, and emits `representationChanged`; it never calls `mapFrame(...)` or updates the host’s current frame in [src/core/session/MediaRepresentationManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/MediaRepresentationManager.ts#L133) through [src/core/session/MediaRepresentationManager.ts#L229).
  - Production subscribers to `representationChanged` only resync timecode offsets and audio-scrub availability in [src/App.ts](/Users/lifeart/Repos/openrv-web/src/App.ts#L198) and [src/AppPlaybackWiring.ts](/Users/lifeart/Repos/openrv-web/src/AppPlaybackWiring.ts#L218); a repo search finds no live caller that remaps the current frame through `mapFrame(...)`.
- Impact:
  - Switching between representations with different start-frame offsets can leave playback on the wrong relative frame even though the type/model explicitly promises frame-accurate switching.
  - That is especially damaging for EXR-vs-proxy editorial workflows, where the whole point of the stored offset is to preserve shot alignment across representation changes.

### 534. Representation fallback and removal can change the active media without emitting the `representationChanged` event that the rest of the app relies on

- Severity: Medium
- Area: Media representations / app-state synchronization
- Evidence:
  - Removing the active representation immediately picks the next ready one and reapplies the shim, but `removeRepresentation(...)` emits no `representationChanged` event afterward in [src/core/session/MediaRepresentationManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/MediaRepresentationManager.ts#L88) through [src/core/session/MediaRepresentationManager.ts#L116).
  - Error fallback does something similar for ready fallbacks: it updates `activeRepresentationIndex`, applies the shim, and emits only `fallbackActivated`, not `representationChanged`, in [src/core/session/MediaRepresentationManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/MediaRepresentationManager.ts#L241) through [src/core/session/MediaRepresentationManager.ts#L265).
  - Production app code listens to `representationChanged` to resync timecode offsets and audio-scrub availability in [src/App.ts](/Users/lifeart/Repos/openrv-web/src/App.ts#L194) through [src/App.ts](/Users/lifeart/Repos/openrv-web/src/App.ts#L199) and [src/AppPlaybackWiring.ts](/Users/lifeart/Repos/openrv-web/src/AppPlaybackWiring.ts#L212) through [src/AppPlaybackWiring.ts#L219).
  - A repo search finds no equivalent live subscriber for `fallbackActivated`; it is forwarded by `SessionMedia`, but not consumed by the app shell in production.
- Impact:
  - The real active media can change after a representation failure or removal while the rest of the app still behaves as if the old representation were active.
  - That can leave derived UI state such as timecode offsets and scrub-audio availability stale until some other unrelated event forces a refresh.

### 535. Even if a sequence representation loaded successfully, the shim path would still discard the sequence metadata that the rest of the app expects

- Severity: Medium
- Area: Media representations / sequence runtime wiring
- Evidence:
  - The normal sequence load path builds a `MediaSource` with `sequenceInfo`, `sequenceFrames`, `duration`, `fps`, and the first frame element, then updates host FPS and out-point accordingly in [src/core/session/SessionMedia.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionMedia.ts#L743) through [src/core/session/SessionMedia.ts#L771).
  - `SequenceRepresentationLoader` does preserve `SequenceInfo` and frame data inside `SequenceSourceNodeWrapper` via its `sequenceInfo` and `frames` accessors in [src/core/session/loaders/SequenceRepresentationLoader.ts](/Users/lifeart/Repos/openrv-web/src/core/session/loaders/SequenceRepresentationLoader.ts#L21) through [src/core/session/loaders/SequenceRepresentationLoader.ts#L49).
  - But `SessionMedia.applyRepresentationShim(...)` clears `source.sequenceInfo` and `source.sequenceFrames`, and for non-file/non-video sources it only copies `getElement(1)` plus `type = 'sequence'` in [src/core/session/SessionMedia.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionMedia.ts#L1180) through [src/core/session/SessionMedia.ts#L1214).
- Impact:
  - A sequence-based alternate representation would still be only partially wired even after the loader problems were fixed.
  - Existing sequence-aware playback and UI paths would lose access to frame lists, sequence metadata, and the normal source-level sequence state they depend on.

### 536. Representation switches only update width and height on the active source, leaving source-level duration/FPS state stale

- Severity: Medium
- Area: Media representations / source metadata consistency
- Evidence:
  - `MediaSource` exposes `duration` and `fps` alongside `width` and `height` as the canonical source-level metadata read throughout the app in [src/core/session/SessionTypes.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionTypes.ts#L191) through [src/core/session/SessionTypes.ts#L217).
  - Normal media load paths update those fields and emit the matching host/session events, for example video load sets detected FPS and duration and then calls `setFps(...)`, `emitFpsChanged(...)`, `setOutPoint(...)`, and `emitDurationChanged(...)` in [src/core/session/SessionMedia.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionMedia.ts#L709) through [src/core/session/SessionMedia.ts#L728).
  - But `SessionMedia.applyRepresentationShim(...)` only copies `representation.resolution.width` and `representation.resolution.height`, clears node-specific fields, and never updates `source.duration`, `source.fps`, or any host playback bounds/events in [src/core/session/SessionMedia.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionMedia.ts#L1180) through [src/core/session/SessionMedia.ts#L1216).
  - Large parts of the runtime still read `source.duration` and `source.fps` directly after source changes, including public API/event payloads and timeline/viewer UI in [src/api/MediaAPI.ts](/Users/lifeart/Repos/openrv-web/src/api/MediaAPI.ts#L52) through [src/api/MediaAPI.ts#L55), [src/ui/components/Timeline.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/Timeline.ts#L408) through [src/ui/components/Timeline.ts#L417), and [src/ui/components/Viewer.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/Viewer.ts#L1682) through [src/ui/components/Viewer.ts#L1683).
- Impact:
  - Switching to a representation with different duration or FPS can leave the app reporting and using stale source metadata from the previous variant.
  - That undermines timeline bounds, public media-info APIs, and any UI that assumes representation switches keep the source metadata coherent.

### 537. Removing the last active representation can leave the source shim pointing at a disposed node

- Severity: Medium
- Area: Media representations / removal edge case
- Evidence:
  - `removeRepresentation(...)` disposes the loader for the removed representation and deletes it from the internal map in [src/core/session/MediaRepresentationManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/MediaRepresentationManager.ts#L96) through [src/core/session/MediaRepresentationManager.ts#L101).
  - If that removed representation was active and there is no ready fallback, the code only sets `activeRepresentationIndex` to `-1`; it does not call `applyRepresentationShim(...)` or otherwise clear the source-level node fields in [src/core/session/MediaRepresentationManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/MediaRepresentationManager.ts#L103) through [src/core/session/MediaRepresentationManager.ts#L116).
  - The actual clearing of `source.videoSourceNode`, `source.fileSourceNode`, `source.sequenceInfo`, `source.sequenceFrames`, and `source.element` lives inside `SessionMedia.applyRepresentationShim(...)` in [src/core/session/SessionMedia.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionMedia.ts#L1188) through [src/core/session/SessionMedia.ts#L1194).
  - Both file and video representation loaders dispose their held source nodes when removed in [src/core/session/loaders/FileRepresentationLoader.ts](/Users/lifeart/Repos/openrv-web/src/core/session/loaders/FileRepresentationLoader.ts#L42) through [src/core/session/loaders/FileRepresentationLoader.ts#L46) and [src/core/session/loaders/VideoRepresentationLoader.ts](/Users/lifeart/Repos/openrv-web/src/core/session/loaders/VideoRepresentationLoader.ts#L51) through [src/core/session/loaders/VideoRepresentationLoader.ts#L55).
- Impact:
  - After removing the last active representation, the source can still hold legacy pointers to a node that has already been disposed.
  - That leaves the app in a stale half-switched state instead of clearly falling back or clearly clearing the active media variant.

### 538. Switching representations while playing pauses playback and never resumes it

- Severity: Medium
- Area: Media representations / playback interaction
- Evidence:
  - `SessionMedia.switchRepresentation(...)` unconditionally pauses the host when playback is active before delegating to the representation manager in [src/core/session/SessionMedia.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionMedia.ts#L1153) through [src/core/session/SessionMedia.ts#L1164).
  - The rest of the representation-switch path only changes the active representation and emits representation events; there is no matching resume call in [src/core/session/MediaRepresentationManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/MediaRepresentationManager.ts#L133) through [src/core/session/MediaRepresentationManager.ts#L229).
  - A repo search finds no production subscriber on `representationChanged` or `fallbackActivated` that restarts playback after a successful switch.
- Impact:
  - A user who changes representation during playback can end up unexpectedly paused even when the switch succeeds.
  - That makes representation changes disrupt review flow instead of behaving like a transparent quality/source swap.

### 539. Video representations are not promoted to full video sources, so they lose the `HTMLVideoElement` and audio wiring that normal video playback paths still rely on

- Severity: High
- Area: Media representations / video runtime wiring
- Evidence:
  - Normal video file loads build both a `VideoSourceNode` and an `HTMLVideoElement`, store both on the active `MediaSource`, and call `loadAudioFromVideo(...)` for audio sync/playback in [src/core/session/SessionMedia.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionMedia.ts#L621) through [src/core/session/SessionMedia.ts#L672).
  - The representation shim clears `source.element` and, for `VideoSourceNode` representations, restores only `source.videoSourceNode` plus `type = 'video'` in [src/core/session/SessionMedia.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionMedia.ts#L1188) through [src/core/session/SessionMedia.ts#L1203).
  - No representation-switch path recreates an `HTMLVideoElement`, calls `initVideoPreservesPitch(...)`, or calls `loadAudioFromVideo(...)`; a repo search finds those only in the normal media-load paths.
  - Large parts of playback and export still branch on `source.element instanceof HTMLVideoElement`, including current-time sync and native video playback/audio sync in [src/core/session/SessionPlayback.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionPlayback.ts#L486) through [src/core/session/SessionPlayback.ts#L499) and [src/core/session/PlaybackEngine.ts](/Users/lifeart/Repos/openrv-web/src/core/session/PlaybackEngine.ts#L536) through [src/core/session/PlaybackEngine.ts#L553), plus export/render fallbacks in [src/ui/components/ViewerExport.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/ViewerExport.ts#L102) through [src/ui/components/ViewerExport.ts#L114).
- Impact:
  - Switching into a video/proxy representation does not give the app the same runtime shape as loading that video normally.
  - That can break audio sync/playback and any native-video/export path that still expects an `HTMLVideoElement` on video sources.

### 540. Representation switches leave `source.name` and `source.url` pinned to the base media, even when the active variant is different

- Severity: Medium
- Area: Media representations / source identity
- Evidence:
  - `SessionMedia.applyRepresentationShim(...)` updates only resolution and node-specific fields; it never rewrites `source.name` or `source.url` from the active representation’s label/path/url in [src/core/session/SessionMedia.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionMedia.ts#L1180) through [src/core/session/SessionMedia.ts#L1216).
  - The representation model does carry alternate identity fields such as `label` plus `loaderConfig.path` / `loaderConfig.url` in [src/core/types/representation.ts](/Users/lifeart/Repos/openrv-web/src/core/types/representation.ts#L24) through [src/core/types/representation.ts#L90).
  - Public/source-facing runtime code continues to read `source.name` and `source.url` directly after switches, including `openrv.media.getCurrentSource()` in [src/api/MediaAPI.ts](/Users/lifeart/Repos/openrv-web/src/api/MediaAPI.ts#L44) through [src/api/MediaAPI.ts#L54), session save/export in [src/core/session/SessionSerializer.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionSerializer.ts#L390) through [src/core/session/SessionSerializer.ts#L395) and [src/core/session/SessionGTOExporter.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionGTOExporter.ts#L606) through [src/core/session/SessionGTOExporter.ts#L607), and UI surfaces like [InfoStripOverlay.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/InfoStripOverlay.ts#L172) through [src/ui/components/InfoStripOverlay.ts#L179) and [RightPanelContent.ts](/Users/lifeart/Repos/openrv-web/src/ui/layout/panels/RightPanelContent.ts).
- Impact:
  - After switching to a proxy or alternate file/video representation, the app can still present, serialize, and reason about the base source identity instead of the actually active media variant.
  - That makes public media info, exports, and on-screen source labeling drift away from what the viewer is really showing.

### 541. Adding a new representation can silently corrupt `activeRepresentationIndex` because the list is re-sorted without remapping the existing active slot

- Severity: Medium
- Area: Media representations / active-state integrity
- Evidence:
  - `MediaRepresentationManager.addRepresentation(...)` pushes the new representation and immediately sorts the array by priority in [src/core/session/MediaRepresentationManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/MediaRepresentationManager.ts#L59) through [src/core/session/MediaRepresentationManager.ts#L68).
  - The active representation is stored only as an index on the source via `source.activeRepresentationIndex` in [src/core/session/SessionMedia.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionMedia.ts#L127) through [src/core/session/SessionMedia.ts#L135).
  - After sorting, `addRepresentation(...)` only handles the special case where no active representation exists; it never remaps a pre-existing active index to the same representation object in [src/core/session/MediaRepresentationManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/MediaRepresentationManager.ts#L70) through [src/core/session/MediaRepresentationManager.ts#L76).
  - The current tests cover sorting and auto-activation, but there is no case asserting that an existing active representation remains the active one after a later insertion changes ordering in [src/core/session/MediaRepresentationManager.test.ts](/Users/lifeart/Repos/openrv-web/src/core/session/MediaRepresentationManager.test.ts#L119) through [src/core/session/MediaRepresentationManager.test.ts#L181).
- Impact:
  - Adding a higher-priority representation after one is already active can make `activeRepresentationIndex` point at a different entry than before, without any explicit switch.
  - That can make subsequent playback, save/load, and UI state treat the wrong representation as active even though the user never changed it.

### 542. Async idle-fallbacks are reported as successful before they actually load, so callers can miss real representation-restore failures

- Severity: Medium
- Area: Media representations / error reporting contract
- Evidence:
  - `switchRepresentation(...)` returns the boolean result of `handleRepresentationError(...)` after a system-initiated load failure in [src/core/session/MediaRepresentationManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/MediaRepresentationManager.ts#L210) through [src/core/session/MediaRepresentationManager.ts#L228).
  - In the idle-fallback branch, `handleRepresentationError(...)` starts `void this.switchRepresentation(...)` asynchronously and immediately returns `true`, with an inline comment calling that “Optimistically true” in [src/core/session/MediaRepresentationManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/MediaRepresentationManager.ts#L268) through [src/core/session/MediaRepresentationManager.ts#L273).
  - The current test suite explicitly codifies that optimistic `true` behavior in [src/core/session/MediaRepresentationManager.test.ts](/Users/lifeart/Repos/openrv-web/src/core/session/MediaRepresentationManager.test.ts#L424) through [src/core/session/MediaRepresentationManager.test.ts#L444).
  - `SessionSerializer.fromJSON(...)` treats the awaited boolean from `session.switchRepresentation(...)` as authoritative when deciding whether to warn about a failed active-representation restore in [src/core/session/SessionSerializer.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionSerializer.ts#L550) through [src/core/session/SessionSerializer.ts#L560).
- Impact:
  - A representation restore can be reported as successful to its caller even though the fallback path is still unresolved and may fail moments later.
  - That makes restore/reporting logic undercount real failures and leaves error visibility dependent on later side effects instead of the original operation result.

### 543. The multiple-representation subsystem is effectively unwired in the shipped app outside save/load internals

- Severity: Medium
- Area: Media representations / production reachability
- Evidence:
  - A repo search finds no production UI, app-shell, service, plugin, or public-API caller for `session.switchRepresentation(...)`, `addRepresentationToSource(...)`, or `removeRepresentationFromSource(...)`; outside tests, the only live caller is `SessionSerializer.fromJSON(...)` during restore in [src/core/session/SessionSerializer.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionSerializer.ts#L534) through [src/core/session/SessionSerializer.ts#L552).
  - The public API layer exposes representation-related error events, but no matching user-facing or scripting methods to manage representations; the search over [src/api](/Users/lifeart/Repos/openrv-web/src/api) only finds `representationError` event bridging in [src/api/EventsAPI.ts](/Users/lifeart/Repos/openrv-web/src/api/EventsAPI.ts#L351) through [src/api/EventsAPI.ts#L359).
  - The UI/app-shell search over `src/ui`, `src/App.ts`, `src/AppPlaybackWiring.ts`, and `src/services` does not find any shipped control path that switches or edits representations.
- Impact:
  - The app contains a substantial media-representation system, but in production it is mostly reachable only indirectly through project/session restore.
  - That leaves the feature set largely untestable by real users, and it helps explain why multiple restore/runtime edge cases can exist without an everyday UI path exposing them earlier.

### 544. The heavily tested legacy `MediaManager` is effectively dead in production; the shipped app runs through `SessionMedia` instead

- Severity: Medium
- Area: Media loading / test-to-runtime coverage
- Evidence:
  - The real session runtime instantiates `SessionMedia` as its media subsystem in [src/core/session/Session.ts](/Users/lifeart/Repos/openrv-web/src/core/session/Session.ts#L81) through [src/core/session/Session.ts#L92).
  - A repo search finds `new MediaManager(...)` only inside [src/core/session/MediaManager.test.ts](/Users/lifeart/Repos/openrv-web/src/core/session/MediaManager.test.ts), while production code does instantiate `SessionMedia` in [src/core/session/SessionMedia.test.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionMedia.test.ts#L111) and the main runtime through `Session`.
  - The codebase therefore carries two large, similarly named media stacks, but only one of them is actually on the app’s execution path.
- Impact:
  - Passing `MediaManager` tests can give false confidence about the shipped app’s media behavior, because production requests and state mutations go through different code.
  - That increases the chance of media-loading regressions surviving despite strong-looking unit coverage on the wrong subsystem.

### 545. Public source/rendered-image events stay stale across representation switches because the API bridge ignores `representationChanged`

- Severity: Medium
- Area: Public API / event consistency
- Evidence:
  - `EventsAPI` updates its public `sourceLoaded` payloads and `_lastLoadedSource` cache only from `session.on('sourceLoaded', ...)` and `session.on('currentSourceChanged', ...)` in [src/api/EventsAPI.ts](/Users/lifeart/Repos/openrv-web/src/api/EventsAPI.ts#L315) through [src/api/EventsAPI.ts#L322) and [src/api/EventsAPI.ts](/Users/lifeart/Repos/openrv-web/src/api/EventsAPI.ts#L392) through [src/api/EventsAPI.ts#L404).
  - The same bridge subscribes to `representationError`, but not to `representationChanged` or `fallbackActivated`, in [src/api/EventsAPI.ts](/Users/lifeart/Repos/openrv-web/src/api/EventsAPI.ts#L351) through [src/api/EventsAPI.ts#L359).
  - Representation switches in the session emit `representationChanged` and `fallbackActivated`, not `sourceLoaded`, in [src/core/session/SessionMedia.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionMedia.ts#L145) through [src/core/session/SessionMedia.ts#L152) and [src/core/session/MediaRepresentationManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/MediaRepresentationManager.ts#L167) through [src/core/session/MediaRepresentationManager.ts#L202).
- Impact:
  - Scripting consumers listening for public source/rendered-image state can miss real active-media changes when the viewer switches representations.
  - That leaves the public event surface lagging behind the actual viewer state even when the internal session correctly changes variants.

### 546. `currentSourceChanged` is not emitted for representation switches, so active-source listeners can keep stale per-source state

- Severity: Medium
- Area: Session events / state invalidation
- Evidence:
  - `SessionMedia` emits `currentSourceChanged` only from `setCurrentSource(...)` when the source index changes in [src/core/session/SessionMedia.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionMedia.ts#L290).
  - Representation switching emits `representationChanged` / `fallbackActivated`, but not `currentSourceChanged`, in [src/core/session/SessionMedia.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionMedia.ts#L145) through [src/core/session/SessionMedia.ts#L152) and [src/core/session/MediaRepresentationManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/MediaRepresentationManager.ts#L167) through [src/core/session/MediaRepresentationManager.ts#L202).
  - Production code does treat `currentSourceChanged` as the signal for clearing source-specific state, for example floating-window QC results are cleared only on that event in [src/AppViewWiring.ts](/Users/lifeart/Repos/openrv-web/src/AppViewWiring.ts#L318) through [src/AppViewWiring.ts#L323).
  - The public API bridge also depends on `currentSourceChanged` for part of its rendered-image refresh path in [src/api/EventsAPI.ts](/Users/lifeart/Repos/openrv-web/src/api/EventsAPI.ts#L399) through [src/api/EventsAPI.ts#L404).
- Impact:
  - Switching the active media variant in place can leave source-scoped UI and API consumers behaving as if nothing changed, because the session never emits the broader “active source changed” signal they subscribe to.
  - That makes representation changes a blind spot for invalidation logic that was written around source changes rather than source indices alone.

### 547. The public scripting event surface exposes representation failures, but not successful representation changes or fallbacks

- Severity: Medium
- Area: Public API / observability
- Evidence:
  - The internal session emits `representationChanged` and `fallbackActivated` events in [src/core/session/MediaRepresentationManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/MediaRepresentationManager.ts#L167) through [src/core/session/MediaRepresentationManager.ts#L202) and [src/core/session/MediaRepresentationManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/MediaRepresentationManager.ts#L258) through [src/core/session/MediaRepresentationManager.ts#L263).
  - `EventsAPI` only bridges the failure side of that subsystem via `representationError`, mapping it onto the generic public `error` channel in [src/api/EventsAPI.ts](/Users/lifeart/Repos/openrv-web/src/api/EventsAPI.ts#L351) through [src/api/EventsAPI.ts#L359).
  - The public `OpenRVEventName` union has no `representationChanged` or fallback event at all in [src/api/EventsAPI.ts](/Users/lifeart/Repos/openrv-web/src/api/EventsAPI.ts#L14) through [src/api/EventsAPI.ts#L29).
- Impact:
  - Script/plugin authors can be told when representation switching fails, but they have no first-class way to observe when the active variant changes successfully or silently falls back.
  - That makes representation-aware automation asymmetric and forces consumers to infer state changes indirectly from other stale or incomplete signals.

### 548. The Network Sync copy-link button can get stuck in `Copying...` because the production bridge never reports clipboard completion back to the control

- Severity: Medium
- Area: Collaboration UI / copy-link flow
- Evidence:
  - `NetworkControl` emits `copyLink`, immediately switches the button into a transient `Copying...` state, and documents that callers should invoke `setCopyResult(...)` once the async clipboard write settles in [src/ui/components/NetworkControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/NetworkControl.ts#L843) through [src/ui/components/NetworkControl.ts#L856) and [src/ui/components/NetworkControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/NetworkControl.ts#L1349) through [src/ui/components/NetworkControl.ts#L1366).
  - The production `AppNetworkBridge` does subscribe to `copyLink`, builds the share URL, and calls `navigator.clipboard.writeText(...)`, but it never calls `networkControl.setCopyResult(true|false)` on either success or failure in [src/AppNetworkBridge.ts](/Users/lifeart/Repos/openrv-web/src/AppNetworkBridge.ts#L142) through [src/AppNetworkBridge.ts#L178).
  - A repo search finds no other production caller of `setCopyResult(...)`; outside tests, the method is effectively unused.
- Impact:
  - The copy-link button can remain stuck in its in-progress visual state instead of resolving to `Copied!`, `Copy failed`, or resetting cleanly.
  - That makes the collaboration share flow feel hung even when the actual clipboard operation already finished or failed.

### 549. URL/session sharing has no representation awareness, so active alternate variants cannot round-trip through share links or collaboration state

- Severity: Medium
- Area: Session URL sharing / media representations
- Evidence:
  - `SessionURLService.captureSessionURLState()` stores only the current source index, base `sourceUrl`, A/B indices, frame, transform, wipe, and OCIO state in [src/services/SessionURLService.ts](/Users/lifeart/Repos/openrv-web/src/services/SessionURLService.ts#L105) through [src/services/SessionURLService.ts#L132).
  - Its `URLSession` dependency contract exposes no representation fields or methods at all beyond the base current source and source indices in [src/services/SessionURLService.ts](/Users/lifeart/Repos/openrv-web/src/services/SessionURLService.ts#L17) through [src/services/SessionURLService.ts#L35).
  - On apply, the service can reload only `state.sourceUrl` on a clean session and then set current source / A-B / view state; there is no path to restore active representation IDs or alternate representation definitions in [src/services/SessionURLService.ts](/Users/lifeart/Repos/openrv-web/src/services/SessionURLService.ts#L135) through [src/services/SessionURLService.ts#L223).
- Impact:
  - A shared URL can reconstruct only the base media plus viewer state, not the actual active representation/variant a user was reviewing.
  - That makes representation-based review state non-shareable across the app’s URL and collaboration entry points even though project save/load tries to preserve it.

### 550. Public `renderedImagesChanged` payloads are hardcoded to one synthetic image from the last loaded source, not the actual current render set

- Severity: Medium
- Area: Public API / rendered-image model
- Evidence:
  - `EventsAPI.emitCurrentRenderedImages()` always emits a single-item `images` array, with `index: 0` and `nodeName: name`, derived only from `_lastLoadedSource` in [src/api/EventsAPI.ts](/Users/lifeart/Repos/openrv-web/src/api/EventsAPI.ts#L408) through [src/api/EventsAPI.ts#L422).
  - `_lastLoadedSource` itself stores only `{ name, width, height }`, not a real render list, node graph identity, compare overlays, or multiple active images in [src/api/EventsAPI.ts](/Users/lifeart/Repos/openrv-web/src/api/EventsAPI.ts#L104) through [src/api/EventsAPI.ts#L105).
  - The same public event type is described as `images: Array<...>` and is consumed by compatibility code that expects it to reflect the current render set in [src/api/EventsAPI.ts](/Users/lifeart/Repos/openrv-web/src/api/EventsAPI.ts#L62) through [src/api/EventsAPI.ts#L70) and [src/compat/MuEvalBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuEvalBridge.ts#L114) through [src/compat/MuEvalBridge.ts#L128).
- Impact:
  - Public/compat consumers can be told there is exactly one rendered image even when the viewer is in compare or other multi-image states.
  - That makes the rendered-image event payload a lossy approximation of viewer output rather than a trustworthy description of the current render graph.

### 551. Public `viewTransformChanged` always reports `pixelAspect: 1`, even though non-square-pixel workflows exist and compat consumers use that field

- Severity: Medium
- Area: Public API / view transform accuracy
- Evidence:
  - `EventsAPI` hardcodes `pixelAspect: 1` in every emitted `viewTransformChanged` payload in [src/api/EventsAPI.ts](/Users/lifeart/Repos/openrv-web/src/api/EventsAPI.ts#L369) through [src/api/EventsAPI.ts#L382).
  - The broader app and compat layers do carry and use pixel-aspect information, for example `MuEvalBridge` uses `vt.pixelAspect` in screen/image coordinate conversions in [src/compat/MuEvalBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuEvalBridge.ts#L490) through [src/compat/MuEvalBridge.ts#L522), and the app supports PAR / pixel-aspect state elsewhere in [src/core/session/SessionGTOExporter.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionGTOExporter.ts#L1375) and [src/transform/LensDistortion.ts](/Users/lifeart/Repos/openrv-web/src/transform/LensDistortion.ts#L230) through [src/transform/LensDistortion.ts#L262).
- Impact:
  - Public/compat consumers can receive geometrically wrong view-transform data for anamorphic or other non-square-pixel cases.
  - That makes external coordinate reasoning less accurate than the event contract suggests, especially in tools that rely on `pixelAspect` for hit testing or screen-space mapping.

### 552. Mu compat `remoteContacts()` returns the locally supplied connection labels instead of the peer contact names received on handshake

- Severity: Medium
- Area: Mu compatibility / remote networking
- Evidence:
  - `MuNetworkBridge.remoteContacts()` simply maps `connectionInfo.values()` to `info.name` in [src/compat/MuNetworkBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuNetworkBridge.ts#L258) through [src/compat/MuNetworkBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuNetworkBridge.ts#L260).
  - That `name` field comes from the caller-supplied `remoteConnect(name, host, port)` argument when the connection record is created in [src/compat/MuNetworkBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuNetworkBridge.ts#L88) through [src/compat/MuNetworkBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuNetworkBridge.ts#L111).
  - The bridge separately stores the actual peer identity in `peerContactName` when the handshake arrives in [src/compat/MuNetworkBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuNetworkBridge.ts#L404) through [src/compat/MuNetworkBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuNetworkBridge.ts#L411), and the type contract explicitly describes that field as “Peer's contact name received via handshake” in [src/compat/types.ts](/Users/lifeart/Repos/openrv-web/src/compat/types.ts#L95) through [src/compat/types.ts](/Users/lifeart/Repos/openrv-web/src/compat/types.ts#L104).
- Impact:
  - Mu-compatible scripts asking for remote contacts get back whatever local label was passed into `remoteConnect(...)`, not the actual contact names advertised by the remote peers.
  - That makes peer identity unreliable for collaboration/integration code that needs to distinguish real remote users from local aliases.

### 553. Public `openrv.media.getStartFrame()` cannot represent legitimate frame-0 media because it coerces `0` to `1`

- Severity: Medium
- Area: Public API / media metadata
- Evidence:
  - `getCurrentSourceStartFrame(...)` returns the active representation start frame or sequence start frame, defaulting to `0`, in [src/utils/media/SourceUIState.ts](/Users/lifeart/Repos/openrv-web/src/utils/media/SourceUIState.ts#L20) through [src/utils/media/SourceUIState.ts](/Users/lifeart/Repos/openrv-web/src/utils/media/SourceUIState.ts#L29).
  - `MediaAPI.getStartFrame()` then does `return startFrame || 1`, which rewrites any legitimate `0` value to `1`, in [src/api/MediaAPI.ts](/Users/lifeart/Repos/openrv-web/src/api/MediaAPI.ts#L171) through [src/api/MediaAPI.ts](/Users/lifeart/Repos/openrv-web/src/api/MediaAPI.ts#L177).
  - The codebase does treat `0` as a valid start frame elsewhere, including sequence/representation fixtures in [src/core/session/SessionSerializer.test.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionSerializer.test.ts#L1102) through [src/core/session/SessionSerializer.test.ts#L1255) and [src/utils/media/SourceUIState.test.ts](/Users/lifeart/Repos/openrv-web/src/utils/media/SourceUIState.test.ts#L7) through [src/utils/media/SourceUIState.test.ts#L18).
  - Mu compat `frameStart()` delegates directly to this API in [src/compat/MuCommands.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuCommands.ts#L189) through [src/compat/MuCommands.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuCommands.ts#L191), so the coercion leaks into the Mu layer too.
- Impact:
  - Scripts and integrations cannot distinguish a real frame-0 source from the default “no metadata” fallback.
  - That shifts downstream frame-range, timecode-offset, and sequence-origin calculations by one frame for 0-based media.

### 554. The public playback/event API stays clip-local in playlist mode and never exposes the global playlist timeline the UI is actually using

- Severity: Medium
- Area: Public API / playlist runtime
- Evidence:
  - When the app jumps within a playlist, it stores the playlist-global frame in `playlistManager.setCurrentFrame(globalFrame)` but seeks the session to the clip-local frame via `session.goToFrame(mapping.localFrame)` in [src/services/FrameNavigationService.ts](/Users/lifeart/Repos/openrv-web/src/services/FrameNavigationService.ts#L225) through [src/services/FrameNavigationService.ts#L235) and [src/AppPlaybackWiring.ts](/Users/lifeart/Repos/openrv-web/src/AppPlaybackWiring.ts#L875) through [src/AppPlaybackWiring.ts#L885).
  - `PlaybackAPI.getCurrentFrame()` returns `this.session.currentFrame` and `PlaybackAPI.getTotalFrames()` returns `this.session.currentSource?.duration`, both of which are clip-local values in that runtime model, in [src/api/PlaybackAPI.ts](/Users/lifeart/Repos/openrv-web/src/api/PlaybackAPI.ts#L253) through [src/api/PlaybackAPI.ts#L270).
  - The public `frameChange` event is likewise bridged directly from `session.on('frameChanged', ...)` in [src/api/EventsAPI.ts](/Users/lifeart/Repos/openrv-web/src/api/EventsAPI.ts#L234) through [src/api/EventsAPI.ts#L237), so event consumers also see only the clip-local frame domain.
  - The real playlist-global frame lives only in `PlaylistManager.getCurrentFrame()` / `getTotalDuration()` in [src/core/session/PlaylistManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/PlaylistManager.ts#L427) through [src/core/session/PlaylistManager.ts#L511), and the public API has no playlist module that exposes those values.
- Impact:
  - Automation or external review tools querying `openrv.playback` during playlist review get per-clip frame numbers and durations even while the UI/timeline is operating in playlist-global frame space.
  - That makes scripting against playlist sessions fundamentally ambiguous: external code cannot reconstruct the same frame position the user is actually seeing from the public API alone.

### 555. Mu compat `commands.isSupported()` can return `'stub'`, even though the documented/type contract only allows `true`, `false`, or `'partial'`

- Severity: Medium
- Area: Mu compatibility / command introspection
- Evidence:
  - `MuCommands` marks several commands as `'stub'` in its live support map, including `setViewSize`, `setMargins`, and `margins`, in [src/compat/MuCommands.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuCommands.ts#L85) through [src/compat/MuCommands.ts#L129).
  - `MuCommands.isSupported(name)` explicitly returns `boolean | 'partial' | 'stub'` in [src/compat/MuCommands.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuCommands.ts#L155) through [src/compat/MuCommands.ts#L157).
  - The shared compat type `CommandSupportStatus` still excludes `'stub'`, allowing only `true | false | 'partial'`, in [src/compat/types.ts](/Users/lifeart/Repos/openrv-web/src/compat/types.ts#L82).
  - The published compat docs also tell users that `isSupported` returns only `true | false | 'partial'` and that `getSupportedCommands()` is `Array<[name, true | false | 'partial']>` in [docs/advanced/mu-compat.md](/Users/lifeart/Repos/openrv-web/docs/advanced/mu-compat.md#L37) through [docs/advanced/mu-compat.md#L41) and [docs/advanced/mu-compat.md](/Users/lifeart/Repos/openrv-web/docs/advanced/mu-compat.md#L515) through [docs/advanced/mu-compat.md#L526).
  - The tests lock in the `'stub'` runtime behavior by asserting that `cmd.isSupported('setViewSize')` and `cmd.isSupported('setMargins')` return `'stub'` in [src/compat/__tests__/MuCommands.test.ts](/Users/lifeart/Repos/openrv-web/src/compat/__tests__/MuCommands.test.ts#L449) through [src/compat/__tests__/MuCommands.test.ts#L450) and [src/compat/__tests__/MuCommands.test.ts](/Users/lifeart/Repos/openrv-web/src/compat/__tests__/MuCommands.test.ts#L533) through [src/compat/__tests__/MuCommands.test.ts#L535).
- Impact:
  - Callers using the documented or typed contract can treat `'stub'` as impossible and mis-handle the real runtime result.
  - That makes command introspection unreliable exactly where scripts are supposed to branch around unsupported versus partially supported functionality.

### 556. The generated public API reference under-documents the live event surface by omitting several valid `openrv.events` names

- Severity: Medium
- Area: Public API documentation / scripting events
- Evidence:
  - The live `OpenRVEventName` union includes `sourceLoadingStarted`, `sourceLoadFailed`, `viewTransformChanged`, and `renderedImagesChanged` in [src/api/EventsAPI.ts](/Users/lifeart/Repos/openrv-web/src/api/EventsAPI.ts#L16) through [src/api/EventsAPI.ts#L29), and `getEventNames()` returns the full `VALID_EVENTS` set in [src/api/EventsAPI.ts](/Users/lifeart/Repos/openrv-web/src/api/EventsAPI.ts#L78) through [src/api/EventsAPI.ts#L83) and [src/api/EventsAPI.ts](/Users/lifeart/Repos/openrv-web/src/api/EventsAPI.ts#L199) through [src/api/EventsAPI.ts#L202).
  - The generated API index still documents `OpenRVEventName` as only `"frameChange" | "play" | "pause" | "stop" | "speedChange" | "volumeChange" | "muteChange" | "audioScrubEnabledChange" | "loopModeChange" | "inOutChange" | "markerChange" | "sourceLoaded" | "error"` in [docs/api/index.md](/Users/lifeart/Repos/openrv-web/docs/api/index.md#L46) through [docs/api/index.md#L55).
  - The same generated reference also publishes plugin-visible `app:` events only for that narrower subset in [docs/api/index.md](/Users/lifeart/Repos/openrv-web/docs/api/index.md#L99) through [docs/api/index.md#L115), so the omission propagates into plugin-facing documentation too.
- Impact:
  - Script and plugin authors reading the generated API reference can conclude that several real runtime events do not exist and avoid subscribing to them.
  - That makes the documented scripting surface narrower than the actual shipped API, which is the opposite of the other docs-drift problems already logged.

### 557. The generated API index is full of dead local links because it advertises class/interface pages that do not exist in the shipped docs tree

- Severity: Medium
- Area: API documentation / discoverability
- Evidence:
  - `docs/api/index.md` links to local pages such as `classes/AudioAPI.md`, `classes/OpenRVAPI.md`, and `interfaces/OpenRVEventData.md` in [docs/api/index.md](/Users/lifeart/Repos/openrv-web/docs/api/index.md#L3) through [docs/api/index.md](/Users/lifeart/Repos/openrv-web/docs/api/index.md#L28).
  - The actual docs tree in this checkout contains only a single file, [docs/api/index.md](/Users/lifeart/Repos/openrv-web/docs/api/index.md), with no `docs/api/classes/` or `docs/api/interfaces/` directories.
- Impact:
  - Readers can see a full API table of contents and then immediately hit dead links for most of the advertised reference pages.
  - That makes the generated API area look complete while failing at the first level of navigation.

### 558. Plugin `onApp(...)` subscriptions only cover an older subset of public events, so plugins cannot observe newer `openrv.events` signals through the advertised bridge

- Severity: Medium
- Area: Plugin API / event bridging
- Evidence:
  - The public event layer exposes `sourceLoadingStarted`, `sourceLoadFailed`, `viewTransformChanged`, and `renderedImagesChanged` as valid `OpenRVEventName` values in [src/api/EventsAPI.ts](/Users/lifeart/Repos/openrv-web/src/api/EventsAPI.ts#L16) through [src/api/EventsAPI.ts#L29).
  - `PluginEventBus.AppEventName` and `APP_EVENT_TO_API` only include the older subset through `app:sourceLoaded` plus `app:error`, with no plugin-visible equivalents for those newer events, in [src/plugin/PluginEventBus.ts](/Users/lifeart/Repos/openrv-web/src/plugin/PluginEventBus.ts#L19) through [src/plugin/PluginEventBus.ts#L49) and [src/plugin/PluginEventBus.ts](/Users/lifeart/Repos/openrv-web/src/plugin/PluginEventBus.ts#L79) through [src/plugin/PluginEventBus.ts#L92).
  - Plugin authors are told that `onApp(...)` subscribes to “application events” mapped from the public API surface in [docs/api/index.md](/Users/lifeart/Repos/openrv-web/docs/api/index.md#L92) through [docs/api/index.md](/Users/lifeart/Repos/openrv-web/docs/api/index.md#L115), but the runtime bridge does not actually provide parity with the live `EventsAPI`.
- Impact:
  - A plugin can subscribe to public app-state events only if they happen to be in the reduced plugin bridge subset; newer loading/view/render events are unavailable even though external scripts can subscribe to them directly.
  - That makes plugin automation less observant than plain `window.openrv.events` consumers for no obvious reason.

### 559. The main scripting guide also under-documents the live event surface, so script authors are steered away from valid `openrv.events` subscriptions

- Severity: Medium
- Area: Public API documentation / scripting guide
- Evidence:
  - The live `EventsAPI` exposes `sourceLoadingStarted`, `sourceLoadFailed`, `viewTransformChanged`, and `renderedImagesChanged` in [src/api/EventsAPI.ts](/Users/lifeart/Repos/openrv-web/src/api/EventsAPI.ts#L16) through [src/api/EventsAPI.ts#L32).
  - The “Available Events” table in [docs/advanced/scripting-api.md](/Users/lifeart/Repos/openrv-web/docs/advanced/scripting-api.md#L303) through [docs/advanced/scripting-api.md#L317) lists only the narrower subset ending at `sourceLoaded` and `error`.
  - The same page explicitly tells users to call `openrv.events.getEventNames()` for the available set in [docs/advanced/scripting-api.md](/Users/lifeart/Repos/openrv-web/docs/advanced/scripting-api.md#L298), but the written table still omits several names that `getEventNames()` would return at runtime.
- Impact:
  - Script authors reading the primary scripting guide can conclude that loading-progress, view-transform, and rendered-image events are unavailable when they are actually live.
  - That makes the human-facing guide lag behind the real event API even for users who never consult the generated reference.

### 560. `openrv.dispose()` does not detach the singleton plugin registry, so active plugin contexts keep a dead API/events bridge after disposal

- Severity: Medium
- Area: Public API lifecycle / plugins
- Evidence:
  - `OpenRVAPI.dispose()` only marks the API unready and disposes its own submodules in [src/api/OpenRVAPI.ts](/Users/lifeart/Repos/openrv-web/src/api/OpenRVAPI.ts#L166) through [src/api/OpenRVAPI.ts#L175); it never informs `pluginRegistry`, clears `pluginRegistry.apiRef`, or resets the plugin event bus.
  - The singleton `PluginRegistry` stores both an `apiRef` and a bridged `eventsAPI` reference set during bootstrap in [src/plugin/PluginRegistry.ts](/Users/lifeart/Repos/openrv-web/src/plugin/PluginRegistry.ts#L95) through [src/plugin/PluginRegistry.ts#L109).
  - Plugin contexts expose `context.api` by returning that stored `apiRef` directly in [src/plugin/PluginRegistry.ts](/Users/lifeart/Repos/openrv-web/src/plugin/PluginRegistry.ts#L442) through [src/plugin/PluginRegistry.ts#L445), and app-event subscriptions continue to route through the stored `eventsAPI` in [src/plugin/PluginEventBus.ts](/Users/lifeart/Repos/openrv-web/src/plugin/PluginEventBus.ts#L119) through [src/plugin/PluginEventBus.ts#L120) and [src/plugin/PluginEventBus.ts](/Users/lifeart/Repos/openrv-web/src/plugin/PluginEventBus.ts#L240) through [src/plugin/PluginEventBus.ts#L257).
  - The scripting docs describe `dispose()` as cleaning up the API instance while also presenting plugins as part of the same public surface in [src/api/OpenRVAPI.ts](/Users/lifeart/Repos/openrv-web/src/api/OpenRVAPI.ts#L156) through [src/api/OpenRVAPI.ts#L175) and [docs/advanced/scripting-api.md](/Users/lifeart/Repos/openrv-web/docs/advanced/scripting-api.md#L21) through [docs/advanced/scripting-api.md#L23).
- Impact:
  - After `openrv.dispose()`, already-activated plugins can still hold `context.api` and event subscriptions that point at a disposed API object rather than being torn down or explicitly invalidated.
  - That leaves the plugin layer in a half-alive state where host-side scripting is “disposed” but plugin-side integrations can still try to operate against stale references and fail later at call time.

### 561. Every plugin gets `context.settings`, even without a `settingsSchema`, so the API degrades into a trap object instead of a clearly absent capability

- Severity: Medium
- Area: Plugin API / settings lifecycle
- Evidence:
  - `PluginRegistry.createContext()` injects `settings: registry.settingsStore.createAccessor(manifest.id)` for every plugin with no guard on `manifest.settingsSchema` in [src/plugin/PluginRegistry.ts](/Users/lifeart/Repos/openrv-web/src/plugin/PluginRegistry.ts#L395) through [src/plugin/PluginRegistry.ts#L449).
  - The settings store only registers schemas when `manifest.settingsSchema` exists in [src/plugin/PluginRegistry.ts](/Users/lifeart/Repos/openrv-web/src/plugin/PluginRegistry.ts#L167) through [src/plugin/PluginRegistry.ts#L169).
  - That accessor is only partially usable without a schema: `get()` falls through to `undefined`, `getAll()` returns an empty object, but `set()` throws `No settings schema registered for plugin ...` in [src/plugin/PluginSettingsStore.ts](/Users/lifeart/Repos/openrv-web/src/plugin/PluginSettingsStore.ts#L110) through [src/plugin/PluginSettingsStore.ts#L114), [src/plugin/PluginSettingsStore.ts](/Users/lifeart/Repos/openrv-web/src/plugin/PluginSettingsStore.ts#L129) through [src/plugin/PluginSettingsStore.ts#L131), and [src/plugin/PluginSettingsStore.ts](/Users/lifeart/Repos/openrv-web/src/plugin/PluginSettingsStore.ts#L260) through [src/plugin/PluginSettingsStore.ts#L276).
  - The published API docs describe `context.settings` as requiring a `settingsSchema` in the manifest in [docs/api/index.md](/Users/lifeart/Repos/openrv-web/docs/api/index.md#L129), but the runtime still exposes it unconditionally.
- Impact:
  - Plugin authors can reasonably treat `context.settings` as a supported capability because it is always present, then hit runtime-only failures on first write if their plugin has no schema.
  - That makes the plugin context harder to reason about than either alternative: omitting `settings` entirely when unsupported, or making it fully no-op and explicit.

### 562. The published plugin-settings API still claims `set()` is `void` and always persists, hiding the real success/failure signal from plugin authors

- Severity: Medium
- Area: Plugin API documentation / settings persistence
- Evidence:
  - The real `PluginSettingsAccessor` contract defines `set(key, value): boolean` and documents that it returns `true` when persisted and `false` when the update only landed in memory in [src/plugin/PluginSettingsStore.ts](/Users/lifeart/Repos/openrv-web/src/plugin/PluginSettingsStore.ts#L49) through [src/plugin/PluginSettingsStore.ts#L58).
  - The generated API reference still publishes `set(key: string, value: unknown): void` and says it “persists to localStorage” in [docs/api/index.md](/Users/lifeart/Repos/openrv-web/docs/api/index.md#L136) through [docs/api/index.md#L141).
  - The main scripting guide makes the same unconditional persistence claim and shows `context.settings.set(...)` without any returned status handling in [docs/advanced/scripting-api.md](/Users/lifeart/Repos/openrv-web/docs/advanced/scripting-api.md#L403) through [docs/advanced/scripting-api.md#L443).
  - The runtime already has a real failure mode where settings updates can remain in-memory only, which is why the boolean exists in the first place, as captured in issue `211`.
- Impact:
  - Plugin authors reading the shipped docs can conclude there is no reason to check for persistence failure, even though the live API was explicitly designed to report it.
  - That turns the existing partial-persistence behavior into a documentation trap instead of a documented recovery path.

### 563. The generated API reference is pinned to an old GitHub commit, so its “Defined in” links can disagree with the checked-in source tree

- Severity: Medium
- Area: API documentation / source traceability
- Evidence:
  - The current checkout is at commit `947e3067bd8fb58079981ef7fc78d98ca117799f`.
  - `docs/api/index.md` still points every “Defined in” source link at GitHub blob `c0dd53144dcb872c686e6581e476322380198403`, for example in [docs/api/index.md](/Users/lifeart/Repos/openrv-web/docs/api/index.md#L40) through [docs/api/index.md](/Users/lifeart/Repos/openrv-web/docs/api/index.md#L50) and [docs/api/index.md](/Users/lifeart/Repos/openrv-web/docs/api/index.md#L131) through [docs/api/index.md#L162).
  - The same generated page is already drifting from the live tree in content, such as the stale `OpenRVEventName` union documented there versus the current source, as captured in issue `556`.
- Impact:
  - A reader following the generated reference can land on a different historical version of the code than the one actually shipped in the repo.
  - That makes the API docs harder to audit and amplifies other documentation drift because the linked source is itself frozen at an older snapshot.

### 564. The public marker API accepts non-integer frame numbers and stores them verbatim, so scripted markers can drift off the real playback frame grid

- Severity: Medium
- Area: Public API / markers / frame semantics
- Evidence:
  - `MarkersAPI.add()` validates only that `frame` is a positive number, then forwards it unchanged to `session.setMarker(...)` in [src/api/MarkersAPI.ts](/Users/lifeart/Repos/openrv-web/src/api/MarkersAPI.ts#L40) through [src/api/MarkersAPI.ts#L63).
  - The live session path also preserves that raw numeric value with no integer coercion in [src/core/session/SessionAnnotations.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionAnnotations.ts#L87) through [src/core/session/SessionAnnotations.ts#L88) and [src/core/session/MarkerManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/MarkerManager.ts#L132) through [src/core/session/MarkerManager.ts#L141).
  - Marker navigation then feeds that stored value back into playback via `this.currentFrame = frame` in [src/core/session/Session.ts](/Users/lifeart/Repos/openrv-web/src/core/session/Session.ts#L928) through [src/core/session/Session.ts#L940), while playback itself rounds frames to integers in [src/core/session/PlaybackEngine.ts](/Users/lifeart/Repos/openrv-web/src/core/session/PlaybackEngine.ts#L220) through [src/core/session/PlaybackEngine.ts#L228).
  - Even the current unit test name claims float input “rounds down,” but the assertion proves the opposite by expecting raw `10.7` to be forwarded in [src/api/OpenRVAPI.test.ts](/Users/lifeart/Repos/openrv-web/src/api/OpenRVAPI.test.ts#L1469) through [src/api/OpenRVAPI.test.ts#L1471).
- Impact:
  - A script can create markers at fractional frames that the viewer can never actually hold as a playback position, so readback and navigation semantics diverge.
  - That makes marker automation unreliable at the API boundary: `get(10)` and playback on frame `11` can disagree with a stored marker at `10.7`, even though the app is otherwise integer-frame based.

### 565. The public loop-range API also accepts fractional frame numbers and preserves them as live in/out points, even though playback itself is integer-frame based

- Severity: Medium
- Area: Public API / playback range semantics
- Evidence:
  - `LoopAPI.setInPoint()` and `setOutPoint()` only reject non-numbers and `NaN`, then forward the raw value to the session in [src/api/LoopAPI.ts](/Users/lifeart/Repos/openrv-web/src/api/LoopAPI.ts#L60) through [src/api/LoopAPI.ts#L92).
  - The underlying playback engine clamps those values to bounds but does not round them to whole frames in [src/core/session/PlaybackEngine.ts](/Users/lifeart/Repos/openrv-web/src/core/session/PlaybackEngine.ts#L689) through [src/core/session/PlaybackEngine.ts#L708).
  - Those fractional in/out points are then emitted back out through `inOutChanged` and reused directly by playback-range logic in [src/core/session/PlaybackEngine.ts](/Users/lifeart/Repos/openrv-web/src/core/session/PlaybackEngine.ts#L299), [src/core/session/PlaybackEngine.ts](/Users/lifeart/Repos/openrv-web/src/core/session/PlaybackEngine.ts#L769) through [src/core/session/PlaybackEngine.ts#L770), and [src/core/session/PlaybackTimingController.ts](/Users/lifeart/Repos/openrv-web/src/core/session/PlaybackTimingController.ts#L363) through [src/core/session/PlaybackTimingController.ts#L385).
  - Actual frame positions are still rounded to integers by the playback engine in [src/core/session/PlaybackEngine.ts](/Users/lifeart/Repos/openrv-web/src/core/session/PlaybackEngine.ts#L220) through [src/core/session/PlaybackEngine.ts#L228), and the public docs describe in/out points as 1-based frame numbers in [src/api/LoopAPI.ts](/Users/lifeart/Repos/openrv-web/src/api/LoopAPI.ts#L53) through [src/api/LoopAPI.ts#L83).
- Impact:
  - Scripts can put the app into fractional playback ranges like `10.7-50.2`, which the viewer cannot actually display as discrete frames but the timing logic still treats as real boundaries.
  - That makes range events and playback behavior semantically inconsistent at the API boundary, especially for looping, boundary checks, and exported/public in-out state.

### 569. `openrv.markers.add()` accepts non-finite `frame` and `endFrame`, and the marker subsystem stores them as live marker state

- Severity: Medium
- Area: Public API / markers
- Evidence:
  - `MarkersAPI.add()` rejects only non-numbers, `NaN`, and frames `< 1`, so `Infinity` still passes for both `frame` and `endFrame` in [src/api/MarkersAPI.ts](/Users/lifeart/Repos/openrv-web/src/api/MarkersAPI.ts#L44) through [src/api/MarkersAPI.ts#L63).
  - The core marker manager does not sanitize those values; it stores `frame` as the map key and preserves any `endFrame > frame` verbatim in [src/core/session/MarkerManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/MarkerManager.ts#L132) through [src/core/session/MarkerManager.ts#L142).
  - Marker queries then operate on those raw values. `getMarkerAtFrame()` treats any frame `<= marker.endFrame`, so a marker with `endFrame = Infinity` becomes an effectively unbounded range in [src/core/session/MarkerManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/MarkerManager.ts#L95) through [src/core/session/MarkerManager.ts#L103).
  - The public readback path also returns marker frames/end frames unchanged in [src/api/MarkersAPI.ts](/Users/lifeart/Repos/openrv-web/src/api/MarkersAPI.ts#L96) through [src/api/MarkersAPI.ts#L110).
  - Current API tests cover `NaN`, zero, negatives, and normal floats, but they do not defend against non-finite marker positions in [src/api/OpenRVAPI.test.ts](/Users/lifeart/Repos/openrv-web/src/api/OpenRVAPI.test.ts#L1368) through [src/api/OpenRVAPI.test.ts#L1511).
- Impact:
  - A script can create an infinite-range marker or an `Infinity`-position marker with one public API call, and that malformed state is then visible through `get()`, `getAll()`, and `markerChange`.
  - Once such a marker exists, marker-hit testing and range semantics stop matching the app’s integer frame model, which can confuse automation and any UI or export path that assumes finite frame boundaries.

### 570. `openrv.color.setAdjustments()` silently ignores or resets invalid numeric values instead of rejecting them

- Severity: Medium
- Area: Public API / color adjustments
- Evidence:
  - `ColorAPI.setAdjustments()` only validates that the outer argument is an object. Per-field numeric values are accepted whenever they are `typeof number` and not `NaN`, so `Infinity` still passes the API boundary while `NaN` is just skipped without an error in [src/api/ColorAPI.ts](/Users/lifeart/Repos/openrv-web/src/api/ColorAPI.ts#L93) through [src/api/ColorAPI.ts](/Users/lifeart/Repos/openrv-web/src/api/ColorAPI.ts#L127).
  - The downstream control layer then rewrites non-finite numbers back to defaults instead of surfacing an error, in [src/ui/components/ColorControls.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/ColorControls.ts#L746) through [src/ui/components/ColorControls.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/ColorControls.ts#L755).
  - The current tests explicitly lock in that behavior: `setAdjustments({ exposure: NaN, gamma: 2 })` keeps `gamma` and silently ignores the bad `exposure`, and `ColorControls` tests expect `Infinity` to fall back to defaults in [src/api/OpenRVAPI.test.ts](/Users/lifeart/Repos/openrv-web/src/api/OpenRVAPI.test.ts#L1212) through [src/api/OpenRVAPI.test.ts](/Users/lifeart/Repos/openrv-web/src/api/OpenRVAPI.test.ts#L1217) and [src/ui/components/ColorControls.test.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/ColorControls.test.ts#L101) through [src/ui/components/ColorControls.test.ts#L108).
- Impact:
  - A script can send malformed primary-adjustment values and get a partial success with no exception, which makes automation bugs harder to notice than they should be.
  - The public color API becomes internally inconsistent: primary adjustments silently normalize bad values, while neighboring setters like `setCDL()` are framed as validation-based APIs.

## Validation Notes

- `pnpm typecheck`: passed
- `pnpm lint`: failed
- `pnpm build`: failed under the current `pnpm` Node runtime
- Targeted Chromium init/layout/mobile checks: passed
- Smoke subset: reproduced `WORKFLOW-001`, `HG-E002`, and `HG-E003`
- Browser spot-check: pressing `G` in QC opens goto-frame instead of the gamut diagram
- Browser spot-check: `Shift+R` / `Shift+B` / `Shift+N` do not activate red / blue / none channel selection
- Browser spot-check: `Shift+L` on Color opens the LUT pipeline panel instead of switching to luminance
- Browser spot-check: `Shift+G` and `Shift+A` still work, so the channel shortcut breakage is selective rather than universal
- Isolated reruns of `CS-030`, `EXR-011`, and `SEQ-012`: passed
