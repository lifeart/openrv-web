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
   inline property editing, and drag-and-drop reordering.
3. Implement **view history navigation** (back/forward through viewed nodes).
4. Serialize and deserialize the full graph topology in `.orvproject` files.
5. Maintain backward compatibility -- existing sessions without graph data
   continue to work.

### Non-Goals (out of scope for this plan)

- Full node-graph visual editor (node-wire canvas).
- GPU-side compositing rewrite.
- OCIO node pipeline editor.

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
| `src/ui/components/shared/Panel.ts` | `createPanel()` factory with outside-click close, anchor positioning |
| `src/ui/layout/panels/LeftPanelContent.ts` | `CollapsibleSection` based layout |

### 2.6 Gaps

1. **No Session Manager panel** -- the graph is invisible to the user.
2. **No view history** -- no back/forward navigation through viewed nodes.
3. **`.orvproject` does not persist graph topology** -- only flat `MediaReference[]`.
4. **`SessionMedia` is disconnected from the graph** -- sources are a flat array
   with no link to `IPNode` instances or group membership.
5. **No runtime API to mutate the graph from UI** -- `Graph` supports add/remove/connect
   but there is no higher-level "session manager" orchestrating user actions.

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
   node, etc.) and maintains the view history stack.

2. **Tree model** -- the panel renders a tree derived from the graph. Group
   nodes are expandable parents; source/effect nodes are leaves. The tree is
   rebuilt on `Graph.nodeAdded` / `Graph.nodeRemoved` / `Graph.connectionChanged`
   signals.

3. **Media-graph bridge** -- when a user loads a file via `SessionMedia`, a
   corresponding `FileSourceNode` / `VideoSourceNode` is created and added to
   the graph. The bridge is bidirectional: removing a source node from the graph
   removes the `MediaSource` from the flat array, and vice versa.

4. **View history** -- a bounded stack of `{ nodeId, timestamp }` entries.
   Navigating to a node means setting it as the graph's output node and
   updating the viewer. Back/forward buttons traverse the stack.

5. **Serialization** -- extend `SessionState` with an optional `graph` field
   containing the serialized topology (node list + connections). On load, the
   serializer reconstructs the graph before loading media.

---

## 4. Data Model

### 4.1 SessionManager

```typescript
// src/core/session/SessionManager.ts

export interface ViewHistoryEntry {
  nodeId: string;
  nodeName: string;
  timestamp: number;
}

export interface SessionManagerEvents extends EventMap {
  viewNodeChanged: { nodeId: string; nodeName: string };
  graphStructureChanged: void;
  viewHistoryChanged: { canGoBack: boolean; canGoForward: boolean };
}

export class SessionManager extends EventEmitter<SessionManagerEvents> {
  private _sessionGraph: SessionGraph;
  private _media: SessionMedia;
  private _viewHistory: ViewHistoryEntry[] = [];
  private _viewHistoryIndex = -1;
  private readonly MAX_HISTORY = 50;

  // --- View History ---
  setViewNode(nodeId: string): void;
  goBack(): void;
  goForward(): void;
  get canGoBack(): boolean;
  get canGoForward(): boolean;

  // --- Graph Mutation API ---
  addSourceToGroup(sourceNodeId: string, groupNodeId: string, index?: number): void;
  removeSourceFromGroup(sourceNodeId: string, groupNodeId: string): void;
  reorderGroupInput(groupNodeId: string, fromIndex: number, toIndex: number): void;
  createGroup(type: GroupNodeType, inputNodeIds: string[]): IPNode;
  deleteNode(nodeId: string): void;
  renameNode(nodeId: string, name: string): void;

  // --- Media Bridge ---
  onMediaSourceLoaded(source: MediaSource): IPNode;
  syncMediaToGraph(): void;

  // --- Tree Model ---
  getTreeModel(): TreeNode[];

  // --- Serialization ---
  toJSON(): SerializedGraph;
  fromJSON(data: SerializedGraph): void;
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
  /** True if this is the current view/output node */
  isActive: boolean;
  /** True if the node is expanded in the tree UI */
  expanded: boolean;
  /** Depth in the tree (0 = root) */
  depth: number;
  /** Reference to the underlying IPNode */
  nodeRef: IPNode;
}
```

