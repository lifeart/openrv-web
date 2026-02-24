# Plan: OPFS Media Caching + GLSL Playlist Transitions

## Context

OpenRV Web requires users to re-select files from the file picker every time a page reloads or session reopens. Additionally, playlist clips play back-to-back with hard cuts — no smooth transitions exist for polished dailies presentations. Inspired by OpenVideo's OPFS caching and gl-transitions library, this plan adds two features:

1. **OPFS Media Caching** — persist raw file bytes in the browser's Origin Private File System so subsequent loads are instant
2. **GLSL Playlist Transitions** — configurable transitions (crossfade, dissolve, wipes) between playlist clips with GPU-accelerated rendering

---

## Feature 1: OPFS Media Caching

### Scope (v1)

- Cache **image files and sequence frames** only (not video — videos need the original `File` handle for mediabunny random-access seeking)
- Cache **thumbnail strips** as WebP blobs
- IndexedDB for manifest metadata, OPFS for binary blobs
- 2GB default limit, LRU eviction
- Minimal cache management UI in settings

### Cache Key Strategy

SHA-256 of the first 64KB of file content + metadata to avoid same-name collisions (common in VFX pipelines with `plate.1001.exr` in different shot directories):

```typescript
key = SHA256(`${file.name}|${file.size}|${file.lastModified}|${first64kHash}`)
```

The first-64KB hash is computed in <1ms and memoized via WeakMap. Falls back to `name|size|lastModified` if `crypto.subtle` is unavailable (non-HTTPS).

### Architecture

```
IndexedDB ("openrv-web-media-cache")          OPFS (/openrv-cache/)
┌──────────────────────────────┐     ┌──────────────────────┐
│ manifest store               │     │ media/               │
│  key → CacheManifestEntry    │────▶│   <cacheKey>.bin     │
│  (metadata, LRU timestamps)  │     │ thumbnails/          │
│ settings store               │     │   <key>-<frame>.webp │
│  (config, version)           │     └──────────────────────┘
└──────────────────────────────┘
```

IndexedDB provides transactional atomic writes (multi-tab safe). OPFS is used purely as a binary blob store.

### New Files

| File | Purpose |
|------|---------|
| `src/cache/MediaCacheKey.ts` | `computeCacheKey(file)` with SHA-256 of first 64KB |
| `src/cache/MediaCacheManager.ts` | Core cache class: IndexedDB manifest + OPFS blobs |
| `src/cache/MediaCacheManager.test.ts` | Unit tests with in-memory OPFS mock |
| `src/cache/MediaCacheKey.test.ts` | Cache key generation tests |
| `src/ui/components/CacheManagementPanel.ts` | Settings panel: cache stats + "Clear All" button |

### Key Class: `MediaCacheManager`

```typescript
export class MediaCacheManager extends EventEmitter<CacheManagerEvents> {
  constructor(config?: Partial<CacheConfig>);
  async initialize(): Promise<boolean>;       // false if OPFS unavailable
  async get(cacheKey: string): Promise<ArrayBuffer | null>;
  async put(cacheKey: string, data: ArrayBuffer, meta: CacheEntryMeta): Promise<boolean>;
  isStable(cacheKey: string): boolean;         // false while write is pending
  async evictLRU(targetFreeBytes: number): Promise<number>;
  async clearAll(): Promise<void>;
  async getStats(): Promise<CacheStats>;
  async cleanOrphans(): Promise<number>;       // startup: remove unreferenced OPFS files
  dispose(): void;
}
```

### Files to Modify

**`src/core/session/SessionState.ts`** — Add optional `opfsCacheKey?: string` to `MediaReference` interface.

**`src/core/session/SessionSerializer.ts`** — In `serializeMedia()`: include `opfsCacheKey` only when `cacheManager.isStable(key)` is true (two-phase commit prevents referencing incomplete writes). In `fromJSON()`: when `requiresReload` is true and `opfsCacheKey` exists, attempt `cacheManager.get(key)` before prompting file picker. Fall through to file picker on cache miss.

**`src/core/session/MediaManager.ts`** — Add `setCacheManager(cache)` setter. After successful `loadImageFile()` / sequence frame load, trigger background `cacheManager.put()`. On completion, stamp `source.opfsCacheKey` on the MediaSource.

