/**
 * HeaderBar Component Tests
 *
 * Tests for the header bar with file operations, playback controls, and utilities.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { HeaderBar } from './HeaderBar';
import { Session, PLAYBACK_SPEED_PRESETS } from '../../../core/session/Session';

describe('HeaderBar', () => {
  let headerBar: HeaderBar;
  let session: Session;

  beforeEach(() => {
    session = new Session();
    // Add a test source to enable playback
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
    // Set in/out points to match duration
    (session as any)._inPoint = 1;
    (session as any)._outPoint = 100;
    headerBar = new HeaderBar(session);
  });

  afterEach(() => {
    headerBar.dispose();
  });

  describe('initialization', () => {
    it('HDR-U001: creates HeaderBar instance', () => {
      expect(headerBar).toBeInstanceOf(HeaderBar);
    });
  });

  describe('render', () => {
    it('HDR-U010: render returns container element with header-bar class', () => {
      const el = headerBar.render();
      expect(el).toBeInstanceOf(HTMLElement);
      expect(el.className).toBe('header-bar');
    });

    it('HDR-U011: render returns same element on multiple calls', () => {
      const el1 = headerBar.render();
      const el2 = headerBar.render();
      expect(el1).toBe(el2);
    });

    it('HDR-U012: rendered element contains all control groups', () => {
      const el = headerBar.render();
      // Should have file inputs, playback buttons, timecode, and utility controls
      expect(el.querySelectorAll('input[type="file"]').length).toBe(2);
      expect(el.querySelectorAll('button').length).toBeGreaterThan(10);
    });
  });

  describe('file operations', () => {
    it('HDR-U020: has file input element', () => {
      const el = headerBar.render();
      const input = el.querySelector('input[type="file"]');
      expect(input).not.toBeNull();
    });

    it('HDR-U021: file input accepts images, videos, and session files', () => {
      const el = headerBar.render();
      const input = el.querySelector('input[type="file"]') as HTMLInputElement;
      expect(input.accept).toContain('image/*');
      expect(input.accept).toContain('video/*');
      expect(input.accept).toContain('.rv');
      expect(input.accept).toContain('.gto');
    });

    it('HDR-U022: file input allows multiple selection', () => {
      const el = headerBar.render();
      const input = el.querySelector('input[type="file"]') as HTMLInputElement;
      expect(input.multiple).toBe(true);
    });

    it('HDR-U023: has project file input', () => {
      const el = headerBar.render();
      const inputs = el.querySelectorAll('input[type="file"]');
      // Should have both media and project inputs
      expect(inputs.length).toBe(2);
    });

    it('HDR-U024: project file input accepts .orvproject files', () => {
      const el = headerBar.render();
      const inputs = el.querySelectorAll('input[type="file"]');
      const projectInput = Array.from(inputs).find(
        (input) => (input as HTMLInputElement).accept === '.orvproject'
      ) as HTMLInputElement;
      expect(projectInput).not.toBeNull();
      expect(projectInput.accept).toBe('.orvproject');
    });
  });

  describe('playback controls', () => {
    it('HDR-U030: has play button', () => {
      const el = headerBar.render();
      const buttons = el.querySelectorAll('button');
      const playBtn = Array.from(buttons).find(
        (btn) => btn.title?.includes('Play') || btn.title?.includes('Pause')
      );
      expect(playBtn).not.toBeUndefined();
    });

    it('HDR-U031: has skip-back button', () => {
      const el = headerBar.render();
      const buttons = el.querySelectorAll('button');
      const skipBackBtn = Array.from(buttons).find((btn) =>
        btn.title?.includes('Go to start')
      );
      expect(skipBackBtn).not.toBeUndefined();
    });

    it('HDR-U032: has skip-forward button', () => {
      const el = headerBar.render();
      const buttons = el.querySelectorAll('button');
      const skipFwdBtn = Array.from(buttons).find((btn) =>
        btn.title?.includes('Go to end')
      );
      expect(skipFwdBtn).not.toBeUndefined();
    });

    it('HDR-U033: has step-back button', () => {
      const el = headerBar.render();
      const buttons = el.querySelectorAll('button');
      const stepBackBtn = Array.from(buttons).find((btn) =>
        btn.title?.includes('Step back')
      );
      expect(stepBackBtn).not.toBeUndefined();
    });

    it('HDR-U034: has step-forward button', () => {
      const el = headerBar.render();
      const buttons = el.querySelectorAll('button');
      const stepFwdBtn = Array.from(buttons).find((btn) =>
        btn.title?.includes('Step forward')
      );
      expect(stepFwdBtn).not.toBeUndefined();
    });

    it('HDR-U035: has loop mode button', () => {
      const el = headerBar.render();
      const buttons = el.querySelectorAll('button');
      const loopBtn = Array.from(buttons).find((btn) =>
        btn.title?.includes('loop mode')
      );
      expect(loopBtn).not.toBeUndefined();
    });

    it('HDR-U036: has direction button', () => {
      const el = headerBar.render();
      const buttons = el.querySelectorAll('button');
      // After render, the title is "Playing forward (Up to reverse)" or "Playing backward..."
      const dirBtn = Array.from(buttons).find((btn) =>
        btn.title?.includes('Playing')
      );
      expect(dirBtn).not.toBeUndefined();
    });

    it('HDR-U037: has speed button', () => {
      const el = headerBar.render();
      const speedBtn = el.querySelector('[data-testid="playback-speed-button"]');
      expect(speedBtn).not.toBeNull();
    });
  });

  describe('play button', () => {
    it('HDR-U040: clicking play button calls session.togglePlayback', () => {
      const toggleSpy = vi.spyOn(session, 'togglePlayback');
      const el = headerBar.render();
      const buttons = el.querySelectorAll('button');
      const playBtn = Array.from(buttons).find(
        (btn) => btn.title?.includes('Play') || btn.title?.includes('Pause')
      ) as HTMLButtonElement;

      playBtn.click();

      expect(toggleSpy).toHaveBeenCalled();
    });

    it('HDR-U041: play button shows play icon initially', () => {
      const el = headerBar.render();
      const buttons = el.querySelectorAll('button');
      const playBtn = Array.from(buttons).find(
        (btn) => btn.title?.includes('Play') || btn.title?.includes('Pause')
      ) as HTMLButtonElement;

      // Play icon uses polygon shape
      expect(playBtn.innerHTML).toContain('polygon');
    });

    it('HDR-U042: play button shows pause icon when playing', () => {
      const el = headerBar.render();
      const buttons = el.querySelectorAll('button');
      const playBtn = Array.from(buttons).find(
        (btn) => btn.title?.includes('Play') || btn.title?.includes('Pause')
      ) as HTMLButtonElement;

      // Simulate playback started
      (session as any)._isPlaying = true;
      session.emit('playbackChanged', true);

      // Pause icon uses rect shapes
      expect(playBtn.innerHTML).toContain('rect');
    });
  });

  describe('loop mode button', () => {
    it('HDR-U050: clicking loop button cycles loop mode', () => {
      const el = headerBar.render();
      const buttons = el.querySelectorAll('button');
      const loopBtn = Array.from(buttons).find((btn) =>
        btn.title?.includes('loop mode')
      ) as HTMLButtonElement;

      expect(session.loopMode).toBe('loop'); // Default

      loopBtn.click();
      expect(session.loopMode).toBe('pingpong');

      loopBtn.click();
      expect(session.loopMode).toBe('once');

      loopBtn.click();
      expect(session.loopMode).toBe('loop');
    });

    it('HDR-U051: loop button shows current mode label', () => {
      const el = headerBar.render();
      const buttons = el.querySelectorAll('button');
      const loopBtn = Array.from(buttons).find((btn) =>
        btn.title?.includes('loop mode')
      ) as HTMLButtonElement;

      expect(loopBtn.textContent).toContain('Loop');
    });
  });

  describe('direction button', () => {
    it('HDR-U060: clicking direction button toggles direction', () => {
      const el = headerBar.render();
      const buttons = el.querySelectorAll('button');
      // After render, the title is "Playing forward (Up to reverse)" or "Playing backward..."
      const dirBtn = Array.from(buttons).find((btn) =>
        btn.title?.includes('Playing')
      ) as HTMLButtonElement;

      expect(session.playDirection).toBe(1); // Forward

      dirBtn.click();
      expect(session.playDirection).toBe(-1); // Backward

      dirBtn.click();
      expect(session.playDirection).toBe(1); // Forward
    });

    it('HDR-U061: direction button title reflects current direction', () => {
      const el = headerBar.render();
      const buttons = el.querySelectorAll('button');
      const dirBtn = Array.from(buttons).find((btn) =>
        btn.title?.includes('Playing')
      ) as HTMLButtonElement;

      expect(dirBtn.title).toContain('forward');
    });
  });

  describe('speed button', () => {
    it('HDR-U070: speed button shows current speed', () => {
      const el = headerBar.render();
      const speedBtn = el.querySelector(
        '[data-testid="playback-speed-button"]'
      ) as HTMLButtonElement;

      expect(speedBtn.textContent).toBe('1x');
    });

    it('HDR-U071: clicking speed button cycles through presets', () => {
      const el = headerBar.render();
      const speedBtn = el.querySelector(
        '[data-testid="playback-speed-button"]'
      ) as HTMLButtonElement;

      expect(session.playbackSpeed).toBe(1);

      speedBtn.click();
      expect(session.playbackSpeed).toBe(2);

      speedBtn.click();
      expect(session.playbackSpeed).toBe(4);

      speedBtn.click();
      expect(session.playbackSpeed).toBe(8);

      speedBtn.click();
      // Should wrap to 1x
      expect(session.playbackSpeed).toBe(1);
    });

    it('HDR-U072: speed button has blue styling when not at 1x', () => {
      const el = headerBar.render();
      const speedBtn = el.querySelector(
        '[data-testid="playback-speed-button"]'
      ) as HTMLButtonElement;

      // At 1x, should be transparent
      expect(speedBtn.style.background).toBe('transparent');

      // Change to 2x
      speedBtn.click();

      // Should have blue styling
      expect(speedBtn.style.cssText).toContain('rgb(74, 158, 255)');
    });
  });

  describe('navigation buttons', () => {
    it('HDR-U080: skip-back button goes to start', () => {
      session.currentFrame = 50;
      const el = headerBar.render();
      const buttons = el.querySelectorAll('button');
      const skipBackBtn = Array.from(buttons).find((btn) =>
        btn.title?.includes('Go to start')
      ) as HTMLButtonElement;

      skipBackBtn.click();

      expect(session.currentFrame).toBe(1);
    });

    it('HDR-U081: skip-forward button goes to end', () => {
      const el = headerBar.render();
      const buttons = el.querySelectorAll('button');
      const skipFwdBtn = Array.from(buttons).find((btn) =>
        btn.title?.includes('Go to end')
      ) as HTMLButtonElement;

      skipFwdBtn.click();

      expect(session.currentFrame).toBe(100); // Duration is 100
    });

    it('HDR-U082: step-back button decrements frame', () => {
      session.currentFrame = 50;
      const el = headerBar.render();
      const buttons = el.querySelectorAll('button');
      const stepBackBtn = Array.from(buttons).find((btn) =>
        btn.title?.includes('Step back')
      ) as HTMLButtonElement;

      stepBackBtn.click();

      expect(session.currentFrame).toBe(49);
    });

    it('HDR-U083: step-forward button increments frame', () => {
      session.currentFrame = 50;
      const el = headerBar.render();
      const buttons = el.querySelectorAll('button');
      const stepFwdBtn = Array.from(buttons).find((btn) =>
        btn.title?.includes('Step forward')
      ) as HTMLButtonElement;

      stepFwdBtn.click();

      expect(session.currentFrame).toBe(51);
    });
  });

  describe('utility buttons', () => {
    it('HDR-U090: has help button', () => {
      const el = headerBar.render();
      const buttons = el.querySelectorAll('button');
      const helpBtn = Array.from(buttons).find((btn) =>
        btn.title?.includes('Keyboard shortcuts')
      );
      expect(helpBtn).not.toBeUndefined();
    });

    it('HDR-U091: clicking help button emits showShortcuts event', () => {
      const callback = vi.fn();
      headerBar.on('showShortcuts', callback);

      const el = headerBar.render();
      const buttons = el.querySelectorAll('button');
      const helpBtn = Array.from(buttons).find((btn) =>
        btn.title?.includes('Keyboard shortcuts')
      ) as HTMLButtonElement;

      helpBtn.click();

      expect(callback).toHaveBeenCalled();
    });

    it('HDR-U092: has key bindings button', () => {
      const el = headerBar.render();
      const buttons = el.querySelectorAll('button');
      const keyBtn = Array.from(buttons).find((btn) =>
        btn.title?.includes('Custom key bindings')
      );
      expect(keyBtn).not.toBeUndefined();
    });

    it('HDR-U093: clicking key bindings button emits showCustomKeyBindings event', () => {
      const callback = vi.fn();
      headerBar.on('showCustomKeyBindings', callback);

      const el = headerBar.render();
      const buttons = el.querySelectorAll('button');
      const keyBtn = Array.from(buttons).find((btn) =>
        btn.title?.includes('Custom key bindings')
      ) as HTMLButtonElement;

      keyBtn.click();

      expect(callback).toHaveBeenCalled();
    });
  });

  describe('child controls', () => {
    it('HDR-U100: getVolumeControl returns VolumeControl instance', () => {
      const volumeControl = headerBar.getVolumeControl();
      expect(volumeControl).toBeDefined();
    });

    it('HDR-U101: getExportControl returns ExportControl instance', () => {
      const exportControl = headerBar.getExportControl();
      expect(exportControl).toBeDefined();
    });

    it('HDR-U102: getTimecodeDisplay returns TimecodeDisplay instance', () => {
      const timecodeDisplay = headerBar.getTimecodeDisplay();
      expect(timecodeDisplay).toBeDefined();
    });
  });

  describe('navigation button behavior', () => {
    it('HDR-U110: skip-back calls session.goToStart', () => {
      const goToStartSpy = vi.spyOn(session, 'goToStart');
      const el = headerBar.render();
      const buttons = el.querySelectorAll('button');
      const skipBackBtn = Array.from(buttons).find((btn) =>
        btn.title?.includes('Go to start')
      ) as HTMLButtonElement;

      skipBackBtn.click();

      expect(goToStartSpy).toHaveBeenCalled();
    });

    it('HDR-U111: skip-forward calls session.goToEnd', () => {
      const goToEndSpy = vi.spyOn(session, 'goToEnd');
      const el = headerBar.render();
      const buttons = el.querySelectorAll('button');
      const skipFwdBtn = Array.from(buttons).find((btn) =>
        btn.title?.includes('Go to end')
      ) as HTMLButtonElement;

      skipFwdBtn.click();

      expect(goToEndSpy).toHaveBeenCalled();
    });

    it('HDR-U112: step-back calls session.stepBackward', () => {
      const stepBackSpy = vi.spyOn(session, 'stepBackward');
      const el = headerBar.render();
      const buttons = el.querySelectorAll('button');
      const stepBackBtn = Array.from(buttons).find((btn) =>
        btn.title?.includes('Step back')
      ) as HTMLButtonElement;

      stepBackBtn.click();

      expect(stepBackSpy).toHaveBeenCalled();
    });

    it('HDR-U113: step-forward calls session.stepForward', () => {
      const stepFwdSpy = vi.spyOn(session, 'stepForward');
      const el = headerBar.render();
      const buttons = el.querySelectorAll('button');
      const stepFwdBtn = Array.from(buttons).find((btn) =>
        btn.title?.includes('Step forward')
      ) as HTMLButtonElement;

      stepFwdBtn.click();

      expect(stepFwdSpy).toHaveBeenCalled();
    });
  });

  describe('session event binding', () => {
    it('HDR-U120: updates loop button when loop mode changes', () => {
      const el = headerBar.render();
      const buttons = el.querySelectorAll('button');
      const loopBtn = Array.from(buttons).find((btn) =>
        btn.title?.includes('loop mode')
      ) as HTMLButtonElement;

      session.loopMode = 'pingpong';
      session.emit('loopModeChanged', 'pingpong');

      expect(loopBtn.textContent).toContain('Ping');
    });

    it('HDR-U121: updates direction button when direction changes', () => {
      const el = headerBar.render();
      const buttons = el.querySelectorAll('button');
      const dirBtn = Array.from(buttons).find((btn) =>
        btn.title?.includes('Playing')
      ) as HTMLButtonElement;

      (session as any)._playDirection = -1;
      session.emit('playDirectionChanged', -1);

      expect(dirBtn.title).toContain('backward');
    });

    it('HDR-U122: updates speed button when speed changes', () => {
      const el = headerBar.render();
      const speedBtn = el.querySelector(
        '[data-testid="playback-speed-button"]'
      ) as HTMLButtonElement;

      session.playbackSpeed = 4;
      session.emit('playbackSpeedChanged', 4);

      expect(speedBtn.textContent).toBe('4x');
    });
  });

  describe('events', () => {
    it('HDR-U130: emits saveProject when save button clicked', () => {
      const callback = vi.fn();
      headerBar.on('saveProject', callback);

      const el = headerBar.render();
      const buttons = el.querySelectorAll('button');
      const saveBtn = Array.from(buttons).find((btn) =>
        btn.title?.includes('Save project')
      ) as HTMLButtonElement;

      saveBtn.click();

      expect(callback).toHaveBeenCalled();
    });

    it('HDR-U131: emits openProject when project file selected', () => {
      const callback = vi.fn();
      headerBar.on('openProject', callback);

      const el = headerBar.render();
      const inputs = el.querySelectorAll('input[type="file"]');
      const projectInput = Array.from(inputs).find(
        (input) => (input as HTMLInputElement).accept === '.orvproject'
      ) as HTMLInputElement;

      // Create a mock file and dispatch change event
      const file = new File([''], 'test.orvproject');
      Object.defineProperty(projectInput, 'files', { value: [file] });
      projectInput.dispatchEvent(new Event('change'));

      expect(callback).toHaveBeenCalledWith(file);
    });
  });

  describe('dispose', () => {
    it('HDR-U140: dispose cleans up child controls', () => {
      const volumeDisposeSpy = vi.spyOn(headerBar.getVolumeControl(), 'dispose');
      const exportDisposeSpy = vi.spyOn(headerBar.getExportControl(), 'dispose');

      headerBar.dispose();

      expect(volumeDisposeSpy).toHaveBeenCalled();
      expect(exportDisposeSpy).toHaveBeenCalled();
    });

    it('HDR-U141: dispose can be called multiple times safely', () => {
      expect(() => {
        headerBar.dispose();
        headerBar.dispose();
      }).not.toThrow();
    });
  });

  describe('speed button edge cases', () => {
    it('HDR-U150: speed resets to 1x after reaching max preset', () => {
      const el = headerBar.render();
      const speedBtn = el.querySelector(
        '[data-testid="playback-speed-button"]'
      ) as HTMLButtonElement;

      // Click through all presets (1 -> 2 -> 4 -> 8 -> back to 1)
      speedBtn.click(); // 2
      speedBtn.click(); // 4
      speedBtn.click(); // 8
      speedBtn.click(); // back to 1

      expect(session.playbackSpeed).toBe(1);
      expect(speedBtn.textContent).toBe('1x');
    });

    it('HDR-U151: PLAYBACK_SPEED_PRESETS are ordered ascending', () => {
      for (let i = 1; i < PLAYBACK_SPEED_PRESETS.length; i++) {
        expect(PLAYBACK_SPEED_PRESETS[i]).toBeGreaterThan(
          PLAYBACK_SPEED_PRESETS[i - 1]!
        );
      }
    });
  });
});
