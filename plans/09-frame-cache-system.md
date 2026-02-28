# Region / Lookahead Frame Cache System

## Overview

Desktop OpenRV provides a sophisticated RAM caching system with region cache, lookahead cache, configurable RAM limits, and color-coded timeline indicators showing cache state. The web version currently relies on `FramePreloadManager` (a count-based LRU with fixed 100-frame capacity), an HDR-specific `LRUCache` (memory-budget-based, 500 MB for VideoFrame objects), and `MediaCacheManager` (OPFS-backed persistent cache for raw media blobs). None of these implement region-aware or lookahead caching strategies, configurable memory budgets across all frame types, or user-selectable cache modes.

This plan introduces a unified **Region / Lookahead Frame Cache System** that sits between the `VideoSourceNode` frame extraction layer and the rendering pipeline, providing:

- **Region cache**: Keeps a window of decoded frames around the current playhead position.
- **Lookahead cache**: Pre-fetches frames ahead of the playhead in the playback direction, with larger buffers for forward play.
- **Configurable memory budget**: User-adjustable RAM limit (default auto-detected from `navigator.deviceMemory` or heuristics) with per-frame byte-size accounting.
- **Color-coded timeline indicator**: Extends the existing `CacheIndicator` with three colors for region-cached (green), lookahead-fetching (yellow/amber), and uncached (gray) frames, plus a new blue color for locked/pinned ranges.
- **Three cache modes**: Off / Region / Lookahead, selectable from the UI.
- **Memory pressure handling**: Monitors memory usage and evicts frames when approaching the budget, pausing lookahead when memory is tight.

---

## Current State

### Frame Caching Layers

| Layer | File | Purpose | Eviction | Size Tracking |
|---|---|---|---|---|
| `FramePreloadManager<FrameResult>` | `src/utils/media/FramePreloadManager.ts` | SDR video frame cache (ImageBitmap objects from mediabunny) | LRU by access order, count-based (max 100, configurable 5-500) | Count only; no byte-size tracking |
| HDR `LRUCache<number, IPImage>` | `src/nodes/sources/VideoSourceNode.ts` (inline) | HDR video frame cache (IPImage with VideoFrame) | LRU by access, budget-based via `updateHDRCacheSize()` | Byte-based (w * h * 8 for RGBA16F) |
| `TextureCacheManager` | `src/render/TextureCacheManager.ts` | WebGL texture pool | LRU by access, byte-size + count limits | Byte-based per-texture |
| `MediaCacheManager` | `src/cache/MediaCacheManager.ts` | OPFS-backed persistent media blob cache | LRU by `lastAccessedAt` in IndexedDB | Byte-based (2 GB default) |
| `PrerenderBufferManager` | `src/utils/effects/PrerenderBufferManager.ts` | Effects-applied frame cache (canvas objects) | LRU, count-based (max 100) | Count only |
| `LRUCache` (generic) | `src/utils/LRUCache.ts` | Generic LRU (used for snapshot cache in `MediabunnyFrameExtractor`, etc.) | Count-based | Count only |

### Key Observations

1. **No unified memory budget**: SDR frames, HDR frames, effects-prerendered frames, and textures each have independent budgets with no coordination. A 4K RGBA8 frame is ~33 MB; a 4K RGBA16F frame is ~66 MB. With 100 SDR frames cached, that is ~3.3 GB untracked.

2. **No byte-size accounting for SDR frames**: `FramePreloadManager` counts frames but does not track memory. It stores `ImageBitmap` objects whose memory lives in GPU process memory (not measurable via JS). The actual memory footprint depends on resolution and whether `createImageBitmap` resize was applied.

3. **No region awareness**: The current preload window is relative (ahead=30, behind=5, scrub=10) and works well for sequential playback, but does not support the concept of a pinned region that survives scrubbing, nor does it distinguish between "keep in cache" and "fetch ahead."

4. **No user-selectable modes**: Cache behavior is hardcoded. Users cannot disable caching, choose region-only vs. lookahead, or set a RAM budget.

5. **CacheIndicator already exists**: The `CacheIndicator` component at `src/ui/components/CacheIndicator.ts` already renders a canvas bar showing cached (green), pending (yellow), and uncached (gray) frames. It subscribes to `Session` events and queries `getCachedFrames()` / `getPendingFrames()` / `getCacheStats()`.

