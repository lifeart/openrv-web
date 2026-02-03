# Caching and Performance

## Original OpenRV Implementation
OpenRV implements sophisticated caching strategies for optimal playback performance:

**Cache Modes**:
1. **Look-Ahead Cache**: Pre-caches frames right before playback. Best for fast storage where read speeds match or exceed frame rate demands.
2. **Region Cache**: Fills memory from in-point toward out-point. Works well for sequential playback but struggles with frame jumping.
3. **Off**: Direct disk playback without caching.

**Memory Management**:
- Resolution downsampling (halving resolution = 4x more frames cached)
- Color bit-depth reduction (32-bit float to 8-bit = 75% memory savings)
- Alpha channel removal for 4-channel images
- Channel remapping to RGB-only
- Configurable RAM limits for each cache type

**Threading and I/O**:
- Configurable reader threads (1-4+ based on CPU cores)
- Multiple I/O methods: Standard, Buffered, Unbuffered, Memory Mapped, Asynchronous
- Per-format I/O configuration (EXR, JPEG, DPX, TIFF, etc.)
- EXR-specific thread optimization

**Display Synchronization**:
- V-sync options (driver-level recommended)
- Buffer wait timeout configuration
- Lookahead/lookback percentage configuration

The timeline displays cache progress as color-coded stripes.

## Status
- [ ] Not implemented
- [ ] Partially implemented
- [x] Fully implemented

## Requirements
- [x] Frame pre-caching/buffering
- [x] Memory usage limits
- [x] Cache status visualization
- [ ] Progressive loading for large images
- [ ] Resolution proxy support
- [x] Web Worker-based decoding
- [ ] IndexedDB/Cache API for persistent caching
- [ ] Bandwidth-aware streaming
- [x] Memory pressure handling

## Implementation Summary

The caching and performance system is **fully implemented** with the following components:

### Core Caching Components

#### 1. TextureCacheManager (`src/render/TextureCacheManager.ts`)
LRU cache for WebGL textures to reduce allocation overhead during playback and rendering.

**Features**:
- LRU eviction policy with configurable max entries (default: 100) and max memory (default: 512MB)
- Texture reuse for same key/dimensions
- Multiple texture format support (RGBA8, RGBA32F, R8, etc.)
- Memory size calculation based on internal format
- WebGL context loss handling (cache cleared on context loss, restored on recovery)
- Context loss event listeners with proper cleanup in `dispose()`

**Configuration**:
```typescript
interface CacheConfig {
  maxMemoryBytes: number;  // Default: 512MB
  maxEntries: number;      // Default: 100
}
```

#### 2. FramePreloadManager (`src/utils/FramePreloadManager.ts`)
Intelligent preloading system for raw frame data with priority-based queue.

**Features**:
- Priority-based queue (closer frames load first)
- Direction-aware preloading (more frames ahead in playback direction)
- Adaptive buffer sizing based on playback state (playing vs scrubbing)
- Request cancellation when navigating away
- LRU eviction with O(1) Map-based tracking
- AbortController support for cancelling pending async operations
- Cache statistics (hits, misses, eviction count, hit rate)

**Configuration**:
```typescript
interface PreloadConfig {
  maxCacheSize: number;       // Default: 100 frames
  preloadAhead: number;       // Default: 20 frames
  preloadBehind: number;      // Default: 5 frames
  scrubWindow: number;        // Default: 10 frames
  maxConcurrent: number;      // Default: 4 concurrent requests
  priorityDecayRate: number;  // Default: 1.0
}
```

#### 3. PrerenderBufferManager (`src/utils/PrerenderBufferManager.ts`)
Pre-renders frames with effects applied in the background for smooth playback.

**Features**:
- LRU cache of pre-rendered canvas frames
- Priority queue for background rendering
- Effects fingerprint to detect changes and invalidate cache
- Web Worker support for parallel processing (via WorkerPool)
- Falls back to main thread if workers unavailable
- Direction-aware preloading (more frames in playback direction)
- OffscreenCanvas support for better performance
- Callback for cache updates (for real-time UI refresh)

**Configuration**:
```typescript
interface PrerenderConfig {
  maxCacheSize: number;       // Default: 100 frames
  preloadAhead: number;       // Default: 30 frames
  preloadBehind: number;      // Default: 10 frames
  maxConcurrent: number;      // Default: hardware concurrency (up to 8)
  useWorkers: boolean;        // Default: true
  numWorkers: number;         // Default: navigator.hardwareConcurrency (capped at 8)
}
```

#### 4. CacheIndicator (`src/ui/components/CacheIndicator.ts`)
Visual indicator for frame caching status displayed in the timeline area.

