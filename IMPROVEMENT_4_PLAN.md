# Improvement Plan 4: Fix Silent Promise Failures

## Problem Statement

The codebase contains approximately 25+ `.catch(() => {})` patterns in production source files that silently swallow errors, making debugging extremely difficult. These silent catches mean:

- Errors in critical subsystems (OCIO init, WebRTC signaling, video preloading, cache initialization) disappear without any trace.
- When a user reports "video frames aren't loading" or "color management doesn't work," developers have no log trail to follow.
- There is no global `unhandledrejection` listener, so any promise that escapes without a `.catch()` is also lost entirely.
- The existing `Logger` class (`src/utils/Logger.ts`) provides a structured, leveled logging infrastructure that most of these silent catches should use instead.

**Scope**: This plan covers only production source files (`src/`). Test files and e2e specs intentionally use `.catch(() => {})` to prevent test noise and are explicitly out of scope.

---

## Existing Infrastructure

### Logger (`src/utils/Logger.ts`)

A structured logger with levels DEBUG, INFO, WARN, ERROR. Supports module prefixing and custom sinks. Already adopted in 25+ modules.

```typescript
export class Logger {
  constructor(private readonly module: string) {}
  static setLevel(level: LogLevel): void;
  static setSink(sink: LogSink | null): void;
  debug(message: string, ...args: unknown[]): void;
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
}
```

### Error Hierarchy (`src/core/errors.ts`)

```
AppError
  +-- DecoderError
  +-- RenderError
  +-- NetworkError
  +-- SessionError
  +-- APIError
  +-- ValidationError
```

### Good Examples Already in the Codebase

Several modules already demonstrate the correct pattern:

| File | Pattern |
|------|---------|
| `src/render/RenderWorkerProxy.ts:303` | `.catch((err) => { log.debug('renderImage fire-and-forget rejected', err); })` |
| `src/render/RenderWorkerProxy.ts:228` | `.catch((err) => { log.warn('Failed to close pending bitmap during dispose:', err); })` |
| `src/audio/AudioCoordinator.ts:85` | `.catch(err => { log.warn('Audio extraction failed:', err); })` |
| `src/core/session/AutoSaveManager.ts:343` | `.catch((err) => { log.debug('Storage quota check failed', err); })` |
| `src/core/session/MediaManager.ts:940` | `.catch((err) => { log.warn('Background cache failed:', err); })` |
| `src/ui/components/Viewer.ts:1367` | `.catch((err) => { log.warn('Failed to fetch video frame', err); ... })` |

---

## Proposed Solution

### 1. Add a Global Unhandled Rejection Listener

Create a new module `src/utils/globalErrorHandler.ts` and install it in `src/main.ts`.

### 2. Replace All Silent Catches with Logger Calls

Each `.catch(() => {})` in production code gets replaced with the appropriate log level:
- **`log.debug`** -- for fire-and-forget operations where failure is expected/normal (preloading, optional init).
- **`log.warn`** -- for operations where failure is unexpected but recoverable (audio init, WebRTC signaling, cache init).
- **`log.error`** -- for operations where failure indicates a real problem (loading user content, OCIO init).

### 3. Ensure Every Module with Silent Catches Has a Logger Instance

Some files (e.g., `src/App.ts`, `src/AppDCCWiring.ts`, `src/network/NetworkSyncManager.ts`) do not yet import the Logger. They will need a `const log = new Logger('ModuleName');` added.

---

## Detailed Steps

### Step 1: Create Global Error Handler

**New file**: `src/utils/globalErrorHandler.ts`

```typescript
import { Logger } from './Logger';

const log = new Logger('GlobalErrorHandler');

/**
 * Install global listeners for uncaught errors and unhandled promise rejections.
 * Should be called once at application startup (main.ts).
 */
export function installGlobalErrorHandler(): void {
  if (typeof window === 'undefined') return;

  window.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {
    log.error('Unhandled promise rejection:', event.reason);
  });

  window.addEventListener('error', (event: ErrorEvent) => {
    // Avoid duplicate logging for errors already caught elsewhere
    if (event.error instanceof Error) {
      log.error('Uncaught error:', event.error.message, event.error);
    }
  });
}
```

**Modify**: `src/main.ts` -- add at the top, before `new App()`:

```typescript
import { installGlobalErrorHandler } from './utils/globalErrorHandler';
installGlobalErrorHandler();
```

---

### Step 2: Fix Each Silent Catch in Production Source Files

Below is every silent catch in `src/` (excluding test files), with the exact file, line, current code, proposed replacement, and rationale.

---

#### 2.1 `src/App.ts` (5 silent catches)

**Prerequisite**: Add Logger import and instance at top of file.

```typescript
import { Logger } from './utils/Logger';
const log = new Logger('App');
```

**2.1.1** Line 452 -- `audioCtx.close().catch(() => { /* ignore */ })`

- **Context**: Closing AudioContext after successful audio decode. Failure is harmless.
- **Level**: `debug`
- **Replace with**:
```typescript
audioCtx.close().catch((err) => { log.debug('AudioContext close after decode:', err); });
```

**2.1.2** Line 454-456 -- `}).catch(() => { audioCtx.close().catch(() => { /* ignore */ }); ... })`

- **Context**: `decodeAudioData` failed; closing AudioContext in cleanup. Failure of both is expected for non-audio video files.
- **Level**: `debug`
- **Replace with**:
```typescript
}).catch((err) => {
  log.debug('Audio decode failed (video may not contain audio):', err);
  audioCtx.close().catch((closeErr) => { log.debug('AudioContext close after failed decode:', closeErr); });
  return undefined;
});
```

**2.1.3** Line 464 -- `.catch(() => { /* audio extraction failed - not all videos have audio */ })`

- **Context**: Entire audio extraction chain. Failure is common and expected for non-audio videos.
- **Level**: `debug`
- **Replace with**:
```typescript
.catch((err) => { log.debug('Audio extraction skipped (video may lack audio track):', err); });
```

**2.1.4** Line 538 -- `this.audioMixer.initialize().catch(() => { /* AudioContext may be unavailable */ })`

- **Context**: AudioMixer init on first user interaction. AudioContext may be blocked by browser policy.
- **Level**: `warn`
- **Replace with**:
```typescript
this.audioMixer.initialize().catch((err) => { log.warn('AudioMixer initialization failed:', err); });
```

**2.1.5** Line 564 -- `this.cacheManager.initialize().catch(() => { /* OPFS unavailable */ })`

- **Context**: OPFS media cache init. Failure is expected on browsers without OPFS.
- **Level**: `debug`
- **Replace with**:
```typescript
this.cacheManager.initialize().catch((err) => { log.debug('OPFS cache unavailable:', err); });
```

---

#### 2.2 `src/AppDCCWiring.ts` (2 silent catches)

**Prerequisite**: Add Logger import and instance.

```typescript
import { Logger } from './utils/Logger';
const log = new Logger('AppDCCWiring');
```

**2.2.1** Line 96 -- `}).catch(() => { /* load error */ })`

- **Context**: Loading a video from DCC bridge message. Failure means user content failed to load.
- **Level**: `error`
- **Replace with**:
```typescript
}).catch((err) => { log.error('Failed to load video from DCC:', err); });
```

**2.2.2** Line 102 -- `}).catch(() => { /* load error */ })`

