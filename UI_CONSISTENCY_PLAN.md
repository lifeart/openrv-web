# UI Consistency Plan

> Generated from 2-lap expert review (Domain Expert + UX Expert + UI Expert + QA Engineer).
> Each finding was validated against source code in Lap 2. Status: CONFIRMED unless noted.

---

## Summary

| Priority | Count | Description |
|----------|-------|-------------|
| **P0 Critical** | 3 | Blocks keyboard workflows, freezes main thread |
| **P1 High** | 8 | Visual/UX inconsistency affecting daily use |
| **P2 Medium** | 10 | Polish, accessibility, best practices |
| **P3 Low** | 8 | Code hygiene, minor visual issues |

---

## P0 -- Critical

### P0-1. Escape-to-close missing from 7 hand-built dropdown controls

**Impact:** Users cannot dismiss panels with Escape, breaking keyboard-first workflow.

| Component | File |
|-----------|------|
| ToneMappingControl | `src/ui/components/ToneMappingControl.ts` |
| ZebraControl | `src/ui/components/ZebraControl.ts` |
| StereoControl | `src/ui/components/StereoControl.ts` |
| LuminanceVisualizationControl | `src/ui/components/LuminanceVisualizationControl.ts` |
| ScopesControl | `src/ui/components/ScopesControl.ts` |
| GhostFrameControl | `src/ui/components/GhostFrameControl.ts` |
| CompareControl | `src/ui/components/CompareControl.ts` |

**Fix:** Add a `document.addEventListener('keydown', handler, true)` in each component's open method that listens for `Escape` and calls the close method. Remove listener on close. Alternatively, migrate these to use the shared `DropdownMenu` class which already handles Escape, ArrowUp/Down, Home/End, Enter, Space, and Tab.

**Reference:** `DeinterlaceControl.ts:113-117` and `FilmEmulationControl.ts:105-109` show the correct inline pattern. `shared/DropdownMenu.ts:467-470` shows the shared class approach.

---

### P0-2. App.ts Escape handler closes ALL panels simultaneously

**Impact:** Pressing Escape closes 15+ panels at once instead of the topmost one first.

**File:** `src/App.ts:1301-1367`

**Current behavior:** Early returns exist for cheat sheet (line 1305) and presentation mode (line 1310), but then ALL remaining panels are closed sequentially with no `return` between them.

**Fix:** Implement stack-based or priority-ordered closing. Close only the most-recently-opened panel per Escape press. Options:
1. Add `return` after each panel close check so only the first open one is closed
2. Maintain an open-panel stack and pop from it on Escape
3. Give each panel its own Escape handler (see P0-1) so the global handler only needs to handle panels without their own

---

### P0-3. Three files use blocking `window.alert` / `window.confirm`

**Impact:** Blocks main thread, freezes video playback, cannot be themed.

| File | Line | Call | Replacement |
|------|------|------|-------------|
| `src/ui/components/MarkerListPanel.ts` | 291 | `window.confirm('Clear all markers?...')` | `showConfirm()` |
| `src/ui/components/MarkerListPanel.ts` | 341 | `window.alert('Invalid JSON file...')` | `showAlert()` |
| `src/ui/components/MarkerListPanel.ts` | 356 | `window.alert('Invalid marker file...')` | `showAlert()` |
| `src/ui/components/NotePanel.ts` | 856 | `window.alert('Invalid notes file...')` | `showAlert()` |
| `src/ui/components/NotePanel.ts` | 861 | `window.alert('Invalid JSON file...')` | `showAlert()` |
| `src/AppNetworkBridge.ts` | 765 | `window.confirm('Accept media sync?...')` | `showConfirm()` |

**Fix:** Replace with `showAlert()`/`showConfirm()` from `shared/Modal.ts`. All callers need to become async since Modal returns Promises.

---

## P1 -- High

### P1-1. z-index tier gap: floating panels at 1000 vs dropdowns at 9999

**Impact:** Toolbar dropdowns always render above side panels, but side panels may render behind other content.

**Panels at z-index 1000:**
- `MarkerListPanel.ts:83`, `NotePanel.ts:88`, `SnapshotPanel.ts:61`, `PlaylistPanel.ts:65`, `ShotGridPanel.ts:74`, `HistoryPanel.ts:50`, `ViewerInputHandler.ts:714`

**Dropdowns at z-index 9999:**
- All toolbar dropdown controls (ToneMappingControl, ZebraControl, StereoControl, etc.)

