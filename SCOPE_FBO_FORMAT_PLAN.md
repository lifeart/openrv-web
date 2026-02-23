# Implementation Plan: Scope FBO Format Negotiation (Item 3)

**Priority Score: 8/25** | Risk: MEDIUM-HIGH | Effort: M

## Summary

Scope FBOs always use RGBA16F regardless of content. For SDR content, RGBA8 + UNSIGNED_BYTE readback saves ~8.7 MB GPU memory and halves PBO bandwidth.

**Current state (verified):**
- `ensureScopeFBO()` unconditionally creates an RGBA16F texture (line 1340 of `Renderer.ts`)
- `ensureScopePBOs()` allocates `Float32Array.BYTES_PER_ELEMENT` (4 bytes) per channel (line 1375)
- `renderImageToFloatAsyncForScopes()` always sets `hdrOutputMode = 'hlg'` (line 1230), which makes the shader emit `u_outputMode = HDR` (line 418), disabling the `clamp(color.rgb, 0.0, 1.0)` at fragment shader line 1386-1388 of `viewer.frag.glsl`
- All readback uses `gl.FLOAT` (lines 1256, 1266)
- `renderForScopes()` always returns `Float32Array` (line 1151 return type)

**Savings for SDR at 640x360:**
- FBO texture: 640 * 360 * 8 bytes (RGBA16F) -> 640 * 360 * 4 bytes (RGBA8) = 921,600 -> 460,800 bytes saved
- Two PBOs: 2 * 640 * 360 * 16 bytes (RGBA FLOAT) -> 2 * 640 * 360 * 4 bytes (RGBA UNSIGNED_BYTE) = 7,372,800 -> 1,843,200 bytes saved
- Total: ~8.3 MB -> ~2.3 MB (6 MB saved per scope resolution)

---

## SDR vs HDR Classification

```
isHDRContent(image: IPImage): boolean = true when ANY of:
  - image.dataType === 'float32' or 'uint16'
  - image.metadata.transferFunction is 'hlg', 'pq', or 'smpte240m'
  - image.videoFrame !== null
```

**Verified against `IPImage` (src/core/image/Image.ts):**
- `dataType` field is `DataType = 'uint8' | 'uint16' | 'float32'` (line 1)
- `transferFunction` field is `TransferFunction = 'srgb' | 'hlg' | 'pq' | 'smpte240m'` (line 3)
- `videoFrame` field is `VideoFrame | null` (line 36-37)

**Edge case:** `dataType === 'uint8'` with `transferFunction === 'srgb'` and no `videoFrame` is the only SDR case. All other combinations must use RGBA16F.

**Reasoning for `videoFrame` check:** VideoFrames can contain HDR data even when metadata is incomplete. Playing it safe avoids clamping HDR content.

---

## Implementation Order

### Task 3.1: Add `isHDRContent()` Helper
**Complexity:** trivial
**Files:** `src/render/Renderer.ts`
**Dependencies:** none

#### Current Code Analysis
There is no existing HDR classification helper anywhere in the renderer. The closest logic is in `renderImage()` (line 424-432) which checks `image.metadata.transferFunction` to set `u_inputTransfer`, but this does not gate FBO format selection.

The `renderImageToFloatAsyncForScopes()` method (line 1186) receives an `IPImage` but currently ignores its properties for format decisions.

#### Implementation Steps
1. Add a module-level pure function at the top of `Renderer.ts` (after the `SCOPE_DISPLAY_CONFIG` constant at line 38):
   ```typescript
   /** Determine if an image requires RGBA16F scope FBO (HDR) or can use RGBA8 (SDR). */
   function isHDRContent(image: IPImage): boolean {
     if (image.dataType === 'float32' || image.dataType === 'uint16') return true;
     if (image.videoFrame) return true;
     const tf = image.metadata.transferFunction;
     if (tf === 'hlg' || tf === 'pq' || tf === 'smpte240m') return true;
     return false;
   }
   ```
2. Module-level (not a method) to keep it pure and easily testable. No `this` needed.

#### Edge Cases & Risks
- **Risk: `imageBitmap` without `videoFrame`.** `IPImage` has both `imageBitmap` and `videoFrame`. An image loaded from a file as `imageBitmap` (SDR JPEG sequence) will have `imageBitmap !== null` but `videoFrame === null`. This is correctly classified SDR.
- **Risk: `uint16` without HDR transfer.** Some formats (16-bit TIFF, DPX) produce `uint16` data that may represent linear or log-encoded values. These have values > 255 and MUST use RGBA16F.
- **Risk: Missing metadata.** If `transferFunction` is `undefined`, the image defaults to sRGB handling. Combined with `uint8` dataType and no videoFrame, this is safely SDR.

#### Test Specifications
**File:** `src/render/Renderer.renderForScopes.test.ts`

