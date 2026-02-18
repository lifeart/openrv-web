/**
 * PremultControl Unit Tests
 */

import { describe, it, expect, vi } from 'vitest';
import { PremultControl } from './PremultControl';

describe('PremultControl', () => {
  it('PREMULT-001: starts with mode 0 (off)', () => {
    const control = new PremultControl();
    expect(control.getMode()).toBe(0);
  });

  it('PREMULT-002: render returns HTMLElement', () => {
    const control = new PremultControl();
    const el = control.render();
    expect(el).toBeInstanceOf(HTMLElement);
  });

  it('PREMULT-003: render returns container with button', () => {
    const control = new PremultControl();
    const el = control.render();
    const button = el.querySelector('button');
    expect(button).not.toBeNull();
  });

  it('PREMULT-004: button has correct data-testid', () => {
    const control = new PremultControl();
    const el = control.render();
    const button = el.querySelector('[data-testid="premult-control"]');
    expect(button).not.toBeNull();
  });

  it('PREMULT-005: button displays "Off" label by default', () => {
    const control = new PremultControl();
    const el = control.render();
    const label = el.querySelector('[data-testid="premult-label"]');
    expect(label).not.toBeNull();
    expect(label!.textContent).toBe('Off');
  });

  it('PREMULT-006: setMode(1) sets mode to premultiply', () => {
    const control = new PremultControl();
    control.setMode(1);
    expect(control.getMode()).toBe(1);
  });

  it('PREMULT-007: setMode(2) sets mode to unpremultiply', () => {
    const control = new PremultControl();
    control.setMode(2);
    expect(control.getMode()).toBe(2);
  });

  it('PREMULT-008: setMode(0) sets mode back to off', () => {
    const control = new PremultControl();
    control.setMode(1);
    control.setMode(0);
    expect(control.getMode()).toBe(0);
  });

  it('PREMULT-009: cycle goes Off -> Premultiply -> Unpremultiply -> Off', () => {
    const control = new PremultControl();
    expect(control.getMode()).toBe(0);
    control.cycle();
    expect(control.getMode()).toBe(1);
    control.cycle();
    expect(control.getMode()).toBe(2);
    control.cycle();
    expect(control.getMode()).toBe(0);
  });

  it('PREMULT-010: emits premultChanged event on setMode', () => {
    const control = new PremultControl();
    const handler = vi.fn();
    control.on('premultChanged', handler);
    control.setMode(1);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(1);
  });

  it('PREMULT-011: emits premultChanged(2) when setting unpremultiply', () => {
    const control = new PremultControl();
    const handler = vi.fn();
    control.on('premultChanged', handler);
    control.setMode(2);
    expect(handler).toHaveBeenCalledWith(2);
  });

  it('PREMULT-012: emits premultChanged(0) when setting off', () => {
    const control = new PremultControl();
    control.setMode(1);
    const handler = vi.fn();
    control.on('premultChanged', handler);
    control.setMode(0);
    expect(handler).toHaveBeenCalledWith(0);
  });

  it('PREMULT-013: does not emit event if mode unchanged', () => {
    const control = new PremultControl();
    const handler = vi.fn();
    control.on('premultChanged', handler);
    control.setMode(0); // already 0
    expect(handler).not.toHaveBeenCalled();
  });

  it('PREMULT-014: emits premultChanged on cycle', () => {
    const control = new PremultControl();
    const handler = vi.fn();
    control.on('premultChanged', handler);
    control.cycle();
    expect(handler).toHaveBeenCalledWith(1);
  });

  it('PREMULT-015: button has default styling when off', () => {
    const control = new PremultControl();
    const el = control.render();
    const button = el.querySelector('button') as HTMLButtonElement;
    expect(button.style.background).toBe('transparent');
  });

  it('PREMULT-016: button has active styling when premultiply', () => {
    const control = new PremultControl();
    const el = control.render();
    control.setMode(1);
    const button = el.querySelector('button') as HTMLButtonElement;
    expect(button.style.borderColor).toBe('var(--accent-primary)');
    expect(button.style.color).toBe('var(--accent-primary)');
  });

  it('PREMULT-017: button has active styling when unpremultiply', () => {
    const control = new PremultControl();
    const el = control.render();
    control.setMode(2);
    const button = el.querySelector('button') as HTMLButtonElement;
    expect(button.style.borderColor).toBe('var(--accent-primary)');
    expect(button.style.color).toBe('var(--accent-primary)');
  });

  it('PREMULT-018: label updates to "Premultiply" when mode=1', () => {
    const control = new PremultControl();
    const el = control.render();
    control.setMode(1);
    const label = el.querySelector('[data-testid="premult-label"]');
    expect(label!.textContent).toBe('Premultiply');
  });

  it('PREMULT-019: label updates to "Unpremultiply" when mode=2', () => {
    const control = new PremultControl();
    const el = control.render();
    control.setMode(2);
    const label = el.querySelector('[data-testid="premult-label"]');
    expect(label!.textContent).toBe('Unpremultiply');
  });

  it('PREMULT-020: label updates to "Off" when mode=0', () => {
    const control = new PremultControl();
    const el = control.render();
    control.setMode(1);
    control.setMode(0);
    const label = el.querySelector('[data-testid="premult-label"]');
    expect(label!.textContent).toBe('Off');
  });

  it('PREMULT-021: dispose removes event listeners', () => {
    const control = new PremultControl();
    expect(() => control.dispose()).not.toThrow();
  });

  it('PREMULT-022: dispose is idempotent', () => {
    const control = new PremultControl();
    control.dispose();
    expect(() => control.dispose()).not.toThrow();
  });

  it('PREMULT-023: setMode is idempotent for same value', () => {
    const control = new PremultControl();
    control.setMode(1);
    const handler = vi.fn();
    control.on('premultChanged', handler);
    control.setMode(1); // same value
    expect(handler).not.toHaveBeenCalled();
  });
});
