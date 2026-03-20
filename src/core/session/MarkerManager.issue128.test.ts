/**
 * Regression tests for issue #128: Marker notes and colors survive GTO import
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { MarkerManager, MARKER_COLORS } from './MarkerManager';

describe('Issue #128: setFromFrameNumbers preserves notes and colors', () => {
  let manager: MarkerManager;

  beforeEach(() => {
    manager = new MarkerManager();
  });

  it('ISS-128-001: setFromFrameNumbers with notes and colors sets them', () => {
    const frames = [10, 20, 30];
    const notes = ['First note', 'Second note', 'Third note'];
    const colors = ['#ff0000', '#00ff00', '#0000ff'];

    manager.setFromFrameNumbers(frames, notes, colors);

    expect(manager.marks.size).toBe(3);
    expect(manager.getMarker(10)?.note).toBe('First note');
    expect(manager.getMarker(10)?.color).toBe('#ff0000');
    expect(manager.getMarker(20)?.note).toBe('Second note');
    expect(manager.getMarker(20)?.color).toBe('#00ff00');
    expect(manager.getMarker(30)?.note).toBe('Third note');
    expect(manager.getMarker(30)?.color).toBe('#0000ff');
  });

  it('ISS-128-002: setFromFrameNumbers without notes/colors uses defaults', () => {
    const frames = [10, 20];

    manager.setFromFrameNumbers(frames);

    expect(manager.marks.size).toBe(2);
    expect(manager.getMarker(10)?.note).toBe('');
    expect(manager.getMarker(10)?.color).toBe(MARKER_COLORS[0]);
    expect(manager.getMarker(20)?.note).toBe('');
    expect(manager.getMarker(20)?.color).toBe(MARKER_COLORS[0]);
  });

  it('ISS-128-003: setFromFrameNumbers with partial notes fills remainder with defaults', () => {
    const frames = [10, 20, 30];
    const notes = ['Only first'];
    // No colors

    manager.setFromFrameNumbers(frames, notes);

    expect(manager.getMarker(10)?.note).toBe('Only first');
    expect(manager.getMarker(20)?.note).toBe('');
    expect(manager.getMarker(30)?.note).toBe('');
  });

  it('ISS-128-004: setFromFrameNumbers with partial colors fills remainder with defaults', () => {
    const frames = [10, 20, 30];
    const colors = ['#ff0000'];

    manager.setFromFrameNumbers(frames, undefined, colors);

    expect(manager.getMarker(10)?.color).toBe('#ff0000');
    expect(manager.getMarker(20)?.color).toBe(MARKER_COLORS[0]);
    expect(manager.getMarker(30)?.color).toBe(MARKER_COLORS[0]);
  });

  it('ISS-128-005: setFromFrameNumbers with empty frames clears all markers', () => {
    // Pre-populate
    manager.setFromFrameNumbers([1, 2, 3]);
    expect(manager.marks.size).toBe(3);

    // Clear
    manager.setFromFrameNumbers([]);
    expect(manager.marks.size).toBe(0);
  });
});
