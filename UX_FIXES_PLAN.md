# UX Fixes Plan

Comprehensive plan for fixing all UX issues identified during the 8-agent audit.
Issues are grouped by severity and ordered by impact within each group.

---

## CRITICAL / HIGH SEVERITY

### ~~H-01: KeyboardManager does not suppress `<select>` elements~~ FIXED

**File:** `src/utils/input/KeyboardManager.ts:144-168`

**Problem:** The `shouldSkipEvent()` method checks for `HTMLInputElement`, `HTMLTextAreaElement`, and `contentEditable`, but does NOT check for `HTMLSelectElement`. When a user focuses any `<select>` dropdown (OCIO color space selector, export format, deinterlace mode, film stock, etc.) and presses a letter key to jump to an option, the KeyboardManager intercepts the event and fires the matching shortcut instead. For example, pressing "P" to select "PQ" in a color space dropdown activates the pen tool.

**Fix:** Add an `HTMLSelectElement` guard in `shouldSkipEvent()`:
```typescript
if (target instanceof HTMLSelectElement) {
  return true;
}
```

**Test Cases:**
- `KM-H01a`: When a `<select>` is focused, pressing letter keys should NOT trigger action handlers
- `KM-H01b`: When a `<select>` is focused, pressing arrow keys should NOT trigger action handlers
- `KM-H01c`: When a `<select>` is focused, modifier combos (Ctrl+Z) should still be handled by the manager (only bare keys suppressed)
- `KM-H01d`: After `<select>` loses focus (blur), keyboard shortcuts resume working normally

---

### ~~H-02: LensControl slider thumbs invisible in WebKit/Blink~~ FIXED

**File:** `src/ui/components/LensControl.ts`

**Problem:** The slider track uses `-webkit-appearance: none` (line 277 of created sliders) but there is no injected `<style>` tag for `::-webkit-slider-thumb` and `::-moz-range-thumb` styling. FilterControl (lines 206-229), FilmEmulationControl (lines 295-318), and StabilizationControl (lines 232-255) all inject thumb styling. LensControl does not, making slider thumbs completely invisible in WebKit/Blink browsers. Users can still drag but cannot see what they are dragging.

**Fix:** Add the same style injection pattern used by FilterControl, scoped to `.lens-panel input[type="range"]`. Add cleanup in `dispose()` to remove the injected style element.

**Test Cases:**
- `LENS-H02a`: LensControl should inject a `<style>` element into the document on construction
- `LENS-H02b`: The injected style should contain `::-webkit-slider-thumb` rules for `.lens-panel input[type="range"]`
- `LENS-H02c`: The injected style should contain `::-moz-range-thumb` rules for `.lens-panel input[type="range"]`
- `LENS-H02d`: `dispose()` should remove the injected style element from the document

---

### ~~H-03: CurveEditor drag uses mouse events without pointer capture~~ FIXED

**File:** `src/ui/components/CurveEditor.ts:157-159`

**Problem:** The drag interaction uses `mousedown`/`mousemove`/`mouseup` events on the canvas element, NOT pointer events. There is no `setPointerCapture()`. If the user drags the mouse outside the canvas bounds during a drag operation, `mouseleave` fires (line 281-286) and the drag silently terminates -- the control point stops tracking and the user loses their intended position. ColorWheels.ts (line 216-217) correctly uses `pointerdown` + `setPointerCapture` as the reference implementation.

**Fix:** Migrate from mouse events to pointer events (`pointerdown`/`pointermove`/`pointerup`). Call `canvas.setPointerCapture(e.pointerId)` on `pointerdown` when starting a drag. Call `canvas.releasePointerCapture(e.pointerId)` on `pointerup`. Remove the `mouseleave` workaround.

**Test Cases:**
- `CE-H03a`: CurveEditor canvas should register `pointerdown` (not `mousedown`) listener
- `CE-H03b`: CurveEditor canvas should register `pointermove` (not `mousemove`) listener
- `CE-H03c`: CurveEditor canvas should register `pointerup` (not `mouseup`) listener
- `CE-H03d`: On `pointerdown` while over a control point, `setPointerCapture` should be called with the pointer ID
- `CE-H03e`: On `pointerup`, `releasePointerCapture` should be called with the pointer ID
- `CE-H03f`: Dragging a point should continue tracking even when pointer leaves canvas bounds (via pointer capture)

---

### ~~H-04: Text tool uses `window.prompt()` instead of inline input~~ FIXED

**File:** `src/ui/components/ViewerInputHandler.ts:266`

**Problem:** When the user clicks with the text tool active, `const text = prompt('Enter text:')` is called. This is a synchronous blocking browser dialog that:
1. Suspends all JavaScript execution
2. Provides no preview of where text will appear
3. Does not support multi-line input
4. Cannot show text formatting (B/I/U) preview
5. May be suppressed on some mobile browsers
6. Does not allow editing existing text annotations in-place

**Fix:** Replace `window.prompt()` with a positioned `<textarea>` overlay at the click location. The overlay should:
- Appear at the clicked canvas position
- Auto-focus for immediate typing
- Support multi-line input (Enter for newline, Ctrl+Enter or Escape+confirm to commit)
- Show a semi-transparent background to preview placement
- Dismiss on Escape (cancel) or on blur/click-outside (commit)

**Test Cases:**
- `TXT-H04a`: Clicking with text tool should NOT call `window.prompt`
- `TXT-H04b`: Clicking with text tool should create a positioned textarea/input overlay element
- `TXT-H04c`: The overlay should be positioned at the click location relative to the canvas
- `TXT-H04d`: The overlay should auto-focus on creation
- `TXT-H04e`: Pressing Escape should dismiss the overlay without creating an annotation
- `TXT-H04f`: Committing text (blur or Ctrl+Enter) should create a text annotation with the entered content
- `TXT-H04g`: Empty text should not create an annotation
- `TXT-H04h`: The overlay should support multi-line input

---

### ~~H-05: Timeline has no touch event support~~ FIXED

**File:** `src/ui/components/Timeline.ts:105-109`

**Problem:** The timeline only binds `mousedown`, `mousemove`, `mouseup`. There are no `touchstart`, `touchmove`, `touchend` handlers (or unified pointer events). Mobile and tablet users cannot scrub the timeline at all.

