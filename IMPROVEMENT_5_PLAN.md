# Improvement Plan 5: Fix VideoFrame VRAM Leak Risk

## Problem Statement

`VideoFrame` objects in the WebCodecs API hold GPU memory (VRAM) that is **not** released by
JavaScript garbage collection. Each VideoFrame retains its backing GPU texture until
`VideoFrame.close()` is explicitly called. In a video playback or HDR image viewing session,
hundreds or thousands of VideoFrames can be created, and any missed `close()` call causes VRAM
to accumulate until the page is unloaded.

**Current risk profile:**
- At 1920x1080 RGBA16F, each VideoFrame consumes ~16 MB of VRAM.
- A 1000-frame scrub session without proper cleanup would exhaust ~16 GB of VRAM.
- Multiple independent code paths create, transfer, and consume VideoFrames, making it easy
  to miss a `close()` call during error handling, early returns, or refactoring.
- The existing cleanup relies on manual `close()` calls scattered across the codebase with
  no compile-time enforcement.

**Where VideoFrames are created (6 creation sites):**

| # | File | Line | Context |
|---|------|------|---------|
| 1 | `src/nodes/sources/VideoSourceNode.ts:878` | `sample.toVideoFrame()` | HDR frame decode via `hdrSampleToIPImage()` |
| 2 | `src/utils/media/HDRFrameResizer.ts:109` | `new VideoFrame(this.canvas!, ...)` | Resized HDR frame from OffscreenCanvas |
| 3 | `src/nodes/sources/FileSourceNode.ts:1208` | `new VideoFrame(bitmap, { timestamp: 0 })` | HDR AVIF image load |
| 4 | `src/nodes/sources/FileSourceNode.ts:1272` | `new VideoFrame(bitmap, { timestamp: 0 })` | HDR JXL image load |
| 5 | `src/nodes/sources/FileSourceNode.ts:1403` | `new VideoFrame(bitmap, { timestamp: 0 })` | HDR HEIC image load |
| 6 | `src/export/VideoExporter.ts:283` | `new VideoFrame(surface, ...)` | Video encoding (export pipeline) |

Additionally, `src/utils/media/MediabunnyFrameExtractor.ts:277` calls `probeSample.toVideoFrame()`
for HDR detection probing (properly closed at line 298).

**Where VideoFrames should be closed (existing close sites):**

| # | File | Line | Mechanism |
|---|------|------|-----------|
| A | `src/core/image/Image.ts:160` | `IPImage.close()` | Manual close of `this.videoFrame` |
| B | `src/nodes/sources/VideoSourceNode.ts:66` | LRU `onEvict` | `image.close()` on cache eviction |
| C | `src/nodes/sources/VideoSourceNode.ts:1054` | `sample.close()` | After `toVideoFrame()` in `fetchHDRFrame` |
| D | `src/nodes/sources/VideoSourceNode.ts:1058` | `ipImage.close()` | Guard: dispose during async fetch |
| E | `src/nodes/sources/VideoSourceNode.ts:1210-1211` | `hdrFrameCache.clear()` in `dispose()` | Triggers onEvict for all cached frames |
| F | `src/utils/media/HDRFrameResizer.ts:114` | `videoFrame.close()` | Original frame closed after resize |
| G | `src/utils/media/MediabunnyFrameExtractor.ts:298` | `probeFrame.close()` | HDR probe cleanup |
| H | `src/render/Renderer.ts:813` | `image.close()` | Fallback when texImage2D fails |
| I | `src/export/VideoExporter.ts:291` | `videoFrame.close()` | In finally block after encode |
| J | `src/nodes/sources/FileSourceNode.ts:2117` | `cachedIPImage.close()` | FileSourceNode dispose |

## Gap Analysis: Identified Leak Risks

### Risk 1: `hdrSampleToIPImage` error paths (HIGH)
**File:** `src/nodes/sources/VideoSourceNode.ts:878-947`

`sample.toVideoFrame()` at line 878 creates a VideoFrame. If `HDRFrameResizer.resize()` throws
after receiving the VideoFrame (line 908-922), the code catches the error at the HDRFrameResizer
level (line 127-129 in HDRFrameResizer.ts) and returns the original frame, which is fine. However,
if `new IPImage(...)` at line 926 throws (e.g., out of memory), the VideoFrame from line 878
(or the resized one from HDRFrameResizer) leaks -- there is no try/finally guarding the IPImage
construction.

### Risk 2: `fetchHDRFrame` catch block swallows error without cleanup (MEDIUM)
**File:** `src/nodes/sources/VideoSourceNode.ts:1065-1067`

The catch block at line 1065 returns `null` but does not close any partially-constructed
resources. If the error occurs after `hdrSampleToIPImage` returns an IPImage but before
`hdrFrameCache.set()` at line 1063, the IPImage (and its VideoFrame) leaks.

### Risk 3: FileSourceNode HDR loaders have no try/finally (MEDIUM)
**Files:**
- `src/nodes/sources/FileSourceNode.ts:1208` (AVIF)
- `src/nodes/sources/FileSourceNode.ts:1272` (JXL)
- `src/nodes/sources/FileSourceNode.ts:1403` (HEIC)

Pattern: `new VideoFrame(bitmap, ...)` followed by `bitmap.close()` then IPImage construction.
If IPImage construction fails, the VideoFrame leaks. The bitmap is closed, but the VideoFrame
is not wrapped in try/finally.

### Risk 4: Renderer fallback closes image but not just the VideoFrame (LOW)
**File:** `src/render/Renderer.ts:813`

When `texImage2D` fails for a VideoFrame-backed IPImage, `image.close()` is called, which
closes both the VideoFrame and ImageBitmap. This is correct behavior but destroys the IPImage
for any future use from the LRU cache. A better approach would be to only close the VideoFrame
and fall through to the typed-array path, but this is a design choice rather than a leak.

### Risk 5: No leak detection in tests (HIGH)
There is no automated mechanism to verify that all created VideoFrames are eventually closed.
Tests mock VideoFrame with `close: vi.fn()` but don't systematically assert that close was
called for every creation.

### Risk 6: `IPImage.clone()` shares `imageBitmap` but not `videoFrame` (LOW)
**File:** `src/core/image/Image.ts:196-204`

`clone()` copies `imageBitmap` reference but not `videoFrame`. This is documented and intentional,
but if a caller clones an IPImage expecting the VideoFrame to be available, they get `null`.
Not a leak, but a potential source confusion.

## Proposed Solution: ManagedVideoFrame with Reference Counting

### Approach Selection

Three approaches were evaluated:

1. **`Symbol.dispose` (TypeScript 5.2+ Explicit Resource Management)**
   - Pros: Language-native, compiler-enforced via `using` keyword
   - Cons: Requires `target: "ES2022"` upgrade to `"ESNext"` and `lib` to include
     `"esnext.disposable"`. The `using` keyword is not yet supported in all bundlers.
     Current tsconfig targets ES2022.
   - Verdict: **Future ideal, not ready today**

