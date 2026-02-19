# OpenRV Compatibility Plan

> Cross-referenced against ASWF OpenRV v3.1, Node Reference (Ch.16),
> Pixel Pipeline (Ch.7), and the `rvSession.py` Python API.
>
> Each item lists: the gap, affected files, implementation steps, and required tests.
>
> **Reviewed by:** VFX Color Pipeline Expert, OpenRV GTO Format Expert, QA Test Coverage Reviewer.
> All review findings incorporated inline (marked with `[REVIEW]`).

---

## Priority Tiers

| Tier | Criteria |
|------|----------|
| **P0 -- Critical** | Breaks .rv session round-trip; loaded sessions render incorrectly |
| **P1 -- High** | Common VFX workflow blocked; data loss on load/save |
| **P2 -- Medium** | Feature parity gap; workarounds exist |
| **P3 -- Low** | Nice-to-have; rarely used in web context |

---

## P0 -- Critical: Session Fidelity

### 0.0 GTO `connections` object parsing [NEW - from review]

**Gap:** The loader (`GTOGraphLoader.ts`) reconstructs graph topology exclusively
from `mode.inputs` on each node. It never parses the `connections` object that
desktop OpenRV writes (with `evaluation.lhs`/`evaluation.rhs` pairs and
`top.nodes`). Meanwhile, the exporter *does* write a proper `connections` object
via `buildConnectionObject()` (line 468-484). This means:
- Sessions exported by openrv-web include a `connections` object that is never
  consumed on re-import.
- Desktop OpenRV sessions that rely on `connections` for topology (rather than
  `mode.inputs`) will have their graph connectivity silently broken.

**Impact:** Broken graph topology = no correct rendering for complex sessions.

**Files to change:**
- `src/core/session/GTOGraphLoader.ts` -- parse `connections` evaluation object
- `src/core/session/GTOGraphLoader.test.ts`

**Steps:**
1. Identify `connection` protocol objects in the GTO DTO iteration (currently
   skipped because `'connection'` is not in `PROTOCOL_TO_NODE_TYPE`).