```typescript
describe('Task 3.1: isHDRContent helper', () => {
  // Import the helper (needs to be exported for testing or tested via renderForScopes behavior)
  // Since it's module-level, we test via the public API behavior in later tasks.
  // Alternatively, export it as a named export.

  it('SFBO-010: uint8 + srgb + no videoFrame = SDR', () => {
    const image = new IPImage({
      width: 2, height: 2, channels: 4, dataType: 'uint8',
      metadata: { transferFunction: 'srgb' },
    });
    expect(isHDRContent(image)).toBe(false);
  });

  it('SFBO-011: uint8 + no metadata = SDR', () => {
    const image = new IPImage({
      width: 2, height: 2, channels: 4, dataType: 'uint8',
    });
    expect(isHDRContent(image)).toBe(false);
  });

  it('SFBO-012: float32 = HDR regardless of metadata', () => {
    const image = new IPImage({
      width: 2, height: 2, channels: 4, dataType: 'float32',
      metadata: { transferFunction: 'srgb' },
    });
    expect(isHDRContent(image)).toBe(true);
  });

  it('SFBO-013: uint16 = HDR regardless of metadata', () => {
    const image = new IPImage({
      width: 2, height: 2, channels: 4, dataType: 'uint16',
    });
    expect(isHDRContent(image)).toBe(true);
  });

  it('SFBO-014: uint8 + hlg = HDR', () => {
    const image = new IPImage({
      width: 2, height: 2, channels: 4, dataType: 'uint8',
      metadata: { transferFunction: 'hlg' },
    });
    expect(isHDRContent(image)).toBe(true);
  });

  it('SFBO-015: uint8 + pq = HDR', () => {
    const image = new IPImage({
      width: 2, height: 2, channels: 4, dataType: 'uint8',
      metadata: { transferFunction: 'pq' },
    });
    expect(isHDRContent(image)).toBe(true);
  });

  it('SFBO-016: uint8 + smpte240m = HDR', () => {
    const image = new IPImage({
      width: 2, height: 2, channels: 4, dataType: 'uint8',
      metadata: { transferFunction: 'smpte240m' },
    });
    expect(isHDRContent(image)).toBe(true);
  });

  it('SFBO-017: uint8 + videoFrame = HDR', () => {
    // VideoFrame is a browser API; in tests, use a truthy mock
    const image = new IPImage({
      width: 2, height: 2, channels: 4, dataType: 'uint8',
      videoFrame: {} as VideoFrame,
    });
    expect(isHDRContent(image)).toBe(true);
  });
});
```

**Note on testability:** If `isHDRContent` is module-level (not exported), tests must exercise it indirectly through `renderForScopes` behavior. For unit-testability, consider exporting it as a named export or as a static method. Alternatively, export from a separate utility module.

---

### Task 3.2: Add Format Tracking State
**Complexity:** trivial
**Files:** `src/render/Renderer.ts`
**Dependencies:** none

#### Current Code Analysis
Current scope state fields (lines 130-140):
```typescript
private scopeFBO: WebGLFramebuffer | null = null;
private scopeFBOTexture: WebGLTexture | null = null;
private scopeFBOWidth = 0;
private scopeFBOHeight = 0;
private scopePBOs: [WebGLBuffer | null, WebGLBuffer | null] = [null, null];
private scopePBOFences: [WebGLSync | null, WebGLSync | null] = [null, null];
private scopePBOWidth = 0;
private scopePBOHeight = 0;
private scopePBOCachedPixels: Float32Array | null = null;
private scopePBOReady = false;
private scopeTempRow: Float32Array | null = null;
```

There is no format tracking. The FBO is always RGBA16F and PBOs always use Float32.

#### Implementation Steps
1. Add new fields after line 140 (after `scopeTempRow`):
   ```typescript
   private scopeFBOFormat: 'rgba16f' | 'rgba8' = 'rgba16f';
   private scopePBOFormat: 'rgba16f' | 'rgba8' = 'rgba16f';
   private scopePBOCachedPixelsUint8: Uint8Array | null = null;
   ```

2. Reset these in `disposeScopePBOs()` (line 1399). Add after line 1410:
   ```typescript
   this.scopePBOFormat = 'rgba16f';
   this.scopePBOCachedPixelsUint8 = null;
   ```

3. Reset `scopeFBOFormat` in `dispose()` (line 2102). Add after line 2154:
   ```typescript
   this.scopeFBOFormat = 'rgba16f';
   this.scopePBOFormat = 'rgba16f';
   this.scopePBOCachedPixelsUint8 = null;
   ```

#### Edge Cases & Risks
- **Risk: Stale format after resize.** When dimensions change, `disposeScopePBOs()` is already called (line 1201-1203), which resets PBO format. The FBO format is separately tracked and should also be reset when dimensions change OR when content HDR-ness changes.
- **Note:** `scopePBOCachedPixelsUint8` is the SDR counterpart to `scopePBOCachedPixels` (Float32Array). Both cannot be active simultaneously -- the active one depends on `scopePBOFormat`.

#### Test Specifications
**File:** `src/render/Renderer.renderForScopes.test.ts`

```typescript
describe('Task 3.2: Format tracking state', () => {
  // These are internal state tests. Since Renderer requires WebGL2,
  // we verify indirectly by checking that format transitions produce
  // correct output types. See Task 3.5 tests for integration coverage.

  it('SFBO-020: default format is rgba16f', () => {
    // Verified by reading the class field default. No runtime test needed.
    // This is a code review checkpoint.
  });

  it('SFBO-021: disposeScopePBOs resets PBO format to default', () => {
    // Verified by reading dispose code. No runtime test needed
    // without WebGL2 context mocking.
  });
});
```

---

### Task 3.3: Modify `ensureScopeFBO` for Conditional Format
**Complexity:** small
**Files:** `src/render/Renderer.ts` (lines 1326-1365)
**Dependencies:** Task 3.2

#### Current Code Analysis
`ensureScopeFBO(width, height)` at line 1326:
- Early-return check (line 1330): only compares `width` and `height`, NOT format
- Texture creation (line 1340): `gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, width, height, 0, gl.RGBA, gl.FLOAT, null)`
- No format parameter

#### Implementation Steps
1. Change method signature:
   ```typescript
   private ensureScopeFBO(width: number, height: number, format: 'rgba16f' | 'rgba8' = 'rgba16f'): void {
   ```

2. Extend early-return check (line 1330) to include format:
   ```typescript
   if (this.scopeFBO && this.scopeFBOWidth === width && this.scopeFBOHeight === height && this.scopeFBOFormat === format) {
     return;
   }
   ```

