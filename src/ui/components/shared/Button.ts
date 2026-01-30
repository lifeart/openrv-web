/**
 * Unified Button Component
 *
 * Consistent button styling across the application.
 * Includes proper A11Y focus styles for keyboard navigation.
 */

export type ButtonVariant = 'default' | 'primary' | 'danger' | 'ghost' | 'icon';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonOptions {
  variant?: ButtonVariant;
  size?: ButtonSize;
  active?: boolean;
  disabled?: boolean;
  title?: string;
  icon?: string;
  minWidth?: string;
}

const VARIANT_STYLES: Record<ButtonVariant, { base: string; hover: string; active: string }> = {
  default: {
    base: 'background: var(--bg-active); border: 1px solid var(--border-primary); color: var(--text-primary);',
    hover: 'background: var(--border-primary); border-color: var(--bg-active); color: var(--text-primary);',
    active: 'background: rgba(var(--accent-primary-rgb), 0.15); border-color: var(--accent-primary); color: var(--accent-primary);',
  },
  primary: {
    base: 'background: var(--accent-primary); border: 1px solid var(--accent-primary); color: #fff;',
    hover: 'background: var(--accent-hover); border-color: var(--accent-hover); color: #fff;',
    active: 'background: var(--accent-active); border-color: var(--accent-active); color: #fff;',
  },
  danger: {
    base: 'background: var(--error); border: 1px solid var(--error); color: #fff;',
    hover: 'background: var(--error); border-color: var(--error); color: #fff; filter: brightness(1.1);',
    active: 'background: var(--error); border-color: var(--error); color: #fff; filter: brightness(0.9);',
  },
  ghost: {
    base: 'background: transparent; border: 1px solid transparent; color: var(--text-secondary);',
    hover: 'background: var(--bg-hover); border-color: var(--border-secondary); color: var(--text-primary);',
    active: 'background: rgba(var(--accent-primary-rgb), 0.15); border-color: var(--accent-primary); color: var(--accent-primary);',
  },
  icon: {
    base: 'background: transparent; border: 1px solid transparent; color: var(--text-secondary);',
    hover: 'background: var(--bg-hover); border-color: var(--border-secondary); color: var(--text-primary);',
    active: 'background: rgba(var(--accent-primary-rgb), 0.15); border-color: var(--accent-primary); color: var(--accent-primary);',
  },
};

const SIZE_STYLES: Record<ButtonSize, string> = {
  sm: 'padding: 4px 8px; font-size: 11px; height: 24px; min-width: 24px;',
  md: 'padding: 6px 12px; font-size: 12px; height: 28px; min-width: 28px;',
  lg: 'padding: 8px 16px; font-size: 13px; height: 32px; min-width: 32px;',
};

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
  } = options;

  const button = document.createElement('button');
  button.type = 'button';
  button.disabled = disabled;
  button.title = title || '';

  const variantStyle = VARIANT_STYLES[variant];
  const sizeStyle = SIZE_STYLES[size];

  const baseStyle = `
    ${active ? variantStyle.active : variantStyle.base}
    ${sizeStyle}
    border-radius: 4px;
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
    outline: none;
    ${minWidth ? `min-width: ${minWidth};` : ''}
  `;

  button.style.cssText = baseStyle;

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
    button.addEventListener('mouseenter', () => {
      if (!active) {
        button.style.cssText = `${baseStyle} ${variantStyle.hover}`;
      }
    });

    button.addEventListener('mouseleave', () => {
      button.style.cssText = baseStyle;
    });

    button.addEventListener('mousedown', () => {
      focusFromKeyboard = false;
      button.style.cssText = `${baseStyle} ${variantStyle.active}`;
    });

    button.addEventListener('mouseup', () => {
      button.style.cssText = `${baseStyle} ${active ? variantStyle.active : variantStyle.hover}`;
    });

    button.addEventListener('focus', () => {
      // Show focus ring only for keyboard navigation
      if (focusFromKeyboard) {
        button.style.outline = '2px solid var(--accent-primary)';
        button.style.outlineOffset = '2px';
      }
    });

    button.addEventListener('blur', () => {
      button.style.outline = 'none';
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
  const currentStyle = button.style.cssText.replace(/background:[^;]+;|border-color:[^;]+;|border:[^;]+;|color:[^;]+;/g, '');
  button.style.cssText = `${currentStyle} ${active ? variantStyle.active : variantStyle.base}`;
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
    button.style.outline = 'none';
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
