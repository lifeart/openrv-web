# Session Graph Model / Session Manager Implementation Plan

## 1. Overview

This plan designs a **Session Manager** -- a new subsystem that exposes the
internal node graph to the user, provides a tree-view panel for browsing and
manipulating it, supports drag-and-drop reordering of sources within group
nodes, maintains a view-history navigation stack, and persists the full graph
topology into `.orvproject` files.

### Goals

1. Surface the existing `Graph` / `IPNode` DAG as a user-visible tree.
2. Add a **Session Manager Panel** in the right-side panel area with tree view,
   context menus, and drag-and-drop reordering.
3. Implement **view history navigation** (back/forward through viewed nodes).
4. Serialize and deserialize the full graph topology in `.orvproject` files.
5. Maintain backward compatibility -- existing sessions without graph data
   continue to work.

### Non-Goals (out of scope for this plan)

- Full node-graph visual editor (node-wire canvas).
- GPU-side compositing rewrite.
- OCIO node pipeline editor.
- Inline property editing in the tree panel (deferred to a future plan; group
  node properties such as blend mode, active index, and playback speed will be
  edited via existing UI controls until then).
- Cut/copy/paste of nodes between sessions (future plan).
- Multi-selection and batch operations (future plan -- Shift+click for range,
  Cmd/Ctrl+click for toggle).

---

## 2. Current State

### 2.1 Graph Infrastructure (solid, reusable)

| File | Role |
|------|------|
| `src/core/graph/Graph.ts` | DAG container with cycle detection, topological sort, `evaluate()`, `toJSON()` |
| `src/core/graph/Signal.ts` | Reactive signal primitive (`connect` / `emit` / `disconnectAll`) |
| `src/core/graph/Property.ts` | `Property<T>` with keyframe animation, `PropertyContainer` with persistence |
| `src/nodes/base/IPNode.ts` | Abstract node base: id, type, name, inputs/outputs, dirty propagation, `evaluate()` |
| `src/nodes/base/NodeFactory.ts` | `@RegisterNode` decorator, singleton factory |

### 2.2 Group Nodes (all five types exist)

| File | Type | Behavior |
|------|------|----------|
| `src/nodes/groups/BaseGroupNode.ts` | Abstract | `getActiveInputIndex()` + passthrough `process()` |
| `src/nodes/groups/SequenceGroupNode.ts` | `RVSequenceGroup` | Plays inputs sequentially; EDL support |
| `src/nodes/groups/StackGroupNode.ts` | `RVStackGroup` | Multi-layer compositing with blend modes, wipe |
| `src/nodes/groups/LayoutGroupNode.ts` | `RVLayoutGroup` | Tiled grid rendering |
| `src/nodes/groups/SwitchGroupNode.ts` | `RVSwitchGroup` | A/B switch |
| `src/nodes/groups/RetimeGroupNode.ts` | `RVRetimeGroup` | Speed ramp, reverse, explicit frame mapping |

### 2.3 Source Nodes

| File | Type |
|------|------|
| `src/nodes/sources/BaseSourceNode.ts` | Abstract (no inputs allowed) |
| `src/nodes/sources/FileSourceNode.ts` | `RVFileSource` -- single image |
| `src/nodes/sources/VideoSourceNode.ts` | `RVVideoSource` -- video via mediabunny |
| `src/nodes/sources/SequenceSourceNode.ts` | `RVSequenceSource` -- image sequence |
| `src/nodes/sources/ProceduralSourceNode.ts` | `RVMovieProc` -- generated test patterns |

### 2.4 Session Layer

| File | Role |
|------|------|
| `src/core/session/Session.ts` | Central session object; owns media, playback, annotations. `MediaSource[]` flat array |
| `src/core/session/SessionGraph.ts` | Owns `Graph`, loads from GTO via `GTOGraphLoader`. Emits `graphLoaded`, `sessionLoaded` |
| `src/core/session/SessionMedia.ts` | Flat `MediaSource[]` array, source loading, A/B switching |
| `src/core/session/GTOGraphLoader.ts` | Parses GTODTO into `Graph` with `IPNode` instances and connections |
| `src/core/session/SessionSerializer.ts` | `.orvproject` save/load. Currently serializes `MediaReference[]` (flat list, no graph) |
| `src/core/session/SessionState.ts` | `SessionState` interface for `.orvproject` schema |

### 2.5 UI Panels (patterns to follow)

| File | Pattern |
|------|---------|
| `src/ui/components/PlaylistPanel.ts` | Fixed-position panel, drag-and-drop clip reordering, `EventEmitter` events |
| `src/ui/components/StackControl.ts` | Draggable layer list with `dragstart`/`dragover`/`drop` handlers, `moveLayer()` |
| `src/ui/components/HistoryPanel.ts` | Incremental DOM render, `show`/`hide`/`toggle`, event-driven refresh |
| `src/ui/components/shared/Panel.ts` | `createPanel()` factory with outside-click close, anchor positioning, focus management |
| `src/ui/layout/panels/LeftPanelContent.ts` | `CollapsibleSection` based layout |

### 2.6 Gaps

1. **No Session Manager panel** -- the graph is invisible to the user.
2. **No view history** -- no back/forward navigation through viewed nodes.
3. **`.orvproject` does not persist graph topology** -- only flat `MediaReference[]`.
4. **`SessionMedia` is disconnected from the graph** -- sources are a flat array
   with no link to `IPNode` instances or group membership.
5. **No runtime API to mutate the graph from UI** -- `Graph` supports add/remove/connect
   but there is no higher-level "session manager" orchestrating user actions.
6. **`clearGraphData()` nullifies the graph** -- `SessionMedia.loadFile()` and
   related methods call `host.clearGraphData()` which sets `SessionGraph._graph = null`.
   This is fundamentally incompatible with a persistent session manager that holds
   graph references. This must be resolved before implementation (see Section 9.7).

### 2.7 Existing Infrastructure Notes

- **`MediaSource` already has node references.** The `MediaSource` interface
  already has `videoSourceNode?: VideoSourceNode` and `fileSourceNode?: FileSourceNode`
  fields. The media-graph bridge should use these existing references rather
  than adding a redundant `sourceNodeId` field. A generic `graphNodeId?: string`
  field may be added for the session manager's bookkeeping only if the existing
  references are insufficient.