3. Replace the hard-coded `texImage2D` call (line 1340) with a conditional:
   ```typescript
   if (format === 'rgba8') {
     gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
   } else {
     gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, width, height, 0, gl.RGBA, gl.FLOAT, null);
   }
   ```

4. After successful creation, store the format (after line 1364):
   ```typescript
   this.scopeFBOFormat = format;
   ```

#### Edge Cases & Risks
- **Risk: FRAMEBUFFER_COMPLETE check.** The framebuffer completeness check at line 1351 should pass for RGBA8 on all WebGL2 implementations (RGBA8 is a required color-renderable format). RGBA16F requires `EXT_color_buffer_float`. So RGBA8 is actually MORE portable.
- **Risk: Format mismatch with readPixels.** After creating an RGBA8 FBO, subsequent `readPixels` with `gl.FLOAT` will fail or produce garbage. Task 3.5 must update readPixels format to match.
- **Risk: Concurrent FBO/PBO format divergence.** If `ensureScopeFBO` changes format but PBOs are not recreated, the PBO readback format won't match. Task 3.4 handles this.
- **Risk: Filter mode.** Currently uses `gl.LINEAR` (line 1341). For RGBA8 this is fine. For scope rendering where exact pixel values matter, NEAREST might be more appropriate, but this is an existing issue, not introduced by this change.

#### Test Specifications
**File:** `src/render/Renderer.renderForScopes.test.ts`

```typescript
describe('Task 3.3: ensureScopeFBO conditional format', () => {
  it('SFBO-001: uint8 SDR image creates RGBA8 FBO', () => {
    // Setup: Create Renderer with mock WebGL2 context
    // Action: Call renderForScopes with SDR image (uint8, srgb, no videoFrame)
    // Assert: gl.texImage2D called with gl.RGBA8 as internal format (arg index 2)
    //         and gl.UNSIGNED_BYTE as type (arg index 7)
  });

  it('SFBO-002: float32 image creates RGBA16F FBO', () => {
    // Setup: Create Renderer with mock WebGL2 context
    // Action: Call renderForScopes with HDR image (float32 dataType)
    // Assert: gl.texImage2D called with gl.RGBA16F as internal format
    //         and gl.FLOAT as type
  });

  it('SFBO-003: same format + same dimensions = no recreation', () => {
    // Setup: Create RGBA8 FBO, then call ensureScopeFBO with same params
    // Assert: gl.texImage2D NOT called on second invocation
    //         (verify via mock call count)
  });

  it('SFBO-004: SDR->HDR transition recreates FBO as RGBA16F', () => {
    // Setup: First render with SDR image (creates RGBA8)
    // Action: Render with HDR image
    // Assert: gl.deleteTexture called (old texture), gl.deleteFramebuffer called
    //         then gl.texImage2D called with gl.RGBA16F
  });

  it('SFBO-030: HDR->SDR transition recreates FBO as RGBA8', () => {
    // Setup: First render with HDR image (creates RGBA16F)
    // Action: Render with SDR image
    // Assert: FBO recreated as RGBA8
  });

  it('SFBO-031: dimension change triggers recreation even if format unchanged', () => {
    // Setup: Create RGBA8 FBO at 320x180
    // Action: Call with 640x360 (same format)
    // Assert: FBO recreated
  });
});
```

---

### Task 3.4: Modify `ensureScopePBOs` for Conditional Format
**Complexity:** small
**Files:** `src/render/Renderer.ts` (lines 1370-1394)
**Dependencies:** Task 3.2, Task 3.3

#### Current Code Analysis
`ensureScopePBOs(width, height)` at line 1370:
- Early-return check (line 1373): `if (this.scopePBOs[0] && this.scopePBOs[1]) return;`
  - Does NOT check format. If format changes but PBOs still exist, they won't be recreated.
- Buffer size (line 1375): `const byteSize = width * height * RGBA_CHANNELS * Float32Array.BYTES_PER_ELEMENT;`
  - Always 4 bytes/channel (Float32), never 1 byte/channel (Uint8)

The caller path in `renderImageToFloatAsyncForScopes()` (line 1200-1206):
```typescript
if (this.scopePBOWidth !== width || this.scopePBOHeight !== height) {
  this.disposeScopePBOs();
}
this.ensureScopePBOs(width, height);
```
This only invalidates on dimension change, not format change.

#### Implementation Steps
1. Add format parameter:
   ```typescript
   private ensureScopePBOs(width: number, height: number, format: 'rgba16f' | 'rgba8' = 'rgba16f'): void {
   ```

2. Extend early-return to check format (replace line 1373):
   ```typescript
   if (this.scopePBOs[0] && this.scopePBOs[1] && this.scopePBOFormat === format) return;
   ```
   If format changed but PBOs exist, fall through to delete+recreate.

3. Add cleanup of old PBOs when format changes (after the early return, before `const byteSize`):
   ```typescript
   // If PBOs exist but format changed, dispose them first
   if (this.scopePBOs[0] || this.scopePBOs[1]) {
     this.disposeScopePBOs();
   }
   ```

4. Compute buffer size conditionally (replace line 1375):
   ```typescript
   const bytesPerChannel = format === 'rgba8' ? 1 : Float32Array.BYTES_PER_ELEMENT;
   const byteSize = width * height * RGBA_CHANNELS * bytesPerChannel;
   ```

5. Store format after allocation (add after line 1393):
   ```typescript
   this.scopePBOFormat = format;
   ```

6. In the caller `renderImageToFloatAsyncForScopes()`, extend the invalidation check (replace lines 1200-1203):
   ```typescript
   const neededFormat = isHDRContent(image) ? 'rgba16f' : 'rgba8';
   if (this.scopePBOWidth !== width || this.scopePBOHeight !== height || this.scopePBOFormat !== neededFormat) {
     this.disposeScopePBOs();
   }
   ```

