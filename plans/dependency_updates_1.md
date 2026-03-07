# Implementation Plan: Dependency Updates

## Executive Summary

| Dependency | Current (package.json) | Resolved | Target | Gap | Risk |
|---|---|---|---|---|---|
| vitest + @vitest/coverage-v8 | ^1.2.0 | 1.6.1 | 4.0.18 | 2 major versions | **HIGH** |
| mediabunny | ^1.28.0 | 1.28.0 | 1.38.1 | 10 minor versions | **MEDIUM** |
| jsdom | ^24.0.0 | 24.1.3 | 28.1.0 | 4 major versions | **MEDIUM** |
| vite | ^6.0.7 | 6.4.1 | 7.3.1 | 1 major version | **MEDIUM-HIGH** |

Environment: Node.js v22.15.0, pnpm 10.8.1, pnpm lockfile v9.

---

## 1. Risk Assessment

### vitest ^1.2.0 (resolved 1.6.1) to 4.0.18 (HIGH RISK)

**Why high risk:**
- Two major version jumps (1.x -> 2.x -> 3.x -> 4.x), each with breaking changes
- 616 test files with ~19,669 tests are affected
- The project uses `globals: true`, `vi.fn()`, `vi.mock()`, `vi.waitFor()` extensively (73+ files)
- `@vitest/coverage-v8` must match vitest major version exactly

**Key breaking changes by version:**
- **Vitest 2.0**: Changed default pool from `threads` to `forks`. `vi.mock()` hoisting behavior became stricter. Minimum Node.js 18 required.
- **Vitest 3.0**: Reporter API changes. New default snapshot serializer. Test isolation behavior changes.

**Note:** No snapshot files (`.snap`) exist in this codebase, so snapshot format changes are not a concern.
- **Vitest 4.0**: Minimum Vite 7 required (hard dependency on upgrading Vite first).

**Critical concern:** Vitest 4.x requires Vite 7.x as a peer dependency. Vite must be upgraded first or simultaneously.

### mediabunny 1.28.0 to 1.38.1 (MEDIUM RISK)

**Why medium risk:**
- Semver minor versions should be backward-compatible, but 10 minor versions is a large gap
- Only 3 source files use mediabunny: `MediabunnyFrameExtractor.ts`, `MediabunnyFrameExtractor.test.ts`, `WaveformRenderer.ts`
- Uses: `Input`, `BlobSource`, `CanvasSink`, `VideoSampleSink`, `ALL_FORMATS`, `AudioBufferSink`

**What could break:**
- `CanvasSink` constructor options changes
- `VideoSampleSink.getSample()` return type changes
- `hasHighDynamicRange()` / `getColorSpace()` return type evolution

### jsdom ^24.0.0 (resolved 24.1.3) to 28.1.0 (MEDIUM RISK)

**Why medium risk:**
- Four major versions, but only used as Vitest test environment
- Extensive polyfills in `test/setup.ts` for: `ImageData`, `PointerEvent`, canvas `getContext`, `URL.createObjectURL`, `requestAnimationFrame`, `ResizeObserver`, `AudioContext`, `File.text()`/`File.arrayBuffer()`
- Newer jsdom may natively support some polyfilled APIs, potentially causing conflicts

### vite ^6.0.7 (resolved 6.4.1) to 7.3.1 (MEDIUM-HIGH RISK)

**Why medium-high risk:**
- One major version jump
- Uses `__dirname` which Vite 7 may deprecate in ESM mode (project has `"type": "module"`)
- Worker config uses `format: 'es'` and `rollupOptions` -- Vite 7 may change worker bundling
- Rollup 5 upgrade (affects `rollupOptions` in both build and worker config)

---

## 2. Upgrade Order

```
Step 1: mediabunny (independent, lowest coupling)
Step 2: jsdom (independent, only test environment)
Step 3: vite 6 -> 7 (required before vitest 4)
Step 4: vitest + @vitest/coverage-v8 1 -> 4 (depends on vite 7)
```

**Rationale:**
- mediabunny and jsdom are independent of each other and of vite/vitest
- Vitest 4.x has a hard peer dependency on Vite 7.x, so Vite must be upgraded first
- mediabunny first: affects only 3 files, validates test suite before touching test infrastructure
- jsdom second: if it breaks polyfills, fix them before vitest changes the test runner

---

## 3. Step-by-Step Implementation

### Step 1: mediabunny 1.28.0 to 1.38.1

**Estimated effort:** 2-4 hours

**Actions:**
1. Read mediabunny changelog for versions 1.29 through 1.38
2. Update `package.json`: `"mediabunny": "^1.38.1"`
3. `pnpm install`
4. `npx tsc --noEmit` -- check for type errors in:
   - `src/utils/media/MediabunnyFrameExtractor.ts`
   - `src/audio/WaveformRenderer.ts`
5. Fix any type errors (API changes to `CanvasSink`, `VideoSampleSink`, `Input`, etc.)
6. `npx vitest run` -- all tests should pass
7. `pnpm build` -- ensure production build works
8. Manual browser test: load video, verify frame extraction, HDR detection, audio waveform

**What to watch for:**
- `CanvasSink` constructor signature (currently `new CanvasSink(videoTrack, { width, height, fit })`)
- `VideoSampleSink.getSample(timestamp)` return type
- `hasHighDynamicRange()` and `getColorSpace()` return type (sync vs async)
- `AudioBufferSink` API changes

