# OpenRV Compatibility Plan — Remaining Items

> All 18 main plan items (0.0–3.4) have been **implemented**.
> This file tracks only remaining known issues and minor gaps.

---

## Completed Items (for reference)

All phases fully implemented:

- ~~0.0 GTO connections object parsing~~ — `GTOGraphLoader.ts:485-514`
- ~~0.1 Per-channel RVColor arrays~~ — `color.ts`, `GTOSettingsParser.ts`, `viewer.frag.glsl`, `ShaderStateManager.ts`
- ~~0.2 RVLinearize logtype rendering~~ — `GTOSettingsParser.parseLinearize()`, `viewer.frag.glsl:648-700`
- ~~0.3 RVColor luminance LUT~~ — `GTOSettingsParser.ts:312-324`, `Renderer.ts:599-638`, `viewer.frag.glsl:705-723`
- ~~1.1 Multi-part EXR support~~ — `EXRDecoder.ts:1748-1870`
- ~~1.2 CDL collection files (.ccc/.cc) + ACEScct~~ — `CDL.ts:parseCC/parseCCC`, `viewer.frag.glsl:787-818`
- ~~1.3 RVFormat uncrop~~ — `GTOSettingsParser.parseUncrop()`, `EXRDecoder.ts:1633-1688`
- ~~1.4 Out-of-range visualization~~ — `viewer.frag.glsl:1183-1197`, `GTOSettingsParser.parseOutOfRange()`
- ~~1.5 LUT matrix application~~ — `WebGLLUT.ts:78-79,518-537` (with transpose=true)
- ~~2.1 Explicit retime frame mapping~~ — `RetimeGroupNode.ts:73-80`
- ~~2.2 Audio scrubbing~~ — `AudioPlaybackManager.ts:413-473`
- ~~2.3 Per-channel scale/offset~~ — `viewer.frag.glsl:951`, `ShaderStateManager.ts:1364-1365`
- ~~2.4 RVEDL file import~~ — `RVEDLParser.ts`
- ~~2.5 Procedural sources~~ — `ProceduralSourceNode.ts` (smpte_bars, color_chart, gradient, solid)
- ~~3.1 3DE4 anamorphic coefficients~~ — `LensDistortion.ts:131-182`
- ~~3.2 Viper log type~~ — `LogCurves.ts:213-261` (proper curve, not Cineon fallback)
- ~~3.3 RVChannelMap full remapping~~ — `viewer.frag.glsl:905-920` (6-value swizzle system)
- ~~3.4 Retime warp keyframes~~ — `RetimeGroupNode.ts:97-153`

---

## Remaining Known Issues

### 1. Property addressing modes (P2 — deferred)

`#RVColor.color.exposure`, `@RVDisplayColor` dynamic property access syntax is
not supported. Relevant for Mu/Python scripting layer. Deferred until scripting
is implemented.

### 2. Missing protocols in PROTOCOL_TO_NODE_TYPE (P2 — partial)

`RVSourceGroup` is handled as a special case in `GTOGraphLoader.ts:534-568`
but is **not** in the `PROTOCOL_TO_NODE_TYPE` map. `RVSequenceGroup` and
`RVStackGroup` are in the map. Still missing from the map:

- `RVDisplayGroup`
- `RVViewPipelineGroup`

### 3. `session.realtime` export hardcoded to 0 (Minor)

Loading works correctly (prefers `realtime` over `fps`), but
`SessionGTOExporter.ts` hardcodes `realtime=0` on export. Round-trip loses
playback rate preference when `realtime` differs from `fps`.

### 4. `session.bgColor` not parsed or exported (Minor, cosmetic)

No parsing in GTOGraphLoader, no export in SessionGTOExporter.

### 5. Overlay round-trip incomplete (Minor)

Paint annotations survive round-trip via `PaintSerializer`. However, RVOverlay
objects (rectangles, text overlays, window overlays) are parsed into generic
properties but **not reconstructed on export**. `buildOverlayObject` method
exists but is never called from `updateGTOData`.

---

## Resolved Known Issues

- ~~6. GTO version hardcoded to 4~~ — **FALSE**. Version uses `metadata.version`,
  not hardcoded. (SessionGTOExporter.ts:1481)
- ~~5. GTO binary format endianness~~ — Delegated to `gto-js` library; no
  action needed in openrv-web.
