# TODO - Additional Audit Findings

Items discovered during the 12-group feature audit that are not in IMPROVE_PLAN.md.
Organized by feature group with priority levels.

---

## Paint & Annotations

### LOW: Variable-width stroke has visual gap artifacts
Segment-by-segment `ctx.stroke()` / `ctx.beginPath()` calls in `PaintRenderer.renderStroke()` create visible gaps at joints between segments because line caps don't overlap cleanly. The reference OpenRV uses overlapping circles/splats at each sample point for pressure-varying strokes.
- **File**: `src/paint/PaintRenderer.ts`

### LOW: Advanced tool strokes are not undoable
Dodge, burn, clone, and smudge operations are pixel-destructive and not tracked by the undo stack. Once applied, there is no way to revert them. Fix requires snapshotting the affected pixel region before beginning an advanced stroke.
- **File**: `src/paint/AdvancedPaintTools.ts`, `src/paint/PaintEngine.ts`

---

## Rendering Pipeline

### LOW: WebGPUHDRBlit UV mapping may be vertically flipped
The fullscreen triangle WGSL vertex shader generates UVs that are NOT flipped despite the WebGL-to-WebGPU row-order difference. The comment claims it handles flipping but the V coordinate goes 0-to-2 same as position. Image may appear vertically flipped on actual HDR displays.
- **File**: `src/render/WebGPUHDRBlit.ts`
- **Action**: Verify with a real HDR test image. If flipped, change UV to `1.0 - (y + 1.0) / 2.0`.

### LOW: Creative gamma skipped when display transfer is active
When `u_displayTransfer > 0` (sRGB/Rec.709), the per-channel creative gamma (`u_gammaRGB`) is not applied. Users lose per-channel gamma control when a display transfer function is selected. Should be restructured so creative gamma is always applied independently of display transfer.
- **File**: `src/render/shaders/viewer.frag.glsl`

### LOW: SPHERICAL_PROJECTION_GLSL export is stale and unused
The exported constant `SPHERICAL_PROJECTION_GLSL` contains GLSL code with wrong uniform names (`u_fov`, `u_aspect`, `u_yaw`, `u_pitch`) that differ from actual shader uniforms (`u_sphericalFov`, `u_sphericalAspect`, `u_sphericalYaw`, `u_sphericalPitch`). Never imported anywhere.
- **File**: `src/transform/SphericalProjection.ts`
- **Action**: Update exported GLSL to match current uniform names, or remove the export entirely.

### LOW: Clarity and sharpen sample ungraded pixels on GPU
Both clarity and sharpen compute their blur/detail kernels from `texture(u_texture, ...)` -- the original ungraded source pixels -- while the CPU path operates on already-graded data. Documented architectural difference accepted for single-pass performance. GPU and CPU paths may produce subtly different results.
- **File**: `src/render/shaders/viewer.frag.glsl`

### LOW: LuminanceAnalyzer PBO double-buffer has race condition potential
The double-buffered PBO readback uses a single `pboFence` for both PBOs. When PBO A starts readback and fence is created, then PBO B starts, the old fence is deleted. The fence check ends up checking the wrong PBO. Works in practice because GPU execution is sequential, but the fence check is technically incorrect.
- **File**: `src/render/LuminanceAnalyzer.ts`
- **Action**: Use two separate fences, one per PBO.

### LOW: TextureCacheManager LRU eviction is O(n)
`evictLRU()` iterates all cache entries to find the one with lowest `lastAccessed`. Acceptable for current configured limits (~100 entries) but could be improved with a linked-list for O(1) eviction.
- **File**: `src/render/TextureCacheManager.ts`

### LOW: ShaderStateManager sets texture unit bindings every frame
`applyUniforms()` unconditionally sets `u_curvesLUT=1`, `u_falseColorLUT=2`, `u_lut3D=3`, `u_filmLUT=4`, `u_inlineLUT=5` every frame. These never change after first frame. Saves ~5 GL calls per frame if set once.
- **File**: `src/render/ShaderStateManager.ts`

### MEDIUM: effectProcessor.worker.test.ts tests are superficial
Only verifies that the worker file exists and message objects have correct shape. Does not test any actual effect processing logic. Should extract effect processing functions into testable pure functions.
- **File**: `src/render/effectProcessor.worker.test.ts`

### LOW: Canvas2DHDRBlit row-flip is CPU-bound for large images
`uploadAndDisplay()` performs per-row copy with Y-flip in JavaScript. For 4K images this is 2160 subarray+set operations on ~33MB of Float32Arrays.
- **File**: `src/render/Canvas2DHDRBlit.ts`

