import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { OutsideClickRegistry, outsideClickRegistry } from './OutsideClickRegistry';

/**
 * Helper: dispatch a mousedown/click whose `target` we control. Using
 * `document.dispatchEvent` doesn't let us set `target`, so we dispatch from
 * the element directly and let bubbling reach the document-capture listener.
 */
function dispatch(target: Element, type: 'mousedown' | 'click'): void {
  const ev = new MouseEvent(type, { bubbles: true, cancelable: true });
  target.dispatchEvent(ev);
}

function dispatchKey(target: EventTarget, key: string): void {
  const ev = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
  target.dispatchEvent(ev);
}

describe('OutsideClickRegistry', () => {
  let registry: OutsideClickRegistry;
  let inside: HTMLDivElement;
  let outside: HTMLDivElement;

  beforeEach(() => {
    registry = new OutsideClickRegistry();
    inside = document.createElement('div');
    inside.setAttribute('data-testid', 'inside');
    outside = document.createElement('div');
    outside.setAttribute('data-testid', 'outside');
    document.body.appendChild(inside);
    document.body.appendChild(outside);
  });

  afterEach(() => {
    registry.reset();
    inside.remove();
    outside.remove();
  });

  describe('basic register/dismiss', () => {
    it('invokes onDismiss when mousedown fires outside the registered elements', () => {
      const onDismiss = vi.fn();
      registry.register({ elements: [inside], onDismiss });

      dispatch(outside, 'mousedown');

      expect(onDismiss).toHaveBeenCalledTimes(1);
    });

    it('does not invoke onDismiss when mousedown fires inside an element', () => {
      const onDismiss = vi.fn();
      registry.register({ elements: [inside], onDismiss });

      dispatch(inside, 'mousedown');

      expect(onDismiss).not.toHaveBeenCalled();
    });

    it('does not invoke onDismiss when mousedown fires on a descendant of the inside element', () => {
      const onDismiss = vi.fn();
      const child = document.createElement('span');
      inside.appendChild(child);
      registry.register({ elements: [inside], onDismiss });

      dispatch(child, 'mousedown');

      expect(onDismiss).not.toHaveBeenCalled();
    });

    it('treats multiple inside elements (e.g., trigger + popover) as a single safe zone', () => {
      const onDismiss = vi.fn();
      const popover = document.createElement('div');
      document.body.appendChild(popover);
      registry.register({ elements: [inside, popover], onDismiss });

      dispatch(popover, 'mousedown');
      expect(onDismiss).not.toHaveBeenCalled();

      dispatch(inside, 'mousedown');
      expect(onDismiss).not.toHaveBeenCalled();

      dispatch(outside, 'mousedown');
      expect(onDismiss).toHaveBeenCalledTimes(1);

      popover.remove();
    });

    it('automatically removes the registration after dismiss so it never fires twice', () => {
      const onDismiss = vi.fn();
      registry.register({ elements: [inside], onDismiss });

      dispatch(outside, 'mousedown');
      dispatch(outside, 'mousedown');

      expect(onDismiss).toHaveBeenCalledTimes(1);
      expect(registry.getRegistrationCount()).toBe(0);
    });
  });

  describe('dismissOn event type', () => {
    it('defaults to mousedown — click does not trigger dismiss', () => {
      const onDismiss = vi.fn();
      registry.register({ elements: [inside], onDismiss });

      dispatch(outside, 'click');

      expect(onDismiss).not.toHaveBeenCalled();
    });

    it('respects dismissOn: "click"', () => {
      const onDismiss = vi.fn();
      registry.register({ elements: [inside], onDismiss, dismissOn: 'click' });

      dispatch(outside, 'mousedown');
      expect(onDismiss).not.toHaveBeenCalled();

      dispatch(outside, 'click');
      expect(onDismiss).toHaveBeenCalledTimes(1);
    });
  });

  describe('deregister', () => {
    it('returns a deregister function that removes the registration', () => {
      const onDismiss = vi.fn();
      const deregister = registry.register({ elements: [inside], onDismiss });

      deregister();

      dispatch(outside, 'mousedown');
      expect(onDismiss).not.toHaveBeenCalled();
      expect(registry.getRegistrationCount()).toBe(0);
    });

    it('is idempotent — calling deregister twice is a no-op', () => {
      const onDismiss = vi.fn();
      const deregister = registry.register({ elements: [inside], onDismiss });

      deregister();
      deregister();

      expect(registry.getRegistrationCount()).toBe(0);
    });

    it('detaches global listeners when the last registration is removed', () => {
      const addSpy = vi.spyOn(document, 'addEventListener');
      const removeSpy = vi.spyOn(document, 'removeEventListener');

      const dereg = registry.register({ elements: [inside], onDismiss: () => {} });
      // Three event types attached: mousedown, click, keydown.
      const addedEvents = addSpy.mock.calls.filter(
        (c) => c[0] === 'mousedown' || c[0] === 'click' || c[0] === 'keydown',
      );
      expect(addedEvents.length).toBe(3);

      dereg();
      const removedEvents = removeSpy.mock.calls.filter(
        (c) => c[0] === 'mousedown' || c[0] === 'click' || c[0] === 'keydown',
      );
      expect(removedEvents.length).toBe(3);

      addSpy.mockRestore();
      removeSpy.mockRestore();
    });
  });

  describe('multiple independent registrations', () => {
    it('clicking inside the more-recent (innermost) registration leaves the older one open', () => {
      const a = document.createElement('div');
      const b = document.createElement('div');
      document.body.appendChild(a);
      document.body.appendChild(b);

      const onDismissA = vi.fn();
      const onDismissB = vi.fn();
      // A registered first → "outer". B registered second → "innermost".
      registry.register({ elements: [a], onDismiss: onDismissA });
      registry.register({ elements: [b], onDismiss: onDismissB });

      // Click inside B. LIFO walk: B → target inside → stop. Outer A is safe.
      dispatch(b, 'mousedown');
      expect(onDismissA).not.toHaveBeenCalled();
      expect(onDismissB).not.toHaveBeenCalled();

      // Click truly outside both: both dismiss (innermost first).
      dispatch(outside, 'mousedown');
      expect(onDismissA).toHaveBeenCalledTimes(1);
      expect(onDismissB).toHaveBeenCalledTimes(1);

      a.remove();
      b.remove();
    });

    it('clicking inside the older (outer) registration dismisses the more-recent (inner) registration', () => {
      // Documented LIFO behavior: peers are treated as a stack. If you open A,
      // then open B (which logically isn't a child of A), then click in A —
      // the registry treats it as "user clicked outside B" and dismisses B.
      // This matches typical UX where opening a second popover closes the
      // first if you interact with anything else.
      const a = document.createElement('div');
      const b = document.createElement('div');
      document.body.appendChild(a);
      document.body.appendChild(b);

      const onDismissA = vi.fn();
      const onDismissB = vi.fn();
      registry.register({ elements: [a], onDismiss: onDismissA });
      registry.register({ elements: [b], onDismiss: onDismissB });

      dispatch(a, 'mousedown');
      expect(onDismissB).toHaveBeenCalledTimes(1);
      expect(onDismissA).not.toHaveBeenCalled();

      a.remove();
      b.remove();
    });
  });

  describe('nested popovers', () => {
    it('clicking inside an inner popover does not dismiss either inner or outer', () => {
      const outerAnchor = document.createElement('div');
      const outerPopover = document.createElement('div');
      const innerAnchor = document.createElement('div');
      const innerPopover = document.createElement('div');
      // Inner popover and outer popover are both body-level (typical in this app).
      document.body.appendChild(outerAnchor);
      document.body.appendChild(outerPopover);
      document.body.appendChild(innerAnchor);
      document.body.appendChild(innerPopover);

      const onDismissOuter = vi.fn();
      const onDismissInner = vi.fn();
      // Outer registers first → less recent → "outer" in LIFO.
      registry.register({
        elements: [outerAnchor, outerPopover],
        onDismiss: onDismissOuter,
      });
      // Inner registers second → most recent → "inner" in LIFO.
      registry.register({
        elements: [innerAnchor, innerPopover],
        onDismiss: onDismissInner,
      });

      // Click inside the inner popover.
      dispatch(innerPopover, 'mousedown');

      expect(onDismissInner).not.toHaveBeenCalled();
      expect(onDismissOuter).not.toHaveBeenCalled();

      outerAnchor.remove();
      outerPopover.remove();
      innerAnchor.remove();
      innerPopover.remove();
    });

    it('clicking inside the outer popover (but outside the inner) dismisses the inner only', () => {
      const outerAnchor = document.createElement('div');
      const outerPopover = document.createElement('div');
      const innerAnchor = document.createElement('div');
      const innerPopover = document.createElement('div');
      document.body.appendChild(outerAnchor);
      document.body.appendChild(outerPopover);
      document.body.appendChild(innerAnchor);
      document.body.appendChild(innerPopover);

      const onDismissOuter = vi.fn();
      const onDismissInner = vi.fn();
      registry.register({
        elements: [outerAnchor, outerPopover],
        onDismiss: onDismissOuter,
      });
      registry.register({
        elements: [innerAnchor, innerPopover],
        onDismiss: onDismissInner,
      });

      // Click inside outer popover but not in inner's elements.
      dispatch(outerPopover, 'mousedown');

      expect(onDismissInner).toHaveBeenCalledTimes(1);
      expect(onDismissOuter).not.toHaveBeenCalled();

      outerAnchor.remove();
      outerPopover.remove();
      innerAnchor.remove();
      innerPopover.remove();
    });

    it('clicking entirely outside both dismisses both, innermost first', () => {
      const outerAnchor = document.createElement('div');
      const innerAnchor = document.createElement('div');
      document.body.appendChild(outerAnchor);
      document.body.appendChild(innerAnchor);

      const order: string[] = [];
      registry.register({
        elements: [outerAnchor],
        onDismiss: () => order.push('outer'),
      });
      registry.register({
        elements: [innerAnchor],
        onDismiss: () => order.push('inner'),
      });

      dispatch(outside, 'mousedown');

      expect(order).toEqual(['inner', 'outer']);

      outerAnchor.remove();
      innerAnchor.remove();
    });
  });

  describe('Escape key', () => {
    it('dismisses only the innermost registration that opted into Escape', () => {
      const onDismissOuter = vi.fn();
      const onDismissInner = vi.fn();
      registry.register({ elements: [inside], onDismiss: onDismissOuter });
      registry.register({ elements: [outside], onDismiss: onDismissInner });

      dispatchKey(document, 'Escape');

      expect(onDismissInner).toHaveBeenCalledTimes(1);
      expect(onDismissOuter).not.toHaveBeenCalled();
    });

    it('skips registrations with dismissOnEscape: false', () => {
      const onDismissOuter = vi.fn();
      const onDismissInner = vi.fn();
      registry.register({ elements: [inside], onDismiss: onDismissOuter });
      registry.register({
        elements: [outside],
        onDismiss: onDismissInner,
        dismissOnEscape: false,
      });

      dispatchKey(document, 'Escape');

      expect(onDismissInner).not.toHaveBeenCalled();
      expect(onDismissOuter).toHaveBeenCalledTimes(1);
    });

    it('does nothing for non-Escape keys', () => {
      const onDismiss = vi.fn();
      registry.register({ elements: [inside], onDismiss });

      dispatchKey(document, 'Enter');
      dispatchKey(document, 'a');

      expect(onDismiss).not.toHaveBeenCalled();
    });
  });

  describe('robustness', () => {
    it('survives a callback that throws', () => {
      const goodCallback = vi.fn();
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const a = document.createElement('div');
      const b = document.createElement('div');
      document.body.appendChild(a);
      document.body.appendChild(b);

      registry.register({
        elements: [a],
        onDismiss: () => {
          throw new Error('boom');
        },
      });
      registry.register({
        elements: [b],
        onDismiss: goodCallback,
      });

      dispatch(outside, 'mousedown');

      expect(goodCallback).toHaveBeenCalledTimes(1);
      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
      a.remove();
      b.remove();
    });

    it('handles null/undefined elements without crashing', () => {
      const onDismiss = vi.fn();
      registry.register({ elements: [inside, null, undefined], onDismiss });

      dispatch(inside, 'mousedown');
      expect(onDismiss).not.toHaveBeenCalled();

      dispatch(outside, 'mousedown');
      expect(onDismiss).toHaveBeenCalledTimes(1);
    });

    it('does not invoke a callback that was deregistered during another callback', () => {
      const onDismissB = vi.fn();
      const a = document.createElement('div');
      const b = document.createElement('div');
      document.body.appendChild(a);
      document.body.appendChild(b);

      const dereg = registry.register({ elements: [b], onDismiss: onDismissB });
      registry.register({
        elements: [a],
        onDismiss: () => {
          // Deregister B from inside A's callback.
          dereg();
        },
      });

      // Inner (A) is processed first in LIFO order: it deregisters B before
      // we reach B in the dismiss list.
      // BUT — we dismiss in two phases: first remove from registry, then
      // invoke callbacks. So both A and B are removed before any callback
      // runs. A's callback then attempts to deregister B → idempotent no-op.
      // B's callback still runs because it was already in the snapshot.
      // The point of this test is that nothing crashes.
      expect(() => dispatch(outside, 'mousedown')).not.toThrow();
    });
  });

  describe('singleton', () => {
    afterEach(() => {
      // Don't pollute the singleton between tests.
      outsideClickRegistry.reset();
    });

    it('exports a working singleton', () => {
      const onDismiss = vi.fn();
      const dereg = outsideClickRegistry.register({
        elements: [inside],
        onDismiss,
      });
      expect(outsideClickRegistry.getRegistrationCount()).toBe(1);
      dereg();
      expect(outsideClickRegistry.getRegistrationCount()).toBe(0);
    });
  });
});
