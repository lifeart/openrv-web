/**
 * Unified Modal Component
 *
 * Native-style modal dialogs for alerts, confirms, and custom content.
 */

import { createButton } from './Button';
import { getIconSvg } from './Icons';
import { SHADOWS } from './theme';
import type { FocusManager } from '../../a11y/FocusManager';

// Module-level focus manager setter to avoid circular deps
let focusManager: FocusManager | null = null;
export function setModalFocusManager(fm: FocusManager): void {
  focusManager = fm;
}

let modalTitleCounter = 0;

export interface ModalOptions {
  title?: string;
  width?: string;
  closable?: boolean;
  onClose?: () => void;
}

export interface AlertOptions extends ModalOptions {
  type?: 'info' | 'success' | 'warning' | 'error';
}

export interface ConfirmOptions extends ModalOptions {
  confirmText?: string;
  cancelText?: string;
  confirmVariant?: 'primary' | 'danger';
}

export interface PromptOptions extends ModalOptions {
  placeholder?: string;
  defaultValue?: string;
  confirmText?: string;
  cancelText?: string;
}

// Singleton container for modals
let modalContainer: HTMLElement | null = null;
let customModalEscapeHandler: ((e: KeyboardEvent) => void) | null = null;
// Pre-trap focus saved when no FocusManager is available (fallback)
let preTrapFocus: Element | null = null;

function cleanupCustomModalEscapeHandler(): void {
  if (customModalEscapeHandler) {
    document.removeEventListener('keydown', customModalEscapeHandler);
    customModalEscapeHandler = null;
  }
}