- **`Graph.toJSON()` already exists** (line 159-171 of `Graph.ts`). It serializes
  nodes and the output node. The `SerializedGraph` format used by the session
  manager must either enhance `Graph.toJSON()` directly or clearly document why
  a separate format is needed (see Section 4.3).
- **Services use the `setHost()` pattern** -- `SessionGraph.setHost()`,
  `SessionMedia.setHost()`, etc. `SessionManager` should follow the same pattern
  for consistency rather than direct constructor injection.
- **`NodeFactory.create()` calls the zero-arg constructor** via the `@RegisterNode`
  decorator. Node names and properties must be set after creation. This works
  because `IPNode.name` has a setter, but any node type requiring constructor
  arguments beyond `name` would break this pattern. This is a known limitation.

---

## 3. Proposed Architecture

### 3.1 Layer Diagram

```
 UI Layer
 +----------------------------------+
 | SessionManagerPanel              |  <-- NEW: tree view, drag-drop, context menu
 |   TreeView (collapsible nodes)   |
 |   ViewHistoryBar (back/forward)  |
 +----------------------------------+
          |  events
          v
 Service Layer
 +----------------------------------+
 | SessionManager                   |  <-- NEW: orchestrator
 |   - mutateGraph()                |
 |   - ViewHistory (back/forward)   |
 |   - viewNodeId (separate from    |
 |     graph output node)           |
 |   - bridgeMediaToGraph()         |
 +----------------------------------+
          |
          v
 Core Layer (existing, extended)
 +----------------------------------+
 | SessionGraph (owns Graph)        |
 | Graph (DAG, evaluate)            |
 | IPNode / BaseGroupNode           |
 | SessionSerializer (+ graph data) |
 +----------------------------------+
```

### 3.2 Key Design Decisions

1. **SessionManager class** -- a new service object that sits between the UI
   panel and the core `SessionGraph`. It provides a safe, validated API for
   graph mutations (add source to group, reorder inputs, change active view
   node, etc.) and maintains the view history stack. It follows the existing
   `setHost()` callback pattern used by other session services for consistency.

2. **View node is separate from output node.** The `SessionManager` maintains
   its own `_viewNodeId` that is independent of `Graph.setOutputNode()`. The
   renderer evaluates the view node rather than the output node. This allows
   users to "solo" any node in the graph for inspection without restructuring
   the graph -- a fundamental workflow in VFX review. Navigation back/forward
   traverses the view history without requiring undo.

3. **Tree model** -- the panel renders a tree derived from the graph. Group
   nodes are expandable parents; source/effect nodes are leaves. The tree is
   rebuilt on `Graph.nodeAdded` / `Graph.nodeRemoved` / `Graph.connectionChanged`
   signals. The tree model includes all connected components in the graph, not
   just the subgraph reachable from the output node (to handle disconnected
   graphs gracefully). Effect/transform nodes from GTO imports (`RVColor`,
   `RVTransform2D`, `RVLensWarp`) that are not yet modeled as graph nodes are
   displayed as grayed-out informational entries under their parent source.

4. **Media-graph bridge** -- when a user loads a file via `SessionMedia`, a
   corresponding `FileSourceNode` / `VideoSourceNode` is created and added to
   the graph. The bridge uses the existing `MediaSource.fileSourceNode` /
   `MediaSource.videoSourceNode` references rather than adding a redundant ID
   field. The bridge is bidirectional: removing a source node from the graph
   removes the `MediaSource` from the flat array, and vice versa.

5. **Deferred group creation.** A fresh session does not create a group node
   when only a single source is loaded. The single source acts as the root/view
   node directly. When a second source is loaded, a default `RVSequenceGroup`
   is created to wrap both sources (matching OpenRV convention). This avoids the
   semantic oddity of a single image inside a sequence group, which would confuse
   web-only users.

6. **View history** -- a bounded stack of `{ nodeId, timestamp }` entries.
   Navigating to a node means setting the `_viewNodeId` and having the renderer
   evaluate that node. Back/forward buttons traverse the stack. Node names are
   resolved at display time from the live graph, not stored in history entries
   (to avoid stale names after renames).

7. **Serialization** -- extend `SessionState` with an optional `graph` field
   containing the serialized topology (node list + connections). The serialized
   format either enhances `Graph.toJSON()` or clearly wraps it with additional
   metadata (view node ID, version). On load, the serializer reconstructs the
   graph before loading media.

8. **Signal subscription lifecycle.** `SessionManager` subscribes to `Graph`
   signals (`nodeAdded`, `nodeRemoved`, `connectionChanged`) and translates them
   into `EventEmitter` events for the UI layer. All `Signal.connect()` return
   values (unsubscribe functions) are stored and called in `SessionManager.dispose()`
   to prevent subscription leaks.

9. **Cross-group drag requires modifier key.** Within-group reordering is the
   default drag behavior. Moving a node from one group to another requires
   holding the Alt key (or Shift on macOS). This prevents accidental cross-group
   moves that could silently break compositing pipelines.

---

## 4. Data Model

### 4.1 SessionManager

```typescript
// src/core/session/SessionManager.ts

export interface ViewHistoryEntry {
  nodeId: string;
  timestamp: number;
  // NOTE: nodeName is NOT stored here. It is resolved at display time
  // from the live graph to avoid stale names after renames.
}

export interface SessionManagerEvents extends EventMap {
  viewNodeChanged: { nodeId: string };
  graphStructureChanged: void;
  viewHistoryChanged: { canGoBack: boolean; canGoForward: boolean };
}

export class SessionManager extends EventEmitter<SessionManagerEvents> {
  private _sessionGraph: SessionGraph;
  private _media: SessionMedia;
  private _viewHistory: ViewHistory;
  private _viewNodeId: string | null = null; // separate from graph output node
  private _signalUnsubscribers: (() => void)[] = [];

  // --- Lifecycle ---
  setHost(host: SessionHost): void;
  dispose(): void; // disconnects all Signal subscriptions

  // --- View Node (independent of graph output) ---
  /** Sets the node to view/evaluate. Does NOT change graph.outputNode. */
  setViewNode(nodeId: string): void;
  getViewNodeId(): string | null;

  // --- View History ---
  goBack(): void;
  goForward(): void;
  get canGoBack(): boolean;
  get canGoForward(): boolean;

  // --- Graph Mutation API ---
  addSourceToGroup(sourceNodeId: string, groupNodeId: string, index?: number): void;
  removeSourceFromGroup(sourceNodeId: string, groupNodeId: string): void;
  reorderGroupInput(groupNodeId: string, fromIndex: number, toIndex: number): void;
  createGroup(type: GroupNodeType, inputNodeIds: string[]): IPNode;
  /**
   * Deletes a node from the graph.
   * - If the node is a source: disconnects from parent group(s) and removes.
   * - If the node is a group: presents three options via callback/event:
   *   (a) delete group and all children recursively,
   *   (b) re-parent children to the group's parent, or
   *   (c) orphan children as independent roots.
   *   The caller (UI layer) is responsible for prompting the user.
   */
  deleteNode(nodeId: string, cascadeMode: 'delete-children' | 'reparent' | 'orphan'): void;
  renameNode(nodeId: string, name: string): void;

  // --- Media Bridge ---
  onMediaSourceLoaded(source: MediaSource): IPNode;
  /**
   * Syncs existing MediaSource entries into the graph on session load.
   * Called after GTO import or project deserialization.
   * Skips sources that already have a graph node (via fileSourceNode/videoSourceNode).
   */
  syncMediaToGraph(): void;

  // --- Tree Model ---
  /**
   * Returns a tree of all connected components in the graph.
   * Includes orphan nodes not reachable from the output node.
   */
  getTreeModel(): TreeNode[];

  // --- Serialization ---
  toSerializedGraph(): SerializedGraph;
  fromSerializedGraph(data: SerializedGraph): void;
}
```

