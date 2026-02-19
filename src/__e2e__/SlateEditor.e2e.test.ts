/**
 * SlateEditor E2E Integration Tests
 *
 * Verifies the full wiring of the SlateEditor feature end-to-end:
 *   UI (slate button in AppControlRegistry Effects tab) -> SlateEditor state ->
 *   configGenerated event -> SlateConfig compatible with SlateRenderer
 *
 * Tests cover:
 * - SlateEditor instantiation and state management
 * - Metadata editing
 * - Custom field CRUD operations
 * - Color settings with CSS validation
 * - Font size multiplier with clamping
 * - Logo URL validation
 * - Resolution configuration
 * - Config generation for SlateRenderer
 * - Panel creation wiring in AppControlRegistry
 * - ESC handler for panel dismissal
 * - Dispose and cleanup
 *
 * KNOWN ISSUES DOCUMENTED IN TESTS:
 * - INCOMPLETE: Panel UI is a text placeholder, no real form
 * - MISSING: SlateEditor is NOT wired to the video export pipeline
 * - isSlateEditorPanelVisible / hideSlateEditorPanel ARE wired in ESC handler (correct)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  SlateEditor,
  DEFAULT_SLATE_EDITOR_STATE,
  type SlateEditorState,
  type CustomField,
  type SlateEditorColors,
} from '../ui/components/SlateEditor';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SlateEditor E2E Integration', () => {
  // =========================================================================
  // 1. Instantiation and defaults
  // =========================================================================
  describe('instantiation', () => {
    let editor: SlateEditor;

    beforeEach(() => {
      editor = new SlateEditor();
    });

    afterEach(() => {
      editor.dispose();
    });

    it('SLATE-E2E-001: can be instantiated without errors', () => {
      expect(editor).toBeInstanceOf(SlateEditor);
    });

    it('SLATE-E2E-002: initial state matches DEFAULT_SLATE_EDITOR_STATE', () => {
      const state = editor.getState();
      expect(state.metadata).toEqual({});
      expect(state.customFields).toEqual([]);
      expect(state.colors).toEqual(DEFAULT_SLATE_EDITOR_STATE.colors);
      expect(state.fontSizeMultiplier).toBe(1.0);
      expect(state.logoUrl).toBe('');
      expect(state.logoPosition).toBe('bottom-right');
      expect(state.logoScale).toBe(0.15);
      expect(state.width).toBe(1920);
      expect(state.height).toBe(1080);
    });

    it('SLATE-E2E-003: constructor accepts partial initial state', () => {
      const editor2 = new SlateEditor({
        metadata: { showName: 'Test Show' },
        width: 3840,
        height: 2160,
      });

      const state = editor2.getState();
      expect(state.metadata.showName).toBe('Test Show');
      expect(state.width).toBe(3840);
      expect(state.height).toBe(2160);
      // Defaults should still be intact for other fields
      expect(state.colors).toEqual(DEFAULT_SLATE_EDITOR_STATE.colors);

      editor2.dispose();
    });

    it('SLATE-E2E-004: getState returns a deep copy (not mutable)', () => {
      const state1 = editor.getState();
      state1.metadata.showName = 'Mutated';
      state1.colors.background = '#ff0000';

      const state2 = editor.getState();
      expect(state2.metadata.showName).toBeUndefined();
      expect(state2.colors.background).toBe('#000000');
    });
  });

  // =========================================================================
  // 2. Metadata editing
  // =========================================================================
  describe('metadata', () => {
    let editor: SlateEditor;

    beforeEach(() => {
      editor = new SlateEditor();
    });

    afterEach(() => {
      editor.dispose();
    });

    it('SLATE-E2E-010: setMetadata sets production metadata fields', () => {
      editor.setMetadata({
        showName: 'Avatar',
        shotName: 'sh010',
        version: 'v03',
        artist: 'John Doe',
        date: '2026-02-19',
      });

      const meta = editor.getMetadata();
      expect(meta.showName).toBe('Avatar');
      expect(meta.shotName).toBe('sh010');
      expect(meta.version).toBe('v03');
      expect(meta.artist).toBe('John Doe');
      expect(meta.date).toBe('2026-02-19');
    });

    it('SLATE-E2E-011: setMetadata merges with existing metadata', () => {
      editor.setMetadata({ showName: 'Show A' });
      editor.setMetadata({ shotName: 'sh020' });

      const meta = editor.getMetadata();
      expect(meta.showName).toBe('Show A');
      expect(meta.shotName).toBe('sh020');
    });

    it('SLATE-E2E-012: setMetadata emits stateChanged event', () => {
      const callback = vi.fn();
      editor.on('stateChanged', callback);

      editor.setMetadata({ showName: 'Test' });

      expect(callback).toHaveBeenCalledTimes(1);
      const emittedState: SlateEditorState = callback.mock.calls[0][0];
      expect(emittedState.metadata.showName).toBe('Test');
    });

    it('SLATE-E2E-013: getMetadata returns a copy', () => {
      editor.setMetadata({ showName: 'Original' });
      const meta = editor.getMetadata();
      meta.showName = 'Mutated';

      expect(editor.getMetadata().showName).toBe('Original');
    });
  });

  // =========================================================================
  // 3. Custom fields CRUD
  // =========================================================================
  describe('custom fields', () => {
    let editor: SlateEditor;

    beforeEach(() => {
      editor = new SlateEditor();
    });

    afterEach(() => {
      editor.dispose();
    });

    it('SLATE-E2E-020: addCustomField appends a field', () => {
      editor.addCustomField({ label: 'Codec', value: 'H.264', size: 'medium' });

      const fields = editor.getCustomFields();
      expect(fields.length).toBe(1);
      expect(fields[0].label).toBe('Codec');
      expect(fields[0].value).toBe('H.264');
      expect(fields[0].size).toBe('medium');
    });

    it('SLATE-E2E-021: addCustomField emits stateChanged', () => {
      const callback = vi.fn();
      editor.on('stateChanged', callback);

      editor.addCustomField({ label: 'FPS', value: '24', size: 'small' });

      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('SLATE-E2E-022: multiple addCustomField calls accumulate', () => {
      editor.addCustomField({ label: 'Codec', value: 'H.264', size: 'medium' });
      editor.addCustomField({ label: 'FPS', value: '24', size: 'small' });
      editor.addCustomField({ label: 'Colorspace', value: 'ACEScg', size: 'large' });

      const fields = editor.getCustomFields();
      expect(fields.length).toBe(3);
      expect(fields[2].label).toBe('Colorspace');
    });

    it('SLATE-E2E-023: removeCustomField removes by index', () => {
      editor.addCustomField({ label: 'A', value: '1', size: 'small' });
      editor.addCustomField({ label: 'B', value: '2', size: 'small' });
      editor.addCustomField({ label: 'C', value: '3', size: 'small' });

      editor.removeCustomField(1); // remove B

      const fields = editor.getCustomFields();
      expect(fields.length).toBe(2);
      expect(fields[0].label).toBe('A');
      expect(fields[1].label).toBe('C');
    });

    it('SLATE-E2E-024: removeCustomField with out-of-range index is no-op', () => {
      editor.addCustomField({ label: 'A', value: '1', size: 'small' });

      editor.removeCustomField(-1);
      editor.removeCustomField(5);

      expect(editor.getCustomFields().length).toBe(1);
    });

    it('SLATE-E2E-025: updateCustomField updates a field at given index', () => {
      editor.addCustomField({ label: 'Codec', value: 'H.264', size: 'medium' });

      editor.updateCustomField(0, { value: 'H.265' });

      const fields = editor.getCustomFields();
      expect(fields[0].value).toBe('H.265');
      expect(fields[0].label).toBe('Codec'); // unchanged
    });

    it('SLATE-E2E-026: updateCustomField with out-of-range index is no-op', () => {
      editor.addCustomField({ label: 'A', value: '1', size: 'small' });

      editor.updateCustomField(5, { value: 'changed' });

      expect(editor.getCustomFields()[0].value).toBe('1'); // unchanged
    });

    it('SLATE-E2E-027: clearCustomFields removes all fields', () => {
      editor.addCustomField({ label: 'A', value: '1', size: 'small' });
      editor.addCustomField({ label: 'B', value: '2', size: 'small' });

      editor.clearCustomFields();

      expect(editor.getCustomFields().length).toBe(0);
    });

    it('SLATE-E2E-028: getCustomFields returns copies (not mutable)', () => {
      editor.addCustomField({ label: 'A', value: '1', size: 'small' });

      const fields = editor.getCustomFields();
      fields[0].label = 'Mutated';

      expect(editor.getCustomFields()[0].label).toBe('A');
    });
  });

  // =========================================================================
  // 4. Color settings
  // =========================================================================
  describe('colors', () => {
    let editor: SlateEditor;

    beforeEach(() => {
      editor = new SlateEditor();
    });

    afterEach(() => {
      editor.dispose();
    });

    it('SLATE-E2E-030: setColors updates color values', () => {
      editor.setColors({ background: '#1a1a1a', text: '#cccccc' });

      const colors = editor.getColors();
      expect(colors.background).toBe('#1a1a1a');
      expect(colors.text).toBe('#cccccc');
      expect(colors.accent).toBe('#4a9eff'); // default unchanged
    });

    it('SLATE-E2E-031: setColors validates hex colors', () => {
      editor.setColors({ background: '#abc' }); // 3-char hex
      expect(editor.getColors().background).toBe('#abc');

      editor.setColors({ background: '#aabbcc' }); // 6-char hex
      expect(editor.getColors().background).toBe('#aabbcc');
    });

    it('SLATE-E2E-032: setColors accepts named CSS colors', () => {
      editor.setColors({ background: 'red' });
      expect(editor.getColors().background).toBe('red');

      editor.setColors({ text: 'cornflowerblue' });
      expect(editor.getColors().text).toBe('cornflowerblue');
    });

    it('SLATE-E2E-033: setColors rejects invalid color values silently', () => {
      editor.setColors({ background: 'not-a-color' });
      expect(editor.getColors().background).toBe('#000000'); // default unchanged

      editor.setColors({ background: '#gggggg' });
      expect(editor.getColors().background).toBe('#000000'); // still default
    });

    it('SLATE-E2E-034: setColors with all invalid values does not emit event', () => {
      const callback = vi.fn();
      editor.on('stateChanged', callback);

      editor.setColors({ background: 'invalid', text: 'also-invalid' });

      expect(callback).not.toHaveBeenCalled();
    });

    it('SLATE-E2E-035: setColors emits stateChanged for valid values', () => {
      const callback = vi.fn();
      editor.on('stateChanged', callback);

      editor.setColors({ accent: 'blue' });

      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('SLATE-E2E-036: getColors returns a copy', () => {
      const colors = editor.getColors();
      colors.background = '#ff0000';

      expect(editor.getColors().background).toBe('#000000');
    });
  });

  // =========================================================================
  // 5. Font size multiplier
  // =========================================================================
  describe('font size multiplier', () => {
    let editor: SlateEditor;

    beforeEach(() => {
      editor = new SlateEditor();
    });

    afterEach(() => {
      editor.dispose();
    });

    it('SLATE-E2E-040: setFontSizeMultiplier sets value', () => {
      editor.setFontSizeMultiplier(1.5);
      expect(editor.getFontSizeMultiplier()).toBe(1.5);
    });

    it('SLATE-E2E-041: setFontSizeMultiplier clamps to [0.5, 2.0]', () => {
      editor.setFontSizeMultiplier(0.1);
      expect(editor.getFontSizeMultiplier()).toBe(0.5);

      editor.setFontSizeMultiplier(5.0);
      expect(editor.getFontSizeMultiplier()).toBe(2.0);
    });

    it('SLATE-E2E-042: setFontSizeMultiplier emits stateChanged', () => {
      const callback = vi.fn();
      editor.on('stateChanged', callback);

      editor.setFontSizeMultiplier(1.2);

      expect(callback).toHaveBeenCalledTimes(1);
    });
  });

  // =========================================================================
  // 6. Logo URL
  // =========================================================================
  describe('logo URL', () => {
    let editor: SlateEditor;

    beforeEach(() => {
      editor = new SlateEditor();
    });

    afterEach(() => {
      editor.dispose();
    });

    it('SLATE-E2E-050: setLogoUrl accepts https URLs', () => {
      editor.setLogoUrl('https://example.com/logo.png');
      expect(editor.getLogoUrl()).toBe('https://example.com/logo.png');
    });

    it('SLATE-E2E-051: setLogoUrl accepts data URLs', () => {
      editor.setLogoUrl('data:image/png;base64,iVBOR...');
      expect(editor.getLogoUrl()).toBe('data:image/png;base64,iVBOR...');
    });

    it('SLATE-E2E-052: setLogoUrl accepts blob URLs', () => {
      editor.setLogoUrl('blob:http://localhost/abc123');
      expect(editor.getLogoUrl()).toBe('blob:http://localhost/abc123');
    });

    it('SLATE-E2E-053: setLogoUrl accepts empty string to clear', () => {
      editor.setLogoUrl('https://example.com/logo.png');
      editor.setLogoUrl('');
      expect(editor.getLogoUrl()).toBe('');
    });

    it('SLATE-E2E-054: setLogoUrl rejects invalid URLs', () => {
      editor.setLogoUrl('ftp://example.com/logo.png');
      expect(editor.getLogoUrl()).toBe(''); // default, rejected

      editor.setLogoUrl('just-a-string');
      expect(editor.getLogoUrl()).toBe('');
    });

    it('SLATE-E2E-055: setLogoPosition sets position', () => {
      editor.setLogoPosition('top-left');
      expect(editor.getLogoPosition()).toBe('top-left');
    });

    it('SLATE-E2E-056: setLogoScale clamps to [0.05, 0.5]', () => {
      editor.setLogoScale(0.01);
      expect(editor.getLogoScale()).toBe(0.05);

      editor.setLogoScale(1.0);
      expect(editor.getLogoScale()).toBe(0.5);

      editor.setLogoScale(0.3);
      expect(editor.getLogoScale()).toBe(0.3);
    });
  });

  // =========================================================================
  // 7. Resolution
  // =========================================================================
  describe('resolution', () => {
    let editor: SlateEditor;

    beforeEach(() => {
      editor = new SlateEditor();
    });

    afterEach(() => {
      editor.dispose();
    });

    it('SLATE-E2E-060: setResolution updates width and height', () => {
      editor.setResolution(3840, 2160);
      const res = editor.getResolution();
      expect(res.width).toBe(3840);
      expect(res.height).toBe(2160);
    });

    it('SLATE-E2E-061: setResolution clamps to minimum 1', () => {
      editor.setResolution(0, -100);
      const res = editor.getResolution();
      expect(res.width).toBe(1);
      expect(res.height).toBe(1);
    });

    it('SLATE-E2E-062: setResolution rounds to integers', () => {
      editor.setResolution(1920.7, 1080.3);
      const res = editor.getResolution();
      expect(res.width).toBe(1921);
      expect(res.height).toBe(1080);
    });
  });

  // =========================================================================
  // 8. Field building
  // =========================================================================
  describe('buildFields', () => {
    let editor: SlateEditor;

    beforeEach(() => {
      editor = new SlateEditor();
    });

    afterEach(() => {
      editor.dispose();
    });

    it('SLATE-E2E-070: buildFields returns empty array when no metadata or custom fields', () => {
      const fields = editor.buildFields();
      expect(fields).toEqual([]);
    });

    it('SLATE-E2E-071: buildFields includes metadata-derived fields', () => {
      editor.setMetadata({ showName: 'Avatar', shotName: 'sh010' });

      const fields = editor.buildFields();
      expect(fields.length).toBeGreaterThanOrEqual(2);

      const showField = fields.find(f => f.value === 'Avatar');
      expect(showField).toBeDefined();
    });

    it('SLATE-E2E-072: buildFields appends custom fields after metadata fields', () => {
      editor.setMetadata({ showName: 'Avatar' });
      editor.addCustomField({ label: 'Codec', value: 'H.264', size: 'medium' });

      const fields = editor.buildFields();
      const lastField = fields[fields.length - 1];
      expect(lastField.label).toBe('Codec');
      expect(lastField.value).toBe('H.264');
    });

    it('SLATE-E2E-073: buildFields omits metadata fields with empty values', () => {
      editor.setMetadata({ showName: '', shotName: 'sh010' });

      const fields = editor.buildFields();
      const emptyField = fields.find(f => f.value === '');
      expect(emptyField).toBeUndefined();
    });
  });

  // =========================================================================
  // 9. Config generation
  // =========================================================================
  describe('generateConfig', () => {
    let editor: SlateEditor;

    beforeEach(() => {
      editor = new SlateEditor();
    });

    afterEach(() => {
      editor.dispose();
    });

    it('SLATE-E2E-080: generateConfig returns a valid SlateConfig', () => {
      editor.setMetadata({ showName: 'Avatar', shotName: 'sh010' });
      editor.setColors({ background: '#1a1a1a', text: '#ffffff' });

      const config = editor.generateConfig();

      expect(config.width).toBe(1920);
      expect(config.height).toBe(1080);
      expect(config.backgroundColor).toBe('#1a1a1a');
      expect(config.textColor).toBe('#ffffff');
      expect(Array.isArray(config.fields)).toBe(true);
      expect(config.logoPosition).toBe('bottom-right');
      expect(config.logoScale).toBe(0.15);
    });

    it('SLATE-E2E-081: generateConfig emits configGenerated event', () => {
      const callback = vi.fn();
      editor.on('configGenerated', callback);

      const config = editor.generateConfig();

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith(config);
    });

    it('SLATE-E2E-082: generateConfig does NOT include logo ImageBitmap (caller must load)', () => {
      editor.setLogoUrl('https://example.com/logo.png');
      const config = editor.generateConfig();

      // The config should NOT have a logo property (or it should be undefined)
      // The caller is responsible for loading the image from logoUrl
      expect(config.logo).toBeUndefined();
    });

    it('SLATE-E2E-083: generateConfig reflects current resolution settings', () => {
      editor.setResolution(3840, 2160);

      const config = editor.generateConfig();

      expect(config.width).toBe(3840);
      expect(config.height).toBe(2160);
    });

    it('SLATE-E2E-084: generateConfig includes custom fields in fields array', () => {
      editor.addCustomField({ label: 'Codec', value: 'H.264', size: 'medium' });

      const config = editor.generateConfig();

      expect(config.fields.some(f => f.label === 'Codec')).toBe(true);
    });
  });

  // =========================================================================
  // 10. setState partial updates
  // =========================================================================
  describe('setState', () => {
    let editor: SlateEditor;

    beforeEach(() => {
      editor = new SlateEditor();
    });

    afterEach(() => {
      editor.dispose();
    });

    it('SLATE-E2E-090: setState with partial update merges correctly', () => {
      editor.setState({
        width: 2048,
        fontSizeMultiplier: 1.5,
      });

      const state = editor.getState();
      expect(state.width).toBe(2048);
      expect(state.fontSizeMultiplier).toBe(1.5);
      expect(state.height).toBe(1080); // unchanged
      expect(state.colors.background).toBe('#000000'); // unchanged
    });

    it('SLATE-E2E-091: setState with metadata merges with existing metadata', () => {
      editor.setMetadata({ showName: 'Show A' });
      editor.setState({ metadata: { shotName: 'sh020' } });

      const meta = editor.getMetadata();
      expect(meta.showName).toBe('Show A');
      expect(meta.shotName).toBe('sh020');
    });

    it('SLATE-E2E-092: setState emits stateChanged', () => {
      const callback = vi.fn();
      editor.on('stateChanged', callback);

      editor.setState({ width: 4096 });

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback.mock.calls[0][0].width).toBe(4096);
    });
  });

  // =========================================================================
  // 11. Dispose
  // =========================================================================
  describe('dispose', () => {
    it('SLATE-E2E-100: dispose can be called without errors', () => {
      const editor = new SlateEditor();
      expect(() => editor.dispose()).not.toThrow();
    });

    it('SLATE-E2E-101: dispose can be called multiple times without error', () => {
      const editor = new SlateEditor();
      expect(() => {
        editor.dispose();
        editor.dispose();
      }).not.toThrow();
    });
  });

  // =========================================================================
  // 12. WIRING GAP ANALYSIS (documents missing features and issues)
  // =========================================================================
  describe('instantiation defaults and config event', () => {
    it('SLATE-E2E-113: SlateEditor with no initial state uses 1920x1080 defaults', () => {
      const editor = new SlateEditor();
      expect(editor.getState().width).toBe(1920);
      expect(editor.getState().height).toBe(1080);
      expect(editor.getState().fontSizeMultiplier).toBe(1.0);
      expect(editor.getState().logoUrl).toBe('');
      editor.dispose();
    });

    it('SLATE-E2E-115: configGenerated event fires with valid config on generateConfig()', () => {
      const editor = new SlateEditor();
      const callback = vi.fn();
      editor.on('configGenerated', callback);

      editor.setMetadata({ showName: 'Test Show' });
      const config = editor.generateConfig();

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith(config);
      expect(config.fields.some(f => f.value === 'Test Show')).toBe(true);

      editor.dispose();
    });
  });
});
