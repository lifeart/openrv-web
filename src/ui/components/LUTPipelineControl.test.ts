import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LUTPipeline } from '../../color/pipeline/LUTPipeline';
import { LUTPipelinePanel } from './LUTPipelinePanel';
import { LUTStageControl } from './LUTStageControl';
import type { LUT3D } from '../../color/LUTLoader';

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

describe('LUTStageControl', () => {
  it('LCTRL-U001: renders with correct data-testid attributes', () => {
    const control = new LUTStageControl(
      {
        stageId: 'file',
        title: 'File LUT',
        subtitle: 'Input transform',
      },
      {
        onLUTLoaded: vi.fn(),
        onLUTCleared: vi.fn(),
        onEnabledChanged: vi.fn(),
        onIntensityChanged: vi.fn(),
      }
    );

    const el = control.render();
    expect(el.dataset.testid).toBe('lut-file-section');
    expect(el.querySelector('[data-testid="lut-file-toggle"]')).toBeTruthy();
    expect(el.querySelector('[data-testid="lut-file-name"]')).toBeTruthy();
    expect(el.querySelector('[data-testid="lut-file-intensity"]')).toBeTruthy();
    expect(el.querySelector('[data-testid="lut-file-load-button"]')).toBeTruthy();
    expect(el.querySelector('[data-testid="lut-file-clear-button"]')).toBeTruthy();
    expect(el.querySelector('[data-testid="lut-file-file-input"]')).toBeTruthy();
  });

  it('LCTRL-U002: setLUTName updates displayed name', () => {
    const control = new LUTStageControl(
      {
        stageId: 'look',
        title: 'Look LUT',
        subtitle: 'Creative grade',
      },
      {
        onLUTLoaded: vi.fn(),
        onLUTCleared: vi.fn(),
        onEnabledChanged: vi.fn(),
        onIntensityChanged: vi.fn(),
      }
    );

    const el = control.render();
    const nameSpan = el.querySelector('[data-testid="lut-look-name"]') as HTMLSpanElement;
    expect(nameSpan.textContent).toBe('None');

    control.setLUTName('my_look.cube');
    expect(nameSpan.textContent).toBe('my_look.cube');
  });

  it('LCTRL-U003: setEnabled updates toggle checkbox', () => {
    const control = new LUTStageControl(
      {
        stageId: 'display',
        title: 'Display LUT',
        subtitle: 'Display calibration',
      },
      {
        onLUTLoaded: vi.fn(),
        onLUTCleared: vi.fn(),
        onEnabledChanged: vi.fn(),
        onIntensityChanged: vi.fn(),
      }
    );

    const el = control.render();
    const toggle = el.querySelector('[data-testid="lut-display-toggle"]') as HTMLInputElement;
    expect(toggle.checked).toBe(true);

    control.setEnabled(false);
    expect(toggle.checked).toBe(false);
  });

  it('LCTRL-U004: setIntensity updates slider value', () => {
    const control = new LUTStageControl(
      {
        stageId: 'file',
        title: 'File LUT',
        subtitle: 'Input transform',
      },
      {
        onLUTLoaded: vi.fn(),
        onLUTCleared: vi.fn(),
        onEnabledChanged: vi.fn(),
        onIntensityChanged: vi.fn(),
      }
    );

    const el = control.render();
    const slider = el.querySelector('[data-testid="lut-file-intensity"]') as HTMLInputElement;
    expect(slider.value).toBe('1');

    control.setIntensity(0.5);
    expect(slider.value).toBe('0.5');
  });

  it('LCTRL-U005: toggle checkbox fires onEnabledChanged callback', () => {
    const onEnabledChanged = vi.fn();
    const control = new LUTStageControl(
      {
        stageId: 'file',
        title: 'File LUT',
        subtitle: 'Input transform',
      },
      {
        onLUTLoaded: vi.fn(),
        onLUTCleared: vi.fn(),
        onEnabledChanged,
        onIntensityChanged: vi.fn(),
      }
    );

    const el = control.render();
    const toggle = el.querySelector('[data-testid="lut-file-toggle"]') as HTMLInputElement;
    toggle.checked = false;
    toggle.dispatchEvent(new Event('change'));

    expect(onEnabledChanged).toHaveBeenCalledWith(false);
  });

  it('LCTRL-U006: intensity slider fires onIntensityChanged callback', () => {
    const onIntensityChanged = vi.fn();
    const control = new LUTStageControl(
      {
        stageId: 'file',
        title: 'File LUT',
        subtitle: 'Input transform',
      },
      {
        onLUTLoaded: vi.fn(),
        onLUTCleared: vi.fn(),
        onEnabledChanged: vi.fn(),
        onIntensityChanged,
      }
    );

    const el = control.render();
    const slider = el.querySelector('[data-testid="lut-file-intensity"]') as HTMLInputElement;
    slider.value = '0.75';
    slider.dispatchEvent(new Event('input'));

    expect(onIntensityChanged).toHaveBeenCalledWith(0.75);
  });

  it('LCTRL-U007: clear button fires onLUTCleared callback', () => {
    const onLUTCleared = vi.fn();
    const control = new LUTStageControl(
      {
        stageId: 'file',
        title: 'File LUT',
        subtitle: 'Input transform',
      },
      {
        onLUTLoaded: vi.fn(),
        onLUTCleared,
        onEnabledChanged: vi.fn(),
        onIntensityChanged: vi.fn(),
      }
    );

    const el = control.render();
    control.setLUTName('test.cube'); // Make clear button visible
    const clearBtn = el.querySelector('[data-testid="lut-file-clear-button"]') as HTMLButtonElement;
    clearBtn.click();

    expect(onLUTCleared).toHaveBeenCalled();
  });

  it('LCTRL-U008: source selector renders when showSourceSelector is true', () => {
    const control = new LUTStageControl(
      {
        stageId: 'file',
        title: 'File LUT',
        subtitle: 'Input transform',
        showSourceSelector: true,
      },
      {
        onLUTLoaded: vi.fn(),
        onLUTCleared: vi.fn(),
        onEnabledChanged: vi.fn(),
        onIntensityChanged: vi.fn(),
      }
    );

    const el = control.render();
    const sourceSelect = el.querySelector('[data-testid="lut-file-source-select"]');
    expect(sourceSelect).toBeTruthy();
  });

  it('LCTRL-U009: source selector not rendered when showSourceSelector is false', () => {
    const control = new LUTStageControl(
      {
        stageId: 'precache',
        title: 'Pre-Cache LUT',
        subtitle: 'Software pre-cache',
        showSourceSelector: false,
      },
      {
        onLUTLoaded: vi.fn(),
        onLUTCleared: vi.fn(),
        onEnabledChanged: vi.fn(),
        onIntensityChanged: vi.fn(),
      }
    );

    const el = control.render();
    const sourceSelect = el.querySelector('[data-testid="lut-precache-source-select"]');
    expect(sourceSelect).toBeNull();
  });
});

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

  it('LPANEL-U001: panel is hidden by default', () => {
    expect(panel.getIsVisible()).toBe(false);
  });

  it('LPANEL-U002: show makes panel visible', () => {
    panel.show();
    expect(panel.getIsVisible()).toBe(true);
  });

  it('LPANEL-U003: hide makes panel invisible', () => {
    panel.show();
    panel.hide();
    expect(panel.getIsVisible()).toBe(false);
  });

  it('LPANEL-U004: toggle switches visibility', () => {
    panel.toggle();
    expect(panel.getIsVisible()).toBe(true);
    panel.toggle();
    expect(panel.getIsVisible()).toBe(false);
  });

  it('LPANEL-U005: emits visibilityChanged event', () => {
    const callback = vi.fn();
    panel.on('visibilityChanged', callback);

    panel.show();
    expect(callback).toHaveBeenCalledWith(true);

    panel.hide();
    expect(callback).toHaveBeenCalledWith(false);
  });

  it('LPANEL-U006: registers default source on construction', () => {
    const sourceIds = pipeline.getSourceIds();
    expect(sourceIds).toContain('default');
  });

  it('LPANEL-U007: getPipelineState returns correct state', () => {
    const state = panel.getPipelineState();

    expect(state.precache.hasLUT).toBe(false);
    expect(state.file.hasLUT).toBe(false);
    expect(state.look.hasLUT).toBe(false);
    expect(state.display.hasLUT).toBe(false);
    expect(state.precache.enabled).toBe(true);
    expect(state.file.enabled).toBe(true);
    expect(state.look.enabled).toBe(true);
    expect(state.display.enabled).toBe(true);
  });

  it('LPANEL-U008: getPipelineState reflects loaded LUTs', () => {
    const lut = createTestLUT3D();
    pipeline.setFileLUT('default', lut, 'test.cube');

    const state = panel.getPipelineState();
    expect(state.file.hasLUT).toBe(true);
    expect(state.file.lutName).toBe('test.cube');
  });

  it('LPANEL-U009: getPipelineState reflects display LUT', () => {
    const lut = createTestLUT3D();
    pipeline.setDisplayLUT(lut, 'display.cube');

    const state = panel.getPipelineState();
    expect(state.display.hasLUT).toBe(true);
    expect(state.display.lutName).toBe('display.cube');
  });

  it('LPANEL-U010: panel has correct data-testid attribute', () => {
    const panelEl = document.querySelector('[data-testid="lut-pipeline-panel"]');
    expect(panelEl).toBeTruthy();
  });

  it('LPANEL-U011: panel has all four stage sections', () => {
    panel.show();
    expect(document.querySelector('[data-testid="lut-precache-section"]')).toBeTruthy();
    expect(document.querySelector('[data-testid="lut-file-section"]')).toBeTruthy();
    expect(document.querySelector('[data-testid="lut-look-section"]')).toBeTruthy();
    expect(document.querySelector('[data-testid="lut-display-section"]')).toBeTruthy();
  });

  it('LPANEL-U012: reset button data-testid exists', () => {
    panel.show();
    expect(document.querySelector('[data-testid="lut-pipeline-reset"]')).toBeTruthy();
  });

  it('LPANEL-U013: close button data-testid exists', () => {
    panel.show();
    expect(document.querySelector('[data-testid="lut-pipeline-close"]')).toBeTruthy();
  });

  it('LPANEL-U014: source selector data-testid exists', () => {
    panel.show();
    expect(document.querySelector('[data-testid="lut-source-selector"]')).toBeTruthy();
  });
});
