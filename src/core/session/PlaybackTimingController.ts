import type { SubFramePosition } from '../../utils/FrameInterpolator';
import type { LoopMode } from './Session';

/**
 * Maximum consecutive starvation skips before forcing a pause
 */
export const MAX_CONSECUTIVE_STARVATION_SKIPS = 2;

/**
 * Starvation timeout - if frame extraction hangs for this long, skip the frame
 */
export const STARVATION_TIMEOUT_MS = 5000;

/**
 * Maximum reverse playback speed - higher speeds may outpace frame extraction
 */
export const MAX_REVERSE_SPEED = 4;

/**
 * Mutable timing state owned by Session and passed into PlaybackTimingController methods.
 *
 * Session keeps these as individual fields for backward compatibility with
 * existing code and tests.  This interface captures the shape so the
 * controller methods can operate on it generically.
 */
export interface TimingState {
  lastFrameTime: number;
  frameAccumulator: number;
  bufferingCount: number;
  isBuffering: boolean;
  starvationStartTime: number;
  consecutiveStarvationSkips: number;
  fpsFrameCount: number;
  fpsLastTime: number;
  effectiveFps: number;
  subFramePosition: SubFramePosition | null;
}

/**
 * Result from checking starvation state.
 */
export interface StarvationCheckResult {
  /** Whether the starvation timeout was reached */
  timedOut: boolean;
  /** Whether consecutive skips exceeded the maximum (caller should pause) */
  shouldPause: boolean;
  /** Whether the starvation is near the end of the play range */
  nearEnd: boolean;
  /** Duration of current starvation in ms */
  starvationDurationMs: number;
}

/**
 * PlaybackTimingController extracts the frame timing accumulator, starvation
 * detection, buffering counter, effective-FPS measurement, and sub-frame
 * interpolation logic from Session into a focused, testable unit.
 *
 * The controller is **stateless** -- all mutable timing state lives in the
 * `TimingState` object that Session owns.  Methods accept the state by
 * reference and mutate it in place, returning result values where needed.
 *
 * This design keeps Session's field layout unchanged (tests that access
 * internal fields via `(session as any).lastFrameTime` still work) while
 * moving the logic into a standalone, independently testable class.
 */
export class PlaybackTimingController {

  // -----------------------------------------------------------------
  // Timing reset
  // -----------------------------------------------------------------

  /**
   * Reset the frame accumulator and record the current timestamp.
   * Called when playback starts or when speed / direction changes.
   */
  resetTiming(state: TimingState, now: number = performance.now()): void {
    state.lastFrameTime = now;
    state.frameAccumulator = 0;
  }

  /**
   * Reset FPS tracking counters.
   * Called when playback starts.
   */
  resetFpsTracking(state: TimingState, now: number = performance.now()): void {
    state.fpsFrameCount = 0;
    state.fpsLastTime = now;
    state.effectiveFps = 0;
  }

  // -----------------------------------------------------------------
  // Frame accumulator math
  // -----------------------------------------------------------------

  /**
   * Compute the effective playback speed, capping reverse playback.
   */
  getEffectiveSpeed(playbackSpeed: number, playDirection: number): number {
    return playDirection < 0
      ? Math.min(playbackSpeed, MAX_REVERSE_SPEED)
      : playbackSpeed;
  }

  /**
   * Compute the duration of a single frame in milliseconds.
   */
  getFrameDuration(fps: number, effectiveSpeed: number): number {
    return (1000 / fps) / effectiveSpeed;
  }

  /**
   * Accumulate elapsed time and return how many whole frames have elapsed.
   * This is the simple (non-gated) path used for sequences/images
   * where every frame is always available.
   *
   * @returns The number of frames to advance and the frame duration used.
   */
  accumulateFrames(
    state: TimingState,
    fps: number,
    playbackSpeed: number,
    playDirection: number,
    now: number = performance.now(),
  ): { framesToAdvance: number; frameDuration: number } {
    const delta = now - state.lastFrameTime;
    state.lastFrameTime = now;

    const effectiveSpeed = this.getEffectiveSpeed(playbackSpeed, playDirection);
    const frameDuration = this.getFrameDuration(fps, effectiveSpeed);
    state.frameAccumulator += delta;

    let framesToAdvance = 0;
    while (state.frameAccumulator >= frameDuration) {
      state.frameAccumulator -= frameDuration;
      framesToAdvance++;
    }

    return { framesToAdvance, frameDuration };
  }

