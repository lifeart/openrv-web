# OpenRV Web — Complete Codebase Review & Architecture Improvement Proposals

## Project Overview

- **1,004 TypeScript files**, ~467K LOC, vanilla TS (no UI framework)
- **5 production dependencies**, **13 dev dependencies**
- **616 test files**, **~19,669 tests** (Vitest + Playwright E2E)
- WebGL2-based VFX image/video viewer with HDR, OCIO, and professional color pipeline

---

## Architecture Summary

```
src/
├── core/        (98 files)  — Session, graph, image container, preferences
├── nodes/       (70 files)  — DAG processing: sources → effects → groups
├── render/      (49 files)  — WebGL2/WebGPU backends, 11-stage shader pipeline
├── formats/     (45 files)  — 13 format decoders (EXR, DPX, Cineon, HDR, gainmaps...)
├── color/       (83 files)  — OCIO, CDL, LUTs, tone mapping, display capabilities
├── ui/          (280 files) — 100+ vanilla DOM components, layout system
├── services/    (34 files)  — Render loop, playback, audio, URL state
├── utils/       (85 files)  — EventEmitter, history, input, effects
├── api/         (13 files)  — Public scripting API (window.openrv)
├── plugin/      (9 files)   — Plugin registry with manifest-driven lifecycle
├── workers/     (5 files)   — OffscreenCanvas render worker, effect processor
└── (+ cache, paint, audio, stereo, export, network, integrations...)
```

**Key Design Patterns**: Observer (Signal/EventEmitter), Strategy (NodeProcessor), Factory (@RegisterNode), Facade (Session), Command (HistoryManager), Adapter (RendererBackend), Template Method (EffectNode)

---

## Strengths

| Area | Details |
|------|---------|
| **Modularity** | Clean separation: render, color, nodes, formats, UI, API |
| **Testing** | 616 test files, ~19.7K tests, strict TS, comprehensive mocks |
| **Minimal deps** | Only 5 production packages |
| **Performance** | Workers, OffscreenCanvas, memory budget manager, LRU caches, lazy decoder loading |
| **Extensibility** | Plugin system, node factory, decoder registry, effect registry |
| **Type safety** | Full strict mode, `noUncheckedIndexedAccess`, only 136 `any` usages (justified) |
| **HDR pipeline** | Multi-tier HDR support with graceful degradation |
| **API surface** | Clean public/internal boundary via `src/api/` |

---

## Proposed Improvements

### 1. Dependency Updates (Priority: High)

| Package | Current | Latest | Risk |
|---------|---------|--------|------|
| vitest + coverage-v8 | ^1.2.0 | 4.0.18 | **2 major versions behind** |
| mediabunny | ^1.28.0 | 1.38.1 | Missing codec fixes |
| jsdom | ^24.0.0 | 28.1.0 | Missing DOM APIs |
| vite | ^6.0.7 | 7.3.1 | Build improvements |

**Recommendation**: Upgrade vitest first (highest impact on DX), then mediabunny.

**Detailed plan**: [dependency_updates_1.md](./dependency_updates_1.md)

---

### 2. Split Large Files (Priority: Medium)

| File | Lines | Suggestion |
|------|-------|------------|
| `Viewer.ts` | 4,811 | Extract input handling, overlay management, resize logic |
| `Session.ts` | 1,382 | Already has sub-managers; consider extracting more into SessionGraph/SessionMedia |
| `PlaybackEngine.ts` | 1,152 | Extract timing logic, loop handling |
| `ShaderStateManager.ts` | 2,185 | Split by concern (color state, effect state, HDR state) |

**Detailed plan**: [split_large_files_2.md](./split_large_files_2.md)

---

### 3. Reduce Property Boilerplate in Effect Nodes (Priority: Medium)

115+ instances of repetitive getter/setter pairs across effect nodes:

```typescript
// Current (repeated 48+ times):
get exposure(): number { return this.properties.getValue('exposure') as number; }
set exposure(v: number) { this.properties.setValue('exposure', v); }
```

**Proposal**: A decorator or helper to auto-generate typed accessors:

```typescript
// Option A: Factory function
defineProperty(this, 'exposure', { type: 'number', min: -6, max: 6, default: 0 });

// Option B: Decorator (already using experimentalDecorators)
@property({ min: -6, max: 6, default: 0 })
declare exposure: number;
```

This would eliminate ~122 lines of boilerplate across 20 node files in `src/nodes/`.

**Detailed plan**: [property_boilerplate_3.md](./property_boilerplate_3.md)

---

### 4. Strengthen Decoder Options Typing (Priority: Low-Medium)

Currently `Record<string, unknown>` — no IDE autocomplete or compile-time safety.

```typescript
// Current:
decode(buffer: ArrayBuffer, options?: Record<string, unknown>): Promise<DecodeResult>;

// Proposed: Generic per-decoder options
interface EXRDecodeOptions { layer?: string; mipLevel?: number; }
decode(buffer: ArrayBuffer, options?: EXRDecodeOptions): Promise<DecodeResult>;
```

**Detailed plan**: [decoder_typing_4.md](./decoder_typing_4.md)

---

### 5. Add Integration Tests for Under-Tested Core Files (Priority: Medium)

| File | Lines | Current Coverage |
|------|-------|-----------------|
| `ColorSerializer.ts` | 1,048 | No dedicated test file (18 builder methods) |
| `PlaybackEngine.ts` | 1,152 | ~10 direct tests only |
| `ViewerEffects.ts` | 606 | 82 tests, 3 functions untested |
| `AnnotationStore.ts` | 586 | No dedicated test file |

**Detailed plan**: [integration_tests_5.md](./integration_tests_5.md)

---

### 6. Introduce Event Bus for App Wiring (Priority: Low-Medium)

Currently 7+ `AppXxxWiring.ts` modules manually connect signals between Session, Viewer, and controls (144 EventEmitter subclasses total). The current pattern is fundamentally sound; improvements should focus on:

- Extracting cross-cutting side-effect patterns (`withSideEffects` helper)
- Adding debugging/tracing infrastructure (`WiringEventLog`)
- Standardizing return types (`WiringResult`)
- Enabling plugin event subscriptions (Phase 2)

**Detailed plan**: [event_bus_6.md](./event_bus_6.md)

---

### 7. Add Linting & Pre-Commit Hooks (Priority: Low)

No ESLint config or pre-commit hooks found. With 467K LOC, automated linting would catch:
- Consistent import ordering
- Unused imports (beyond what `noUnusedLocals` catches)
- Style consistency enforcement

**Detailed plan**: [linting_hooks_7.md](./linting_hooks_7.md)

---

### 8. WebGPU Backend Readiness (Priority: Low — Future)

`createRenderer.ts` already has WebGPU selection logic, but `WebGPUBackend.ts` has TODOs for HDR rendering. The `RendererBackend` interface is well-designed for this — just needs implementation work.

**Detailed plan**: [webgpu_backend_8.md](./webgpu_backend_8.md)

---

### 9. Plugin System Phase 2 (Priority: Low — Future)

Current plugin system supports: decoders, nodes, tools, exporters, blend modes, UI panels. Missing:
- Plugin event subscriptions (`onEvent()`)
- Plugin settings/preferences
- Plugin marketplace/discovery
- Hot-reload for development

**Detailed plan**: [plugin_phase2_9.md](./plugin_phase2_9.md)

---

## Summary Scorecard

| Dimension | Score | Notes |
|-----------|-------|-------|
| **Code Quality** | 9/10 | Strict TS, minimal `any`, consistent naming |
| **Test Coverage** | 9/10 | 19.7K tests across 616 files, few gaps in core engine files |
| **Architecture** | 8.5/10 | Clean separation, some large files to split |
| **Performance** | 9/10 | Workers, caching, lazy loading, memory management |
| **Extensibility** | 8/10 | Plugin system Phase 1 solid, Phase 2 pending |
| **Dependencies** | 6.5/10 | vitest 2 major versions behind |
| **DX/Tooling** | 7/10 | No linter, no pre-commit hooks |

**Overall**: A well-engineered, professional-grade codebase. The highest-impact improvements are dependency updates, splitting large files, and reducing effect node boilerplate.
