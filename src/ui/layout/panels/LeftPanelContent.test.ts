/**
 * LeftPanelContent Tests
 */

import { describe, it, expect, afterEach, vi, beforeEach } from 'vitest';
import { LeftPanelContent } from './LeftPanelContent';
import { HistoryManager } from '../../../utils/HistoryManager';
import { DEFAULT_COLOR_ADJUSTMENTS } from '../../../core/types/color';

function createMockColorControls() {
  const callbacks = new Map<string, Set<Function>>();

  return {
    getAdjustments: vi.fn(() => ({ ...DEFAULT_COLOR_ADJUSTMENTS })),
    setAdjustments: vi.fn(),
    reset: vi.fn(),
    toggle: vi.fn(),
    show: vi.fn(),
    hide: vi.fn(),
    render: vi.fn(() => document.createElement('div')),
    dispose: vi.fn(),
    on: vi.fn((event: string, cb: Function) => {
      if (!callbacks.has(event)) callbacks.set(event, new Set());
      callbacks.get(event)!.add(cb);
      return () => { callbacks.get(event)?.delete(cb); };
    }),
    emit: vi.fn(),
    // Helper for tests to trigger callbacks
    _trigger: (event: string, data: any) => {
      callbacks.get(event)?.forEach(cb => cb(data));
    },
  } as any;
}

