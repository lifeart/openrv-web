/**
 * Dropdown Viewport Clamping Regression Tests
 *
 * Verifies that dropdown/panel positioning is clamped to viewport bounds
 * for DisplayProfileControl, ToneMappingControl, StereoControl, and OCIOControl.
 * The correct clamping pattern is borrowed from CompareControl.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DisplayProfileControl } from './DisplayProfileControl';
import { ToneMappingControl } from './ToneMappingControl';
import { StereoControl } from './StereoControl';
import { OCIOControl } from './OCIOControl';

// ---------------------------------------------------------------------------
// Mock localStorage (required by DisplayProfileControl and OCIOControl)
// ---------------------------------------------------------------------------
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((_key: string, _value: string) => {
      store[_key] = _value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      store = {};
    }),
  };
})();

Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock });

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Sets `window.innerWidth` and `window.innerHeight` to simulate a viewport size. */
function setViewportSize(width: number, height: number): void {
  Object.defineProperty(window, 'innerWidth', { value: width, writable: true, configurable: true });
  Object.defineProperty(window, 'innerHeight', { value: height, writable: true, configurable: true });
}

/**
 * Mocks `getBoundingClientRect` on an element to return the given rect values.
 * All unspecified fields default to 0.
 */
function mockRect(
  el: HTMLElement,
  rect: Partial<DOMRect>,
): void {
  el.getBoundingClientRect = () => ({
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    toJSON() {
      return this;
    },
    ...rect,
  });
}

