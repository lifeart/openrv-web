# Plan 10: Nearest-Neighbor vs. Bilinear Filter Toggle

## Overview

Desktop OpenRV uses the **N** key to toggle between nearest-neighbor (pixel-accurate QC at 1:1 zoom) and bilinear filtering (smooth interpolation). The web version currently hardcodes `gl.LINEAR` on all image texture uploads. This plan adds a user-togglable filter mode that switches the primary image texture between `gl.NEAREST` and `gl.LINEAR`, with a transient HUD indicator, a persistent status badge, and localStorage persistence.

### Why This Matters

- **Pixel-accurate QC**: At 1:1 or higher zoom, nearest-neighbor shows exact pixel boundaries without blending, critical for QC workflows (dead pixels, compression artifacts, single-pixel detail).
- **Desktop parity**: OpenRV desktop users expect the N key toggle behavior.
- **Bilinear default**: Bilinear filtering remains the default for smooth presentation at fractional zoom levels.

### Zoom-Level Interaction Note

Nearest-neighbor at zoomed-out views (e.g., fit-to-window for a 4K image in a 1080p viewport) will produce visible aliasing. This is expected and informative for QC but may confuse casual users. The persistent status badge (see UI Design) and the shortcuts dialog entry help with discoverability.

---

## Current State

### Texture Filtering Locations

All image texture uploads in `Renderer.ts` hardcode `gl.LINEAR`:

1. **VideoFrame HDR path** (line ~780-783): `_videoFrameTexture` created with `LINEAR` min/mag filters.
2. **Non-VideoFrame typed array path** (line ~852-855): Image textures set to `LINEAR` on every `updateTexture()` call. Mipmapped images use `LINEAR_MIPMAP_LINEAR` for min filter.
3. **SDR frame path** (`renderSDRFrame`, line ~2108-2111): `sdrTexture` created with `LINEAR`. Mipmapped for static HTMLImageElement sources.
4. **ImageBitmap fast path** (line ~880): Min filter set to `LINEAR` after upload.

Other textures (LUTs, FBO ping-pong, scope FBOs) are intentionally `NEAREST` or `LINEAR` for correctness and should **not** be affected by this toggle.

### Texture Cache Manager

`TextureCacheManager.ts` (line 231-232) also sets `LINEAR` on cached textures. These are used for the texture pool, not directly for displayed images, but may need to be updated if the cache feeds the display pipeline.

### Key Binding Conflict

The **N** key (plain, no modifiers) is currently bound to `notes.addNote` in `DEFAULT_KEY_BINDINGS` (`KeyBindings.ts`, line 548-551). This is a conflict that must be resolved.

**Resolution**: Reassign the filter toggle to a non-conflicting key. Options:
- **Option A** (recommended): Use `KeyN` with no modifiers and move `notes.addNote` to require a context (`paint` or `annotate` tab), since adding notes is contextual. The filter toggle is a global view action like fit-to-window (`F`).
- **Option B**: Use `Shift+KeyN` (but this conflicts with `network.togglePanel`).
- **Option C**: Use a different key entirely (e.g., `KeyQ` without modifiers -- but this may conflict with `view.toggleSpotlight` which is `Shift+KeyQ`).

Given desktop OpenRV parity, **Option A is recommended**: register `view.toggleFilterMode` on `KeyN` (no modifiers) as a global action, and add `notes.addNote` to the `CONFLICTING_DEFAULTS` set in `AppKeyboardHandler.ts` (it already has a similar pattern for `paint.line`, `paint.rectangle`, etc.). Additionally, add `context: 'annotate'` to the `notes.addNote` binding definition so that if users remap it to a custom key, it only fires in the annotate context rather than globally.

### 2D Canvas `imageSmoothingEnabled` Sites

The 2D canvas rendering path (non-WebGL) uses `ctx.imageSmoothingEnabled` for filtering. The following locations currently hardcode `imageSmoothingEnabled = true` and must all respect the filter mode:

**In `Viewer.ts`:**
- Line ~1642
- Line ~1981
- Line ~2101
- Line ~3595

**In `ViewerRenderingUtils.ts`:**
- Line ~72
- Line ~474

Each of these must be updated to set `ctx.imageSmoothingEnabled = (mode === 'linear')` based on the current filter mode.

