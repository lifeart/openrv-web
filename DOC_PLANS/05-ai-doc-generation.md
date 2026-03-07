# Phase 5: AI-Assisted Documentation Generation

## Overview

Use the Claude API to generate documentation drafts from OpenRV Web source code. This phase covers infrastructure setup, prompt design, per-module generation tasks, quality assurance, and incremental update workflows.

**Estimated totals:**
- Source lines: ~31,800 (across 521 non-test `.ts` files)
- API calls: 38-45
- Input tokens: ~900K-1.4M
- Output tokens: ~300K-400K
- Cost: ~$15-25 USD

> **Note on token estimates:** Individual file line counts in section 5.3 are accurate, but the original per-call token estimates were ~2x too low due to an incorrect byte-to-token conversion ratio. The cost estimate remains valid because the underestimates are offset by lower effective per-token pricing with prompt caching.

---

## 5.1 AI Pipeline Infrastructure

### Task 5.1.1: Create Script Skeleton
- **Time estimate:** 30min
- **File:** `docs/scripts/ai-generate.ts`
- **Description:** CLI entry-point accepting `--module <name>`, `--all`, `--dry-run`, `--template <type>`
- **Output:** Generated markdown to `docs/generated/<module>/<filename>.md`
- **Acceptance criteria:** Script runs, parses arguments, exits cleanly in dry-run mode

### Task 5.1.2: Claude API Client Configuration
- **Time estimate:** 20min
- **File:** `docs/scripts/lib/claude-client.ts`
- **Description:** Thin wrapper around `@anthropic-ai/sdk` with:
  - `ANTHROPIC_API_KEY` from environment
  - Default model: `claude-sonnet-4-20250514` (Opus for architecture overviews)
  - Max tokens: 4096 (API ref), 8192 (guides)
  - Temperature: 0.0 for API reference templates, 0.2 for guides/tutorials
  - `generateDoc(prompt, options?) -> Promise<string>`
- **Acceptance criteria:** Authenticates, returns response, handles errors

### Task 5.1.3: Prompt Template System
- **Time estimate:** 30min
- **File:** `docs/scripts/lib/templates.ts`
- **Description:** Template registry: `(sourceCode, metadata) => prompt string`
  - `ModuleMeta`: moduleName, filePath, category, relatedFiles[]
  - 5 template types: api-reference, user-guide, tutorial, faq, architecture
- **System prompt:** Templates should use the API's `system` parameter for persona and constraints (e.g., "You are a technical writer for VFX software. Output only valid markdown.") rather than burying instructions in the user message. Reserve the user message for source code and module-specific context.
- **Acceptance criteria:** All 5 templates registered, each produces valid prompt with system/user separation

### Task 5.1.4: Output Directory and File Naming
- **Time estimate:** 15min
- **File:** `docs/scripts/lib/output.ts`
- **Description:** Output to `docs/generated/{category}/{module-name}.md` with YAML front-matter: `generated: true`, `source_files`, `template`, `generated_at`, `model`, `reviewed: false`
- **Acceptance criteria:** Correct paths, valid front-matter, auto-create directories

### Task 5.1.5: Rate Limiting and Cost Estimation
- **Time estimate:** 20min
- **File:** `docs/scripts/lib/rate-limiter.ts`
- **Description:** Token estimation (~4 chars/token), cost calculation (Sonnet: $3/$15 MTok, Opus: $15/$75 MTok), 5 req/min rate limit, cumulative logging, `--dry-run` support
- **Acceptance criteria:** Estimates within 20% of actual, no 429 errors

---

## 5.2 Prompt Templates

> **Critical:** Every prompt template MUST include 1-2 few-shot examples of ideal output. This is the single biggest factor for generation consistency. Without examples, output quality varies wildly between calls. Each template should show a complete, representative snippet of the expected markdown structure, heading hierarchy, and tone.

### Task 5.2.1: API Reference Enhancement Template
- **Time estimate:** 30min
- **Purpose:** Generate enhanced API reference with usage examples from source code
- **Input per call:** One API class (128-359 lines) + types.ts (63 lines)
- **Output:** 150-400 lines markdown per module
- **Tokens:** ~2K in, ~2K out per call
- **Total calls:** 8 (one per API class)
- **Key instructions in prompt:** Document every public method/property with signature, description, params table, examples using `window.openrv.*`. Add Quick Start and Best Practices sections. Never invent methods not in source. All templates must include the instruction: "Output only the markdown document, with no preamble or reasoning."

