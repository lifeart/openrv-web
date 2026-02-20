# Performance Improvement Roadmap: OpenRV-Web

## Expert Panel Process

Each item was analyzed by 3-5 specialized experts across 2 review rounds:
- **Round 1**: Performance Expert + QA Expert + Domain Expert (per item)
- **Round 2**: Senior Architecture Reviewer + Product Engineering Lead (cross-cutting)

Total: 12 expert analyses synthesized into this roadmap.

---

## Priority Ranking

| Rank | Item | Score | User Impact | Frequency | Risk | Effort | Plan File |
|------|------|-------|-------------|-----------|------|--------|-----------|
| 1 | Timeline Repaint Thrashing | 20 | High | Every frame | Low | M | `TIMELINE_REPAINT_PLAN.md` |
| 2 | GC Pressure in Render Paths | 15 | High | Every frame | Low-Med | M | `GC_PRESSURE_IMPLEMENTATION_PLAN.md` |
| 3 | Viewer Compositing Overhead | 15 | Medium | Every frame | Low | M | `VIEWER_COMPOSITING_PLAN.md` |
| 4 | Shader Compilation Blocking | 10 | High | Startup | Medium | L | `SHADER_COMPILATION_PLAN.md` |
| 5 | Scope FBO Format | 8 | Medium | Scopes open | Med-High | M | `SCOPE_FBO_FORMAT_PLAN.md` |
| 6 | Thumbnail Rendering | 6 | Low | Source load | Low | S | `THUMBNAIL_RENDERING_PLAN.md` |
| 7 | Audio Waveform | 4 | Low | Source load | Very Low | S | `AUDIO_WAVEFORM_PLAN.md` |
| 8 | TextureCacheManager LRU | 3 | Minimal | Cache full | Very Low | S | `TEXTURE_CACHE_LRU_PLAN.md` |

---

## Batching Strategy for Parallel Agent Execution

### Phase 0: Test Infrastructure Prep
- Update `test/mocks.ts`: Add `COMPLETION_STATUS_KHR`, FBO/PBO mocks, `uniform1fv`
- Required by Items 3, 4, 5

### Batch 1: Quick Wins (3 agents, parallel, ~30 min)
All touch disjoint files — zero conflict risk.

| Agent | Task | Files |
|-------|------|-------|
| A | Item 8: TextureCacheManager O(1) LRU | `TextureCacheManager.ts` |
| B | Item 6 partial: Eliminate double-draw | `ThumbnailManager.ts` |
| C | Item 1 partial: Cache CSS colors | `Timeline.ts` |

### Batch 2: Core Timeline + Audio (sequential on Timeline.ts, ~90 min)

| Agent | Task | Files |
|-------|------|-------|
| D | Item 1: rAF coalescing + shadow removal | `Timeline.ts`, `ThumbnailManager.ts` |
| E | Item 7: Audio waveform File passthrough | `WaveformRenderer.ts`, `Timeline.ts` (minor) |

**D runs before E** (both touch Timeline.ts).

### Batch 3: Render Pipeline (2 agents, parallel, ~120 min)
Items touch different sections of different files.

| Agent | Task | Files |
|-------|------|-------|
| F | Item 2: Viewer compositing dirty flags | `Viewer.ts`, `CanvasOverlay.ts`, `OverlayManager.ts` |
| G | Item 5: GC pressure buffer pooling | `Renderer.ts`, `ShaderStateManager.ts`, `ShaderProgram.ts` |

**Human review checkpoint** after Item 5.

### Batch 4: Shader Compilation (3 agents, parallel, ~90 min each)
All touch different module files.

| Agent | Task | Files |
|-------|------|-------|
| H | Item 4a: WebGLScopes → ShaderProgram | `WebGLScopes.ts` |
| I | Item 4b: Sharpen + NoiseReduction | `WebGLSharpen.ts`, `WebGLNoiseReduction.ts` |
| J | Item 4c: WebGLLUT + GPULUTChain | `WebGLLUT.ts`, `GPULUTChain.ts` |

Then sequentially:
| K | Item 4d: Deferred scopes creation | `WebGLScopes.ts`, `sourceLoadedHandlers.ts` |

**Human review checkpoint** after Batch 4.

### Batch 5: Scope FBO (1 agent, after Batch 3, ~60 min)

| Agent | Task | Files |
|-------|------|-------|
| L | Item 3: Scope FBO RGBA8 for SDR | `Renderer.ts` (lines 1147-1394) |

**Human review required** — precision-sensitive.

### Batch 6: Thumbnail Pooling (1 agent, ~30 min)

| Agent | Task | Files |
|-------|------|-------|
| M | Item 6: Canvas pooling | `ThumbnailManager.ts` |

---

## File Conflict Map

| File | Items | Conflict? |
|------|-------|-----------|
| `Timeline.ts` | 1, 7 | No (different methods) |
| `ThumbnailManager.ts` | 1, 6 | Complementary (shadow vs pooling) |
| `Renderer.ts` | 3, 5 | No (lines 390-845 vs 1147-1394) |
| `Viewer.ts` | 2, 4 | No (lines 513-533/2158 vs 700-721) |
| `ShaderProgram.ts` | 4, 5 | Beneficial (5 first, 4 inherits) |

---

## Total Atomic Tasks: ~75

| Item | Tasks |
|------|-------|
| 1. Timeline Repaint | 5 |
| 2. Viewer Compositing | 6 |
| 3. Scope FBO Format | 10 |
| 4. Shader Compilation | 8 |
| 5. GC Pressure | 18 |
| 6. Thumbnail Rendering | 13 |
| 7. Audio Waveform | 7 |
| 8. TextureCacheManager LRU | 8 |

---

## Risk Summary

| Risk Level | Items |
|------------|-------|
| Very Low | 7 (Audio), 8 (LRU) |
| Low | 1 (Timeline), 6 (Thumbnails) |
| Low-Medium | 2 (Viewer), 5 (GC Pressure) |
| Medium | 4 (Shader Compilation) |
| Medium-High | 3 (Scope FBO) |

---

## Verification Strategy

After each batch:
```bash
npx tsc --noEmit          # TypeScript check
npx vitest run             # Full test suite (16354 tests)
```

After Batches 3-5 (render pipeline changes):
- Manual visual verification on real hardware
- Check Chrome DevTools Performance tab for frame timing
- Verify scope accuracy with known reference images
