/**
 * RepresentationSelector Unit Tests
 *
 * Verifies the UI control that allows switching between media representations:
 * - Appears when source has multiple representations
 * - Hidden when single or no representations
 * - Switching representations updates the viewer
 * - Updates on source change / representation change events
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import { EventEmitter } from '../../utils/EventEmitter';
import { RepresentationSelector } from './RepresentationSelector';
import type { MediaRepresentation } from '../../core/types/representation';

// --- Mock helpers ---

function createMockRepresentation(overrides: Partial<MediaRepresentation> = {}): MediaRepresentation {
  return {
    id: overrides.id ?? `rep-${Math.random().toString(36).slice(2, 8)}`,
    label: overrides.label ?? 'Test Rep',
    kind: overrides.kind ?? 'frames',
    priority: overrides.priority ?? 0,
    status: overrides.status ?? 'ready',
    resolution: overrides.resolution ?? { width: 1920, height: 1080 },
    par: overrides.par ?? 1.0,
    sourceNode: overrides.sourceNode ?? null,
    loaderConfig: overrides.loaderConfig ?? {},
    audioTrackPresent: overrides.audioTrackPresent ?? false,
    startFrame: overrides.startFrame ?? 0,
    colorSpace: overrides.colorSpace,
    ...(overrides.errorInfo !== undefined ? { errorInfo: overrides.errorInfo } : {}),
  };
}

function createMockSession(representations?: MediaRepresentation[], activeIndex?: number) {
  const session = new EventEmitter() as any;
  session._currentSourceIndex = 0;
  session._sources = [];

  const source: any = {
    type: 'video',
    name: 'test.mp4',
    url: 'blob:test',
    width: 1920,
    height: 1080,
    duration: 100,
    fps: 24,
    representations: representations ?? [],
    activeRepresentationIndex: activeIndex ?? -1,
  };
  session._sources.push(source);

  Object.defineProperty(session, 'currentSource', {
    get: () => session._sources[session._currentSourceIndex] ?? null,
  });
  Object.defineProperty(session, 'currentSourceIndex', {
    get: () => session._currentSourceIndex,
  });

  session.getActiveRepresentation = vi.fn((sourceIndex: number) => {
    const src = session._sources[sourceIndex];
    if (!src?.representations || src.activeRepresentationIndex < 0) return null;
    return src.representations[src.activeRepresentationIndex] ?? null;
  });
  session.switchRepresentation = vi.fn(async () => true);
  session.getSourceByIndex = vi.fn((i: number) => session._sources[i] ?? null);

  return session;
}

describe('RepresentationSelector', () => {
  let selector: RepresentationSelector;
  let session: any;

  afterEach(() => {
    if (selector) {
      selector.dispose();
    }
    document.body.innerHTML = '';
  });

  describe('visibility', () => {
    it('REP-UI-001: hidden when source has no representations', () => {
      session = createMockSession([]);
      selector = new RepresentationSelector(session);
      const el = selector.render();
      expect(el.style.display).toBe('none');
      expect(selector.isVisible()).toBe(false);
    });

    it('REP-UI-002: hidden when source has single representation', () => {
      const rep = createMockRepresentation({ id: 'r1', label: 'Full' });
      session = createMockSession([rep], 0);
      selector = new RepresentationSelector(session);
      const el = selector.render();
      expect(el.style.display).toBe('none');
      expect(selector.isVisible()).toBe(false);
    });

    it('REP-UI-003: visible when source has multiple representations', () => {
      const reps = [
        createMockRepresentation({ id: 'r1', label: 'Full EXR', kind: 'frames' }),
        createMockRepresentation({ id: 'r2', label: 'Proxy MOV', kind: 'proxy' }),
      ];
      session = createMockSession(reps, 0);
      selector = new RepresentationSelector(session);
      const el = selector.render();
      expect(el.style.display).toBe('flex');
      expect(selector.isVisible()).toBe(true);
    });

    it('REP-UI-004: hidden when no source is loaded', () => {
      session = createMockSession();
      session._sources = [];
      selector = new RepresentationSelector(session);
      const el = selector.render();
      expect(el.style.display).toBe('none');
    });
  });

  describe('button text', () => {
    it('REP-UI-005: shows active representation label', () => {
      const reps = [
        createMockRepresentation({ id: 'r1', label: 'Full EXR (4096x2160)' }),
        createMockRepresentation({ id: 'r2', label: 'Proxy MOV (1920x1080)' }),
      ];
      session = createMockSession(reps, 0);
      selector = new RepresentationSelector(session);
      const el = selector.render();
      document.body.appendChild(el);

      const textSpan = el.querySelector('.rep-button-text');
      expect(textSpan?.textContent).toBe('Full EXR (4096x2160)');
    });

    it('REP-UI-006: shows "Select..." when no active representation', () => {
      const reps = [
        createMockRepresentation({ id: 'r1', label: 'Full EXR' }),
        createMockRepresentation({ id: 'r2', label: 'Proxy MOV' }),
      ];
      session = createMockSession(reps, -1);
      session.getActiveRepresentation = vi.fn(() => null);
      selector = new RepresentationSelector(session);
      const el = selector.render();
      document.body.appendChild(el);

      const textSpan = el.querySelector('.rep-button-text');
      expect(textSpan?.textContent).toBe('Select...');
    });
  });

  describe('updates on events', () => {
    it('REP-UI-007: updates when sourceLoaded fires', () => {
      session = createMockSession([]);
      selector = new RepresentationSelector(session);
      const el = selector.render();
      expect(el.style.display).toBe('none');

      // Add representations and fire event
      const reps = [
        createMockRepresentation({ id: 'r1', label: 'Full' }),
        createMockRepresentation({ id: 'r2', label: 'Proxy' }),
      ];
      session._sources[0].representations = reps;
      session._sources[0].activeRepresentationIndex = 0;
      session.emit('sourceLoaded', session._sources[0]);

      expect(el.style.display).toBe('flex');
    });

    it('REP-UI-008: updates when representationChanged fires', () => {
      const reps = [
        createMockRepresentation({ id: 'r1', label: 'Full EXR' }),
        createMockRepresentation({ id: 'r2', label: 'Proxy MOV' }),
      ];
      session = createMockSession(reps, 0);
      selector = new RepresentationSelector(session);
      const el = selector.render();
      document.body.appendChild(el);

      // Switch active rep
      session._sources[0].activeRepresentationIndex = 1;
      session.getActiveRepresentation = vi.fn(() => reps[1]);
      session.emit('representationChanged', {
        sourceIndex: 0,
        previousRepId: 'r1',
        newRepId: 'r2',
        representation: reps[1],
      });

      const textSpan = el.querySelector('.rep-button-text');
      expect(textSpan?.textContent).toBe('Proxy MOV');
    });

    it('REP-UI-009: updates on representationError', () => {
      const reps = [
        createMockRepresentation({ id: 'r1', label: 'Full EXR', status: 'ready' }),
        createMockRepresentation({ id: 'r2', label: 'Proxy MOV', status: 'error' }),
      ];
      session = createMockSession(reps, 0);
      selector = new RepresentationSelector(session);
      selector.render();

      // Fire error event — selector should update without crashing
      session.emit('representationError', {
        sourceIndex: 0,
        repId: 'r2',
        error: 'Load failed',
        userInitiated: true,
      });

      // Should still be visible since we have 2 reps
      expect(selector.isVisible()).toBe(true);
    });

    it('REP-UI-010: updates on fallbackActivated', () => {
      const reps = [
        createMockRepresentation({ id: 'r1', label: 'Full EXR', status: 'error' }),
        createMockRepresentation({ id: 'r2', label: 'Proxy MOV', status: 'ready' }),
      ];
      session = createMockSession(reps, 1);
      session.getActiveRepresentation = vi.fn(() => reps[1]);
      selector = new RepresentationSelector(session);
      const el = selector.render();
      document.body.appendChild(el);

      session.emit('fallbackActivated', {
        sourceIndex: 0,
        failedRepId: 'r1',
        fallbackRepId: 'r2',
        fallbackRepresentation: reps[1],
      });

      const textSpan = el.querySelector('.rep-button-text');
      expect(textSpan?.textContent).toBe('Proxy MOV');
    });

    it('REP-UI-011: updates on durationChanged (source switch)', () => {
      session = createMockSession([]);
      selector = new RepresentationSelector(session);
      selector.render();

      expect(selector.isVisible()).toBe(false);

      // Simulate source switch with representations
      const reps = [
        createMockRepresentation({ id: 'r1', label: 'Full' }),
        createMockRepresentation({ id: 'r2', label: 'Proxy' }),
      ];
      session._sources[0].representations = reps;
      session._sources[0].activeRepresentationIndex = 0;
      session.emit('durationChanged', 200);

      expect(selector.isVisible()).toBe(true);
    });
  });

  describe('selection', () => {
    it('REP-UI-012: emits representationSelected when user selects', () => {
      const reps = [
        createMockRepresentation({ id: 'r1', label: 'Full EXR' }),
        createMockRepresentation({ id: 'r2', label: 'Proxy MOV' }),
      ];
      session = createMockSession(reps, 0);
      selector = new RepresentationSelector(session);

      const selectedSpy = vi.fn();
      selector.on('representationSelected', selectedSpy);

      // Simulate internal selection via the handleSelect path
      // Access the private handler through the event callback approach
      // The DropdownMenu onSelect callback triggers handleSelect
      // We need to trigger via the dropdown's onSelect, which calls handleSelect internally
      // For unit test, we can call update() and verify the interaction pattern

      // Direct test: verify that switchRepresentation is called when dropdown selects
      selector.render();
      // Manually trigger the selection callback
      (selector as any).handleSelect('r2');

      expect(selectedSpy).toHaveBeenCalledWith({ sourceIndex: 0, repId: 'r2' });
      expect(session.switchRepresentation).toHaveBeenCalledWith(0, 'r2', { userInitiated: true });
    });
  });

  describe('getRepresentations', () => {
    it('REP-UI-013: returns empty array when no representations', () => {
      session = createMockSession([]);
      selector = new RepresentationSelector(session);
      expect(selector.getRepresentations()).toEqual([]);
    });

    it('REP-UI-014: returns representations from current source', () => {
      const reps = [
        createMockRepresentation({ id: 'r1' }),
        createMockRepresentation({ id: 'r2' }),
      ];
      session = createMockSession(reps, 0);
      selector = new RepresentationSelector(session);
      expect(selector.getRepresentations()).toHaveLength(2);
    });
  });

  describe('data-testid', () => {
    it('REP-UI-015: renders with correct test IDs', () => {
      const reps = [
        createMockRepresentation({ id: 'r1' }),
        createMockRepresentation({ id: 'r2' }),
      ];
      session = createMockSession(reps, 0);
      selector = new RepresentationSelector(session);
      const el = selector.render();

      expect(el.dataset.testid).toBe('representation-selector');
      const button = el.querySelector('[data-testid="representation-selector-button"]');
      expect(button).not.toBeNull();
    });
  });

  describe('dispose', () => {
    it('REP-UI-016: disposes cleanly without errors', () => {
      const reps = [
        createMockRepresentation({ id: 'r1' }),
        createMockRepresentation({ id: 'r2' }),
      ];
      session = createMockSession(reps, 0);
      selector = new RepresentationSelector(session);
      selector.render();

      expect(() => selector.dispose()).not.toThrow();

      // After dispose, update should be a no-op
      selector.update();
    });
  });
});
