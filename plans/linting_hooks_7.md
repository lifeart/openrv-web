# Implementation Plan: Linting & Pre-Commit Hooks

## 1. Current State

| Aspect | Status |
|---|---|
| ESLint config | None |
| Prettier / formatter | None |
| EditorConfig | None |
| Pre-commit hooks | None |
| TypeScript strict mode | Enabled (all strict flags) |
| Suppress comments | Only 25 `@ts-ignore`/`@ts-expect-error` across 9 files |
| Code style | 2-space indent, single quotes, semicolons (consistent) |
| Codebase size | 1,004 .ts files, 467K LOC |

---

## 2. ESLint Setup

### 2.1 Version: ESLint v9 with Flat Config

No existing config means no migration burden -- start clean with flat config.

### 2.2 Dependencies

```bash
pnpm add -D eslint@^9 \
  @eslint/js \
  typescript-eslint \
  eslint-plugin-import-x \
  eslint-config-prettier \
  globals
```

### 2.3 Config: `eslint.config.mjs`

```js
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import importPlugin from 'eslint-plugin-import-x';
import prettierConfig from 'eslint-config-prettier';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: [
      'dist/**', 'node_modules/**', 'coverage/**', 'docs/**',
      'playwright-report/**', 'test-results/**', '**/*.d.ts',
    ],
  },

  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  prettierConfig,

  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.worker,
        VideoFrame: 'readonly',
        VideoDecoder: 'readonly',
        VideoEncoder: 'readonly',
        ImageBitmap: 'readonly',
        OffscreenCanvas: 'readonly',
      },
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: { 'import-x': importPlugin },
    settings: {
      'import-x/resolver': { typescript: { alwaysTryTypes: true } },
    },
    rules: {
      // Style
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'prefer-const': 'error',
      'no-var': 'error',
      'eqeqeq': ['error', 'always', { null: 'ignore' }],
      'curly': ['error', 'multi-line'],
      'no-throw-literal': 'error',

      // TypeScript
      '@typescript-eslint/no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
      }],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/consistent-type-imports': ['error', {
        prefer: 'type-imports',
        fixStyle: 'separate-type-imports',
      }],
      '@typescript-eslint/no-non-null-assertion': 'warn',
      '@typescript-eslint/no-empty-function': 'off',
      '@typescript-eslint/no-inferrable-types': 'off',

      // Imports
      'import-x/order': ['error', {
        groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index', 'type'],
        'newlines-between': 'never',
        alphabetize: { order: 'asc', caseInsensitive: true },
      }],
      'import-x/no-duplicates': 'error',
    },
  },

  // Test file overrides
  {
    files: ['**/*.test.ts', '**/*.spec.ts', '**/test-helper.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      'no-console': 'off',
    },
  },

  // Worker overrides
  {
    files: ['src/workers/**/*.ts'],
    languageOptions: { globals: { ...globals.worker, self: 'readonly' } },
  },
);
```

### 2.4 Rules Rationale

| Rule | Level | Why |
|---|---|---|
| `no-console` | warn | ~40 files have console usage; clean up gradually |
| `prefer-const` / `no-var` | error | Matches existing style |
| `consistent-type-imports` | error | Already used in many places; auto-fixable |
| `no-explicit-any` | warn | Only ~39 occurrences; upgrade to error later |
| `import-x/order` | error | Auto-fixable; enforces consistent grouping |

---

## 3. Formatter: Prettier

### 3.1 Why Prettier

- Industry standard with excellent IDE integration
- Project already follows Prettier-compatible conventions
- `eslint-config-prettier` cleanly separates formatting from linting

### 3.2 Install

```bash
pnpm add -D prettier
```

### 3.3 Config: `.prettierrc.json`

```json
{
  "semi": true,
  "singleQuote": true,
  "trailingComma": "all",
  "tabWidth": 2,
  "printWidth": 120,
  "bracketSpacing": true,
  "arrowParens": "always",
  "endOfLine": "lf"
}
```

### 3.4 `.prettierignore`

```
dist/
node_modules/
coverage/
docs/api/
docs/generated/
docs/.vitepress/dist/
docs/.vitepress/cache/
pnpm-lock.yaml
playwright-report/
test-results/
*.md
```

### 3.5 `.editorconfig`

```ini
root = true

[*]
indent_style = space
indent_size = 2
end_of_line = lf
charset = utf-8
trim_trailing_whitespace = true
insert_final_newline = true

[*.md]
trim_trailing_whitespace = false
```

---

