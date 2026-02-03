/**
 * ColorInversionToggle Unit Tests
 */

import { describe, it, expect, vi } from 'vitest';
import { ColorInversionToggle } from './ColorInversionToggle';

describe('ColorInversionToggle', () => {
  it('INVT-001: starts with inversion disabled', () => {
    const toggle = new ColorInversionToggle();
    expect(toggle.getEnabled()).toBe(false);
  });

  it('INVT-002: render returns HTMLElement', () => {
    const toggle = new ColorInversionToggle();
    const el = toggle.render();
    expect(el).toBeInstanceOf(HTMLElement);
  });

  it('INVT-003: render returns container with toggle button', () => {
    const toggle = new ColorInversionToggle();
    const el = toggle.render();
    const button = el.querySelector('button');
    expect(button).not.toBeNull();
  });

  it('INVT-004: toggle button has correct data-testid', () => {
    const toggle = new ColorInversionToggle();
    const el = toggle.render();
    const button = el.querySelector('[data-testid="color-inversion-toggle"]');
    expect(button).not.toBeNull();
  });

  it('INVT-005: toggle button displays "Invert" label', () => {
    const toggle = new ColorInversionToggle();
    const el = toggle.render();
    const label = el.querySelector('[data-testid="color-inversion-label"]');
    expect(label).not.toBeNull();
    expect(label!.textContent).toBe('Invert');
  });

  it('INVT-006: toggle enables inversion when off', () => {
    const toggle = new ColorInversionToggle();
    toggle.toggle();
    expect(toggle.getEnabled()).toBe(true);
  });

  it('INVT-007: toggle disables inversion when on', () => {
    const toggle = new ColorInversionToggle();
    toggle.toggle();
    toggle.toggle();
    expect(toggle.getEnabled()).toBe(false);
  });

  it('INVT-008: setEnabled(true) enables inversion', () => {
    const toggle = new ColorInversionToggle();
    toggle.setEnabled(true);
    expect(toggle.getEnabled()).toBe(true);
  });

  it('INVT-009: setEnabled(false) disables inversion', () => {
    const toggle = new ColorInversionToggle();
    toggle.setEnabled(true);
    toggle.setEnabled(false);
    expect(toggle.getEnabled()).toBe(false);
  });

  it('INVT-010: getEnabled returns current state', () => {
    const toggle = new ColorInversionToggle();
    expect(toggle.getEnabled()).toBe(false);
    toggle.setEnabled(true);
    expect(toggle.getEnabled()).toBe(true);
  });

  it('INVT-011: emits inversionChanged event on toggle', () => {
    const toggle = new ColorInversionToggle();
    const handler = vi.fn();
    toggle.on('inversionChanged', handler);
    toggle.toggle();
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('INVT-012: emits inversionChanged(true) when enabling', () => {
    const toggle = new ColorInversionToggle();
    const handler = vi.fn();
    toggle.on('inversionChanged', handler);
    toggle.setEnabled(true);
    expect(handler).toHaveBeenCalledWith(true);
  });

  it('INVT-013: emits inversionChanged(false) when disabling', () => {
    const toggle = new ColorInversionToggle();
    toggle.setEnabled(true);
    const handler = vi.fn();
    toggle.on('inversionChanged', handler);
    toggle.setEnabled(false);
    expect(handler).toHaveBeenCalledWith(false);
  });

  it('INVT-014: does not emit event if state unchanged', () => {
    const toggle = new ColorInversionToggle();
    const handler = vi.fn();
    toggle.on('inversionChanged', handler);
    toggle.setEnabled(false); // already false
    expect(handler).not.toHaveBeenCalled();
  });

  it('INVT-015: button has default styling when off', () => {
    const toggle = new ColorInversionToggle();
    const el = toggle.render();
    const button = el.querySelector('button') as HTMLButtonElement;
    expect(button.style.background).toBe('transparent');
  });

  it('INVT-016: button has active styling when on', () => {
    const toggle = new ColorInversionToggle();
    const el = toggle.render();
    toggle.setEnabled(true);
    const button = el.querySelector('button') as HTMLButtonElement;
    expect(button.style.borderColor).toBe('var(--accent-primary)');
    expect(button.style.color).toBe('var(--accent-primary)');
  });

  it('INVT-017: button styling updates on toggle', () => {
    const toggle = new ColorInversionToggle();
    const el = toggle.render();
    const button = el.querySelector('button') as HTMLButtonElement;

    toggle.toggle();
    expect(button.style.color).toBe('var(--accent-primary)');

    toggle.toggle();
    expect(button.style.color).toBe('var(--text-muted)');
  });

  it('INVT-018: dispose removes event listeners', () => {
    const toggle = new ColorInversionToggle();
    expect(() => toggle.dispose()).not.toThrow();
  });

  it('INVT-019: dispose is idempotent', () => {
    const toggle = new ColorInversionToggle();
    toggle.dispose();
    expect(() => toggle.dispose()).not.toThrow();
  });

  it('INVT-020: setEnabled is idempotent for same value', () => {
    const toggle = new ColorInversionToggle();
    toggle.setEnabled(true);
    const handler = vi.fn();
    toggle.on('inversionChanged', handler);
    toggle.setEnabled(true); // same value
    expect(handler).not.toHaveBeenCalled();
  });
});
