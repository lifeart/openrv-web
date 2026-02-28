# Plan 10: Nearest-Neighbor vs. Bilinear Filter Toggle

## Overview

Desktop OpenRV uses the **N** key to toggle between nearest-neighbor (pixel-accurate QC at 1:1 zoom) and bilinear filtering (smooth interpolation). The web version currently hardcodes `gl.LINEAR` on all image texture uploads. This plan adds a user-togglable filter mode that switches the primary image texture between `gl.NEAREST` and `gl.LINEAR`, with a transient HUD indicator and localStorage persistence.

### Why This Matters

- **Pixel-accurate QC**: At 1:1 or higher zoom, nearest-neighbor shows exact pixel boundaries without blending, critical for QC workflows (dead pixels, compression artifacts, single-pixel detail).
- **Desktop parity**: OpenRV desktop users expect the N key toggle behavior.
- **Bilinear default**: Bilinear filtering remains the default for smooth presentation at fractional zoom levels.

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

Given desktop OpenRV parity, **Option A is recommended**: register `view.toggleFilterMode` on `KeyN` (no modifiers) as a global action, and add `notes.addNote` to the `CONFLICTING_DEFAULTS` set in `AppKeyboardHandler.ts` (it already has a similar pattern for `paint.line`, `paint.rectangle`, etc.).

### No Visual Indicator Pattern

The codebase does not have a toast/notification system for transient status messages. The closest patterns are:
- **OverlayManager** (`src/ui/components/OverlayManager.ts`): Manages persistent overlays (safe areas, matte, timecode, pixel probe).
- **AutoSaveIndicator** (`src/ui/components/AutoSaveIndicator.ts`): A small persistent status badge.
- **Missing-frame overlay**: A per-frame overlay in the Viewer.

A lightweight transient HUD indicator will be implemented as a simple DOM element appended to the viewer container, auto-dismissed after ~1.5 seconds.

---

## Proposed Architecture

### Data Flow

```
KeyboardManager  --(N key)-->  App action handler
                                   |
                     Viewer.toggleFilterMode()
                       |                    |
              Update localStorage     Show HUD indicator
                       |
              GLRenderer.setFilterMode(mode)
                       |
              Renderer.setTextureFilterMode(mode)
                       |
              gl.texParameteri(NEAREST/LINEAR)
                       |
              scheduleRender() -- re-render current frame
```

### State Ownership

- **Viewer** owns the filter mode state (`'nearest' | 'linear'`), persists to localStorage, and creates the HUD indicator.
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

Add a private field and public method to the `Renderer` class:

```typescript
private _textureFilterMode: TextureFilterMode = 'linear';

setTextureFilterMode(mode: TextureFilterMode): void {
  if (this._textureFilterMode === mode) return;
  this._textureFilterMode = mode;
  // Invalidate current texture so filter params are re-applied
  this._filterModeDirty = true;
}

getTextureFilterMode(): TextureFilterMode {
  return this._textureFilterMode;
}
```

### Texture Parameter Application

The filter mode affects **only the primary image texture** (unit 0). All other textures (LUTs, FBOs, scope textures) retain their existing filter modes.

**Key change points in `updateTexture()`:**

1. **VideoFrame path** (~line 780-783): Replace hardcoded `gl.LINEAR` with the current filter mode:
   ```typescript
   const filter = this._textureFilterMode === 'nearest' ? gl.NEAREST : gl.LINEAR;
   gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
   gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
   ```

2. **Non-VideoFrame path** (~line 852-855): Same replacement. For mipmapped textures:
   ```typescript
   const magFilter = this._textureFilterMode === 'nearest' ? gl.NEAREST : gl.LINEAR;
   gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, magFilter);
   // Min filter: use NEAREST_MIPMAP_NEAREST for nearest mode with mipmaps
   if (mipmapped) {
     gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER,
       this._textureFilterMode === 'nearest' ? gl.NEAREST_MIPMAP_NEAREST : gl.LINEAR_MIPMAP_LINEAR);
   } else {
     gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, magFilter);
   }
   ```

3. **SDR frame path** (`renderSDRFrame`, ~line 2108-2111): Same replacement for `sdrTexture`.

4. **ImageBitmap fast path** (~line 880): Same replacement.

5. **renderImage() texture binding** (~line 515): After binding the image texture, apply the current filter mode to ensure it takes effect even if the texture was cached with different parameters:
   ```typescript
   gl.bindTexture(gl.TEXTURE_2D, image.texture);
   // Ensure filter mode matches current setting (may have been created with different mode)
   if (this._filterModeDirty) {
     const filter = this._textureFilterMode === 'nearest' ? gl.NEAREST : gl.LINEAR;
     gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
     // Leave MIN_FILTER alone if mipmapped -- handled in updateTexture
   }
   ```

**Simpler approach (recommended)**: Instead of modifying every texture creation site, apply the filter mode in `renderImage()` and `renderSDRFrame()` right before the draw call, after the texture is bound. This is a single-point change and ensures consistency:

```typescript
// In renderImage(), after gl.bindTexture(gl.TEXTURE_2D, image.texture):
private applyImageTextureFilter(): void {
  const gl = this.gl!;
  const magFilter = this._textureFilterMode === 'nearest' ? gl.NEAREST : gl.LINEAR;
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, magFilter);
  // For min filter, check if mipmaps are active on this texture
  // When nearest is selected but mipmaps exist, use NEAREST_MIPMAP_NEAREST
  // to still leverage the mip chain for downscaling but without interpolation
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER,
    this._textureFilterMode === 'nearest' ? gl.NEAREST : gl.LINEAR);
}
```

This method is called in three places:
1. `renderImage()` after binding `image.texture` to unit 0
2. `renderSDRFrame()` after binding `this.sdrTexture` to unit 0
3. `renderTiledImages()` after binding each tile's `image.texture` to unit 0

### RendererBackend Interface

Add to `RendererBackend.ts`:

```typescript
/** Set the texture filtering mode for the primary image texture. */
setTextureFilterMode(mode: 'nearest' | 'linear'): void;

/** Get the current texture filtering mode. */
getTextureFilterMode(): 'nearest' | 'linear';
```

### WebGPUBackend Stub

The `WebGPUBackend` stores the mode but does not apply it (the backend is currently a stub for rendering). When the WebGPU pipeline is implemented, it will use `GPUSamplerDescriptor.magFilter` / `minFilter`.

### TextureCacheManager

`TextureCacheManager.getTexture()` sets `LINEAR` on creation. Since the recommended approach applies the filter in `renderImage()` / `renderSDRFrame()` after binding, the cache does not need modification. The texture parameters set at creation are overridden at render time.

---

## UI Design

### HUD Indicator

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
- z-index: above image canvas but below modal overlays
- Transition: `opacity 0.3s ease-out` for fade-out
- Text content: `"Nearest Neighbor"` or `"Bilinear"` depending on new mode

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

---

## Implementation Steps

### Step 1: Type Definition

Add `TextureFilterMode` to `src/core/types/filter.ts`:

```typescript
export type TextureFilterMode = 'nearest' | 'linear';
```

### Step 2: RendererBackend Interface

Add `setTextureFilterMode()` and `getTextureFilterMode()` to `src/render/RendererBackend.ts`.

### Step 3: Renderer (WebGL2Backend) Implementation

In `src/render/Renderer.ts`:
1. Add `_textureFilterMode` field (default: `'linear'`).
2. Implement `setTextureFilterMode()` and `getTextureFilterMode()`.
3. Add a private `applyImageTextureFilter()` helper.
4. Call `applyImageTextureFilter()` in `renderImage()`, `renderSDRFrame()`, and `renderTiledImages()` after binding the image texture to unit 0.

### Step 4: WebGPUBackend Stub

In `src/render/WebGPUBackend.ts`:
1. Add a stored `_textureFilterMode` field.
2. Implement `setTextureFilterMode()` and `getTextureFilterMode()` (store only, no GPU application).

### Step 5: ViewerGLRenderer Integration

In `src/ui/components/ViewerGLRenderer.ts`:
1. Add a `setFilterMode(mode)` method that calls `this.renderer.setTextureFilterMode(mode)`.
2. Add a `getFilterMode()` method.

### Step 6: Viewer Integration

In `src/ui/components/Viewer.ts`:
1. Add `_textureFilterMode` field, loaded from `localStorage.getItem('openrv.filterMode')` on construction (default `'linear'`).
2. Add `toggleFilterMode()` method:
   - Toggle between `'nearest'` and `'linear'`.
   - Persist to `localStorage.setItem('openrv.filterMode', mode)`.
   - Call `this.glRenderer.setFilterMode(mode)`.
   - Call `this.showFilterModeIndicator(mode)`.
   - Call `this.scheduleRender()`.
3. Add `getFilterMode()` method.
4. Add the HUD indicator (see UI Design section).
5. Apply stored mode on GL renderer initialization (in `setupGLRenderer()` or equivalent).
6. Clean up indicator in `dispose()`.

### Step 7: Keyboard Binding

In `src/utils/input/KeyBindings.ts`:
1. Add `'view.toggleFilterMode'` binding with `code: 'KeyN'` and `description: 'Toggle nearest-neighbor / bilinear filtering'`.
2. `notes.addNote` is already on `KeyN` without modifiers. Both will be registered, but the global action handler resolution gives priority to global context actions.

In `src/services/KeyboardActionMap.ts`:
1. Add handler for `'view.toggleFilterMode'`:
   ```typescript
   'view.toggleFilterMode': () => {
     controls.viewer.toggleFilterMode();
   },
   ```

In `src/AppKeyboardHandler.ts`:
1. Add `'notes.addNote'` to the `CONFLICTING_DEFAULTS` set so it only activates with a custom binding (the N key is now used for filter toggle by default).

### Step 8: Shortcuts Dialog Update