**Fix:** Migrate from mouse events to pointer events (`pointerdown`/`pointermove`/`pointerup`) which unify mouse, touch, and pen input. Add `setPointerCapture` for smooth scrubbing.

**Test Cases:**
- `TL-H05a`: Timeline should register `pointerdown` (not `mousedown`) listener
- `TL-H05b`: Timeline should register `pointermove` (not `mousemove`) listener
- `TL-H05c`: Timeline should register `pointerup` (not `mouseup`) listener
- `TL-H05d`: `pointerdown` on the timeline should call `setPointerCapture`
- `TL-H05e`: `pointerup` should call `releasePointerCapture`
- `TL-H05f`: Timeline cursor style should be `pointer` on hover

---

### ~~H-06: Volume slider inaccessible on mobile (hover-only reveal)~~ FIXED

**File:** `src/ui/components/VolumeControl.ts:75-81`

**Problem:** The volume slider container has `width: 0` and only expands to `96px` on hover (lines 106-112). On touch devices, there is no hover state, so the slider is permanently inaccessible. Keyboard-only users also cannot reach the slider since `width: 0` with `overflow: hidden` makes it invisible and unfocusable.

**Fix:** Add a click/tap handler on the mute button that toggles slider visibility as an alternative to hover. When tapped, the slider should expand and remain visible until tapped again or until focus leaves the volume control area. Alternatively, always show the slider in a compact form.

**Test Cases:**
- `VOL-H06a`: Clicking/tapping the mute button should toggle the slider's expanded state
- `VOL-H06b`: When expanded via click, the slider should remain visible (not collapse on mouseleave)
- `VOL-H06c`: The slider should be focusable via keyboard when expanded
- `VOL-H06d`: Clicking outside the volume control area should collapse the slider
- `VOL-H06e`: The mute button should have `aria-label` attribute

---

### ~~H-07: Five view controls append dropdowns to container instead of `document.body`~~ FIXED

**Files:**
- `src/ui/components/ToneMappingControl.ts:130`
- `src/ui/components/FalseColorControl.ts:97`
- `src/ui/components/ZebraControl.ts:100`
- `src/ui/components/HSLQualifierControl.ts:102`
- `src/ui/components/LuminanceVisualizationControl.ts:109`

**Problem:** These five controls append their dropdown panel as a child of `this.container` which may have `position: relative` and be inside an `overflow: hidden` ancestor. All other dropdown controls (ScopesControl, CompareControl, GhostFrameControl, PARControl, etc.) correctly append to `document.body`. This inconsistency means dropdowns from these five controls may be clipped by overflow-hidden parent containers and have incorrect z-index stacking.

**Fix:** Change each control to append the dropdown to `document.body` when opening and remove it on close/dispose. Add scroll/resize repositioning handlers. Follow the pattern used by ScopesControl.

**Test Cases:**
- `TM-H07a`: ToneMappingControl dropdown should be appended to `document.body` when opened
- `FC-H07b`: FalseColorControl dropdown should be appended to `document.body` when opened
- `ZC-H07c`: ZebraControl dropdown should be appended to `document.body` when opened
- `HSL-H07d`: HSLQualifierControl dropdown should be appended to `document.body` when opened
- `LV-H07e`: LuminanceVisualizationControl dropdown should be appended to `document.body` when opened
- `*-H07f`: Each dropdown should be removed from `document.body` on close
- `*-H07g`: Each dropdown should be removed from `document.body` on dispose
- `*-H07h`: Each dropdown should reposition on window scroll
- `*-H07i`: Each dropdown should reposition on window resize

---

### ~~H-08: Left panel opens to 0px width when uncollapsing~~ FIXED

**File:** `src/ui/layout/LayoutStore.ts:68`

**Problem:** The default left panel state has `size: 0` and `collapsed: true`. When the user clicks the collapse toggle button, `togglePanelCollapsed` sets `collapsed = false` but does NOT change `size`. The `applyLayout` method then sets `wrapper.style.width = '0px'` -- the panel content becomes `display: flex` but the wrapper is 0px wide, so content is invisible. The same problem exists for presets "default", "review", and "paint" which all define `left: { size: 0, collapsed: true }`.

**Fix:** In `togglePanelCollapsed` (or `setPanelCollapsed`), when uncollapsing a panel whose stored size is below `MIN_SIDE_PANEL_WIDTH`, set the size to `MIN_SIDE_PANEL_WIDTH` (or a reasonable default like 200px).

**Test Cases:**
- `LS-H08a`: Toggling a collapsed panel with `size: 0` should set size to at least `MIN_SIDE_PANEL_WIDTH`
- `LS-H08b`: Toggling a collapsed panel with `size: 100` (below minimum) should clamp to `MIN_SIDE_PANEL_WIDTH`
- `LS-H08c`: Toggling a collapsed panel with `size: 300` (above minimum) should preserve the stored size
- `LS-H08d`: After uncollapsing, the panel wrapper element width should match the clamped size

---

### ~~H-09: Side panels never populated with content~~ FIXED

**File:** `src/App.ts` (missing `addPanelTab` calls)

**Problem:** The LayoutManager's `addPanelTab()` method is only called in tests, never in `App.ts`. The left and right panels exist in the DOM but contain no content. When the user switches to "Review" or "Color" layout presets (which expand side panels), they see empty panels flanking the viewer.

**Fix:** Either:
- (A) Populate side panels with relevant content (scopes for right panel, file browser/layers for left), or
- (B) Remove preset options that expand empty panels and hide the collapse toggle for unpopulated panels, or
- (C) Add a "coming soon" placeholder with a description of planned panel content.

**Test Cases:**
- `LP-H09a`: Layout presets that expand side panels should only do so if the panel has content registered
- `LP-H09b`: If no panel tabs are registered for a side, the collapse toggle should be hidden or disabled
- `LP-H09c`: (If approach A) Verify that expected panel content is registered for each side panel

---

### ~~H-10: Export menu items are `<div>` elements, not keyboard-accessible~~ FIXED

**File:** `src/ui/components/ExportControl.ts:172-215`

**Problem:** Export menu items are created as `<div>` elements with click handlers. They have no `role="menuitem"`, no `tabIndex`, and no keyboard event handlers. Users navigating with Tab or arrow keys cannot interact with the export menu.

**Fix:** Change menu items to `<button>` elements (or add `role="menuitem"` + `tabindex="0"` + keyboard handlers). Add arrow-key navigation between items. Add `role="menu"` on the dropdown container. Add `aria-haspopup` and `aria-expanded` on the export button.

