/**
 * SlateEditor Unit Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  SlateEditor,
  DEFAULT_SLATE_EDITOR_STATE,
} from './SlateEditor';
describe('SlateEditor', () => {
  let editor: SlateEditor;

  beforeEach(() => {
    editor = new SlateEditor();
  });

  afterEach(() => {
    editor.dispose();
  });

  // ---------------------------------------------------------------------------
  // Constructor / Initialization
  // ---------------------------------------------------------------------------
  describe('constructor', () => {
    it('SE-001: initializes with default state', () => {
      const state = editor.getState();
      expect(state.metadata).toEqual({});
      expect(state.customFields).toEqual([]);
      expect(state.colors.background).toBe('#000000');
      expect(state.colors.text).toBe('#ffffff');
      expect(state.colors.accent).toBe('#4a9eff');
      expect(state.fontSizeMultiplier).toBe(1.0);
      expect(state.logoUrl).toBe('');
      expect(state.logoPosition).toBe('bottom-right');
      expect(state.logoScale).toBe(0.15);
      expect(state.width).toBe(1920);
      expect(state.height).toBe(1080);
    });

    it('SE-002: accepts initial state in constructor', () => {
      const custom = new SlateEditor({
        metadata: { showName: 'My Show' },
        colors: { background: '#111', text: '#eee', accent: '#ff0000' },
        width: 3840,
        height: 2160,
      });

      expect(custom.getMetadata().showName).toBe('My Show');
      expect(custom.getColors().background).toBe('#111');
      expect(custom.getResolution()).toEqual({ width: 3840, height: 2160 });
      custom.dispose();
    });

    it('SE-003: default state constant is not mutated by instances', () => {
      editor.setMetadata({ showName: 'Test' });
      expect(DEFAULT_SLATE_EDITOR_STATE.metadata).toEqual({});
    });
  });

  // ---------------------------------------------------------------------------
  // State management
  // ---------------------------------------------------------------------------
  describe('getState / setState', () => {
    it('SE-010: getState returns a copy', () => {
      const s1 = editor.getState();
      const s2 = editor.getState();
      expect(s1).toEqual(s2);
      expect(s1).not.toBe(s2);
    });

    it('SE-011: modifying returned state does not affect editor', () => {
      const state = editor.getState();
      state.fontSizeMultiplier = 99;
      expect(editor.getFontSizeMultiplier()).toBe(1.0);
    });

    it('SE-012: setState emits stateChanged', () => {
      const handler = vi.fn();
      editor.on('stateChanged', handler);
      editor.setState({ fontSizeMultiplier: 1.5 });
      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ fontSizeMultiplier: 1.5 })
      );
    });

    it('SE-013: setState merges partial state', () => {
      editor.setState({ fontSizeMultiplier: 1.5 });
      editor.setState({ logoUrl: 'http://example.com/logo.png' });
      const state = editor.getState();
      expect(state.fontSizeMultiplier).toBe(1.5);
      expect(state.logoUrl).toBe('http://example.com/logo.png');
    });
  });

  // ---------------------------------------------------------------------------
  // Metadata
  // ---------------------------------------------------------------------------
  describe('metadata', () => {
    it('SE-020: getMetadata returns empty by default', () => {
      expect(editor.getMetadata()).toEqual({});
    });

    it('SE-021: setMetadata updates metadata', () => {
      editor.setMetadata({ showName: 'Test Show', shotName: 'sh010' });
      const meta = editor.getMetadata();
      expect(meta.showName).toBe('Test Show');
      expect(meta.shotName).toBe('sh010');
    });

    it('SE-022: setMetadata merges with existing', () => {
      editor.setMetadata({ showName: 'Show' });
      editor.setMetadata({ artist: 'Alice' });
      const meta = editor.getMetadata();
      expect(meta.showName).toBe('Show');
      expect(meta.artist).toBe('Alice');
    });

    it('SE-023: setMetadata emits stateChanged', () => {
      const handler = vi.fn();
      editor.on('stateChanged', handler);
      editor.setMetadata({ version: 'v03' });
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('SE-024: getMetadata returns a copy', () => {
      editor.setMetadata({ showName: 'Show' });
      const m1 = editor.getMetadata();
      m1.showName = 'Modified';
      expect(editor.getMetadata().showName).toBe('Show');
    });
  });

  // ---------------------------------------------------------------------------
  // Custom fields
  // ---------------------------------------------------------------------------
  describe('custom fields', () => {
    it('SE-030: starts with no custom fields', () => {
      expect(editor.getCustomFields()).toEqual([]);
    });

    it('SE-031: addCustomField adds a field', () => {
      editor.addCustomField({ label: 'Notes', value: 'Final render', size: 'small' });
      const fields = editor.getCustomFields();
      expect(fields).toHaveLength(1);
      expect(fields[0]).toEqual({ label: 'Notes', value: 'Final render', size: 'small' });
    });

    it('SE-032: addCustomField emits stateChanged', () => {
      const handler = vi.fn();
      editor.on('stateChanged', handler);
      editor.addCustomField({ label: 'Notes', value: 'Test', size: 'medium' });
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('SE-033: removeCustomField removes field at index', () => {
      editor.addCustomField({ label: 'A', value: '1', size: 'small' });
      editor.addCustomField({ label: 'B', value: '2', size: 'small' });
      editor.addCustomField({ label: 'C', value: '3', size: 'small' });
      editor.removeCustomField(1);
      const fields = editor.getCustomFields();
      expect(fields).toHaveLength(2);
      expect(fields[0]!.label).toBe('A');
      expect(fields[1]!.label).toBe('C');
    });

    it('SE-034: removeCustomField with invalid index does nothing', () => {
      editor.addCustomField({ label: 'A', value: '1', size: 'small' });
      editor.removeCustomField(-1);
      editor.removeCustomField(5);
      expect(editor.getCustomFields()).toHaveLength(1);
    });

    it('SE-035: updateCustomField updates at index', () => {
      editor.addCustomField({ label: 'A', value: '1', size: 'small' });
      editor.updateCustomField(0, { value: 'updated' });
      const fields = editor.getCustomFields();
      expect(fields[0]!.value).toBe('updated');
      expect(fields[0]!.label).toBe('A');
    });

    it('SE-036: updateCustomField with invalid index does nothing', () => {
      editor.addCustomField({ label: 'A', value: '1', size: 'small' });
      editor.updateCustomField(5, { value: 'x' });
      expect(editor.getCustomFields()[0]!.value).toBe('1');
    });

    it('SE-037: clearCustomFields removes all', () => {
      editor.addCustomField({ label: 'A', value: '1', size: 'small' });
      editor.addCustomField({ label: 'B', value: '2', size: 'small' });
      editor.clearCustomFields();
      expect(editor.getCustomFields()).toEqual([]);
    });

    it('SE-038: getCustomFields returns copies', () => {
      editor.addCustomField({ label: 'A', value: '1', size: 'small' });
      const fields = editor.getCustomFields();
      fields[0]!.value = 'modified';
      expect(editor.getCustomFields()[0]!.value).toBe('1');
    });
  });

  // ---------------------------------------------------------------------------
  // Colors
  // ---------------------------------------------------------------------------
  describe('colors', () => {
    it('SE-040: getColors returns defaults', () => {
      const colors = editor.getColors();
      expect(colors.background).toBe('#000000');
      expect(colors.text).toBe('#ffffff');
      expect(colors.accent).toBe('#4a9eff');
    });

    it('SE-041: setColors updates partially', () => {
      editor.setColors({ background: '#222' });
      const colors = editor.getColors();
      expect(colors.background).toBe('#222');
      expect(colors.text).toBe('#ffffff');
    });

    it('SE-042: setColors emits stateChanged', () => {
      const handler = vi.fn();
      editor.on('stateChanged', handler);
      editor.setColors({ text: '#ccc' });
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('SE-043: getColors returns a copy', () => {
      const c1 = editor.getColors();
      c1.background = 'red';
      expect(editor.getColors().background).toBe('#000000');
    });
  });

  // ---------------------------------------------------------------------------
  // Font size
  // ---------------------------------------------------------------------------
  describe('font size multiplier', () => {
    it('SE-050: default is 1.0', () => {
      expect(editor.getFontSizeMultiplier()).toBe(1.0);
    });

    it('SE-051: setFontSizeMultiplier updates value', () => {
      editor.setFontSizeMultiplier(1.5);
      expect(editor.getFontSizeMultiplier()).toBe(1.5);
    });

    it('SE-052: clamps to minimum 0.5', () => {
      editor.setFontSizeMultiplier(0.1);
      expect(editor.getFontSizeMultiplier()).toBe(0.5);
    });

    it('SE-053: clamps to maximum 2.0', () => {
      editor.setFontSizeMultiplier(5.0);
      expect(editor.getFontSizeMultiplier()).toBe(2.0);
    });

    it('SE-054: emits stateChanged', () => {
      const handler = vi.fn();
      editor.on('stateChanged', handler);
      editor.setFontSizeMultiplier(1.2);
      expect(handler).toHaveBeenCalledTimes(1);
    });
  });

  // ---------------------------------------------------------------------------
  // Logo
  // ---------------------------------------------------------------------------
  describe('logo', () => {
    it('SE-060: default logo URL is empty', () => {
      expect(editor.getLogoUrl()).toBe('');
    });

    it('SE-061: setLogoUrl updates URL', () => {
      editor.setLogoUrl('http://example.com/logo.png');
      expect(editor.getLogoUrl()).toBe('http://example.com/logo.png');
    });

    it('SE-062: default logo position is bottom-right', () => {
      expect(editor.getLogoPosition()).toBe('bottom-right');
    });

    it('SE-063: setLogoPosition updates position', () => {
      editor.setLogoPosition('top-left');
      expect(editor.getLogoPosition()).toBe('top-left');
    });

    it('SE-064: default logo scale is 0.15', () => {
      expect(editor.getLogoScale()).toBe(0.15);
    });

    it('SE-065: setLogoScale updates and clamps', () => {
      editor.setLogoScale(0.3);
      expect(editor.getLogoScale()).toBe(0.3);

      editor.setLogoScale(0.01);
      expect(editor.getLogoScale()).toBe(0.05);

      editor.setLogoScale(1.0);
      expect(editor.getLogoScale()).toBe(0.5);
    });
  });

  // ---------------------------------------------------------------------------
  // Resolution
  // ---------------------------------------------------------------------------
  describe('resolution', () => {
    it('SE-070: default is 1920x1080', () => {
      expect(editor.getResolution()).toEqual({ width: 1920, height: 1080 });
    });

    it('SE-071: setResolution updates dimensions', () => {
      editor.setResolution(3840, 2160);
      expect(editor.getResolution()).toEqual({ width: 3840, height: 2160 });
    });

    it('SE-072: setResolution clamps to minimum 1', () => {
      editor.setResolution(0, -5);
      expect(editor.getResolution()).toEqual({ width: 1, height: 1 });
    });

    it('SE-073: setResolution rounds to integer', () => {
      editor.setResolution(1920.7, 1080.3);
      expect(editor.getResolution()).toEqual({ width: 1921, height: 1080 });
    });
  });

  // ---------------------------------------------------------------------------
  // buildFields
  // ---------------------------------------------------------------------------
  describe('buildFields', () => {
    it('SE-080: empty metadata produces no fields', () => {
      expect(editor.buildFields()).toEqual([]);
    });

    it('SE-081: metadata fields are built correctly', () => {
      editor.setMetadata({
        showName: 'My Show',
        shotName: 'sh010',
        version: 'v02',
      });
      const fields = editor.buildFields();
      expect(fields.length).toBe(3);
      expect(fields[0]!.value).toBe('My Show');
      expect(fields[0]!.size).toBe('large');
      expect(fields[1]!.value).toBe('sh010');
      expect(fields[2]!.label).toBe('Version');
      expect(fields[2]!.value).toBe('v02');
    });

    it('SE-082: custom fields appear after metadata fields', () => {
      editor.setMetadata({ showName: 'Show' });
      editor.addCustomField({ label: 'Custom', value: 'Value', size: 'small' });
      const fields = editor.buildFields();
      expect(fields.length).toBe(2);
      expect(fields[0]!.value).toBe('Show');
      expect(fields[1]!.label).toBe('Custom');
      expect(fields[1]!.size).toBe('small');
    });

    it('SE-083: codec and colorspace appear in fields', () => {
      editor.setMetadata({
        codec: 'H.264',
        colorSpace: 'sRGB',
      });
      const fields = editor.buildFields();
      expect(fields.some(f => f.value === 'H.264')).toBe(true);
      expect(fields.some(f => f.value === 'sRGB')).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // generateConfig
  // ---------------------------------------------------------------------------
  describe('generateConfig', () => {
    it('SE-090: generates valid SlateConfig', () => {
      editor.setMetadata({ showName: 'Test Show' });
      editor.setColors({ background: '#111', text: '#eee' });

      const config = editor.generateConfig();
      expect(config.width).toBe(1920);
      expect(config.height).toBe(1080);
      expect(config.backgroundColor).toBe('#111');
      expect(config.textColor).toBe('#eee');
      expect(config.fields.length).toBeGreaterThan(0);
      expect(config.logoPosition).toBe('bottom-right');
      expect(config.logoScale).toBe(0.15);
    });

    it('SE-091: config does not include logo when none loaded', () => {
      const config = editor.generateConfig();
      expect(config.logo).toBeUndefined();
    });

    it('SE-092: emits configGenerated event', () => {
      const handler = vi.fn();
      editor.on('configGenerated', handler);
      editor.generateConfig();
      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ width: 1920, height: 1080 })
      );
    });

    it('SE-093: config reflects custom resolution', () => {
      editor.setResolution(4096, 2160);
      const config = editor.generateConfig();
      expect(config.width).toBe(4096);
      expect(config.height).toBe(2160);
    });

    it('SE-094: config includes custom fields', () => {
      editor.addCustomField({ label: 'Notes', value: 'Final', size: 'small' });
      const config = editor.generateConfig();
      expect(config.fields.some(f => f.label === 'Notes' && f.value === 'Final')).toBe(true);
    });

    it('SE-095: config includes fontSizeMultiplier', () => {
      editor.setFontSizeMultiplier(1.5);
      const config = editor.generateConfig();
      expect(config.fontSizeMultiplier).toBe(1.5);
    });

    it('SE-096: config fontSizeMultiplier defaults to 1.0', () => {
      const config = editor.generateConfig();
      expect(config.fontSizeMultiplier).toBe(1.0);
    });
  });

  // ---------------------------------------------------------------------------
  // Logo image loading
  // ---------------------------------------------------------------------------
  describe('logo image loading', () => {
    it('SE-110: hasLogo returns false by default', () => {
      expect(editor.hasLogo()).toBe(false);
    });

    it('SE-111: getLogoImage returns null by default', () => {
      expect(editor.getLogoImage()).toBeNull();
    });

    it('SE-112: getLogoDimensions returns null by default', () => {
      expect(editor.getLogoDimensions()).toBeNull();
    });

    it('SE-113: loadLogoFile loads image from file', async () => {
      const logoLoadedHandler = vi.fn();
      editor.on('logoLoaded', logoLoadedHandler);

      const blob = new Blob(['fake-image-data'], { type: 'image/png' });
      const file = new File([blob], 'logo.png', { type: 'image/png' });

      // Mock URL.createObjectURL
      const mockUrl = 'blob:http://localhost/test-logo';
      const origCreateObjectURL = URL.createObjectURL;
      URL.createObjectURL = vi.fn(() => mockUrl);

      // Need to trigger onload manually since JSDOM doesn't actually load images
      const origImage = globalThis.Image;
      globalThis.Image = class extends origImage {
        constructor() {
          super();
          Object.defineProperty(this, 'naturalWidth', { value: 200, configurable: true });
          Object.defineProperty(this, 'naturalHeight', { value: 100, configurable: true });
          // Simulate async load success
          setTimeout(() => {
            if (this.onload) (this.onload as Function)(new Event('load'));
          }, 0);
        }
      } as typeof Image;

      try {
        await editor.loadLogoFile(file);
        expect(editor.hasLogo()).toBe(true);
        expect(editor.getLogoImage()).not.toBeNull();
        expect(editor.getLogoUrl()).toBe(mockUrl);
        expect(logoLoadedHandler).toHaveBeenCalledWith({ width: 200, height: 100 });
      } finally {
        URL.createObjectURL = origCreateObjectURL;
        globalThis.Image = origImage;
      }
    });

    it('SE-114: loadLogoFile emits logoError on failure', async () => {
      const errorHandler = vi.fn();
      editor.on('logoError', errorHandler);

      const blob = new Blob(['bad-data'], { type: 'image/png' });
      const file = new File([blob], 'bad.png', { type: 'image/png' });

      const origCreateObjectURL = URL.createObjectURL;
      const origRevokeObjectURL = URL.revokeObjectURL;
      URL.createObjectURL = vi.fn(() => 'blob:http://localhost/bad');
      URL.revokeObjectURL = vi.fn();

      const origImage = globalThis.Image;
      globalThis.Image = class extends origImage {
        constructor() {
          super();
          setTimeout(() => {
            if (this.onerror) (this.onerror as Function)(new Event('error'));
          }, 0);
        }
      } as typeof Image;

      try {
        await expect(editor.loadLogoFile(file)).rejects.toThrow('Failed to load logo image');
        expect(errorHandler).toHaveBeenCalledTimes(1);
        expect(editor.hasLogo()).toBe(false);
      } finally {
        URL.createObjectURL = origCreateObjectURL;
        URL.revokeObjectURL = origRevokeObjectURL;
        globalThis.Image = origImage;
      }
    });

    it('SE-115: loadLogoFromUrl rejects invalid URLs', async () => {
      const errorHandler = vi.fn();
      editor.on('logoError', errorHandler);

      await expect(editor.loadLogoFromUrl('ftp://bad')).rejects.toThrow('Invalid logo URL');
      expect(errorHandler).toHaveBeenCalledTimes(1);
    });

    it('SE-116: loadLogoFromUrl loads image from URL', async () => {
      const logoLoadedHandler = vi.fn();
      editor.on('logoLoaded', logoLoadedHandler);

      const origImage = globalThis.Image;
      globalThis.Image = class extends origImage {
        constructor() {
          super();
          Object.defineProperty(this, 'naturalWidth', { value: 300, configurable: true });
          Object.defineProperty(this, 'naturalHeight', { value: 150, configurable: true });
          setTimeout(() => {
            if (this.onload) (this.onload as Function)(new Event('load'));
          }, 0);
        }
      } as typeof Image;

      try {
        await editor.loadLogoFromUrl('https://example.com/logo.png');
        expect(editor.hasLogo()).toBe(true);
        expect(editor.getLogoUrl()).toBe('https://example.com/logo.png');
        expect(editor.getLogoDimensions()).toEqual({ width: 300, height: 150 });
        expect(logoLoadedHandler).toHaveBeenCalledWith({ width: 300, height: 150 });
      } finally {
        globalThis.Image = origImage;
      }
    });

    it('SE-117: removeLogoImage clears loaded logo', async () => {
      const removedHandler = vi.fn();
      editor.on('logoRemoved', removedHandler);

      // Load a logo first
      const origImage = globalThis.Image;
      globalThis.Image = class extends origImage {
        constructor() {
          super();
          Object.defineProperty(this, 'naturalWidth', { value: 100, configurable: true });
          Object.defineProperty(this, 'naturalHeight', { value: 100, configurable: true });
          setTimeout(() => {
            if (this.onload) (this.onload as Function)(new Event('load'));
          }, 0);
        }
      } as typeof Image;

      try {
        await editor.loadLogoFromUrl('https://example.com/logo.png');
        expect(editor.hasLogo()).toBe(true);

        editor.removeLogoImage();
        expect(editor.hasLogo()).toBe(false);
        expect(editor.getLogoImage()).toBeNull();
        expect(editor.getLogoUrl()).toBe('');
        expect(removedHandler).toHaveBeenCalledTimes(1);
      } finally {
        globalThis.Image = origImage;
      }
    });

    it('SE-118: removeLogoImage is no-op when no logo', () => {
      const removedHandler = vi.fn();
      const stateHandler = vi.fn();
      editor.on('logoRemoved', removedHandler);
      editor.on('stateChanged', stateHandler);

      editor.removeLogoImage();
      expect(removedHandler).not.toHaveBeenCalled();
      expect(stateHandler).not.toHaveBeenCalled();
    });

    it('SE-119: generateConfig includes logo when loaded', async () => {
      const origImage = globalThis.Image;
      globalThis.Image = class extends origImage {
        constructor() {
          super();
          Object.defineProperty(this, 'naturalWidth', { value: 200, configurable: true });
          Object.defineProperty(this, 'naturalHeight', { value: 100, configurable: true });
          Object.defineProperty(this, 'width', { value: 200, configurable: true });
          Object.defineProperty(this, 'height', { value: 100, configurable: true });
          setTimeout(() => {
            if (this.onload) (this.onload as Function)(new Event('load'));
          }, 0);
        }
      } as typeof Image;

      try {
        await editor.loadLogoFromUrl('https://example.com/logo.png');
        const config = editor.generateConfig();
        expect(config.logo).toBeDefined();
        expect(config.logo).toBe(editor.getLogoImage());
      } finally {
        globalThis.Image = origImage;
      }
    });

    it('SE-120: loadLogoFile revokes old blob URL', async () => {
      const origCreateObjectURL = URL.createObjectURL;
      const origRevokeObjectURL = URL.revokeObjectURL;
      const revokeURLSpy = vi.fn();
      URL.revokeObjectURL = revokeURLSpy;

      let callCount = 0;
      URL.createObjectURL = vi.fn(() => `blob:http://localhost/logo-${callCount++}`);

      const origImage = globalThis.Image;
      globalThis.Image = class extends origImage {
        constructor() {
          super();
          Object.defineProperty(this, 'naturalWidth', { value: 100, configurable: true });
          Object.defineProperty(this, 'naturalHeight', { value: 100, configurable: true });
          setTimeout(() => {
            if (this.onload) (this.onload as Function)(new Event('load'));
          }, 0);
        }
      } as typeof Image;

      try {
        const blob1 = new Blob(['data'], { type: 'image/png' });
        const file1 = new File([blob1], 'logo1.png', { type: 'image/png' });
        await editor.loadLogoFile(file1);

        const blob2 = new Blob(['data'], { type: 'image/png' });
        const file2 = new File([blob2], 'logo2.png', { type: 'image/png' });
        await editor.loadLogoFile(file2);

        // Should have revoked the first blob URL
        expect(revokeURLSpy).toHaveBeenCalledWith('blob:http://localhost/logo-0');
      } finally {
        URL.createObjectURL = origCreateObjectURL;
        URL.revokeObjectURL = origRevokeObjectURL;
        globalThis.Image = origImage;
      }
    });
  });

  // ---------------------------------------------------------------------------
  // Preview rendering
  // ---------------------------------------------------------------------------
  describe('preview rendering', () => {
    it('SE-130: generatePreview returns a canvas element', () => {
      editor.setMetadata({ showName: 'Test Show' });
      const canvas = editor.generatePreview();
      expect(canvas).toBeInstanceOf(HTMLCanvasElement);
      expect(canvas!.width).toBeGreaterThan(0);
      expect(canvas!.height).toBeGreaterThan(0);
    });

    it('SE-131: generatePreview respects maxWidth/maxHeight', () => {
      editor.setResolution(1920, 1080);
      const canvas = editor.generatePreview(200, 150);
      expect(canvas).not.toBeNull();
      expect(canvas!.width).toBeLessThanOrEqual(200);
      expect(canvas!.height).toBeLessThanOrEqual(150);
    });

    it('SE-132: generatePreview maintains aspect ratio', () => {
      editor.setResolution(1920, 1080);
      const canvas = editor.generatePreview(360, 240);
      expect(canvas).not.toBeNull();
      const aspect = canvas!.width / canvas!.height;
      expect(aspect).toBeCloseTo(1920 / 1080, 0);
    });

    it('SE-133: generatePreview emits configGenerated and previewRendered', () => {
      const configHandler = vi.fn();
      const previewHandler = vi.fn();
      editor.on('configGenerated', configHandler);
      editor.on('previewRendered', previewHandler);

      editor.setMetadata({ showName: 'Test' });
      editor.generatePreview();

      expect(configHandler).toHaveBeenCalledTimes(1);
      expect(previewHandler).toHaveBeenCalledTimes(1);
      expect(previewHandler.mock.calls[0][0]).toBeInstanceOf(HTMLCanvasElement);
    });

    it('SE-134: generatePreview with empty fields still renders', () => {
      const canvas = editor.generatePreview();
      expect(canvas).toBeInstanceOf(HTMLCanvasElement);
    });

    it('SE-135: generatePreview uses default maxWidth/maxHeight', () => {
      editor.setResolution(1920, 1080);
      const canvas = editor.generatePreview();
      expect(canvas).not.toBeNull();
      expect(canvas!.width).toBeLessThanOrEqual(360);
      expect(canvas!.height).toBeLessThanOrEqual(240);
    });
  });

  // ---------------------------------------------------------------------------
  // Dispose
  // ---------------------------------------------------------------------------
  describe('dispose', () => {
    it('SE-100: dispose does not throw', () => {
      expect(() => editor.dispose()).not.toThrow();
    });

    it('SE-101: dispose is idempotent', () => {
      editor.dispose();
      expect(() => editor.dispose()).not.toThrow();
    });

    it('SE-102: dispose clears loaded logo', async () => {
      const origImage = globalThis.Image;
      globalThis.Image = class extends origImage {
        constructor() {
          super();
          Object.defineProperty(this, 'naturalWidth', { value: 100, configurable: true });
          Object.defineProperty(this, 'naturalHeight', { value: 100, configurable: true });
          setTimeout(() => {
            if (this.onload) (this.onload as Function)(new Event('load'));
          }, 0);
        }
      } as typeof Image;

      try {
        await editor.loadLogoFromUrl('https://example.com/logo.png');
        expect(editor.hasLogo()).toBe(true);
        editor.dispose();
        expect(editor.getLogoImage()).toBeNull();
      } finally {
        globalThis.Image = origImage;
      }
    });
  });
});