- **Context**: Loading an image from DCC bridge message.
- **Level**: `error`
- **Replace with**:
```typescript
}).catch((err) => { log.error('Failed to load image from DCC:', err); });
```

---

#### 2.3 `src/nodes/sources/VideoSourceNode.ts` (1 silent catch)

**Prerequisite**: Check if Logger is already imported; if not, add it.

**2.3.1** Line 745 -- `this.preloadHDRFrames(currentFrame, ahead, behind).catch(() => {})`

- **Context**: HDR frame preloading during playback buffer update. Fire-and-forget optimization.
- **Level**: `debug`
- **Replace with**:
```typescript
this.preloadHDRFrames(currentFrame, ahead, behind).catch((err) => {
  log.debug('HDR frame preload error:', err);
});
```

---

#### 2.4 `src/audio/AudioMixer.ts` (1 silent catch)

**Prerequisite**: Add Logger import and instance.

```typescript
import { Logger } from '../utils/Logger';
const log = new Logger('AudioMixer');
```

**2.4.1** Line 396 -- `this.audioContext.close().catch(() => { /* ignore */ })`

- **Context**: Closing AudioContext during dispose. Failure during cleanup is a warning.
- **Level**: `warn`
- **Replace with**:
```typescript
this.audioContext.close().catch((err) => { log.warn('AudioContext close failed during dispose:', err); });
```

---

#### 2.5 `src/network/NetworkSyncManager.ts` (2 silent catches)

**Prerequisite**: Add Logger import and instance.

```typescript
import { Logger } from '../utils/Logger';
const log = new Logger('NetworkSyncManager');
```

**2.5.1** Line 1752 -- `void state.pc.setRemoteDescription(...).catch(() => { this.disposeWebRTCPeer(key); })`

- **Context**: WebRTC answer handling. Failure causes peer disposal -- this should be logged.
- **Level**: `warn`
- **Replace with**:
```typescript
void state.pc.setRemoteDescription({ type: 'answer', sdp: answerPayload.sdp }).catch((err) => {
  log.warn('WebRTC setRemoteDescription failed, disposing peer:', err);
  this.disposeWebRTCPeer(key);
});
```

**2.5.2** Line 1767 -- `void state.pc.addIceCandidate(icePayload.candidate).catch(() => { ... })`

- **Context**: Adding ICE candidate. Late/invalid candidates are expected in WebRTC.
- **Level**: `debug`
- **Replace with**:
```typescript
void state.pc.addIceCandidate(icePayload.candidate).catch((err) => {
  log.debug('WebRTC addIceCandidate failed (late/invalid candidate):', err);
});
```

---

#### 2.6 `src/color/wasm/OCIOWasmBridge.ts` (1 silent catch)

**Prerequisite**: Add Logger import and instance.

```typescript
import { Logger } from '../../utils/Logger';
const log = new Logger('OCIOWasmBridge');
```

**2.6.1** Line 72 -- `this.init().catch(() => {})`

- **Context**: Auto-init of OCIO WASM module. The `init()` method already emits error via `statusChanged` event, but the rejection is silently swallowed here.
- **Level**: `warn`
- **Replace with**:
```typescript
this.init().catch((err) => { log.warn('OCIO auto-init failed:', err); });
```

---

#### 2.7 `src/ui/components/Viewer.ts` (2 silent catches)

**Note**: This file already has `const log = new Logger('Viewer');` at line 139.

**2.7.1** Line 511 -- `.catch(() => { tryCanvas2DFallback(); })`

- **Context**: WebGPU HDR availability check. Fallback is triggered, but the reason is lost.
- **Level**: `warn`
- **Replace with**:
```typescript
}).catch((err) => {
  log.warn('WebGPU HDR check failed, falling back to Canvas2D:', err);
  tryCanvas2DFallback();
});
```

**2.7.2** Line 1517 -- `this.session.preloadVideoHDRFrames(currentFrame).catch(() => {})`

- **Context**: Background HDR preload during scrubbing. Fire-and-forget optimization.
- **Level**: `debug`
- **Replace with**:
```typescript
this.session.preloadVideoHDRFrames(currentFrame).catch((err) => {
  log.debug('HDR frame preload error:', err);
});
```

---

#### 2.8 `src/ui/components/ViewerExport.ts` (1 silent catch)

**Prerequisite**: Add Logger import and instance.

```typescript
import { Logger } from '../../utils/Logger';
const log = new Logger('ViewerExport');
```

**2.8.1** Line 417 -- `source.videoSourceNode.getFrameAsync?.(frame).catch(() => {})`

- **Context**: Queuing async frame fetch as a background hint for next render cycle.
- **Level**: `debug`
- **Replace with**:
```typescript
source.videoSourceNode.getFrameAsync?.(frame).catch((err) => {
  log.debug('Background frame fetch for export failed:', err);
});
```

---

#### 2.9 `src/integrations/ShotGridBridge.ts` (2 intentional catches -- OK as-is)

**Lines 169, 417** -- `response.text().catch(() => '')`

- **Context**: Defensive reading of error response body before throwing a `ShotGridAPIError`. If the body can't be read, an empty string is a reasonable fallback and the real error is thrown on the next line.
- **Verdict**: **No change needed.** These are intentional and correct. The error information is used in the exception thrown immediately after.

---

#### 2.10 `src/render/Renderer.ts` (1 silent try/catch)

**Note**: This file already has `const log = new Logger('Renderer');` at line 34.

**2.10.1** Line 839 -- `try { gl.unpackColorSpace = 'srgb'; ... } catch (e) {}`

- **Context**: Setting `unpackColorSpace` which is not supported in all browsers. Feature detection pattern.
- **Level**: `debug`
- **Replace with**:
```typescript
try {
  gl.unpackColorSpace = 'srgb';
  this._currentUnpackColorSpace = 'srgb';
} catch (e) {
  log.debug('gl.unpackColorSpace not supported:', e);
}
```

---

#### 2.11 `src/nodes/sources/SequenceSourceNode.ts` (1 silent try/catch)

**Prerequisite**: Add Logger import and instance.

```typescript
import { Logger } from '../../utils/Logger';
const log = new Logger('SequenceSourceNode');
```

**2.11.1** Line 94 -- `try { data.close(); } catch (e) {}`

- **Context**: Closing a disposable resource (ImageBitmap). Failure during close is harmless but should be noted.
- **Level**: `debug`
- **Replace with**:
```typescript
try { data.close(); } catch (e) { log.debug('Resource close failed:', e); }
```

---

### Summary Table: All Silent Catches in Production Code

