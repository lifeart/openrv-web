/**
 * Shared Panel Utility
 *
 * Creates dropdown panels that render at body level to avoid z-index issues.
 */

import { getIconSvg } from './Icons';
import { SHADOWS } from './theme';

export interface PanelOptions {
  width?: string;
  maxHeight?: string;
  align?: 'left' | 'right';
}

export interface Panel {
  element: HTMLElement;
  show: (anchorElement: HTMLElement) => void;
  hide: () => void;
  toggle: (anchorElement: HTMLElement) => void;
  isVisible: () => boolean;
  dispose: () => void;
}

export function createPanel(options: PanelOptions = {}): Panel {
  const { width = '280px', maxHeight = '400px', align = 'left' } = options;

  const panel = document.createElement('div');
  panel.className = 'dropdown-panel';
  panel.style.cssText = `
    position: fixed;
    background: var(--bg-secondary);
    border: 1px solid var(--border-primary);
    border-radius: 6px;
    padding: 12px;
    width: ${width};
    max-width: calc(100vw - 16px);
    max-height: ${maxHeight};
    z-index: 9999;
    display: none;
    box-shadow: ${SHADOWS.panel};
    overflow-y: auto;
  `;

  let isVisible = false;
  let currentAnchor: HTMLElement | null = null;
  let previouslyFocusedElement: HTMLElement | null = null;

  // Close on outside click
  const handleOutsideClick = (e: MouseEvent) => {
    if (isVisible && currentAnchor && !currentAnchor.contains(e.target as Node) && !panel.contains(e.target as Node)) {
      hide();
    }
  };

  // Close on Escape key
  const handleKeydown = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && isVisible) {
      e.stopPropagation();
      e.preventDefault();
      hide();
    }
  };

  // Reposition on scroll/resize
  const handleReposition = () => {
    if (isVisible && currentAnchor) {
      positionPanel(currentAnchor);
    }
  };

  function positionPanel(anchor: HTMLElement): void {
    const rect = anchor.getBoundingClientRect();
    const panelWidth = parseInt(width);

    panel.style.top = `${rect.bottom + 4}px`;

    if (align === 'right') {
      panel.style.left = `${Math.max(8, rect.right - panelWidth)}px`;
    } else {
      panel.style.left = `${Math.min(rect.left, window.innerWidth - panelWidth - 8)}px`;
    }
  }

  function show(anchor: HTMLElement): void {
    if (!document.body.contains(panel)) {
      document.body.appendChild(panel);
    }

    // Save previously focused element for restore on hide
    previouslyFocusedElement = document.activeElement as HTMLElement | null;

    currentAnchor = anchor;
    positionPanel(anchor);
    panel.style.display = 'block';
    isVisible = true;

    // Add listeners
    document.addEventListener('click', handleOutsideClick);
    document.addEventListener('keydown', handleKeydown);
    window.addEventListener('scroll', handleReposition, true);
    window.addEventListener('resize', handleReposition);

    // Focus the panel
    if (!panel.hasAttribute('tabindex')) {
      panel.setAttribute('tabindex', '-1');
    }
    panel.focus();
  }

  function hide(): void {
    panel.style.display = 'none';
    isVisible = false;
    currentAnchor = null;

    // Remove listeners
    document.removeEventListener('click', handleOutsideClick);
    document.removeEventListener('keydown', handleKeydown);
    window.removeEventListener('scroll', handleReposition, true);
    window.removeEventListener('resize', handleReposition);

    // Restore focus to previously focused element
    if (previouslyFocusedElement && typeof previouslyFocusedElement.focus === 'function') {
      previouslyFocusedElement.focus();
    }
    previouslyFocusedElement = null;
  }

  function toggle(anchor: HTMLElement): void {
    if (isVisible) {
      hide();
    } else {
      show(anchor);
    }
  }

  function dispose(): void {
    hide();
    if (document.body.contains(panel)) {
      document.body.removeChild(panel);
    }
  }

  return {
    element: panel,
    show,
    hide,
    toggle,
    isVisible: () => isVisible,
    dispose,
  };
}

/**
 * Create a panel header
 */
export function createPanelHeader(title: string, onClose?: () => void): HTMLElement {
  const header = document.createElement('div');
  header.style.cssText = `
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 12px;
    padding-bottom: 8px;
    border-bottom: 1px solid var(--border-primary);
  `;

  const titleEl = document.createElement('span');
  titleEl.textContent = title;
  titleEl.style.cssText = 'color: var(--text-primary); font-size: 13px; font-weight: 500;';
  header.appendChild(titleEl);

  if (onClose) {
    const closeBtn = document.createElement('button');
    closeBtn.innerHTML = getIconSvg('x', 'sm');
    closeBtn.title = 'Close';
    closeBtn.style.cssText = `
      background: transparent;
      border: none;
      color: var(--text-muted);
      cursor: pointer;
      padding: 2px 6px;
      border-radius: 3px;
      display: inline-flex;
      align-items: center;
    `;
    closeBtn.addEventListener('pointerenter', () => { closeBtn.style.color = 'var(--text-primary)'; });
    closeBtn.addEventListener('pointerleave', () => { closeBtn.style.color = 'var(--text-muted)'; });
    closeBtn.addEventListener('click', onClose);
    header.appendChild(closeBtn);
  }

  return header;
}

/**
 * Create a slider row for panels
 */
export function createSliderRow(
  label: string,
  options: {
    min?: number;
    max?: number;
    step?: number;
    value?: number;
    unit?: string;
    onChange?: (value: number) => void;
    onReset?: () => void;
  } = {}
): { container: HTMLElement; slider: HTMLInputElement; valueLabel: HTMLSpanElement } {
  const { min = 0, max = 100, step = 1, value = 50, unit = '', onChange, onReset } = options;

  const container = document.createElement('div');
  container.style.cssText = `
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 8px;
  `;

  const labelEl = document.createElement('span');
  labelEl.textContent = label;
  labelEl.style.cssText = 'color: var(--text-secondary); font-size: 11px; min-width: 70px;';

  const slider = document.createElement('input');
  slider.type = 'range';
  slider.min = String(min);
  slider.max = String(max);
  slider.step = String(step);
  slider.value = String(value);
  slider.style.cssText = `
    flex: 1;
    height: 4px;
    cursor: pointer;
    accent-color: var(--accent-primary);
  `;

  const valueLabel = document.createElement('span');
  valueLabel.style.cssText = 'color: var(--text-muted); font-size: 11px; min-width: 40px; text-align: right;';
  valueLabel.textContent = `${value}${unit}`;

  if (onChange) {
    slider.addEventListener('input', () => {
      const val = parseFloat(slider.value);
      valueLabel.textContent = `${val}${unit}`;
      onChange(val);
    });
  }

  if (onReset) {
    slider.addEventListener('dblclick', () => {
      onReset();
    });
  }

  container.appendChild(labelEl);
  container.appendChild(slider);
  container.appendChild(valueLabel);

  return { container, slider, valueLabel };
}
