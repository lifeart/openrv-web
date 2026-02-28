# Multi-Source Layout Views

## Overview

Desktop OpenRV supports five layout modes for viewing multiple sources simultaneously: **Packed** (auto-grid), **Row**, **Column**, **Manual** (free-position with drag handles), and **Static** (fixed positions, no handles). The web version currently has a basic Quad View (4-up A/B/C/D comparison) backed by `ComparisonManager` and a tiled rendering path in the `Renderer`, but lacks a general-purpose, flexible multi-source layout system that supports arbitrary numbers of sources, per-tile zoom/pan, manual repositioning, and synchronized or independent playback.

This plan introduces a full **Multi-Source Layout** system that:

- Supports Packed, Row, Column, Manual, and Static layout modes
- Allows manual repositioning of tiles via drag handles (Manual mode)
- Provides per-source independent zoom/pan
- Supports synchronized and independent playback across tiles
- Integrates with the existing rendering pipeline (WebGL2 tiled rendering, 2D canvas fallback)
- Replaces and subsumes the current Quad View feature

## Current State

### Existing Multi-Source / Comparison Features

| Feature | Location | Status |
|---------|----------|--------|
| **Quad View** | `ComparisonManager.ts` (`QuadViewState`) | State management only -- maps A/B/C/D labels to 4 quadrants. No per-tile zoom/pan. |
| **A/B Compare** | `ABCompareManager.ts`, `ComparisonManager.ts` | Full A/B/C/D source index tracking, toggle, sync playhead. |
| **Wipe / Split Screen** | `WipeManager.ts`, `ViewerSplitScreen.ts` | Horizontal/vertical wipe and split screen with draggable divider. Canvas 2D clipping path. |
| **Blend Modes** | `ComparisonManager.ts` | Onion skin, flicker, blend ratio for A/B. |
| **Difference Matte** | `ComparisonManager.ts`, `DifferenceMatteControl.ts` | Per-pixel diff with gain and heatmap. |

### Existing Layout Infrastructure

| Component | File | Role |
|-----------|------|------|
| **LayoutGroupNode** | `src/nodes/groups/LayoutGroupNode.ts` | Node-graph node that arranges inputs in row/column/grid modes. Computes `TileViewport[]` regions in WebGL coordinates. Supports `evaluateAllInputs()` for tiled rendering. |
| **LayoutProcessor** | `src/nodes/processors/LayoutProcessor.ts` | Stateless processor companion. Delegates viewport math to `computeTileViewports()`. Only handles row/column/grid -- no manual or static modes. |
| **computeTileViewports()** | `src/nodes/groups/LayoutGroupNode.ts` (exported) | Pure function: given canvas dimensions, columns, rows, spacing, produces `TileViewport[]` array in row-major order (top-left first, WebGL bottom-left origin). |
| **Renderer.renderTiledImages()** | `src/render/Renderer.ts` (line 547) | GPU tiled rendering: iterates tiles, sets `gl.viewport()` + `gl.scissor()` per tile, calls `renderImage()` for each. All tiles share the same `RenderState` (color adjustments, effects). |
| **ViewerGLRenderer.renderTiledHDR()** | `src/ui/components/ViewerGLRenderer.ts` (line 712) | High-level tiled rendering entry point. Builds a single `RenderState`, applies it once, then calls `renderer.renderTiledImages(tiles)`. Used for quad view. |
| **LayoutStore** | `src/ui/layout/LayoutStore.ts` | Panel layout persistence (left/right/bottom panels) -- unrelated to multi-source tile layout. |
| **LayoutManager** | `src/ui/layout/LayoutManager.ts` | DOM layout (panels, viewer slot, drag-resize handles) -- the outer chrome, not source tiles. |
| **LayoutOrchestrator** | `src/services/LayoutOrchestrator.ts` | Top-level DOM assembly wiring (header, tab bar, viewer, timeline). |

### Rendering Pipeline

The Viewer (`src/ui/components/Viewer.ts`) has two main render paths:

1. **WebGL/HDR path** (`ViewerGLRenderer.renderHDRWithWebGL`, `renderTiledHDR`): Uses `Renderer` (WebGL2 backend) with fragment shader pipeline. The `renderTiledImages()` method already supports multiple tiles via `gl.viewport()` + `gl.scissor()`.