| # | File | Line | Current Pattern | Proposed Level | Category |
|---|------|------|----------------|----------------|----------|
| 1 | `src/App.ts` | 452 | `.catch(() => { /* ignore */ })` | `debug` | Cleanup |
| 2 | `src/App.ts` | 454 | `.catch(() => { ... })` | `debug` | Expected failure |
| 3 | `src/App.ts` | 455 | `.catch(() => { /* ignore */ })` | `debug` | Cleanup |
| 4 | `src/App.ts` | 464 | `.catch(() => { /* audio ... */ })` | `debug` | Expected failure |
| 5 | `src/App.ts` | 538 | `.catch(() => { /* AudioContext ... */ })` | `warn` | Init failure |
| 6 | `src/App.ts` | 564 | `.catch(() => { /* OPFS ... */ })` | `debug` | Optional feature |
| 7 | `src/AppDCCWiring.ts` | 96 | `.catch(() => { /* load error */ })` | `error` | User content |
| 8 | `src/AppDCCWiring.ts` | 102 | `.catch(() => { /* load error */ })` | `error` | User content |
| 9 | `src/nodes/sources/VideoSourceNode.ts` | 745 | `.catch(() => {})` | `debug` | Preloading |
| 10 | `src/audio/AudioMixer.ts` | 396 | `.catch(() => { /* ignore */ })` | `warn` | Cleanup |
| 11 | `src/network/NetworkSyncManager.ts` | 1752 | `.catch(() => { ... })` | `warn` | WebRTC signaling |
| 12 | `src/network/NetworkSyncManager.ts` | 1767 | `.catch(() => { ... })` | `debug` | WebRTC ICE |
| 13 | `src/color/wasm/OCIOWasmBridge.ts` | 72 | `.catch(() => {})` | `warn` | WASM init |
| 14 | `src/ui/components/Viewer.ts` | 511 | `.catch(() => { tryCanvas2DFallback(); })` | `warn` | Fallback path |
| 15 | `src/ui/components/Viewer.ts` | 1517 | `.catch(() => {})` | `debug` | Preloading |
| 16 | `src/ui/components/ViewerExport.ts` | 417 | `.catch(() => {})` | `debug` | Background hint |
| 17 | `src/render/Renderer.ts` | 839 | `catch (e) {}` | `debug` | Feature detection |
| 18 | `src/nodes/sources/SequenceSourceNode.ts` | 94 | `catch (e) {}` | `debug` | Cleanup |
| -- | `src/integrations/ShotGridBridge.ts` | 169 | `.catch(() => '')` | **No change** | Intentional fallback |
| -- | `src/integrations/ShotGridBridge.ts` | 417 | `.catch(() => '')` | **No change** | Intentional fallback |

**Total production silent catches to fix: 18**
**Intentional catches to leave as-is: 2**

---

### Step 3: Verify Modules Already Using Logger vs. Needing Import

| File | Already has Logger? | Action needed |
|------|-------------------|---------------|
| `src/App.ts` | No | Add `import { Logger }` + `const log = new Logger('App')` |
| `src/AppDCCWiring.ts` | No | Add `import { Logger }` + `const log = new Logger('AppDCCWiring')` |
| `src/nodes/sources/VideoSourceNode.ts` | No | Add `import { Logger }` + `const log = new Logger('VideoSourceNode')` |
| `src/audio/AudioMixer.ts` | No | Add `import { Logger }` + `const log = new Logger('AudioMixer')` |
| `src/network/NetworkSyncManager.ts` | No | Add `import { Logger }` + `const log = new Logger('NetworkSyncManager')` |
| `src/color/wasm/OCIOWasmBridge.ts` | No | Add `import { Logger }` + `const log = new Logger('OCIOWasmBridge')` |
| `src/ui/components/Viewer.ts` | **Yes** (line 139) | No import needed |
| `src/ui/components/ViewerExport.ts` | No | Add `import { Logger }` + `const log = new Logger('ViewerExport')` |
| `src/render/Renderer.ts` | **Yes** (line 34) | No import needed |
| `src/nodes/sources/SequenceSourceNode.ts` | No | Add `import { Logger }` + `const log = new Logger('SequenceSourceNode')` |

---

## Risk Assessment

### Low Risk

- **Logging-only changes**: All fixes add log output without changing control flow. No behavioral change to the application.
- **ShotGridBridge**: The two intentional catches are left unchanged.
- **Viewer.ts line 511**: The fallback still executes; we only add logging before it.
- **NetworkSyncManager line 1752**: The `disposeWebRTCPeer` call is preserved; we only add a log line.

### Medium Risk

- **Log volume in production**: Some `debug`-level messages could be high-frequency during video playback (e.g., HDR preload). However, the Logger already suppresses DEBUG in production (default level is WARN when `import.meta.env.DEV` is false). No performance concern.
- **AppDCCWiring `error` level**: Upgrading from silent to `log.error` for load failures could surface previously hidden issues. This is the desired outcome.

### Mitigations

1. Use `debug` level for high-frequency fire-and-forget operations (preloading, cleanup).
2. Use `warn` for operations that indicate degraded functionality.
3. Use `error` only for operations that directly affect user-requested actions.
4. Production default log level (WARN) already filters out DEBUG messages.

---

## Testing Strategy

### Unit Tests

1. **Global error handler test** (`src/utils/globalErrorHandler.test.ts`):
   - Verify `installGlobalErrorHandler` registers listeners on `window`.
   - Verify an unhandled rejection triggers `log.error`.
   - Verify duplicate calls are idempotent.

2. **Verify existing tests still pass**: Since we only add log output and don't change behavior, all existing 7600+ tests should pass without modification.

3. **Logger integration**: Verify that each modified catch block actually invokes the Logger (spot-check via Logger.setSink mock in relevant test files).

### Manual Testing Checklist

- [ ] Load a video without audio track -- verify `debug` log appears in dev console (not `error`).
- [ ] Initialize app in a browser without OPFS -- verify `debug` log for cache init.
- [ ] Connect via DCC bridge and send an invalid path -- verify `error` log appears.
- [ ] Open OCIO panel with missing WASM module -- verify `warn` log appears.
- [ ] Trigger WebRTC answer with invalid SDP -- verify `warn` log and peer disposal.
- [ ] Build for production and verify no DEBUG messages appear by default.

### E2E Tests

- No changes needed to e2e tests. The `.catch(() => false)` and `.catch(() => {})` patterns in `e2e/` files are correct for Playwright test resilience and are explicitly out of scope.

---

## Success Metrics

| Metric | Before | After |
|--------|--------|-------|
| Silent `.catch(() => {})` in `src/` | 18 | 0 |
| Modules with Logger adoption | ~25 | ~33 |
| Global unhandled rejection handler | None | Installed |
| Production log levels affected | N/A | WARN+ only (DEBUG suppressed) |
| Test count change | 0 | +3-5 (for global handler) |

---

## Estimated Effort

| Task | Effort |
|------|--------|
| Create `src/utils/globalErrorHandler.ts` + tests | 1 hour |
| Update `src/main.ts` | 5 minutes |
| Add Logger imports to 8 files | 30 minutes |
| Replace 18 silent catches with logged versions | 1.5 hours |
| Run full test suite and fix any regressions | 30 minutes |
| Manual testing of key scenarios | 30 minutes |
| **Total** | **~4 hours** |

---

## Implementation Order

1. Create `src/utils/globalErrorHandler.ts` and its test.
2. Wire it into `src/main.ts`.
3. Fix silent catches in order of severity:
   - **Error-level first**: `src/AppDCCWiring.ts` (lines 96, 102)
   - **Warn-level next**: `src/App.ts:538`, `src/audio/AudioMixer.ts:396`, `src/network/NetworkSyncManager.ts:1752`, `src/color/wasm/OCIOWasmBridge.ts:72`, `src/ui/components/Viewer.ts:511`
   - **Debug-level last**: All remaining preload/cleanup catches
4. Run `npx vitest run` to verify.
5. Run `npx tsc --noEmit` to verify type safety.

---

## Files Modified (Complete List)

