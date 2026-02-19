/**
 * Unified Button Component
 *
 * Consistent button styling across the application.
 * Includes proper A11Y focus styles for keyboard navigation.
 */

export type ButtonVariant = 'default' | 'primary' | 'danger' | 'ghost' | 'icon' | 'overlay';
export type ButtonSize = 'xs' | 'sm' | 'md' | 'lg';

export interface ButtonOptions {
  variant?: ButtonVariant;
  size?: ButtonSize;
  active?: boolean;
  disabled?: boolean;
  title?: string;
  icon?: string;
  minWidth?: string;
  borderRadius?: string;
}

interface VariantState {
  background: string;
  border?: string;
  borderColor?: string;
  color: string;
  filter?: string;
}

const VARIANT_STYLES: Record<ButtonVariant, {
  base: VariantState;
  hover: VariantState;
  active: VariantState;
}> = {
  default: {
    base: { background: 'var(--bg-active)', border: '1px solid var(--border-primary)', color: 'var(--text-primary)' },
    hover: { background: 'var(--border-primary)', borderColor: 'var(--bg-active)', color: 'var(--text-primary)' },
    active: { background: 'rgba(var(--accent-primary-rgb), 0.15)', borderColor: 'var(--accent-primary)', color: 'var(--accent-primary)' },
  },
  primary: {
    base: { background: 'var(--accent-primary)', border: '1px solid var(--accent-primary)', color: '#fff' },
    hover: { background: 'var(--accent-hover)', borderColor: 'var(--accent-hover)', color: '#fff' },
    active: { background: 'var(--accent-active)', borderColor: 'var(--accent-active)', color: '#fff' },
  },
  danger: {
    base: { background: 'var(--error)', border: '1px solid var(--error)', color: '#fff' },
    hover: { background: 'var(--error)', borderColor: 'var(--error)', color: '#fff', filter: 'brightness(1.1)' },
    active: { background: 'var(--error)', borderColor: 'var(--error)', color: '#fff', filter: 'brightness(0.9)' },
  },
  ghost: {
    base: { background: 'transparent', border: '1px solid transparent', color: 'var(--text-secondary)' },
    hover: { background: 'var(--bg-hover)', borderColor: 'var(--border-secondary)', color: 'var(--text-primary)' },
    active: { background: 'rgba(var(--accent-primary-rgb), 0.15)', borderColor: 'var(--accent-primary)', color: 'var(--accent-primary)' },
  },
  icon: {
    base: { background: 'transparent', border: '1px solid transparent', color: 'var(--text-secondary)' },
    hover: { background: 'var(--bg-hover)', borderColor: 'var(--border-secondary)', color: 'var(--text-primary)' },
    active: { background: 'rgba(var(--accent-primary-rgb), 0.15)', borderColor: 'var(--accent-primary)', color: 'var(--accent-primary)' },
  },
  overlay: {
    base: { background: 'var(--overlay-border)', border: 'none', color: 'var(--text-secondary)' },
    hover: { background: 'var(--bg-hover)', color: 'var(--text-secondary)' },
    active: { background: 'var(--bg-hover)', color: 'var(--text-secondary)' },
  },
};

const SIZE_STYLES: Record<ButtonSize, string> = {
  /** xs is intended only for compact overlay controls */
  xs: 'padding: 2px 6px; font-size: 9px; height: 20px; min-width: 20px;',
  sm: 'padding: 4px 8px; font-size: 11px; height: 24px; min-width: 24px;',
  md: 'padding: 6px 12px; font-size: 12px; height: 28px; min-width: 28px;',
  lg: 'padding: 8px 16px; font-size: 13px; height: 32px; min-width: 32px;',
};

function variantStateToCSS(state: VariantState): string {
  let css = `background: ${state.background};`;
  if (state.border) css += ` border: ${state.border};`;
  if (state.borderColor) css += ` border-color: ${state.borderColor};`;
  css += ` color: ${state.color};`;
  if (state.filter) css += ` filter: ${state.filter};`;
  return css;
}

function applyVariantState(button: HTMLButtonElement, state: VariantState): void {
  button.style.background = state.background;
  // For base states that use `border` shorthand, extract the color portion
  // For hover/active states that use `borderColor`, apply directly
  if (state.borderColor) {
    button.style.borderColor = state.borderColor;
  } else if (state.border) {
    // Parse "1px solid transparent" → "transparent", or "none" → reset
    if (state.border === 'none') {
      button.style.borderColor = '';
    } else {
      const parts = state.border.split(/\s+/);
      button.style.borderColor = parts[parts.length - 1] || 'transparent';
    }
  }
  button.style.color = state.color;
  button.style.filter = state.filter || '';
}

