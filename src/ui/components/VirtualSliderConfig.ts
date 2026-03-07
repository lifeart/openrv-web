/**
 * VirtualSliderConfig - Parameter configuration for virtual slider system.
 *
 * Defines the parameter map, sensitivity constants, and format functions
 * for the key-hold-to-adjust virtual slider interaction.
 */

import type { NumericAdjustmentKey } from '../../core/types/color';
import { DEFAULT_COLOR_ADJUSTMENTS } from '../../core/types/color';

/**
 * Configuration for a single virtual slider parameter.
 */
export interface VirtualSliderParam {
  /** Maps to a ColorAdjustments numeric field. */
  key: NumericAdjustmentKey;
  /** Display name shown in the HUD. */
  label: string;
  /** Minimum allowed value. */
  min: number;
  /** Maximum allowed value. */
  max: number;
  /** Default/reset value (from DEFAULT_COLOR_ADJUSTMENTS). */
  defaultValue: number;
  /** Value change per pixel of horizontal mouse movement. */
  coarseStep: number;
  /** Value change per +/- key press (also Shift+drag step multiplier base). */
  fineStep: number;
  /** Format function for display in the HUD. */
  format: (v: number) => string;
}

/**
 * Virtual slider states.
 */
export enum VirtualSliderState {
  /** No virtual slider interaction in progress. */
  IDLE = 'idle',
  /** Activator key is pressed; waiting for hold confirmation or mouse movement. */
  ARMED = 'armed',
  /** Virtual slider is active; mouse movement adjusts the value. */
  ACTIVE = 'active',
  /** Slider is locked; key can be released but adjustment continues. */
  LOCKED = 'locked',
}

// ---------------------------------------------------------------------------
// Sensitivity constants
// ---------------------------------------------------------------------------

/** Time in ms the activator key must be held before auto-transitioning to ACTIVE. */
export const ARMED_TIMEOUT_MS = 150;

/** Cumulative |movementX| in pixels that triggers ARMED -> ACTIVE transition. */
export const ARMED_DEAD_ZONE_PX = 3;

/** Multiplier applied to coarseStep when Shift is held (fine adjustment). */
export const FINE_ADJUSTMENT_MULTIPLIER = 0.1;

/** Maximum allowed |movementX| per frame to prevent browser-quirk jumps. */
export const MOVEMENT_X_CLAMP = 100;

// ---------------------------------------------------------------------------
// Parameter map
// ---------------------------------------------------------------------------

/**
 * Map from KeyboardEvent.code to virtual slider parameter configuration.
 */
export const VIRTUAL_SLIDER_PARAMS: Record<string, VirtualSliderParam> = {
  KeyE: {
    key: 'exposure',
    label: 'Exposure',
    min: -5,
    max: 5,
    defaultValue: DEFAULT_COLOR_ADJUSTMENTS.exposure,
    coarseStep: 0.01,
    fineStep: 0.002,
    format: (v) => `${v >= 0 ? '+' : ''}${v.toFixed(2)}`,
  },
  KeyY: {
    key: 'gamma',
    label: 'Gamma',
    min: 0.1,
    max: 4.0,
    defaultValue: DEFAULT_COLOR_ADJUSTMENTS.gamma,
    coarseStep: 0.01,
    fineStep: 0.01,
    format: (v) => v.toFixed(2),
  },
  KeyB: {
    key: 'brightness',
    label: 'Brightness',
    min: -1,
    max: 1,
    defaultValue: DEFAULT_COLOR_ADJUSTMENTS.brightness,
    coarseStep: 0.005,
    fineStep: 0.005,
    format: (v) => `${v >= 0 ? '+' : ''}${(v * 100).toFixed(1)}%`,
  },
  KeyH: {
    key: 'hueRotation',
    label: 'Hue',
    min: 0,
    max: 360,
    defaultValue: DEFAULT_COLOR_ADJUSTMENTS.hueRotation,
    coarseStep: 1.0,
    fineStep: 0.5,
    format: (v) => `${v.toFixed(1)}\u00B0`,
  },
  KeyS: {
    key: 'saturation',
    label: 'Saturation',
    min: 0,
    max: 2,
    defaultValue: DEFAULT_COLOR_ADJUSTMENTS.saturation,
    coarseStep: 0.005,
    fineStep: 0.005,
    format: (v) => `${(v * 100).toFixed(1)}%`,
  },
  KeyK: {
    key: 'contrast',
    label: 'Contrast',
    min: 0,
    max: 2,
    defaultValue: DEFAULT_COLOR_ADJUSTMENTS.contrast,
    coarseStep: 0.005,
    fineStep: 0.005,
    format: (v) => `${(v * 100).toFixed(1)}%`,
  },
};

/**
 * Set of KeyboardEvent.code values that are virtual slider activator keys.
 */
export const VIRTUAL_SLIDER_KEYS = new Set(Object.keys(VIRTUAL_SLIDER_PARAMS));

/**
 * Keys that the virtual slider controller processes during ACTIVE/LOCKED states.
 * All other key events are consumed (stopPropagation + preventDefault) during
 * these states to prevent other shortcuts from firing.
 */
export const VIRTUAL_SLIDER_ACTIVE_KEYS = new Set([
  'Equal',       // + key
  'NumpadAdd',   // numpad +
  'Minus',       // - key
  'NumpadSubtract', // numpad -
  'Digit0', 'Digit1', 'Digit2', 'Digit3', 'Digit4',
  'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9',
  'Numpad0', 'Numpad1', 'Numpad2', 'Numpad3', 'Numpad4',
  'Numpad5', 'Numpad6', 'Numpad7', 'Numpad8', 'Numpad9',
  'Period',      // .
  'NumpadDecimal',
  'Enter',
  'NumpadEnter',
  'Escape',
  'KeyL',        // lock toggle
  'Backspace',
  'ShiftLeft',
  'ShiftRight',
]);
