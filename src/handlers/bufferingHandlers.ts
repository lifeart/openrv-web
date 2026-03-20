/**
 * Buffering and frame decode timeout handlers.
 *
 * Surfaces `buffering` and `frameDecodeTimeout` session events to the user
 * via a lightweight overlay indicator (buffering) and an alert (decode timeout).
 */

import { showAlert } from '../ui/components/shared/Modal';

// ---------------------------------------------------------------------------
// Buffering overlay
// ---------------------------------------------------------------------------

let bufferingOverlay: HTMLElement | null = null;

/**
 * Show or hide the buffering overlay.
 * When `isBuffering` is true, a translucent overlay with a spinner and
 * "Buffering..." label is appended to `document.body`.
 * When false, the overlay is removed.
 */
export function handleBufferingChanged(isBuffering: boolean): void {
  if (isBuffering) {
    showBufferingOverlay();
  } else {
    hideBufferingOverlay();
  }
}

function showBufferingOverlay(): void {
  if (bufferingOverlay) return; // already visible

  bufferingOverlay = document.createElement('div');
  bufferingOverlay.dataset.testid = 'buffering-overlay';
  bufferingOverlay.setAttribute('role', 'status');
  bufferingOverlay.setAttribute('aria-live', 'polite');
  bufferingOverlay.setAttribute('aria-label', 'Buffering');
  bufferingOverlay.style.cssText = `
    position: fixed;
    bottom: 64px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 10000;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 16px;
    background: rgba(0, 0, 0, 0.75);
    color: #fff;
    border-radius: 6px;
    font-size: 13px;
    font-family: inherit;
    pointer-events: none;
    backdrop-filter: blur(4px);
  `;

  // CSS spinner
  const spinner = document.createElement('div');
  spinner.dataset.testid = 'buffering-spinner';
  spinner.style.cssText = `
    width: 16px;
    height: 16px;
    border: 2px solid rgba(255,255,255,0.3);
    border-top-color: #fff;
    border-radius: 50%;
    animation: openrv-spin 0.8s linear infinite;
  `;

  // Inject keyframes if not present
  if (!document.getElementById('openrv-buffering-keyframes')) {
    const style = document.createElement('style');
    style.id = 'openrv-buffering-keyframes';
    style.textContent = `@keyframes openrv-spin { to { transform: rotate(360deg); } }`;
    document.head.appendChild(style);
  }

  const label = document.createElement('span');
  label.textContent = 'Buffering\u2026';

  bufferingOverlay.appendChild(spinner);
  bufferingOverlay.appendChild(label);
  document.body.appendChild(bufferingOverlay);
}

function hideBufferingOverlay(): void {
  if (bufferingOverlay) {
    bufferingOverlay.remove();
    bufferingOverlay = null;
  }
}

// ---------------------------------------------------------------------------
// Frame decode timeout
// ---------------------------------------------------------------------------

/**
 * Show a brief warning alert when a frame decode times out in
 * play-all-frames mode.
 */
export function handleFrameDecodeTimeout(frame: number): void {
  void showAlert(
    `Frame ${frame} timed out during decoding and was skipped.\n` +
      'This may indicate the file is corrupted or the frame is too complex to decode in time.',
    {
      title: 'Frame Decode Timeout',
      type: 'warning',
    },
  );
}

// ---------------------------------------------------------------------------
// Cleanup (for tests)
// ---------------------------------------------------------------------------

/** Remove any lingering overlay — useful for test teardown. */
export function cleanupBufferingOverlay(): void {
  hideBufferingOverlay();
}
