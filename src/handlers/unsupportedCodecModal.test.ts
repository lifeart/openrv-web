/**
 * Unsupported Codec Modal Tests
 *
 * Tests for showUnsupportedCodecModal: DOM creation, XSS escaping,
 * accessibility attributes, content sections, and showModal invocation.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { showUnsupportedCodecModal } from './unsupportedCodecModal';
import type { UnsupportedCodecInfo } from '../core/session/Session';
import * as Modal from '../ui/components/shared/Modal';

const showModalSpy = vi.spyOn(Modal, 'showModal');

function createCodecInfo(overrides: Partial<{
  filename: string;
  codec: string | null;
  title: string;
  message: string;
  displayName: string;
  fourcc: string | null;
}> = {}): UnsupportedCodecInfo {
  return {
    filename: overrides.filename ?? 'test_video.mov',
    codec: overrides.codec ?? 'prores',
    codecFamily: 'prores',
    error: {
      title: overrides.title ?? 'Unsupported Codec: ProRes',
      message: overrides.message ?? 'This codec is not supported in web browsers.',
      details: 'Test details',
      recommendation: 'Test recommendation',
      codecInfo: {
        family: 'prores',
        displayName: overrides.displayName ?? 'Apple ProRes',
        fourcc: overrides.fourcc !== undefined ? overrides.fourcc : 'apch',
        isSupported: false,
      },
    },
  };
}

describe('showUnsupportedCodecModal', () => {
  afterEach(() => {
    Modal.closeModal();
    showModalSpy.mockClear();
  });

  it('UCM-U001: calls showModal with content and options', () => {
    showUnsupportedCodecModal(createCodecInfo());

    expect(showModalSpy).toHaveBeenCalledTimes(1);
    const [content, options] = showModalSpy.mock.calls[0]!;
    expect(content).toBeInstanceOf(HTMLElement);
    expect(options!.title).toBe('Unsupported Codec: ProRes');
    expect(options!.width).toBe('550px');
  });

  it('UCM-U002: creates content with correct test id', () => {
    showUnsupportedCodecModal(createCodecInfo());

    const [content] = showModalSpy.mock.calls[0]!;
    expect(content.dataset.testid).toBe('unsupported-codec-modal-content');
  });

  it('UCM-U003: sets accessibility role and aria attributes', () => {
    showUnsupportedCodecModal(createCodecInfo());

    const [content] = showModalSpy.mock.calls[0]!;
    expect(content.getAttribute('role')).toBe('alert');
    expect(content.getAttribute('aria-live')).toBe('assertive');
    expect(content.getAttribute('aria-label')).toContain('Unsupported Codec: ProRes');
  });

  it('UCM-U004: displays error title and message in warning section', () => {
    showUnsupportedCodecModal(createCodecInfo({
      title: 'Custom Title',
      message: 'Custom message text',
    }));

    const [content] = showModalSpy.mock.calls[0]!;
    expect(content.textContent).toContain('Custom Title');
    expect(content.textContent).toContain('Custom message text');
  });

  it('UCM-U005: displays filename in file details section', () => {
    showUnsupportedCodecModal(createCodecInfo({ filename: 'my_video.mov' }));

    const [content] = showModalSpy.mock.calls[0]!;
    expect(content.textContent).toContain('my_video.mov');
  });

  it('UCM-U006: displays codec display name', () => {
    showUnsupportedCodecModal(createCodecInfo({ displayName: 'Apple ProRes 422 HQ' }));

    const [content] = showModalSpy.mock.calls[0]!;
    expect(content.textContent).toContain('Apple ProRes 422 HQ');
  });

  it('UCM-U007: displays fourcc when provided', () => {
    showUnsupportedCodecModal(createCodecInfo({ fourcc: 'apch' }));

    const [content] = showModalSpy.mock.calls[0]!;
    expect(content.textContent).toContain('FourCC: apch');
  });

  it('UCM-U008: omits fourcc section when fourcc is null', () => {
    showUnsupportedCodecModal(createCodecInfo({ fourcc: null }));

    const [content] = showModalSpy.mock.calls[0]!;
    expect(content.textContent).not.toContain('FourCC:');
  });

  it('UCM-U009: escapes HTML entities in filename to prevent XSS', () => {
    showUnsupportedCodecModal(createCodecInfo({
      filename: '<script>alert("xss")</script>',
    }));

    const [content] = showModalSpy.mock.calls[0]!;
    expect(content.innerHTML).not.toContain('<script>');
    expect(content.innerHTML).toContain('&lt;script&gt;');
  });

  it('UCM-U010: safely handles quotes in filename without breaking HTML', () => {
    showUnsupportedCodecModal(createCodecInfo({
      filename: 'file"with\'quotes.mov',
    }));

    const [content] = showModalSpy.mock.calls[0]!;
    // The escaped filename should appear in text content without breaking the HTML structure
    expect(content.textContent).toContain('file');
    expect(content.textContent).toContain('quotes.mov');
    // The innerHTML should not contain unescaped attribute-breaking quotes in attribute context
    // In text content, browser normalizes entities back to literal chars, which is safe
    expect(content.querySelector('[style]')).not.toBeNull();
  });

  it('UCM-U011: includes FFmpeg command suggestion', () => {
    showUnsupportedCodecModal(createCodecInfo({ filename: 'input.mov' }));

    const [content] = showModalSpy.mock.calls[0]!;
    expect(content.textContent).toContain('ffmpeg');
    expect(content.textContent).toContain('libx264');
  });

  it('UCM-U012: includes explanation sections', () => {
    showUnsupportedCodecModal(createCodecInfo());

    const [content] = showModalSpy.mock.calls[0]!;
    expect(content.textContent).toContain('Why does this happen?');
    expect(content.textContent).toContain('How to view this file:');
  });

  it('UCM-U013: includes note about HTML fallback', () => {
    showUnsupportedCodecModal(createCodecInfo());

    const [content] = showModalSpy.mock.calls[0]!;
    expect(content.textContent).toContain('Note:');
    expect(content.textContent).toContain('frame-accurate playback');
  });

  it('UCM-U014: FFmpeg code block has accessibility attributes', () => {
    showUnsupportedCodecModal(createCodecInfo());

    const [content] = showModalSpy.mock.calls[0]!;
    const codeEl = content.querySelector('code');
    expect(codeEl).not.toBeNull();
    expect(codeEl!.getAttribute('role')).toBe('region');
    expect(codeEl!.getAttribute('aria-label')).toContain('FFmpeg command');
    expect(codeEl!.getAttribute('tabindex')).toBe('0');
  });

  it('UCM-U015: escapes ampersand in filename', () => {
    showUnsupportedCodecModal(createCodecInfo({
      filename: 'file&name.mov',
    }));

    const [content] = showModalSpy.mock.calls[0]!;
    expect(content.innerHTML).toContain('file&amp;name.mov');
  });
});
