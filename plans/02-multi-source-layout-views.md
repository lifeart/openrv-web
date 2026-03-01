# Multi-Source Layout Views

## Overview

Desktop OpenRV supports four layout modes for viewing multiple sources simultaneously: **Packed** (auto-grid), **Row**, **Column**, and **Manual** (free-position with drag handles). The web version currently has a basic Quad View (4-up A/B/C/D comparison) backed by `ComparisonManager` and a tiled rendering path in the `Renderer`, but lacks a general-purpose, flexible multi-source layout system that supports arbitrary numbers of sources, per-tile zoom/pan, manual repositioning, and synchronized or independent playback.

> **Note on Static mode**: Desktop OpenRV does not have a distinct "Static" mode. It achieves fixed layouts by disabling manipulation tools. The web version introduces a dedicated Static mode as a convenience for fixed monitoring layouts, but this is a web-specific addition, not a direct desktop RV feature port.

This plan introduces a full **Multi-Source Layout** system that:

- Supports Packed, Row, Column, Manual, and Static layout modes
- Allows manual repositioning of tiles via drag handles (Manual mode)
- Provides per-source independent zoom/pan with per-tile aspect-ratio-correct fitting
- Supports synchronized and independent playback across tiles
- Integrates with the existing rendering pipeline (WebGL2 tiled rendering, 2D canvas fallback)
- Replaces and subsumes the current Quad View feature

### Compare vs Layout Interaction

**Layout mode and Compare mode (wipe, blend, difference) are mutually exclusive at the top level.** When Layout mode is activated, any active Compare mode (wipe, split screen, blend, difference matte) is deactivated. Conversely, activating a Compare mode deactivates Layout mode. The toolbar dropdowns enforce this mutual exclusion. This avoids ambiguity about whether compare operations apply within individual tiles or across the whole canvas.

In the future, per-tile comparison (e.g., wipe within a single tile) could be explored, but it is out of scope for this plan.

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
8. **No per-tile aspect-ratio fitting** -- current `renderImage(image, 0, 0, 1, 1)` stretches the image to fill the viewport, which is incorrect when sources have different resolutions.
9. **No texture caching across tiles** -- each `renderImage()` call re-uploads the texture via `texImage2D()`, which is prohibitively expensive for N tiles at 4K resolution.

## Proposed Architecture

### Design Principles

1. **State-first**: All layout state in a single `MultiSourceLayoutState` object, separate from DOM.
2. **Composition over inheritance**: New managers compose with existing `TransformManager`, `PlaybackEngine`, `ComparisonManager` rather than extending them.
3. **Backward compatible**: Quad View, wipe, split screen continue working. Multi-source layout is activated explicitly via the Layout dropdown. Layout and Compare modes are mutually exclusive.
4. **GPU-first rendering**: Tiled WebGL path is primary; canvas 2D fallback for CPU-only effects or when WebGL is unavailable.
5. **Progressive enhancement**: Start with Packed/Row/Column (Phase 1), add Manual/Static (Phase 2), per-tile playback (Phase 3).
6. **Aspect-ratio preservation**: Every tile letterboxes/pillarboxes its content to preserve the source's native aspect ratio by default.
7. **Texture caching**: Tile-level texture caching from Phase 1 -- only re-upload when a tile's source frame changes.

### Core Data Model

```typescript
// src/ui/multisource/MultiSourceLayoutTypes.ts

export type MultiSourceLayoutMode = 'packed' | 'row' | 'column' | 'manual' | 'static';

/** Per-tile content fitting mode */
export type TileFitMode = 'fit' | 'fill' | 'center';

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
  /** Grid spacing in pixels (minimum: 0) */
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

/** Maximum number of tiles allowed */
export const MAX_TILE_COUNT = 16;
```

### Per-Tile Aspect-Ratio Fitting

Each tile must preserve the source's aspect ratio by default (letterbox/pillarbox). The fit calculation computes a scale and offset to center the source within the tile viewport:

```typescript
function computeTileFit(
  sourceWidth: number,
  sourceHeight: number,
  tileWidth: number,
  tileHeight: number,
): { offsetX: number; offsetY: number; scaleX: number; scaleY: number } {
  const sourceAspect = sourceWidth / sourceHeight;
  const tileAspect = tileWidth / tileHeight;

  let scaleX: number, scaleY: number;
  if (sourceAspect > tileAspect) {
    // Source is wider than tile: pillarbox (horizontal fit, vertical letterbox)
    scaleX = 1.0;
    scaleY = tileAspect / sourceAspect;
  } else {
    // Source is taller than tile: letterbox (vertical fit, horizontal pillarbox)
    scaleX = sourceAspect / tileAspect;
    scaleY = 1.0;
  }

  const offsetX = (1.0 - scaleX) / 2;
  const offsetY = (1.0 - scaleY) / 2;

  return { offsetX, offsetY, scaleX, scaleY };
}
```

This fit is passed to `renderImage()` instead of `(0, 0, 1, 1)`, ensuring each tile displays its source with correct proportions.

### Texture Caching Strategy

To avoid re-uploading N textures per frame (each 4K RGBA float32 texture is ~135 MB), Phase 1 implements a per-source texture cache:

- Each source gets a cached WebGL texture object, keyed by `(sourceIndex, frameNumber)`.
- On `renderTiledImages()`, check if the cached texture matches the current frame. If so, bind it directly without re-upload.
- When the frame changes, upload the new data and update the cache key.
- In synchronized mode, all tiles share the same frame number, so sources that appear in multiple tiles share the same cached texture.
- Cache eviction: when a source is removed from the layout, its cached texture is deleted.

### Mismatched Frame Range Behavior

When sources have different frame ranges (e.g., Source A: frames 1001-1100, Source B: frames 1-50) and synchronized playback is active:

- **Default behavior: hold last frame.** When the shared playhead exceeds a source's frame range, the tile displays the last available frame of that source. This matches desktop OpenRV behavior.
- A subtle indicator (e.g., dimmed "HOLD" label in the tile corner) signals that the tile is displaying a held frame.

### Mismatched Frame Rate Behavior

When sources have different frame rates (e.g., 24fps vs 30fps) and synchronized playback is active:

- **The active tile's source FPS governs playback speed.** If no tile is explicitly active, the first tile's FPS is used.
- Other tiles map the playhead time to their own frame indices using their native FPS. This means tiles may display at slightly different frame cadences, but they remain time-synchronized.

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
  |     +-- computeTileFit() (per-tile aspect-ratio fitting)
  |     +-- TileTextureCache (per-source texture caching)
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
  |-- renderImage() checks: if (multiSourceLayout.enabled) { delegate to MultiSourceLayoutRenderer; return; }
  |-- resize() notifies MultiSourceLayoutManager of new canvas dimensions
  |-- pointer events: MultiSourceLayoutManager.hitTest() to determine active tile
  |
ViewerGLRenderer.ts
  |-- renderMultiSource() method: fetches per-tile images, computes viewports, renders via Renderer
  |     (keeps rendering logic out of Viewer.ts to avoid bloating it further)
  |
AppViewWiring.ts
  |-- Wire MultiSourceLayoutControl events to Viewer/Manager
  |
ComparisonManager.ts
  |-- setQuadViewEnabled() bridges to MultiSourceLayoutManager (backward compat)
  |-- Activating Layout mode deactivates any active Compare mode, and vice versa
  |
MultiSourceLayoutManager.ts
  |-- Owns its own source index list (independent of ABCompareManager)
  |-- ABCompareManager retains its A/B/C/D scope; is NOT extended to N indices
