# Repository Conventions

These conventions are enforced by ESLint where possible. Violations should fail review even when lint passes.

## Module Suffix Doctrine

Used to make file purposes legible at a glance. New modules must follow these conventions; existing modules will migrate over time.

- **Manager** — Owns lifecycle and state for a single domain. Has a clear "create / dispose" contract. Examples: `AudioPlaybackManager`, `MediaCacheManager`, `AutoSaveManager`.
- **Service** — Stateless operation set; pure or near-pure functions wrapped in a class for ergonomic injection. Holds no domain state. Examples: `SessionURLService`.
- **Orchestrator** — Cross-system glue: composes Managers/Services to deliver a workflow. Owns no domain state itself. Examples: `AudioOrchestrator`, `LayoutOrchestrator`.
- **Engine** — Compute-heavy core (timing loops, processing pipelines). May spawn workers. Examples: `PlaybackEngine`.
- **Bridge** — Compatibility shim across a module boundary (e.g., legacy API surface or external integration). Examples: `MuSettingsBridge`, `ShotGridIntegrationBridge`.
- **Controller** — Mediates between view and state. Examples: `FrameCacheController`.

When in doubt, prefer `Manager` if the module owns state, `Service` if it does not.

## Decoder File Naming

Format decoders live in `src/formats/` and follow the pattern `<Format>Decoder.ts` (e.g. `AVIFDecoder.ts`, `MultiViewEXRDecoder.ts`, `EXRDecoder.ts`). Tests sit beside the decoder as `<Format>Decoder.test.ts`. The registry lives at `src/formats/index.ts`.

## Logging

All logging goes through `Logger` (`src/utils/Logger.ts`). Raw `console.error` and `console.warn` are banned outside `Logger.ts` itself — ESLint enforces this via `no-console: ['error', { allow: ['log'] }]`.

- Each module declares a module-scoped logger near the top:
  ```typescript
  import { Logger } from './utils/Logger';
  const logger = new Logger('ModuleName'); // PascalCase, basename of file
  ```
- Use `logger.error(msg, ctx)` for unrecoverable errors that the user must know about.
- Use `logger.warn(msg, ctx)` for recoverable failures or expected edge cases.
- Use `logger.debug(msg, ctx)` for informational audit trails (e.g. probe failures).
- `console.log` remains permitted as a transient debug escape hatch but should not ship.

## Empty Catch Blocks Are Banned

ESLint rule `no-empty: { allowEmptyCatch: false }` is at error level. Every `catch` must do one of:

1. **Use `probe(name, fn)` / `probeAsync(name, fn)`** from `src/utils/probe.ts` — the canonical way to express "I am intentionally swallowing this error because the failure path is expected (feature detection, idempotent cleanup, optional API probe)." The probe helpers log at debug level so the swallow is auditable.
2. **Log explicitly** via `logger.warn(...)` / `logger.error(...)` and either continue or re-throw. Add a one-line comment above the catch when the rationale isn't obvious.
3. **Surface to the user** via toast / status bar / error event. User-initiated actions that fail must surface — never silently skip.

Do not use `eslint-disable` to suppress `no-empty`. Do not collect errors into a variable and discard.

## Type Safety

- No new `as any` / `@ts-ignore` / `@ts-expect-error`. Fix the type or define a typed boundary; do not suppress.
- Public API parameters and return types must be real types, not `Record<string, unknown>`. The remaining ~389 `Record<string, unknown>` usages cluster around free-form `metadata` payloads, plugin settings, JSON-passthrough envelopes (`Property.toJSON` / `fromJSON`), narrowing intermediates inside type guards, debug/global handles, and the `EffectParams` alias used by `ImageEffect` adapters — all intentionally polymorphic. Replace only when a concrete typed boundary clearly exists.

## Shared UI Helpers

Avoid forking shared UI utilities. The canonical surfaces:

- `src/ui/components/shared/Button.ts` — `createButton`, `createIconButton`, `setButtonActive`, `applyA11yFocus`.
- `src/ui/components/shared/Modal.ts` — `showAlert`, `showConfirm`, `showPrompt`, `showModal` (with `ModalHandle.update()` for live progress).
- `src/ui/components/shared/Panel.ts` — `createPanel`, `createPanelHeader`.
- `src/ui/components/shared/FormElements.ts` — `createSeparator`, `createSectionHeader`, `createCheckboxRow`, `createSliderRow`, `createSliderControl`, `createColorSliderRow`, `createCheckableMenuItem`, `setMenuItemChecked`.
- `src/ui/components/shared/DropdownMenu.ts` — `createDropdownMenu`.
- `src/ui/components/shared/DraggableContainer.ts` — `createDraggableContainer`.
- `src/ui/components/shared/theme.ts` — `Z_INDEX`, `PANEL_WIDTHS`, color/spacing/typography tokens.

Native `confirm()`, `alert()`, `prompt()` are banned in product code — use `showConfirm`/`showAlert`/`showPrompt`. Literal `z-index` numerics and panel-width pixel values are banned in feature code — use `Z_INDEX.<tier>` and `PANEL_WIDTHS.<tier>`. If a needed tier is missing, add it once to `theme.ts` rather than forking with a literal.

## Node Properties

Source / effect / group nodes declare properties via the `defineNodeProperty` factory (`src/nodes/base/defineNodeProperty.ts`), not by hand-rolling `Property` instances. The factory enforces consistent metadata, serialization, and event wiring.

## Viewer Access from Persistence

Persistence and serialization helpers consume the viewer via the narrow `ViewerAccessor` interface (`src/core/viewer/ViewerAccessor.ts`), not the concrete `Viewer` class. This keeps the public read API intentional and prevents persistence from reaching into private state.
