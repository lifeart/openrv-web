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
 * - Logo URL configuration
 * - Generates a SlateConfig object compatible with SlateRenderer
 */

import { EventEmitter, EventMap } from '../../utils/EventEmitter';
import type { SlateConfig, SlateField, SlateMetadata, LogoPosition } from '../../export/SlateRenderer';
import { buildSlateFields } from '../../export/SlateRenderer';

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
   * Set colors (partial update)
   */
  setColors(colors: Partial<SlateEditorColors>): void {
    this.setState({
      colors: { ...this.state.colors, ...colors },
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
   * Get logo URL
   */
  getLogoUrl(): string {
    return this.state.logoUrl;
  }

  /**
   * Set logo URL
   */
  setLogoUrl(url: string): void {
    this.setState({ logoUrl: url });
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
   * The returned config does NOT include a logo ImageBitmap/HTMLImageElement;
   * the caller must load the image from logoUrl and set config.logo manually.
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

    this.emit('configGenerated', config);
    return config;
  }

  // -------------------------------------------------------------------------
  // Disposal
  // -------------------------------------------------------------------------

  dispose(): void {
    // No external resources to clean up
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function deepCopy<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj)) as T;
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