2. **Reference-counting wrapper (`ManagedVideoFrame`)**
   - Pros: Works with current tsconfig, explicit ownership model, zero runtime dependencies
   - Cons: Adds a wrapper class, requires discipline at call sites
   - Verdict: **Recommended -- practical and implementable now**

3. **WeakRef-based cleanup with FinalizationRegistry**
   - Pros: Automatic, no wrapper needed
   - Cons: FinalizationRegistry is non-deterministic; VRAM could accumulate for many frames
     before GC runs. Defeats the purpose of explicit close().
   - Verdict: **Rejected -- unreliable for VRAM management**

### Recommended: Hybrid Approach

Implement a `ManagedVideoFrame` reference-counting wrapper **and** prepare for `Symbol.dispose`
adoption when the TypeScript target is upgraded.

## Detailed Steps

### Step 1: Create `ManagedVideoFrame` class

**New file:** `src/core/image/ManagedVideoFrame.ts`

```typescript
/**
 * Reference-counted wrapper around VideoFrame that ensures explicit
 * VRAM cleanup. Each ManagedVideoFrame tracks how many owners hold
 * a reference; the underlying VideoFrame.close() is called only when
 * the last owner releases.
 *
 * Typical flow:
 *   const managed = ManagedVideoFrame.wrap(videoFrame);
 *   // ... pass to IPImage, cache, etc.
 *   managed.release(); // decrements refcount; closes when 0
 */
export class ManagedVideoFrame {
  private refCount = 1;
  private closed = false;

  /** For debugging: creation stack trace (only in dev builds) */
  readonly creationStack?: string;

  private constructor(
    public readonly frame: VideoFrame,
    /** Unique ID for leak tracking */
    public readonly id: number,
  ) {
    if (__DEV__) {
      this.creationStack = new Error().stack;
    }
    ManagedVideoFrame._activeCount++;
    ManagedVideoFrame._registry?.register(this, { id, frame });
  }

  // --- Static tracking for leak detection ---
  private static _nextId = 0;
  private static _activeCount = 0;
  private static _registry: FinalizationRegistry<{ id: number; frame: VideoFrame }> | null = null;

  /** Number of ManagedVideoFrames currently alive (for tests/monitoring) */
  static get activeCount(): number {
    return ManagedVideoFrame._activeCount;
  }

  /**
   * Enable leak detection via FinalizationRegistry.
   * Call once at app startup in development mode.
   * The callback fires if a ManagedVideoFrame is GC'd without release().
   */
  static enableLeakDetection(onLeak: (id: number) => void): void {
    ManagedVideoFrame._registry = new FinalizationRegistry(({ id, frame }) => {
      if (frame.format !== null) {
        // Frame was not closed before GC -- this is a leak
        onLeak(id);
        try { frame.close(); } catch { /* best effort */ }
      }
    });
  }

  /** Wrap a raw VideoFrame in a ManagedVideoFrame. Transfers ownership. */
  static wrap(frame: VideoFrame): ManagedVideoFrame {
    return new ManagedVideoFrame(frame, ManagedVideoFrame._nextId++);
  }

  /** Acquire an additional reference (e.g., when caching). */
  acquire(): this {
    if (this.closed) {
      throw new Error(`ManagedVideoFrame #${this.id} already closed`);
    }
    this.refCount++;
    return this;
  }

  /**
   * Release one reference. When refCount hits 0, VideoFrame.close() is called.
   * Safe to call multiple times (no-op after close).
   */
  release(): void {
    if (this.closed) return;
    this.refCount--;
    if (this.refCount <= 0) {
      this.closed = true;
      ManagedVideoFrame._activeCount--;
      try {
        this.frame.close();
      } catch {
        // Already closed externally
      }
    }
  }

  /** Whether this managed frame has been fully released. */
  get isClosed(): boolean {
    return this.closed;
  }

  /** Current reference count (for debugging). */
  get refs(): number {
    return this.refCount;
  }

  // --- Future Symbol.dispose support ---
  // Uncomment when tsconfig target supports it:
  // [Symbol.dispose](): void {
  //   this.release();
  // }
}

declare const __DEV__: boolean;
```

### Step 2: Update `IPImage` to use `ManagedVideoFrame`

**File:** `src/core/image/Image.ts`

```typescript
// Change the videoFrame field type:
import { ManagedVideoFrame } from './ManagedVideoFrame';

export interface IPImageOptions {
  // ...existing fields...
  videoFrame?: VideoFrame;           // Keep raw VideoFrame in constructor for compatibility
  managedVideoFrame?: ManagedVideoFrame; // New: preferred way to pass ownership
}

export class IPImage {
  /** Managed VideoFrame for reference-counted VRAM cleanup */
  managedVideoFrame: ManagedVideoFrame | null;

  /** Raw VideoFrame accessor (reads from managed wrapper) */
  get videoFrame(): VideoFrame | null {
    return this.managedVideoFrame?.frame ?? null;
  }

  constructor(options: IPImageOptions) {
    // ...existing code...
    if (options.managedVideoFrame) {
      this.managedVideoFrame = options.managedVideoFrame;
    } else if (options.videoFrame) {
      // Legacy path: wrap raw VideoFrame automatically
      this.managedVideoFrame = ManagedVideoFrame.wrap(options.videoFrame);
    } else {
      this.managedVideoFrame = null;
    }
  }