| File | Change Type |
|------|------------|
| `src/utils/globalErrorHandler.ts` | **New** |
| `src/utils/globalErrorHandler.test.ts` | **New** |
| `src/main.ts` | Add import + call |
| `src/App.ts` | Add Logger + fix 5 catches |
| `src/AppDCCWiring.ts` | Add Logger + fix 2 catches |
| `src/nodes/sources/VideoSourceNode.ts` | Add Logger + fix 1 catch |
| `src/audio/AudioMixer.ts` | Add Logger + fix 1 catch |
| `src/network/NetworkSyncManager.ts` | Add Logger + fix 2 catches |
| `src/color/wasm/OCIOWasmBridge.ts` | Add Logger + fix 1 catch |
| `src/ui/components/Viewer.ts` | Fix 2 catches (Logger exists) |
| `src/ui/components/ViewerExport.ts` | Add Logger + fix 1 catch |
| `src/render/Renderer.ts` | Fix 1 try/catch (Logger exists) |
| `src/nodes/sources/SequenceSourceNode.ts` | Add Logger + fix 1 try/catch |

---

## Expert Review -- Round 1

### Verdict: APPROVE WITH CHANGES

### Accuracy Check

Every silent catch listed in the plan was verified against the actual source files. The findings:

1. **Line numbers are accurate.** All 18 production silent catches exist at the stated file and line. The two ShotGridBridge intentional catches (lines 169, 417) are also verified and correctly marked as "no change needed."

2. **Logger import status is accurate.** Verified that `src/ui/components/Viewer.ts` (line 93/139) and `src/render/Renderer.ts` (line 13/34) already import and instantiate `Logger`. The remaining 8 files confirmed to lack Logger imports.

3. **No silent catches were missed.** A comprehensive regex search across all of `src/` (excluding test/e2e files) for `.catch(() => ...)`, `catch (e) {}`, and `catch(_) {}` patterns found exactly the 18 production catches plus the 2 intentional ShotGridBridge catches documented in the plan. Zero omissions.

4. **Good examples are accurate.** All six "already correct" patterns cited in the Existing Infrastructure table were verified at the stated file and line numbers.

5. **Global error handler absence confirmed.** No existing `unhandledrejection` or `window.onerror` listener exists in the `src/` directory.

6. **Logger behavior confirmed.** The `Logger.error()` method does NOT check `currentLevel` -- it always emits unconditionally. `debug`, `info`, and `warn` all have level guards. Production default is `WARN` (level 2), so `debug` and `info` messages are suppressed. This is consistent with the plan's risk assessment.

### Strengths

- **Thorough inventory.** The plan accounts for every single silent catch in production code. The grep audit found zero omissions -- a rare achievement.
- **Correct log level assignments.** The three-tier approach (debug for fire-and-forget/expected failures, warn for degraded functionality, error for user content failures) is well-calibrated. Specific highlights:
  - Audio extraction at `App.ts:464` correctly uses `debug` since many videos lack audio tracks.
  - `AppDCCWiring.ts` lines 96/102 correctly use `error` since these are user-initiated load operations where failure should be visible.
  - WebRTC `addIceCandidate` at `NetworkSyncManager.ts:1767` correctly uses `debug` since late/invalid ICE candidates are normal in WebRTC.
  - The `OCIOWasmBridge.ts:72` auto-init correctly uses `warn` rather than `error`, because the `init()` method already emits error details via the `statusChanged` event, so the logged warning serves as a secondary signal rather than the primary error path.
- **ShotGridBridge correctly excluded.** The `.catch(() => '')` pattern there is an intentional fallback value used immediately before throwing a typed error. Changing it would be wrong.
- **Zero behavioral changes.** Every replacement adds only a log call without altering control flow. The `disposeWebRTCPeer` call at `NetworkSyncManager.ts:1752` and the `tryCanvas2DFallback()` at `Viewer.ts:511` are both preserved.
- **Production log volume is safe.** The high-frequency catches (HDR preload at `VideoSourceNode.ts:745`, `Viewer.ts:1517`, and `ViewerExport.ts:417`) all use `debug` level, which is suppressed in production (default level is `WARN`). No risk of console spam.

### Concerns

1. **OCIO auto-init log level should be `error`, not `warn`.** The plan proposes `log.warn('OCIO auto-init failed:', err)` for `OCIOWasmBridge.ts:72`. However, this catch fires when the WASM module fails to initialize -- meaning color management will be completely non-functional. While the `statusChanged` event also carries the error, the log should reflect the severity of the failure. If the argument is that `statusChanged` is the primary signal, then `warn` is defensible, but `error` would be more consistent with the AppDCCWiring treatment of "user content failed to load." Consider upgrading to `error` or adding a comment explaining the rationale for `warn`.

2. **`AudioMixer.ts:396` dispose catch should be `debug`, not `warn`.** The plan proposes `log.warn` for `audioContext.close()` during `dispose()`. However, this is a cleanup path -- the AudioContext is being disposed, and failure to close it is harmless (the resources will be reclaimed by GC/page unload). The identical pattern at `App.ts:452` (AudioContext close in success path) correctly uses `debug`. For consistency, and because dispose-time close failures are expected (e.g., context already closed), this should be `debug` rather than `warn`. The existing comment (`/* ignore */`) also suggests the author considered this trivial.

3. **Global error handler lacks idempotency guard.** The proposed `installGlobalErrorHandler` can be called multiple times (e.g., during HMR in development), which would register duplicate listeners. The plan's testing strategy mentions "Verify duplicate calls are idempotent" but the proposed implementation does not include a guard. Add a module-level `let installed = false;` flag:
   ```typescript
   let installed = false;
   export function installGlobalErrorHandler(): void {
     if (installed || typeof window === 'undefined') return;
     installed = true;
     // ...listeners...
   }
   ```

4. **Global `error` event handler may be noisy.** The proposed `window.addEventListener('error', ...)` handler will fire for all uncaught errors including script load failures, CORS errors, and third-party library errors. The check `event.error instanceof Error` helps filter some noise, but network-level resource errors (e.g., a `<script>` 404) fire `ErrorEvent` without an `.error` property and will be silently skipped. Consider whether this handler adds enough value over just the `unhandledrejection` handler, or whether it risks duplicating errors that are also caught as rejected promises.

5. **The plan does not address `event.preventDefault()` for `unhandledrejection`.** Without calling `event.preventDefault()`, the browser will still log the rejection to the console as an "Unhandled promise rejection" in addition to the Logger output. This means in development, every unhandled rejection will appear twice (once from the Logger, once from the browser). This is arguably desirable for visibility, but it should be documented as an explicit decision.

### Recommended Changes

1. **Downgrade `AudioMixer.ts:396` from `warn` to `debug`.** Consistency with `App.ts:452` (same pattern: AudioContext close during cleanup). Both are harmless cleanup failures.

2. **Add idempotency guard to `installGlobalErrorHandler`.** Use a module-level boolean flag to prevent duplicate listener registration during HMR.

3. **Consider adding `{ once: false }` documentation or removing the `window.addEventListener('error', ...)` handler entirely.** The `unhandledrejection` handler alone covers the gap this plan aims to fill (unhandled promises). The generic `error` handler adds marginal value and risks double-logging errors that are already caught by try/catch blocks that re-throw.

