# Phase 2: Auto-Generation Scripts

Build scripts that parse source code to produce documentation content automatically. All generators live in `scripts/docs/` and output markdown to `docs/generated/`. Scripts use Node.js with TypeScript (executed via `tsx`).

## Conventions

- **Runtime:** Node.js + `tsx` (TypeScript execution without compilation)
- **Input:** Raw TypeScript source files, parsed with regex/string operations
- **Output:** Markdown files in `docs/generated/`
- **Idempotent:** Running a generator twice produces identical output
- **No heavy dependencies:** Only Node.js built-ins (`fs`, `path`)

---

## 2.1 Keyboard Shortcuts Generator

#### Task 2.1.1: Create shortcuts parser module
- **Time estimate:** 30min
- **Dependencies:** None
- **Input files:** `src/utils/input/KeyBindings.ts`
- **Output files:** `scripts/docs/parse-keybindings.ts`
- **Script logic:**
  1. Read `KeyBindings.ts` as text
  2. Extract each entry from `DEFAULT_KEY_BINDINGS` object: match pattern `'action.name': { code: 'KeyX', ctrl?: true, ... }`
  3. For each entry, extract: action name, code, modifier flags, context, description
  4. Derive human-readable shortcut string: map `KeyX` to `X`, `Digit1` to `1`, `ArrowRight` to right arrow, etc. Prepend modifiers in order: Ctrl, Shift, Alt
  5. Derive category from action name prefix (part before the dot)
  6. Return array of `{ action, shortcut, description, category, context }`
- **Note:** `KeyBindings.ts` already contains `codeToKey()` (line 869) and `describeKeyCombo()` (line 856) functions that convert key codes to human-readable strings. Reuse these rather than reimplementing the mapping logic.
- **Acceptance criteria:** Parser extracts all 100+ bindings; each has non-empty action, shortcut, and description

#### Task 2.1.2: Create shortcuts markdown renderer
- **Time estimate:** 20min
- **Dependencies:** Task 2.1.1
- **Output files:** `scripts/docs/render-shortcuts.ts`
- **Script logic:**
  1. Group bindings by category
  2. For each category, emit `### Category Name` header (title-cased)
  3. Emit markdown table: Action | Shortcut | Description
  4. Sort rows alphabetically by action name
  5. Add auto-generation comment header
- **Acceptance criteria:** Valid markdown; table renders correctly; every binding appears exactly once

#### Task 2.1.3: Create shortcuts generator entry point
- **Time estimate:** 15min
- **Dependencies:** Task 2.1.1, Task 2.1.2
- **Output files:** `scripts/docs/generate-shortcuts.ts` -> `docs/generated/keyboard-shortcuts.md`
- **Script logic:**
  1. Import parser and renderer
  2. Parse `KeyBindings.ts`
  3. Render to markdown
  4. Write to output file
  5. Print summary: `Generated keyboard-shortcuts.md with N shortcuts in M categories`
- **Acceptance criteria:** `npx tsx scripts/docs/generate-shortcuts.ts` produces idempotent output

---

## 2.2 Format Support Matrix Generator

#### Task 2.2.1: Create format registry parser
- **Time estimate:** 45min
- **Dependencies:** None
- **Input files:** `src/formats/DecoderRegistry.ts`, `src/nodes/sources/FileSourceNode.ts`
- **Output files:** `scripts/docs/parse-formats.ts`
- **Script logic:**
  1. Read `DecoderRegistry.ts`
  2. Extract `BuiltinFormatName` union type members: `'exr' | 'DPX' | 'Cineon' | ...`
  3. Build static metadata map with known extensions and HDR support per format:
     ```
     exr:          .exr, .sxr         HDR: yes   linear         image
     DPX:          .dpx               HDR: no    log/linear     image
     Cineon:       .cin, .cineon      HDR: no    log/linear     image
     TIFF:         .tif, .tiff        HDR: yes   linear         image (float)
     jpeg-gainmap: .jpg, .jpeg        HDR: yes   linear         image
     heic-gainmap: .heic              HDR: yes   linear         image
     avif-gainmap: .avif              HDR: yes   linear         image
     avif:         .avif              HDR: no    srgb           image
     raw-preview:  .cr2,.nef,.arw,... HDR: no    srgb           image
     hdr:          .hdr               HDR: yes   linear         image
     jxl:          .jxl               HDR: yes   varies         image
     jp2:          .jp2, .j2k, .j2c   HDR: yes   varies         image
     mxf:          .mxf               HDR: varies varies        video (metadata)
     ```
  4. Cross-reference with `FileSourceNode.ts` extension checks
  5. Return array of format descriptors
- **Acceptance criteria:** All 13 decoders extracted; each has formatName, extensions, HDR flag, colorSpace, type

