/**
 * Regression test for issue #116 (resolved):
 * Volume slider disclosure is now separated from the mute action.
 * Click only toggles mute; hover/focus expands the slider.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { VolumeControl } from './VolumeControl';

describe('VolumeControl - issue #116 (resolved)', () => {
  let control: VolumeControl;

  beforeEach(() => {
    control = new VolumeControl();
  });

  afterEach(() => {
    control.dispose();
  });

  it('mute button click only toggles mute, does not expand slider', () => {
    const el = control.render();
    document.body.appendChild(el);

    // Initially: not muted, slider not expanded
    expect(control.isMuted()).toBe(false);
    expect(control.isSliderExpanded()).toBe(false);

    // Click mute button
    const muteButton = el.querySelector('[data-testid="mute-button"]') as HTMLButtonElement;
    muteButton.click();

    // Mute toggled, but slider NOT expanded
    expect(control.isMuted()).toBe(true);
    expect(control.isSliderExpanded()).toBe(false);

    // Click again: unmutes, slider still not expanded
    muteButton.click();
    expect(control.isMuted()).toBe(false);
    expect(control.isSliderExpanded()).toBe(false);

    document.body.removeChild(el);
  });

  it('hover expands slider without affecting mute state', () => {
    const el = control.render();
    document.body.appendChild(el);

    expect(control.isMuted()).toBe(false);
    expect(control.isSliderExpanded()).toBe(false);

    // Hover expands slider
    el.dispatchEvent(new MouseEvent('pointerenter', { bubbles: true }));
    expect(control.isSliderExpanded()).toBe(true);
    expect(control.isMuted()).toBe(false);

    // Leave collapses slider
    el.dispatchEvent(new MouseEvent('pointerleave', { bubbles: true }));
    expect(control.isSliderExpanded()).toBe(false);
    expect(control.isMuted()).toBe(false);

    document.body.removeChild(el);
  });

  it('focus on mute button expands slider for keyboard accessibility', () => {
    const el = control.render();
    document.body.appendChild(el);

    const muteButton = el.querySelector('[data-testid="mute-button"]') as HTMLButtonElement;

    // Focus expands slider
    muteButton.focus();
    expect(control.isSliderExpanded()).toBe(true);
    expect(control.isMuted()).toBe(false);

    document.body.removeChild(el);
  });
});