2. **Canvas 2D path** (`Viewer.renderImage`): Falls back for SDR sources with CPU-only effects, wipe, split screen, stack compositing, OCIO, etc. Multi-source rendering here uses `drawClippedSource()` with canvas clipping regions.

Both paths share the same `TransformManager` for pan/zoom/rotation -- currently a **single** instance per Viewer, which is a key constraint for per-tile transforms.

### Key Gaps

1. **No Manual/Static layout modes** -- only row/column/grid exist.
2. **No per-tile zoom/pan** -- single `TransformManager` instance shared across all tiles.
3. **No per-tile RenderState** -- `renderTiledHDR` builds one `RenderState` applied to all tiles.
4. **No tile drag handles** -- tiles are static grid cells with no repositioning UI.
5. **No independent playback** -- all sources share the single `PlaybackEngine` and `currentFrame`.
6. **Quad View is hardcoded to 4** -- not extensible to arbitrary source counts.
7. **No tile selection/focus** -- no concept of "active tile" for directing keyboard/mouse to a specific source.

## Proposed Architecture

### Design Principles

1. **State-first**: All layout state in a single `MultiSourceLayoutState` object, separate from DOM.
2. **Composition over inheritance**: New managers compose with existing `TransformManager`, `PlaybackEngine`, `ComparisonManager` rather than extending them.
3. **Backward compatible**: Quad View, wipe, split screen continue working. Multi-source layout is activated explicitly (new comparison mode or menu option).
4. **GPU-first rendering**: Tiled WebGL path is primary; canvas 2D fallback for CPU-only effects.
5. **Progressive enhancement**: Start with Packed/Row/Column (Phase 1), add Manual/Static (Phase 2), per-tile playback (Phase 3).

### Core Data Model

```typescript
// src/ui/components/MultiSourceLayoutTypes.ts

export type MultiSourceLayoutMode = 'packed' | 'row' | 'column' | 'manual' | 'static';

export interface TileState {
  /** Unique tile identifier */
  id: string;
  /** Index into Session's sources array */
  sourceIndex: number;
  /** Label for display (e.g., "A", "B", "Source 1") */
  label: string;
  /** Per-tile pan offset (pixels, relative to tile center) */
  panX: number;
  panY: number;
  /** Per-tile zoom level (1.0 = fit-to-tile) */
  zoom: number;
  /** Manual mode: position in normalized coordinates [0..1] relative to canvas */
  manualX: number;
  manualY: number;
  /** Manual mode: size in normalized coordinates [0..1] */
  manualWidth: number;
  manualHeight: number;
  /** Whether this tile is the "active" tile receiving keyboard focus */
  active: boolean;
}

export interface MultiSourceLayoutState {
  /** Current layout mode */
  mode: MultiSourceLayoutMode;
  /** Whether multi-source layout is enabled */
  enabled: boolean;
  /** Ordered list of tiles */
  tiles: TileState[];
  /** Grid spacing in pixels */
  spacing: number;
  /** For packed mode: number of columns (0 = auto-calculate) */
  columns: number;
  /** Playback sync mode */
  playbackSync: 'synchronized' | 'independent';
  /** Show tile labels */
  showLabels: boolean;
  /** Show tile borders */
  showBorders: boolean;
}
```

### Component Architecture

```
MultiSourceLayoutManager (state + logic)
  |
  +-- MultiSourceLayoutStore (persistence, events)
  |
  +-- TileTransformManager[] (per-tile zoom/pan, one TransformManager per tile)
  |
  +-- TilePlaybackManager (synchronized vs independent frame tracking)
  |
  +-- MultiSourceLayoutRenderer (GPU rendering orchestration)
  |     |
  |     +-- computeLayoutViewports() (layout algorithm dispatch)
  |     +-- Renderer.renderTiledImages() (existing GPU path)
  |
  +-- MultiSourceLayoutUI (DOM: drag handles, labels, borders, hover states)
  |     |
  |     +-- TileDragHandleManager (Manual mode pointer interaction)
  |     +-- TileLabelOverlay (source name labels)
  |     +-- TileBorderOverlay (active tile highlight)
  |
  +-- MultiSourceLayoutControl (toolbar dropdown, mode switcher, tile config)
```