#### Task 2.2.2: Create format matrix markdown renderer
- **Time estimate:** 20min
- **Dependencies:** Task 2.2.1
- **Output files:** `scripts/docs/render-formats.ts`
- **Script logic:**
  1. Separate into: Image Formats, Video Formats, Session Formats
  2. Emit table: Format Name | Extensions | Color Space | HDR Support | Decoder Type
  3. HDR as checkmark or dash
  4. Add notes for metadata-only decoders (MXF)
- **Acceptance criteria:** Three tables; all 13 formats; valid markdown

#### Task 2.2.3: Create format matrix generator entry point
- **Time estimate:** 15min
- **Dependencies:** Task 2.2.1, Task 2.2.2
- **Output files:** `scripts/docs/generate-formats.ts` -> `docs/generated/format-support.md`
- **Acceptance criteria:** Idempotent output

---

## 2.3 Feature Comparison Matrix Generator

#### Task 2.3.1: Create feature spec file parser
- **Time estimate:** 45-60min
- **Dependencies:** None
- **Input files:** All 38 files in `features/*.md`
- **Output files:** `scripts/docs/parse-features.ts`
- **Script logic:**
  1. Glob `features/*.md`
  2. For each file, extract:
     - **Feature name:** from `# Title` on line 1
     - **Status:** find `## Status` section, look for checked `- [x] (Fully|Partially|Not) implemented`
     - **Requirements:** count total checkboxes vs checked checkboxes. Handle all 4 format variants: checkbox lists (`- [ ]`/`- [x]`), tables with Status column, tables with textual status, and varied heading names. Match headings with prefix `^## Requirements` to catch `## Requirements`, `## Requirements Analysis`, `## Requirements Checklist`, and `## Requirements (Original vs Status)` variants
     - **File slug:** from filename
  3. Return array of `{ name, slug, status, requirementsTotal, requirementsDone }`
- **Acceptance criteria:** All 38 files parsed; each has valid status; requirement counts are non-negative

#### Task 2.3.2: Create comparison matrix renderer
- **Time estimate:** 25min
- **Dependencies:** Task 2.3.1
- **Output files:** `scripts/docs/render-features.ts`
- **Script logic:**
  1. Sort alphabetically
  2. Table: Feature | OpenRV (desktop) | OpenRV Web | Status | Progress
  3. OpenRV column always checkmark
  4. OpenRV Web: checkmark/tilde/dash based on status
  5. Progress: `X/Y` or "N/A"
  6. Summary stats at bottom
- **Acceptance criteria:** 38 rows; correct summary stats; valid markdown

#### Task 2.3.3: Create feature matrix generator entry point
- **Time estimate:** 15min
- **Dependencies:** Task 2.3.1, Task 2.3.2
- **Output files:** `scripts/docs/generate-features.ts` -> `docs/generated/feature-comparison.md`
- **Acceptance criteria:** Idempotent output

---

## 2.4 Node Catalog Generator

#### Task 2.4.1: Create node catalog parser
- **Time estimate:** 40min
- **Dependencies:** None
- **Input files:**
  - `src/nodes/sources/*.ts` (FileSourceNode, VideoSourceNode, SequenceSourceNode, ProceduralSourceNode)
  - `src/nodes/groups/*.ts` (SequenceGroupNode, StackGroupNode, SwitchGroupNode, LayoutGroupNode, FolderGroupNode, RetimeGroupNode)
  - `src/nodes/effects/*.ts` (CDLNode, ColorInversionNode, NoiseReductionNode, SharpenNode, ToneMappingNode, HueRotationNode, HighlightsShadowsNode, DeinterlaceNode, FilmEmulationNode, StabilizationNode, ClarityNode, VibranceNode, ColorWheelsNode, EffectChain)
  - `src/nodes/CacheLUTNode.ts`
  - `src/nodes/base/IPNode.ts`
- **Output files:** `scripts/docs/parse-nodes.ts`
- **Script logic:**
  1. Glob `src/nodes/**/*.ts`, exclude `*.test.ts` and index files
  2. For each file, extract:
     - **Type name:** from `@RegisterNode('TypeName')` or `super('TypeName', ...)`
     - **Class name:** from `export class ClassName extends ...`
     - **Category:** from directory: `sources/` = Source, `groups/` = Group, `effects/` = Effect, root = Utility
     - **Parent class:** from `extends ParentClass`
     - **Description:** from JSDoc comment preceding class declaration
     - **Properties:** from `this.properties.add({ name, defaultValue, min, max, step })`
     - **Label:** from `readonly label = '...'`
     - **Effect category:** from `readonly category: EffectCategory = '...'`
  3. Skip abstract base classes from output (IPNode, BaseSourceNode, BaseGroupNode, EffectNode)
  4. Return array of node descriptors
