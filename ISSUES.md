# Issues

This file tracks findings from exploratory review and targeted validation runs.

## Confirmed Issues

(none remaining)

## Validation Notes

- `pnpm typecheck`: passed
- `pnpm lint`: passed (0 errors, warnings only)
- `pnpm build`: passed
- Targeted Chromium init/layout/mobile checks: passed
- Smoke subset: reproduced `WORKFLOW-001`, `HG-E002`, and `HG-E003`
- Browser spot-check: `Shift+G` and `Shift+A` still work, so the channel shortcut breakage is selective rather than universal
- Isolated reruns of `CS-030`, `EXR-011`, and `SEQ-012`: passed