### Integration Points

```
Viewer.ts
  |-- renderImage() checks: if (multiSourceLayout.enabled) { renderMultiSource(); return; }
  |-- resize() notifies MultiSourceLayoutManager of new canvas dimensions
  |-- pointer events: MultiSourceLayoutManager.hitTest() to determine active tile
  |
AppViewWiring.ts
  |-- Wire MultiSourceLayoutControl events to Viewer/Manager
  |
ComparisonManager.ts
  |-- setQuadViewEnabled() bridges to MultiSourceLayoutManager (backward compat)
  |-- New: setMultiSourceLayout() for >4 sources
  |
ABCompareManager.ts
  |-- Extend to support N source indices (not just A/B/C/D)
```

## Layout Algorithms

### Packed Mode (Auto-Grid)

Reuses existing `computeTileViewports()` with auto-calculated grid dimensions.

```
N=1: [1x1]     N=2: [2x1]     N=3: [3x1]     N=4: [2x2]
N=5: [3x2]     N=6: [3x2]     N=7: [3x3]     N=9: [3x3]
```

Algorithm:
```typescript
function packedGrid(n: number): { columns: number; rows: number } {
  const cols = Math.ceil(Math.sqrt(n));
  const rows = Math.ceil(n / cols);
  return { columns: cols, rows };
}
```

Delegates directly to `computeTileViewports(canvasW, canvasH, cols, rows, spacing)`.

### Row Mode

Single row, equal-width columns.

```
[ Source 1 | Source 2 | Source 3 | Source 4 ]
```

`computeTileViewports(canvasW, canvasH, n, 1, spacing)` -- already supported.

### Column Mode

Single column, equal-height rows.

```
[ Source 1 ]
[ Source 2 ]
[ Source 3 ]
```

`computeTileViewports(canvasW, canvasH, 1, n, spacing)` -- already supported.

### Manual Mode

Tiles have free-form position and size, defined in normalized canvas coordinates `[0..1]`. Users reposition via drag handles at tile corners/edges.

```typescript
function manualViewports(
  tiles: TileState[],
  canvasW: number,
  canvasH: number,
): TileViewport[] {
  return tiles.map(tile => ({
    x: Math.round(tile.manualX * canvasW),
    y: Math.round((1 - tile.manualY - tile.manualHeight) * canvasH), // WebGL Y-flip
    width: Math.round(tile.manualWidth * canvasW),
    height: Math.round(tile.manualHeight * canvasH),
  }));
}
```

Constraint enforcement:
- Minimum tile size: 100x100 CSS pixels
- Tiles may overlap (z-order by array position)
- Snap-to-grid optional (configurable grid step)
- Snap-to-edge when within 8px of canvas edge or adjacent tile edge

### Static Mode

Same as Manual, but without drag handles. Tile positions are set programmatically (via presets or API) and cannot be changed by pointer interaction. Used for fixed monitoring layouts.

## UI Design

### Toolbar Integration

Add a "Layout" dropdown button to the View tab context toolbar (next to existing Compare dropdown):

```
[Zoom] [Channel] | [Compare v] [Layout v] [Stereo] ...
```

The Layout dropdown contains:

```
+---------------------------+
| Layout Mode               |
|  * Off                    |
|    Packed (Auto Grid)     |
|    Row                    |
|    Column                 |
|    Manual                 |
|    Static                 |
|---------------------------|
| Sources                   |
|  [+] Add current source   |
|  [x] Source 1 (A)         |
|  [x] Source 2 (B)         |
|  [x] Source 3 (C)         |
|  [x] Source 4 (D)         |
|---------------------------|
| Options                   |
|  Spacing: [===] 4px       |
|  Columns: [===] auto      |
|  Labels: [x]              |
|  Borders: [x]             |
|  Playback: [Sync|Indep]   |
+---------------------------+
```

### Tile Interaction

**Active Tile Selection**: Clicking on a tile makes it "active" (highlighted border). Keyboard shortcuts (zoom, pan, frame step) apply to the active tile.

**Per-Tile Zoom/Pan**: Scroll wheel zooms the tile under the cursor. Middle-click + drag pans within a tile. Double-click resets to fit-to-tile.

