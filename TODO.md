# TODO - Additional Audit Findings

Items discovered during the 12-group feature audit that are not in IMPROVE_PLAN.md.
Organized by feature group with priority levels.

---

## Paint & Annotations

### LOW: Variable-width stroke has visual gap artifacts
Segment-by-segment `ctx.stroke()` / `ctx.beginPath()` calls in `PaintRenderer.renderStroke()` create visible gaps at joints between segments because line caps don't overlap cleanly. The reference OpenRV uses overlapping circles/splats at each sample point for pressure-varying strokes.
- **File**: `src/paint/PaintRenderer.ts`

### LOW: Advanced tool strokes are not undoable
Dodge, burn, clone, and smudge operations are pixel-destructive and not tracked by the undo stack. Once applied, there is no way to revert them. Pixel snapshotting infrastructure exists (`sourceBuffer` in ViewerInputHandler) but snapshots are never saved to the undo stack. Fix requires storing before/after pixel states in the undo stack.
- **File**: `src/paint/AdvancedPaintTools.ts`, `src/paint/PaintEngine.ts`

---

## Rendering Pipeline

### LOW: Creative gamma skipped when display transfer is active
When `u_displayTransfer > 0` (sRGB/Rec.709), the per-channel creative gamma (`u_gammaRGB`) is not applied. Users lose per-channel gamma control when a display transfer function is selected. Should be restructured so creative gamma is always applied independently of display transfer.
- **File**: `src/render/shaders/viewer.frag.glsl`

### LOW: Clarity and sharpen sample ungraded pixels on GPU
Both clarity and sharpen compute their blur/detail kernels from `texture(u_texture, ...)` -- the original ungraded source pixels -- while the CPU path operates on already-graded data. Documented architectural difference accepted for single-pass performance. GPU and CPU paths may produce subtly different results.
- **File**: `src/render/shaders/viewer.frag.glsl`

### LOW: TextureCacheManager LRU eviction is O(n)
`evictLRU()` iterates all cache entries to find the one with lowest `lastAccessed`. Acceptable for current configured limits (~100 entries) but could be improved with a linked-list for O(1) eviction.
- **File**: `src/render/TextureCacheManager.ts`

### MEDIUM: effectProcessor.worker.test.ts tests are superficial
Tests now cover basic effect processing (highlights, color inversion, shared functions) but remain relatively basic - testing presence of effects rather than correctness of mathematical implementation or edge cases. Should extract effect processing functions into more thoroughly testable pure functions.
- **File**: `src/workers/effectProcessor.worker.test.ts`

### LOW: Canvas2DHDRBlit row-flip is CPU-bound for large images
`uploadAndDisplay()` performs per-row copy with Y-flip in JavaScript. For 4K images this is 2160 subarray+set operations on ~33MB of Float32Arrays.
- **File**: `src/render/Canvas2DHDRBlit.ts`

---

## Stereo 3D

### LOW: Checkerboard/scanline missing parity offset support
OpenRV's checkerboard and scanline shaders accept `parityOffsetX`/`parityOffsetY` parameters for viewport origin alignment. The web version hardcodes parity from `(0,0)`, which may invert left/right eye assignment at odd pixel origins.
- **File**: `src/stereo/StereoRenderer.ts`

### LOW: StereoEyeTransform applies to both eyes (differs from OpenRV convention)
OpenRV only applies geometric transforms to the right eye. The web version supports independent transforms on both eyes, which is more flexible but deviates from the established workflow.
- **File**: `src/stereo/StereoEyeTransform.ts`
- **Action**: Consider defaulting UI to show right-eye-only controls initially with a "Show Left Eye Controls" toggle.

### LOW: Missing hsqueezed and vsqueezed stereo output modes
OpenRV supports horizontal/vertical squeeze modes for passive 3D displays. Not present in web version. GTO parser maps these to side-by-side/over-under as fallback.
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

### LOW: AudioPlaybackManager rate change creates audio gap
`setPlaybackRate` during Web Audio playback calls `seek()` which internally pauses and restarts the AudioBufferSourceNode, creating an audible click/gap. HTMLVideoElement fallback handles this seamlessly.
- **File**: `src/audio/AudioPlaybackManager.ts`

