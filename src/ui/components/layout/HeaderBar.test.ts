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

  describe('mobile scroll support', () => {
    it('HDR-U013: container has overflow-x auto for horizontal scrolling', () => {
      headerBar.render();
      const scrollContainer = headerBar.getContainer();
      expect(scrollContainer.style.overflowX).toBe('auto');
    });

    it('HDR-U014: container has overflow-y hidden', () => {
      headerBar.render();
      const scrollContainer = headerBar.getContainer();
      expect(scrollContainer.style.overflowY).toBe('hidden');
    });

    it('HDR-U015: container hides scrollbar via scrollbar-width none', () => {
      headerBar.render();
      const scrollContainer = headerBar.getContainer();
      expect(scrollContainer.style.scrollbarWidth).toBe('none');
    });

    it('HDR-U016: webkit scrollbar style element is present', () => {
      const el = headerBar.render();
      const styleEl = el.querySelector('style');
      expect(styleEl).not.toBeNull();
      expect(styleEl!.textContent).toContain('::-webkit-scrollbar');
      expect(styleEl!.textContent).toContain('display: none');
    });

    it('HDR-U017: control groups have flex-shrink 0 to prevent compression', () => {
      const el = headerBar.render();
      const groups = el.querySelectorAll('[role="toolbar"]');
      expect(groups.length).toBeGreaterThanOrEqual(3);
      groups.forEach((group) => {
        expect((group as HTMLElement).style.flexShrink).toBe('0');
      });
    });

    it('HDR-U018: dividers have flex-shrink 0', () => {
      headerBar.render();
      const scrollContainer = headerBar.getContainer();
      // Dividers are 1px-wide elements with border-primary background
      const children = Array.from(scrollContainer.children) as HTMLElement[];
      const dividers = children.filter(
        (c) => c.style.width === '1px' && c.style.height === '24px'
      );
      expect(dividers.length).toBeGreaterThan(0);
      for (const d of dividers) {
        expect(d.style.flexShrink).toBe('0');
      }
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

    it('HB-L55a: play button should have aria-pressed="true" when playing', () => {
      const el = headerBar.render();
      const buttons = el.querySelectorAll('button');
      const playBtn = Array.from(buttons).find(
        (btn) => btn.title?.includes('Play') || btn.title?.includes('Pause')
      ) as HTMLButtonElement;

      // Simulate playback started
      (session as any)._isPlaying = true;
      session.emit('playbackChanged', true);

      expect(playBtn.getAttribute('aria-pressed')).toBe('true');
    });

    it('HB-L55b: play button should have aria-pressed="false" when paused', () => {
      const el = headerBar.render();
      const buttons = el.querySelectorAll('button');
      const playBtn = Array.from(buttons).find(
        (btn) => btn.title?.includes('Play') || btn.title?.includes('Pause')
      ) as HTMLButtonElement;

      // Initial state is paused
      expect(playBtn.getAttribute('aria-pressed')).toBe('false');

      // Also verify it goes back to false after stopping
      (session as any)._isPlaying = true;
      session.emit('playbackChanged', true);
      expect(playBtn.getAttribute('aria-pressed')).toBe('true');

      (session as any)._isPlaying = false;
      session.emit('playbackChanged', false);
      expect(playBtn.getAttribute('aria-pressed')).toBe('false');
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

      // Should have accent styling
      expect(speedBtn.style.cssText).toContain('var(--accent-primary)');
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

  describe('panels slot', () => {
    it('HDR-U095: getPanelsSlot returns a container element', () => {
      headerBar.render();
      const slot = headerBar.getPanelsSlot();
      expect(slot).toBeInstanceOf(HTMLElement);
      expect(slot.dataset.testid).toBe('panels-slot');
    });

    it('HDR-U096: setPanelToggles replaces slot content', () => {
      headerBar.render();
      const el = document.createElement('div');
      el.textContent = 'panel toggles';
      headerBar.setPanelToggles(el);
      expect(headerBar.getPanelsSlot().textContent).toContain('panel toggles');
    });

    it('HDR-U097: setPanelToggles clears previous content', () => {
      headerBar.render();
      const el1 = document.createElement('div');
      el1.textContent = 'old';
      headerBar.setPanelToggles(el1);

      const el2 = document.createElement('div');
      el2.textContent = 'new';
      headerBar.setPanelToggles(el2);

      expect(headerBar.getPanelsSlot().textContent).not.toContain('old');
      expect(headerBar.getPanelsSlot().textContent).toContain('new');
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

    it('HB-L50a: dispose() should remove any open speed menu from document.body', () => {
      const el = headerBar.render();
      document.body.appendChild(el);

      // Open the speed menu via contextmenu
      const speedBtn = el.querySelector('[data-testid="playback-speed-button"]') as HTMLButtonElement;
      speedBtn.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }));

      // Verify the menu is in the DOM
      expect(document.getElementById('speed-preset-menu')).not.toBeNull();

      // Dispose the HeaderBar while the menu is open
      headerBar.dispose();

      // The speed menu should have been removed from document.body
      expect(document.getElementById('speed-preset-menu')).toBeNull();

      document.body.removeChild(el);
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

  describe('pitch correction toggle', () => {
    it('HDR-U152: speed context menu contains pitch correction toggle', () => {
      const el = headerBar.render();
      document.body.appendChild(el);

      const speedBtn = el.querySelector(
        '[data-testid="playback-speed-button"]'
      ) as HTMLButtonElement;

      // Right-click to open context menu
      speedBtn.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }));

      const pitchToggle = document.querySelector('[data-testid="pitch-correction-toggle"]');
      expect(pitchToggle).not.toBeNull();
      expect(pitchToggle?.textContent).toContain('Preserve Pitch');

      // Cleanup
      document.getElementById('speed-preset-menu')?.remove();
      document.body.removeChild(el);
    });

    it('HDR-U153: pitch correction toggle shows checkmark when enabled', () => {
      const el = headerBar.render();
      document.body.appendChild(el);

      // Default is preservesPitch = true
      expect(session.preservesPitch).toBe(true);

      const speedBtn = el.querySelector(
        '[data-testid="playback-speed-button"]'
      ) as HTMLButtonElement;

      speedBtn.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }));

      const pitchToggle = document.querySelector('[data-testid="pitch-correction-toggle"]');
      expect(pitchToggle?.textContent).toContain('\u2713');

      // Cleanup
      document.getElementById('speed-preset-menu')?.remove();
      document.body.removeChild(el);
    });

    it('HDR-U154: clicking pitch correction toggle changes session state', () => {
      const el = headerBar.render();
      document.body.appendChild(el);

      expect(session.preservesPitch).toBe(true);

      const speedBtn = el.querySelector(
        '[data-testid="playback-speed-button"]'
      ) as HTMLButtonElement;

      speedBtn.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }));

      const pitchToggle = document.querySelector('[data-testid="pitch-correction-toggle"]') as HTMLButtonElement;
      pitchToggle.click();

      expect(session.preservesPitch).toBe(false);

      // Cleanup - menu should already be removed by click handler
      document.getElementById('speed-preset-menu')?.remove();
      document.body.removeChild(el);
    });

    it('HDR-U155: pitch correction toggle shows no checkmark when disabled', () => {
      session.preservesPitch = false;

      const el = headerBar.render();
      document.body.appendChild(el);

      const speedBtn = el.querySelector(
        '[data-testid="playback-speed-button"]'
      ) as HTMLButtonElement;

      speedBtn.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }));

      const pitchToggle = document.querySelector('[data-testid="pitch-correction-toggle"]');
      expect(pitchToggle?.textContent).not.toContain('\u2713');
      expect(pitchToggle?.textContent).toContain('Preserve Pitch');

      // Cleanup
      document.getElementById('speed-preset-menu')?.remove();
      document.body.removeChild(el);
    });
  });

  describe('session name display', () => {
    it('HDR-U160: has session name display element', () => {
      const el = headerBar.render();
      const sessionNameDisplay = el.querySelector('[data-testid="session-name-display"]');
      expect(sessionNameDisplay).not.toBeNull();
    });

    it('HDR-U161: session name display shows "Untitled" by default', () => {
      const el = headerBar.render();
      const sessionNameDisplay = el.querySelector('[data-testid="session-name-display"]');
      const nameText = sessionNameDisplay?.querySelector('.session-name-text');
      expect(nameText?.textContent).toBe('Untitled');
    });

    it('HDR-U162: session name display updates when metadata changes', () => {
      const el = headerBar.render();
      const sessionNameDisplay = el.querySelector('[data-testid="session-name-display"]');
      const nameText = sessionNameDisplay?.querySelector('.session-name-text');

      // Simulate metadata change
      (session as any)._metadata = {
        displayName: 'My Session',
        comment: 'Test comment',
        version: 2,
        origin: 'openrv-web',
        creationContext: 0,
        clipboard: 0,
        membershipContains: [],
      };
      session.emit('metadataChanged', (session as any)._metadata);

      expect(nameText?.textContent).toBe('My Session');
    });

    it('HDR-U163: session name display tooltip includes comment', () => {
      const el = headerBar.render();
      const sessionNameDisplay = el.querySelector('[data-testid="session-name-display"]') as HTMLElement;

      // Simulate metadata change with comment
      (session as any)._metadata = {
        displayName: 'Test Session',
        comment: 'This is a test comment',
        version: 2,
        origin: 'openrv-web',
        creationContext: 0,
        clipboard: 0,
        membershipContains: [],
      };
      session.emit('metadataChanged', (session as any)._metadata);

      expect(sessionNameDisplay.title).toContain('Test Session');
      expect(sessionNameDisplay.title).toContain('This is a test comment');
    });

    it('HDR-U164: session name display tooltip shows origin if not openrv-web', () => {
      const el = headerBar.render();
      const sessionNameDisplay = el.querySelector('[data-testid="session-name-display"]') as HTMLElement;

      // Simulate metadata change with different origin
      (session as any)._metadata = {
        displayName: 'External Session',
        comment: '',
        version: 3,
        origin: 'rv-desktop',
        creationContext: 0,
        clipboard: 0,
        membershipContains: [],
      };
      session.emit('metadataChanged', (session as any)._metadata);

      expect(sessionNameDisplay.title).toContain('Created in: rv-desktop');
    });

    it('HDR-U165: session name display tooltip shows version', () => {
      const el = headerBar.render();
      const sessionNameDisplay = el.querySelector('[data-testid="session-name-display"]') as HTMLElement;

      // Simulate metadata change
      (session as any)._metadata = {
        displayName: 'Versioned Session',
        comment: '',
        version: 5,
        origin: 'openrv-web',
        creationContext: 0,
        clipboard: 0,
        membershipContains: [],
      };
      session.emit('metadataChanged', (session as any)._metadata);

      expect(sessionNameDisplay.title).toContain('Session version: 5');
    });

    it('HDR-U166: session name display does not show origin if openrv-web', () => {
      const el = headerBar.render();
      const sessionNameDisplay = el.querySelector('[data-testid="session-name-display"]') as HTMLElement;

      // Simulate metadata change with default origin
      (session as any)._metadata = {
        displayName: 'Local Session',
        comment: '',
        version: 2,
        origin: 'openrv-web',
        creationContext: 0,
        clipboard: 0,
        membershipContains: [],
      };
      session.emit('metadataChanged', (session as any)._metadata);

      expect(sessionNameDisplay.title).not.toContain('Created in:');
    });

    it('HDR-U167: session name display handles empty displayName', () => {
      const el = headerBar.render();
      const sessionNameDisplay = el.querySelector('[data-testid="session-name-display"]');
      const nameText = sessionNameDisplay?.querySelector('.session-name-text');

      // Simulate metadata change with empty displayName
      (session as any)._metadata = {
        displayName: '',
        comment: '',
        version: 2,
        origin: 'openrv-web',
        creationContext: 0,
        clipboard: 0,
        membershipContains: [],
      };
      session.emit('metadataChanged', (session as any)._metadata);

      expect(nameText?.textContent).toBe('Untitled');
    });

    it('HDR-U168: session name display does not have misleading hover effect', () => {
      const el = headerBar.render();
      const sessionNameDisplay = el.querySelector('[data-testid="session-name-display"]') as HTMLElement;

      // Initial state - no background
      expect(sessionNameDisplay.style.background).toBeFalsy();

      // Simulate mouseenter - background should NOT change since there is no interactivity
      sessionNameDisplay.dispatchEvent(new MouseEvent('mouseenter'));
      expect(sessionNameDisplay.style.background).not.toContain('var(--bg-hover)');
    });

    it('HB-L51a: session name should not have mouseenter/mouseleave hover styling that suggests interactivity', () => {
      const el = headerBar.render();
      const sessionNameDisplay = el.querySelector('[data-testid="session-name-display"]') as HTMLElement;

      // Verify cursor is default (not pointer), indicating non-interactive element
      expect(sessionNameDisplay.style.cursor).toBe('default');

      // Verify no background transition (which would suggest interactivity)
      expect(sessionNameDisplay.style.transition).not.toContain('background');

      // Simulate mouseenter and verify background does not change
      const bgBefore = sessionNameDisplay.style.background;
      sessionNameDisplay.dispatchEvent(new MouseEvent('mouseenter'));
      expect(sessionNameDisplay.style.background).toBe(bgBefore);

      // Simulate mouseleave and verify background still does not change
      sessionNameDisplay.dispatchEvent(new MouseEvent('mouseleave'));
      expect(sessionNameDisplay.style.background).toBe(bgBefore);
    });
  });

  describe('image mode', () => {
    const findPlayButton = (el: HTMLElement) =>
      Array.from(el.querySelectorAll('button')).find(
        (btn) => btn.title?.includes('Play') || btn.title?.includes('Pause')
      ) as HTMLButtonElement;

    beforeEach(() => {
      vi.useFakeTimers();
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it('HDR-U200: setImageMode(true) fades out playback group immediately', () => {
      const el = headerBar.render();
      headerBar.setImageMode(true);
      const playBtn = findPlayButton(el);
      const group = playBtn.parentElement!;
      expect(group.style.opacity).toBe('0');
      expect(group.style.pointerEvents).toBe('none');
    });

    it('HDR-U201: setImageMode(true) collapses playback group after transition', () => {
      const el = headerBar.render();
      headerBar.setImageMode(true);
      vi.advanceTimersByTime(350);
      const playBtn = findPlayButton(el);
      const group = playBtn.parentElement!;
      expect(group.style.display).toBe('none');
    });

    it('HDR-U202: setImageMode(true) hides timecode display after transition', () => {
      headerBar.render();
      headerBar.setImageMode(true);
      vi.advanceTimersByTime(350);
      const timecodeEl = headerBar.getTimecodeDisplay().render();
      expect(timecodeEl.style.display).toBe('none');
    });

    it('HDR-U203: setImageMode(true) hides volume control after transition', () => {
      headerBar.render();
      headerBar.setImageMode(true);
      vi.advanceTimersByTime(350);
      const volumeEl = headerBar.getVolumeControl().render();
      expect(volumeEl.style.display).toBe('none');
    });

    it('HDR-U204: setImageMode(false) restores playback group visibility', () => {
      const el = headerBar.render();
      headerBar.setImageMode(true);
      vi.advanceTimersByTime(350);
      headerBar.setImageMode(false);
      const playBtn = findPlayButton(el);
      const group = playBtn.parentElement!;
      expect(group.style.display).not.toBe('none');
      expect(group.style.opacity).toBe('1');
    });

    it('HDR-U205: setImageMode(false) restores timecode display', () => {
      headerBar.render();
      headerBar.setImageMode(true);
      vi.advanceTimersByTime(350);
      headerBar.setImageMode(false);
      const timecodeEl = headerBar.getTimecodeDisplay().render();
      expect(timecodeEl.style.display).not.toBe('none');
    });

    it('HDR-U206: setImageMode(false) restores volume control', () => {
      headerBar.render();
      headerBar.setImageMode(true);
      vi.advanceTimersByTime(350);
      headerBar.setImageMode(false);
      const volumeEl = headerBar.getVolumeControl().render();
      expect(volumeEl.style.display).not.toBe('none');
    });

    it('HDR-U207: setImageMode(true) twice is idempotent', () => {
      headerBar.render();
      expect(() => {
        headerBar.setImageMode(true);
        headerBar.setImageMode(true);
        vi.advanceTimersByTime(350);
      }).not.toThrow();
    });

    it('HDR-U208: setImageMode(false) when already visible is no-op', () => {
      headerBar.render();
      expect(() => {
        headerBar.setImageMode(false);
      }).not.toThrow();
    });

    it('HDR-U209: rapid toggle true→false cancels hide transition', () => {
      const el = headerBar.render();
      headerBar.setImageMode(true);
      // Immediately restore before timer fires
      headerBar.setImageMode(false);
      vi.advanceTimersByTime(350);
      const playBtn = findPlayButton(el);
      const group = playBtn.parentElement!;
      expect(group.style.display).not.toBe('none');
    });

    it('HDR-U210: file operation buttons remain visible in image mode', () => {
      const el = headerBar.render();
      headerBar.setImageMode(true);
      vi.advanceTimersByTime(350);
      const saveBtn = Array.from(el.querySelectorAll('button')).find(
        (btn) => btn.title?.includes('Save project')
      );
      expect(saveBtn).toBeDefined();
      expect((saveBtn as HTMLElement).style.display).not.toBe('none');
      expect((saveBtn as HTMLElement).closest('[style*="display: none"]')).toBeNull();
    });

    it('HDR-U211: help button remains visible in image mode', () => {
      const el = headerBar.render();
      headerBar.setImageMode(true);
      vi.advanceTimersByTime(350);
      const helpBtn = Array.from(el.querySelectorAll('button')).find(
        (btn) => btn.title?.includes('Keyboard shortcuts')
      );
      expect(helpBtn).toBeDefined();
      expect((helpBtn as HTMLElement).closest('[style*="display: none"]')).toBeNull();
    });

    it('HDR-U212: dispose clears pending image transition timers', () => {
      const el = headerBar.render();
      headerBar.setImageMode(true);
      // Dispose before transition completes
      headerBar.dispose();
      vi.advanceTimersByTime(350);
      // Elements should NOT have been collapsed (timers should be cleared)
      const playBtn = findPlayButton(el);
      const group = playBtn.parentElement!;
      // display was never set to 'none' because the timer was cleared
      expect(group.style.display).not.toBe('none');
    });

    it('HDR-U213: setImageMode(true) sets aria-hidden on elements', () => {
      const el = headerBar.render();
      headerBar.setImageMode(true);
      const playBtn = findPlayButton(el);
      const group = playBtn.parentElement!;
      expect(group.getAttribute('aria-hidden')).toBe('true');
    });

    it('HDR-U214: setImageMode(false) removes aria-hidden', () => {
      headerBar.render();
      headerBar.setImageMode(true);
      vi.advanceTimersByTime(350);
      headerBar.setImageMode(false);
      const timecodeEl = headerBar.getTimecodeDisplay().render();
      expect(timecodeEl.hasAttribute('aria-hidden')).toBe(false);
    });

    // --- Regression tests for QA/review findings ---

    it('HDR-U215: dispose during fade-out does not collapse elements (regression: stale timer)', () => {
      const el = headerBar.render();
      headerBar.setImageMode(true);
      // Opacity is set immediately, but display:none hasn't fired yet
      const playBtn = findPlayButton(el);
      const group = playBtn.parentElement!;
      expect(group.style.opacity).toBe('0');
      // Dispose mid-transition
      headerBar.dispose();
      vi.advanceTimersByTime(500);
      // The display:none timer should have been cleared by dispose
      expect(group.style.display).not.toBe('none');
    });

    it('HDR-U216: dispose during fade-in does not clear transition (regression: stale timer)', () => {
      const el = headerBar.render();
      headerBar.setImageMode(true);
      vi.advanceTimersByTime(350);
      headerBar.setImageMode(false);
      // Now fading in, with a timer to clear the transition property
      const playBtn = findPlayButton(el);
      const group = playBtn.parentElement!;
      expect(group.style.transition).toContain('opacity');
      // Dispose mid-fade-in
      headerBar.dispose();
      vi.advanceTimersByTime(500);
      // transition should NOT have been cleared (timer was cancelled)
      expect(group.style.transition).toContain('opacity');
    });

    it('HDR-U217: transition duration matches PresentationMode (0.3s, regression: inconsistent timing)', () => {
      const el = headerBar.render();
      headerBar.setImageMode(true);
      const playBtn = findPlayButton(el);
      const group = playBtn.parentElement!;
      expect(group.style.transition).toContain('0.3s');
    });

    it('HDR-U218: all hidden elements get aria-hidden (regression: missing accessibility)', () => {
      const el = headerBar.render();
      headerBar.setImageMode(true);
      const playBtn = findPlayButton(el);
      const group = playBtn.parentElement!;
      // Check playback group
      expect(group.getAttribute('aria-hidden')).toBe('true');
      // Check timecode
      const timecodeEl = headerBar.getTimecodeDisplay().render();
      expect(timecodeEl.getAttribute('aria-hidden')).toBe('true');
      // Check volume
      const volumeEl = headerBar.getVolumeControl().render();
      expect(volumeEl.getAttribute('aria-hidden')).toBe('true');
    });

    it('HDR-U219: all restored elements have aria-hidden removed (regression: stale aria)', () => {
      const el = headerBar.render();
      headerBar.setImageMode(true);
      vi.advanceTimersByTime(350);
      headerBar.setImageMode(false);
      const playBtn = findPlayButton(el);
      const group = playBtn.parentElement!;
      expect(group.hasAttribute('aria-hidden')).toBe(false);
      const timecodeEl = headerBar.getTimecodeDisplay().render();
      expect(timecodeEl.hasAttribute('aria-hidden')).toBe(false);
      const volumeEl = headerBar.getVolumeControl().render();
      expect(volumeEl.hasAttribute('aria-hidden')).toBe(false);
    });

    it('HDR-U220: multiple rapid toggles do not accumulate timers (regression: timer leak)', () => {
      const el = headerBar.render();
      // Rapid toggling 5 times
      headerBar.setImageMode(true);
      headerBar.setImageMode(false);
      headerBar.setImageMode(true);
      headerBar.setImageMode(false);
      headerBar.setImageMode(true);
      vi.advanceTimersByTime(350);
      // Final state should be image mode (hidden)
      const playBtn = findPlayButton(el);
      const group = playBtn.parentElement!;
      expect(group.style.display).toBe('none');
      // Restore
      headerBar.setImageMode(false);
      expect(group.style.display).not.toBe('none');
      expect(group.style.opacity).toBe('1');
    });

    it('HDR-U221: dividers are hidden in image mode (regression: untested elements)', () => {
      headerBar.render();
      const scrollContainer = headerBar.getContainer();
      // Count all 1px-wide dividers in the header scroll container
      const allDividers = Array.from(scrollContainer.children).filter(
        (child) => (child as HTMLElement).style.width === '1px'
      ) as HTMLElement[];
      // There should be at least the two playback dividers
      expect(allDividers.length).toBeGreaterThanOrEqual(2);

      headerBar.setImageMode(true);
      vi.advanceTimersByTime(350);

      // The dividers flanking the playback group should be hidden
      const hiddenDividers = allDividers.filter(
        (d) => d.style.display === 'none'
      );
      expect(hiddenDividers.length).toBeGreaterThanOrEqual(2);

      // Restore
      headerBar.setImageMode(false);
      const stillHidden = allDividers.filter(
        (d) => d.style.display === 'none'
      );
      expect(stillHidden.length).toBe(0);
    });
  });

  describe('keyboard focus ring (H-11)', () => {
    it('HB-H11a: createIconButton() should call applyA11yFocus on the created button', () => {
      const el = headerBar.render();
      // Pick an icon button - the help button
      const helpBtn = Array.from(el.querySelectorAll('button')).find(
        (btn) => btn.title?.includes('Keyboard shortcuts')
      ) as HTMLButtonElement;

      // applyA11yFocus registers a focus listener that sets outline on keyboard focus.
      // Simulate keyboard focus (no preceding mousedown).
      helpBtn.dispatchEvent(new Event('focus'));
      expect(helpBtn.style.outline).toBe('2px solid var(--accent-primary)');
      expect(helpBtn.style.outlineOffset).toBe('2px');
    });

    it('HB-H11b: createCompactButton() should call applyA11yFocus on the created button', () => {
      const el = headerBar.render();
      // The loop button is created via createCompactButton
      const loopBtn = Array.from(el.querySelectorAll('button')).find(
        (btn) => btn.title?.includes('loop mode')
      ) as HTMLButtonElement;

      // Simulate keyboard focus (no preceding mousedown).
      loopBtn.dispatchEvent(new Event('focus'));
      expect(loopBtn.style.outline).toBe('2px solid var(--accent-primary)');
      expect(loopBtn.style.outlineOffset).toBe('2px');
    });

    it('HB-H11c: when a header button receives focus via keyboard (Tab), it should have a visible focus ring', () => {
      const el = headerBar.render();
      // Pick the fullscreen button
      const fullscreenBtn = el.querySelector('[data-testid="fullscreen-toggle-button"]') as HTMLButtonElement;

      // Simulate Tab focus (no mousedown before focus)
      fullscreenBtn.dispatchEvent(new Event('focus'));
      expect(fullscreenBtn.style.outline).toBe('2px solid var(--accent-primary)');
      expect(fullscreenBtn.style.outlineOffset).toBe('2px');
    });

    it('HB-H11d: when a header button receives focus via mouse click, it should NOT show the focus ring', () => {
      const el = headerBar.render();
      // Pick the fullscreen button
      const fullscreenBtn = el.querySelector('[data-testid="fullscreen-toggle-button"]') as HTMLButtonElement;

      // Simulate mouse click: mousedown fires before focus
      fullscreenBtn.dispatchEvent(new Event('mousedown'));
      fullscreenBtn.dispatchEvent(new Event('focus'));
      expect(fullscreenBtn.style.outline).not.toBe('2px solid var(--accent-primary)');
    });
  });

  describe('SVG icons aria-hidden (H-12)', () => {
    it('ICN-H12c: HeaderBar getIcon() SVGs should have aria-hidden="true"', () => {
      const el = headerBar.render();
      // All SVG elements within buttons should have aria-hidden="true"
      const svgs = el.querySelectorAll('button svg');
      expect(svgs.length).toBeGreaterThan(0);
      svgs.forEach((svg) => {
        expect(svg.getAttribute('aria-hidden')).toBe('true');
      });
    });

    it('ICN-H12c-play: play button icon SVG has aria-hidden="true"', () => {
      const el = headerBar.render();
      const playBtn = Array.from(el.querySelectorAll('button')).find(
        (btn) => btn.title?.includes('Play') || btn.title?.includes('Pause')
      ) as HTMLButtonElement;
      const svg = playBtn.querySelector('svg');
      expect(svg).not.toBeNull();
      expect(svg!.getAttribute('aria-hidden')).toBe('true');
    });

    it('ICN-H12c-update: play button icon SVG retains aria-hidden after playback state change', () => {
      const el = headerBar.render();
      const playBtn = Array.from(el.querySelectorAll('button')).find(
        (btn) => btn.title?.includes('Play') || btn.title?.includes('Pause')
      ) as HTMLButtonElement;

      // Simulate playback started (switches to pause icon)
      (session as any)._isPlaying = true;
      session.emit('playbackChanged', true);

      const svg = playBtn.querySelector('svg');
      expect(svg).not.toBeNull();
      expect(svg!.getAttribute('aria-hidden')).toBe('true');
    });

    it('ICN-H12c-fullscreen: fullscreen button icon SVG has aria-hidden after state change', () => {
      const el = headerBar.render();
      const fullscreenBtn = el.querySelector('[data-testid="fullscreen-toggle-button"]') as HTMLButtonElement;

      // Toggle fullscreen state (switches icon from maximize to minimize)
      headerBar.setFullscreenState(true);

      const svg = fullscreenBtn.querySelector('svg');
      expect(svg).not.toBeNull();
      expect(svg!.getAttribute('aria-hidden')).toBe('true');
    });

    it('ICN-H12c-session: session name display icon SVG has aria-hidden="true"', () => {
      const el = headerBar.render();
      const sessionDisplay = el.querySelector('[data-testid="session-name-display"]') as HTMLElement;
      const svg = sessionDisplay.querySelector('svg');
      expect(svg).not.toBeNull();
      expect(svg!.getAttribute('aria-hidden')).toBe('true');
    });
  });

  describe('overflow fade indicators (L-52)', () => {
    it('HB-L52a: header creates fade indicator elements and has scroll event handling', () => {
      const el = headerBar.render();

      // Verify left and right fade elements exist via data-testid
      const fadeLeft = el.querySelector('[data-testid="header-fade-left"]') as HTMLElement;
      const fadeRight = el.querySelector('[data-testid="header-fade-right"]') as HTMLElement;
      expect(fadeLeft).not.toBeNull();
      expect(fadeRight).not.toBeNull();

      // Both fades should have pointer-events: none to not block interactions
      expect(fadeLeft.style.pointerEvents).toBe('none');
      expect(fadeRight.style.pointerEvents).toBe('none');

      // Both fades should be aria-hidden
      expect(fadeLeft.getAttribute('aria-hidden')).toBe('true');
      expect(fadeRight.getAttribute('aria-hidden')).toBe('true');

      // Both fades should be positioned absolutely
      expect(fadeLeft.style.position).toBe('absolute');
      expect(fadeRight.style.position).toBe('absolute');

      // Both fades should start hidden (opacity 0) since jsdom scrollWidth === clientWidth
      expect(fadeLeft.style.opacity).toBe('0');
      expect(fadeRight.style.opacity).toBe('0');

      // The updateOverflowFades method should exist and be callable
      expect(typeof headerBar.updateOverflowFades).toBe('function');
      expect(() => headerBar.updateOverflowFades()).not.toThrow();
    });

    it('HB-L52b: dispose removes scroll and resize listeners without error', () => {
      headerBar.render();

      // Should not throw when disposing (which removes scroll/resize listeners)
      expect(() => headerBar.dispose()).not.toThrow();

      // Calling dispose again should also be safe
      expect(() => headerBar.dispose()).not.toThrow();
    });

    it('HB-L52c: fade indicators have gradient backgrounds', () => {
      const el = headerBar.render();
      const fadeLeft = el.querySelector('[data-testid="header-fade-left"]') as HTMLElement;
      const fadeRight = el.querySelector('[data-testid="header-fade-right"]') as HTMLElement;

      // Left fade should gradient from bg-primary to transparent (left to right)
      expect(fadeLeft.style.background).toContain('linear-gradient');
      expect(fadeLeft.style.background).toContain('to right');

      // Right fade should gradient from bg-primary to transparent (right to left)
      expect(fadeRight.style.background).toContain('linear-gradient');
      expect(fadeRight.style.background).toContain('to left');
    });

    it('HB-L52d: wrapper has position relative for absolute fade positioning', () => {
      const el = headerBar.render();
      expect(el.style.position).toBe('relative');
    });
  });

  describe('touch/pointer event support (L-60)', () => {
    // jsdom does not provide PointerEvent, so we polyfill it for these tests
    const PointerEventPolyfill = class extends MouseEvent {
      constructor(type: string, params?: MouseEventInit) {
        super(type, params);
      }
    };
    if (typeof globalThis.PointerEvent === 'undefined') {
      (globalThis as any).PointerEvent = PointerEventPolyfill;
    }

    it('HB-L60a: header buttons should respond to pointerenter/pointerleave for hover styling (touch support)', () => {
      const el = headerBar.render();
      // Pick an icon button - the help button (created via createIconButton)
      const helpBtn = Array.from(el.querySelectorAll('button')).find(
        (btn) => btn.title?.includes('Keyboard shortcuts')
      ) as HTMLButtonElement;

      // Initial state: transparent background
      expect(helpBtn.style.background).toBe('transparent');

      // Simulate pointerenter (fires for both mouse and touch)
      helpBtn.dispatchEvent(new PointerEvent('pointerenter', { bubbles: true }));
      expect(helpBtn.style.background).toBe('var(--bg-hover)');
      expect(helpBtn.style.borderColor).toBe('var(--border-secondary)');
      expect(helpBtn.style.color).toBe('var(--text-primary)');

      // Simulate pointerleave
      helpBtn.dispatchEvent(new PointerEvent('pointerleave', { bubbles: true }));
      expect(helpBtn.style.background).toBe('transparent');
      expect(helpBtn.style.borderColor).toBe('transparent');
      expect(helpBtn.style.color).toBe('var(--text-secondary)');
    });

    it('HB-L60b: compact buttons should respond to pointerenter/pointerleave (touch support)', () => {
      const el = headerBar.render();
      // The loop button is created via createCompactButton
      const loopBtn = Array.from(el.querySelectorAll('button')).find(
        (btn) => btn.title?.includes('loop mode')
      ) as HTMLButtonElement;

      // Initial state: transparent background
      expect(loopBtn.style.background).toBe('transparent');

      // Simulate pointerenter
      loopBtn.dispatchEvent(new PointerEvent('pointerenter', { bubbles: true }));
      expect(loopBtn.style.background).toBe('var(--bg-hover)');
      expect(loopBtn.style.color).toBe('var(--text-primary)');

      // Simulate pointerleave
      loopBtn.dispatchEvent(new PointerEvent('pointerleave', { bubbles: true }));
      expect(loopBtn.style.background).toBe('transparent');
      expect(loopBtn.style.color).toBe('var(--text-secondary)');
    });

    it('HB-L60c: speed button should respond to pointerenter/pointerleave (touch support)', () => {
      const el = headerBar.render();
      const speedBtn = el.querySelector(
        '[data-testid="playback-speed-button"]'
      ) as HTMLButtonElement;

      // Simulate pointerenter
      speedBtn.dispatchEvent(new PointerEvent('pointerenter', { bubbles: true }));
      expect(speedBtn.style.background).toBe('var(--bg-hover)');
      expect(speedBtn.style.color).toBe('var(--text-primary)');

      // Simulate pointerleave (speed is 1x, so should go transparent)
      speedBtn.dispatchEvent(new PointerEvent('pointerleave', { bubbles: true }));
      expect(speedBtn.style.background).toBe('transparent');
      expect(speedBtn.style.color).toBe('var(--text-secondary)');
    });

    it('HB-L60d: icon buttons should respond to pointerdown/pointerup for active state (touch support)', () => {
      const el = headerBar.render();
      const helpBtn = Array.from(el.querySelectorAll('button')).find(
        (btn) => btn.title?.includes('Keyboard shortcuts')
      ) as HTMLButtonElement;

      // Simulate pointerdown (active press)
      helpBtn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
      expect(helpBtn.style.background).toBe('var(--bg-active)');

      // Simulate pointerup
      helpBtn.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
      expect(helpBtn.style.background).toBe('var(--bg-hover)');
    });

    it('HB-L60e: header buttons should NOT respond to mouseenter for hover styling (replaced by pointer events)', () => {
      const el = headerBar.render();
      const helpBtn = Array.from(el.querySelectorAll('button')).find(
        (btn) => btn.title?.includes('Keyboard shortcuts')
      ) as HTMLButtonElement;

      // Initial state: transparent background
      expect(helpBtn.style.background).toBe('transparent');

      // Dispatch mouseenter - should NOT change styling (listeners use pointerenter now)
      helpBtn.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
      expect(helpBtn.style.background).toBe('transparent');
    });
  });

  describe('speed menu keyboard accessibility (M-22)', () => {
    /** Helper: opens the speed menu and returns the menu element */
    function openSpeedMenu(el: HTMLElement, method: 'contextmenu' | 'shift-enter' | 'shift-space' = 'contextmenu'): HTMLElement {
      const speedBtn = el.querySelector('[data-testid="playback-speed-button"]') as HTMLButtonElement;
      if (method === 'contextmenu') {
        speedBtn.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }));
      } else if (method === 'shift-enter') {
        speedBtn.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, bubbles: true }));
      } else if (method === 'shift-space') {
        speedBtn.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', shiftKey: true, bubbles: true }));
      }
      const menu = document.getElementById('speed-preset-menu');
      expect(menu).not.toBeNull();
      return menu!;
    }

    afterEach(() => {
      // Cleanup any leftover menus
      document.getElementById('speed-preset-menu')?.remove();
    });

    it('SPD-M22a: Shift+Enter on the speed button should open the speed preset menu', () => {
      const el = headerBar.render();
      document.body.appendChild(el);

      const speedBtn = el.querySelector('[data-testid="playback-speed-button"]') as HTMLButtonElement;
      speedBtn.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, bubbles: true }));

      const menu = document.getElementById('speed-preset-menu');
      expect(menu).not.toBeNull();

      document.body.removeChild(el);
    });

    it('SPD-M22a-space: Shift+Space on the speed button should open the speed preset menu', () => {
      const el = headerBar.render();
      document.body.appendChild(el);

      const speedBtn = el.querySelector('[data-testid="playback-speed-button"]') as HTMLButtonElement;
      speedBtn.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', shiftKey: true, bubbles: true }));

      const menu = document.getElementById('speed-preset-menu');
      expect(menu).not.toBeNull();

      document.body.removeChild(el);
    });

    it('SPD-M22a-haspopup: speed button should have aria-haspopup="menu"', () => {
      const el = headerBar.render();
      const speedBtn = el.querySelector('[data-testid="playback-speed-button"]') as HTMLButtonElement;
      expect(speedBtn.getAttribute('aria-haspopup')).toBe('menu');
    });

    it('SPD-M22b: Speed menu container should have role="menu"', () => {
      const el = headerBar.render();
      document.body.appendChild(el);

      const menu = openSpeedMenu(el);
      expect(menu.getAttribute('role')).toBe('menu');

      document.body.removeChild(el);
    });

    it('SPD-M22c: Speed menu items should have role="menuitem"', () => {
      const el = headerBar.render();
      document.body.appendChild(el);

      const menu = openSpeedMenu(el);
      const menuItems = menu.querySelectorAll('[role="menuitem"]');
      // Should have speed presets + pitch correction toggle
      expect(menuItems.length).toBe(PLAYBACK_SPEED_PRESETS.length + 1);

      document.body.removeChild(el);
    });

    it('SPD-M22d: ArrowDown should navigate to next speed menu item', () => {
      const el = headerBar.render();
      document.body.appendChild(el);

      const menu = openSpeedMenu(el);
      const menuItems = Array.from(menu.querySelectorAll('[role="menuitem"]')) as HTMLElement[];

      // Focus the first item
      menuItems[0]!.focus();
      expect(document.activeElement).toBe(menuItems[0]);

      // Press ArrowDown
      menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
      expect(document.activeElement).toBe(menuItems[1]);

      document.body.removeChild(el);
    });

    it('SPD-M22d-up: ArrowUp should navigate to previous speed menu item', () => {
      const el = headerBar.render();
      document.body.appendChild(el);

      const menu = openSpeedMenu(el);
      const menuItems = Array.from(menu.querySelectorAll('[role="menuitem"]')) as HTMLElement[];

      // Focus the second item
      menuItems[1]!.focus();
      expect(document.activeElement).toBe(menuItems[1]);

      // Press ArrowUp
      menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
      expect(document.activeElement).toBe(menuItems[0]);

      document.body.removeChild(el);
    });

    it('SPD-M22d-wrap-down: ArrowDown wraps from last to first item', () => {
      const el = headerBar.render();
      document.body.appendChild(el);

      const menu = openSpeedMenu(el);
      const menuItems = Array.from(menu.querySelectorAll('[role="menuitem"]')) as HTMLElement[];
      const lastItem = menuItems[menuItems.length - 1]!;

      // Focus the last item
      lastItem.focus();
      expect(document.activeElement).toBe(lastItem);

      // Press ArrowDown should wrap to first
      menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
      expect(document.activeElement).toBe(menuItems[0]);

      document.body.removeChild(el);
    });

    it('SPD-M22d-wrap-up: ArrowUp wraps from first to last item', () => {
      const el = headerBar.render();
      document.body.appendChild(el);

      const menu = openSpeedMenu(el);
      const menuItems = Array.from(menu.querySelectorAll('[role="menuitem"]')) as HTMLElement[];

      // Focus the first item
      menuItems[0]!.focus();
      expect(document.activeElement).toBe(menuItems[0]);

      // Press ArrowUp should wrap to last
      menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
      expect(document.activeElement).toBe(menuItems[menuItems.length - 1]);

      document.body.removeChild(el);
    });

    it('SPD-M22e: Pressing Escape should close the speed menu', () => {
      const el = headerBar.render();
      document.body.appendChild(el);

      const menu = openSpeedMenu(el);
      expect(document.getElementById('speed-preset-menu')).not.toBeNull();

      // Press Escape
      menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      expect(document.getElementById('speed-preset-menu')).toBeNull();

      document.body.removeChild(el);
    });

    it('SPD-M22e-focus: Pressing Escape returns focus to the speed button', () => {
      const el = headerBar.render();
      document.body.appendChild(el);

      const speedBtn = el.querySelector('[data-testid="playback-speed-button"]') as HTMLButtonElement;
      const menu = openSpeedMenu(el);

      // Press Escape
      menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      expect(document.activeElement).toBe(speedBtn);

      document.body.removeChild(el);
    });

    it('SPD-M22f: The currently active speed should have aria-checked="true"', () => {
      const el = headerBar.render();
      document.body.appendChild(el);

      // Default speed is 1x
      const menu = openSpeedMenu(el);
      const activeItem = menu.querySelector('[data-testid="speed-preset-1"]') as HTMLElement;
      expect(activeItem).not.toBeNull();
      expect(activeItem.getAttribute('aria-checked')).toBe('true');

      // Other items should NOT have aria-checked
      const otherItem = menu.querySelector('[data-testid="speed-preset-2"]') as HTMLElement;
      expect(otherItem.hasAttribute('aria-checked')).toBe(false);

      document.body.removeChild(el);
    });

    it('SPD-M22f-2x: When speed is 2x, the 2x item should have aria-checked="true"', () => {
      session.playbackSpeed = 2;
      const el = headerBar.render();
      document.body.appendChild(el);

      const menu = openSpeedMenu(el);
      const item2x = menu.querySelector('[data-testid="speed-preset-2"]') as HTMLElement;
      expect(item2x.getAttribute('aria-checked')).toBe('true');

      const item1x = menu.querySelector('[data-testid="speed-preset-1"]') as HTMLElement;
      expect(item1x.hasAttribute('aria-checked')).toBe(false);

      document.body.removeChild(el);
    });

    it('SPD-M22f-visual: The active speed item should have accent background color', () => {
      const el = headerBar.render();
      document.body.appendChild(el);

      const menu = openSpeedMenu(el);
      const activeItem = menu.querySelector('[data-testid="speed-preset-1"]') as HTMLElement;
      expect(activeItem.style.background).toContain('var(--accent-primary)');
      expect(activeItem.style.color).toBe('white');

      document.body.removeChild(el);
    });

    it('SPD-M22-focus-active: Menu should focus the active speed item on open', () => {
      const el = headerBar.render();
      document.body.appendChild(el);

      // Default speed is 1x, so the 1x item should be focused
      openSpeedMenu(el);
      const activeItem = document.querySelector('[data-testid="speed-preset-1"]') as HTMLElement;
      expect(document.activeElement).toBe(activeItem);

      document.body.removeChild(el);
    });

    it('SPD-M22-tab: Tab should close the menu and return focus to button', () => {
      const el = headerBar.render();
      document.body.appendChild(el);

      const speedBtn = el.querySelector('[data-testid="playback-speed-button"]') as HTMLButtonElement;
      const menu = openSpeedMenu(el);

      // Press Tab
      menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
      expect(document.getElementById('speed-preset-menu')).toBeNull();
      expect(document.activeElement).toBe(speedBtn);

      document.body.removeChild(el);
    });
  });
});