**Manual Mode Drag Handles**: When Manual mode is active, hovering a tile shows:
- Corner handles (resize diagonally)
- Edge handles (resize one axis)
- Center grab area (reposition)

Handle visuals: Small squares at corners (8x8px), bars along edges. Semi-transparent when idle, opaque on hover. CSS cursor changes to indicate resize direction.

**Tile Labels**: Source name shown in the bottom-left corner of each tile. Semi-transparent background, `font-size: 11px`. Hidden when tile is too small (< 120px wide).

**Active Tile Border**: 2px accent-color border around the active tile. Other tiles have 1px muted border.

### Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Tab` / `Shift+Tab` | Cycle active tile |
| `1-9` | Select tile by index |
| `L` | Cycle layout mode |
| `Shift+L` | Toggle layout on/off |
| `=` / `-` | Zoom active tile in/out |
| `0` | Reset active tile zoom to fit |
| Arrow keys | Pan active tile |
| `Space` | Play/pause (all tiles if synced, active tile if independent) |

## Implementation Steps

### Phase 1: Core Layout Infrastructure (Grid Modes)

**Goal**: Packed, Row, Column modes with shared zoom/pan and synchronized playback.

1. **Create `MultiSourceLayoutTypes.ts`** -- type definitions for `TileState`, `MultiSourceLayoutState`, `MultiSourceLayoutMode`.

2. **Create `MultiSourceLayoutStore.ts`** -- state container extending `EventEmitter`. Manages tile list, mode, spacing, columns. Persistence to localStorage. Events: `layoutChanged`, `tileAdded`, `tileRemoved`, `modeChanged`, `activeTileChanged`.

3. **Create `MultiSourceLayoutManager.ts`** -- orchestration logic.
   - `enable(mode)` / `disable()` -- activate/deactivate multi-source layout.
   - `addSource(sourceIndex)` / `removeSource(tileId)` -- manage tile list.
   - `setMode(mode)` -- switch layout mode.
   - `computeViewports(canvasW, canvasH)` -- dispatch to appropriate layout algorithm, returning `TileViewport[]`.
   - `hitTest(canvasX, canvasY)` -- determine which tile contains a given point.
   - `setActiveTile(tileId)` -- update active tile.

4. **Extend `LayoutGroupNode`** -- add 'packed' mode alongside existing row/column/grid. Packed uses auto-calculated grid dimensions (currently grid already does this with `columns=0`; formalize it).

5. **Extend `LayoutProcessor`** -- add 'packed' to `LayoutMode` type. Delegate to the same `computeTileViewports()`.

6. **Integrate into `Viewer.renderImage()`** -- early return when multi-source layout is active:
   ```typescript
   if (this.multiSourceLayout.enabled) {
     this.renderMultiSource();
     return;
   }
   ```
   The `renderMultiSource()` method:
   - Fetches current frame image for each tile's source (reusing existing `getSequenceFrameSync`, `getVideoFrameCanvas`, `fileSourceNode.getIPImage()` paths).
   - Computes `TileViewport[]` from the layout manager.
   - Calls `ViewerGLRenderer.renderTiledHDR(tiles, displayWidth, displayHeight)` for the GPU path.
   - Falls back to Canvas 2D clipping for sources that cannot use WebGL.

7. **Create `MultiSourceLayoutControl.ts`** -- toolbar dropdown UI component (similar pattern to `CompareControl.ts`). Mode selector radio buttons, source list with add/remove, spacing slider.

8. **Wire in `AppViewWiring.ts`** -- connect `MultiSourceLayoutControl` events to `Viewer` / `MultiSourceLayoutManager`.

9. **Wire in `AppControlRegistry.ts`** -- instantiate `MultiSourceLayoutControl`, add to view control group.

10. **Wire in `buildViewTab.ts`** -- add layout dropdown button to the View tab toolbar.

11. **Backward compatibility**: When `ComparisonManager.setQuadViewEnabled(true)` is called, bridge to `MultiSourceLayoutManager.enable('packed')` with the 4 quad sources (A/B/C/D). Existing Quad View tests continue to pass.

### Phase 2: Per-Tile Zoom/Pan and Manual Mode