**`src/ui/components/ThumbnailManager.ts`** — Check OPFS cache before generating thumbnails. After generation, write WebP blobs (quality 75, ~3-5KB per 160x90 thumb) to cache.

**`src/App.ts`** — Instantiate `MediaCacheManager`, pass to `MediaManager` and `AppPersistenceManager`.

### Error Handling

| Scenario | Behavior |
|----------|----------|
| OPFS unavailable (private browsing, old browser) | `initialize()` returns false; all methods no-op silently |
| Quota exceeded during write | Trigger `evictLRU()` first; if still insufficient, emit `error` event, skip caching |
| Partial write (tab crash mid-write) | `cleanOrphans()` on startup: scan OPFS for files not in IndexedDB manifest, delete them |
| Session saved before write completes | `isStable()` returns false → serializer omits cacheKey, uses `requiresReload: true` |
| Multi-tab concurrent writes | Use `navigator.locks.request('opfs-cache-write', ...)` for serialization; fall back to optimistic writes if Web Locks unavailable |
| Cache hit but file changed on disk | Compare `file.lastModified` against `cachedAt` in manifest; if newer, treat as miss |

### Testing Strategy

- Mock OPFS APIs (`FileSystemDirectoryHandle`, etc.) with in-memory Map-based implementation
- Follow existing patterns: `AutoSaveManager.test.ts` uses `fake-indexeddb`
- Key test cases: roundtrip store/retrieve, LRU eviction under pressure, orphan cleanup, cache key collision resistance, graceful OPFS-unavailable fallback, SessionSerializer integration with cache keys

---

## Feature 2: GLSL Playlist Transitions

### Scope (v1)

- 6 built-in transitions: crossfade, dissolve, wipe-left, wipe-right, wipe-up, wipe-down
- Per-gap transition config (between adjacent clips)
- Blending in **linear light space** (before tone mapping) for color-correct HDR support
- Canvas2D fallback: crossfade via `globalAlpha`, wipes via `ctx.clip()`; dissolve falls back to crossfade
- No transitions at loop wrap points (loopMode='all')
- No same-source transitions in v1 (hard cut fallback)

### Data Model

Transitions are properties of **clip gaps** (not clips), stored in a separate array indexed by gap position:

```typescript
// src/core/types/transition.ts
export type TransitionType = 'cut' | 'crossfade' | 'dissolve' | 'wipe-left' | 'wipe-right' | 'wipe-up' | 'wipe-down';

export interface TransitionConfig {
  type: TransitionType;
  durationFrames: number;  // must be <= min(outgoing.duration, incoming.duration)
}

// transitions[i] = transition between clips[i] and clips[i+1]
// null or { type: 'cut' } = hard cut (no transition)
```

### Overlap Model

Transitions overlap the outgoing clip's last N frames with the incoming clip's first N frames. The global timeline **shortens** by the sum of all transition durations:

```
Without transitions:  [ClipA: 50f][ClipB: 40f]  = 90 frames total
With 12f crossfade:   [ClipA: 50f]              = 78 frames total
                             [ClipB: 40f]
                         ↑ 12 frame overlap ↑
```

`recalculateGlobalFrames()` subtracts overlap. `getTotalDuration()` = sum(durations) - sum(transition durations).

### New Files

| File | Purpose |
|------|---------|
| `src/core/types/transition.ts` | `TransitionType`, `TransitionConfig`, `TransitionFrameInfo`, shader code mapping |
| `src/core/types/transition.test.ts` | Type/constant tests |
| `src/core/session/TransitionManager.ts` | Gap-indexed transition storage, validation, `getTransitionAtFrame()` |
| `src/core/session/TransitionManager.test.ts` | Unit tests |
| `src/render/shaders/transition.frag.glsl` | Transition blend shader with display pipeline |
| `src/render/TransitionRenderer.ts` | Dual-FBO orchestration, shader management |
| `src/render/TransitionRenderer.test.ts` | Unit tests |

### Rendering Architecture: Dual-FBO Linear-Light Blending

The transition renders in 3 logical steps to ensure color-correct blending:

```
Step 1: Render outgoing frame → FBO A (RGBA16F, linear light)
        Uses existing viewer.frag.glsl with u_outputMode=HDR (skip SDR clamp)

Step 2: Render incoming frame → FBO B (RGBA16F, linear light)
        Same shader, different source texture

Step 3: Transition shader samples both FBOs, blends in linear space,
        then applies tone mapping + display OETF → screen
```

This ensures blending happens in scene-referred linear space regardless of whether sources are SDR, HLG, or PQ. The existing `hdrFBO` pattern in `Renderer.ts` (lines 108-114) is reused for FBO management.

### TransitionRenderer Class

```typescript
// src/render/TransitionRenderer.ts
export class TransitionRenderer {
  private fboA: WebGLFramebuffer | null = null;  // outgoing
  private fboB: WebGLFramebuffer | null = null;  // incoming
  private texA: WebGLTexture | null = null;
  private texB: WebGLTexture | null = null;
  private transitionShader: ShaderProgram | null = null;

  initialize(gl: WebGL2RenderingContext): void;

  renderTransitionFrame(
    renderer: RendererBackend,
    outgoingImage: IPImage,
    incomingImage: IPImage,
    config: TransitionConfig,
    progress: number,   // 0.0 = fully outgoing, 1.0 = fully incoming
    offsetX: number, offsetY: number,
    scaleX: number, scaleY: number,
  ): void;

  dispose(): void;
}
```

### Fragment Shader: `transition.frag.glsl`

```glsl
uniform sampler2D u_textureA;      // outgoing (linear light, graded)
uniform sampler2D u_textureB;      // incoming (linear light, graded)
uniform float u_progress;          // 0.0-1.0
uniform int u_transitionType;      // 0=crossfade, 1=dissolve, 2-5=wipes

// Display pipeline uniforms (shared with viewer.frag.glsl)
uniform int u_toneMappingOperator;
uniform int u_outputMode;
// ...

void main() {
  vec4 a = texture(u_textureA, v_texCoord);
  vec4 b = texture(u_textureB, v_texCoord);

  vec4 blended;
  if (u_transitionType == 0) { blended = mix(a, b, u_progress); }           // crossfade
  else if (u_transitionType == 1) {                                          // dissolve
    float noise = fract(sin(dot(v_texCoord, vec2(12.9898, 78.233))) * 43758.5453);
    blended = noise < u_progress ? b : a;
  }
  else if (u_transitionType == 2) { blended = v_texCoord.x < u_progress ? b : a; }  // wipe-left
  else if (u_transitionType == 3) { blended = v_texCoord.x > (1.0 - u_progress) ? b : a; }
  else if (u_transitionType == 4) { blended = (1.0 - v_texCoord.y) < u_progress ? b : a; }
  else if (u_transitionType == 5) { blended = v_texCoord.y < u_progress ? b : a; }
  else { blended = mix(a, b, u_progress); }

  // Apply tone mapping + display pipeline to blended linear result
  blended.rgb = applyToneMapping(blended.rgb);
  blended.rgb = applyDisplayTransfer(blended.rgb);
  fragColor = blended;
}
```

Tone mapping and display OETF functions are extracted from `viewer.frag.glsl` into shared GLSL includes to avoid duplication.

### Files to Modify

**`src/core/session/PlaylistManager.ts`**:
- Update `recalculateGlobalFrames()` to subtract transition overlaps
- Update `getTotalDuration()` = sum(durations) - sum(transition durations)
- Add `setTransitionManager(tm)` integration
- Update `getState()` / `setState()` to include `transitions` array in `PlaylistState`

**`src/core/session/SessionState.ts`** — Add optional `transitions?: (TransitionConfig | null)[]` to `PlaylistState`.

**`src/ui/components/Viewer.ts`** — In `renderImage()` (line 1238): check `transitionManager.getTransitionAtFrame()`. If in transition, fetch frames from both sources via `session.getSourceByIndex()`, call `TransitionRenderer.renderTransitionFrame()`.

**`src/AppPlaybackWiring.ts`** — Modify `handlePlaylistBoundaryWrap()`: during transition regions, do NOT trigger source switch. The session stays on the incoming clip's source; the outgoing source is accessed directly for frame data.

