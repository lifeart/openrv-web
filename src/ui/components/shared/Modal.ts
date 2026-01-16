/**
 * Unified Modal Component
 *
 * Native-style modal dialogs for alerts, confirms, and custom content.
 */

import { createButton } from './Button';

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
}

function hideContainer(): void {
  const container = getModalContainer();
  container.style.display = 'none';
  container.innerHTML = '';
}

function createModalBase(options: ModalOptions = {}): HTMLElement {
  const { title, width = '400px', closable = true, onClose } = options;

  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.style.cssText = `
    background: #2a2a2a;
    border: 1px solid #444;
    border-radius: 8px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
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
      border-bottom: 1px solid #444;
    `;

    const titleEl = document.createElement('h3');
    titleEl.textContent = title || '';
    titleEl.style.cssText = `
      margin: 0;
      font-size: 14px;
      font-weight: 600;
      color: #eee;
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
    const { title = 'Alert', type = 'info', onClose } = options;

    const container = getModalContainer();
    container.innerHTML = '';

    const modal = createModalBase({ ...options, title, onClose: () => { onClose?.(); resolve(); } });

    // Content
    const content = document.createElement('div');
    content.style.cssText = `
      padding: 16px;
      color: #ccc;
      font-size: 13px;
      line-height: 1.5;
      white-space: pre-wrap;
      max-height: 60vh;
      overflow-y: auto;
    `;

    // Icon based on type
    const icons = {
      info: '\u2139\uFE0F',
      success: '\u2705',
      warning: '\u26A0\uFE0F',
      error: '\u274C',
    } as const;

    const iconSpan = document.createElement('span');
    iconSpan.textContent = icons[type];
    iconSpan.style.cssText = 'font-size: 18px; margin-right: 8px; vertical-align: middle;';

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
      border-top: 1px solid #444;
      gap: 8px;
    `;

    const okBtn = createButton('OK', () => {
      hideContainer();
      onClose?.();
      resolve();
    }, { variant: 'primary', minWidth: '80px' });

    footer.appendChild(okBtn);
    modal.appendChild(footer);

    container.appendChild(modal);
    showContainer();

    // Focus OK button
    okBtn.focus();

    // Close on Escape
    const handleKeydown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        hideContainer();
        onClose?.();
        resolve();
        document.removeEventListener('keydown', handleKeydown);
      } else if (e.key === 'Enter') {
        hideContainer();
        onClose?.();
        resolve();
        document.removeEventListener('keydown', handleKeydown);
      }
    };
    document.addEventListener('keydown', handleKeydown);
  });
}

/**
 * Show a confirm modal (replaces window.confirm)
 */
export function showConfirm(message: string, options: ConfirmOptions = {}): Promise<boolean> {
  return new Promise((resolve) => {
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
      color: #ccc;
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
      border-top: 1px solid #444;
      gap: 8px;
    `;

    const cancelBtn = createButton(cancelText, () => {
      hideContainer();
      onClose?.();
      resolve(false);
    }, { variant: 'default', minWidth: '80px' });

    const confirmBtn = createButton(confirmText, () => {
      hideContainer();
      onClose?.();
      resolve(true);
    }, { variant: confirmVariant, minWidth: '80px' });

    footer.appendChild(cancelBtn);
    footer.appendChild(confirmBtn);
    modal.appendChild(footer);

    container.appendChild(modal);
    showContainer();

    // Focus confirm button
    confirmBtn.focus();

    // Keyboard handling
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
    document.addEventListener('keydown', handleKeydown);
  });
}

/**
 * Show a prompt modal (replaces window.prompt)
 */
export function showPrompt(message: string, options: PromptOptions = {}): Promise<string | null> {
  return new Promise((resolve) => {
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
      color: #ccc;
      font-size: 13px;
    `;

    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = placeholder;
    input.value = defaultValue;
    input.style.cssText = `
      background: #333;
      border: 1px solid #555;
      border-radius: 4px;
      padding: 8px 12px;
      color: #eee;
      font-size: 13px;
      width: 100%;
      box-sizing: border-box;
    `;
    input.addEventListener('focus', () => {
      input.style.borderColor = '#4a9eff';
    });
    input.addEventListener('blur', () => {
      input.style.borderColor = '#555';
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
      border-top: 1px solid #444;
      gap: 8px;
    `;

    const cancelBtn = createButton(cancelText, () => {
      hideContainer();
      onClose?.();
      resolve(null);
    }, { variant: 'default', minWidth: '80px' });

    const confirmBtn = createButton(confirmText, () => {
      hideContainer();
      onClose?.();
      resolve(input.value);
    }, { variant: 'primary', minWidth: '80px' });

    footer.appendChild(cancelBtn);
    footer.appendChild(confirmBtn);
    modal.appendChild(footer);

    container.appendChild(modal);
    showContainer();

    // Focus input
    input.focus();
    input.select();

    // Keyboard handling
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
    document.addEventListener('keydown', handleKeydown);
  });
}

/**
 * Show a custom modal with any content
 */
export function showModal(content: HTMLElement, options: ModalOptions = {}): { close: () => void } {
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

  return {
    close: () => {
      hideContainer();
      options.onClose?.();
    },
  };
}

/**
 * Close any open modal
 */
export function closeModal(): void {
  hideContainer();
}