```

### HiDPI Handling

Tile viewport coordinates must be computed in **physical pixels** (CSS dimensions * `devicePixelRatio`), not CSS pixels. The existing `setupHiDPICanvas` utility handles main canvas setup, but layout-specific code must:

- Pass `canvas.width` and `canvas.height` (physical pixels) to `computeTileViewports()`, not `canvas.clientWidth`/`canvas.clientHeight` (CSS pixels).
- DOM overlay elements (labels, borders, drag handles) use CSS pixel coordinates. A conversion utility maps between physical pixel tile viewports and CSS pixel overlay positions: `cssX = physicalX / devicePixelRatio`.

## Layout Algorithms

### Packed Mode (Auto-Grid)

Reuses existing `computeTileViewports()` with auto-calculated grid dimensions. This is functionally equivalent to the existing `grid` mode with `columns=0` in `LayoutGroupNode`, formalized under the name "packed" for clarity in the UI.

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

Same as Manual, but without drag handles. Tile positions are set programmatically (via presets or API) and cannot be changed by pointer interaction. Used for fixed monitoring layouts. This is a web-specific addition (desktop OpenRV achieves the same by disabling manipulation tools rather than having a distinct mode).

### Single-Source Behavior

When layout mode is enabled with only one source loaded, the layout shows a single full-size tile that fills the entire canvas. This is visually identical to the normal single-source view. Empty grid slots are never shown.

## UI Design

### Toolbar Integration

Add a "Layout" dropdown button to the View tab context toolbar (next to existing Compare dropdown):

```
[Zoom] [Channel] | [Compare v] [Layout v] [Stereo] ...
```

Activating a Layout mode automatically deactivates any active Compare mode, and vice versa. The dropdowns visually reflect this mutual exclusion (e.g., the inactive dropdown shows its label in a dimmed state).

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
|  (max 16 sources)         |
|---------------------------|
| Options                   |
|  Spacing: [===] 4px       |
|  Columns: [===] auto      |
|  Labels: [x]              |
|  Borders: [x]             |
|  Playback: [Sync|Indep]   |
+---------------------------+
```

### Tile Selected Sources Action

In addition to the dropdown source-add flow, users can select multiple sources in the session/source list and press `Shift+L` to immediately tile the selected sources in the current layout mode (or Packed mode if layout is off). This provides a fast path for the common "compare these shots" workflow, similar to desktop OpenRV's session browser behavior.

### Tile Interaction

**Active Tile Selection**: Clicking on a tile makes it "active" (highlighted border). Keyboard shortcuts (zoom, pan, frame step) apply to the active tile.

**Per-Tile Zoom/Pan**: Scroll wheel zooms the tile under the cursor. Middle-click + drag pans within a tile. Double-click resets to fit-to-tile (with aspect-ratio-correct letterbox/pillarbox).

**Manual Mode Drag Handles**: When Manual mode is active, hovering a tile shows:
- Corner handles (resize diagonally)
- Edge handles (resize one axis)
- Center grab area (reposition)

Handle visuals: Small squares at corners (8x8px), bars along edges. Semi-transparent when idle, opaque on hover. CSS cursor changes to indicate resize direction.

**DOM Overlay Synchronization**: Drag handle, label, and border DOM overlays are positioned in the same `requestAnimationFrame` callback as the canvas render. `ResizeObserver` is used for canvas dimension changes to prevent misalignment during resize.

**Tile Labels**: Source name shown in the bottom-left corner of each tile. Semi-transparent background, `font-size: 11px`. Hidden when tile is too small (< 120px wide).

**Active Tile Border**: 2px accent-color border around the active tile. Other tiles have 1px muted border.

### Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Tab` / `Shift+Tab` | Cycle active tile (only when layout mode is active; calls `event.preventDefault()` to suppress browser focus behavior; when layout is disabled, `Tab` retains default browser behavior) |
| `Alt+1` - `Alt+9` | Select tile by index (plain `1-9` keys are already bound to tab navigation via `Digit1`-`Digit6`) |
| `L` | Cycle layout mode |
| `Shift+L` | Toggle layout on/off (also: "tile selected sources" when sources are selected) |
| `=` / `-` | Zoom active tile in/out |
| `0` | Reset active tile zoom to fit |
| Arrow keys | Pan active tile |
| `Space` | Play/pause (all tiles if synced, active tile if independent) |

## Implementation Steps

### Phase 1: Core Layout Infrastructure (Grid Modes)

**Goal**: Packed, Row, Column modes with shared zoom/pan, synchronized playback, per-tile aspect-ratio fitting, and tile-level texture caching.

