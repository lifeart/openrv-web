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
import { PerspectiveCorrectionControl } from './ui/components/PerspectiveCorrectionControl';
import { FilmEmulationControl } from './ui/components/FilmEmulationControl';
import { StabilizationControl } from './ui/components/StabilizationControl';
import { StackControl } from './ui/components/StackControl';
import { ChannelSelect } from './ui/components/ChannelSelect';
import { StereoControl } from './ui/components/StereoControl';
import { StereoEyeTransformControl } from './ui/components/StereoEyeTransformControl';
import { StereoAlignControl } from './ui/components/StereoAlignControl';
import { Histogram } from './ui/components/Histogram';
import { Waveform } from './ui/components/Waveform';
import { Vectorscope } from './ui/components/Vectorscope';
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
import { HistoryPanel } from './ui/components/HistoryPanel';
import { InfoPanel } from './ui/components/InfoPanel';
import { MarkerListPanel } from './ui/components/MarkerListPanel';
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
import { ContextToolbar } from './ui/components/layout/ContextToolbar';
import { getGlobalHistoryManager } from './utils/HistoryManager';
import type { Session } from './core/session/Session';
import type { Viewer } from './ui/components/Viewer';
import type { PaintEngine } from './paint/PaintEngine';
import type { DisplayCapabilities } from './color/DisplayCapabilities';
import type { AppSessionBridge } from './AppSessionBridge';

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

  // Effects tab
  readonly filterControl: FilterControl;
  readonly lensControl: LensControl;
  readonly deinterlaceControl: DeinterlaceControl;
  readonly filmEmulationControl: FilmEmulationControl;
  readonly perspectiveCorrectionControl: PerspectiveCorrectionControl;
  readonly stabilizationControl: StabilizationControl;

  // Transform tab
  readonly transformControl: TransformControl;
  readonly cropControl: CropControl;

  // Analysis scopes
  readonly histogram: Histogram;
  readonly waveform: Waveform;
  readonly vectorscope: Vectorscope;

  // Panels
  readonly historyPanel: HistoryPanel;
  readonly infoPanel: InfoPanel;
  readonly markerListPanel: MarkerListPanel;

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

  /** Unsubscribe callbacks for registry-level .on() listeners created in setupTabContents */
  private registryUnsubscribers: (() => void)[] = [];

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

    // --- Effects tab ---
    this.filterControl = new FilterControl();
    this.lensControl = new LensControl();
    this.deinterlaceControl = new DeinterlaceControl();
    this.filmEmulationControl = new FilmEmulationControl();
    this.perspectiveCorrectionControl = new PerspectiveCorrectionControl();
    this.stabilizationControl = new StabilizationControl();

    // --- Transform tab ---
    this.transformControl = new TransformControl();
    this.cropControl = new CropControl();

    // --- Analysis scopes ---
    this.histogram = new Histogram();
    this.waveform = new Waveform();
    this.vectorscope = new Vectorscope();

    // --- Panels ---
    this.historyPanel = new HistoryPanel(getGlobalHistoryManager());
    this.infoPanel = new InfoPanel();
    this.markerListPanel = new MarkerListPanel(session);

    // --- Cache ---
    this.cacheIndicator = new CacheIndicator(session, viewer);

    // --- Auto-save / Snapshots / Playlists ---
    this.autoSaveManager = new AutoSaveManager();
    this.autoSaveIndicator = new AutoSaveIndicator();
    this.snapshotManager = new SnapshotManager();
    this.snapshotPanel = new SnapshotPanel(this.snapshotManager);
    this.playlistManager = new PlaylistManager();
    this.playlistPanel = new PlaylistPanel(this.playlistManager);

    // --- Presentation / Network ---
    this.presentationMode = new PresentationMode();
    this.presentationMode.loadPreference();
    this.networkSyncManager = new NetworkSyncManager();
    this.networkControl = new NetworkControl();
  }

  /**
   * Build tab panel DOM content for all tabs.
   * Called during layout creation.
   */
  setupTabContents(
    contextToolbar: ContextToolbar,
    viewer: Viewer,
    sessionBridge: AppSessionBridge,
  ): void {
    // === VIEW TAB ===
    // Organized into 5 logical groups with minimal dividers for compact layout
    // Groups: Navigation | Comparison | Monitoring | Analysis | Overlays
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

    // --- GROUP 3: Monitoring (Scopes + Stack) ---
    viewContent.appendChild(this.scopesControl.render());
    viewContent.appendChild(this.stackControl.render());
    viewContent.appendChild(ContextToolbar.createDivider());

    // --- GROUP 4: Analysis Tools (SafeAreas, FalseColor, ToneMapping, Zebra, HSL, PAR) ---
    viewContent.appendChild(this.safeAreasControl.render());
    viewContent.appendChild(this.falseColorControl.render());
    viewContent.appendChild(this.luminanceVisControl.render());
    viewContent.appendChild(this.toneMappingControl.render());
    viewContent.appendChild(this.zebraControl.render());
    viewContent.appendChild(this.hslQualifierControl.render());
    viewContent.appendChild(this.parControl.render());
    viewContent.appendChild(this.backgroundPatternControl.render());
    viewContent.appendChild(this.displayProfileControl.render());

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

    viewContent.appendChild(ContextToolbar.createDivider());

    // --- GROUP 5: Overlay Toggles (Probe, Spotlight, Info) ---
    // Icon-only buttons for compact display

    // Pixel Probe / Color Sampler toggle
    const pixelProbeButton = ContextToolbar.createIconButton('eyedropper', () => {
      viewer.getPixelProbe().toggle();
    }, { title: 'Pixel Probe (Shift+I)' });
    pixelProbeButton.dataset.testid = 'pixel-probe-toggle';
    viewContent.appendChild(pixelProbeButton);

    // Update pixel probe button state
    this.registryUnsubscribers.push(viewer.getPixelProbe().on('stateChanged', (state) => {
      if (state.enabled) {
        pixelProbeButton.style.background = 'rgba(var(--accent-primary-rgb), 0.15)';
        pixelProbeButton.style.borderColor = 'var(--accent-primary)';
        pixelProbeButton.style.color = 'var(--accent-primary)';
      } else {
        pixelProbeButton.style.background = 'transparent';
        pixelProbeButton.style.borderColor = 'transparent';
        pixelProbeButton.style.color = 'var(--text-secondary)';
      }
    }));

    // Spotlight Tool toggle button
    const spotlightButton = ContextToolbar.createIconButton('sun', () => {
      viewer.getSpotlightOverlay().toggle();
    }, { title: 'Spotlight (Shift+Q)' });
    spotlightButton.dataset.testid = 'spotlight-toggle-btn';
    viewContent.appendChild(spotlightButton);

    // Update spotlight button state when visibility changes
    this.registryUnsubscribers.push(viewer.getSpotlightOverlay().on('stateChanged', (state) => {
      if (state.enabled) {
        spotlightButton.style.background = 'rgba(var(--accent-primary-rgb), 0.15)';
        spotlightButton.style.borderColor = 'var(--accent-primary)';
        spotlightButton.style.color = 'var(--accent-primary)';
      } else {
        spotlightButton.style.background = 'transparent';
        spotlightButton.style.borderColor = 'transparent';
        spotlightButton.style.color = 'var(--text-secondary)';
      }
    }));

    // Info Panel toggle button
    const infoPanelButton = ContextToolbar.createIconButton('info', () => {
      this.infoPanel.toggle();
      if (this.infoPanel.isEnabled()) {
        sessionBridge.updateInfoPanel();
      }
    }, { title: 'Info Panel (Shift+Alt+I)' });
    infoPanelButton.dataset.testid = 'info-panel-toggle';
    viewContent.appendChild(infoPanelButton);

    // Update button state when visibility changes
    this.registryUnsubscribers.push(this.infoPanel.on('visibilityChanged', (visible) => {
      if (visible) {
        infoPanelButton.style.background = 'rgba(var(--accent-primary-rgb), 0.15)';
        infoPanelButton.style.borderColor = 'var(--accent-primary)';
        infoPanelButton.style.color = 'var(--accent-primary)';
      } else {
        infoPanelButton.style.background = 'transparent';
        infoPanelButton.style.borderColor = 'transparent';
        infoPanelButton.style.color = 'var(--text-secondary)';
      }
    }));

    // Snapshot Panel toggle button
    let snapshotPanelOpen = false;
    const snapshotButton = ContextToolbar.createIconButton('camera', () => {
      this.snapshotPanel.toggle();
      snapshotPanelOpen = !snapshotPanelOpen;
      updateSnapshotButtonStyle();
    }, { title: 'Snapshots (Ctrl+Shift+S)' });
    snapshotButton.dataset.testid = 'snapshot-panel-toggle';
    viewContent.appendChild(snapshotButton);

    const updateSnapshotButtonStyle = () => {
      if (snapshotPanelOpen) {
        snapshotButton.style.background = 'rgba(var(--accent-primary-rgb), 0.15)';
        snapshotButton.style.borderColor = 'var(--accent-primary)';
        snapshotButton.style.color = 'var(--accent-primary)';
      } else {
        snapshotButton.style.background = 'transparent';
        snapshotButton.style.borderColor = 'transparent';
        snapshotButton.style.color = 'var(--text-secondary)';
      }
    };
    this.registryUnsubscribers.push(this.snapshotPanel.on('closed', () => {
      snapshotPanelOpen = false;
      updateSnapshotButtonStyle();
    }));

    // Playlist Panel toggle button
    let playlistPanelOpen = false;
    const playlistButton = ContextToolbar.createIconButton('film', () => {
      this.playlistPanel.toggle();
      playlistPanelOpen = !playlistPanelOpen;
      updatePlaylistButtonStyle();
    }, { title: 'Playlist (Shift+Alt+P)' });
    playlistButton.dataset.testid = 'playlist-panel-toggle';
    viewContent.appendChild(playlistButton);

    const updatePlaylistButtonStyle = () => {
      if (playlistPanelOpen) {
        playlistButton.style.background = 'rgba(var(--accent-primary-rgb), 0.15)';
        playlistButton.style.borderColor = 'var(--accent-primary)';
        playlistButton.style.color = 'var(--accent-primary)';
      } else {
        playlistButton.style.background = 'transparent';
        playlistButton.style.borderColor = 'transparent';
        playlistButton.style.color = 'var(--text-secondary)';
      }
    };
    this.registryUnsubscribers.push(this.playlistPanel.on('closed', () => {
      playlistPanelOpen = false;
      updatePlaylistButtonStyle();
    }));

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

    // Sync histogram clipping overlay toggle with Viewer
    this.registryUnsubscribers.push(this.histogram.on('clippingOverlayToggled', (enabled) => {
      if (enabled) {
        viewer.getClippingOverlay().enable();
      } else {
        viewer.getClippingOverlay().disable();
      }
    }));

    contextToolbar.setTabContent('view', viewContent);

    // Initially hide per-eye controls (shown when stereo mode is activated)
    this.updateStereoEyeControlsVisibility();

    // === COLOR TAB ===
    const colorContent = document.createElement('div');
    colorContent.style.cssText = 'display: flex; align-items: center; gap: 6px;';
    colorContent.appendChild(this.ocioControl.render());
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
      if (visible) {
        curvesButton.style.background = 'rgba(var(--accent-primary-rgb), 0.15)';
        curvesButton.style.borderColor = 'var(--accent-primary)';
      } else {
        curvesButton.style.background = '';
        curvesButton.style.borderColor = '';
      }
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
      if (visible) {
        colorWheelsButton.style.background = 'rgba(var(--accent-primary-rgb), 0.15)';
        colorWheelsButton.style.borderColor = 'var(--accent-primary)';
      } else {
        colorWheelsButton.style.background = '';
        colorWheelsButton.style.borderColor = '';
      }
    }));

    contextToolbar.setTabContent('color', colorContent);

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
      if (visible) {
        historyButton.style.background = 'rgba(var(--accent-primary-rgb), 0.15)';
        historyButton.style.borderColor = 'var(--accent-primary)';
      } else {
        historyButton.style.background = '';
        historyButton.style.borderColor = '';
      }
    }));

    // Markers panel toggle button
    const markersButton = ContextToolbar.createButton('Markers', () => {
      this.markerListPanel.toggle();
    }, { title: 'Toggle markers list panel (Shift+Alt+M)', icon: 'marker' });
    markersButton.dataset.testid = 'markers-toggle-button';
    annotateContent.appendChild(markersButton);

    // Update button state when visibility changes
    this.registryUnsubscribers.push(this.markerListPanel.on('visibilityChanged', (visible) => {
      if (visible) {
        markersButton.style.background = 'rgba(var(--accent-primary-rgb), 0.15)';
        markersButton.style.borderColor = 'var(--accent-primary)';
      } else {
        markersButton.style.background = '';
        markersButton.style.borderColor = '';
      }
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
    this.textFormattingToolbar.dispose();
    this.autoSaveIndicator.dispose();
    this.snapshotPanel.dispose();
    this.snapshotManager.dispose();
    this.playlistPanel.dispose();
    this.playlistManager.dispose();
    this.presentationMode.dispose();
    this.networkSyncManager.dispose();
    this.networkControl.dispose();
    // Dispose auto-save manager (fire and forget - we can't await in dispose)
    this.autoSaveManager.dispose().catch(err => {
      console.error('Error disposing auto-save manager:', err);
    });
  }
}
