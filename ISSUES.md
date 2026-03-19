# Issues

This file tracks findings from exploratory review and targeted validation runs.

## Confirmed Issues


### 325. ShotGrid note publishing sends only plain note text, not annotations or thumbnails

- Severity: Medium
- Area: ShotGrid integration / note publishing
- Evidence:
  - The integration guide describes “Publish review notes and annotations ... with frame references and thumbnails” in [docs/advanced/dcc-integration.md](/Users/lifeart/Repos/openrv-web/docs/advanced/dcc-integration.md#L104) through [docs/advanced/dcc-integration.md#L107).
  - The production `pushNotes` flow iterates `session.noteManager.getNotesForSource(sourceIndex)` and calls `bridge.pushNote(...)` with only `text` and an optional `frameRange` in [src/integrations/ShotGridIntegrationBridge.ts](/Users/lifeart/Repos/openrv-web/src/integrations/ShotGridIntegrationBridge.ts#L192) through [src/integrations/ShotGridIntegrationBridge.ts#L224).
  - `ShotGridBridge.pushNote(...)` only serializes `subject`, `content`, and `frame_range` into the REST payload in [src/integrations/ShotGridBridge.ts](/Users/lifeart/Repos/openrv-web/src/integrations/ShotGridBridge.ts#L266) through [src/integrations/ShotGridBridge.ts#L299).
  - The path never reads from the annotation store, never renders thumbnails, and never uploads attachments.
- Impact:
  - Users who rely on annotated frames or visual context cannot actually publish that review artifact back to ShotGrid from the shipped app.
  - The current integration behaves like plain text note posting, which is much less useful than the advertised review-to-tracking workflow.




### 330. ShotGrid note sync flattens local note threads and statuses into plain top-level comments

- Severity: Medium
- Area: ShotGrid integration / note round-trip fidelity
- Evidence:
  - Local notes support threaded replies via `parentId` and review state via `status: 'open' | 'resolved' | 'wontfix'` in [src/core/session/NoteManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/NoteManager.ts#L11) through [src/core/session/NoteManager.ts#L23).
  - ShotGrid push iterates every local note for a source and sends only `text` plus optional `frameRange` in [src/integrations/ShotGridIntegrationBridge.ts](/Users/lifeart/Repos/openrv-web/src/integrations/ShotGridIntegrationBridge.ts#L197) through [src/integrations/ShotGridIntegrationBridge.ts#L215) and [src/integrations/ShotGridBridge.ts](/Users/lifeart/Repos/openrv-web/src/integrations/ShotGridBridge.ts#L266) through [src/integrations/ShotGridBridge.ts#L291).
  - ShotGrid pull reconstructs local notes with `addNote(...)` using source/frame/text/author only, with no reply linkage or restored note status in [src/integrations/ShotGridIntegrationBridge.ts](/Users/lifeart/Repos/openrv-web/src/integrations/ShotGridIntegrationBridge.ts#L276) through [src/integrations/ShotGridIntegrationBridge.ts#L308).
- Impact:
  - A threaded review conversation or resolved/won’t-fix state in OpenRV Web cannot survive a ShotGrid sync round-trip as equivalent structured review data.
  - The integration reduces richer local note workflows to a flat list of plain comments, which weakens production review traceability.


### 359. The network-sync guide overstates generic one-click joining from share URLs

- Severity: Medium
- Area: Documentation / network sync onboarding
- Evidence:
  - The network-sync guide says opening a copied shareable URL "automatically populates the room code and initiates a join" in [docs/advanced/network-sync.md](/Users/lifeart/Repos/openrv-web/docs/advanced/network-sync.md#L35), and later describes URL-based signaling as one-click joining without manual entry in [docs/advanced/network-sync.md](/Users/lifeart/Repos/openrv-web/docs/advanced/network-sync.md#L88).
  - During URL bootstrap, production only auto-joins the normal room path when both `room` and `pin` are present, in [src/services/SessionURLService.ts](/Users/lifeart/Repos/openrv-web/src/services/SessionURLService.ts#L295) through [src/services/SessionURLService.ts](/Users/lifeart/Repos/openrv-web/src/services/SessionURLService.ts#L299).
  - Plain room links without a PIN are only prefilled into the UI and do not auto-join, since `handleURLBootstrap()` sets the join field from `room` but skips `joinRoom(...)` unless `pinCode` is also present, in [src/services/SessionURLService.ts](/Users/lifeart/Repos/openrv-web/src/services/SessionURLService.ts#L251) through [src/services/SessionURLService.ts](/Users/lifeart/Repos/openrv-web/src/services/SessionURLService.ts#L260) and [src/services/SessionURLService.ts](/Users/lifeart/Repos/openrv-web/src/services/SessionURLService.ts#L295) through [src/services/SessionURLService.ts](/Users/lifeart/Repos/openrv-web/src/services/SessionURLService.ts#L299).
  - Malformed WebRTC share links are also silently ignored during bootstrap because invalid decoded payloads never produce a UI error path in [src/services/SessionURLService.ts](/Users/lifeart/Repos/openrv-web/src/services/SessionURLService.ts#L263) through [src/services/SessionURLService.ts](/Users/lifeart/Repos/openrv-web/src/services/SessionURLService.ts#L293).
- Impact:
  - Users can rely on the docs for generic one-click join behavior that only works for narrower URL shapes than the guide implies.
  - When a copied link does not auto-join or a malformed invite opens silently, the app appears unreliable instead of merely under-documented.

### 454. The self-hosting docs present static hosting as sufficient, but the shipped collaboration flow still expects separate signaling infrastructure

- Severity: Low
- Area: Documentation / deployment requirements
- Evidence:
  - The FAQ says users can self-host by deploying the built `dist/` files "to any web server or static hosting service" in [docs/reference/faq.md](/Users/lifeart/Repos/openrv-web/docs/reference/faq.md#L21) through [docs/reference/faq.md](/Users/lifeart/Repos/openrv-web/docs/reference/faq.md#L23).
  - The installation guide likewise says the production build is "a collection of static files" and that "No server-side runtime is required" in [docs/getting-started/installation.md](/Users/lifeart/Repos/openrv-web/docs/getting-started/installation.md#L55) through [docs/getting-started/installation.md](/Users/lifeart/Repos/openrv-web/docs/getting-started/installation.md#L68).
  - The same installation guide exposes `VITE_NETWORK_SIGNALING_SERVERS` as an environment variable for collaborative review sessions in [docs/getting-started/installation.md](/Users/lifeart/Repos/openrv-web/docs/getting-started/installation.md#L90) through [docs/getting-started/installation.md](/Users/lifeart/Repos/openrv-web/docs/getting-started/installation.md#L96).
  - Production collaboration config ships with a WebSocket signaling URL in [src/network/types.ts](/Users/lifeart/Repos/openrv-web/src/network/types.ts#L445) through [src/network/types.ts](/Users/lifeart/Repos/openrv-web/src/network/types.ts#L453), and normal room create/join still go through `wsClient.connect(...)` in [src/network/NetworkSyncManager.ts](/Users/lifeart/Repos/openrv-web/src/network/NetworkSyncManager.ts#L380) through [src/network/NetworkSyncManager.ts](/Users/lifeart/Repos/openrv-web/src/network/NetworkSyncManager.ts#L426).
- Impact:
  - The deployment docs make the full app sound entirely static-hosted even though the advertised collaboration feature still has external signaling/runtime dependencies in normal operation.
  - Self-hosters can deploy the static app successfully and still be surprised when collaborative review is unavailable or misconfigured.

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



### 469. The OTIO import docs say gaps and transitions are recognized, but the shipped playlist import path linearizes clips and drops both structures

- Severity: Low
- Area: Documentation / OTIO feature coverage
- Evidence:
  - The OTIO guide says `Gaps` are recognized as empty regions and `Transitions` are recognized during import in [docs/export/edl-otio.md](/Users/lifeart/Repos/openrv-web/docs/export/edl-otio.md#L49) through [docs/export/edl-otio.md#L56).
  - The single-track parser used by live import returns only `clips`, `fps`, and `totalFrames`; it does not expose transitions in the `OTIOParseResult` returned by `parseOTIO(...)` in [src/utils/media/OTIOParser.ts](/Users/lifeart/Repos/openrv-web/src/utils/media/OTIOParser.ts#L315) through [src/utils/media/OTIOParser.ts#L337).
  - `PlaylistManager.fromOTIO(...)` consumes only `result.clips` and calls `addClip(...)` for each one in [src/core/session/PlaylistManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/PlaylistManager.ts#L674) through [src/core/session/PlaylistManager.ts#L703).
  - `addClip(...)` rebuilds a simple sequential playlist with contiguous `globalStartFrame` values in [src/core/session/PlaylistManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/PlaylistManager.ts#L133) through [src/core/session/PlaylistManager.ts#L159), so OTIO gap spacing and transition overlap data are not preserved in the imported playlist.
- Impact:
  - The docs make OTIO import sound structurally richer than the runtime actually is.
  - Users can expect editorial gaps and transitions to survive import semantics when the shipped workflow collapses them into a plain cut list.

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

### 473. The advanced-compare docs teach a full Reference Image Manager workflow, but the shipped UI only exposes capture plus a binary toggle

- Severity: Low
- Area: Documentation / compare workflow
- Evidence:
  - The advanced-compare page presents five reference comparison modes and describes overlay opacity as part of the user-facing workflow in [docs/compare/advanced-compare.md](/Users/lifeart/Repos/openrv-web/docs/compare/advanced-compare.md#L13) through [docs/compare/advanced-compare.md#L31).
  - The shipped View tab only mounts two reference actions: `Capture reference frame` and `Toggle reference comparison` in [src/services/tabContent/buildViewTab.ts](/Users/lifeart/Repos/openrv-web/src/services/tabContent/buildViewTab.ts#L85) through [src/services/tabContent/buildViewTab.ts](/Users/lifeart/Repos/openrv-web/src/services/tabContent/buildViewTab.ts#L117).
  - `ReferenceManager` still carries `viewMode`, `opacity`, and `wipePosition` as real state in [src/ui/components/ReferenceManager.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/ReferenceManager.ts#L25) through [src/ui/components/ReferenceManager.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/ReferenceManager.ts#L30), but there is no shipped UI for changing those fields.
- Impact:
  - The docs make reference comparison look like a configurable end-user tool when the shipped interface only exposes the narrowest on/off subset.
  - Users following the page will look for mode and opacity controls that do not exist in the real app.


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


### 478. The overlays guide describes a single “missing frame indicator” behavior, but production ships multiple modes and the default does not replace the viewer content

- Severity: Low
- Area: Documentation / missing-frame behavior
- Evidence:
  - The overlays guide says the missing-frame indicator “replaces the viewer content” with a red-X warning state and highlights the missing frame on the timeline in [docs/advanced/overlays.md](/Users/lifeart/Repos/openrv-web/docs/advanced/overlays.md#L62) through [docs/advanced/overlays.md](/Users/lifeart/Repos/openrv-web/docs/advanced/overlays.md#L70).
  - The shipped View tab exposes four distinct missing-frame modes, `Off`, `Frame`, `Hold`, and `Black`, in [src/services/tabContent/buildViewTab.ts](/Users/lifeart/Repos/openrv-web/src/services/tabContent/buildViewTab.ts#L191) through [src/services/tabContent/buildViewTab.ts](/Users/lifeart/Repos/openrv-web/src/services/tabContent/buildViewTab.ts#L199).
  - In the renderer, only `black` truly replaces the viewed image; `hold` reuses a nearby frame and the default `show-frame` path continues drawing the current source image while separately showing the overlay in [src/ui/components/Viewer.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/Viewer.ts#L1521) through [src/ui/components/Viewer.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/Viewer.ts#L1558).
  - The shipped `MissingFrameOverlay` itself is a centered warning icon plus frame number, not a red-X fill pattern, in [src/ui/components/MissingFrameOverlay.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/MissingFrameOverlay.ts#L31) through [src/ui/components/MissingFrameOverlay.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/MissingFrameOverlay.ts#L69).
- Impact:
  - The docs describe one fixed missing-frame experience, but the real app exposes multiple viewer behaviors and defaults to a much less destructive overlay mode.
  - That can mislead users about what will happen during sequence review and what the current missing-frame setting actually controls.


### 481. The overlays guide says the timeline highlights missing-frame positions, but the shipped timeline has no missing-frame rendering path

- Severity: Low
- Area: Documentation / sequence review UX
- Evidence:
  - The overlays guide says the missing-frame indicator includes a timeline highlight for the missing-frame position in [docs/advanced/overlays.md](/Users/lifeart/Repos/openrv-web/docs/advanced/overlays.md#L64) through [docs/advanced/overlays.md](/Users/lifeart/Repos/openrv-web/docs/advanced/overlays.md#L70).
  - A production-code search finds missing-frame handling in the viewer and overlay components, but no missing-frame rendering or highlight logic in `Timeline.ts`; the relevant matches are limited to [src/ui/components/Viewer.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/Viewer.ts#L1521) through [src/ui/components/Viewer.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/Viewer.ts#L1558) and [src/ui/components/MissingFrameOverlay.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/MissingFrameOverlay.ts#L1) through [src/ui/components/MissingFrameOverlay.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/MissingFrameOverlay.ts#L108).
  - The timeline-related repo hits for “missing frame” are tests and the View-tab mode selector, not a shipped timeline highlight implementation, as shown by [src/services/tabContent/buildViewTab.ts](/Users/lifeart/Repos/openrv-web/src/services/tabContent/buildViewTab.ts#L185) through [src/services/tabContent/buildViewTab.ts](/Users/lifeart/Repos/openrv-web/src/services/tabContent/buildViewTab.ts#L357).
- Impact:
  - The docs promise a second visual cue in the timeline that the shipped app does not provide.
  - Sequence reviewers can search for a timeline indicator that simply is not implemented in production.

### 483. The overlays guide describes custom per-zone safe areas and distinct colors, but the shipped safe-areas overlay only has fixed title/action boxes with one shared color

- Severity: Low
- Area: Documentation / safe-areas feature coverage
- Evidence:
  - The overlays guide says there is a `Custom` safe area where users can “specify any percentage” and that multiple safe zones each use “a distinct color for clarity” in [docs/advanced/overlays.md](/Users/lifeart/Repos/openrv-web/docs/advanced/overlays.md#L30) through [docs/advanced/overlays.md](/Users/lifeart/Repos/openrv-web/docs/advanced/overlays.md#L39).
  - The shipped `SafeAreasState` has only two safe-zone toggles, `titleSafe` and `actionSafe`; there is no custom-percentage field in [src/ui/components/SafeAreasOverlay.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/SafeAreasOverlay.ts#L16) through [src/ui/components/SafeAreasOverlay.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/SafeAreasOverlay.ts#L24).
  - The overlay also has a single `guideColor` applied to all guides in [src/ui/components/SafeAreasOverlay.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/SafeAreasOverlay.ts#L22) through [src/ui/components/SafeAreasOverlay.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/SafeAreasOverlay.ts#L24) and [src/ui/components/SafeAreasOverlay.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/SafeAreasOverlay.ts#L148) through [src/ui/components/SafeAreasOverlay.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/SafeAreasOverlay.ts#L160).
  - The shipped control surface only exposes binary toggles for the fixed safe boxes plus composition guides in [src/ui/components/SafeAreasControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/SafeAreasControl.ts#L127) through [src/ui/components/SafeAreasControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/SafeAreasControl.ts#L151).
- Impact:
  - The docs promise a more flexible broadcast-safe workflow than the runtime actually supports.
  - Users can look for user-defined percentages or color-coded zones that simply are not part of the shipped overlay model.


### 487. The false-color docs advertise custom presets, but the shipped false-color system exposes no way to define them

- Severity: Low
- Area: Documentation / false-color workflow
- Evidence:
  - The false-color guide says “Custom false color presets allow defining specific color-to-exposure mappings” in [docs/scopes/false-color-zebra.md](/Users/lifeart/Repos/openrv-web/docs/scopes/false-color-zebra.md#L38) through [docs/scopes/false-color-zebra.md#L39).
  - The runtime type does include a `custom` preset key in [src/ui/components/FalseColor.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/FalseColor.ts#L23), but it is just aliased to `STANDARD_PALETTE` in [src/ui/components/FalseColor.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/FalseColor.ts#L134) through [src/ui/components/FalseColor.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/FalseColor.ts#L138).
  - The shipped preset UI only exposes `Standard`, `ARRI`, and `RED` in [src/ui/components/FalseColor.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/FalseColor.ts#L262) through [src/ui/components/FalseColor.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/FalseColor.ts#L268), and `FalseColorControl` simply renders that list in [src/ui/components/FalseColorControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/FalseColorControl.ts#L184) through [src/ui/components/FalseColorControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/FalseColorControl.ts#L212).
- Impact:
  - The docs promise a studio-customizable false-color workflow that the shipped app does not implement.
  - Users can look for custom mapping controls or APIs that simply are not present in production.

### 491. The waveform docs describe WebGL computation as the runtime model, but the shipped scope still has full CPU fallback paths

- Severity: Low
- Area: Documentation / waveform implementation
- Evidence:
  - The waveform guide says “The waveform is computed using WebGL” in [docs/scopes/waveform.md](/Users/lifeart/Repos/openrv-web/docs/scopes/waveform.md#L59).
  - The shipped `Waveform.update()` only tries the GPU processor first, then falls back to CPU rendering with `this.draw(imageData)` when WebGL scopes are unavailable in [src/ui/components/Waveform.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/Waveform.ts#L247) through [src/ui/components/Waveform.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/Waveform.ts#L266).
  - The HDR float path also has an explicit CPU fallback that converts float data back to `ImageData` and draws it on the CPU in [src/ui/components/Waveform.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/Waveform.ts#L288) through [src/ui/components/Waveform.ts#L293).
- Impact:
  - The docs present the scope as WebGL-computed when the shipped implementation still depends on non-WebGL fallback behavior.
  - That is misleading for users trying to understand degraded behavior on browsers or devices where GPU scopes are unavailable.


### 493. The vectorscope docs describe WebGL rendering as the runtime model, but the shipped vectorscope still has a complete CPU fallback path

- Severity: Low
- Area: Documentation / vectorscope implementation
- Evidence:
  - The vectorscope guide says “The vectorscope is rendered using WebGL for real-time performance” in [docs/scopes/vectorscope.md](/Users/lifeart/Repos/openrv-web/docs/scopes/vectorscope.md#L39) through [docs/scopes/vectorscope.md](/Users/lifeart/Repos/openrv-web/docs/scopes/vectorscope.md#L41).
  - The shipped `Vectorscope.update()` tries the shared GPU scopes processor first, but falls back to `drawCPU(imageData)` when GPU scopes are unavailable in [src/ui/components/Vectorscope.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/Vectorscope.ts#L246) through [src/ui/components/Vectorscope.ts#L272).
  - The HDR float path follows the same pattern and also converts float data back to `ImageData` for CPU rendering when the GPU scopes processor is unavailable in [src/ui/components/Vectorscope.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/Vectorscope.ts#L278) through [src/ui/components/Vectorscope.ts#L314).
- Impact:
  - The docs overstate the runtime architecture of the shipped vectorscope.
  - Users investigating performance or degraded behavior on non-WebGL scope paths are told the wrong implementation story.

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

### 505. The JPEG XL guide promises original color-space metadata, but the shipped SDR JXL decoder always reports `srgb` and only returns format/container metadata

- Severity: Low
- Area: Documentation / JPEG XL metadata
- Evidence:
  - The JPEG XL guide says JXL color space “Varies (sRGB, linear, Display P3, Rec.2020, etc.). Decoded to Float32 with metadata indicating the original color space” in [docs/guides/file-formats.md](/Users/lifeart/Repos/openrv-web/docs/guides/file-formats.md#L113).
  - The shipped SDR JXL decoder hardcodes `colorSpace: 'srgb'` in its return value in [src/formats/JXLDecoder.ts](/Users/lifeart/Repos/openrv-web/src/formats/JXLDecoder.ts#L103) through [src/formats/JXLDecoder.ts](/Users/lifeart/Repos/openrv-web/src/formats/JXLDecoder.ts#L109).
  - The same decoder’s metadata payload only includes `format` and `container`, with no original color-space field, in [src/formats/JXLDecoder.ts](/Users/lifeart/Repos/openrv-web/src/formats/JXLDecoder.ts#L105) through [src/formats/JXLDecoder.ts](/Users/lifeart/Repos/openrv-web/src/formats/JXLDecoder.ts#L109).
  - The runtime only parses JXL container color info for the separate HDR path in `FileSourceNode`, not for the normal SDR WASM decode in [src/nodes/sources/FileSourceNode.ts](/Users/lifeart/Repos/openrv-web/src/nodes/sources/FileSourceNode.ts#L765) through [src/nodes/sources/FileSourceNode.ts](/Users/lifeart/Repos/openrv-web/src/nodes/sources/FileSourceNode.ts#L788).
- Impact:
  - The docs overstate how much original JXL color-space metadata the shipped SDR decode path preserves.
  - Users or integrators can expect richer color metadata from JXL loads than production currently exposes.

### 507. The file-format and image-sequence guides describe missing-frame playback as always “hold last frame,” but the shipped viewer exposes four modes and defaults to `show-frame`

- Severity: Low
- Area: Documentation / image-sequence playback behavior
- Evidence:
  - The file-format guide says that when a sequence has gaps, the viewer “Holds the last available frame during playback when a gap is encountered” in [docs/guides/file-formats.md](/Users/lifeart/Repos/openrv-web/docs/guides/file-formats.md#L324) through [docs/guides/file-formats.md](/Users/lifeart/Repos/openrv-web/docs/guides/file-formats.md#L326).
  - The image-sequences guide makes the same fixed-behavior claim in [docs/playback/image-sequences.md](/Users/lifeart/Repos/openrv-web/docs/playback/image-sequences.md#L46).
  - The shipped View tab exposes four selectable missing-frame modes, `Off`, `Frame`, `Hold`, and `Black`, in [src/services/tabContent/buildViewTab.ts](/Users/lifeart/Repos/openrv-web/src/services/tabContent/buildViewTab.ts#L198) through [src/services/tabContent/buildViewTab.ts](/Users/lifeart/Repos/openrv-web/src/services/tabContent/buildViewTab.ts#L208).
  - The viewer’s live default is `show-frame`, not `hold`, in [src/ui/components/Viewer.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/Viewer.ts#L311).
  - The missing-frame render path branches by mode: `black` forces a black frame, `hold` reuses the previous frame, and the remaining modes use the current-frame path in [src/ui/components/Viewer.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/Viewer.ts#L1522) through [src/ui/components/Viewer.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/Viewer.ts#L1553).
- Impact:
  - The sequence docs present one fixed playback response to gaps, but the shipped app treats missing frames as a user-selectable viewer policy.
  - Users reading those guides can expect hold-last-frame playback even when the default runtime behavior is different.

### 517. The image-sequences guide still describes per-frame blob-URL lifecycle, but the live sequence loader decodes files directly and never creates `frame.url`

- Severity: Low
- Area: Documentation / sequence memory model
- Evidence:
  - The image-sequences guide says sequence memory management includes “Blob URL lifecycle -- blob URLs are created when a frame loads and revoked when released” in [docs/playback/image-sequences.md](/Users/lifeart/Repos/openrv-web/docs/playback/image-sequences.md#L71).
  - The actual sequence frame loader decodes each file directly via `createImageBitmap(frame.file, ...)` in [src/utils/media/SequenceLoader.ts](/Users/lifeart/Repos/openrv-web/src/utils/media/SequenceLoader.ts#L126) through [src/utils/media/SequenceLoader.ts](/Users/lifeart/Repos/openrv-web/src/utils/media/SequenceLoader.ts#L144).
  - `SequenceFrame` still has an optional `url` field, but a repo search finds no production assignment to `frame.url`; only cleanup paths revoke it if present in [src/utils/media/SequenceLoader.ts](/Users/lifeart/Repos/openrv-web/src/utils/media/SequenceLoader.ts#L10), [src/utils/media/SequenceLoader.ts](/Users/lifeart/Repos/openrv-web/src/utils/media/SequenceLoader.ts#L217) through [src/utils/media/SequenceLoader.ts](/Users/lifeart/Repos/openrv-web/src/utils/media/SequenceLoader.ts#L219), and [src/utils/media/SequenceLoader.ts](/Users/lifeart/Repos/openrv-web/src/utils/media/SequenceLoader.ts#L312) through [src/utils/media/SequenceLoader.ts](/Users/lifeart/Repos/openrv-web/src/utils/media/SequenceLoader.ts#L314).
- Impact:
  - The guide describes an older or different sequence-frame memory model than the one the shipped app actually uses.
  - That can mislead anyone debugging sequence memory behavior or trying to understand the current loader’s lifecycle costs.


### 520. The docs present `####` / `%04d` / `@@@@` pattern strings as supported sequence formats, but production does not have a live loader for literal pattern strings

- Severity: Medium
- Area: Documentation / sequence-pattern workflow
- Evidence:
  - The file-format reference lists `Printf`, `Hash`, and `At-sign` entries under `Sequence Formats` in [docs/reference/file-formats.md](/Users/lifeart/Repos/openrv-web/docs/reference/file-formats.md#L69) through [docs/reference/file-formats.md](/Users/lifeart/Repos/openrv-web/docs/reference/file-formats.md#L75).
  - The image-sequences guide and file-format guide both present those same notations as supported pattern forms in [docs/playback/image-sequences.md](/Users/lifeart/Repos/openrv-web/docs/playback/image-sequences.md#L21) through [docs/playback/image-sequences.md](/Users/lifeart/Repos/openrv-web/docs/playback/image-sequences.md#L33) and [docs/guides/file-formats.md](/Users/lifeart/Repos/openrv-web/docs/guides/file-formats.md#L301) through [docs/guides/file-formats.md](/Users/lifeart/Repos/openrv-web/docs/guides/file-formats.md#L309).
  - The only production sequence-ingest path uses numbered files plus `extractPatternFromFilename(...)`, `discoverSequences(...)`, and `inferSequenceFromSingleFile(...)` in [src/utils/media/SequenceLoader.ts](/Users/lifeart/Repos/openrv-web/src/utils/media/SequenceLoader.ts#L479) through [src/utils/media/SequenceLoader.ts](/Users/lifeart/Repos/openrv-web/src/utils/media/SequenceLoader.ts#L644) and is wired from file-batch UI flows in [src/ui/components/layout/HeaderBar.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/layout/HeaderBar.ts#L1449) through [src/ui/components/layout/HeaderBar.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/layout/HeaderBar.ts#L1477) and [src/ui/components/ViewerInputHandler.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/ViewerInputHandler.ts#L773) through [src/ui/components/ViewerInputHandler.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/ViewerInputHandler.ts#L799).
  - The parser helpers for literal pattern strings, `parsePatternNotation(...)`, `toHashNotation(...)`, and `toPrintfNotation(...)`, have no production callers outside tests in [src/utils/media/SequenceLoader.ts](/Users/lifeart/Repos/openrv-web/src/utils/media/SequenceLoader.ts#L426) through [src/utils/media/SequenceLoader.ts](/Users/lifeart/Repos/openrv-web/src/utils/media/SequenceLoader.ts#L457), with repo hits limited to [src/utils/media/SequenceLoader.test.ts](/Users/lifeart/Repos/openrv-web/src/utils/media/SequenceLoader.test.ts#L631) through [src/utils/media/SequenceLoader.test.ts](/Users/lifeart/Repos/openrv-web/src/utils/media/SequenceLoader.test.ts#L700).
- Impact:
  - The docs make literal pattern strings look like a real ingest format when the shipped app still expects concrete numbered files.
  - Integrations or users that hand the app `shot.####.exr` or `frame.%04d.exr` can reasonably expect sequence loading and instead hit unrelated image-URL or unsupported-file behavior.

### 525. The DCC `loadMedia` protocol advertises “file path or URL,” but the browser-side loader just forwards raw paths into `img.src` / `video.src`

- Severity: Medium
- Area: DCC integration / protocol contract
- Evidence:
  - The DCC protocol defines inbound `loadMedia.path` as a “File path or URL” in [src/integrations/DCCBridge.ts](/Users/lifeart/Repos/openrv-web/src/integrations/DCCBridge.ts#L38) through [src/integrations/DCCBridge.ts](/Users/lifeart/Repos/openrv-web/src/integrations/DCCBridge.ts#L43).
  - `AppDCCWiring` forwards that `path` string directly into `session.loadVideo(name, path)` or `session.loadImage(name, path)` in [src/AppDCCWiring.ts](/Users/lifeart/Repos/openrv-web/src/AppDCCWiring.ts#L184) through [src/AppDCCWiring.ts](/Users/lifeart/Repos/openrv-web/src/AppDCCWiring.ts#L221).
  - Those session URL loaders then assign the raw string to browser media elements, with `img.src = url` in [src/core/session/SessionMedia.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionMedia.ts#L429) through [src/core/session/SessionMedia.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionMedia.ts#L456) and the corresponding video path in [src/core/session/SessionMedia.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionMedia.ts#L640) through [src/core/session/SessionMedia.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionMedia.ts#L689).
  - Elsewhere in the docs, the app already acknowledges the browser sandbox cannot directly access local filesystems, for example in [docs/guides/session-compatibility.md](/Users/lifeart/Repos/openrv-web/docs/guides/session-compatibility.md#L210).
- Impact:
  - A DCC tool that sends an ordinary host filesystem path can follow the advertised protocol and still fail because the browser cannot resolve that path as a meaningful media URL.
  - That makes the live DCC load contract narrower than the protocol/type comments imply unless the sender converts paths into browser-reachable URLs first.

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


### 528. Sequence representations also cannot round-trip through serialization, because the serialized loader config omits `files` while `SequenceRepresentationLoader` requires them

- Severity: Medium
- Area: Media representations / project persistence
- Evidence:
  - `RepresentationLoaderConfig` supports runtime-only `files?: File[]` for sequence representations in [src/core/types/representation.ts](/Users/lifeart/Repos/openrv-web/src/core/types/representation.ts#L64) through [src/core/types/representation.ts#L79).
  - The serialized representation format explicitly omits `file` and `files` from `loaderConfig` in [src/core/types/representation.ts](/Users/lifeart/Repos/openrv-web/src/core/types/representation.ts#L93) through [src/core/types/representation.ts#L107).
  - `SessionSerializer.fromJSON(...)` restores representations from that serialized loader config and passes it straight into `addRepresentationToSource(...)` in [src/core/session/SessionSerializer.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionSerializer.ts#L527) through [src/core/session/SessionSerializer.ts#L547).
  - `SequenceRepresentationLoader` then throws `SequenceRepresentationLoader: no files provided` whenever `loaderConfig.files` is absent in [src/core/session/loaders/SequenceRepresentationLoader.ts](/Users/lifeart/Repos/openrv-web/src/core/session/loaders/SequenceRepresentationLoader.ts#L72) through [src/core/session/loaders/SequenceRepresentationLoader.ts#L80).
- Impact:
  - Sequence-based alternate representations cannot be faithfully restored from saved project state.
  - The representation serialization format carries enough metadata to look sequence-aware, but not enough runtime data for the actual sequence representation loader to work.


### 530. Non-sequence file, movie, and proxy representations also cannot round-trip through serialization, because the saved loader config strips the `File` objects their live loaders require

- Severity: Medium
- Area: Media representations / project persistence
- Evidence:
  - Representation serialization removes both `file` and `files` from `loaderConfig` before save in [src/core/types/representation.ts](/Users/lifeart/Repos/openrv-web/src/core/types/representation.ts#L234) through [src/core/types/representation.ts](/Users/lifeart/Repos/openrv-web/src/core/types/representation.ts#L246).
  - `SessionSerializer.fromJSON(...)` restores representations from that stripped `loaderConfig` and feeds it straight back into `addRepresentationToSource(...)`, then tries to reactivate the saved `activeRepresentationId` in [src/core/session/SessionSerializer.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionSerializer.ts#L527) through [src/core/session/SessionSerializer.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionSerializer.ts#L560).
  - The normal single-image representation path still uses `FileRepresentationLoader`, which throws `FileRepresentationLoader: no file provided` when `loaderConfig.file` is absent in [src/core/session/loaders/FileRepresentationLoader.ts](/Users/lifeart/Repos/openrv-web/src/core/session/loaders/FileRepresentationLoader.ts#L15) through [src/core/session/loaders/FileRepresentationLoader.ts#L22).
  - The normal `movie` / `proxy` path still uses `VideoRepresentationLoader`, which likewise throws `VideoRepresentationLoader: no file provided` when `loaderConfig.file` is absent in [src/core/session/loaders/VideoRepresentationLoader.ts](/Users/lifeart/Repos/openrv-web/src/core/session/loaders/VideoRepresentationLoader.ts#L21) through [src/core/session/loaders/VideoRepresentationLoader.ts#L29).
- Impact:
  - Saved projects can preserve alternate representation metadata and IDs, but any restored non-sequence representation that still depends on a runtime `File` object can fail as soon as activation is attempted.
  - That leaves representation persistence broken more broadly than the already-logged sequence case: metadata round-trips, but the real loadable media payload does not.

### 535. Even if a sequence representation loaded successfully, the shim path would still discard the sequence metadata that the rest of the app expects

- Severity: Medium
- Area: Media representations / sequence runtime wiring
- Evidence:
  - The normal sequence load path builds a `MediaSource` with `sequenceInfo`, `sequenceFrames`, `duration`, `fps`, and the first frame element, then updates host FPS and out-point accordingly in [src/core/session/SessionMedia.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionMedia.ts#L743) through [src/core/session/SessionMedia.ts#L771).
  - `SequenceRepresentationLoader` does preserve `SequenceInfo` and frame data inside `SequenceSourceNodeWrapper` via its `sequenceInfo` and `frames` accessors in [src/core/session/loaders/SequenceRepresentationLoader.ts](/Users/lifeart/Repos/openrv-web/src/core/session/loaders/SequenceRepresentationLoader.ts#L21) through [src/core/session/loaders/SequenceRepresentationLoader.ts#L49).
  - But `SessionMedia.applyRepresentationShim(...)` clears `source.sequenceInfo` and `source.sequenceFrames`, and for non-file/non-video sources it only copies `getElement(1)` plus `type = 'sequence'` in [src/core/session/SessionMedia.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionMedia.ts#L1180) through [src/core/session/SessionMedia.ts#L1214).
- Impact:
  - A sequence-based alternate representation would still be only partially wired even after the loader problems were fixed.
  - Existing sequence-aware playback and UI paths would lose access to frame lists, sequence metadata, and the normal source-level sequence state they depend on.


### 549. URL/session sharing has no representation awareness, so active alternate variants cannot round-trip through share links or collaboration state

- Severity: Medium
- Area: Session URL sharing / media representations
- Evidence:
  - `SessionURLService.captureSessionURLState()` stores only the current source index, base `sourceUrl`, A/B indices, frame, transform, wipe, and OCIO state in [src/services/SessionURLService.ts](/Users/lifeart/Repos/openrv-web/src/services/SessionURLService.ts#L105) through [src/services/SessionURLService.ts#L132).
  - Its `URLSession` dependency contract exposes no representation fields or methods at all beyond the base current source and source indices in [src/services/SessionURLService.ts](/Users/lifeart/Repos/openrv-web/src/services/SessionURLService.ts#L17) through [src/services/SessionURLService.ts#L35).
  - On apply, the service can reload only `state.sourceUrl` on a clean session and then set current source / A-B / view state; there is no path to restore active representation IDs or alternate representation definitions in [src/services/SessionURLService.ts](/Users/lifeart/Repos/openrv-web/src/services/SessionURLService.ts#L135) through [src/services/SessionURLService.ts#L223).
- Impact:
  - A shared URL can reconstruct only the base media plus viewer state, not the actual active representation/variant a user was reviewing.
  - That makes representation-based review state non-shareable across the app’s URL and collaboration entry points even though project save/load tries to preserve it.

### 563. The generated API reference is pinned to an old GitHub commit, so its “Defined in” links can disagree with the checked-in source tree

- Severity: Medium
- Area: API documentation / source traceability
- Evidence:
  - The current checkout is at commit `947e3067bd8fb58079981ef7fc78d98ca117799f`.
  - `docs/api/index.md` still points every “Defined in” source link at GitHub blob `c0dd53144dcb872c686e6581e476322380198403`, for example in [docs/api/index.md](/Users/lifeart/Repos/openrv-web/docs/api/index.md#L40) through [docs/api/index.md](/Users/lifeart/Repos/openrv-web/docs/api/index.md#L50) and [docs/api/index.md](/Users/lifeart/Repos/openrv-web/docs/api/index.md#L131) through [docs/api/index.md#L162).
  - The same generated page is already drifting from the live tree in content, such as the stale `OpenRVEventName` union documented there versus the current source, as captured in issue `556`.
- Impact:
  - A reader following the generated reference can land on a different historical version of the code than the one actually shipped in the repo.
  - That makes the API docs harder to audit and amplifies other documentation drift because the linked source is itself frozen at an older snapshot.

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
