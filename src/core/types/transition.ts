/**
 * Transition Types and Constants
 *
 * Defines the data types for playlist clip transitions (crossfade, dissolve, wipes, etc.).
 * Each transition type maps to a GLSL uniform integer for GPU-based rendering.
 */

/** Supported transition types between playlist clips */
export type TransitionType = 'cut' | 'crossfade' | 'dissolve' | 'wipe-left' | 'wipe-right' | 'wipe-up' | 'wipe-down';

/** Configuration for a transition between two clips */
export interface TransitionConfig {
  /** The type of transition effect */
  type: TransitionType;
  /** Duration of the transition in frames (must be <= min(outgoing.duration, incoming.duration)) */
  durationFrames: number;
}

/** Information about a transition at a specific frame */
export interface TransitionFrameInfo {
  /** Whether the current frame is within a transition region */
  isInTransition: boolean;
  /** The type of transition effect */
  transitionType: TransitionType;
  /** Progress through the transition: 0.0 = fully outgoing, 1.0 = fully incoming */
  progress: number;
  /** Index of the outgoing (previous) clip */
  outgoingClipIndex: number;
  /** Index of the incoming (next) clip */
  incomingClipIndex: number;
  /** Local frame number within the outgoing clip */
  outgoingLocalFrame: number;
  /** Local frame number within the incoming clip */
  incomingLocalFrame: number;
}

/** Map transition type to GLSL uniform int */
export const TRANSITION_TYPE_CODES: Record<TransitionType, number> = {
  'cut': -1,
  'crossfade': 0,
  'dissolve': 1,
  'wipe-left': 2,
  'wipe-right': 3,
  'wipe-up': 4,
  'wipe-down': 5,
};

/** Default transition duration in frames */
export const DEFAULT_TRANSITION_DURATION = 12;

/** Type guard for valid transition type strings */
export function isTransitionType(value: string): value is TransitionType {
  return ['cut', 'crossfade', 'dissolve', 'wipe-left', 'wipe-right', 'wipe-up', 'wipe-down'].includes(value);
}
