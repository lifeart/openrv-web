/**
 * AppControlRegistry - Extracted UI control instantiation, tab content setup,
 * and disposal from App.
 *
 * This class is responsible for:
 * 1. Creating all UI controls in the correct order
 * 2. Setting up tab panel DOM content (setupTabContents)
 * 3. Disposing all controls
 *
 * Event wiring between controls remains in App (or AppSessionBridge).
 */

import { PaintToolbar } from './ui/components/PaintToolbar';
import { ColorControls } from './ui/components/ColorControls';
import { TransformControl } from './ui/components/TransformControl';
import { FilterControl } from './ui/components/FilterControl';
import { CropControl } from './ui/components/CropControl';
import { CDLControl } from './ui/components/CDLControl';
import { CurvesControl } from './ui/components/CurvesControl';
import { LensControl } from './ui/components/LensControl';
import { DeinterlaceControl } from './ui/components/DeinterlaceControl';
import { GamutMappingControl } from './ui/components/GamutMappingControl';
import { PerspectiveCorrectionControl } from './ui/components/PerspectiveCorrectionControl';
import { FilmEmulationControl } from './ui/components/FilmEmulationControl';
import { StabilizationControl } from './ui/components/StabilizationControl';
import { NoiseReductionControl } from './ui/components/NoiseReductionControl';
import { WatermarkControl } from './ui/components/WatermarkControl';
import { StackControl } from './ui/components/StackControl';
import { ChannelSelect } from './ui/components/ChannelSelect';
import { StereoControl } from './ui/components/StereoControl';
import { StereoEyeTransformControl } from './ui/components/StereoEyeTransformControl';
import { StereoAlignControl } from './ui/components/StereoAlignControl';
import { Histogram } from './ui/components/Histogram';
import { Waveform } from './ui/components/Waveform';
import { Vectorscope } from './ui/components/Vectorscope';
import { GamutDiagram } from './ui/components/GamutDiagram';
import { ZoomControl } from './ui/components/ZoomControl';
import { ScopesControl } from './ui/components/ScopesControl';
import { CompareControl } from './ui/components/CompareControl';
import { SafeAreasControl } from './ui/components/SafeAreasControl';
import { FalseColorControl } from './ui/components/FalseColorControl';
import { LuminanceVisualizationControl } from './ui/components/LuminanceVisualizationControl';
import { ToneMappingControl } from './ui/components/ToneMappingControl';
import { ZebraControl } from './ui/components/ZebraControl';
import { HSLQualifierControl } from './ui/components/HSLQualifierControl';
import { GhostFrameControl } from './ui/components/GhostFrameControl';
import { PARControl } from './ui/components/PARControl';
import { BackgroundPatternControl } from './ui/components/BackgroundPatternControl';
import { OCIOControl } from './ui/components/OCIOControl';
import { DisplayProfileControl } from './ui/components/DisplayProfileControl';
import { ColorInversionToggle } from './ui/components/ColorInversionToggle';
import { PremultControl } from './ui/components/PremultControl';
import { ReferenceManager } from './ui/components/ReferenceManager';
import { SlateEditor } from './ui/components/SlateEditor';
import { ConvergenceMeasure } from './ui/components/ConvergenceMeasure';
import { FloatingWindowControl } from './ui/components/FloatingWindowControl';
import { SphericalProjection } from './render/SphericalProjection';
import { LUTPipelinePanel } from './ui/components/LUTPipelinePanel';
import { HistoryPanel } from './ui/components/HistoryPanel';
import { InfoPanel } from './ui/components/InfoPanel';
import { MarkerListPanel } from './ui/components/MarkerListPanel';
import { NotePanel } from './ui/components/NotePanel';
import { CacheIndicator } from './ui/components/CacheIndicator';
import { TextFormattingToolbar } from './ui/components/TextFormattingToolbar';
import { AutoSaveManager } from './core/session/AutoSaveManager';
import { AutoSaveIndicator } from './ui/components/AutoSaveIndicator';
import { SnapshotManager } from './core/session/SnapshotManager';
import { SnapshotPanel } from './ui/components/SnapshotPanel';
import { PlaylistManager } from './core/session/PlaylistManager';
import { PlaylistPanel } from './ui/components/PlaylistPanel';
import { PresentationMode } from './utils/ui/PresentationMode';
import { NetworkSyncManager } from './network/NetworkSyncManager';
import { NetworkControl } from './ui/components/NetworkControl';
import { ShotGridConfigUI } from './integrations/ShotGridConfig';
import { ShotGridPanel } from './ui/components/ShotGridPanel';
import { ConformPanel, type ConformPanelManager, type ConformSource, type UnresolvedClip, type ConformStatus } from './ui/components/ConformPanel';
import type { NetworkSyncConfig } from './network/types';
import { ContextToolbar } from './ui/components/layout/ContextToolbar';
import { setButtonActive, applyA11yFocus } from './ui/components/shared/Button';
import { getIconSvg } from './ui/components/shared/Icons';
import { getGlobalHistoryManager } from './utils/HistoryManager';
import { RightPanelContent } from './ui/layout/panels/RightPanelContent';
import { LeftPanelContent } from './ui/layout/panels/LeftPanelContent';
import { TimelineEditor } from './ui/components/TimelineEditor';
import { createPanel, createPanelHeader, type Panel } from './ui/components/shared/Panel';
import type { Session } from './core/session/Session';
import type { Viewer } from './ui/components/Viewer';
import type { PaintEngine } from './paint/PaintEngine';
import type { DisplayCapabilities } from './color/DisplayCapabilities';
import type { AppSessionBridge } from './AppSessionBridge';
import type { HeaderBar } from './ui/components/layout/HeaderBar';

