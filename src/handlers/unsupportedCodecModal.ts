/**
 * Unsupported codec modal: displays a detailed error modal when a video
 * codec is not supported in the browser (e.g., ProRes, DNxHD).
 */

import type { UnsupportedCodecInfo } from '../core/session/Session';
import { showModal } from '../ui/components/shared/Modal';

/**
 * Show a modal explaining that the video codec is not supported in browsers.
 */
export function showUnsupportedCodecModal(info: UnsupportedCodecInfo): void {
  const content = document.createElement('div');
  content.dataset.testid = 'unsupported-codec-modal-content';
  content.setAttribute('role', 'alert');
  content.setAttribute('aria-live', 'assertive');
  content.setAttribute('aria-label', `Unsupported codec error: ${info.error.title}`);
  content.style.cssText = `
    max-height: 70vh;
    overflow-y: auto;
    padding: 8px;
    font-size: 13px;
    line-height: 1.6;
    color: var(--text-primary);
  `;

  // Warning icon and message
  const warningSection = document.createElement('div');
  warningSection.style.cssText = `
    display: flex;
    align-items: flex-start;
    gap: 12px;
    margin-bottom: 16px;
    padding: 12px;
    background: rgba(var(--warning), 0.1);
    border: 1px solid var(--warning);
    border-radius: 6px;
  `;

  const warningIcon = document.createElement('div');
  warningIcon.textContent = '\u26A0';
  warningIcon.style.cssText = 'font-size: 24px; line-height: 1;';

  const warningText = document.createElement('div');
  warningText.innerHTML = `
    <strong>${info.error.title}</strong><br>
    ${info.error.message}
  `;

  warningSection.appendChild(warningIcon);
  warningSection.appendChild(warningText);
  content.appendChild(warningSection);

  // Escape filename for security (prevent XSS) - used in multiple places below
  const escapedFilename = info.filename.replace(/[&<>"']/g, (char) => {
    const entities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    };
    return entities[char] || char;
  });

  // File info
  const fileSection = document.createElement('div');
  fileSection.style.cssText = 'margin-bottom: 16px;';
  fileSection.innerHTML = `
    <div style="margin-bottom: 8px;"><strong>File Details:</strong></div>
    <div style="background: var(--bg-hover); padding: 10px; border-radius: 4px; font-family: monospace; font-size: 12px;">
      <div>File: ${escapedFilename}</div>
      <div>Codec: ${info.error.codecInfo.displayName}</div>
      ${info.error.codecInfo.fourcc ? `<div>FourCC: ${info.error.codecInfo.fourcc}</div>` : ''}
    </div>
  `;
  content.appendChild(fileSection);

  // Why section
  const whySection = document.createElement('div');
  whySection.style.cssText = 'margin-bottom: 16px;';
  whySection.innerHTML = `
    <div style="margin-bottom: 8px;"><strong>Why does this happen?</strong></div>
    <ul style="margin: 0; padding-left: 20px; color: var(--text-secondary);">
      <li>ProRes and DNxHD are professional editing codecs</li>
      <li>Web browsers support consumer codecs (H.264, VP9, AV1)</li>
      <li>Professional codecs require native applications or transcoding</li>
    </ul>
  `;
  content.appendChild(whySection);

  // Solution section
  const solutionSection = document.createElement('div');
  solutionSection.style.cssText = 'margin-bottom: 8px;';
  solutionSection.innerHTML = `
    <div style="margin-bottom: 8px;"><strong>How to view this file:</strong></div>
    <div style="background: var(--bg-secondary); padding: 12px; border-radius: 4px; border: 1px solid var(--border-primary);">
      <div style="margin-bottom: 8px; color: var(--text-secondary);">Transcode to a web-compatible format using FFmpeg:</div>
      <code
        role="region"
        aria-label="FFmpeg command to transcode video"
        tabindex="0"
        style="
          display: block;
          background: var(--bg-primary);
          padding: 8px;
          border-radius: 3px;
          font-size: 11px;
          white-space: pre-wrap;
          word-break: break-all;
          color: var(--accent-primary);
        ">ffmpeg -i "${escapedFilename}" -c:v libx264 -crf 18 -preset slow -c:a aac output.mp4</code>
    </div>
  `;
  content.appendChild(solutionSection);

  // Note about HTML fallback
  const noteSection = document.createElement('div');
  noteSection.style.cssText = `
    margin-top: 16px;
    padding: 10px;
    background: var(--bg-tertiary);
    border-radius: 4px;
    font-size: 12px;
    color: var(--text-muted);
  `;
  noteSection.innerHTML = `
    <strong>Note:</strong> The file may partially load if your browser has native support,
    but frame-accurate playback and scrubbing will not be available.
  `;
  content.appendChild(noteSection);

  showModal(content, {
    title: info.error.title,
    width: '550px',
  });
}