In `src/AppKeyboardHandler.ts` `showShortcutsDialog()`:
1. Add `'view.toggleFilterMode'` to the `'VIEW'` category array in the shortcuts dialog.

### Step 9: Tests

1. **Renderer unit tests** (`src/render/Renderer.test.ts`):
   - Test that `setTextureFilterMode('nearest')` causes `gl.texParameteri` to be called with `gl.NEAREST` on the next `renderImage()`.
   - Test that `setTextureFilterMode('linear')` restores `gl.LINEAR`.
   - Test that `getTextureFilterMode()` returns the current mode.

2. **Viewer tests**:
   - Test `toggleFilterMode()` alternates between modes.
   - Test localStorage persistence (read on init, write on toggle).
   - Test HUD indicator creation and removal.

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
| `src/render/Renderer.ts` | Add `_textureFilterMode` field, `setTextureFilterMode()`, `getTextureFilterMode()`, `applyImageTextureFilter()` helper; call helper in `renderImage()`, `renderSDRFrame()`, `renderTiledImages()` |
| `src/render/WebGPUBackend.ts` | Add stub `setTextureFilterMode()` and `getTextureFilterMode()` |
| `src/ui/components/ViewerGLRenderer.ts` | Add `setFilterMode()` and `getFilterMode()` delegation methods |
| `src/ui/components/Viewer.ts` | Add `_textureFilterMode` state, `toggleFilterMode()`, `getFilterMode()`, localStorage load/save, HUD indicator, cleanup in `dispose()` |
| `src/utils/input/KeyBindings.ts` | Add `'view.toggleFilterMode'` binding on `KeyN` |
| `src/services/KeyboardActionMap.ts` | Add `'view.toggleFilterMode'` action handler |
| `src/AppKeyboardHandler.ts` | Add `'notes.addNote'` to `CONFLICTING_DEFAULTS`; add `'view.toggleFilterMode'` to VIEW category in shortcuts dialog |
| `src/render/Renderer.test.ts` | Add tests for filter mode |
| `src/ui/components/Viewer.test.ts` | Add tests for toggle, localStorage, HUD indicator |

### No New Files Required

All changes fit naturally into existing modules.

---

## Risks

### 1. Performance of Per-Frame texParameteri Calls

**Risk**: Calling `gl.texParameteri()` on every `renderImage()` call adds minor overhead.

**Mitigation**: The calls are extremely cheap (two integer state changes, no memory allocation). WebGL drivers batch these with no measurable impact. If profiling shows concern, a dirty flag can skip redundant calls when the mode has not changed since the last render.

### 2. Key Binding Conflict with notes.addNote

**Risk**: Moving `notes.addNote` to `CONFLICTING_DEFAULTS` means users lose the N-key note shortcut unless they rebind it.

**Mitigation**: The custom key bindings system (`CustomKeyBindingsManager`) allows users to remap both actions. `notes.addNote` is contextual (only meaningful on Annotate tab) while filter toggle is global, making the priority appropriate. The shortcuts dialog shows conflicting defaults with a clear note.

### 3. TextureCacheManager Creating Textures with Wrong Filter

**Risk**: Textures created via `TextureCacheManager` use `LINEAR` at creation. If those textures are later used for display, they might have stale filter params.

**Mitigation**: The `applyImageTextureFilter()` approach sets filter params after binding, right before the draw call. This overrides whatever was set at creation time. No cache modification needed.

### 4. Mipmap Interaction

**Risk**: When mipmaps are generated (`LINEAR_MIPMAP_LINEAR`), switching to nearest could produce jarring quality changes at small zoom levels.

**Mitigation**: In nearest mode, the min filter is set to `gl.NEAREST` (not `NEAREST_MIPMAP_NEAREST`), disabling mipmap sampling entirely. This is correct for pixel-accurate QC: at zoomed-out views the aliasing is expected and informative (shows the actual pixel grid). Users who want smooth downsampling switch back to bilinear.

### 5. WebGPU Backend Not Implemented

**Risk**: Filter mode stored but not applied in WebGPU backend.

**Mitigation**: The WebGPU backend is currently a rendering stub (`renderImage()` is a no-op). When the WebGPU pipeline is implemented, the stored filter mode will be applied via `GPUSamplerDescriptor`. The interface contract ensures it will be required.

### 6. Multi-Tile Rendering

**Risk**: `renderTiledImages()` renders multiple images in a loop. Each tile must use the same filter mode.

**Mitigation**: `applyImageTextureFilter()` is called inside the tile loop after binding each image's texture, ensuring consistent behavior across all tiles.

### 7. SDR 2D Canvas Path

**Risk**: The 2D canvas rendering path (non-WebGL) uses `ctx.imageSmoothingEnabled` for filtering. When the GL renderer is not active, the toggle has no visible effect.

**Mitigation**: In `Viewer.ts`, when the 2D canvas path is active, set `ctx.imageSmoothingEnabled = (mode === 'linear')` on the image canvas context. This provides equivalent behavior for the SDR fallback path.