### 4.3 Serialized Graph (for `.orvproject`)

```typescript
// Extension to SessionState (src/core/session/SessionState.ts)

export interface SerializedGraphNode {
  id: string;
  type: string;
  name: string;
  /** Persistent properties only */
  properties: Record<string, unknown>;
  /** IDs of input nodes (order matters for group nodes) */
  inputIds: string[];
}

export interface SerializedGraph {
  /** Version for graph schema migration */
  version: number;
  /** All nodes in the graph */
  nodes: SerializedGraphNode[];
  /** ID of the root/output node */
  outputNodeId: string | null;
  /** ID of the currently viewed node */
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

---

## 5. UI Design

### 5.1 Session Manager Panel

The panel lives in the **right panel area** (alongside the existing right
panel content) and is toggled via a toolbar button or keyboard shortcut.

```
+----------------------------------------------+
| Session Manager                          [x] |
|----------------------------------------------|
| [<] [>]  View History   (back / forward)     |
|----------------------------------------------|
|  v  RVSequenceGroup "Main Sequence"    [...]  |
|     |-- RVFileSource "shot_001.exr"           |
|     |-- RVRetimeGroup "Slow Motion"    [...]  |
|     |   |-- RVVideoSource "clip.mp4"          |
|     |-- RVStackGroup "Comp"            [...]  |
|     |   |-- RVFileSource "bg.exr"             |
|     |   |-- RVFileSource "fg.exr"             |
|     |-- RVFileSource "shot_003.exr"           |
|----------------------------------------------|
| 5 nodes | View: Main Sequence                 |
+----------------------------------------------+
```

**Tree item features:**
- Expand/collapse chevron for group nodes.
- Drag handle for reordering within a group (same pattern as `StackControl`).
- Context menu `[...]` button with actions: Rename, Delete, Set as View,
  Change Group Type, Add to Group.
- Double-click to set as view (output) node.
- Active/view node highlighted with accent color.
- Source nodes show file name; group nodes show type + custom name.
- Depth-based indentation (16px per level).

### 5.2 View History Bar

A compact toolbar row at the top of the panel:
- Back button `[<]` -- disabled when `canGoBack` is false.
- Forward button `[>]` -- disabled when `canGoForward` is false.
- Label showing current view node name.
- Breadcrumb trail of recent history (optional, v2).

### 5.3 Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Alt+[` | View history back |
| `Alt+]` | View history forward |
| `F2` (when panel focused) | Rename selected node |
| `Delete` (when panel focused) | Delete selected node (with confirmation) |

### 5.4 Drag-and-Drop Behavior

Follows the established pattern from `StackControl.ts` and `PlaylistPanel.ts`:

1. `dragstart`: set `dataTransfer` with source node id; set opacity to 0.5.
2. `dragover`: `preventDefault()`; show drop indicator (top border highlight).
3. `dragleave`: remove drop indicator.
4. `drop`: call `SessionManager.reorderGroupInput()` or
   `SessionManager.addSourceToGroup()` depending on whether the source and
   target share the same parent group.
5. `dragend`: restore opacity; clear all drop indicators.

**Cross-group drag:** When dragging a node from one group to another, the
node is disconnected from the source group and connected as an input to the
target group. Cycle detection in `Graph.connect()` prevents invalid moves.

---

## 6. Implementation Steps

### Phase 1: Core SessionManager (no UI)

**Step 1.1 -- ViewHistory class**
- Create `src/core/session/ViewHistory.ts`.
- Implement push, back, forward, clear, serialization.
- Write tests in `src/core/session/ViewHistory.test.ts`.

**Step 1.2 -- SessionManagerTypes**
- Create `src/core/session/SessionManagerTypes.ts` with `TreeNode`,
  `SerializedGraph`, `SerializedGraphNode`, `GroupNodeType` interfaces.

