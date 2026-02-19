import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { FocusManager, FocusZone } from './FocusManager';

function createButtons(count: number): HTMLButtonElement[] {
  const buttons: HTMLButtonElement[] = [];
  for (let i = 0; i < count; i++) {
    const btn = document.createElement('button');
    btn.textContent = `Button ${i}`;
    document.body.appendChild(btn);
    buttons.push(btn);
  }
  return buttons;
}

function createZone(name: string, buttons: HTMLButtonElement[], orientation: 'horizontal' | 'vertical' = 'horizontal'): FocusZone {
  const container = document.createElement('div');
  for (const btn of buttons) {
    container.appendChild(btn);
  }
  document.body.appendChild(container);
  return {
    name,
    container,
    getItems: () => buttons,
    orientation,
  };
}

function pressKey(key: string, opts: { shiftKey?: boolean } = {}): KeyboardEvent {
  const event = new KeyboardEvent('keydown', {
    key,
    bubbles: true,
    cancelable: true,
    ...opts,
  });
  // Dispatch on the focused element so e.target is an HTMLElement (not document)
  (document.activeElement || document).dispatchEvent(event);
  return event;
}

describe('FocusManager', () => {
  let fm: FocusManager;

  beforeEach(() => {
    fm = new FocusManager();
  });

  afterEach(() => {
    fm.dispose();
    document.body.innerHTML = '';
  });

  // FM-001
  it('addZone registers a zone', () => {
    const buttons = createButtons(3);
    const zone = createZone('test', buttons);
    fm.addZone(zone);
    fm.focusZone(0);
    expect(document.activeElement).toBe(buttons[0]);
  });

  // FM-002
  it('removeZone unregisters a zone', () => {
    const buttonsA = createButtons(2);
    const buttonsB = createButtons(2);
    fm.addZone(createZone('a', buttonsA));
    fm.addZone(createZone('b', buttonsB));
    fm.removeZone('a');
    fm.focusZone(0);
    expect(document.activeElement).toBe(buttonsB[0]);
  });

  // FM-003
  it('initRovingTabindex sets first to tabindex=0, rest to -1', () => {
    const buttons = createButtons(3);
    fm.addZone(createZone('test', buttons));
    fm.initRovingTabindex('test');
    expect(buttons[0]!.getAttribute('tabindex')).toBe('0');
    expect(buttons[1]!.getAttribute('tabindex')).toBe('-1');
    expect(buttons[2]!.getAttribute('tabindex')).toBe('-1');
  });

  // FM-004
  it('ArrowRight moves focus to next item in horizontal zone', () => {
    const buttons = createButtons(3);
    const zone = createZone('test', buttons);
    fm.addZone(zone);
    fm.initRovingTabindex('test');
    buttons[0]!.focus();
    pressKey('ArrowRight');
    expect(document.activeElement).toBe(buttons[1]);
    expect(buttons[0]!.getAttribute('tabindex')).toBe('-1');
    expect(buttons[1]!.getAttribute('tabindex')).toBe('0');
  });

  // FM-005
  it('ArrowLeft moves focus to previous item', () => {
    const buttons = createButtons(3);
    const zone = createZone('test', buttons);
    fm.addZone(zone);
    fm.initRovingTabindex('test');
    buttons[1]!.setAttribute('tabindex', '0');
    buttons[0]!.setAttribute('tabindex', '-1');
    buttons[1]!.focus();
    pressKey('ArrowLeft');
    expect(document.activeElement).toBe(buttons[0]);
  });

  // FM-006
  it('Home focuses first item', () => {
    const buttons = createButtons(3);
    const zone = createZone('test', buttons);
    fm.addZone(zone);
    fm.initRovingTabindex('test');
    buttons[2]!.setAttribute('tabindex', '0');
    buttons[0]!.setAttribute('tabindex', '-1');
    buttons[2]!.focus();
    pressKey('Home');
    expect(document.activeElement).toBe(buttons[0]);
  });

  // FM-007
  it('End focuses last item', () => {
    const buttons = createButtons(3);
    const zone = createZone('test', buttons);
    fm.addZone(zone);
    fm.initRovingTabindex('test');
    buttons[0]!.focus();
    pressKey('End');
    expect(document.activeElement).toBe(buttons[2]);
  });

  // FM-008
  it('Arrow wraps at boundaries', () => {
    const buttons = createButtons(3);
    const zone = createZone('test', buttons);
    fm.addZone(zone);
    fm.initRovingTabindex('test');
    // Go past end
    buttons[2]!.setAttribute('tabindex', '0');
    buttons[0]!.setAttribute('tabindex', '-1');
    buttons[2]!.focus();
    pressKey('ArrowRight');
    expect(document.activeElement).toBe(buttons[0]);

    // Go past start
    buttons[0]!.focus();
    pressKey('ArrowLeft');
    expect(document.activeElement).toBe(buttons[2]);
  });

  // FM-009
  it('focusNextZone cycles through zones', () => {
    const buttonsA = createButtons(2);
    const buttonsB = createButtons(2);
    fm.addZone(createZone('a', buttonsA));
    fm.addZone(createZone('b', buttonsB));
    fm.focusZone(0);
    expect(document.activeElement).toBe(buttonsA[0]);
    fm.focusNextZone();
    expect(document.activeElement).toBe(buttonsB[0]);
    fm.focusNextZone();
    expect(document.activeElement).toBe(buttonsA[0]);
  });

  // FM-010
  it('focusPreviousZone cycles backward', () => {
    const buttonsA = createButtons(2);
    const buttonsB = createButtons(2);
    fm.addZone(createZone('a', buttonsA));
    fm.addZone(createZone('b', buttonsB));
    fm.focusZone(0);
    fm.focusPreviousZone();
    expect(document.activeElement).toBe(buttonsB[0]);
  });

  // FM-011
  it('trapFocus constrains Tab: wraps from last to first', () => {
    const container = document.createElement('div');
    const btn1 = document.createElement('button');
    btn1.textContent = 'First';
    const btn2 = document.createElement('button');
    btn2.textContent = 'Last';
    container.appendChild(btn1);
    container.appendChild(btn2);
    document.body.appendChild(container);

    fm.trapFocus(container);
    expect(document.activeElement).toBe(btn1);

    // Tab from last should wrap to first
    btn2.focus();
    const event = new KeyboardEvent('keydown', {
      key: 'Tab',
      bubbles: true,
      cancelable: true,
    });
    btn2.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    // FocusManager calls first.focus() when wrapping
    expect(document.activeElement).toBe(btn1);
  });

  // FM-012
  it('trapFocus wraps Shift+Tab from first to last', () => {
    const container = document.createElement('div');
    const btn1 = document.createElement('button');
    const btn2 = document.createElement('button');
    container.appendChild(btn1);
    container.appendChild(btn2);
    document.body.appendChild(container);

    fm.trapFocus(container);
    btn1.focus();
    const event = new KeyboardEvent('keydown', {
      key: 'Tab',
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    });
    btn1.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(btn2);
  });

  // FM-013
  it('releaseFocus removes trap and restores previous focus', () => {
    const outsideBtn = document.createElement('button');
    outsideBtn.textContent = 'Outside';
    document.body.appendChild(outsideBtn);
    outsideBtn.focus();

    const container = document.createElement('div');
    const innerBtn = document.createElement('button');
    container.appendChild(innerBtn);
    document.body.appendChild(container);

    fm.trapFocus(container);
    expect(document.activeElement).toBe(innerBtn);

    fm.releaseFocus();
    expect(document.activeElement).toBe(outsideBtn);
  });

  // FM-014
  it('createSkipLink returns anchor with href and class', () => {
    const link = fm.createSkipLink('main-content');
    expect(link.tagName).toBe('A');
    expect(link.getAttribute('href')).toBe('#main-content');
    expect(link.className).toBe('skip-link');
    expect(link.textContent).toBe('Skip to main content');
  });

  // FM-015
  it('dispose removes global listener', () => {
    const buttons = createButtons(3);
    const zone = createZone('test', buttons);
    fm.addZone(zone);
    fm.initRovingTabindex('test');
    buttons[0]!.focus();

    fm.dispose();

    // Arrow key should NOT move focus after dispose
    pressKey('ArrowRight');
    expect(document.activeElement).toBe(buttons[0]);
  });

  // FM-016: Vertical zone orientation
  it('ArrowDown moves focus in vertical zone, ArrowRight is ignored', () => {
    const buttons = createButtons(3);
    const zone = createZone('test', buttons, 'vertical');
    fm.addZone(zone);
    fm.initRovingTabindex('test');
    buttons[0]!.focus();

    // ArrowDown should move focus
    pressKey('ArrowDown');
    expect(document.activeElement).toBe(buttons[1]);

    // ArrowRight should NOT move focus in vertical zone
    pressKey('ArrowRight');
    expect(document.activeElement).toBe(buttons[1]);
  });

  // FM-017: ArrowUp moves focus in vertical zone
  it('ArrowUp moves focus backward in vertical zone', () => {
    const buttons = createButtons(3);
    const zone = createZone('test', buttons, 'vertical');
    fm.addZone(zone);
    fm.initRovingTabindex('test');
    buttons[1]!.setAttribute('tabindex', '0');
    buttons[0]!.setAttribute('tabindex', '-1');
    buttons[1]!.focus();
    pressKey('ArrowUp');
    expect(document.activeElement).toBe(buttons[0]);
  });

  // FM-018: Text input bypass
  it('arrow keys are ignored when focus is on a text input', () => {
    const input = document.createElement('input');
    input.type = 'text';
    const container = document.createElement('div');
    const btn = document.createElement('button');
    container.appendChild(input);
    container.appendChild(btn);
    document.body.appendChild(container);

    fm.addZone({ name: 'test', container, getItems: () => [input, btn] as HTMLElement[], orientation: 'horizontal' });
    input.focus();

    pressKey('ArrowRight');
    // Focus should stay on input (text input bypass)
    expect(document.activeElement).toBe(input);
  });

  // FM-019: initRovingTabindex with empty items is a no-op
  it('initRovingTabindex with empty items does not crash', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    fm.addZone({ name: 'empty', container, getItems: () => [], orientation: 'horizontal' });
    // Should not throw
    fm.initRovingTabindex('empty');
  });

  // FM-020: focusZone with empty zone falls back to container
  it('focusZone with empty zone focuses container', () => {
    const container = document.createElement('div');
    container.setAttribute('tabindex', '0');
    document.body.appendChild(container);
    fm.addZone({ name: 'empty', container, getItems: () => [], orientation: 'horizontal' });
    fm.focusZone(0);
    expect(document.activeElement).toBe(container);
  });

  // FM-021: initRovingTabindex preserves saved roving index
  it('initRovingTabindex preserves saved roving index after re-init', () => {
    const buttons = createButtons(3);
    fm.addZone(createZone('test', buttons));
    fm.initRovingTabindex('test');
    buttons[0]!.focus();

    // Navigate to item 2
    pressKey('ArrowRight'); // -> item 1
    pressKey('ArrowRight'); // -> item 2

    // Re-init should preserve position at item 2
    fm.initRovingTabindex('test');
    expect(buttons[2]!.getAttribute('tabindex')).toBe('0');
    expect(buttons[0]!.getAttribute('tabindex')).toBe('-1');
  });

  // FM-022: Arrow keys call preventDefault
  it('arrow keys call preventDefault when handled by roving', () => {
    const buttons = createButtons(3);
    fm.addZone(createZone('test', buttons));
    fm.initRovingTabindex('test');
    buttons[0]!.focus();

    const event = pressKey('ArrowRight');
    expect(event.defaultPrevented).toBe(true);
  });

  // FM-M23a: Zones with display:none should be skipped during F6 cycling
  it('focusZone skips zones hidden with display:none', () => {
    const buttonsA = createButtons(2);
    const buttonsB = createButtons(2);
    const buttonsC = createButtons(2);
    const zoneA = createZone('a', buttonsA);
    const zoneB = createZone('b', buttonsB);
    const zoneC = createZone('c', buttonsC);
    fm.addZone(zoneA);
    fm.addZone(zoneB);
    fm.addZone(zoneC);

    // Hide zone B with display:none
    zoneB.container.style.display = 'none';

    fm.focusZone(0);
    expect(document.activeElement).toBe(buttonsA[0]);

    // Next zone should skip B and go to C
    fm.focusNextZone();
    expect(document.activeElement).toBe(buttonsC[0]);
  });

  // FM-M23b: Zones with visibility:hidden should be skipped during F6 cycling
  it('focusZone skips zones hidden with visibility:hidden', () => {
    const buttonsA = createButtons(2);
    const buttonsB = createButtons(2);
    const buttonsC = createButtons(2);
    const zoneA = createZone('a', buttonsA);
    const zoneB = createZone('b', buttonsB);
    const zoneC = createZone('c', buttonsC);
    fm.addZone(zoneA);
    fm.addZone(zoneB);
    fm.addZone(zoneC);

    // Hide zone B with visibility:hidden
    zoneB.container.style.visibility = 'hidden';

    fm.focusZone(0);
    expect(document.activeElement).toBe(buttonsA[0]);

    // Next zone should skip B and go to C
    fm.focusNextZone();
    expect(document.activeElement).toBe(buttonsC[0]);
  });

  // FM-M23c: Zones with offsetParent === null (detached) should be skipped during F6 cycling
  it('focusZone skips detached zones (offsetParent === null)', () => {
    const buttonsA = createButtons(2);
    const buttonsB = createButtons(2);
    const buttonsC = createButtons(2);
    const zoneA = createZone('a', buttonsA);
    const zoneB = createZone('b', buttonsB);
    const zoneC = createZone('c', buttonsC);
    fm.addZone(zoneA);
    fm.addZone(zoneB);
    fm.addZone(zoneC);

    // Detach zone B from DOM (makes offsetParent === null)
    zoneB.container.remove();

    fm.focusZone(0);
    expect(document.activeElement).toBe(buttonsA[0]);

    // Next zone should skip B and go to C
    fm.focusNextZone();
    expect(document.activeElement).toBe(buttonsC[0]);
  });
});
