/**
 * Transition Types Tests
 *
 * Tests for the transition type guard, constants mapping, and exports.
 */

import { describe, it, expect } from 'vitest';
import {
  isTransitionType,
  TRANSITION_TYPE_CODES,
  DEFAULT_TRANSITION_DURATION,
  type TransitionType,
} from './transition';

describe('isTransitionType', () => {
  it('returns true for all valid transition types', () => {
    const validTypes: TransitionType[] = [
      'cut',
      'crossfade',
      'dissolve',
      'wipe-left',
      'wipe-right',
      'wipe-up',
      'wipe-down',
    ];

    for (const type of validTypes) {
      expect(isTransitionType(type)).toBe(true);
    }
  });

  it('returns false for invalid strings', () => {
    expect(isTransitionType('')).toBe(false);
    expect(isTransitionType('fade')).toBe(false);
    expect(isTransitionType('wipe')).toBe(false);
    expect(isTransitionType('crossFade')).toBe(false);
    expect(isTransitionType('CROSSFADE')).toBe(false);
    expect(isTransitionType('wipe-diagonal')).toBe(false);
    expect(isTransitionType('random-string')).toBe(false);
  });

  it('returns false for non-string-like values cast to string', () => {
    expect(isTransitionType('undefined')).toBe(false);
    expect(isTransitionType('null')).toBe(false);
    expect(isTransitionType('0')).toBe(false);
  });
});

describe('TRANSITION_TYPE_CODES', () => {
  it('maps all TransitionType values to numbers', () => {
    const allTypes: TransitionType[] = [
      'cut',
      'crossfade',
      'dissolve',
      'wipe-left',
      'wipe-right',
      'wipe-up',
      'wipe-down',
    ];

    for (const type of allTypes) {
      expect(typeof TRANSITION_TYPE_CODES[type]).toBe('number');
    }
  });

  it('maps cut to -1', () => {
    expect(TRANSITION_TYPE_CODES['cut']).toBe(-1);
  });

  it('maps crossfade to 0', () => {
    expect(TRANSITION_TYPE_CODES['crossfade']).toBe(0);
  });

  it('maps dissolve to 1', () => {
    expect(TRANSITION_TYPE_CODES['dissolve']).toBe(1);
  });

  it('maps wipe-left to 2', () => {
    expect(TRANSITION_TYPE_CODES['wipe-left']).toBe(2);
  });

  it('maps wipe-right to 3', () => {
    expect(TRANSITION_TYPE_CODES['wipe-right']).toBe(3);
  });

  it('maps wipe-up to 4', () => {
    expect(TRANSITION_TYPE_CODES['wipe-up']).toBe(4);
  });

  it('maps wipe-down to 5', () => {
    expect(TRANSITION_TYPE_CODES['wipe-down']).toBe(5);
  });

  it('has unique code values for non-cut types', () => {
    const codes = Object.values(TRANSITION_TYPE_CODES);
    const uniqueCodes = new Set(codes);
    expect(uniqueCodes.size).toBe(codes.length);
  });
});

describe('DEFAULT_TRANSITION_DURATION', () => {
  it('is a positive integer', () => {
    expect(DEFAULT_TRANSITION_DURATION).toBeGreaterThan(0);
    expect(Number.isInteger(DEFAULT_TRANSITION_DURATION)).toBe(true);
  });

  it('equals 12 frames', () => {
    expect(DEFAULT_TRANSITION_DURATION).toBe(12);
  });
});
