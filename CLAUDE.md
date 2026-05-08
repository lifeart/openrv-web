# Project Conventions Quick Reference

Full conventions live in [docs/CONVENTIONS.md](docs/CONVENTIONS.md). UI patterns live in [UI.md](UI.md). Architecture map in [CODEMAP.md](CODEMAP.md).

## Hard rules (non-negotiable)

- **No `console.error` / `console.warn`** outside `src/utils/Logger.ts`. Use a module-scoped `Logger` instance. Enforced by `no-console: ['error', { allow: ['log'] }]`.
- **No empty `catch` blocks**. Use `probe(name, fn)` from `src/utils/probe.ts` for intentional feature-detection swallows, or `logger.warn(...)` with rationale. Enforced by `no-empty: { allowEmptyCatch: false }`.
- **No new `as any` / `@ts-ignore` / `@ts-expect-error`**. Fix the type or define a typed boundary.
- **No literal `z-index` or panel-width pixels** in feature code — use `Z_INDEX` / `PANEL_WIDTHS` tokens from `src/ui/components/shared/theme.ts`.
- **No native `confirm()` / `alert()` / `prompt()`** — use `showConfirm` / `showAlert` / `showPrompt` from `shared/Modal.ts`.

## Shared surfaces

- Logging: `src/utils/Logger.ts` (`new Logger('ModuleName')`).
- Feature probes: `src/utils/probe.ts` (`probe`, `probeAsync`).
- Viewer read API for persistence: `src/core/viewer/ViewerAccessor.ts`.
- Node property factory: `src/nodes/base/defineNodeProperty.ts`.
- Module suffixes: `Manager` (state) / `Service` (stateless) / `Orchestrator` (glue) / `Engine` (compute) / `Bridge` (compat) / `Controller` (view↔state).

## Type Boundaries

The remaining `Record<string, unknown>` usages (~389) are intentionally dynamic and should not be tightened without justification. They cluster around: free-form `metadata` fields on decoder/OTIO/playlist/marker payloads where the shape is per-source/per-format, plugin settings (whose shape is plugin-defined), JSON-passthrough envelopes (e.g. `Property.toJSON` / `fromJSON`, `LayoutData` validators), narrowing intermediates inside type guards (`obj as Record<string, unknown>` to safely access untrusted-input fields), debug/global handles (`globalThis.PerfTrace`, `window.__openrvDev`), and the `EffectParams` alias used by `ImageEffect` adapters (intentionally polymorphic per-effect param bag). Tightening these requires either declaring a closed shape (which the underlying data does not have) or introducing per-decoder/per-plugin generics — both of which trade simplicity for marginal type safety. Replace only when a concrete typed boundary clearly exists.