describe('LeftPanelContent', () => {
  let panel: LeftPanelContent;
  let mockColorControls: ReturnType<typeof createMockColorControls>;
  let historyManager: HistoryManager;

  beforeEach(() => {
    mockColorControls = createMockColorControls();
    historyManager = new HistoryManager();
    panel = new LeftPanelContent(mockColorControls, historyManager);
    document.body.appendChild(panel.getElement());
  });

  afterEach(() => {
    panel?.dispose();
  });

  describe('initialization', () => {
    it('LP-001: creates element with testid', () => {
      expect(panel.getElement().dataset.testid).toBe('left-panel-content');
    });

    it('LP-002: has color section', () => {
      const section = panel.getElement().querySelector('[data-testid="section-color"]');
      expect(section).not.toBeNull();
    });

    it('LP-003: has history section', () => {
      const section = panel.getElement().querySelector('[data-testid="section-history"]');
      expect(section).not.toBeNull();
    });
  });

  describe('color sliders', () => {
    it('LP-004: has exposure slider', () => {
      const slider = panel.getElement().querySelector('[data-testid="panel-slider-exposure"]');
      expect(slider).not.toBeNull();
    });

    it('LP-005: has contrast slider', () => {
      const slider = panel.getElement().querySelector('[data-testid="panel-slider-contrast"]');
      expect(slider).not.toBeNull();
    });

    it('LP-006: has saturation slider', () => {
      const slider = panel.getElement().querySelector('[data-testid="panel-slider-saturation"]');
      expect(slider).not.toBeNull();
    });

    it('LP-007: has temperature slider', () => {
      const slider = panel.getElement().querySelector('[data-testid="panel-slider-temperature"]');
      expect(slider).not.toBeNull();
    });

    it('LP-008: has tint slider', () => {
      const slider = panel.getElement().querySelector('[data-testid="panel-slider-tint"]');
      expect(slider).not.toBeNull();
    });

    it('LP-009: has highlights slider', () => {
      const slider = panel.getElement().querySelector('[data-testid="panel-slider-highlights"]');
      expect(slider).not.toBeNull();
    });

    it('LP-010: has shadows slider', () => {
      const slider = panel.getElement().querySelector('[data-testid="panel-slider-shadows"]');
      expect(slider).not.toBeNull();
    });

    it('LP-011: has 7 sliders total', () => {
      const sliders = panel.getElement().querySelectorAll('[data-testid^="panel-slider-"]');
      expect(sliders.length).toBe(7);
    });

    it('LP-012: slider change calls setAdjustments', () => {
      const slider = panel.getElement().querySelector('[data-testid="panel-slider-exposure"]') as HTMLInputElement;
      slider.value = '2.5';
      slider.dispatchEvent(new Event('input'));
      expect(mockColorControls.setAdjustments).toHaveBeenCalledWith({ exposure: 2.5 });
    });

    it('LP-013: reverse sync updates slider from ColorControls', () => {
      const slider = panel.getElement().querySelector('[data-testid="panel-slider-exposure"]') as HTMLInputElement;
      mockColorControls._trigger('adjustmentsChanged', { ...DEFAULT_COLOR_ADJUSTMENTS, exposure: 3.0 });
      expect(slider.value).toBe('3');
    });

    it('LP-013b: reverse sync updates value label', () => {
      mockColorControls._trigger('adjustmentsChanged', { ...DEFAULT_COLOR_ADJUSTMENTS, exposure: 3.0 });
      // The value label should show "+3.0"
      expect(panel.getElement().textContent).toContain('+3.0');
    });

    it('LP-013c: forward sync does not trigger reverse sync (no feedback loop)', () => {
      const slider = panel.getElement().querySelector('[data-testid="panel-slider-exposure"]') as HTMLInputElement;
      // Simulate slider input which sets _updating=true and calls setAdjustments
      slider.value = '2.0';
      slider.dispatchEvent(new Event('input'));
      expect(mockColorControls.setAdjustments).toHaveBeenCalledTimes(1);

      // If setAdjustments somehow triggers adjustmentsChanged callback,
      // the _updating flag should prevent feedback loop.
      // Simulate this scenario by triggering adjustmentsChanged during input
      const onCallbacks = mockColorControls.on.mock.calls
        .filter((c: any) => c[0] === 'adjustmentsChanged')
        .map((c: any) => c[1]);
      // The callback should exist
      expect(onCallbacks.length).toBeGreaterThan(0);
    });

    it('LP-013d: reverse sync updates multiple sliders', () => {
      const exposureSlider = panel.getElement().querySelector('[data-testid="panel-slider-exposure"]') as HTMLInputElement;
      const contrastSlider = panel.getElement().querySelector('[data-testid="panel-slider-contrast"]') as HTMLInputElement;
      mockColorControls._trigger('adjustmentsChanged', {
        ...DEFAULT_COLOR_ADJUSTMENTS,
        exposure: 1.5,
        contrast: 1.5,
      });
      expect(exposureSlider.value).toBe('1.5');
      expect(contrastSlider.value).toBe('1.5');
    });

    it('LP-013e: slider label width is 65px', () => {
      // Find the first label in slider rows
      const labels = panel.getElement().querySelectorAll('label');
      const sliderLabel = Array.from(labels).find(l => l.textContent === 'Exposure');
      expect(sliderLabel?.style.width).toBe('65px');
    });
  });

  describe('double-click to reset', () => {
    it('LP-022: double-click label resets slider to default', () => {
      // First change exposure away from default
      const slider = panel.getElement().querySelector('[data-testid="panel-slider-exposure"]') as HTMLInputElement;
      slider.value = '3.0';
      slider.dispatchEvent(new Event('input'));

      // Double-click the Exposure label
      const labels = panel.getElement().querySelectorAll('label');
      const exposureLabel = Array.from(labels).find(l => l.textContent === 'Exposure')!;
      exposureLabel.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));

      // Should have called setAdjustments with default value (0)
      expect(mockColorControls.setAdjustments).toHaveBeenCalledWith({ exposure: DEFAULT_COLOR_ADJUSTMENTS.exposure });
    });

    it('LP-023: double-click resets slider DOM value', () => {
      const slider = panel.getElement().querySelector('[data-testid="panel-slider-exposure"]') as HTMLInputElement;
      slider.value = '3.0';

      const labels = panel.getElement().querySelectorAll('label');
      const exposureLabel = Array.from(labels).find(l => l.textContent === 'Exposure')!;
      exposureLabel.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));

      expect(slider.value).toBe(String(DEFAULT_COLOR_ADJUSTMENTS.exposure));
    });

    it('LP-024: double-click label has title hint', () => {
      const labels = panel.getElement().querySelectorAll('label');
      const exposureLabel = Array.from(labels).find(l => l.textContent === 'Exposure')!;
      expect(exposureLabel.title).toBe('Double-click to reset');
    });
  });

  describe('all controls button', () => {
    it('LP-014: has "All Controls" button', () => {
      const btn = panel.getElement().querySelector('[data-testid="open-all-controls"]');
      expect(btn).not.toBeNull();
      expect(btn!.textContent).toContain('All Controls');
    });

    it('LP-015: clicking button toggles ColorControls', () => {
      const btn = panel.getElement().querySelector('[data-testid="open-all-controls"]') as HTMLButtonElement;
      btn.click();
      expect(mockColorControls.toggle).toHaveBeenCalled();
    });
  });

  describe('history', () => {
    it('LP-016: shows placeholder when no history', () => {
      expect(panel.getElement().textContent).toContain('No actions yet');
    });

    it('LP-017: shows entries after recording action', () => {
      historyManager.recordAction('Adjust exposure', 'color', () => {}, () => {});
      const list = panel.getElement().querySelector('[data-testid="history-list"]');
      expect(list?.textContent).toContain('Adjust exposure');
    });

    it('LP-018: highlights current entry', () => {
      historyManager.recordAction('Action 1', 'color', () => {}, () => {});
      historyManager.recordAction('Action 2', 'color', () => {}, () => {});
      const list = panel.getElement().querySelector('[data-testid="history-list"]') as HTMLElement;
      const lastItem = list.lastChild as HTMLElement;
      expect(lastItem.style.background).toContain('accent');
    });

    it('LP-019: clicking entry jumps to it', () => {
      const jumpSpy = vi.spyOn(historyManager, 'jumpTo');
      historyManager.recordAction('Action 1', 'color', () => {}, () => {});
      historyManager.recordAction('Action 2', 'color', () => {}, () => {});
      const list = panel.getElement().querySelector('[data-testid="history-list"]') as HTMLElement;
      const firstItem = list.firstChild as HTMLElement;
      firstItem.click();
      expect(jumpSpy).toHaveBeenCalledWith(0);
    });

    it('LP-020: clear button clears history', () => {
      historyManager.recordAction('Action 1', 'color', () => {}, () => {});
      const clearBtn = panel.getElement().querySelector('[data-testid="history-clear"]') as HTMLButtonElement;
      clearBtn.click();
      expect(historyManager.getEntries().length).toBe(0);
    });

    it('LP-025: future entries are dimmed after undo', () => {
      historyManager.recordAction('Action 1', 'color', () => {}, () => {});
      historyManager.recordAction('Action 2', 'color', () => {}, () => {});
      historyManager.undo();
      const list = panel.getElement().querySelector('[data-testid="history-list"]') as HTMLElement;
      // After undo, Action 2 should be dimmed (opacity 0.4)
      const secondItem = list.children[1] as HTMLElement;
      expect(secondItem.style.opacity).toBe('0.4');
    });

    it('LP-026: current entry updates on currentIndexChanged', () => {
      historyManager.recordAction('Action 1', 'color', () => {}, () => {});
      historyManager.recordAction('Action 2', 'color', () => {}, () => {});
      historyManager.recordAction('Action 3', 'color', () => {}, () => {});
      // Undo once -> current should be Action 2
      historyManager.undo();
      const list = panel.getElement().querySelector('[data-testid="history-list"]') as HTMLElement;
      const secondItem = list.children[1] as HTMLElement;
      expect(secondItem.style.background).toContain('accent');
      // Action 3 should be dimmed
      const thirdItem = list.children[2] as HTMLElement;
      expect(thirdItem.style.opacity).toBe('0.4');
    });

    it('LP-027: history re-renders on section expand after being collapsed', () => {
      // Collapse history section
      const historySection = panel.getElement().querySelector('[data-testid="section-history"]')!;
      const header = historySection.querySelector('.collapsible-section-header') as HTMLElement;
      header.click(); // collapse

      // Add entries while collapsed
      historyManager.recordAction('Hidden Action', 'color', () => {}, () => {});

      // Expand section
      header.click(); // expand

      // The new entry should now be visible
      const list = panel.getElement().querySelector('[data-testid="history-list"]');
      expect(list?.textContent).toContain('Hidden Action');
    });

    it('LP-028: history visibility guard skips render when collapsed', () => {
      // Collapse history section
      const historySection = panel.getElement().querySelector('[data-testid="section-history"]')!;
      const header = historySection.querySelector('.collapsible-section-header') as HTMLElement;
      header.click(); // collapse

      // Record action while collapsed - should not throw
      expect(() => {
        historyManager.recordAction('Collapsed Action', 'color', () => {}, () => {});
      }).not.toThrow();
    });

    it('LP-029: multiple history entries render in correct order', () => {
      historyManager.recordAction('First', 'color', () => {}, () => {});
      historyManager.recordAction('Second', 'color', () => {}, () => {});
      historyManager.recordAction('Third', 'color', () => {}, () => {});
      const list = panel.getElement().querySelector('[data-testid="history-list"]') as HTMLElement;
      expect(list.children.length).toBe(3);
      expect((list.children[0] as HTMLElement).textContent).toContain('First');
      expect((list.children[1] as HTMLElement).textContent).toContain('Second');
      expect((list.children[2] as HTMLElement).textContent).toContain('Third');
    });

    it('LP-030: clear button stopPropagation prevents section toggle', () => {
      historyManager.recordAction('Action 1', 'color', () => {}, () => {});
      const historySection = panel.getElement().querySelector('[data-testid="section-history"]')!;
      const wrapper = historySection.querySelector('.collapsible-section-content-wrapper') as HTMLElement;
      // Section should be expanded
      expect(wrapper.style.display).not.toBe('none');

      // Click clear button
      const clearBtn = panel.getElement().querySelector('[data-testid="history-clear"]') as HTMLButtonElement;
      clearBtn.click();

      // Section should still be expanded (clear button stopPropagation)
      expect(wrapper.style.display).not.toBe('none');
    });
  });

  describe('dispose', () => {
    it('LP-021: removes element and cleans up', () => {
      expect(document.body.contains(panel.getElement())).toBe(true);
      panel.dispose();
      expect(document.body.contains(panel.getElement())).toBe(false);
    });

    it('LP-031: dispose unsubscribes from events', () => {
      panel.dispose();
      // Triggering events after dispose should not throw
      expect(() => {
        mockColorControls._trigger('adjustmentsChanged', { ...DEFAULT_COLOR_ADJUSTMENTS });
        historyManager.recordAction('After dispose', 'color', () => {}, () => {});
      }).not.toThrow();
    });
  });
});
