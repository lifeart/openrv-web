/**
 * LUTPipelinePanel Unit Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LUTPipeline, type LUT3D } from '../../color/ColorProcessingFacade';
import { LUTPipelinePanel } from './LUTPipelinePanel';

function createTestLUT3D(title: string = 'Test'): LUT3D {
  const size = 2;
  const data = new Float32Array(size * size * size * 3);
  for (let r = 0; r < size; r++) {
    for (let g = 0; g < size; g++) {
      for (let b = 0; b < size; b++) {
        const idx = (r * size * size + g * size + b) * 3;
        data[idx] = r / (size - 1);
        data[idx + 1] = g / (size - 1);
        data[idx + 2] = b / (size - 1);
      }
    }
  }
  return { title, size, domainMin: [0, 0, 0], domainMax: [1, 1, 1], data };
}

describe('LUTPipelinePanel', () => {
  let pipeline: LUTPipeline;
  let panel: LUTPipelinePanel;

  beforeEach(() => {
    pipeline = new LUTPipeline();
    panel = new LUTPipelinePanel(pipeline);
  });

  afterEach(() => {
    panel.dispose();
  });

  describe('construction', () => {
    it('LPP-001: panel is created and appended to document body', () => {
      const panelEl = document.querySelector('[data-testid="lut-pipeline-panel"]');
      expect(panelEl).toBeTruthy();
    });

    it('LPP-002: panel has correct data-testid', () => {
      const panelEl = document.querySelector('[data-testid="lut-pipeline-panel"]');
      expect(panelEl).toBeTruthy();
      expect((panelEl as HTMLElement).dataset.testid).toBe('lut-pipeline-panel');
    });

    it('LPP-003: registers default source in pipeline on construction', () => {
      const sourceIds = pipeline.getSourceIds();
      expect(sourceIds).toContain('default');
    });

    it('LPP-004: sets default source as active in pipeline', () => {
      expect(pipeline.getActiveSourceId()).toBe('default');
    });

    it('LPP-005: panel starts hidden (display: none)', () => {
      const panelEl = document.querySelector('[data-testid="lut-pipeline-panel"]') as HTMLElement;
      expect(panelEl.style.display).toBe('none');
    });

    it('LPP-006: panel contains all four stage sections', () => {
      expect(document.querySelector('[data-testid="lut-precache-section"]')).toBeTruthy();
      expect(document.querySelector('[data-testid="lut-file-section"]')).toBeTruthy();
      expect(document.querySelector('[data-testid="lut-look-section"]')).toBeTruthy();
      expect(document.querySelector('[data-testid="lut-display-section"]')).toBeTruthy();
    });

    it('LPP-007: panel contains header with title', () => {
      const panelEl = document.querySelector('[data-testid="lut-pipeline-panel"]') as HTMLElement;
      expect(panelEl.textContent).toContain('LUT Pipeline');
    });

    it('LPP-008: panel contains help button', () => {
      expect(document.querySelector('[data-testid="lut-pipeline-help"]')).toBeTruthy();
    });

    it('LPP-009: panel contains reset button', () => {
      expect(document.querySelector('[data-testid="lut-pipeline-reset"]')).toBeTruthy();
    });

    it('LPP-010: panel contains close button', () => {
      expect(document.querySelector('[data-testid="lut-pipeline-close"]')).toBeTruthy();
    });

    it('LPP-011: panel contains source selector', () => {
      const selector = document.querySelector('[data-testid="lut-source-selector"]') as HTMLSelectElement;
      expect(selector).toBeTruthy();
    });

    it('LPP-012: source selector has Default Source option', () => {
      const selector = document.querySelector('[data-testid="lut-source-selector"]') as HTMLSelectElement;
      expect(selector.options.length).toBe(1);
      expect(selector.options[0]!.value).toBe('default');
      expect(selector.options[0]!.textContent).toBe('Default Source');
    });

    it('LPP-013: panel contains chain indicator text', () => {
      const panelEl = document.querySelector('[data-testid="lut-pipeline-panel"]') as HTMLElement;
      expect(panelEl.textContent).toContain('Chain: Pre-Cache -> File -> Corrections -> Look -> Display');
    });

    it('LPP-014: panel contains corrections separator', () => {
      const panelEl = document.querySelector('[data-testid="lut-pipeline-panel"]') as HTMLElement;
      expect(panelEl.textContent).toContain('Color Corrections');
    });
  });

  describe('visibility', () => {
    it('LPP-015: starts not visible', () => {
      expect(panel.getIsVisible()).toBe(false);
    });

    it('LPP-016: show() makes panel visible', () => {
      panel.show();
      expect(panel.getIsVisible()).toBe(true);
    });

    it('LPP-017: show() sets display to block', () => {
      panel.show();
      const panelEl = document.querySelector('[data-testid="lut-pipeline-panel"]') as HTMLElement;
      expect(panelEl.style.display).toBe('block');
    });

    it('LPP-018: hide() makes panel not visible', () => {
      panel.show();
      panel.hide();
      expect(panel.getIsVisible()).toBe(false);
    });

    it('LPP-019: hide() sets display to none', () => {
      panel.show();
      panel.hide();
      const panelEl = document.querySelector('[data-testid="lut-pipeline-panel"]') as HTMLElement;
      expect(panelEl.style.display).toBe('none');
    });

    it('LPP-020: show() is idempotent', () => {
      panel.show();
      panel.show();
      expect(panel.getIsVisible()).toBe(true);
    });

    it('LPP-021: hide() is idempotent', () => {
      panel.hide();
      panel.hide();
      expect(panel.getIsVisible()).toBe(false);
    });

    it('LPP-022: toggle() shows when hidden', () => {
      panel.toggle();
      expect(panel.getIsVisible()).toBe(true);
    });

    it('LPP-023: toggle() hides when visible', () => {
      panel.show();
      panel.toggle();
      expect(panel.getIsVisible()).toBe(false);
    });

    it('LPP-024: double toggle returns to original state', () => {
      panel.toggle();
      panel.toggle();
      expect(panel.getIsVisible()).toBe(false);
    });
  });

  describe('visibilityChanged event', () => {
    it('LPP-025: emits visibilityChanged(true) on show', () => {
      const handler = vi.fn();
      panel.on('visibilityChanged', handler);
      panel.show();
      expect(handler).toHaveBeenCalledWith(true);
    });

    it('LPP-026: emits visibilityChanged(false) on hide', () => {
      const handler = vi.fn();
      panel.show();
      panel.on('visibilityChanged', handler);
      panel.hide();
      expect(handler).toHaveBeenCalledWith(false);
    });

    it('LPP-027: does not emit when show() called while already visible', () => {
      panel.show();
      const handler = vi.fn();
      panel.on('visibilityChanged', handler);
      panel.show();
      expect(handler).not.toHaveBeenCalled();
    });

    it('LPP-028: does not emit when hide() called while already hidden', () => {
      const handler = vi.fn();
      panel.on('visibilityChanged', handler);
      panel.hide();
      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('close button', () => {
    it('LPP-029: clicking close button hides the panel', () => {
      panel.show();
      const closeBtn = document.querySelector('[data-testid="lut-pipeline-close"]') as HTMLButtonElement;
      closeBtn.click();
      expect(panel.getIsVisible()).toBe(false);
    });

    it('LPP-030: clicking close button emits visibilityChanged(false)', () => {
      panel.show();
      const handler = vi.fn();
      panel.on('visibilityChanged', handler);
      const closeBtn = document.querySelector('[data-testid="lut-pipeline-close"]') as HTMLButtonElement;
      closeBtn.click();
      expect(handler).toHaveBeenCalledWith(false);
    });
  });

  describe('getPipeline', () => {
    it('LPP-031: returns the pipeline instance', () => {
      expect(panel.getPipeline()).toBe(pipeline);
    });
  });

  describe('getPipelineState', () => {
    it('LPP-032: returns correct initial state', () => {
      const state = panel.getPipelineState();
      expect(state.precache.hasLUT).toBe(false);
      expect(state.precache.enabled).toBe(true);
      expect(state.precache.intensity).toBe(1);
      expect(state.precache.lutName).toBeNull();
    });

    it('LPP-033: returns correct initial state for file', () => {
      const state = panel.getPipelineState();
      expect(state.file.hasLUT).toBe(false);
      expect(state.file.enabled).toBe(true);
      expect(state.file.intensity).toBe(1);
      expect(state.file.lutName).toBeNull();
    });

    it('LPP-034: returns correct initial state for look', () => {
      const state = panel.getPipelineState();
      expect(state.look.hasLUT).toBe(false);
      expect(state.look.enabled).toBe(true);
      expect(state.look.intensity).toBe(1);
      expect(state.look.lutName).toBeNull();
    });

    it('LPP-035: returns correct initial state for display', () => {
      const state = panel.getPipelineState();
      expect(state.display.hasLUT).toBe(false);
      expect(state.display.enabled).toBe(true);
      expect(state.display.intensity).toBe(1);
      expect(state.display.lutName).toBeNull();
    });

    it('LPP-036: reflects loaded file LUT', () => {
      const lut = createTestLUT3D();
      pipeline.setFileLUT('default', lut, 'test-file.cube');
      const state = panel.getPipelineState();
      expect(state.file.hasLUT).toBe(true);
      expect(state.file.lutName).toBe('test-file.cube');
    });

    it('LPP-037: reflects loaded precache LUT', () => {
      const lut = createTestLUT3D();
      pipeline.setPreCacheLUT('default', lut, 'precache.cube');
      const state = panel.getPipelineState();
      expect(state.precache.hasLUT).toBe(true);
      expect(state.precache.lutName).toBe('precache.cube');
    });

    it('LPP-038: reflects loaded look LUT', () => {
      const lut = createTestLUT3D();
      pipeline.setLookLUT('default', lut, 'look.cube');
      const state = panel.getPipelineState();
      expect(state.look.hasLUT).toBe(true);
      expect(state.look.lutName).toBe('look.cube');
    });

    it('LPP-039: reflects loaded display LUT', () => {
      const lut = createTestLUT3D();
      pipeline.setDisplayLUT(lut, 'display.cube');
      const state = panel.getPipelineState();
      expect(state.display.hasLUT).toBe(true);
      expect(state.display.lutName).toBe('display.cube');
    });

    it('LPP-040: reflects changed enabled state', () => {
      pipeline.setFileLUTEnabled('default', false);
      const state = panel.getPipelineState();
      expect(state.file.enabled).toBe(false);
    });

    it('LPP-041: reflects changed intensity', () => {
      pipeline.setFileLUTIntensity('default', 0.5);
      const state = panel.getPipelineState();
      expect(state.file.intensity).toBe(0.5);
    });
  });

  describe('reset button', () => {
    it('LPP-042: clicking reset button clears all LUTs', () => {
      const lut = createTestLUT3D();
      pipeline.setFileLUT('default', lut, 'test.cube');
      pipeline.setDisplayLUT(lut, 'display.cube');
      pipeline.setLookLUT('default', lut, 'look.cube');

      const resetBtn = document.querySelector('[data-testid="lut-pipeline-reset"]') as HTMLButtonElement;
      resetBtn.click();

      const state = panel.getPipelineState();
      expect(state.file.hasLUT).toBe(false);
      expect(state.display.hasLUT).toBe(false);
      expect(state.look.hasLUT).toBe(false);
    });

    it('LPP-043: clicking reset emits pipelineChanged event', () => {
      const handler = vi.fn();
      panel.on('pipelineChanged', handler);
      const resetBtn = document.querySelector('[data-testid="lut-pipeline-reset"]') as HTMLButtonElement;
      resetBtn.click();
      expect(handler).toHaveBeenCalled();
    });

    it('LPP-044: reset restores all enabled states to true', () => {
      pipeline.setFileLUTEnabled('default', false);
      pipeline.setLookLUTEnabled('default', false);
      pipeline.setDisplayLUTEnabled(false);

      const resetBtn = document.querySelector('[data-testid="lut-pipeline-reset"]') as HTMLButtonElement;
      resetBtn.click();

      const state = panel.getPipelineState();
      expect(state.file.enabled).toBe(true);
      expect(state.look.enabled).toBe(true);
      expect(state.display.enabled).toBe(true);
    });

    it('LPP-045: reset restores all intensities to 1', () => {
      pipeline.setFileLUTIntensity('default', 0.3);
      pipeline.setLookLUTIntensity('default', 0.5);
      pipeline.setDisplayLUTIntensity(0.7);

      const resetBtn = document.querySelector('[data-testid="lut-pipeline-reset"]') as HTMLButtonElement;
      resetBtn.click();

      const state = panel.getPipelineState();
      expect(state.file.intensity).toBe(1);
      expect(state.look.intensity).toBe(1);
      expect(state.display.intensity).toBe(1);
    });
  });

  describe('stage toggle interaction (via checkbox)', () => {
    it('LPP-046: toggling precache checkbox emits pipelineChanged', () => {
      const handler = vi.fn();
      panel.on('pipelineChanged', handler);
      const toggle = document.querySelector('[data-testid="lut-precache-toggle"]') as HTMLInputElement;
      toggle.checked = false;
      toggle.dispatchEvent(new Event('change'));
      expect(handler).toHaveBeenCalled();
    });

    it('LPP-047: toggling file checkbox updates pipeline state', () => {
      const toggle = document.querySelector('[data-testid="lut-file-toggle"]') as HTMLInputElement;
      toggle.checked = false;
      toggle.dispatchEvent(new Event('change'));
      const state = panel.getPipelineState();
      expect(state.file.enabled).toBe(false);
    });

    it('LPP-048: toggling look checkbox updates pipeline state', () => {
      const toggle = document.querySelector('[data-testid="lut-look-toggle"]') as HTMLInputElement;
      toggle.checked = false;
      toggle.dispatchEvent(new Event('change'));
      const state = panel.getPipelineState();
      expect(state.look.enabled).toBe(false);
    });

    it('LPP-049: toggling display checkbox updates pipeline state', () => {
      const toggle = document.querySelector('[data-testid="lut-display-toggle"]') as HTMLInputElement;
      toggle.checked = false;
      toggle.dispatchEvent(new Event('change'));
      const state = panel.getPipelineState();
      expect(state.display.enabled).toBe(false);
    });
  });

  describe('stage intensity interaction (via slider)', () => {
    it('LPP-050: changing file intensity slider emits pipelineChanged', () => {
      const handler = vi.fn();
      panel.on('pipelineChanged', handler);
      const slider = document.querySelector('[data-testid="lut-file-intensity"]') as HTMLInputElement;
      slider.value = '0.5';
      slider.dispatchEvent(new Event('input'));
      expect(handler).toHaveBeenCalled();
    });

    it('LPP-051: changing precache intensity slider updates pipeline', () => {
      const slider = document.querySelector('[data-testid="lut-precache-intensity"]') as HTMLInputElement;
      slider.value = '0.25';
      slider.dispatchEvent(new Event('input'));
      const state = panel.getPipelineState();
      expect(state.precache.intensity).toBe(0.25);
    });

    it('LPP-052: changing display intensity slider updates pipeline', () => {
      const slider = document.querySelector('[data-testid="lut-display-intensity"]') as HTMLInputElement;
      slider.value = '0.8';
      slider.dispatchEvent(new Event('input'));
      const state = panel.getPipelineState();
      expect(state.display.intensity).toBe(0.8);
    });
  });

  describe('stage clear interaction (via clear button)', () => {
    it('LPP-053: clearing file stage clears pipeline file LUT', () => {
      const lut = createTestLUT3D();
      pipeline.setFileLUT('default', lut, 'test.cube');

      // We need to sync UI to make clear button visible
      panel.show();

      const clearBtn = document.querySelector('[data-testid="lut-file-clear-button"]') as HTMLButtonElement;
      clearBtn.click();

      const state = panel.getPipelineState();
      expect(state.file.hasLUT).toBe(false);
      expect(state.file.lutName).toBeNull();
    });

    it('LPP-054: clearing file stage emits pipelineChanged', () => {
      const handler = vi.fn();
      panel.on('pipelineChanged', handler);
      const clearBtn = document.querySelector('[data-testid="lut-file-clear-button"]') as HTMLButtonElement;
      clearBtn.click();
      expect(handler).toHaveBeenCalled();
    });

    it('LPP-055: clearing precache stage clears pipeline precache LUT', () => {
      const lut = createTestLUT3D();
      pipeline.setPreCacheLUT('default', lut, 'precache.cube');
      panel.show();

      const clearBtn = document.querySelector('[data-testid="lut-precache-clear-button"]') as HTMLButtonElement;
      clearBtn.click();

      const state = panel.getPipelineState();
      expect(state.precache.hasLUT).toBe(false);
    });

    it('LPP-056: clearing look stage clears pipeline look LUT', () => {
      const lut = createTestLUT3D();
      pipeline.setLookLUT('default', lut, 'look.cube');
      panel.show();

      const clearBtn = document.querySelector('[data-testid="lut-look-clear-button"]') as HTMLButtonElement;
      clearBtn.click();

      const state = panel.getPipelineState();
      expect(state.look.hasLUT).toBe(false);
    });

    it('LPP-057: clearing display stage clears pipeline display LUT', () => {
      const lut = createTestLUT3D();
      pipeline.setDisplayLUT(lut, 'display.cube');
      panel.show();

      const clearBtn = document.querySelector('[data-testid="lut-display-clear-button"]') as HTMLButtonElement;
      clearBtn.click();

      const state = panel.getPipelineState();
      expect(state.display.hasLUT).toBe(false);
    });
  });

  describe('UI sync from pipeline (syncUIFromPipeline via show)', () => {
    it('LPP-058: show() syncs file LUT name from pipeline', () => {
      const lut = createTestLUT3D();
      pipeline.setFileLUT('default', lut, 'synced.cube');
      panel.show();

      const nameSpan = document.querySelector('[data-testid="lut-file-name"]') as HTMLSpanElement;
      expect(nameSpan.textContent).toBe('synced.cube');
    });

    it('LPP-059: show() syncs precache enabled state from pipeline', () => {
      pipeline.setPreCacheLUTEnabled('default', false);
      panel.show();

      const toggle = document.querySelector('[data-testid="lut-precache-toggle"]') as HTMLInputElement;
      expect(toggle.checked).toBe(false);
    });

    it('LPP-060: show() syncs look intensity from pipeline', () => {
      pipeline.setLookLUTIntensity('default', 0.42);
      panel.show();

      const slider = document.querySelector('[data-testid="lut-look-intensity"]') as HTMLInputElement;
      expect(slider.value).toBe('0.42');
    });

    it('LPP-061: show() syncs display LUT name from pipeline', () => {
      const lut = createTestLUT3D();
      pipeline.setDisplayLUT(lut, 'monitor.cube');
      panel.show();

      const nameSpan = document.querySelector('[data-testid="lut-display-name"]') as HTMLSpanElement;
      expect(nameSpan.textContent).toBe('monitor.cube');
    });
  });

  describe('source selector interaction', () => {
    it('LPP-062: changing source selector updates pipeline active source', () => {
      pipeline.registerSource('source2');
      const selector = document.querySelector('[data-testid="lut-source-selector"]') as HTMLSelectElement;
      // Add an option for source2
      const opt = document.createElement('option');
      opt.value = 'source2';
      opt.textContent = 'Source 2';
      selector.appendChild(opt);

      selector.value = 'source2';
      selector.dispatchEvent(new Event('change'));

      expect(pipeline.getActiveSourceId()).toBe('source2');
    });
  });

  describe('dispose', () => {
    it('LPP-063: dispose removes panel from DOM', () => {
      expect(document.querySelector('[data-testid="lut-pipeline-panel"]')).toBeTruthy();
      panel.dispose();
      expect(document.querySelector('[data-testid="lut-pipeline-panel"]')).toBeNull();
    });

    it('LPP-064: dispose does not throw when called twice', () => {
      panel.dispose();
      expect(() => panel.dispose()).not.toThrow();
    });

    it('LPP-065: dispose removes all child sections from DOM', () => {
      panel.dispose();
      expect(document.querySelector('[data-testid="lut-precache-section"]')).toBeNull();
      expect(document.querySelector('[data-testid="lut-file-section"]')).toBeNull();
      expect(document.querySelector('[data-testid="lut-look-section"]')).toBeNull();
      expect(document.querySelector('[data-testid="lut-display-section"]')).toBeNull();
    });
  });

  describe('pipelineChanged event', () => {
    it('LPP-066: toggling any stage emits pipelineChanged', () => {
      const handler = vi.fn();
      panel.on('pipelineChanged', handler);

      const fileToggle = document.querySelector('[data-testid="lut-file-toggle"]') as HTMLInputElement;
      fileToggle.checked = false;
      fileToggle.dispatchEvent(new Event('change'));
      expect(handler).toHaveBeenCalledTimes(1);

      const lookToggle = document.querySelector('[data-testid="lut-look-toggle"]') as HTMLInputElement;
      lookToggle.checked = false;
      lookToggle.dispatchEvent(new Event('change'));
      expect(handler).toHaveBeenCalledTimes(2);
    });

    it('LPP-067: changing any intensity emits pipelineChanged', () => {
      const handler = vi.fn();
      panel.on('pipelineChanged', handler);

      const fileSlider = document.querySelector('[data-testid="lut-file-intensity"]') as HTMLInputElement;
      fileSlider.value = '0.5';
      fileSlider.dispatchEvent(new Event('input'));
      expect(handler).toHaveBeenCalledTimes(1);

      const displaySlider = document.querySelector('[data-testid="lut-display-intensity"]') as HTMLInputElement;
      displaySlider.value = '0.3';
      displaySlider.dispatchEvent(new Event('input'));
      expect(handler).toHaveBeenCalledTimes(2);
    });
  });

  describe('header buttons', () => {
    it('LPP-068: help button has correct title', () => {
      const helpBtn = document.querySelector('[data-testid="lut-pipeline-help"]') as HTMLButtonElement;
      expect(helpBtn.title).toBe('Help');
    });

    it('LPP-069: reset button has correct title', () => {
      const resetBtn = document.querySelector('[data-testid="lut-pipeline-reset"]') as HTMLButtonElement;
      expect(resetBtn.title).toBe('Reset all LUT stages');
    });

    it('LPP-070: close button has correct title', () => {
      const closeBtn = document.querySelector('[data-testid="lut-pipeline-close"]') as HTMLButtonElement;
      expect(closeBtn.title).toBe('Close panel');
    });

    it('LPP-071: help button text is ?', () => {
      const helpBtn = document.querySelector('[data-testid="lut-pipeline-help"]') as HTMLButtonElement;
      expect(helpBtn.textContent).toBe('?');
    });

    it('LPP-072: reset button text is Reset', () => {
      const resetBtn = document.querySelector('[data-testid="lut-pipeline-reset"]') as HTMLButtonElement;
      expect(resetBtn.textContent).toBe('Reset');
    });

    it('LPP-073: close button text is X', () => {
      const closeBtn = document.querySelector('[data-testid="lut-pipeline-close"]') as HTMLButtonElement;
      expect(closeBtn.textContent).toBe('X');
    });
  });

  describe('display stage configuration', () => {
    it('LPP-074: display stage section shows session-wide label', () => {
      const displaySection = document.querySelector('[data-testid="lut-display-section"]') as HTMLElement;
      expect(displaySection.textContent).toContain('Session-wide');
    });

    it('LPP-075: file stage section has source selector', () => {
      const fileSection = document.querySelector('[data-testid="lut-file-section"]') as HTMLElement;
      const sourceSelect = fileSection.querySelector('[data-testid="lut-file-source-select"]');
      expect(sourceSelect).toBeTruthy();
    });

    it('LPP-076: look stage section has source selector', () => {
      const lookSection = document.querySelector('[data-testid="lut-look-section"]') as HTMLElement;
      const sourceSelect = lookSection.querySelector('[data-testid="lut-look-source-select"]');
      expect(sourceSelect).toBeTruthy();
    });

    it('LPP-077: display stage section has source selector', () => {
      const displaySection = document.querySelector('[data-testid="lut-display-section"]') as HTMLElement;
      const sourceSelect = displaySection.querySelector('[data-testid="lut-display-source-select"]');
      expect(sourceSelect).toBeTruthy();
    });

    it('LPP-078: precache stage section does NOT have source selector', () => {
      const precacheSection = document.querySelector('[data-testid="lut-precache-section"]') as HTMLElement;
      const sourceSelect = precacheSection.querySelector('[data-testid="lut-precache-source-select"]');
      expect(sourceSelect).toBeNull();
    });
  });

  describe('event unsubscription', () => {
    it('LPP-079: unsubscribing from visibilityChanged stops notifications', () => {
      const handler = vi.fn();
      const unsubscribe = panel.on('visibilityChanged', handler);
      unsubscribe();
      panel.show();
      expect(handler).not.toHaveBeenCalled();
    });

    it('LPP-080: unsubscribing from pipelineChanged stops notifications', () => {
      const handler = vi.fn();
      const unsubscribe = panel.on('pipelineChanged', handler);
      unsubscribe();
      const toggle = document.querySelector('[data-testid="lut-file-toggle"]') as HTMLInputElement;
      toggle.checked = false;
      toggle.dispatchEvent(new Event('change'));
      expect(handler).not.toHaveBeenCalled();
    });
  });
});
