# Issues

This file tracks findings from code audit (Wave 1 broad sweep → Wave 2+3 verification).

## Validation Notes

- `pnpm typecheck`: passed
- `pnpm lint`: passed (0 errors, warnings only)
- `pnpm build`: passed
- Targeted Chromium init/layout/mobile checks: passed
- Smoke subset: reproduced `WORKFLOW-001`, `HG-E002`, and `HG-E003`
- Browser spot-check: `Shift+G` and `Shift+A` still work, so the channel shortcut breakage is selective rather than universal
- Isolated reruns of `CS-030`, `EXR-011`, and `SEQ-012`: passed

---

## FIXED

These issues were found and fixed during the audit:

- ~~**HIGH-02**~~: Node disposal didn't clear outputs or notify downstream — added `disconnectAllOutputs()` in `IPNode.ts`
- ~~**HIGH-10**~~: Empty video (maxFrame=0) caused invalid frame clamping — early return in `MediabunnyFrameExtractor.ts`
- ~~**HIGH-13**~~: renderWorker silently dropped unknown messages — added default case in `renderWorker.worker.ts`
- ~~**HIGH-22**~~: Auto-save recovery skipped PAR/background pattern UI sync — now uses `syncControlsFromState()` in `AppPersistenceManager.ts`
- ~~**MED-11**~~: Double recovery dialog on startup — removed legacy fallback path in `AppPersistenceManager.ts`
- ~~**HIGH-01**~~: No WebGL context loss recovery in Renderer — added context loss/restore listeners, guards on all GL methods, stale texture detection via `gl.isTexture()`
- ~~**MED-01**~~: Scissor test state not fully restored in renderTiledImages — save/restore scissor enabled state and scissor box in `finally` block
- ~~**MED-08**~~: StackGroupNode opacity clamping bypassed via direct property set — added `transform` callback to Property system, clamping at property level
- ~~**MED-15**~~: LensDistortion edge pixels opaque black instead of transparent — changed OOB alpha to 0, added boundary interpolation
- ~~**MED-17**~~: AppNetworkBridge media transfer timeout missing — added 30s idle timeout with reset on chunk, cleanup on completion/dispose
- ~~**MED-43**~~: renderWorker protocol version mismatch only warns — now rejects with error response and early return
- ~~**MED-47**~~: Starvation pause indistinguishable from user pause — added `playbackStarved` event, `isStarved`/`pauseReason` getters, forwarded through Session
- ~~**MED-48**~~: Temperature/tint unclamped intermediates — added `max(0)` clamp across all 5 backends, fixed CacheLUTNode tint cross-channel mismatch
- ~~**MED-53**~~: ColorWheels not wired through AppColorWiring — wired for persistence, history, session serialization
- ~~**LOW-13**~~: Missing PAR/background default values in SessionSerializer.fromJSON — changed to `??` with proper defaults

---

## VERIFIED ISSUES (confirmed against source code)

### Partially Confirmed (with caveats)

#### CRIT-01: HDR VideoFrame lifecycle unmanaged (by design)
- **File**: `src/utils/media/MediabunnyFrameExtractor.ts` ~lines 737-785
- **Status**: By design — `getFrameHDR()` transfers ownership to caller. HDR probe path has proper try/finally cleanup. Risk is at call sites.

#### HIGH-25: Topmost blend mode checks only first layer
- **File**: `src/composite/BlendModes.ts` ~lines 294-309
- **Status**: Likely correct — topmost is a stack-level mode set uniformly on all layers. Checking `layers[0]` suffices.

#### HIGH-31: MPF offset arithmetic partially unchecked
- **File**: `src/formats/JPEGGainmapDecoder.ts` ~lines 413, 432
- **Status**: Won't crash (ArrayBuffer.slice clamps), but truncated JPEG blobs produce opaque errors.

#### MED-19: HotReloadManager state capture not deep-cloned
- **File**: `src/plugin/dev/HotReloadManager.ts` ~lines 59-61
- **Status**: Design-level concern — depends on plugin's `getState()` returning a copy (which is the contract).