4. **In the proposed code for `App.ts` item 2.1.2 (line 454-456), the replacement should preserve the `return undefined` statement.** The plan's replacement code shows `return undefined;` which is correct. Just confirming this is present -- verified.

### Missing Considerations

1. **`Viewer.ts` has ~25 raw `console.*` calls despite having a Logger instance.** While not silent catches (and thus out of scope for this plan), it is worth noting that `Viewer.ts` line 1525 uses `console.warn('Failed to fetch HDR video frame:', err)` instead of `log.warn(...)`, and line 506 uses `console.log('[Viewer] WebGPU HDR available, initializing blit')` instead of `log.info(...)`. A follow-up task to migrate these to the Logger would be a natural companion to this plan.

2. **No consideration of structured error metadata.** The plan replaces silent catches with string-based log messages. For the `error`-level catches in `AppDCCWiring.ts`, it might be valuable to include the file path in a structured way (e.g., `log.error('Failed to load video from DCC:', { path, error: err })`) so that log aggregation tools can filter by path. This is a minor enhancement, not a blocker.

3. **Test file for `globalErrorHandler.ts` is described but not specified in detail.** The testing strategy mentions verifying listener registration and idempotency, but does not specify how to test the `error` event handler branch (which requires constructing an `ErrorEvent` with an `.error` property). Consider adding a note about using `new ErrorEvent('error', { error: new Error('test') })` in the test specification.

4. **The plan does not mention whether `event.reason` in the `unhandledrejection` handler could be a non-Error value.** Promise rejections can be rejected with any value (strings, numbers, objects, `undefined`). The proposed `log.error('Unhandled promise rejection:', event.reason)` will handle all of these since Logger spreads `...args` to the console, but it is worth documenting this design choice so future maintainers do not add `instanceof Error` checks that would silently drop non-Error rejections.

---

## QA Review -- Round 1

### Verdict: APPROVE WITH CHANGES

### Test Coverage Assessment

**Existing test coverage for affected modules:**

| Module | Has Unit Tests | Tests Error Paths | Console Spy Setup |
|--------|---------------|-------------------|-------------------|
| `src/audio/AudioMixer.ts` | Yes (84 test entries) | `dispose()` tested but `close()` mock resolves -- catch never triggers | No console spies |
| `src/network/NetworkSyncManager.ts` | Yes (74 test entries) | WebRTC `setRemoteDescription`/`addIceCandidate` error paths are NOT tested | No console spies |
| `src/color/wasm/OCIOWasmBridge.ts` | Yes | `init()` failure tested via `rejects.toThrow()` but `autoInit` path (line 72, the silent catch) has ZERO test coverage | No console spies |
| `src/nodes/sources/VideoSourceNode.ts` | Yes | HDR preload error path untested | No console spies |
| `src/ui/components/Viewer.ts` | Yes | WebGPU fallback path and preload catch untested | No console spies |
| `src/ui/components/ViewerExport.ts` | Yes | Background frame fetch error path untested | No console spies |
| `src/render/Renderer.ts` | Yes | `unpackColorSpace` catch untested | No console spies |
| `src/nodes/sources/SequenceSourceNode.ts` | Yes | `data.close()` failure path untested | No console spies |
| `src/App.ts` | **No unit test file** | N/A | N/A |
| `src/AppDCCWiring.ts` | **No unit test file** | N/A | N/A |

The plan states "all existing 7600+ tests should pass without modification." This is correct -- since the changes only add log output inside catch blocks, and the existing tests either (a) mock the failing operations to succeed or (b) do not exercise the error paths at all, no existing assertions will break.

**Global error handler test coverage:**

The plan proposes 3-5 new tests for `globalErrorHandler.ts` but does not provide test implementation details. The proposed tests face a jsdom limitation: **jsdom does not provide `PromiseRejectionEvent`** and does not emit `unhandledrejection` events on `window`. This means the test must:
- Manually construct and dispatch events using `new Event('unhandledrejection')` with a custom `reason` property, or polyfill `PromiseRejectionEvent`.
- Cannot rely on actual unhandled promise rejections to trigger the listener in the jsdom environment.
- The `window.addEventListener('error', ...)` handler CAN be tested via `new ErrorEvent('error', { error: new Error('test') })`, which jsdom does support.

**Logger test coverage:** Excellent (205 lines, covers all levels, sinks, filtering, and `withContext`). No changes needed.

### Risk Assessment

**Low risk items (confirmed safe):**

1. All 18 replacements are logging-only additions. No control flow changes. Verified by reading every affected line in context.
2. The `disposeWebRTCPeer(key)` call at `NetworkSyncManager.ts:1752` is preserved.
3. The `tryCanvas2DFallback()` call at `Viewer.ts:511` is preserved.
4. The `return undefined;` at `App.ts:456` is preserved.
5. Production log volume is safe: high-frequency catches use `debug` level, suppressed when `import.meta.env.DEV` is false (default level `WARN`).

**Medium risk items:**

1. **Test console noise in CI.** In Vitest, `import.meta.env.DEV` is `true`, so the Logger defaults to `LogLevel.DEBUG`. Any test that triggers an error path in the modified catch blocks will now emit console output that was previously silent. While this won't cause test failures, it may produce unexpected console noise in CI logs if tests exercise error scenarios. The global `test/setup.ts` only suppresses `console.warn` messages containing "Failed to load", and the Logger's format puts the module prefix `[ModuleName]` as the first argument, so this suppression will NOT catch Logger-emitted warnings.

2. **HMR double-registration.** As noted in the Expert Review, the `installGlobalErrorHandler` lacks an idempotency guard. During Vite HMR in development, `main.ts` may re-execute, registering duplicate `unhandledrejection` listeners. Each subsequent rejection would log N times (where N = number of HMR cycles). This is a development-only issue but will confuse developers.

**No risk items (false alarms ruled out):**

1. The `ShotGridBridge.ts` catches at lines 169 and 417 are correctly excluded. They return a fallback value (`''`) used immediately before a typed error throw. Changing them would break the error-throwing pattern.
2. Existing tests that spy on `console.warn`/`console.error` in other modules (e.g., `GTOGraphLoader.test.ts`, `LayoutStore.test.ts`) are unaffected because they test different modules.

### Recommended Test Additions

1. **`src/utils/globalErrorHandler.test.ts` (required, 5-7 tests):**
   - Test that `installGlobalErrorHandler()` calls `window.addEventListener` for both `unhandledrejection` and `error`.
   - Test idempotency: calling twice should only register one set of listeners (requires the idempotency guard fix).
   - Test that dispatching a synthetic `unhandledrejection` event with a `reason` property calls `Logger.error`.
   - Test that dispatching an `ErrorEvent` with an `Error` instance calls `Logger.error`.
   - Test that dispatching an `ErrorEvent` WITHOUT an `Error` instance does NOT call `Logger.error` (the `instanceof Error` guard).
   - Test the `typeof window === 'undefined'` guard by mocking `window` as `undefined` (or run in a non-jsdom environment).
   - **Important implementation note:** Since jsdom lacks `PromiseRejectionEvent`, tests must use `new Event('unhandledrejection')` and manually assign `reason` on the event object, or use `Object.defineProperty`. Example:
     ```typescript
     const event = new Event('unhandledrejection');
     Object.defineProperty(event, 'reason', { value: new Error('test') });
     window.dispatchEvent(event);
     ```

