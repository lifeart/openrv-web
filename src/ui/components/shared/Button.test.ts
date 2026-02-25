/**
 * Button Component Tests
 *
 * Tests for the unified button component with variants, sizes, and states.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  createButton,
  setButtonActive,
  createIconButton,
} from './Button';

// PointerEvent polyfill for jsdom
if (typeof globalThis.PointerEvent === 'undefined') {
  (globalThis as any).PointerEvent = class extends MouseEvent {
    constructor(type: string, params?: MouseEventInit) {
      super(type, params);
    }
  };
}

describe('createButton', () => {
  describe('basic creation', () => {
    it('BTN-U001: creates a button element', () => {
      const btn = createButton('Click me', () => {});
      expect(btn).toBeInstanceOf(HTMLButtonElement);
    });

    it('BTN-U002: button has type button', () => {
      const btn = createButton('Click me', () => {});
      expect(btn.type).toBe('button');
    });

    it('BTN-U003: button displays text', () => {
      const btn = createButton('Click me', () => {});
      expect(btn.textContent).toContain('Click me');
    });

    it('BTN-U004: button calls onClick when clicked', () => {
      const onClick = vi.fn();
      const btn = createButton('Click', onClick);
      btn.click();
      expect(onClick).toHaveBeenCalledTimes(1);
    });

    it('BTN-U005: button can have empty text', () => {
      const btn = createButton('', () => {});
      expect(btn).toBeInstanceOf(HTMLButtonElement);
      expect(btn.querySelectorAll('span').length).toBeLessThanOrEqual(1);
    });
  });

  describe('disabled state', () => {
    it('BTN-U010: disabled option disables button', () => {
      const btn = createButton('Click', () => {}, { disabled: true });
      expect(btn.disabled).toBe(true);
    });

    it('BTN-U011: disabled button does not call onClick', () => {
      const onClick = vi.fn();
      const btn = createButton('Click', onClick, { disabled: true });
      btn.click();
      expect(onClick).not.toHaveBeenCalled();
    });

    it('BTN-U012: non-disabled button is enabled by default', () => {
      const btn = createButton('Click', () => {});
      expect(btn.disabled).toBe(false);
    });

    it('BTN-U013: disabled button has reduced opacity', () => {
      const btn = createButton('Click', () => {}, { disabled: true });
      expect(btn.style.opacity).toBe('0.5');
    });

    it('BTN-U014: disabled button has not-allowed cursor', () => {
      const btn = createButton('Click', () => {}, { disabled: true });
      expect(btn.style.cursor).toBe('not-allowed');
    });
  });

  describe('title attribute', () => {
    it('BTN-U020: title option sets title attribute', () => {
      const btn = createButton('Click', () => {}, { title: 'Tooltip text' });
      expect(btn.title).toBe('Tooltip text');
    });

    it('BTN-U021: no title option sets empty title', () => {
      const btn = createButton('Click', () => {});
      expect(btn.title).toBe('');
    });
  });

  describe('icon support', () => {
    it('BTN-U030: icon option adds icon span', () => {
      const btn = createButton('Label', () => {}, { icon: '<svg></svg>' });
      const iconSpan = btn.querySelector('span');
      expect(iconSpan).not.toBeNull();
      expect(iconSpan?.innerHTML).toBe('<svg></svg>');
    });

    it('BTN-U031: button with icon and text has both elements', () => {
      const btn = createButton('Label', () => {}, { icon: '<svg></svg>' });
      const spans = btn.querySelectorAll('span');
      expect(spans.length).toBe(2); // icon span + text span
      expect(btn.textContent).toContain('Label');
    });

    it('BTN-U032: icon span has flex display for alignment', () => {
      const btn = createButton('Label', () => {}, { icon: '<svg></svg>' });
      const iconSpan = btn.querySelector('span');
      expect(iconSpan?.style.display).toBe('flex');
    });
  });

  describe('minWidth option', () => {
    it('BTN-U040: minWidth option sets min-width style', () => {
      const btn = createButton('Click', () => {}, { minWidth: '100px' });
      expect(btn.style.minWidth).toBe('100px');
    });

    it('BTN-U041: button without minWidth has default min-width from size', () => {
      const btn = createButton('Click', () => {});
      expect(btn.style.cssText).toContain('min-width: 28px'); // md size default
    });
  });

  describe('variants', () => {
    it('BTN-U050: default variant has gray background', () => {
      const btn = createButton('Click', () => {}, { variant: 'default' });
      expect(btn.style.cssText).toContain('background');
      expect(btn.style.cssText).toContain('var(--bg-active)');
    });

    it('BTN-U051: primary variant has accent background', () => {
      const btn = createButton('Click', () => {}, { variant: 'primary' });
      expect(btn.style.cssText).toContain('var(--accent-primary)');
    });

    it('BTN-U052: danger variant has error background', () => {
      const btn = createButton('Click', () => {}, { variant: 'danger' });
      expect(btn.style.cssText).toContain('var(--error)');
    });

    it('BTN-U053: ghost variant has transparent background', () => {
      const btn = createButton('Click', () => {}, { variant: 'ghost' });
      expect(btn.style.cssText).toContain('transparent');
    });

    it('BTN-U054: icon variant has transparent background', () => {
      const btn = createButton('Click', () => {}, { variant: 'icon' });
      expect(btn.style.cssText).toContain('transparent');
    });

    it('BTN-U055: default variant is used when not specified', () => {
      const btn = createButton('Click', () => {});
      expect(btn.style.cssText).toContain('var(--bg-active)');
    });

    it('BTN-U056: overlay variant has overlay-border background', () => {
      const btn = createButton('Click', () => {}, { variant: 'overlay' });
      expect(btn.style.cssText).toContain('var(--overlay-border)');
    });
  });

  describe('sizes', () => {
    it('BTN-U060: sm size has 24px height', () => {
      const btn = createButton('Click', () => {}, { size: 'sm' });
      expect(btn.style.height).toBe('24px');
    });

    it('BTN-U061: md size has 28px height', () => {
      const btn = createButton('Click', () => {}, { size: 'md' });
      expect(btn.style.height).toBe('28px');
    });

    it('BTN-U062: lg size has 32px height', () => {
      const btn = createButton('Click', () => {}, { size: 'lg' });
      expect(btn.style.height).toBe('32px');
    });

    it('BTN-U063: md size is default', () => {
      const btn = createButton('Click', () => {});
      expect(btn.style.height).toBe('28px');
    });

    it('BTN-U064: sm size has smaller font', () => {
      const btn = createButton('Click', () => {}, { size: 'sm' });
      expect(btn.style.fontSize).toBe('11px');
    });

    it('BTN-U065: lg size has larger font', () => {
      const btn = createButton('Click', () => {}, { size: 'lg' });
      expect(btn.style.fontSize).toBe('13px');
    });

    it('BTN-U066: xs size has 20px height', () => {
      const btn = createButton('Click', () => {}, { size: 'xs' });
      expect(btn.style.height).toBe('20px');
    });

    it('BTN-U067: xs size has 10px font', () => {
      const btn = createButton('Click', () => {}, { size: 'xs' });
      expect(btn.style.fontSize).toBe('10px');
    });
  });

  describe('active state', () => {
    it('BTN-U070: active option applies accent highlight color', () => {
      const btn = createButton('Click', () => {}, { active: true });
      expect(btn.style.cssText).toContain('var(--accent-primary)');
    });

    it('BTN-U071: non-active default button has gray background', () => {
      const btn = createButton('Click', () => {}, { active: false });
      expect(btn.style.cssText).toContain('var(--bg-active)');
    });

    it('BTN-U072: active button has accent border', () => {
      const btn = createButton('Click', () => {}, { active: true });
      expect(btn.style.cssText).toContain('border-color: var(--accent-primary)');
    });

    it('BTN-U073: active button has active class', () => {
      const btn = createButton('Click', () => {}, { active: true });
      expect(btn.classList.contains('active')).toBe(true);
    });

    it('BTN-U074: non-active button does not have active class', () => {
      const btn = createButton('Click', () => {});
      expect(btn.classList.contains('active')).toBe(false);
    });
  });

  describe('hover and pointer events', () => {
    it('BTN-U080: pointerenter changes background on non-active button', () => {
      const btn = createButton('Click', () => {});
      btn.dispatchEvent(new PointerEvent('pointerenter'));
      // default variant hover background is var(--border-primary)
      expect(btn.style.background).toBe('var(--border-primary)');
    });

    it('BTN-U081: pointerleave restores original background', () => {
      const btn = createButton('Click', () => {});
      btn.dispatchEvent(new PointerEvent('pointerenter'));
      btn.dispatchEvent(new PointerEvent('pointerleave'));
      expect(btn.style.background).toBe('var(--bg-active)');
    });

    it('BTN-U082: pointerdown applies active highlight color', () => {
      const btn = createButton('Click', () => {});
      btn.dispatchEvent(new PointerEvent('pointerdown'));
      expect(btn.style.background).toBe('rgba(var(--accent-primary-rgb), 0.15)');
    });

    it('BTN-U083: pointerup after pointerdown shows hover state', () => {
      const btn = createButton('Click', () => {});
      btn.dispatchEvent(new PointerEvent('pointerdown'));
      btn.dispatchEvent(new PointerEvent('pointerup'));
      // default variant hover background is var(--border-primary)
      expect(btn.style.background).toBe('var(--border-primary)');
    });

    it('BTN-U084: disabled button does not change style on hover', () => {
      const btn = createButton('Click', () => {}, { disabled: true });
      const originalBg = btn.style.background;
      btn.dispatchEvent(new PointerEvent('pointerenter'));
      expect(btn.style.background).toBe(originalBg);
    });

    it('BTN-U085: active button does not change on pointerenter', () => {
      const btn = createButton('Click', () => {}, { active: true });
      const originalBg = btn.style.background;
      btn.dispatchEvent(new PointerEvent('pointerenter'));
      expect(btn.style.background).toBe(originalBg);
    });

    it('BTN-U086: active button stays active after pointerleave', () => {
      const btn = createButton('Click', () => {}, { active: true, variant: 'ghost' });
      btn.dispatchEvent(new PointerEvent('pointerenter'));
      btn.dispatchEvent(new PointerEvent('pointerleave'));
      expect(btn.style.background).toBe('rgba(var(--accent-primary-rgb), 0.15)');
    });
  });

  describe('borderRadius option', () => {
    it('BTN-U110: custom borderRadius overrides default', () => {
      const btn = createButton('Click', () => {}, { borderRadius: '2px' });
      expect(btn.style.borderRadius).toBe('2px');
    });

    it('BTN-U111: default borderRadius is 4px', () => {
      const btn = createButton('Click', () => {});
      expect(btn.style.borderRadius).toBe('4px');
    });
  });

  describe('a11y focus handling', () => {
    it('BTN-U120: does not have outline:none in base style', () => {
      const btn = createButton('Click', () => {});
      expect(btn.style.outline).not.toBe('none');
    });

    it('BTN-U121: keyboard focus shows focus ring', () => {
      const btn = createButton('Click', () => {});
      btn.dispatchEvent(new FocusEvent('focus'));
      expect(btn.style.outline).toBe('2px solid var(--accent-primary)');
      expect(btn.style.outlineOffset).toBe('2px');
    });

    it('BTN-U122: blur clears focus ring', () => {
      const btn = createButton('Click', () => {});
      btn.dispatchEvent(new FocusEvent('focus'));
      btn.dispatchEvent(new FocusEvent('blur'));
      expect(btn.style.outline).toBe('');
    });
  });
});

describe('setButtonActive', () => {
  it('BTN-U090: setButtonActive(true) applies accent highlight', () => {
    const btn = createButton('Click', () => {});
    setButtonActive(btn, true);
    expect(btn.style.background).toBe('rgba(var(--accent-primary-rgb), 0.15)');
    expect(btn.classList.contains('active')).toBe(true);
  });

  it('BTN-U091: setButtonActive(false) removes accent highlight', () => {
    const btn = createButton('Click', () => {}, { active: true });
    setButtonActive(btn, false);
    expect(btn.style.background).toBe('var(--bg-active)');
    expect(btn.classList.contains('active')).toBe(false);
  });

  it('BTN-U092: setButtonActive with primary variant applies accent-active', () => {
    const btn = createButton('Click', () => {}, { variant: 'primary' });
    setButtonActive(btn, true, 'primary');
    expect(btn.style.background).toBe('var(--accent-active)');
  });

  it('BTN-U093: setButtonActive with danger variant uses error color', () => {
    const btn = createButton('Click', () => {}, { variant: 'danger' });
    setButtonActive(btn, true, 'danger');
    expect(btn.style.background).toBe('var(--error)');
  });

  it('BTN-U094: setButtonActive toggles active class', () => {
    const btn = createButton('Click', () => {});
    setButtonActive(btn, true, 'ghost');
    expect(btn.classList.contains('active')).toBe(true);
    setButtonActive(btn, false, 'ghost');
    expect(btn.classList.contains('active')).toBe(false);
  });

  it('BTN-U095: pointerleave after setButtonActive(true) preserves active state', () => {
    const btn = createButton('Click', () => {}, { variant: 'ghost' });
    setButtonActive(btn, true, 'ghost');
    btn.dispatchEvent(new PointerEvent('pointerenter'));
    btn.dispatchEvent(new PointerEvent('pointerleave'));
    expect(btn.style.background).toBe('rgba(var(--accent-primary-rgb), 0.15)');
  });
});

describe('createIconButton', () => {
  it('BTN-U100: createIconButton creates button with icon', () => {
    const btn = createIconButton('<svg></svg>', () => {});
    expect(btn).toBeInstanceOf(HTMLButtonElement);
    expect(btn.innerHTML).toContain('<svg></svg>');
  });

  it('BTN-U101: createIconButton has no visible text', () => {
    const btn = createIconButton('<svg></svg>', () => {});
    const textSpans = Array.from(btn.querySelectorAll('span')).filter(
      (s) => s.textContent && s.textContent.trim().length > 0
    );
    // Should only have icon span with svg, no text span
    expect(textSpans.length).toBeLessThanOrEqual(1);
  });

  it('BTN-U102: createIconButton uses icon variant by default', () => {
    const btn = createIconButton('<svg></svg>', () => {});
    expect(btn.style.cssText).toContain('transparent');
  });

  it('BTN-U103: createIconButton can override variant to primary', () => {
    const btn = createIconButton('<svg></svg>', () => {}, { variant: 'primary' });
    expect(btn.style.cssText).toContain('var(--accent-primary)');
  });

  it('BTN-U104: createIconButton calls onClick when clicked', () => {
    const onClick = vi.fn();
    const btn = createIconButton('<svg></svg>', onClick);
    btn.click();
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('BTN-U105: createIconButton accepts title option', () => {
    const btn = createIconButton('<svg></svg>', () => {}, { title: 'Icon button' });
    expect(btn.title).toBe('Icon button');
  });

  it('BTN-U106: createIconButton accepts size option', () => {
    const btn = createIconButton('<svg></svg>', () => {}, { size: 'lg' });
    expect(btn.style.height).toBe('32px');
  });
});
