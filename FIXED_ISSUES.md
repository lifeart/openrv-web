# Fixed Issues

## Issue #7: Lint is already red because the Vitest setup file imports `vitest` twice

- **Severity**: Medium
- **Area**: Repo hygiene, test tooling
- **Root Cause**: `vitest` was imported separately at line 6 (`vi`) and line 186 (`beforeEach`) in `test/setup.ts`, violating the `import-x/no-duplicates` lint rule.
- **Fix**: Consolidated into a single `import { vi, beforeEach } from 'vitest'` at line 6, removed the duplicate import at line 186.
- **Verification**: `pnpm lint` passes (no `import-x/no-duplicates` errors), all 21,707 tests pass.
- **Files Changed**: `test/setup.ts`
