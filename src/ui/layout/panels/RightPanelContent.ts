/**
 * RightPanelContent - Single scrollable view for the right layout panel.
 *
 * Contains collapsible sections:
 * 1. Scopes - MiniHistogram + scope toggle buttons
 * 2. Media Info - filename, resolution, frame, timecode, fps, duration
 */

import { CollapsibleSection } from './CollapsibleSection';
import { MiniHistogram } from './MiniHistogram';
import type { HistogramData } from '../../components/Histogram';
import type { ScopesControl } from '../../components/ScopesControl';
import type { ScopeType } from '../../../core/types/scopes';
import type { LayoutPresetId } from '../LayoutStore';

export interface MediaInfoData {
  filename?: string;
  width?: number;
  height?: number;
  currentFrame?: number;
  totalFrames?: number;
  timecode?: string;
  fps?: number;
  duration?: string;
}

export class RightPanelContent {
  private element: HTMLElement;
  private scopesSection: CollapsibleSection;
  private infoSection: CollapsibleSection;
  private miniHistogram: MiniHistogram;
  private scopeButtons: Map<ScopeType, HTMLButtonElement> = new Map();

  // Info fields
  private filenameEl: HTMLElement;
  private resolutionEl: HTMLElement;
  private frameEl: HTMLElement;
  private timecodeEl: HTMLElement;
  private fpsEl: HTMLElement;
  private durationEl: HTMLElement;
  private infoPlaceholder: HTMLElement;
  private infoContent: HTMLElement;

  constructor(scopesControl: ScopesControl) {
    this.element = document.createElement('div');
    this.element.className = 'right-panel-content';
    this.element.dataset.testid = 'right-panel-content';
    this.element.style.cssText = `
      display: flex;
      flex-direction: column;
      height: 100%;
      overflow-y: auto;
      overflow-x: hidden;
    `;

    // --- Section 1: Scopes ---
    this.scopesSection = new CollapsibleSection('Scopes', {
      expanded: true,
      testId: 'section-scopes',
    });

    this.miniHistogram = new MiniHistogram(scopesControl);
    this.scopesSection.getContent().appendChild(this.miniHistogram.getElement());

    // Scope toggle row
    const scopeRow = document.createElement('div');
    scopeRow.style.cssText = `
      display: flex;
      gap: 4px;
      margin-top: 6px;
    `;

    const scopeTypes: { type: ScopeType; label: string }[] = [
      { type: 'histogram', label: 'H' },
      { type: 'waveform', label: 'W' },
      { type: 'vectorscope', label: 'V' },
      { type: 'gamutDiagram', label: 'G' },
    ];

    for (const { type, label } of scopeTypes) {
      const btn = document.createElement('button');
      btn.textContent = label;
      btn.title = `Toggle ${type}`;
      btn.dataset.testid = `scope-btn-${type}`;
      btn.style.cssText = `
        background: transparent;
        border: 1px solid var(--border-primary);
        color: var(--text-secondary);
        padding: 2px 8px;
        border-radius: 3px;
        cursor: pointer;
        font-size: 10px;
        flex: 1;
      `;
      btn.addEventListener('click', () => scopesControl.toggleScope(type));
      this.scopeButtons.set(type, btn);
      scopeRow.appendChild(btn);
    }

    this.scopesSection.getContent().appendChild(scopeRow);
    this.element.appendChild(this.scopesSection.getElement());

    // --- Section 2: Media Info ---
    this.infoSection = new CollapsibleSection('Media Info', {
      expanded: true,
      testId: 'section-media-info',
    });

    // Info placeholder
    this.infoPlaceholder = document.createElement('div');
    this.infoPlaceholder.style.cssText = `
      color: var(--text-muted);
      font-size: 10px;
      padding: 8px 0;
    `;
    this.infoPlaceholder.textContent = 'No media loaded';

    // Info content
    this.infoContent = document.createElement('div');
    this.infoContent.style.cssText = `
      display: none;
      font-size: 11px;
      font-family: monospace;
      color: var(--text-secondary);
    `;

    const createInfoRow = (label: string): HTMLElement => {
      const row = document.createElement('div');
      row.style.cssText = `
        display: flex;
        justify-content: space-between;
        padding: 2px 0;
        overflow: hidden;
      `;
      const labelEl = document.createElement('span');
      labelEl.textContent = label;
      labelEl.style.cssText = 'color: var(--text-muted); flex-shrink: 0; margin-right: 8px;';
      const valueEl = document.createElement('span');
      valueEl.style.cssText = 'text-overflow: ellipsis; overflow: hidden; white-space: nowrap; text-align: right;';
      row.appendChild(labelEl);
      row.appendChild(valueEl);
      return row;
    };

    const filenameRow = createInfoRow('File');
    this.filenameEl = filenameRow.lastChild as HTMLElement;
    const resRow = createInfoRow('Resolution');
    this.resolutionEl = resRow.lastChild as HTMLElement;
    const frameRow = createInfoRow('Frame');
    this.frameEl = frameRow.lastChild as HTMLElement;
    const tcRow = createInfoRow('Timecode');
    this.timecodeEl = tcRow.lastChild as HTMLElement;
    const fpsRow = createInfoRow('FPS');
    this.fpsEl = fpsRow.lastChild as HTMLElement;
    const durRow = createInfoRow('Duration');
    this.durationEl = durRow.lastChild as HTMLElement;

    this.infoContent.appendChild(filenameRow);
    this.infoContent.appendChild(resRow);
    this.infoContent.appendChild(frameRow);
    this.infoContent.appendChild(tcRow);
    this.infoContent.appendChild(fpsRow);
    this.infoContent.appendChild(durRow);

    this.infoSection.getContent().appendChild(this.infoPlaceholder);
    this.infoSection.getContent().appendChild(this.infoContent);
    this.element.appendChild(this.infoSection.getElement());
  }