  close(): void {
    if (this.managedVideoFrame) {
      this.managedVideoFrame.release();
      this.managedVideoFrame = null;
    }
    // ...existing imageBitmap cleanup...
  }
}
```

### Step 3: Fix `hdrSampleToIPImage` error safety

**File:** `src/nodes/sources/VideoSourceNode.ts`

Wrap the VideoFrame lifecycle in try/finally:

```typescript
private hdrSampleToIPImage(
  sample: { toVideoFrame(): VideoFrame },
  frame: number,
  targetSize?: { w: number; h: number },
): IPImage {
  let videoFrame = sample.toVideoFrame();
  let managedFrame: ManagedVideoFrame | null = null;

  try {
    // ...existing colorSpace detection code...

    // Resize via HDR OffscreenCanvas if target is smaller than source
    if (targetSize && this.hdrResizer) {
      const result = this.hdrResizer.resize(videoFrame, targetSize, effectiveColorSpace ?? undefined);
      videoFrame = result.videoFrame;
      // ...existing resize metadata handling...
    }

    managedFrame = ManagedVideoFrame.wrap(videoFrame);

    const ipImage = new IPImage({
      width, height,
      channels: 4,
      dataType: 'float32',
      data: new ArrayBuffer(4),
      managedVideoFrame: managedFrame,
      metadata: { /* ...existing... */ },
    });

    managedFrame = null; // IPImage now owns the reference
    return ipImage;
  } catch (e) {
    // Clean up on any error
    if (managedFrame) {
      managedFrame.release();
    } else {
      // VideoFrame was never wrapped -- close directly
      try { videoFrame.close(); } catch { /* */ }
    }
    throw e;
  }
}
```

### Step 4: Fix `fetchHDRFrame` catch block

**File:** `src/nodes/sources/VideoSourceNode.ts`

```typescript
async fetchHDRFrame(frame: number): Promise<IPImage | null> {
  // ...existing checks...

  const fetchPromise = (async (): Promise<IPImage | null> => {
    let ipImage: IPImage | null = null;
    try {
      if (!this.frameExtractor) return null;

      PerfTrace.begin('getFrameHDR');
      const sample = await this.frameExtractor.getFrameHDR(frame);
      PerfTrace.end('getFrameHDR');

      if (!sample || !this.frameExtractor) return null;

      const targetSize = this.hdrTargetSize;
      PerfTrace.begin('hdrSampleToIPImage');
      ipImage = this.hdrSampleToIPImage(sample, frame, targetSize);
      PerfTrace.end('hdrSampleToIPImage');
      sample.close();

      if (!this.frameExtractor) {
        ipImage.close();
        return null;
      }

      this.hdrFrameCache.set(frame, ipImage);
      return ipImage;
    } catch (e) {
      // Close the IPImage if it was created but not cached
      if (ipImage) {
        ipImage.close();
      }
      return null;
    }
  })();

  // ...existing pending tracking...
}
```

### Step 5: Fix FileSourceNode HDR loaders

**Files:** `src/nodes/sources/FileSourceNode.ts` -- three methods: `loadAVIFHDR`, `loadJXLHDR`, `loadHEICHDR`

Apply the same pattern to all three (shown for AVIF):

```typescript
private async loadAVIFHDR(buffer: ArrayBuffer, ...): Promise<void> {
  const blob = new Blob([buffer], { type: 'image/avif' });
  const bitmap = await createImageBitmap(blob, { colorSpaceConversion: 'none' });
  let videoFrame: VideoFrame | null = null;

  try {
    videoFrame = new VideoFrame(bitmap, { timestamp: 0 });
    bitmap.close();

    const metadata: ImageMetadata = { /* ...existing... */ };

    this.cachedIPImage = new IPImage({
      width: videoFrame.displayWidth,
      height: videoFrame.displayHeight,
      channels: 4,
      dataType: 'float32',
      data: new ArrayBuffer(4),
      videoFrame,               // IPImage.constructor wraps in ManagedVideoFrame
      metadata,
    });

    videoFrame = null; // Ownership transferred to IPImage
  } catch (e) {
    if (videoFrame) {
      try { videoFrame.close(); } catch { /* */ }
    }
    throw e;
  }
}
```

### Step 6: Update Renderer texture upload

**File:** `src/render/Renderer.ts`

The Renderer reads `image.videoFrame` which becomes a getter after Step 2. Ensure the Renderer
never holds a reference to the raw VideoFrame beyond the texImage2D call:

```typescript
private updateTexture(image: IPImage): void {
  if (!this.gl) return;
  const gl = this.gl;

  // Access via getter -- does NOT transfer ownership
  const vf = image.videoFrame;
  if (vf) {
    // ...existing shared texture setup...
    try {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT, vf);
      // Do NOT close -- LRU cache owns the lifecycle via ManagedVideoFrame
      return;
    } catch (e) {
      log.warn('VideoFrame texImage2D failed, falling back:', e);
      // Do NOT call image.close() here -- let the cache owner decide.
      // The IPImage remains valid via its typed-array data path.
    }
  }
  // ...existing typed-array upload path...
}
```

**Note:** The current code at line 813 calls `image.close()` on texImage2D failure. This is
problematic because the IPImage may be in the LRU cache and will be needed again. The fix
removes this close and lets the cache eviction handle cleanup.

### Step 7: Add leak detection in development mode

**File:** `src/main.ts` (or app initialization)

```typescript
if (import.meta.env.DEV) {
  ManagedVideoFrame.enableLeakDetection((id) => {
    console.error(
      `[VRAM LEAK] ManagedVideoFrame #${id} was garbage collected without release()!`
    );
  });
}
```

### Step 8: Update LRUCache eviction callback

**File:** `src/nodes/sources/VideoSourceNode.ts:66`

The existing `(_key, image) => image.close()` callback works correctly with the updated
`IPImage.close()` which now calls `managedVideoFrame.release()`. No change needed here,
but add a comment:

```typescript
private hdrFrameCache = new LRUCache<number, IPImage>(
  8,
  (_key, image) => image.close(), // Releases ManagedVideoFrame refcount; closes VideoFrame when 0
);
```

### Step 9: Update `VideoExporter` (already correct, add safety)

**File:** `src/export/VideoExporter.ts:283-291`

The existing code already uses try/finally correctly. Optionally wrap in ManagedVideoFrame
for consistency, but since this is a simple create-encode-close pattern, the raw approach
is acceptable. Add an assertion:

```typescript
const videoFrame = new VideoFrame(surface, { timestamp, duration: frameDurationUs });
try {
  encoder.encode(videoFrame, { keyFrame: isKeyFrame });
} finally {
  videoFrame.close();
}
```

No change needed -- this is already correct.

### Step 10: Update clone/deepClone methods

**File:** `src/core/image/Image.ts`

`clone()` currently copies `imageBitmap` but not `videoFrame`. With ManagedVideoFrame, we
can safely share via `acquire()`:

```typescript
clone(): IPImage {
  return new IPImage({
    width: this.width,
    height: this.height,
    channels: this.channels,
    dataType: this.dataType,
    data: this.data,
    metadata: { ...this.metadata },
    imageBitmap: this.imageBitmap,
    managedVideoFrame: this.managedVideoFrame?.acquire() ?? undefined,
  });
}
```

This allows cloned IPImages to share the same VideoFrame safely. The last one to call `close()`
releases the VRAM.

## Migration Strategy

### Phase 1: Core infrastructure (1-2 days)
1. Create `ManagedVideoFrame` class
2. Update `IPImage` to support both raw and managed VideoFrame
3. Ensure `videoFrame` getter maintains backward compatibility
4. Add unit tests for `ManagedVideoFrame`

### Phase 2: Fix identified leaks (1-2 days)
1. Wrap `hdrSampleToIPImage` in try/finally (Risk 1)
2. Fix `fetchHDRFrame` catch block (Risk 2)
3. Fix FileSourceNode HDR loaders (Risk 3)
4. Fix Renderer fallback close (Risk 4)

### Phase 3: Systematic migration (2-3 days)
1. Update all 6 VideoFrame creation sites to use `ManagedVideoFrame.wrap()`
2. Update Renderer to use `image.videoFrame` getter
3. Update `clone()` to use `acquire()`
4. Add leak detection in dev mode

### Phase 4: Testing and validation (1-2 days)
1. Add leak detection tests
2. Add integration tests for frame cache lifecycle
3. Manual testing with long HDR video scrub sessions

## Testing Strategy

### Unit Tests for ManagedVideoFrame

**New file:** `src/core/image/ManagedVideoFrame.test.ts`

```typescript
describe('ManagedVideoFrame', () => {
  it('closes VideoFrame when last reference released', () => {
    const mockFrame = { close: vi.fn(), format: 'RGBA' } as unknown as VideoFrame;
    const managed = ManagedVideoFrame.wrap(mockFrame);

    managed.release();
    expect(mockFrame.close).toHaveBeenCalledOnce();
  });

  it('does not close VideoFrame while references remain', () => {
    const mockFrame = { close: vi.fn(), format: 'RGBA' } as unknown as VideoFrame;
    const managed = ManagedVideoFrame.wrap(mockFrame);
    managed.acquire();

    managed.release(); // refcount 2 -> 1
    expect(mockFrame.close).not.toHaveBeenCalled();

    managed.release(); // refcount 1 -> 0
    expect(mockFrame.close).toHaveBeenCalledOnce();
  });

  it('tracks activeCount correctly', () => {
    const before = ManagedVideoFrame.activeCount;
    const mockFrame = { close: vi.fn(), format: 'RGBA' } as unknown as VideoFrame;
    const managed = ManagedVideoFrame.wrap(mockFrame);

    expect(ManagedVideoFrame.activeCount).toBe(before + 1);

    managed.release();
    expect(ManagedVideoFrame.activeCount).toBe(before);
  });

  it('throws when acquiring a closed frame', () => {
    const mockFrame = { close: vi.fn(), format: 'RGBA' } as unknown as VideoFrame;
    const managed = ManagedVideoFrame.wrap(mockFrame);
    managed.release();

    expect(() => managed.acquire()).toThrow('already closed');
  });

  it('release is idempotent', () => {
    const mockFrame = { close: vi.fn(), format: 'RGBA' } as unknown as VideoFrame;
    const managed = ManagedVideoFrame.wrap(mockFrame);

    managed.release();
    managed.release(); // no-op
    expect(mockFrame.close).toHaveBeenCalledOnce();
  });
});
```

### Leak Detection Tests

**In existing test files, add assertions:**

```typescript
// In VideoSourceNode.test.ts
it('fetchHDRFrame closes VideoFrame on error', async () => {
  const before = ManagedVideoFrame.activeCount;

  // Set up mock that throws during IPImage construction
  // ...

  await node.fetchHDRFrame(1);

  expect(ManagedVideoFrame.activeCount).toBe(before);
});

