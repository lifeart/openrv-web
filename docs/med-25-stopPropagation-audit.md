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
| TBD | | | | |

---

[^1]: At the start of Phase 0 there were **133** `stopPropagation` / `stopImmediatePropagation` call sites in `src/ui/components/` (excluding `*.test.ts`). Generated via:
    `grep -rn "stopPropagation\|stopImmediatePropagation" src/ui/components/ --include="*.ts" | grep -v ".test.ts" | wc -l`
