/**
 * ExportControl Component Tests
 *
 * Tests for the export dropdown control with single frame, sequence,
 * and session export options.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ExportControl } from './ExportControl';

describe('ExportControl', () => {
  let control: ExportControl;

  beforeEach(() => {
    control = new ExportControl();
  });

  afterEach(() => {
    control.dispose();
  });

  describe('initialization', () => {
    it('EXPORT-U001: creates ExportControl instance', () => {
      expect(control).toBeInstanceOf(ExportControl);
    });
  });

  describe('render', () => {
    it('EXPORT-U010: render returns container element', () => {
      const el = control.render();
      expect(el).toBeInstanceOf(HTMLElement);
    });

    it('EXPORT-U011: container has export-control-container class', () => {
      const el = control.render();
      expect(el.className).toBe('export-control-container');
    });

    it('EXPORT-U012: container has export button', () => {
      const el = control.render();
      const button = el.querySelector('button');
      expect(button).not.toBeNull();
    });

    it('EXPORT-U013: export button displays Export label', () => {
      const el = control.render();
      const button = el.querySelector('button');
      expect(button?.textContent).toContain('Export');
    });

    it('EXPORT-U014: export button has download icon', () => {
      const el = control.render();
      const button = el.querySelector('button');
      expect(button?.innerHTML).toContain('svg');
    });

    it('EXPORT-U015: export button has correct title', () => {
      const el = control.render();
      const button = el.querySelector('button') as HTMLButtonElement;
      expect(button.title).toContain('Ctrl+S');
    });
  });

  describe('quickExport', () => {
    it('EXPORT-U020: quickExport emits exportRequested event', () => {
      const callback = vi.fn();
      control.on('exportRequested', callback);

      control.quickExport();

      expect(callback).toHaveBeenCalled();
    });

    it('EXPORT-U021: quickExport uses png format by default', () => {
      const callback = vi.fn();
      control.on('exportRequested', callback);

      control.quickExport();

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({ format: 'png' })
      );
    });

    it('EXPORT-U022: quickExport can use jpeg format', () => {
      const callback = vi.fn();
      control.on('exportRequested', callback);

      control.quickExport('jpeg');

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({ format: 'jpeg' })
      );
    });

    it('EXPORT-U023: quickExport can use webp format', () => {
      const callback = vi.fn();
      control.on('exportRequested', callback);

      control.quickExport('webp');

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({ format: 'webp' })
      );
    });

    it('EXPORT-U024: quickExport includes quality setting', () => {
      const callback = vi.fn();
      control.on('exportRequested', callback);

      control.quickExport();

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({ quality: expect.any(Number) })
      );
    });

    it('EXPORT-U025: quickExport includes includeAnnotations setting', () => {
      const callback = vi.fn();
      control.on('exportRequested', callback);

      control.quickExport();

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({ includeAnnotations: expect.any(Boolean) })
      );
    });
  });

  describe('dispose', () => {
    it('EXPORT-U030: dispose can be called without error', () => {
      expect(() => control.dispose()).not.toThrow();
    });

    it('EXPORT-U031: dispose can be called multiple times', () => {
      expect(() => {
        control.dispose();
        control.dispose();
      }).not.toThrow();
    });
  });

  describe('event listeners', () => {
    it('EXPORT-U040: exportRequested listener receives event data', () => {
      const callback = vi.fn();
      control.on('exportRequested', callback);
      control.quickExport('png');

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          format: 'png',
          includeAnnotations: expect.any(Boolean),
          quality: expect.any(Number),
        })
      );
    });

    it('EXPORT-U041: copyRequested listener can be registered', () => {
      const callback = vi.fn();
      control.on('copyRequested', callback);
      // Verify listener was added by checking it can be removed without error
      expect(() => control.off('copyRequested', callback)).not.toThrow();
    });

    it('EXPORT-U042: sequenceExportRequested listener can be registered', () => {
      const callback = vi.fn();
      control.on('sequenceExportRequested', callback);
      expect(() => control.off('sequenceExportRequested', callback)).not.toThrow();
    });

    it('EXPORT-U043: rvSessionExportRequested listener can be registered', () => {
      const callback = vi.fn();
      control.on('rvSessionExportRequested', callback);
      expect(() => control.off('rvSessionExportRequested', callback)).not.toThrow();
    });

    it('EXPORT-U044: off removes listener so it is not called', () => {
      const callback = vi.fn();
      control.on('exportRequested', callback);
      control.off('exportRequested', callback);

      control.quickExport();

      expect(callback).not.toHaveBeenCalled();
    });

    it('EXPORT-U045: multiple listeners can be registered for same event', () => {
      const callback1 = vi.fn();
      const callback2 = vi.fn();
      control.on('exportRequested', callback1);
      control.on('exportRequested', callback2);

      control.quickExport();

      expect(callback1).toHaveBeenCalled();
      expect(callback2).toHaveBeenCalled();
    });
  });

  describe('export formats', () => {
    const formats: Array<'png' | 'jpeg' | 'webp'> = ['png', 'jpeg', 'webp'];

    formats.forEach((format) => {
      it(`EXPORT-U050-${format}: quickExport supports ${format} format`, () => {
        const callback = vi.fn();
        control.on('exportRequested', callback);

        control.quickExport(format);

        expect(callback).toHaveBeenCalledWith(
          expect.objectContaining({ format })
        );
      });
    });
  });

  describe('button interactions', () => {
    it('EXPORT-U060: button changes background on mouseenter', () => {
      const el = control.render();
      const button = el.querySelector('button') as HTMLButtonElement;
      const originalBg = button.style.background;

      button.dispatchEvent(new MouseEvent('mouseenter'));

      expect(button.style.background).not.toBe(originalBg);
      expect(button.style.cssText).toContain('var(--bg-hover)'); // #3a3a3a hover
    });

    it('EXPORT-U061: button restores transparent background on mouseleave', () => {
      const el = control.render();
      const button = el.querySelector('button') as HTMLButtonElement;

      button.dispatchEvent(new MouseEvent('mouseenter'));
      button.dispatchEvent(new MouseEvent('mouseleave'));

      expect(button.style.background).toBe('transparent');
    });

    it('EXPORT-U062: button has transparent background initially', () => {
      const el = control.render();
      const button = el.querySelector('button') as HTMLButtonElement;

      expect(button.style.background).toBe('transparent');
    });

    it('EXPORT-U063: button has transparent border initially', () => {
      const el = control.render();
      const button = el.querySelector('button') as HTMLButtonElement;

      expect(button.style.borderColor).toBe('transparent');
    });
  });
});

describe('ExportControl export request structure', () => {
  let control: ExportControl;

  beforeEach(() => {
    control = new ExportControl();
  });

  afterEach(() => {
    control.dispose();
  });

  it('EXPORT-U070: export request has format property', () => {
    const callback = vi.fn();
    control.on('exportRequested', callback);

    control.quickExport('png');

    const [request] = callback.mock.calls[0];
    expect(request).toHaveProperty('format');
    expect(request.format).toBe('png');
  });

  it('EXPORT-U071: export request has includeAnnotations property', () => {
    const callback = vi.fn();
    control.on('exportRequested', callback);

    control.quickExport();

    const [request] = callback.mock.calls[0];
    expect(request).toHaveProperty('includeAnnotations');
  });

  it('EXPORT-U072: export request has quality property', () => {
    const callback = vi.fn();
    control.on('exportRequested', callback);

    control.quickExport();

    const [request] = callback.mock.calls[0];
    expect(request).toHaveProperty('quality');
    expect(typeof request.quality).toBe('number');
  });

  it('EXPORT-U073: quality is between 0 and 1', () => {
    const callback = vi.fn();
    control.on('exportRequested', callback);

    control.quickExport();

    const [request] = callback.mock.calls[0];
    expect(request.quality).toBeGreaterThan(0);
    expect(request.quality).toBeLessThanOrEqual(1);
  });
});
