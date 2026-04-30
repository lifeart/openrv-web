// Versioned shared dependency: 38+ test files import these helpers.
// Changing any helper signature or default behavior is a breaking change
// for every consumer. Add new helpers rather than mutating existing ones.
//
// Contract reference: src/utils/ui/OutsideClickRegistry.ts — section
// "Re-entrant register/deregister during dispatch" (around line 188).

import { outsideClickRegistry } from '../OutsideClickRegistry';

export function resetOutsideClickRegistry(): void {
  outsideClickRegistry.reset();
}

export function dispatchOutsideMouseDown(target: EventTarget = document.body): void {
  target.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
}

export function dispatchOutsideClick(target: EventTarget = document.body): void {
  target.dispatchEvent(new MouseEvent('click', { bubbles: true }));
}

export function dispatchOutsideMouseSequence(target: EventTarget = document.body): void {
  // Realistic sequence: mousedown then click
  target.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  target.dispatchEvent(new MouseEvent('click', { bubbles: true }));
}

export function dispatchOutsideEscape(target: EventTarget = document): void {
  target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
}

export function expectRegistrationCount(n: number): void {
  const actual = outsideClickRegistry.getRegistrationCount();
  if (actual !== n) {
    throw new Error(`Expected ${n} OutsideClickRegistry registrations, got ${actual}`);
  }
}