**Non-modal popups incorrectly at z-index 10000 (modal level):**
- `AutoSaveIndicator.ts:240`, `TimelineEditor.ts:1086`, `LUTPipelinePanel.ts:457`, `HeaderBar.ts:641,846,977`

**Fix:** Use `Z_INDEX` constants from `shared/theme.ts` instead of hardcoded values. Establish consistent tiers:
- 50-100: Viewer overlays (waveform, histogram, vectorscope)
- 1000: Side panels (playlist, markers, notes, etc.)
- 9999: Dropdown panels (`Z_INDEX.dropdown`)
- 10000: Modals only (`Z_INDEX.modal`)
- 10001: Tooltips (`Z_INDEX.tooltip`)

Replace all hardcoded z-index values with `Z_INDEX.*` references.

---

### P1-2. Hardcoded `#fff` in shared/Button.ts primary/danger variants

**Impact:** Light theme breakage -- white text on light accent backgrounds.

**File:** `src/ui/components/shared/Button.ts:40-49`

Six instances of `color: '#fff'` across primary base/hover/active and danger base/hover/active states.

**Fix:** Replace `'#fff'` with `COLORS.textBright` (which is `'var(--text-on-accent)'` from `shared/theme.ts:22`).

---

### P1-3. Button active state conflation in DeinterlaceControl and FilmEmulationControl

**Impact:** Users cannot distinguish "feature active" from "settings panel open."

- `DeinterlaceControl.ts:253`: `if (this.params.enabled || this.isPanelOpen)`
- `FilmEmulationControl.ts:359`: `if (this.params.enabled || this.isPanelOpen)`

**Fix:** Show accent color only when feature is enabled. Show a lighter visual (e.g., `var(--bg-hover)`) when panel is open but feature is disabled. Reference `ZebraControl.ts:287-296` which correctly separates these states.

---

### P1-4. Shared Panel utility (`Panel.ts`) missing Escape key and focus management

**Impact:** Any component using `createPanel()` must implement its own Escape handler or rely on the global one.

**File:** `src/ui/components/shared/Panel.ts`

**Missing:**
- No `keydown` listener for Escape
- No `focus()` call on panel open
- No focus restoration on close

**Fix:** Add Escape handling and focus management to `createPanel()`:
```typescript
// In show():
document.addEventListener('keydown', this.boundHandleKeyDown);
panel.focus();

// In hide():
document.removeEventListener('keydown', this.boundHandleKeyDown);
previouslyFocusedElement?.focus();
```

---

### P1-5. HeaderBar duplicates 14 SVG icons already in Icons.ts

**Impact:** Icons can diverge between HeaderBar and the rest of the app.

**File:** `src/ui/components/layout/HeaderBar.ts:414-432` -- private `getIcon()` method with 14 local SVG definitions.

11 of 14 icons already exist in `shared/Icons.ts`. 3 are unique (`step-back`, `step-forward`, `external-link`).

**Fix:**
1. Add the 3 missing icons to `shared/Icons.ts`
2. Remove `getIcon()` method from HeaderBar
3. Replace all `this.getIcon(name)` calls with `getIconSvg(name, 'sm')`

---

### P1-6. `mouseenter`/`mouseleave` used instead of `pointerenter`/`pointerleave`

**Impact:** Hover states may not work correctly on touch+mouse hybrid devices.

- `mouseenter`: ~183 occurrences across 70 files
- `pointerenter`: ~31 occurrences across 7 files

The shared `Button.ts` uses `pointerenter`/`pointerleave` (line 175-187).

**Fix:** Replace `mouseenter`/`mouseleave` with `pointerenter`/`pointerleave` across all UI components. This is a mechanical find-and-replace.

---

### P1-7. ThemeControl dropdown has no keyboard navigation and is not in Escape handler

**Impact:** ThemeControl is completely inaccessible to keyboard-only users.

**File:** `src/ui/components/ThemeControl.ts`

**Missing:** No ArrowUp/Down navigation, no Escape-to-close, no `aria-haspopup`/`aria-expanded`, no `role="menu"`/`role="menuitem"`. Also NOT listed in `App.ts` `panel.close` action (lines 1301-1367).

**Fix:** Migrate to use `shared/DropdownMenu` class, which provides all keyboard navigation and ARIA attributes automatically.

---

### P1-8. Dropdown coordination gap -- hand-built dropdowns invisible to `closeOthers`

**Impact:** Opening a shared DropdownMenu does not close hand-built dropdowns and vice versa.

