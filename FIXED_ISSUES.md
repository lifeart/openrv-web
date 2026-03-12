# Fixed Issues

## Issue #1: Histogram shortcut is broken while the UI still advertises it
## Issue #2: Gamut diagram shortcut is broken while the UI still advertises it
## Issue #3: Scope shortcut hints are stale for waveform as well

**Root cause**: `KeyH`, `KeyW`, and `KeyG` were assigned to both view actions (fit-to-height, fit-to-width, goto-frame) and scope toggles (histogram, waveform, gamut diagram). To avoid conflicts, the scope bindings were placed in a `panel` context that never activates in production, making them permanently dead. The UI still advertised the old single-key shortcuts.

**Fix**: Assigned unique, non-conflicting `Ctrl+Shift` shortcuts:
- Histogram: `Ctrl+Shift+H` (was `H` in dead `panel` context)
- Waveform: `Ctrl+Shift+W` (was `W` in dead `panel` context)
- Gamut diagram: `Ctrl+Shift+G` (was `G` in dead `panel` context)

Removed dead contextual registrations from `App.ts`, updated UI hints in `ScopesControl.ts`, and updated documentation.

**Tests added**: 10 new regression tests in `AppKeyboardHandler.test.ts` covering binding definitions, conflict-free verification, direct registration, label generation, and UI hint accuracy.

**Files changed**:
- `src/utils/input/KeyBindings.ts`
- `src/AppKeyboardHandler.ts`
- `src/AppKeyboardHandler.test.ts`
- `src/App.ts`
- `src/ui/components/ScopesControl.ts`
- `features/keyboard-shortcuts.md`

## Issue #10: The context system has production-dead branches that tests and bindings still rely on

**Root cause**: The `BindingContext` type included dead contexts (`timeline`, `channel`, `annotate`) that no production tab switching ever activated. Bindings referencing these contexts could never fire, and tests used them freely, diverging from real app behavior.

**Fix**:
- Removed `timeline`, `channel`, and `annotate` from the `BindingContext` type union
- Removed dead `context: 'timeline'` from `timeline.setOutPoint` and `timeline.resetInOut` (they should work globally)
- Changed `context: 'annotate'` to `context: 'paint'` on `notes.addNote` (Annotate tab maps to `paint` in production)
- Updated all tests to use only production-valid contexts
- Added documentation mapping production tabs to contexts

**Tests added**: 5 regression tests (`KB-U090` through `KB-U094`) verifying no binding references a dead context and specific bindings have correct context restrictions.

**Files changed**:
- `src/utils/input/KeyBindings.ts`
- `src/utils/input/ActiveContextManager.ts`
- `src/utils/input/ContextualKeyboardManager.ts`
- `src/utils/input/ActiveContextManager.test.ts`
- `src/utils/input/ContextualKeyboardManager.test.ts`
- `src/__e2e__/ActiveContextManager.e2e.test.ts`
- `src/KeyboardWiring.test.ts`

## Issue #17: DCC media loading derives the display name with POSIX-only path splitting
## Issue #21: POSIX-only basename extraction also exists in the core source nodes

**Root cause**: Path basename extraction used `.split('/').pop()` which doesn't handle Windows paths, URLs with query strings/fragments, or trailing separators.

**Fix**: Enhanced the shared `basename()` utility in `src/utils/path.ts` to strip URL query/fragment, handle both POSIX and Windows separators, and skip trailing separators. Replaced remaining inline split patterns in `Session.ts` and `GTOGraphLoader.ts` with the shared utility.

**Tests added**: 8 new tests in `src/utils/path.test.ts` covering Windows paths, URLs with query strings/fragments, trailing slashes, edge cases.

**Files changed**:
- `src/utils/path.ts`
- `src/utils/path.test.ts`
- `src/core/session/Session.ts`
- `src/core/session/GTOGraphLoader.ts`
