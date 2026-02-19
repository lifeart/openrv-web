/**
 * SlateEditor - UI component for configuring slate/leader frames
 *
 * Provides a configuration interface for building SlateConfig objects
 * used by SlateRenderer to generate slate frames for video exports.
 *
 * Features:
 * - Configure production metadata fields (show, shot, version, artist, date, codec, colorspace)
 * - Add custom fields with label/value pairs
 * - Configure colors (background, text, accent)
 * - Font size control
 * - Logo file upload with preview
 * - Live slate preview rendering
 * - Generates a SlateConfig object compatible with SlateRenderer
 */

import { EventEmitter, EventMap } from '../../utils/EventEmitter';
import type { SlateConfig, SlateField, SlateMetadata, LogoPosition } from '../../export/SlateRenderer';
import { buildSlateFields, renderSlate } from '../../export/SlateRenderer';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SlateEditorColors {
  background: string;
  text: string;
  accent: string;
}

export interface CustomField {
  label: string;
  value: string;
  size: 'large' | 'medium' | 'small';
}

export interface SlateEditorState {
  /** Production metadata */
  metadata: SlateMetadata;
  /** Custom fields (appended after metadata-derived fields) */
  customFields: CustomField[];
  /** Color settings */
  colors: SlateEditorColors;
  /** Base font size multiplier (0.5 - 2.0) */
  fontSizeMultiplier: number;
  /** Logo image URL */
  logoUrl: string;
  /** Logo position */
  logoPosition: LogoPosition;
  /** Logo scale as fraction of slate width */
  logoScale: number;
  /** Output resolution width */
  width: number;
  /** Output resolution height */
  height: number;
}

export interface SlateEditorEvents extends EventMap {
  stateChanged: SlateEditorState;
  configGenerated: SlateConfig;
  logoLoaded: { width: number; height: number };
  logoRemoved: void;
  logoError: Error;
  previewRendered: HTMLCanvasElement;
}

export const DEFAULT_SLATE_EDITOR_STATE: SlateEditorState = {
  metadata: {},
  customFields: [],
  colors: {
    background: '#000000',
    text: '#ffffff',
    accent: '#4a9eff',
  },
  fontSizeMultiplier: 1.0,
  logoUrl: '',
  logoPosition: 'bottom-right',
  logoScale: 0.15,
  width: 1920,
  height: 1080,
};

// ---------------------------------------------------------------------------
// SlateEditor Component
// ---------------------------------------------------------------------------

export class SlateEditor extends EventEmitter<SlateEditorEvents> {
  private state: SlateEditorState = deepCopy(DEFAULT_SLATE_EDITOR_STATE);
  private logoImage: HTMLImageElement | null = null;
  private pendingLogoAbort: (() => void) | null = null;

  constructor(initialState?: Partial<SlateEditorState>) {
    super();
    if (initialState) {
      this.state = mergeState(this.state, initialState);
    }
  }

  // -------------------------------------------------------------------------
  // State management
  // -------------------------------------------------------------------------

  /**
   * Get a copy of the current editor state
   */
  getState(): SlateEditorState {
    return deepCopy(this.state);
  }

  /**
   * Set partial state and emit change event
   */
  setState(partial: Partial<SlateEditorState>): void {
    this.state = mergeState(this.state, partial);
    this.emit('stateChanged', deepCopy(this.state));
  }

  // -------------------------------------------------------------------------
  // Metadata
  // -------------------------------------------------------------------------

  /**
   * Get current production metadata
   */
  getMetadata(): SlateMetadata {
    return { ...this.state.metadata };
  }

  /**
   * Set production metadata fields
   */
  setMetadata(metadata: Partial<SlateMetadata>): void {
    this.setState({
      metadata: { ...this.state.metadata, ...metadata },
    });
  }

  // -------------------------------------------------------------------------
  // Custom fields
  // -------------------------------------------------------------------------

  /**
   * Get custom fields
   */
  getCustomFields(): CustomField[] {
    return this.state.customFields.map(f => ({ ...f }));
  }

  /**
   * Add a custom field
   */
  addCustomField(field: CustomField): void {
    this.setState({
      customFields: [...this.state.customFields, { ...field }],
    });
  }

  /**
   * Remove a custom field by index
   */
  removeCustomField(index: number): void {
    if (index < 0 || index >= this.state.customFields.length) return;
    const fields = [...this.state.customFields];
    fields.splice(index, 1);
    this.setState({ customFields: fields });
  }

  /**
   * Update a custom field at a given index
   */
  updateCustomField(index: number, field: Partial<CustomField>): void {
    if (index < 0 || index >= this.state.customFields.length) return;
    const fields = this.state.customFields.map((f, i) =>
      i === index ? { ...f, ...field } : { ...f }
    );
    this.setState({ customFields: fields });
  }

