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
  readonly cdlControl: CDLControl;
  readonly curvesControl: CurvesControl;
  readonly ocioControl: OCIOControl;
  readonly lutPipelinePanel: LUTPipelinePanel;

  // View tab - Navigation
  readonly zoomControl: ZoomControl;
  readonly channelSelect: ChannelSelect;

  // View tab - Comparison
  readonly compareControl: CompareControl;
  readonly stereoControl: StereoControl;
  readonly stereoEyeTransformControl: StereoEyeTransformControl;
  readonly stereoAlignControl: StereoAlignControl;
  readonly ghostFrameControl: GhostFrameControl;

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

  // Analysis scopes
  readonly histogram: Histogram;
  readonly waveform: Waveform;
  readonly vectorscope: Vectorscope;
  readonly gamutDiagram: GamutDiagram;

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

  /** Unsubscribe callbacks for registry-level .on() listeners created in setupTabContents */
  private registryUnsubscribers: (() => void)[] = [];
  private readonly noiseReductionPanel: Panel;
  private readonly watermarkPanel: Panel;
  private readonly timelineEditorPanel: Panel;

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
    this.cdlControl = new CDLControl();
    this.curvesControl = new CurvesControl();
    this.ocioControl = new OCIOControl();
    this.lutPipelinePanel = new LUTPipelinePanel(viewer.getLUTPipeline());

    // --- View tab - Navigation ---
    this.zoomControl = new ZoomControl();
    this.channelSelect = new ChannelSelect();

    // --- View tab - Comparison ---
    this.compareControl = new CompareControl();
    this.stereoControl = new StereoControl();
    this.stereoEyeTransformControl = new StereoEyeTransformControl();
    this.stereoAlignControl = new StereoAlignControl();
    this.ghostFrameControl = new GhostFrameControl();

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
    this.histogram = new Histogram();
    this.waveform = new Waveform();
    this.vectorscope = new Vectorscope();
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
    viewContent.appendChild(this.ghostFrameControl.render());
    viewContent.appendChild(ContextToolbar.createDivider());

    // --- GROUP 3: Display (Stack, PAR, Background Pattern, Spotlight) ---
    viewContent.appendChild(this.stackControl.render());
    viewContent.appendChild(this.parControl.render());
    viewContent.appendChild(this.backgroundPatternControl.render());

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
    this.transformControl.dispose();
    this.filterControl.dispose();
    this.cropControl.dispose();
    this.cdlControl.dispose();
    this.colorInversionToggle.dispose();
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
    this.stereoControl.dispose();
    this.stereoEyeTransformControl.dispose();
    this.stereoAlignControl.dispose();
    this.histogram.dispose();
    this.waveform.dispose();
    this.vectorscope.dispose();
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
    // Dispose auto-save manager (fire and forget - we can't await in dispose)
    this.autoSaveManager.dispose().catch(err => {
      console.error('Error disposing auto-save manager:', err);
    });
  }
}
