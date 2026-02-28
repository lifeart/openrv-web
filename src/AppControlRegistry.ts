/**
 * AppControlRegistry - Extracted UI control instantiation, tab content setup,
 * and disposal from App.
 *
 * This class is responsible for:
 * 1. Creating all UI controls in the correct order (via control group factories)
 * 2. Setting up tab panel DOM content (setupTabContents)
 * 3. Disposing all controls
 *
 * Controls are organized into domain groups (color, view, effects, etc.).
 * Permanent compatibility getters delegate to the groups so that all existing
 * call sites continue to work without changes.
 *
 * Event wiring between controls remains in App (or AppSessionBridge).
 */

import type { PaintToolbar } from './ui/components/PaintToolbar';
import type { ColorControls } from './ui/components/ColorControls';
import type { TransformControl } from './ui/components/TransformControl';
import type { FilterControl } from './ui/components/FilterControl';
import type { CropControl } from './ui/components/CropControl';
import type { CDLControl } from './ui/components/CDLControl';
import type { CurvesControl } from './ui/components/CurvesControl';
import type { LensControl } from './ui/components/LensControl';
import type { DeinterlaceControl } from './ui/components/DeinterlaceControl';
import type { GamutMappingControl } from './ui/components/GamutMappingControl';
import type { PerspectiveCorrectionControl } from './ui/components/PerspectiveCorrectionControl';
import type { FilmEmulationControl } from './ui/components/FilmEmulationControl';
import type { StabilizationControl } from './ui/components/StabilizationControl';
import type { NoiseReductionControl } from './ui/components/NoiseReductionControl';
import type { WatermarkControl } from './ui/components/WatermarkControl';
import type { StackControl } from './ui/components/StackControl';
import type { ChannelSelect } from './ui/components/ChannelSelect';
import type { StereoControl } from './ui/components/StereoControl';
import type { StereoEyeTransformControl } from './ui/components/StereoEyeTransformControl';
import type { StereoAlignControl } from './ui/components/StereoAlignControl';
import type { Histogram } from './ui/components/Histogram';
import type { Waveform } from './ui/components/Waveform';
import type { Vectorscope } from './ui/components/Vectorscope';
import type { GamutDiagram } from './ui/components/GamutDiagram';
import type { ZoomControl } from './ui/components/ZoomControl';
import type { ScopesControl } from './ui/components/ScopesControl';
import type { CompareControl } from './ui/components/CompareControl';
import type { SafeAreasControl } from './ui/components/SafeAreasControl';
import type { FalseColorControl } from './ui/components/FalseColorControl';
import type { LuminanceVisualizationControl } from './ui/components/LuminanceVisualizationControl';
import type { ToneMappingControl } from './ui/components/ToneMappingControl';
import type { ZebraControl } from './ui/components/ZebraControl';
import type { HSLQualifierControl } from './ui/components/HSLQualifierControl';
import type { GhostFrameControl } from './ui/components/GhostFrameControl';
import type { PARControl } from './ui/components/PARControl';
import type { BackgroundPatternControl } from './ui/components/BackgroundPatternControl';
import type { OCIOControl } from './ui/components/OCIOControl';
import type { DisplayProfileControl } from './ui/components/DisplayProfileControl';
import type { ColorInversionToggle } from './ui/components/ColorInversionToggle';
import type { PremultControl } from './ui/components/PremultControl';
import type { ReferenceManager } from './ui/components/ReferenceManager';
import type { SlateEditor } from './ui/components/SlateEditor';
import type { ConvergenceMeasure } from './ui/components/ConvergenceMeasure';
import type { FloatingWindowControl } from './ui/components/FloatingWindowControl';
import type { SphericalProjection } from './render/SphericalProjection';
import type { LUTPipelinePanel } from './ui/components/LUTPipelinePanel';
import type { HistoryPanel } from './ui/components/HistoryPanel';
import type { InfoPanel } from './ui/components/InfoPanel';
import type { MarkerListPanel } from './ui/components/MarkerListPanel';
import type { NotePanel } from './ui/components/NotePanel';
import type { CacheIndicator } from './ui/components/CacheIndicator';
import type { TextFormattingToolbar } from './ui/components/TextFormattingToolbar';
import type { AutoSaveManager } from './core/session/AutoSaveManager';
import type { AutoSaveIndicator } from './ui/components/AutoSaveIndicator';
import type { SnapshotManager } from './core/session/SnapshotManager';
import type { SnapshotPanel } from './ui/components/SnapshotPanel';
import type { PlaylistManager } from './core/session/PlaylistManager';
import type { TransitionManager } from './core/session/TransitionManager';
import type { PlaylistPanel } from './ui/components/PlaylistPanel';
import type { PresentationMode } from './utils/ui/PresentationMode';
import type { NetworkSyncManager } from './network/NetworkSyncManager';
import type { NetworkControl } from './ui/components/NetworkControl';
import type { ShotGridConfigUI } from './integrations/ShotGridConfig';
import type { ShotGridPanel } from './ui/components/ShotGridPanel';
import type { ConformPanel } from './ui/components/ConformPanel';
import type { TimelineEditor } from './ui/components/TimelineEditor';