2. **`src/color/wasm/OCIOWasmBridge.test.ts` (recommended, 1 test):**
   - Add a test for the `autoInit` constructor path that verifies the catch fires `log.warn` when the factory rejects. This is currently untested.

3. **`src/network/NetworkSyncManager.test.ts` (recommended, 2 tests):**
   - Add tests for `handleWebRTCAnswer` with a failing `setRemoteDescription` and `handleWebRTCIce` with a failing `addIceCandidate`. These error paths have zero coverage.

### Migration Safety

1. **TypeScript safety:** Adding `Logger` imports and `const log = new Logger(...)` declarations to 8 new files is straightforward. The Logger constructor takes a single string, no generics or complex types. `npx tsc --noEmit` will catch any import path errors.

2. **Backward compatibility:** The Logger is a module-level singleton with global state (`currentLevel`, `currentSink`). Adding Logger instances to more modules does not change the behavior of existing Logger users. The only shared state is the log level and sink, which are set globally.

3. **No async behavior changes:** None of the replacements alter the resolved/rejected value of any promise chain. The `.catch()` handlers still return the same values (`undefined`, `''`, etc.) as before. The `log.*()` calls are synchronous and side-effect-free from the perspective of promise resolution.

4. **Module loading order:** The `installGlobalErrorHandler()` call in `main.ts` runs before `new App()`, which is correct. The `import` statement for `globalErrorHandler` is a static import, so the module will be loaded and ready before the function is called.

### Concerns

1. **Missed silent catch: `src/render/Renderer.ts` line 2098.** The plan lists only one silent try/catch in Renderer.ts (line 839), but there is a second at line 2098:
   ```typescript
   try {
     gl.unpackColorSpace = 'srgb';
     this._currentUnpackColorSpace = 'srgb';
   } catch (e) {
     // Shouldn't fail for 'srgb', but guard defensively
   }
   ```
   This is the same pattern as line 839 (feature detection for `gl.unpackColorSpace`). It should be fixed identically:
   ```typescript
   } catch (e) {
     log.debug('gl.unpackColorSpace reset to srgb not supported:', e);
   }
   ```
   **The summary table should list 19 production silent catches to fix, not 18.** The "Files Modified" table correctly says Renderer.ts gets "Fix 1 try/catch" but it should say "Fix 2 try/catches."

2. **`test/setup.ts` console.warn suppression is incompatible with Logger output format.** The test setup at line 264-270 suppresses `console.warn` when the first argument contains "Failed to load". However, Logger calls `console.warn('[ModuleName]', message, ...)`, so the first argument is the module prefix, not the message. If any test triggers the `AppDCCWiring` error-level catches (which use `log.error`, not `log.warn`, so this is moot for those) or any warn-level catch, the warning will pass through unsuppressed. This is not a bug per se, but it means the existing suppression mechanism does not cover Logger output. If test noise becomes a problem, consider either:
   - Updating the suppression check to inspect all arguments, not just `args[0]`.
   - Adding `Logger.setSink(() => {})` in test setup (would silence ALL Logger output, which is too aggressive).
   - Doing nothing and accepting that Logger-emitted warnings in tests represent real issues that should be visible.

   Recommendation: Do nothing. Logger output in tests is useful signal, not noise.

3. **The `e2e/AudioMixer.e2e.test.ts` duplicates the `App.ts` pattern (line 75).** It uses `audioMixer.initialize().catch(() => { /* AudioContext may be unavailable */ })` which is a copy-paste of the production code. While test files are explicitly out of scope, this duplication means the e2e test will continue demonstrating the old pattern. Consider filing a follow-up to update e2e test files for consistency.

4. **No lint rule to prevent regression.** After this plan is implemented, nothing prevents a developer from introducing new `.catch(() => {})` patterns. Consider adding an ESLint rule (e.g., `no-empty-function` scoped to catch handlers, or a custom rule via `eslint-plugin-promise` with `no-callback-in-promise` or a custom pattern) as a follow-up task. This is out of scope for this plan but is a natural next step.

5. **Global error handler `window.addEventListener('error')` will fire for `<script>` and `<link>` load errors.** These are `Event` objects (not `ErrorEvent` with `.error`), so the `instanceof Error` guard will filter them out. However, some bundler errors during development DO produce `ErrorEvent` with an `Error` instance. This could cause duplicate logging (once from the Logger via the global handler, once from the Vite overlay). This is acceptable for development but should be documented.

6. **The plan's success metric "Silent `.catch(() => {})` in `src/`: 18 -> 0" should be updated to 19 -> 0** to account for the missed `Renderer.ts:2098` catch.

---

## Expert Review -- Round 2 (Final)

### Final Verdict: APPROVE WITH CHANGES

### Round 1 Feedback Assessment

Both the Expert Review and QA Review from Round 1 were thorough and well-calibrated. I verified every claim against the actual source code and can confirm the following:

**Expert Review findings -- all validated:**

1. **OCIO log level debate (`warn` vs `error`):** The Expert raised a valid point about `OCIOWasmBridge.ts:72`. After examining the code at lines 65-93, the constructor comment says "Fire-and-forget init (errors emitted via event)" and the `init()` method at line 83 catches errors and emits them via `statusChanged`. The `warn` level is the correct choice here: the `statusChanged` event is the primary error channel (it carries structured status info consumed by the UI), and the logger message serves as a secondary breadcrumb for developers reading console output. Upgrading to `error` would create noise for a condition that already has a dedicated reporting mechanism. **Keep `warn` as proposed.**

2. **`AudioMixer.ts:396` downgrade to `debug`:** Agreed. The Expert correctly identified the inconsistency with `App.ts:452` (identical pattern: closing AudioContext during cleanup). Both should be `debug`. **Accept this change.**

3. **Idempotency guard:** Agreed. The testing strategy explicitly mentions testing idempotency, but the implementation lacks it. The proposed `let installed = false` pattern is correct and minimal. **Accept this change.**

4. **Global `error` event handler value:** The Expert's concern about the `window.addEventListener('error', ...)` handler is well-founded. After examining the codebase, there are no existing `window.onerror` or `unhandledrejection` handlers anywhere in `src/`. The `unhandledrejection` handler alone fills the critical gap (silent promise swallowing). The generic `error` handler's value is marginal -- errors caught by try/catch do not fire this event, and uncaught synchronous errors that reach the global handler are rare in a modern async codebase. **Recommend removing the `window.addEventListener('error', ...)` handler entirely** to keep the global handler focused and avoid the double-logging concern. This simplifies the implementation and the tests.

5. **`event.preventDefault()` for `unhandledrejection`:** The Expert correctly noted this is a design decision. Without `preventDefault()`, the browser will also log the rejection. During development this means double output, but it is actually preferable: the Logger provides a formatted, module-prefixed entry, while the browser provides a stack trace with source maps. **Do not call `preventDefault()`.** Document this explicitly in a code comment.

**QA Review findings -- all validated:**

1. **Missed `Renderer.ts:2098` catch:** Confirmed. Line 2098 has `} catch (e) { // Shouldn't fail for 'srgb', but guard defensively }` which is a silent catch identical in pattern to line 839. The count should be 19, not 18. **Accept this correction.**