**Goal**: Independent zoom/pan per tile, Manual mode with drag handles.

12. **Create `TileTransformManager.ts`** -- wraps an array of `TransformManager` instances, one per tile. Provides:
    - `getTransformForTile(tileId)` -- returns tile-specific pan/zoom.
    - `setZoom(tileId, zoom)` / `setPan(tileId, x, y)` -- per-tile state mutation.
    - `resetTile(tileId)` -- fit-to-tile.
    - `resetAll()` -- fit all tiles.

13. **Modify `Viewer` pointer handling** -- `ViewerInputHandler` must route pointer events to the correct tile:
    - On `pointerdown`, call `multiSourceLayout.hitTest()` to determine target tile.
    - Route wheel events to the tile under cursor for per-tile zoom.
    - Route middle-click drag to per-tile pan.
    - Click on a tile sets it as active.

14. **Modify `Renderer.renderTiledImages()`** -- accept optional per-tile RenderState or per-tile transform overrides. Each tile may have different zoom/pan, requiring per-tile model-view matrix in the shader:
    ```typescript
    renderTiledImages(tiles: {
      image: IPImage;
      viewport: TileViewport;
      zoom?: number;
      panX?: number;
      panY?: number;
    }[]): void
    ```
    For each tile, compute a model-view matrix from zoom + pan and set `u_modelView` uniform before `renderImage()`.

15. **Create `TileDragHandleManager.ts`** -- DOM overlay for Manual mode drag handles.
    - Renders 8 handles per tile (4 corners + 4 edges) as small `<div>` elements, absolutely positioned over the canvas.
    - Pointer capture for drag operations.
    - Snapping logic (edge-to-edge, grid).
    - Updates `TileState.manualX/Y/Width/Height` on drag, triggers re-layout.

16. **Create `TileLabelOverlay.ts`** -- renders source name labels in tile corners. Updates on layout change.

17. **Create `TileBorderOverlay.ts`** -- renders borders/highlights around tiles. Active tile gets accent border.

18. **Manual mode viewport calculation** -- implement `manualViewports()` function that reads `TileState` manual position/size fields and converts to `TileViewport[]`.

### Phase 3: Independent Playback

**Goal**: Each tile can play its own source at its own frame independently.

19. **Create `TilePlaybackManager.ts`** -- manages per-tile frame state.
    - In `synchronized` mode: all tiles share `Session.currentFrame`. No extra state.
    - In `independent` mode: each tile has its own `currentFrame` counter. A lightweight per-tile playback loop ticks each tile independently using its source's FPS.
    - Events: `tileFrameChanged(tileId, frame)`.

20. **Extend `renderMultiSource()`** -- in independent mode, fetch each tile's source frame at its own `currentFrame` instead of `Session.currentFrame`.

21. **Per-tile playback controls** -- small play/pause icon overlay per tile in independent mode. Frame counter display per tile.

22. **Timeline interaction** -- when in independent mode, the timeline shows the active tile's frame range. Scrubbing affects only the active tile.

### Phase 4: Static Mode and Presets

23. **Static mode** -- same rendering as Manual, but `TileDragHandleManager` is disabled. Positions are read-only from the UI perspective.

24. **Layout presets** -- save/load named tile arrangements:
    ```typescript
    interface LayoutPreset {
      name: string;
      mode: MultiSourceLayoutMode;
      tiles: Array<{ manualX: number; manualY: number; manualWidth: number; manualHeight: number }>;
      spacing: number;
      columns: number;
    }
    ```
    Stored in localStorage. UI in the Layout dropdown for save/load/delete.

25. **Desktop OpenRV .rv file compatibility** -- when loading a GTO/RV session file that contains `RVLayoutGroup` nodes, parse the layout mode and populate `MultiSourceLayoutState` accordingly.

## Files to Create/Modify

### New Files

