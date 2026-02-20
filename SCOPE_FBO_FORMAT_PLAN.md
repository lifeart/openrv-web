# Implementation Plan: Scope FBO Format Negotiation (Item 3)

**Priority Score: 8/25** | Risk: MEDIUM-HIGH | Effort: M

## Summary

Scope FBOs always use RGBA16F regardless of content. For SDR content, RGBA8 + UNSIGNED_BYTE readback saves ~8.7MB GPU memory and halves PBO bandwidth.

## SDR vs HDR Classification

```
isHDRContent(image) = true when:
  - image.dataType === 'float32' or 'uint16'
  - image.metadata.transferFunction is 'hlg', 'pq', or 'smpte240m'
  - image.videoFrame !== null
```

## Implementation Order

### Task 3.1: Add `isHDRContent()` Helper
**Files:** `src/render/Renderer.ts`
- Private method or module-level function
- Pure logic, no side effects

### Task 3.2: Add Format Tracking State
**Files:** `src/render/Renderer.ts`
- `private scopeFBOFormat: 'rgba16f' | 'rgba8' = 'rgba16f'`
- `private scopePBOFormat: 'rgba16f' | 'rgba8' = 'rgba16f'`
- `private scopePBOCachedPixelsUint8: Uint8Array | null = null`
- Reset in `dispose()` and `disposeScopePBOs()`

### Task 3.3: Modify `ensureScopeFBO` for Conditional Format
**Files:** `src/render/Renderer.ts` (lines 1326-1365)
- Add `format` parameter
- RGBA16F path: `gl.texImage2D(..., gl.RGBA16F, ..., gl.FLOAT, null)`
- RGBA8 path: `gl.texImage2D(..., gl.RGBA8, ..., gl.UNSIGNED_BYTE, null)`
- Early return checks format match

### Task 3.4: Modify `ensureScopePBOs` for Conditional Format
**Files:** `src/render/Renderer.ts` (lines 1370-1394)
- Buffer size: RGBA16F uses Float32 (4 bytes/channel), RGBA8 uses 1 byte/channel
- Track `scopePBOFormat` for invalidation

### Task 3.5: Modify `renderImageToFloatAsyncForScopes` for Dual Format
**Files:** `src/render/Renderer.ts` (lines 1186-1280)
- Determine format from `isHDRContent(image)`
- SDR: set `hdrOutputMode = 'sdr'` (values already in [0,1] — safe to clamp)
- SDR: `gl.readPixels(..., gl.UNSIGNED_BYTE, ...)` into Uint8Array
- HDR: unchanged

### Task 3.6: Uint8→Float32 Conversion in `renderForScopes`
**Files:** `src/render/Renderer.ts` (lines 1147-1179)
- Convert `Uint8Array` to `Float32Array` (divide by 255.0) before return
- Keeps downstream API unchanged — no consumer changes needed

### Task 3.7 (Optional): Hysteresis to Prevent Format Thrashing
- Track consecutive SDR frames; only downgrade from RGBA16F after 30 frames
- Upgrade to RGBA16F immediately on HDR detection

### Task 3.8 (Optional): RGBA8 Scopes Without `EXT_color_buffer_float`
- Currently scopes fail without this extension; RGBA8 path would work everywhere
- Enables GPU scopes on more devices

## Risk: Color Accuracy
- RGBA8 quantizes to 256 levels per channel — lossless for 8-bit SDR sources
- Extreme exposure push on SDR content clips at 1.0 in RGBA8 FBO
- Accepted: matches SDR display path behavior

## Tests
| ID | Test | Assertion |
|----|------|-----------|
| SFBO-001 | uint8 SDR → RGBA8 FBO | `texImage2D` with `gl.RGBA8` |
| SFBO-002 | float32 → RGBA16F FBO | `texImage2D` with `gl.RGBA16F` |
| SFBO-003 | Format unchanged → no recreation | `texImage2D` not called |
| SFBO-004 | SDR→HDR transition → recreate | Old deleted, new RGBA16F |
| SFBO-005 | Uint8 readback converts correctly | [0,128,255] → [0.0, ~0.502, 1.0] |