**Test Cases:**
- `EXP-H10a`: Export menu items should be focusable via Tab key
- `EXP-H10b`: Export menu should support ArrowUp/ArrowDown navigation between items
- `EXP-H10c`: Pressing Enter on a focused menu item should trigger its action
- `EXP-H10d`: Export button should have `aria-haspopup="menu"` attribute
- `EXP-H10e`: Export button should toggle `aria-expanded` when menu opens/closes
- `EXP-H10f`: Export dropdown container should have `role="menu"` attribute
- `EXP-H10g`: Pressing Escape should close the export menu

---

### ~~H-11: Header buttons have no keyboard focus ring~~ FIXED

**File:** `src/ui/components/layout/HeaderBar.ts:265-325`

**Problem:** The `createIconButton()` method in HeaderBar creates buttons with manual `mouseenter`/`mouseleave`/`mousedown`/`mouseup` handlers but does NOT call `applyA11yFocus()`. This means keyboard focus produces no visible focus ring on any playback, file operation, fullscreen, or help button in the header. Similarly, `createCompactButton()` (lines 327-359) has the same gap.

**Fix:** Call `applyA11yFocus(button)` at the end of both `createIconButton()` and `createCompactButton()`.

**Test Cases:**
- `HB-H11a`: `createIconButton()` should call `applyA11yFocus` on the created button
- `HB-H11b`: `createCompactButton()` should call `applyA11yFocus` on the created button
- `HB-H11c`: When a header button receives focus via keyboard (Tab), it should have a visible focus ring style
- `HB-H11d`: When a header button receives focus via mouse click, it should NOT show the focus ring

---

### ~~H-12: SVG icons missing `aria-hidden="true"`~~ FIXED

**File:** `src/ui/components/shared/Icons.ts:48`

**Problem:** The `getIconSvg()` function generates inline SVG elements without `aria-hidden="true"`. Screen readers will attempt to parse SVG content (stroke paths, viewBox values, etc.), producing nonsensical announcements for every icon across the entire application. Also affects inline SVGs in `HeaderBar.ts:363-378`.

**Fix:** Add `aria-hidden="true"` to the SVG element in `getIconSvg()`:
```typescript
return `<svg aria-hidden="true" width="${iconSize}" ...`;
```
Also add it to `HeaderBar.ts` `getIcon()` method SVGs.

**Test Cases:**
- `ICN-H12a`: `getIconSvg()` output should contain `aria-hidden="true"` on the `<svg>` element
- `ICN-H12b`: All icon SVGs rendered via `getIconSvg()` should have `aria-hidden="true"`
- `ICN-H12c`: HeaderBar `getIcon()` SVGs should have `aria-hidden="true"`

---

### ~~H-13: No opacity control for paint annotations~~ FIXED

**File:** `src/ui/components/PaintToolbar.ts:316`

**Problem:** The `hexToRgba()` function hardcodes alpha to 1. The native `<input type="color">` does not support alpha. There is no separate opacity slider. Users cannot create semi-transparent annotations, which is a common need in review workflows for overlaying notes without fully obscuring the underlying image.

**Fix:** Add an opacity slider (range input, 0-100%) below the color picker in PaintToolbar. Wire it to the alpha channel in `hexToRgba()` and pass it to `paintEngine.beginStroke()`.

**Test Cases:**
- `PT-H13a`: PaintToolbar should render an opacity slider input
- `PT-H13b`: Opacity slider should default to 100%
- `PT-H13c`: Changing opacity slider should update the alpha value used in `hexToRgba()`
- `PT-H13d`: New strokes should use the current opacity value
- `PT-H13e`: Opacity slider should display its current value as a label

---

## SYSTEMIC MEDIUM SEVERITY

### ~~M-14: No Escape key to close popup panels (11 controls)~~ FIXED

**Files:**
- `src/ui/components/FilterControl.ts`
- `src/ui/components/LensControl.ts`
- `src/ui/components/DeinterlaceControl.ts`
- `src/ui/components/FilmEmulationControl.ts`
- `src/ui/components/PerspectiveCorrectionControl.ts`
- `src/ui/components/StabilizationControl.ts`
- `src/ui/components/ColorControls.ts`
- `src/ui/components/CDLControl.ts`
- `src/ui/components/GamutMappingControl.ts`
- `src/ui/components/ExportControl.ts`
- `src/ui/components/NetworkControl.ts`

**Problem:** These 11 controls open popup panels that can only be dismissed by clicking outside. Keyboard users have no way to close them. CropControl (line 164-168) and DisplayProfileControl (line 448-451) correctly handle Escape as reference implementations.

**Fix:** Add a `document.addEventListener('keydown', ...)` handler in each control that checks `e.key === 'Escape'` and calls the hide/close method. Attach the handler when the panel opens, remove on close. Clean up in `dispose()`.

**Test Cases (per control, prefix varies):**
- `*-M14a`: Pressing Escape while the panel is open should close the panel
- `*-M14b`: Pressing Escape while the panel is closed should have no effect
- `*-M14c`: The keydown listener should be removed when the panel closes
- `*-M14d`: The keydown listener should be removed on `dispose()`

---

### ~~M-15: Missing ARIA attributes on ~15 controls~~ FIXED

**Controls affected:** FalseColorControl, ZebraControl, HSLQualifierControl, LuminanceVisualizationControl, GamutMappingControl, GhostFrameControl, ScopesControl, CompareControl, FilterControl, LensControl, DeinterlaceControl, FilmEmulationControl, PerspectiveCorrectionControl, StabilizationControl, ExportControl

**Problem:** Toggle buttons that open dropdown panels lack `aria-haspopup` and `aria-expanded` attributes. Panel containers lack `role="dialog"` and `aria-label`. Screen readers cannot communicate the relationship between buttons and their panels, or the open/closed state.

**Fix:** On each toggle button:
- Add `aria-haspopup="dialog"` (or `"menu"` for menu-like dropdowns)
- Toggle `aria-expanded` between `"true"` and `"false"` on open/close

On each panel container:
- Add `role="dialog"` and `aria-label="[Control Name] Settings"`

Reference: DisplayProfileControl (lines 59-61) and OCIOControl (lines 132-134).