---

## Stereo 3D

### MEDIUM: Floating window detector not wired to frame events
The floating window detection algorithm is complete and tested, but it is not triggered by any application event. No UI button runs detection and no frame-change handler automatically checks for violations.
- **File**: `src/stereo/FloatingWindowDetector.ts`
- **Action**: Add a "Detect Floating Window" button to QC/View tab. Wire to frame-change events for automatic detection.

### LOW: Checkerboard/scanline missing parity offset support
OpenRV's checkerboard and scanline shaders accept `parityOffsetX`/`parityOffsetY` parameters for viewport origin alignment. The web version hardcodes parity from `(0,0)`, which may invert left/right eye assignment at odd pixel origins.
- **File**: `src/stereo/StereoRenderer.ts`

### LOW: Anaglyph alpha hardcoded to 255
The web anaglyph renderer hardcodes alpha to 255, while OpenRV uses `max(P0.a, P1.a)`. Inconsequential for opaque content but matters for premultiplied alpha compositing workflows.
- **File**: `src/stereo/StereoRenderer.ts`

### LOW: StereoEyeTransform applies to both eyes (differs from OpenRV convention)
OpenRV only applies geometric transforms to the right eye. The web version supports independent transforms on both eyes, which is more flexible but deviates from the established workflow.
- **File**: `src/stereo/StereoEyeTransform.ts`
- **Action**: Consider defaulting UI to show right-eye-only controls initially with a "Show Left Eye Controls" toggle.

### LOW: Missing hsqueezed and vsqueezed stereo output modes
OpenRV supports horizontal/vertical squeeze modes for passive 3D displays. Not present in web version.
- **File**: `src/stereo/StereoRenderer.ts`

---

## Filters & Effects

### MEDIUM: Stabilization motion estimation not integrated in adapter
The `StabilizationEffect` adapter only wraps the pixel-shifting application step. Motion estimation (`computeMotionVector`) and path smoothing (`smoothMotionPath`) are separate functions with unclear integration into the viewer pipeline. Per-frame motion vectors needed by the adapter must come from somewhere.
- **File**: `src/effects/adapters/StabilizationEffect.ts`, `src/filters/StabilizeMotion.ts`

### LOW: WebGL architectural inconsistency: TRIANGLE_STRIP vs TRIANGLES
`WebGLSharpen` uses `TRIANGLE_STRIP` with 4 vertices while `WebGLNoiseReduction` uses `TRIANGLES` with 6 vertices for the fullscreen quad. Should share a common utility.
- **Files**: `src/filters/WebGLSharpen.ts`, `src/filters/WebGLNoiseReduction.ts`

### LOW: NoiseReductionControl dispose() is a no-op
The `dispose()` method is empty. Other dropdown controls properly remove document event listeners. Less critical since NoiseReductionControl is an inline panel, not a popover.
- **File**: `src/ui/components/NoiseReductionControl.ts`

### LOW: Film emulation uses parametric curves instead of LUT-based
Film emulation uses hand-tuned parametric S-curves rather than real film LUT data (.cube/.csp files). Acceptable for preview quality but less accurate than OpenRV's measured film response data.
- **File**: `src/filters/FilmEmulation.ts`

---

## Playback & Audio

### MEDIUM: Sequence export uses 0-based start frame
`handleSequenceExport` in `AppPlaybackWiring.ts` uses `startFrame = 0` when `useInOutRange` is false, but frames are 1-based in the codebase. Sequence export would attempt to render invalid frame 0.
- **File**: `src/AppPlaybackWiring.ts` (line ~166)
- **Action**: Change to `startFrame = 1`.

### LOW: Pingpong loop mode direction flip not tested end-to-end
`computeNextFrame` returns the bounced frame but does NOT flip `playDirection`. The direction flip must happen in Session. No integration test verifies this, so a regression could cause pingpong to stall.
- **File**: `src/core/session/PlaybackTimingController.ts`

### LOW: AudioPlaybackManager rate change creates audio gap
`setPlaybackRate` during Web Audio playback calls `seek()` which internally pauses and restarts the AudioBufferSourceNode, creating an audible click/gap. HTMLVideoElement fallback handles this seamlessly.
- **File**: `src/audio/AudioPlaybackManager.ts`