  /**
   * Clear all custom fields
   */
  clearCustomFields(): void {
    this.setState({ customFields: [] });
  }

  // -------------------------------------------------------------------------
  // Colors
  // -------------------------------------------------------------------------

  /**
   * Get color settings
   */
  getColors(): SlateEditorColors {
    return { ...this.state.colors };
  }

  /**
   * Set colors (partial update).
   * Validates each color value before applying. Accepts #RGB, #RRGGBB hex
   * formats and named CSS colors. Invalid values are silently ignored
   * (the previous value is kept).
   */
  setColors(colors: Partial<SlateEditorColors>): void {
    const validated: Partial<SlateEditorColors> = {};
    for (const key of ['background', 'text', 'accent'] as const) {
      if (colors[key] !== undefined) {
        if (isValidCSSColor(colors[key])) {
          validated[key] = colors[key];
        }
        // else: silently keep previous value
      }
    }
    if (Object.keys(validated).length === 0) return;
    this.setState({
      colors: { ...this.state.colors, ...validated },
    });
  }

  // -------------------------------------------------------------------------
  // Font size
  // -------------------------------------------------------------------------

  /**
   * Get font size multiplier
   */
  getFontSizeMultiplier(): number {
    return this.state.fontSizeMultiplier;
  }

  /**
   * Set font size multiplier (clamped to 0.5 - 2.0)
   */
  setFontSizeMultiplier(multiplier: number): void {
    this.setState({
      fontSizeMultiplier: Math.max(0.5, Math.min(2.0, multiplier)),
    });
  }

  // -------------------------------------------------------------------------
  // Logo
  // -------------------------------------------------------------------------

  /**
   * Get logo URL (for serialization)
   */
  getLogoUrl(): string {
    return this.state.logoUrl;
  }

  /**
   * Set logo URL.
   * Accepts http://, https://, data:, and blob: URLs, or an empty string
   * to clear. Invalid URLs are rejected (state is not changed).
   */
  setLogoUrl(url: string): void {
    if (url === '' || isValidLogoUrl(url)) {
      this.setState({ logoUrl: url });
    }
  }