2. **Test console noise in CI:** The QA review correctly identifies that `import.meta.env.DEV` is `true` in Vitest, so Logger defaults to `DEBUG` level. However, the affected catch blocks mostly use `debug` level for fire-and-forget operations, and the tests that could trigger them (e.g., HDR preload tests) would need to fail to produce output. Since the plan does not change behavior, existing passing tests will not suddenly trigger catch blocks. This is a theoretical concern, not a practical one. **No action needed.**

3. **jsdom `PromiseRejectionEvent` limitation:** Validated. jsdom does not support `PromiseRejectionEvent`. The QA review's suggested workaround (`new Event('unhandledrejection')` with `Object.defineProperty`) is correct and practical. **Accept this test guidance.**

4. **e2e `AudioMixer.e2e.test.ts` duplication:** Valid observation but explicitly out of scope. **Note for follow-up only.**

5. **ESLint rule for regression prevention:** Both reviewers mention this. It is a natural follow-up but correctly excluded from this plan's scope. **Note for follow-up only.**

### Consolidated Required Changes (before implementation)

These changes MUST be made before implementation proceeds:

1. **Update `Renderer.ts` count from 1 to 2 catch fixes.** Add `Renderer.ts:2098` to the detailed steps (Section 2.10) with an additional entry 2.10.2:
   ```typescript
   } catch (e) {
     log.debug('gl.unpackColorSpace reset to srgb not supported:', e);
   }
   ```
   Update the summary table to show 19 production silent catches (not 18). Update the success metric table accordingly.

2. **Downgrade `AudioMixer.ts:396` from `warn` to `debug`.** The AudioContext close during `dispose()` is a cleanup operation where failure is harmless. This is consistent with the `debug` level used for the identical `audioCtx.close()` pattern at `App.ts:452`.

3. **Add idempotency guard to `installGlobalErrorHandler`.** Use a module-level `let installed = false` flag:
   ```typescript
   let installed = false;
   export function installGlobalErrorHandler(): void {
     if (installed || typeof window === 'undefined') return;
     installed = true;
     // ...listeners...
   }
   ```

4. **Remove the `window.addEventListener('error', ...)` handler from the global error handler.** Keep only the `unhandledrejection` handler. The generic error handler adds marginal value while introducing double-logging risk and complicating the test surface. The plan's stated goal is to address silent promise failures; the `unhandledrejection` handler fulfills this goal completely. If a generic error handler is desired later, it can be added as a separate task with its own scope.

5. **Add a code comment in `installGlobalErrorHandler` documenting the decision NOT to call `event.preventDefault()`.** Example:
   ```typescript
   // Note: We intentionally do NOT call event.preventDefault().
   // The browser's default console output provides stack traces with source maps,
   // complementing the Logger's formatted, module-prefixed entry.
   ```

### Consolidated Nice-to-Haves

These are improvements that would enhance the plan but are NOT blockers:

1. **Structured error metadata for `AppDCCWiring.ts` error-level catches.** Including the file path as a structured field (e.g., `log.error('Failed to load video from DCC:', { path, error: err })`) would help log aggregation. Minor improvement; the current string-based approach is functional.

2. **Add test for `OCIOWasmBridge` autoInit catch path.** The QA review correctly notes that the constructor's `autoInit` path at line 72 has zero test coverage. A single test verifying the catch fires `log.warn` on factory rejection would close this gap.

3. **Add tests for `NetworkSyncManager` WebRTC error paths.** `handleWebRTCAnswer` with a failing `setRemoteDescription` and `handleWebRTCIce` with a failing `addIceCandidate` have zero coverage.

4. **Provide detailed test implementation for `globalErrorHandler.test.ts`.** The plan describes 3-5 tests but does not include code. Given the jsdom limitation with `PromiseRejectionEvent`, including a reference implementation in the plan would prevent implementation-time surprises.

5. **Follow-up: migrate `Viewer.ts` raw `console.*` calls to Logger.** The file has ~25 raw `console.log`/`console.warn` calls despite already having a Logger instance. Natural companion task.

6. **Follow-up: add an ESLint rule to prevent regression.** Either `no-empty-function` scoped to catch handlers or a custom `eslint-plugin-promise` rule to flag `.catch(() => {})` patterns.

7. **Scope note on bare `catch { }` patterns.** The codebase contains approximately 80+ bare `catch { }` blocks (parameterless catch without logging) across production files. These are distinct from the `.catch(() => {})` promise patterns targeted by this plan. Many are legitimate feature-detection or fallback patterns (e.g., `DisplayCapabilities.ts` has ~15 of them for browser capability probing, `SafeCanvasContext.ts` has 3 for color space negotiation). However, some are arguably silent failures that could benefit from logging (e.g., `AudioPlaybackManager.ts:505,530` with `// Ignore errors from already stopped nodes`, `NetworkSyncManager.ts:1293,1303,1615,1622` with `// ignore close errors`, `OCIOWasmModule.ts:154,160` with `/* best effort */`). A follow-up plan could audit these bare catch blocks with the same methodology used here.

### Final Risk Rating: LOW

The plan is logging-only changes with zero behavioral modifications. The required changes above further reduce risk by:
- Removing the `window.addEventListener('error', ...)` handler (eliminates double-logging risk)
- Adding the idempotency guard (eliminates HMR duplicate-registration risk)
- Correcting the catch count (eliminates missed-catch risk)

The only residual risk is minor CI console noise during test runs, which the QA review correctly assessed as theoretical rather than practical.

### Final Effort Estimate: 4 hours

The original 4-hour estimate remains accurate. The required changes (adding one more catch fix, downgrading one log level, adding an idempotency guard, removing the error handler) are all minimal modifications that do not change the overall work profile. The removal of the `window.addEventListener('error', ...)` handler actually slightly reduces both implementation and test effort.

### Implementation Readiness: READY

With the five required changes incorporated, this plan is ready for implementation. The inventory is comprehensive (19 catches after the Renderer.ts:2098 correction), the log level assignments are well-calibrated, the testing strategy is sound, and the risk profile is low. The plan is a clean, focused improvement that delivers immediate debugging value with no behavioral side effects.

---

## QA Review -- Round 2 (Final)

### Final Verdict: APPROVE WITH CHANGES

### Round 1 Feedback Assessment

I independently verified every claim from the Expert Review (Round 1), QA Review (Round 1), and Expert Review (Round 2) against the current source code. All source file line numbers, Logger import statuses, catch patterns, and behavioral descriptions were confirmed accurate as of this review. Below is my consolidated assessment.

**Points of agreement across all prior reviews:**

