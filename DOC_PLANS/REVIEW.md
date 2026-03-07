# Expert Review Summary

Six independent reviewers analyzed all 6 documentation plans. Below are the consolidated findings.

---

## Critical Blockers (Must Fix Before Implementation)

### P0: TypeDoc + `moduleResolution: "bundler"` incompatibility
- **Plan:** 01 (Task 1.2.2)
- **Issue:** Project uses `"moduleResolution": "bundler"` and `"allowImportingTsExtensions": true` in tsconfig. TypeDoc uses the TS compiler API to resolve modules and will likely fail with this config.
- **Fix:** Create `tsconfig.typedoc.json` extending base config with `"moduleResolution": "node"` and `"allowImportingTsExtensions": false`.

### P0: `docs/api/index.md` gitignored by `docs/api/` pattern
- **Plan:** 01 (Tasks 1.2.5 vs 1.3.4)
- **Issue:** Task 1.2.5 gitignores `docs/api/`. Task 1.3.4 creates a hand-written `docs/api/index.md`. The hand-written page will never be committed.
- **Fix:** Either move the hand-written page outside `docs/api/` or use a more specific gitignore pattern (`docs/api/*.md !docs/api/index.md`).

### P0: Screenshot count mismatch
- **Plans:** 03 vs 06
- **Issue:** Phase 3 produces only 25 screenshots, but Phase 6 references ~80 screenshot IDs (SS-001 through SS-111). The vast majority of screenshots needed for the user guide don't exist in Phase 3.
- **Fix:** Expand Phase 3 to ~80 screenshots, or add a screenshot sub-phase to Phase 6.

### P0: Test helper API names are wrong
- **Plan:** 03 (Tasks 3.2.10, 3.3.4, 3.4.8)
- **Issue:** Plan references non-existent APIs:
  - `addMarker` -> actual: `setMarker(frame, note, color)`
  - `toggleVectorscope` -> doesn't exist; use keyboard `v` or scopes dropdown
  - `setZebraStripesEnabled` -> doesn't exist; use `toggleZebraHigh()`/`toggleZebraLow()`
  - `setSafeAreasEnabled` -> doesn't exist; use `toggleSafeAreasTitleSafe()` etc.
- **Fix:** Update plan to use actual `window.__OPENRV_TEST__` mutation names from `src/test-helper.ts`.

---

## Significant Errors (Will Cause Problems)

### Pipeline stage ordering errors
- **Plan:** 04 (Section 4.2.1)
- **Issue:** The plan's 23-stage pipeline has ordering errors vs the actual shader (`viewer.frag.glsl`):
  - Color wheels (6a) come BEFORE CDL (6b), not after (plan reverses these)
  - Plan omits ~12 stages: deinterlace, perspective correction, spherical projection, channel swizzle, unpremultiply, linearize, input primaries, per-channel scale/offset, inline 1D LUT, film emulation, gamut mapping, output primaries
  - Actual shader has ~35 stages, not 23

### "Single LUT slot" claim is wrong
- **Plan:** 04 (Section 4.3.2)
- **Issue:** The shader has THREE LUT slots: `u_fileLUT3D` (input device), `u_lookLUT3D` (creative grade), `u_displayLUT3D` (display calibration). This actually closely matches OpenRV's multi-point model.

### GPU uses trilinear, not tetrahedral interpolation
- **Plan:** 04 (Section 4.3.1)
- **Issue:** GPU path uses hardware trilinear interpolation via `texture(lut, coord)`. Tetrahedral interpolation exists only in the CPU path (`TetrahedralInterp.ts`).

### Event count is 13, not 12
- **Plan:** 02 (Section 2.6)
- **Issue:** `OpenRVEventName` has 13 members (includes `audioScrubEnabledChange`). Plan says 12.

### TypeDoc `entryPointStrategy: "expand"` wrong for barrel file
- **Plan:** 01 (Task 1.2.2)
- **Issue:** `"expand"` with a single `.ts` barrel file won't follow re-exports. Should use `"resolve"` (default) or point to the directory.

### API class count is 9, not 8
- **Plan:** 01 (multiple tasks)
- **Issue:** Plan says "8 API classes" but there are 9 (OpenRVAPI, PlaybackAPI, MediaAPI, AudioAPI, LoopAPI, ViewAPI, ColorAPI, MarkersAPI, EventsAPI).

---

## Missing Steps

### Feature spec staleness
- **Plans:** 04, 06
- **Issue:** `features/color-management.md` lists OCIO, HDR tone mapping, multi-point LUT as "Not implemented," but README treats them as implemented. Writers need a single source of truth.

### No TypeDoc sidebar integration
- **Plan:** 01
- **Issue:** `typedoc-vitepress-theme` generates `typedoc-sidebar.json` that should be imported into VitePress config. Plan manually lists sidebar items instead.

### Session management duplication
- **Plan:** 06
- **Issue:** Tasks 6.7.5 and 6.8.4 both source from `features/session-management.md`. EDL/OTIO also duplicated across 6.7.4 and 6.8.10.

