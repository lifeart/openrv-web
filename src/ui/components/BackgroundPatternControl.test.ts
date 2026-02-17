import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  BackgroundPatternControl,
  type BackgroundPatternState,
  drawBackgroundPattern,
  clearPatternCache,
  PATTERN_COLORS,
} from './BackgroundPatternControl';

describe('BackgroundPatternControl', () => {
  let control: BackgroundPatternControl;

  beforeEach(() => {
    control = new BackgroundPatternControl();
  });

  describe('initialization', () => {
    it('BG-U001: should initialize with default state', () => {
      const state = control.getState();
      expect(state.pattern).toBe('black');
      expect(state.checkerSize).toBe('medium');
      expect(state.customColor).toBe('#1a1a1a');
    });

    it('BG-U002: should render container with correct testid', () => {
      const element = control.render();
      expect(element.dataset.testid).toBe('background-pattern-control');
    });

    it('BG-U003: should render button with correct testid', () => {
      const element = control.render();
      const button = element.querySelector('[data-testid="background-pattern-button"]');
      expect(button).not.toBeNull();
    });
  });

  describe('pattern selection', () => {
    it('BG-U004: should emit stateChanged when pattern changes', () => {
      const callback = vi.fn();
      control.on('stateChanged', callback);

      control.setPattern('checker');

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({ pattern: 'checker' })
      );
    });

    it('BG-U005: should update state when setPattern is called', () => {
      control.setPattern('grey18');
      expect(control.getState().pattern).toBe('grey18');
    });

    it('BG-U006: should cycle patterns correctly', () => {
      expect(control.getState().pattern).toBe('black');

      control.cyclePattern();
      expect(control.getState().pattern).toBe('grey18');

      control.cyclePattern();
      expect(control.getState().pattern).toBe('grey50');

      control.cyclePattern();
      expect(control.getState().pattern).toBe('checker');

      control.cyclePattern();
      expect(control.getState().pattern).toBe('black');
    });

    it('BG-U007: should cycle from a non-cycle pattern to black', () => {
      control.setPattern('crosshatch');
      control.cyclePattern();
      // crosshatch is not in cycle order, so it goes to black (index 0)
      expect(control.getState().pattern).toBe('black');
    });
  });

  describe('checker size', () => {
    it('BG-U008: should update checker size', () => {
      control.setCheckerSize('large');
      expect(control.getState().checkerSize).toBe('large');
    });

    it('BG-U009: should emit stateChanged when checker size changes', () => {
      const callback = vi.fn();
      control.on('stateChanged', callback);

      control.setCheckerSize('small');

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({ checkerSize: 'small' })
      );
    });
  });

  describe('custom color', () => {
    it('BG-U010: should update custom color', () => {
      control.setCustomColor('#ff0000');
      expect(control.getState().customColor).toBe('#ff0000');
    });

    it('BG-U011: should auto-select custom pattern when setting custom color', () => {
      control.setCustomColor('#00ff00');
      expect(control.getState().pattern).toBe('custom');
    });

    it('BG-U012: should validate hex color format', () => {
      expect(() => control.setCustomColor('invalid')).toThrow();
      expect(() => control.setCustomColor('#fff')).not.toThrow(); // 3-char hex
      expect(() => control.setCustomColor('#ffffff')).not.toThrow(); // 6-char hex
    });

    it('BG-U013: should reject invalid hex colors', () => {
      expect(() => control.setCustomColor('#gggggg')).toThrow();
      expect(() => control.setCustomColor('ff0000')).toThrow();
      expect(() => control.setCustomColor('#ff00')).toThrow();
    });
  });

  describe('toggle checkerboard', () => {
    it('BG-U014: should toggle between black and checker', () => {
      expect(control.getState().pattern).toBe('black');

      control.toggleCheckerboard();
      expect(control.getState().pattern).toBe('checker');

      control.toggleCheckerboard();
      expect(control.getState().pattern).toBe('black');
    });

    it('BG-U015: should return to previous pattern when disabling checker', () => {
      control.setPattern('grey18');
      control.toggleCheckerboard();
      expect(control.getState().pattern).toBe('checker');

      control.toggleCheckerboard();
      expect(control.getState().pattern).toBe('grey18');
    });
  });

  describe('setState', () => {
    it('BG-U016: should set full state', () => {
      const newState: BackgroundPatternState = {
        pattern: 'crosshatch',
        checkerSize: 'large',
        customColor: '#123456',
      };

      control.setState(newState);
      expect(control.getState()).toEqual(newState);
    });

    it('BG-U017: should emit stateChanged', () => {
      const callback = vi.fn();
      control.on('stateChanged', callback);

      control.setState({ pattern: 'white', checkerSize: 'small', customColor: '#000' });

      expect(callback).toHaveBeenCalled();
    });
  });

  describe('keyboard handling', () => {
    it('BG-U018: should handle Shift+B to cycle patterns', () => {
      const handled = control.handleKeyboard('B', true, false);
      expect(handled).toBe(true);
      expect(control.getState().pattern).toBe('grey18');
    });

    it('BG-U019: should handle Shift+Alt+B to toggle checkerboard', () => {
      const handled = control.handleKeyboard('B', true, true);
      expect(handled).toBe(true);
      expect(control.getState().pattern).toBe('checker');
    });

    it('BG-U020: should return false for unhandled keys', () => {
      const handled = control.handleKeyboard('x', false, false);
      expect(handled).toBe(false);
    });

    it('BG-U021: should handle lowercase b for Shift+B', () => {
      const handled = control.handleKeyboard('b', true, false);
      expect(handled).toBe(true);
      expect(control.getState().pattern).toBe('grey18');
    });

    it('BP-L45a: pressing Enter on a focused pattern item should select it', () => {
      const el = control.render();
      document.body.appendChild(el);

      // Open dropdown by clicking button
      const button = el.querySelector('[data-testid="background-pattern-button"]') as HTMLButtonElement;
      button.click();

      // Find the grey18 pattern item in the dropdown
      const item = document.querySelector('[data-testid="bg-pattern-grey18"]') as HTMLElement;
      expect(item).not.toBeNull();

      // Dispatch Enter keydown
      const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true });
      item.dispatchEvent(event);

      expect(control.getState().pattern).toBe('grey18');

      control.dispose();
      el.remove();
    });

    it('BP-L45b: pressing Space on a focused pattern item should select it', () => {
      const el = control.render();
      document.body.appendChild(el);

      // Open dropdown by clicking button
      const button = el.querySelector('[data-testid="background-pattern-button"]') as HTMLButtonElement;
      button.click();

      // Find the grey50 pattern item in the dropdown
      const item = document.querySelector('[data-testid="bg-pattern-grey50"]') as HTMLElement;
      expect(item).not.toBeNull();

      // Dispatch Space keydown
      const event = new KeyboardEvent('keydown', { key: ' ', bubbles: true });
      item.dispatchEvent(event);

      expect(control.getState().pattern).toBe('grey50');

      control.dispose();
      el.remove();
    });
  });

  describe('isActive', () => {
    it('BG-U022: should return false for black (default)', () => {
      expect(control.isActive()).toBe(false);
    });

    it('BG-U023: should return true for non-default patterns', () => {
      control.setPattern('checker');
      expect(control.isActive()).toBe(true);

      control.setPattern('grey18');
      expect(control.isActive()).toBe(true);
    });
  });

  describe('dispose', () => {
    it('BG-U024: should clean up dropdown from body', () => {
      control.render();
      // Simulate opening dropdown by clicking button
      const button = control.render().querySelector('button');
      button?.click();

      control.dispose();

      // Dropdown should be removed from body
      expect(document.querySelector('[data-testid="background-pattern-dropdown"]')).toBeNull();
    });
  });
});