2. Parse `evaluation.lhs` / `evaluation.rhs` arrays to build an edge list.
3. Parse `top.nodes` to extract the root evaluation node.
4. Use `connections` as a **fallback** when `mode.inputs` is absent or empty.
   When both exist, prefer `mode.inputs` (it's the per-node authoritative source).
5. Handle source-to-group membership: `RVSourceGroup` containers encode which
   source belongs to which pipeline via `connections`, not `mode.inputs`.

**Tests:**

*Unit -- GTOGraphLoader:*
- GTO with `connections` only (no `mode.inputs`) -> graph wired correctly
- GTO with both `connections` and `mode.inputs` -> `mode.inputs` takes precedence
- GTO with `RVSourceGroup` membership via `connections` -> correct source-to-pipeline wiring
- Malformed `connections` (missing lhs/rhs) -> graceful skip with warning

---

### 0.1 Per-channel RVColor arrays

**Gap:** OpenRV's `RVColor.color.exposure`, `.gamma`, `.contrast` are `float[3]`
(per-channel R/G/B). `GTOSettingsParser.parseColorAdjustments()` reads only the
first scalar value via `getNumberValue()`, discarding per-channel data.

**[REVIEW] Scope clarification:** `GTOGraphLoader.ts` (lines 555-579) already
preserves raw per-channel arrays in `nodeInfo.properties`. The `SessionGTOExporter`
`buildColorObject()` already handles per-channel via `toFloatArray()`. The actual
gap is only in `GTOSettingsParser` and the renderer/shader side.

**Impact:** Any session with per-channel color grades loads with wrong colors.

**Files to change:**
- `src/core/session/GTOSettingsParser.ts` -- `parseColorAdjustments()`
- `src/core/types/color.ts` -- `ColorAdjustments` type
- `src/render/Renderer.ts` / `ShaderStateManager.ts` -- shader uniforms
- `src/render/shaders/viewer.frag.glsl` -- per-channel uniform consumption

**Steps:**
1. Extend `ColorAdjustments` with optional `exposureRGB`, `gammaRGB`,
   `contrastRGB` fields (`[number, number, number]`).
2. In `parseColorAdjustments()`, call `getNumberArray()` first; if length >= 3
   populate per-channel fields. Fall back to scalar for single-value arrays.
3. **[REVIEW] Replace scalar uniforms with vec3 only.** Remove `u_exposure` (float)
   and use only `u_exposureRGB` (vec3). When per-channel data is absent, broadcast
   the scalar to all three components: `vec3(exposure, exposure, exposure)`. This
   eliminates shader branching.
4. **[REVIEW] Exact shader formulas (CRITICAL):**
   - **Exposure:** `color.rgb *= exp2(u_exposureRGB);`
     (NOT `color.rgb *= u_exposureRGB` -- that would be a linear multiply, not stops)
   - **Gamma:** `color.rgb = pow(max(color.rgb, 0.0), 1.0 / u_gammaRGB);`
     (NOT `pow(color, u_gammaRGB)` -- that's the inverse operation)
   - **Contrast:** `color.rgb = (color.rgb - 0.5) * u_contrastRGB + 0.5;`
5. Update `ShaderStateManager` to set vec3 uniforms.

**Tests:**

*Unit -- GTOSettingsParser.test.ts:*
- `parseColorAdjustments` returns per-channel when GTO has `float[3]` exposure
- `parseColorAdjustments` returns scalar when GTO has single-element array
- Round-trip: export -> re-parse preserves per-channel values
- **[REVIEW] Regression:** existing scalar `float exposure = 1.5` still returns `exposure: 1.5`
- **[REVIEW] Negative:** `float[2]` array -> falls back to scalar (first element)
- **[REVIEW] Negative:** `float[4]` array -> uses first 3 elements
- **[REVIEW] Negative:** empty array `[]` -> falls back to default
- **[REVIEW] Negative:** `[NaN, 1.0, 1.0]` -> handles gracefully (NaN sanitized)

*Unit -- Renderer/ShaderStateManager:*
- Per-channel uniforms are set correctly for `[0.5, 1.0, 1.5]` exposure
- Scalar exposure `2.0` produces uniform `vec3(2.0, 2.0, 2.0)`
- **[REVIEW] Boundary:** `gammaRGB = [0, 0, 0]` does not produce NaN output
- **[REVIEW] Boundary:** `exposureRGB = [Infinity, -Infinity, NaN]` is sanitized

*E2E:*
- Load .rv with per-channel exposure `[-1, 0, 1]`; **[REVIEW] use pixel-probe
  (`sampleCanvasPixels()`) at known coordinates** to verify red darkened, green
  normal, blue brightened. (No screenshot comparison infrastructure exists;
  use state-based pixel verification instead.)

---

### 0.2 RVLinearize logtype rendering

**Gap:** **[REVIEW] Correction:** `GTOGraphLoader.ts` (lines 787-873) already
fully parses the RVLinearize node including: `logtype`, `sRGB2linear`,
`Rec709ToLinear`, `fileGamma`, `ignoreChromaticities`, `cineon.*`, `lut.*`
(with inMatrix/outMatrix), and CDL sub-component. The parsed properties are
stored in `nodeInfo.properties` but **never applied to the rendering pipeline**.
`GTOSettingsParser` provides a quick initial extraction but is not the
comprehensive parser -- `GTOGraphLoader` is.

**Impact:** Log-encoded media (DPX, Cineon) in .rv sessions appears washed out or
dark because the linearization curve is not applied.

**Files to change:**
- `src/core/session/GTOSettingsParser.ts` -- new `parseLinearize()` for quick path
- `src/core/types/color.ts` -- `LinearizeState` type
- `src/core/session/Session.ts` -- apply linearize settings on load
- `src/render/Renderer.ts` -- apply file gamma / log type
- `src/core/session/SessionGTOExporter.ts` -- export linearize node

**Steps:**
1. Add `parseLinearize(dto)` to `GTOSettingsParser.ts`:
   - Read `color.logtype` (int), `color.sRGB2linear` (int),
     `color.Rec709ToLinear` (int), `color.fileGamma` (float),
     `color.alphaType` (int), `color.ignoreChromaticities` (int).
   - **[REVIEW]** Also store `alphaType` and `YUV` conversion flag in the
     interface (already in `LinearizeSettings` serializer type).
2. Define `LinearizeState` in `color.ts`:
   ```ts
   interface LinearizeState {
     logType: 0 | 1 | 2 | 3; // none, cineon, viper, logc
     sRGB2linear: boolean;
     rec709ToLinear: boolean;
     fileGamma: number; // 1.0 = no-op
     alphaType: number; // 0=normal, 1=premultiplied
     yuvConversion: boolean;
   }
   ```
3. Map logType values to existing `LogCurves.ts` presets:
   - 1 -> Cineon
   - 2 -> **Cineon as best-effort fallback with console warning.**
     **[REVIEW] Viper is NOT a Cineon variant** -- Thomson Viper uses a proprietary
     10-bit log encoding with different reference levels (black=16, white=1000 in
     10-bit). Treating it as Cineon will produce visibly wrong results. The correct
     Viper curve is deferred to item 3.2.
   - 3 -> ARRI LogC3
4. **[REVIEW] Linearize vs `u_inputTransfer` priority:** Wire linearize into the
   renderer's input EOTF stage. **When `LinearizeState.logType != 0` or
   `sRGB2linear == true` or `fileGamma != 1.0`, those override the auto-detected
   `u_inputTransfer` (HLG/PQ).** Session-level linearize settings take precedence
   over format-level auto-detection.
5. **[REVIEW] Pipeline ordering:** RVLinearize happens at input, RVColor at middle,
   RVDisplayColor at output. Confirm this ordering is preserved.
6. Export linearize settings in GTO exporter.
7. **[REVIEW] Round-trip:** `export(parse(gtoWithLinearize))` must contain `logtype=1`.

**Tests:**

*Unit -- GTOSettingsParser:*
- Parse logtype=1 -> `{ logType: 1, sRGB2linear: false, ... }`
- Parse sRGB2linear=1 -> `{ sRGB2linear: true }`
- Parse fileGamma=2.2 -> `{ fileGamma: 2.2 }`
- Missing linearize node -> returns null
- **[REVIEW] Boundary:** fileGamma=0 -> returns safe default (1.0)
- **[REVIEW] Round-trip:** export -> re-parse preserves logtype and fileGamma

*Unit -- Renderer:*
- LogType 1 (Cineon) applies correct EOTF curve to test pixel
- fileGamma 2.2 matches `Math.pow(v, 2.2)` for sample values
- **[REVIEW]** logType=1 overrides auto-detected `u_inputTransfer` for HLG source

*E2E:*
- Load .rv referencing a 10-bit DPX with logtype=1; verify image is not washed out
  (pixel-probe verification)

---

### 0.3 RVColor luminance LUT

**Gap:** **[REVIEW] Correction:** The `luminanceLUT` component IS already parsed in
`GTOGraphLoader.ts` (lines 602-616) into `nodeInfo.properties`. The gap is that
this parsed data is **not wired to the rendering pipeline**, not that it isn't
extracted. Additionally, `color.lut` (the inline LUT property) is read as a string
(LUT name/mode selector), not as a float array.

**[REVIEW] 1-channel vs 3-channel ambiguity:** OpenRV supports both:
- **1-channel luminance LUT** (e.g., 256 floats) -- applied to luminance
- **3-channel per-channel LUT** (e.g., 768 floats, divisible by 3) -- applied per-channel
The implementation must handle both cases based on array length.

**Impact:** Sessions using inline color LUTs lose that correction on load.

**Files to change:**
- `src/core/session/GTOSettingsParser.ts` -- wire luminanceLUT data
- `src/color/LUTPipeline.ts` -- apply inline 1D LUT at color correction stage
- `src/core/session/SessionGTOExporter.ts` -- export inline LUT

**Steps:**
1. Wire already-parsed `luminanceLUT` data from `nodeInfo.properties` to the
   rendering pipeline.
2. Determine LUT type from array length:
   - If length divisible by 3: treat as 3-channel per-channel LUT (R, G, B tables)
   - Otherwise: treat as 1-channel luminance LUT
3. Store as `inlineLUT: Float32Array` with `lutChannels: 1 | 3` in `ColorAdjustments`.
4. In the LUT pipeline, insert inline LUT application at the "Color Correction"
   stage (between exposure and look LUT).
5. Export inline LUT data back to GTO.
6. **[REVIEW] Round-trip:** `export(parse(gtoWithInlineLUT))` preserves float values.

**Tests:**

*Unit -- GTOSettingsParser:*
- Parse RVColor with 768-element float array -> 3-channel LUT with 256 entries/channel
- Parse RVColor with 256-element float array -> 1-channel luminance LUT
- Parse RVColor without lut -> `inlineLUT` is undefined
- **[REVIEW] Negative:** LUT length not divisible by 3 (e.g., 770) -> treated as 1-channel

*Unit -- LUTPipeline:*
- Apply identity LUT (0..1 ramp) -> output unchanged
- Apply inverted LUT -> output inverted
- **[REVIEW] Round-trip:** export -> re-parse preserves 768 float values

---

## P1 -- High: Common Workflow Gaps

### 1.1 Multi-part EXR support

**Gap:** `EXRDecoder.ts:864` explicitly throws on multi-part EXR files.
Multi-part EXR is standard in VFX for deep compositing, AOVs, and stereo.

**Files to change:**
- `src/formats/EXRDecoder.ts` -- multi-part header parsing + part selection
- `src/formats/EXRDecoder.test.ts`

**Steps:**
1. Parse multi-part header: read part count, iterate part headers (each has its
   own channels, data window, compression).
2. Default behavior: decode first part (or first RGBA part).
3. Expose part/layer selection via `DecoderOptions.partIndex` or
   `DecoderOptions.layerName`.
4. Multi-view: map "left"/"right" view names to stereo source selection.
5. Leave deep data (type=deepscanline/deeptile) as a future TODO with a
   descriptive error.

**[REVIEW] Test fixture strategy:** Extend the existing `createTestEXR()` helper
in `EXRDecoder.test.ts` with a `multiPart: true` option to programmatically
generate multi-part EXR buffers in-memory. This avoids binary fixture management
and Git LFS. Alternatively, commit minimal multi-part EXR files to `sample/`.

**Tests:**

*Unit -- EXRDecoder:*
- `isEXRFile()` returns true for multi-part EXR magic bytes
- Decode multi-part with 2 RGBA parts -> returns first part pixels correctly
- Decode multi-part with named layers -> select by `partIndex`
- Deep data part -> throws descriptive error (not generic crash)
- **[REVIEW] Performance:** decode multi-part 1920x1080 completes in < 500ms

*E2E:*
- Load multi-part EXR stereo file (left/right views); verify both eyes display
  (pixel-probe verification)

---

### 1.2 CDL collection file support (.ccc, .cc) + ACEScct colorspace

**Gap:** CDL loading only handles single `.cdl` XML. OpenRV also loads `.ccc`
(ColorCorrectionCollection) and `.cc` (single ColorCorrection) files, and the
RVCDL node references CDL files by path with `node.file`.

**[REVIEW] MAJOR: CDL colorspace wrapping.** The `cdlColorspace` property is
already parsed from GTO (line 586, 594, 1672) and `RVColorACESLogCDL` is
recognized. However, no code converts linear data to ACEScct before CDL
application. The current shader applies CDL directly in whatever space the pixel
data is in. For `colorspace="aceslog"`:
1. Convert linear scene-referred data to ACEScct (the ASC-standardized log space)
2. Apply CDL SOP+Sat
3. Convert ACEScct back to linear

**Files to change:**
- `src/color/CDL.ts` -- add `parseCCC()`, `parseCC()` parsers
- `src/color/CDL.test.ts`
- `src/ui/components/CDLControl.ts` -- accept .ccc/.cc in file picker
- `src/core/session/GTOGraphLoader.ts` -- resolve `node.file` paths for RVCDL
- `src/render/shaders/viewer.frag.glsl` -- add `u_cdlColorspace` uniform and
  ACEScct wrapping logic

**Steps:**
1. `parseCC(xml)`: parse `<ColorCorrection>` root element (same as inner CDL).
2. `parseCCC(xml)`: parse `<ColorCorrectionCollection>`, return array of CDLValues
   with optional `id` attributes.
3. When loading .ccc, present selection UI (or use first entry by default).
4. In `GTOGraphLoader`, when RVCDL node has `node.file`, attempt to resolve the
   file from `availableFiles` map and parse it.
5. File picker filter: `.cdl,.ccc,.cc,.xml`.
6. **[REVIEW] Add `u_cdlColorspace` uniform (0=rec709/direct, 1=aceslog/ACEScct).**
   In fragment shader:
   ```glsl
   if (u_cdlColorspace == 1) {
       color.rgb = linearToACEScct(color.rgb);
   }
   // CDL SOP+Sat
   if (u_cdlColorspace == 1) {
       color.rgb = ACEScctToLinear(color.rgb);
   }
   ```

**Tests:**

*Unit -- CDL.ts:*
- `parseCC('<ColorCorrection>...')` -> correct slope/offset/power/saturation
- `parseCCC('<ColorCorrectionCollection>...')` -> array with 3 entries
- `parseCCC` with `id` attributes -> entries have correct IDs
- Invalid XML -> throws descriptive error
- **[REVIEW] Negative:** Missing `<Slope>` element -> uses default slope `[1,1,1]`
- **[REVIEW] Negative:** Non-numeric slope text -> throws with message containing "slope"
- **[REVIEW] Negative:** Wrong root element -> throws with descriptive message
- **[REVIEW] Negative:** Empty .ccc collection (0 entries) -> returns empty array

*Unit -- GTOGraphLoader:*
- RVCDL with `node.file` + matching file in availableFiles -> CDL applied
- RVCDL with `node.file` but no matching file -> graceful skip with warning

*Unit -- Renderer (CDL colorspace):*
- `cdlColorspace=0` -> CDL applied directly (no wrapping)
- `cdlColorspace=1` -> CDL applied in ACEScct space (lin->log->CDL->log->lin)
- **[REVIEW] Round-trip:** `export(parse(gtoWithCDL))` preserves colorspace value

---

### 1.3 RVFormat uncrop (data window -> display window)

**Gap:** EXR data window / display window are parsed but uncrop is not applied.
OpenRV's RVFormat has `uncrop.active`, `uncrop.x/y/width/height` properties.

**Impact:** EXR files with data window smaller than display window render at wrong
size/position.

**[REVIEW] Implementation approach:** Prefer **decode-time uncrop** over render-time.
Expand the pixel buffer from dataWindow dimensions to displayWindow dimensions,
filling padding with **transparent black `(0,0,0,0)`** (not opaque black). This
avoids complicating the renderer with per-image offset/scale state that would
break pixel probing, scope analysis, and screenshot comparisons.

**[REVIEW] Fill color:** Must be `vec4(0,0,0,0)` (transparent black, premultiplied
alpha = 0). The existing shader composites via `mix(bgColor, color.rgb, color.a)`,
so alpha=0 pixels correctly show the background pattern.

**Files to change:**
- `src/core/session/GTOSettingsParser.ts` -- add uncrop parsing
- `src/core/types/transform.ts` -- `UncropState` type
- `src/formats/EXRDecoder.ts` -- apply uncrop during decode (expand pixel buffer)
- `src/core/session/SessionGTOExporter.ts` -- export uncrop
- `src/core/session/serializers/TransformSerializer.ts` -- **[REVIEW] extend
  `FormatSettings` with `uncrop` field and `buildFormatObject` with uncrop component**

**Steps:**
1. Parse `uncrop.active`, `uncrop.x`, `uncrop.y`, `uncrop.width`, `uncrop.height`
   from RVFormat nodes.
2. When EXR has `dataWindow != displayWindow`, compute uncrop region automatically.
3. At decode time, create a new buffer of displayWindow dimensions, fill with
   `(0,0,0,0)`, copy data window pixels at correct offset.
4. **[REVIEW]** Extend `FormatSettings` interface with `uncrop?: { active: boolean;
   x: number; y: number; width: number; height: number }`.
5. Export uncrop settings to GTO via extended `buildFormatObject`.

**[REVIEW] Test fixture strategy:** Extend `createTestEXR()` to support different
data/display windows, or commit a minimal test EXR file with `dataWindow != displayWindow`.

**Tests:**

*Unit -- GTOSettingsParser:*
- Parse uncrop.active=1, x=100, y=50, width=1920, height=1080
- Parse uncrop.active=0 -> null
- **[REVIEW] Boundary:** Negative width/height -> treated as inactive
- **[REVIEW] Boundary:** Zero width/height -> treated as inactive

*Unit -- EXRDecoder:*
- EXR with data window [100,50]-[500,400] and display window [0,0]-[1920,1080]
  -> output is 1920x1080 with data placed at correct offset
- **[REVIEW]** Fill pixels outside data window are `(0,0,0,0)` (transparent black)

*Unit -- Round-trip:*
- `export(parse(gtoWithUncrop))` contains `uncrop.x=100`

*E2E:*
- Load EXR with mismatched data/display windows; pixel-probe verification of
  correct placement

---

### 1.4 Out-of-Range visualization mode

**Gap:** OpenRV's `RVDisplayColor.color.outOfRange` highlights pixels outside
[0,1] range. openrv-web has false color and zebra stripes but no dedicated
out-of-range mode matching OpenRV's behavior.

**[REVIEW] Correction:** OpenRV's `outOfRange` is a **boolean** (0 or 1), not a
tri-state. When enabled (`outOfRange=1`), OpenRV highlights over-range pixels red
and under-range pixels blue. There is no "clamp-to-black" mode in the original
OpenRV. Adding a clamp-to-black mode (mode 1) is fine as an extension, but
`outOfRange=1` from GTO must map to highlight mode (mode 2 in our implementation).

**[REVIEW] Detection timing:** Out-of-range detection must happen on
**scene-referred (linear) values before tone mapping and display transfer**, not
after display gamma. Checking post-gamma would miss scene-white exceeding range.

**Files to change:**
- `src/render/shaders/viewer.frag.glsl` -- add out-of-range uniform + logic
- `src/render/ShaderStateManager.ts` -- `u_outOfRange` uniform
- `src/core/session/GTOSettingsParser.ts` -- parse from RVDisplayColor
- `src/core/session/SessionGTOExporter.ts` -- export

**Steps:**
1. Add `u_outOfRange` int uniform (0=off, 1=clamp-to-black [extension],
   2=highlight [OpenRV default]).
2. **[REVIEW]** In fragment shader **before tone mapping/display transfer**:
   if outOfRange == 2, color pixels red where any channel > 1.0, blue where < 0.0.
3. Parse `color.outOfRange` from RVDisplayColor node. **Map GTO value 1 -> mode 2
   (highlight)**, since OpenRV's boolean maps to our highlight mode.
4. Expose in UI (e.g., keyboard shortcut or view menu).

**Tests:**

*Unit -- ShaderStateManager:*
- Setting outOfRange=2 sets uniform correctly

*Unit -- GTOSettingsParser:*
- Parse `color.outOfRange=1` from RVDisplayColor -> maps to mode 2 (highlight)
- **[REVIEW] Round-trip:** `export(parse(gtoWithOutOfRange))` preserves the value

*E2E:*
- Load HDR image with values > 1.0; enable out-of-range mode; pixel-probe verify
  over-exposed areas highlighted red

---

### 1.5 LUT matrix application

**Gap:** `inMatrix` (float[16]) and `outMatrix` (float[16]) are parsed from GTO
(GTOGraphLoader.ts:843-854) but it's unclear whether they are applied during
LUT evaluation.

**[REVIEW] Matrix transpose requirement:** GTO stores matrices in **row-major**
order. GLSL expects **column-major**. The flat float[16] from GTO must be
transposed before uploading as a GLSL `mat4` uniform (or uploaded with
`transpose=true` in the `uniformMatrix4fv` call).

**[REVIEW] Multiple LUT points:** `inMatrix`/`outMatrix` exist at both
`RVLinearize.lut` (line 843-844) AND `RVLookLUT`/`RVCacheLUT` (line 897-898).
The implementation must handle matrices at **all** LUT insertion points.

**[REVIEW] 4x4 homogeneous coordinate usage:** The 4x4 matrix operates on
homogeneous coordinates: `[r', g', b', 1] = [r, g, b, 1] * M`. The 4th column
provides offset (translation in color space).

**Files to change:**
- `src/color/LUTPipeline.ts` -- apply inMatrix before LUT, outMatrix after
- `src/color/WebGLLUT.ts` -- matrix multiplication in shader
- `src/color/LUTPipeline.test.ts`

**Steps:**
1. Audit current code: check if `lutInMatrix`/`lutOutMatrix` are actually used
   in the LUT application path.
2. If not: before sampling the 3D LUT, multiply input color by 4x4 `inMatrix`.
   After sampling, multiply by `outMatrix`.
3. **[REVIEW]** Upload matrices with `transpose=true` in `uniformMatrix4fv` call,
   or manually transpose the flat array before upload.
4. Apply matrices at ALL LUT points (RVLinearize, RVLookLUT, RVCacheLUT).

**Tests:**

*Unit -- LUTPipeline:*
- Identity matrix -> output unchanged
- Scale matrix [2,0,0,0; 0,2,0,0; 0,0,2,0; 0,0,0,1] -> input doubled before LUT
- Round-trip: apply inMatrix, identity LUT, inverse outMatrix -> original values
- **[REVIEW] Boundary:** Singular matrix (determinant=0) -> handled gracefully
- **[REVIEW] Boundary:** Matrix with NaN entries -> sanitized or rejected
- **[REVIEW]** Row-major GTO flat array is correctly transposed to GLSL column-major
- **[REVIEW] Performance:** LUT pipeline with inMatrix/outMatrix adds < 10% overhead

---

## P2 -- Medium: Feature Parity

### 2.1 Explicit retime frame mapping

**Gap:** GTO properties `explicit.active`, `explicit.firstOutputFrame`,
`explicit.inputFrames` are parsed (GTOGraphLoader.ts:973-982) but not wired
to actual frame lookup in `RetimeGroupNode`.

**Files to change:**
- `src/nodes/groups/RetimeGroupNode.ts` -- implement explicit frame map
- `src/nodes/groups/RetimeGroupNode.test.ts`

**Steps:**
1. When `explicitActive=1`, build a frame lookup table:
   `outputFrame -> inputFrames[outputFrame - firstOutputFrame]`.
2. In `process()`, remap the requested frame through the table.
3. Handle out-of-range: clamp to first/last input frame.

**Tests:**

*Unit -- RetimeGroupNode:*
- Explicit mapping [1,3,5,7] from output frame 10 -> frame 10->1, 11->3, 12->5, 13->7
- Output frame before firstOutputFrame -> clamps to first
- Output frame after last -> clamps to last
- `explicitActive=0` -> standard retime logic

---

### 2.2 Audio scrubbing

**Gap:** No audio playback during frame-by-frame scrubbing (drag/wheel).

**Files to change:**
- `src/audio/AudioPlaybackManager.ts` -- add `scrubToFrame(frame)` method
- `src/audio/AudioPlaybackManager.test.ts`

**Steps:**
1. On scrub event, compute audio timestamp from frame number and FPS.
2. Play a short audio snippet (~50ms) at that timestamp using Web Audio API
   `AudioBufferSourceNode` with scheduled start/stop.
3. **[REVIEW]** Debounce using `setTimeout` (not rAF) for deterministic timer
   testing with `vi.useFakeTimers()`.
4. Wire to playback handler's scrub/seek events.

**Tests:**

*Unit -- AudioPlaybackManager:*
- `scrubToFrame(24)` at 24fps -> plays audio at t=1.0s
- **[REVIEW]** Rapid scrub: advance fake timers, count `createBufferSource` mock
  calls (not real-time 100ms)
- No audio loaded -> scrub is silent (no error)
- **[REVIEW]** Scrub during active playback -> scrub audio takes precedence
- **[REVIEW]** `AudioContext.state === 'suspended'` -> no error thrown

---

### 2.3 Per-channel RVColor.color.scale and color.offset arrays

**Gap:** Like exposure/gamma/contrast, OpenRV's `color.scale` and `color.offset`
are also `float[3]` per-channel. Currently parsed as scalars.

**[REVIEW] Pipeline position:** In OpenRV, the order is
`exposure -> scale -> offset -> contrast -> saturation`. The plan must specify
insertion point in the shader pipeline.

**Files to change:**
- Same as 0.1 (extend as part of per-channel work)

**Steps:**
1. Include `scaleRGB` and `offsetRGB` in the per-channel extension from 0.1.
2. Add `u_scaleRGB`, `u_offsetRGB` vec3 uniforms.
3. Apply: `color.rgb = color.rgb * u_scaleRGB + u_offsetRGB` in shader.
4. **[REVIEW]** Insert **after exposure, before contrast** in the pipeline:
   `exposure -> scale -> offset -> contrast -> saturation`.

**Tests:**

*Unit -- GTOSettingsParser:*
- Parse `color.scale = [1.0, 0.5, 1.5]` -> `scaleRGB: [1, 0.5, 1.5]`
- Parse `color.offset = [0.1, 0, -0.1]` -> `offsetRGB: [0.1, 0, -0.1]`
- **[REVIEW] Round-trip:** `export(parse(gtoWithScaleRGB))` preserves `[1.0, 0.5, 1.5]`

---

### 2.4 RVEDL file import

**Gap:** OpenRV supports `.rvedl` ASCII edit decision lists (simple text format
with source paths, in/out points, transitions).

**Files to change:**
- `src/formats/RVEDLParser.ts` (new)
- `src/formats/RVEDLParser.test.ts` (new)
- `src/core/session/Session.ts` -- loadEDL method
- `src/handlers/persistenceHandlers.ts` -- register .rvedl in file open

**[REVIEW]** Include a sample RVEDL format snippet or reference OpenRV documentation
so tests can be independently verified.

**Steps:**
1. Parse RVEDL format: each line is `sourcePath inFrame outFrame`.
2. Build sequence group from parsed entries.
3. Register `.rvedl` in file open dialog filter.

**Tests:**

*Unit -- RVEDLParser:*
- Parse 3-line RVEDL -> 3 source entries with correct paths/ranges
- Empty file -> empty sequence
- Malformed line -> skip with warning

---

### 2.5 Procedural sources (test patterns)

**Gap:** OpenRV's `.movieproc` generates SMPTE bars, color charts, gradients,
solid colors, and noise. Useful for calibration.

**Files to change:**
- `src/nodes/sources/ProceduralSourceNode.ts` (new)
- `src/nodes/sources/ProceduralSourceNode.test.ts` (new)
- `src/nodes/base/NodeFactory.ts` -- register procedural node

**Steps:**
1. Implement generator functions:
   - `smpte_bars(width, height)` -> SMPTE color bar pattern
   - `color_chart(width, height)` -> Macbeth chart approximation
   - `gradient(width, height, direction)` -> linear ramp
   - `solid(width, height, color)` -> flat fill
2. Create `ProceduralSourceNode` that takes a pattern name and parameters.
3. Register in NodeFactory as `'RVMovieProc'`.
4. Parse `.movieproc` URLs from GTO `media.movie` paths.

**Tests:**

*Unit -- ProceduralSourceNode:*
- **[REVIEW] Concrete values:** `smpte_bars(1920, 1080)` pixel at (137, 360)
  [first bar center] is `[0.75, 0.75, 0.75]` (75% white)
- **[REVIEW]** `smpte_bars(1920, 1080)` pixel at (411, 360) [second bar center]
  is `[0.75, 0.75, 0.0]` (yellow)
- `solid(100, 100, [1,0,0,1])` -> all pixels red
- `gradient(256, 1, 'horizontal')` -> pixel[0] = 0.0, pixel[128] ~= 0.502,
  pixel[255] = 1.0

---

## P3 -- Low: Edge Cases

### 3.1 3DE4 anamorphic full coefficient set

**Gap:** OpenRV's RVLensWarp supports `3de4_anamorphic_degree_6` with
coefficients `cx02` through `cy66` (12+ params). openrv-web only has `k1-k3, p1-p2`.

**Files to change:**
- `src/transform/LensDistortion.ts` -- add 3DE4 anamorphic model
- `src/core/session/GTOSettingsParser.ts` -- parse cx/cy coefficients

**Steps:**
1. Add `'3de4_anamorphic_degree_6'` model to `LensDistortionParams`.
2. Implement the 3DE4 anamorphic polynomial distortion formula.
3. Parse all `warp.cx02`..`warp.cy66` from GTO.

**Tests:**

*Unit -- LensDistortion:*
- Zero coefficients -> identity (no distortion)
- Known 3DE4 test case -> matches reference output within tolerance

---

### 3.2 RVLinearize Viper log type

**Gap:** logtype=2 (Viper) is a legacy Thomson Viper camera format. Uses a
proprietary 10-bit log encoding with different reference levels (black=16,
white=1000 in 10-bit). **[REVIEW] NOT a Cineon variant** -- has different
reference black/white points and gamma.

**Steps:**
1. Add proper Viper log curve to `LogCurves.ts` with correct reference levels.
2. Map logtype=2 to Viper curve (replacing the Cineon fallback from 0.2).

**Tests:**

*Unit -- LogCurves:*
- Viper toLinear(0.5) matches known reference value
- Viper toLinear differs from Cineon toLinear (verify they are not identical)

---

### 3.3 RVChannelMap full remapping

**Gap:** `RVChannelMap.format.channels` allows arbitrary channel name remapping.
Currently only basic channel isolation (R/G/B/A/Luma) is supported.

**Files to change:**
- `src/core/session/GTOSettingsParser.ts` -- parse channel map
- `src/render/Renderer.ts` -- apply channel swizzle

**Steps:**
1. Parse `format.channels` string array from RVChannelMap.
2. Map channel names to swizzle indices.
3. Apply as a texture swizzle in the shader.

**Tests:**

*Unit -- GTOSettingsParser:*
- Parse `channels = ["B", "G", "R", "A"]` -> BGR swizzle

---

### 3.4 RVRetime warp keyframes (speed ramps)

**Gap:** `warp.keyFrames` and `warp.keyRates` allow keyframed speed changes.
Parsed from GTO but not applied.

**Files to change:**
- `src/nodes/groups/RetimeGroupNode.ts` -- keyframe interpolation
- `src/nodes/groups/RetimeGroupNode.test.ts`

**Steps:**
1. Build frame-rate curve from keyFrames/keyRates pairs.
2. Integrate rate curve to compute input frame for each output frame.
3. Use linear interpolation between keyframes.

**Tests:**

*Unit -- RetimeGroupNode:*
- KeyFrames [0, 24], KeyRates [1.0, 2.0] -> frame 12 maps to input ~9
  (accelerating)
- Single keyframe -> constant rate

---

## Implementation Order

```
Phase 1 -- Session Fidelity (P0)
  0.0  GTO connections object parsing  [NEW]
  0.1  Per-channel RVColor arrays
  0.2  RVLinearize logtype rendering
  0.3  RVColor luminance LUT

Phase 2 -- Core Workflows (P1)
  1.1  Multi-part EXR
  1.2  CDL collection files (.ccc/.cc) + ACEScct colorspace
  1.3  RVFormat uncrop
  1.4  Out-of-range visualization
  1.5  LUT matrix application

Phase 3 -- Feature Parity (P2)
  2.1  Explicit retime frame mapping
  2.2  Audio scrubbing
  2.3  Per-channel scale/offset
  2.4  RVEDL file import
  2.5  Procedural sources

Phase 4 -- Edge Cases (P3)
  3.1  3DE4 anamorphic coefficients
  3.2  Viper log type
  3.3  RVChannelMap full remapping
  3.4  Retime warp keyframes
```

---

## Test Coverage Summary

| Area | Unit Tests | E2E Tests |
|------|-----------|-----------|
| GTOGraphLoader (connections) | 4 new cases | -- |
| GTOSettingsParser | 20+ new cases (per-channel, logtype, uncrop, outOfRange, luminanceLUT, negatives, boundaries) | -- |
| Renderer/Shader | 12+ new cases (per-channel uniforms, outOfRange, CDL colorspace, boundaries) | 3 pixel-probe tests |
| EXRDecoder | 5+ new cases (multi-part header, part selection, deep data error, performance) | 1 multi-part load test |
| CDL | 10+ new cases (.ccc parse, .cc parse, negatives, ACES colorspace, round-trips) | -- |
| LUTPipeline | 7+ new cases (matrix application, inline LUT, 1ch/3ch, boundaries) | -- |
| RetimeGroupNode | 4+ new cases (explicit mapping, keyframe ramp) | -- |
| AudioPlaybackManager | 5+ new cases (scrub, debounce with fake timers, edge cases) | -- |
| RVEDLParser | 3+ new cases (parse, empty, malformed) | -- |
| ProceduralSourceNode | 4+ new cases (bars with concrete values, solid, gradient) | -- |
| Round-trip tests | 8+ new cases (one per item with export) | -- |
| **Total** | **~82+ new unit tests** | **~4 new E2E tests** |

---

## E2E Test Infrastructure Note [NEW - from review]

**Current state:** No screenshot comparison infrastructure exists (no
`toMatchSnapshot`, `pixelmatch`, or visual comparison library). The existing E2E
tests verify state via `window.__OPENRV_TEST__` accessor functions and use
`captureViewerScreenshot()` with exact byte equality (`imagesAreDifferent`).

**Recommended approach for new E2E tests:** Use **pixel-probe state-based
verification** via the existing `sampleCanvasPixels()` helper to read specific
pixel values from the WebGL canvas at known coordinates. This avoids the need
for visual comparison infrastructure and cross-platform GPU rendering differences.

If screenshot-comparison is desired in the future, add Playwright's built-in
`expect(page).toHaveScreenshot()` with threshold configuration as a separate
infrastructure task before Phase 2 begins.

---

## Known Issues Not Addressed (from review)

These items were identified during review but are deferred or noted for awareness:

1. **Property addressing modes** (`#RVColor.color.exposure`, `@RVDisplayColor`):
   Not supported for dynamic property access. Relevant for Mu/Python scripting.
   Deferred to scripting layer implementation. (P2 level)

2. **Missing protocols in PROTOCOL_TO_NODE_TYPE:** `RVSourceGroup`, `RVSequence`,
   `RVStack`, `RVDisplayGroup`, `RVViewPipelineGroup` are not in the map.
   Partially addressed by item 0.0 (connections parsing). (P2 level)

3. **`session.realtime` hardcoded to 0 in exports:** Round-trip loses playback
   rate preference when `realtime` differs from `fps`. (Minor)

4. **`session.bgColor` not parsed or exported.** (Minor, cosmetic)

5. **GTO binary format endianness:** `gto-js` presumably handles big-endian
   correctly for desktop OpenRV compatibility, but this should be verified. (Minor)

6. **GTO version hardcoded to 4:** Older desktop OpenRV installations may not
   support version 4. No backward compatibility option. (Minor)

7. **Overlay round-trip incomplete:** Paint annotations survive `updateGTOData`
   but overlay rectangles/texts/windows are parsed into generic properties and
   not reconstructed on new exports via `toGTOData`. (Minor)

---

## Double Review Checklist

### Review Pass 1 -- Correctness

- [x] Every OpenRV node property from Ch.16 Node Reference is accounted for
- [x] Per-channel `float[3]` properties identified (exposure, gamma, contrast,
      scale, offset) -- not just scalar
- [x] Linearize stage (logtype, sRGB2linear, Rec709ToLinear, fileGamma) verified
      as parsed in GTOGraphLoader but not wired to renderer
- [x] Multi-part EXR confirmed as explicitly rejected in EXRDecoder.ts:864
- [x] Uncrop confirmed as not implemented (only crop in CropManager)
- [x] CDL parsers confirmed: only `.cdl` XML, not `.ccc`/`.cc`
- [x] Pixel Inspector (PixelProbe.ts) confirmed as already implemented
- [x] Channel isolation (ChannelSelect.ts) confirmed as already implemented
- [x] LUT inMatrix/outMatrix confirmed as parsed but application not verified
- [x] Explicit retime confirmed as parsed but not wired to frame lookup
- [x] **[REVIEW]** `connections` object confirmed as not parsed on load
- [x] **[REVIEW]** Exact shader formulas specified for per-channel operations
- [x] **[REVIEW]** CDL ACEScct colorspace wrapping specified
- [x] **[REVIEW]** GTO row-major -> GLSL column-major transpose noted
- [x] **[REVIEW]** outOfRange mapped correctly (GTO boolean -> highlight mode)

### Review Pass 2 -- Completeness & Feasibility

- [x] No plan item requires native code or browser extensions
- [x] All shader changes are additive (new uniforms, no existing behavior change)
- [x] Multi-part EXR plan scopes out deep data (deferred, not silent failure)
- [x] Test counts are realistic (82+ unit + 4 E2E)
- [x] Phase ordering respects dependencies (0.0 before others; 0.1 before 2.3; 0.2 before 3.2)
- [x] No breaking changes to existing session loading (all additions are
      graceful fallbacks)
- [x] Export changes maintain backward compatibility (arrays serialize correctly
      for both openrv-web and desktop OpenRV consumption)
- [x] Web Audio API is sufficient for audio scrubbing (no native audio needed)
- [x] Procedural sources are self-contained (no external assets)
- [x] **[REVIEW]** E2E tests use pixel-probe verification (no screenshot infra needed)
- [x] **[REVIEW]** Round-trip tests specified for all items with export
- [x] **[REVIEW]** Negative and boundary tests specified for parsing functions
- [x] **[REVIEW]** Test fixture strategy specified (extend `createTestEXR()`)
- [x] **[REVIEW]** Linearize vs u_inputTransfer priority defined