### Task 5.2.2: User Guide Draft Template
- **Time estimate:** 30min
- **Purpose:** Generate conceptual user-facing explanation from source code
- **Input per call:** One module (100-2600 lines)
- **Output:** 200-500 lines markdown
- **Tokens:** ~2K-8K in, ~2K-4K out
- **Total calls:** 10-12
- **Key instructions:** Write for VFX professionals, not developers. Use analogies to DaVinci Resolve, Nuke, RV. Include Mermaid diagrams. Do NOT expose internals.

### Task 5.2.3: Tutorial Draft Template
- **Time estimate:** 25min
- **Purpose:** Step-by-step task tutorials
- **Input per call:** API file + core module
- **Output:** 150-300 lines markdown
- **Total calls:** 8-10
- **Key instructions:** "What you'll learn" + "Prerequisites", numbered steps, code snippets, expected results, troubleshooting tips.

### Task 5.2.4: FAQ Generation Template
- **Time estimate:** 20min
- **Purpose:** Q&A pairs from common patterns and edge cases
- **Input per call:** 2-5 related source files
- **Output:** 80-150 lines markdown
- **Total calls:** 6
- **Key instructions:** 8-15 Q&A pairs per area, grouped by theme, base answers strictly on source code.

### Task 5.2.5: Architecture Overview Template
- **Time estimate:** 30min
- **Purpose:** High-level architecture from module structure
- **Input per call:** 3-6 key files + directory listing
- **Output:** 200-400 lines with Mermaid diagrams
- **Tokens:** ~10K-20K in, ~3K-5K out (Opus model)
- **Total calls:** 5

---

## 5.3 Module-Specific Generation Tasks

### 5.3.1: Core -- IPImage
- **Template:** User Guide (5.2.2)
- **Input:** `src/core/image/Image.ts` (387 lines), `ManagedVideoFrame.ts`
- **Output:** `docs/generated/core/ip-image.md` (~250 lines)
- **Review focus:** DataType variants, VideoFrame lifecycle, metadata fields

### 5.3.2: Core -- Session System
- **Template:** Architecture (5.2.5)
- **Input:** `Session.ts` (1382), `SessionGraph.ts` (504), `SessionMedia.ts` (1121), `SessionPlayback.ts` (510), `SessionManager.ts` (516)
- **Output:** `docs/generated/core/session-system.md` (~350 lines)
- **Tokens:** ~15K in, ~4K out (Opus)

### 5.3.3: Render -- Renderer Pipeline
- **Template:** Architecture (5.2.5)
- **Input:** `Renderer.ts` (2480), `ShaderStateManager.ts`, `RenderState.ts`, `viewer.frag.glsl` (1538), `viewer.vert.glsl` (28)
- **Output:** `docs/generated/render/renderer-pipeline.md` (~400 lines)
- **Tokens:** ~18K in, ~5K out (Opus)

### 5.3.4: Render -- Shader System
- **Template:** User Guide (5.2.2)
- **Input:** `ShaderProgram.ts`, `ShaderPipeline.ts`, `ShaderStage.ts`, `viewer.frag.glsl`
- **Output:** `docs/generated/render/shader-system.md` (~300 lines)

### 5.3.5: Color -- CDL
- **Template:** API Ref (5.2.1) + User Guide (5.2.2)
- **Input:** `CDL.ts` (342), `CDLNode.ts`, `ColorAPI.ts` (CDL methods)
- **Output:** `docs/generated/color/cdl.md` (~250 lines)

### 5.3.6: Color -- LUT System
- **Template:** User Guide (5.2.2)
- **Input:** `LUTLoader.ts` (388), `LUTFormats.ts`, `LUTFormatDetect.ts`, `LUTPrecision.ts`, `LUTPresets.ts`, `LUTUtils.ts`, `WebGLLUT.ts` (830), `TetrahedralInterp.ts`
- **Output:** `docs/generated/color/lut-system.md` (~350 lines)

### 5.3.7: Color -- OCIO Integration
- **Template:** Architecture (5.2.5)
- **Input:** `OCIOConfig.ts` (465), `OCIOConfigParser.ts`, `OCIOProcessor.ts` (865), `OCIOTransform.ts` (1440), `OCIOPresets.ts`
- **Output:** `docs/generated/color/ocio-integration.md` (~400 lines)
- **Tokens:** ~12K in, ~4K out (Opus)