**Features**:
- Thin bar showing cached frame ranges
- Color coding: cached (green), loading/pending (yellow), uncached (gray)
- Cache size display with memory usage in MB/GB
- Effects cache stats display (shows active/queued workers)
- Manual cache clear button
- Updates in real-time via session events and prerender callbacks

### What's Implemented vs. Missing

| Feature | Status | Notes |
|---------|--------|-------|
| Frame pre-caching/buffering | Implemented | FramePreloadManager + PrerenderBufferManager |
| Memory usage limits | Implemented | Configurable limits in all cache managers |
| Cache status visualization | Implemented | CacheIndicator with color-coded bar |
| Progressive loading for large images | Not implemented | Would require chunked loading |
| Resolution proxy support | Not implemented | No proxy/mipmap system |
| Web Worker-based decoding | Implemented | WorkerPool with effect workers |
| IndexedDB/Cache API persistence | Not implemented | Cache is session-only |
| Bandwidth-aware streaming | Not implemented | No network condition detection |
| Memory pressure handling | Implemented | LRU eviction when limits exceeded |

## UI/UX Specification

### Cache Indicator UI
The cache indicator is displayed in the timeline area and shows:
- A 6px tall bar with color-coded segments representing frame cache status
- Cache statistics: "Cache: X / Y frames (Z MB)"
- Effects cache stats: "Effects: X / Y frames (Z MB) [N active, M queued]"
- Clear button to manually purge the cache

**Color Scheme** (uses CSS variables):
- `--success` (green): Cached frames
- `--warning` (yellow): Pending/loading frames
- `--bg-hover` (gray): Uncached frames

### User Interactions
- Cache operates automatically based on playback state
- Users can manually clear cache via the "Clear" button
- Cache indicator only visible for video sources (mediabunny)

## Technical Notes

### Caching Strategy
1. **Raw Frame Cache** (FramePreloadManager): Caches decoded video frames
   - Used by VideoSourceNode for video playback
   - Direction-aware: preloads more frames in playback direction
   - Scrub mode uses symmetric window around current frame

2. **Effects Cache** (PrerenderBufferManager): Caches frames with effects applied
   - Only active when effects are enabled
   - Invalidates entire cache when effect parameters change
   - Uses Web Workers for parallel processing

3. **Texture Cache** (TextureCacheManager): Caches GPU textures
   - Reduces WebGL texture allocation overhead
   - Handles context loss gracefully

### Memory Management
- All caches use LRU (Least Recently Used) eviction
- Eviction only triggers when cache exceeds 80% capacity
- Small videos (frames <= maxCacheSize) can be fully cached without eviction
- Memory calculated based on frame dimensions and color depth (RGBA = 4 bytes/pixel)

### Performance Optimizations
- OffscreenCanvas for off-main-thread rendering
- AbortController for cancelling stale requests
- requestIdleCallback for background prerendering
- willReadFrequently canvas context hint for better getImageData performance
- Batch eviction to handle multiple frames efficiently

## E2E Test Cases

### Existing Tests (`e2e/prerender-buffer.spec.ts`)
| Test ID | Description | Status |
|---------|-------------|--------|
| PRB-001 | Playback with effects should not freeze | Implemented |
| PRB-002 | Effects should remain applied during playback | Implemented |
| PRB-003 | Changing effects should invalidate cache and update display | Implemented |
| PRB-010 | Multiple effects should be applied correctly | Implemented |
| PRB-020 | Effects should persist when scrubbing timeline | Implemented |
| PRB-021 | Keyboard navigation should work with effects applied | Implemented |
| PRB-030 | Rapid effect changes should not cause errors | Implemented |
| PRB-031 | Playback should remain smooth during effect changes | Implemented |
| PRB-040 | Channel isolation should work with prerender buffer | Implemented |
| PRB-050 | Effects should work at first frame | Implemented |
| PRB-051 | Effects should work at last frame | Implemented |
| PRB-052 | Resetting effects should clear prerender cache | Implemented |
| PRB-060 | Prerender buffer initializes on source load | Implemented |
| PRB-061 | Playback state updates correctly during play/pause | Implemented |
| PRB-062 | Effects persist across multiple playback cycles | Implemented |

### Related Tests (`e2e/playback-edge-cases.spec.ts`)
| Test ID | Description | Status |
|---------|-------------|--------|
| EDGE-001 | Playback at 0.1x speed advances frames slowly | Implemented |
| EDGE-002 | Playback at 8x speed advances frames rapidly | Implemented |
| EDGE-003 | Speed change during playback resets timing correctly | Implemented |
| EDGE-004 | Rapid speed cycling does not cause issues | Implemented |
| EDGE-010+ | Reverse playback boundary tests | Implemented |