1. **Create `MultiSourceLayoutTypes.ts`** (in `src/ui/multisource/`) -- type definitions for `TileState`, `MultiSourceLayoutState`, `MultiSourceLayoutMode`, `TileFitMode`, `MAX_TILE_COUNT`.

2. **Create `MultiSourceLayoutStore.ts`** (in `src/ui/multisource/`) -- state container extending `EventEmitter`. Manages tile list, mode, spacing, columns. Persistence to localStorage. Events: `layoutChanged`, `tileAdded`, `tileRemoved`, `modeChanged`, `activeTileChanged`. Enforces `MAX_TILE_COUNT` (16) limit; rejects `addSource` calls beyond the limit with a warning.

3. **Create `MultiSourceLayoutManager.ts`** (in `src/ui/multisource/`) -- orchestration logic.
   - `enable(mode)` / `disable()` -- activate/deactivate multi-source layout. On enable, deactivates any active Compare mode via `ComparisonManager`. On disable, cleans up all tile state.
   - `addSource(sourceIndex)` / `removeSource(tileId)` -- manage tile list. On remove, remaining tiles redistribute to fill the gap (no empty slots). Enforces `MAX_TILE_COUNT`.
   - `tileSelectedSources(sourceIndices)` -- bulk-add sources from a session selection, enabling layout mode if not already active.
   - `setMode(mode)` -- switch layout mode.
   - `computeViewports(canvasW, canvasH)` -- dispatch to appropriate layout algorithm, returning `TileViewport[]`. Receives physical pixel dimensions (post-DPR scaling).
   - `hitTest(canvasX, canvasY)` -- determine which tile contains a given point.
   - `setActiveTile(tileId)` -- update active tile.
   - `dispose()` -- clean up all per-tile `TransformManager` instances, cached textures, and event listeners.

4. **Implement per-tile aspect-ratio fitting** -- `computeTileFit()` function that calculates scale and offset for letterbox/pillarbox fitting within each tile viewport. Integrated into the render path so each tile preserves its source's native aspect ratio.

5. **Implement tile-level texture caching** -- `TileTextureCache` class that caches WebGL texture objects keyed by `(sourceIndex, frameNumber)`. Only re-uploads via `texImage2D()` when the frame changes. Deletes cached textures on source removal. This is a Phase 1 requirement, not a deferred optimization.

6. **Extend `LayoutGroupNode`** -- add 'packed' as a formalized alias for the existing `grid` mode with `columns=0`. Clarification: `packed` is not a new computation path but a named entry point that delegates to the existing auto-grid calculation. Add 'manual' and 'static' modes for Phase 2.

7. **Extend `LayoutProcessor`** -- add 'packed' to `LayoutMode` type. Delegate to the same `computeTileViewports()`.

8. **Integrate into `Viewer.renderImage()`** -- early return when multi-source layout is active:
   ```typescript
   if (this.multiSourceLayout.enabled) {
     this.viewerGLRenderer.renderMultiSource(this.multiSourceLayout);
     return;
   }
   ```
   The rendering is delegated to `ViewerGLRenderer.renderMultiSource()` to avoid bloating `Viewer.ts`.

9. **Implement `ViewerGLRenderer.renderMultiSource()`** -- new method on ViewerGLRenderer that:
   - Fetches current frame image for each tile's source (reusing existing `getSequenceFrameSync`, `getVideoFrameCanvas`, `fileSourceNode.getIPImage()` paths).
   - Handles mismatched frame ranges: when the playhead exceeds a source's range, holds the last frame.
   - Computes `TileViewport[]` from the layout manager (in physical pixels).
   - Computes per-tile aspect-ratio fit via `computeTileFit()`.
   - Uses `TileTextureCache` to avoid redundant texture uploads.
   - Calls `Renderer.renderTiledImages()` for the GPU path.
   - Falls back to Canvas 2D clipping for sources that cannot use WebGL.

10. **Handle single-source gracefully** -- when only one source is in the layout, render it as a single full-size tile identical to the normal view. No empty grid slots.