export function createButton(
  text: string,
  onClick: () => void,
  options: ButtonOptions = {}
): HTMLButtonElement {
  const {
    variant = 'default',
    size = 'md',
    active = false,
    disabled = false,
    title,
    icon,
    minWidth,
    borderRadius,
  } = options;

  const button = document.createElement('button');
  button.type = 'button';
  button.disabled = disabled;
  button.title = title || '';
  // Set aria-label for icon-only buttons (no text label)
  if (!text && title) {
    button.setAttribute('aria-label', title);
  }

  const variantStyle = VARIANT_STYLES[variant];
  const sizeStyle = SIZE_STYLES[size];
  const initialState = active ? variantStyle.active : variantStyle.base;

  const baseStyle = `
    ${variantStateToCSS(initialState)}
    ${sizeStyle}
    border-radius: ${borderRadius || '4px'};
    cursor: ${disabled ? 'not-allowed' : 'pointer'};
    transition: all 0.12s ease;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    font-family: inherit;
    font-weight: 500;
    white-space: nowrap;
    opacity: ${disabled ? '0.5' : '1'};
    ${minWidth ? `min-width: ${minWidth};` : ''}
  `;

  button.style.cssText = baseStyle;

  if (active) {
    button.classList.add('active');
  }

  // Add content
  if (icon) {
    const iconSpan = document.createElement('span');
    iconSpan.innerHTML = icon;
    iconSpan.style.cssText = 'display: flex; align-items: center;';
    button.appendChild(iconSpan);
  }

  if (text) {
    const textSpan = document.createElement('span');
    textSpan.textContent = text;
    button.appendChild(textSpan);
  }

  // Track if focus came from keyboard (for A11Y focus ring)
  // Default to true - assume keyboard until mouse click proves otherwise
  let focusFromKeyboard = true;

  // Event handlers
  if (!disabled) {
    button.addEventListener('pointerenter', () => {
      if (!button.classList.contains('active')) {
        applyVariantState(button, variantStyle.hover);
      }
    });

    button.addEventListener('pointerleave', () => {
      if (!button.classList.contains('active')) {
        applyVariantState(button, variantStyle.base);
      } else {
        applyVariantState(button, variantStyle.active);
      }
    });

    button.addEventListener('pointerdown', () => {
      focusFromKeyboard = false;
      applyVariantState(button, variantStyle.active);
    });

    button.addEventListener('pointerup', () => {
      if (button.classList.contains('active')) {
        applyVariantState(button, variantStyle.active);
      } else {
        applyVariantState(button, variantStyle.hover);
      }
    });

    button.addEventListener('focus', () => {
      // Show focus ring only for keyboard navigation
      if (focusFromKeyboard) {
        button.style.outline = '2px solid var(--accent-primary)';
        button.style.outlineOffset = '2px';
      }
    });

    button.addEventListener('blur', () => {
      button.style.outline = '';
      focusFromKeyboard = true; // Reset for next focus
    });

    button.addEventListener('click', onClick);
  }

  return button;
}

/**
 * Update button active state
 */
export function setButtonActive(button: HTMLButtonElement, active: boolean, variant: ButtonVariant = 'default'): void {
  const variantStyle = VARIANT_STYLES[variant];
  const state = active ? variantStyle.active : variantStyle.base;
  applyVariantState(button, state);
  if (active) {
    button.classList.add('active');
  } else {
    button.classList.remove('active');
  }
}

/**
 * Create an icon-only button
 */
export function createIconButton(
  icon: string,
  onClick: () => void,
  options: Omit<ButtonOptions, 'icon'> = {}
): HTMLButtonElement {
  return createButton('', onClick, { ...options, icon, variant: options.variant || 'icon' });
}

/**
 * Apply A11Y focus handling to any button element.
 * Shows focus ring only for keyboard navigation (tab), not mouse clicks.
 *
 * @param button - The button element to add focus handling to
 * @returns Cleanup function to remove event listeners
 */
export function applyA11yFocus(button: HTMLButtonElement): () => void {
  let focusFromKeyboard = true;

  const handleMouseDown = () => {
    focusFromKeyboard = false;
  };

  const handleFocus = () => {
    if (focusFromKeyboard) {
      button.style.outline = '2px solid var(--accent-primary)';
      button.style.outlineOffset = '2px';
    }
  };

  const handleBlur = () => {
    button.style.outline = '';
    focusFromKeyboard = true;
  };

  button.addEventListener('mousedown', handleMouseDown);
  button.addEventListener('focus', handleFocus);
  button.addEventListener('blur', handleBlur);

  // Return cleanup function
  return () => {
    button.removeEventListener('mousedown', handleMouseDown);
    button.removeEventListener('focus', handleFocus);
    button.removeEventListener('blur', handleBlur);
  };
}
