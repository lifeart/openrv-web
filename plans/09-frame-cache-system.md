# Region / Lookahead Frame Cache System

## Overview

Desktop OpenRV provides a sophisticated RAM caching system with region cache, lookahead cache, configurable RAM limits, and color-coded timeline indicators showing cache state. The web version currently relies on `FramePreloadManager` (a count-based LRU with fixed 100-frame capacity), an HDR-specific `LRUCache` (memory-budget-based, 500 MB for VideoFrame objects), and `MediaCacheManager` (OPFS-backed persistent cache for raw media blobs). None of these implement region-aware or lookahead caching strategies, configurable memory budgets across all frame types, or user-selectable cache modes.

This plan introduces a unified **Region / Lookahead Frame Cache System** that sits between the `VideoSourceNode` frame extraction layer and the rendering pipeline, providing:

- **Region cache**: Keeps a window of decoded frames around the current playhead position.
- **Lookahead cache**: Pre-fetches frames ahead of the playhead in the playback direction, with larger buffers for forward play.
- **Configurable memory budget**: User-adjustable RAM limit (default auto-detected from `navigator.deviceMemory` or heuristics) with per-frame byte-size accounting.
- **Color-coded timeline indicator**: Extends the existing `CacheIndicator` with three colors for region-cached (green), lookahead-fetching (yellow/amber), and uncached (gray) frames, plus dashed blue lines for region boundary indicators (visually distinct from solid in/out range markers).
- **Three cache modes**: None / Nearby Frames / Playback Buffer (internally `'off' | 'region' | 'lookahead'`), selectable from the UI with tooltips.
- **Memory pressure handling**: Monitors memory usage and evicts frames when approaching the budget, pausing lookahead when memory is tight.
- **Pre-roll / warm-up**: Buffers a configurable number of frames before allowing `play()` to advance the playhead, preventing first-second stutter.
- **Multi-source coordination**: A single shared budget pool across all source nodes (source A and source B in A/B compare), matching desktop OpenRV behavior.

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

7. **Existing visibility handling**: `App.ts` already handles `visibilitychange` events (pausing playback when hidden, resuming when visible). Cache integration must hook into this existing mechanism rather than adding a separate listener.

8. **HDR and SDR paths diverge**: The HDR path uses `hdrFrameCache` (an `LRUCache<number, IPImage>`) with `fetchHDRFrame()` / `preloadHDRFrames()`, while the SDR path uses `FramePreloadManager<FrameResult>`. Both must be governed by the controller.

---

## Proposed Architecture

### New Module: `FrameCacheController`

A new class `FrameCacheController` acts as the coordination layer between:

- The frame sources (`VideoSourceNode` / `MediabunnyFrameExtractor` -- one per source node, A and B)
- The multiple cache layers (`FramePreloadManager`, HDR cache, `PrerenderBufferManager`)
- The UI (`CacheIndicator`, `CacheManagementPanel`)
- The playback engine (`PlaybackEngine` via `VideoSourceNode`)

The controller is **per-session** with a **shared memory budget across all source nodes**. When source A and source B are both loaded (A/B compare via `ABCompareManager`), their frame caches draw from the same pool. This matches desktop OpenRV's shared-pool approach and ensures the user's total budget serves whichever source is currently being viewed.

```
                         +---------------------+
                         | FrameCacheController |
                         |  (per-session,       |
                         |   shared budget)     |
                         +----------+----------+
                                    |
              +---------------------+---------------------+
              |                     |                     |
    +---------v-------+   +---------v-------+   +---------v-------+
    | RegionCache     |   | LookaheadEngine |   | MemoryBudget    |
    | (decoded frames)|   | (pre-fetch +    |   | (accounting)    |
    |                 |   |  warm-up)       |   |                 |
    +---------+-------+   +---------+-------+   +---------+-------+
              |                     |                     |
              +---------------------+---------------------+
                                    |
                    +---------------+---------------+
                    |                               |
         +----------v----------+         +----------v----------+
         | FramePreloadManager  |         | HDR LRUCache        |
         | (SDR, adapted)       |         | (HDR, registered    |
         +----------+----------+         |  as budget layer)   |
                    |                     +----------+----------+
         +----------v----------+                    |
         | MediabunnyExtractor  |         +----------v----------+
         | (existing, unchanged)|         | MediabunnyExtractor  |
         +----------------------+         | (HDR path)           |
                                          +----------------------+
```

### Cache Modes

```typescript
type CacheMode = 'off' | 'region' | 'lookahead';
```