#### Edge Cases & Risks
- **Risk: PBO double-buffering across format changes.** When format switches from RGBA16F to RGBA8 mid-stream, one PBO may have an in-flight async readPixels with FLOAT format while the new PBOs use UNSIGNED_BYTE. The fence check at lines 1241-1249 would consume the old FLOAT data into a Uint8Array buffer. **Mitigation:** `disposeScopePBOs()` already deletes fences (lines 1404-1405), so any in-flight reads are abandoned.
- **Risk: `scopePBOReady` flag.** After a format switch, `disposeScopePBOs()` sets `scopePBOReady = false` (line 1409), which correctly triggers the first-frame sync fallback at line 1265.
- **Risk: RGBA8 PBO size.** At 640x360, RGBA8 PBO = 640 * 360 * 4 = 921,600 bytes per PBO (2 PBOs = 1.8 MB). RGBA16F PBO = 640 * 360 * 16 = 14,745,600 bytes per PBO. Significant saving.

#### Test Specifications
**File:** `src/render/Renderer.renderForScopes.test.ts`

```typescript
describe('Task 3.4: ensureScopePBOs conditional format', () => {
  it('SFBO-040: SDR image creates smaller PBOs (RGBA8 size)', () => {
    // Assert: gl.bufferData called with byteSize = w * h * 4 * 1 (not * 4)
  });

  it('SFBO-041: HDR image creates full-size PBOs (RGBA FLOAT size)', () => {
    // Assert: gl.bufferData called with byteSize = w * h * 4 * 4
  });

  it('SFBO-042: format change triggers PBO disposal and recreation', () => {
    // Setup: First render with SDR (creates RGBA8 PBOs)
    // Action: Render with HDR image
    // Assert: gl.deleteBuffer called for old PBOs, new PBOs created with FLOAT size
  });

  it('SFBO-043: same format + same dimensions = PBOs reused', () => {
    // Setup: Create PBOs for SDR, then call again with SDR same size
    // Assert: gl.createBuffer NOT called again
  });
});
```

---

### Task 3.5: Modify `renderImageToFloatAsyncForScopes` for Dual Format
**Complexity:** medium
**Files:** `src/render/Renderer.ts` (lines 1186-1280)
**Dependencies:** Task 3.1, Task 3.3, Task 3.4

#### Current Code Analysis
This is the most complex task. The method currently:

1. **Line 1190-1194:** Checks `EXT_color_buffer_float`. RGBA8 FBOs do NOT require this extension, so for SDR content we can bypass this check entirely.
2. **Line 1197:** Calls `this.ensureScopeFBO(width, height)` -- no format param.
3. **Line 1206:** Calls `this.ensureScopePBOs(width, height)` -- no format param.
4. **Line 1214-1216:** Creates `Float32Array` for cached pixels. For SDR, this should be `Uint8Array`.
5. **Line 1230:** Sets `this.hdrOutputMode = 'hlg'` which makes the shader set `u_outputMode = HDR` (line 418), bypassing the `clamp(0,1)` in the fragment shader (line 1386-1388). For SDR, we want `u_outputMode = SDR` so values ARE clamped.
6. **Line 1256:** `gl.readPixels(0, 0, width, height, gl.RGBA, gl.FLOAT, 0)` -- async PBO path. For SDR: `gl.UNSIGNED_BYTE`.
7. **Line 1266:** `gl.readPixels(0, 0, width, height, gl.RGBA, gl.FLOAT, this.scopePBOCachedPixels!)` -- sync fallback. For SDR: `gl.UNSIGNED_BYTE` into `Uint8Array`.
8. **Line 1246:** `gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, this.scopePBOCachedPixels!)` -- PBO consume. For SDR: into `Uint8Array`.
9. **Line 1279:** Returns `this.scopePBOCachedPixels` (always `Float32Array`). For SDR, will return `Float32Array` (after conversion in Task 3.6).

#### Implementation Steps

1. **Determine format early** (add after line 1188):
   ```typescript
   const neededFormat = isHDRContent(image) ? 'rgba16f' : 'rgba8';
   const isSDR = neededFormat === 'rgba8';
   ```

2. **Bypass `EXT_color_buffer_float` check for SDR** (replace lines 1190-1194):
   ```typescript
   if (!isSDR) {
     // RGBA16F FBO requires EXT_color_buffer_float
     if (this.hasColorBufferFloat === null) {
       this.hasColorBufferFloat = gl.getExtension('EXT_color_buffer_float') !== null;
     }
     if (!this.hasColorBufferFloat) return null;
   }
   ```

3. **Pass format to ensureScopeFBO and ensureScopePBOs**:
   ```typescript
   this.ensureScopeFBO(width, height, neededFormat);
   // ...
   this.ensureScopePBOs(width, height, neededFormat);
   ```

4. **Allocate correct cached pixel buffer** (replace lines 1214-1216):
   ```typescript
   if (isSDR) {
     if (!this.scopePBOCachedPixelsUint8 || this.scopePBOCachedPixelsUint8.length !== pixelCount) {
       this.scopePBOCachedPixelsUint8 = new Uint8Array(pixelCount);
     }
   } else {
     if (!this.scopePBOCachedPixels || this.scopePBOCachedPixels.length !== pixelCount) {
       this.scopePBOCachedPixels = new Float32Array(pixelCount);
     }
   }
   ```

5. **Set correct `hdrOutputMode` for SDR** (replace line 1230):
   ```typescript
   this.hdrOutputMode = isSDR ? 'sdr' : 'hlg';
   ```
   When `hdrOutputMode = 'sdr'`, `renderImage()` sets `u_outputMode = OUTPUT_MODE_SDR` (line 418), which clamps output to [0,1] in the fragment shader (line 1386-1388). This is essential for RGBA8 to not produce garbage.

