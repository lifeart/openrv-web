import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NoteOverlay } from './NoteOverlay';
import { Session } from '../../core/session/Session';

describe('NoteOverlay', () => {
  let overlay: NoteOverlay;
  let session: Session;
  let ctx: CanvasRenderingContext2D;

  beforeEach(() => {
    session = new Session();
    (session as any).addSource({
      name: 'test.mp4',
      url: 'blob:test',
      type: 'video',
      duration: 100,
      fps: 24,
      width: 1920,
      height: 1080,
      element: document.createElement('video'),
    });
    (session as any)._inPoint = 1;
    (session as any)._outPoint = 100;
    overlay = new NoteOverlay(session);

    // Create a mock canvas context
    const canvas = document.createElement('canvas');
    canvas.width = 800;
    canvas.height = 80;
    ctx = canvas.getContext('2d')!;
  });

  afterEach(() => {
    overlay.dispose();
  });

  const defaultParams = {
    trackWidth: 680,
    totalFrames: 100,
    paddingLeft: 60,
    currentSourceIndex: 0,
    trackY: 0,
    trackHeight: 42,
  };

  function callUpdate(overrides: Partial<typeof defaultParams> = {}) {
    const p = { ...defaultParams, ...overrides };
    overlay.update(ctx, p.trackWidth, p.totalFrames, p.paddingLeft, p.currentSourceIndex, p.trackY, p.trackHeight);
  }

  it('draws nothing when no notes exist', () => {
    const fillRectSpy = vi.spyOn(ctx, 'fillRect');
    callUpdate();
    // Only canvas clear calls may have happened, not note bars
    expect(fillRectSpy).not.toHaveBeenCalled();
  });

  it('draws bar for a single note at frame 1 (left boundary)', () => {
    session.noteManager.addNote(0, 1, 1, 'Start note', 'Alice');
    const fillRectSpy = vi.spyOn(ctx, 'fillRect');
    callUpdate();
    expect(fillRectSpy).toHaveBeenCalled();
    // The bar should start at paddingLeft + 0
    const firstCall = fillRectSpy.mock.calls[0]!;
    expect(firstCall[0]).toBeCloseTo(60, 0); // x = paddingLeft
  });

  it('draws bar for a single note at last frame (right boundary)', () => {
    session.noteManager.addNote(0, 100, 100, 'End note', 'Alice');
    const fillRectSpy = vi.spyOn(ctx, 'fillRect');
    callUpdate();
    expect(fillRectSpy).toHaveBeenCalled();
    const firstCall = fillRectSpy.mock.calls[0]!;
    // x should be near paddingLeft + trackWidth
    expect(firstCall[0]).toBeCloseTo(60 + 680, 0);
  });

  it('draws bar spanning a range', () => {
    session.noteManager.addNote(0, 1, 100, 'Full range', 'Alice');
    const fillRectSpy = vi.spyOn(ctx, 'fillRect');
    callUpdate();
    expect(fillRectSpy).toHaveBeenCalledTimes(1);
    const call = fillRectSpy.mock.calls[0]!;
    // Width should cover entire track
    expect(call[2]).toBeCloseTo(680, 0);
  });

  it('draws multiple overlapping notes', () => {
    session.noteManager.addNote(0, 10, 30, 'First', 'Alice');
    session.noteManager.addNote(0, 20, 50, 'Second', 'Bob');
    const fillRectSpy = vi.spyOn(ctx, 'fillRect');
    callUpdate();
    expect(fillRectSpy).toHaveBeenCalledTimes(2);
  });

  it('uses correct color for open notes (amber)', () => {
    session.noteManager.addNote(0, 10, 10, 'Open', 'Alice');
    callUpdate();
    // fillStyle should be set to amber
    expect(ctx.fillStyle).toBe('#fbbf24');
  });

  it('uses correct color for resolved notes (green)', () => {
    const note = session.noteManager.addNote(0, 10, 10, 'Resolved', 'Alice');
    session.noteManager.resolveNote(note.id);
    callUpdate();
    expect(ctx.fillStyle).toBe('#22c55e');
  });

  it('uses correct color for wontfix notes (gray)', () => {
    const note = session.noteManager.addNote(0, 10, 10, 'Wontfix', 'Alice');
    session.noteManager.updateNote(note.id, { status: 'wontfix' });
    callUpdate();
    expect(ctx.fillStyle).toBe('#6b7280');
  });

  it('filters by sourceIndex: notes from other source not drawn', () => {
    session.noteManager.addNote(1, 10, 10, 'Other source', 'Alice');
    const fillRectSpy = vi.spyOn(ctx, 'fillRect');
    callUpdate({ currentSourceIndex: 0 });
    expect(fillRectSpy).not.toHaveBeenCalled();
  });

  it('restores globalAlpha after drawing', () => {
    session.noteManager.addNote(0, 10, 10, 'Test', 'Alice');
    ctx.globalAlpha = 0.5;
    callUpdate();
    expect(ctx.globalAlpha).toBe(0.5);
  });

  it('ignores reply notes (parentId !== null)', () => {
    const parent = session.noteManager.addNote(0, 10, 10, 'Parent', 'Alice');
    session.noteManager.addNote(0, 10, 10, 'Reply', 'Bob', { parentId: parent.id });
    const fillRectSpy = vi.spyOn(ctx, 'fillRect');
    callUpdate();
    // Only the parent should be drawn
    expect(fillRectSpy).toHaveBeenCalledTimes(1);
  });

  it('setRedrawCallback triggers on notesChanged', () => {
    const cb = vi.fn();
    overlay.setRedrawCallback(cb);
    session.noteManager.addNote(0, 10, 10, 'Trigger', 'Alice');
    expect(cb).toHaveBeenCalled();
  });

  it('dispose cleans up event subscription', () => {
    const cb = vi.fn();
    overlay.setRedrawCallback(cb);
    overlay.dispose();
    cb.mockClear();
    session.noteManager.addNote(0, 10, 10, 'After dispose', 'Alice');
    expect(cb).not.toHaveBeenCalled();
  });

  it('dispose is safe to call twice', () => {
    overlay.dispose();
    expect(() => overlay.dispose()).not.toThrow();
  });
});