**Test Cases (per control):**
- `*-M15a`: Toggle button should have `aria-haspopup` attribute
- `*-M15b`: Toggle button `aria-expanded` should be `"false"` when panel is closed
- `*-M15c`: Toggle button `aria-expanded` should be `"true"` when panel is open
- `*-M15d`: Panel container should have `role="dialog"` attribute
- `*-M15e`: Panel container should have `aria-label` attribute with descriptive text

---

### ~~M-16: Missing `applyA11yFocus()` on ~10 controls~~ FIXED

**Controls affected:** FalseColorControl, ZebraControl, HSLQualifierControl, LuminanceVisualizationControl, GamutMappingControl, StereoControl (eyeSwap button only), HeaderBar `createIconButton`, HeaderBar `createCompactButton`

**Problem:** These controls create buttons without calling `applyA11yFocus()`, which means keyboard focus produces no visible focus ring. Users navigating via Tab cannot see which button is focused.

**Fix:** Call `applyA11yFocus(button)` after creating each toggle button. Import from `src/ui/a11y/applyA11yFocus.ts`.

**Test Cases (per control):**
- `*-M16a`: The toggle button should have focus/blur event listeners (added by `applyA11yFocus`)
- `*-M16b`: When the button receives keyboard focus (via Tab), a visible focus ring style should be applied
- `*-M16c`: When the button receives mouse focus (via click), no focus ring should be applied

---

### ~~M-17: Missing `setPointerCapture` on drag interactions (2 controls)~~ FIXED

**Files:**
- `src/ui/components/PerspectiveGridOverlay.ts:204-213`
- `src/ui/layout/LayoutManager.ts:347-358`

**Problem:** Both controls start drag interactions by attaching document-level `pointermove`/`pointerup` listeners but do NOT call `setPointerCapture()`. If the pointer moves outside the browser window during a drag, events stop being received, leaving the drag in a stuck state.

**Fix:** Call `(e.target as HTMLElement).setPointerCapture(e.pointerId)` in the drag start handler. Call `releasePointerCapture` in the drag end handler.

**Test Cases:**
- `PGO-M17a`: PerspectiveGridOverlay `startDrag` should call `setPointerCapture` on the handle element
- `PGO-M17b`: PerspectiveGridOverlay `endDrag` should call `releasePointerCapture`
- `LM-M17c`: LayoutManager `onDragStart` should call `setPointerCapture` on the handle element
- `LM-M17d`: LayoutManager `onDragEnd` should call `releasePointerCapture`

---

### ~~M-18: No focus management on panel open/close (7 controls)~~ FIXED

**Controls affected:** FilterControl, LensControl, DeinterlaceControl, FilmEmulationControl, PerspectiveCorrectionControl, StabilizationControl, GamutMappingControl

**Problem:** When these panels open, focus stays on the toggle button. When they close, focus is not explicitly returned. CropControl correctly moves focus to the panel's first interactive element on open (line 818) and returns focus to the button on close (line 829).

**Fix:** On panel open, move focus to the first focusable element inside the panel. On panel close, return focus to the toggle button.

**Test Cases (per control):**
- `*-M18a`: When the panel opens, focus should move to the first interactive element inside it
- `*-M18b`: When the panel closes, focus should return to the toggle button

---

### ~~M-19: Checkbox labels use click handler instead of `for`/`id` association (4 controls)~~ FIXED

**Files:**
- `src/ui/components/DeinterlaceControl.ts:189`
- `src/ui/components/FilmEmulationControl.ts:207`
- `src/ui/components/PerspectiveCorrectionControl.ts:166`
- `src/ui/components/StabilizationControl.ts:180`

**Problem:** The `<label>` elements use `addEventListener('click', () => { checkbox.click(); })` instead of proper `htmlFor`/`id` association. This means assistive technology cannot associate the label with the checkbox. Screen readers announce the label and checkbox as separate unrelated elements.

**Fix:** Set a unique `id` on the checkbox and `htmlFor` on the label. Remove the manual click handler. Reference: ExportControl (line 249) and ColorControls (line 516) which use `label.htmlFor`.

**Test Cases (per control):**
- `*-M19a`: The checkbox should have a unique `id` attribute
- `*-M19b`: The label should have `htmlFor` matching the checkbox `id`
- `*-M19c`: Clicking the label should toggle the checkbox state

---

### ~~M-20: Border-color not reset on mouseleave when inactive (3 controls)~~ FIXED

**Files:**
- `src/ui/components/ZebraControl.ts:76-77`
- `src/ui/components/FalseColorControl.ts:72-73`
- `src/ui/components/LuminanceVisualizationControl.ts:78-79`

**Problem:** On `mouseenter`, the toggle button gets `borderColor: 'var(--border-primary)'`. On `mouseleave`, `background` and `color` are reset but `borderColor` is NOT reset to `transparent`. The border remains visible after hover, creating a visual artifact.

**Fix:** Add `this.toggleButton.style.borderColor = 'transparent';` to the `mouseleave` handler for the inactive state.

**Test Cases (per control):**
- `*-M20a`: After `mouseenter` then `mouseleave` while inactive, `borderColor` should be `transparent`
- `*-M20b`: After `mouseenter` then `mouseleave` while active, `borderColor` should remain the accent color

---

### ~~M-21: Always-on outside click listeners (5 controls)~~ FIXED

**Files:**
- `src/ui/components/ToneMappingControl.ts:133`
- `src/ui/components/FalseColorControl.ts:100`
- `src/ui/components/ZebraControl.ts:103`
- `src/ui/components/HSLQualifierControl.ts:105`
- `src/ui/components/LuminanceVisualizationControl.ts:112`

**Problem:** These five controls register a permanent `document.addEventListener('click', this.handleOutsideClick)` in the constructor that runs for the entire component lifetime, even when the dropdown is closed. This is wasteful. Other controls (ScopesControl, etc.) only attach the handler when opening and remove on close.

**Fix:** Move the `addEventListener` call to the dropdown open method and `removeEventListener` to the close method. Keep cleanup in `dispose()` as a safety net.

**Test Cases (per control):**
- `*-M21a`: The outside click listener should NOT be registered when the dropdown is closed
- `*-M21b`: The outside click listener should be registered when the dropdown opens
- `*-M21c`: The outside click listener should be removed when the dropdown closes
- `*-M21d`: `dispose()` should remove the outside click listener regardless of dropdown state

---