6. **Serialized decoder**: `MediabunnyFrameExtractor` serializes all frame extraction through a single `extractionQueue` promise chain. Concurrent extraction offers no throughput benefit. The current `maxConcurrent: 3` in `FramePreloadManager` effectively means 1 active + 2 queued.

---

## Proposed Architecture

### New Module: `FrameCacheController`

A new class `FrameCacheController` acts as the coordination layer between:

- The frame source (`VideoSourceNode` / `MediabunnyFrameExtractor`)
- The multiple cache layers (`FramePreloadManager`, HDR cache, `PrerenderBufferManager`)
- The UI (`CacheIndicator`, `CacheManagementPanel`)
- The playback engine (`PlaybackEngine` via `VideoSourceNode`)

```
                         +---------------------+
                         | FrameCacheController |
                         |  (coordination)      |
                         +----------+----------+
                                    |
              +---------------------+---------------------+
              |                     |                     |
    +---------v-------+   +---------v-------+   +---------v-------+
    | RegionCache     |   | LookaheadEngine |   | MemoryBudget    |
    | (decoded frames)|   | (pre-fetch)     |   | (accounting)    |
    +---------+-------+   +---------+-------+   +---------+-------+
              |                     |                     |
              +---------------------+---------------------+
                                    |
                         +----------v----------+
                         | FramePreloadManager  |
                         | (existing, adapted)  |
                         +----------+----------+
                                    |
                         +----------v----------+
                         | MediabunnyExtractor  |
                         | (existing, unchanged)|
                         +----------------------+
```

### Cache Modes

```typescript
type CacheMode = 'off' | 'region' | 'lookahead';
```

- **Off**: No proactive caching. Frames are decoded on demand and evicted immediately after display. Only a 1-frame buffer is maintained for the current frame. Existing `FramePreloadManager` is bypassed.
- **Region**: Maintains a fixed-size window of decoded frames centered on the playhead. The region size is determined by the memory budget (e.g., 512 MB / 33 MB per frame = ~15 frames for 4K SDR). No speculative pre-fetching beyond the region boundaries.
- **Lookahead**: Extends Region mode with speculative pre-fetching in the playback direction. Asymmetric window: more frames ahead than behind. Adapts buffer depth based on decode throughput (measured frames-per-second vs. playback FPS).

Default mode: **Lookahead** (matches current behavior, but with memory awareness).

---

## Cache Strategy

### Region Cache

The region cache replaces the current count-based preload window with a memory-budget-aware window. Key properties:

- **Symmetric when scrubbing**: Equal frames ahead and behind the playhead.
- **Asymmetric during playback**: More frames in the playback direction.
- **Pinned boundaries**: Optional in-point/out-point pinning keeps the entire marked range in cache when the budget allows.
- **Eviction order**: Frames furthest from the playhead are evicted first (distance-based, not LRU). This differs from pure LRU: a frame at distance 50 that was accessed 1ms ago is evicted before a frame at distance 5 that was accessed 10s ago.

```typescript
interface RegionConfig {
  /** Center frame (updated on every seek/advance) */
  centerFrame: number;
  /** Number of frames to keep behind playhead (scrub mode) */
  behindFrames: number;
  /** Number of frames to keep ahead of playhead (scrub mode) */
  aheadFrames: number;
  /** Whether the in/out range is pinned in cache */
  pinInOutRange: boolean;
}
```

Window sizing algorithm:

```
bytesPerFrame = width * height * bytesPerPixel
  where bytesPerPixel = 4 (SDR ImageBitmap) or 8 (HDR RGBA16F)

maxFramesInBudget = floor(memoryBudget / bytesPerFrame)

// Reserve 20% for lookahead overshoot and system overhead
regionCapacity = floor(maxFramesInBudget * 0.8)

// Split: 70% ahead, 30% behind during playback
aheadFrames = floor(regionCapacity * 0.7)
behindFrames = regionCapacity - aheadFrames

// During scrubbing: 50/50 split
aheadFrames = behindFrames = floor(regionCapacity / 2)
```

### Lookahead Engine

The lookahead engine is a stateful pre-fetcher that runs as a background task:

1. **Throughput measurement**: Tracks decode throughput (frames decoded per second) over a rolling 10-frame window.
2. **Starvation prediction**: Compares decode throughput against playback FPS. If `throughput < playbackFPS * playbackSpeed * 1.5`, the lookahead depth is reduced to avoid wasting decode cycles on frames that will be evicted.
3. **Adaptive depth**: `lookaheadDepth = min(regionCapacity, ceil(throughput * 2 / playbackSpeed))`. This ensures the lookahead never exceeds what can be decoded in ~2 seconds of playback.
4. **Abort on direction change**: When playback direction changes or the user scrubs to a distant frame, all pending lookahead requests are aborted (leveraging the existing `AbortController` pattern in `FramePreloadManager`).
5. **Pause under memory pressure**: When `currentUsage > budget * 0.9`, lookahead pauses and only region cache is maintained.

### Frame Size Estimation

Since `ImageBitmap` memory is not directly measurable from JavaScript, we estimate:

```typescript
function estimateFrameBytes(
  width: number,
  height: number,
  isHDR: boolean,
  targetSize?: { w: number; h: number },
): number {
  const w = targetSize?.w ?? width;
  const h = targetSize?.h ?? height;
  // ImageBitmap is typically RGBA8 (4 bytes/pixel) for SDR
  // HDR IPImage with VideoFrame is RGBA16F (8 bytes/pixel)
  const bytesPerPixel = isHDR ? 8 : 4;
  return w * h * bytesPerPixel;
}
```

This is an approximation. The browser may store `ImageBitmap` in compressed GPU memory, or in a different format. The estimate provides an upper bound that is safe for budgeting.

---

## Memory Management

### Memory Budget Detection

```typescript
interface MemoryBudgetConfig {
  /** Total memory budget in bytes for all frame caches */
  totalBudget: number;
  /** Fraction of budget reserved for HDR frames (0-1) */
  hdrReserve: number;
  /** Fraction of budget reserved for effects prerender (0-1) */
  effectsReserve: number;
  /** High-water mark (fraction 0-1) at which lookahead pauses */
  highWaterMark: number;
  /** Critical mark (fraction 0-1) at which emergency eviction triggers */
  criticalMark: number;
}
```

Default budget selection:

```typescript
function detectDefaultBudget(): number {
  // navigator.deviceMemory is available in Chromium browsers (GB, powers of 2)
  if (typeof navigator !== 'undefined' && 'deviceMemory' in navigator) {
    const deviceGB = (navigator as { deviceMemory?: number }).deviceMemory ?? 4;
    // Use 25% of device memory, clamped to [256 MB, 4 GB]
    return Math.max(256 * MB, Math.min(4 * GB, deviceGB * GB * 0.25));
  }
  // Fallback: 512 MB (safe for most devices)
  return 512 * MB;
}
```

### Memory Pressure Handling

Three pressure levels:

| Level | Threshold | Action |
|---|---|---|
| Normal | usage < 80% budget | Full region + lookahead active |
| High | 80% <= usage < 95% | Lookahead paused, region cache only |
| Critical | usage >= 95% | Emergency eviction: evict 20% of frames (farthest from playhead first), reduce region window by 50%, emit `memoryPressure` event |

The controller polls memory usage after every frame insertion/eviction (O(1) since we maintain a running total) and adjusts behavior accordingly.

### Coordination Across Cache Layers

The `FrameCacheController` maintains a single `currentUsageBytes` counter that aggregates:

- SDR frame cache: `frameCount * estimateFrameBytes(w, h, false, targetSize)`
- HDR frame cache: `frameCount * estimateFrameBytes(w, h, true, hdrTargetSize)`
- Effects prerender cache: `frameCount * sourceW * sourceH * 4` (RGBA canvas)

Each sub-cache notifies the controller on add/evict so the counter stays accurate.

---

## UI Design

### Enhanced CacheIndicator

The existing `CacheIndicator` at `src/ui/components/CacheIndicator.ts` will be extended:

**Current colors:**
- Green (`--success`): Cached frames
- Yellow (`--warning`): Pending/loading frames
- Gray (`--bg-hover`): Uncached frames

**New colors (additions):**
- Blue (`--accent-primary`): Region boundary indicators (thin vertical lines marking the region edges)
- The existing green/yellow/gray scheme remains, but the bar gains a subtle background tint showing the region window boundaries.

**New stats display:**
```
Cache: 45/300 frames (1.4 GB / 2.0 GB) [Lookahead] | 12 preloading
```

The display now shows:
- Frame count and memory usage (with budget)
- Active cache mode label
- Number of frames actively preloading

**Cache mode selector:**
A small dropdown or segmented control added to the `CacheManagementPanel` (`src/ui/components/CacheManagementPanel.ts`):

```
[Off] [Region] [Lookahead]
```