### Export Path Isolation

`ViewerExport.ts` also hardcodes `imageSmoothingEnabled = true` in several export functions. The filter mode should **not** affect exports -- exports should always use bilinear for quality. Since the export path uses its own canvas contexts (not the viewer's GL renderer), it is naturally isolated. No changes are needed for exports.

### No Visual Indicator Pattern

The codebase does not have a toast/notification system for transient status messages. The closest patterns are:
- **OverlayManager** (`src/ui/components/OverlayManager.ts`): Manages persistent overlays (safe areas, matte, timecode, pixel probe).
- **AutoSaveIndicator** (`src/ui/components/AutoSaveIndicator.ts`): A small persistent status badge.
- **Missing-frame overlay**: A per-frame overlay in the Viewer.

A lightweight transient HUD indicator will be implemented as a simple DOM element appended to the viewer container, auto-dismissed after ~1.5 seconds. A persistent status badge will also be added (see UI Design).

---

## Proposed Architecture

### Data Flow

```
KeyboardManager  --(N key)-->  App action handler
                                   |
                     Viewer.toggleFilterMode()
                       |                    |
              Update localStorage     Show HUD indicator
                       |                    |
              GLRenderer.setFilterMode(mode)  Update persistent badge
                       |
              Renderer.setTextureFilterMode(mode)
                       |
              gl.texParameteri(NEAREST/LINEAR)
                       |
              scheduleRender() -- re-render current frame
```

### State Ownership

- **Viewer** owns the filter mode state (`'nearest' | 'linear'`), persists to localStorage, and creates the HUD indicator and persistent badge.
- **Renderer** (WebGL2Backend) exposes a `setTextureFilterMode(mode)` method that updates internal state and re-applies texture parameters on the next render.
- **RendererBackend** interface adds `setTextureFilterMode` and `getTextureFilterMode` methods.

### Type Definitions

```typescript
// In src/core/types/filter.ts (extend existing)
export type TextureFilterMode = 'nearest' | 'linear';
```

---

## WebGL Changes

### Renderer.ts Modifications

Add a private field and public methods to the `Renderer` class:

```typescript
private _textureFilterMode: TextureFilterMode = 'linear';
private _mipmappedTextures: Set<WebGLTexture> = new Set();

setTextureFilterMode(mode: TextureFilterMode): void {
  if (this._textureFilterMode === mode) return;
  this._textureFilterMode = mode;
}

getTextureFilterMode(): TextureFilterMode {
  return this._textureFilterMode;
}
```

Note: No `_filterModeDirty` flag is needed. The recommended approach calls `applyImageTextureFilter()` unconditionally on every render, which is cheap (two GL state calls) and avoids dirty-flag tracking complexity.

### Mipmap Tracking

When mipmaps are generated in `updateTexture()`, register the texture in the `_mipmappedTextures` set:

```typescript
// In updateTexture(), after gl.generateMipmap(gl.TEXTURE_2D):
this._mipmappedTextures.add(texture);
```

When a texture is deleted or recycled, remove it from the set.

### Texture Parameter Application

The filter mode affects **only the primary image texture** (unit 0). All other textures (LUTs, FBOs, scope textures) retain their existing filter modes.

**Recommended approach**: Apply the filter mode in `renderImage()` and `renderSDRFrame()` right before the draw call, after the texture is bound. This is a centralized approach that ensures consistency:

```typescript
// In Renderer.ts
private applyImageTextureFilter(texture: WebGLTexture): void {
  const gl = this.gl!;
  const magFilter = this._textureFilterMode === 'nearest' ? gl.NEAREST : gl.LINEAR;
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, magFilter);

  if (this._textureFilterMode === 'nearest') {
    // In nearest mode, disable mipmap sampling entirely.
    // This is correct for pixel-accurate QC: at zoomed-out views
    // the aliasing is expected and informative (shows the actual pixel grid).
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  } else {
    // In bilinear mode, restore mipmap sampling for textures that have mipmaps.
    // Without this, round-tripping through nearest mode would permanently degrade
    // texture quality for mipmapped content until re-upload.
    const hasMipmaps = this._mipmappedTextures.has(texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER,
      hasMipmaps ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR);
  }
}
```

This method is called in **two** places:
1. `renderImage()` after binding `image.texture` to unit 0
2. `renderSDRFrame()` after binding `this.sdrTexture` to unit 0

Note: `renderTiledImages()` delegates to `renderImage()` for each tile (line ~569), so it does **not** need its own `applyImageTextureFilter()` call. The filter is applied transitively through the `renderImage()` call.

### RendererBackend Interface

Add to `RendererBackend.ts`:

```typescript
/** Set the texture filtering mode for the primary image texture. */
setTextureFilterMode(mode: 'nearest' | 'linear'): void;

/** Get the current texture filtering mode. */
getTextureFilterMode(): 'nearest' | 'linear';
```

### RenderState Integration

For architectural consistency with the existing batch state pattern, add `textureFilterMode` to the `RenderState` interface:

```typescript
// In RenderState interface
textureFilterMode?: TextureFilterMode;
```

Handle it in `applyRenderState()` so the filter mode is included when full state snapshots are applied (e.g., for async rendering or state synchronization).

### WebGPUBackend Stub

The `WebGPUBackend` stores the mode but does not apply it (the backend is currently a stub for rendering). When the WebGPU pipeline is implemented, it will use `GPUSamplerDescriptor.magFilter` / `minFilter`.

### TextureCacheManager

`TextureCacheManager.getTexture()` sets `LINEAR` on creation. Since the recommended approach applies the filter in `renderImage()` / `renderSDRFrame()` after binding, the cache does not need modification. The texture parameters set at creation are overridden at render time.

---

## UI Design

### HUD Indicator (Transient)

A small, semi-transparent label appears in the top-center of the viewer for 1.5 seconds when the filter mode is toggled:

```
  +------------------------------+
  |     [ Nearest Neighbor ]     |   <-- appears on toggle
  |                              |
  |                              |
  |                              |
  +------------------------------+
```

Styling:
- Background: `rgba(0, 0, 0, 0.7)`, border-radius: `4px`
- Text: white, 12px monospace font
- Padding: `6px 12px`
- Position: absolute, top: `12px`, left: `50%`, transform: `translateX(-50%)`
- z-index: above image canvas but below modal overlays (audit existing z-index values across the codebase to avoid collisions with OverlayManager, paint canvas, and modal layers)
- Transition: `opacity 0.3s ease-out` for fade-out
- Text content: `"Nearest Neighbor"` or `"Bilinear"` depending on new mode

> **Review Note (Nice to Have):** Consider more descriptive labels like "Pixel View (Nearest)" / "Smooth (Bilinear)" for the HUD to make the visual effect clearer to non-technical reviewers and production coordinators. The technical names can remain in the shortcuts dialog.

Implementation: A simple method on the Viewer that creates a temporary `<div>`, appends it to `canvasContainer`, and removes it after a timeout. If a previous indicator is still showing, it is replaced.

```typescript
// In Viewer.ts
private filterModeIndicator: HTMLElement | null = null;
private filterModeTimeout: ReturnType<typeof setTimeout> | null = null;

private showFilterModeIndicator(mode: TextureFilterMode): void {
  // Remove previous indicator
  if (this.filterModeIndicator?.parentNode) {
    this.filterModeIndicator.remove();
  }
  if (this.filterModeTimeout) {
    clearTimeout(this.filterModeTimeout);
  }

  const indicator = document.createElement('div');
  indicator.dataset.testid = 'filter-mode-indicator';
  indicator.textContent = mode === 'nearest' ? 'Nearest Neighbor' : 'Bilinear';
  indicator.style.cssText = `
    position: absolute;
    top: 12px;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(0, 0, 0, 0.75);
    color: #fff;
    font-family: monospace;
    font-size: 12px;
    padding: 6px 14px;
    border-radius: 4px;
    z-index: 100;
    pointer-events: none;
    opacity: 1;
    transition: opacity 0.3s ease-out;
  `;

  this.canvasContainer.appendChild(indicator);
  this.filterModeIndicator = indicator;

  this.filterModeTimeout = setTimeout(() => {
    indicator.style.opacity = '0';
    setTimeout(() => {
      if (indicator.parentNode) indicator.remove();
      if (this.filterModeIndicator === indicator) {
        this.filterModeIndicator = null;
      }
    }, 300);
  }, 1200);
}
```

### Persistent Status Badge

A small persistent indicator in the status area showing the current filter mode (e.g., "NN" for nearest-neighbor). This addresses the UX gap where:

- Users who did not see the toggle have no way to know the current mode.
- Users returning to a session (where localStorage restored "nearest") may be confused by aliased rendering without any visible indicator.
- Another team member sitting down has no visual cue about the current mode.

Implementation: A small badge element (similar to `AutoSaveIndicator`) in the info panel or status bar area. Updated in `toggleFilterMode()` and on initialization when localStorage restores a non-default mode. Hidden when mode is `'linear'` (the default) to avoid visual clutter.

> **Review Note (Nice to Have):** A toolbar button in the View tab (e.g., a pixelated grid icon for nearest, a smooth gradient icon for bilinear) would further improve discoverability for users unfamiliar with the keyboard shortcut. This can be deferred to a follow-up iteration.

---

## Implementation Steps

### Step 1: Type Definition

Add `TextureFilterMode` to `src/core/types/filter.ts`:

```typescript
export type TextureFilterMode = 'nearest' | 'linear';
```

### Step 2: RendererBackend Interface

Add `setTextureFilterMode()` and `getTextureFilterMode()` to `src/render/RendererBackend.ts`.

### Step 3: RenderState Integration

Add `textureFilterMode?: TextureFilterMode` to the `RenderState` interface and handle it in `applyRenderState()`.

### Step 4: Renderer (WebGL2Backend) Implementation

In `src/render/Renderer.ts`:
1. Add `_textureFilterMode` field (default: `'linear'`).
2. Add `_mipmappedTextures: Set<WebGLTexture>` to track which textures have mipmaps.
3. Implement `setTextureFilterMode()` and `getTextureFilterMode()`.
4. Add a private `applyImageTextureFilter(texture: WebGLTexture)` helper that correctly restores `LINEAR_MIPMAP_LINEAR` for mipmapped textures when switching back to bilinear mode.
5. In `updateTexture()`, after `gl.generateMipmap()`, add the texture to `_mipmappedTextures`. On texture deletion/recycling, remove from the set.
6. Call `applyImageTextureFilter()` in `renderImage()` and `renderSDRFrame()` after binding the image texture to unit 0. (`renderTiledImages()` delegates to `renderImage()`, so no separate call is needed there.)

### Step 5: WebGPUBackend Stub

In `src/render/WebGPUBackend.ts`:
1. Add a stored `_textureFilterMode` field.
2. Implement `setTextureFilterMode()` and `getTextureFilterMode()` (store only, no GPU application).

### Step 6: ViewerGLRenderer Integration

In `src/ui/components/ViewerGLRenderer.ts`:
1. Add a `setFilterMode(mode)` method that calls `this.renderer.setTextureFilterMode(mode)`.
2. Add a `getFilterMode()` method.

### Step 7: Viewer Integration

In `src/ui/components/Viewer.ts`:
1. Add `_textureFilterMode` field, loaded from `localStorage.getItem('openrv.filterMode')` on construction (default `'linear'`).
2. Add `toggleFilterMode()` method:
   - Toggle between `'nearest'` and `'linear'`.
   - Persist to `localStorage.setItem('openrv.filterMode', mode)`.
   - Call `this.glRenderer.setFilterMode(mode)`.
   - Call `this.showFilterModeIndicator(mode)`.
   - Update persistent status badge.
   - Call `this.scheduleRender()`.
3. Add `getFilterMode()` method.
4. Add the transient HUD indicator (see UI Design section).
5. Add the persistent status badge (see UI Design section).
6. Apply stored mode on GL renderer initialization (in `setupGLRenderer()` or equivalent).
7. Clean up indicator and badge in `dispose()`.

### Step 8: 2D Canvas Path Updates

In `src/ui/components/Viewer.ts`, update all hardcoded `imageSmoothingEnabled = true` sites to respect the filter mode:
- Line ~1642: `ctx.imageSmoothingEnabled = (this._textureFilterMode === 'linear');`
- Line ~1981: Same pattern.
- Line ~2101: Same pattern.
- Line ~3595: Same pattern.

In `src/ui/components/ViewerRenderingUtils.ts`:
- Line ~72: Accept a filter mode parameter or read from a shared source.
- Line ~474: Same pattern.

Note: `ViewerExport.ts` is intentionally **not** modified. Exports always use bilinear for quality.

### Step 9: Keyboard Binding

In `src/utils/input/KeyBindings.ts`:
1. Add `'view.toggleFilterMode'` binding with `code: 'KeyN'` and `description: 'Toggle nearest-neighbor / bilinear filtering'`.
2. Add `context: 'annotate'` to the existing `notes.addNote` binding definition so that if users remap it, it only fires in the annotate context.

In `src/services/KeyboardActionMap.ts`:
1. Add handler for `'view.toggleFilterMode'`:
   ```typescript
   'view.toggleFilterMode': () => {
     controls.viewer.toggleFilterMode();
   },
   ```

In `src/AppKeyboardHandler.ts`:
1. Add `'notes.addNote'` to the `CONFLICTING_DEFAULTS` set so it only activates with a custom binding (the N key is now used for filter toggle by default).

### Step 10: Shortcuts Dialog Update

In `src/AppKeyboardHandler.ts` `showShortcutsDialog()`:
1. Add `'view.toggleFilterMode'` to the `'VIEW'` category array in the shortcuts dialog.

### Step 11: Tests

1. **Renderer unit tests** (`src/render/Renderer.test.ts`):
   - Test that `setTextureFilterMode('nearest')` causes `gl.texParameteri` to be called with `gl.NEAREST` on the next `renderImage()`.
   - Test that `setTextureFilterMode('linear')` restores `gl.LINEAR`.
   - Test that mipmapped textures get `LINEAR_MIPMAP_LINEAR` restored (not just `LINEAR`) after a nearest-to-bilinear round-trip.
   - Test that `getTextureFilterMode()` returns the current mode.

2. **Viewer tests**:
   - Test `toggleFilterMode()` alternates between modes.
   - Test localStorage persistence (read on init, write on toggle).
   - Test HUD indicator creation and removal.
   - Test persistent status badge visibility.
   - Test 2D canvas `imageSmoothingEnabled` is set correctly based on filter mode.

3. **Keyboard binding tests**:
   - Test that `view.toggleFilterMode` is registered on `KeyN`.
   - Test that `notes.addNote` is in `CONFLICTING_DEFAULTS`.

---

## Files to Create/Modify

### Modified Files

| File | Changes |
|------|---------|
| `src/core/types/filter.ts` | Add `TextureFilterMode` type export |
| `src/render/RendererBackend.ts` | Add `setTextureFilterMode()` and `getTextureFilterMode()` to interface |
| `src/render/RenderState.ts` | Add `textureFilterMode?: TextureFilterMode` to `RenderState` interface |
| `src/render/Renderer.ts` | Add `_textureFilterMode` field, `_mipmappedTextures` set, `setTextureFilterMode()`, `getTextureFilterMode()`, `applyImageTextureFilter(texture)` helper with mipmap-aware MIN_FILTER restoration; call helper in `renderImage()` and `renderSDRFrame()`; track mipmapped textures in `updateTexture()` |
| `src/render/WebGPUBackend.ts` | Add stub `setTextureFilterMode()` and `getTextureFilterMode()` |
| `src/ui/components/ViewerGLRenderer.ts` | Add `setFilterMode()` and `getFilterMode()` delegation methods |
| `src/ui/components/Viewer.ts` | Add `_textureFilterMode` state, `toggleFilterMode()`, `getFilterMode()`, localStorage load/save, HUD indicator, persistent status badge, update all `imageSmoothingEnabled` sites, cleanup in `dispose()` |
| `src/ui/components/ViewerRenderingUtils.ts` | Update `imageSmoothingEnabled` sites (~lines 72, 474) to respect filter mode |
| `src/utils/input/KeyBindings.ts` | Add `'view.toggleFilterMode'` binding on `KeyN`; add `context: 'annotate'` to `notes.addNote` |
| `src/services/KeyboardActionMap.ts` | Add `'view.toggleFilterMode'` action handler |
| `src/AppKeyboardHandler.ts` | Add `'notes.addNote'` to `CONFLICTING_DEFAULTS`; add `'view.toggleFilterMode'` to VIEW category in shortcuts dialog |
| `src/render/Renderer.test.ts` | Add tests for filter mode including mipmap restoration |
| `src/ui/components/Viewer.test.ts` | Add tests for toggle, localStorage, HUD indicator, persistent badge, 2D canvas path |

### No New Files Required

All changes fit naturally into existing modules.

---

## Risks

### 1. Performance of Per-Frame texParameteri Calls

**Risk**: Calling `gl.texParameteri()` on every `renderImage()` call adds minor overhead.

**Mitigation**: The calls are extremely cheap (two integer state changes, no memory allocation). WebGL drivers implement texture parameter changes as deferred state, applied only when the texture is actually sampled. No GPU memory operations occur. If profiling shows concern, a dirty flag can be added, but this is unlikely to be necessary.

### 2. Key Binding Conflict with notes.addNote

**Risk**: Moving `notes.addNote` to `CONFLICTING_DEFAULTS` means users lose the N-key note shortcut unless they rebind it.

**Mitigation**: The custom key bindings system (`CustomKeyBindingsManager`) allows users to remap both actions. `notes.addNote` is contextual (only meaningful on Annotate tab) while filter toggle is global, making the priority appropriate. The shortcuts dialog shows conflicting defaults with a clear note. The notes panel has a dedicated "Add Note" button as a fallback, so the feature is not lost, only the shortcut.

### 3. TextureCacheManager Creating Textures with Wrong Filter

**Risk**: Textures created via `TextureCacheManager` use `LINEAR` at creation. If those textures are later used for display, they might have stale filter params.

**Mitigation**: The `applyImageTextureFilter()` approach sets filter params after binding, right before the draw call. This overrides whatever was set at creation time. No cache modification needed.

### 4. Mipmap Interaction

**Risk**: When mipmaps are generated (`LINEAR_MIPMAP_LINEAR`), switching to nearest then back to bilinear could permanently degrade texture quality if the min filter is not correctly restored.

**Mitigation**: The `applyImageTextureFilter()` helper tracks mipmapped textures via a `Set<WebGLTexture>` and restores `LINEAR_MIPMAP_LINEAR` (not just `LINEAR`) for the MIN_FILTER when switching back to bilinear mode. In nearest mode, the min filter is set to `gl.NEAREST`, disabling mipmap sampling entirely -- this is correct for pixel-accurate QC where mipmap levels would defeat the purpose.

### 5. WebGPU Backend Not Implemented

**Risk**: Filter mode stored but not applied in WebGPU backend.

**Mitigation**: The WebGPU backend is currently a rendering stub (`renderImage()` is a no-op). When the WebGPU pipeline is implemented, the stored filter mode will be applied via `GPUSamplerDescriptor`. The interface contract ensures it will be required.

### 6. Multi-Tile Rendering

**Risk**: `renderTiledImages()` renders multiple images in a loop. Each tile must use the same filter mode.

**Mitigation**: `renderTiledImages()` delegates to `renderImage()` for each tile, and `applyImageTextureFilter()` is called inside `renderImage()`, ensuring consistent behavior across all tiles.

### 7. SDR 2D Canvas Path

**Risk**: The 2D canvas rendering path (non-WebGL) uses `ctx.imageSmoothingEnabled` for filtering. Multiple hardcoded `true` values exist across `Viewer.ts` (4 sites) and `ViewerRenderingUtils.ts` (2 sites).

**Mitigation**: All six `imageSmoothingEnabled` sites are updated to respect the current filter mode: `ctx.imageSmoothingEnabled = (mode === 'linear')`. Export paths in `ViewerExport.ts` are intentionally left unchanged (always bilinear for quality).

### 8. Context Loss Recovery

**Risk**: When WebGL context is lost and restored, texture filter state could be lost.

**Mitigation**: The `_textureFilterMode` field is a JS-side value, not a GL resource, so it survives context loss. On the next render after context restoration, `applyImageTextureFilter()` re-sets the correct texture parameters. The `_mipmappedTextures` set must be cleared on context loss (since all GL textures are invalidated) and repopulated as textures are re-uploaded.

> **Review Note (Nice to Have):** The `ViewerExport.ts` export path naturally isolates from filter mode changes since it uses its own canvas contexts. No changes needed, but implementers should verify this isolation holds if the export path is refactored in the future.