### 4.2 Tree Model (view layer data)

```typescript
// src/core/session/SessionManagerTypes.ts

export type GroupNodeType =
  | 'RVSequenceGroup'
  | 'RVStackGroup'
  | 'RVSwitchGroup'
  | 'RVLayoutGroup'
  | 'RVRetimeGroup';

export interface TreeNode {
  id: string;
  name: string;
  type: string;
  /** True for group nodes that can contain children */
  isGroup: boolean;
  /** Child nodes (inputs to a group node) */
  children: TreeNode[];
  /** True if this is the current view node */
  isViewNode: boolean;
  /** Depth in the tree (0 = root). Derivable but included as convenience. */
  depth: number;
  /** Reference to the underlying IPNode */
  nodeRef: IPNode;
  // NOTE: `expanded` is NOT stored here. Expand/collapse state lives in the
  // panel's Map<string, boolean> to avoid coupling service-layer data to
  // view-layer state.
}
```

### 4.3 Serialized Graph (for `.orvproject`)

The `SerializedGraph` format enhances rather than duplicates `Graph.toJSON()`.
If `Graph.toJSON()` can be extended to produce the needed structure, it should
be used directly. Otherwise, `SessionManager.toSerializedGraph()` wraps the
output of `Graph.toJSON()` with additional metadata (view node ID, version).
The relationship between the two must be documented in code comments.

```typescript
// Extension to SessionState (src/core/session/SessionState.ts)

export interface SerializedGraphNode {
  id: string;
  type: string;
  name: string;
  /** Persistent properties only (use PropertyContainer.toPersistentJSON()) */
  properties: Record<string, unknown>;
  /**
   * IDs of input nodes (order matters for group nodes).
   * If an inputId references a node that was not successfully deserialized
   * (e.g., unknown node type), that slot is skipped and a warning is logged.
   */
  inputIds: string[];
}

export interface SerializedGraph {
  /** Version for graph schema migration (starts at 1) */
  version: number;
  /** All nodes in the graph */
  nodes: SerializedGraphNode[];
  /** ID of the root/output node */
  outputNodeId: string | null;
  /** ID of the currently viewed node (independent of output) */
  viewNodeId: string | null;
}

// Extend SessionState:
export interface SessionState {
  // ... existing fields ...
  /** Node graph topology (optional, absent in legacy projects) */
  graph?: SerializedGraph;
}
```

### 4.4 View History

```typescript
// src/core/session/ViewHistory.ts

export class ViewHistory {
  private entries: ViewHistoryEntry[] = [];
  private index = -1;
  private maxSize: number;

  constructor(maxSize = 50) { this.maxSize = maxSize; }

  push(entry: ViewHistoryEntry): void;
  back(): ViewHistoryEntry | null;
  forward(): ViewHistoryEntry | null;
  current(): ViewHistoryEntry | null;
  get canGoBack(): boolean;
  get canGoForward(): boolean;
  clear(): void;
  toJSON(): ViewHistoryEntry[];
  fromJSON(entries: ViewHistoryEntry[]): void;
}
```

### 4.5 Node ID Management

Node IDs generated by the `IPNode` constructor use a module-level counter
(`${type}_${++nodeIdCounter}`). When deserializing a `SerializedGraph`, IDs
from the file may conflict with IDs generated during the current session.

**Strategy:** `fromSerializedGraph()` uses the serialized IDs directly. After
deserialization, the module-level `nodeIdCounter` is reset to
`max(all existing node ID suffixes) + 1` to prevent collisions with
subsequently created nodes. A utility function `resetNodeIdCounter(minValue)`
must be added to `IPNode.ts` (or the counter module) for this purpose.

---

## 5. UI Design

### 5.1 Session Manager Panel

The panel is a **floating overlay** (same pattern as `PlaylistPanel` and
`HistoryPanel`), not a docked `CollapsibleSection`. This matches the complexity
of its interactions. It is toggled via a toolbar button in `createPanelControls.ts`
using a "hierarchy" or "node-tree" icon, with tooltip text "Session Manager"
and keyboard shortcut displayed.

```
+----------------------------------------------+
| Session Manager                          [x] |
|----------------------------------------------|
| [<] [>]  View: Main Sequence                 |
|----------------------------------------------|
| [filter...                              ]    |
|----------------------------------------------|
|  v  [seq] RVSequenceGroup "Main Sequence" [S] [...]  |
|     |-- [img] RVFileSource "shot_001.exr"  [S] [...]  |
|     |-- [ret] RVRetimeGroup "Slow Mo"      [S] [...]  |
|     |   |-- [vid] RVVideoSource "clip.mp4" [S] [...]  |
|     |-- [stk] RVStackGroup "Comp"          [S] [...]  |
|     |   |-- [img] RVFileSource "bg.exr"    [S] [...]  |
|     |   |-- [img] RVFileSource "fg.exr"    [S] [...]  |
|     |-- [img] RVFileSource "shot_003.exr"  [S] [...]  |
|----------------------------------------------|
| 5 nodes | View: Main Sequence                 |
+----------------------------------------------+
```