6. **Use correct readPixels format and buffer** (replace lines 1246, 1256, 1266):
   - PBO consume (line 1246):
     ```typescript
     const readBuf = isSDR ? this.scopePBOCachedPixelsUint8! : this.scopePBOCachedPixels!;
     gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, readBuf);
     ```
   - Async PBO readPixels (line 1256):
     ```typescript
     gl.readPixels(0, 0, width, height, gl.RGBA, isSDR ? gl.UNSIGNED_BYTE : gl.FLOAT, 0);
     ```
   - Sync fallback readPixels (line 1266):
     ```typescript
     const syncBuf = isSDR ? this.scopePBOCachedPixelsUint8! : this.scopePBOCachedPixels!;
     gl.readPixels(0, 0, width, height, gl.RGBA, isSDR ? gl.UNSIGNED_BYTE : gl.FLOAT, syncBuf);
     ```

7. **Return appropriate buffer** (replace line 1279):
   ```typescript
   return isSDR ? this.scopePBOCachedPixelsUint8 : this.scopePBOCachedPixels;
   ```
   This changes the return type to `Float32Array | Uint8Array | null`. Task 3.6 handles the conversion.

#### Edge Cases & Risks
- **CRITICAL Risk: `hdrOutputMode = 'sdr'` affects display state.** The current code saves `prevHdrMode` (line 1225) and restores it in the finally block (line 1270). Setting `hdrOutputMode = 'sdr'` for SDR scope rendering means the shader will clamp output to [0,1] and apply display-referred OETF... except the code also neutralizes display state via `SCOPE_DISPLAY_CONFIG` (line 1220) which sets `transferFunction: 0` (DISPLAY_TRANSFER_LINEAR) and `displayGamma: 1`. So the OETF path is already neutralized. The only effect of `u_outputMode = SDR` is the `clamp(0, 1)` which is exactly what we want. **Safe.**
- **Risk: SDR content with exposure push.** If the user has cranked exposure to +5.0 on SDR content, values after the exposure stage will exceed 1.0. With `u_outputMode = SDR`, these are clamped to 1.0 in the shader, then stored in RGBA8. The scope will show clipped highlights. This is actually correct behavior because the SCOPE_DISPLAY_CONFIG neutralizes display gamma/brightness, not color adjustments (exposure, contrast, etc. remain active). The scopes intentionally reflect the user's grading.
- **Risk: Tone mapping interaction.** Lines 1226-1228 disable tone mapping for scopes when the display is HDR. For SDR content (`prevHdrMode === 'sdr'`), `disableToneMappingForScopes` is already `false` (line 1226: `prevHdrMode !== 'sdr'` evaluates to `false`). So tone mapping state is NOT changed. This is correct because SDR display mode doesn't have tone mapping active anyway.
- **Risk: `renderImageToFloatSync` fallback.** Line 1209-1210 falls back to sync path when PBOs fail. The sync path at line 1285 also needs the same format-aware treatment. See Task 3.5b below.

#### Test Specifications
**File:** `src/render/Renderer.renderForScopes.test.ts`

```typescript
describe('Task 3.5: renderImageToFloatAsyncForScopes dual format', () => {
  it('SFBO-050: SDR image sets hdrOutputMode to sdr during scope render', () => {
    // Verify shader receives u_outputMode = OUTPUT_MODE_SDR (0)
    // so values are clamped to [0,1] before FBO write
  });

  it('SFBO-051: HDR image sets hdrOutputMode to hlg during scope render', () => {
    // Verify shader receives u_outputMode = OUTPUT_MODE_HDR (1)
    // so values > 1.0 are preserved
  });

  it('SFBO-052: SDR readPixels uses UNSIGNED_BYTE', () => {
    // Assert: gl.readPixels called with gl.UNSIGNED_BYTE type
  });

  it('SFBO-053: HDR readPixels uses FLOAT', () => {
    // Assert: gl.readPixels called with gl.FLOAT type
  });

  it('SFBO-054: SDR bypasses EXT_color_buffer_float check', () => {
    // Setup: Mock gl.getExtension to return null for EXT_color_buffer_float
    // Action: Render SDR image
    // Assert: renderForScopes returns non-null (RGBA8 works without the extension)
  });

  it('SFBO-055: HDR without EXT_color_buffer_float returns null', () => {
    // Setup: Mock gl.getExtension to return null for EXT_color_buffer_float
    // Action: Render HDR image (float32)
    // Assert: renderForScopes returns null
  });

  it('SFBO-056: hdrOutputMode is restored after scope render', () => {
    // Save hdrOutputMode before, trigger scope render, verify restored
    // (Already tested in RFS-020..023 for the existing path)
  });
});
```

#### Task 3.5b: Update `renderImageToFloatSync` for Dual Format
**Complexity:** small
**Files:** `src/render/Renderer.ts` (lines 1285-1321)
**Dependencies:** Task 3.1, Task 3.5

The sync fallback path (used when PBO allocation fails) also needs format awareness:
- Line 1300: `this.hdrOutputMode = 'hlg'` -- should be `'sdr'` for SDR
- Line 1302: Creates `Float32Array` -- should create `Uint8Array` for SDR
- Line 1309: `gl.readPixels(..., gl.FLOAT, pixels)` -- should use `gl.UNSIGNED_BYTE` for SDR

However, the sync path currently returns `Float32Array | null`. Changing its return type to `Float32Array | Uint8Array | null` keeps it consistent with the async path.

---