  /**
   * Accumulate elapsed time for the frame-gated (mediabunny) path.
   * Returns the delta and frame duration so the caller can drive the
   * frame-gated while-loop itself (since the loop body needs access
   * to source-specific cache checks).
   */
  accumulateDelta(
    state: TimingState,
    fps: number,
    playbackSpeed: number,
    playDirection: number,
    now: number = performance.now(),
  ): { delta: number; frameDuration: number } {
    const delta = now - state.lastFrameTime;
    state.lastFrameTime = now;

    const effectiveSpeed = this.getEffectiveSpeed(playbackSpeed, playDirection);
    const frameDuration = this.getFrameDuration(fps, effectiveSpeed);
    state.frameAccumulator += delta;

    return { delta, frameDuration };
  }

  /**
   * Check whether the accumulator has at least one frame worth of time.
   */
  hasAccumulatedFrame(state: TimingState, frameDuration: number): boolean {
    return state.frameAccumulator >= frameDuration;
  }

  /**
   * Consume one frame's worth of time from the accumulator.
   */
  consumeFrame(state: TimingState, frameDuration: number): void {
    state.frameAccumulator -= frameDuration;
  }

  /**
   * Cap the accumulator to prevent huge jumps when a frame becomes available
   * after starvation.
   */
  capAccumulator(state: TimingState, frameDuration: number): void {
    state.frameAccumulator = Math.min(state.frameAccumulator, frameDuration * 2);
  }

  // -----------------------------------------------------------------
  // Starvation detection
  // -----------------------------------------------------------------

  /**
   * Record that a frame was successfully displayed, resetting starvation state.
   */
  onFrameDisplayed(state: TimingState): void {
    state.starvationStartTime = 0;
    state.consecutiveStarvationSkips = 0;
  }

  /**
   * Begin tracking starvation if not already tracking.
   */
  beginStarvation(state: TimingState, now: number = performance.now()): void {
    if (state.starvationStartTime === 0) {
      state.starvationStartTime = now;
    }
  }

  /**
   * Check the current starvation state.
   *
   * @param state       Mutable timing state.
   * @param nextFrame   The frame number being waited on.
   * @param inPoint     Current in-point.
   * @param outPoint    Current out-point.
   * @param playDirection  Current play direction (1 or -1).
   */
  checkStarvation(
    state: TimingState,
    nextFrame: number,
    inPoint: number,
    outPoint: number,
    playDirection: number,
    now: number = performance.now(),
  ): StarvationCheckResult {
    const starvationDurationMs = state.starvationStartTime !== 0
      ? now - state.starvationStartTime
      : 0;

    if (starvationDurationMs <= STARVATION_TIMEOUT_MS) {
      return {
        timedOut: false,
        shouldPause: false,
        nearEnd: false,
        starvationDurationMs,
      };
    }

    // Timeout exceeded
    state.consecutiveStarvationSkips++;

    const shouldPause =
      state.consecutiveStarvationSkips >= MAX_CONSECUTIVE_STARVATION_SKIPS;

    const nearEnd = playDirection > 0
      ? nextFrame >= outPoint - 2
      : nextFrame <= inPoint + 2;

    return {
      timedOut: true,
      shouldPause,
      nearEnd,
      starvationDurationMs,
    };
  }

  /**
   * Reset starvation tracking (e.g. after a skip or loop reset).
   */
  resetStarvation(state: TimingState): void {
    state.starvationStartTime = 0;
    state.consecutiveStarvationSkips = 0;
  }

  // -----------------------------------------------------------------
  // Buffering state
  // -----------------------------------------------------------------

  /**
   * Increment the buffering counter and return whether this is the
   * transition into the buffering state (so the caller can emit an event).
   */
  incrementBuffering(state: TimingState): boolean {
    state.bufferingCount++;
    if (!state.isBuffering) {
      state.isBuffering = true;
      return true; // transitioned to buffering
    }
    return false;
  }

  /**
   * Decrement the buffering counter.
   * Returns true if the counter reached zero while previously buffering
   * (caller should emit buffering=false if still playing).
   */
  decrementBuffering(state: TimingState): boolean {
    state.bufferingCount = Math.max(0, state.bufferingCount - 1);
    if (state.bufferingCount === 0 && state.isBuffering) {
      state.isBuffering = false;
      return true; // transitioned out of buffering
    }
    return false;
  }