**Legend:**
- `[seq]`, `[img]`, `[vid]`, `[ret]`, `[stk]` = node type icons
- `[S]` = solo/isolate button (sets view node to this node for quick inspection)
- `[...]` = context menu button (also accessible via right-click)

**Icon set (6-8 icons needed):**

| Icon | Node Type |
|------|-----------|
| Image/photo | `RVFileSource` |
| Film strip | `RVVideoSource` |
| Image stack | `RVSequenceSource` |
| Waveform/pattern | `RVMovieProc` |
| Numbered list / timeline | `RVSequenceGroup` |
| Layers | `RVStackGroup` |
| Grid | `RVLayoutGroup` |
| A/B toggle | `RVSwitchGroup` |
| Clock/speed | `RVRetimeGroup` |

**Tree item features:**
- Expand/collapse chevron for group nodes.
- Node type icon (see table above).
- Drag handle for reordering within a group (same pattern as `StackControl`).
- Solo button `[S]` per node: sets the view node to that node for quick
  inspection without changing the graph structure.
- Context menu `[...]` button with actions: Rename, Delete, Set as View,
  Change Group Type, Add to Group, Move Up, Move Down.
- Context menu is also triggered by **right-click** on the tree item.
- Active/view node highlighted with `var(--accent-primary)`, ensuring WCAG 2.1
  AA contrast ratio (4.5:1 for text, 3:1 for UI components) against the panel
  background.
- Source nodes show file name; group nodes show type + custom name.
- Depth-based indentation (16px per level), capped at 5 levels. For deeper
  nesting, the tree uses horizontal scrolling.
- Hover tooltips show metadata: resolution, duration, format for sources;
  input count, type-specific info (blend mode, total duration) for groups.

### 5.2 View History Bar

A compact toolbar row at the top of the panel:
- Back button `[<]` -- disabled when `canGoBack` is false.
- Forward button `[>]` -- disabled when `canGoForward` is false.
- Label showing current view node name (resolved from live graph).
- When the view node changes, an `aria-live="polite"` region announces the
  new view node name for screen readers.

### 5.3 Filter/Search

A text input at the top of the tree (below the view history bar) that filters
visible nodes by name. Matching nodes and their ancestor chain remain visible;
non-matching nodes are hidden. Standard type-to-search behavior.

### 5.4 Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Alt+[` | View history back |
| `Alt+]` | View history forward |
| `F2` (when panel focused) | Rename selected node |
| `Delete` (when panel focused) | Delete selected node (with confirmation) |
| `Alt+Up` (when panel focused) | Move selected node up within its group |
| `Alt+Down` (when panel focused) | Move selected node down within its group |

Note: F2 is a supplementary shortcut. Double-click on the name label is the
primary rename gesture (more discoverable, works across platforms including
macOS where F2 may be mapped to brightness).

### 5.5 Drag-and-Drop Behavior

Follows the established pattern from `StackControl.ts` and `PlaylistPanel.ts`:

1. `dragstart`: set `dataTransfer` with source node id; set opacity to 0.5.
2. `dragover`: `preventDefault()`; show drop indicator (top border highlight).
3. `dragleave`: remove drop indicator.
4. `drop`: call `SessionManager.reorderGroupInput()` for within-group reordering.
5. `dragend`: restore opacity; clear all drop indicators.

**Cross-group drag:** Moving a node from one group to another requires holding
the **Alt key** (detected via `event.altKey` in the `drop` handler). Without
the modifier, cross-group drops are rejected with a brief visual indicator
("Hold Alt to move between groups"). When Alt is held, the node is disconnected
from the source group and connected as an input to the target group. Cycle
detection in `Graph.connect()` prevents invalid moves.

**Concurrent modification guard:** If a `graphStructureChanged` event fires
during an active drag operation (e.g., because `SessionMedia` loaded a new
file), the tree rebuild is **deferred** until the drag completes (`dragend`).
A `_isDragging` flag on the panel gates tree re-renders.

### 5.6 Accessibility

- Tree items use `role="treeitem"`, `aria-expanded`, `aria-level`.
- Container uses `role="tree"`.
- Full WAI-ARIA TreeView keyboard interaction model:
  - Up/Down: move between visible items.
  - Right: expand a collapsed node or move to first child.
  - Left: collapse an expanded node or move to parent.
  - Home/End: go to first/last visible item.
  - Enter: activate (set as view node).
  - Space: toggle expand/collapse.
- **Keyboard alternative for drag-and-drop:** "Move Up" / "Move Down" actions
  are available in the context menu and via Alt+Up / Alt+Down shortcuts.
- Focus management: when the panel opens, focus moves to it. When it closes,
  focus returns to the element that triggered it (using existing `createPanel()`
  focus management from `src/ui/components/shared/Panel.ts`).
- `aria-live="polite"` region announces view node changes.
- Active/view node highlight uses `var(--accent-primary)` with verified WCAG
  2.1 AA contrast ratios.

---

## 6. Implementation Steps

### Phase 1: Core SessionManager (no UI)

**Step 1.1 -- ViewHistory class**
- Create `src/core/session/ViewHistory.ts`.
- Implement push, back, forward, clear, serialization.
- `ViewHistoryEntry` contains only `nodeId` and `timestamp` (no `nodeName`).
- Write tests in `src/core/session/ViewHistory.test.ts`.

**Step 1.2 -- SessionManagerTypes**
- Create `src/core/session/SessionManagerTypes.ts` with `TreeNode`,
  `SerializedGraph`, `SerializedGraphNode`, `GroupNodeType` interfaces.
- `TreeNode` must NOT include `expanded` (that is view-layer state).

**Step 1.3 -- Address `clearGraphData()` conflict**
- Modify `SessionMedia` / `SessionGraph` so that `clearGraphData()` does not
  silently nullify the graph when a `SessionManager` is active. Two approaches:
  - (a) `clearGraphData()` notifies `SessionManager` first, which clears its
    own state and detaches signal subscriptions. Then the graph is nullified.
    On re-creation of the graph, `SessionManager` re-subscribes.
  - (b) Replace the "nuke and rebuild" pattern with a "clear nodes from graph"
    approach that preserves the `Graph` instance and its identity.
- Approach (a) is recommended for minimizing changes to existing code. The
  `SessionManager.onGraphCleared()` method handles the notification.
- Write tests to verify that loading a new file while the session manager is
  active does not cause stale-reference errors.