import type { ContextToolbar } from './ui/components/layout/ContextToolbar';
import { getIconSvg } from './ui/components/shared/Icons';
import { createPanel, createPanelHeader, type Panel } from './ui/components/shared/Panel';
import type { Session } from './core/session/Session';
import type { Viewer } from './ui/components/Viewer';
import type { PaintEngine } from './paint/PaintEngine';
import type { DisplayCapabilities } from './color/DisplayCapabilities';
import type { AppSessionBridge } from './AppSessionBridge';
import type { HeaderBar } from './ui/components/layout/HeaderBar';

import type { RightPanelContent } from './ui/layout/panels/RightPanelContent';
import type { LeftPanelContent } from './ui/layout/panels/LeftPanelContent';

import type {
  ColorControlGroup,
  ViewControlGroup,
  EffectsControlGroup,
  TransformControlGroup,
  AnnotateControlGroup,
  PlaybackControlGroup,
} from './services/controls/ControlGroups';
import type { AnalysisControlGroupInternal } from './services/controls/createAnalysisControls';
import type { PanelControlGroupInternal } from './services/controls/createPanelControls';

import { createColorControls } from './services/controls/createColorControls';
import { createViewControls } from './services/controls/createViewControls';
import { createEffectsControls } from './services/controls/createEffectsControls';
import { createTransformControls } from './services/controls/createTransformControls';
import { createAnnotateControls } from './services/controls/createAnnotateControls';
import { createAnalysisControls } from './services/controls/createAnalysisControls';
import { createPanelControls } from './services/controls/createPanelControls';
import { createPlaybackControls } from './services/controls/createPlaybackControls';

import { buildViewTab } from './services/tabContent/buildViewTab';
import { buildQCTab } from './services/tabContent/buildQCTab';
import { buildColorTab } from './services/tabContent/buildColorTab';
import { buildEffectsTab } from './services/tabContent/buildEffectsTab';
import { buildTransformTab } from './services/tabContent/buildTransformTab';
import { buildAnnotateTab } from './services/tabContent/buildAnnotateTab';
import { buildPanelToggles } from './services/tabContent/buildPanelToggles';

/**
 * Dependencies required by AppControlRegistry to create all controls.
 */
export interface ControlRegistryDeps {
  session: Session;
  viewer: Viewer;
  paintEngine: PaintEngine;
  displayCapabilities: DisplayCapabilities;
}

export class AppControlRegistry {
  // ── Control groups ──
  readonly color: ColorControlGroup;
  readonly view: ViewControlGroup;
  readonly effects: EffectsControlGroup;
  readonly transform: TransformControlGroup;
  readonly annotate: AnnotateControlGroup;
  readonly analysis: AnalysisControlGroupInternal;
  readonly panel: PanelControlGroupInternal;
  readonly playback: PlaybackControlGroup;

  /** Unsubscribe callbacks for registry-level .on() listeners created in setupTabContents */
  private registryUnsubscribers: (() => void)[] = [];
  private readonly noiseReductionPanel: Panel;
  private readonly watermarkPanel: Panel;
  private readonly timelineEditorPanel: Panel;
  private readonly slateEditorPanel: Panel;
  private convergenceButton: HTMLButtonElement | null = null;
  private floatingWindowButton: HTMLButtonElement | null = null;