// In FileSourceNode.test.ts
it('loadAVIFHDR closes VideoFrame on construction error', async () => {
  const before = ManagedVideoFrame.activeCount;

  // Set up mock that throws during IPImage construction
  // ...

  expect(ManagedVideoFrame.activeCount).toBe(before);
});
```

### Integration Test: Full Lifecycle

```typescript
it('HDR frame cache eviction releases all VideoFrames', async () => {
  const before = ManagedVideoFrame.activeCount;

  // Load HDR video, scrub through 20 frames (cache capacity < 20)
  // ...

  node.dispose();

  // All ManagedVideoFrames should be released
  expect(ManagedVideoFrame.activeCount).toBe(before);
});
```

### Manual Testing Checklist

1. Load a 4K HDR HLG video (10+ minutes)
2. Scrub through the entire timeline in both directions
3. Monitor Chrome DevTools > Performance > GPU memory
4. Verify VRAM usage stays bounded (should not exceed `HDR_MEMORY_BUDGET_BYTES` + overhead)
5. Switch between HDR and SDR sources -- verify no leaked frames
6. Load HDR AVIF/JXL/HEIC images, switch sources, verify cleanup
7. Export a video segment -- verify no leaked encoder frames

## Risk Assessment

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| Breaking change in `videoFrame` field type | HIGH | LOW | Getter maintains backward compat |
| Performance overhead from wrapper | LOW | LOW | Wrapper is a thin object, no hot-path cost |
| Incorrect refcount leads to premature close | HIGH | MEDIUM | Extensive unit tests, dev-mode leak detection |
| FinalizationRegistry false positives | LOW | LOW | Only used in dev mode for warnings |
| Concurrent access to refcount | LOW | LOW | JS is single-threaded; no race conditions |
| Migration breaks existing tests | MEDIUM | MEDIUM | Phase approach; keep raw VideoFrame compat |

## Success Metrics

1. **Zero VRAM leaks:** `ManagedVideoFrame.activeCount` returns to baseline after source disposal
2. **Bounded VRAM usage:** GPU memory during 1000-frame HDR scrub stays under 600 MB
3. **No regressions:** All existing 7600+ tests pass without modification
4. **Leak detection active:** Dev mode console warns on any GC'd-without-release frames
5. **Code coverage:** All 6 creation sites and all error paths have explicit close/release tests

## Estimated Effort

| Phase | Tasks | Effort |
|-------|-------|--------|
| Phase 1: Core infrastructure | `ManagedVideoFrame` class + `IPImage` update + unit tests | 1-2 days |
| Phase 2: Fix identified leaks | 4 targeted fixes with try/finally | 1-2 days |
| Phase 3: Systematic migration | All creation/consumption sites + Renderer update | 2-3 days |
| Phase 4: Testing | Leak detection tests + integration tests + manual QA | 1-2 days |
| **Total** | | **5-9 days** |

## Files to Modify

| File | Change |
|------|--------|
| `src/core/image/ManagedVideoFrame.ts` | **NEW** -- Reference-counted wrapper |
| `src/core/image/ManagedVideoFrame.test.ts` | **NEW** -- Unit tests |
| `src/core/image/Image.ts` | Add `managedVideoFrame` field, `videoFrame` getter, update `close()` |
| `src/core/image/Image.test.ts` | Add tests for managed frame lifecycle |
| `src/nodes/sources/VideoSourceNode.ts` | Wrap `hdrSampleToIPImage` in try/finally, fix `fetchHDRFrame` catch |
| `src/nodes/sources/VideoSourceNode.test.ts` | Add leak detection assertions |
| `src/nodes/sources/FileSourceNode.ts` | Wrap `loadAVIFHDR`, `loadJXLHDR`, `loadHEICHDR` in try/finally |
| `src/nodes/sources/FileSourceNode.test.ts` | Add leak detection assertions |
| `src/utils/media/HDRFrameResizer.ts` | No change needed (already correct) |
| `src/render/Renderer.ts` | Remove `image.close()` on texImage2D fallback, use `videoFrame` getter |
| `src/render/Renderer.renderForScopes.test.ts` | Update mocks if needed |
| `src/export/VideoExporter.ts` | No change needed (already correct) |
| `src/export/VideoExporter.test.ts` | No change needed |
| `tsconfig.json` | No change now; future: add `"esnext.disposable"` to lib |

## Future: Symbol.dispose Migration

When the project upgrades to TypeScript 5.2+ with `"lib": ["ESNext.Disposable"]` and a
bundler that supports the `using` keyword:

```typescript
// In ManagedVideoFrame:
[Symbol.dispose](): void {
  this.release();
}

