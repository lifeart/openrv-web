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