  constructor(deps: ControlRegistryDeps) {
    const { session, viewer, paintEngine, displayCapabilities } = deps;

    // --- Create control groups via factories ---
    this.annotate = createAnnotateControls({ paintEngine, session });
    this.color = createColorControls({ viewer });
    this.view = createViewControls();

    // Effects needs a host element for the timeline editor panel
    this.timelineEditorPanel = createPanel({ width: 'clamp(400px, 60vw, 900px)', maxHeight: '70vh', align: 'right' });
    this.timelineEditorPanel.element.appendChild(createPanelHeader('Timeline Editor'));
    const timelineEditorHost = document.createElement('div');
    timelineEditorHost.style.cssText = 'min-height: 220px;';
    this.timelineEditorPanel.element.appendChild(timelineEditorHost);

    this.effects = createEffectsControls({ viewer, session, timelineEditorHost });

    // Noise reduction panel wrapper
    this.noiseReductionPanel = createPanel({ width: '320px', maxHeight: '70vh', align: 'right' });
    this.noiseReductionPanel.element.appendChild(createPanelHeader('Noise Reduction'));
    this.noiseReductionPanel.element.appendChild(this.effects.noiseReductionControl.render());

    // Watermark panel wrapper
    this.watermarkPanel = createPanel({ width: '360px', maxHeight: '70vh', align: 'right' });
    this.watermarkPanel.element.appendChild(createPanelHeader('Watermark'));
    this.watermarkPanel.element.appendChild(this.effects.watermarkControl.render());

    // Slate editor panel wrapper
    this.slateEditorPanel = createPanel({ width: '400px', maxHeight: '70vh', align: 'right' });
    this.slateEditorPanel.element.appendChild(createPanelHeader('Slate / Leader'));
    const slateEditorHost = document.createElement('div');
    slateEditorHost.style.cssText = 'padding: 12px; font-size: 12px; color: var(--text-secondary); display: flex; flex-direction: column; gap: 8px;';
    this.slateEditorPanel.element.appendChild(slateEditorHost);
    this.buildSlateEditorForm(slateEditorHost);

    this.transform = createTransformControls();
    this.analysis = createAnalysisControls({ viewer, displayCapabilities });

    // Playback group (auto-save, snapshots, playlists, network, presentation)
    this.playback = createPlaybackControls();

    // Panel group needs references from other groups
    this.panel = createPanelControls({
      session,
      viewer,
      scopesControl: this.analysis.scopesControl,
      colorControls: this.color.colorControls,
      snapshotManager: this.playback.snapshotManager,
      playlistManager: this.playback.playlistManager,
      transitionManager: this.playback.transitionManager,
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Permanent compatibility getters — delegate to domain groups
  // ══════════════════════════════════════════════════════════════════════════

  // --- Annotate ---
  get paintToolbar(): PaintToolbar { return this.annotate.paintToolbar; }
  get textFormattingToolbar(): TextFormattingToolbar { return this.annotate.textFormattingToolbar; }

  // --- Color ---
  get colorControls(): ColorControls { return this.color.colorControls; }
  get colorInversionToggle(): ColorInversionToggle { return this.color.colorInversionToggle; }
  get premultControl(): PremultControl { return this.color.premultControl; }
  get cdlControl(): CDLControl { return this.color.cdlControl; }
  get curvesControl(): CurvesControl { return this.color.curvesControl; }
  get ocioControl(): OCIOControl { return this.color.ocioControl; }
  get lutPipelinePanel(): LUTPipelinePanel { return this.color.lutPipelinePanel; }

  // --- View ---
  get zoomControl(): ZoomControl { return this.view.zoomControl; }
  get channelSelect(): ChannelSelect { return this.view.channelSelect; }
  get compareControl(): CompareControl { return this.view.compareControl; }
  get referenceManager(): ReferenceManager { return this.view.referenceManager; }
  get stereoControl(): StereoControl { return this.view.stereoControl; }
  get stereoEyeTransformControl(): StereoEyeTransformControl { return this.view.stereoEyeTransformControl; }
  get stereoAlignControl(): StereoAlignControl { return this.view.stereoAlignControl; }
  get ghostFrameControl(): GhostFrameControl { return this.view.ghostFrameControl; }
  get convergenceMeasure(): ConvergenceMeasure { return this.view.convergenceMeasure; }
  get floatingWindowControl(): FloatingWindowControl { return this.view.floatingWindowControl; }
  get sphericalProjection(): SphericalProjection { return this.view.sphericalProjection; }
  get stackControl(): StackControl { return this.view.stackControl; }
  get parControl(): PARControl { return this.view.parControl; }
  get backgroundPatternControl(): BackgroundPatternControl { return this.view.backgroundPatternControl; }
  get displayProfileControl(): DisplayProfileControl { return this.view.displayProfileControl; }

  // --- Effects ---
  get filterControl(): FilterControl { return this.effects.filterControl; }
  get slateEditor(): SlateEditor { return this.effects.slateEditor; }
  get lensControl(): LensControl { return this.effects.lensControl; }
  get deinterlaceControl(): DeinterlaceControl { return this.effects.deinterlaceControl; }
  get filmEmulationControl(): FilmEmulationControl { return this.effects.filmEmulationControl; }
  get perspectiveCorrectionControl(): PerspectiveCorrectionControl { return this.effects.perspectiveCorrectionControl; }
  get stabilizationControl(): StabilizationControl { return this.effects.stabilizationControl; }
  get noiseReductionControl(): NoiseReductionControl { return this.effects.noiseReductionControl; }
  get watermarkControl(): WatermarkControl { return this.effects.watermarkControl; }
  get timelineEditor(): TimelineEditor { return this.effects.timelineEditor; }

  // --- Transform ---
  get transformControl(): TransformControl { return this.transform.transformControl; }
  get cropControl(): CropControl { return this.transform.cropControl; }

  // --- Analysis ---
  get scopesControl(): ScopesControl { return this.analysis.scopesControl; }
  get safeAreasControl(): SafeAreasControl { return this.analysis.safeAreasControl; }
  get falseColorControl(): FalseColorControl { return this.analysis.falseColorControl; }
  get luminanceVisControl(): LuminanceVisualizationControl { return this.analysis.luminanceVisControl; }
  get toneMappingControl(): ToneMappingControl { return this.analysis.toneMappingControl; }
  get zebraControl(): ZebraControl { return this.analysis.zebraControl; }
  get hslQualifierControl(): HSLQualifierControl { return this.analysis.hslQualifierControl; }
  get gamutMappingControl(): GamutMappingControl { return this.analysis.gamutMappingControl; }
  get gamutDiagram(): GamutDiagram { return this.analysis.gamutDiagram; }
  get histogram(): Histogram { return this.analysis.histogram; }
  get waveform(): Waveform { return this.analysis.waveform; }
  get vectorscope(): Vectorscope { return this.analysis.vectorscope; }

  // --- Panels ---
  get historyPanel(): HistoryPanel { return this.panel.historyPanel; }
  get infoPanel(): InfoPanel { return this.panel.infoPanel; }
  get markerListPanel(): MarkerListPanel { return this.panel.markerListPanel; }
  get notePanel(): NotePanel { return this.panel.notePanel; }
  get rightPanelContent(): RightPanelContent { return this.panel.rightPanelContent; }
  get leftPanelContent(): LeftPanelContent { return this.panel.leftPanelContent; }
  get cacheIndicator(): CacheIndicator { return this.panel.cacheIndicator; }
  get snapshotPanel(): SnapshotPanel { return this.panel.snapshotPanel; }
  get playlistPanel(): PlaylistPanel { return this.panel.playlistPanel; }
  get shotGridConfig(): ShotGridConfigUI { return this.panel.shotGridConfig; }
  get shotGridPanel(): ShotGridPanel { return this.panel.shotGridPanel; }
  get conformPanel(): ConformPanel { return this.panel.conformPanel; }

  // --- Playback ---
  get autoSaveManager(): AutoSaveManager { return this.playback.autoSaveManager; }
  get autoSaveIndicator(): AutoSaveIndicator { return this.playback.autoSaveIndicator; }
  get snapshotManager(): SnapshotManager { return this.playback.snapshotManager; }
  get playlistManager(): PlaylistManager { return this.playback.playlistManager; }
  get transitionManager(): TransitionManager { return this.playback.transitionManager; }
  get presentationMode(): PresentationMode { return this.playback.presentationMode; }
  get networkSyncManager(): NetworkSyncManager { return this.playback.networkSyncManager; }
  get networkControl(): NetworkControl { return this.playback.networkControl; }

  /**
   * Build tab panel DOM content for all tabs.
   * Called during layout creation.
   */
  setupTabContents(
    contextToolbar: ContextToolbar,
    viewer: Viewer,
    sessionBridge: AppSessionBridge,
    headerBar: HeaderBar,
  ): void {
    const addUnsubscriber = (unsub: () => void) => {
      this.registryUnsubscribers.push(unsub);
    };

    // === VIEW TAB ===
    const viewResult = buildViewTab({
      registry: this,
      viewer,
      timelineEditorPanel: this.timelineEditorPanel,
      addUnsubscriber,
    });
    this.convergenceButton = viewResult.convergenceButton;
    this.floatingWindowButton = viewResult.floatingWindowButton;
    contextToolbar.setTabContent('view', viewResult.element);

    // Initially hide per-eye controls (shown when stereo mode is activated)
    this.updateStereoEyeControlsVisibility();

    // === QC TAB ===
    contextToolbar.setTabContent('qc', buildQCTab({ registry: this, viewer, addUnsubscriber }));

    // === COLOR TAB ===
    contextToolbar.setTabContent('color', buildColorTab({ registry: this, viewer, addUnsubscriber }));

    // === PANEL TOGGLES -> HeaderBar utility area ===
    headerBar.setPanelToggles(buildPanelToggles({
      registry: this,
      sessionBridge,
      conformPanelElement: this.panel.conformPanelElement,
      addUnsubscriber,
    }));

    // === EFFECTS TAB ===
    contextToolbar.setTabContent('effects', buildEffectsTab({
      registry: this,
      noiseReductionPanel: this.noiseReductionPanel,
      watermarkPanel: this.watermarkPanel,
      slateEditorPanel: this.slateEditorPanel,
    }));

    // === TRANSFORM TAB ===
    contextToolbar.setTabContent('transform', buildTransformTab(this));

    // === ANNOTATE TAB ===
    contextToolbar.setTabContent('annotate', buildAnnotateTab({ registry: this, addUnsubscriber }));
  }

  /**
   * Update visibility of stereo per-eye controls based on stereo mode.
   */
  updateStereoEyeControlsVisibility(): void {
    const isStereoActive = this.stereoControl.isActive();
    const eyeTransformEl = this.stereoEyeTransformControl.render();
    const alignEl = this.stereoAlignControl.render();
    eyeTransformEl.style.display = isStereoActive ? 'inline-flex' : 'none';
    alignEl.style.display = isStereoActive ? 'inline-flex' : 'none';
    if (this.convergenceButton) {
      this.convergenceButton.style.display = isStereoActive ? 'inline-flex' : 'none';
    }
    if (this.floatingWindowButton) {
      this.floatingWindowButton.style.display = isStereoActive ? 'inline-flex' : 'none';
    }
    // When stereo is turned off, disable convergence measurement
    if (!isStereoActive && this.convergenceMeasure.isEnabled()) {
      this.convergenceMeasure.setEnabled(false);
    }
    // When stereo is turned off, clear floating window detection result
    if (!isStereoActive && this.floatingWindowControl.hasResult()) {
      this.floatingWindowControl.clearResult();
    }
  }

  /**
   * Build the slate editor form UI with real form fields.
   */
  private buildSlateEditorForm(container: HTMLElement): void {
    const inputStyle = `
      width: 100%;
      padding: 4px 8px;
      background: var(--bg-primary);
      border: 1px solid var(--border-primary);
      border-radius: 3px;
      color: var(--text-primary);
      font-size: 12px;
      outline: none;
      box-sizing: border-box;
    `;

    const labelStyle = 'color: var(--text-muted); font-size: 11px; margin-bottom: 2px;';

    // Description
    const desc = document.createElement('div');
    desc.dataset.testid = 'slate-description';
    desc.style.cssText = 'font-size: 11px; color: var(--text-muted); line-height: 1.5; padding: 4px 0 8px; border-bottom: 1px solid var(--border-primary); margin-bottom: 4px;';
    desc.textContent = 'Configure the slate frame prepended to video exports. Fill in production metadata below \u2014 a 2-second leader will be added at the start of each exported clip. Settings are not saved to the session file.';
    container.appendChild(desc);

    const createField = (label: string, type: string, testid: string): HTMLInputElement => {
      const wrapper = document.createElement('div');
      const lbl = document.createElement('div');
      lbl.style.cssText = labelStyle;
      lbl.textContent = label;
      wrapper.appendChild(lbl);
      const input = document.createElement('input');
      input.type = type;
      input.style.cssText = inputStyle;
      input.dataset.testid = testid;
      input.placeholder = label;
      wrapper.appendChild(input);
      container.appendChild(wrapper);
      return input;
    };

    // Text inputs for metadata
    const showNameInput = createField('Show Name', 'text', 'slate-show-name');
    const shotNameInput = createField('Shot Name', 'text', 'slate-shot-name');
    const versionInput = createField('Version', 'text', 'slate-version');
    const artistInput = createField('Artist', 'text', 'slate-artist');
    const dateInput = createField('Date', 'text', 'slate-date');

    // Wire metadata inputs
    const updateMetadata = () => {
      this.slateEditor.setMetadata({
        showName: showNameInput.value || undefined,
        shotName: shotNameInput.value || undefined,
        version: versionInput.value || undefined,
        artist: artistInput.value || undefined,
        date: dateInput.value || undefined,
      });
    };

    showNameInput.addEventListener('input', updateMetadata);
    shotNameInput.addEventListener('input', updateMetadata);
    versionInput.addEventListener('input', updateMetadata);
    artistInput.addEventListener('input', updateMetadata);
    dateInput.addEventListener('input', updateMetadata);

    // Color picker for background color
    const bgColorWrapper = document.createElement('div');
    const bgColorLabel = document.createElement('div');
    bgColorLabel.style.cssText = labelStyle;
    bgColorLabel.textContent = 'Background Color';
    bgColorWrapper.appendChild(bgColorLabel);
    const bgColorInput = document.createElement('input');
    bgColorInput.type = 'color';
    bgColorInput.value = '#000000';
    bgColorInput.dataset.testid = 'slate-bg-color';
    bgColorInput.style.cssText = 'width: 100%; height: 28px; border: none; cursor: pointer; background: transparent;';
    bgColorWrapper.appendChild(bgColorInput);
    container.appendChild(bgColorWrapper);

    bgColorInput.addEventListener('input', () => {
      this.slateEditor.setColors({ background: bgColorInput.value });
    });

    // Font size slider
    const fontSizeWrapper = document.createElement('div');
    const fontSizeLabel = document.createElement('div');
    fontSizeLabel.style.cssText = labelStyle;
    fontSizeLabel.textContent = 'Font Size: 1.0x';
    fontSizeWrapper.appendChild(fontSizeLabel);
    const fontSizeSlider = document.createElement('input');
    fontSizeSlider.type = 'range';
    fontSizeSlider.min = '0.5';
    fontSizeSlider.max = '2.0';
    fontSizeSlider.step = '0.1';
    fontSizeSlider.value = '1.0';
    fontSizeSlider.dataset.testid = 'slate-font-size';
    fontSizeSlider.style.cssText = 'width: 100%;';
    fontSizeWrapper.appendChild(fontSizeSlider);
    container.appendChild(fontSizeWrapper);

    fontSizeSlider.addEventListener('input', () => {
      const val = parseFloat(fontSizeSlider.value);
      fontSizeLabel.textContent = `Font Size: ${val.toFixed(1)}x`;
      this.slateEditor.setFontSizeMultiplier(val);
    });

    // Logo file upload
    const logoSection = document.createElement('div');
    logoSection.style.cssText = 'display: flex; flex-direction: column; gap: 4px;';

    const logoHeader = document.createElement('div');
    logoHeader.style.cssText = 'display: flex; align-items: center; justify-content: space-between;';

    const logoLabel = document.createElement('div');
    logoLabel.style.cssText = labelStyle;
    logoLabel.textContent = 'Logo';
    logoHeader.appendChild(logoLabel);

    const logoButtonGroup = document.createElement('div');
    logoButtonGroup.style.cssText = 'display: flex; gap: 4px;';

    const logoFileInput = document.createElement('input');
    logoFileInput.type = 'file';
    logoFileInput.accept = 'image/png,image/jpeg,image/webp,image/svg+xml';
    logoFileInput.dataset.testid = 'slate-logo-file-input';
    logoFileInput.style.display = 'none';

    const logoLoadButton = document.createElement('button');
    logoLoadButton.type = 'button';
    logoLoadButton.innerHTML = `${getIconSvg('upload', 'sm')} Upload`;
    logoLoadButton.title = 'Upload logo image';
    logoLoadButton.dataset.testid = 'slate-logo-upload';
    logoLoadButton.style.cssText = `
      background: transparent;
      border: 1px solid var(--border-secondary);
      color: var(--text-primary);
      cursor: pointer;
      padding: 3px 8px;
      border-radius: 3px;
      display: flex;
      align-items: center;
      gap: 4px;
      font-size: 11px;
    `;
    logoLoadButton.addEventListener('click', () => logoFileInput.click());

    const logoRemoveButton = document.createElement('button');
    logoRemoveButton.type = 'button';
    logoRemoveButton.innerHTML = getIconSvg('trash', 'sm');
    logoRemoveButton.title = 'Remove logo';
    logoRemoveButton.dataset.testid = 'slate-logo-remove';
    logoRemoveButton.style.cssText = `
      background: transparent;
      border: 1px solid var(--border-secondary);
      color: var(--text-muted);
      cursor: pointer;
      padding: 3px 6px;
      border-radius: 3px;
      display: none;
      align-items: center;
    `;
    logoRemoveButton.addEventListener('click', () => {
      this.slateEditor.removeLogoImage();
    });

    logoButtonGroup.appendChild(logoLoadButton);
    logoButtonGroup.appendChild(logoRemoveButton);
    logoButtonGroup.appendChild(logoFileInput);
    logoHeader.appendChild(logoButtonGroup);
    logoSection.appendChild(logoHeader);

    const logoInfo = document.createElement('div');
    logoInfo.dataset.testid = 'slate-logo-info';
    logoInfo.style.cssText = 'font-size: 10px; color: var(--text-muted); display: none;';
    logoSection.appendChild(logoInfo);

    container.appendChild(logoSection);

    logoFileInput.addEventListener('change', async () => {
      const file = logoFileInput.files?.[0];
      if (!file) return;
      try {
        await this.slateEditor.loadLogoFile(file);
      } catch {
        // Error emitted via logoError event
      }
      logoFileInput.value = '';
    });

    this.slateEditor.on('logoLoaded', (dims) => {
      logoInfo.textContent = `${dims.width} \u00d7 ${dims.height}px`;
      logoInfo.style.display = 'block';
      logoRemoveButton.style.display = 'flex';
    });

    this.slateEditor.on('logoRemoved', () => {
      logoInfo.style.display = 'none';
      logoRemoveButton.style.display = 'none';
    });

    // Preview container
    const previewContainer = document.createElement('div');
    previewContainer.dataset.testid = 'slate-preview-container';
    previewContainer.style.cssText = `
      display: none;
      background: var(--bg-tertiary);
      border: 1px solid var(--border-primary);
      border-radius: 4px;
      padding: 4px;
      align-items: center;
      justify-content: center;
    `;
    container.appendChild(previewContainer);

    // Generate Preview button
    const previewButton = document.createElement('button');
    previewButton.type = 'button';
    previewButton.textContent = 'Generate Preview';
    previewButton.dataset.testid = 'slate-generate-preview';
    previewButton.style.cssText = `
      width: 100%;
      padding: 8px 16px;
      background: var(--accent-primary);
      border: none;
      border-radius: 4px;
      color: #fff;
      font-size: 12px;
      cursor: pointer;
      margin-top: 4px;
    `;
    previewButton.addEventListener('click', () => {
      const canvas = this.slateEditor.generatePreview();
      if (canvas) {
        previewContainer.innerHTML = '';
        canvas.style.cssText = 'max-width: 100%; height: auto; border-radius: 2px;';
        previewContainer.appendChild(canvas);
        previewContainer.style.display = 'flex';
      }
    });
    container.appendChild(previewButton);
  }

  isNoiseReductionPanelVisible(): boolean {
    return this.noiseReductionPanel.isVisible();
  }

  hideNoiseReductionPanel(): void {
    this.noiseReductionPanel.hide();
  }

  isWatermarkPanelVisible(): boolean {
    return this.watermarkPanel.isVisible();
  }

  hideWatermarkPanel(): void {
    this.watermarkPanel.hide();
  }

  isTimelineEditorPanelVisible(): boolean {
    return this.timelineEditorPanel.isVisible();
  }

  hideTimelineEditorPanel(): void {
    this.timelineEditorPanel.hide();
  }

  isSlateEditorPanelVisible(): boolean {
    return this.slateEditorPanel.isVisible();
  }

  hideSlateEditorPanel(): void {
    this.slateEditorPanel.hide();
  }

  /**
   * Dispose all controls and managers.
   */
  dispose(): void {
    // Unsubscribe all registry-level listeners before disposing child controls
    for (const unsub of this.registryUnsubscribers) {
      unsub();
    }
    this.registryUnsubscribers = [];

    this.ocioControl.dispose();
    this.lutPipelinePanel.dispose();
    this.timelineEditor.dispose();
    this.timelineEditorPanel.dispose();
    this.noiseReductionControl.dispose();
    this.noiseReductionPanel.dispose();
    this.watermarkControl.dispose();
    this.watermarkPanel.dispose();
    this.slateEditor.dispose();
    this.slateEditorPanel.dispose();
    this.ghostFrameControl.dispose();
    this.safeAreasControl.dispose();
    this.falseColorControl.dispose();
    this.luminanceVisControl.dispose();
    this.toneMappingControl.dispose();
    this.zebraControl.dispose();
    this.hslQualifierControl.dispose();
    this.historyPanel.dispose();
    this.infoPanel.dispose();
    this.markerListPanel.dispose();
    this.notePanel.dispose();
    this.rightPanelContent.dispose();
    this.leftPanelContent.dispose();
    this.cacheIndicator.dispose();
    this.paintToolbar.dispose();
    this.colorControls.dispose();
    this.zoomControl.dispose();
    this.scopesControl.dispose();
    this.compareControl.dispose();
    this.referenceManager.dispose();
    this.transformControl.dispose();
    this.filterControl.dispose();
    this.cropControl.dispose();
    this.cdlControl.dispose();
    this.colorInversionToggle.dispose();
    this.premultControl.dispose();
    this.displayProfileControl.dispose();
    this.gamutMappingControl.dispose();
    this.curvesControl.dispose();
    this.lensControl.dispose();
    this.deinterlaceControl.dispose();
    this.filmEmulationControl.dispose();
    this.perspectiveCorrectionControl.dispose();
    this.stabilizationControl.dispose();
    this.stackControl.dispose();
    this.channelSelect.dispose();
    this.parControl.dispose();
    this.backgroundPatternControl.dispose();
    this.convergenceMeasure.dispose();
    this.floatingWindowControl.dispose();
    this.stereoControl.dispose();
    this.stereoEyeTransformControl.dispose();
    this.stereoAlignControl.dispose();
    this.analysis.disposeLazyScopes();
    this.gamutDiagram.dispose();
    this.textFormattingToolbar.dispose();
    this.autoSaveIndicator.dispose();
    this.snapshotPanel.dispose();
    this.snapshotManager.dispose();
    this.playlistPanel.dispose();
    this.transitionManager.dispose();
    this.playlistManager.dispose();
    this.presentationMode.dispose();
    this.networkSyncManager.dispose();
    this.networkControl.dispose();
    this.shotGridConfig.dispose();
    this.shotGridPanel.dispose();
    this.conformPanel.dispose();
    this.panel.conformPanelElement.dispose();
    // Dispose auto-save manager (fire and forget - we can't await in dispose)
    this.autoSaveManager.dispose().catch(err => {
      console.error('Error disposing auto-save manager:', err);
    });
  }
}