## 4. Pre-Commit Hooks

### 4.1 Tool: `simple-git-hooks` + `lint-staged`

- Zero-dependency, config in `package.json`
- Used by Vite itself
- `lint-staged` only processes staged files (1-3s per commit, not 467K LOC)

### 4.2 Install

```bash
pnpm add -D simple-git-hooks lint-staged
```

### 4.3 Config in `package.json`

```json
{
  "simple-git-hooks": {
    "pre-commit": "pnpm lint-staged"
  },
  "lint-staged": {
    "*.ts": [
      "eslint --fix --max-warnings=0",
      "prettier --write"
    ]
  }
}
```

### 4.4 Setup

Add `prepare` script for automatic hook installation:

```json
{
  "scripts": {
    "prepare": "simple-git-hooks"
  }
}
```

Run once: `pnpm simple-git-hooks`

### 4.5 Performance

- **lint-staged** only processes staged files, not the full codebase
- **No typecheck in pre-commit** -- `tsc` needs full project context and takes 10-30s. Already enforced in CI.
- **`--max-warnings=0`** prevents new warnings while allowing existing ones to be cleaned up gradually

---

## 5. CI Integration

### New workflow: `.github/workflows/lint.yml`

```yaml
name: Lint & Format

on:
  pull_request:
    branches: [master]

permissions:
  contents: read

concurrency:
  group: lint-${{ github.event.pull_request.number }}
  cancel-in-progress: true

jobs:
  lint:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 9
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'
      - run: pnpm install
      - name: ESLint
        run: pnpm lint --max-warnings=0
      - name: Prettier check
        run: pnpm format:check
      - name: TypeScript check
        run: pnpm typecheck
```

---

## 6. Package.json Scripts to Add

```json
{
  "scripts": {
    "lint": "eslint .",
    "lint:fix": "eslint --fix .",
    "format": "prettier --write \"src/**/*.ts\" \"*.{ts,mjs,json}\"",
    "format:check": "prettier --check \"src/**/*.ts\" \"*.{ts,mjs,json}\"",
    "prepare": "simple-git-hooks"
  }
}
```

---

## 7. Migration Strategy

### Phase 1: Foundation (1 PR)
1. Install all dependencies
2. Create `eslint.config.mjs`, `.prettierrc.json`, `.prettierignore`, `.editorconfig`
3. Add scripts to `package.json`
4. `pnpm prettier --write` on entire codebase -- commit: "chore: format codebase with prettier"
5. `pnpm eslint --fix .` -- commit: "chore: auto-fix eslint rules"
6. Verify `pnpm test` and `pnpm typecheck` still pass

Large PR but purely mechanical. Review focuses on confirming no behavioral changes.

### Phase 2: Enforcement (same or follow-up PR)
1. Add `simple-git-hooks` and `lint-staged` config
2. Create `.github/workflows/lint.yml`
3. Run `pnpm simple-git-hooks`

### Phase 3: Warning Cleanup (gradual, subsequent PRs)
1. Fix `no-console` warnings file-by-file
2. Fix `@typescript-eslint/no-explicit-any` warnings
3. Upgrade `warn` rules to `error` once count reaches zero

### Phase 4: Advanced Rules (future, optional)
1. Type-aware rules (`no-floating-promises`, `await-thenable`)
2. `eslint-plugin-vitest` for test best practices
3. `eslint-plugin-unicorn` for modern JS

### Execution Order

```
1. pnpm add -D eslint @eslint/js typescript-eslint eslint-plugin-import-x eslint-config-prettier globals prettier simple-git-hooks lint-staged
2. Create eslint.config.mjs
3. Create .prettierrc.json, .prettierignore, .editorconfig
4. Add scripts + hooks config to package.json
5. pnpm prettier --write "src/**/*.ts" "*.{ts,mjs,json}"
6. git commit -m "chore: format codebase with prettier"
7. pnpm eslint --fix .
8. git commit -m "chore: auto-fix eslint rules"
9. pnpm test && pnpm typecheck   (verify no breakage)
10. pnpm lint   (review remaining warnings)
11. Create .github/workflows/lint.yml
12. pnpm simple-git-hooks
13. git commit -m "chore: add linting, formatting, and pre-commit hooks"
```

---

## Files Summary

**Create:**
- `eslint.config.mjs`
- `.prettierrc.json`
- `.prettierignore`
- `.editorconfig`
- `.github/workflows/lint.yml`

**Modify:**
- `package.json` -- devDependencies, scripts, simple-git-hooks, lint-staged config