### 5.3.8: Color -- Curves and Color Wheels
- **Template:** User Guide (5.2.2)
- **Input:** `ColorCurves.ts` (494), `HueRotation.ts` (147), `ColorWheelsNode.ts` (195)
- **Output:** `docs/generated/color/curves-and-wheels.md` (~250 lines)

### 5.3.9: Color -- Display Pipeline
- **Template:** User Guide (5.2.2)
- **Input:** `DisplayCapabilities.ts` (493), `DisplayTransfer.ts` (264), `TransferFunctions.ts` (388), `BrowserColorSpace.ts` (126), `LogCurves.ts` (420), `AutoExposureController.ts` (110)
- **Output:** `docs/generated/color/display-pipeline.md` (~300 lines)

### 5.3.10-5.3.15: Format Decoders (6 tasks)
- EXR: `EXRDecoder.ts` (2609), `MultiViewEXR.ts` -> ~350 lines
- DPX/Cineon: `DPXDecoder.ts` (354), `CineonDecoder.ts` (183) -> ~200 lines
- HDR/JXL/JP2: `HDRDecoder.ts` (476), `JXLDecoder.ts` (119), `JP2Decoder.ts` (811) -> ~250 lines
- Gainmap: `JPEGGainmapDecoder.ts` (581), `HEICGainmapDecoder.ts` (802), `AVIFGainmapDecoder.ts` (1234) -> ~350 lines
- TIFF/AVIF/HEIC/MXF/RAW: grouped -> ~300 lines
- DecoderRegistry: API ref pattern -> ~200 lines

### 5.3.16-5.3.19: Node System (4 tasks)
- Source nodes: `FileSourceNode.ts` (2198), `VideoSourceNode.ts` (1251), etc. -> ~350 lines
- Group nodes: 6 group classes -> ~300 lines
- Effect nodes: 13 effect classes -> ~400 lines
- Node infrastructure: `IPNode.ts` (205), `NodeFactory.ts` (42), processors -> ~250 lines

### 5.3.20-5.3.28: API Classes (9 tasks)
- One task per API class: PlaybackAPI, MediaAPI, AudioAPI, ViewAPI, ColorAPI, MarkersAPI, EventsAPI, LoopAPI, OpenRVAPI
- Each: ~120-300 lines output, ~2K tokens in/out

### 5.3.29: Plugins -- Plugin System
- **Template:** Architecture (5.2.5) + Tutorial (5.2.3)
- **Input:** `types.ts` (208), `PluginRegistry.ts` (494), `ExporterRegistry.ts`
- **Output:** `plugin-system.md` (~350 lines) + `tutorial-create-plugin.md` (~250 lines)
- **2 API calls**

### 5.3.30: Render -- Additional Components
- **Template:** User Guide (5.2.2)
- **Input:** `CompositingRenderer.ts`, `TransitionRenderer.ts`, `TextureCacheManager.ts`, `LuminanceAnalyzer.ts`, `SphericalProjection.ts`, `FBOPingPong.ts`, `WebGPUBackend.ts`
- **Output:** `docs/generated/render/render-components.md` (~300 lines)

---

## 5.4 Quality Assurance

### Task 5.4.1: Human Review Checklist
- **File:** `docs/review/ai-review-checklist.md`
- Factual accuracy, no hallucinated features, correct signatures, working code examples, consistent terminology, no internal leaks, completeness, valid formatting, front-matter updated

### Task 5.4.2: Fact-Checking Script
- **File:** `docs/scripts/fact-check.ts`
- Extract method names from generated docs (regex on backtick-wrapped identifiers)
- Verify each exists in source via grep
- Report: "X of Y methods verified, Z not found"
- Flag missing methods as critical errors

### Task 5.4.3: Style Guide
- **File:** `docs/style-guide.md`
- Terminology: "OpenRV Web", "IPImage", "Session", "node graph", "source node"
- Tone: professional, concise, no emoji, no first person
- Code examples: always `window.openrv.*`
- Active voice, max heading depth h4