When mode changes, the controller is reconfigured and excess frames are evicted.

**Memory budget slider:**
Added to the `CacheManagementPanel`:

```
Memory Budget: [======|====] 2.0 GB
               256 MB          4 GB
```

This allows users to increase the budget for machines with more RAM or decrease it when running other memory-intensive applications.

### Timeline Region Overlay

In the timeline canvas (`src/ui/components/Timeline.ts`), a semi-transparent overlay shows the region cache boundaries:

- A subtle tinted band behind the track bar indicating the cached region.
- The region boundaries shift as the playhead moves, providing visual feedback of what is "ready" for instant scrubbing.
- During lookahead, an arrow-like gradient extends from the region edge in the playback direction, indicating active pre-fetching.

---

## Implementation Steps

### Phase 1: Memory Budget Infrastructure (Week 1)

1. **Create `MemoryBudgetManager`** (`src/cache/MemoryBudgetManager.ts`):
   - Maintains running byte-total across all registered cache layers.
   - Detects default budget via `navigator.deviceMemory` with fallbacks.
   - Emits `pressureChanged` events at normal/high/critical thresholds.
   - Provides `register(layer)` / `unregister(layer)` for cache layer integration.
   - Provides `canAllocate(bytes): boolean` and `reportAllocation(bytes)` / `reportDeallocation(bytes)`.

2. **Create `FrameSizeEstimator`** (`src/cache/FrameSizeEstimator.ts`):
   - Pure functions for estimating frame memory given dimensions, data type, and target size.
   - Used by all cache layers for consistent budgeting.

3. **Add tests** for `MemoryBudgetManager` and `FrameSizeEstimator`.

### Phase 2: FrameCacheController Core (Week 2)

4. **Create `FrameCacheController`** (`src/cache/FrameCacheController.ts`):
   - Owns the `CacheMode` state.
   - Integrates with `MemoryBudgetManager`.
   - In `'off'` mode: bypasses preloading, only decodes current frame on demand.
   - In `'region'` mode: calculates region window from budget, uses distance-based eviction.
   - In `'lookahead'` mode: extends region with direction-aware pre-fetch.
   - Exposes `getCacheState(): FrameCacheState` for UI consumption (mode, budget, usage, region boundaries, per-frame status).

5. **Add `CacheMode` type and configuration** to `src/config/CacheConfig.ts`:
   ```typescript
   export interface CacheConfig {
     mode: CacheMode;
     memoryBudgetBytes: number;
     hdrReserveFraction: number;
     effectsReserveFraction: number;
     highWaterMark: number;
     criticalMark: number;
   }
   ```

6. **Refactor `FramePreloadManager`** to accept external eviction decisions:
   - Add `setMaxCacheSizeBytes(bytes: number)` alongside the existing count-based `setCapacity()`.
   - Add `getEstimatedMemoryUsage(): number` method.
   - Add `evictFarthestFrom(centerFrame: number, count: number)` for distance-based eviction (instead of pure LRU).
   - Existing behavior remains the default when `FrameCacheController` is not wired.

7. **Add tests** for `FrameCacheController` in all three modes.

### Phase 3: Integrate with VideoSourceNode (Week 3)

8. **Wire `FrameCacheController` into `VideoSourceNode`**:
   - `VideoSourceNode.initPreloadManager()` now accepts an optional `FrameCacheController`.
   - When present, the controller governs cache size and eviction rather than the fixed config.
   - `updatePlaybackBuffer()` delegates to the controller's lookahead engine.
   - HDR frame cache (`hdrFrameCache`) registers with the `MemoryBudgetManager`.

9. **Wire `FrameCacheController` into `Session`**:
   - `Session` creates the controller during initialization.
   - Passes it to `VideoSourceNode` via `SessionMedia`.
   - Exposes `getCacheMode()`, `setCacheMode()`, `getCacheBudget()`, `setCacheBudget()`.

10. **Wire into `PlaybackEngine`**:
    - `startPlaybackPreload()` / `stopPlaybackPreload()` now notify the controller of playback state changes.
    - The controller adjusts region/lookahead parameters accordingly.

11. **Integration tests** verifying:
    - Mode switching during playback.
    - Memory budget enforcement.
    - Frame eviction under pressure.

### Phase 4: UI Integration (Week 4)

12. **Enhance `CacheIndicator`**:
    - Query `FrameCacheController.getCacheState()` instead of raw `Session.getCachedFrames()`.
    - Render region boundary indicators (blue lines).
    - Show memory usage / budget in stats text.
    - Show cache mode label.

