/**
 * RightPanelContent Tests
 */

import { describe, it, expect, afterEach, vi, beforeEach } from 'vitest';
import { RightPanelContent } from './RightPanelContent';
import type { HistogramData } from '../../components/Histogram';

function createMockScopesControl() {
  return {
    toggleScope: vi.fn(),
    setScopeVisible: vi.fn(),
    isScopeVisible: vi.fn(() => false),
    getState: vi.fn(() => ({ histogram: false, waveform: false, vectorscope: false, gamutDiagram: false })),
    render: vi.fn(() => document.createElement('div')),
    dispose: vi.fn(),
    on: vi.fn(() => () => {}),
  } as any;
}

function createTestHistogramData(): HistogramData {
  return {
    red: new Uint32Array(256).fill(100),
    green: new Uint32Array(256).fill(80),
    blue: new Uint32Array(256).fill(60),
    luminance: new Uint32Array(256).fill(90),
    maxValue: 100,
    pixelCount: 1000,
    clipping: { shadows: 0, highlights: 0, shadowsPercent: 0, highlightsPercent: 0 },
  };
}

describe('RightPanelContent', () => {
  let panel: RightPanelContent;
  let mockScopes: ReturnType<typeof createMockScopesControl>;

  beforeEach(() => {
    mockScopes = createMockScopesControl();
    panel = new RightPanelContent(mockScopes);
    document.body.appendChild(panel.getElement());
  });

  afterEach(() => {
    panel?.dispose();
  });

  describe('initialization', () => {
    it('RP-001: creates element with testid', () => {
      expect(panel.getElement().dataset.testid).toBe('right-panel-content');
    });

    it('RP-002: has scopes section', () => {
      const section = panel.getElement().querySelector('[data-testid="section-scopes"]');
      expect(section).not.toBeNull();
    });

    it('RP-003: has media info section', () => {
      const section = panel.getElement().querySelector('[data-testid="section-media-info"]');
      expect(section).not.toBeNull();
    });

    it('RP-004: has mini histogram', () => {
      const hist = panel.getElement().querySelector('[data-testid="mini-histogram"]');
      expect(hist).not.toBeNull();
    });

    it('RP-005: has scope toggle buttons', () => {
      const buttons = panel.getElement().querySelectorAll('[data-testid^="scope-btn-"]');
      expect(buttons.length).toBe(4);
    });

    it('RP-005b: scope buttons have correct labels', () => {
      expect(panel.getElement().querySelector('[data-testid="scope-btn-histogram"]')!.textContent).toBe('H');
      expect(panel.getElement().querySelector('[data-testid="scope-btn-waveform"]')!.textContent).toBe('W');
      expect(panel.getElement().querySelector('[data-testid="scope-btn-vectorscope"]')!.textContent).toBe('V');
      expect(panel.getElement().querySelector('[data-testid="scope-btn-gamutDiagram"]')!.textContent).toBe('G');
    });
  });

  describe('updateInfo', () => {
    it('RP-006: shows filename', () => {
      panel.updateInfo({ filename: 'test.exr', width: 1920, height: 1080 });
      const el = panel.getElement();
      expect(el.textContent).toContain('test.exr');
    });

    it('RP-006b: sets filename title attribute for tooltip', () => {
      panel.updateInfo({ filename: 'very_long_filename_that_gets_truncated.exr', width: 100, height: 100 });
      const el = panel.getElement();
      // The filename element should have a title for tooltip
      const spans = el.querySelectorAll('span');
      const filenameSpan = Array.from(spans).find(s => s.textContent === 'very_long_filename_that_gets_truncated.exr');
      expect(filenameSpan?.title).toBe('very_long_filename_that_gets_truncated.exr');
    });

    it('RP-006c: empty filename shows dash', () => {
      panel.updateInfo({ filename: '', width: 100, height: 100 });
      // Should still show something (the dash fallback)
      const el = panel.getElement();
      const spans = el.querySelectorAll('span');
      const filenameSpan = Array.from(spans).find(s => s.textContent === '-');
      expect(filenameSpan).not.toBeUndefined();
    });

    it('RP-007: shows resolution', () => {
      panel.updateInfo({ filename: 'test.exr', width: 1920, height: 1080 });
      expect(panel.getElement().textContent).toContain('1920');
      expect(panel.getElement().textContent).toContain('1080');
    });

    it('RP-008: shows frame info', () => {
      panel.updateInfo({ filename: 'test.exr', currentFrame: 42, totalFrames: 100 });
      expect(panel.getElement().textContent).toContain('42');
      expect(panel.getElement().textContent).toContain('100');
    });

    it('RP-008b: frame info with zero totalFrames', () => {
      panel.updateInfo({ filename: 'test.exr', currentFrame: 1 });
      expect(panel.getElement().textContent).toContain('1 / 0');
    });

    it('RP-008c: shows timecode', () => {
      panel.updateInfo({ filename: 'test.exr', timecode: '01:23:45:12' });
      expect(panel.getElement().textContent).toContain('01:23:45:12');
    });

    it('RP-008d: shows FPS', () => {
      panel.updateInfo({ filename: 'test.exr', fps: 24 });
      expect(panel.getElement().textContent).toContain('24.00');
    });

    it('RP-008e: FPS zero shows dash', () => {
      panel.updateInfo({ filename: 'test.exr', fps: 0 });
      const el = panel.getElement();
      const spans = el.querySelectorAll('span');
      const fpsSpan = Array.from(spans).find(s => s.textContent === '-');
      expect(fpsSpan).not.toBeUndefined();
    });

    it('RP-008f: shows duration', () => {
      panel.updateInfo({ filename: 'test.exr', duration: '1:30:00' });
      expect(panel.getElement().textContent).toContain('1:30:00');
    });

    it('RP-009: shows placeholder when no data', () => {
      expect(panel.getElement().textContent).toContain('No media loaded');
    });

    it('RP-009b: partial update only changes provided fields', () => {
      panel.updateInfo({ filename: 'first.exr', width: 1920, height: 1080 });
      panel.updateInfo({ filename: 'second.exr', width: 3840, height: 2160 });
      expect(panel.getElement().textContent).toContain('second.exr');
      expect(panel.getElement().textContent).toContain('3840');
    });

    it('RP-009c: visibility guard skips update when element is hidden', () => {
      panel.getElement().style.display = 'none';
      panel.updateInfo({ filename: 'hidden.exr', width: 100, height: 100 });
      // Should not have updated since element was hidden
      // Re-show and check: placeholder should still be visible (no update happened)
      panel.getElement().style.display = '';
      expect(panel.getElement().textContent).toContain('No media loaded');
    });
  });

  describe('updateHistogram', () => {
    it('RP-010: passes data to mini histogram', () => {
      const data = createTestHistogramData();
      expect(() => panel.updateHistogram(data)).not.toThrow();
    });
  });

  describe('setPresetMode', () => {
    it('RP-011: review mode collapses scopes, expands info', () => {
      panel.setPresetMode('review');
      const scopes = panel.getElement().querySelector('[data-testid="section-scopes"]');
      const info = panel.getElement().querySelector('[data-testid="section-media-info"]');
      const scopesWrapper = scopes?.querySelector('.collapsible-section-content-wrapper') as HTMLElement;
      expect(scopesWrapper?.style.display).toBe('none');
      const infoWrapper = info?.querySelector('.collapsible-section-content-wrapper') as HTMLElement;
      expect(infoWrapper?.style.display).not.toBe('none');
    });

    it('RP-012: color mode expands scopes, collapses info', () => {
      panel.setPresetMode('color');
      const scopes = panel.getElement().querySelector('[data-testid="section-scopes"]');
      const info = panel.getElement().querySelector('[data-testid="section-media-info"]');
      const scopesWrapper = scopes?.querySelector('.collapsible-section-content-wrapper') as HTMLElement;
      expect(scopesWrapper?.style.display).not.toBe('none');
      const infoWrapper = info?.querySelector('.collapsible-section-content-wrapper') as HTMLElement;
      expect(infoWrapper?.style.display).toBe('none');
    });

    it('RP-012b: default preset expands both sections', () => {
      // First collapse both
      panel.setPresetMode('review');
      // Then apply default
      panel.setPresetMode('default');
      const scopes = panel.getElement().querySelector('[data-testid="section-scopes"]');
      const info = panel.getElement().querySelector('[data-testid="section-media-info"]');
      const scopesWrapper = scopes?.querySelector('.collapsible-section-content-wrapper') as HTMLElement;
      expect(scopesWrapper?.style.display).not.toBe('none');
      const infoWrapper = info?.querySelector('.collapsible-section-content-wrapper') as HTMLElement;
      expect(infoWrapper?.style.display).not.toBe('none');
    });

    it('RP-012c: paint preset collapses both sections', () => {
      panel.setPresetMode('color');
      panel.setPresetMode('paint');
      const scopes = panel.getElement().querySelector('[data-testid="section-scopes"]');
      const info = panel.getElement().querySelector('[data-testid="section-media-info"]');
      const scopesWrapper = scopes?.querySelector('.collapsible-section-content-wrapper') as HTMLElement;
      expect(scopesWrapper?.style.display).toBe('none');
      const infoWrapper = info?.querySelector('.collapsible-section-content-wrapper') as HTMLElement;
      expect(infoWrapper?.style.display).toBe('none');
    });

    it('RP-012d: rapid preset switching settles correctly', () => {
      panel.setPresetMode('review');
      panel.setPresetMode('color');
      panel.setPresetMode('default');
      panel.setPresetMode('review');
      // Final state: review = scopes collapsed, info expanded
      const scopes = panel.getElement().querySelector('[data-testid="section-scopes"]');
      const info = panel.getElement().querySelector('[data-testid="section-media-info"]');
      const scopesWrapper = scopes?.querySelector('.collapsible-section-content-wrapper') as HTMLElement;
      expect(scopesWrapper?.style.display).toBe('none');
      const infoWrapper = info?.querySelector('.collapsible-section-content-wrapper') as HTMLElement;
      expect(infoWrapper?.style.display).not.toBe('none');
    });
  });

  describe('scope buttons', () => {
    it('RP-013: clicking scope button toggles scope', () => {
      const btn = panel.getElement().querySelector('[data-testid="scope-btn-histogram"]') as HTMLButtonElement;
      btn.click();
      expect(mockScopes.toggleScope).toHaveBeenCalledWith('histogram');
    });

    it('RP-014: clicking waveform scope button', () => {
      const btn = panel.getElement().querySelector('[data-testid="scope-btn-waveform"]') as HTMLButtonElement;
      btn.click();
      expect(mockScopes.toggleScope).toHaveBeenCalledWith('waveform');
    });

    it('RP-014b: clicking vectorscope button', () => {
      const btn = panel.getElement().querySelector('[data-testid="scope-btn-vectorscope"]') as HTMLButtonElement;
      btn.click();
      expect(mockScopes.toggleScope).toHaveBeenCalledWith('vectorscope');
    });

    it('RP-014c: clicking gamut diagram button', () => {
      const btn = panel.getElement().querySelector('[data-testid="scope-btn-gamutDiagram"]') as HTMLButtonElement;
      btn.click();
      expect(mockScopes.toggleScope).toHaveBeenCalledWith('gamutDiagram');
    });
  });

  describe('dispose', () => {
    it('RP-015: removes element and cleans up', () => {
      expect(document.body.contains(panel.getElement())).toBe(true);
      panel.dispose();
      expect(document.body.contains(panel.getElement())).toBe(false);
    });
  });
});