**Step 1.3 -- SessionManager class**
- Create `src/core/session/SessionManager.ts`.
- Inject `SessionGraph` and `SessionMedia` via constructor.
- Implement graph mutation methods (add, remove, reorder, rename).
- Implement `getTreeModel()` that walks the graph from the output node and
  builds a `TreeNode[]` tree.
- Implement `setViewNode()`, `goBack()`, `goForward()` using `ViewHistory`.
- Listen to `Graph.nodeAdded`, `Graph.nodeRemoved`, `Graph.connectionChanged`
  signals and re-emit `graphStructureChanged`.
- Write tests in `src/core/session/SessionManager.test.ts`.

**Step 1.4 -- Media-Graph Bridge**
- Add `onMediaSourceLoaded()` to `SessionManager`: creates an `IPNode` for the
  loaded `MediaSource` and adds it to the graph.
- If no group node exists, create a default `RVSequenceGroup` as root.
- Wire `SessionMedia.on('sourceLoaded')` to `SessionManager.onMediaSourceLoaded()`.
- Add `sourceNodeId` field to `MediaSource` interface to link media entries to
  graph nodes.

### Phase 2: Serialization

**Step 2.1 -- Graph serialization**
- Add `toSerializedGraph()` method to `SessionManager` that produces
  `SerializedGraph` from the live `Graph`.
- Add `fromSerializedGraph()` that reconstructs the `Graph` from
  `SerializedGraph` using `NodeFactory`.

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
- In `SessionSerializer.migrate()`, add v1->v2 migration that generates a
  default `SerializedGraph` from the flat `MediaReference[]` array (one
  `RVSequenceGroup` containing one `RVFileSource` / `RVVideoSource` per media
  entry).

**Step 2.4 -- Tests**
- Round-trip serialization tests: save -> load -> verify graph structure.
- Migration tests: load v1 project -> verify graph is auto-generated.
- Edge cases: empty graph, single source, deeply nested groups.

### Phase 3: UI Panel

**Step 3.1 -- SessionManagerPanel skeleton**
- Create `src/ui/components/SessionManagerPanel.ts`.
- Follow `PlaylistPanel` pattern: `EventEmitter`, `show()`/`hide()`/`toggle()`,
  fixed-position container appended to body.
- Header with title, close button.
- View history bar (back/forward buttons + label).
- Empty tree container.
- Footer with node count and current view label.

**Step 3.2 -- Tree rendering**
- Implement `renderTree()` that calls `SessionManager.getTreeModel()` and
  produces DOM elements.
- Each tree item: indented row with expand chevron, icon (based on node type),
  name label, context menu button.
- Expand/collapse state stored in a `Map<string, boolean>` on the panel.
- Listen to `SessionManager.on('graphStructureChanged')` to re-render.

**Step 3.3 -- Drag-and-drop reordering**
- Make tree items draggable (same pattern as `StackControl.createLayerElement`).
- `dragstart`: store source node id.
- `dragover`: compute drop target (before/after/inside group). Show visual
  indicator.
- `drop`: call `SessionManager.reorderGroupInput()` or
  `SessionManager.addSourceToGroup()`.
- Validate via cycle check before executing the move.

**Step 3.4 -- Context menu actions**
- Rename: inline text input on the name label (F2 shortcut).
- Delete: confirmation dialog, then `SessionManager.deleteNode()`.
- Set as View: `SessionManager.setViewNode()`.
- These emit events that the app layer can intercept for undo/redo recording.

**Step 3.5 -- View history wiring**
- Back/forward buttons call `SessionManager.goBack()`/`goForward()`.
- Listen to `SessionManager.on('viewHistoryChanged')` to update button
  disabled states.
- Listen to `SessionManager.on('viewNodeChanged')` to update the footer label
  and highlight the active node in the tree.

### Phase 4: Integration

**Step 4.1 -- Wire into App**
- Instantiate `SessionManager` in `App.ts`, passing `SessionGraph` and
  `SessionMedia`.
- Instantiate `SessionManagerPanel` and add its toggle to the toolbar
  (alongside Playlist, Snapshot, etc. in `createPanelControls.ts`).