## INDIVIDUAL MEDIUM SEVERITY

### ~~M-22: Speed menu popup not keyboard-accessible~~ FIXED

**File:** `src/ui/components/layout/HeaderBar.ts:522-643`

**Problem:** The speed preset menu is only triggered by right-click (`contextmenu` event, line 512). There is no keyboard way to open it. The menu items lack `role="menuitem"`, have no arrow-key navigation, no Escape handler, and no focus management.

**Fix:** Add keyboard activation (Enter/Space on the speed button should also open the menu, or Shift+Click). Add `role="menu"` on container, `role="menuitem"` on items, arrow-key navigation, and Escape to close.

**Test Cases:**
- `SPD-M22a`: Long-pressing or Shift+clicking the speed button should open the speed preset menu
- `SPD-M22b`: Speed menu container should have `role="menu"`
- `SPD-M22c`: Speed menu items should have `role="menuitem"`
- `SPD-M22d`: ArrowUp/ArrowDown should navigate between speed menu items
- `SPD-M22e`: Pressing Escape should close the speed menu
- `SPD-M22f`: The currently active speed should be visually indicated and have `aria-checked="true"`

---

### ~~M-23: FocusManager hidden zone detection uses fragile AND logic~~ FIXED

**File:** `src/ui/a11y/FocusManager.ts:73`

**Problem:** The condition `zone.container.offsetParent === null && zone.container.style.display === 'none'` uses AND logic. If a zone is hidden via `visibility: hidden` or `opacity: 0`, or if `offsetParent` is null for other reasons (e.g., the element is the `<body>`), the zone won't be skipped. F6 cycling could focus invisible elements.

**Fix:** Use `zone.container.offsetParent === null` alone (which is sufficient for detecting `display: none` and other hidden states), or add additional checks for `visibility` and computed display.

**Test Cases:**
- `FM-M23a`: Zones with `display: none` should be skipped during F6 cycling
- `FM-M23b`: Zones with `visibility: hidden` should be skipped during F6 cycling
- `FM-M23c`: Zones with `offsetParent === null` (detached) should be skipped during F6 cycling

---

### ~~M-24: ContextToolbar `createSlider()` lacks ARIA attributes~~ FIXED

**File:** `src/ui/components/layout/ContextToolbar.ts:356-415`

**Problem:** The `createSlider()` helper creates `<input type="range">` elements but does not set `aria-valuemin`, `aria-valuemax`, `aria-valuenow`, or `aria-label`. The label text is a sibling `<span>` with no `<label>` or `aria-labelledby` linkage.

**Fix:** Add `aria-label` to the slider. Add `aria-valuemin`, `aria-valuemax`, `aria-valuenow`. Update `aria-valuenow` on input events. Wrap with a `<label>` or use `aria-labelledby`.

**Test Cases:**
- `CT-M24a`: Sliders created by `createSlider()` should have `aria-label` matching the label text
- `CT-M24b`: Sliders should have `aria-valuemin` matching the `min` attribute
- `CT-M24c`: Sliders should have `aria-valuemax` matching the `max` attribute
- `CT-M24d`: Sliders should have `aria-valuenow` updated when the value changes

---

### ~~M-25: Shortcuts dialog not searchable/filterable~~ FIXED

**File:** `src/AppKeyboardHandler.ts:103-281`

**Problem:** The shortcuts dialog renders a static list of 80+ shortcuts with no search input or filter mechanism. Finding a specific shortcut requires scrolling through the entire list.

**Fix:** Add a search input at the top of the dialog that filters shortcuts by description or key name in real time.

**Test Cases:**
- `SK-M25a`: Shortcuts dialog should contain a search/filter input
- `SK-M25b`: Typing in the search input should filter displayed shortcuts by description
- `SK-M25c`: Typing a key name (e.g., "Ctrl") should filter shortcuts containing that modifier
- `SK-M25d`: Clearing the search input should show all shortcuts
- `SK-M25e`: The search input should be auto-focused when the dialog opens

---

### ~~M-26: Inline `outline: none` may suppress focus indicators~~ FIXED

**File:** `src/ui/components/layout/ContextToolbar.ts:264,326`

**Problem:** Both `createButton()` and `createIconButton()` set `outline: none` in inline styles. While `applyA11yFocus()` is called, the inline `outline: none` has higher specificity than most CSS focus rules. If the JS focus handler fails, there is zero fallback.

**Fix:** Remove `outline: none` from inline styles. Instead, use `outline: none` only in the `applyA11yFocus` mousedown handler, or rely on `:focus-visible` for browsers that support it.

**Test Cases:**
- `CT-M26a`: Buttons created by `createButton()` should NOT have inline `outline: none`
- `CT-M26b`: Buttons created by `createIconButton()` should NOT have inline `outline: none`
- `CT-M26c`: Keyboard-focused buttons should display a visible focus indicator

---

### ~~M-27: Rotation buttons have no active state indicator~~ FIXED

**File:** `src/ui/components/TransformControl.ts:95-116`

**Problem:** The `updateButtonState()` method only checks for `flipH` and `flipV` (via `data-action`). Rotation buttons have no `data-action` attribute (lines 39-44) so they never get active state styling. When the image is rotated to 90/180/270 degrees, there is zero visual feedback on any rotation button.

**Fix:** Add a status text element below the buttons showing the current rotation value (e.g., "90 deg") when non-zero. Alternatively, add a rotation indicator or highlight the button.

**Test Cases:**
- `TC-M27a`: When rotation is 0, no rotation status indicator should be visible
- `TC-M27b`: When rotation is 90/180/270, a status indicator should show the current value
- `TC-M27c`: After reset, the status indicator should disappear

---

### ~~M-28: No hover states on stack layer item buttons~~ FIXED

**File:** `src/ui/components/StackControl.ts:199-327`

**Problem:** Move up, move down, delete, and visibility buttons inside layer items have no hover states. Users get no visual feedback when hovering over these interactive elements, unlike the main stack button and add button which have proper hover effects.

**Fix:** Add `mouseenter`/`mouseleave` handlers to layer item buttons with consistent hover styling (background color change, opacity increase).

**Test Cases:**
- `SC-M28a`: Layer visibility button should change style on hover
- `SC-M28b`: Layer move-up button should change style on hover
- `SC-M28c`: Layer move-down button should change style on hover
- `SC-M28d`: Layer delete button should change style on hover
- `SC-M28e`: Disabled buttons should NOT change style on hover