- **Acceptance criteria:** All concrete node classes extracted (~24 total); each has type, className, category, description

#### Task 2.4.2: Create node catalog markdown renderer
- **Time estimate:** 25min
- **Dependencies:** Task 2.4.1
- **Output files:** `scripts/docs/render-nodes.ts`
- **Script logic:**
  1. Group by category (Source, Group, Effect, Utility)
  2. For each node: `### NodeType (ClassName)` with description, label, effect category, properties table
  3. Add hierarchy diagram at top: IPNode -> Base classes -> concrete classes
- **Acceptance criteria:** All concrete nodes appear; properties tables complete; valid markdown

#### Task 2.4.3: Create node catalog generator entry point
- **Time estimate:** 15min
- **Dependencies:** Task 2.4.1, Task 2.4.2
- **Output files:** `scripts/docs/generate-nodes.ts` -> `docs/generated/node-catalog.md`
- **Acceptance criteria:** Idempotent output

---

## 2.5 Effect Catalog Generator

#### Task 2.5.1: Create effect adapter parser
- **Time estimate:** 30min
- **Dependencies:** None
- **Input files:**
  - `src/effects/ImageEffect.ts` (interface)
  - `src/effects/adapters/*.ts` (CDLEffect, ColorInversionEffect, HueRotationEffect, HighlightsShadowsEffect, ToneMappingEffect, DeinterlaceEffect, FilmEmulationEffect, StabilizationEffect, NoiseReductionEffect)
  - `src/effects/index.ts`
- **Output files:** `scripts/docs/parse-effects.ts`
- **Script logic:**
  1. Read `src/effects/index.ts` for canonical list
  2. For each adapter, extract: name, label, category, parameters (from JSDoc), description, implementation path
  3. Return array of effect descriptors
- **Acceptance criteria:** All 9 adapter effects extracted; each has name, label, category, description

#### Task 2.5.2: Create effect catalog markdown renderer
- **Time estimate:** 20min
- **Dependencies:** Task 2.5.1
- **Output files:** `scripts/docs/render-effects.ts`
- **Script logic:**
  1. Group by category (color, tone, spatial, diagnostic)
  2. Summary table: Name | Label | Parameters | Description
  3. Explain ImageEffect interface and EffectRegistry pattern
- **Acceptance criteria:** All 9 effects; grouped correctly; valid markdown

#### Task 2.5.3: Create effect catalog generator entry point
- **Time estimate:** 15min
- **Dependencies:** Task 2.5.1, Task 2.5.2
- **Output files:** `scripts/docs/generate-effects.ts` -> `docs/generated/effect-catalog.md`
- **Acceptance criteria:** Idempotent output

---

## 2.6 Event Reference Generator

#### Task 2.6.1: Create events API parser
- **Time estimate:** 35min
- **Dependencies:** None
- **Input files:** `src/api/EventsAPI.ts`
- **Output files:** `scripts/docs/parse-events.ts`
- **Script logic:**
  1. Extract `OpenRVEventName` union type members (13 event names, including `audioScrubEnabledChange`)
  2. Extract `OpenRVEventData` interface members with typed payloads
  3. Extract JSDoc from `on()`, `off()`, `once()` methods
  4. Parse `wireInternalEvents()` to map public -> internal event names
  5. Return array of `{ eventName, dataType, fields, internalEvent, description }`
- **Parsing notes:**
  - `OpenRVEventName` spans 14 lines (multi-line union type); needs multiline regex or line-by-line accumulation (unlike single-line `BuiltinFormatName`)
  - `stop` and `error` events are NOT wired in `wireInternalEvents()` — consider a hardcoded mapping for these instead of relying solely on parsing
  - `play`, `pause`, `stop` have `void` data types (no payload)
  - `markerChange` has a nested type `Array<{ frame: number }>` — regex parsing of `OpenRVEventData` must handle nested braces
- **Acceptance criteria:** All 13 events extracted; correct data type fields; void events have empty fields

#### Task 2.6.2: Create event reference markdown renderer
- **Time estimate:** 20min
- **Dependencies:** Task 2.6.1
- **Output files:** `scripts/docs/render-events.ts`
- **Script logic:**
  1. Overview section explaining `on/off/once` pattern
  2. Summary table: Event Name | Data Type | Description
  3. Detailed section per event: data fields table + code example
- **Acceptance criteria:** All 13 events documented; code examples valid; valid markdown

#### Task 2.6.3: Create event reference generator entry point
- **Time estimate:** 15min
- **Dependencies:** Task 2.6.1, Task 2.6.2
- **Output files:** `scripts/docs/generate-events.ts` -> `docs/generated/event-reference.md`
- **Acceptance criteria:** Idempotent output

---

## 2.7 Pipeline Orchestration