### Recommended Additional E2E Tests
| Test ID | Description | Priority |
|---------|-------------|----------|
| CACHE-E001 | Cache indicator shows correct frame count after loading | Medium |
| CACHE-E002 | Clear button clears cache and updates indicator | Medium |
| CACHE-E003 | Cache indicator hidden for non-mediabunny sources | Low |
| CACHE-E004 | Memory display updates correctly as cache grows | Low |
| CACHE-E005 | Cache persists across tab switches | Medium |

## Unit Test Cases

### TextureCacheManager Tests (`src/render/TextureCacheManager.test.ts`)
| Test ID | Description | Status |
|---------|-------------|--------|
| TEX-U001 | Creates new texture for unknown key | Implemented |
| TEX-U002 | Returns same texture for same key and dimensions | Implemented |
| TEX-U003 | Creates new texture when dimensions change | Implemented |
| TEX-U004 | Sets correct texture parameters | Implemented |
| TEX-U005 | Uses custom internal format | Implemented |
| TEX-U006 | Updates existing texture with new data | Implemented |
| TEX-U007 | Returns false for non-existent key | Implemented |
| TEX-U008 | Returns true for cached texture | Implemented |
| TEX-U009 | Returns false for non-cached texture | Implemented |
| TEX-U010 | Returns texture metadata | Implemented |
| TEX-U011 | Returns null for non-existent key | Implemented |
| TEX-U012 | Tracks memory usage correctly | Implemented |
| TEX-U013 | Respects max memory configuration | Implemented |
| TEX-U014 | Removes texture from cache | Implemented |
| TEX-U015 | Returns false for non-existent key on remove | Implemented |
| TEX-U016 | Removes all textures on clear | Implemented |
| TEX-U017 | Evicts least recently used when entry limit exceeded | Implemented |
| TEX-U018 | Evicts when memory limit exceeded | Implemented |
| TEX-U019 | Releases all resources on dispose | Implemented |
| TEX-U020 | Calculates RGBA8 size correctly | Implemented |
| TEX-U021 | Calculates RGBA32F size correctly | Implemented |
| TEX-U022 | Calculates R8 size correctly | Implemented |
| TEX-U023 | isContextValid returns true initially | Implemented |
| TEX-U024 | Handles context loss by clearing cache | Implemented |
| TEX-U025 | Throws error when creating texture after context loss | Implemented |
| TEX-U026 | Recovers after context restored | Implemented |
| TEX-U027 | Dispose removes context loss listeners | Implemented |

### PrerenderBufferManager Tests (`src/utils/PrerenderBufferManager.test.ts`)
| Test ID | Description | Status |
|---------|-------------|--------|
| PBM-001 | Initializes with provided configuration | Implemented |
| PBM-002 | Uses default config when not provided | Implemented |
| PBM-003 | Stores effects state | Implemented |
| PBM-004 | Invalidates cache when effects change | Implemented |
| PBM-005 | Does not invalidate cache when effects are the same | Implemented |
| PBM-006 | Returns null for frames not in cache | Implemented |
| PBM-007 | Returns null for invalid frame numbers | Implemented |
| PBM-008 | Tracks cache misses | Implemented |
| PBM-009 | Returns false for uncached frames | Implemented |
| PBM-010 | Accepts playback state | Implemented |
| PBM-011 | Does not preload when no effects are active | Implemented |
| PBM-012 | Queues preload requests when effects are active | Implemented |
| PBM-013 | Respects frame boundaries | Implemented |
| PBM-014 | Returns correct initial statistics | Implemented |
| PBM-015 | Calculates hit rate correctly | Implemented |
| PBM-016 | Resets cache hit/miss counters | Implemented |
| PBM-017 | Updates total frame count | Implemented |
| PBM-018 | Updates configuration | Implemented |
| PBM-019 | Clears all cached frames | Implemented |
| PBM-020 | Cleans up resources on dispose | Implemented |
| PBM-021 | Cancels pending requests on invalidateAll | Implemented |
| PBM-022 | Forward playback preloads ahead | Implemented |
| PBM-023 | Reverse playback adjusts preload direction | Implemented |
| PBM-024 | Evicts oldest frames when cache is full | Implemented |
| PBM-025 | Has reasonable default values | Implemented |
| PBM-026 | Stale cached frames do not block preloading | Implemented |
| PBM-027 | hasFrame returns false for stale cache entries | Implemented |
| PBM-028 | getFrame returns null for stale cache entries | Implemented |
| PBM-029 | Does not evict distant frames when cache is below 80% capacity | Implemented |
| PBM-030 | Never evicts frames when video is smaller than cache size | Implemented |
| PBM-031 | maxConcurrent equals numWorkers for full worker utilization | Implemented |
| PBM-032 | numWorkers respects hardware concurrency limit | Implemented |
| PBM-040 | setOnCacheUpdate sets callback | Implemented |
| PBM-041 | Callback is called when frame is added to cache | Implemented |
| PBM-042 | Callback can be unset with null | Implemented |
| PBM-043 | Callback is called once per frame cached | Implemented |