11. **Define Canvas 2D fallback behavior** -- when WebGL is unavailable (initialization failure), multi-source layout falls back to a minimal Canvas 2D tiled renderer using `drawImage()` + `save()`/`restore()`/`clip()`. If neither WebGL nor Canvas 2D can support tiling (unlikely), multi-source layout is disabled with a user-facing message.

12. **Create `MultiSourceLayoutControl.ts`** (in `src/ui/components/`) -- toolbar dropdown UI component (similar pattern to `CompareControl.ts`). Mode selector radio buttons, source list with add/remove (showing tile count limit), spacing slider (minimum: 0).

13. **Wire in `AppViewWiring.ts`** -- connect `MultiSourceLayoutControl` events to `Viewer` / `MultiSourceLayoutManager`. Wire mutual exclusion with `ComparisonManager`: activating Layout deactivates Compare, and vice versa.

14. **Wire in `AppControlRegistry.ts`** -- instantiate `MultiSourceLayoutControl`, add to view control group.

15. **Wire in `buildViewTab.ts`** -- add layout dropdown button to the View tab toolbar.

16. **Backward compatibility**: When `ComparisonManager.setQuadViewEnabled(true)` is called, bridge to `MultiSourceLayoutManager.enable('packed')` with the 4 quad sources (A/B/C/D). Existing Quad View tests continue to pass.

17. **Address HiDPI scaling** -- ensure `computeTileViewports()` receives physical pixel dimensions (`canvas.width`, `canvas.height`), not CSS dimensions. DOM overlays use CSS pixel coordinates via `physicalX / devicePixelRatio` conversion.

### Phase 2: Per-Tile Zoom/Pan and Manual Mode

**Goal**: Independent zoom/pan per tile, Manual mode with drag handles.

18. **Create `TileTransformManager.ts`** (in `src/ui/multisource/`) -- wraps an array of `TransformManager` instances, one per tile. Provides:
    - `getTransformForTile(tileId)` -- returns tile-specific pan/zoom.
    - `setZoom(tileId, zoom)` / `setPan(tileId, x, y)` -- per-tile state mutation.
    - `resetTile(tileId)` -- fit-to-tile (aspect-ratio-correct).
    - `resetAll()` -- fit all tiles.
    - `disposeTile(tileId)` -- properly dispose a tile's `TransformManager` when the tile is removed, cleaning up any event listeners or canvas references to prevent memory leaks.
    - `dispose()` -- dispose all tile transforms.

19. **Modify `Viewer` pointer handling** -- `ViewerInputHandler` must route pointer events to the correct tile:
    - On `pointerdown`, call `multiSourceLayout.hitTest()` to determine target tile.
    - Route wheel events to the tile under cursor for per-tile zoom.
    - Route middle-click drag to per-tile pan.
    - Click on a tile sets it as active.

20. **Modify `Renderer.renderTiledImages()`** -- accept optional per-tile RenderState or per-tile transform overrides. Each tile may have different zoom/pan, requiring per-tile model-view matrix in the shader:
    ```typescript
    renderTiledImages(tiles: {
      image: IPImage;
      viewport: TileViewport;
      fitOffset?: { offsetX: number; offsetY: number; scaleX: number; scaleY: number };
      zoom?: number;
      panX?: number;
      panY?: number;
    }[]): void
    ```
    For each tile, compute a model-view matrix from fit + zoom + pan and set `u_modelView` uniform before `renderImage()`. When consecutive tiles share the same `RenderState` (color pipeline settings), skip redundant uniform setup to reduce WebGL state thrashing.

21. **Create `TileDragHandleManager.ts`** (in `src/ui/components/`) -- DOM overlay for Manual mode drag handles.
    - Renders 8 handles per tile (4 corners + 4 edges) as small `<div>` elements, absolutely positioned over the canvas.
    - Pointer capture for drag operations.
    - Snapping logic (edge-to-edge, grid).
    - Updates `TileState.manualX/Y/Width/Height` on drag, triggers re-layout.
    - Overlay positions updated in the same `requestAnimationFrame` as canvas render; `ResizeObserver` used for canvas size changes.