- **Off** (UI label: "None"): No proactive caching. Frames are decoded on demand and evicted after display. A **3-frame buffer** is maintained (current frame, +1, -1) to support smooth arrow-key stepping without decode latency. Existing `FramePreloadManager` is bypassed for proactive preloading.
- **Region** (UI label: "Nearby Frames"): Maintains a fixed-size window of decoded frames centered on the playhead. The region size is determined by the memory budget (e.g., 512 MB / 33 MB per frame = ~15 frames for 4K SDR). No speculative pre-fetching beyond the region boundaries. When scrubbing rapidly in one direction, the window biases toward the scrub direction (scrub-direction detection).
- **Lookahead** (UI label: "Playback Buffer"): Extends Region mode with speculative pre-fetching in the playback direction. Asymmetric window: more frames ahead than behind. Adapts buffer depth based on decode throughput (measured frames-per-second vs. playback FPS). Includes pre-roll warm-up before playback starts.

Default mode: **Lookahead** (matches current behavior, but with memory awareness).

**UI labels and tooltips**: The mode selector uses user-friendly labels ("None / Nearby Frames / Playback Buffer") with tooltip descriptions:
- None: "No pre-loading. Frames are decoded on demand."
- Nearby Frames: "Keeps frames near the playhead ready for instant scrubbing."
- Playback Buffer: "Pre-loads frames ahead for smooth playback."

---

## Cache Strategy

### Region Cache

The region cache replaces the current count-based preload window with a memory-budget-aware window. Key properties:

- **Symmetric when scrubbing slowly**: Equal frames ahead and behind the playhead.
- **Direction-biased when scrubbing rapidly**: Detects scrub velocity and direction, biasing prefetch toward the scrub direction (e.g., 70% in scrub direction, 30% behind) when the user drags the timeline handle rapidly.
- **Asymmetric during playback**: More frames in the playback direction.
- **Pinned boundaries**: Optional in-point/out-point pinning keeps the entire marked range in cache when the budget allows.
- **Eviction order**: Frames furthest from the playhead are evicted first (distance-based, not LRU). This differs from pure LRU: a frame at distance 50 that was accessed 1ms ago is evicted before a frame at distance 5 that was accessed 10s ago.
- **Eviction guard**: The controller never evicts frames within `+/- max(2, ceil(playbackSpeed * 2))` of the current playhead frame. This protects against races during high-speed playback (2x-4x) where the playhead advances multiple frames per rAF tick.

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
  /** Current scrub velocity (frames/sec, 0 when idle) for direction bias */
  scrubVelocity: number;
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

// During slow scrubbing (|scrubVelocity| < threshold): 50/50 split
aheadFrames = behindFrames = floor(regionCapacity / 2)

// During fast scrubbing: bias toward scrub direction
// (same 70/30 split but oriented in scrub direction)
```

### Lookahead Engine

The lookahead engine is a stateful pre-fetcher that runs as a background task:

1. **Throughput measurement**: Tracks decode throughput (frames decoded and delivered to cache per wall-clock second) over a rolling 10-frame window. Only frames that pass validation and are successfully inserted into the cache count toward throughput; aborted or failed decodes do not.
2. **Starvation prediction**: Compares decode throughput against playback FPS. If `throughput < playbackFPS * playbackSpeed * 1.5`, the lookahead depth is reduced to avoid wasting decode cycles on frames that will be evicted.
3. **Adaptive depth**: `lookaheadDepth = min(regionCapacity, ceil(throughput * 2 / playbackSpeed))`. This ensures the lookahead never exceeds what can be decoded in ~2 seconds of playback.
4. **Abort on direction change**: When playback direction changes or the user scrubs to a distant frame, all pending lookahead requests are aborted (leveraging the existing `AbortController` pattern in `FramePreloadManager`).
5. **Pause under memory pressure**: When `currentUsage > budget * 0.9`, lookahead pauses and only region cache is maintained.

### Pre-roll / Warm-up

Before playback starts, the controller buffers a configurable number of frames to prevent first-second stutter:

```typescript
interface WarmUpConfig {
  /** Minimum frames to buffer before play() advances the playhead */
  minPrerollFrames: number; // Default: 8 (matches desktop RV)
}

/**
 * Called by PlaybackEngine.play() before starting the timing loop.
 * Resolves when minPrerollFrames are cached, or rejects on timeout.
 */