**Affected hand-built dropdowns:** ThemeControl, ExportControl, ToneMappingControl, ZebraControl, StereoControl, LuminanceVisualizationControl, ScopesControl, GhostFrameControl, CompareControl, SafeAreasControl, all 3 HeaderBar menus.

**Fix:** Migrate all dropdown menus to use the shared `DropdownMenu` class, which tracks open instances in a module-level `Set` and closes others via `closeOthers`.

---

## P2 -- Medium

### P2-1. 100+ hardcoded hex colors across UI components

**Impact:** Light theme inconsistency; colors don't respond to theme changes.

**Major offenders:**

| Category | Files | Example |
|----------|-------|---------|
| `#fff` for text on accent | Button.ts, ToneMappingControl, LuminanceVisualizationControl, FalseColorControl, DisplayProfileControl, CropControl, ViewerWipe, ViewerInputHandler, TimecodeOverlay, ShotGridPanel | `labelSpan.style.color = '#fff'` |
| Status colors | OCIOControl.ts:974-978 (`#28a745`, `#ffc107`, `#dc3545`), NoteOverlay.ts:16-20 (`#fbbf24`, `#22c55e`, `#6b7280`), MissingFrameOverlay.ts:57 (`#ff6b6b`) | Should use `var(--success)`, `var(--warning)`, `var(--error)` |
| Channel colors | ChannelSelect.ts:73-76, Waveform.ts:146-148, CurveEditor.ts:29-32, CDLControl.ts:199-201 | `#ff6b6b`, `#6bff6b`, `#6b9fff` |
| Hardcoded RGBA | TimelineEditor.ts:825-951 (11 instances), NetworkControl.ts, Waveform.ts, ViewerSplitScreen.ts | `rgba(74, 144, 217, 0.4)` |

**Fix:** Define CSS custom properties for semantic and channel colors. Replace all hardcoded values. For canvas contexts that can't use CSS variables, resolve them at render time via `getComputedStyle()`.

---

### P2-2. Transition timing fragmentation

**Standard:** `all 0.12s ease` (from `theme.ts` `TRANSITIONS.fast`)

| Timing | Count | Files |
|--------|-------|-------|
| `0.12s ease` (correct) | ~62 | Most controls |
| `0.1s ease` | ~13 | SafeAreasControl, DisplayProfileControl, ExportControl, PixelProbe, TimelineEditor, etc. |
| `0.15s ease` | ~8 | CurveEditor, HSLQualifierControl, OCIOControl, MarkerListPanel, CropControl, TabBar |
| `0.2s ease` | ~3 | VolumeControl, TabBar, a11y styles |
| `0.3s ease` | ~2 | HeaderBar, AutoSaveIndicator |

**Fix:** Replace all `0.1s` and `0.15s` button/interactive transitions with `TRANSITIONS.fast` from `theme.ts`. Keep intentional animation transitions (slider expand, tab indicator) as-is.

---

### P2-3. Divider height/color inconsistency

| Location | Height | Color Variable | Margin |
|----------|--------|---------------|--------|
| HeaderBar | 24px | `--border-primary` | 0 12px |
| ContextToolbar | 24px | `--border-primary` | 0 4px |
| PaintToolbar | 18px | `--bg-hover` | 0 2px |
| TimelineEditor | 16px | `--border-primary` | 0 |
| Style Guide spec | 18px | `--border-secondary` | 0 2px |

**Fix:** Standardize to a single `createDivider()` utility or consistent values. Recommendation: 20px height, `var(--border-secondary)`, margin `0 4px` for toolbar dividers.

---

### P2-4. Missing `applyA11yFocus` on hand-built buttons (41 files)

**Impact:** Keyboard focus rings inconsistent -- some buttons show them, others don't.

**Note:** Buttons created via `createButton()`/`createIconButton()` from `shared/Button.ts` already have built-in A11Y focus handling. The issue is specifically buttons created with raw `document.createElement('button')` that bypass the shared utility.

**Key missing components:** ToneMappingControl, ColorInversionToggle, DeinterlaceControl, FilmEmulationControl, PaintToolbar (10 buttons), TabBar, ContextToolbar, CDLControl, FilterControl, StackControl, PixelProbe (4 buttons), MarkerListPanel (10 buttons), NotePanel (9 buttons), ShortcutEditor (5 buttons), CropControl (6 buttons), OCIOControl (7 buttons), TransformControl (7 buttons).

**Fix:** Either migrate to `createButton()`/`createIconButton()` or add `applyA11yFocus(button)` calls. Store the cleanup function if the component has a `dispose()`.

---

