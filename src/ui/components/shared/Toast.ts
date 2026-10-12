/**
 * Toast - non-blocking, auto-dismissing notifications.
 *
 * Use for success / informational confirmations that do not need the user to
 * acknowledge them ("Snapshot created", "Exported 120 frames"). Errors and
 * warnings that require attention should keep using `showAlert` from
 * `./Modal`.
 *
 * Toasts stack at the top-center of the window (below the header / tab bar),
 * are announced through an `aria-live="polite"` region, dismiss themselves
 * after `duration` ms, and can be dismissed early by clicking them.
 *
 * ```ts
 * import { showToast } from './shared/Toast';
 * showToast('Snapshot "Shot 10" created', { type: 'success' });
 * ```
 */

import { getIconSvg } from './Icons';
import { SHADOWS, Z_INDEX } from './theme';

export type ToastType = 'info' | 'success' | 'warning' | 'error';

export interface ToastOptions {
  /** Visual style / icon. Default: 'info'. */
  type?: ToastType;
  /**
   * Time in ms before the toast auto-dismisses. Default: 4000.
   * Pass 0 (or a negative value) to keep it until clicked or dismissed.
   */
  duration?: number;
}

export interface ToastHandle {
  /** The toast element (useful for tests). */
  readonly element: HTMLElement;
  /** Dismiss the toast immediately. Safe to call more than once. */
  dismiss(): void;
}

export const DEFAULT_TOAST_DURATION_MS = 4000;
/** Maximum number of toasts kept on screen; the oldest is dropped first. */
export const MAX_VISIBLE_TOASTS = 4;

export const TOAST_CONTAINER_ID = 'toast-container';

const ICONS = {
  info: 'info',
  success: 'check-circle',
  warning: 'warning',
  error: 'error',
} as const;

const ACCENT_VARS: Record<ToastType, string> = {
  info: 'var(--accent-primary)',
  success: 'var(--success)',
  warning: 'var(--warning)',
  error: 'var(--error)',
};

interface ActiveToast {
  element: HTMLElement;
  timer: ReturnType<typeof setTimeout> | null;
  dismissed: boolean;
}

const activeToasts: ActiveToast[] = [];
let container: HTMLElement | null = null;

function getContainer(): HTMLElement {
  if (container && container.isConnected) return container;

  container = document.createElement('div');
  container.id = TOAST_CONTAINER_ID;
  container.dataset.testid = 'toast-container';
  container.setAttribute('role', 'status');
  container.setAttribute('aria-live', 'polite');
  container.setAttribute('aria-atomic', 'false');
  container.style.cssText = `
    position: fixed;
    top: 88px;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    max-width: calc(100vw - 32px);
    pointer-events: none;
    z-index: ${Z_INDEX.toast};
  `;
  document.body.appendChild(container);
  return container;
}

function removeToast(entry: ActiveToast): void {
  if (entry.dismissed) return;
  entry.dismissed = true;
  if (entry.timer !== null) {
    clearTimeout(entry.timer);
    entry.timer = null;
  }
  const index = activeToasts.indexOf(entry);
  if (index !== -1) activeToasts.splice(index, 1);
  entry.element.remove();

  if (activeToasts.length === 0 && container) {
    container.remove();
    container = null;
  }
}

/**
 * Show a non-blocking toast notification.
 */
export function showToast(message: string, options: ToastOptions = {}): ToastHandle {
  const type: ToastType = options.type ?? 'info';
  const duration = options.duration ?? DEFAULT_TOAST_DURATION_MS;

  const host = getContainer();

  const element = document.createElement('div');
  element.className = `toast toast-${type}`;
  element.dataset.testid = 'toast';
  element.dataset.toastType = type;
  element.title = 'Click to dismiss';
  element.style.cssText = `
    display: flex;
    align-items: flex-start;
    gap: 8px;
    min-width: 200px;
    max-width: 480px;
    padding: 8px 12px;
    background: var(--bg-secondary);
    color: var(--text-primary);
    border: 1px solid var(--border-primary);
    border-left: 3px solid ${ACCENT_VARS[type]};
    border-radius: 6px;
    box-shadow: ${SHADOWS.dropdown};
    font-size: 12px;
    line-height: 1.4;
    white-space: pre-wrap;
    cursor: pointer;
    pointer-events: auto;
  `;

  const icon = document.createElement('span');
  icon.setAttribute('aria-hidden', 'true');
  icon.innerHTML = getIconSvg(ICONS[type], 'sm');
  icon.style.cssText = `display: inline-flex; flex-shrink: 0; margin-top: 1px; color: ${ACCENT_VARS[type]};`;

  const text = document.createElement('span');
  text.className = 'toast-message';
  text.textContent = message;

  element.appendChild(icon);
  element.appendChild(text);

  const entry: ActiveToast = { element, timer: null, dismissed: false };
  const dismiss = (): void => removeToast(entry);
  element.addEventListener('click', dismiss);

  host.appendChild(element);
  activeToasts.push(entry);

  // Cap the stack so a burst of notifications cannot cover the viewer.
  while (activeToasts.length > MAX_VISIBLE_TOASTS) {
    const oldest = activeToasts[0];
    if (!oldest) break;
    removeToast(oldest);
  }

  if (duration > 0) {
    entry.timer = setTimeout(dismiss, duration);
  }

  return { element, dismiss };
}

/**
 * Dismiss every visible toast. Mainly for tests and teardown.
 */
export function dismissAllToasts(): void {
  for (const entry of [...activeToasts]) {
    removeToast(entry);
  }
  if (container) {
    container.remove();
    container = null;
  }
}