- Register keyboard shortcuts (`Alt+[`, `Alt+]`) in `AppControlRegistry.ts`.

**Step 4.2 -- Wire into SessionSerializer**
- Pass `SessionManager` as a component in `SessionComponents`.
- Call graph serialization/deserialization in save/load flow.

**Step 4.3 -- Wire into GTO import**
- After `SessionGraph.loadFromGTO()` completes and emits `graphLoaded`,
  call `SessionManager.syncFromGraph()` to populate the view model and
  set the initial view node.

**Step 4.4 -- Mutual exclusion with other panels**
- Use the `ExclusivePanel` pattern from `PlaylistPanel` to auto-close the
  Session Manager when opening Playlist (and vice versa), if both occupy the
  same screen region.

### Phase 5: Polish and Edge Cases

**Step 5.1 -- Empty state**
- When no graph exists (fresh session, no files loaded), show a friendly
  empty state message: "Load media to see the session graph."

**Step 5.2 -- Large graphs**
- For sessions with 50+ nodes, implement virtual scrolling or lazy rendering
  for the tree view. Use a flat list with indent levels (same approach as
  VS Code's tree view).

**Step 5.3 -- Undo/redo integration**
- Graph mutations through `SessionManager` should record `HistoryEntry`
  objects via the existing `HistoryManager` so they can be undone.
- Each mutation method accepts an optional `{ recordHistory: boolean }`
  flag (default true).

**Step 5.4 -- Accessibility**
- Tree items use `role="treeitem"`, `aria-expanded`, `aria-level`.
- Container uses `role="tree"`.
- Arrow keys navigate the tree; Enter activates; Space toggles expand.

---

## 7. Files to Create

| File | Purpose |
|------|---------|
| `src/core/session/ViewHistory.ts` | View history navigation stack |
| `src/core/session/ViewHistory.test.ts` | Tests for ViewHistory |
| `src/core/session/SessionManagerTypes.ts` | TreeNode, SerializedGraph interfaces |
| `src/core/session/SessionManager.ts` | Central orchestrator: mutations, tree, history |
| `src/core/session/SessionManager.test.ts` | Tests for SessionManager |
| `src/ui/components/SessionManagerPanel.ts` | UI panel with tree view |
| `src/ui/components/SessionManagerPanel.test.ts` | Tests for the panel |

## 8. Files to Modify

| File | Change |
|------|--------|
| `src/core/session/SessionState.ts` | Add `graph?: SerializedGraph` to `SessionState`; bump version to 2 |
| `src/core/session/SessionSerializer.ts` | Serialize/deserialize graph; add v1->v2 migration |
| `src/core/session/SessionSerializer.test.ts` | Add graph round-trip and migration tests |
| `src/core/session/Session.ts` | Add `sourceNodeId?: string` to `MediaSource` interface |
| `src/core/session/SessionMedia.ts` | Emit event with enough info for SessionManager to create graph node |
| `src/core/session/SessionGraph.ts` | Expose graph signals for SessionManager to subscribe to |
| `src/core/graph/Graph.ts` | Add `reorderInput(nodeId, fromIndex, toIndex)` method |
| `src/nodes/base/IPNode.ts` | Add `reorderInput(fromIndex, toIndex)` for input array reordering |
| `src/App.ts` | Instantiate SessionManager, pass to panel and serializer |
| `src/services/controls/createPanelControls.ts` | Add Session Manager toggle button |
| `src/AppControlRegistry.ts` | Register `Alt+[` / `Alt+]` shortcuts |
| `src/ui/layout/panels/RightPanelContent.ts` | Optionally embed SessionManagerPanel section |

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
source nodes). The `graph` field is optional in `SessionState`, so v1 files
parse cleanly.

### 9.3 Performance with Large Graphs

**Risk:** OpenRV session files can have hundreds of nodes. Rebuilding the
tree DOM on every graph change could cause jank.

