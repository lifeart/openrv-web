# Issues

This file tracks findings from exploratory review and targeted validation runs.

## Confirmed Issues


### 460. The browser-support docs present External Presentation as a working BroadcastChannel feature, but the shipped feature is already broken at runtime

- Severity: Low
- Area: Documentation / browser compatibility
- Evidence:
  - The browser-requirements page says BroadcastChannel "enables the External Presentation feature, which synchronizes frame, playback, and color state" in [docs/getting-started/browser-requirements.md](/Users/lifeart/Repos/openrv-web/docs/getting-started/browser-requirements.md#L65) through [docs/getting-started/browser-requirements.md#L67).
  - The browser-compatibility matrix likewise lists `BroadcastChannel (ext. presentation)` as an available feature by browser in [docs/reference/browser-compatibility.md](/Users/lifeart/Repos/openrv-web/docs/reference/browser-compatibility.md#L34) through [docs/reference/browser-compatibility.md#L38).
  - The runtime problem is already visible in production code: the external presentation window is a blank shell that only updates frame text while ignoring real viewer rendering/playback/color state, as documented in issue `29` with evidence in [src/ui/components/ExternalPresentation.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/ExternalPresentation.ts#L132) through [src/ui/components/ExternalPresentation.ts#L244) and [src/App.ts](/Users/lifeart/Repos/openrv-web/src/App.ts#L546) through [src/App.ts](/Users/lifeart/Repos/openrv-web/src/App.ts#L566).
- Impact:
  - The compatibility docs make External Presentation sound like a reliable browser-capability question, when the stronger limitation is that the shipped feature itself is not functionally complete.
  - Users can spend time diagnosing browser support for a feature that is already broken independent of API availability.

### 462. The UI overview says all interactive controls are semantic and properly labeled, but the shipped UI still has mouse-only/non-semantic interactions

- Severity: Low
- Area: Documentation / accessibility claims
- Evidence:
  - The UI overview says "All interactive controls use semantic HTML elements with appropriate ARIA labels and roles" in [docs/getting-started/ui-overview.md](/Users/lifeart/Repos/openrv-web/docs/getting-started/ui-overview.md#L236) through [docs/getting-started/ui-overview.md#L238).
  - The shipped Pixel Probe exposes copyable value rows as mouse-only `div`s rather than real buttons in [src/ui/components/PixelProbe.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/PixelProbe.ts#L358) through [src/ui/components/PixelProbe.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/PixelProbe.ts#L403), which is already captured as issue `75`.
  - The left/right inspector accordion headers are still mouse-only click targets rather than keyboard-operable disclosure controls in [src/ui/layout/panels/LeftPanelContent.ts](/Users/lifeart/Repos/openrv-web/src/ui/layout/panels/LeftPanelContent.ts#L169) through [src/ui/layout/panels/LeftPanelContent.ts#L206) and [src/ui/layout/panels/RightPanelContent.ts](/Users/lifeart/Repos/openrv-web/src/ui/layout/panels/RightPanelContent.ts#L178) through [src/ui/layout/panels/RightPanelContent.ts#L214), already captured as issue `65`.
- Impact:
  - The overview overstates the current accessibility quality of the shipped UI.
  - Users and auditors can infer a more consistently semantic control surface than the runtime actually provides.



### 472. The advanced-compare docs present Quad View as a shipped feature, but the live UI itself marks it as preview-only and unwired

- Severity: Low
- Area: Documentation / compare workflow
- Evidence:
  - The advanced-compare page describes Quad View as a working mode where four quadrants each display a different source and stay in sync during playback in [docs/compare/advanced-compare.md](/Users/lifeart/Repos/openrv-web/docs/compare/advanced-compare.md#L7) through [docs/compare/advanced-compare.md](/Users/lifeart/Repos/openrv-web/docs/compare/advanced-compare.md#L11).
  - The shipped Compare dropdown now labels Quad View with a `preview` badge and an explicit tooltip saying it is “not yet connected to the viewer rendering pipeline” in [src/ui/components/CompareControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/CompareControl.ts#L585) through [src/ui/components/CompareControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/CompareControl.ts#L593).
  - Production view wiring still only subscribes to wipe, A/B, difference matte, and blend-mode events; quad-view changes only produce a warning in [src/AppViewWiring.ts](/Users/lifeart/Repos/openrv-web/src/AppViewWiring.ts#L87) through [src/AppViewWiring.ts](/Users/lifeart/Repos/openrv-web/src/AppViewWiring.ts#L143).
- Impact:
  - The docs teach Quad View as ready for real multi-version review even though the shipped UI itself warns that it is only a preview surface.
  - That makes the comparison docs more optimistic than the app and sets users up to trust a mode that is still non-functional in production.

### 475. The advanced-compare docs say comparison annotations follow the underlying source, but production still keys them to the active `A/B` slot

- Severity: Low
- Area: Documentation / compare annotations
- Evidence:
  - The advanced-compare page says “Annotations are tied to the source they were drawn on” and that switching between A and B preserves each source’s annotation layer independently in [docs/compare/advanced-compare.md](/Users/lifeart/Repos/openrv-web/docs/compare/advanced-compare.md#L61) through [docs/compare/advanced-compare.md#L63).
  - Production paint wiring still forwards `session.currentAB` into the annotation version selector in [src/services/LayoutOrchestrator.ts](/Users/lifeart/Repos/openrv-web/src/services/LayoutOrchestrator.ts#L645).
  - The underlying compare state that drives that routing is only `A` or `B`, not a stable source identity, in [src/core/session/ABCompareManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/ABCompareManager.ts#L26) through [src/core/session/ABCompareManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/ABCompareManager.ts#L43).
- Impact:
  - The docs imply source-stable comparison annotations, but the shipped behavior can drift when A/B assignments change.
  - Reviewers can trust the docs and assume an annotation belongs to a media source when production is still anchoring it to the compare slot instead.


### 494. The gamut-diagram docs describe a target-gamut compliance tool, but the shipped diagram only overlays scatter against fixed input/working/display triangles

- Severity: Low
- Area: Documentation / gamut diagram behavior
- Evidence:
  - The gamut-diagram guide says pixels are shown relative to “a target color gamut,” and frames the scope around whether colors fall “within or outside a target color gamut” in [docs/scopes/gamut-diagram.md](/Users/lifeart/Repos/openrv-web/docs/scopes/gamut-diagram.md#L3) through [docs/scopes/gamut-diagram.md](/Users/lifeart/Repos/openrv-web/docs/scopes/gamut-diagram.md#L29).
  - The shipped `GamutDiagram` has no target-gamut selection or compliance state. Its only gamut state is the trio `inputColorSpace`, `workingColorSpace`, and `displayColorSpace` in [src/ui/components/GamutDiagram.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/GamutDiagram.ts#L48) through [src/ui/components/GamutDiagram.ts#L50).
  - The rendered overlay simply draws up to three gamut triangles and a neutral white scatter plot in [src/ui/components/GamutDiagram.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/GamutDiagram.ts#L307) through [src/ui/components/GamutDiagram.ts#L347) and [src/ui/components/GamutDiagram.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/GamutDiagram.ts#L349) through [src/ui/components/GamutDiagram.ts#L474).
  - There is no production path that classifies samples as “inside/outside target gamut,” colors out-of-gamut points differently, or exposes the clip-vs-compress compliance workflow the docs describe.
- Impact:
  - The guide makes the gamut diagram sound like an explicit compliance checker when the shipped visualization is just an unclassified chromaticity scatter over multiple triangles.
  - Users can expect target-gamut diagnostics and out-of-gamut identification that the runtime does not provide.

### 497. The browser-compatibility guide overstates mobile support as “touch-optimized” even though parts of the shipped UI still depend on hover-only or non-touch interaction models

- Severity: Low
- Area: Documentation / mobile support
- Evidence:
  - The browser-compatibility matrix marks iOS Safari and Android Chrome as `Functional (touch-optimized)` in [docs/reference/browser-compatibility.md](/Users/lifeart/Repos/openrv-web/docs/reference/browser-compatibility.md#L66) through [docs/reference/browser-compatibility.md#L71).
  - The same guide immediately admits the interface is still desktop-optimized in [docs/reference/browser-compatibility.md](/Users/lifeart/Repos/openrv-web/docs/reference/browser-compatibility.md#L72).
  - The shipped volume control is explicitly hover-based and only exposes its slider on `pointerenter` / `pointerleave` in [src/ui/components/VolumeControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/VolumeControl.ts#L88) and [src/ui/components/VolumeControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/VolumeControl.ts#L154) through [src/ui/components/VolumeControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/VolumeControl.ts#L174), with the non-hover workaround already captured as issue `116`.
  - The generic virtual-slider interaction helper also bails out for `pointerType === 'touch'` in [src/ui/components/VirtualSliderController.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/VirtualSliderController.ts#L245) through [src/ui/components/VirtualSliderController.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/VirtualSliderController.ts#L266), which means at least some slider-style interactions are intentionally not touch-driven.
- Impact:
  - The docs make the mobile experience sound more intentionally touch-adapted than the shipped UI actually is.
  - Users evaluating tablet/mobile review workflows can expect a more polished touch-first control model than production currently provides.


### 499. The format docs overstate GIF and animated WebP support as if the app treated them like real animated media, but the shipped loader still models them as single-frame image sources

- Severity: Low
- Area: Documentation / animated browser-native image formats
- Evidence:
  - The top-level format reference explicitly advertises `GIF` with “Animated GIF support” in [docs/reference/file-formats.md](/Users/lifeart/Repos/openrv-web/docs/reference/file-formats.md#L12).
  - The deeper file-format guide also describes browser-native `WebP` and `GIF` as supporting “animation” in [docs/guides/file-formats.md](/Users/lifeart/Repos/openrv-web/docs/guides/file-formats.md#L190) through [docs/guides/file-formats.md](/Users/lifeart/Repos/openrv-web/docs/guides/file-formats.md#L193).
  - The shipped media-type layer still classifies both `.gif` and `.webp` as plain image formats, not video/timeline media, in [src/utils/media/SupportedMediaFormats.ts](/Users/lifeart/Repos/openrv-web/src/utils/media/SupportedMediaFormats.ts#L8) through [src/utils/media/SupportedMediaFormats.ts](/Users/lifeart/Repos/openrv-web/src/utils/media/SupportedMediaFormats.ts#L31).
  - Both `loadImage(...)` and `loadImageFile(...)` create `MediaSource` entries with `type: 'image'` and hardcoded `duration: 1` in [src/core/session/SessionMedia.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionMedia.ts#L409) through [src/core/session/SessionMedia.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionMedia.ts#L417) and [src/core/session/SessionMedia.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionMedia.ts#L449) through [src/core/session/SessionMedia.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionMedia.ts#L456).
- Impact:
  - The docs make animated GIF/WebP sound like proper reviewable moving-image formats, but the shipped session/timeline model still treats them as single-frame stills.
  - Users can expect timeline duration, frame stepping, and normal playback semantics that production does not actually wire for those formats.

### 500. The file-format guide says browser-native images are handled at `Session.loadImage()` level, but real local-file opens route through `FileSourceNode` first

- Severity: Low
- Area: Documentation / image-loading architecture
- Evidence:
  - The file-format guide says browser-native formats are “handled at the `Session.loadImage()` level using the browser’s `<img>` element, bypassing the `DecoderRegistry` entirely” in [docs/guides/file-formats.md](/Users/lifeart/Repos/openrv-web/docs/guides/file-formats.md#L199).
  - The real local-file path in `SessionMedia.loadImageFile(...)` first creates a `FileSourceNode` and calls `fileSourceNode.loadFile(file)` for ordinary image files in [src/core/session/SessionMedia.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionMedia.ts#L441) through [src/core/session/SessionMedia.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionMedia.ts#L456).
  - `FileSourceNode.loadFile(...)` then does its own format branching for EXR/DPX/TIFF/JPEG/AVIF/JXL/HEIC/JP2/RAW before falling back to standard image loading in [src/nodes/sources/FileSourceNode.ts](/Users/lifeart/Repos/openrv-web/src/nodes/sources/FileSourceNode.ts#L1858) through [src/nodes/sources/FileSourceNode.ts](/Users/lifeart/Repos/openrv-web/src/nodes/sources/FileSourceNode.ts#L2045).
  - `Session.loadImage(...)` is instead the URL/image-element path, not the main local-file entrypoint, in [src/core/session/SessionMedia.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionMedia.ts#L399) through [src/core/session/SessionMedia.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionMedia.ts#L431).
- Impact:
  - The guide explains the shipped architecture incorrectly for ordinary local image loads.
  - That makes the format docs misleading for anyone debugging load behavior, decoder fallbacks, or source-node state in production.

### 503. The file-format guide says all image decoding yields `Float32Array` RGBA data, but standard browser-native image loads still stay as `HTMLImageElement` sources

- Severity: Low
- Area: Documentation / image decode architecture
- Evidence:
  - The guide claims “All image decoding produces **Float32Array** pixel data in RGBA layout” in [docs/guides/file-formats.md](/Users/lifeart/Repos/openrv-web/docs/guides/file-formats.md#L9).
  - The normal `FileSourceNode.load(...)` path for standard JPEG/AVIF and other browser-native images stores the decoded result as `this.image = img` and explicitly leaves `this.cachedIPImage = null` in [src/nodes/sources/FileSourceNode.ts](/Users/lifeart/Repos/openrv-web/src/nodes/sources/FileSourceNode.ts#L655) through [src/nodes/sources/FileSourceNode.ts](/Users/lifeart/Repos/openrv-web/src/nodes/sources/FileSourceNode.ts#L679) and [src/nodes/sources/FileSourceNode.ts](/Users/lifeart/Repos/openrv-web/src/nodes/sources/FileSourceNode.ts#L725) through [src/nodes/sources/FileSourceNode.ts](/Users/lifeart/Repos/openrv-web/src/nodes/sources/FileSourceNode.ts#L749).
  - The URL/image-element path likewise resolves ordinary images into `HTMLImageElement`-backed `MediaSource` objects in [src/core/session/SessionMedia.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionMedia.ts#L399) through [src/core/session/SessionMedia.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionMedia.ts#L431).
  - By contrast, the real `Float32Array` / `IPImage` path is only used for specific HDR/decoder-backed formats such as EXR, gainmap HDR, JXL/HEIC SDR fallback, and other explicit buffer decodes in [src/nodes/sources/FileSourceNode.ts](/Users/lifeart/Repos/openrv-web/src/nodes/sources/FileSourceNode.ts#L989) through [src/nodes/sources/FileSourceNode.ts](/Users/lifeart/Repos/openrv-web/src/nodes/sources/FileSourceNode.ts#L1049) and [src/nodes/sources/FileSourceNode.ts](/Users/lifeart/Repos/openrv-web/src/nodes/sources/FileSourceNode.ts#L1764) through [src/nodes/sources/FileSourceNode.ts](/Users/lifeart/Repos/openrv-web/src/nodes/sources/FileSourceNode.ts#L1782).
- Impact:
  - The docs overstate how uniform the shipped decode pipeline really is.
  - Anyone reading the guide to understand memory behavior, plugin integration, or browser-native image handling will expect a Float32 decode stage that standard images do not actually use.

### 504. The plain-AVIF docs promise a WASM fallback, but the shipped AVIF path is browser-native only

- Severity: Low
- Area: Documentation / AVIF support
- Evidence:
  - The file-format guide says plain AVIF uses “Browser-native decode via `createImageBitmap()` with WASM fallback (`avif.ts`)" in [docs/guides/file-formats.md](/Users/lifeart/Repos/openrv-web/docs/guides/file-formats.md#L156).
  - The actual `avif.ts` module only implements browser-native decode through `createImageBitmap(blob)` and contains no alternate WASM decoder path in [src/formats/avif.ts](/Users/lifeart/Repos/openrv-web/src/formats/avif.ts#L4) through [src/formats/avif.ts](/Users/lifeart/Repos/openrv-web/src/formats/avif.ts#L65).
  - The live `FileSourceNode` path for non-HDR AVIF likewise checks gainmap/HDR markers and then falls back to a blob-backed `Image` load, not a WASM AVIF decoder, in [src/nodes/sources/FileSourceNode.ts](/Users/lifeart/Repos/openrv-web/src/nodes/sources/FileSourceNode.ts#L696) through [src/nodes/sources/FileSourceNode.ts](/Users/lifeart/Repos/openrv-web/src/nodes/sources/FileSourceNode.ts#L760).
- Impact:
  - The docs imply broader plain-AVIF compatibility than the shipped runtime actually provides on browsers without native AVIF support.
  - Readers can expect a decode fallback path that production does not implement.



### 526. The image-sequences guide still presents fixed `5`-frame preload and `20`-frame retention windows, but the live sequence stack now mixes multiple larger cache policies

- Severity: Low
- Area: Documentation / sequence memory behavior
- Evidence:
  - The image-sequences guide says the preload window is “5 frames ahead and behind” and the keep window is “up to 20 frames” in [docs/playback/image-sequences.md](/Users/lifeart/Repos/openrv-web/docs/playback/image-sequences.md#L66) through [docs/playback/image-sequences.md](/Users/lifeart/Repos/openrv-web/docs/playback/image-sequences.md#L72).
  - The direct session/media sequence path does still use `preloadFrames(..., 5)` plus `releaseDistantFrames(..., 20)` during normal fetches in [src/core/session/SessionMedia.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionMedia.ts#L932) through [src/core/session/SessionMedia.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionMedia.ts#L939).
  - But the same runtime also does a wider initial preload of `10` frames on sequence load in [src/core/session/SessionMedia.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionMedia.ts#L771).
  - The node-graph sequence path uses `FramePreloadManager` defaults of `maxCacheSize: 100`, `preloadAhead: 30`, `preloadBehind: 5`, and `scrubWindow: 10` in [src/utils/media/FramePreloadManager.ts](/Users/lifeart/Repos/openrv-web/src/utils/media/FramePreloadManager.ts#L24) through [src/utils/media/FramePreloadManager.ts](/Users/lifeart/Repos/openrv-web/src/utils/media/FramePreloadManager.ts#L34).
- Impact:
  - The guide presents sequence caching as one simple fixed policy, but the shipped runtime now uses different preload/retention behaviors depending on the path and playback state.
  - That can mislead anyone trying to reason about memory usage, hitching, or cache tuning from the docs alone.







## Validation Notes

- `pnpm typecheck`: passed
- `pnpm lint`: failed
- `pnpm build`: failed under the current `pnpm` Node runtime
- Targeted Chromium init/layout/mobile checks: passed
- Smoke subset: reproduced `WORKFLOW-001`, `HG-E002`, and `HG-E003`
- Browser spot-check: pressing `G` in QC opens goto-frame instead of the gamut diagram
- Browser spot-check: `Shift+R` / `Shift+B` / `Shift+N` do not activate red / blue / none channel selection
- Browser spot-check: `Shift+L` on Color opens the LUT pipeline panel instead of switching to luminance
- Browser spot-check: `Shift+G` and `Shift+A` still work, so the channel shortcut breakage is selective rather than universal
- Isolated reruns of `CS-030`, `EXR-011`, and `SEQ-012`: passed
