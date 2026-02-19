/**
 * Quad View Comparison Tests (T2.5)
 *
 * Tests for quad view (A/B/C/D) comparison mode in ComparisonManager,
 * CompareControl, and ABCompareManager.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  ComparisonManager,
  DEFAULT_QUAD_VIEW_STATE,
} from './ComparisonManager';
import { CompareControl } from './CompareControl';
import { ABCompareManager } from '../../core/session/ABCompareManager';

// ---------------------------------------------------------------------------
// ComparisonManager — Quad View
// ---------------------------------------------------------------------------

describe('ComparisonManager quad view', () => {
  let manager: ComparisonManager;

  beforeEach(() => {
    manager = new ComparisonManager();
  });

  afterEach(() => {
    manager.dispose();
  });

  it('QUAD-001: setQuadViewEnabled(true) activates quad mode', () => {
    expect(manager.isQuadViewEnabled()).toBe(false);

    manager.setQuadViewEnabled(true);
    expect(manager.isQuadViewEnabled()).toBe(true);

    manager.setQuadViewEnabled(false);
    expect(manager.isQuadViewEnabled()).toBe(false);
  });

  it('QUAD-002: source C and D can be assigned to quadrants', () => {
    const defaultSources = manager.getQuadSources();
    expect(defaultSources).toEqual(['A', 'B', 'C', 'D']);

    manager.setQuadSource(0, 'C');
    manager.setQuadSource(1, 'D');
    manager.setQuadSource(2, 'A');
    manager.setQuadSource(3, 'B');

    expect(manager.getQuadSources()).toEqual(['C', 'D', 'A', 'B']);
  });

  it('QUAD-003: quad view disables wipe mode', () => {
    manager.setWipeMode('horizontal');
    expect(manager.getWipeMode()).toBe('horizontal');

    manager.setQuadViewEnabled(true);
    expect(manager.getWipeMode()).toBe('off');
    expect(manager.isQuadViewEnabled()).toBe(true);
  });

  it('QUAD-004: all 4 viewports share same state via quad view', () => {
    manager.setQuadViewEnabled(true);
    const state = manager.getState();
    expect(state.quadView.enabled).toBe(true);
    expect(state.quadView.sources).toEqual(['A', 'B', 'C', 'D']);
    // All 4 sources use the same wipe position and mode (irrelevant in quad)
    expect(state.wipeMode).toBe('off');
  });

  it('QUAD-005: quad view emits quadViewChanged event', () => {
    const handler = vi.fn();
    manager.on('quadViewChanged', handler);

    manager.setQuadViewEnabled(true);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0]![0].enabled).toBe(true);
    expect(handler.mock.calls[0]![0].sources).toEqual(['A', 'B', 'C', 'D']);
  });

  it('QUAD-006: setQuadViewEnabled does not emit when unchanged', () => {
    const handler = vi.fn();
    manager.on('quadViewChanged', handler);

    manager.setQuadViewEnabled(false); // Already false
    expect(handler).not.toHaveBeenCalled();
  });

  it('QUAD-007: setQuadSource emits quadViewChanged', () => {
    const handler = vi.fn();
    manager.on('quadViewChanged', handler);

    manager.setQuadSource(2, 'D');
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0]![0].sources[2]).toBe('D');
  });

  it('QUAD-008: setQuadSource does not emit when unchanged', () => {
    const handler = vi.fn();
    manager.on('quadViewChanged', handler);

    manager.setQuadSource(0, 'A'); // Already 'A'
    expect(handler).not.toHaveBeenCalled();
  });

  it('QUAD-009: quad view disables blend mode', () => {
    manager.setBlendMode('onionskin');
    expect(manager.getBlendMode()).toBe('onionskin');

    manager.setQuadViewEnabled(true);
    expect(manager.getBlendMode()).toBe('off');
  });

  it('QUAD-010: quad view disables difference matte', () => {
    manager.setDifferenceMatteEnabled(true);
    expect(manager.isDifferenceMatteEnabled()).toBe(true);

    manager.setQuadViewEnabled(true);
    expect(manager.isDifferenceMatteEnabled()).toBe(false);
  });

  it('QUAD-011: enabling wipe mode disables quad view', () => {
    manager.setQuadViewEnabled(true);
    expect(manager.isQuadViewEnabled()).toBe(true);

    manager.setWipeMode('horizontal');
    expect(manager.isQuadViewEnabled()).toBe(false);
    expect(manager.getWipeMode()).toBe('horizontal');
  });

  it('QUAD-012: enabling blend mode disables quad view', () => {
    manager.setQuadViewEnabled(true);
    expect(manager.isQuadViewEnabled()).toBe(true);

    manager.setBlendMode('flicker');
    expect(manager.isQuadViewEnabled()).toBe(false);
    expect(manager.getBlendMode()).toBe('flicker');
  });

  it('QUAD-013: enabling difference matte disables quad view', () => {
    manager.setQuadViewEnabled(true);
    expect(manager.isQuadViewEnabled()).toBe(true);

    manager.setDifferenceMatteEnabled(true);
    expect(manager.isQuadViewEnabled()).toBe(false);
    expect(manager.isDifferenceMatteEnabled()).toBe(true);
  });

  it('QUAD-014: toggle difference matte disables quad view', () => {
    manager.setQuadViewEnabled(true);
    expect(manager.isQuadViewEnabled()).toBe(true);

    manager.toggleDifferenceMatte();
    expect(manager.isQuadViewEnabled()).toBe(false);
    expect(manager.isDifferenceMatteEnabled()).toBe(true);
  });

  it('QUAD-015: quad view is part of isActive()', () => {
    expect(manager.isActive()).toBe(false);

    manager.setQuadViewEnabled(true);
    expect(manager.isActive()).toBe(true);

    manager.setQuadViewEnabled(false);
    expect(manager.isActive()).toBe(false);
  });

  it('QUAD-016: getQuadViewState returns copy', () => {
    const s1 = manager.getQuadViewState();
    const s2 = manager.getQuadViewState();
    expect(s1).toEqual(s2);
    expect(s1).not.toBe(s2);
    expect(s1.sources).not.toBe(s2.sources);
  });

  it('QUAD-017: stateChanged emitted when quad view changes', () => {
    const handler = vi.fn();
    manager.on('stateChanged', handler);

    manager.setQuadViewEnabled(true);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0]![0].quadView.enabled).toBe(true);
  });

  it('QUAD-018: quad view emits wipeModeChanged when wipe was active', () => {
    manager.setWipeMode('vertical');
    const handler = vi.fn();
    manager.on('wipeModeChanged', handler);

    manager.setQuadViewEnabled(true);
    expect(handler).toHaveBeenCalledWith('off');
  });

  it('QUAD-019: quad view emits blendModeChanged when blend was active', () => {
    manager.setBlendMode('blend');
    const handler = vi.fn();
    manager.on('blendModeChanged', handler);

    manager.setQuadViewEnabled(true);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0]![0].mode).toBe('off');
  });

  it('QUAD-020: quad view emits differenceMatteChanged when diff was active', () => {
    manager.setDifferenceMatteEnabled(true);
    const handler = vi.fn();
    manager.on('differenceMatteChanged', handler);

    manager.setQuadViewEnabled(true);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0]![0].enabled).toBe(false);
  });

  it('QUAD-021: default quad view state matches constant', () => {
    const state = manager.getQuadViewState();
    expect(state.enabled).toBe(DEFAULT_QUAD_VIEW_STATE.enabled);
    expect(state.sources).toEqual(DEFAULT_QUAD_VIEW_STATE.sources);
  });

  it('QUAD-022: quad sources can be duplicated', () => {
    manager.setQuadSource(0, 'A');
    manager.setQuadSource(1, 'A');
    manager.setQuadSource(2, 'A');
    manager.setQuadSource(3, 'A');
    expect(manager.getQuadSources()).toEqual(['A', 'A', 'A', 'A']);
  });
});

// ---------------------------------------------------------------------------
// CompareControl — Quad View delegation
// ---------------------------------------------------------------------------

describe('CompareControl quad view', () => {
  let control: CompareControl;

  beforeEach(() => {
    control = new CompareControl();
  });

  afterEach(() => {
    control.dispose();
  });

  it('QUAD-030: CompareControl delegates setQuadViewEnabled', () => {
    control.setQuadViewEnabled(true);
    expect(control.isQuadViewEnabled()).toBe(true);

    control.setQuadViewEnabled(false);
    expect(control.isQuadViewEnabled()).toBe(false);
  });

  it('QUAD-031: CompareControl delegates setQuadViewSource', () => {
    control.setQuadViewSource(1, 'C');
    expect(control.getQuadSources()[1]).toBe('C');
  });

  it('QUAD-032: CompareControl emits quadViewChanged', () => {
    const handler = vi.fn();
    control.on('quadViewChanged', handler);

    control.setQuadViewEnabled(true);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('QUAD-033: toggleQuadView toggles on and off', () => {
    expect(control.isQuadViewEnabled()).toBe(false);

    control.toggleQuadView();
    expect(control.isQuadViewEnabled()).toBe(true);

    control.toggleQuadView();
    expect(control.isQuadViewEnabled()).toBe(false);
  });

  it('QUAD-034: getQuadViewState returns state', () => {
    control.setQuadViewEnabled(true);
    const state = control.getQuadViewState();
    expect(state.enabled).toBe(true);
    expect(state.sources).toEqual(['A', 'B', 'C', 'D']);
  });

  it('QUAD-035: default state includes quadView', () => {
    const state = control.getState();
    expect(state.quadView).toBeDefined();
    expect(state.quadView.enabled).toBe(false);
    expect(state.quadView.sources).toEqual(['A', 'B', 'C', 'D']);
  });
});

// ---------------------------------------------------------------------------
// ABCompareManager — C/D Source Tracking
// ---------------------------------------------------------------------------

describe('ABCompareManager C/D sources', () => {
  let manager: ABCompareManager;

  beforeEach(() => {
    manager = new ABCompareManager();
  });

  it('QUAD-040: C and D sources start unassigned', () => {
    expect(manager.sourceCIndex).toBe(-1);
    expect(manager.sourceDIndex).toBe(-1);
  });

  it('QUAD-041: setSourceC updates index', () => {
    manager.setSourceC(2, 4);
    expect(manager.sourceCIndex).toBe(2);
  });

  it('QUAD-042: setSourceD updates index', () => {
    manager.setSourceD(3, 4);
    expect(manager.sourceDIndex).toBe(3);
  });

  it('QUAD-043: setSourceC rejects out-of-range index', () => {
    manager.setSourceC(5, 3);
    expect(manager.sourceCIndex).toBe(-1);
  });

  it('QUAD-044: setSourceD rejects out-of-range index', () => {
    manager.setSourceD(5, 3);
    expect(manager.sourceDIndex).toBe(-1);
  });

  it('QUAD-045: clearSourceC resets to -1', () => {
    manager.setSourceC(2, 4);
    expect(manager.sourceCIndex).toBe(2);

    manager.clearSourceC();
    expect(manager.sourceCIndex).toBe(-1);
  });

  it('QUAD-046: clearSourceD resets to -1', () => {
    manager.setSourceD(3, 4);
    expect(manager.sourceDIndex).toBe(3);

    manager.clearSourceD();
    expect(manager.sourceDIndex).toBe(-1);
  });

  it('QUAD-047: isQuadAvailable requires all four sources', () => {
    expect(manager.isQuadAvailable(4)).toBe(false);

    manager.onSourceAdded(1);
    manager.onSourceAdded(2); // auto-assigns B=1
    expect(manager.isQuadAvailable(4)).toBe(false);

    manager.setSourceC(2, 4);
    expect(manager.isQuadAvailable(4)).toBe(false);

    manager.setSourceD(3, 4);
    expect(manager.isQuadAvailable(4)).toBe(true);
  });

  it('QUAD-048: getSourceIndex returns correct index for each label', () => {
    manager.onSourceAdded(1);
    manager.onSourceAdded(2);
    manager.setSourceC(2, 4);
    manager.setSourceD(3, 4);

    expect(manager.getSourceIndex('A')).toBe(0);
    expect(manager.getSourceIndex('B')).toBe(1);
    expect(manager.getSourceIndex('C')).toBe(2);
    expect(manager.getSourceIndex('D')).toBe(3);
  });

  it('QUAD-049: setSourceC ignores same index', () => {
    manager.setSourceC(2, 4);
    manager.setSourceC(2, 4); // Same, should be no-op
    expect(manager.sourceCIndex).toBe(2);
  });

  it('QUAD-050: setSourceD ignores same index', () => {
    manager.setSourceD(3, 4);
    manager.setSourceD(3, 4); // Same, should be no-op
    expect(manager.sourceDIndex).toBe(3);
  });

  it('QUAD-051: isQuadAvailable checks source bounds', () => {
    manager.onSourceAdded(1);
    manager.onSourceAdded(2);
    manager.setSourceC(2, 4);
    manager.setSourceD(3, 4);

    // All valid with sourceCount=4
    expect(manager.isQuadAvailable(4)).toBe(true);
    // D is at index 3, invalid with sourceCount=3
    expect(manager.isQuadAvailable(3)).toBe(false);
  });
});
