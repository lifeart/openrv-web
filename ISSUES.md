# Issues

This file tracks findings from exploratory review and targeted validation runs.

## Confirmed Issues





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