**Step 1.4 -- SessionManager class**
- Create `src/core/session/SessionManager.ts`.
- Use `setHost()` pattern (not direct constructor injection) for consistency
  with `SessionGraph`, `SessionMedia`, etc.
- Implement graph mutation methods (add, remove, reorder, rename).
  - `reorderGroupInput()` must emit `inputsChanged` on the `IPNode` and
    `connectionChanged` (or a new `connectionReordered`) signal on the `Graph`.
  - `deleteNode()` accepts a `cascadeMode` parameter specifying how children
    of a deleted group are handled.
- Implement `getTreeModel()` that walks all connected components of the graph
  (not just the output node's subgraph) and builds a `TreeNode[]` tree.
- Implement `setViewNode()` that updates `_viewNodeId` WITHOUT calling
  `Graph.setOutputNode()`. The renderer evaluates the view node.
- Implement `goBack()`, `goForward()` using `ViewHistory`.
- Subscribe to `Graph.nodeAdded`, `Graph.nodeRemoved`, `Graph.connectionChanged`
  signals. Store unsubscribe functions in `_signalUnsubscribers`. Re-emit as
  `graphStructureChanged` EventEmitter event, **debounced via
  `requestAnimationFrame`** to batch rapid structural changes (e.g., loading
  50 sources at once).
- Implement `dispose()` that calls all stored unsubscribe functions.
- Write tests in `src/core/session/SessionManager.test.ts`.

**Step 1.5 -- Node ID counter management**
- Add `resetNodeIdCounter(minValue: number)` utility to `IPNode.ts` (or its
  counter module).
- Used by `fromSerializedGraph()` to prevent ID collisions after deserialization.
- Write tests verifying no collisions after deserialize + create new node.

**Step 1.6 -- Media-Graph Bridge**
- Add `onMediaSourceLoaded()` to `SessionManager`: creates an `IPNode` for the
  loaded `MediaSource` and adds it to the graph.
- If only one source exists, it is the root/view node (no group created yet).
- When a second source is loaded, create a default `RVSequenceGroup` as root
  and wrap both sources.
- Wire `SessionMedia.on('sourceLoaded')` to `SessionManager.onMediaSourceLoaded()`.
- Use existing `MediaSource.fileSourceNode` / `MediaSource.videoSourceNode`
  references to link media entries to graph nodes (no new `sourceNodeId` field).
- Implement `syncMediaToGraph()`: syncs existing `MediaSource` entries into the
  graph on session load. Skips sources that already have a graph node.
- **GTO import guard:** When `SessionGraph.loadFromGTO()` completes, it calls
  `loadVideoSourcesFromGraph()` which adds `MediaSource` entries. If
  `SessionManager` is also listening for media additions via `onMediaSourceLoaded()`,
  sources could be processed twice. Resolution: `onMediaSourceLoaded()` checks
  if the source's node already exists in the graph (via `fileSourceNode` /
  `videoSourceNode`) and skips it if so.

### Phase 2: Serialization

**Step 2.1 -- Graph serialization**
- Evaluate whether `Graph.toJSON()` can be enhanced to produce `SerializedGraph`
  directly. If so, extend it. If `Graph.toJSON()` serves a different purpose
  (e.g., GTO export), create `SessionManager.toSerializedGraph()` as a wrapper
  that calls `Graph.toJSON()` and adds `version` and `viewNodeId` metadata.
  Document the relationship clearly in code comments.
- Use `PropertyContainer.toPersistentJSON()` (not `toJSON()`) for node
  properties to avoid bloating the save file with transient state.

**Step 2.2 -- Extend SessionState**
- Add optional `graph?: SerializedGraph` field to `SessionState` in
  `src/core/session/SessionState.ts`.
- Bump `SESSION_STATE_VERSION` to 2.

**Step 2.3 -- Extend SessionSerializer**
- In `SessionSerializer.toJSON()`, call `SessionManager.toSerializedGraph()`
  and include the result in the state object.
- In `SessionSerializer.fromJSON()`, if `state.graph` exists, call
  `SessionManager.fromSerializedGraph()` before loading media. Reconnect
  deserialized source nodes to their `MediaSource` entries by matching on
  name/path.
- Handle deserialization errors gracefully:
  - If `NodeFactory.create()` returns `null` for an unknown node type, log a
    warning and skip the node (same behavior as `GTOGraphLoader`).
  - If a `SerializedGraphNode.inputIds` entry references a node that was not
    successfully deserialized, skip that input slot and log a warning.
  - After deserialization, call `resetNodeIdCounter()` with the maximum ID
    suffix found in the deserialized graph.
- In `SessionSerializer.migrate()`, add v1->v2 migration that generates a
  default `SerializedGraph` from the flat `MediaReference[]` array (one
  `RVSequenceGroup` containing one `RVFileSource` / `RVVideoSource` per media
  entry, or a single source as root if only one entry exists).

**Step 2.4 -- Tests**
- Round-trip serialization tests: save -> load -> verify graph structure.
- Migration tests: load v1 project -> verify graph is auto-generated.
- Edge cases: empty graph, single source, deeply nested groups.
- ID collision tests: deserialize, create new nodes, verify unique IDs.
- Dangling reference tests: serialized graph with missing node IDs.

### Phase 3: UI Panel

**Step 3.1 -- SessionManagerPanel skeleton**
- Create `src/ui/components/SessionManagerPanel.ts`.
- Follow `PlaylistPanel` pattern: `EventEmitter`, `show()`/`hide()`/`toggle()`,
  floating overlay appended to body.
- Header with title "Session Manager", close button.
- View history bar (back/forward buttons + view node label).
- Filter/search text input.
- Empty tree container.
- Footer with node count and current view label. Footer is interactive:
  clicking the view label scrolls to and highlights the active node in the tree.
- `aria-live="polite"` region for view node change announcements.

**Step 3.2 -- Context menu infrastructure**
- The existing codebase does not have a shared context menu component. Create a
  minimal reusable `ContextMenu` component in `src/ui/components/shared/ContextMenu.ts`
  that supports:
  - Triggered by `[...]` button click OR right-click on a tree item.
  - Positioned relative to the trigger element.
  - Dismissed on outside click or Escape.
  - Action items with labels, optional keyboard shortcut hints, optional disabled state.
- This is new UI infrastructure required by the Session Manager.

**Step 3.3 -- Tree rendering**
- Implement `renderTree()` that calls `SessionManager.getTreeModel()` and
  produces DOM elements.