describe('drawBackgroundPattern', () => {
  it('BG-U025: should not draw anything for black pattern (optimization)', () => {
    const canvas = document.createElement('canvas');
    canvas.width = 100;
    canvas.height = 100;
    const ctx = canvas.getContext('2d')!;
    const fillRectSpy = vi.spyOn(ctx, 'fillRect');

    drawBackgroundPattern(ctx, 100, 100, { pattern: 'black', checkerSize: 'medium', customColor: '' });

    // Black is handled by canvas background, no explicit draw needed
    expect(fillRectSpy).not.toHaveBeenCalled();
  });

  it('BG-U026: should draw solid color for grey18', () => {
    const canvas = document.createElement('canvas');
    canvas.width = 100;
    canvas.height = 100;
    const ctx = canvas.getContext('2d')!;
    const fillRectSpy = vi.spyOn(ctx, 'fillRect');

    drawBackgroundPattern(ctx, 100, 100, { pattern: 'grey18', checkerSize: 'medium', customColor: '' });

    expect(fillRectSpy).toHaveBeenCalled();
  });

  it('BG-U027: should draw solid color for grey50', () => {
    const canvas = document.createElement('canvas');
    canvas.width = 100;
    canvas.height = 100;
    const ctx = canvas.getContext('2d')!;
    const fillRectSpy = vi.spyOn(ctx, 'fillRect');

    drawBackgroundPattern(ctx, 100, 100, { pattern: 'grey50', checkerSize: 'medium', customColor: '' });

    expect(fillRectSpy).toHaveBeenCalled();
  });

  it('BG-U028: should draw solid color for white', () => {
    const canvas = document.createElement('canvas');
    canvas.width = 100;
    canvas.height = 100;
    const ctx = canvas.getContext('2d')!;
    const fillRectSpy = vi.spyOn(ctx, 'fillRect');

    drawBackgroundPattern(ctx, 100, 100, { pattern: 'white', checkerSize: 'medium', customColor: '' });

    expect(fillRectSpy).toHaveBeenCalled();
  });

  it('BG-U029: should draw checkerboard pattern with correct size', () => {
    const canvas = document.createElement('canvas');
    canvas.width = 100;
    canvas.height = 100;
    const ctx = canvas.getContext('2d')!;
    const fillRectSpy = vi.spyOn(ctx, 'fillRect');

    drawBackgroundPattern(ctx, 100, 100, { pattern: 'checker', checkerSize: 'medium', customColor: '' });

    // With medium (16px) checker on 100x100, expect many fillRect calls
    expect(fillRectSpy.mock.calls.length).toBeGreaterThan(10);
  });

  it('BG-U030: should scale checker size correctly', () => {
    const sizes: Record<string, number> = { small: 8, medium: 16, large: 32 };

    for (const [sizeName, expectedSize] of Object.entries(sizes)) {
      const canvas = document.createElement('canvas');
      canvas.width = 100;
      canvas.height = 100;
      const ctx = canvas.getContext('2d')!;
      const fillRectSpy = vi.spyOn(ctx, 'fillRect');

      drawBackgroundPattern(ctx, 100, 100, {
        pattern: 'checker',
        checkerSize: sizeName as 'small' | 'medium' | 'large',
        customColor: ''
      });

      // Verify fillRect was called with correct size
      const calls = fillRectSpy.mock.calls;
      expect(calls[0]![2]).toBe(expectedSize); // width
      expect(calls[0]![3]).toBe(expectedSize); // height
    }
  });

  it('BG-U031: should use custom color for custom pattern', () => {
    const canvas = document.createElement('canvas');
    canvas.width = 100;
    canvas.height = 100;
    const ctx = canvas.getContext('2d')!;
    const fillRectSpy = vi.spyOn(ctx, 'fillRect');

    drawBackgroundPattern(ctx, 100, 100, { pattern: 'custom', checkerSize: 'medium', customColor: '#ff5500' });

    expect(fillRectSpy).toHaveBeenCalled();
  });

  it('BG-U032: should draw crosshatch pattern', () => {
    const canvas = document.createElement('canvas');
    canvas.width = 100;
    canvas.height = 100;
    const ctx = canvas.getContext('2d')!;
    const strokeSpy = vi.spyOn(ctx, 'stroke');

    drawBackgroundPattern(ctx, 100, 100, { pattern: 'crosshatch', checkerSize: 'medium', customColor: '' });

    // Crosshatch should use stroke for lines
    expect(strokeSpy).toHaveBeenCalled();
  });

  it('BG-U033: should not draw anything for zero width', () => {
    const canvas = document.createElement('canvas');
    canvas.width = 100;
    canvas.height = 100;
    const ctx = canvas.getContext('2d')!;
    const fillRectSpy = vi.spyOn(ctx, 'fillRect');

    drawBackgroundPattern(ctx, 0, 100, { pattern: 'grey18', checkerSize: 'medium', customColor: '' });

    expect(fillRectSpy).not.toHaveBeenCalled();
  });

  it('BG-U034: should not draw anything for zero height', () => {
    const canvas = document.createElement('canvas');
    canvas.width = 100;
    canvas.height = 100;
    const ctx = canvas.getContext('2d')!;
    const fillRectSpy = vi.spyOn(ctx, 'fillRect');

    drawBackgroundPattern(ctx, 100, 0, { pattern: 'grey50', checkerSize: 'medium', customColor: '' });

    expect(fillRectSpy).not.toHaveBeenCalled();
  });

  it('BG-U035: should not draw anything for negative dimensions', () => {
    const canvas = document.createElement('canvas');
    canvas.width = 100;
    canvas.height = 100;
    const ctx = canvas.getContext('2d')!;
    const fillRectSpy = vi.spyOn(ctx, 'fillRect');

    drawBackgroundPattern(ctx, -10, -20, { pattern: 'checker', checkerSize: 'medium', customColor: '' });

    expect(fillRectSpy).not.toHaveBeenCalled();
  });

  it('BG-U036: should set correct fillStyle for custom color', () => {
    const canvas = document.createElement('canvas');
    canvas.width = 100;
    canvas.height = 100;
    const ctx = canvas.getContext('2d')!;

    drawBackgroundPattern(ctx, 100, 100, { pattern: 'custom', checkerSize: 'medium', customColor: '#ff5500' });

    // After drawing, fillStyle should have been set to the custom color
    // Note: ctx.fillStyle may be normalized to lowercase
    expect(ctx.fillStyle).toBe('#ff5500');
  });

  it('BG-U037: should set correct fillStyle for solid patterns', () => {
    const canvas = document.createElement('canvas');
    canvas.width = 100;
    canvas.height = 100;
    const ctx = canvas.getContext('2d')!;

    drawBackgroundPattern(ctx, 100, 100, { pattern: 'white', checkerSize: 'medium', customColor: '' });

    expect(ctx.fillStyle).toBe(PATTERN_COLORS.white);
  });
});