### Task 5.4.4: Output Validation Script
- **Time estimate:** 30min
- **File:** `docs/scripts/validate-output.ts`
- **Description:** Automated validation of generated markdown:
  - Markdown linting via `markdownlint` (heading hierarchy, list formatting, trailing whitespace)
  - Mermaid syntax validation (parse all ` ```mermaid ` blocks, check for syntax errors)
  - Front-matter schema validation (required fields present and correctly typed)
  - Broken internal link detection (cross-reference `[text](path)` links against existing files)
- **Acceptance criteria:** Script exits non-zero on any validation failure, reports all issues with file:line references

### Task 5.4.5: Review Workflow
- **File:** `docs/review/workflow.md`
- Generate -> auto-check -> human review (checklist) -> edit -> mark reviewed -> merge -> track status

---

## 5.5 Incremental Updates

### Task 5.5.0: Content-Hash Caching
- **Time estimate:** 20min
- **File:** `docs/scripts/lib/cache.ts`
- **Description:** Before each API call, compute a SHA-256 hash of `(template content + all source file contents)`. Store the hash alongside the generated output path in `docs/generated/.cache.json`. Skip the API call if the hash matches. This avoids re-calling the API when neither the template nor the source files have changed, even across `--all` runs.
- **Acceptance criteria:** Repeated `--all` runs with no source changes produce zero API calls

### Task 5.5.1: Change Detection Script
- **File:** `docs/scripts/detect-changes.ts`
- Store last gen SHA in `docs/generated/.last-gen-sha`
- `git diff --name-only <sha>..HEAD -- src/` to find changes
- Map changed files to doc modules
- Accept `--since` overrides

### Task 5.5.2: Selective Regeneration
- Extend `ai-generate.ts` with `--changed-only` flag
- Only regenerate affected modules
- Update `.last-gen-sha` after success

### Task 5.5.3: Re-Review Flagging
- Set `reviewed: false` on regenerated files
- Add `regenerated_at` to front-matter
- Update `docs/review/status.json`

### Task 5.5.4: CI Integration (Optional)
- **File:** `.github/workflows/doc-gen.yml`
- Trigger: PR modifying `src/**/*.ts` with `docs` label
- Steps: detect changes -> estimate cost -> generate if <$1 -> post as PR comment
- Guard: require `docs` label to avoid unwanted API costs

---

## AI Generation ROI Guidance

Not all documentation benefits equally from AI generation. Use this to prioritize effort:

**High ROI (proceed with AI):**
- API reference enhancement (8-9 classes with good TSDoc already; reliable expansion)
- FAQ generation (low hallucination risk, high tedium to write manually)
- Tutorial scaffolding (templated structure, easy to review)

**Low ROI (consider writing manually):**
- Architecture overviews (high review burden, often takes as long as writing from scratch)
- Shader/color pipeline docs (highest hallucination risk, expert review mandatory)
- OCIO internals (partially implemented feature; AI will generate aspirational content that misrepresents current state)

**Recommendation:** Prioritize high-ROI tasks in section 5.3 (API classes 5.3.20-5.3.28, FAQs). For low-ROI tasks (5.3.3 Renderer Pipeline, 5.3.7 OCIO, 5.3.4 Shader System), write manually or use AI output only as a rough outline discarded after extracting structure.

---

## Execution Order

```
5.4.3 (Style guide) -- informs all generation
  |
5.1.1-5.1.5 (Infrastructure)
  |
5.2.1-5.2.5 (Templates)
  |
5.4.1 (Review checklist)
  |
5.3.20-5.3.28 (API modules -- smallest, fastest to validate)
  |
5.3.1-5.3.2 (Core) -> 5.3.3-5.3.4 (Render) -> 5.3.5-5.3.9 (Color)
  |
5.3.10-5.3.15 (Formats) -> 5.3.16-5.3.19 (Nodes) -> 5.3.29-5.3.30 (Plugins/extras)
  |
5.4.2, 5.4.4 (QA tooling)
  |
5.5.1-5.5.4 (Incremental updates)
```

## Summary

| Section | Tasks | Time |
|---------|-------|------|
| 5.1 Infrastructure | 5 | ~2h |
| 5.2 Templates | 5 | ~2h 15min |
| 5.3 Generation | 30 | ~2-3h generation + 8-16h review |
| 5.4 QA | 5 | ~3h 30min |
| 5.5 Incremental | 5 | ~3h 20min |
| **Total** | **50** | **~13-27h** |