**Validation:** `npx tsc --noEmit && npx vitest run && pnpm build`

**Rollback:** `git checkout -- package.json pnpm-lock.yaml && pnpm install`

---

### Step 2: jsdom 24.1.3 to 28.1.0

**Estimated effort:** 2-4 hours

**Actions:**
1. Update `package.json`: `"jsdom": "^28.1.0"`
2. `pnpm install`
3. `npx vitest run` -- check for test failures
4. Expected issues in `test/setup.ts`:
   - Some polyfills may now be unnecessary (jsdom may natively support `PointerEvent`, `File.text()`, `File.arrayBuffer()`)
   - `HTMLCanvasElement.prototype.getContext` override may conflict
5. Fix any test failures caused by DOM behavior changes

**What to watch for:**
- jsdom 25+: `HTMLElement.innerText` behavior changes
- jsdom 26+: `structuredClone` changes
- jsdom 28+: `Blob`/`File` implementation changes

**Validation:** `npx vitest run && npx vitest run --coverage`

**Rollback:** `git checkout -- package.json pnpm-lock.yaml && pnpm install`

---

### Step 3: vite 6.4.1 to 7.3.1

**Estimated effort:** 4-8 hours

**Actions:**
1. Review Vite 7 migration guide
2. Update `package.json`: `"vite": "^7.3.1"`
3. `pnpm install`
4. Fix `__dirname` usage in `vite.config.ts` and `vitest.config.ts`:
   - Replace `__dirname` with `import.meta.dirname` (available in Node 21+)
5. Address Rollup 5 changes:
   - Check `rollupOptions.onwarn` signature in `vite.config.ts`
   - Check worker `rollupOptions.output.entryFileNames`
6. `pnpm build` -- verify production build
7. `pnpm dev` -- verify dev server starts

**Important:** Vitest 1.x may NOT work with Vite 7.x. If so, Steps 3 and 4 must be done simultaneously.

**Validation:** `pnpm build && pnpm dev` (manual check)

**Rollback:** `git checkout -- package.json pnpm-lock.yaml && pnpm install`

---

### Step 4: vitest 1.6.1 to 4.0.18 + @vitest/coverage-v8

**Estimated effort:** 8-16 hours (largest upgrade)

**Actions:**
1. Update `package.json`:
   - `"vitest": "^4.0.18"`
   - `"@vitest/coverage-v8": "^4.0.18"`
2. `pnpm install`
3. Update `vitest.config.ts` if needed (verify `globals`, `environment`, `coverage` settings)
4. `npx tsc --noEmit` -- check for type errors
5. `npx vitest run` -- expect some failures

**Breaking changes to address:**

| Issue | Fix |
|-------|-----|
| Default pool change (v2.0) | Add `pool: 'threads'` to config if needed |
| `vi.mock()` hoisting (v2.0+) | Use `vi.hoisted()` for variables in mock factories |
| Reporter changes (v3.0) | Cosmetic, no code changes unless CI parses output |
| Test isolation (v3.0+) | Fix tests leaking state between files |

6. Fix failures iteratively. With 616 test files, prioritize:
   - Fix `vitest.config.ts` and `test/setup.ts` first
   - Fix shared mock files (`test/mocks.ts`) next
   - Then fix individual test files

**Validation:** `npx tsc --noEmit && npx vitest run && npx vitest run --coverage && pnpm build`

**Rollback:** `git checkout -- package.json pnpm-lock.yaml && pnpm install`

---

## 4. Combined Upgrade Contingency (Steps 3+4)

If Vitest 1.x is incompatible with Vite 7.x (highly likely), perform Steps 3 and 4 atomically:

1. Update `package.json` with vite 7.x AND vitest 4.x + coverage-v8 4.x simultaneously
2. `pnpm install`
3. Fix `vite.config.ts` (`__dirname` -> `import.meta.dirname`)
4. Fix `vitest.config.ts` (`__dirname` -> `import.meta.dirname`, config schema changes)
5. `pnpm build` first (validates vite)
6. `npx vitest run` (validates vitest)
7. Fix issues iteratively

This combined approach is the **recommended** path given the peer dependency constraint.

---

## 5. Global Rollback Strategy

Before starting any upgrades:
1. Ensure clean working tree (`git status`)
2. Create branch: `git checkout -b chore/dependency-upgrades`
3. One commit per successful upgrade step
4. If step fails: `git reset --hard HEAD~1`
5. If everything fails: `git checkout master`

---

## 6. Effort Summary

| Step | Dependency | Hours | Risk |
|---|---|---|---|
| 1 | mediabunny 1.28 -> 1.38 | 2-4h | Medium |
| 2 | jsdom 24 -> 28 | 2-4h | Medium |
| 3+4 | vite 6 -> 7 + vitest 1 -> 4 (combined) | 12-24h | High |
| **Total** | | **16-32h** | |

The vite+vitest combined upgrade dominates due to 616 test files and potential breaking changes in mock hoisting and test isolation.

---

## Critical Files

- `package.json` -- All version specifiers
- `vitest.config.ts` -- Must update for vitest 4.x config schema and `import.meta.dirname`
- `vite.config.ts` -- Must update for Vite 7 (Rollup 5, `import.meta.dirname`, worker config)
- `test/setup.ts` -- May need updates for jsdom 28 compatibility
- `src/utils/media/MediabunnyFrameExtractor.ts` -- Primary mediabunny consumer
- `test/mocks.ts` -- Shared test mocks that may need updates