---

### ~~M-29: No drag-and-drop layer reordering in StackControl~~ FIXED

**File:** `src/ui/components/StackControl.ts`

**Problem:** Layers can only be reordered via up/down arrow buttons, one step at a time. There is no drag-and-drop support. For stacks with many layers, this is tedious. Professional layer panels (Photoshop, After Effects, Nuke) all support drag reordering.

**Fix:** Add `draggable="true"` to layer items. Add `dragstart`, `dragover`, `dragend`, `drop` event handlers. Show a visual drop indicator between layers during drag.

**Test Cases:**
- `SC-M29a`: Layer items should have `draggable="true"` attribute
- `SC-M29b`: `dragstart` should set the dragged layer ID in dataTransfer
- `SC-M29c`: `dragover` on a different layer should show a drop indicator
- `SC-M29d`: `drop` should reorder the layer and emit the change event
- `SC-M29e`: `dragend` should clean up the drop indicator

---

### ~~M-30: No active preset indicator in layout preset bar~~ FIXED

**File:** `src/ui/layout/LayoutManager.ts:292-341`

**Problem:** The preset buttons are created once and never updated. There is no `aria-pressed` attribute, no visual "active" state, and no way for the user to know which preset is currently applied. The `presetApplied` event is emitted by LayoutStore (line 283) but never listened to for updating the preset bar UI.

**Fix:** Listen to `presetApplied` events from the store and update the active button style (accent background/border). Set `aria-pressed="true"` on the active button, `"false"` on others.

**Test Cases:**
- `LM-M30a`: After applying "Color" preset, the Color button should have active styling
- `LM-M30b`: After applying "Color" preset, other preset buttons should NOT have active styling
- `LM-M30c`: Active button should have `aria-pressed="true"`
- `LM-M30d`: Inactive buttons should have `aria-pressed="false"`

---

### ~~M-31: Layout splitter invisible at rest~~ FIXED

**File:** `src/ui/layout/LayoutManager.ts:257-268`

**Problem:** The splitter handle has `background: transparent` by default. A 5px transparent zone between panels is extremely hard to discover. Users will not know the panels are resizable unless they happen to hover precisely over the boundary and notice the cursor change.

**Fix:** Add a subtle visual indicator at rest -- a 1px line or very low-opacity background (e.g., `background: var(--border-primary)` at opacity 0.2) so the handle is discoverable.

**Test Cases:**
- `LM-M31a`: Drag handle should have a non-transparent background at rest (visible indicator)
- `LM-M31b`: Drag handle should increase visibility on hover (stronger background)
- `LM-M31c`: Drag handle should show resize cursor on hover

---

### ~~M-32: Cursor not enforced on `document.body` during layout resize drag~~ FIXED

**File:** `src/ui/layout/LayoutManager.ts:347-358`

**Problem:** During a resize drag, `document.body.style.userSelect = 'none'` is set but `document.body.style.cursor` is never set to `col-resize` or `row-resize`. When the user drags quickly and the pointer leaves the 5px handle, the cursor snaps back to the default arrow, creating a visually jarring flicker.

**Fix:** In `onDragStart`, set `document.body.style.cursor` to the appropriate resize cursor. In `onDragEnd`, reset it to `''`.

**Test Cases:**
- `LM-M32a`: During a horizontal drag, `document.body.style.cursor` should be `col-resize`
- `LM-M32b`: During a vertical drag, `document.body.style.cursor` should be `row-resize`
- `LM-M32c`: After drag ends, `document.body.style.cursor` should be reset to `''`

---

### ~~M-33: HSLQualifierControl hardcoded `#333` color~~ FIXED

**File:** `src/ui/components/HSLQualifierControl.ts:192,241,721`

**Problem:** Reset button and eyedropper button `mouseleave` handlers use hardcoded `#333` for background color instead of CSS variables. In a light theme, `#333` would appear as a dark smudge.

**Fix:** Replace `'#333'` with `'var(--bg-secondary)'` or equivalent theme variable.

**Test Cases:**
- `HSL-M33a`: Reset button mouseleave should set background to a CSS variable (not hardcoded hex)
- `HSL-M33b`: Eyedropper button mouseleave should set background to a CSS variable (not hardcoded hex)
- `HSL-M33c`: `deactivateEyedropper()` should set background to a CSS variable (not hardcoded hex)

---

## LOW SEVERITY

### ~~L-34: `handleKeyboard` method in TransformControl is dead code~~ FIXED

**File:** `src/ui/components/TransformControl.ts:220-238`

**Problem:** The `handleKeyboard` method is never called by the application (App.ts uses KeyboardManager bindings instead). It also has mismatched shortcut mappings vs the actual KeyBindings system and is incomplete (no flipV handler).

**Fix:** Remove the dead `handleKeyboard` method entirely.

**Test Cases:**
- `TC-L34a`: TransformControl should NOT have a `handleKeyboard` method

---

### ~~L-35: Disabled stack layer buttons still show `cursor: pointer`~~ FIXED

**File:** `src/ui/components/StackControl.ts:278,301`

**Problem:** Disabled move-up/move-down buttons show `cursor: pointer` from inline style set at creation (lines 273, 296). They should show `cursor: default` or `cursor: not-allowed` when disabled.

**Fix:** In the disabled check, also set `cursor: not-allowed` or `cursor: default` on the button.

**Test Cases:**
- `SC-L35a`: Disabled move buttons should have `cursor` set to `not-allowed` or `default`
- `SC-L35b`: Enabled move buttons should have `cursor` set to `pointer`

---

### ~~L-36: No double-click-to-reset on layout splitters~~ FIXED

**File:** `src/ui/layout/LayoutManager.ts:252-289`

**Problem:** No `dblclick` event listener on any drag handle. Double-click to reset is a standard UX convention for resizable splitters.

**Fix:** Add a `dblclick` handler on each handle that resets the corresponding panel to its default preset size.

**Test Cases:**
- `LM-L36a`: Double-clicking a side panel handle should reset its size to the default preset value
- `LM-L36b`: Double-clicking the bottom panel handle should reset its height to the default

---

### ~~L-37: Bottom panel has no collapse toggle button~~ FIXED

**File:** `src/ui/layout/LayoutManager.ts:132`