function parseSignalingServerList(raw: string | undefined): string[] {
  if (!raw) return [];
  const values = raw
    .split(',')
    .map((value) => value.trim())
    .filter((value) => value.length > 0)
    .filter((value) => /^wss?:\/\//i.test(value));

  return Array.from(new Set(values));
}

function resolveNetworkSyncConfigFromEnv(): Partial<NetworkSyncConfig> {
  const env = (import.meta as { env?: Record<string, string | undefined> }).env ?? {};
  const raw =
    env.VITE_NETWORK_SIGNALING_SERVERS ??
    env.VITE_NETWORK_SIGNALING_URLS ??
    env.VITE_NETWORK_SIGNALING_URL;

  const signalingServers = parseSignalingServerList(raw);
  if (signalingServers.length === 0) return {};

  return {
    serverUrl: signalingServers[0],
    serverUrls: signalingServers,
  };
}

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
  // Paint / Annotate
  readonly paintToolbar: PaintToolbar;
  readonly textFormattingToolbar: TextFormattingToolbar;

  // Color tab
  readonly colorControls: ColorControls;
  readonly colorInversionToggle: ColorInversionToggle;
  readonly premultControl: PremultControl;
  readonly cdlControl: CDLControl;
  readonly curvesControl: CurvesControl;
  readonly ocioControl: OCIOControl;
  readonly lutPipelinePanel: LUTPipelinePanel;

  // View tab - Navigation
  readonly zoomControl: ZoomControl;
  readonly channelSelect: ChannelSelect;

  // View tab - Comparison
  readonly compareControl: CompareControl;
  readonly referenceManager: ReferenceManager;
  readonly stereoControl: StereoControl;
  readonly stereoEyeTransformControl: StereoEyeTransformControl;
  readonly stereoAlignControl: StereoAlignControl;
  readonly ghostFrameControl: GhostFrameControl;
  readonly convergenceMeasure: ConvergenceMeasure;
  readonly floatingWindowControl: FloatingWindowControl;

  // View tab - 360 projection
  readonly sphericalProjection: SphericalProjection;

  // View tab - Monitoring
  readonly scopesControl: ScopesControl;
  readonly stackControl: StackControl;

  // View tab - Analysis
  readonly safeAreasControl: SafeAreasControl;
  readonly falseColorControl: FalseColorControl;
  readonly luminanceVisControl: LuminanceVisualizationControl;
  readonly toneMappingControl: ToneMappingControl;
  readonly zebraControl: ZebraControl;
  readonly hslQualifierControl: HSLQualifierControl;
  readonly parControl: PARControl;
  readonly backgroundPatternControl: BackgroundPatternControl;
  readonly displayProfileControl: DisplayProfileControl;
  readonly gamutMappingControl: GamutMappingControl;

  // Effects tab
  readonly filterControl: FilterControl;
  readonly slateEditor: SlateEditor;
  readonly lensControl: LensControl;
  readonly deinterlaceControl: DeinterlaceControl;
  readonly filmEmulationControl: FilmEmulationControl;
  readonly perspectiveCorrectionControl: PerspectiveCorrectionControl;
  readonly stabilizationControl: StabilizationControl;
  readonly noiseReductionControl: NoiseReductionControl;
  readonly watermarkControl: WatermarkControl;
  readonly timelineEditor: TimelineEditor;

  // Transform tab
  readonly transformControl: TransformControl;
  readonly cropControl: CropControl;

  // Analysis scopes (lazy-created on first access to avoid unnecessary GPU resource allocation)
  private _histogram: Histogram | null = null;
  private _waveform: Waveform | null = null;
  private _vectorscope: Vectorscope | null = null;
  readonly gamutDiagram: GamutDiagram;

  get histogram(): Histogram {
    if (!this._histogram) {
      this._histogram = new Histogram();
    }
    return this._histogram;
  }

  get waveform(): Waveform {
    if (!this._waveform) {
      this._waveform = new Waveform();
    }
    return this._waveform;
  }

  get vectorscope(): Vectorscope {
    if (!this._vectorscope) {
      this._vectorscope = new Vectorscope();
    }
    return this._vectorscope;
  }

  // Panels
  readonly historyPanel: HistoryPanel;
  readonly infoPanel: InfoPanel;
  readonly markerListPanel: MarkerListPanel;
  readonly notePanel: NotePanel;

  // Layout panel content
  readonly rightPanelContent: RightPanelContent;
  readonly leftPanelContent: LeftPanelContent;

  // Cache
  readonly cacheIndicator: CacheIndicator;

  // Auto-save / Snapshots / Playlists
  readonly autoSaveManager: AutoSaveManager;
  readonly autoSaveIndicator: AutoSaveIndicator;
  readonly snapshotManager: SnapshotManager;
  readonly snapshotPanel: SnapshotPanel;
  readonly playlistManager: PlaylistManager;
  readonly playlistPanel: PlaylistPanel;

  // Presentation / Network
  readonly presentationMode: PresentationMode;
  readonly networkSyncManager: NetworkSyncManager;
  readonly networkControl: NetworkControl;

  // ShotGrid integration
  readonly shotGridConfig: ShotGridConfigUI;
  readonly shotGridPanel: ShotGridPanel;

  // Conform / Re-link
  readonly conformPanel: ConformPanel;

  /** Unsubscribe callbacks for registry-level .on() listeners created in setupTabContents */
  private registryUnsubscribers: (() => void)[] = [];
  private readonly noiseReductionPanel: Panel;
  private readonly watermarkPanel: Panel;
  private readonly timelineEditorPanel: Panel;
  private readonly slateEditorPanel: Panel;
  private readonly conformPanelContainer: HTMLElement;
  private readonly conformPanelElement: Panel;
  private convergenceButton: HTMLButtonElement | null = null;
  private floatingWindowButton: HTMLButtonElement | null = null;

  constructor(deps: ControlRegistryDeps) {
    const { session, viewer, paintEngine, displayCapabilities } = deps;

    // --- Paint / Annotate ---
    this.paintToolbar = new PaintToolbar(paintEngine);
    this.textFormattingToolbar = new TextFormattingToolbar(
      paintEngine,
      () => session.currentFrame
    );

    // --- Color tab ---
    this.colorControls = new ColorControls();
    this.colorInversionToggle = new ColorInversionToggle();
    this.premultControl = new PremultControl();
    this.cdlControl = new CDLControl();
    this.curvesControl = new CurvesControl();
    this.ocioControl = new OCIOControl();
    this.lutPipelinePanel = new LUTPipelinePanel(viewer.getLUTPipeline());

    // --- View tab - Navigation ---
    this.zoomControl = new ZoomControl();
    this.channelSelect = new ChannelSelect();

    // --- View tab - Comparison ---
    this.compareControl = new CompareControl();
    this.referenceManager = new ReferenceManager();
    this.stereoControl = new StereoControl();
    this.stereoEyeTransformControl = new StereoEyeTransformControl();
    this.stereoAlignControl = new StereoAlignControl();
    this.ghostFrameControl = new GhostFrameControl();
    this.convergenceMeasure = new ConvergenceMeasure();
    this.floatingWindowControl = new FloatingWindowControl();
    this.sphericalProjection = new SphericalProjection();

    // --- View tab - Monitoring ---
    this.scopesControl = new ScopesControl();
    this.stackControl = new StackControl();

    // --- View tab - Analysis ---
    this.safeAreasControl = new SafeAreasControl(viewer.getSafeAreasOverlay());
    this.falseColorControl = new FalseColorControl(viewer.getFalseColor());
    this.luminanceVisControl = new LuminanceVisualizationControl(viewer.getLuminanceVisualization());
    this.toneMappingControl = new ToneMappingControl(displayCapabilities);
    this.zebraControl = new ZebraControl(viewer.getZebraStripes());
    this.hslQualifierControl = new HSLQualifierControl(viewer.getHSLQualifier());
    this.parControl = new PARControl();
    this.backgroundPatternControl = new BackgroundPatternControl();
    this.displayProfileControl = new DisplayProfileControl();
    this.gamutMappingControl = new GamutMappingControl();

    // --- Effects tab ---
    this.filterControl = new FilterControl();
    this.slateEditor = new SlateEditor();
    this.lensControl = new LensControl();
    this.deinterlaceControl = new DeinterlaceControl();
    this.filmEmulationControl = new FilmEmulationControl();
    this.perspectiveCorrectionControl = new PerspectiveCorrectionControl();
    this.stabilizationControl = new StabilizationControl();
    this.noiseReductionControl = new NoiseReductionControl();
    this.watermarkControl = new WatermarkControl(viewer.getWatermarkOverlay());

    this.noiseReductionPanel = createPanel({ width: '320px', maxHeight: '70vh', align: 'right' });
    this.noiseReductionPanel.element.appendChild(createPanelHeader('Noise Reduction'));
    this.noiseReductionPanel.element.appendChild(this.noiseReductionControl.render());

    this.watermarkPanel = createPanel({ width: '360px', maxHeight: '70vh', align: 'right' });
    this.watermarkPanel.element.appendChild(createPanelHeader('Watermark'));
    this.watermarkPanel.element.appendChild(this.watermarkControl.render());

    this.slateEditorPanel = createPanel({ width: '400px', maxHeight: '70vh', align: 'right' });
    this.slateEditorPanel.element.appendChild(createPanelHeader('Slate / Leader'));
    const slateEditorHost = document.createElement('div');
    slateEditorHost.style.cssText = 'padding: 12px; font-size: 12px; color: var(--text-secondary); display: flex; flex-direction: column; gap: 8px;';
    this.slateEditorPanel.element.appendChild(slateEditorHost);
    this.buildSlateEditorForm(slateEditorHost);

    this.timelineEditorPanel = createPanel({ width: 'clamp(400px, 60vw, 900px)', maxHeight: '70vh', align: 'right' });
    this.timelineEditorPanel.element.appendChild(createPanelHeader('Timeline Editor'));
    const timelineEditorHost = document.createElement('div');
    timelineEditorHost.style.cssText = 'min-height: 220px;';
    this.timelineEditorPanel.element.appendChild(timelineEditorHost);
    this.timelineEditor = new TimelineEditor(timelineEditorHost, session);
    this.timelineEditor.setTotalFrames(session.frameCount);

    // --- Transform tab ---
    this.transformControl = new TransformControl();
    this.cropControl = new CropControl();

    // --- Analysis scopes ---
    // histogram, waveform, and vectorscope are lazy-created via getters on first access
    this.gamutDiagram = new GamutDiagram();

    // --- Panels ---
    this.historyPanel = new HistoryPanel(getGlobalHistoryManager());
    this.infoPanel = new InfoPanel();
    this.markerListPanel = new MarkerListPanel(session);
    this.notePanel = new NotePanel(session);

    // Mutual exclusion: NotePanel and MarkerListPanel overlap in the same position (bidirectional)
    this.notePanel.setExclusiveWith(this.markerListPanel);
    this.markerListPanel.setExclusiveWith(this.notePanel);

    // --- Layout panel content ---
    this.rightPanelContent = new RightPanelContent(this.scopesControl);
    this.leftPanelContent = new LeftPanelContent(this.colorControls, getGlobalHistoryManager());

    // --- Cache ---
    this.cacheIndicator = new CacheIndicator(session, viewer);

    // --- Auto-save / Snapshots / Playlists ---
    this.autoSaveManager = new AutoSaveManager();
    this.autoSaveIndicator = new AutoSaveIndicator();
    this.snapshotManager = new SnapshotManager();
    this.snapshotPanel = new SnapshotPanel(this.snapshotManager);
    this.playlistManager = new PlaylistManager();
    this.playlistPanel = new PlaylistPanel(this.playlistManager);

    // Mutual exclusion: only one panel can be open at a time
    this.snapshotPanel.setExclusiveWith(this.playlistPanel);
    this.playlistPanel.setExclusiveWith(this.snapshotPanel);

    // --- Presentation / Network ---
    this.presentationMode = new PresentationMode();
    this.presentationMode.loadPreference();
    this.networkSyncManager = new NetworkSyncManager(resolveNetworkSyncConfigFromEnv());
    this.networkControl = new NetworkControl();

    // --- ShotGrid integration ---
    this.shotGridConfig = new ShotGridConfigUI();
    this.shotGridPanel = new ShotGridPanel();
    this.shotGridPanel.setConfigUI(this.shotGridConfig);

    // --- Conform / Re-link panel ---
    this.conformPanelElement = createPanel({ width: '500px', maxHeight: '70vh', align: 'right' });
    this.conformPanelElement.element.appendChild(createPanelHeader('Conform / Re-link'));
    this.conformPanelContainer = document.createElement('div');
    this.conformPanelContainer.style.cssText = 'padding: 8px; overflow-y: auto; max-height: 60vh;';
    this.conformPanelElement.element.appendChild(this.conformPanelContainer);

    const conformManager: ConformPanelManager = {
      getUnresolvedClips: (): UnresolvedClip[] =>
        this.playlistManager.unresolvedClips.map(c => ({
          id: c.id,
          name: c.name,
          originalUrl: c.sourceUrl,
          inFrame: c.inFrame,
          outFrame: c.outFrame,
          timelineIn: c.timelineIn,
          reason: 'not_found' as const,
        })),
      getAvailableSources: (): ConformSource[] =>
        (session.allSources ?? []).map((s, i) => ({
          index: i,
          name: s.name,
          url: s.url,
          frameCount: s.duration,
        })),
      relinkClip: (clipId: string, sourceIndex: number): boolean => {
        const source = session.getSourceByIndex(sourceIndex);
        if (!source) return false;
        return this.playlistManager.relinkUnresolvedClip(clipId, sourceIndex, source.name, source.duration);
      },
      getResolutionStatus: (): ConformStatus => {
        const unresolved = this.playlistManager.unresolvedClips.length;
        const total = this.playlistManager.getClips().length + unresolved;
        return { resolved: total - unresolved, total };
      },
    };
    this.conformPanel = new ConformPanel(this.conformPanelContainer, conformManager);
  }

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
    // === VIEW TAB ===
    // Organized into 3 logical groups: Navigation | Comparison | Display
    const viewContent = document.createElement('div');
    viewContent.style.cssText = 'display: flex; align-items: center; gap: 6px; flex-shrink: 0;';

    // --- GROUP 1: Navigation (Zoom + Channel) ---
    viewContent.appendChild(this.zoomControl.render());
    viewContent.appendChild(this.channelSelect.render());
    viewContent.appendChild(ContextToolbar.createDivider());

    // --- GROUP 2: Comparison (Compare + Stereo + Ghost) ---
    viewContent.appendChild(this.compareControl.render());
    viewContent.appendChild(this.stereoControl.render());
    viewContent.appendChild(this.stereoEyeTransformControl.render());
    viewContent.appendChild(this.stereoAlignControl.render());

    // Convergence measurement button (stereo QC)
    this.convergenceButton = ContextToolbar.createIconButton('crosshair', () => {
      this.convergenceMeasure.setEnabled(!this.convergenceMeasure.isEnabled());
    }, { title: 'Toggle convergence measurement' });
    this.convergenceButton.dataset.testid = 'convergence-measure-btn';
    viewContent.appendChild(this.convergenceButton);

    this.registryUnsubscribers.push(this.convergenceMeasure.on('stateChanged', (state) => {
      setButtonActive(this.convergenceButton!, state.enabled, 'icon');
    }));

    // Floating window violation detection button (stereo QC)
    this.floatingWindowButton = ContextToolbar.createIconButton('maximize', () => {
      const pair = viewer.getStereoPair();
      if (pair) {
        const result = this.floatingWindowControl.detect(pair.left, pair.right);
        if (this.floatingWindowButton) {
          this.floatingWindowButton.title = this.floatingWindowControl.formatResult(result);
        }
      }
    }, { title: 'Detect floating window violations' });
    this.floatingWindowButton.dataset.testid = 'floating-window-detect-btn';
    viewContent.appendChild(this.floatingWindowButton);

    this.registryUnsubscribers.push(this.floatingWindowControl.on('stateChanged', (state) => {
      if (this.floatingWindowButton) {
        const hasViolation = state.lastResult?.hasViolation ?? false;
        setButtonActive(this.floatingWindowButton, hasViolation, 'icon');
      }
    }));

    viewContent.appendChild(this.ghostFrameControl.render());

    // Reference capture/toggle buttons
    const captureRefButton = ContextToolbar.createIconButton('camera', () => {
      const imageData = viewer.getImageData();
      if (imageData) {
        this.referenceManager.captureReference({
          width: imageData.width,
          height: imageData.height,
          data: imageData.data,
          channels: 4,
        });
        // Auto-enable reference mode after capture for better UX
        this.referenceManager.enable();
      }
    }, { title: 'Capture reference frame (Alt+Shift+R)' });
    captureRefButton.dataset.testid = 'capture-reference-btn';
    viewContent.appendChild(captureRefButton);

    const toggleRefButton = ContextToolbar.createIconButton('layers', () => {
      this.referenceManager.toggle();
    }, { title: 'Toggle reference comparison (Ctrl+Shift+R)' });
    toggleRefButton.dataset.testid = 'toggle-reference-btn';
    viewContent.appendChild(toggleRefButton);

    this.registryUnsubscribers.push(this.referenceManager.on('stateChanged', (state) => {
      setButtonActive(toggleRefButton, state.enabled, 'icon');

      // Wire reference display to the viewer overlay
      if (state.enabled && state.referenceImage) {
        const ref = state.referenceImage;
        // Build an ImageData from the stored reference pixel data
        let refImageData: ImageData;
        if (ref.data instanceof Uint8ClampedArray) {
          refImageData = new ImageData(new Uint8ClampedArray(ref.data), ref.width, ref.height);
        } else {
          // Convert Float32Array to Uint8ClampedArray for ImageData
          const u8 = new Uint8ClampedArray(ref.width * ref.height * 4);
          for (let i = 0; i < ref.data.length; i++) {
            u8[i] = Math.round(Math.max(0, Math.min(1, ref.data[i]!)) * 255);
          }
          refImageData = new ImageData(u8, ref.width, ref.height);
        }
        viewer.setReferenceImage(refImageData, state.viewMode, state.opacity);
      } else {
        viewer.setReferenceImage(null, 'off', 0);
      }
    }));

    viewContent.appendChild(ContextToolbar.createDivider());

    // --- GROUP 3: Display (Stack, PAR, Background Pattern, Spotlight) ---
    viewContent.appendChild(this.stackControl.render());
    viewContent.appendChild(this.parControl.render());
    viewContent.appendChild(this.backgroundPatternControl.render());

    // 360 spherical projection toggle
    const updateSphericalUniforms = () => {
      const w = viewer.getDisplayWidth() || 1920;
      const h = viewer.getDisplayHeight() || 1080;
      const uniforms = this.sphericalProjection.getProjectionUniforms(w, h);
      viewer.setSphericalProjection({
        enabled: uniforms.u_sphericalEnabled === 1,
        fov: uniforms.u_fov,
        aspect: uniforms.u_aspect,
        yaw: uniforms.u_yaw,
        pitch: uniforms.u_pitch,
      });
    };

    // Wire spherical projection to ViewerInputHandler so mouse drag
    // controls yaw/pitch and mouse wheel controls FOV in 360 mode.
    viewer.setSphericalProjectionRef(this.sphericalProjection, updateSphericalUniforms);

    const sphericalButton = ContextToolbar.createIconButton('aperture', () => {
      if (this.sphericalProjection.enabled) {
        this.sphericalProjection.disable();
      } else {
        this.sphericalProjection.enable();
      }
      updateSphericalUniforms();
      setButtonActive(sphericalButton, this.sphericalProjection.enabled, 'icon');
    }, { title: '360 View' });
    sphericalButton.dataset.testid = 'spherical-projection-btn';
    viewContent.appendChild(sphericalButton);

    // Missing-frame mode dropdown (matches stereo dropdown pattern)
    const missingFrameContainer = document.createElement('div');
    missingFrameContainer.dataset.testid = 'missing-frame-mode-select';
    missingFrameContainer.style.cssText = `
      display: flex; align-items: center; position: relative;
    `;

    type MissingFrameMode = 'off' | 'show-frame' | 'hold' | 'black';
    const missingModes: Array<{ label: string; value: MissingFrameMode }> = [
      { label: 'Off', value: 'off' },
      { label: 'Frame', value: 'show-frame' },
      { label: 'Hold', value: 'hold' },
      { label: 'Black', value: 'black' },
    ];
    let currentMissingMode: MissingFrameMode = viewer.getMissingFrameMode() as MissingFrameMode;
    let isMissingDropdownOpen = false;

    const missingButton = document.createElement('button');
    missingButton.type = 'button';
    missingButton.title = 'Missing frame mode';
    missingButton.setAttribute('aria-haspopup', 'true');
    missingButton.setAttribute('aria-expanded', 'false');
    missingButton.style.cssText = `
      background: transparent;
      border: 1px solid transparent;
      color: var(--text-muted);
      padding: 6px 10px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
      transition: all 0.12s ease;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 80px;
      gap: 4px;
      outline: none;
    `;

    const updateMissingLabel = () => {
      const current = missingModes.find(m => m.value === currentMissingMode);
      missingButton.innerHTML = `${getIconSvg('image', 'sm')}<span style="margin-left: 4px;">Missing: ${current?.label ?? 'Off'}</span><span style="margin-left: 4px; font-size: 8px;">&#9660;</span>`;
    };
    updateMissingLabel();

    const missingDropdown = document.createElement('div');
    missingDropdown.dataset.testid = 'missing-frame-mode-dropdown';
    missingDropdown.style.cssText = `
      position: fixed;
      background: var(--bg-secondary);
      border: 1px solid var(--border-primary);
      border-radius: 4px;
      padding: 4px;
      z-index: 9999;
      display: none;
      flex-direction: column;
      min-width: 140px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
    `;

    const updateMissingOptionStyles = () => {
      missingDropdown.querySelectorAll<HTMLButtonElement>('button').forEach(opt => {
        if (opt.dataset.value === currentMissingMode) {
          opt.style.background = 'rgba(var(--accent-primary-rgb), 0.2)';
          opt.style.color = 'var(--accent-primary)';
        } else {
          opt.style.background = 'transparent';
          opt.style.color = 'var(--text-primary)';
        }
      });
    };

    const positionMissingDropdown = () => {
      if (!isMissingDropdownOpen) return;
      const rect = missingButton.getBoundingClientRect();
      missingDropdown.style.top = `${rect.bottom + 4}px`;
      missingDropdown.style.left = `${rect.left}px`;
    };

    const closeMissingDropdown = () => {
      isMissingDropdownOpen = false;
      missingDropdown.style.display = 'none';
      missingButton.setAttribute('aria-expanded', 'false');
      missingButton.style.background = 'transparent';
      missingButton.style.borderColor = 'transparent';
      missingButton.style.color = 'var(--text-muted)';
      document.removeEventListener('click', handleMissingOutsideClick);
      window.removeEventListener('scroll', positionMissingDropdown, true);
      window.removeEventListener('resize', positionMissingDropdown);
    };

    const openMissingDropdown = () => {
      if (!document.body.contains(missingDropdown)) {
        document.body.appendChild(missingDropdown);
      }
      isMissingDropdownOpen = true;
      positionMissingDropdown();
      missingDropdown.style.display = 'flex';
      missingButton.setAttribute('aria-expanded', 'true');
      missingButton.style.background = 'var(--bg-hover)';
      missingButton.style.borderColor = 'var(--border-primary)';
      document.addEventListener('click', handleMissingOutsideClick);
      window.addEventListener('scroll', positionMissingDropdown, true);
      window.addEventListener('resize', positionMissingDropdown);
    };

    const handleMissingOutsideClick = (e: MouseEvent) => {
      if (!missingButton.contains(e.target as Node) && !missingDropdown.contains(e.target as Node)) {
        closeMissingDropdown();
      }
    };

    for (const mode of missingModes) {
      const opt = document.createElement('button');
      opt.type = 'button';
      opt.dataset.value = mode.value;
      opt.textContent = mode.label;
      opt.style.cssText = `
        background: transparent;
        border: none;
        color: var(--text-primary);
        padding: 6px 10px;
        text-align: left;
        cursor: pointer;
        font-size: 12px;
        border-radius: 3px;
        transition: background 0.12s ease;
      `;
      if (mode.value === currentMissingMode) {
        opt.style.background = 'rgba(var(--accent-primary-rgb), 0.2)';
        opt.style.color = 'var(--accent-primary)';
      }
      opt.addEventListener('mouseenter', () => {
        opt.style.background = 'var(--bg-hover)';
      });
      opt.addEventListener('mouseleave', () => {
        if (mode.value !== currentMissingMode) {
          opt.style.background = 'transparent';
        }
      });
      opt.addEventListener('click', (e) => {
        e.stopPropagation();
        currentMissingMode = mode.value;
        viewer.setMissingFrameMode(mode.value);
        updateMissingLabel();
        updateMissingOptionStyles();
        closeMissingDropdown();
      });
      missingDropdown.appendChild(opt);
    }

    missingButton.addEventListener('click', (e) => {
      e.stopPropagation();
      if (isMissingDropdownOpen) closeMissingDropdown();
      else openMissingDropdown();
    });
    missingButton.addEventListener('mouseenter', () => {
      if (currentMissingMode === 'off' && !isMissingDropdownOpen) {
        missingButton.style.background = 'var(--bg-hover)';
        missingButton.style.borderColor = 'var(--border-primary)';
        missingButton.style.color = 'var(--text-primary)';
      }
    });
    missingButton.addEventListener('mouseleave', () => {
      if (currentMissingMode === 'off' && !isMissingDropdownOpen) {
        missingButton.style.background = 'transparent';
        missingButton.style.borderColor = 'transparent';
        missingButton.style.color = 'var(--text-muted)';
      }
    });
    applyA11yFocus(missingButton);

    missingFrameContainer.appendChild(missingButton);
    viewContent.appendChild(missingFrameContainer);

    // Timeline editor toggle button
    const timelineEditorButton = ContextToolbar.createIconButton('edit', () => {
      this.timelineEditorPanel.toggle(timelineEditorButton);
      setButtonActive(timelineEditorButton, this.timelineEditorPanel.isVisible(), 'icon');
    }, { title: 'Toggle visual timeline editor' });
    timelineEditorButton.dataset.testid = 'timeline-editor-toggle-button';
    viewContent.appendChild(timelineEditorButton);

    // Spotlight Tool toggle button
    const spotlightButton = ContextToolbar.createIconButton('sun', () => {
      viewer.getSpotlightOverlay().toggle();
    }, { title: 'Spotlight (Shift+Q)' });
    spotlightButton.dataset.testid = 'spotlight-toggle-btn';
    viewContent.appendChild(spotlightButton);

    // Update spotlight button state when visibility changes
    this.registryUnsubscribers.push(viewer.getSpotlightOverlay().on('stateChanged', (state) => {
      setButtonActive(spotlightButton, state.enabled, 'icon');
    }));

    // EXR Window Overlay toggle button
    const exrWindowButton = ContextToolbar.createIconButton('grid', () => {
      viewer.getEXRWindowOverlay().toggle();
    }, { title: 'Toggle EXR window overlay' });
    exrWindowButton.dataset.testid = 'exr-window-overlay-toggle-btn';
    viewContent.appendChild(exrWindowButton);

    this.registryUnsubscribers.push(viewer.getEXRWindowOverlay().on('stateChanged', (state) => {
      setButtonActive(exrWindowButton, state.enabled, 'icon');
    }));

    contextToolbar.setTabContent('view', viewContent);

    // Initially hide per-eye controls (shown when stereo mode is activated)
    this.updateStereoEyeControlsVisibility();

    // === QC TAB ===
    // Quality Control: analysis/measurement tools
    const qcContent = document.createElement('div');
    qcContent.style.cssText = 'display: flex; align-items: center; gap: 6px; flex-shrink: 0;';

    // --- GROUP 1: Monitoring (Scopes) ---
    qcContent.appendChild(this.scopesControl.render());
    qcContent.appendChild(ContextToolbar.createDivider());

    // --- GROUP 2: Analysis (SafeAreas, FalseColor, Luminance, Zebra, HSL) ---
    qcContent.appendChild(this.safeAreasControl.render());
    qcContent.appendChild(this.falseColorControl.render());
    qcContent.appendChild(this.luminanceVisControl.render());
    qcContent.appendChild(this.zebraControl.render());
    qcContent.appendChild(this.hslQualifierControl.render());
    qcContent.appendChild(ContextToolbar.createDivider());

    // --- GROUP 3: Tools (Pixel Probe) ---
    const pixelProbeButton = ContextToolbar.createIconButton('eyedropper', () => {
      viewer.getPixelProbe().toggle();
    }, { title: 'Pixel Probe (Shift+I)' });
    pixelProbeButton.dataset.testid = 'pixel-probe-toggle';
    qcContent.appendChild(pixelProbeButton);

    // Update pixel probe button state
    this.registryUnsubscribers.push(viewer.getPixelProbe().on('stateChanged', (state) => {
      setButtonActive(pixelProbeButton, state.enabled, 'icon');
    }));

    // Trigger re-render when false color state changes
    this.registryUnsubscribers.push(viewer.getFalseColor().on('stateChanged', () => {
      viewer.refresh();
    }));

    // Add luminance visualization badge to canvas overlay
    const lumVisBadge = this.luminanceVisControl.createBadge();
    viewer.getCanvasContainer().appendChild(lumVisBadge);

    // Setup eyedropper for color picking from viewer
    let pendingEyedropperHandler: ((e: MouseEvent) => void) | null = null;
    this.hslQualifierControl.setEyedropperCallback((active) => {
      const viewerContainer = viewer.getContainer();
      // Remove any existing pending handler before adding a new one
      if (pendingEyedropperHandler) {
        viewerContainer.removeEventListener('click', pendingEyedropperHandler);
        pendingEyedropperHandler = null;
      }
      if (active) {
        // Set cursor to crosshair when eyedropper is active
        viewerContainer.style.cursor = 'crosshair';
        // Add click handler for color picking
        const clickHandler = (e: MouseEvent) => {
          pendingEyedropperHandler = null;
          const rect = viewerContainer.getBoundingClientRect();
          const x = e.clientX - rect.left;
          const y = e.clientY - rect.top;
          const imageData = viewer.getImageData();
          if (imageData) {
            const canvas = viewerContainer.querySelector('canvas');
            if (canvas) {
              const scaleX = imageData.width / canvas.clientWidth;
              const scaleY = imageData.height / canvas.clientHeight;
              const pixelX = Math.floor(x * scaleX);
              const pixelY = Math.floor(y * scaleY);
              if (pixelX >= 0 && pixelX < imageData.width && pixelY >= 0 && pixelY < imageData.height) {
                const idx = (pixelY * imageData.width + pixelX) * 4;
                const r = imageData.data[idx]!;
                const g = imageData.data[idx + 1]!;
                const b = imageData.data[idx + 2]!;
                viewer.getHSLQualifier().pickColor(r, g, b);
              }
            }
          }
          // Deactivate eyedropper after picking
          this.hslQualifierControl.deactivateEyedropper();
          viewerContainer.style.cursor = '';
        };
        pendingEyedropperHandler = clickHandler;
        viewerContainer.addEventListener('click', clickHandler, { once: true });
      } else {
        viewerContainer.style.cursor = '';
      }
    });

    // Sync scope visibility with ScopesControl
    this.registryUnsubscribers.push(this.histogram.on('visibilityChanged', (visible) => {
      this.scopesControl.setScopeVisible('histogram', visible);
    }));
    this.registryUnsubscribers.push(this.waveform.on('visibilityChanged', (visible) => {
      this.scopesControl.setScopeVisible('waveform', visible);
    }));
    this.registryUnsubscribers.push(this.vectorscope.on('visibilityChanged', (visible) => {
      this.scopesControl.setScopeVisible('vectorscope', visible);
    }));
    this.registryUnsubscribers.push(this.gamutDiagram.on('visibilityChanged', (visible) => {
      this.scopesControl.setScopeVisible('gamutDiagram', visible);
    }));

    // Sync histogram clipping overlay toggle with Viewer
    this.registryUnsubscribers.push(this.histogram.on('clippingOverlayToggled', (enabled) => {
      if (enabled) {
        viewer.getClippingOverlay().enable();
      } else {
        viewer.getClippingOverlay().disable();
      }
    }));

    contextToolbar.setTabContent('qc', qcContent);

    // === COLOR TAB ===
    const colorContent = document.createElement('div');
    colorContent.style.cssText = 'display: flex; align-items: center; gap: 6px;';
    colorContent.appendChild(this.ocioControl.render());
    colorContent.appendChild(ContextToolbar.createDivider());
    // Display Pipeline: Display Profile, Gamut Mapping, Tone Mapping
    colorContent.appendChild(this.displayProfileControl.render());
    colorContent.appendChild(this.gamutMappingControl.render());
    colorContent.appendChild(this.toneMappingControl.render());
    colorContent.appendChild(ContextToolbar.createDivider());
    colorContent.appendChild(this.colorControls.render());
    colorContent.appendChild(ContextToolbar.createDivider());
    colorContent.appendChild(this.cdlControl.render());
    colorContent.appendChild(ContextToolbar.createDivider());
    colorContent.appendChild(this.colorInversionToggle.render());
    colorContent.appendChild(ContextToolbar.createDivider());
    colorContent.appendChild(this.premultControl.render());
    colorContent.appendChild(ContextToolbar.createDivider());

    // Curves toggle button
    const curvesButton = ContextToolbar.createButton('Curves', () => {
      this.curvesControl.toggle();
    }, { title: 'Toggle color curves panel (U)', icon: 'curves' });
    curvesButton.dataset.testid = 'curves-toggle-button';
    colorContent.appendChild(curvesButton);

    // Update button state when visibility changes
    this.registryUnsubscribers.push(this.curvesControl.on('visibilityChanged', (visible) => {
      setButtonActive(curvesButton, visible, 'ghost');
    }));

    // Color Wheels toggle button
    const colorWheels = viewer.getColorWheels();
    const colorWheelsButton = ContextToolbar.createButton('Wheels', () => {
      colorWheels.toggle();
    }, { title: 'Toggle Lift/Gamma/Gain color wheels (Shift+Alt+W)', icon: 'palette' });
    colorWheelsButton.dataset.testid = 'color-wheels-toggle-button';
    colorContent.appendChild(colorWheelsButton);

    // Update button state when visibility changes
    this.registryUnsubscribers.push(colorWheels.on('visibilityChanged', (visible) => {
      setButtonActive(colorWheelsButton, visible, 'ghost');
    }));

    // LUT Pipeline toggle button
    const lutPipelineButton = ContextToolbar.createButton('LUT Graph', () => {
      this.lutPipelinePanel.toggle();
    }, { title: 'Toggle LUT pipeline panel (Shift+L on Color tab)', icon: 'monitor' });
    lutPipelineButton.dataset.testid = 'lut-pipeline-toggle-button';
    colorContent.appendChild(lutPipelineButton);
    this.registryUnsubscribers.push(this.lutPipelinePanel.on('visibilityChanged', (visible) => {
      setButtonActive(lutPipelineButton, visible, 'ghost');
    }));

    contextToolbar.setTabContent('color', colorContent);

    // === PANEL TOGGLES → HeaderBar utility area ===
    // Info Panel, Snapshots, Playlist — accessible from any tab
    const panelToggles = document.createElement('div');
    panelToggles.style.cssText = 'display: flex; align-items: center; gap: 2px;';

    // Info Panel toggle button
    const infoPanelButton = ContextToolbar.createIconButton('info', () => {
      this.infoPanel.toggle();
      if (this.infoPanel.isEnabled()) {
        sessionBridge.updateInfoPanel();
      }
    }, { title: 'Info Panel (Shift+Alt+I)' });
    infoPanelButton.dataset.testid = 'info-panel-toggle';
    panelToggles.appendChild(infoPanelButton);

    this.registryUnsubscribers.push(this.infoPanel.on('visibilityChanged', (visible) => {
      setButtonActive(infoPanelButton, visible, 'icon');
    }));

    // Snapshot Panel toggle button
    const snapshotButton = ContextToolbar.createIconButton('camera', () => {
      this.snapshotPanel.toggle();
      updateSnapshotButtonStyle();
    }, { title: 'Snapshots (Ctrl+Shift+Alt+S)' });
    snapshotButton.dataset.testid = 'snapshot-panel-toggle';
    panelToggles.appendChild(snapshotButton);

    const updateSnapshotButtonStyle = () => {
      setButtonActive(snapshotButton, this.snapshotPanel.isOpen(), 'icon');
    };
    this.registryUnsubscribers.push(this.snapshotPanel.on('visibilityChanged', () => {
      updateSnapshotButtonStyle();
    }));

    // Playlist Panel toggle button
    const playlistButton = ContextToolbar.createIconButton('film', () => {
      this.playlistPanel.toggle();
      updatePlaylistButtonStyle();
    }, { title: 'Playlist (Shift+Alt+P)' });
    playlistButton.dataset.testid = 'playlist-panel-toggle';
    panelToggles.appendChild(playlistButton);

    const updatePlaylistButtonStyle = () => {
      setButtonActive(playlistButton, this.playlistPanel.isOpen(), 'icon');
    };
    this.registryUnsubscribers.push(this.playlistPanel.on('visibilityChanged', () => {
      updatePlaylistButtonStyle();
    }));

    // Conform / Re-link panel toggle button
    const conformButton = ContextToolbar.createIconButton('link', () => {
      this.conformPanelElement.toggle(conformButton);
      setButtonActive(conformButton, this.conformPanelElement.isVisible(), 'icon');
      // Re-render panel when opened to reflect latest unresolved clips
      if (this.conformPanelElement.isVisible()) {
        this.conformPanel.render();
      }
    }, { title: 'Conform / Re-link' });
    conformButton.dataset.testid = 'conform-panel-toggle';
    panelToggles.appendChild(conformButton);

    // ShotGrid Panel toggle button
    const shotGridButton = ContextToolbar.createIconButton('cloud', () => {
      this.shotGridPanel.toggle();
      updateShotGridButtonStyle();
    }, { title: 'ShotGrid' });
    shotGridButton.dataset.testid = 'shotgrid-panel-toggle';
    panelToggles.appendChild(shotGridButton);

    const updateShotGridButtonStyle = () => {
      setButtonActive(shotGridButton, this.shotGridPanel.isOpen(), 'icon');
    };
    this.registryUnsubscribers.push(this.shotGridPanel.on('visibilityChanged', () => {
      updateShotGridButtonStyle();
    }));

    headerBar.setPanelToggles(panelToggles);

    // === EFFECTS TAB ===
    const effectsContent = document.createElement('div');
    effectsContent.style.cssText = 'display: flex; align-items: center; gap: 6px;';
    effectsContent.appendChild(this.filterControl.render());
    effectsContent.appendChild(ContextToolbar.createDivider());
    effectsContent.appendChild(this.lensControl.render());
    effectsContent.appendChild(ContextToolbar.createDivider());
    effectsContent.appendChild(this.deinterlaceControl.render());
    effectsContent.appendChild(ContextToolbar.createDivider());
    effectsContent.appendChild(this.filmEmulationControl.render());
    effectsContent.appendChild(ContextToolbar.createDivider());
    effectsContent.appendChild(this.perspectiveCorrectionControl.render());
    effectsContent.appendChild(ContextToolbar.createDivider());
    effectsContent.appendChild(this.stabilizationControl.render());
    effectsContent.appendChild(ContextToolbar.createDivider());

    const noiseReductionButton = ContextToolbar.createButton('Denoise', () => {
      this.noiseReductionPanel.toggle(noiseReductionButton);
      setButtonActive(noiseReductionButton, this.noiseReductionPanel.isVisible(), 'ghost');
    }, { title: 'Toggle noise reduction panel', icon: 'filter' });
    noiseReductionButton.dataset.testid = 'noise-reduction-toggle-button';
    effectsContent.appendChild(noiseReductionButton);

    const watermarkButton = ContextToolbar.createButton('Watermark', () => {
      this.watermarkPanel.toggle(watermarkButton);
      setButtonActive(watermarkButton, this.watermarkPanel.isVisible(), 'ghost');
    }, { title: 'Toggle watermark panel', icon: 'image' });
    watermarkButton.dataset.testid = 'watermark-toggle-button';
    effectsContent.appendChild(watermarkButton);

    const slateButton = ContextToolbar.createButton('Slate', () => {
      this.slateEditorPanel.toggle(slateButton);
      setButtonActive(slateButton, this.slateEditorPanel.isVisible(), 'ghost');
    }, { title: 'Toggle slate/leader editor', icon: 'film' });
    slateButton.dataset.testid = 'slate-editor-toggle-button';
    effectsContent.appendChild(slateButton);

    contextToolbar.setTabContent('effects', effectsContent);

    // === TRANSFORM TAB ===
    const transformContent = document.createElement('div');
    transformContent.style.cssText = 'display: flex; align-items: center; gap: 6px;';
    transformContent.appendChild(this.transformControl.render());
    transformContent.appendChild(ContextToolbar.createDivider());
    transformContent.appendChild(this.cropControl.render());
    contextToolbar.setTabContent('transform', transformContent);

    // === ANNOTATE TAB ===
    const annotateContent = document.createElement('div');
    annotateContent.style.cssText = 'display: flex; align-items: center; gap: 6px;';
    annotateContent.appendChild(this.paintToolbar.render());

    annotateContent.appendChild(ContextToolbar.createDivider());

    // Text formatting toolbar (B/I/U buttons) - visible when text tool is selected
    annotateContent.appendChild(this.textFormattingToolbar.render());

    annotateContent.appendChild(ContextToolbar.createDivider());

    // History panel toggle button
    const historyButton = ContextToolbar.createButton('History', () => {
      this.historyPanel.toggle();
    }, { title: 'Toggle history panel (Shift+Alt+H)', icon: 'undo' });
    historyButton.dataset.testid = 'history-toggle-button';
    annotateContent.appendChild(historyButton);

    // Update button state when visibility changes
    this.registryUnsubscribers.push(this.historyPanel.on('visibilityChanged', (visible) => {
      setButtonActive(historyButton, visible, 'ghost');
    }));

    // Markers panel toggle button
    const markersButton = ContextToolbar.createButton('Markers', () => {
      this.markerListPanel.toggle();
    }, { title: 'Toggle markers list panel (Shift+Alt+M)', icon: 'marker' });
    markersButton.dataset.testid = 'markers-toggle-button';
    annotateContent.appendChild(markersButton);

    // Update button state when visibility changes
    this.registryUnsubscribers.push(this.markerListPanel.on('visibilityChanged', (visible) => {
      setButtonActive(markersButton, visible, 'ghost');
    }));

    // Notes panel toggle button
    const notesButton = ContextToolbar.createButton('Notes', () => {
      this.notePanel.toggle();
    }, { title: 'Toggle notes panel (Shift+Alt+N)', icon: 'note' });
    notesButton.dataset.testid = 'notes-toggle-button';
    annotateContent.appendChild(notesButton);

    // Update button state when visibility changes
    this.registryUnsubscribers.push(this.notePanel.on('visibilityChanged', (visible) => {
      setButtonActive(notesButton, visible, 'ghost');
    }));

    contextToolbar.setTabContent('annotate', annotateContent);
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
    this._histogram?.dispose();
    this._waveform?.dispose();
    this._vectorscope?.dispose();
    this.gamutDiagram.dispose();
    this.textFormattingToolbar.dispose();
    this.autoSaveIndicator.dispose();
    this.snapshotPanel.dispose();
    this.snapshotManager.dispose();
    this.playlistPanel.dispose();
    this.playlistManager.dispose();
    this.presentationMode.dispose();
    this.networkSyncManager.dispose();
    this.networkControl.dispose();
    this.shotGridConfig.dispose();
    this.shotGridPanel.dispose();
    this.conformPanel.dispose();
    this.conformPanelElement.dispose();
    // Dispose auto-save manager (fire and forget - we can't await in dispose)
    this.autoSaveManager.dispose().catch(err => {
      console.error('Error disposing auto-save manager:', err);
    });
  }
}