### LOW: Drop-frame timecode not validated for frame 0 input
`frameToTimecode(0, fps)` computes `totalFrame = -1`, producing garbage output. Should guard with `Math.max(0, ...)`.
- **File**: `src/ui/components/TimecodeDisplay.ts`

---

## UI Components & Overlays

### LOW: DisplayProfileControl registers permanent global click listener
Registers `document.addEventListener('click', ...)` in constructor, even before dropdown is opened. Other dropdown controls correctly only register when the dropdown opens.
- **File**: `src/ui/components/DisplayProfileControl.ts`

### LOW: Duplicate histogram calculation code
Standalone `calculateHistogram()` function at line ~836 of `Histogram.ts` is a near-exact duplicate of the `Histogram.calculate()` instance method at line ~283.
- **File**: `src/ui/components/Histogram.ts`
- **Action**: Have `calculateHistogram()` delegate to a shared function, or remove if unused.

### LOW: HistoryPanel rebuilds entire DOM on every render
`render()` clears `innerHTML` and rebuilds all DOM nodes from scratch on every history change. For large histories this causes unnecessary GC pressure and layout thrashing.
- **File**: `src/ui/components/HistoryPanel.ts`

### LOW: LUTPipelineControl.test.ts is an orphaned test name
Test file exists but there is no `LUTPipelineControl.ts` implementation. Actually tests `LUTPipelinePanel` and `LUTStageControl`.
- **File**: `src/ui/components/LUTPipelineControl.test.ts`
- **Action**: Rename to match what it actually tests.

### LOW: CanvasOverlay base class has no dedicated tests
Tested indirectly through SafeAreasOverlay and SpotlightOverlay subclass tests, but base class edge cases not explicitly covered.
- **File**: `src/ui/components/CanvasOverlay.ts`

### LOW: VideoFrameFetchTracker has no tests
Simple state container but tracks critical state for video frame fetching.
- **File**: `src/ui/components/VideoFrameFetchTracker.ts`

---

## Network & Collaboration

### DONE: simulateRoomCreated renamed to _applyLocalRoomCreation
`simulateRoomCreated()` and `simulateUserJoined()` have been renamed to `_applyLocalRoomCreation()` and `_applyLocalUserJoin()` to clarify their dual role in both WSS fallback and testing.
- **File**: `src/network/NetworkSyncManager.ts`
- **Status**: Resolved.

### MEDIUM: Media transfer via chunked base64 is inefficient
48KB base64-encoded chunks add ~33% overhead. For large media files (EXR sequences) this is very slow. Should use binary WebSocket frames or WebRTC data channel binary messages.
- **File**: `src/AppNetworkBridge.ts`

### MEDIUM: Serverless WebRTC requires manual 3-step token copy-paste
Host generates offer URL, guest pastes it, gets answer token, must deliver it back to host. Significant UX friction.
- **File**: `src/network/WebRTCURLSignaling.ts`, `src/network/NetworkSyncManager.ts`
- **Action**: Consider QR code generation, clipboard buttons, step-by-step instructions. Long-term: deploy signaling server.

### LOW: WebRTCURLSignaling test coverage is thin
Only 4 tests. Missing edge cases: empty SDP, maximum-size SDP, special characters, version mismatch, corrupted base64.
- **File**: `src/network/WebRTCURLSignaling.test.ts`

### LOW: PinEncryption test coverage is thin
Only 4 tests. Missing: min/max PIN length, empty state, large objects, concurrent operations.
- **File**: `src/network/PinEncryption.test.ts`

### LOW: PIN code space is limited
4-10 digits only (max 10 billion combinations). PBKDF2 250K iterations provides some brute-force resistance but 4-digit PINs are weak.
- **File**: `src/network/PinEncryption.ts`

### DONE: validateColorPayload test now catches partial payloads
Tests MPR-028b through MPR-028i verify that payloads with fewer than 7 fields are rejected.
- **File**: `src/network/MessageProtocol.test.ts`
- **Status**: Resolved.

---

## Export & Integrations

### LOW: DCCBridge e2e test has outdated gap documentation
Documents 3 "wiring gaps" (loadMedia, syncColor, sendColorChanged) that have all been fixed in App.ts. Test assertions may test against outdated assumptions.
- **File**: `src/__e2e__/DCCBridge.e2e.test.ts`
- **Action**: Update to reflect current wiring, remove outdated gap comments.