### P2-5. Missing `aria-haspopup`/`aria-expanded` on dropdown triggers

| Component | `aria-haspopup` | `aria-expanded` |
|-----------|-----------------|-----------------|
| ChannelSelect | NO | NO |
| ZoomControl | NO | NO |
| StereoControl | NO | NO |

**Contrast:** ZebraControl, ToneMappingControl, DeinterlaceControl, FilmEmulationControl, GhostFrameControl, ScopesControl, LuminanceVisualizationControl all correctly set both.

**Fix:** Add `button.setAttribute('aria-haspopup', 'menu')` and toggle `aria-expanded` on open/close.

---

### P2-6. Missing `aria-pressed` on toggle buttons

| Component | Missing |
|-----------|---------|
| ZebraControl | `aria-pressed` |
| ToneMappingControl | `aria-pressed` |
| GhostFrameControl | `aria-pressed` |
| ScopesControl | `aria-pressed` |
| LuminanceVisualizationControl | `aria-pressed` |

**Reference:** `ColorInversionToggle.ts:41,87` and `Waveform.ts:200,637` show correct usage.

**Fix:** Add `button.setAttribute('aria-pressed', String(isActive))` and update on state change.

---

### P2-7. LUTStageControl has no `dispose()` method

**Impact:** Memory leak if LUT stages are created/destroyed during session.

**File:** `src/ui/components/LUTStageControl.ts` -- 6 event listeners, all anonymous arrows.

**Fix:** Add `dispose()` method. Store listener references as bound methods so they can be removed.

---

### P2-8. Empty `dispose()` methods in TabBar and PaintToolbar

| Component | File | Listeners Not Cleaned |
|-----------|------|-----------------------|
| TabBar | `layout/TabBar.ts:222-224` | scroll listener, 18 per-tab click/hover listeners |
| PaintToolbar | `PaintToolbar.ts:385-387` | 3 paintEngine subscriptions, 10+ button listeners, color pickers, sliders |

**Fix:** Implement proper cleanup. Store references to listeners as bound methods.

---

### P2-9. `VolumeControl` and `ExportControl` discard `applyA11yFocus()` cleanup

**Impact:** 3 event listeners leaked per component (mousedown, focus, blur).

- `VolumeControl.ts:77`: `applyA11yFocus(this.muteButton)` -- return value discarded
- `ExportControl.ts:97`: `applyA11yFocus(this.exportButton)` -- return value discarded

**Fix:** Store the return value: `this._cleanupA11y = applyA11yFocus(this.button);` and call it in `dispose()`.

**Note:** This pattern is widespread. Only `StereoEyeTransformControl.ts:95` and `StereoAlignControl.ts:96` correctly store the cleanup function.

---

### P2-10. Button size mismatch: Button.ts vs style guide

| Size | Button.ts Actual | Style Guide |
|------|-----------------|-------------|
| xs | 20px | -- |
| sm | 24px | 24px |
| md | 28px | **32px** |
| lg | 32px | **40px** |

**File:** `src/ui/components/shared/Button.ts:67-73`

**Fix:** Either update Button.ts to match the style guide, or update the style guide to match reality. Given that the 28px/32px sizes are established throughout the app, updating the style guide (UI.md) may be more practical.

---

## P3 -- Low

### P3-1. Emoji/unicode characters used instead of SVG icons

| File | Line | Character | Replacement |
|------|------|-----------|-------------|
| `MissingFrameOverlay.ts` | 44 | Warning emoji | Add `warning` icon to Icons.ts |
| `ColorControls.ts` | 290 | `✕` (ballot X) | `getIconSvg('x', 'sm')` |
| `shared/Panel.ts` | 145 | `\u2715` | `getIconSvg('x', 'sm')` |
| `shared/Modal.ts` | 209-212 | Info/check/warning/error emojis | SVG icons |
| `ChannelSelect.ts` | 195 | `&#9660;` triangle | `getIconSvg('chevron-down', 'sm')` |
| `StereoControl.ts` | 261 | `&#9660;` | `getIconSvg('chevron-down', 'sm')` |
| `SafeAreasControl.ts` | 323 | `&#9660;` | `getIconSvg('chevron-down', 'sm')` |
| `HistoryPanel.ts` | 90 | `'x'` character | `getIconSvg('x', 'sm')` |

---

### P3-2. 9px font-size below 10px minimum in 12 files

**Files:** Histogram, NetworkControl, TimelineEditor, shared/Button.ts (xs token), LeftPanelContent, FalseColorControl, Waveform, ColorWheels, ZebraControl, ToneMappingControl, LuminanceVisualizationControl, CacheIndicator.