warmUp(frame: number, direction: 1 | -1, minFrames?: number): Promise<void>;
```

This generalizes the existing HDR-only `_hdrBuffering` flag in `PlaybackEngine` to work for all frame types. The `PlaybackEngine.play()` method calls `warmUp()` before entering the rAF timing loop.

### Seek / Scrub Event Handling

When the user seeks to a distant frame (timeline click, keyboard shortcut, or programmatic seek), the controller must respond immediately:

1. **On seek**: Trigger an immediate burst of region cache population centered on the new playhead position.
2. **On scrub start**: Switch to symmetric (or direction-biased) window sizing.
3. **On scrub end**: If playback was active, transition back to asymmetric lookahead window.

The controller listens for both playback buffer updates (`updatePlaybackBuffer()`) and seek/scrub events (`preloadFrames()` / `preloadAround()`) from `VideoSourceNode` to handle all trigger paths.

### Frame Size Estimation

Since `ImageBitmap` memory is not directly measurable from JavaScript, we estimate:

```typescript
function estimateFrameBytes(
  width: number,
  height: number,
  isHDR: boolean,
  targetSize?: { w: number; h: number },
): number {
  // Use targetSize when available (frames may be extracted at reduced resolution)
  const w = targetSize?.w ?? width;
  const h = targetSize?.h ?? height;
  // ImageBitmap is typically RGBA8 (4 bytes/pixel) for SDR
  // HDR IPImage with VideoFrame is RGBA16F (8 bytes/pixel)
  const bytesPerPixel = isHDR ? 8 : 4;
  return w * h * bytesPerPixel;
}
```

**Important**: `FrameSizeEstimator` must use `targetSize` from `FramePreloadManager.getTargetSize()` when estimating SDR frame sizes, since `MediabunnyFrameExtractor` may extract frames at reduced resolution via `createImageBitmap()` with `resizeWidth`/`resizeHeight`. Using source dimensions instead of target dimensions would over-estimate memory usage.

This is an approximation. The browser may store `ImageBitmap` in compressed GPU memory, or in a different format. The estimate provides an upper bound that is safe for budgeting.

---

## Memory Management

### Memory Budget Detection

```typescript
interface MemoryBudgetConfig {
  /** Total memory budget in bytes for all frame caches (shared across all sources) */
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

Note: Mobile detection via `navigator.maxTouchPoints > 0` is unreliable (e.g., Surface Pro with keyboard has `maxTouchPoints > 0` but is a powerful device). The budget auto-detection relies on `navigator.deviceMemory` where available and falls back to 512 MB. Mobile-specific adjustments only affect the default mode choice (Region vs. Lookahead), not the budget. The memory pressure system handles under-provisioned devices dynamically.

### Memory Pressure Handling

Three pressure levels:

| Level | Threshold | Action |
|---|---|---|
| Normal | usage < 80% budget | Full region + lookahead active |
| High | 80% <= usage < 95% | Lookahead paused, region cache only |
| Critical | usage >= 95% | Emergency eviction: evict 20% of frames (farthest from playhead first), reduce region window by 50%, emit `memoryPressure` event |

The controller updates memory usage tracking after every frame insertion/eviction (O(1) since we maintain a running total) and adjusts behavior accordingly.

**Periodic audit**: In addition to event-driven tracking, a periodic audit runs every 5-10 seconds to validate the running byte-total against the actual sum of estimated frame sizes across all caches. This catches discrepancies caused by browser GC reclaiming `ImageBitmap` memory behind the controller's back, or by frames being removed through paths that bypass the controller's notification. Discrepancies are logged for debugging.

> **Review Note (Nice to Have)**: For ground-truth memory validation, if the app is served with COOP/COEP headers, `performance.measureUserAgentSpecificMemory()` (the modern replacement for the deprecated `performance.memory`) could provide actual usage numbers. This is a future diagnostic option.

### Coordination Across Cache Layers

The `FrameCacheController` maintains a single `currentUsageBytes` counter that aggregates **all source nodes**:

- Source A SDR frame cache: `frameCount * estimateFrameBytes(w, h, false, targetSize)`
- Source A HDR frame cache: `frameCount * estimateFrameBytes(w, h, true, hdrTargetSize)`
- Source B SDR frame cache: (same formula)
- Source B HDR frame cache: (same formula)
- Effects prerender cache: `frameCount * sourceW * sourceH * 4` (RGBA canvas)

Each sub-cache (including the HDR `LRUCache` in each `VideoSourceNode`) registers with the `MemoryBudgetManager` and calls `reportAllocation(bytes)` / `reportDeallocation(bytes)` on add/evict so the counter stays accurate.

**Multi-source coordination**: When both source A and source B are loaded (A/B compare), the controller allocates budget proportionally based on which source is currently being viewed. The currently active source gets priority for lookahead; the inactive source retains its region cache but does not lookahead. This interacts with `PlaybackEngine.startSourceBPlaybackPreload()` -- when source B preload starts, the controller allocates a portion of the shared budget to source B's cache.

**Effects cache fill priority**: When the effects cache is invalidated (e.g., user changes a color grading parameter), the freed budget space is reserved for effects re-renders rather than immediately filled with raw frame cache. The controller maintains a `pendingEffectsReserve` that is released after a configurable timeout if no effects re-renders arrive.

### GC Pressure Mitigation

Both `FramePreloadManager` and the `FrameCacheController` use `Map` with frequent `delete()` + `set()` operations for LRU tracking. In V8, this triggers incremental mark-compact GC cycles that can cause 1-5ms pauses during the rAF loop. The existing `LRUCache.peek()` method was added to mitigate this (see the comment in `LRUCache.ts`). The controller must:

- Prefer `peek()` over `get()` on hot paths (frame existence checks during rendering).
- Batch eviction operations rather than evicting one frame at a time.
- Avoid allocating temporary objects in the eviction path.

---

## UI Design

### Enhanced CacheIndicator

The existing `CacheIndicator` at `src/ui/components/CacheIndicator.ts` will be extended:

**Current colors:**
- Green (`--success`): Cached frames
- Yellow (`--warning`): Pending/loading frames
- Gray (`--bg-hover`): Uncached frames

**New colors (additions):**
- Dashed blue lines (`--accent-primary`): Region boundary indicators (thin dashed vertical lines marking the region edges). These are visually distinct from the solid accent-color in/out range handles.
- The existing green/yellow/gray scheme remains, but the bar gains a subtle background tint showing the region window boundaries.

**New stats display:**
```
Cache: 45/300 frames (1.4 GB / 2.0 GB) [Playback Buffer] | 12 preloading
```

The display now shows:
- Frame count and memory usage (with budget)
- Active cache mode label (using user-friendly names)
- Number of frames actively preloading

**Cache mode selector:**
A small segmented control added to the `CacheManagementPanel` (`src/ui/components/CacheManagementPanel.ts`):

```
[None] [Nearby Frames] [Playback Buffer]
```

Each option has a tooltip explaining the mode behavior. When mode changes, the controller is reconfigured and excess frames are evicted.

**Keyboard shortcut**: Shift+C cycles through cache modes (matching desktop RV convention).

**Memory budget slider:**
Added to the `CacheManagementPanel` in a collapsible **"Advanced"** section (collapsed by default):

```
[Advanced v]
  Memory Budget: [======|====] 2.0 GB
                 256 MB          4 GB
```

This allows advanced users to increase the budget for machines with more RAM or decrease it when running other memory-intensive applications. Most users should not need to interact with this control.

**"Cache In/Out Range" action:**
A button in the timeline in/out controls (and keyboard shortcut Ctrl+Shift+C) that proactively fills the cache for the entire in/out range. This triggers a visible progress indicator in the `CacheIndicator` showing fill progress (e.g., "Caching range: 45/120 frames..."). This is a common pre-client-review workflow: load the shot, cache the range, then hand the screen to the supervisor for stutter-free playback.

### Timeline Region Overlay

In the timeline canvas (`src/ui/components/Timeline.ts`), a semi-transparent overlay shows the region cache boundaries:

- A subtle tinted band behind the track bar indicating the cached region.
- The region boundaries shift as the playhead moves, providing visual feedback of what is "ready" for instant scrubbing.
- During lookahead, an arrow-like gradient extends from the region edge in the playback direction, indicating active pre-fetching.
- The uncached portion of the timeline is rendered in a subtly different shade so the user sees what is NOT cached (more useful information than highlighting what is cached, especially for long clips where the cached region is a tiny sliver).

### Starvation Feedback

When the playback engine enters starvation/buffering mode (existing `PlaybackEngine.buffering` event and `isBuffering` state), the cache controller's state is wired to display feedback:

- A brief non-modal "Buffering..." text or spinner overlay appears.
- The `CacheIndicator` tooltip shows the cache fill rate and estimated time to resume smooth playback.

> **Review Note (Nice to Have)**: A more sophisticated starvation UX could include a semi-transparent progress ring centered on the viewport, similar to YouTube's buffering spinner. This is a future iteration item.

---

## Implementation Steps

### Phase 1: Memory Budget Infrastructure (Week 1)

1. **Create `MemoryBudgetManager`** (`src/cache/MemoryBudgetManager.ts`):
   - Maintains running byte-total across all registered cache layers (including multiple source nodes).
   - Detects default budget via `navigator.deviceMemory` with fallbacks (512 MB default, no fragile mobile detection for budget).
   - Emits `pressureChanged` events at normal/high/critical thresholds.
   - Provides `register(layer)` / `unregister(layer)` for cache layer integration.
   - Provides `canAllocate(bytes): boolean` and `reportAllocation(bytes)` / `reportDeallocation(bytes)`.
   - Includes periodic audit (every 5-10 seconds) that validates the running total against actual cache contents.

2. **Create `FrameSizeEstimator`** (`src/cache/FrameSizeEstimator.ts`):
   - Pure functions for estimating frame memory given dimensions, data type, and target size.
   - Uses `targetSize` from `FramePreloadManager.getTargetSize()` when available for accurate SDR frame estimation.
   - Used by all cache layers for consistent budgeting.

3. **Add tests** for `MemoryBudgetManager` and `FrameSizeEstimator`.

### Phase 2: FrameCacheController Core (Week 2)

4. **Create `FrameCacheController`** (`src/cache/FrameCacheController.ts`):
   - Owns the `CacheMode` state.
   - **Per-session, shared budget** across all source nodes (source A and source B).
   - Integrates with `MemoryBudgetManager`.
   - In `'off'` mode: bypasses preloading, maintains a 3-frame buffer (current, +1, -1) for arrow-key stepping.
   - In `'region'` mode: calculates region window from budget, uses distance-based eviction. Detects scrub velocity for direction-biased window sizing.
   - In `'lookahead'` mode: extends region with direction-aware pre-fetch. Includes pre-roll warm-up.
   - Eviction guard: never evicts frames within `+/- max(2, ceil(playbackSpeed * 2))` of the current playhead.
   - Exposes `getCacheState(): FrameCacheState` for UI consumption (mode, budget, usage, region boundaries, per-frame status).
   - Exposes `warmUp(frame, direction, minFrames): Promise<void>` for pre-roll.
   - Handles both seek events and playback buffer updates to populate the region cache after timeline clicks.
   - Manages both the SDR path (`FramePreloadManager`) and the HDR path (`hdrFrameCache` / `preloadHDRFrames()`).

5. **Add `CacheMode` type and configuration** to `src/config/CacheConfig.ts`:
   ```typescript
   export interface CacheConfig {
     mode: CacheMode;
     memoryBudgetBytes: number;
     hdrReserveFraction: number;
     effectsReserveFraction: number;
     highWaterMark: number;
     criticalMark: number;
     /** Minimum pre-roll frames before playback starts */
     minPrerollFrames: number;
     /** Eviction guard radius: max(this, ceil(playbackSpeed * 2)) */
     minEvictionGuard: number;
   }
   ```

6. **Refactor `FramePreloadManager`** to accept external eviction decisions:
   - Add `setMaxCacheSizeBytes(bytes: number)` alongside the existing count-based `setCapacity()`.
   - Add `getEstimatedMemoryUsage(): number` method.
   - Expose the existing `evictDistantFrames()` private method publicly so the controller can call `preloadAround()` with adjusted parameters. This is less invasive than adding a full `evictFarthestFrom()` method that would change `FramePreloadManager`'s single responsibility.
   - Register with `MemoryBudgetManager` via `reportAllocation()` / `reportDeallocation()`.
   - Existing behavior remains the default when `FrameCacheController` is not wired.

7. **HDR cache integration**: Register the HDR `LRUCache` in `VideoSourceNode` as a second layer in `MemoryBudgetManager`:
   - Add `reportAllocation()` / `reportDeallocation()` calls in `fetchHDRFrame()` and the LRU `onEvict` callback.
   - The controller calls `preloadHDRFrames()` (existing method) with parameters derived from its region/lookahead calculations, rather than replacing the HDR path entirely.
   - The HDR cache's `updateHDRCacheSize()` defers to the `MemoryBudgetManager`'s `hdrReserve` fraction.

8. **Add tests** for `FrameCacheController` in all three modes, including:
   - Mode switching during playback.
   - Pre-roll warm-up completion.
   - Seek event handling and region repopulation.
   - Multi-source budget sharing.
   - Eviction guard with different playback speeds.

### Phase 3: Integrate with VideoSourceNode (Week 3)

9. **Wire `FrameCacheController` into `VideoSourceNode`**:
   - `VideoSourceNode.initPreloadManager()` now accepts an optional `FrameCacheController`.
   - When present, the controller governs cache size and eviction rather than the fixed config.
   - `updatePlaybackBuffer()` delegates to the controller's lookahead engine.
   - HDR frame cache (`hdrFrameCache`) registers with the `MemoryBudgetManager`.
   - Both source A and source B `VideoSourceNode` instances register with the same controller.

10. **Wire `FrameCacheController` into `Session`**:
    - `Session` creates the controller during initialization (one per session, shared budget).
    - Passes it to `VideoSourceNode` via `SessionMedia` (for both source A and source B).
    - Exposes `getCacheMode()`, `setCacheMode()`, `getCacheBudget()`, `setCacheBudget()`.

11. **Wire into `PlaybackEngine`**:
    - `startPlaybackPreload()` / `stopPlaybackPreload()` now notify the controller of playback state changes.
    - `play()` calls `controller.warmUp()` before starting the timing loop, generalizing the existing HDR-only `_hdrBuffering` path.
    - `startSourceBPlaybackPreload()` notifies the controller to allocate budget for source B.
    - The controller adjusts region/lookahead parameters accordingly.

12. **Integration tests** verifying:
    - Mode switching during playback.
    - Memory budget enforcement across sources A and B.
    - Frame eviction under pressure.
    - Pre-roll warm-up before playback.
    - Seek to distant frame triggers region repopulation.
    - Cache persistence across source switches (source A's cache preserved when switching to B and back).

### Phase 4: UI Integration (Week 4)

13. **Enhance `CacheIndicator`**:
    - Query `FrameCacheController.getCacheState()` instead of raw `Session.getCachedFrames()`.
    - Render region boundary indicators (dashed blue lines, visually distinct from in/out markers).
    - Show memory usage / budget in stats text.
    - Show cache mode label (user-friendly names: None / Nearby Frames / Playback Buffer).
    - Wire starvation feedback: display "Buffering..." when `PlaybackEngine.isBuffering` is true and cache is not full.

14. **Enhance `CacheManagementPanel`**:
    - Add cache mode selector with user-friendly labels and tooltips.
    - Add memory budget slider in a collapsible "Advanced" section (collapsed by default).
    - Display per-layer breakdown: SDR frames, HDR frames, effects cache, per-source breakdown.
    - Wire to `Session.setCacheMode()` / `Session.setCacheBudget()`.

15. **Add keyboard shortcuts**:
    - Shift+C: Cycle cache modes (None -> Nearby Frames -> Playback Buffer -> None).
    - Ctrl+Shift+C: Cache In/Out Range (proactive fill with progress indicator).

16. **Enhance `Timeline`**:
    - Draw a subtle region overlay band behind the track, showing the cached region extent.
    - During lookahead, render a gradient arrow showing pre-fetch direction.
    - Render uncached portions in a subtly different shade for visibility on long clips.
    - Add "Cache Range" button to the timeline in/out controls, wired to the proactive fill action.

17. **Persist settings** via `localStorage`:
    - `openrv.cache.mode` (CacheMode string)
    - `openrv.cache.budgetMB` (number)

18. **UI tests** for mode switching, budget adjustment, indicator rendering, keyboard shortcuts.

### Phase 5: Advanced Features and Polish (Week 5)

19. **Throughput-adaptive lookahead**:
    - Track decode throughput in the controller (frames delivered to cache per wall-clock second, excluding aborted/failed decodes).
    - Dynamically adjust lookahead depth based on measured throughput vs. playback speed.
    - Add a `getDecodeThroughput()` metric for diagnostics.

20. **In/Out range pinning and proactive fill**:
    - When the in/out range fits within the memory budget, pin those frames so they are never evicted.
    - The "Cache In/Out Range" action (Ctrl+Shift+C) proactively fills the cache with a visible progress indicator.
    - Pinned frames are shown with a distinct indicator color (solid green border).

21. **Memory pressure event handling**:
    - When the controller enters critical pressure, emit an event that the `StatusManager` can display: "Memory pressure: cache reduced."
    - Optionally pause lookahead and notify the user via `CacheIndicator` tooltip.

22. **Tab visibility integration**:
    - Hook into the existing `App.handleVisibilityChange()` mechanism (do not add a separate `visibilitychange` listener).
    - On `hidden`: flush lookahead cache (keep only region).
    - On `visible`: trigger a cache validation pass and re-fetch any invalidated frames (ImageBitmap GPU memory may have been reclaimed by the browser while backgrounded, leading to black or corrupted frames).

23. **Effects cache integration**:
    - Register `PrerenderBufferManager` with the `MemoryBudgetManager`.
    - When total memory pressure is high, the effects cache is evicted before raw frame cache (effects can be re-rendered, raw frames are cheaper to keep).
    - When effects cache is invalidated, freed budget is reserved for effects re-renders via `pendingEffectsReserve` before being released for raw frame cache.

24. **Scrub-direction detection**:
    - Track scrub velocity (frames per second of scrub movement).
    - When scrub velocity exceeds a threshold, bias the preload window toward the scrub direction.
    - On scrub stop, return to symmetric or playback-direction-biased window.

25. **Performance benchmarks**:
    - Measure cache hit rates across all modes.
    - Measure memory accuracy (estimated vs. actual via `performance.memory` where available).
    - Measure playback smoothness (frame drop rate) with/without lookahead.

> **Review Note (Nice to Have -- future iterations)**:
> - **Cross-tab budget coordination**: Use `BroadcastChannel` to share memory budget state across tabs and reduce each tab's budget proportionally when multiple tabs are open. The `MediaCacheManager` already uses `navigator.locks` for OPFS writes, providing precedent. For now, multiple tabs allocate budgets independently (document this limitation).
> - **Image sequence support**: Extend `FrameCacheController` to work with `SequenceLoader` image stacks (EXR sequences, common in VFX), not just `MediabunnyFrameExtractor` video. This plan is video-only in this iteration.
> - **`performance.measureUserAgentSpecificMemory()` diagnostic**: If the app is served with COOP/COEP headers, use this modern API to validate estimated memory against actual usage.

---

## Files to Create

| File | Purpose |
|---|---|
| `src/cache/MemoryBudgetManager.ts` | Memory budget accounting, pressure events, periodic audit |
| `src/cache/MemoryBudgetManager.test.ts` | Tests for memory budget manager |
| `src/cache/FrameSizeEstimator.ts` | Frame memory size estimation utilities (uses targetSize when available) |
| `src/cache/FrameSizeEstimator.test.ts` | Tests for size estimator |
| `src/cache/FrameCacheController.ts` | Main coordination controller (mode, region, lookahead, warm-up, seek handling, multi-source) |
| `src/cache/FrameCacheController.test.ts` | Tests for cache controller |
| `src/config/CacheConfig.ts` | Cache configuration types and defaults |

## Files to Modify

| File | Changes |
|---|---|
| `src/utils/media/FramePreloadManager.ts` | Add byte-size tracking, expose `evictDistantFrames()` publicly, add memory reporting. Add `setMaxCacheSizeBytes()` and `getEstimatedMemoryUsage()`. Register with `MemoryBudgetManager`. |
| `src/utils/media/FramePreloadManager.test.ts` | Tests for new methods. |
| `src/nodes/sources/VideoSourceNode.ts` | Accept `FrameCacheController` in `initPreloadManager()`. Register HDR cache with `MemoryBudgetManager` (add `reportAllocation`/`reportDeallocation` in `fetchHDRFrame()` and `onEvict`). Delegate buffer management to controller. Both source A and B register with same controller. |
| `src/nodes/sources/VideoSourceNode.test.ts` | Tests for controller integration, multi-source budget sharing. |
| `src/core/session/Session.ts` | Create and own `FrameCacheController` (one per session). Expose `getCacheMode()`, `setCacheMode()`, `getCacheBudget()`, `setCacheBudget()`, `getFrameCacheState()`. |
| `src/core/session/SessionMedia.ts` | Pass `FrameCacheController` to `VideoSourceNode` during media loading (for both source A and source B). |
| `src/core/session/PlaybackEngine.ts` | Notify `FrameCacheController` of playback start/stop/direction changes. Call `controller.warmUp()` before starting timing loop (generalizing `_hdrBuffering`). Notify controller on `startSourceBPlaybackPreload()`. |
| `src/ui/components/CacheIndicator.ts` | Query `FrameCacheController` state for enhanced rendering (region boundaries with dashed blue lines, memory stats, mode label, starvation feedback). |
| `src/ui/components/CacheIndicator.test.ts` | Tests for enhanced indicator. |
| `src/ui/components/CacheManagementPanel.ts` | Add cache mode selector with user-friendly labels and tooltips. Add memory budget slider in collapsible "Advanced" section. Wire to Session. |
| `src/ui/components/CacheManagementPanel.test.ts` | Tests for new controls. |
| `src/ui/components/Timeline.ts` | Add region overlay rendering, uncached shading, "Cache Range" button in in/out controls. |
| `src/ui/components/Timeline.test.ts` | Tests for region overlay and cache range button. |
| `src/ui/components/App.ts` | Wire `handleVisibilityChange()` to notify `FrameCacheController` (flush lookahead on hidden, validate on visible). |
| `src/utils/effects/PrerenderBufferManager.ts` | Register with `MemoryBudgetManager` for unified budget accounting. |
| `src/config/index.ts` | Export `CacheConfig`. |
| `src/ui/keyboardShortcuts.ts` (or equivalent) | Add Shift+C (cycle cache modes) and Ctrl+Shift+C (cache in/out range) bindings. |

---

## Risks

### 1. ImageBitmap Memory Estimation Inaccuracy

**Risk**: `ImageBitmap` objects reside in GPU process memory. Their actual size depends on the browser's internal representation (may be compressed, may differ from `width * height * 4`). Our estimation could be 2-3x off in either direction.

**Mitigation**: Use conservative estimates (always assume uncompressed RGBA8). Use `targetSize` from `FramePreloadManager.getTargetSize()` for accurate sizing when frames are extracted at reduced resolution. Provide a "measured vs. estimated" diagnostic in the cache panel when `performance.memory` is available (Chromium only). Allow users to adjust the budget manually.

### 2. Memory Leaks from Unclosed Resources

**Risk**: `ImageBitmap.close()` and `VideoFrame.close()` must be called to release GPU memory. If eviction paths miss a frame, memory leaks silently until the tab is closed.

**Mitigation**: The existing `FramePreloadManager` disposer and `LRUCache` `onEvict` patterns already handle this. The new controller must not bypass these cleanup paths. Maintain a `Set<number>` of all frame numbers that have been added to any cache. On periodic audit (every 5-10 seconds), verify every entry in the set still exists in a cache. If not, it was leaked and should be logged. This is O(n) but n is bounded by cache capacity.

### 3. Concurrent Cache Mutation During Playback

**Risk**: The playback loop reads from the cache on every `requestAnimationFrame` (~60 Hz). If the controller evicts a frame between the "has frame" check and the "get frame" call, the render loop gets `null` and falls back to HTML video.

**Mitigation**: This race already exists in the current code and is handled by the fallback path. The controller's eviction will never evict the current playhead frame (it is always the highest-priority frame in the region). The eviction guard protects frames within `+/- max(2, ceil(playbackSpeed * 2))` of the current frame, handling high-speed playback at 2x-4x where the playhead advances multiple frames per rAF tick.

### 4. Decoder Serialization Bottleneck

**Risk**: The `MediabunnyFrameExtractor` serializes all decode operations. No matter how large the lookahead window, decode throughput is limited to ~30-60 fps for 1080p content. For 4K content, throughput may drop to 10-15 fps. Lookahead cannot outpace this bottleneck.

**Mitigation**: The adaptive lookahead engine explicitly measures throughput (frames delivered to cache per wall-clock second, not decoder invocations) and limits depth to `2 * throughput / playbackSpeed`. For content where decode is slower than playback, the system gracefully degrades to region-only behavior. This is documented in the UI: "Decode speed: 45 fps (limited by codec)".

### 5. Mobile / Low-Memory Devices

**Risk**: Mobile browsers have much less available memory (1-4 GB total). A 512 MB default budget may be too aggressive, especially on iOS where `navigator.deviceMemory` is not available.

**Mitigation**: Use `navigator.deviceMemory` when available; fall back to 512 MB. Do not use fragile mobile detection heuristics (`navigator.maxTouchPoints`, user agent) for budget sizing. Instead, the memory pressure system handles under-provisioned devices dynamically by escalating through Normal -> High -> Critical pressure levels. On iOS Safari, where WebKit is aggressive about tab termination, consider whether caching should be disabled in favor of the existing HTML video fallback path (which handles its own buffering natively). The default mode on iOS could be "None" (off).

### 6. Tab Backgrounding and Memory Reclamation

**Risk**: When the tab is backgrounded, the browser may reclaim GPU memory backing `ImageBitmap` objects. When the tab is foregrounded, cached bitmaps may be invalid, leading to black or corrupted frames.

**Mitigation**: Hook into the existing `App.handleVisibilityChange()` mechanism (not a separate listener). On `hidden`, flush lookahead cache (keep only region). On `visible`, trigger a cache validation pass and re-fetch any invalidated frames. This is important (not low-priority) because the LRU cache will hold references to dead bitmaps without explicit validation.

### 7. Cross-Layer Budget Conflicts

**Risk**: The `TextureCacheManager` (WebGL textures) and `MediaCacheManager` (OPFS blobs) have their own budgets. If the frame cache controller consumes all available memory, texture uploads and OPFS writes may fail.

**Mitigation**: The `MemoryBudgetManager` only governs decoded frame memory (ImageBitmap, VideoFrame, effects canvases). GPU textures are a mirror of frame data (uploaded then released) and OPFS is disk-backed. These are not counted in the frame cache budget. Document this boundary clearly.

### 8. Complexity of Three Cache Modes

**Risk**: Three modes multiply the testing surface. Each mode interacts differently with playback start/stop, direction changes, scrubbing, source switching, and in/out point changes.

**Mitigation**: The `FrameCacheController` is designed as a state machine with clean transitions. Each mode is a strategy object with a common interface (`calculateRegion()`, `shouldPreFetch()`, `onPlaybackStateChange()`). Unit tests cover each mode in isolation; integration tests cover mode switching during playback.

### 9. GC Pressure from Frequent Map Operations

**Risk**: Both `FramePreloadManager` and the `FrameCacheController` use `Map` with frequent `delete()` + `set()` operations for LRU tracking. In V8, this triggers incremental mark-compact GC cycles that can cause 1-5ms pauses during the rAF loop.

**Mitigation**: Use `peek()` over `get()` on hot paths (the existing `LRUCache.peek()` was added specifically for this). Batch eviction operations rather than evicting one frame at a time. Avoid allocating temporary objects in the eviction path.

### 10. Multiple Tabs

**Risk**: If the user has two openrv-web tabs open (common when comparing two cuts), both will try to allocate their full memory budgets independently, potentially causing tab crashes.

**Mitigation**: Document this limitation. In this iteration, each tab manages its own budget independently. A future enhancement could use `BroadcastChannel` or `navigator.locks` to coordinate budgets across tabs (the `MediaCacheManager` already uses `navigator.locks` for OPFS writes, providing precedent).

### 11. Scope: Video-Only

**Risk**: This plan covers video sources (`VideoSourceNode` / `MediabunnyFrameExtractor`) only. The app also supports image sequences via `SequenceLoader` and single images via `FileSourceNode` (EXR sequences are common in VFX).

**Mitigation**: Explicitly scoped to video-only in this iteration. Image sequence support via `SequenceLoader` is a planned future extension. The `FrameCacheController` interface is designed to be source-agnostic so that `SequenceLoader` can register as a cache layer in a future iteration.