---

## UI Components & Overlays

### LOW: HistoryPanel rebuilds entire DOM on every render
`render()` clears `innerHTML` and rebuilds all DOM nodes from scratch on every history change. For large histories this causes unnecessary GC pressure and layout thrashing.
- **File**: `src/ui/components/HistoryPanel.ts`

### LOW: CanvasOverlay base class has no dedicated tests
Tested indirectly through SafeAreasOverlay and SpotlightOverlay subclass tests, but base class edge cases not explicitly covered.
- **File**: `src/ui/components/CanvasOverlay.ts`

### LOW: VideoFrameFetchTracker has no tests
Simple state container but tracks critical state for video frame fetching.
- **File**: `src/ui/components/VideoFrameFetchTracker.ts`

---

## Network & Collaboration

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

---

## Export & Integrations

### LOW: export/index.ts does not re-export OTIOWriter
SlateRenderer is now properly exported. OTIOWriter is in `src/utils/media/` (organizational inconsistency) and still not re-exported from `src/export/index.ts`.
- **Files**: `src/export/index.ts`, `src/utils/media/OTIOWriter.ts`

### LOW: No E2E test for full video export pipeline
Complete pipeline (render -> encode -> mux -> download) has no E2E test. Partly justified since WebCodecs requires a real browser.
- **Files**: `src/export/VideoExporter.ts`, `src/export/MP4Muxer.ts`

### LOW: MP4Muxer VP9/AV1 codec support incomplete
Writes minimal sample entries without proper codec configuration boxes (`vpcC`/`av1C`). H.264 is complete.
- **File**: `src/export/MP4Muxer.ts`

---

## Format Decoders

### MEDIUM: JP2 WASM module throws by default
`_loadWasmModule()` throws "WASM module not available". Need bundled openjph WASM or clear injection documentation.
- **File**: `src/formats/JP2Decoder.ts`

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
ISOBMFF parsing lives in AVIFGainmapDecoder.ts but is used by HEICGainmapDecoder via direct imports. Should extract to a dedicated shared module.
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

### MEDIUM: Difference matte is CPU-only 8-bit
`applyDifferenceMatte()` operates on `ImageData` (8-bit unsigned). For HDR/EXR content this loses precision and is slow. OpenRV does this in the GPU shader.
- **File**: `src/ui/components/DifferenceMatteControl.ts`

### MEDIUM: Blend compositing is CPU-only
All blend operations in `BlendModes.ts` operate on `ImageData`. Too slow for large images or real-time playback.
- **File**: `src/composite/BlendModes.ts`

### LOW: MatteOverlay tests are shallow
Tests mostly verify "does not throw" rather than checking actual render coordinates. Some behavioral tests exist but lack coordinate assertions.
- **File**: `src/ui/components/MatteOverlay.test.ts`

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
DCCBridge inline regression tests were removed. Remaining ContextualKeyboardManager and AudioMixer tests are proper. Low priority.
- **File**: `src/AppWiringFixes.test.ts`

### LOW: OCIO bake size heuristic is string-pattern-based
`resolveOCIOBakeSize()` uses regex `/\baces\b/i` to decide between 33^3 and 65^3 LUT resolution. Could false-match or miss non-standard naming.
- **File**: `src/AppColorWiring.ts`

---

## Color Management

### MEDIUM: No visual regression tests for color
Pixel-level delta testing exists in E2E tests but no structured snapshot/golden-image comparison with perceptual delta E using Playwright's `toHaveScreenshot()`.

### MEDIUM: OCIO WASM binary build pipeline missing
WASM integration exists in code but the binary is not bundled. Feature is effectively disabled at runtime.

### LOW: GPU tetrahedral interpolation not implemented
Tetrahedral interpolation is fully implemented on CPU (`TetrahedralInterp.ts`). GPU shader still uses trilinear interpolation for 3D LUTs.

### LOW: Full OCIO v2 YAML parser not implemented
Current parser handles a subset of OCIO config format.

### LOW: ICC profile auto-application not implemented
ICC profiles are parsed but not automatically applied based on display characteristics.
