/**
 * Timeline Unit Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Timeline } from './Timeline';
import { Session } from '../../core/session/Session';
import { PaintEngine } from '../../paint/PaintEngine';

// Mock WaveformRenderer
vi.mock('../../audio/WaveformRenderer', () => ({
  WaveformRenderer: vi.fn().mockImplementation(() => ({
    loadFromVideo: vi.fn().mockResolvedValue(false),
    clear: vi.fn(),
    hasData: vi.fn().mockReturnValue(false),
    getData: vi.fn().mockReturnValue(null),
    render: vi.fn(),
  })),
}));

describe('Timeline', () => {
  let session: Session;
  let paintEngine: PaintEngine;
  let timeline: Timeline;

  beforeEach(() => {
    session = new Session();
    paintEngine = new PaintEngine();
    timeline = new Timeline(session, paintEngine);
  });

  afterEach(() => {
    timeline.dispose();
  });

  describe('initialization', () => {
    it('TML-001: timeline renders without errors', () => {
      expect(() => {
        timeline.render();
      }).not.toThrow();
    });

    it('TML-002: creates container element', () => {
      const container = timeline.render();
      expect(container).toBeInstanceOf(HTMLElement);
      expect(container.className).toBe('timeline-container');
    });

    it('TML-003: creates canvas element', () => {
      const container = timeline.render();
      const canvas = container.querySelector('canvas');
      expect(canvas).toBeInstanceOf(HTMLCanvasElement);
    });
  });

  describe('render', () => {
    it('TML-004: render returns HTMLElement', () => {
      const element = timeline.render();
      expect(element).toBeInstanceOf(HTMLElement);
    });

    it('TML-005: render returns same container on multiple calls', () => {
      const element1 = timeline.render();
      const element2 = timeline.render();
      expect(element1).toBe(element2);
    });
  });

  describe('session events', () => {
    it('TML-006: responds to frameChanged event', () => {
      timeline.render();
      expect(() => {
        session.currentFrame = 10;
      }).not.toThrow();
    });

    it('TML-007: responds to playbackChanged event', () => {
      timeline.render();
      expect(() => {
        session.play();
        session.pause();
      }).not.toThrow();
    });

    it('TML-008: responds to durationChanged event', () => {
      timeline.render();
      expect(() => {
        session.emit('durationChanged', 100);
      }).not.toThrow();
    });

    it('TML-009: responds to inOutChanged event', () => {
      timeline.render();
      expect(() => {
        session.setInPoint(5);
        session.setOutPoint(50);
      }).not.toThrow();
    });

    it('TML-010: responds to marksChanged event', () => {
      timeline.render();
      expect(() => {
        session.toggleMark(10); // Add mark
        session.toggleMark(10); // Remove mark
      }).not.toThrow();
    });
  });

  describe('setPaintEngine', () => {
    it('TML-011: accepts paint engine', () => {
      const newTimeline = new Timeline(session);
      expect(() => {
        newTimeline.setPaintEngine(paintEngine);
      }).not.toThrow();
      newTimeline.dispose();
    });

    it('TML-012: triggers redraw after setting paint engine', () => {
      const newTimeline = new Timeline(session);
      newTimeline.render();
      expect(() => {
        newTimeline.setPaintEngine(paintEngine);
      }).not.toThrow();
      newTimeline.dispose();
    });
  });

  describe('refresh', () => {
    it('TML-013: refresh does not throw', () => {
      timeline.render();
      expect(() => {
        timeline.refresh();
      }).not.toThrow();
    });
  });

  describe('dispose', () => {
    it('TML-014: dispose does not throw', () => {
      timeline.render();
      expect(() => {
        timeline.dispose();
      }).not.toThrow();
    });

    it('TML-015: dispose removes event listeners', () => {
      timeline.render();
      timeline.dispose();
      // Should not throw when session emits events after dispose
      expect(() => {
        session.currentFrame = 5;
      }).not.toThrow();
    });
  });

  describe('paint engine integration', () => {
    it('TML-016: responds to annotationsChanged event', () => {
      timeline.render();
      expect(() => {
        paintEngine.emit('annotationsChanged');
      }).not.toThrow();
    });

    it('TML-017: responds to strokeAdded event', () => {
      timeline.render();
      expect(() => {
        paintEngine.emit('strokeAdded', null);
      }).not.toThrow();
    });

    it('TML-018: responds to strokeRemoved event', () => {
      timeline.render();
      expect(() => {
        paintEngine.emit('strokeRemoved', 'test-id');
      }).not.toThrow();
    });
  });

  describe('container styling', () => {
    it('TML-019: container has correct height', () => {
      const container = timeline.render();
      expect(container.style.height).toBe('80px');
    });

    it('TML-020: container prevents text selection', () => {
      const container = timeline.render();
      expect(container.style.userSelect).toBe('none');
    });
  });
});