| File | Purpose |
|------|---------|
| `src/ui/components/MultiSourceLayoutTypes.ts` | Type definitions (`TileState`, `MultiSourceLayoutState`, `MultiSourceLayoutMode`) |
| `src/ui/components/MultiSourceLayoutStore.ts` | State management, persistence, events |
| `src/ui/components/MultiSourceLayoutManager.ts` | Orchestration: mode switching, viewport computation, hit testing, tile CRUD |
| `src/ui/components/MultiSourceLayoutControl.ts` | Toolbar dropdown UI (mode selector, source list, options) |
| `src/ui/components/MultiSourceLayoutRenderer.ts` | Rendering orchestration: fetch per-tile images, dispatch to GL or 2D path |
| `src/ui/components/TileTransformManager.ts` | Per-tile zoom/pan state (wraps array of `TransformManager`) |
| `src/ui/components/TileDragHandleManager.ts` | Manual mode drag handles (DOM overlay, pointer capture, snapping) |
| `src/ui/components/TileLabelOverlay.ts` | Source name labels per tile |
| `src/ui/components/TileBorderOverlay.ts` | Tile borders and active-tile highlight |
| `src/ui/components/TilePlaybackManager.ts` | Per-tile frame tracking for independent playback |
| `src/ui/components/MultiSourceLayoutManager.test.ts` | Unit tests for layout manager |
| `src/ui/components/MultiSourceLayoutStore.test.ts` | Unit tests for store |
| `src/ui/components/MultiSourceLayoutControl.test.ts` | Unit tests for control UI |
| `src/ui/components/TileTransformManager.test.ts` | Unit tests for per-tile transforms |
| `src/ui/components/TileDragHandleManager.test.ts` | Unit tests for drag handles |
| `src/ui/components/TilePlaybackManager.test.ts` | Unit tests for playback sync |

### Modified Files

| File | Changes |
|------|---------|
| `src/ui/components/Viewer.ts` | Add `multiSourceLayout` field. In `renderImage()`, check `multiSourceLayout.enabled` and call `renderMultiSource()`. Route pointer events through `hitTest()`. Add `renderMultiSource()` method. |
| `src/ui/components/ViewerInputHandler.ts` | Add tile-aware pointer routing: `hitTest` on `pointerdown` to determine target tile, route wheel zoom and middle-click pan to per-tile `TransformManager`. |
| `src/ui/components/ViewerGLRenderer.ts` | Extend `renderTiledHDR()` to accept optional per-tile zoom/pan transforms. |
| `src/render/Renderer.ts` | Extend `renderTiledImages()` to accept optional per-tile model-view uniforms for zoom/pan. |
| `src/render/RendererBackend.ts` | Update `renderTiledImages` signature in the interface to include optional per-tile transforms. |
| `src/render/WebGPUBackend.ts` | Update `renderTiledImages` stub signature. |
| `src/nodes/groups/LayoutGroupNode.ts` | Add `'packed'` to mode options (formalize existing auto-grid behavior). Add `'manual'` and `'static'` modes with per-tile position data. |
| `src/nodes/processors/LayoutProcessor.ts` | Add `'packed'`, `'manual'`, `'static'` to `LayoutMode` type. Implement `manualViewports()` for manual/static modes. |
| `src/ui/components/ComparisonManager.ts` | Add `setMultiSourceLayoutEnabled()` method. Bridge `setQuadViewEnabled()` to multi-source layout for backward compatibility. |
| `src/ui/components/CompareControl.ts` | Add layout mode section to the compare dropdown, or link to the separate Layout dropdown. |
| `src/core/session/ABCompareManager.ts` | Extend beyond A/B/C/D to support N source indices (e.g., `_sourceIndices: number[]`). Add `getSourceIndex(index: number)` and `setSource(index: number, sourceIndex: number)`. |
| `src/AppViewWiring.ts` | Wire `MultiSourceLayoutControl` events to `Viewer` and `MultiSourceLayoutManager`. |
| `src/AppControlRegistry.ts` | Instantiate `MultiSourceLayoutControl`. Add to view control group. |
| `src/services/controls/createViewControls.ts` | Create `MultiSourceLayoutControl` instance in the view control group factory. |
| `src/services/tabContent/buildViewTab.ts` | Add layout dropdown button to the View tab context toolbar. |
| `src/AppKeyboardHandler.ts` | Add keyboard shortcuts for layout mode cycling, tile selection, per-tile zoom. |
| `src/utils/input/KeyBindings.ts` | Register new key bindings for layout actions. |
| `src/services/KeyboardActionMap.ts` | Add layout-related keyboard action entries. |

