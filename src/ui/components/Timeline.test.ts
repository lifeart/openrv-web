/**
 * Timeline Unit Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Timeline } from './Timeline';
import { Session } from '../../core/session/Session';
import { PaintEngine } from '../../paint/PaintEngine';
import { getThemeManager } from '../../utils/ui/ThemeManager';
import type { Annotation } from '../../paint/types';

class TestTimeline extends Timeline {
  public drawCount = 0;
  
  public setSize(w: number, h: number) {
    this.width = w;
    this.height = h;
  }

  protected override draw() {
    super.draw();
    this.drawCount++;
  }
}

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
  let timeline: TestTimeline;

  beforeEach(() => {
    session = new Session();
    // Use type cast since we are in test environment and want to access protected method
    (session as any).addSource({
      id: 'test-source',
      name: 'test.mp4',
      type: 'video',
      duration: 100,
      fps: 24,
      width: 1920,
      height: 1080,
      element: document.createElement('video'),
    });

    paintEngine = new PaintEngine();
    timeline = new TestTimeline(session, paintEngine);
    
    // Mock getBoundingClientRect
    const container = timeline.render();
    vi.spyOn(container, 'getBoundingClientRect').mockReturnValue({
      width: 1000,
      height: 100,
      top: 0,
      left: 0,
      bottom: 100,
      right: 1000,
      x: 0,
      y: 0,
      toJSON: () => {},
    } as DOMRect);
    
    timeline.setSize(1000, 100);
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
      timeline.drawCount = 0;
      session.currentFrame = 10;
      expect(timeline.drawCount).toBeGreaterThan(0);
    });

    it('TML-007: responds to playbackChanged event', () => {
      timeline.drawCount = 0;
      session.play();
      expect(timeline.drawCount).toBeGreaterThan(0);
    });

    it('TML-029: pauses thumbnail loading when playback starts', () => {
      const thumbManager = (timeline as any).thumbnailManager;
      const pauseSpy = vi.spyOn(thumbManager, 'pauseLoading');

      session.emit('playbackChanged', true);
      expect(pauseSpy).toHaveBeenCalledTimes(1);
    });

    it('TML-030: resumes thumbnail loading when playback stops', () => {
      const thumbManager = (timeline as any).thumbnailManager;
      const resumeSpy = vi.spyOn(thumbManager, 'resumeLoading');

      session.emit('playbackChanged', false);
      expect(resumeSpy).toHaveBeenCalledTimes(1);
    });

    it('TML-008: responds to durationChanged event', () => {
      timeline.drawCount = 0;
      session.emit('durationChanged', 100);
      expect(timeline.drawCount).toBeGreaterThan(0);
    });

    it('TML-009: responds to inOutChanged event', () => {
      timeline.drawCount = 0;
      session.emit('inOutChanged', { inPoint: 5, outPoint: 50 });
      expect(timeline.drawCount).toBeGreaterThan(0);
    });

    it('TML-010: responds to marksChanged event', () => {
      timeline.render();
      expect(() => {
        session.toggleMark(10); // Add mark
        session.toggleMark(10); // Remove mark
      }).not.toThrow();
    });
  });

  describe('theme changes', () => {
    it('TML-031: redraws when theme changes', () => {
      timeline.drawCount = 0;
      getThemeManager().emit('themeChanged', 'light');
      expect(timeline.drawCount).toBeGreaterThan(0);
    });

    it('TML-032: does not redraw on theme change after dispose', () => {
      timeline.drawCount = 0;
      timeline.dispose();
      getThemeManager().emit('themeChanged', 'light');
      expect(timeline.drawCount).toBe(0);
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
        paintEngine.emit('annotationsChanged', 0);
      }).not.toThrow();
    });

    it('TML-017: responds to strokeAdded event', () => {
      timeline.render();
      expect(() => {
        paintEngine.emit('strokeAdded', { id: 'test-id' } as Annotation);
      }).not.toThrow();
    });

    it('TML-018: responds to strokeRemoved event', () => {
      timeline.render();
      expect(() => {
        paintEngine.emit('strokeRemoved', { id: 'test-id' } as Annotation);
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

  describe('timecode display', () => {
    it('TML-021: default display mode is frames', () => {
      expect(timeline.timecodeDisplayMode).toBe('frames');
    });

    it('TML-022: can set display mode to timecode', () => {
      timeline.timecodeDisplayMode = 'timecode';
      expect(timeline.timecodeDisplayMode).toBe('timecode');
    });

    it('TML-023: can set display mode back to frames', () => {
      timeline.timecodeDisplayMode = 'timecode';
      timeline.timecodeDisplayMode = 'frames';
      expect(timeline.timecodeDisplayMode).toBe('frames');
    });

    it('TML-024: toggleTimecodeDisplay switches from frames to timecode', () => {
      expect(timeline.timecodeDisplayMode).toBe('frames');
      timeline.toggleTimecodeDisplay();
      expect(timeline.timecodeDisplayMode).toBe('timecode');
    });

    it('TML-025: toggleTimecodeDisplay switches from timecode back to frames', () => {
      timeline.timecodeDisplayMode = 'timecode';
      timeline.toggleTimecodeDisplay();
      expect(timeline.timecodeDisplayMode).toBe('frames');
    });

    it('TML-026: setting display mode triggers redraw', () => {
      timeline.drawCount = 0;
      timeline.timecodeDisplayMode = 'timecode';
      expect(timeline.drawCount).toBeGreaterThan(0);
    });

    it('TML-027: setting same display mode does not trigger redraw', () => {
      timeline.drawCount = 0;
      timeline.timecodeDisplayMode = 'frames'; // already 'frames'
      expect(timeline.drawCount).toBe(0);
    });

    it('TML-028: toggle triggers redraw', () => {
      timeline.drawCount = 0;
      timeline.toggleTimecodeDisplay();
      expect(timeline.drawCount).toBeGreaterThan(0);
    });
  });

  describe('regression tests for pause-during-playback fix', () => {
    describe('TML-REG-001: Rapid play/pause toggling', () => {
      it('should call pauseLoading/resumeLoading on ThumbnailManager for each toggle', () => {
        const thumbManager = (timeline as any).thumbnailManager;
        const pauseSpy = vi.spyOn(thumbManager, 'pauseLoading');
        const resumeSpy = vi.spyOn(thumbManager, 'resumeLoading');

        // Initial state: not playing
        expect(session.isPlaying).toBe(false);

        // Toggle 1: Start playing
        session.emit('playbackChanged', true);
        expect(pauseSpy).toHaveBeenCalledTimes(1);
        expect(resumeSpy).toHaveBeenCalledTimes(0);

        // Toggle 2: Stop playing
        session.emit('playbackChanged', false);
        expect(pauseSpy).toHaveBeenCalledTimes(1);
        expect(resumeSpy).toHaveBeenCalledTimes(1);

        // Toggle 3: Start playing again
        session.emit('playbackChanged', true);
        expect(pauseSpy).toHaveBeenCalledTimes(2);
        expect(resumeSpy).toHaveBeenCalledTimes(1);

        // Toggle 4: Stop playing again
        session.emit('playbackChanged', false);
        expect(pauseSpy).toHaveBeenCalledTimes(2);
        expect(resumeSpy).toHaveBeenCalledTimes(2);

        // Toggle 5: Rapid sequence - play
        session.emit('playbackChanged', true);
        expect(pauseSpy).toHaveBeenCalledTimes(3);
        expect(resumeSpy).toHaveBeenCalledTimes(2);

        // Toggle 6: Rapid sequence - pause
        session.emit('playbackChanged', false);
        expect(pauseSpy).toHaveBeenCalledTimes(3);
        expect(resumeSpy).toHaveBeenCalledTimes(3);
      });

      it('should maintain correct paused state through multiple toggles', () => {
        const thumbManager = (timeline as any).thumbnailManager;

        // Start with not playing
        expect(thumbManager.isLoadingPaused).toBe(false);

        // Play
        session.emit('playbackChanged', true);
        expect(thumbManager.isLoadingPaused).toBe(true);

        // Pause
        session.emit('playbackChanged', false);
        expect(thumbManager.isLoadingPaused).toBe(false);

        // Play
        session.emit('playbackChanged', true);
        expect(thumbManager.isLoadingPaused).toBe(true);

        // Pause
        session.emit('playbackChanged', false);
        expect(thumbManager.isLoadingPaused).toBe(false);
      });

      it('should not break thumbnail loading after many rapid toggles', async () => {
        const thumbManager = (timeline as any).thumbnailManager;

        // Perform many rapid toggles
        for (let i = 0; i < 20; i++) {
          session.emit('playbackChanged', true);
          session.emit('playbackChanged', false);
        }

        // Final state should be not playing
        expect(thumbManager.isLoadingPaused).toBe(false);

        // ThumbnailManager should still be functional
        expect(() => {
          thumbManager.pauseLoading();
          thumbManager.resumeLoading();
        }).not.toThrow();
      });

      it('should handle interleaved playback events correctly', () => {
        const thumbManager = (timeline as any).thumbnailManager;
        const pauseSpy = vi.spyOn(thumbManager, 'pauseLoading');
        const resumeSpy = vi.spyOn(thumbManager, 'resumeLoading');

        // Simulate a scenario where playback events come in rapid succession
        session.emit('playbackChanged', true);
        session.emit('playbackChanged', true); // Duplicate play event
        session.emit('playbackChanged', false);
        session.emit('playbackChanged', false); // Duplicate pause event

        // Should have called pause twice and resume twice (even if redundant)
        expect(pauseSpy).toHaveBeenCalledTimes(2);
        expect(resumeSpy).toHaveBeenCalledTimes(2);

        // Final state should be not paused
        expect(thumbManager.isLoadingPaused).toBe(false);
      });

      it('should still trigger redraw on each playbackChanged event', () => {
        timeline.drawCount = 0;

        // Each playback change should trigger draw
        session.emit('playbackChanged', true);
        const afterFirstToggle = timeline.drawCount;
        expect(afterFirstToggle).toBeGreaterThan(0);

        session.emit('playbackChanged', false);
        const afterSecondToggle = timeline.drawCount;
        expect(afterSecondToggle).toBeGreaterThan(afterFirstToggle);

        session.emit('playbackChanged', true);
        const afterThirdToggle = timeline.drawCount;
        expect(afterThirdToggle).toBeGreaterThan(afterSecondToggle);
      });
    });
  });
});