**Fix:** Increase to 10px (`text-xs`). For the Button.ts `xs` size token, change from 9px to 10px.

---

### P3-3. Box-shadow inconsistency

Only `shared/DropdownMenu.ts` uses `COLORS.shadowDropdown` from theme.ts. 40+ components hardcode their own shadows.

| Shadow | Usage | Count |
|--------|-------|-------|
| `0 4px 12px rgba(0,0,0,0.4)` | Dropdown panels | ~14 |
| `0 4px 12px rgba(0,0,0,0.3)` | Lighter variant | ~5 |
| `0 8px 24px rgba(0,0,0,0.5)` | Larger panels | ~12 |
| `0 8px 32px rgba(0,0,0,0.5)` | Modals | ~3 |

**Fix:** Define 2-3 shadow tokens in `theme.ts` (dropdown, panel, modal) and use them everywhere.

---

### P3-4. Panel header `font-weight` inconsistency

| Font-weight | Count | Components |
|-------------|-------|------------|
| 500 (matches `createPanelHeader`) | ~10 | CropControl, FilmEmulationControl, DeinterlaceControl, etc. |
| 600 | ~13 | MarkerListPanel, ColorControls, SnapshotPanel, PixelProbe, etc. |
| bold | ~3 | NetworkControl, Waveform, MissingFrameOverlay |

**Fix:** Standardize to `font-weight: 500` matching the shared `createPanelHeader`.

---

### P3-5. Slider value display inconsistency

5+ different patterns for how sliders show their current value:

| Pattern | Components |
|---------|-----------|
| Label - Slider - Value (horizontal) | ColorControls, ZebraControl, shared/Panel |
| Label+Value above, Slider below | FilterControl, GhostFrameControl, ToneMappingControl |
| No visible value | VolumeControl |
| Label IS value (before slider) | PaintToolbar |

**Fix:** Standardize on the `createSliderRow()` pattern from `shared/Panel.ts` which shows Label - Slider - Value horizontally.

---

### P3-6. Panel width inconsistency

| Width | Components |
|-------|-----------|
| 200px | GhostFrameControl, ToneMappingControl |
| 220px | DeinterlaceControl, FilterControl, ZebraControl |
| 260px | FilmEmulationControl |
| 280px | ColorControls, shared/Panel default |
| 340px | OCIOControl |

**Fix:** Define 2-3 standard panel widths in theme.ts (narrow: 220px, standard: 280px, wide: 340px).

---

### P3-7. Disabled state opacity inconsistency

Six different opacity values used:
- `0.5` (most common, ~15 files)
- `0.3` (Waveform, StackControl)
- `0.4` (HistoryPanel)
- `0.6` (PlaylistPanel)
- `0.25` (TimelineEditor)

**Fix:** Define `OPACITY.disabled` constant in theme.ts (recommend `0.5`).

---

### P3-8. Keyboard shortcut notation inconsistency in button titles

Three styles: `Ctrl+S`, `Shift+3` (ambiguous on non-US keyboards), `J/K/L keys`.

**Fix:** Standardize to `Modifier+Key` format. For key ranges, use `Alt+1 to Alt+4` instead of `Alt+1..Alt+4`.

---

## Missing `data-testid` -- Key Interactive Components

The following interactive components have zero `data-testid` attributes and should be prioritized for E2E test coverage:

| Component | Type | Priority |
|-----------|------|----------|
| VolumeControl | Mute button + slider | High |
| ExportControl | Export button + dropdown | High |
| CDLControl | Panel with sliders | High |
| TabBar | Tab buttons | High |
| TimelineEditor | Timeline with interaction | High |
| WipeControl | Toggle button | Medium |
| ShortcutEditor | Editor with buttons | Medium |
| SlateEditor | Editor panel | Medium |
| ConformPanel | Panel with buttons | Medium |
| ContextToolbar | Toolbar buttons | Medium |

---

## Execution Order Recommendation

1. **Phase 1 (P0):** Escape handling, window.alert migration, Escape cascade fix
2. **Phase 2 (P1):** z-index standardization, Button.ts #fff fix, ThemeControl migration, Panel.ts Escape
3. **Phase 3 (P2):** Hardcoded colors, transitions, ARIA attributes, dispose cleanup
4. **Phase 4 (P3):** Icons, font sizes, shadows, panel widths, opacity tokens

Each phase can be done as a separate PR for manageable review scope.