// Usage becomes:
using managed = ManagedVideoFrame.wrap(videoFrame);
// Automatically released at end of block scope
```

This would provide compile-time enforcement that VideoFrames are always cleaned up, eliminating
the entire class of manual-close bugs.

---

## Expert Review -- Round 1

### Verdict: APPROVE WITH CHANGES

The plan demonstrates strong understanding of the VideoFrame VRAM lifecycle problem and proposes a
structurally sound reference-counting solution. The gap analysis is accurate and the identified
risks are real. However, several technical issues in the proposed implementation need correction
before this plan should be executed.

### Accuracy Check

**VideoFrame creation sites (6 + 1 probe): VERIFIED**

All six creation sites and the probe site were confirmed against the current codebase with matching
line numbers:

| # | File | Line | Verified |
|---|------|------|----------|
| 1 | `src/nodes/sources/VideoSourceNode.ts:878` | `sample.toVideoFrame()` | Yes |
| 2 | `src/utils/media/HDRFrameResizer.ts:109` | `new VideoFrame(this.canvas!, ...)` | Yes |
| 3 | `src/nodes/sources/FileSourceNode.ts:1208` | `new VideoFrame(bitmap, ...)` (AVIF) | Yes |
| 4 | `src/nodes/sources/FileSourceNode.ts:1272` | `new VideoFrame(bitmap, ...)` (JXL) | Yes |
| 5 | `src/nodes/sources/FileSourceNode.ts:1403` | `new VideoFrame(bitmap, ...)` (HEIC) | Yes |
| 6 | `src/export/VideoExporter.ts:283` | `new VideoFrame(surface, ...)` | Yes |
| P | `src/utils/media/MediabunnyFrameExtractor.ts:277` | `probeSample.toVideoFrame()` | Yes |

**Close sites: VERIFIED**

All documented close sites (A through J) were confirmed at the stated line numbers. The LRUCache
implementation at `src/utils/LRUCache.ts` correctly invokes `onEvict` during `clear()`, `delete()`,
`set()` (on replacement and overflow), and `setCapacity()` (on shrink). This means cache eviction
reliably triggers `image.close()`.

**IPImage.close() implementation: CORRECT**

The current `IPImage.close()` at `src/core/image/Image.ts:157-174` correctly closes both
`videoFrame` and `imageBitmap` with try/catch guards and null-assignment. Safe to call multiple
times.

**Risk assessments: ACCURATE**

- Risk 1 (hdrSampleToIPImage error paths): Confirmed. If `new IPImage(...)` at line 926 throws,
  the VideoFrame (either original from line 878 or resized from HDRFrameResizer) leaks. No
  try/finally guards this.
- Risk 2 (fetchHDRFrame catch block): Confirmed. The bare `catch` at line 1065 silently drops
  errors without closing partially-constructed resources. If `hdrSampleToIPImage` succeeds
  (returning an IPImage with a VideoFrame) but `sample.close()` at line 1054 throws, the IPImage
  leaks because it was never cached.
- Risk 3 (FileSourceNode HDR loaders): Confirmed. All three loaders (AVIF at 1208, JXL at 1272,
  HEIC at 1403) follow the pattern: `new VideoFrame(bitmap, ...)` then `bitmap.close()` then
  `new IPImage(...)`. If IPImage construction throws, the VideoFrame leaks.
- Risk 4 (Renderer fallback close): Confirmed. `image.close()` at `Renderer.ts:813` destroys
  the entire IPImage (VideoFrame + ImageBitmap), making it unusable for future LRU cache hits.
- Risk 5 (No leak detection in tests): Confirmed. 232 occurrences of `VideoFrame` across 18 test
  files, but no systematic close-count assertions.
- Risk 6 (clone does not share videoFrame): Confirmed. `clone()` at `Image.ts:195-205` copies
  `imageBitmap` but omits `videoFrame`.

### Strengths

1. **Thorough enumeration.** All VideoFrame creation and close sites are accurately catalogued.
   No creation sites were missed. The cross-referencing between creation and close sites makes
   the gap analysis convincing.

2. **LRUCache analysis is correct.** The plan correctly identifies that `hdrFrameCache.clear()`
   triggers `onEvict` for all entries, which calls `image.close()`. The LRU implementation was
   verified to handle replacement, overflow, explicit delete, and capacity shrink correctly.

3. **Approach selection is well-reasoned.** Rejecting `FinalizationRegistry` as primary mechanism
   is correct -- VRAM cleanup must be deterministic. The hybrid approach (refcount now,
   `Symbol.dispose` later) is pragmatic.

4. **HDRFrameResizer ownership semantics are correctly analyzed.** The resizer closes the original
   VideoFrame on success and returns it unchanged on failure, meaning the caller always receives
   exactly one VideoFrame to manage. The plan correctly identifies this as not needing changes.

5. **VideoExporter is correctly identified as already safe.** The try/finally pattern at lines
   288-292 is tight and correct.

### Concerns

**Concern 1: `ManagedVideoFrame` adds complexity without proportional safety gain (MEDIUM)**

The reference-counting wrapper is solving a problem that primarily exists in error paths, not in
the normal ownership flow. In normal operation, the ownership is linear:

- `toVideoFrame()` -> `hdrSampleToIPImage()` -> `IPImage` -> `hdrFrameCache` -> `onEvict` -> `close()`

Reference counting is needed only when the same VideoFrame is shared across multiple owners
(e.g., the proposed `clone().acquire()` pattern). In the current codebase, VideoFrames are never
shared -- each IPImage exclusively owns its VideoFrame. Adding refcounting introduces a new
category of bugs (mismatched acquire/release) to fix a category of bugs (missing close on error
paths) that can be solved more simply with try/finally wrappers.

**Recommendation:** Consider a simpler Phase 1 that adds try/finally guards to all error paths
*without* the ManagedVideoFrame wrapper, then evaluate whether refcounting is needed based on
actual sharing patterns.

**Concern 2: `__DEV__` global does not exist in this codebase (HIGH)**

The `ManagedVideoFrame` class uses `__DEV__` for conditional stack trace capture, but the codebase
uses `import.meta.env.DEV` (Vite convention, confirmed at `src/main.ts:14` and
`src/utils/Logger.ts:23`). The `declare const __DEV__: boolean` at the bottom of the proposed
class would require a Vite `define` config entry. Without this, the code will fail at runtime
or tree-shaking will not work.

**Fix:** Replace `__DEV__` with `import.meta.env.DEV` throughout the proposed class.

**Concern 3: FinalizationRegistry leak detection has a false-positive risk (LOW-MEDIUM)**

The proposed leak detector checks `frame.format !== null` to determine if a VideoFrame is still
open. Per the WebCodecs spec, `VideoFrame.format` returns `null` after `close()` is called. This
is correct. However, the `FinalizationRegistry` callback receives the closure over `{ id, frame }`.
If `ManagedVideoFrame.release()` calls `frame.close()` before the GC collects the
`ManagedVideoFrame` wrapper, the FinalizationRegistry callback will see `format === null` and
correctly skip the leak warning. This is fine.

But there is a subtle issue: the FinalizationRegistry holds a strong reference to the `frame`
object in the callback closure. This means the raw `VideoFrame` object cannot be garbage collected
until the `ManagedVideoFrame` wrapper is collected and the finalizer fires. The VideoFrame's
*underlying GPU resource* is released by `close()`, but the JS object stays alive longer than
necessary. This is not a VRAM leak but is a JS heap overhead.

**Fix:** Use a `WeakRef<VideoFrame>` in the registry payload instead of a direct reference, or
store only the frame's `id` and maintain a separate `Map<number, WeakRef<VideoFrame>>` for the
safety-net close.

**Concern 4: Renderer `image.close()` removal needs careful consideration (MEDIUM)**

The plan proposes removing `image.close()` at `Renderer.ts:813` when `texImage2D` fails, arguing
the cache owner should decide. This is correct in principle, but the current code calls
`image.close()` specifically to release the VideoFrame so the fallback typed-array path can
proceed without holding a dead GPU resource. After the plan's changes, this IPImage will remain
in the LRU cache with a VideoFrame that the GPU driver rejected. Every subsequent render of this
cached frame will attempt `texImage2D(VideoFrame)`, fail, fall through to the typed-array path
(which has only a 4-byte placeholder buffer for HDR VideoFrame-backed IPImages), and render
garbage or crash.

The real fix should be: on `texImage2D` failure, close *only* the VideoFrame (not the entire
IPImage), null out the `videoFrame` field, and let the fallback path proceed. But for HDR
VideoFrame-backed IPImages, the typed-array data is a 4-byte placeholder, so there is no
meaningful fallback. The correct behavior is to close the VideoFrame, evict the IPImage from
cache, and let the next fetch attempt re-decode.

**Concern 5: `sample.close()` ordering in `fetchHDRFrame` (LOW)**

At `VideoSourceNode.ts:1054`, `sample.close()` is called after `hdrSampleToIPImage()` returns.
The `sample` is a mediabunny `VideoSample`, and `sample.toVideoFrame()` is called inside
`hdrSampleToIPImage()`. If `toVideoFrame()` transfers ownership of the underlying buffer from
the sample to the VideoFrame (as is typical in WebCodecs), then `sample.close()` is closing an
already-transferred sample. This is fine if mediabunny handles it gracefully, but the ordering
suggests the plan should note that `sample.close()` and `videoFrame.close()` are independent
cleanup actions for independent resources.

**Concern 6: Thread safety claim is incomplete (LOW)**

The plan states "JS is single-threaded; no race conditions" for concurrent refcount access. This
is correct for the main thread, but if VideoFrames are ever transferred to a Web Worker (e.g.,
for offscreen rendering or encoding), the refcount would need `Atomics` or a different
synchronization mechanism. The plan should note this as a constraint: ManagedVideoFrame must not
be shared across workers.

### Recommended Changes

1. **Replace `__DEV__` with `import.meta.env.DEV`** in the `ManagedVideoFrame` class and remove
   the `declare const __DEV__: boolean` line. This aligns with the Vite build system used by the
   project.

2. **Fix the Renderer fallback strategy.** Instead of simply removing `image.close()`, the fix
   should:
   - Close only the VideoFrame: `image.videoFrame?.close(); image.videoFrame = null;`
   - Log a warning that HDR rendering is degraded.
   - Optionally evict the IPImage from the LRU cache so the next fetch re-decodes.
   - Do NOT fall through to typed-array upload for VideoFrame-backed IPImages (the data buffer
     is a 4-byte placeholder).

3. **Use `WeakRef` in FinalizationRegistry payload** to avoid preventing GC of the raw VideoFrame
   JS object. Change the registry type to `FinalizationRegistry<{ id: number }>` and use a
   side `Map<number, WeakRef<VideoFrame>>` for the safety-net close if desired.

4. **Add try/finally to the MediabunnyFrameExtractor probe path** at lines 277-299. If
   `probeFrame.colorSpace` access or any downstream code throws, the probeFrame leaks:
   ```typescript
   const probeFrame = probeSample.toVideoFrame();
   try {
     // ... read colorSpace ...
   } finally {
     probeFrame.close();
   }
   probeSample.close();
   ```

5. **In the `ManagedVideoFrame` class, add `unref()` support for FinalizationRegistry** by calling
   `ManagedVideoFrame._registry?.unregister(this)` in the `release()` method when `refCount`
   hits 0. This prevents the finalizer from firing for properly-released frames, reducing noise
   and overhead.

6. **Consider a static `resetForTests()` method** on `ManagedVideoFrame` that resets `_nextId`
   and `_activeCount` to 0. With 232 VideoFrame references across 18 test files, test isolation
   will be important. Without a reset, `activeCount` assertions will be fragile across test
   suites.

### Missing Considerations

1. **HDRFrameResizer has a subtle VideoFrame leak if `videoFrame.close()` throws after
   `new VideoFrame(canvas)` succeeds** (line 109-114 of `HDRFrameResizer.ts`). While
   `VideoFrame.close()` throwing is extremely unlikely, the pattern should be:
   ```typescript
   const resized = new VideoFrame(this.canvas!, { timestamp: videoFrame.timestamp });
   try {
     videoFrame.close();
   } catch {
     // Original close failed; resized frame is still valid
   }
   ```
   This is already what happens implicitly (the catch at line 127 would catch it), but the
   `resized` VideoFrame would leak because the catch returns the original `videoFrame` (which
   may or may not still be usable). This edge case should be documented even if not fixed.

2. **`FileSourceNode` HDR loaders overwrite `cachedIPImage` without closing the previous one.**
   If a user loads an HDR AVIF, then loads another HDR AVIF into the same FileSourceNode, the
   assignment `this.cachedIPImage = new IPImage(...)` at line 1223 (AVIF), 1287 (JXL), or 1418
   (HEIC) overwrites the previous IPImage without calling `close()` on it. This leaks the
   previous VideoFrame. The fix is to add `this.cachedIPImage?.close()` at the top of each HDR
   loader method. This leak is independent of the ManagedVideoFrame proposal but should be
   addressed in Phase 2.

3. **ImageBitmap leak in FileSourceNode HDR loaders if `new VideoFrame(bitmap, ...)` fails.**
   The plan identifies the VideoFrame leak if IPImage construction fails, but misses the bitmap
   leak if VideoFrame construction fails. The bitmap is closed at line 1209 (AVIF), 1273 (JXL),
   1404 (HEIC) -- all *after* the VideoFrame constructor. If the VideoFrame constructor throws,
   the bitmap leaks. A try/finally should wrap the bitmap's lifecycle:
   ```typescript
   const bitmap = await createImageBitmap(blob, { colorSpaceConversion: 'none' });
   try {
     const videoFrame = new VideoFrame(bitmap, { timestamp: 0 });
     bitmap.close();
     // ... rest of method, with try/finally for videoFrame ...
   } catch {
     bitmap.close();
     throw;
   }
   ```

4. **Performance measurement for the refcount overhead is absent.** While the plan claims "thin
   object, no hot-path cost," the `acquire()` call in the proposed `clone()` method would be on
   the hot path if cloning happens during rendering. Benchmark data for `acquire()`/`release()`
   call overhead under high-frequency scrubbing (hundreds of calls per second) should be
   collected during Phase 4.

5. **The plan does not discuss what happens when `ManagedVideoFrame.wrap()` is called with a
   VideoFrame that has already been closed.** The constructor should validate
   `frame.format !== null` and throw immediately rather than creating a managed wrapper around a
   dead frame.

6. **Migration risk for the `videoFrame` field type change in IPImage.** The plan proposes
   changing `videoFrame` from a public field to a getter backed by `managedVideoFrame`. This is
   a breaking change for any code that *writes* to `image.videoFrame` (e.g.,
   `this.videoFrame = options.videoFrame ?? null` at `Image.ts:54` and
   `this.videoFrame = null` at `Image.ts:164`). A getter-only property would cause a TypeError
   on write. The plan should either keep `videoFrame` as a read-write field that synchronizes
   with `managedVideoFrame`, or audit all write sites and update them.

## QA Review — Round 1

### Verdict: APPROVE WITH CHANGES

The plan is thorough, well-structured, and correctly identifies the real leak risks in the
codebase. The `ManagedVideoFrame` reference-counting approach is pragmatic and appropriate
for the current TypeScript/build target constraints. However, several testability concerns,
a static-state footgun, and one correctness gap in the plan need to be addressed before
implementation proceeds.

### Test Coverage Assessment

**Existing VideoFrame test coverage is solid but narrowly focused on happy paths:**

- `src/core/image/Image.test.ts` (867 lines): Has a dedicated `videoFrame support` section
  (lines 638-743) covering: default null, storage, `close()` releasing the frame, safe
  double-close on already-closed frames, and clone not copying videoFrame. However, there
  are **zero tests for error paths** during IPImage construction when a videoFrame is provided.

- `src/nodes/sources/VideoSourceNode.test.ts`: Tests VSN-HDR-001 through VSN-HDR-011 cover
  the happy path well -- sample close after extraction, cache/evict lifecycle, deduplication
  of concurrent fetches. However, **there is no test for what happens when `hdrSampleToIPImage`
  throws** (Risk 1 in the plan). There is also **no test for the catch block at line 1065**
  (Risk 2).

- `src/nodes/sources/FileSourceNode.test.ts`: Tests FSN-065 through FSN-091 verify HDR AVIF
  and JXL produce IPImages with videoFrame, and that dispose calls close. But **there are no
  tests for construction failure after VideoFrame creation** (Risk 3).

- `src/utils/media/HDRFrameResizer.test.ts`: Good coverage of error handling (context fail,
  drawImage throw, VideoFrame constructor throw), all verifying the original frame is returned
  unclosed. This is the **best-covered error path** in the VideoFrame lifecycle.

- `src/export/VideoExporter.test.ts`: Has a global `videoFrameCloseCount` counter and test
  "VideoFrame.close() called for every encoded frame" -- a good pattern that could be
  generalized. Already uses try/finally in production code.

- `src/render/Renderer.test.ts` and `src/render/Renderer.renderForScopes.test.ts`: The main
  Renderer test has **zero VideoFrame-related tests**. The renderForScopes test only checks
  that `videoFrame` presence triggers HDR classification (SFBO-017). **No test covers the
  texImage2D failure fallback at line 813** (Risk 4).

### Risk Assessment

**1. Static state leakage between tests (HIGH)**

`ManagedVideoFrame` uses module-level static fields (`_nextId`, `_activeCount`, `_registry`).
In Vitest, modules are typically shared across tests within the same file. If one test creates
a `ManagedVideoFrame` and forgets to release it (or the test throws), `_activeCount` will be
wrong for subsequent tests. The proposed test pattern `const before = ManagedVideoFrame.activeCount`
is a workaround, but it is fragile.

**Recommendation:** Add a static `resetForTesting()` method that resets `_nextId`, `_activeCount`,
and `_registry` to initial values. Call it in `beforeEach` in test files that use `ManagedVideoFrame`.
Alternatively, document that `_activeCount` is relative (use delta-based assertions) and enforce
that pattern in code review.

**2. `__DEV__` is not defined anywhere in the build pipeline (HIGH)**

The plan uses `__DEV__` for conditional creation stack capture, but there is **no `define`
configuration** in either `vite.config.ts` or `vitest.config.ts` for `__DEV__`. The codebase
uses `import.meta.env.DEV` (see `src/main.ts:14`, `src/utils/Logger.ts:24`), not `__DEV__`.
The plan's `declare const __DEV__: boolean` at the bottom of the class would cause a
ReferenceError at runtime in both dev and test builds.

**Recommendation:** Replace `__DEV__` with `import.meta.env.DEV` to match the existing
codebase convention. Alternatively, add a `define: { __DEV__: 'import.meta.env.DEV' }`
entry to both `vite.config.ts` and `vitest.config.ts`, but using the existing pattern is
simpler and less error-prone.

**3. FinalizationRegistry is available but non-deterministic in tests (MEDIUM)**

Node.js v22.15.0 (the project's runtime) fully supports `FinalizationRegistry`. However,
its non-deterministic nature means **leak detection tests relying on FinalizationRegistry
callbacks cannot be reliably written**. The plan correctly acknowledges this for production
use but does not clarify this limitation in the testing strategy.

The `activeCount`-based approach is the correct testing mechanism -- it is deterministic and
synchronous. The `FinalizationRegistry` path should be tested only for its setup/registration
logic (that `enableLeakDetection` accepts a callback without throwing), not for actual
GC-triggered cleanup.

**4. jsdom environment has no `VideoFrame` constructor (LOW)**

The test environment is jsdom (per `vitest.config.ts`). `VideoFrame` does not exist in jsdom.
All existing tests mock it via `vi.stubGlobal('VideoFrame', ...)` or plain object casts.
This is fine for `ManagedVideoFrame` tests since the wrapper only calls `frame.close()` and
reads `frame.format` -- both easily mockable. No environment blocker here.

**5. Renderer fallback behavior change needs dedicated test (MEDIUM)**

Step 6 changes the Renderer to **not** call `image.close()` on texImage2D failure. This is a
behavioral change with a subtle consequence: if the LRU cache evicts the IPImage later, the
VideoFrame will be closed then. But if the IPImage is the *current* frame (not yet evicted),
the failed VideoFrame remains open, consuming VRAM, until the next frame replaces it or
disposal. The plan should add a Renderer-level test for this specific scenario.

### Recommended Test Additions

1. **`ManagedVideoFrame.test.ts` -- static state isolation:**
   Add a `resetForTesting()` static method and call it in `beforeEach`. Test that
   `activeCount` goes negative if `release()` is called more times than `wrap()` (defensive
   check), or add a guard in `release()` to clamp `_activeCount` at 0.

2. **`ManagedVideoFrame.test.ts` -- FinalizationRegistry setup test:**
   ```typescript
   it('enableLeakDetection accepts a callback', () => {
     expect(() => ManagedVideoFrame.enableLeakDetection(vi.fn())).not.toThrow();
   });
   ```
   Do NOT attempt to test GC-triggered callbacks -- they are inherently flaky.

3. **`Image.test.ts` -- IPImage construction failure with videoFrame:**
   ```typescript
   it('close() after error in construction leaves videoFrame cleanup to caller', () => {
     // Verify that if IPImage constructor throws (e.g., OOM simulated via
     // Object.defineProperty on data), the videoFrame is NOT automatically closed
     // -- the caller must handle it. This validates the try/finally pattern in
     // hdrSampleToIPImage.
   });
   ```

4. **`VideoSourceNode.test.ts` -- error path for hdrSampleToIPImage:**
   Add a test where `toVideoFrame()` succeeds but IPImage construction is forced to fail
   (e.g., by making the HDR resizer return a malformed result), and verify that the
   VideoFrame's `close()` is called via the catch block.

5. **`VideoSourceNode.test.ts` -- fetchHDRFrame catch block cleanup:**
   Add a test where `hdrSampleToIPImage` succeeds but the subsequent `hdrFrameCache.set()`
   is rigged to throw, then verify the IPImage (and its VideoFrame) is closed.

6. **`Renderer.test.ts` -- texImage2D failure does not close IPImage:**
   After the Step 6 change, add a test confirming that when `texImage2D` throws for a
   VideoFrame-backed IPImage, the image's `close()` is NOT called (ownership stays with
   the cache).

7. **`FileSourceNode.test.ts` -- HDR loader construction failure:**
   For at least one of AVIF/JXL/HEIC, mock `IPImage` constructor to throw after
   `VideoFrame` is created and verify the VideoFrame is closed in the catch block.

### Migration Safety

**Backward compatibility of the `videoFrame` getter (Step 2) is the highest-risk change.**

The plan converts `IPImage.videoFrame` from a public field to a getter that delegates to
`managedVideoFrame.frame`. This affects:

- All existing tests that set `image.videoFrame = mockFrame` directly (e.g.,
  `Image.test.ts` lines 651-667). After the change, these would need to use the constructor
  option `videoFrame: mockFrame` or `managedVideoFrame: ManagedVideoFrame.wrap(mockFrame)`.
  The plan's constructor auto-wrapping of raw `videoFrame` handles the creation case, but
  **direct field assignment like `image.videoFrame = someFrame` will break** if the field
  becomes a read-only getter.

- The `close()` method in the plan sets `this.managedVideoFrame = null` but does not set
  a backing `_videoFrame` field. Existing tests that check `image.videoFrame === null` after
  `close()` would still work if the getter returns `null` when `managedVideoFrame` is null.
  This appears correct.

- The `clone()` change (Step 10) is a **semantic behavioral change**: currently `clone()`
  does NOT copy `videoFrame`, but the plan makes `clone()` call `acquire()` on the managed
  frame. Tests IMG-R002, the `clone does not copy videoFrame` test (line 724), and the
  `deepClone does not copy videoFrame` test (line 422) **will all fail** after this change.
  These tests encode the *current* documented behavior. The plan should explicitly call out
  that these tests must be updated and explain the rationale for the behavioral change.

**Recommendation for phased migration:**

- Phase 1 should include a compatibility shim: if `videoFrame` is set directly as a field
  (setter), auto-wrap it. This can be done via a setter:
  ```typescript
  set videoFrame(frame: VideoFrame | null) {
    if (this.managedVideoFrame) this.managedVideoFrame.release();
    this.managedVideoFrame = frame ? ManagedVideoFrame.wrap(frame) : null;
  }
  ```
  This preserves full backward compatibility and avoids a big-bang migration.

- Phase 1 should also include updating the 3-4 affected test assertions that check
  `clone().videoFrame === null` to instead verify the new shared-reference behavior.

### Concerns

1. **The catch block fix in Step 4 has a sequencing issue.** The plan shows `sample.close()`
   at line 1054 happening *after* `hdrSampleToIPImage` returns, but the catch block at
   line 1065 does not close the sample. If `hdrSampleToIPImage` throws, the sample is never
   closed. The plan's fix addresses IPImage cleanup but **does not address sample cleanup in
   the error path**. Add `sample?.close()` to the catch block or restructure with try/finally
   around the sample lifecycle.

2. **`ManagedVideoFrame.wrap()` in the plan always sets `refCount = 1`.** If the same raw
   VideoFrame is accidentally wrapped twice (e.g., by two different code paths that each
   call `ManagedVideoFrame.wrap()`), two independent ManagedVideoFrames will exist for the
   same underlying frame, and the first `release()` will call `frame.close()` while the
   second still holds a "live" reference to a closed frame. The plan should add a
   `WeakSet<VideoFrame>` guard in `wrap()` that throws (or warns in dev mode) if a frame
   is wrapped more than once.

3. **The `format !== null` check in the FinalizationRegistry callback (line 180) relies on
   an implementation detail.** The WebCodecs spec says `VideoFrame.format` returns `null`
   after `close()`, but this behavior in a jsdom mock environment is not guaranteed. For the
   dev-mode leak detector, consider using a `Set<number>` of active IDs instead, removing
   the ID on `release()` and checking membership in the finalizer.

4. **No `afterEach` guard for leaked ManagedVideoFrames in tests.** Consider adding a global
   test hook (in `test/setup.ts`) that asserts `ManagedVideoFrame.activeCount === 0` after
   each test, or at least logs a warning. This would catch test-level leaks early.

5. **The plan estimates "No change needed" for `src/render/Renderer.renderForScopes.test.ts`**
   but the Renderer behavioral change (Step 6 -- removing `image.close()` on fallback) could
   affect integration scenarios where the Renderer is the only code path that disposes a
   VideoFrame-backed IPImage after a GPU upload failure. A targeted test should be added.