**`src/ui/components/Timeline.ts`** — In `draw()`: render orange gradient overlays for transition regions.

**`src/ui/components/PlaylistPanel.ts`** — Add transition type dropdown + duration input between clip rows. Hide when `clips.length < 2`. Validate duration <= min(adjacent clip durations).

**`src/export/EDLWriter.ts`** — Support `D` (dissolve) transition type with duration instead of `C` (cut) in CMX3600 output.

### Validation Rules

1. `transitionDuration <= min(outgoingClip.duration, incomingClip.duration)`
2. For a clip with both in-transition and out-transition: `inDuration + outDuration <= clip.duration`
3. Same-source clips (v1): force hard cut, disable transition UI
4. First clip: no in-transition possible (no outgoing source)
5. Duration input: `min=1, max=120, step=1`, integer-only, frames with seconds display `12f (0.5s)`

### Canvas2D Fallback

| Transition | WebGL | Canvas2D |
|-----------|-------|----------|
| crossfade | GLSL blend | `globalAlpha` |
| dissolve | noise threshold | Falls back to crossfade |
| wipe-* | coord threshold | `ctx.clip()` with rect path |

---

## Implementation Sequence

### Phase 1: OPFS Caching Foundation
1. Create `src/cache/MediaCacheKey.ts` + tests
2. Create `src/cache/MediaCacheManager.ts` + tests (IndexedDB manifest + OPFS blobs)
3. Integrate with `MediaManager.ts` (background cache writes after image load)
4. Integrate with `SessionSerializer.ts` (cache-aware restore with fallback)
5. Add `opfsCacheKey` to `SessionState.ts` MediaReference
6. Wire in `App.ts`

### Phase 2: Transitions Data Layer (can parallel Phase 1)
1. Create `src/core/types/transition.ts` (types, constants, shader codes)
2. Create `src/core/session/TransitionManager.ts` + tests
3. Modify `PlaylistManager.ts` (overlap-aware frame calculation)
4. Extend `PlaylistState` in `SessionState.ts`
5. Update `SessionSerializer.ts` (transition persistence)

### Phase 3: Transitions Rendering (depends on Phase 2)
1. Create `src/render/shaders/transition.frag.glsl`
2. Extract shared GLSL functions from `viewer.frag.glsl` (tone mapping, display OETF)
3. Create `src/render/TransitionRenderer.ts` (dual-FBO orchestration)
4. Integrate with `Viewer.ts` (transition detection + dual-source rendering)
5. Canvas2D fallback implementation

### Phase 4: Transitions UI + Polish (depends on Phase 2-3)
1. Update `PlaylistPanel.ts` (transition dropdown + duration input)
2. Update `Timeline.ts` (transition region visualization)
3. Update `AppPlaybackWiring.ts` (transition-aware boundary handling)
4. Update `EDLWriter.ts` (dissolve support)
5. Export pipeline transition awareness

### Phase 5: Thumbnail Caching (depends on Phase 1)
1. Extend `ThumbnailManager.ts` with OPFS cache check
2. Write WebP blobs to cache after generation
3. Add `CacheManagementPanel.ts` to settings

---

## Verification

### OPFS Caching
- `npx vitest run src/cache/` — unit tests for cache key + manager
- `npx vitest run src/core/session/SessionSerializer` — verify cache key roundtrip
- Manual: load an EXR, close tab, reopen session — file should load from OPFS without file picker
- Manual: load same-name files from different directories — verify no collision

### Transitions
- `npx vitest run src/core/session/TransitionManager` — unit tests for frame mapping, overlap math, validation
- `npx vitest run src/core/session/PlaylistManager` — verify `getTotalDuration()` with overlaps
- `npx tsc --noEmit` — type check all new interfaces
- Manual: create 3-clip playlist with crossfade transitions, play through — verify smooth blending
- Manual: scrub frame-by-frame through transition — verify correct progress at each frame
- Manual: export video with transitions — verify transitions in exported MP4
- Manual: save/load .orvproject with transitions — verify persistence

### Full Suite
- `npx vitest run` — all 7600+ existing tests still pass
- `npx tsc --noEmit` — no type errors