**Problem:** Left and right panels each have a collapse toggle button in their rail. The bottom panel has only a drag handle -- no UI to collapse/expand without dragging.

**Fix:** Add a small collapse/expand chevron button near the bottom drag handle.

**Test Cases:**
- `LM-L37a`: Bottom panel should have a collapse/expand toggle button
- `LM-L37b`: Clicking the button should toggle the bottom panel collapsed state
- `LM-L37c`: The button icon should reflect the current collapsed state (chevron direction)

---

### ~~L-38: GamutMappingControl panel does not reposition on scroll/resize~~ FIXED

**File:** `src/ui/components/GamutMappingControl.ts` (show method, lines 315-325)

**Problem:** The panel position is calculated once when opened. There are no scroll/resize event listeners to reposition it. All other dropdown controls register `window.addEventListener('scroll', ...)` and `window.addEventListener('resize', ...)`.

**Fix:** Add scroll and resize handlers that recalculate and update the panel position.

**Test Cases:**
- `GM-L38a`: GamutMappingControl should register a scroll listener when the panel opens
- `GM-L38b`: GamutMappingControl should register a resize listener when the panel opens
- `GM-L38c`: On window resize, the panel should update its position
- `GM-L38d`: Listeners should be removed when the panel closes

---

### ~~L-39: CurveEditor canvas not keyboard-accessible~~ FIXED

**File:** `src/ui/components/CurveEditor.ts:129-136`

**Problem:** The curve canvas has no `tabindex` attribute and no `keydown` event listener. Users cannot select, move, add, or delete control points via keyboard.

**Fix:** Add `tabindex="0"` to the canvas. Add keyboard handlers for arrow keys (move selected point), Delete (remove point), Enter (add point at cursor position).

**Test Cases:**
- `CE-L39a`: CurveEditor canvas should have `tabindex="0"`
- `CE-L39b`: Pressing arrow keys on focused canvas should move the selected control point
- `CE-L39c`: Pressing Delete on focused canvas should remove the selected control point

---

### ~~L-40: ColorWheels canvas not keyboard-accessible~~ FIXED

**File:** `src/ui/components/ColorWheels.ts:148-151`

**Problem:** The color wheel canvas has no `tabindex` or keyboard handlers. Partially mitigated by the numeric R/G/B input fields which are keyboard-accessible.

**Fix:** Add `tabindex="0"` to each wheel canvas. Add keyboard handlers for arrow keys to adjust the position.

**Test Cases:**
- `CW-L40a`: Color wheel canvas should have `tabindex="0"`
- `CW-L40b`: Arrow keys on focused canvas should move the position indicator

---

### L-41: GamutMappingControl panel lacks ARIA attributes

**File:** `src/ui/components/GamutMappingControl.ts:108-121`

**Problem:** Panel has no `role="dialog"` or `aria-label`. Unlike OCIOControl which properly sets these.

**Fix:** Add `role="dialog"` and `aria-label="Gamut Mapping Settings"` to the panel element.

**Test Cases:**
- `GM-L41a`: Panel should have `role="dialog"` attribute
- `GM-L41b`: Panel should have `aria-label` attribute

---

### L-42: GamutMappingControl hover state stuck when mode is active

**File:** `src/ui/components/GamutMappingControl.ts:98-106`

**Problem:** When `mode !== 'off'` and the panel is closed, the `mouseleave` handler does nothing, leaving hover state styles permanently applied.

**Fix:** In the mouseleave handler, add the active-but-not-hovered style case for `mode !== 'off'` when panel is closed.

**Test Cases:**
- `GM-L42a`: After mouseleave with mode active and panel closed, button should show active (non-hover) styling

---

### L-43: PARControl preset items use `<div>` not `<button>`

**File:** `src/ui/components/PARControl.ts:234`

**Problem:** Preset items are `<div>` elements with click handlers but no `tabindex` or `role="button"`. Not reachable via keyboard.

**Fix:** Use `<button>` elements or add `role="option"` and `tabindex="0"`.

**Test Cases:**
- `PAR-L43a`: PAR preset items should be focusable via keyboard
- `PAR-L43b`: Pressing Enter on a focused preset item should select it

---

### L-44: SafeAreasControl checkbox items use `<div>` not `<button>`

**File:** `src/ui/components/SafeAreasControl.ts:200`

**Problem:** Checkbox items are `<div>` elements with click handlers but no `tabindex` or `role`. Not keyboard-accessible.

**Fix:** Add `tabindex="0"` and `role="checkbox"` with `aria-checked`. Add Enter/Space keyboard handler.

**Test Cases:**
- `SA-L44a`: Safe area checkbox items should be focusable via keyboard
- `SA-L44b`: Pressing Enter/Space on a focused item should toggle it
- `SA-L44c`: Items should have `role="checkbox"` and `aria-checked`

---

### L-45: BackgroundPatternControl keyboard handler missing on pattern items

**File:** `src/ui/components/BackgroundPatternControl.ts:288-289`

**Problem:** Pattern items have `role="radio"` and `tabindex="0"` but no `keydown` handler for Enter/Space activation. Native `<div>` elements do not fire click on Enter.

**Fix:** Add a `keydown` handler that calls `click()` on Enter or Space.

**Test Cases:**
- `BP-L45a`: Pressing Enter on a focused pattern item should select it
- `BP-L45b`: Pressing Space on a focused pattern item should select it

---

### L-46: StereoControl eyeSwap button lacks keyboard focus ring

**File:** `src/ui/components/StereoControl.ts:167`

**Problem:** The `eyeSwapButton` does not have `applyA11yFocus()` applied, unlike the `modeButton` (line 100).

**Fix:** Call `applyA11yFocus(eyeSwapButton)`.

**Test Cases:**
- `ST-L46a`: The eyeSwap button should show a focus ring when focused via keyboard

---

### L-47: Playhead drag handle too small

**File:** `src/ui/components/Timeline.ts:531-546`

**Problem:** The playhead is a thin 3px line with a small 5px circle. Very small hit target with no visible "drag me" affordance.

**Fix:** Increase the playhead circle to 8-10px and add a wider invisible hit area (e.g., 20px transparent zone around the playhead).

**Test Cases:**
- `TL-L47a`: The playhead hit area should be at least 16px wide

---

### L-48: PlaylistPanel and SnapshotPanel z-index collision

**File:** `src/ui/components/PlaylistPanel.ts:52`, `src/ui/components/SnapshotPanel.ts:51`