### False color/zebra overlap
- **Plan:** 06
- **Issue:** Covered in both Task 6.5.5 (scopes section) and Task 6.8.8 (overlays section).

### Missing user guide topics
- **Plan:** 06
- **Issue:** No pages for: image sequences, EXR multi-layer/AOV workflow, channel isolation, RV session migration, viewer navigation (pan/zoom), first-time user onboarding.

### No maintenance plan
- **Plan:** 06
- **Issue:** No defined page ownership, review cadence, or strategy for keeping docs in sync with code. Auto-generated content from Phase 2 should feed into Phase 6 pages.

---

## Unrealistic Estimates

| Plan | Task | Claimed | Realistic | Issue |
|------|------|---------|-----------|-------|
| 01 | 1.2.4 (TypeDoc verify) | 30min | 2-4h | `bundler` moduleResolution debugging |
| 02 | 2.3 (Feature comparison) | 70min | 90min | 4 format variants in feature specs |
| 02 | 2.6 (Event reference) | 60min | 75min | Multi-line union, nested types |
| 05 | Token estimates | 450-550K | 900K-1.4M | File sizes underestimated ~2x |
| 05 | Total cost | $15-25 | $11-18 | Token underestimates offset by lower per-token cost |
| 06 | Total word count | 28K | 32-35K | Primary Controls, Stereo, Overlays undersized |

---

## Parsing Feasibility (Plan 02)

### Works well with regex:
- `DEFAULT_KEY_BINDINGS` -- regular structure, `codeToKey()` already exists for reuse
- `BuiltinFormatName` -- single-line union, trivial regex
- `@RegisterNode('...')` -- single-line decorators
- Effect adapters -- uniform object literals

### Needs care:
- `OpenRVEventName` -- multi-line union (14 lines), needs multiline regex
- `OpenRVEventData` -- nested types like `Array<{ frame: number }>`, fragile with regex
- Feature spec Requirements -- 4 format variants: checkbox lists, tables with Status column, tables with textual status, varied heading names (`## Requirements`, `## Requirements Analysis`, `## Requirements Checklist`)
- `wireInternalEvents()` -- imperative closures, `stop` and `error` events aren't wired there. Consider hardcoded mapping instead.

### Bonus: Existing reusable code
- `codeToKey()` function in `KeyBindings.ts` (line 869) already converts key codes to human-readable strings. Plan should reuse it, not reimplement.

---

## AI Generation ROI (Plan 05)

### High ROI (proceed):
- API reference enhancement (8 classes, good TSDoc already, reliable expansion)
- FAQ generation (low hallucination risk, high tedium to write manually)
- Tutorial scaffolding (templated structure)

### Low ROI (consider manual):
- Architecture overviews (high review burden, ~same time as writing from scratch)
- Shader/color pipeline docs (highest hallucination risk, expert review mandatory)
- OCIO internals (partially implemented feature, will generate aspirational content)

### Missing from pipeline:
- No few-shot examples in prompt templates (biggest quality gap)
- No output validation (markdown linting, Mermaid syntax checking)
- No caching mechanism (re-calls API for unchanged inputs)
- No system prompt (persona and constraints buried in user message)
- No concurrent API calls (sequential wastes time)

---

## CI/Screenshots Risks (Plan 03)

- **SwiftShader quality:** Ubuntu CI uses software GL. Screenshots will look different from hardware-accelerated rendering. For documentation-quality output, consider macOS runner with real GPU.
- **Auto-commit risk:** No human review before committing screenshots on release. Broken screenshots (black canvas, partial render) could be committed.
- **Canvas stability:** Proposed `waitForCanvasStable` has no specified algorithm. WebGL non-determinism is a real concern.

---

## Legal (Plan 04)

- Apache 2.0 attribution approach is legally correct.
- **Missing:** Check for OpenRV NOTICE file (Apache 2.0 Section 4(d) requires reproducing it).
- **Refinement:** Attribution header should only apply to sections actually adapted from OpenRV, not original content.
- **URLs:** All 8 referenced documentation URLs are valid but should be pinned to specific commit SHAs.

---

## Top 10 Action Items (Priority Order)

1. **Create `tsconfig.typedoc.json`** with node moduleResolution (blocks Phase 1)
2. **Fix `docs/api/` gitignore conflict** (blocks Phase 1)
3. **Expand Phase 3 to ~80 screenshots** or decouple from Phase 6 (blocks Phase 6)
4. **Fix test helper API names** in Phase 3 plan (blocks implementation)
5. **Correct pipeline stage ordering** and LUT slot count in Phase 4 (factual errors)
6. **Merge duplicated pages** in Phase 6 (sessions, EDL/OTIO, false color/zebra)
7. **Add missing topics** to Phase 6 (sequences, EXR AOV, channel isolation, viewer nav)
8. **Update feature specs** to match README (especially color-management.md OCIO status)
9. **Add few-shot examples** to AI prompt templates in Phase 5
10. **Add maintenance plan** to Phase 6 (ownership, review cadence)
