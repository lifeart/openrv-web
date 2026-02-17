/**
 * GhostFrameControl ARIA Attribute Tests (M-15)
 *
 * Tests for ARIA accessibility attributes on the ghost frame control.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { GhostFrameControl } from './GhostFrameControl';

describe('GhostFrameControl', () => {
  let control: GhostFrameControl;

  beforeEach(() => {
    control = new GhostFrameControl();
  });

  afterEach(() => {
    control.dispose();
  });

  describe('ARIA attributes (M-15)', () => {
    it('GFC-M15a: toggle button should have aria-haspopup attribute', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="ghost-frame-button"]') as HTMLButtonElement;
      expect(button.getAttribute('aria-haspopup')).toBe('dialog');
    });

    it('GFC-M15b: toggle button aria-expanded should be "false" when dropdown is closed', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="ghost-frame-button"]') as HTMLButtonElement;
      expect(button.getAttribute('aria-expanded')).toBe('false');
    });

    it('GFC-M15c: toggle button aria-expanded should be "true" when dropdown is open', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="ghost-frame-button"]') as HTMLButtonElement;
      button.click();
      expect(button.getAttribute('aria-expanded')).toBe('true');
    });

    it('GFC-M15d: dropdown container should have role="dialog" attribute', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="ghost-frame-button"]') as HTMLButtonElement;
      button.click();
      const dropdown = document.querySelector('[data-testid="ghost-frame-dropdown"]') as HTMLElement;
      expect(dropdown.getAttribute('role')).toBe('dialog');
    });

    it('GFC-M15e: dropdown container should have aria-label attribute', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="ghost-frame-button"]') as HTMLButtonElement;
      button.click();
      const dropdown = document.querySelector('[data-testid="ghost-frame-dropdown"]') as HTMLElement;
      expect(dropdown.getAttribute('aria-label')).toBe('Ghost Frame Settings');
    });
  });
});