1. **Missed `Renderer.ts:2098` catch (QA Round 1, Concern #1):** Independently confirmed. The catch at line 2098 contains `catch (e) { // Shouldn't fail for 'srgb', but guard defensively }` -- this is a silent catch identical in pattern to line 839. Both the QA Round 1 and Expert Round 2 agree this must be added. The corrected count is 19 production silent catches, not 18. **Accepted by all reviewers.**

2. **`AudioMixer.ts:396` downgrade from `warn` to `debug` (Expert Round 1, Concern #2):** Independently verified the code at line 390-399. The `audioContext.close()` call during `dispose()` occurs after `masterGain.disconnect()` and sets `audioContext = null` immediately after. Failure here is harmless -- the AudioContext may already be in `'closed'` state. The pattern is identical to `App.ts:452`. All reviewers agree on `debug`. **Accepted unanimously.**

3. **Idempotency guard for `installGlobalErrorHandler` (Expert Round 1, Concern #3):** Verified that `src/main.ts` has no `import.meta.hot` handling. While Vite does full page reloads for `main.ts` changes (not HMR), the guard is zero-cost defensive programming. All reviewers agree. **Accepted unanimously.**

4. **OCIO auto-init log level should remain `warn` (Expert Round 1, Concern #1):** Verified at `OCIOWasmBridge.ts:65-73` that the constructor comment explicitly says "errors emitted via event." The `init()` method at lines 83+ handles error reporting via `statusChanged`. The `warn` from the catch is a secondary breadcrumb, not the primary error channel. Both the plan and the Expert Round 2 agree on `warn`. **Accepted -- keep `warn` as proposed.**

5. **jsdom `PromiseRejectionEvent` limitation (QA Round 1):** Confirmed. jsdom lacks `PromiseRejectionEvent`. The workaround using `new Event('unhandledrejection')` with `Object.defineProperty` is the standard approach in Vitest/jsdom environments. **Accepted as test implementation guidance.**

**Point of divergence -- `window.addEventListener('error')` handler:**

The Expert Round 2 recommends **removing** the `error` event handler entirely. I partially disagree. The `error` handler catches uncaught synchronous exceptions (e.g., a `throw` in a synchronous callback that is not wrapped in try/catch). While rare, these do occur in production -- for example, a `RangeError` in a render loop or a `TypeError` from an unexpected `null` in a UI callback. These errors do NOT produce `unhandledrejection` events.

However, the Expert Round 2's concern about double-logging is valid: Vite's error overlay already catches these in development, and browsers display them in the console natively. The Logger entry provides module-prefixed formatting but no additional stack information.

**My recommendation:** Keep the `error` handler but guard it behind `import.meta.env.PROD` so it only fires in production builds where there is no Vite overlay. In development, the browser's native error display and Vite overlay are sufficient. This eliminates the double-logging concern while preserving the safety net in production:

```typescript
// Only install the generic error handler in production.
// In development, Vite's error overlay and the browser console provide
// sufficient visibility for uncaught synchronous exceptions.
if (import.meta.env.PROD) {
  window.addEventListener('error', (event: ErrorEvent) => {
    if (event.error instanceof Error) {
      log.error('Uncaught error:', event.error.message, event.error);
    }
  });
}
```

If the team prefers simplicity over this nuance, removing the handler entirely (as Expert Round 2 suggests) is also acceptable. The `unhandledrejection` handler alone addresses 95%+ of the silent-failure gap this plan targets.

### Minimum Test Requirements

**Required (blocking):**

| # | Test | File | Rationale |
|---|------|------|-----------|
| 1 | `installGlobalErrorHandler` registers `unhandledrejection` listener | `src/utils/globalErrorHandler.test.ts` (new) | Core functionality of new module |
| 2 | Idempotency: second call does not duplicate listeners | `src/utils/globalErrorHandler.test.ts` (new) | Required change #3 demands test coverage |
| 3 | Synthetic `unhandledrejection` event triggers `Logger.error` | `src/utils/globalErrorHandler.test.ts` (new) | Verifies the handler actually works |
| 4 | No-op when `window` is undefined | `src/utils/globalErrorHandler.test.ts` (new) | SSR/worker safety |
| 5 | Full existing test suite passes (`npx vitest run`) | All existing test files | Regression gate -- 7600+ tests |

**Implementation guidance for test #3:** jsdom does not support `PromiseRejectionEvent`. Use this pattern:
```typescript
const spy = vi.spyOn(Logger.prototype, 'error');
const event = new Event('unhandledrejection');
Object.defineProperty(event, 'reason', { value: new Error('test rejection') });
window.dispatchEvent(event);
expect(spy).toHaveBeenCalledWith('Unhandled promise rejection:', expect.any(Error));
```

**Recommended (non-blocking):**

| # | Test | File | Rationale |
|---|------|------|-----------|
| 6 | If `error` handler is kept: `ErrorEvent` with `Error` triggers `Logger.error` | `src/utils/globalErrorHandler.test.ts` | Only if handler is retained |
| 7 | If `error` handler is kept: `ErrorEvent` without `Error` does NOT trigger | `src/utils/globalErrorHandler.test.ts` | Guard correctness |
| 8 | `OCIOWasmBridge` autoInit with rejecting factory fires `log.warn` | `src/color/wasm/OCIOWasmBridge.test.ts` | Zero coverage for this path |
| 9 | `NetworkSyncManager` `setRemoteDescription` rejection fires `log.warn` + peer disposal | `src/network/NetworkSyncManager.test.ts` | Zero coverage for this path |
| 10 | `NetworkSyncManager` `addIceCandidate` rejection fires `log.debug` | `src/network/NetworkSyncManager.test.ts` | Zero coverage for this path |

### Final Risk Rating: LOW

**Confirmed low risk based on the following verified facts:**

1. **Zero behavioral changes.** Every one of the 19 catch replacements adds only a `log.*()` call. All existing side effects (`disposeWebRTCPeer`, `tryCanvas2DFallback`, `return undefined`, `audioCtx.close()`) are preserved verbatim. I verified this by reading every affected catch block in context.

2. **Production log volume is bounded.** Of the 19 catches: 13 use `debug` (suppressed in production, where default level is `WARN`), 4 use `warn` (fires only on genuinely degraded conditions), 2 use `error` (fires only on user content load failures from DCC bridge). None of these are in hot loops. The highest-frequency candidates (HDR preload at `VideoSourceNode.ts:745`, `Viewer.ts:1517`, `ViewerExport.ts:417`) all use `debug` and will produce zero output in production.

3. **Logger is battle-tested.** The `Logger` class at `src/utils/Logger.ts` is 65 lines, has 205 lines of tests, and is already adopted in 25+ modules. Adding it to 8 more files is routine. The `error()` method unconditionally emits (no level guard), which is correct for the 2 error-level catches.

4. **No new dependencies.** The global error handler uses only `Logger` (already in the dependency graph) and built-in browser APIs (`window.addEventListener`).

5. **Test impact is nil for existing tests.** The affected catch blocks are in error paths that existing tests do not exercise (verified: zero test coverage for autoInit, WebRTC error paths, HDR preload failures, AudioContext close failures). No existing test assertions will change.

6. **The idempotency guard** (required change #3) eliminates the only identified medium-risk concern (HMR double-registration).

### Implementation Readiness: READY

The plan is ready for implementation once the following 5 required changes are incorporated (all agreed upon by both Expert and QA reviewers across both rounds):

1. Add `Renderer.ts:2098` as item 2.10.2 (total: 19 catches, not 18).
2. Downgrade `AudioMixer.ts:396` from `warn` to `debug`.
3. Add idempotency guard (`let installed = false`) to `installGlobalErrorHandler`.
4. Resolve `window.addEventListener('error')` handler: either remove it (Expert Round 2 recommendation) or guard with `import.meta.env.PROD` (QA Round 2 recommendation). Either approach is acceptable.
5. Add code comment documenting intentional omission of `event.preventDefault()` on `unhandledrejection`.

The plan's inventory is complete (confirmed by independent regex audit: 19 production silent catches + 2 intentional ShotGridBridge catches). The log level assignments are well-calibrated and internally consistent. The estimated 4-hour effort is realistic. No blocking issues remain.