  updateInfo(data: MediaInfoData): void {
    // Visibility guard: skip when hidden via CSS display:none
    if (this.element.style.display === 'none') return;

    const hasData = data.filename || data.width || data.currentFrame !== undefined;
    if (hasData) {
      this.infoPlaceholder.style.display = 'none';
      this.infoContent.style.display = '';

      if (data.filename !== undefined) {
        this.filenameEl.textContent = data.filename || '-';
        this.filenameEl.title = data.filename || '';
      }
      if (data.width !== undefined && data.height !== undefined) {
        this.resolutionEl.textContent = `${data.width} \u00D7 ${data.height}`;
      }
      if (data.currentFrame !== undefined) {
        const total = data.totalFrames ?? 0;
        this.frameEl.textContent = `${data.currentFrame} / ${total}`;
      }
      if (data.timecode !== undefined) {
        this.timecodeEl.textContent = data.timecode;
      }
      if (data.fps !== undefined) {
        this.fpsEl.textContent = data.fps > 0 ? data.fps.toFixed(2) : '-';
      }
      if (data.duration !== undefined) {
        this.durationEl.textContent = data.duration;
      }
    } else {
      this.infoPlaceholder.style.display = '';
      this.infoContent.style.display = 'none';
    }
  }

  updateHistogram(data: HistogramData): void {
    this.miniHistogram.update(data);
  }

  setPresetMode(preset: LayoutPresetId): void {
    switch (preset) {
      case 'review':
        // QC-focused: metadata/context first, scopes on demand.
        this.scopesSection.setExpanded(false);
        this.infoSection.setExpanded(true);
        break;
      case 'color':
        // Grading-focused: keep scopes open, hide metadata noise.
        this.scopesSection.setExpanded(true);
        this.infoSection.setExpanded(false);
        break;
      case 'paint':
        // Annotation-focused: right panel is secondary; keep both collapsed.
        this.scopesSection.setExpanded(false);
        this.infoSection.setExpanded(false);
        break;
      case 'default':
      default:
        // Balanced default for general browsing.
        this.scopesSection.setExpanded(true);
        this.infoSection.setExpanded(true);
        break;
    }
  }

  getElement(): HTMLElement {
    return this.element;
  }

  dispose(): void {
    this.miniHistogram.dispose();
    this.scopesSection.dispose();
    this.infoSection.dispose();
    this.element.remove();
  }
}
