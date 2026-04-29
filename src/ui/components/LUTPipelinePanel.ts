/**
 * LUTPipelinePanel - Multi-point LUT pipeline UI panel
 *
 * Provides a panel for managing the four-point LUT pipeline:
 *   Pre-Cache -> File -> [Corrections] -> Look -> Display
 *
 * Integrates with the LUTPipeline orchestrator for state management.
 */

import { type LUTPipeline, type LUT } from '../../color/ColorProcessingFacade';
import { LUTStageControl } from './LUTStageControl';
import type { ColorPrimaries, TransferFunction } from '../../core/image/Image';
import { EventEmitter, type EventMap } from '../../utils/EventEmitter';
import { Z_INDEX } from './shared/theme';

export interface LUTPipelinePanelEvents extends EventMap {
  visibilityChanged: boolean;
  pipelineChanged: void;
}

export class LUTPipelinePanel extends EventEmitter<LUTPipelinePanelEvents> {
  private panel: HTMLElement;
  private pipeline: LUTPipeline;
  private isVisible = false;

  // Stage controls
  private precacheControl: LUTStageControl;
  private fileControl: LUTStageControl;
  private lookControl: LUTStageControl;
  private displayControl: LUTStageControl;

  // Source selector
  private sourceSelector: HTMLSelectElement;

  // Help popover
  private helpPopover: HTMLElement | null = null;
  private boundHelpOutsideClick: ((e: MouseEvent) => void) | null = null;

  // Default source for single-source workflows
  private defaultSourceId = 'default';

