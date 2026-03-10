/**
 * Regression test for issue #116:
 * Volume slider disclosure is tied to the mute button, so
 * keyboard/touch use mutates audio state just to reach the slider.
 *
 * Documents the current behavior where clicking mute both toggles
 * mute AND expands the slider.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { VolumeControl } from './VolumeControl';

describe('VolumeControl - issue #116', () => {
  let control: VolumeControl;

  beforeEach(() => {
    control = new VolumeControl();
  });

  afterEach(() => {
    control.dispose();
  });

  it('mute button click both toggles mute and expands slider (documented behavior)', () => {
    const el = control.render();
    document.body.appendChild(el);

    // Initially: not muted, slider not expanded
    expect(control.isMuted()).toBe(false);
    expect(control.isSliderExpanded()).toBe(false);

    // Click mute button
    const muteButton = el.querySelector('[data-testid="mute-button"]') as HTMLButtonElement;
    muteButton.click();

    // Both mute AND slider expansion happen together
    expect(control.isMuted()).toBe(true);
    expect(control.isSliderExpanded()).toBe(true);

    // Click again: unmutes AND collapses slider
    muteButton.click();
    expect(control.isMuted()).toBe(false);
    expect(control.isSliderExpanded()).toBe(false);

    document.body.removeChild(el);
  });
});