- Each tree item: indented row with expand chevron, node type icon, name label,
  solo button `[S]`, context menu button `[...]`.
- Expand/collapse state stored in a `Map<string, boolean>` on the panel
  (NOT on `TreeNode`).
- Listen to `SessionManager.on('graphStructureChanged')` to re-render (with
  concurrent-drag guard: defer rebuild if `_isDragging` is true).
- Indentation capped at 5 levels (80px). Deeper nesting uses horizontal
  scrolling on the tree container.

**Step 3.4 -- Drag-and-drop reordering**
- Make tree items draggable (same pattern as `StackControl.createLayerElement`).
- `dragstart`: store source node id. Set `_isDragging = true`.
- `dragover`: compute drop target (before/after/inside group). Show visual
  indicator. If cross-group and `!event.altKey`, show "hold Alt" hint.
- `drop`: call `SessionManager.reorderGroupInput()` for within-group moves;
  call `SessionManager.addSourceToGroup()` for cross-group moves (only if
  `event.altKey` is true).
- `dragend`: restore opacity; clear all drop indicators. Set `_isDragging = false`.
  If deferred graph changes are pending, rebuild tree now.
- Validate via cycle check before executing the move.

**Step 3.5 -- Context menu actions**
- Rename: inline text input on the name label. Triggered by double-click on
  name or F2 shortcut or context menu "Rename".
- Delete: confirmation dialog specifying cascade behavior (delete children /
  re-parent / orphan), then `SessionManager.deleteNode(nodeId, cascadeMode)`.
- Set as View: `SessionManager.setViewNode()`.
- Move Up / Move Down: keyboard-accessible alternative to drag-and-drop.
  Calls `SessionManager.reorderGroupInput()`.
- These emit events that the app layer can intercept for undo/redo recording.

**Step 3.6 -- Solo button**
- Each tree item has a solo `[S]` button that calls
  `SessionManager.setViewNode(nodeId)`.
- Visually indicates the current view node (filled icon when active).
- Provides a discoverable alternative to double-click for setting the view node.

**Step 3.7 -- View history wiring**
- Back/forward buttons call `SessionManager.goBack()`/`goForward()`.
- Listen to `SessionManager.on('viewHistoryChanged')` to update button
  disabled states.
- Listen to `SessionManager.on('viewNodeChanged')` to update the footer label
  and highlight the active node in the tree.

### Phase 4: Integration

**Step 4.1 -- Wire into App**
- Instantiate `SessionManager` in `App.ts`, using `setHost()` pattern.
- Instantiate `SessionManagerPanel` and add its toggle to the toolbar
  (in `createPanelControls.ts`, alongside Playlist, Snapshot, etc.).
- Specify toolbar button: "hierarchy" icon, tooltip "Session Manager", placed
  in the panel controls group.
- Register keyboard shortcuts (`Alt+[`, `Alt+]`) in `AppControlRegistry.ts`.
- Consider adding small back/forward buttons in the main header bar (outside
  the Session Manager panel) so view history navigation is discoverable even
  when the panel is closed.

**Step 4.2 -- Wire into SessionSerializer**
- Pass `SessionManager` as a component in `SessionComponents`.
- Call graph serialization/deserialization in save/load flow.

**Step 4.3 -- Wire into GTO import**
- After `SessionGraph.loadFromGTO()` completes and emits `graphLoaded`,
  call `SessionManager.syncFromGraph()` to populate the view model and
  set the initial view node.
- Ensure no double-processing of sources (see Step 1.6 GTO import guard).

**Step 4.4 -- Mutual exclusion with other panels**
- Use the `ExclusivePanel` pattern from `PlaylistPanel` to auto-close the
  Session Manager when opening Playlist (and vice versa), since both are
  floating overlays that occupy similar screen regions.
- Specify exactly which panels are mutually exclusive: Session Manager and
  Playlist Panel.

### Phase 5: Polish and Edge Cases

**Step 5.1 -- Empty state**
- When no graph exists (fresh session, no files loaded), show a friendly
  empty state with the message "Load media to see the session graph" and
  an "Open File" button for direct action.

**Step 5.2 -- Error states**
- Drag-drop cycle detected: show inline error message near the drop target
  ("Cannot move: would create a cycle"). Use existing notification/toast
  pattern if one exists; otherwise, a temporary inline message that fades
  after 3 seconds.
- Deserialization failures (unknown node types, dangling references): logged
  as warnings; the graph loads with available nodes. The tree shows a warning
  indicator on the panel footer ("N nodes could not be loaded").