  /**
   * Fully reset buffering state.
   * Returns true if buffering was active (caller should emit buffering=false).
   */
  resetBuffering(state: TimingState): boolean {
    state.bufferingCount = 0;
    state.starvationStartTime = 0;
    state.consecutiveStarvationSkips = 0;
    if (state.isBuffering) {
      state.isBuffering = false;
      return true;
    }
    return false;
  }

  // -----------------------------------------------------------------
  // Effective FPS tracking
  // -----------------------------------------------------------------

  /**
   * Record a frame advance and update the effective FPS estimate.
   * Call this every time a frame is actually advanced.
   *
   * @returns The updated effective FPS value.
   */
  trackFrameAdvance(state: TimingState, now: number = performance.now()): number {
    state.fpsFrameCount++;
    const elapsed = now - state.fpsLastTime;

    // Update FPS calculation every 500ms for smooth display
    if (elapsed >= 500) {
      state.effectiveFps =
        Math.round((state.fpsFrameCount / elapsed) * 1000 * 10) / 10;
      state.fpsFrameCount = 0;
      state.fpsLastTime = now;
    }

    return state.effectiveFps;
  }

  // -----------------------------------------------------------------
  // Next-frame computation (pure, no side effects)
  // -----------------------------------------------------------------

  /**
   * Compute the next frame number without side effects (for cache checking).
   * Returns the frame number that would be displayed after advancing.
   */
  computeNextFrame(
    currentFrame: number,
    direction: number,
    inPoint: number,
    outPoint: number,
    loopMode: LoopMode,
  ): number {
    const nextFrame = currentFrame + direction;

    if (nextFrame > outPoint) {
      switch (loopMode) {
        case 'once':
          return outPoint;
        case 'loop':
          return inPoint;
        case 'pingpong':
          return outPoint - 1;
      }
    } else if (nextFrame < inPoint) {
      switch (loopMode) {
        case 'once':
          return inPoint;
        case 'loop':
          return outPoint;
        case 'pingpong':
          return inPoint + 1;
      }
    }

    return nextFrame;
  }

  // -----------------------------------------------------------------
  // Sub-frame interpolation
  // -----------------------------------------------------------------

  /**
   * Update the sub-frame position for interpolation during slow-motion playback.
   *
   * Returns the new SubFramePosition if it changed meaningfully, or
   * `undefined` if no change is needed, or `null` if the position was
   * cleared (caller should emit subFramePositionChanged accordingly).
   */
  updateSubFramePosition(
    state: TimingState,
    interpolationEnabled: boolean,
    playbackSpeed: number,
    currentFrame: number,
    playDirection: number,
    inPoint: number,
    outPoint: number,
    loopMode: LoopMode,
    frameDuration: number,
  ): SubFramePosition | null | undefined {
    if (!interpolationEnabled || playbackSpeed >= 1) {
      // Clear sub-frame position when not in slow-motion or disabled
      if (state.subFramePosition !== null) {
        state.subFramePosition = null;
        return null; // signals "cleared"
      }
      return undefined; // no change
    }

    // Compute the fractional position between current frame and next
    const ratio = Math.max(0, Math.min(1, state.frameAccumulator / frameDuration));
    const nextFrame = this.computeNextFrame(
      currentFrame, playDirection, inPoint, outPoint, loopMode,
    );

    const newPosition: SubFramePosition = {
      baseFrame: currentFrame,
      nextFrame,
      ratio,
    };

    // Only return if position changed meaningfully (avoid excessive events)
    if (
      !state.subFramePosition ||
      state.subFramePosition.baseFrame !== newPosition.baseFrame ||
      state.subFramePosition.nextFrame !== newPosition.nextFrame ||
      Math.abs(state.subFramePosition.ratio - newPosition.ratio) > 0.005
    ) {
      state.subFramePosition = newPosition;
      return newPosition;
    }

    return undefined; // no meaningful change
  }

  /**
   * Clear the sub-frame position.
   * Returns true if it was previously non-null (caller should emit event).
   */
  clearSubFramePosition(state: TimingState): boolean {
    if (state.subFramePosition !== null) {
      state.subFramePosition = null;
      return true;
    }
    return false;
  }
}
