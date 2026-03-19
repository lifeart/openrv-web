/**
 * Issue #497 regression tests
 *
 * Validates that:
 * 1. VolumeControl uses hover-based interaction (pointerenter/pointerleave)
 *    to reveal its slider — making it inaccessible on pure touch devices.
 * 2. VirtualSliderController explicitly excludes touch pointerType.
 *
 * Doc-content tests live in src/docs-mobile-touch-limitations.test.ts.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { VolumeControl } from './VolumeControl';
import { VirtualSliderController } from './VirtualSliderController';
import { VirtualSliderState } from './VirtualSliderConfig';
import { KeyboardManager } from '../../utils/input/KeyboardManager';
import { ColorControls } from './ColorControls';

// Mock HistoryManager for VirtualSliderController tests
vi.mock('../../utils/HistoryManager', () => ({
  getGlobalHistoryManager: () => ({
    recordAction: vi.fn(),
    undo: vi.fn(),
    redo: vi.fn(),
  }),
  HistoryManager: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createPointerEvent(
  type: 'pointermove' | 'pointerdown' | 'pointerenter' | 'pointerleave',
  opts: Partial<PointerEventInit> & { movementX?: number } = {},
): PointerEvent {
  const { movementX, ...rest } = opts;
  const event = new PointerEvent(type, {
    bubbles: true,
    cancelable: true,
    pointerType: 'mouse',
    ...rest,
  });
  if (movementX !== undefined) {
    Object.defineProperty(event, 'movementX', { value: movementX });
  }
  return event;
}

// ---------------------------------------------------------------------------
// 1. VolumeControl hover-dependent slider
// ---------------------------------------------------------------------------

describe('Issue #497: VolumeControl hover-based slider (touch limitation)', () => {
  let vc: VolumeControl;

  beforeEach(() => {
    vc = new VolumeControl();
  });

  afterEach(() => {
    vc.dispose();
    document.body.innerHTML = '';
  });

  it('slider is hidden (width 0) by default', () => {
    const el = vc.render();
    document.body.appendChild(el);
    expect(vc.isSliderExpanded()).toBe(false);
  });

  it('slider expands on pointerenter and collapses on pointerleave', () => {
    const el = vc.render();
    document.body.appendChild(el);

    // Simulate hover
    el.dispatchEvent(new PointerEvent('pointerenter', { bubbles: true }));
    expect(vc.isSliderExpanded()).toBe(true);

    // Simulate leave
    el.dispatchEvent(new PointerEvent('pointerleave', { bubbles: true }));
    expect(vc.isSliderExpanded()).toBe(false);
  });

  // VolumeControl doesn't filter by pointerType — the touch limitation is that
  // touch devices don't reliably fire hover (pointerenter/pointerleave) events,
  // so only click is tested here.
  it('there is no click handler that expands the slider', () => {
    const el = vc.render();
    document.body.appendChild(el);

    // Click on container — should NOT expand slider
    el.click();
    expect(vc.isSliderExpanded()).toBe(false);

    // Click on mute button — should NOT expand slider
    const muteBtn = el.querySelector('[data-testid="mute-button"]') as HTMLButtonElement;
    muteBtn.click();
    expect(vc.isSliderExpanded()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 2. VirtualSliderController touch exclusion
// ---------------------------------------------------------------------------

describe('Issue #497: VirtualSliderController excludes touch pointerType', () => {
  let container: HTMLElement;
  let colorControls: ColorControls;
  let keyboardManager: KeyboardManager;
  let controller: VirtualSliderController;

  beforeEach(() => {
    vi.useFakeTimers();
    container = document.createElement('div');
    document.body.appendChild(container);
    colorControls = new ColorControls();
    keyboardManager = new KeyboardManager();
    controller = new VirtualSliderController({
      colorControls,
      container,
      keyboardManager,
    });
  });

  afterEach(() => {
    controller.dispose();
    colorControls.dispose();
    container.remove();
    vi.useRealTimers();
  });

  it('onPointerMove ignores touch events (pointerType "touch")', () => {
    // Arm the controller by pressing an activator key (E = exposure)
    document.dispatchEvent(
      new KeyboardEvent('keydown', {
        code: 'KeyE',
        key: 'e',
        bubbles: true,
        cancelable: true,
      }),
    );
    expect(controller.getState()).toBe(VirtualSliderState.ARMED);

    // Dispatch a touch pointermove — should NOT transition to ACTIVE
    const touchMove = createPointerEvent('pointermove', {
      pointerType: 'touch',
      movementX: 50,
    });
    container.dispatchEvent(touchMove);

    // Still ARMED, not ACTIVE — touch was ignored
    expect(controller.getState()).toBe(VirtualSliderState.ARMED);
  });

  it('onPointerMove accepts mouse events (pointerType "mouse")', () => {
    // Arm with E key
    document.dispatchEvent(
      new KeyboardEvent('keydown', {
        code: 'KeyE',
        key: 'e',
        bubbles: true,
        cancelable: true,
      }),
    );
    expect(controller.getState()).toBe(VirtualSliderState.ARMED);

    // Dispatch a mouse pointermove with enough displacement
    const mouseMove = createPointerEvent('pointermove', {
      pointerType: 'mouse',
      movementX: 20,
    });
    container.dispatchEvent(mouseMove);

    // Should transition to ACTIVE
    expect(controller.getState()).toBe(VirtualSliderState.ACTIVE);
  });

  it('onPointerDown ignores touch events (pointerType "touch")', () => {
    // Arm with E key
    document.dispatchEvent(
      new KeyboardEvent('keydown', {
        code: 'KeyE',
        key: 'e',
        bubbles: true,
        cancelable: true,
      }),
    );
    expect(controller.getState()).toBe(VirtualSliderState.ARMED);

    // Touch pointerdown should NOT cancel the armed state
    const touchDown = createPointerEvent('pointerdown', {
      pointerType: 'touch',
    });
    container.dispatchEvent(touchDown);

    // Still ARMED — touch was ignored
    expect(controller.getState()).toBe(VirtualSliderState.ARMED);
  });
});