**Step 5.3 -- Large graphs**
- For sessions with 50+ nodes, implement virtual scrolling or lazy rendering
  for the tree view. Use a flat list with indent levels (same approach as
  VS Code's tree view).

**Step 5.4 -- Undo/redo integration**
- Graph mutations through `SessionManager` should record `HistoryEntry`
  objects via the existing `HistoryManager` so they can be undone.
- Each mutation method accepts an optional `{ recordHistory: boolean }`
  flag (default true).

**Step 5.5 -- Accessibility polish**
- Full WAI-ARIA TreeView keyboard navigation (see Section 5.6).
- `aria-live` region for view node changes.
- Focus management on panel open/close.
- Contrast verification for all highlighted states.
- Screen reader testing with VoiceOver (macOS) and NVDA (Windows).

---

## 7. Files to Create

| File | Purpose |
|------|---------|
| `src/core/session/ViewHistory.ts` | View history navigation stack |
| `src/core/session/ViewHistory.test.ts` | Tests for ViewHistory |
| `src/core/session/SessionManagerTypes.ts` | TreeNode, SerializedGraph interfaces |
| `src/core/session/SessionManager.ts` | Central orchestrator: mutations, tree, history, view lens |
| `src/core/session/SessionManager.test.ts` | Tests for SessionManager |
| `src/ui/components/SessionManagerPanel.ts` | UI panel with tree view |
| `src/ui/components/SessionManagerPanel.test.ts` | Tests for the panel |
| `src/ui/components/shared/ContextMenu.ts` | Reusable context menu component (new infrastructure) |
| `src/ui/components/shared/ContextMenu.test.ts` | Tests for context menu |

## 8. Files to Modify

| File | Change |
|------|--------|
| `src/core/session/SessionState.ts` | Add `graph?: SerializedGraph` to `SessionState`; bump version to 2 |
| `src/core/session/SessionSerializer.ts` | Serialize/deserialize graph; add v1->v2 migration; handle deserialization errors |
| `src/core/session/SessionSerializer.test.ts` | Add graph round-trip, migration, ID collision, and dangling reference tests |
| `src/core/session/Session.ts` | Integrate `SessionManager` as a service component |
| `src/core/session/SessionMedia.ts` | Modify `clearGraphData()` flow to notify `SessionManager`; emit events for bridge |
| `src/core/session/SessionGraph.ts` | Expose graph signals for SessionManager; coordinate `clearGraphData()` lifecycle |
| `src/core/graph/Graph.ts` | Add `reorderInput(nodeId, fromIndex, toIndex)` method; emit `connectionChanged` on reorder |
| `src/nodes/base/IPNode.ts` | Add `reorderInput(fromIndex, toIndex)` for input array reordering; emit `inputsChanged`. Add `resetNodeIdCounter(minValue)` utility |
| `src/App.ts` | Instantiate SessionManager with `setHost()`, pass to panel and serializer |
| `src/services/controls/createPanelControls.ts` | Add Session Manager toggle button with hierarchy icon |
| `src/AppControlRegistry.ts` | Register `Alt+[` / `Alt+]` shortcuts |
| `src/ui/layout/panels/RightPanelContent.ts` | No change needed (panel is floating overlay, not docked section) |

---

## 9. Risks and Mitigations

### 9.1 Media-Graph Synchronization

**Risk:** The flat `MediaSource[]` array and the graph's `IPNode` tree can
drift out of sync if one is mutated without the other.

**Mitigation:** All media loading and removal flows go through
`SessionManager`, which updates both `SessionMedia` and `Graph` atomically.
Direct mutations to `SessionMedia.sources` are discouraged; the existing
`addSource()` call will be augmented to notify `SessionManager`.

### 9.2 Backward Compatibility

**Risk:** Existing `.orvproject` files (version 1) have no `graph` field.
Loading them must not break.

**Mitigation:** `SessionSerializer.migrate()` handles the v1->v2 migration by
generating a default graph (one `RVSequenceGroup` wrapping all media as
source nodes, or a single source as root if only one entry). The `graph` field
is optional in `SessionState`, so v1 files parse cleanly.

### 9.3 Performance with Large Graphs

**Risk:** OpenRV session files can have hundreds of nodes. Rebuilding the
tree DOM on every graph change could cause jank.

**Mitigation:**
- The tree model (`getTreeModel()`) is a lightweight array of plain objects,
  not DOM nodes. Only changed subtrees are re-rendered (incremental DOM
  update, similar to `HistoryPanel.patchEntryStyles()`).
- `graphStructureChanged` emissions are debounced with `requestAnimationFrame`
  to batch rapid structural changes (e.g., importing 50 sources).
- For 100+ nodes, implement a flat virtualized list with indent levels.

### 9.4 Cycle Detection on Drag-and-Drop

**Risk:** A user could attempt to drag a group node into one of its own
descendants, creating a cycle.

**Mitigation:** `Graph.connect()` already has `wouldCreateCycle()` check.
`SessionManager.addSourceToGroup()` calls `Graph.connect()` which throws on
cycles. The panel catches the error and shows an inline error message
("Cannot move: would create a cycle") near the drop target.

### 9.5 GTO Import Conflicts

**Risk:** GTO-imported graphs may have node types that are not registered in
`NodeFactory` (effect nodes like `RVColor`, `RVTransform2D`).

**Mitigation:** The existing `GTOGraphLoader` already handles this by logging
a warning and skipping unknown node types. `SessionManager.getTreeModel()`
only includes nodes that exist in the `Graph`. Unresolved GTO node references
are displayed as grayed-out "unknown" entries in the tree. The same skip-and-warn
pattern is used by `fromSerializedGraph()` for deserialization.

### 9.6 Undo/Redo Complexity

**Risk:** Graph mutations (add/remove/reorder/connect) are structurally complex
to undo compared to simple property changes.

**Mitigation:** Each `SessionManager` mutation method captures a before-snapshot
(affected node IDs, connection lists) and registers an undo/redo pair with
`HistoryManager`. The snapshot is minimal (just IDs and connection indices, not
full node clones). Phase 5 polish can optimize this with a command pattern if
needed.

### 9.7 `clearGraphData()` Nullification

**Risk:** `SessionMedia.loadFile()` and related methods call
`host.clearGraphData()`, which sets `SessionGraph._graph = null`. If
`SessionManager` holds a reference to the graph and it is nullified underneath,
the manager will operate on a stale graph, causing crashes or silent data
corruption.

**Mitigation:** When `SessionManager` is active, `clearGraphData()` first
notifies the session manager via `SessionManager.onGraphCleared()`. This method:
1. Calls `dispose()` to disconnect all signal subscriptions.
2. Clears the view history.
3. Resets `_viewNodeId` to null.
4. Emits `graphStructureChanged` so the UI shows the empty state.

After the graph is re-created (e.g., by `loadFromGTO()` or `fromSerializedGraph()`),
the session manager re-subscribes to the new graph's signals.

### 9.8 Node ID Collision During Deserialization

**Risk:** `IPNode` generates IDs via a module-level counter. Deserialized IDs
from `.orvproject` files may conflict with IDs of nodes already present in the
session.

**Mitigation:** `fromSerializedGraph()` uses the serialized IDs directly and
resets the `nodeIdCounter` to `max(all existing node ID suffixes) + 1` after
deserialization. A `resetNodeIdCounter(minValue)` utility is added to
`IPNode.ts` for this purpose.

### 9.9 GTO Import / Media Bridge Race Condition

**Risk:** `SessionGraph.loadFromGTO()` calls `loadVideoSourcesFromGraph()`
which adds `MediaSource` entries. If `SessionManager.onMediaSourceLoaded()` is
also listening, the same source could be processed twice.

**Mitigation:** `onMediaSourceLoaded()` checks if the source already has a
graph node (via `fileSourceNode` / `videoSourceNode` references on `MediaSource`)
and skips it if so.

---

## 10. Testing Strategy

### Unit Tests

- **ViewHistory:** push, back, forward, boundary behavior (empty, full), clear,
  serialization round-trip. Verify `nodeName` is not stored.
- **SessionManager:** all mutation methods tested against a mock `Graph`. Tree
  model generation from known graph topologies (single source, multiple roots,
  disconnected components). View history integration. View node separate from
  output node. `deleteNode()` cascade modes. `dispose()` clears signal
  subscriptions. `onGraphCleared()` resets state.
- **Serialization:** `SerializedGraph` round-trip (serialize -> deserialize ->
  compare). Migration from v1 to v2. Edge cases: empty graph, orphan nodes,
  dangling references, unknown node types. ID collision tests.
- **ContextMenu:** render, action dispatch, dismiss on outside click, dismiss
  on Escape, right-click trigger.

### Integration Tests

- Load a GTO file, verify `SessionManager.getTreeModel()` matches expected
  structure.
- Load a v1 `.orvproject`, verify auto-generated graph matches media list.
- Drag-and-drop reorder in `SessionManagerPanel`, verify graph connections
  update and viewer re-evaluates.
- Load a file while session manager is active, verify `clearGraphData()` flow
  works correctly.
- Load 50 sources rapidly, verify debounced tree rebuild fires once.

### E2E Tests

- Open app, load two images, open Session Manager panel, verify tree shows
  default group with two sources.
- Load a single image, verify no group wrapper (source is root).
- Drag source from one position to another, verify order changes.
- Attempt cross-group drag without Alt, verify rejection with hint message.
- Cross-group drag with Alt, verify success.
- Click solo button on a source, verify viewer shows that source without
  changing graph output.
- Click back/forward buttons, verify viewer switches between previously
  viewed nodes.
- Save `.orvproject`, reload, verify graph is restored with correct IDs.
- Rename a node, navigate back in history, verify history displays current name.

---

## 11. Estimated Effort

| Phase | Scope | Estimate |
|-------|-------|----------|
| Phase 1 | Core SessionManager, ViewHistory, bridge, clearGraphData fix, ID management | 4-5 days |
| Phase 2 | Serialization + migration + error handling | 2-3 days |
| Phase 3 | UI Panel with tree, drag-drop, context menu, solo button, filter | 4-5 days |
| Phase 4 | App integration wiring | 1-2 days |
| Phase 5 | Polish (a11y, undo, performance, virtualization) | 2-3 days |
| **Total** | | **13-18 days** |

---

## 12. Open Questions

1. **Panel location (resolved):** The Session Manager is a floating overlay
   panel, matching `PlaylistPanel` and `HistoryPanel`. This was chosen over a
   docked `CollapsibleSection` due to the complexity of its interactions.

2. **Default graph structure (resolved):** A single source is the root/view
   node with no group wrapper. A `RVSequenceGroup` is created when a second
   source is loaded. This avoids the semantic oddity of one image inside a
   sequence group while matching OpenRV behavior for multi-source sessions.

3. **View node vs. output node (resolved):** `setViewNode()` maintains a
   separate `_viewNodeId` that does NOT change `Graph.setOutputNode()`. The
   renderer evaluates the view node. This enables "solo" inspection workflows
   without restructuring the graph.

4. **Effect/transform nodes in the tree.** GTO-imported graphs include
   per-source pipeline nodes (`RVColor`, `RVTransform2D`, `RVLensWarp`) that
   the web codebase handles as viewer properties rather than graph nodes. For
   v1, these are displayed as grayed-out informational entries under their
   parent source in the tree. Full first-class support as editable graph nodes
   is deferred to a future plan.

5. **`NodeFactory` constructor limitation.** The `@RegisterNode` pattern only
   supports zero-arg constructors. Node names and properties are set after
   creation via setters. If a future node type requires constructor arguments,
   the factory pattern will need to be extended (e.g., with a `create(options)`
   overload).

---

## Review Notes (Nice to Have / Future Considerations)

The following items were identified during expert review as valuable improvements
that are not blocking for the initial implementation:

1. **Debounce `graphStructureChanged` emissions.** Use `requestAnimationFrame`
   to batch rapid structural changes and avoid excessive tree rebuilds.
   *(Addressed in Phase 1, Step 1.4 -- integrated into the core implementation.)*

2. **Type-to-search/filter in the tree panel.** A simple text input at the top
   of the tree that filters visible nodes by name.
   *(Addressed in Phase 3, Step 3.1 -- integrated into the core implementation.)*

3. **Node type icons.** Define a small icon set (6-8 icons) for source and
   group types.
   *(Addressed in Section 5.1 -- icon set specified.)*

4. **Cap tree indentation at 4-5 levels.** Add horizontal scrolling for deeply
   nested graphs rather than compressing content. *(Addressed in Section 5.1.)*

5. **Solo/isolate button per tree item.** An "S" icon that sets the view node
   to that specific node for quick inspection.
   *(Addressed in Phase 3, Step 3.6 -- integrated into the core implementation.)*

6. **Touch support for drag-and-drop.** Add `touchstart`/`touchmove`/`touchend`
   handlers or use a library like `@use-gesture/vanilla` for cross-platform
   gesture support. Touch targets for chevrons and buttons should meet the
   44x44px minimum per WCAG. Long-press should trigger the context menu.

7. **Multi-selection support.** Shift+click and Cmd/Ctrl+click for selecting
   multiple nodes for batch operations (delete, group, drag as set). Listed as
   a non-goal for v1; high priority for v2.

8. **Right-click context menu.** More discoverable than the `[...]` button for
   desktop users.
   *(Addressed in Phase 3, Step 3.2 -- integrated into the core implementation.)*

9. **Hover tooltips on tree items.** Show metadata (resolution, duration,
   format, blend mode) on hover.
   *(Addressed in Section 5.1 -- specified as tree item feature.)*

10. **Limit serialized properties to persistent-only.** Use
    `PropertyContainer.toPersistentJSON()` instead of `toJSON()` to reduce
    `.orvproject` file size.
    *(Addressed in Phase 2, Step 2.1 -- integrated into the core implementation.)*

11. **Define cascading behavior for `deleteNode()`.** Specify and document
    whether deleting a group removes children, re-parents them, or orphans them.
    Present a dialog to the user with the choice.
    *(Addressed in Section 4.1 -- `cascadeMode` parameter added to `deleteNode()`.)*

12. **View history bookmarks.** Desktop OpenRV supports named view
    configurations and bookmarked views beyond simple back/forward. The current
    `ViewHistory` is a reasonable v1 simplification. Named bookmarks could be
    added in a future iteration.

13. **Cut/Copy/Paste of nodes.** Desktop OpenRV supports copying nodes between
    sessions or duplicating within a session. Listed as a non-goal for v1.
