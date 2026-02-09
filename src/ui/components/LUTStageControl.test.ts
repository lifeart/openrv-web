/**
 * LUTStageControl Unit Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LUTStageControl } from './LUTStageControl';
import type { LUTStageControlConfig, LUTStageControlCallbacks } from './LUTStageControl';
import type { LUT3D, LUT1D } from '../../color/ColorProcessingFacade';

// Mock parseLUT and isLUT3D
vi.mock('../../color/LUTFormatDetect', () => ({
  parseLUT: vi.fn(),
}));

vi.mock('../../color/LUTLoader', () => ({
  isLUT3D: vi.fn(),
}));

vi.mock('./shared/Modal', () => ({
  showAlert: vi.fn(),
}));

import { parseLUT, isLUT3D } from '../../color/ColorProcessingFacade';
import { showAlert } from './shared/Modal';

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

function createTestLUT1D(title: string = 'Test1D'): LUT1D {
  const size = 4;
  const data = new Float32Array(size * 3);
  for (let i = 0; i < size; i++) {
    data[i * 3] = i / (size - 1);
    data[i * 3 + 1] = i / (size - 1);
    data[i * 3 + 2] = i / (size - 1);
  }
  return { title, size, domainMin: [0, 0, 0], domainMax: [1, 1, 1], data };
}

function createDefaultConfig(overrides: Partial<LUTStageControlConfig> = {}): LUTStageControlConfig {
  return {
    stageId: 'file',
    title: 'File LUT',
    subtitle: 'Input transform',
    ...overrides,
  };
}

function createDefaultCallbacks(overrides: Partial<LUTStageControlCallbacks> = {}): LUTStageControlCallbacks {
  return {
    onLUTLoaded: vi.fn(),
    onLUTCleared: vi.fn(),
    onEnabledChanged: vi.fn(),
    onIntensityChanged: vi.fn(),
    ...overrides,
  };
}

describe('LUTStageControl', () => {
  let control: LUTStageControl;
  let callbacks: LUTStageControlCallbacks;

  beforeEach(() => {
    vi.clearAllMocks();
    callbacks = createDefaultCallbacks();
    control = new LUTStageControl(createDefaultConfig(), callbacks);
  });

  describe('construction and rendering', () => {
    it('LSC-001: render returns an HTMLElement', () => {
      const el = control.render();
      expect(el).toBeInstanceOf(HTMLElement);
    });

    it('LSC-002: root element has correct data-testid for file stage', () => {
      const el = control.render();
      expect(el.dataset.testid).toBe('lut-file-section');
    });

    it('LSC-003: root element has correct data-testid for precache stage', () => {
      const c = new LUTStageControl(createDefaultConfig({ stageId: 'precache' }), callbacks);
      expect(c.render().dataset.testid).toBe('lut-precache-section');
    });

    it('LSC-004: root element has correct data-testid for look stage', () => {
      const c = new LUTStageControl(createDefaultConfig({ stageId: 'look' }), callbacks);
      expect(c.render().dataset.testid).toBe('lut-look-section');
    });

    it('LSC-005: root element has correct data-testid for display stage', () => {
      const c = new LUTStageControl(createDefaultConfig({ stageId: 'display' }), callbacks);
      expect(c.render().dataset.testid).toBe('lut-display-section');
    });

    it('LSC-006: contains toggle checkbox with correct data-testid', () => {
      const el = control.render();
      const toggle = el.querySelector('[data-testid="lut-file-toggle"]');
      expect(toggle).toBeTruthy();
      expect((toggle as HTMLInputElement).type).toBe('checkbox');
    });

    it('LSC-007: contains LUT name span with correct data-testid', () => {
      const el = control.render();
      const nameSpan = el.querySelector('[data-testid="lut-file-name"]');
      expect(nameSpan).toBeTruthy();
    });

    it('LSC-008: contains intensity slider with correct data-testid', () => {
      const el = control.render();
      const slider = el.querySelector('[data-testid="lut-file-intensity"]');
      expect(slider).toBeTruthy();
      expect((slider as HTMLInputElement).type).toBe('range');
    });

    it('LSC-009: contains load button with correct data-testid', () => {
      const el = control.render();
      const loadBtn = el.querySelector('[data-testid="lut-file-load-button"]');
      expect(loadBtn).toBeTruthy();
      expect(loadBtn!.textContent).toBe('Load...');
    });

    it('LSC-010: contains clear button with correct data-testid', () => {
      const el = control.render();
      const clearBtn = el.querySelector('[data-testid="lut-file-clear-button"]');
      expect(clearBtn).toBeTruthy();
      expect(clearBtn!.textContent).toBe('Clear');
    });

    it('LSC-011: contains hidden file input with correct data-testid', () => {
      const el = control.render();
      const fileInput = el.querySelector('[data-testid="lut-file-file-input"]') as HTMLInputElement;
      expect(fileInput).toBeTruthy();
      expect(fileInput.type).toBe('file');
      expect(fileInput.style.display).toBe('none');
    });

    it('LSC-012: file input accepts correct LUT extensions', () => {
      const el = control.render();
      const fileInput = el.querySelector('[data-testid="lut-file-file-input"]') as HTMLInputElement;
      expect(fileInput.accept).toBe('.cube,.3dl,.csp,.itx,.look,.lut,.nk,.mga');
    });

    it('LSC-013: title text is displayed', () => {
      const el = control.render();
      expect(el.textContent).toContain('File LUT');
    });

    it('LSC-014: subtitle text is displayed', () => {
      const el = control.render();
      expect(el.textContent).toContain('Input transform');
    });
  });

  describe('initial state', () => {
    it('LSC-015: toggle checkbox starts checked', () => {
      const el = control.render();
      const toggle = el.querySelector('[data-testid="lut-file-toggle"]') as HTMLInputElement;
      expect(toggle.checked).toBe(true);
    });

    it('LSC-016: LUT name starts as None', () => {
      const el = control.render();
      const nameSpan = el.querySelector('[data-testid="lut-file-name"]') as HTMLSpanElement;
      expect(nameSpan.textContent).toBe('None');
    });

    it('LSC-017: intensity slider starts at 1', () => {
      const el = control.render();
      const slider = el.querySelector('[data-testid="lut-file-intensity"]') as HTMLInputElement;
      expect(slider.value).toBe('1');
    });

    it('LSC-018: intensity value label starts at 100%', () => {
      const el = control.render();
      expect(el.textContent).toContain('100%');
    });

    it('LSC-019: clear button starts hidden', () => {
      const el = control.render();
      const clearBtn = el.querySelector('[data-testid="lut-file-clear-button"]') as HTMLButtonElement;
      expect(clearBtn.style.visibility).toBe('hidden');
    });
  });

  describe('setLUTName', () => {
    it('LSC-020: updates displayed name', () => {
      const el = control.render();
      control.setLUTName('my_lut.cube');
      const nameSpan = el.querySelector('[data-testid="lut-file-name"]') as HTMLSpanElement;
      expect(nameSpan.textContent).toBe('my_lut.cube');
    });

    it('LSC-021: makes clear button visible when name is set', () => {
      const el = control.render();
      control.setLUTName('test.cube');
      const clearBtn = el.querySelector('[data-testid="lut-file-clear-button"]') as HTMLButtonElement;
      expect(clearBtn.style.visibility).toBe('visible');
    });

    it('LSC-022: setting null resets name to None', () => {
      const el = control.render();
      control.setLUTName('test.cube');
      control.setLUTName(null);
      const nameSpan = el.querySelector('[data-testid="lut-file-name"]') as HTMLSpanElement;
      expect(nameSpan.textContent).toBe('None');
    });

    it('LSC-023: setting null hides clear button', () => {
      const el = control.render();
      control.setLUTName('test.cube');
      control.setLUTName(null);
      const clearBtn = el.querySelector('[data-testid="lut-file-clear-button"]') as HTMLButtonElement;
      expect(clearBtn.style.visibility).toBe('hidden');
    });

    it('LSC-024: setting empty string resets name to None', () => {
      const el = control.render();
      control.setLUTName('');
      const nameSpan = el.querySelector('[data-testid="lut-file-name"]') as HTMLSpanElement;
      expect(nameSpan.textContent).toBe('None');
    });
  });

  describe('setEnabled', () => {
    it('LSC-025: setEnabled(false) unchecks toggle', () => {
      const el = control.render();
      control.setEnabled(false);
      const toggle = el.querySelector('[data-testid="lut-file-toggle"]') as HTMLInputElement;
      expect(toggle.checked).toBe(false);
    });

    it('LSC-026: setEnabled(true) checks toggle', () => {
      const el = control.render();
      control.setEnabled(false);
      control.setEnabled(true);
      const toggle = el.querySelector('[data-testid="lut-file-toggle"]') as HTMLInputElement;
      expect(toggle.checked).toBe(true);
    });
  });

  describe('setIntensity', () => {
    it('LSC-027: setIntensity updates slider value', () => {
      const el = control.render();
      control.setIntensity(0.5);
      const slider = el.querySelector('[data-testid="lut-file-intensity"]') as HTMLInputElement;
      expect(slider.value).toBe('0.5');
    });

    it('LSC-028: setIntensity updates percentage label', () => {
      const el = control.render();
      control.setIntensity(0.5);
      expect(el.textContent).toContain('50%');
    });

    it('LSC-029: setIntensity(0) shows 0%', () => {
      const el = control.render();
      control.setIntensity(0);
      expect(el.textContent).toContain('0%');
    });

    it('LSC-030: setIntensity(0.75) shows 75%', () => {
      const el = control.render();
      control.setIntensity(0.75);
      expect(el.textContent).toContain('75%');
    });
  });

  describe('toggle callback', () => {
    it('LSC-031: toggle checkbox fires onEnabledChanged(false) when unchecked', () => {
      const el = control.render();
      const toggle = el.querySelector('[data-testid="lut-file-toggle"]') as HTMLInputElement;
      toggle.checked = false;
      toggle.dispatchEvent(new Event('change'));
      expect(callbacks.onEnabledChanged).toHaveBeenCalledWith(false);
    });

    it('LSC-032: toggle checkbox fires onEnabledChanged(true) when checked', () => {
      const el = control.render();
      const toggle = el.querySelector('[data-testid="lut-file-toggle"]') as HTMLInputElement;
      toggle.checked = false;
      toggle.dispatchEvent(new Event('change'));
      toggle.checked = true;
      toggle.dispatchEvent(new Event('change'));
      expect(callbacks.onEnabledChanged).toHaveBeenCalledWith(true);
    });
  });

  describe('intensity slider callback', () => {
    it('LSC-033: intensity slider fires onIntensityChanged with parsed value', () => {
      const el = control.render();
      const slider = el.querySelector('[data-testid="lut-file-intensity"]') as HTMLInputElement;
      slider.value = '0.75';
      slider.dispatchEvent(new Event('input'));
      expect(callbacks.onIntensityChanged).toHaveBeenCalledWith(0.75);
    });

    it('LSC-034: intensity slider updates percentage label on input', () => {
      const el = control.render();
      const slider = el.querySelector('[data-testid="lut-file-intensity"]') as HTMLInputElement;
      slider.value = '0.33';
      slider.dispatchEvent(new Event('input'));
      expect(el.textContent).toContain('33%');
    });

    it('LSC-035: intensity slider at 0 fires callback with 0', () => {
      const el = control.render();
      const slider = el.querySelector('[data-testid="lut-file-intensity"]') as HTMLInputElement;
      slider.value = '0';
      slider.dispatchEvent(new Event('input'));
      expect(callbacks.onIntensityChanged).toHaveBeenCalledWith(0);
    });
  });

  describe('clear button', () => {
    it('LSC-036: clear button fires onLUTCleared callback', () => {
      const el = control.render();
      control.setLUTName('test.cube');
      const clearBtn = el.querySelector('[data-testid="lut-file-clear-button"]') as HTMLButtonElement;
      clearBtn.click();
      expect(callbacks.onLUTCleared).toHaveBeenCalled();
    });

    it('LSC-037: clear button resets LUT name to None', () => {
      const el = control.render();
      control.setLUTName('test.cube');
      const clearBtn = el.querySelector('[data-testid="lut-file-clear-button"]') as HTMLButtonElement;
      clearBtn.click();
      const nameSpan = el.querySelector('[data-testid="lut-file-name"]') as HTMLSpanElement;
      expect(nameSpan.textContent).toBe('None');
    });

    it('LSC-038: clear button hides itself after clearing', () => {
      const el = control.render();
      control.setLUTName('test.cube');
      const clearBtn = el.querySelector('[data-testid="lut-file-clear-button"]') as HTMLButtonElement;
      clearBtn.click();
      expect(clearBtn.style.visibility).toBe('hidden');
    });
  });

  describe('load button and file input', () => {
    it('LSC-039: load button triggers file input click', () => {
      const el = control.render();
      const fileInput = el.querySelector('[data-testid="lut-file-file-input"]') as HTMLInputElement;
      const clickSpy = vi.spyOn(fileInput, 'click');
      const loadBtn = el.querySelector('[data-testid="lut-file-load-button"]') as HTMLButtonElement;
      loadBtn.click();
      expect(clickSpy).toHaveBeenCalled();
    });

    it('LSC-040: file load with valid 3D LUT calls onLUTLoaded for file stage', async () => {
      const lut3D = createTestLUT3D();
      vi.mocked(parseLUT).mockReturnValue(lut3D);
      vi.mocked(isLUT3D).mockReturnValue(true);

      const el = control.render();
      const fileInput = el.querySelector('[data-testid="lut-file-file-input"]') as HTMLInputElement;

      const mockFile = new File(['LUT content'], 'test.cube', { type: 'text/plain' });
      Object.defineProperty(fileInput, 'files', { value: [mockFile], writable: true });

      fileInput.dispatchEvent(new Event('change'));
      // Wait for async file.text()
      await vi.waitFor(() => {
        expect(callbacks.onLUTLoaded).toHaveBeenCalledWith(lut3D, 'test.cube');
      });
    });

    it('LSC-041: file load with 1D LUT on GPU stage shows error alert', async () => {
      const lut1D = createTestLUT1D();
      vi.mocked(parseLUT).mockReturnValue(lut1D);
      vi.mocked(isLUT3D).mockReturnValue(false);

      const el = control.render();
      const fileInput = el.querySelector('[data-testid="lut-file-file-input"]') as HTMLInputElement;

      const mockFile = new File(['LUT content'], 'test.cube', { type: 'text/plain' });
      Object.defineProperty(fileInput, 'files', { value: [mockFile], writable: true });

      fileInput.dispatchEvent(new Event('change'));
      await vi.waitFor(() => {
        expect(showAlert).toHaveBeenCalledWith(
          'GPU LUT stages only support 3D LUTs. Please load a 3D LUT file.',
          expect.objectContaining({ type: 'error', title: 'Unsupported LUT Type' })
        );
      });
      expect(callbacks.onLUTLoaded).not.toHaveBeenCalled();
    });

    it('LSC-042: file load with 1D LUT on precache stage does NOT show error', async () => {
      const lut1D = createTestLUT1D();
      vi.mocked(parseLUT).mockReturnValue(lut1D);
      vi.mocked(isLUT3D).mockReturnValue(false);

      const precacheCallbacks = createDefaultCallbacks();
      const precacheControl = new LUTStageControl(
        createDefaultConfig({ stageId: 'precache' }),
        precacheCallbacks
      );
      const el = precacheControl.render();
      const fileInput = el.querySelector('[data-testid="lut-precache-file-input"]') as HTMLInputElement;

      const mockFile = new File(['LUT content'], 'test.cube', { type: 'text/plain' });
      Object.defineProperty(fileInput, 'files', { value: [mockFile], writable: true });

      fileInput.dispatchEvent(new Event('change'));
      await vi.waitFor(() => {
        expect(precacheCallbacks.onLUTLoaded).toHaveBeenCalledWith(lut1D, 'test.cube');
      });
      expect(showAlert).not.toHaveBeenCalled();
    });

    it('LSC-043: file load error shows error alert', async () => {
      vi.mocked(parseLUT).mockImplementation(() => {
        throw new Error('Parse failed');
      });

      const el = control.render();
      const fileInput = el.querySelector('[data-testid="lut-file-file-input"]') as HTMLInputElement;

      const mockFile = new File(['bad content'], 'broken.cube', { type: 'text/plain' });
      Object.defineProperty(fileInput, 'files', { value: [mockFile], writable: true });

      fileInput.dispatchEvent(new Event('change'));
      await vi.waitFor(() => {
        expect(showAlert).toHaveBeenCalledWith(
          'Failed to load LUT: Parse failed',
          expect.objectContaining({ type: 'error', title: 'LUT Error' })
        );
      });
    });

    it('LSC-044: file input is cleared after successful load', async () => {
      const lut3D = createTestLUT3D();
      vi.mocked(parseLUT).mockReturnValue(lut3D);
      vi.mocked(isLUT3D).mockReturnValue(true);

      const el = control.render();
      const fileInput = el.querySelector('[data-testid="lut-file-file-input"]') as HTMLInputElement;

      const mockFile = new File(['LUT content'], 'test.cube', { type: 'text/plain' });
      Object.defineProperty(fileInput, 'files', { value: [mockFile], writable: true });

      fileInput.dispatchEvent(new Event('change'));
      await vi.waitFor(() => {
        expect(fileInput.value).toBe('');
      });
    });

    it('LSC-045: no-op when file input has no files', () => {
      const el = control.render();
      const fileInput = el.querySelector('[data-testid="lut-file-file-input"]') as HTMLInputElement;
      Object.defineProperty(fileInput, 'files', { value: [], writable: true });
      fileInput.dispatchEvent(new Event('change'));
      expect(callbacks.onLUTLoaded).not.toHaveBeenCalled();
    });
  });

  describe('source selector', () => {
    it('LSC-046: source selector renders when showSourceSelector is true', () => {
      const c = new LUTStageControl(
        createDefaultConfig({ showSourceSelector: true }),
        callbacks
      );
      const el = c.render();
      const select = el.querySelector('[data-testid="lut-file-source-select"]');
      expect(select).toBeTruthy();
    });

    it('LSC-047: source selector is not rendered when showSourceSelector is false', () => {
      const c = new LUTStageControl(
        createDefaultConfig({ showSourceSelector: false }),
        callbacks
      );
      const el = c.render();
      const select = el.querySelector('[data-testid="lut-file-source-select"]');
      expect(select).toBeNull();
    });

    it('LSC-048: source selector is not rendered when showSourceSelector is undefined', () => {
      const el = control.render();
      const select = el.querySelector('[data-testid="lut-file-source-select"]');
      expect(select).toBeNull();
    });

    it('LSC-049: source selector has Manual and OCIO options', () => {
      const c = new LUTStageControl(
        createDefaultConfig({ showSourceSelector: true }),
        callbacks
      );
      const el = c.render();
      const select = el.querySelector('[data-testid="lut-file-source-select"]') as HTMLSelectElement;
      const options = Array.from(select.options);
      expect(options.length).toBe(2);
      expect(options[0]!.value).toBe('manual');
      expect(options[0]!.textContent).toBe('Manual');
      expect(options[1]!.value).toBe('ocio');
      expect(options[1]!.textContent).toBe('OCIO');
    });

    it('LSC-050: source selector change fires onSourceChanged callback', () => {
      const onSourceChanged = vi.fn();
      const c = new LUTStageControl(
        createDefaultConfig({ showSourceSelector: true }),
        createDefaultCallbacks({ onSourceChanged })
      );
      const el = c.render();
      const select = el.querySelector('[data-testid="lut-file-source-select"]') as HTMLSelectElement;
      select.value = 'ocio';
      select.dispatchEvent(new Event('change'));
      expect(onSourceChanged).toHaveBeenCalledWith('ocio');
    });

    it('LSC-051: setSource updates the selector value', () => {
      const c = new LUTStageControl(
        createDefaultConfig({ showSourceSelector: true }),
        callbacks
      );
      const el = c.render();
      c.setSource('ocio');
      const select = el.querySelector('[data-testid="lut-file-source-select"]') as HTMLSelectElement;
      expect(select.value).toBe('ocio');
    });

    it('LSC-052: setSource is no-op when source selector is not rendered', () => {
      // Should not throw
      expect(() => control.setSource('ocio')).not.toThrow();
    });
  });

  describe('session-wide label', () => {
    it('LSC-053: session-wide label is shown when sessionWide is true', () => {
      const c = new LUTStageControl(
        createDefaultConfig({ sessionWide: true }),
        callbacks
      );
      const el = c.render();
      expect(el.textContent).toContain('Session-wide');
    });

    it('LSC-054: session-wide label is not shown when sessionWide is false/undefined', () => {
      const el = control.render();
      expect(el.textContent).not.toContain('Session-wide');
    });
  });

  describe('intensity slider properties', () => {
    it('LSC-055: slider min is 0', () => {
      const el = control.render();
      const slider = el.querySelector('[data-testid="lut-file-intensity"]') as HTMLInputElement;
      expect(slider.min).toBe('0');
    });

    it('LSC-056: slider max is 1', () => {
      const el = control.render();
      const slider = el.querySelector('[data-testid="lut-file-intensity"]') as HTMLInputElement;
      expect(slider.max).toBe('1');
    });

    it('LSC-057: slider step is 0.01', () => {
      const el = control.render();
      const slider = el.querySelector('[data-testid="lut-file-intensity"]') as HTMLInputElement;
      expect(slider.step).toBe('0.01');
    });
  });

  describe('render returns same element', () => {
    it('LSC-058: render always returns the same element', () => {
      const el1 = control.render();
      const el2 = control.render();
      expect(el1).toBe(el2);
    });
  });

  describe('file load for look and display stages', () => {
    it('LSC-059: 1D LUT on look stage shows error (GPU stage)', async () => {
      const lut1D = createTestLUT1D();
      vi.mocked(parseLUT).mockReturnValue(lut1D);
      vi.mocked(isLUT3D).mockReturnValue(false);

      const lookCallbacks = createDefaultCallbacks();
      const lookControl = new LUTStageControl(
        createDefaultConfig({ stageId: 'look' }),
        lookCallbacks
      );
      const el = lookControl.render();
      const fileInput = el.querySelector('[data-testid="lut-look-file-input"]') as HTMLInputElement;

      const mockFile = new File(['LUT content'], 'test.cube', { type: 'text/plain' });
      Object.defineProperty(fileInput, 'files', { value: [mockFile], writable: true });

      fileInput.dispatchEvent(new Event('change'));
      await vi.waitFor(() => {
        expect(showAlert).toHaveBeenCalled();
      });
      expect(lookCallbacks.onLUTLoaded).not.toHaveBeenCalled();
    });

    it('LSC-060: 1D LUT on display stage shows error (GPU stage)', async () => {
      const lut1D = createTestLUT1D();
      vi.mocked(parseLUT).mockReturnValue(lut1D);
      vi.mocked(isLUT3D).mockReturnValue(false);

      const displayCallbacks = createDefaultCallbacks();
      const displayControl = new LUTStageControl(
        createDefaultConfig({ stageId: 'display' }),
        displayCallbacks
      );
      const el = displayControl.render();
      const fileInput = el.querySelector('[data-testid="lut-display-file-input"]') as HTMLInputElement;

      const mockFile = new File(['LUT content'], 'test.cube', { type: 'text/plain' });
      Object.defineProperty(fileInput, 'files', { value: [mockFile], writable: true });

      fileInput.dispatchEvent(new Event('change'));
      await vi.waitFor(() => {
        expect(showAlert).toHaveBeenCalled();
      });
      expect(displayCallbacks.onLUTLoaded).not.toHaveBeenCalled();
    });
  });

  describe('successful file load updates UI', () => {
    it('LSC-061: successful file load updates LUT name display', async () => {
      const lut3D = createTestLUT3D();
      vi.mocked(parseLUT).mockReturnValue(lut3D);
      vi.mocked(isLUT3D).mockReturnValue(true);

      const el = control.render();
      const fileInput = el.querySelector('[data-testid="lut-file-file-input"]') as HTMLInputElement;
      const nameSpan = el.querySelector('[data-testid="lut-file-name"]') as HTMLSpanElement;

      const mockFile = new File(['LUT content'], 'loaded.cube', { type: 'text/plain' });
      Object.defineProperty(fileInput, 'files', { value: [mockFile], writable: true });

      fileInput.dispatchEvent(new Event('change'));
      await vi.waitFor(() => {
        expect(nameSpan.textContent).toBe('loaded.cube');
      });
    });

    it('LSC-062: successful file load makes clear button visible', async () => {
      const lut3D = createTestLUT3D();
      vi.mocked(parseLUT).mockReturnValue(lut3D);
      vi.mocked(isLUT3D).mockReturnValue(true);

      const el = control.render();
      const fileInput = el.querySelector('[data-testid="lut-file-file-input"]') as HTMLInputElement;
      const clearBtn = el.querySelector('[data-testid="lut-file-clear-button"]') as HTMLButtonElement;

      const mockFile = new File(['LUT content'], 'loaded.cube', { type: 'text/plain' });
      Object.defineProperty(fileInput, 'files', { value: [mockFile], writable: true });

      fileInput.dispatchEvent(new Event('change'));
      await vi.waitFor(() => {
        expect(clearBtn.style.visibility).toBe('visible');
      });
    });
  });
});