function getModalContainer(): HTMLElement {
  if (!modalContainer) {
    modalContainer = document.createElement('div');
    modalContainer.id = 'modal-container';
    modalContainer.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      z-index: 10000;
      display: none;
      align-items: center;
      justify-content: center;
      background: rgba(0, 0, 0, 0.6);
      backdrop-filter: blur(2px);
    `;
    document.body.appendChild(modalContainer);
  }
  return modalContainer;
}

function showContainer(): void {
  const container = getModalContainer();
  container.style.display = 'flex';
  if (focusManager) {
    // FocusManager handles saving/restoring focus internally
    focusManager.trapFocus(container);
  } else {
    preTrapFocus = document.activeElement;
  }
}

function hideContainer(): void {
  cleanupCustomModalEscapeHandler();
  if (focusManager) {
    // FocusManager restores focus to the element saved in trapFocus()
    focusManager.releaseFocus();
  } else if (preTrapFocus instanceof HTMLElement) {
    // Fallback: restore focus manually when no FocusManager
    preTrapFocus.focus();
  }
  preTrapFocus = null;
  const container = getModalContainer();
  container.style.display = 'none';
  container.innerHTML = '';
}

function createModalBase(options: ModalOptions = {}): HTMLElement {
  const { title, width = '400px', closable = true, onClose } = options;

  const modalTitleId = `modal-title-${++modalTitleCounter}`;

  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  if (title) {
    modal.setAttribute('aria-labelledby', modalTitleId);
  }
  modal.style.cssText = `
    background: var(--bg-secondary);
    border: 1px solid var(--border-primary);
    border-radius: 8px;
    box-shadow: ${SHADOWS.modal};
    max-width: 90vw;
    max-height: 90vh;
    width: ${width};
    display: flex;
    flex-direction: column;
    animation: modalFadeIn 0.15s ease;
  `;

  // Add animation keyframes
  if (!document.getElementById('modal-styles')) {
    const style = document.createElement('style');
    style.id = 'modal-styles';
    style.textContent = `
      @keyframes modalFadeIn {
        from { opacity: 0; transform: scale(0.95); }
        to { opacity: 1; transform: scale(1); }
      }
    `;
    document.head.appendChild(style);
  }

  // Header
  if (title || closable) {
    const header = document.createElement('div');
    header.style.cssText = `
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px 16px;
      border-bottom: 1px solid var(--border-primary);
    `;

    const titleEl = document.createElement('h3');
    titleEl.id = modalTitleId;
    titleEl.textContent = title || '';
    titleEl.style.cssText = `
      margin: 0;
      font-size: 14px;
      font-weight: 600;
      color: var(--text-primary);
    `;
    header.appendChild(titleEl);

    if (closable) {
      const closeBtn = createButton('', () => {
        hideContainer();
        onClose?.();
      }, {
        variant: 'ghost',
        size: 'sm',
        icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
        title: 'Close',
      });
      header.appendChild(closeBtn);
    }

    modal.appendChild(header);
  }

  return modal;
}

/**
 * Show an alert modal (replaces window.alert)
 */
export function showAlert(message: string, options: AlertOptions = {}): Promise<void> {
  return new Promise((resolve) => {
    cleanupCustomModalEscapeHandler();
    const { title = 'Alert', type = 'info', onClose } = options;

    const container = getModalContainer();
    container.innerHTML = '';

    const modal = createModalBase({ ...options, title, onClose: () => { onClose?.(); resolve(); } });

    // Content
    const content = document.createElement('div');
    content.style.cssText = `
      padding: 16px;
      color: var(--text-primary);
      font-size: 13px;
      line-height: 1.5;
      white-space: pre-wrap;
      max-height: 60vh;
      overflow-y: auto;
    `;

    // Icon based on type
    const iconNames = {
      info: 'info',
      success: 'check-circle',
      warning: 'warning',
      error: 'error',
    } as const;

    const iconSpan = document.createElement('span');
    iconSpan.innerHTML = getIconSvg(iconNames[type], 'md');
    iconSpan.style.cssText = 'margin-right: 8px; vertical-align: middle; display: inline-flex;';

    const messageSpan = document.createElement('span');
    messageSpan.textContent = message;

    content.appendChild(iconSpan);
    content.appendChild(messageSpan);
    modal.appendChild(content);

    // Footer
    const footer = document.createElement('div');
    footer.style.cssText = `
      display: flex;
      justify-content: flex-end;
      padding: 12px 16px;
      border-top: 1px solid var(--border-primary);
      gap: 8px;
    `;

    // Close on Escape or Enter - defined early so button handler can remove it
    const handleKeydown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Enter') {
        hideContainer();
        onClose?.();
        resolve();
        document.removeEventListener('keydown', handleKeydown);
      }
    };

    const okBtn = createButton('OK', () => {
      hideContainer();
      onClose?.();
      resolve();
      document.removeEventListener('keydown', handleKeydown);
    }, { variant: 'primary', minWidth: '80px' });

    footer.appendChild(okBtn);
    modal.appendChild(footer);

    container.appendChild(modal);
    showContainer();

    // Focus OK button
    okBtn.focus();

    document.addEventListener('keydown', handleKeydown);
  });
}

/**
 * Show a confirm modal (replaces window.confirm)
 */
export function showConfirm(message: string, options: ConfirmOptions = {}): Promise<boolean> {
  return new Promise((resolve) => {
    cleanupCustomModalEscapeHandler();
    const {
      title = 'Confirm',
      confirmText = 'OK',
      cancelText = 'Cancel',
      confirmVariant = 'primary',
      onClose,
    } = options;

    const container = getModalContainer();
    container.innerHTML = '';

    const modal = createModalBase({ ...options, title, onClose: () => { onClose?.(); resolve(false); } });

    // Content
    const content = document.createElement('div');
    content.style.cssText = `
      padding: 16px;
      color: var(--text-primary);
      font-size: 13px;
      line-height: 1.5;
      white-space: pre-wrap;
    `;
    content.textContent = message;
    modal.appendChild(content);

    // Footer
    const footer = document.createElement('div');
    footer.style.cssText = `
      display: flex;
      justify-content: flex-end;
      padding: 12px 16px;
      border-top: 1px solid var(--border-primary);
      gap: 8px;
    `;

    // Keyboard handling - defined early so button handlers can remove it
    const handleKeydown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        hideContainer();
        onClose?.();
        resolve(false);
        document.removeEventListener('keydown', handleKeydown);
      } else if (e.key === 'Enter') {
        hideContainer();
        onClose?.();
        resolve(true);
        document.removeEventListener('keydown', handleKeydown);
      }
    };

    const cancelBtn = createButton(cancelText, () => {
      hideContainer();
      onClose?.();
      resolve(false);
      document.removeEventListener('keydown', handleKeydown);
    }, { variant: 'default', minWidth: '80px' });

    const confirmBtn = createButton(confirmText, () => {
      hideContainer();
      onClose?.();
      resolve(true);
      document.removeEventListener('keydown', handleKeydown);
    }, { variant: confirmVariant, minWidth: '80px' });

    footer.appendChild(cancelBtn);
    footer.appendChild(confirmBtn);
    modal.appendChild(footer);

    container.appendChild(modal);
    showContainer();

    // Focus confirm button
    confirmBtn.focus();

    document.addEventListener('keydown', handleKeydown);
  });
}

/**
 * Show a prompt modal (replaces window.prompt)
 */
export function showPrompt(message: string, options: PromptOptions = {}): Promise<string | null> {
  return new Promise((resolve) => {
    cleanupCustomModalEscapeHandler();
    const {
      title = 'Input',
      placeholder = '',
      defaultValue = '',
      confirmText = 'OK',
      cancelText = 'Cancel',
      onClose,
    } = options;

    const container = getModalContainer();
    container.innerHTML = '';

    const modal = createModalBase({ ...options, title, onClose: () => { onClose?.(); resolve(null); } });

    // Content
    const content = document.createElement('div');
    content.style.cssText = `
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    `;

    const label = document.createElement('label');
    label.textContent = message;
    label.style.cssText = `
      color: var(--text-primary);
      font-size: 13px;
    `;

    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = placeholder;
    input.value = defaultValue;
    input.style.cssText = `
      background: var(--bg-hover);
      border: 1px solid var(--bg-active);
      border-radius: 4px;
      padding: 8px 12px;
      color: var(--text-primary);
      font-size: 13px;
      width: 100%;
      box-sizing: border-box;
    `;
    input.addEventListener('focus', () => {
      input.style.borderColor = 'var(--accent-primary)';
    });
    input.addEventListener('blur', () => {
      input.style.borderColor = 'var(--bg-active)';
    });

    content.appendChild(label);
    content.appendChild(input);
    modal.appendChild(content);

    // Footer
    const footer = document.createElement('div');
    footer.style.cssText = `
      display: flex;
      justify-content: flex-end;
      padding: 12px 16px;
      border-top: 1px solid var(--border-primary);
      gap: 8px;
    `;

    // Keyboard handling - defined early so button handlers can remove it
    const handleKeydown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        hideContainer();
        onClose?.();
        resolve(null);
        document.removeEventListener('keydown', handleKeydown);
      } else if (e.key === 'Enter') {
        hideContainer();
        onClose?.();
        resolve(input.value);
        document.removeEventListener('keydown', handleKeydown);
      }
    };

    const cancelBtn = createButton(cancelText, () => {
      hideContainer();
      onClose?.();
      resolve(null);
      document.removeEventListener('keydown', handleKeydown);
    }, { variant: 'default', minWidth: '80px' });

    const confirmBtn = createButton(confirmText, () => {
      hideContainer();
      onClose?.();
      resolve(input.value);
      document.removeEventListener('keydown', handleKeydown);
    }, { variant: 'primary', minWidth: '80px' });

    footer.appendChild(cancelBtn);
    footer.appendChild(confirmBtn);
    modal.appendChild(footer);

    container.appendChild(modal);
    showContainer();

    // Focus input
    input.focus();
    input.select();

    document.addEventListener('keydown', handleKeydown);
  });
}

/**
 * Show a custom modal with any content
 */
export function showModal(content: HTMLElement, options: ModalOptions = {}): { close: () => void } {
  cleanupCustomModalEscapeHandler();
  const container = getModalContainer();
  container.innerHTML = '';

  const modal = createModalBase(options);

  const contentWrapper = document.createElement('div');
  contentWrapper.style.cssText = `
    padding: 16px;
    overflow-y: auto;
    max-height: calc(90vh - 120px);
  `;
  contentWrapper.appendChild(content);
  modal.appendChild(contentWrapper);

  container.appendChild(modal);
  showContainer();

  const close = () => {
    hideContainer();
    options.onClose?.();
  };

  if (options.closable !== false) {
    customModalEscapeHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        close();
      }
    };
    document.addEventListener('keydown', customModalEscapeHandler);
  }

  return {
    close,
  };
}

/**
 * Close any open modal
 */
export function closeModal(): void {
  cleanupCustomModalEscapeHandler();
  hideContainer();
}

export interface FileReloadOptions extends ModalOptions {
  /** File type filter (e.g., 'image/*', 'video/*') */
  accept?: string;
  /** Browse button text */
  browseText?: string;
  /** Skip button text */
  skipText?: string;
}

/**
 * Show a dialog prompting user to reload a file
 * Returns the selected File or null if skipped
 */
export function showFileReloadPrompt(
  filename: string,
  options: FileReloadOptions = {}
): Promise<File | null> {
  return new Promise((resolve) => {
    cleanupCustomModalEscapeHandler();
    const {
      title = 'Reload File',
      accept = 'image/*,video/*',
      browseText = 'Browse...',
      skipText = 'Skip',
      onClose,
    } = options;

    const container = getModalContainer();
    container.innerHTML = '';

    const modal = createModalBase({ ...options, title, onClose: () => { onClose?.(); resolve(null); } });
    modal.setAttribute('data-testid', 'file-reload-dialog');

    // Content
    const content = document.createElement('div');
    content.style.cssText = `
      padding: 16px;
      color: var(--text-primary);
      font-size: 13px;
      line-height: 1.5;
    `;

    const messageP = document.createElement('p');
    messageP.style.margin = '0 0 8px 0';
    messageP.textContent = 'The following file needs to be reloaded to restore the session:';
    content.appendChild(messageP);

    // Expected filename display (prominent)
    const expectedFile = document.createElement('div');
    expectedFile.style.cssText = `
      padding: 8px 12px;
      background: rgba(var(--accent-primary-rgb), 0.15);
      border: 1px solid var(--accent-primary);
      border-radius: 4px;
      color: var(--accent-primary);
      font-size: 13px;
      font-family: monospace;
      margin-bottom: 12px;
      word-break: break-all;
    `;
    expectedFile.textContent = filename;
    content.appendChild(expectedFile);

    const hintP = document.createElement('p');
    hintP.style.cssText = 'margin: 0 0 12px 0; color: var(--text-muted); font-size: 12px;';
    hintP.textContent = 'Please select the same file from your system.';
    content.appendChild(hintP);

    // Hidden file input
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = accept;
    fileInput.style.display = 'none';

    let selectedFile: File | null = null;

    // File selection display
    const fileDisplay = document.createElement('div');
    fileDisplay.style.cssText = `
      padding: 8px 12px;
      background: var(--bg-hover);
      border: 1px solid var(--bg-active);
      border-radius: 4px;
      color: var(--text-muted);
      font-size: 12px;
    `;
    fileDisplay.textContent = 'No file selected';

    // Warning message for mismatched filenames
    const warningEl = document.createElement('div');
    warningEl.setAttribute('data-testid', 'filename-mismatch-warning');
    warningEl.style.cssText = `
      margin-top: 8px;
      padding: 8px 12px;
      background: rgba(var(--warning), 0.15);
      border: 1px solid var(--warning);
      border-radius: 4px;
      color: var(--warning);
      font-size: 12px;
      display: none;
    `;
    warningEl.textContent = '\u26A0\uFE0F Filename does not match. Make sure you selected the correct file.';

    // Load button reference for enabling/disabling
    let loadBtn: HTMLButtonElement;

    fileInput.addEventListener('change', () => {
      const file = fileInput.files?.[0];
      if (file) {
        selectedFile = file;
        fileDisplay.textContent = `Selected: ${file.name}`;

        // Check if filename matches
        const matches = file.name === filename;
        if (matches) {
          fileDisplay.style.color = 'var(--success)';
          fileDisplay.style.borderColor = 'var(--success)';
          warningEl.style.display = 'none';
        } else {
          fileDisplay.style.color = 'var(--warning)';
          fileDisplay.style.borderColor = 'var(--warning)';
          warningEl.style.display = 'block';
        }

        // Enable load button when file is selected and focus it
        loadBtn.disabled = false;
        loadBtn.style.opacity = '1';
        loadBtn.focus();
      }
    });

    content.appendChild(fileInput);
    content.appendChild(fileDisplay);
    content.appendChild(warningEl);
    modal.appendChild(content);

    // Footer
    const footer = document.createElement('div');
    footer.style.cssText = `
      display: flex;
      justify-content: flex-end;
      padding: 12px 16px;
      border-top: 1px solid var(--border-primary);
      gap: 8px;
    `;

    // Keyboard handling - declare early so buttons can remove it
    const handleKeydown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        hideContainer();
        onClose?.();
        resolve(null);
        document.removeEventListener('keydown', handleKeydown);
      } else if (e.key === 'Enter' && selectedFile && !loadBtn.disabled) {
        // Enter confirms when file is selected
        hideContainer();
        onClose?.();
        resolve(selectedFile);
        document.removeEventListener('keydown', handleKeydown);
      }
    };

    const skipBtn = createButton(skipText, () => {
      hideContainer();
      onClose?.();
      resolve(null);
      document.removeEventListener('keydown', handleKeydown);
    }, { variant: 'default', minWidth: '80px' });
    skipBtn.setAttribute('data-testid', 'file-reload-skip');

    const browseBtn = createButton(browseText, () => {
      fileInput.click();
    }, { variant: 'default', minWidth: '100px' });
    browseBtn.setAttribute('data-testid', 'file-reload-browse');

    loadBtn = createButton('Load', () => {
      hideContainer();
      onClose?.();
      resolve(selectedFile);
      document.removeEventListener('keydown', handleKeydown);
    }, { variant: 'primary', minWidth: '80px' });
    loadBtn.setAttribute('data-testid', 'file-reload-load');

    // Disable load button until a file is selected
    loadBtn.disabled = true;
    loadBtn.style.opacity = '0.5';

    footer.appendChild(skipBtn);
    footer.appendChild(browseBtn);
    footer.appendChild(loadBtn);
    modal.appendChild(footer);

    container.appendChild(modal);
    showContainer();

    // Register keyboard handler
    document.addEventListener('keydown', handleKeydown);
  });
}
