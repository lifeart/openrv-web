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

### 1. Dependency Updates (Priority: High) — ✅ COMPLETE

All packages updated to target versions:
- vitest + coverage-v8: ^4.0.18
- mediabunny: ^1.38.1
- jsdom: ^28.1.0
- vite: ^7.3.1

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

### 3. Reduce Property Boilerplate in Effect Nodes (Priority: Medium) — ✅ COMPLETE

Implemented via `src/nodes/base/defineNodeProperty.ts` factory function for typed property accessors.

---

### 4. Strengthen Decoder Options Typing (Priority: Low-Medium) — ⚠️ PARTIAL

Typed options added for EXR, DPX, JP2, and Cineon decoders. Generic `Record<string, unknown>` fallback remains in DecoderRegistry for unmapped decoders.

---

### 5. Add Integration Tests for Under-Tested Core Files (Priority: Medium) — ⚠️ MOSTLY DONE

| File | Status |
|------|--------|
| `ColorSerializer.ts` | ✅ Test file added |
| `PlaybackEngine.ts` | ✅ Test file added |
| `AnnotationStore.ts` | ✅ Test file added |
| `ViewerEffects.ts` | ❌ Still missing dedicated tests |

---

### 6. Introduce Event Bus for App Wiring (Priority: Low-Medium) — ✅ COMPLETE

Implemented:
- `src/utils/WiringEventLog.ts` — bounded ring buffer for debug tracing
- `src/utils/WiringHelpers.ts` — `withSideEffects` helper, `WiringSideEffects` interface
- `StatefulWiringResult` pattern used throughout wiring modules
- Plugin event subscriptions delivered via Plugin Phase 2 P0

---

### 7. Add Linting & Pre-Commit Hooks (Priority: Low) — ✅ COMPLETE

Implemented:
- `eslint.config.mjs` with typescript-eslint + import-x plugin
- `simple-git-hooks` for pre-commit hooks
- `lint-staged` running `eslint --fix --max-warnings=0` and `prettier --write` on `.ts` files

---

### 8. WebGPU Backend Readiness (Priority: Low — Future) — ⚠️ MOSTLY DONE

`WebGPUBackend.ts` is substantially implemented with only 1 TODO remaining.

---

### 9. Plugin System Phase 2 (Priority: Low — Future) — ⚠️ MOSTLY DONE

- ✅ P0: Plugin event subscriptions (`PluginEventBus.ts`)
- ✅ P1: Plugin settings/preferences (`PluginSettingsStore.ts`)
- ✅ P2: Hot-reload for development (`dev/HotReloadManager.ts`)
- ❌ P3: Plugin marketplace/discovery — not started

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
| **Dependencies** | 9/10 | All major deps updated |
| **DX/Tooling** | 9/10 | ESLint, Prettier, pre-commit hooks, lint-staged |

**Overall**: A well-engineered, professional-grade codebase. Remaining improvements: split large files (proposal #2), ViewerEffects tests (#5), plugin marketplace (#9 P3), and GPU pixel accuracy tests.