**Mitigation:**
- The tree model (`getTreeModel()`) is a lightweight array of plain objects,
  not DOM nodes. Only changed subtrees are re-rendered (incremental DOM
  update, similar to `HistoryPanel.patchEntryStyles()`).
- For 100+ nodes, implement a flat virtualized list with indent levels.

### 9.4 Cycle Detection on Drag-and-Drop

**Risk:** A user could attempt to drag a group node into one of its own
descendants, creating a cycle.

**Mitigation:** `Graph.connect()` already has `wouldCreateCycle()` check.
`SessionManager.addSourceToGroup()` calls `Graph.connect()` which throws on
cycles. The panel catches the error and shows a toast notification instead of
silently failing.

### 9.5 GTO Import Conflicts

**Risk:** GTO-imported graphs may have node types that are not registered in
`NodeFactory` (effect nodes like `RVColor`, `RVTransform2D`).

**Mitigation:** The existing `GTOGraphLoader` already handles this by logging
a warning and skipping unknown node types. `SessionManager.getTreeModel()`
only includes nodes that exist in the `Graph`. Unresolved GTO node references
are displayed as grayed-out "unknown" entries in the tree.

### 9.6 Undo/Redo Complexity

**Risk:** Graph mutations (add/remove/reorder/connect) are structurally complex
to undo compared to simple property changes.

**Mitigation:** Each `SessionManager` mutation method captures a before-snapshot
(affected node IDs, connection lists) and registers an undo/redo pair with
`HistoryManager`. The snapshot is minimal (just IDs and connection indices, not
full node clones). Phase 5 polish can optimize this with a command pattern if
needed.

---

## 10. Testing Strategy

### Unit Tests

- **ViewHistory:** push, back, forward, boundary behavior (empty, full), clear,
  serialization round-trip.
- **SessionManager:** all mutation methods tested against a mock `Graph`. Tree
  model generation from known graph topologies. View history integration.
- **Serialization:** `SerializedGraph` round-trip (serialize -> deserialize ->
  compare). Migration from v1 to v2. Edge cases: empty graph, orphan nodes.

### Integration Tests

- Load a GTO file, verify `SessionManager.getTreeModel()` matches expected
  structure.
- Load a v1 `.orvproject`, verify auto-generated graph matches media list.
- Drag-and-drop reorder in `SessionManagerPanel`, verify graph connections
  update and viewer re-evaluates.

### E2E Tests

- Open app, load two images, open Session Manager panel, verify tree shows
  default group with two sources.
- Drag source from one position to another, verify order changes.
- Click back/forward buttons, verify viewer switches between previously
  viewed nodes.
- Save `.orvproject`, reload, verify graph is restored.

---

## 11. Estimated Effort

| Phase | Scope | Estimate |
|-------|-------|----------|
| Phase 1 | Core SessionManager, ViewHistory, bridge | 3-4 days |
| Phase 2 | Serialization + migration | 2 days |
| Phase 3 | UI Panel with tree, drag-drop, context menu | 3-4 days |
| Phase 4 | App integration wiring | 1-2 days |
| Phase 5 | Polish (a11y, undo, performance) | 2-3 days |
| **Total** | | **11-15 days** |

---

## 12. Open Questions

1. **Default graph structure for new sessions:** Should a fresh session (no GTO,
   user loads files one by one) default to a single `RVSequenceGroup` root, or
   should each source be an independent root until the user explicitly groups
   them? **Recommendation:** Default to a single `RVSequenceGroup` to match
   OpenRV behavior.

2. **Panel location:** Right panel (alongside color/info panels) vs. left panel
   (alongside color sliders/history)? **Recommendation:** Right panel, since it
   is more associated with session structure than color grading. Alternatively,
   make it a dockable floating panel like `PlaylistPanel`.

3. **View node vs. output node:** In OpenRV, the "view node" can differ from
   the graph's root output. Should `setViewNode()` change the graph's output
   node, or should we maintain a separate "view lens" that evaluates an
   arbitrary subgraph? **Recommendation:** For v1, `setViewNode()` sets the
   graph output node directly. A separate "solo/isolate" mode can be added
   later.