#### Task 2.7.1: Create generate-all orchestration script
- **Time estimate:** 20min
- **Dependencies:** Tasks 2.1.3, 2.2.3, 2.3.3, 2.4.3, 2.5.3, 2.6.3
- **Output files:** `scripts/docs/generate-all.ts`
- **Script logic:**
  1. Import all 6 generators
  2. Create `docs/generated/` if needed
  3. Run each generator, catching errors per-generator
  4. Print summary report:
     ```
     Documentation Generation Complete
     ==================================
     [OK] keyboard-shortcuts.md  (N shortcuts)
     [OK] format-support.md      (N formats)
     [OK] feature-comparison.md  (N features)
     [OK] node-catalog.md        (N nodes)
     [OK] effect-catalog.md      (N effects)
     [OK] event-reference.md     (N events)
     ```
  5. Exit with code 0 if all succeeded, 1 if any failed
- **Acceptance criteria:** Produces all 6 files; prints summary; exit code reflects success/failure

#### Task 2.7.2: Add npm script for documentation generation
- **Time estimate:** 10min
- **Dependencies:** Task 2.7.1
- **Description:** Add to `package.json`:
  - `"docs:generate": "tsx scripts/docs/generate-all.ts"`
  - `"docs:check": "tsx scripts/docs/generate-all.ts --check"` (verify freshness for CI)
- **Acceptance criteria:** `pnpm docs:generate` runs all generators

#### Task 2.7.3: Add .gitignore entry for generated docs
- **Time estimate:** 5min
- **Dependencies:** Task 2.7.1
- **Description:** Add `docs/generated/` to `.gitignore` (or leave commented if team prefers tracking)
- **Acceptance criteria:** Decision documented

#### Task 2.7.4: Add tsx as dev dependency
- **Time estimate:** 5min
- **Dependencies:** None
- **Description:** `pnpm add -D tsx` (or verify it's already installed)
- **Acceptance criteria:** `npx tsx` works

#### Task 2.7.5: Create shared utilities module
- **Time estimate:** 20min
- **Dependencies:** None (can be done first)
- **Output files:** `scripts/docs/utils.ts`
- **Functions:**
  - `readSourceFile(relativePath)` -- reads file relative to project root
  - `writeGeneratedFile(relativePath, content)` -- writes to `docs/generated/` with auto-gen header
  - `extractJSDoc(source, beforePattern)` -- extracts JSDoc comment before a pattern
  - `toTitleCase(slug)` -- `kebab-case` to `Title Case`
  - `autoGenHeader(sourceFile)` -- returns auto-generation comment
  - `projectRoot` -- resolved path to project root
- **Acceptance criteria:** All utility functions work; used by 3+ generators

---

## Task Dependency Graph

```
Task 2.7.5 (shared utils)
    |
    +---> Task 2.1.1 --> Task 2.1.2 --> Task 2.1.3 ----+
    +---> Task 2.2.1 --> Task 2.2.2 --> Task 2.2.3 ----+
    +---> Task 2.3.1 --> Task 2.3.2 --> Task 2.3.3 ----+
    +---> Task 2.4.1 --> Task 2.4.2 --> Task 2.4.3 ----+--> Task 2.7.1 --> 2.7.2
    +---> Task 2.5.1 --> Task 2.5.2 --> Task 2.5.3 ----+        |
    +---> Task 2.6.1 --> Task 2.6.2 --> Task 2.6.3 ----+        +--> 2.7.3
                                                                  |
                                                     Task 2.7.4 --+
```

## Estimated Total Time

| Section | Tasks | Time |
|---------|-------|------|
| 2.1 Keyboard Shortcuts | 3 | ~65min |
| 2.2 Format Support Matrix | 3 | ~80min |
| 2.3 Feature Comparison | 3 | ~90min |
| 2.4 Node Catalog | 3 | ~80min |
| 2.5 Effect Catalog | 3 | ~65min |
| 2.6 Event Reference | 3 | ~75min |
| 2.7 Pipeline Orchestration | 5 | ~60min |
| **Total** | **23** | **~8 hours** |

## Output File Summary

| Generator | Output Path | Source(s) |
|-----------|-------------|-----------|
| Shortcuts | `docs/generated/keyboard-shortcuts.md` | `src/utils/input/KeyBindings.ts` |
| Formats | `docs/generated/format-support.md` | `src/formats/DecoderRegistry.ts`, `src/nodes/sources/FileSourceNode.ts` |
| Features | `docs/generated/feature-comparison.md` | `features/*.md` (38 files) |
| Nodes | `docs/generated/node-catalog.md` | `src/nodes/**/*.ts` (~24 node classes) |
| Effects | `docs/generated/effect-catalog.md` | `src/effects/adapters/*.ts` (9 adapters) |
| Events | `docs/generated/event-reference.md` | `src/api/EventsAPI.ts` |