  constructor(pipeline: LUTPipeline) {
    super();
    this.pipeline = pipeline;

    // Ensure default source exists
    this.pipeline.registerSource(this.defaultSourceId);
    this.pipeline.setActiveSource(this.defaultSourceId);

    // Create panel container
    this.panel = document.createElement('div');
    this.panel.dataset.testid = 'lut-pipeline-panel';
    this.panel.style.cssText = `
      position: fixed;
      right: 8px;
      top: 60px;
      width: 320px;
      max-height: 80vh;
      overflow-y: auto;
      background: var(--bg-secondary);
      border: 1px solid var(--border-primary);
      border-radius: 6px;
      padding: 12px;
      z-index: 9999;
      display: none;
      box-shadow: 0 8px 24px rgba(0,0,0,0.5);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
    `;

    // --- Header ---
    const header = document.createElement('div');
    header.style.cssText = `
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 10px;
      padding-bottom: 8px;
      border-bottom: 1px solid var(--border-primary);
    `;

    const title = document.createElement('span');
    title.textContent = 'LUT Pipeline';
    title.style.cssText = 'font-weight: 600; color: var(--text-primary); font-size: 13px;';

    const btnGroup = document.createElement('div');
    btnGroup.style.cssText = 'display: flex; gap: 4px;';

    const helpBtn = this.createHeaderButton('?', 'lut-pipeline-help', 'Help');
    const resetBtn = this.createHeaderButton('Reset', 'lut-pipeline-reset', 'Reset all LUT stages');
    const closeBtn = this.createHeaderButton('X', 'lut-pipeline-close', 'Close panel');

    helpBtn.addEventListener('click', () => this.toggleHelpPopover(helpBtn));
    resetBtn.addEventListener('click', () => this.resetAll());
    closeBtn.addEventListener('click', () => this.hide());

    btnGroup.appendChild(helpBtn);
    btnGroup.appendChild(resetBtn);
    btnGroup.appendChild(closeBtn);
    header.appendChild(title);
    header.appendChild(btnGroup);
    this.panel.appendChild(header);

    // --- Source Selector ---
    const sourceRow = document.createElement('div');
    sourceRow.style.cssText = `
      display: flex;
      align-items: center;
      gap: 6px;
      margin-bottom: 10px;
    `;

    const sourceLabel = document.createElement('span');
    sourceLabel.textContent = 'Source:';
    sourceLabel.style.cssText = 'font-size: 11px; color: var(--text-secondary);';

    this.sourceSelector = document.createElement('select');
    this.sourceSelector.dataset.testid = 'lut-source-selector';
    this.sourceSelector.style.cssText = `
      flex: 1;
      background: var(--bg-secondary);
      border: 1px solid var(--border-primary);
      color: var(--text-primary);
      padding: 2px 4px;
      border-radius: 3px;
      font-size: 11px;
    `;
    const defaultOption = document.createElement('option');
    defaultOption.value = this.defaultSourceId;
    defaultOption.textContent = 'Default Source';
    this.sourceSelector.appendChild(defaultOption);
    this.sourceSelector.addEventListener('change', () => {
      this.pipeline.setActiveSource(this.sourceSelector.value);
      this.syncUIFromPipeline();
    });

    sourceRow.appendChild(sourceLabel);
    sourceRow.appendChild(this.sourceSelector);
    this.panel.appendChild(sourceRow);

    // --- Stage Controls ---

    // Pre-Cache LUT — wrapped in <details> because pre-cache is the
    // advanced, software-only path most sessions don't need to touch.
    // File / Look / Display stay top-level (default visible).
    this.precacheControl = new LUTStageControl(
      {
        stageId: 'precache',
        title: 'Pre-Cache LUT (Software)',
        subtitle: 'Applied at decode time, per-source',
        showOutputColorSpaceSelectors: true,
      },
      {
        onLUTLoaded: (lut, fileName) => this.onStageLUTLoaded('precache', lut, fileName),
        onLUTCleared: () => this.onStageLUTCleared('precache'),
        onEnabledChanged: (enabled) => this.onStageEnabledChanged('precache', enabled),
        onIntensityChanged: (intensity) => this.onStageIntensityChanged('precache', intensity),
        onOutputColorPrimariesChanged: (primaries) => this.onStageOutputColorPrimariesChanged('precache', primaries),
        onOutputTransferFunctionChanged: (transfer) => this.onStageOutputTransferFunctionChanged('precache', transfer),
      },
    );
    const precacheDetails = document.createElement('details');
    precacheDetails.dataset.testid = 'lut-precache-advanced';
    precacheDetails.style.cssText = 'margin-bottom: 4px;';
    const precacheSummary = document.createElement('summary');
    precacheSummary.textContent = 'Advanced: Pre-Cache LUT';
    precacheSummary.style.cssText = `
      cursor: pointer;
      font-size: 11px;
      color: var(--text-secondary);
      padding: 4px 0;
      user-select: none;
    `;
    precacheDetails.appendChild(precacheSummary);
    precacheDetails.appendChild(this.precacheControl.render());
    this.panel.appendChild(precacheDetails);

    // File LUT
    this.fileControl = new LUTStageControl(
      {
        stageId: 'file',
        title: 'File LUT (Input Transform)',
        subtitle: 'GPU-applied, per-source file-to-working-space',
        showSourceSelector: true,
        showOutputColorSpaceSelectors: true,
      },
      {
        onLUTLoaded: (lut, fileName) => this.onStageLUTLoaded('file', lut, fileName),
        onLUTCleared: () => this.onStageLUTCleared('file'),
        onEnabledChanged: (enabled) => this.onStageEnabledChanged('file', enabled),
        onIntensityChanged: (intensity) => this.onStageIntensityChanged('file', intensity),
        onOutputColorPrimariesChanged: (primaries) => this.onStageOutputColorPrimariesChanged('file', primaries),
        onOutputTransferFunctionChanged: (transfer) => this.onStageOutputTransferFunctionChanged('file', transfer),
      },
    );
    this.panel.appendChild(this.fileControl.render());

    // Color Corrections separator
    const correctionsSeparator = document.createElement('div');
    correctionsSeparator.style.cssText = `
      padding: 6px 8px;
      margin-bottom: 12px;
      font-size: 10px;
      color: var(--text-muted);
      font-style: italic;
      text-align: center;
      border: 1px dashed var(--border-primary);
      border-radius: 4px;
    `;
    correctionsSeparator.textContent = 'Color Corrections (CDL / Curves / Adjustments)';
    this.panel.appendChild(correctionsSeparator);

    // Look LUT
    this.lookControl = new LUTStageControl(
      {
        stageId: 'look',
        title: 'Look LUT (Creative Grade)',
        subtitle: 'GPU-applied, per-source creative look',
        showSourceSelector: true,
        showOutputColorSpaceSelectors: true,
      },
      {
        onLUTLoaded: (lut, fileName) => this.onStageLUTLoaded('look', lut, fileName),
        onLUTCleared: () => this.onStageLUTCleared('look'),
        onEnabledChanged: (enabled) => this.onStageEnabledChanged('look', enabled),
        onIntensityChanged: (intensity) => this.onStageIntensityChanged('look', intensity),
        onOutputColorPrimariesChanged: (primaries) => this.onStageOutputColorPrimariesChanged('look', primaries),
        onOutputTransferFunctionChanged: (transfer) => this.onStageOutputTransferFunctionChanged('look', transfer),
      },
    );
    this.panel.appendChild(this.lookControl.render());

    // Display LUT
    this.displayControl = new LUTStageControl(
      {
        stageId: 'display',
        title: 'Display LUT (Session-Wide)',
        subtitle: 'GPU-applied, display calibration',
        showSourceSelector: true,
        sessionWide: true,
        showOutputColorSpaceSelectors: true,
      },
      {
        onLUTLoaded: (lut, fileName) => this.onStageLUTLoaded('display', lut, fileName),
        onLUTCleared: () => this.onStageLUTCleared('display'),
        onEnabledChanged: (enabled) => this.onStageEnabledChanged('display', enabled),
        onIntensityChanged: (intensity) => this.onStageIntensityChanged('display', intensity),
        onOutputColorPrimariesChanged: (primaries) => this.onDisplayOutputColorPrimariesChanged(primaries),
        onOutputTransferFunctionChanged: (transfer) => this.onDisplayOutputTransferFunctionChanged(transfer),
      },
    );
    this.panel.appendChild(this.displayControl.render());

    // --- Chain indicator ---
    const chainRow = document.createElement('div');
    chainRow.style.cssText = `
      margin-top: 8px;
      padding-top: 8px;
      border-top: 1px solid var(--border-primary);
      font-size: 10px;
      color: var(--text-muted);
      text-align: center;
    `;
    chainRow.textContent = 'Chain: Pre-Cache -> File -> Corrections -> Look -> Display';
    this.panel.appendChild(chainRow);

    // Append panel to body
    document.body.appendChild(this.panel);
  }