### Task 3.6: Uint8->Float32 Conversion in `renderForScopes`
**Complexity:** small
**Files:** `src/render/Renderer.ts` (lines 1147-1179)
**Dependencies:** Task 3.5

#### Current Code Analysis
`renderForScopes()` at line 1147:
- Line 1156: Calls `renderImageToFloatAsyncForScopes()` which returns `Float32Array | null`
- Line 1161: `const result = new Float32Array(pixels)` -- copies the data for Y-flip
- Lines 1163-1176: Y-flip logic operates on `Float32Array`
- Line 1178: Returns `{ data: result, width, height }` where `data: Float32Array`

The return type signature (line 1151): `{ data: Float32Array; width: number; height: number } | null`

**Consumers of `renderForScopes()`:**
- `PixelSamplingManager.ts` line 381: receives the result, passes `floatData` to scopes
- `Waveform.ts` line 299: `floatRGBAToImageData(floatData, width, height)` expects Float32Array
- `Vectorscope.ts` line 330: `floatRGBAToImageData(floatData, width, height)` expects Float32Array
- `WebGLScopes.ts` line 603: `setFloatImage(data: Float32Array, ...)` expects Float32Array

All downstream consumers expect `Float32Array`. The conversion must happen here.

#### Implementation Steps
1. After receiving pixels from `renderImageToFloatAsyncForScopes` (line 1156), check the type:
   ```typescript
   const rawPixels = this.renderImageToFloatAsyncForScopes(image, targetWidth, targetHeight);
   if (!rawPixels) return null;

   // Convert Uint8Array readback to Float32Array for downstream consumers
   let pixels: Float32Array;
   if (rawPixels instanceof Uint8Array) {
     pixels = new Float32Array(rawPixels.length);
     for (let i = 0; i < rawPixels.length; i++) {
       pixels[i] = rawPixels[i]! / 255.0;
     }
   } else {
     pixels = rawPixels;
   }
   ```

2. The rest of the method (Y-flip, return) operates on `pixels: Float32Array` unchanged.

3. Remove the separate `new Float32Array(pixels)` copy on line 1161, since the Uint8 path already creates a new Float32Array. For the Float32 path, still need to copy:
   ```typescript
   const result = pixels instanceof Float32Array && pixels === rawPixels
     ? new Float32Array(pixels) // copy to avoid mutating shared PBO cache
     : pixels; // already a fresh array from Uint8->Float32 conversion
   ```
   Actually, simpler approach:
   ```typescript
   let result: Float32Array;
   if (rawPixels instanceof Uint8Array) {
     // Convert Uint8 to Float32 -- this is already a new allocation
     result = new Float32Array(rawPixels.length);
     for (let i = 0; i < rawPixels.length; i++) {
       result[i] = rawPixels[i]! / 255.0;
     }
   } else {
     // Copy so Y-flip doesn't mutate the shared PBO cache
     result = new Float32Array(rawPixels);
   }
   ```

#### Edge Cases & Risks
- **Performance: Uint8->Float32 conversion cost.** For 640x360x4 = 921,600 elements, this is a tight loop of ~920K divisions. On modern CPUs this takes <1ms. Acceptable.
- **Precision: `/255.0` accuracy.** `128/255.0 = 0.5019607...` which is close to 0.5 but not exact. This is inherent to 8-bit quantization and is lossless in the sense that the scope sees exactly what the 8-bit SDR pipeline produces.
- **Risk: `scopeTempRow` still Float32.** The Y-flip temp row (line 1167-1169) creates a `Float32Array`. Since both paths produce `Float32Array` by this point, no change needed.
- **Risk: Return type unchanged.** The public return type `{ data: Float32Array; ... }` does NOT change. This is intentional -- all downstream consumers continue to receive Float32Array.

#### Test Specifications
**File:** `src/render/Renderer.renderForScopes.test.ts`

```typescript
describe('Task 3.6: Uint8 to Float32 conversion', () => {
  // Test the conversion logic independently
  function uint8ToFloat32(uint8Data: Uint8Array): Float32Array {
    const result = new Float32Array(uint8Data.length);
    for (let i = 0; i < uint8Data.length; i++) {
      result[i] = uint8Data[i]! / 255.0;
    }
    return result;
  }

  it('SFBO-005: [0, 128, 255, 255] converts to [0.0, ~0.502, 1.0, 1.0]', () => {
    const input = new Uint8Array([0, 128, 255, 255]);
    const result = uint8ToFloat32(input);
    expect(result[0]).toBeCloseTo(0.0, 6);
    expect(result[1]).toBeCloseTo(128 / 255, 4);
    expect(result[2]).toBeCloseTo(1.0, 6);
    expect(result[3]).toBeCloseTo(1.0, 6);
  });

  it('SFBO-060: all-zero Uint8 converts to all-zero Float32', () => {
    const input = new Uint8Array(16).fill(0);
    const result = uint8ToFloat32(input);
    for (let i = 0; i < result.length; i++) {
      expect(result[i]).toBe(0.0);
    }
  });

  it('SFBO-061: all-255 Uint8 converts to all-1.0 Float32', () => {
    const input = new Uint8Array(16).fill(255);
    const result = uint8ToFloat32(input);
    for (let i = 0; i < result.length; i++) {
      expect(result[i]).toBe(1.0);
    }
  });

  it('SFBO-062: conversion result length matches input length', () => {
    const input = new Uint8Array(640 * 360 * 4);
    const result = uint8ToFloat32(input);
    expect(result.length).toBe(input.length);
  });

  it('SFBO-063: conversion preserves monotonicity', () => {
    const input = new Uint8Array([0, 1, 127, 128, 254, 255]);
    const result = uint8ToFloat32(input);
    for (let i = 1; i < result.length; i++) {
      expect(result[i]!).toBeGreaterThan(result[i - 1]!);
    }
  });

  it('SFBO-064: Y-flip works correctly on converted SDR data', () => {
    // 1x2 image: row0=[0,0,0,255], row1=[128,128,128,255]
    const uint8Data = new Uint8Array([0, 0, 0, 255, 128, 128, 128, 255]);
    const floatData = uint8ToFloat32(uint8Data);
    // Y-flip
    const result = new Float32Array(floatData);
    const rowSize = 1 * 4;
    const temp = new Float32Array(rowSize);
    temp.set(result.subarray(0, rowSize));
    result.copyWithin(0, rowSize, rowSize * 2);
    result.set(temp, rowSize);
    // After flip: row0 should be ~[0.502, 0.502, 0.502, 1.0]
    expect(result[0]).toBeCloseTo(128 / 255, 4);
    expect(result[4]).toBeCloseTo(0.0, 6);
  });
});
```

