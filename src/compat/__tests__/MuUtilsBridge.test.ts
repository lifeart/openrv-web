/**
 * Tests for MuUtilsBridge — openUrl popup-blocked detection (Issue #200).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MuUtilsBridge } from '../MuUtilsBridge';

describe('MuUtilsBridge', () => {
  let bridge: MuUtilsBridge;

  beforeEach(() => {
    bridge = new MuUtilsBridge();
  });

  describe('openUrl', () => {
    let openSpy: ReturnType<typeof vi.spyOn>;
    let warnSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      openSpy = vi.spyOn(window, 'open');
      warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    });

    afterEach(() => {
      openSpy.mockRestore();
      warnSpy.mockRestore();
    });

    it('returns true when popup is opened successfully', () => {
      // window.open returns a WindowProxy when successful
      openSpy.mockReturnValue({} as Window);

      const result = bridge.openUrl('https://example.com');

      expect(result).toBe(true);
      expect(openSpy).toHaveBeenCalledWith(
        'https://example.com',
        '_blank',
        'noopener,noreferrer',
      );
      expect(warnSpy).not.toHaveBeenCalled();
    });

    it('returns false when popup is blocked (window.open returns null)', () => {
      openSpy.mockReturnValue(null);

      const result = bridge.openUrl('https://example.com');

      expect(result).toBe(false);
      expect(warnSpy).toHaveBeenCalledOnce();
      expect(warnSpy).toHaveBeenCalledWith(
        '[MuUtilsBridge] Popup blocked for URL: %s',
        'https://example.com',
      );
    });

    it('passes correct arguments to window.open', () => {
      openSpy.mockReturnValue({} as Window);

      bridge.openUrl('https://test.example.org/path?q=1');

      expect(openSpy).toHaveBeenCalledWith(
        'https://test.example.org/path?q=1',
        '_blank',
        'noopener,noreferrer',
      );
    });
  });
});