## Risks

### Performance

**Risk**: Rendering N sources simultaneously multiplies GPU texture uploads and draw calls by N. For large sources (4K+) with N >= 4, this could drop below 30 FPS.

**Mitigation**:
- Interaction quality tiering (`InteractionQualityManager`) already reduces GL viewport during zoom/scrub. Extend to multi-source: reduce all tile viewports proportionally during interaction.
- Tile-level texture caching: only re-upload textures when a tile's source frame changes.
- LOD: when a tile is small (< 200px), render at reduced resolution.
- Lazy evaluation: only render visible tiles (all tiles are visible in grid modes, but in Manual mode tiles may overlap or extend off-screen).

### Memory

**Risk**: Per-tile `TransformManager` instances and per-tile frame caching increase memory usage linearly with tile count.

**Mitigation**:
- `TransformManager` is lightweight (a few numbers). No concern up to 100 tiles.
- Frame caching: in independent playback mode, each tile needs its own frame cache. Limit total cache size across all tiles (shared LRU pool). In synchronized mode, all tiles share the same frame number so cache pressure is the same as single-source.

### Complexity of Pointer Routing

**Risk**: Multi-source layout requires intercepting all pointer events before the existing `ViewerInputHandler` processes them, adding a complex dispatch layer.

**Mitigation**:
- Implement `hitTest()` as a simple bounding-box check against `TileViewport[]`.
- When multi-source layout is active, `ViewerInputHandler` delegates to `TileTransformManager` for the hit tile. When disabled, existing behavior is unchanged.
- Manual mode drag handles are separate DOM elements overlaid on the canvas -- they use standard DOM pointer capture and do not interact with the canvas event path.

### Backward Compatibility with Quad View

**Risk**: Replacing Quad View with multi-source layout could break existing test expectations and user workflows.

**Mitigation**:
- Keep `ComparisonManager.setQuadViewEnabled()` / `toggleQuadView()` API intact. Internally, bridge to `MultiSourceLayoutManager.enable('packed')` with 4 tiles mapped to A/B/C/D sources.
- Existing `QuadView.test.ts` tests continue to pass against the `ComparisonManager` API.
- New multi-source layout tests cover the extended functionality independently.

### Canvas 2D Fallback Path

**Risk**: The Canvas 2D path (`Viewer.renderImage()`) uses clip regions for split screen but does not have a general tiled rendering abstraction. CPU-only effects (noise reduction, film emulation) that require the 2D path will not work with multi-source layout tiles.

**Mitigation**:
- Phase 1: multi-source layout only uses the WebGL path. If GPU effects are not active and no source is HDR, fall back to Canvas 2D with per-tile `drawImage()` + clip regions (similar to existing `drawClippedSource()` approach).
- Long term: migrate CPU-only effects to compute shaders or WebGL post-processing to eliminate the 2D path dependency entirely.

### Independent Playback Complexity

**Risk**: Independent playback requires per-tile frame counters, per-tile `requestAnimationFrame` loops, and per-tile audio (if applicable). This is a significant increase in playback engine complexity.

**Mitigation**:
- Phase 3 implementation. Start with synchronized-only.
- Independent playback uses lightweight per-tile frame counters without audio (audio always follows the active tile).
- Reuse `PlaybackEngine.update()` logic but parameterized per tile rather than creating N full engine instances.

### WebGPU Backend

**Risk**: `WebGPUBackend.renderTiledImages()` is currently a stub. Multi-source layout will not work with WebGPU until implemented.

**Mitigation**: WebGPU backend is not yet the primary path. The WebGL2 path is fully functional and will remain the default. WebGPU tiled rendering can be implemented as a follow-up.

### Manual Mode Usability

**Risk**: Free-form tile positioning is harder to use than grid-based layouts. Users may struggle to create clean arrangements.

**Mitigation**:
- Snap-to-grid (configurable 8/16/32px grid step).
- Snap-to-edge (tiles snap to canvas edges and adjacent tile edges within 8px threshold).
- "Reset to grid" button that auto-arranges manually positioned tiles into a packed grid.
- Layout presets for common manual arrangements (e.g., "1 large + 3 small", "2x2 with pip").