---

### Task 3.7 (Optional): Hysteresis to Prevent Format Thrashing
**Complexity:** small
**Files:** `src/render/Renderer.ts`
**Dependencies:** Task 3.5

#### Current Code Analysis
There is no hysteresis mechanism in the current codebase. Each call to `renderImageToFloatAsyncForScopes` would re-evaluate `isHDRContent(image)` and potentially switch format. In practice, format changes only happen when the user switches between different media files (e.g., SDR JPEG sequence -> HDR EXR). During normal playback of a single clip, the format stays constant.

#### Implementation Steps
1. Add counter field:
   ```typescript
   private scopeSDRFrameCount = 0;
   private static readonly SCOPE_FORMAT_HYSTERESIS = 30;
   ```
2. In `renderImageToFloatAsyncForScopes`, instead of directly using `neededFormat`:
   ```typescript
   if (isSDR) {
     this.scopeSDRFrameCount = Math.min(this.scopeSDRFrameCount + 1, Renderer.SCOPE_FORMAT_HYSTERESIS);
   } else {
     this.scopeSDRFrameCount = 0; // Reset immediately on HDR detection
   }
   const effectiveFormat = (isSDR && this.scopeSDRFrameCount >= Renderer.SCOPE_FORMAT_HYSTERESIS)
     ? 'rgba8' : (isSDR ? this.scopeFBOFormat : 'rgba16f');
   // Use effectiveFormat instead of neededFormat for FBO/PBO creation
   ```
3. On HDR detection, immediately upgrade to RGBA16F (no delay).

#### Edge Cases & Risks
- **Risk: First SDR frame delays optimization.** For the first 30 frames of SDR content, the RGBA16F FBO is used. This is intentional -- it avoids thrashing for mixed content playlists.
- **Risk: Complexity vs. benefit.** Format thrashing only happens on content switches, which are user-initiated and infrequent. The cost of one FBO+PBO recreation is negligible (~2ms). **Recommendation: Skip this task unless profiling shows thrashing is an issue.**

#### Test Specifications
**File:** `src/render/Renderer.renderForScopes.test.ts`

```typescript
describe('Task 3.7: Format hysteresis (optional)', () => {
  it('SFBO-070: first SDR frame does NOT downgrade to RGBA8', () => {
    // First render with SDR: format should remain RGBA16F
  });

  it('SFBO-071: after 30 consecutive SDR frames, format downgrades to RGBA8', () => {
    // Render SDR image 30 times, verify FBO is now RGBA8
  });

  it('SFBO-072: single HDR frame immediately upgrades to RGBA16F', () => {
    // After 30 SDR frames (now RGBA8), render one HDR frame
    // Verify immediate switch to RGBA16F
  });

  it('SFBO-073: HDR frame resets SDR counter to 0', () => {
    // After 20 SDR frames, one HDR frame, then 10 SDR frames
    // Should NOT downgrade (counter restarted at 0, only reached 10)
  });
});
```

---

### Task 3.8 (Optional): RGBA8 Scopes Without `EXT_color_buffer_float`
**Complexity:** trivial
**Files:** `src/render/Renderer.ts`
**Dependencies:** Task 3.5

#### Current Code Analysis
The `EXT_color_buffer_float` check at line 1190-1194 returns `null` if the extension is not available, which completely disables GPU scopes. With the RGBA8 SDR path (Task 3.5), SDR content can render scopes WITHOUT this extension.

The check was already modified in Task 3.5 to only apply for HDR content. This task is automatically completed by Task 3.5.

#### Edge Cases & Risks
- **Risk: HDR content on devices without `EXT_color_buffer_float`.** GPU scopes will still return `null` for HDR content. The existing fallback in `PixelSamplingManager.ts` (line 382-387) handles this by falling back to the 2D canvas path. This produces SDR-clamped scope data, which is suboptimal but functional.
- **Benefit:** Enables GPU-accelerated scopes for SDR content on more devices (especially mobile WebGL2 implementations that lack `EXT_color_buffer_float`).

#### Test Specifications
Covered by `SFBO-054` and `SFBO-055` in Task 3.5.

---

## Risk Analysis

### Color Accuracy
- **RGBA8 quantization:** 256 levels per channel. For 8-bit SDR sources, this is lossless (the source data is already 8-bit). For SDR content that has been graded (exposure push, curves), the graded values are clamped/quantized by the RGBA8 FBO.
- **Extreme exposure push on SDR content:** If the user pushes exposure +5 stops on SDR content, values above 1.0 are clamped to 1.0 by the `u_outputMode = SDR` shader path. Scopes show the clipped result, which is accurate -- the clipping is real and the scope should reflect it.
- **Sub-pixel precision:** SDR scopes already work with 8-bit data downstream (ImageData is Uint8ClampedArray). The Float32 intermediate was providing phantom precision that was discarded at the ImageData conversion step. The RGBA8 path eliminates this redundant precision.

