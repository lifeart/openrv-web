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
    base: 'background: #3a3a3a; border: 1px solid #4a4a4a; color: #ccc;',
    hover: 'background: #444; border-color: #555; color: #fff;',
    active: 'background: rgba(74, 158, 255, 0.15); border-color: #4a9eff; color: #4a9eff;',
  },
  primary: {
    base: 'background: #4a9eff; border: 1px solid #4a9eff; color: #fff;',
    hover: 'background: #5aafff; border-color: #5aafff; color: #fff;',
    active: 'background: #3a8eef; border-color: #3a8eef; color: #fff;',
  },
  danger: {
    base: 'background: #dc3545; border: 1px solid #dc3545; color: #fff;',
    hover: 'background: #e04555; border-color: #e04555; color: #fff;',
    active: 'background: #c82535; border-color: #c82535; color: #fff;',
  },
  ghost: {
    base: 'background: transparent; border: 1px solid transparent; color: #aaa;',
    hover: 'background: rgba(255,255,255,0.08); border-color: rgba(255,255,255,0.1); color: #fff;',
    active: 'background: rgba(74, 158, 255, 0.15); border-color: #4a9eff; color: #4a9eff;',
  },
  icon: {
    base: 'background: transparent; border: 1px solid transparent; color: #aaa;',
    hover: 'background: rgba(255,255,255,0.08); border-color: rgba(255,255,255,0.1); color: #fff;',
    active: 'background: rgba(74, 158, 255, 0.15); border-color: #4a9eff; color: #4a9eff;',
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
        button.style.outline = '2px solid #4a9eff';
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
      button.style.outline = '2px solid #4a9eff';
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