  /**
   * Load a logo image from a File (user upload).
   * Aborts any pending load before starting a new one.
   */
  async loadLogoFile(file: File): Promise<void> {
    this.abortPendingLogoLoad();

    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      let aborted = false;

      this.pendingLogoAbort = () => {
        aborted = true;
        URL.revokeObjectURL(url);
        img.src = '';
      };

      img.onload = () => {
        if (aborted) return;
        this.pendingLogoAbort = null;
        this.setLoadedLogo(img, url);
        resolve();
      };

      img.onerror = () => {
        if (aborted) return;
        this.pendingLogoAbort = null;
        URL.revokeObjectURL(url);
        const error = new Error('Failed to load logo image');
        this.emit('logoError', error);
        reject(error);
      };

      img.src = url;
    });
  }

  /**
   * Load a logo image from a URL.
   * Aborts any pending load before starting a new one.
   */
  async loadLogoFromUrl(url: string): Promise<void> {
    if (!isValidLogoUrl(url)) {
      const error = new Error('Invalid logo URL');
      this.emit('logoError', error);
      throw error;
    }

    this.abortPendingLogoLoad();

    return new Promise((resolve, reject) => {
      const img = new Image();
      let aborted = false;

      this.pendingLogoAbort = () => {
        aborted = true;
        img.src = '';
      };

      img.onload = () => {
        if (aborted) return;
        this.pendingLogoAbort = null;
        this.setLoadedLogo(img, url);
        resolve();
      };

      img.onerror = () => {
        if (aborted) return;
        this.pendingLogoAbort = null;
        const error = new Error('Failed to load logo image from URL');
        this.emit('logoError', error);
        reject(error);
      };

      img.crossOrigin = 'anonymous';
      img.src = url;
    });
  }

  /**
   * Remove the loaded logo image.
   */
  removeLogoImage(): void {
    if (!this.logoImage && !this.state.logoUrl) return;

    if (this.state.logoUrl && this.state.logoUrl.startsWith('blob:')) {
      URL.revokeObjectURL(this.state.logoUrl);
    }

    this.logoImage = null;
    this.state.logoUrl = '';
    this.emit('logoRemoved', undefined);
    this.emit('stateChanged', deepCopy(this.state));
  }

  /**
   * Get the loaded logo image element (or null if not loaded).
   */
  getLogoImage(): HTMLImageElement | null {
    return this.logoImage;
  }

  /**
   * Check whether a logo image is loaded.
   */
  hasLogo(): boolean {
    return this.logoImage !== null;
  }

  /**
   * Get logo image dimensions (or null if not loaded).
   */
  getLogoDimensions(): { width: number; height: number } | null {
    if (!this.logoImage) return null;
    return { width: this.logoImage.naturalWidth, height: this.logoImage.naturalHeight };
  }

  /**
   * Get logo position
   */
  getLogoPosition(): LogoPosition {
    return this.state.logoPosition;
  }

  /**
   * Set logo position
   */
  setLogoPosition(position: LogoPosition): void {
    this.setState({ logoPosition: position });
  }

  /**
   * Get logo scale
   */
  getLogoScale(): number {
    return this.state.logoScale;
  }

  /**
   * Set logo scale (clamped to 0.05 - 0.5)
   */
  setLogoScale(scale: number): void {
    this.setState({
      logoScale: Math.max(0.05, Math.min(0.5, scale)),
    });
  }

  private abortPendingLogoLoad(): void {
    if (this.pendingLogoAbort) {
      this.pendingLogoAbort();
      this.pendingLogoAbort = null;
    }
  }

  private setLoadedLogo(img: HTMLImageElement, url: string): void {
    // Revoke old blob URL if exists
    if (this.state.logoUrl && this.state.logoUrl.startsWith('blob:')) {
      URL.revokeObjectURL(this.state.logoUrl);
    }

    this.logoImage = img;
    this.state.logoUrl = url;
    this.emit('logoLoaded', { width: img.naturalWidth, height: img.naturalHeight });
    this.emit('stateChanged', deepCopy(this.state));
  }

  // -------------------------------------------------------------------------
  // Resolution
  // -------------------------------------------------------------------------

  /**
   * Get output resolution
   */
  getResolution(): { width: number; height: number } {
    return { width: this.state.width, height: this.state.height };
  }

  /**
   * Set output resolution
   */
  setResolution(width: number, height: number): void {
    this.setState({
      width: Math.max(1, Math.round(width)),
      height: Math.max(1, Math.round(height)),
    });
  }

  // -------------------------------------------------------------------------
  // Build fields
  // -------------------------------------------------------------------------

  /**
   * Build the complete list of slate fields from metadata + custom fields.
   * The metadata fields come first (via buildSlateFields), followed by custom fields.
   */
  buildFields(): SlateField[] {
    const metadataFields = buildSlateFields(this.state.metadata);
    const customFields: SlateField[] = this.state.customFields.map(f => ({
      label: f.label,
      value: f.value,
      size: f.size,
    }));
    return [...metadataFields, ...customFields];
  }

  // -------------------------------------------------------------------------
  // Config generation
  // -------------------------------------------------------------------------

  /**
   * Generate a SlateConfig object from the current editor state.
   * Includes the loaded logo image if available.
   */
  generateConfig(): SlateConfig {
    const config: SlateConfig = {
      width: this.state.width,
      height: this.state.height,
      backgroundColor: this.state.colors.background,
      textColor: this.state.colors.text,
      fields: this.buildFields(),
      logoPosition: this.state.logoPosition,
      logoScale: this.state.logoScale,
    };

    if (this.logoImage) {
      config.logo = this.logoImage;
    }

    this.emit('configGenerated', config);
    return config;
  }

  // -------------------------------------------------------------------------
  // Preview rendering
  // -------------------------------------------------------------------------

  /**
   * Render a slate preview onto a canvas and return it.
   * The canvas is sized to a scaled-down preview while maintaining aspect ratio.
   */
  generatePreview(maxWidth = 360, maxHeight = 240): HTMLCanvasElement | null {
    const config = this.generateConfig();
    if (config.width <= 0 || config.height <= 0) return null;

    // Scale down for preview, maintaining aspect ratio
    const aspect = config.width / config.height;
    let previewW = maxWidth;
    let previewH = previewW / aspect;
    if (previewH > maxHeight) {
      previewH = maxHeight;
      previewW = previewH * aspect;
    }

    const canvas = document.createElement('canvas');
    canvas.width = Math.round(previewW);
    canvas.height = Math.round(previewH);
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    // Render slate at preview size
    const previewConfig: SlateConfig = {
      ...config,
      width: canvas.width,
      height: canvas.height,
    };

    renderSlate(ctx, previewConfig);
    this.emit('previewRendered', canvas);
    return canvas;
  }

  // -------------------------------------------------------------------------
  // Disposal
  // -------------------------------------------------------------------------

  dispose(): void {
    this.abortPendingLogoLoad();
    if (this.state.logoUrl && this.state.logoUrl.startsWith('blob:')) {
      URL.revokeObjectURL(this.state.logoUrl);
    }
    this.logoImage = null;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function deepCopy<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj)) as T;
}

/**
 * Named CSS colors (CSS Level 4).
 * A canonical lower-case set used for validation.
 */