**Problem:** Both panels use `z-index: 1000` and are positioned at `right: 16px; top: 60px`. If both are opened simultaneously, they overlap at the exact same position.

**Fix:** Ensure only one panel can be open at a time (close the other when opening one), or offset their positions.

**Test Cases:**
- `PL-L48a`: Opening the playlist panel should close the snapshot panel if open
- `PL-L48b`: Opening the snapshot panel should close the playlist panel if open

---

### L-49: SnapshotPanel preview uses innerHTML with user data

**File:** `src/ui/components/SnapshotPanel.ts:448`

**Problem:** `span.innerHTML` is used with `value` from `preview.sourceName` (a filename). Minor XSS risk.

**Fix:** Use `textContent` for the value portion.

**Test Cases:**
- `SP-L49a`: Snapshot preview info should use `textContent` (not `innerHTML`) for user-derived values
- `SP-L49b`: Filenames containing HTML tags should be displayed as plain text, not rendered

---

### L-50: Speed menu not cleaned up on HeaderBar dispose

**File:** `src/ui/components/layout/HeaderBar.ts:524-643, 858-869`

**Problem:** If the speed menu is open when the HeaderBar is disposed, the menu DOM element remains orphaned in `document.body`.

**Fix:** Track the active speed menu element and remove it in `dispose()`.

**Test Cases:**
- `HB-L50a`: `dispose()` should remove any open speed menu from `document.body`

---

### L-51: Session name display has misleading hover effect

**File:** `src/ui/components/layout/HeaderBar.ts:382-432`

**Problem:** The session name has a hover background effect (lines 424-429) suggesting interactivity, but there is no click handler.

**Fix:** Remove the hover background effect, or add a click handler to rename the session.

**Test Cases:**
- `HB-L51a`: Session name should either have no hover effect OR have a click handler for renaming

---

### L-52: Header hidden scrollbar with no overflow indicator

**File:** `src/ui/components/layout/HeaderBar.ts:70-88`

**Problem:** The header uses `overflow-x: auto` with `scrollbar-width: none`. On small screens, controls overflow and scroll horizontally, but with the scrollbar hidden, there's no visual indication of hidden content.

**Fix:** Add a subtle fade/gradient on the edge when content overflows, or show small scroll arrow indicators.

**Test Cases:**
- `HB-L52a`: When header content overflows, a visual indicator should appear at the overflow edge

---

### L-53: FilterControl blur initial value label inconsistency

**File:** `src/ui/components/FilterControl.ts:183`

**Problem:** Initial value display for Blur slider shows `"0"` instead of `"0px"`. The input handler formats as `"0px"` but initial render is just `"0"`.

**Fix:** Use the same formatting function for initial value as for input updates.

**Test Cases:**
- `FC-L53a`: Blur slider initial value label should show `"0px"` not `"0"`

---

### L-54: Perspective corner inputs use `change` instead of `input` event

**File:** `src/ui/components/PerspectiveCorrectionControl.ts:272`

**Problem:** Corner X/Y inputs fire on `change` (requires blur/Enter), not `input` (fires on every keystroke). Users don't get live preview while typing.

**Fix:** Change from `change` to `input` event.

**Test Cases:**
- `PC-L54a`: Corner input should emit change on every keystroke (via `input` event)

---

### L-55: Play button missing `aria-pressed`

**File:** `src/ui/components/layout/HeaderBar.ts:159`

**Problem:** The play/pause button acts as a toggle but has no `aria-pressed` attribute. `updatePlayButton()` updates the icon but not the ARIA state.

**Fix:** Add `aria-pressed` toggled in `updatePlayButton()`.

**Test Cases:**
- `HB-L55a`: Play button should have `aria-pressed="true"` when playing
- `HB-L55b`: Play button should have `aria-pressed="false"` when paused

---

### L-56: ColorControls `setAdjustments()` does not update value labels

**File:** `src/ui/components/ColorControls.ts:654-674`

**Problem:** When `setAdjustments()` is called programmatically, slider positions are updated (line 669) but value labels are not. Displayed text values remain stale until the user manually moves a slider.

**Fix:** Call the value label update function for each slider after setting values.

**Test Cases:**
- `CC-L56a`: After `setAdjustments()`, all value labels should reflect the new values
- `CC-L56b`: After `setAdjustments()`, slider positions and labels should be in sync

---

### L-57: `select` tool type exists in PaintEngine but is unimplemented

**File:** `src/paint/PaintEngine.ts:34`

**Problem:** The `PaintTool` union type includes `'select'` but no toolbar button, keyboard shortcut, or pointer handler exists for it. Dead code.

**Fix:** Remove `'select'` from the `PaintTool` type union, or implement it if planned.

**Test Cases:**
- `PE-L57a`: `PaintTool` type should not include unused tool types

---

### L-58: No `aria-live` announcement for playback state changes

**File:** `src/App.ts`

**Problem:** The AriaAnnouncer exists but is only wired for tab changes. Play/pause, speed change, loop mode change, and file loaded are not announced to screen readers.

**Fix:** Add `ariaAnnouncer.announce()` calls for key playback state changes.

**Test Cases:**
- `A11Y-L58a`: Toggling play/pause should trigger an aria-live announcement
- `A11Y-L58b`: Changing playback speed should trigger an aria-live announcement

---

### L-59: CropControl missing outside-click-to-close

**File:** `src/ui/components/CropControl.ts`

**Problem:** All other 6 effects controls close their panel on outside click. CropControl does not -- only Escape or the close button work. Inconsistent behavior.

**Fix:** Add a document-level click handler (same pattern as FilterControl) that closes the panel when clicking outside.

**Test Cases:**
- `CC-L59a`: Clicking outside the CropControl panel should close it
- `CC-L59b`: Clicking inside the CropControl panel should NOT close it

---

### L-60: No touch events in header controls

**File:** Multiple header-related files

**Problem:** Volume slider reveal (hover-based), all hover effects in header are mouse-only. On touch devices, hover-dependent interactions are broken entirely. Partially addressed by H-06 (volume) but applies more broadly.

**Fix:** Ensure all hover-triggered reveal patterns also have tap/click alternatives.

**Test Cases:**
- `HB-L60a`: All interactive elements in the header should be accessible via touch/click (not hover-only)

---

*Total: 60 actionable issues with 200+ test cases*