  private createHeaderButton(text: string, testId: string, title: string): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.textContent = text;
    btn.dataset.testid = testId;
    btn.title = title;
    btn.style.cssText = `
      background: var(--border-secondary);
      border: 1px solid var(--text-muted);
      color: var(--text-primary);
      padding: 2px 6px;
      border-radius: 3px;
      cursor: pointer;
      font-size: 10px;
    `;
    return btn;
  }

  /** Get the pipeline instance */
  getPipeline(): LUTPipeline {
    return this.pipeline;
  }

  /** Show the panel */
  show(): void {
    if (this.isVisible) return;
    this.isVisible = true;
    this.panel.style.display = 'block';
    this.syncUIFromPipeline();
    this.emit('visibilityChanged', true);
  }

  /** Hide the panel */
  hide(): void {
    if (!this.isVisible) return;
    this.isVisible = false;
    this.panel.style.display = 'none';
    this.emit('visibilityChanged', false);
  }

  /** Toggle panel visibility */
  toggle(): void {
    if (this.isVisible) {
      this.hide();
    } else {
      this.show();
    }
  }

  /** Check if the panel is visible */
  getIsVisible(): boolean {
    return this.isVisible;
  }

  /** Get the current pipeline state (for test helpers) */
  getPipelineState() {
    const sourceId = this.pipeline.getActiveSourceId() || this.defaultSourceId;
    const config = this.pipeline.getSourceConfig(sourceId);
    const state = this.pipeline.getState();

    return {
      precache: {
        enabled: config?.preCacheLUT.enabled ?? true,
        hasLUT: config?.preCacheLUT.lutData !== null,
        intensity: config?.preCacheLUT.intensity ?? 1,
        lutName: config?.preCacheLUT.lutName ?? null,
        outputColorPrimaries: config?.preCacheLUT.outputColorPrimaries ?? null,
        outputTransferFunction: config?.preCacheLUT.outputTransferFunction ?? null,
      },
      file: {
        enabled: config?.fileLUT.enabled ?? true,
        hasLUT: config?.fileLUT.lutData !== null,
        intensity: config?.fileLUT.intensity ?? 1,
        lutName: config?.fileLUT.lutName ?? null,
        outputColorPrimaries: config?.fileLUT.outputColorPrimaries ?? null,
        outputTransferFunction: config?.fileLUT.outputTransferFunction ?? null,
      },
      look: {
        enabled: config?.lookLUT.enabled ?? true,
        hasLUT: config?.lookLUT.lutData !== null,
        intensity: config?.lookLUT.intensity ?? 1,
        lutName: config?.lookLUT.lutName ?? null,
        outputColorPrimaries: config?.lookLUT.outputColorPrimaries ?? null,
        outputTransferFunction: config?.lookLUT.outputTransferFunction ?? null,
      },
      display: {
        enabled: state.displayLUT.enabled,
        hasLUT: state.displayLUT.lutData !== null,
        intensity: state.displayLUT.intensity,
        lutName: state.displayLUT.lutName,
        outputColorPrimaries: this.pipeline.getDisplayLUTOutputColorPrimaries(),
        outputTransferFunction: this.pipeline.getDisplayLUTOutputTransferFunction(),
      },
    };
  }

  // --- Internal: sync UI from pipeline state ---

  private syncUIFromPipeline(): void {
    const sourceId = this.pipeline.getActiveSourceId() || this.defaultSourceId;
    const config = this.pipeline.getSourceConfig(sourceId);
    const state = this.pipeline.getState();

    if (config) {
      this.precacheControl.setLUTName(config.preCacheLUT.lutName);
      this.precacheControl.setEnabled(config.preCacheLUT.enabled);
      this.precacheControl.setIntensity(config.preCacheLUT.intensity);
      this.precacheControl.setOutputColorPrimaries(config.preCacheLUT.outputColorPrimaries);
      this.precacheControl.setOutputTransferFunction(config.preCacheLUT.outputTransferFunction);

      this.fileControl.setLUTName(config.fileLUT.lutName);
      this.fileControl.setEnabled(config.fileLUT.enabled);
      this.fileControl.setIntensity(config.fileLUT.intensity);
      this.fileControl.setOutputColorPrimaries(config.fileLUT.outputColorPrimaries);
      this.fileControl.setOutputTransferFunction(config.fileLUT.outputTransferFunction);

      this.lookControl.setLUTName(config.lookLUT.lutName);
      this.lookControl.setEnabled(config.lookLUT.enabled);
      this.lookControl.setIntensity(config.lookLUT.intensity);
      this.lookControl.setOutputColorPrimaries(config.lookLUT.outputColorPrimaries);
      this.lookControl.setOutputTransferFunction(config.lookLUT.outputTransferFunction);
    }

    this.displayControl.setLUTName(state.displayLUT.lutName);
    this.displayControl.setEnabled(state.displayLUT.enabled);
    this.displayControl.setIntensity(state.displayLUT.intensity);
    this.displayControl.setOutputColorPrimaries(state.displayLUT.outputColorPrimaries);
    this.displayControl.setOutputTransferFunction(state.displayLUT.outputTransferFunction);
  }

  // --- Internal: handle stage events ---

  private onStageLUTLoaded(stage: 'precache' | 'file' | 'look' | 'display', lut: LUT, fileName: string): void {
    const sourceId = this.pipeline.getActiveSourceId() || this.defaultSourceId;

    switch (stage) {
      case 'precache':
        this.pipeline.setPreCacheLUT(sourceId, lut, fileName);
        break;
      case 'file':
        this.pipeline.setFileLUT(sourceId, lut, fileName);
        break;
      case 'look':
        this.pipeline.setLookLUT(sourceId, lut, fileName);
        break;
      case 'display':
        this.pipeline.setDisplayLUT(lut, fileName);
        break;
    }

    this.emit('pipelineChanged', undefined);
  }

  private onStageLUTCleared(stage: 'precache' | 'file' | 'look' | 'display'): void {
    const sourceId = this.pipeline.getActiveSourceId() || this.defaultSourceId;

    switch (stage) {
      case 'precache':
        this.pipeline.clearPreCacheLUT(sourceId);
        break;
      case 'file':
        this.pipeline.clearFileLUT(sourceId);
        break;
      case 'look':
        this.pipeline.clearLookLUT(sourceId);
        break;
      case 'display':
        this.pipeline.clearDisplayLUT();
        break;
    }

    this.emit('pipelineChanged', undefined);
  }

  private onStageEnabledChanged(stage: 'precache' | 'file' | 'look' | 'display', enabled: boolean): void {
    const sourceId = this.pipeline.getActiveSourceId() || this.defaultSourceId;

    switch (stage) {
      case 'precache':
        this.pipeline.setPreCacheLUTEnabled(sourceId, enabled);
        break;
      case 'file':
        this.pipeline.setFileLUTEnabled(sourceId, enabled);
        break;
      case 'look':
        this.pipeline.setLookLUTEnabled(sourceId, enabled);
        break;
      case 'display':
        this.pipeline.setDisplayLUTEnabled(enabled);
        break;
    }

    this.emit('pipelineChanged', undefined);
  }

  private onStageIntensityChanged(stage: 'precache' | 'file' | 'look' | 'display', intensity: number): void {
    const sourceId = this.pipeline.getActiveSourceId() || this.defaultSourceId;

    switch (stage) {
      case 'precache':
        this.pipeline.setPreCacheLUTIntensity(sourceId, intensity);
        break;
      case 'file':
        this.pipeline.setFileLUTIntensity(sourceId, intensity);
        break;
      case 'look':
        this.pipeline.setLookLUTIntensity(sourceId, intensity);
        break;
      case 'display':
        this.pipeline.setDisplayLUTIntensity(intensity);
        break;
    }

    this.emit('pipelineChanged', undefined);
  }

  /**
   * Forward the per-stage output-color-primaries declaration into the
   * pipeline. Display LUT goes through the dedicated session-wide setter.
   */
  private onStageOutputColorPrimariesChanged(
    stage: 'precache' | 'file' | 'look',
    primaries: ColorPrimaries | null,
  ): void {
    const sourceId = this.pipeline.getActiveSourceId() ?? this.defaultSourceId;
    this.pipeline.setStageOutputColorPrimaries(sourceId, stage, primaries);
    this.emit('pipelineChanged', undefined);
  }

  /**
   * Forward the per-stage output-transfer-function declaration into the
   * pipeline. Display LUT goes through the dedicated session-wide setter.
   */
  private onStageOutputTransferFunctionChanged(
    stage: 'precache' | 'file' | 'look',
    transfer: TransferFunction | null,
  ): void {
    const sourceId = this.pipeline.getActiveSourceId() ?? this.defaultSourceId;
    this.pipeline.setStageOutputTransferFunction(sourceId, stage, transfer);
    this.emit('pipelineChanged', undefined);
  }

  /** Forward the display-stage output-primaries declaration. */
  private onDisplayOutputColorPrimariesChanged(primaries: ColorPrimaries | null): void {
    this.pipeline.setDisplayLUTOutputColorPrimaries(primaries);
    this.emit('pipelineChanged', undefined);
  }

  /** Forward the display-stage output-transfer-function declaration. */
  private onDisplayOutputTransferFunctionChanged(transfer: TransferFunction | null): void {
    this.pipeline.setDisplayLUTOutputTransferFunction(transfer);
    this.emit('pipelineChanged', undefined);
  }

  private toggleHelpPopover(anchor: HTMLElement): void {
    if (this.helpPopover) {
      this.hideHelpPopover();
      return;
    }

    const popover = document.createElement('div');
    popover.dataset.testid = 'lut-pipeline-help-popover';
    popover.style.cssText = `
      position: absolute;
      top: 40px;
      right: 12px;
      padding: 10px 12px;
      background: var(--bg-secondary, #2a2a2a);
      border: 1px solid var(--border-primary, #444);
      border-radius: 6px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.4);
      z-index: ${Z_INDEX.dropdown};
      width: 280px;
      font-size: 11px;
      color: var(--text-primary, #eee);
      line-height: 1.5;
    `;

    popover.innerHTML = `
      <div style="font-weight:600; margin-bottom:6px;">LUT Pipeline Stages</div>
      <div style="margin-bottom:4px;"><b>Pre-Cache</b> — Applied at decode time in software, before caching.</div>
      <div style="margin-bottom:4px;"><b>File</b> — Input transform (e.g. log-to-linear), GPU-applied per source.</div>
      <div style="margin-bottom:4px;"><b>Corrections</b> — CDL, curves, and color adjustments (middle of chain).</div>
      <div style="margin-bottom:4px;"><b>Look</b> — Creative grade / look, GPU-applied per source.</div>
      <div style="margin-bottom:8px;"><b>Display</b> — Display calibration LUT, session-wide.</div>
      <div style="font-weight:600; margin-bottom:4px;">Output Color Space</div>
      <div>Each stage can declare what color space its LUT outputs. Leave on <b>Auto (passthrough)</b> unless your LUT is known to convert into a specific space (e.g., a Display LUT that outputs sRGB after a PQ source).</div>
    `;

    this.panel.appendChild(popover);
    this.helpPopover = popover;

    this.boundHelpOutsideClick = (e: MouseEvent) => {
      if (!popover.contains(e.target as Node) && e.target !== anchor) {
        this.hideHelpPopover();
      }
    };
    document.addEventListener('mousedown', this.boundHelpOutsideClick);
  }

  private hideHelpPopover(): void {
    if (this.helpPopover) {
      this.helpPopover.remove();
      this.helpPopover = null;
    }
    if (this.boundHelpOutsideClick) {
      document.removeEventListener('mousedown', this.boundHelpOutsideClick);
      this.boundHelpOutsideClick = null;
    }
  }

  private resetAll(): void {
    this.pipeline.resetAll();
    this.syncUIFromPipeline();
    this.emit('pipelineChanged', undefined);
  }

  /** Dispose the panel and remove from DOM */
  dispose(): void {
    this.hideHelpPopover();
    // Tear down child stage controls before removing the panel node so each
    // control's listeners get cleaned up. Detaching the parent alone leaves
    // the listeners pinned on the orphaned select / input / button nodes
    // (pre-existing leak fixed in MED-51 PR-1).
    this.precacheControl.dispose();
    this.fileControl.dispose();
    this.lookControl.dispose();
    this.displayControl.dispose();
    if (this.panel.parentNode) {
      this.panel.parentNode.removeChild(this.panel);
    }
  }
}