#### MED-28: JPEG marker segment length partially unchecked
- **File**: `src/formats/JPEGGainmapDecoder.ts` ~lines 227, 335, 493, 549
- **Status**: `segmentLength = 0` could cause infinite loop, but `dataLen = segmentLength - 2` goes negative, preventing OOB reads.

#### MED-30: MPF IFD entry count unbounded
- **File**: `src/formats/JPEGGainmapDecoder.ts` ~lines 386-415
- **Status**: Up to 65535 iterations from uint16. Buffer bounds check prevents OOB reads but CPU cost is unbounded.

#### MED-35: AudioContext resume gap before isPlaying set
- **File**: `src/audio/AudioPlaybackManager.ts` ~lines 280-308
- **Status**: Gap exists, but AudioCoordinator already works around it with its own `_isPlaying` flag.

#### MED-39: AudioCoordinator dispose doesn't stop playback first
- **File**: `src/audio/AudioCoordinator.ts` ~lines 272-277
- **Status**: `_manager.dispose()` called without pause. Whether this matters depends on AudioPlaybackManager.dispose() handling active playback internally.

#### MED-42: Detected FPS calculation flawed for edge case
- **File**: `src/utils/media/MediabunnyFrameExtractor.ts` ~lines 434-448
- **Status**: Guard at line 435 (`lastTimestamp > 0`) prevents execution for single-frame-at-t=0. Formula would be wrong for 1 frame with non-zero timestamp.

---

## UNVERIFIED (remaining from Wave 1)

These findings were not yet verified against actual source code:

#### Render/Shader
- **MED-49**: Brightness unclamped in SDR path before contrast — `viewer.frag.glsl` ~line 1087
- **MED-50**: HLG OOTF gain extremely high for near-black — `viewer.frag.glsl` ~line 560
- **MED-51**: Color primaries metadata lost through LUT stages — `src/color/pipeline/LUTPipeline.ts`
- **MED-52**: Tone mapping headroom inconsistent across operators — `viewer.frag.glsl` ~lines 253-296
- **MED-54**: Gamut mapping matrix working space undocumented — `viewer.frag.glsl` ~lines 1069, 1367
- **MED-55**: WebGPU extended tone mapping not verified at runtime — `hdr-acceptance-criteria.test.ts`

#### Node System
- **MED-10**: FileSourceNode properties inconsistent with defineNodeProperty — `FileSourceNode.ts` ~lines 584-590
- **LOW-09**: Stereo input format not serializable — `FileSourceNode.ts` ~lines 574, 2104
- **LOW-10**: BaseSourceNode.connectInput warns instead of throwing — `BaseSourceNode.ts` ~lines 38-40
- **LOW-11**: StackGroupNode chosenAudioInput not range-validated — `StackGroupNode.ts` ~lines 93-94
- **LOW-12**: Canvas dirty flag not reset after load failures — `FileSourceNode.ts` ~lines 1047-1049

#### UI Controls
- **MED-23**: DisplayProfileControl slider range not validated on load — `DisplayProfileControl.ts`
- **MED-25**: Multiple global document click listeners without delegation — Multiple UI components

#### Workers
- **LOW-22**: ImageBitmap close error handling incomplete — `renderWorker.worker.ts` ~lines 211-226
- **LOW-23**: Effect processor error stack unavailable in production — `effectProcessor.worker.ts` ~lines 1088-1099
- **LOW-24**: Midtone mask integer rounding precision — `effectProcessor.worker.ts` ~lines 124-134

#### Format Decoders
- **MED-29**: HDR RLE scanline validation — `HDRDecoder.ts` ~lines 414-446 (verified: throws on mismatch — likely FP)
- **MED-33**: TIFF LZW chain corruption — `TIFFFloatDecoder.ts` ~lines 323-324
- **MED-34**: JPEG Gainmap MPF offset+size overflow — `JPEGGainmapDecoder.ts` ~lines 82, 101
- **LOW-17**: TIFF LZW string length overflow in Uint16Array — `TIFFFloatDecoder.ts` ~lines 316, 371
- **LOW-18**: TIFF unknown tag type returns 1 silently — `TIFFFloatDecoder.ts` ~lines 166-180
- **LOW-19**: TIFF bits-per-sample not validated for float format — `TIFFFloatDecoder.ts` ~lines 766-771