### LOW: export/index.ts does not re-export SlateRenderer or OTIOWriter
SlateRenderer is in `src/export/` but not exported. OTIOWriter is in `src/utils/media/` (organizational inconsistency).
- **Files**: `src/export/index.ts`, `src/utils/media/OTIOWriter.ts`

### LOW: No E2E test for full video export pipeline
Complete pipeline (render -> encode -> mux -> download) has no E2E test. Partly justified since WebCodecs requires a real browser.
- **Files**: `src/export/VideoExporter.ts`, `src/export/MP4Muxer.ts`

### LOW: MP4Muxer VP9/AV1 codec support incomplete
Writes minimal sample entries without proper codec configuration boxes (`vpcC`/`av1C`). H.264 is complete.
- **File**: `src/export/MP4Muxer.ts`

---

## Format Decoders

### HIGH: EXR PXR24 compression not implemented
PXR24 is common in production EXR files. Currently throws DecoderError.
- **File**: `src/formats/EXRDecoder.ts`

### MEDIUM: JP2 not wired by extension in FileSourceNode
JP2/J2K/JHC files are not detected by extension, only through DecoderRegistry fallback. No extension-based fast path exists.
- **File**: `src/nodes/sources/FileSourceNode.ts`

### MEDIUM: JP2 WASM module throws by default
`_loadWasmModule()` throws "WASM module not available". Need bundled openjph WASM or clear injection documentation.
- **File**: `src/formats/JP2Decoder.ts`

### MEDIUM: RAW duplicate isRAWExtension()
FileSourceNode has its own copy of `isRAWExtension()` that should use the one from RAWPreviewDecoder.
- **Files**: `src/nodes/sources/FileSourceNode.ts`, `src/formats/RAWPreviewDecoder.ts`

### MEDIUM: HDR orientation only works for -Y +X
Only `-Y +X` renders correctly. 7 other orientations parse dimensions but don't rearrange pixel data.
- **File**: `src/formats/HDRDecoder.ts`

### MEDIUM: AVIF tmap box uses heuristic float scanning
Replace heuristic float scanning with ISO 21496-1 spec-compliant parsing for headroom extraction.
- **File**: `src/formats/AVIFGainmapDecoder.ts`

### MEDIUM: MXF returns dummy 1x1 pixel image
DecoderRegistry adapter returns a dummy 1x1 pixel image. Should indicate metadata-only mode clearly in the API.
- **File**: `src/formats/MXFDemuxer.ts`, `src/formats/DecoderRegistry.ts`

### LOW: EXR B44/B44A compression not implemented
Less common but used in some VFX pipelines.
- **File**: `src/formats/EXRDecoder.ts`

### LOW: EXR UINT pixel type not decoded
Enum defined but decode throws.
- **File**: `src/formats/EXRDecoder.ts`

### LOW: EXR MIPMAP/RIPMAP tiled support missing
Needed for texture-based workflows.
- **File**: `src/formats/EXRDecoder.ts`

### LOW: DPX Method B 10-bit packing not supported
Some DPX writers use Method B.
- **File**: `src/formats/DPXDecoder.ts`

### LOW: TIFF 16-bit half-float not supported
Used in some VFX pipelines.
- **File**: `src/formats/TIFFFloatDecoder.ts`

### LOW: JPEG Gainmap XMP parsing uses fragile regex
Should consider structured XML parser.
- **File**: `src/formats/JPEGGainmapDecoder.ts`

### LOW: AVIF/HEIC shared ISOBMFF parsing code tightly coupled
ISOBMFF parsing lives in AVIFGainmapDecoder.ts but is used by HEICGainmapDecoder. Should extract to shared module.
- **Files**: `src/formats/AVIFGainmapDecoder.ts`, `src/formats/HEICGainmapDecoder.ts`

### LOW: HDR XYZE files decoded without XYZ-to-RGB conversion
Currently decoded as-is.
- **File**: `src/formats/HDRDecoder.ts`

### LOW: DPX CbYCrY (4:2:2) element descriptor not handled
Only RGB/RGBA descriptors supported.
- **File**: `src/formats/DPXDecoder.ts`

---

## Comparison & Layout

### HIGH: StackGroupNode does not actually composite
`getActiveInputIndex()` returns binary 0 or 1 based on `wipeX < 0.5` threshold. Does not do multi-layer compositing. Per-layer blend modes and opacities are stored but never applied. OpenRV's `StackIPNode.collapseInputs()` composites ALL inputs.
- **File**: `src/nodes/groups/StackGroupNode.ts`

