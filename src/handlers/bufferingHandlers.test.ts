import { describe, it, expect, vi, afterEach } from 'vitest';
import { handleBufferingChanged, handleFrameDecodeTimeout, cleanupBufferingOverlay } from './bufferingHandlers';

// Mock the Modal module
vi.mock('../ui/components/shared/Modal', () => ({
  showAlert: vi.fn(() => Promise.resolve()),
}));

import { showAlert } from '../ui/components/shared/Modal';

describe('bufferingHandlers', () => {
  afterEach(() => {
    cleanupBufferingOverlay();
    vi.clearAllMocks();
  });

  // -----------------------------------------------------------------------
  // handleBufferingChanged
  // -----------------------------------------------------------------------
  describe('handleBufferingChanged', () => {
    it('BUF-001: shows buffering overlay when called with true', () => {
      handleBufferingChanged(true);

      const overlay = document.querySelector('[data-testid="buffering-overlay"]');
      expect(overlay).not.toBeNull();
      expect(overlay!.getAttribute('role')).toBe('status');
      expect(overlay!.getAttribute('aria-label')).toBe('Buffering');
    });

    it('BUF-002: overlay contains a spinner element', () => {
      handleBufferingChanged(true);

      const spinner = document.querySelector('[data-testid="buffering-spinner"]');
      expect(spinner).not.toBeNull();
    });

    it('BUF-003: overlay contains "Buffering" text', () => {
      handleBufferingChanged(true);

      const overlay = document.querySelector('[data-testid="buffering-overlay"]');
      expect(overlay!.textContent).toContain('Buffering');
    });

    it('BUF-004: removes buffering overlay when called with false', () => {
      handleBufferingChanged(true);
      expect(document.querySelector('[data-testid="buffering-overlay"]')).not.toBeNull();

      handleBufferingChanged(false);
      expect(document.querySelector('[data-testid="buffering-overlay"]')).toBeNull();
    });

    it('BUF-005: calling with true twice does not create duplicate overlays', () => {
      handleBufferingChanged(true);
      handleBufferingChanged(true);

      const overlays = document.querySelectorAll('[data-testid="buffering-overlay"]');
      expect(overlays.length).toBe(1);
    });

    it('BUF-006: calling with false when no overlay exists does not throw', () => {
      expect(() => handleBufferingChanged(false)).not.toThrow();
    });

    it('BUF-007: show/hide cycle works correctly', () => {
      handleBufferingChanged(true);
      expect(document.querySelector('[data-testid="buffering-overlay"]')).not.toBeNull();

      handleBufferingChanged(false);
      expect(document.querySelector('[data-testid="buffering-overlay"]')).toBeNull();

      handleBufferingChanged(true);
      expect(document.querySelector('[data-testid="buffering-overlay"]')).not.toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // handleFrameDecodeTimeout
  // -----------------------------------------------------------------------
  describe('handleFrameDecodeTimeout', () => {
    it('BUF-010: shows a warning alert with frame number', () => {
      handleFrameDecodeTimeout(42);

      expect(showAlert).toHaveBeenCalledTimes(1);
      expect(showAlert).toHaveBeenCalledWith(
        expect.stringContaining('Frame 42'),
        expect.objectContaining({
          title: 'Frame Decode Timeout',
          type: 'warning',
        }),
      );
    });

    it('BUF-011: alert message mentions skipping', () => {
      handleFrameDecodeTimeout(100);

      const message = vi.mocked(showAlert).mock.calls[0]![0];
      expect(message).toContain('skipped');
    });

    it('BUF-012: works with different frame numbers', () => {
      handleFrameDecodeTimeout(1);
      handleFrameDecodeTimeout(9999);

      expect(showAlert).toHaveBeenCalledTimes(2);
      expect(vi.mocked(showAlert).mock.calls[0]![0]).toContain('Frame 1');
      expect(vi.mocked(showAlert).mock.calls[1]![0]).toContain('Frame 9999');
    });
  });

  // -----------------------------------------------------------------------
  // cleanupBufferingOverlay
  // -----------------------------------------------------------------------
  describe('cleanupBufferingOverlay', () => {
    it('BUF-020: removes overlay if present', () => {
      handleBufferingChanged(true);
      expect(document.querySelector('[data-testid="buffering-overlay"]')).not.toBeNull();

      cleanupBufferingOverlay();
      expect(document.querySelector('[data-testid="buffering-overlay"]')).toBeNull();
    });

    it('BUF-021: is safe to call when no overlay exists', () => {
      expect(() => cleanupBufferingOverlay()).not.toThrow();
    });
  });
});
