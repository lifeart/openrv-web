/**
 * ChannelSelect Unit Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  ChannelSelect,
  ChannelMode,
  CHANNEL_LABELS,
  CHANNEL_SHORTCUTS,
  LUMINANCE_COEFFICIENTS,
  applyChannelIsolation,
  getChannelValue,
} from './ChannelSelect';

describe('ChannelSelect', () => {
  let control: ChannelSelect;

  beforeEach(() => {
    control = new ChannelSelect();
  });

  afterEach(() => {
    control.dispose();
  });

  describe('initialization', () => {
    it('CH-001: starts with RGB channel selected', () => {
      expect(control.getChannel()).toBe('rgb');
    });

    it('CH-002: renders container element', () => {
      const element = control.render();
      expect(element).toBeInstanceOf(HTMLElement);
      expect(element.className).toBe('channel-select');
    });

    it('CH-003: creates buttons for all channels', () => {
      const element = control.render();
      const buttons = element.querySelectorAll('button');
      expect(buttons.length).toBe(6); // rgb, red, green, blue, alpha, luminance
    });
  });

  describe('setChannel', () => {
    it('CH-004: changes channel and emits event', () => {
      const handler = vi.fn();
      control.on('channelChanged', handler);

      control.setChannel('red');

      expect(control.getChannel()).toBe('red');
      expect(handler).toHaveBeenCalledWith('red');
    });

    it('CH-005: does not emit event if channel unchanged', () => {
      const handler = vi.fn();
      control.on('channelChanged', handler);

      control.setChannel('rgb'); // Already rgb

      expect(handler).not.toHaveBeenCalled();
    });

    it('CH-006: sets all valid channels', () => {
      const channels: ChannelMode[] = ['rgb', 'red', 'green', 'blue', 'alpha', 'luminance'];

      for (const channel of channels) {
        control.setChannel(channel);
        expect(control.getChannel()).toBe(channel);
      }
    });
  });

  describe('cycleChannel', () => {
    it('CH-007: cycles through all channels in order', () => {
      const expectedOrder: ChannelMode[] = ['red', 'green', 'blue', 'alpha', 'luminance', 'rgb'];

      for (const expected of expectedOrder) {
        control.cycleChannel();
        expect(control.getChannel()).toBe(expected);
      }
    });

    it('CH-008: wraps back to rgb after luminance', () => {
      control.setChannel('luminance');
      control.cycleChannel();
      expect(control.getChannel()).toBe('rgb');
    });
  });

  describe('reset', () => {
    it('CH-009: resets to RGB channel', () => {
      control.setChannel('red');
      control.reset();
      expect(control.getChannel()).toBe('rgb');
    });

    it('CH-010: emits event when resetting from non-RGB', () => {
      control.setChannel('red');
      const handler = vi.fn();
      control.on('channelChanged', handler);

      control.reset();

      expect(handler).toHaveBeenCalledWith('rgb');
    });
  });

  describe('handleKeyboard', () => {
    it('CH-011: Shift+R selects red channel', () => {
      const handled = control.handleKeyboard('R', true);
      expect(handled).toBe(true);
      expect(control.getChannel()).toBe('red');
    });

    it('CH-012: Shift+G selects green channel', () => {
      const handled = control.handleKeyboard('G', true);
      expect(handled).toBe(true);
      expect(control.getChannel()).toBe('green');
    });

    it('CH-013: Shift+B selects blue channel', () => {
      const handled = control.handleKeyboard('B', true);
      expect(handled).toBe(true);
      expect(control.getChannel()).toBe('blue');
    });

    it('CH-014: Shift+A selects alpha channel', () => {
      const handled = control.handleKeyboard('A', true);
      expect(handled).toBe(true);
      expect(control.getChannel()).toBe('alpha');
    });

    it('CH-015: Shift+L selects luminance channel', () => {
      const handled = control.handleKeyboard('L', true);
      expect(handled).toBe(true);
      expect(control.getChannel()).toBe('luminance');
    });

    it('CH-016: Shift+N selects RGB (normal) channel', () => {
      control.setChannel('red');
      const handled = control.handleKeyboard('N', true);
      expect(handled).toBe(true);
      expect(control.getChannel()).toBe('rgb');
    });

    it('CH-017: handles lowercase keys', () => {
      const handled = control.handleKeyboard('r', true);
      expect(handled).toBe(true);
      expect(control.getChannel()).toBe('red');
    });

    it('CH-018: ignores keys without shift', () => {
      const handled = control.handleKeyboard('R', false);
      expect(handled).toBe(false);
      expect(control.getChannel()).toBe('rgb');
    });

    it('CH-019: ignores unknown keys', () => {
      const handled = control.handleKeyboard('X', true);
      expect(handled).toBe(false);
    });
  });
});

describe('CHANNEL_LABELS', () => {
  it('CH-020: has labels for all channels', () => {
    expect(CHANNEL_LABELS.rgb).toBe('RGB');
    expect(CHANNEL_LABELS.red).toBe('R');
    expect(CHANNEL_LABELS.green).toBe('G');
    expect(CHANNEL_LABELS.blue).toBe('B');
    expect(CHANNEL_LABELS.alpha).toBe('A');
    expect(CHANNEL_LABELS.luminance).toBe('Luma');
  });
});

describe('CHANNEL_SHORTCUTS', () => {
  it('CH-021: has shortcuts for channel selection', () => {
    expect(CHANNEL_SHORTCUTS['R']).toBe('red');
    expect(CHANNEL_SHORTCUTS['G']).toBe('green');
    expect(CHANNEL_SHORTCUTS['B']).toBe('blue');
    expect(CHANNEL_SHORTCUTS['A']).toBe('alpha');
    expect(CHANNEL_SHORTCUTS['L']).toBe('luminance');
    expect(CHANNEL_SHORTCUTS['N']).toBe('rgb');
  });
});

describe('LUMINANCE_COEFFICIENTS', () => {
  it('CH-022: has Rec.709 luminance coefficients', () => {
    expect(LUMINANCE_COEFFICIENTS.r).toBe(0.2126);
    expect(LUMINANCE_COEFFICIENTS.g).toBe(0.7152);
    expect(LUMINANCE_COEFFICIENTS.b).toBe(0.0722);
  });

  it('CH-023: coefficients sum to approximately 1', () => {
    const sum = LUMINANCE_COEFFICIENTS.r + LUMINANCE_COEFFICIENTS.g + LUMINANCE_COEFFICIENTS.b;
    expect(sum).toBeCloseTo(1, 4);
  });
});

describe('applyChannelIsolation', () => {
  function createTestImageData(width: number, height: number, fill?: { r: number; g: number; b: number; a: number }): ImageData {
    const data = new Uint8ClampedArray(width * height * 4);
    if (fill) {
      for (let i = 0; i < data.length; i += 4) {
        data[i] = fill.r;
        data[i + 1] = fill.g;
        data[i + 2] = fill.b;
        data[i + 3] = fill.a;
      }
    }
    return new ImageData(data, width, height);
  }

  it('CH-024: RGB mode leaves data unchanged', () => {
    const imageData = createTestImageData(2, 2, { r: 100, g: 150, b: 200, a: 255 });
    const originalData = new Uint8ClampedArray(imageData.data);

    applyChannelIsolation(imageData, 'rgb');

    expect(imageData.data).toEqual(originalData);
  });

  it('CH-025: red channel shows R value as grayscale', () => {
    const imageData = createTestImageData(1, 1, { r: 100, g: 150, b: 200, a: 255 });

    applyChannelIsolation(imageData, 'red');

    expect(imageData.data[0]).toBe(100); // R
    expect(imageData.data[1]).toBe(100); // G becomes R
    expect(imageData.data[2]).toBe(100); // B becomes R
    expect(imageData.data[3]).toBe(255); // A unchanged
  });

  it('CH-026: green channel shows G value as grayscale', () => {
    const imageData = createTestImageData(1, 1, { r: 100, g: 150, b: 200, a: 255 });

    applyChannelIsolation(imageData, 'green');

    expect(imageData.data[0]).toBe(150); // R becomes G
    expect(imageData.data[1]).toBe(150); // G
    expect(imageData.data[2]).toBe(150); // B becomes G
    expect(imageData.data[3]).toBe(255); // A unchanged
  });

  it('CH-027: blue channel shows B value as grayscale', () => {
    const imageData = createTestImageData(1, 1, { r: 100, g: 150, b: 200, a: 255 });

    applyChannelIsolation(imageData, 'blue');

    expect(imageData.data[0]).toBe(200); // R becomes B
    expect(imageData.data[1]).toBe(200); // G becomes B
    expect(imageData.data[2]).toBe(200); // B
    expect(imageData.data[3]).toBe(255); // A unchanged
  });

  it('CH-028: alpha channel shows A value as grayscale with full opacity', () => {
    const imageData = createTestImageData(1, 1, { r: 100, g: 150, b: 200, a: 128 });

    applyChannelIsolation(imageData, 'alpha');

    expect(imageData.data[0]).toBe(128); // R becomes A
    expect(imageData.data[1]).toBe(128); // G becomes A
    expect(imageData.data[2]).toBe(128); // B becomes A
    expect(imageData.data[3]).toBe(255); // A becomes fully opaque
  });

  it('CH-029: luminance calculates Rec.709 correctly', () => {
    const imageData = createTestImageData(1, 1, { r: 100, g: 150, b: 200, a: 255 });

    applyChannelIsolation(imageData, 'luminance');

    // Expected: 0.2126 * 100 + 0.7152 * 150 + 0.0722 * 200 = 142.98
    const expectedLuma = Math.round(0.2126 * 100 + 0.7152 * 150 + 0.0722 * 200);

    expect(imageData.data[0]).toBe(expectedLuma); // R
    expect(imageData.data[1]).toBe(expectedLuma); // G
    expect(imageData.data[2]).toBe(expectedLuma); // B
  });

  it('CH-030: handles pure red pixel correctly for luminance', () => {
    const imageData = createTestImageData(1, 1, { r: 255, g: 0, b: 0, a: 255 });

    applyChannelIsolation(imageData, 'luminance');

    const expectedLuma = Math.round(0.2126 * 255);
    expect(imageData.data[0]).toBe(expectedLuma);
    expect(imageData.data[1]).toBe(expectedLuma);
    expect(imageData.data[2]).toBe(expectedLuma);
  });

  it('CH-031: handles pure green pixel correctly for luminance', () => {
    const imageData = createTestImageData(1, 1, { r: 0, g: 255, b: 0, a: 255 });

    applyChannelIsolation(imageData, 'luminance');

    const expectedLuma = Math.round(0.7152 * 255);
    expect(imageData.data[0]).toBe(expectedLuma);
    expect(imageData.data[1]).toBe(expectedLuma);
    expect(imageData.data[2]).toBe(expectedLuma);
  });

  it('CH-032: handles pure blue pixel correctly for luminance', () => {
    const imageData = createTestImageData(1, 1, { r: 0, g: 0, b: 255, a: 255 });

    applyChannelIsolation(imageData, 'luminance');

    const expectedLuma = Math.round(0.0722 * 255);
    expect(imageData.data[0]).toBe(expectedLuma);
    expect(imageData.data[1]).toBe(expectedLuma);
    expect(imageData.data[2]).toBe(expectedLuma);
  });

  it('CH-033: processes multiple pixels correctly', () => {
    const imageData = createTestImageData(2, 2);
    // Set different values for each pixel
    imageData.data[0] = 100; imageData.data[1] = 0; imageData.data[2] = 0; imageData.data[3] = 255;
    imageData.data[4] = 0; imageData.data[5] = 150; imageData.data[6] = 0; imageData.data[7] = 255;
    imageData.data[8] = 0; imageData.data[9] = 0; imageData.data[10] = 200; imageData.data[11] = 255;
    imageData.data[12] = 50; imageData.data[13] = 100; imageData.data[14] = 150; imageData.data[15] = 255;

    applyChannelIsolation(imageData, 'red');

    // Check each pixel's R channel was extracted
    expect(imageData.data[0]).toBe(100);
    expect(imageData.data[1]).toBe(100);
    expect(imageData.data[2]).toBe(100);

    expect(imageData.data[4]).toBe(0);
    expect(imageData.data[5]).toBe(0);
    expect(imageData.data[6]).toBe(0);

    expect(imageData.data[8]).toBe(0);
    expect(imageData.data[9]).toBe(0);
    expect(imageData.data[10]).toBe(0);

    expect(imageData.data[12]).toBe(50);
    expect(imageData.data[13]).toBe(50);
    expect(imageData.data[14]).toBe(50);
  });
});

describe('getChannelValue', () => {
  function createTestImageData(): ImageData {
    const data = new Uint8ClampedArray([
      100, 150, 200, 128 // Single pixel: R=100, G=150, B=200, A=128
    ]);
    return new ImageData(data, 1, 1);
  }

  it('CH-034: returns red value for red channel', () => {
    const imageData = createTestImageData();
    expect(getChannelValue(imageData, 0, 0, 'red')).toBe(100);
  });

  it('CH-035: returns green value for green channel', () => {
    const imageData = createTestImageData();
    expect(getChannelValue(imageData, 0, 0, 'green')).toBe(150);
  });

  it('CH-036: returns blue value for blue channel', () => {
    const imageData = createTestImageData();
    expect(getChannelValue(imageData, 0, 0, 'blue')).toBe(200);
  });

  it('CH-037: returns alpha value for alpha channel', () => {
    const imageData = createTestImageData();
    expect(getChannelValue(imageData, 0, 0, 'alpha')).toBe(128);
  });

  it('CH-038: returns luminance value for luminance channel', () => {
    const imageData = createTestImageData();
    const expectedLuma = Math.round(0.2126 * 100 + 0.7152 * 150 + 0.0722 * 200);
    expect(getChannelValue(imageData, 0, 0, 'luminance')).toBe(expectedLuma);
  });

  it('CH-039: returns luminance for rgb channel (brightness)', () => {
    const imageData = createTestImageData();
    const expectedLuma = Math.round(0.2126 * 100 + 0.7152 * 150 + 0.0722 * 200);
    expect(getChannelValue(imageData, 0, 0, 'rgb')).toBe(expectedLuma);
  });
});