### HIGH: Premultiplied alpha comment mismatch in BlendModes
Code comment says "assumes premultiplied alpha" but the Porter-Duff formula used is the straight-alpha formulation.
- **File**: `src/composite/BlendModes.ts`

### HIGH: WipeMode type mismatch between modules
`WipeMode` in `src/core/types/wipe.ts` includes `'quad'` but `ComparisonManager.ts` defines its own `WipeMode` without it. Type inconsistency.
- **Files**: `src/core/types/wipe.ts`, `src/ui/components/ComparisonManager.ts`

### MEDIUM: Difference matte is CPU-only 8-bit
`applyDifferenceMatte()` operates on `ImageData` (8-bit unsigned). For HDR/EXR content this loses precision and is slow. OpenRV does this in the GPU shader.
- **File**: `src/ui/components/DifferenceMatteControl.ts`

### MEDIUM: Blend compositing is CPU-only
All blend operations in `BlendModes.ts` operate on `ImageData`. Too slow for large images or real-time playback.
- **File**: `src/composite/BlendModes.ts`

### MEDIUM: Nearest-neighbor resize in BlendModes
`resizeImageData()` uses nearest-neighbor scaling, producing aliased results when compositing layers of different sizes.
- **File**: `src/composite/BlendModes.ts`

### MEDIUM: StackCompositeType not wired to BlendMode
`StackCompositeType` includes `'dissolve'`, `'minus'`, `'topmost'` but no mapping to `BlendMode` exists. These modes have no implementation.
- **Files**: `src/nodes/groups/StackGroupNode.ts`, `src/composite/BlendModes.ts`

### MEDIUM: Legacy WipeControl duplicates ComparisonManager functionality
`WipeControl.ts` partially duplicates ComparisonManager's wipe functionality. `cycleMode()` only cycles 3 modes vs ComparisonManager's 5.
- **File**: `src/ui/components/WipeControl.ts`

### LOW: MatteOverlay tests are shallow
Tests mostly verify "does not throw" rather than checking actual render coordinates.
- **File**: `src/ui/components/MatteOverlay.test.ts`

### LOW: Unused wipeAngle property in StackGroupNode
Property exists but is never read anywhere. OpenRV supports angled wipes.
- **File**: `src/nodes/groups/StackGroupNode.ts`

### LOW: No keyboard shortcut for quad view toggle
Only accessible from CompareControl dropdown.
- **Action**: Add shortcut (e.g., `Shift+Q`).

### LOW: No keyboard shortcut for matte overlay toggle
Requires session settings to toggle.

### LOW: Conditional E2E assertions in difference matte tests
Tests DIFF-E006/DIFF-E008 use `if (await gainSlider.isVisible())` which silently skips assertions.
- **File**: `e2e/difference-matte.spec.ts`

---

## Keyboard & App Wiring

### LOW: AppWiringFixes tests replicate logic inline
Regression tests for DCCBridge, ContextualKeyboardManager, and AudioMixer replicate handler logic inline rather than importing from App.ts. Could drift from actual implementation.
- **File**: `src/AppWiringFixes.test.ts`

### LOW: Shortcut cheat sheet shows dead shortcuts as functional
`showShortcutsDialog()` lists the 6 `conflictingDefaults` shortcuts with key combos as if they work, but pressing them does nothing.
- **File**: `src/AppKeyboardHandler.ts`

### LOW: OCIO bake size heuristic is string-pattern-based
`resolveOCIOBakeSize()` uses regex `/\baces\b/i` to decide between 33^3 and 65^3 LUT resolution. Could false-match or miss non-standard naming.
- **File**: `src/AppColorWiring.ts`

---

## Color Management

### MEDIUM: No dedicated color E2E tests
Color pipeline has 1411 unit tests but zero E2E coverage verifying the full UI-to-render path for LUT loading, CDL workflow, OCIO transforms.

### MEDIUM: No visual regression tests for color
No snapshot/golden-image comparison tests with perceptual delta E to catch subtle rendering differences.

### MEDIUM: OCIO WASM binary build pipeline missing
WASM integration exists in code but the binary is not bundled. Feature is effectively disabled at runtime.

### LOW: GPU tetrahedral interpolation not implemented
3D LUT interpolation runs on CPU. Could be moved to GPU for real-time performance.

### LOW: Full OCIO v2 YAML parser not implemented
Current parser handles a subset of OCIO config format.

### LOW: ICC profile auto-application not implemented
ICC profiles are parsed but not automatically applied based on display characteristics.