// ---------------------------------------------------------------------------
// DisplayProfileControl
// ---------------------------------------------------------------------------
describe('DisplayProfileControl – dropdown viewport clamping', () => {
  let control: DisplayProfileControl;

  beforeEach(() => {
    localStorageMock.clear();
    vi.clearAllMocks();
    control = new DisplayProfileControl();
  });

  afterEach(() => {
    control.dispose();
  });

  function openDropdown(): { button: HTMLElement; dropdown: HTMLElement } {
    const el = control.render();
    document.body.appendChild(el);
    const button = el.querySelector('[data-testid="display-profile-button"]') as HTMLElement;
    const dropdown = document.querySelector('[data-testid="display-profile-dropdown"]') as HTMLElement;
    return { button, dropdown };
  }

  it('CLAMP-DP01: clamps dropdown left when it would overflow right edge', () => {
    setViewportSize(300, 600);
    const { button, dropdown } = openDropdown();

    // Button near right edge of viewport
    mockRect(button, { left: 250, right: 330, bottom: 40, top: 30, width: 80, height: 10 });
    // Dropdown is 200px wide
    mockRect(dropdown, { width: 200, height: 150 });

    button.click();

    const left = parseFloat(dropdown.style.left);
    // left + 200 should be <= 300 - 8 (viewport - padding)
    expect(left + 200).toBeLessThanOrEqual(300 - 8);
  });

  it('CLAMP-DP02: clamps dropdown left when it would go off left edge (negative)', () => {
    setViewportSize(300, 600);
    const { button, dropdown } = openDropdown();

    // Button near left edge
    mockRect(button, { left: -50, right: 30, bottom: 40, top: 30, width: 80, height: 10 });
    mockRect(dropdown, { width: 200, height: 150 });

    button.click();

    const left = parseFloat(dropdown.style.left);
    expect(left).toBeGreaterThanOrEqual(8);
  });

  it('CLAMP-DP03: dropdown left is unchanged when viewport is wide enough', () => {
    setViewportSize(1200, 800);
    const { button, dropdown } = openDropdown();

    mockRect(button, { left: 100, right: 180, bottom: 40, top: 30, width: 80, height: 10 });
    mockRect(dropdown, { width: 200, height: 150 });

    button.click();

    const left = parseFloat(dropdown.style.left);
    expect(left).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// ToneMappingControl
// ---------------------------------------------------------------------------
describe('ToneMappingControl – dropdown viewport clamping', () => {
  let control: ToneMappingControl;

  beforeEach(() => {
    control = new ToneMappingControl();
  });

  afterEach(() => {
    control.dispose();
  });

  function openDropdown(): { button: HTMLElement; dropdown: HTMLElement } {
    const el = control.render();
    document.body.appendChild(el);
    const button = el.querySelector('[data-testid="tone-mapping-control-button"]') as HTMLElement;
    const dropdown = document.querySelector('[data-testid="tone-mapping-dropdown"]') as HTMLElement;
    return { button, dropdown };
  }

  it('CLAMP-TM01: clamps dropdown left when it would overflow right edge', () => {
    setViewportSize(300, 600);
    const { button, dropdown } = openDropdown();

    mockRect(button, { left: 250, right: 330, bottom: 40, top: 30, width: 80, height: 10 });
    mockRect(dropdown, { width: 200, height: 150 });

    button.click();

    const left = parseFloat(dropdown.style.left);
    expect(left + 200).toBeLessThanOrEqual(300 - 8);
  });

  it('CLAMP-TM02: clamps dropdown left when it would go off left edge', () => {
    setViewportSize(300, 600);
    const { button, dropdown } = openDropdown();

    mockRect(button, { left: -50, right: 30, bottom: 40, top: 30, width: 80, height: 10 });
    mockRect(dropdown, { width: 200, height: 150 });

    button.click();

    const left = parseFloat(dropdown.style.left);
    expect(left).toBeGreaterThanOrEqual(8);
  });

  it('CLAMP-TM03: dropdown left is unchanged when viewport is wide enough', () => {
    setViewportSize(1200, 800);
    const { button, dropdown } = openDropdown();

    mockRect(button, { left: 100, right: 180, bottom: 40, top: 30, width: 80, height: 10 });
    mockRect(dropdown, { width: 200, height: 150 });

    button.click();

    const left = parseFloat(dropdown.style.left);
    expect(left).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// StereoControl
// ---------------------------------------------------------------------------
describe('StereoControl – dropdown viewport clamping', () => {
  let control: StereoControl;

  beforeEach(() => {
    control = new StereoControl();
  });

  afterEach(() => {
    control.dispose();
  });

  function openDropdown(): { button: HTMLElement; dropdown: HTMLElement } {
    const el = control.render();
    document.body.appendChild(el);
    const button = el.querySelector('[data-testid="stereo-mode-button"]') as HTMLElement;
    const dropdown = document.querySelector('[data-testid="stereo-mode-dropdown"]') as HTMLElement;
    return { button, dropdown };
  }

  it('CLAMP-ST01: clamps dropdown left when it would overflow right edge', () => {
    setViewportSize(300, 600);
    const { button, dropdown } = openDropdown();

    mockRect(button, { left: 250, right: 330, bottom: 40, top: 30, width: 80, height: 10 });
    mockRect(dropdown, { width: 200, height: 150 });

    button.click();

    const left = parseFloat(dropdown.style.left);
    expect(left + 200).toBeLessThanOrEqual(300 - 8);
  });

  it('CLAMP-ST02: clamps dropdown left when it would go off left edge', () => {
    setViewportSize(300, 600);
    const { button, dropdown } = openDropdown();

    mockRect(button, { left: -50, right: 30, bottom: 40, top: 30, width: 80, height: 10 });
    mockRect(dropdown, { width: 200, height: 150 });

    button.click();

    const left = parseFloat(dropdown.style.left);
    expect(left).toBeGreaterThanOrEqual(8);
  });

  it('CLAMP-ST03: dropdown left is unchanged when viewport is wide enough', () => {
    setViewportSize(1200, 800);
    const { button, dropdown } = openDropdown();

    mockRect(button, { left: 100, right: 180, bottom: 40, top: 30, width: 80, height: 10 });
    mockRect(dropdown, { width: 200, height: 150 });

    button.click();

    const left = parseFloat(dropdown.style.left);
    expect(left).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// OCIOControl
// ---------------------------------------------------------------------------
describe('OCIOControl – panel viewport clamping', () => {
  let control: OCIOControl;

  beforeEach(() => {
    localStorageMock.clear();
    vi.clearAllMocks();
    control = new OCIOControl();
  });

  afterEach(() => {
    control.dispose();
  });

  function setupPanel(): { button: HTMLElement; panel: HTMLElement } {
    const el = control.render();
    document.body.appendChild(el);
    const button = el.querySelector('[data-testid="ocio-panel-button"]') as HTMLElement;
    // Panel is appended to body on show()
    return { button, panel: null as unknown as HTMLElement };
  }

  it('CLAMP-OC01: clamps panel left when it would overflow right edge', () => {
    setViewportSize(300, 600);
    const { button } = setupPanel();

    mockRect(button, { left: 250, right: 330, bottom: 40, top: 30, width: 80, height: 10 });

    control.show();

    const panel = document.querySelector('[data-testid="ocio-panel"]') as HTMLElement;
    // Mock panel rect after it's in the DOM
    mockRect(panel, { width: 360, height: 400 });

    // Re-show to trigger positioning with the mocked rect
    control.hide();
    control.show();

    const left = parseFloat(panel.style.left);
    expect(left + 360).toBeLessThanOrEqual(300 - 8);
  });

  it('CLAMP-OC02: clamps panel left when it would go off left edge', () => {
    setViewportSize(300, 600);
    const { button } = setupPanel();

    mockRect(button, { left: -50, right: 30, bottom: 40, top: 30, width: 80, height: 10 });

    control.show();

    const panel = document.querySelector('[data-testid="ocio-panel"]') as HTMLElement;
    mockRect(panel, { width: 360, height: 400 });

    control.hide();
    control.show();

    const left = parseFloat(panel.style.left);
    expect(left).toBeGreaterThanOrEqual(8);
  });

  it('CLAMP-OC03: panel left is unchanged when viewport is wide enough', () => {
    setViewportSize(1200, 800);
    const { button } = setupPanel();

    mockRect(button, { left: 100, right: 180, bottom: 40, top: 30, width: 80, height: 10 });

    control.show();

    const panel = document.querySelector('[data-testid="ocio-panel"]') as HTMLElement;
    mockRect(panel, { width: 360, height: 400 });

    control.hide();
    control.show();

    const left = parseFloat(panel.style.left);
    expect(left).toBe(100);
  });
});
