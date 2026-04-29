# MED-25 stopPropagation Audit

This file classifies every `stopPropagation` / `stopImmediatePropagation` site in `src/ui/components/` (excluding tests) into one of four buckets to inform the OutsideClickRegistry migration.

| Bucket | Definition | Action |
|---|---|---|
| **safe** | Handler on non-document target preventing event reaching parent inside same component. Registry runs in capture phase first; this stopPropagation can't influence dismiss. | Leave in place. |
| **must-remove-Escape** | Stops Escape propagation specifically to prevent sibling/ancestor keydown from also firing. After migration, registry owns global Escape. | Remove handler; rely on registry Escape. |
| **unrelated** | mousedown/click stopPropagation inside menu items. Bubble phase, fires after registry's capture-phase concluded "inside". No registry interaction. | Leave in place. |
| **bubble-required** | stopPropagation that prevents an unrelated bubble-phase listener from firing on a sibling component. Required even after migration. | Leave in place. |

## Audit Process

During each component migration, the implementer audits that component's `stopPropagation` sites, assigns a bucket, records the decision below.

## Audit Entries

| File | Line | Code | Bucket | Notes |
|---|---|---|---|---|
| `src/ui/components/shared/Panel.ts` | (pre-migration) ~69 | `e.stopPropagation()` in `handleKeydown` Escape branch | **must-remove-Escape** | Removed in MED-25 Phase 1. The local handler stopped Escape so a sibling/ancestor keydown wouldn't double-close. After migration the registry owns Escape with innermost-wins semantics, so the local handler and its `stopPropagation` are gone. |
| `src/ui/components/shared/DropdownMenu.ts` | 241 | `e.stopPropagation()` in item-button `click` | **unrelated** | Bubble-phase listener on a menu item. Registry runs in capture phase first, so this cannot interfere with dismiss logic. Left in place — it prevents the click from bubbling to ancestor click handlers (e.g. the parent's toggle button) and reopening the menu. |
| `src/ui/components/shared/DropdownMenu.ts` | 433 | `e.stopPropagation()` for ArrowDown | **safe** | Navigation key. Stops bubbling so global shortcuts don't also receive the key while the menu is focused. Capture-phase registry ignores stopPropagation. Left in place. |
| `src/ui/components/shared/DropdownMenu.ts` | 438 | `e.stopPropagation()` for ArrowUp | **safe** | Same as ArrowDown — left in place. |
| `src/ui/components/shared/DropdownMenu.ts` | 443 | `e.stopPropagation()` for Home | **safe** | Same as ArrowDown — left in place. |
| `src/ui/components/shared/DropdownMenu.ts` | 448 | `e.stopPropagation()` for End | **safe** | Same as ArrowDown — left in place. |
| `src/ui/components/shared/DropdownMenu.ts` | 453 | `e.stopPropagation()` for Enter | **safe** | Stops the Enter from triggering global shortcuts after item selection. Left in place. |
| `src/ui/components/shared/DropdownMenu.ts` | 464 | `e.stopPropagation()` for Space | **safe** | Same as Enter — left in place. |
| `src/ui/components/shared/DropdownMenu.ts` | (pre-migration) 477 | `e.stopPropagation()` for Escape | **must-remove-Escape** | Removed in MED-25 Phase 1. Registry's `dismissOnEscape: true` with innermost-wins semantics replaces this. The whole `case 'Escape':` branch was deleted from `handleKeydown`. |
| `src/ui/components/layout/HeaderBar.ts` | n/a | (no `stopPropagation` / `stopImmediatePropagation` sites) | **n/a** | Audited as part of MED-25 Phase 4 (HeaderBar setTimeout-menu migration). HeaderBar contained four `setTimeout(() => document.addEventListener('click', closeMenu), 0)` shims that worked around the same-tick self-dismiss problem; none used `stopPropagation`. The shims were replaced with `outsideClickRegistry.register({ elements: [menu, anchor], … })`, relying on the register-during-dispatch contract (`OutsideClickRegistry.ts:188-191`) so the synchronous register is invisible to the in-flight click that opened the menu. The trigger anchor is included in `elements` per the footgun docs at `OutsideClickRegistry.ts:96-105`. The existing `closeAllHeaderMenus()` (called at the top of every `show*Menu`) is the re-entry guard. |

---

[^1]: At the start of Phase 0 there were **133** `stopPropagation` / `stopImmediatePropagation` call sites in `src/ui/components/` (excluding `*.test.ts`). Generated via:
    `grep -rn "stopPropagation\|stopImmediatePropagation" src/ui/components/ --include="*.ts" | grep -v ".test.ts" | wc -l`