describe('BackgroundPatternControl - edge cases', () => {
  let control: BackgroundPatternControl;

  beforeEach(() => {
    control = new BackgroundPatternControl();
  });

  afterEach(() => {
    control.dispose();
  });

  it('BG-U038: getState should return a copy (immutability)', () => {
    const state1 = control.getState();
    state1.pattern = 'crosshatch';

    // The internal state should not be mutated
    const state2 = control.getState();
    expect(state2.pattern).toBe('black');
  });

  it('BG-U039: setState should not hold reference to passed object', () => {
    const externalState: BackgroundPatternState = {
      pattern: 'grey50',
      checkerSize: 'large',
      customColor: '#aabbcc',
    };

    control.setState(externalState);

    // Mutate the external object
    externalState.pattern = 'crosshatch';

    // Internal state should not be affected
    expect(control.getState().pattern).toBe('grey50');
  });

  it('BG-U040: should reject hex color with 8-character format (#rrggbbaa)', () => {
    expect(() => control.setCustomColor('#ff000080')).toThrow();
  });

  it('BG-U041: should reject empty string as color', () => {
    expect(() => control.setCustomColor('')).toThrow();
  });

  it('BG-U042: should reject hex color with hash only', () => {
    expect(() => control.setCustomColor('#')).toThrow();
  });

  it('BG-U043: cycle from custom should go to black (index 0)', () => {
    control.setCustomColor('#ff0000');
    expect(control.getState().pattern).toBe('custom');

    control.cyclePattern();
    expect(control.getState().pattern).toBe('black');
  });

  it('BG-U044: cycle from white should go to black (not in cycle order)', () => {
    control.setPattern('white');
    control.cyclePattern();
    expect(control.getState().pattern).toBe('black');
  });

  it('BG-U045: toggle checkerboard should preserve custom color pattern as previous', () => {
    control.setCustomColor('#ff0000');
    expect(control.getState().pattern).toBe('custom');

    control.toggleCheckerboard();
    expect(control.getState().pattern).toBe('checker');

    control.toggleCheckerboard();
    expect(control.getState().pattern).toBe('custom');
  });

  it('BG-U046: double toggle checkerboard from checker should restore black', () => {
    control.setPattern('checker');
    // previousPattern was 'black' by default when moving to checker

    control.toggleCheckerboard(); // off -> back to black
    expect(control.getState().pattern).toBe('black');

    control.toggleCheckerboard(); // on -> checker
    expect(control.getState().pattern).toBe('checker');
  });

  it('BG-U047: isActive should return true for custom pattern', () => {
    control.setCustomColor('#ff0000');
    expect(control.isActive()).toBe(true);
  });

  it('BG-U048: isActive should return true for white pattern', () => {
    control.setPattern('white');
    expect(control.isActive()).toBe(true);
  });

  it('BG-U049: isActive should return true for crosshatch pattern', () => {
    control.setPattern('crosshatch');
    expect(control.isActive()).toBe(true);
  });

  it('BG-U050: keyboard handler should not handle B without shift', () => {
    const handled = control.handleKeyboard('B', false, false);
    expect(handled).toBe(false);
    expect(control.getState().pattern).toBe('black');
  });

  it('BG-U051: keyboard handler should not handle B with alt only', () => {
    const handled = control.handleKeyboard('B', false, true);
    expect(handled).toBe(false);
    expect(control.getState().pattern).toBe('black');
  });

  it('BG-U052: button should have aria-haspopup attribute', () => {
    const element = control.render();
    const button = element.querySelector('[data-testid="background-pattern-button"]') as HTMLButtonElement;
    expect(button.getAttribute('aria-haspopup')).toBe('true');
  });

  it('BG-U053: button should have aria-expanded=false by default', () => {
    const element = control.render();
    const button = element.querySelector('[data-testid="background-pattern-button"]') as HTMLButtonElement;
    expect(button.getAttribute('aria-expanded')).toBe('false');
  });

  it('BG-U054: stateChanged event should emit a copy, not reference to internal state', () => {
    const callback = vi.fn();
    control.on('stateChanged', callback);

    control.setPattern('grey18');

    const emittedState = callback.mock.calls[0]![0] as BackgroundPatternState;
    emittedState.pattern = 'crosshatch';

    // Internal state should not be affected by mutation of emitted state
    expect(control.getState().pattern).toBe('grey18');
  });

  it('BG-U055: should handle setting same pattern twice without errors', () => {
    control.setPattern('checker');
    control.setPattern('checker');
    expect(control.getState().pattern).toBe('checker');
  });

  it('BG-U056: setCustomColor with 3-char hex should store the short form', () => {
    control.setCustomColor('#abc');
    expect(control.getState().customColor).toBe('#abc');
    expect(control.getState().pattern).toBe('custom');
  });

  it('BG-U057: dispose should remove all event listeners', () => {
    const callback = vi.fn();
    control.on('stateChanged', callback);

    control.dispose();

    // After dispose, setting pattern should not trigger callback
    // (this tests removeAllListeners was called)
    // We need to use the internal method directly since dispose may clear things
    // The event emitter should have no listeners
    control.setPattern('checker');
    expect(callback).not.toHaveBeenCalled();
  });

  it('BG-U058: clearPatternCache should not throw when called', () => {
    expect(() => clearPatternCache()).not.toThrow();
  });
});