const CSS_NAMED_COLORS = new Set([
  'aliceblue', 'antiquewhite', 'aqua', 'aquamarine', 'azure', 'beige',
  'bisque', 'black', 'blanchedalmond', 'blue', 'blueviolet', 'brown',
  'burlywood', 'cadetblue', 'chartreuse', 'chocolate', 'coral',
  'cornflowerblue', 'cornsilk', 'crimson', 'cyan', 'darkblue', 'darkcyan',
  'darkgoldenrod', 'darkgray', 'darkgreen', 'darkgrey', 'darkkhaki',
  'darkmagenta', 'darkolivegreen', 'darkorange', 'darkorchid', 'darkred',
  'darksalmon', 'darkseagreen', 'darkslateblue', 'darkslategray',
  'darkslategrey', 'darkturquoise', 'darkviolet', 'deeppink', 'deepskyblue',
  'dimgray', 'dimgrey', 'dodgerblue', 'firebrick', 'floralwhite',
  'forestgreen', 'fuchsia', 'gainsboro', 'ghostwhite', 'gold', 'goldenrod',
  'gray', 'green', 'greenyellow', 'grey', 'honeydew', 'hotpink',
  'indianred', 'indigo', 'ivory', 'khaki', 'lavender', 'lavenderblush',
  'lawngreen', 'lemonchiffon', 'lightblue', 'lightcoral', 'lightcyan',
  'lightgoldenrodyellow', 'lightgray', 'lightgreen', 'lightgrey',
  'lightpink', 'lightsalmon', 'lightseagreen', 'lightskyblue',
  'lightslategray', 'lightslategrey', 'lightsteelblue', 'lightyellow',
  'lime', 'limegreen', 'linen', 'magenta', 'maroon', 'mediumaquamarine',
  'mediumblue', 'mediumorchid', 'mediumpurple', 'mediumseagreen',
  'mediumslateblue', 'mediumspringgreen', 'mediumturquoise',
  'mediumvioletred', 'midnightblue', 'mintcream', 'mistyrose', 'moccasin',
  'navajowhite', 'navy', 'oldlace', 'olive', 'olivedrab', 'orange',
  'orangered', 'orchid', 'palegoldenrod', 'palegreen', 'paleturquoise',
  'palevioletred', 'papayawhip', 'peachpuff', 'peru', 'pink', 'plum',
  'powderblue', 'purple', 'rebeccapurple', 'red', 'rosybrown', 'royalblue',
  'saddlebrown', 'salmon', 'sandybrown', 'seagreen', 'seashell', 'sienna',
  'silver', 'skyblue', 'slateblue', 'slategray', 'slategrey', 'snow',
  'springgreen', 'steelblue', 'tan', 'teal', 'thistle', 'tomato',
  'turquoise', 'violet', 'wheat', 'white', 'whitesmoke', 'yellow',
  'yellowgreen', 'transparent',
]);

/**
 * Validate a CSS color string.
 * Accepts #RGB, #RRGGBB hex formats and named CSS colors.
 */
function isValidCSSColor(value: string): boolean {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (trimmed.length === 0) return false;

  // #RGB or #RRGGBB
  if (/^#[0-9a-fA-F]{3}$/.test(trimmed) || /^#[0-9a-fA-F]{6}$/.test(trimmed)) {
    return true;
  }

  // Named CSS color
  if (CSS_NAMED_COLORS.has(trimmed.toLowerCase())) {
    return true;
  }

  return false;
}

/**
 * Validate a URL for use as a logo source.
 * Accepts http://, https://, data:, and blob: schemes.
 */
function isValidLogoUrl(url: string): boolean {
  if (typeof url !== 'string') return false;
  const trimmed = url.trim();
  return (
    trimmed.startsWith('http://') ||
    trimmed.startsWith('https://') ||
    trimmed.startsWith('data:') ||
    trimmed.startsWith('blob:')
  );
}

function mergeState(
  base: SlateEditorState,
  partial: Partial<SlateEditorState>,
): SlateEditorState {
  const result = { ...base };
  if (partial.metadata !== undefined) {
    result.metadata = { ...base.metadata, ...partial.metadata };
  }
  if (partial.customFields !== undefined) {
    result.customFields = partial.customFields.map(f => ({ ...f }));
  }
  if (partial.colors !== undefined) {
    result.colors = { ...base.colors, ...partial.colors };
  }
  if (partial.fontSizeMultiplier !== undefined) {
    result.fontSizeMultiplier = partial.fontSizeMultiplier;
  }
  if (partial.logoUrl !== undefined) {
    result.logoUrl = partial.logoUrl;
  }
  if (partial.logoPosition !== undefined) {
    result.logoPosition = partial.logoPosition;
  }
  if (partial.logoScale !== undefined) {
    result.logoScale = partial.logoScale;
  }
  if (partial.width !== undefined) {
    result.width = partial.width;
  }
  if (partial.height !== undefined) {
    result.height = partial.height;
  }
  return result;
}