13. **Enhance `CacheManagementPanel`**:
    - Add cache mode selector (Off / Region / Lookahead).
    - Add memory budget slider.
    - Display per-layer breakdown: SDR frames, HDR frames, effects cache.
    - Wire to `Session.setCacheMode()` / `Session.setCacheBudget()`.

14. **Enhance `Timeline`**:
    - Draw a subtle region overlay band behind the track, showing the cached region extent.
    - During lookahead, render a gradient arrow showing pre-fetch direction.

15. **Persist settings** via `localStorage`:
    - `openrv.cache.mode` (CacheMode string)
    - `openrv.cache.budgetMB` (number)

16. **UI tests** for mode switching, budget adjustment, indicator rendering.

### Phase 5: Advanced Features and Polish (Week 5)

17. **Throughput-adaptive lookahead**:
    - Track decode throughput in the controller.
    - Dynamically adjust lookahead depth based on measured throughput vs. playback speed.
    - Add a `getDecodeThroughput()` metric for diagnostics.

18. **In/Out range pinning**:
    - When the in/out range fits within the memory budget, pin those frames so they are never evicted.
    - Add a "Cache Range" button to the timeline in/out controls.
    - Pinned frames are shown with a distinct indicator color (solid green border).

19. **Memory pressure event handling**:
    - When the controller enters critical pressure, emit an event that the `StatusManager` can display: "Memory pressure: cache reduced."
    - Optionally pause lookahead and notify the user via `CacheIndicator` tooltip.

20. **Effects cache integration**:
    - Register `PrerenderBufferManager` with the `MemoryBudgetManager`.
    - When total memory pressure is high, the effects cache is evicted before raw frame cache (effects can be re-rendered, raw frames are cheaper to keep).

21. **Performance benchmarks**:
    - Measure cache hit rates across all modes.
    - Measure memory accuracy (estimated vs. actual via `performance.memory` where available).
    - Measure playback smoothness (frame drop rate) with/without lookahead.

---

## Files to Create

| File | Purpose |
|---|---|
| `src/cache/MemoryBudgetManager.ts` | Memory budget accounting and pressure events |
| `src/cache/MemoryBudgetManager.test.ts` | Tests for memory budget manager |
| `src/cache/FrameSizeEstimator.ts` | Frame memory size estimation utilities |
| `src/cache/FrameSizeEstimator.test.ts` | Tests for size estimator |
| `src/cache/FrameCacheController.ts` | Main coordination controller (mode, region, lookahead) |
| `src/cache/FrameCacheController.test.ts` | Tests for cache controller |
| `src/config/CacheConfig.ts` | Cache configuration types and defaults |

## Files to Modify

| File | Changes |
|---|---|
| `src/utils/media/FramePreloadManager.ts` | Add byte-size tracking, distance-based eviction method, memory reporting. Add `setMaxCacheSizeBytes()` and `evictFarthestFrom()`. |
| `src/utils/media/FramePreloadManager.test.ts` | Tests for new methods. |
| `src/nodes/sources/VideoSourceNode.ts` | Accept `FrameCacheController` in `initPreloadManager()`. Register HDR cache with `MemoryBudgetManager`. Delegate buffer management to controller. |
| `src/nodes/sources/VideoSourceNode.test.ts` | Tests for controller integration. |
| `src/core/session/Session.ts` | Create and own `FrameCacheController`. Expose `getCacheMode()`, `setCacheMode()`, `getCacheBudget()`, `setCacheBudget()`, `getFrameCacheState()`. |
| `src/core/session/SessionMedia.ts` | Pass `FrameCacheController` to `VideoSourceNode` during media loading. |
| `src/core/session/PlaybackEngine.ts` | Notify `FrameCacheController` of playback start/stop/direction changes. |
| `src/ui/components/CacheIndicator.ts` | Query `FrameCacheController` state for enhanced rendering (region boundaries, memory stats, mode label). Add blue region boundary rendering. |
| `src/ui/components/CacheIndicator.test.ts` | Tests for enhanced indicator. |
| `src/ui/components/CacheManagementPanel.ts` | Add cache mode selector and memory budget slider. Wire to Session. |
| `src/ui/components/CacheManagementPanel.test.ts` | Tests for new controls. |
| `src/ui/components/Timeline.ts` | Add optional region overlay rendering in `draw()`. |
| `src/ui/components/Timeline.test.ts` | Tests for region overlay. |
| `src/utils/effects/PrerenderBufferManager.ts` | Register with `MemoryBudgetManager` for unified budget accounting. |
| `src/config/index.ts` | Export `CacheConfig`. |