22. **Create `TileLabelOverlay.ts`** (in `src/ui/components/`) -- renders source name labels in tile corners. Updates on layout change. Includes "HOLD" indicator when a tile is displaying a held frame (past its source's frame range).

23. **Create `TileBorderOverlay.ts`** (in `src/ui/components/`) -- renders borders/highlights around tiles. Active tile gets accent border.

24. **Manual mode viewport calculation** -- implement `manualViewports()` function that reads `TileState` manual position/size fields and converts to `TileViewport[]`.

### Phase 3: Independent Playback

**Goal**: Each tile can play its own source at its own frame independently.

25. **Create `TilePlaybackManager.ts`** (in `src/ui/multisource/`) -- manages per-tile frame state.
    - In `synchronized` mode: all tiles share `Session.currentFrame`. The active tile's source FPS governs playback speed. Other tiles map the playhead time to their native frame indices. No extra state.
    - In `independent` mode: each tile has its own `currentFrame` counter. A lightweight per-tile playback loop ticks each tile independently using its source's FPS.
    - Events: `tileFrameChanged(tileId, frame)`.

26. **Extend `renderMultiSource()`** -- in independent mode, fetch each tile's source frame at its own `currentFrame` instead of `Session.currentFrame`.

27. **Per-tile playback controls** -- small play/pause icon overlay per tile in independent mode. Frame counter display per tile.

28. **Timeline interaction** -- when in independent mode, the timeline shows the active tile's frame range. Scrubbing affects only the active tile.

### Phase 4: Static Mode and Presets

29. **Static mode** -- same rendering as Manual, but `TileDragHandleManager` is disabled. Positions are read-only from the UI perspective.

30. **Layout presets** -- save/load named tile arrangements:
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

31. **Desktop OpenRV .rv file compatibility** -- when loading a GTO/RV session file that contains `RVLayoutGroup` nodes, parse the layout mode and populate `MultiSourceLayoutState` accordingly.

## Files to Create/Modify

### New Files

| File | Purpose |
|------|---------|
| `src/ui/multisource/MultiSourceLayoutTypes.ts` | Type definitions (`TileState`, `MultiSourceLayoutState`, `MultiSourceLayoutMode`, `TileFitMode`, `MAX_TILE_COUNT`) |
| `src/ui/multisource/MultiSourceLayoutStore.ts` | State management, persistence, events, tile count limit enforcement |
| `src/ui/multisource/MultiSourceLayoutManager.ts` | Orchestration: mode switching, viewport computation, hit testing, tile CRUD, disposal protocol |
| `src/ui/multisource/MultiSourceLayoutRenderer.ts` | Rendering orchestration: per-tile aspect-ratio fitting, texture caching, dispatch to GL or 2D path |
| `src/ui/multisource/TileTransformManager.ts` | Per-tile zoom/pan state (wraps array of `TransformManager`), per-tile disposal |
| `src/ui/multisource/TileTextureCache.ts` | Per-source WebGL texture caching, keyed by (sourceIndex, frameNumber) |
| `src/ui/multisource/TilePlaybackManager.ts` | Per-tile frame tracking for independent playback, FPS governance logic |
| `src/ui/components/MultiSourceLayoutControl.ts` | Toolbar dropdown UI (mode selector, source list with tile count limit, options) |
| `src/ui/components/TileDragHandleManager.ts` | Manual mode drag handles (DOM overlay, pointer capture, snapping, ResizeObserver sync) |
| `src/ui/components/TileLabelOverlay.ts` | Source name labels per tile, "HOLD" indicator for held frames |
| `src/ui/components/TileBorderOverlay.ts` | Tile borders and active-tile highlight |
| `src/ui/multisource/__tests__/MultiSourceLayoutManager.test.ts` | Unit tests for layout manager |
| `src/ui/multisource/__tests__/MultiSourceLayoutStore.test.ts` | Unit tests for store |
| `src/ui/multisource/__tests__/TileTransformManager.test.ts` | Unit tests for per-tile transforms |
| `src/ui/multisource/__tests__/TileTextureCache.test.ts` | Unit tests for texture caching |
| `src/ui/multisource/__tests__/TilePlaybackManager.test.ts` | Unit tests for playback sync |
| `src/ui/components/__tests__/MultiSourceLayoutControl.test.ts` | Unit tests for control UI |
| `src/ui/components/__tests__/TileDragHandleManager.test.ts` | Unit tests for drag handles |

### Modified Files

| File | Changes |
|------|---------|
| `src/ui/components/Viewer.ts` | Add `multiSourceLayout` field. In `renderImage()`, check `multiSourceLayout.enabled` and delegate to `ViewerGLRenderer.renderMultiSource()`. Route pointer events through `hitTest()`. Minimal additions to avoid bloating this file. |
| `src/ui/components/ViewerInputHandler.ts` | Add tile-aware pointer routing: `hitTest` on `pointerdown` to determine target tile, route wheel zoom and middle-click pan to per-tile `TransformManager`. |
| `src/ui/components/ViewerGLRenderer.ts` | Add `renderMultiSource()` method. Extend `renderTiledHDR()` to accept optional per-tile zoom/pan transforms and per-tile aspect-ratio fit parameters. |
| `src/render/Renderer.ts` | Extend `renderTiledImages()` to accept optional per-tile model-view uniforms for zoom/pan and fit offsets. Add fast path to skip redundant uniform setup for tiles with identical RenderState. |
| `src/render/RendererBackend.ts` | Update `renderTiledImages` signature in the interface to include optional per-tile transforms and fit parameters. |
| `src/render/WebGPUBackend.ts` | Update `renderTiledImages` stub signature. |
| `src/nodes/groups/LayoutGroupNode.ts` | Add `'packed'` as a formalized alias for auto-grid (existing `grid` with `columns=0`). Add `'manual'` and `'static'` modes with per-tile position data. |
| `src/nodes/processors/LayoutProcessor.ts` | Add `'packed'`, `'manual'`, `'static'` to `LayoutMode` type. Implement `manualViewports()` for manual/static modes. |
| `src/ui/components/ComparisonManager.ts` | Add mutual exclusion logic: activating Layout deactivates Compare modes, and vice versa. Bridge `setQuadViewEnabled()` to multi-source layout for backward compatibility. |
| `src/ui/components/CompareControl.ts` | Add mutual exclusion UI behavior: dim the Compare dropdown when Layout is active. |
| `src/AppViewWiring.ts` | Wire `MultiSourceLayoutControl` events to `Viewer` and `MultiSourceLayoutManager`. Wire mutual exclusion between Layout and Compare. |
| `src/AppControlRegistry.ts` | Instantiate `MultiSourceLayoutControl`. Add to view control group. |
| `src/services/controls/createViewControls.ts` | Create `MultiSourceLayoutControl` instance in the view control group factory. |
| `src/services/tabContent/buildViewTab.ts` | Add layout dropdown button to the View tab context toolbar. |
| `src/AppKeyboardHandler.ts` | Add keyboard shortcuts for layout mode cycling (`L`, `Shift+L`), tile selection (`Alt+1` - `Alt+9`), per-tile zoom. `Tab` cycling only active when layout is enabled (with `preventDefault`). |
| `src/utils/input/KeyBindings.ts` | Register new key bindings for layout actions. Use `Alt+Digit1` - `Alt+Digit9` for tile selection to avoid conflict with existing `Digit1`-`Digit6` tab navigation bindings. |
| `src/services/KeyboardActionMap.ts` | Add layout-related keyboard action entries. |

## Risks

### Performance

**Risk**: Rendering N sources simultaneously multiplies GPU texture uploads and draw calls by N. For large sources (4K+) with N >= 4, this could drop below 30 FPS.

**Mitigation**:
- **Tile-level texture caching (Phase 1 requirement)**: only re-upload textures when a tile's source frame changes. This eliminates redundant uploads for static frames and reduces bandwidth from N*135MB/frame to only the tiles whose frames actually changed.
- **Redundant uniform skip**: when consecutive tiles share the same RenderState (color pipeline settings), skip the full uniform setup pass and only update the tile-specific uniforms (viewport, model-view matrix, texture).
- Interaction quality tiering (`InteractionQualityManager`) already reduces GL viewport during zoom/scrub. Extend to multi-source: reduce all tile viewports proportionally during interaction.
- **LOD for small tiles**: when a tile is small (< 200px), render at reduced resolution. For layouts with more than 4 tiles, use pre-existing mipmaps or skip-line upload to avoid uploading full 4K textures for 480x270 tile viewports. This should be implemented in Phase 1 for layouts with > 4 tiles.
- Lazy evaluation: only render visible tiles (all tiles are visible in grid modes, but in Manual mode tiles may overlap or extend off-screen).

### Memory

**Risk**: Per-tile `TransformManager` instances and per-tile frame caching increase memory usage linearly with tile count.

**Mitigation**:
- `TransformManager` is lightweight (a few numbers). No concern up to the 16-tile maximum.
- Frame caching: in independent playback mode, each tile needs its own frame cache. Limit total cache size across all tiles (shared LRU pool). In synchronized mode, all tiles share the same frame number so cache pressure is the same as single-source.
- **Disposal protocol**: when tiles are removed, their `TransformManager` instances and cached textures must be properly disposed. `MultiSourceLayoutManager.dispose()` and `TileTransformManager.disposeTile()` handle cleanup to prevent memory leaks from orphaned event listeners or canvas references.

### Tile Count Limit

**Risk**: Rendering 16+ tiles simultaneously is visually useless and will destroy GPU performance. Users may attempt to add excessive numbers of sources.

**Mitigation**:
- Enforce a hard limit of `MAX_TILE_COUNT = 16` in the UI and store. The `addSource()` method rejects additions beyond this limit with a user-facing warning message. The dropdown shows the current count and maximum.

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
- Phase 1: When WebGL is available, multi-source layout uses the WebGL path. If GPU effects are not active and no source is HDR, fall back to Canvas 2D with per-tile `drawImage()` + clip regions (similar to existing `drawClippedSource()` approach).
- When WebGL is unavailable entirely, a minimal Canvas 2D tiled renderer is provided. If even Canvas 2D cannot support tiling, multi-source layout is disabled with a user-facing message.
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

### DOM Overlay Synchronization

**Risk**: Drag handles, labels, and borders are DOM elements overlaid on a `<canvas>`. Canvas rendering and DOM layout use different coordinate systems and timing. On resize, reflow, or scroll, the DOM overlay positions must be recalculated to match the canvas tile positions exactly, or visual glitches (1-pixel misalignment, flickering) will occur.

**Mitigation**:
- Overlay positions are updated in the same `requestAnimationFrame` callback as the canvas render.
- `ResizeObserver` is used for canvas dimension changes rather than relying on window resize events.
- All position calculations go through a shared coordinate conversion utility that maps physical pixel tile viewports to CSS pixel overlay positions.

## Review Notes

The following items from expert review are deferred to Phase 2+ as "nice to have" enhancements:

1. **Per-tile fit/fill/center modes**: Beyond the default letterbox fit, allow users to choose fill (crop to fill tile) or center (1:1 pixel mapping, no scaling) per tile. This matches desktop OpenRV's per-source transform options. The `TileFitMode` type is already defined in the data model to support this.

2. **Screen reader ARIA labels for tiles**: Add `aria-label` attributes to tile overlay elements with source name and frame number (e.g., "Tile 1: shot_v003.exr, frame 1042").

3. **High-contrast active tile indicator**: The 2px accent-color border may be insufficient against high-brightness image content. Add a corner badge or animated glow effect as a secondary indicator that is visible regardless of underlying image brightness.

4. **Built-in layout presets library**: Ship a set of built-in presets ("2-up", "3-up L-shape", "4-up quad", "1 large + 3 small") in addition to user-saved presets.

5. **Tile reorder via drag**: Allow reordering tiles in Packed/Row/Column modes by dragging a tile to a different position in the grid.