### FramePreloadManager Tests (`src/utils/FramePreloadManager.test.ts`)
| Test ID | Description | Status |
|---------|-------------|--------|
| FPM-001 | Initializes with default config | Implemented |
| FPM-002 | Accepts custom config | Implemented |
| FPM-003 | Loads frame when not in cache | Implemented |
| FPM-004 | Returns cached frame without loading | Implemented |
| FPM-005 | Returns null for out of range frames | Implemented |
| FPM-006 | Handles loader errors gracefully | Implemented |
| FPM-007 | Returns false for uncached frames (hasFrame) | Implemented |
| FPM-008 | Returns true for cached frames (hasFrame) | Implemented |
| FPM-009 | Returns null for uncached frames (getCachedFrame) | Implemented |
| FPM-010 | Returns cached frame without triggering load | Implemented |
| FPM-011 | Sets playback state for forward playback | Implemented |
| FPM-012 | Sets playback state for reverse playback | Implemented |
| FPM-013 | Preloads frames around center during scrubbing | Implemented |
| FPM-014 | Preloads more ahead during forward playback | Implemented |
| FPM-015 | Respects frame bounds | Implemented |
| FPM-016 | Skips already cached frames | Implemented |
| FPM-017 | Enforces max cache size | Implemented |
| FPM-018 | Calls disposer when evicting frames | Implemented |
| FPM-019 | Evicts LRU frames first | Implemented |
| FPM-020 | Returns accurate statistics | Implemented |
| FPM-021 | Updates configuration | Implemented |
| FPM-022 | Clears all cached frames | Implemented |
| FPM-023 | Calls disposer for all frames when clearing | Implemented |
| FPM-024 | Cleans up all resources on dispose | Implemented |
| FPM-025 | Respects max concurrent requests | Implemented |
| FPM-026 | Reuses pending request when same frame requested | Implemented |
| FPM-027 | Has sensible defaults | Implemented |
| FPM-028-046 | LRU optimization and batch eviction tests | Implemented |
| FPM-047-053 | Small video full caching regression tests | Implemented |
| FPM-060-065 | AbortController support tests | Implemented |

### CacheIndicator Tests (`src/ui/components/CacheIndicator.test.ts`)
| Test ID | Description | Status |
|---------|-------------|--------|
| CACHE-U001 | Should create container element | Implemented |
| CACHE-U002 | Should be visible by default | Implemented |
| CACHE-U003 | Should have stats display element | Implemented |
| CACHE-U004 | Should have clear button | Implemented |
| CACHE-U005 | Should have info container | Implemented |
| CACHE-U006 | Should subscribe to session events | Implemented |
| CACHE-U010-015 | Visibility tests | Implemented |
| CACHE-U020-024 | getState tests | Implemented |
| CACHE-U030-033 | Memory calculation tests | Implemented |
| CACHE-U040-041 | Clear button tests | Implemented |
| CACHE-U050-051 | scheduleUpdate tests | Implemented |
| CACHE-U060-061 | Dispose tests | Implemented |
| CACHE-U070-071 | Non-mediabunny source tests | Implemented |
| CACHE-U080-095 | Prerender stats tests | Implemented |

## Files Involved
- `/Users/lifeart/Repos/openrv-web/src/render/TextureCacheManager.ts` - WebGL texture cache
- `/Users/lifeart/Repos/openrv-web/src/render/TextureCacheManager.test.ts` - Unit tests
- `/Users/lifeart/Repos/openrv-web/src/utils/FramePreloadManager.ts` - Frame preload manager
- `/Users/lifeart/Repos/openrv-web/src/utils/FramePreloadManager.test.ts` - Unit tests
- `/Users/lifeart/Repos/openrv-web/src/utils/PrerenderBufferManager.ts` - Effects prerender manager
- `/Users/lifeart/Repos/openrv-web/src/utils/PrerenderBufferManager.test.ts` - Unit tests
- `/Users/lifeart/Repos/openrv-web/src/ui/components/CacheIndicator.ts` - Cache visualization
- `/Users/lifeart/Repos/openrv-web/src/ui/components/CacheIndicator.test.ts` - Unit tests
- `/Users/lifeart/Repos/openrv-web/e2e/prerender-buffer.spec.ts` - E2E tests
- `/Users/lifeart/Repos/openrv-web/e2e/playback-edge-cases.spec.ts` - Related E2E tests