---

## Risks

### 1. ImageBitmap Memory Estimation Inaccuracy

**Risk**: `ImageBitmap` objects reside in GPU process memory. Their actual size depends on the browser's internal representation (may be compressed, may differ from `width * height * 4`). Our estimation could be 2-3x off in either direction.

**Mitigation**: Use conservative estimates (always assume uncompressed RGBA8). Provide a "measured vs. estimated" diagnostic in the cache panel when `performance.memory` is available (Chromium only). Allow users to adjust the budget manually.

### 2. Memory Leaks from Unclosed Resources

**Risk**: `ImageBitmap.close()` and `VideoFrame.close()` must be called to release GPU memory. If eviction paths miss a frame, memory leaks silently until the tab is closed.

**Mitigation**: The existing `FramePreloadManager` disposer and `LRUCache` `onEvict` patterns already handle this. The new controller must not bypass these cleanup paths. Add a periodic audit (`cleanupOrphans()`) that cross-references the cache map against a `WeakRef` set of all allocated bitmaps.

### 3. Concurrent Cache Mutation During Playback

**Risk**: The playback loop reads from the cache on every `requestAnimationFrame` (~60 Hz). If the controller evicts a frame between the "has frame" check and the "get frame" call, the render loop gets `null` and falls back to HTML video.

**Mitigation**: This race already exists in the current code and is handled by the fallback path. The controller's eviction will never evict the current playhead frame (it is always the highest-priority frame in the region). Add an explicit guard: `evictFarthestFrom()` skips frames within +/- 1 of the current frame.

### 4. Decoder Serialization Bottleneck

**Risk**: The `MediabunnyFrameExtractor` serializes all decode operations. No matter how large the lookahead window, decode throughput is limited to ~30-60 fps for 1080p content. For 4K content, throughput may drop to 10-15 fps. Lookahead cannot outpace this bottleneck.

**Mitigation**: The adaptive lookahead engine explicitly measures throughput and limits depth to `2 * throughput / playbackSpeed`. For content where decode is slower than playback, the system gracefully degrades to region-only behavior. This is documented in the UI: "Decode speed: 45 fps (limited by codec)".

### 5. Mobile / Low-Memory Devices

**Risk**: Mobile browsers have much less available memory (1-4 GB total). A 512 MB default budget may be too aggressive, especially on iOS where `navigator.deviceMemory` is not available.

**Mitigation**: Detect mobile via `navigator.maxTouchPoints > 0` and `navigator.userAgent` heuristics. On mobile, default to 128 MB budget with Region mode (no lookahead). On iOS, further reduce to 64 MB since WebKit is more aggressive about tab termination under memory pressure.

### 6. Tab Backgrounding and Memory Reclamation

**Risk**: When the tab is backgrounded, the browser may reclaim GPU memory backing `ImageBitmap` objects. When the tab is foregrounded, cached bitmaps may be invalid.

**Mitigation**: Listen for `visibilitychange` events. On `hidden`, optionally flush lookahead cache (keep only region). On `visible`, trigger a cache validation pass and re-fetch any invalidated frames. This is a low-priority enhancement since current code does not handle this either.

### 7. Cross-Layer Budget Conflicts

**Risk**: The `TextureCacheManager` (WebGL textures) and `MediaCacheManager` (OPFS blobs) have their own budgets. If the frame cache controller consumes all available memory, texture uploads and OPFS writes may fail.

**Mitigation**: The `MemoryBudgetManager` only governs decoded frame memory (ImageBitmap, VideoFrame, effects canvases). GPU textures are a mirror of frame data (uploaded then released) and OPFS is disk-backed. These are not counted in the frame cache budget. Document this boundary clearly.

### 8. Complexity of Three Cache Modes

**Risk**: Three modes multiply the testing surface. Each mode interacts differently with playback start/stop, direction changes, scrubbing, source switching, and in/out point changes.

**Mitigation**: The `FrameCacheController` is designed as a state machine with clean transitions. Each mode is a strategy object with a common interface (`calculateRegion()`, `shouldPreFetch()`, `onPlaybackStateChange()`). Unit tests cover each mode in isolation; integration tests cover mode switching during playback.