#### Misc
- **MED-18**: WebSocketClient malformed message flood not rate-limited — `WebSocketClient.ts` ~lines 32-38
- **LOW-07**: Clarity/sharpen sample raw texture (known trade-off) — `viewer.frag.glsl`
- **LOW-14**: Stereo eye offset not bounds-validated — `StereoRenderer.ts` ~lines 278-300
- **LOW-15**: Stereo side-by-side odd width asymmetry — `StereoRenderer.ts` ~lines 310-311
- **LOW-20**: Frame accumulator overflow on speed changes — `PlaybackEngine.ts` ~lines 312-329
- **LOW-21**: Dropped frame counter never reset — `PlaybackEngine.ts` ~lines 814-879

---

## FALSE POSITIVES REMOVED

Wave 2+3 verification rejected these findings:

| ID | Reason |
|---|---|
| CRIT-02 | ManagedVideoFrame.wrap() — single-threaded by contract |
| CRIT-03 | ZebraControl handleOutsideClick — exists as arrow property |
| CRIT-04 | BugOverlaySettingsMenu — properly tracked in dismissHandlers |
| HIGH-03 | VideoExporter backpressure — encodeQueueSize is standard WebCodecs |
| HIGH-04 | Paint undo/redo — intentional design for collaborative editing |
| HIGH-05 | Extraction queue — deliberate design with abort signal |
| HIGH-06 | PlaybackEngine play promise — guard checked synchronously |
| HIGH-08 | Audio sync 100ms — intentional, configurable |
| HIGH-09 | Snapshot cache — intentional ownership model (FramePreloadManager) |
| HIGH-14 | Buffer ownership — standard Web Worker transferable pattern |
| HIGH-15 | Clarity buffer OOM — RangeError propagated, caught by worker |
| HIGH-16 | Sharpen buffers — fully overwritten via .set() each frame |
| HIGH-17 | AutoSaveIndicator — guard prevents duplicate popovers |
| HIGH-21 | SlateEditor form — DOM removal GCs inline listeners |
| HIGH-23 | AutoSave quota — generic catch handles it |
| HIGH-24 | AutoSave init — initialize() returns status, caller can act |
| HIGH-26 | TIFF LZW code — table arrays 4096, codes bounded by MAX_CODE |
| HIGH-27 | TIFF IFD offset — DataView throws RangeError, caught by try/catch |
| HIGH-28-30 | TIFF overflow — JS numbers handle these sizes safely |
| HIGH-32 | PQ normalization — 10000/203 is fixed standard, headroom in TMO |
| HIGH-33 | Curves HDR — explicit headroom preservation (excess split/restored) |
| MED-02 | Contour coords — v_texCoord correctly maps regardless of zoom |
| MED-03 | HDR color space — warning logged on failure, not silent |
| MED-04 | LUT buffer — 1ch path doesn't use deinterleaved buffer |
| MED-05 | Scope FBO — failure path leaves scopeFBO=null, stale dims harmless |
| MED-06 | Extension vs magic — magic bytes validated inside each format path |
| MED-07 | JXL blob URL — properly revoked in error catch |
| MED-12 | Auto-checkpoint — guards are correct (avoid empty checkpoints) |
| MED-13 | Partial restore — placeholders maintain index positions correctly |
| MED-14 | Perspective EPSILON — standard value, OOB pixels → transparent |
| MED-16 | Remote cursors — cleaned up on room leave/user list update/dispose |
| MED-20 | Pending writes — finally block always cleans up, dispose clears |
| MED-21 | Premultiplied alpha — Porter-Duff "over" is correct |
| MED-22 | Color history race — suppressHistory logic is correct |
| MED-29 | HDR RLE — width validated, throws on mismatch |
| MED-36 | Pending fetch — fire-and-forget by design, cleared on pause |
| MED-37 | AudioCoordinator unsub — _errorUnsub properly cleaned in dispose |
| MED-40 | Float cache key — JS toString preserves full double precision |
| MED-46 | Seek clamp — duration defaults to 1, clamp is correct safeguard |
| MED-56 | hdrHeadroom — setHDRHeadroom clamps [1, 100] (NaN edge case only) |
| LOW-02 | LUT domain — clamp(0,1) handles Inf; NaN is theoretical |
