/**
 * GamutMappingControl Tests
 *
 * Tests for the gamut mapping UI control: construction, state management,
 * event emission, panel toggling, and DOM structure.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GamutMappingControl, DEFAULT_GAMUT_MAPPING_STATE, getValidTargetGamuts } from './GamutMappingControl';
import type { GamutMappingState } from '../../core/types/effects';

describe('getValidTargetGamuts', () => {
  it('returns empty array for sRGB source (narrowest gamut)', () => {
    expect(getValidTargetGamuts('srgb')).toEqual([]);
  });

  it('returns only sRGB for Display P3 source', () => {
    const targets = getValidTargetGamuts('display-p3');
    expect(targets).toEqual(['srgb']);
  });

  it('returns sRGB and Display P3 for Rec.2020 source (widest gamut)', () => {
    const targets = getValidTargetGamuts('rec2020');
    expect(targets).toContain('srgb');
    expect(targets).toContain('display-p3');
    expect(targets).toHaveLength(2);
  });
});

describe('GamutMappingControl', () => {
  let control: GamutMappingControl;

  beforeEach(() => {
    control = new GamutMappingControl();
    // Append to DOM so panel positioning works
    document.body.appendChild(control.render());
  });

  afterEach(() => {
    control.dispose();
    document.body.innerHTML = '';
  });

  describe('construction', () => {
    it('GM-001: renders a container element', () => {
      const el = control.render();
      expect(el).toBeInstanceOf(HTMLElement);
      expect(el.className).toBe('gamut-mapping-control-container');
    });

    it('GM-002: has a toggle button with correct test id', () => {
      const btn = control.render().querySelector('[data-testid="gamut-mapping-control-button"]');
      expect(btn).not.toBeNull();
      expect(btn!.tagName).toBe('BUTTON');
    });

    it('GM-003: starts with panel closed', () => {
      expect(control.isOpen).toBe(false);
    });

    it('GM-004: starts with default state (off, srgb, srgb)', () => {
      const state = control.getState();
      expect(state).toEqual(DEFAULT_GAMUT_MAPPING_STATE);
      expect(state.mode).toBe('off');
      expect(state.sourceGamut).toBe('srgb');
      expect(state.targetGamut).toBe('srgb');
    });
  });

  describe('panel toggling', () => {
    it('GM-010: toggle() opens the panel', () => {
      control.toggle();
      expect(control.isOpen).toBe(true);
    });

    it('GM-011: toggle() twice closes the panel', () => {
      control.toggle();
      control.toggle();
      expect(control.isOpen).toBe(false);
    });

    it('GM-012: show() makes panel visible', () => {
      control.show();
      expect(control.isOpen).toBe(true);
      const panel = document.querySelector('[data-testid="gamut-mapping-panel"]');
      expect(panel).not.toBeNull();
      expect((panel as HTMLElement).style.display).toBe('block');
    });

    it('GM-013: hide() makes panel hidden', () => {
      control.show();
      control.hide();
      expect(control.isOpen).toBe(false);
    });
  });

  describe('state management', () => {
    it('GM-020: setState updates internal state', () => {
      const newState: GamutMappingState = {
        mode: 'clip',
        sourceGamut: 'rec2020',
        targetGamut: 'srgb',
      };
      control.setState(newState);
      expect(control.getState()).toEqual(newState);
    });

    it('GM-021: getState returns a copy (not a reference)', () => {
      const state1 = control.getState();
      const state2 = control.getState();
      expect(state1).toEqual(state2);
      expect(state1).not.toBe(state2);
    });

    it('GM-022: reset() restores default state', () => {
      control.setState({ mode: 'compress', sourceGamut: 'display-p3', targetGamut: 'srgb' });
      control.reset();
      expect(control.getState()).toEqual(DEFAULT_GAMUT_MAPPING_STATE);
    });
  });

  describe('events', () => {
    it('GM-030: emits gamutMappingChanged on reset', () => {
      const handler = vi.fn();
      control.on('gamutMappingChanged', handler);
      control.setState({ mode: 'clip', sourceGamut: 'rec2020', targetGamut: 'srgb' });
      handler.mockClear();

      control.reset();
      expect(handler).toHaveBeenCalledOnce();
      expect(handler).toHaveBeenCalledWith(DEFAULT_GAMUT_MAPPING_STATE);
    });
  });

  describe('DOM structure', () => {
    it('GM-040: panel has mode select', () => {
      control.show();
      const select = document.querySelector('[data-testid="gamut-mapping-mode-select"]');
      expect(select).not.toBeNull();
      expect(select!.tagName).toBe('SELECT');
    });

    it('GM-041: panel has source gamut select', () => {
      control.show();
      const select = document.querySelector('[data-testid="gamut-mapping-source-select"]');
      expect(select).not.toBeNull();
    });

    it('GM-042: panel has target gamut select', () => {
      control.show();
      const select = document.querySelector('[data-testid="gamut-mapping-target-select"]');
      expect(select).not.toBeNull();
    });

    it('GM-043: panel has reset button', () => {
      control.show();
      const btn = document.querySelector('[data-testid="gamut-mapping-reset-button"]');
      expect(btn).not.toBeNull();
    });

    it('GM-044: mode select has 3 options (off, clip, compress)', () => {
      control.show();
      const select = document.querySelector('[data-testid="gamut-mapping-mode-select"]') as HTMLSelectElement;
      expect(select).not.toBeNull();
      expect(select!.options).toHaveLength(3);
      expect(select!.options[0]!.value).toBe('off');
      expect(select!.options[1]!.value).toBe('clip');
      expect(select!.options[2]!.value).toBe('compress');
    });

    it('GM-045: source select has 3 gamut options; target is dynamic based on source', () => {
      control.show();
      const source = document.querySelector('[data-testid="gamut-mapping-source-select"]') as HTMLSelectElement;
      const target = document.querySelector('[data-testid="gamut-mapping-target-select"]') as HTMLSelectElement;
      expect(source.options).toHaveLength(3);
      // Default source is sRGB, which has no narrower gamuts → 0 target options
      expect(target.options).toHaveLength(0);
    });

    it('GM-046: source/target selects are disabled when mode is off', () => {
      control.show();
      const source = document.querySelector('[data-testid="gamut-mapping-source-select"]') as HTMLSelectElement;
      const target = document.querySelector('[data-testid="gamut-mapping-target-select"]') as HTMLSelectElement;
      expect(source.disabled).toBe(true);
      expect(target.disabled).toBe(true);
    });

    it('GM-047: source/target selects are enabled when mode is clip', () => {
      control.setState({ mode: 'clip', sourceGamut: 'rec2020', targetGamut: 'srgb' });
      control.show();
      const source = document.querySelector('[data-testid="gamut-mapping-source-select"]') as HTMLSelectElement;
      const target = document.querySelector('[data-testid="gamut-mapping-target-select"]') as HTMLSelectElement;
      expect(source.disabled).toBe(false);
      expect(target.disabled).toBe(false);
    });
  });

  describe('select change events emit gamutMappingChanged', () => {
    it('GM-060: changing mode select triggers gamutMappingChanged event', () => {
      const handler = vi.fn();
      control.on('gamutMappingChanged', handler);
      control.show();

      const modeSelect = document.querySelector('[data-testid="gamut-mapping-mode-select"]') as HTMLSelectElement;
      modeSelect.value = 'clip';
      modeSelect.dispatchEvent(new Event('change'));

      expect(handler).toHaveBeenCalledOnce();
      expect(handler).toHaveBeenCalledWith(expect.objectContaining({ mode: 'clip' }));
    });

    it('GM-061: changing source select triggers gamutMappingChanged event', () => {
      // Set mode to clip so selects are enabled
      control.setState({ mode: 'clip', sourceGamut: 'rec2020', targetGamut: 'srgb' });
      const handler = vi.fn();
      control.on('gamutMappingChanged', handler);
      control.show();

      const sourceSelect = document.querySelector('[data-testid="gamut-mapping-source-select"]') as HTMLSelectElement;
      sourceSelect.value = 'display-p3';
      sourceSelect.dispatchEvent(new Event('change'));

      expect(handler).toHaveBeenCalledOnce();
      expect(handler).toHaveBeenCalledWith(expect.objectContaining({ sourceGamut: 'display-p3' }));
    });

    it('GM-062: changing target select triggers gamutMappingChanged event', () => {
      // Set source to rec2020 so there are valid target options
      control.setState({ mode: 'clip', sourceGamut: 'rec2020', targetGamut: 'srgb' });
      const handler = vi.fn();
      control.on('gamutMappingChanged', handler);
      control.show();

      const targetSelect = document.querySelector('[data-testid="gamut-mapping-target-select"]') as HTMLSelectElement;
      targetSelect.value = 'display-p3';
      targetSelect.dispatchEvent(new Event('change'));

      expect(handler).toHaveBeenCalledOnce();
      expect(handler).toHaveBeenCalledWith(expect.objectContaining({ targetGamut: 'display-p3' }));
    });

    it('GM-063: changing mode/source/target emits correct full state', () => {
      const handler = vi.fn();
      control.on('gamutMappingChanged', handler);
      control.show();

      // Change mode to clip
      const modeSelect = document.querySelector('[data-testid="gamut-mapping-mode-select"]') as HTMLSelectElement;
      modeSelect.value = 'clip';
      modeSelect.dispatchEvent(new Event('change'));

      // Change source to rec2020
      const sourceSelect = document.querySelector('[data-testid="gamut-mapping-source-select"]') as HTMLSelectElement;
      sourceSelect.value = 'rec2020';
      sourceSelect.dispatchEvent(new Event('change'));

      // Change target to display-p3
      const targetSelect = document.querySelector('[data-testid="gamut-mapping-target-select"]') as HTMLSelectElement;
      targetSelect.value = 'display-p3';
      targetSelect.dispatchEvent(new Event('change'));

      expect(handler).toHaveBeenCalledTimes(3);
      // Last call should have the full accumulated state
      expect(handler).toHaveBeenLastCalledWith({
        mode: 'clip',
        sourceGamut: 'rec2020',
        targetGamut: 'display-p3',
      });
    });
  });

  describe('document click-outside-to-close', () => {
    it('GM-070: clicking outside the panel closes it', () => {
      control.show();
      expect(control.isOpen).toBe(true);

      // Create an element outside the control and click it
      const outsideEl = document.createElement('div');
      document.body.appendChild(outsideEl);
      outsideEl.dispatchEvent(new MouseEvent('click', { bubbles: true }));

      expect(control.isOpen).toBe(false);
    });

    it('GM-071: clicking inside the panel does NOT close it', () => {
      control.show();
      expect(control.isOpen).toBe(true);

      // Click on the panel itself
      const panel = document.querySelector('[data-testid="gamut-mapping-panel"]') as HTMLElement;
      panel.dispatchEvent(new MouseEvent('click', { bubbles: true }));

      expect(control.isOpen).toBe(true);
    });

    it('GM-072: clicking the toggle button does NOT close via document handler', () => {
      control.show();
      expect(control.isOpen).toBe(true);

      // Click on the control button (inside the container)
      const btn = document.querySelector('[data-testid="gamut-mapping-control-button"]') as HTMLElement;
      btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));

      // The toggle() method will close it, but the document click handler
      // should not interfere (the container.contains check should pass)
      // After toggle(), it should be closed
      expect(control.isOpen).toBe(false);
    });
  });

  describe('target gamut restriction (wider-to-narrower only)', () => {
    it('GM-080: sRGB source has no valid target options', () => {
      control.setState({ mode: 'clip', sourceGamut: 'srgb', targetGamut: 'srgb' });
      control.show();
      const target = document.querySelector('[data-testid="gamut-mapping-target-select"]') as HTMLSelectElement;
      expect(target.options).toHaveLength(0);
    });

    it('GM-081: Display P3 source has sRGB as only target option', () => {
      control.setState({ mode: 'clip', sourceGamut: 'display-p3', targetGamut: 'srgb' });
      control.show();
      const target = document.querySelector('[data-testid="gamut-mapping-target-select"]') as HTMLSelectElement;
      expect(target.options).toHaveLength(1);
      expect(target.options[0]!.value).toBe('srgb');
    });

    it('GM-082: Rec.2020 source has P3 and sRGB as target options', () => {
      control.setState({ mode: 'clip', sourceGamut: 'rec2020', targetGamut: 'srgb' });
      control.show();
      const target = document.querySelector('[data-testid="gamut-mapping-target-select"]') as HTMLSelectElement;
      expect(target.options).toHaveLength(2);
      const values = Array.from(target.options).map((o) => o.value);
      expect(values).toContain('srgb');
      expect(values).toContain('display-p3');
    });

    it('GM-083: target select is disabled when source is sRGB (no valid targets)', () => {
      control.setState({ mode: 'clip', sourceGamut: 'srgb', targetGamut: 'srgb' });
      control.show();
      const target = document.querySelector('[data-testid="gamut-mapping-target-select"]') as HTMLSelectElement;
      expect(target.disabled).toBe(true);
    });

    it('GM-084: changing source from rec2020 to srgb clears target options', () => {
      control.setState({ mode: 'clip', sourceGamut: 'rec2020', targetGamut: 'srgb' });
      control.show();

      const sourceSelect = document.querySelector('[data-testid="gamut-mapping-source-select"]') as HTMLSelectElement;
      sourceSelect.value = 'srgb';
      sourceSelect.dispatchEvent(new Event('change'));

      const target = document.querySelector('[data-testid="gamut-mapping-target-select"]') as HTMLSelectElement;
      expect(target.options).toHaveLength(0);
    });

    it('GM-085: changing source updates target to first valid option if current is invalid', () => {
      control.setState({ mode: 'clip', sourceGamut: 'rec2020', targetGamut: 'display-p3' });
      control.show();

      // Change source to P3 — display-p3 is no longer a valid target
      const sourceSelect = document.querySelector('[data-testid="gamut-mapping-source-select"]') as HTMLSelectElement;
      sourceSelect.value = 'display-p3';
      sourceSelect.dispatchEvent(new Event('change'));

      // Target should be reset to sRGB (the only valid target for P3)
      expect(control.getState().targetGamut).toBe('srgb');
    });
  });

  describe('disposal', () => {
    it('GM-050: dispose removes panel from DOM', () => {
      control.show();
      const panelBefore = document.querySelector('[data-testid="gamut-mapping-panel"]');
      expect(panelBefore).not.toBeNull();

      control.dispose();
      const panelAfter = document.querySelector('[data-testid="gamut-mapping-panel"]');
      expect(panelAfter).toBeNull();
    });
  });
});