### GPU State Corruption
- All scope rendering state changes (`hdrOutputMode`, `displayColorState`, `toneMappingState`, `viewport`, `framebuffer binding`) are saved before and restored in `finally` blocks (lines 1225-1277). This save/restore pattern is robust against exceptions.
- The new `hdrOutputMode = 'sdr'` path for SDR content is within the same save/restore scope. No new state leak risk.

### Extension Compatibility
- `EXT_color_buffer_float` is required for RGBA16F FBOs. The RGBA8 path removes this requirement for SDR content, improving device compatibility.
- `gl.fenceSync` and PBOs are WebGL2 core features, not extension-dependent. No compatibility concern.

### Performance
- FBO format switch cost: One `texImage2D` + `checkFramebufferStatus` call (~0.1ms).
- PBO recreation cost: Two `bufferData` calls (~0.1ms).
- Uint8->Float32 conversion: ~0.5ms for 640x360x4 elements (tight loop, no allocation).
- Total overhead per format switch: <1ms. Format switches are rare (content change only).
- Steady-state savings: ~6MB less GPU memory, ~50% less DMA bandwidth per scope frame.

---

## Dependency Graph

```
Task 3.1 (isHDRContent)          Task 3.2 (Format tracking state)
     \                                  /       \
      \                                /         \
       v                              v           v
   Task 3.3 (ensureScopeFBO)    Task 3.4 (ensureScopePBOs)
          \                          /
           \                        /
            v                      v
       Task 3.5 (renderImageToFloatAsyncForScopes)
              \
               v
        Task 3.6 (Uint8->Float32 in renderForScopes)
              \
               v
    Task 3.7 (Optional: Hysteresis)
    Task 3.8 (Optional: No-extension SDR scopes -- free with 3.5)
```

All tasks can be implemented and tested incrementally. Tasks 3.1 and 3.2 are independent of each other. Tasks 3.3 and 3.4 depend on 3.2 for format state fields. Task 3.5 ties everything together. Task 3.6 is the final consumer-facing change.

---

## Test Summary

| ID | Task | Test | Assertion |
|----|------|------|-----------|
| SFBO-001 | 3.3 | uint8 SDR -> RGBA8 FBO | `texImage2D` with `gl.RGBA8` |
| SFBO-002 | 3.3 | float32 -> RGBA16F FBO | `texImage2D` with `gl.RGBA16F` |
| SFBO-003 | 3.3 | Format unchanged -> no recreation | `texImage2D` not called |
| SFBO-004 | 3.3 | SDR->HDR transition -> recreate | Old deleted, new RGBA16F |
| SFBO-005 | 3.6 | Uint8 readback converts correctly | [0,128,255] -> [0.0, ~0.502, 1.0] |
| SFBO-010 | 3.1 | uint8+srgb = SDR | `isHDRContent` returns false |
| SFBO-011 | 3.1 | uint8+no metadata = SDR | `isHDRContent` returns false |
| SFBO-012 | 3.1 | float32 = HDR | `isHDRContent` returns true |
| SFBO-013 | 3.1 | uint16 = HDR | `isHDRContent` returns true |
| SFBO-014 | 3.1 | uint8+hlg = HDR | `isHDRContent` returns true |
| SFBO-015 | 3.1 | uint8+pq = HDR | `isHDRContent` returns true |
| SFBO-016 | 3.1 | uint8+smpte240m = HDR | `isHDRContent` returns true |
| SFBO-017 | 3.1 | uint8+videoFrame = HDR | `isHDRContent` returns true |
| SFBO-030 | 3.3 | HDR->SDR transition -> recreate RGBA8 | Old RGBA16F deleted |
| SFBO-031 | 3.3 | Dimension change -> recreation | FBO recreated |
| SFBO-040 | 3.4 | SDR PBOs use Uint8 size | `bufferData` with w*h*4*1 |
| SFBO-041 | 3.4 | HDR PBOs use Float size | `bufferData` with w*h*4*4 |
| SFBO-042 | 3.4 | Format change -> PBO disposal+recreation | `deleteBuffer` then `createBuffer` |
| SFBO-043 | 3.4 | Same format+size -> PBO reuse | `createBuffer` not called |
| SFBO-050 | 3.5 | SDR sets outputMode=SDR | Shader clamps to [0,1] |
| SFBO-051 | 3.5 | HDR sets outputMode=HDR | Shader allows >1.0 |
| SFBO-052 | 3.5 | SDR readPixels UNSIGNED_BYTE | `readPixels` type arg |
| SFBO-053 | 3.5 | HDR readPixels FLOAT | `readPixels` type arg |
| SFBO-054 | 3.5 | SDR without EXT_color_buffer_float works | Non-null return |
| SFBO-055 | 3.5 | HDR without EXT_color_buffer_float fails | Null return |
| SFBO-060 | 3.6 | All-zero Uint8 -> all-zero Float32 | Element-wise check |
| SFBO-061 | 3.6 | All-255 Uint8 -> all-1.0 Float32 | Element-wise check |
| SFBO-062 | 3.6 | Conversion length matches | `.length` equality |
| SFBO-063 | 3.6 | Conversion monotonicity | Each f[i] > f[i-1] |
| SFBO-064 | 3.6 | Y-flip on converted SDR data | Row order verified |
| SFBO-070 | 3.7 | First SDR frame stays RGBA16F | (optional) |
| SFBO-071 | 3.7 | 30 SDR frames -> RGBA8 | (optional) |
| SFBO-072 | 3.7 | HDR immediately upgrades | (optional) |
| SFBO-073 | 3.7 | HDR resets counter | (optional) |
