import { Session } from './core/session/Session';
import { Viewer } from './ui/components/Viewer';
import { Timeline } from './ui/components/Timeline';
import { Toolbar } from './ui/components/Toolbar';
import { PaintEngine } from './paint/PaintEngine';
import { PaintToolbar } from './ui/components/PaintToolbar';
import { ColorControls } from './ui/components/ColorControls';
import { WipeControl } from './ui/components/WipeControl';
import { VolumeControl } from './ui/components/VolumeControl';
import { ExportControl } from './ui/components/ExportControl';
import { TransformControl } from './ui/components/TransformControl';
import { FilterControl } from './ui/components/FilterControl';
import { CropControl } from './ui/components/CropControl';
import { CDLControl } from './ui/components/CDLControl';
import { LensControl } from './ui/components/LensControl';
import { exportSequence } from './utils/SequenceExporter';

export class App {
  private container: HTMLElement | null = null;
  private session: Session;
  private viewer: Viewer;
  private timeline: Timeline;
  private toolbar: Toolbar;
  private paintEngine: PaintEngine;
  private paintToolbar: PaintToolbar;
  private colorControls: ColorControls;
  private wipeControl: WipeControl;
  private volumeControl: VolumeControl;
  private exportControl: ExportControl;
  private transformControl: TransformControl;
  private filterControl: FilterControl;
  private cropControl: CropControl;
  private cdlControl: CDLControl;
  private lensControl: LensControl;
  private animationId: number | null = null;

  constructor() {
    this.session = new Session();
    this.paintEngine = new PaintEngine();
    this.viewer = new Viewer(this.session, this.paintEngine);
    this.timeline = new Timeline(this.session, this.paintEngine);
    this.toolbar = new Toolbar(this.session, {
      fitToWindow: () => this.viewer.fitToWindow(),
      setZoom: (level: number) => this.viewer.setZoom(level),
    });
    this.paintToolbar = new PaintToolbar(this.paintEngine);
    this.colorControls = new ColorControls();
    this.wipeControl = new WipeControl();

    // Connect color controls to viewer
    this.colorControls.on('adjustmentsChanged', (adjustments) => {
      this.viewer.setColorAdjustments(adjustments);
    });

    // Connect LUT events
    this.colorControls.on('lutLoaded', (lut) => {
      this.viewer.setLUT(lut);
    });
    this.colorControls.on('lutIntensityChanged', (intensity) => {
      this.viewer.setLUTIntensity(intensity);
    });

    // Connect wipe control to viewer
    this.wipeControl.on('stateChanged', (state) => {
      this.viewer.setWipeState(state);
    });

    // Initialize volume control and connect to session
    this.volumeControl = new VolumeControl();
    this.volumeControl.on('volumeChanged', (volume) => {
      this.session.volume = volume;
    });
    this.volumeControl.on('mutedChanged', (muted) => {
      this.session.muted = muted;
    });

    // Initialize export control
    this.exportControl = new ExportControl();
    this.exportControl.on('exportRequested', ({ format, includeAnnotations, quality }) => {
      this.viewer.exportFrame(format, includeAnnotations, quality);
    });
    this.exportControl.on('copyRequested', () => {
      this.viewer.copyFrameToClipboard(true);
    });
    this.exportControl.on('sequenceExportRequested', (request) => {
      this.handleSequenceExport(request);
    });

    // Initialize transform control
    this.transformControl = new TransformControl();
    this.transformControl.on('transformChanged', (transform) => {
      this.viewer.setTransform(transform);
    });

    // Initialize filter control
    this.filterControl = new FilterControl();
    this.filterControl.on('filtersChanged', (settings) => {
      this.viewer.setFilterSettings(settings);
    });

    // Initialize crop control
    this.cropControl = new CropControl();
    this.cropControl.on('cropStateChanged', (state) => {
      this.viewer.setCropState(state);
    });
    this.cropControl.on('cropModeToggled', (enabled) => {
      this.viewer.setCropEnabled(enabled);
    });

    // Initialize CDL control
    this.cdlControl = new CDLControl();
    this.cdlControl.on('cdlChanged', (cdl) => {
      this.viewer.setCDL(cdl);
    });

    // Initialize lens distortion control
    this.lensControl = new LensControl();
    this.lensControl.on('lensChanged', (params) => {
      this.viewer.setLensParams(params);
    });
  }

  mount(selector: string): void {
    this.container = document.querySelector(selector);
    if (!this.container) {
      throw new Error(`Container not found: ${selector}`);
    }

    this.createLayout();
    this.bindEvents();
    this.start();
  }

  private createLayout(): void {
    if (!this.container) return;

    // Create toolbar row with main toolbar and paint toolbar
    const toolbarRow = document.createElement('div');
    toolbarRow.style.cssText = `
      display: flex;
      background: linear-gradient(180deg, #333 0%, #2a2a2a 100%);
      border-bottom: 1px solid #444;
      flex-shrink: 0;
    `;

    const toolbarEl = this.toolbar.render();
    toolbarEl.style.borderBottom = 'none';
    const paintToolbarEl = this.paintToolbar.render();
    const colorControlsEl = this.colorControls.render();
    const cdlControlEl = this.cdlControl.render();
    const filterControlEl = this.filterControl.render();
    const cropControlEl = this.cropControl.render();
    const lensControlEl = this.lensControl.render();
    const wipeControlEl = this.wipeControl.render();
    const transformControlEl = this.transformControl.render();
    const volumeControlEl = this.volumeControl.render();
    const exportControlEl = this.exportControl.render();

    toolbarRow.appendChild(toolbarEl);
    toolbarRow.appendChild(paintToolbarEl);
    toolbarRow.appendChild(colorControlsEl);
    toolbarRow.appendChild(cdlControlEl);
    toolbarRow.appendChild(filterControlEl);
    toolbarRow.appendChild(cropControlEl);
    toolbarRow.appendChild(lensControlEl);
    toolbarRow.appendChild(wipeControlEl);
    toolbarRow.appendChild(transformControlEl);
    toolbarRow.appendChild(volumeControlEl);
    toolbarRow.appendChild(exportControlEl);

    const viewerEl = this.viewer.getElement();
    const timelineEl = this.timeline.render();

    this.container.appendChild(toolbarRow);
    this.container.appendChild(viewerEl);
    this.container.appendChild(timelineEl);

    // Handle clear frame event from paint toolbar
    paintToolbarEl.addEventListener('clearFrame', () => {
      this.paintEngine.clearFrame(this.session.currentFrame);
    });
  }

  private bindEvents(): void {
    // Handle window resize
    window.addEventListener('resize', () => {
      this.viewer.resize();
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      this.handleKeydown(e);
    });

    // Load annotations from GTO files
    this.session.on('annotationsLoaded', ({ annotations, effects }) => {
      this.paintEngine.loadFromAnnotations(annotations, effects);
    });
  }

  private handleKeydown(e: KeyboardEvent): void {
    // Ignore if typing in an input
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
      return;
    }

    // Try paint toolbar shortcuts first
    if (this.paintToolbar.handleKeyboard(e.key)) {
      e.preventDefault();
      return;
    }

    // Handle Ctrl+Z/Y for undo/redo, Ctrl+S for export, Ctrl+C for copy
    if (e.ctrlKey || e.metaKey) {
      if (e.key === 'z') {
        e.preventDefault();
        this.paintEngine.undo();
        return;
      } else if (e.key === 'y') {
        e.preventDefault();
        this.paintEngine.redo();
        return;
      } else if (e.key === 's') {
        e.preventDefault();
        this.exportControl.quickExport('png');
        return;
      } else if (e.key === 'c') {
        e.preventDefault();
        this.viewer.copyFrameToClipboard(true);
        return;
      }
    }

    // Handle transform shortcuts (Shift/Alt + key)
    if (e.shiftKey || e.altKey) {
      const key = e.key.toLowerCase();
      if (key === 'r') {
        e.preventDefault();
        if (e.shiftKey) {
          this.transformControl.rotateLeft();
        } else {
          this.transformControl.rotateRight();
        }
        return;
      } else if (key === 'h' && e.shiftKey) {
        e.preventDefault();
        this.transformControl.toggleFlipH();
        return;
      } else if (key === 'v' && e.shiftKey) {
        e.preventDefault();
        this.transformControl.toggleFlipV();
        return;
      }
    }

    switch (e.key) {
      case ' ':
        e.preventDefault();
        this.session.togglePlayback();
        break;
      case 'ArrowLeft':
        e.preventDefault();
        this.session.stepBackward();
        break;
      case 'ArrowRight':
        e.preventDefault();
        this.session.stepForward();
        break;
      case 'ArrowUp':
        e.preventDefault();
        this.session.togglePlayDirection();
        break;
      case 'Home':
        e.preventDefault();
        this.session.goToStart();
        break;
      case 'End':
        e.preventDefault();
        this.session.goToEnd();
        break;
      case 'f':
      case 'F':
        this.viewer.fitToWindow();
        break;
      case '1':
        this.viewer.setZoom(1);
        break;
      case '2':
        this.viewer.setZoom(2);
        break;
      case '4':
        this.viewer.setZoom(4);
        break;
      case '0':
        this.viewer.setZoom(0.5);
        break;
      case '[':
        this.session.setInPoint();
        break;
      case ']':
        this.session.setOutPoint();
        break;
      case 'i':
      case 'I':
        this.session.setInPoint();
        break;
      case 'o':
      case 'O':
        this.session.setOutPoint();
        break;
      case 'm':
      case 'M':
        this.session.toggleMark();
        break;
      case 'l':
      case 'L':
        // Cycle loop mode
        const modes: Array<'once' | 'loop' | 'pingpong'> = ['once', 'loop', 'pingpong'];
        const currentIndex = modes.indexOf(this.session.loopMode);
        this.session.loopMode = modes[(currentIndex + 1) % modes.length]!;
        break;
      case 'r':
      case 'R':
        // Reset in/out points to full duration
        this.session.resetInOutPoints();
        break;
      case 'c':
      case 'C':
        // Toggle color controls panel
        this.colorControls.toggle();
        break;
      case 'w':
      case 'W':
        // Cycle wipe mode
        this.wipeControl.cycleMode();
        break;
      case 'g':
      case 'G':
        // Toggle filter effects panel
        this.filterControl.toggle();
        break;
      case 'k':
      case 'K':
        // Toggle crop mode
        this.cropControl.toggle();
        break;
      case 'Escape':
        // Reset color adjustments when Escape pressed while color panel is open
        if (this.colorControls) {
          this.colorControls.hide();
        }
        break;
      case '<':
      case ',':
        // Go to previous annotated frame
        e.preventDefault();
        this.goToPreviousAnnotation();
        break;
      case '>':
      case '.':
        // Go to next annotated frame
        e.preventDefault();
        this.goToNextAnnotation();
        break;
    }
  }

  private goToNextAnnotation(): void {
    const annotatedFrames = this.paintEngine.getAnnotatedFrames();
    if (annotatedFrames.size === 0) return;

    const currentFrame = this.session.currentFrame;
    const sortedFrames = Array.from(annotatedFrames).sort((a, b) => a - b);

    // Find next frame after current
    for (const frame of sortedFrames) {
      if (frame > currentFrame) {
        this.session.goToFrame(frame);
        return;
      }
    }

    // Wrap to first annotated frame
    if (sortedFrames[0] !== undefined) {
      this.session.goToFrame(sortedFrames[0]);
    }
  }

  private goToPreviousAnnotation(): void {
    const annotatedFrames = this.paintEngine.getAnnotatedFrames();
    if (annotatedFrames.size === 0) return;

    const currentFrame = this.session.currentFrame;
    const sortedFrames = Array.from(annotatedFrames).sort((a, b) => b - a); // Descending

    // Find previous frame before current
    for (const frame of sortedFrames) {
      if (frame < currentFrame) {
        this.session.goToFrame(frame);
        return;
      }
    }

    // Wrap to last annotated frame
    if (sortedFrames[0] !== undefined) {
      this.session.goToFrame(sortedFrames[0]);
    }
  }

  private start(): void {
    this.tick();
  }

  private tick = (): void => {
    this.session.update();

    // Only render on every frame during video playback
    // Static images and drawing are handled by event-driven updates
    const source = this.session.currentSource;
    if (source?.type === 'video' && this.session.isPlaying) {
      this.viewer.refresh();
    }

    this.animationId = requestAnimationFrame(this.tick);
  };

  private async handleSequenceExport(request: {
    format: 'png' | 'jpeg' | 'webp';
    includeAnnotations: boolean;
    quality: number;
    useInOutRange: boolean;
  }): Promise<void> {
    const source = this.session.currentSource;
    if (!source) {
      alert('No media loaded to export');
      return;
    }

    // Determine frame range
    let startFrame: number;
    let endFrame: number;

    if (request.useInOutRange) {
      startFrame = this.session.inPoint;
      endFrame = this.session.outPoint;
    } else {
      startFrame = 0;
      endFrame = this.session.frameCount - 1;
    }

    const totalFrames = endFrame - startFrame + 1;
    if (totalFrames <= 0) {
      alert('Invalid frame range');
      return;
    }

    // Generate filename pattern based on source
    const sourceName = source.name?.replace(/\.[^/.]+$/, '') || 'frame';
    const padLength = String(endFrame).length < 4 ? 4 : String(endFrame).length;

    // Create progress dialog
    const progressDialog = document.createElement('div');
    progressDialog.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: #2a2a2a;
      border: 1px solid #444;
      border-radius: 8px;
      padding: 24px;
      z-index: 10000;
      min-width: 300px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.5);
    `;

    const progressText = document.createElement('div');
    progressText.style.cssText = 'color: #ddd; margin-bottom: 12px; font-size: 14px;';
    progressText.textContent = `Exporting frames 0/${totalFrames}...`;

    const progressBar = document.createElement('div');
    progressBar.style.cssText = `
      height: 8px;
      background: #444;
      border-radius: 4px;
      overflow: hidden;
      margin-bottom: 16px;
    `;

    const progressFill = document.createElement('div');
    progressFill.style.cssText = `
      height: 100%;
      background: #4a9eff;
      width: 0%;
      transition: width 0.1s ease;
    `;
    progressBar.appendChild(progressFill);

    const cancelButton = document.createElement('button');
    cancelButton.textContent = 'Cancel';
    cancelButton.style.cssText = `
      background: #555;
      border: 1px solid #666;
      color: #ddd;
      padding: 8px 16px;
      border-radius: 4px;
      cursor: pointer;
      width: 100%;
    `;

    const cancellationToken = { cancelled: false };
    cancelButton.addEventListener('click', () => {
      cancellationToken.cancelled = true;
      cancelButton.textContent = 'Cancelling...';
      cancelButton.disabled = true;
    });

    progressDialog.appendChild(progressText);
    progressDialog.appendChild(progressBar);
    progressDialog.appendChild(cancelButton);
    document.body.appendChild(progressDialog);

    // Store current frame to restore later
    const originalFrame = this.session.currentFrame;

    try {
      const result = await exportSequence(
        {
          format: request.format,
          quality: request.quality,
          startFrame,
          endFrame,
          includeAnnotations: request.includeAnnotations,
          filenamePattern: `${sourceName}_####`,
          padLength,
        },
        async (frame: number) => {
          // Navigate to frame and render
          this.session.goToFrame(frame);
          // Small delay to allow frame to load
          await new Promise(resolve => setTimeout(resolve, 50));
          const canvas = await this.viewer.renderFrameToCanvas(frame, request.includeAnnotations);
          if (!canvas) {
            throw new Error(`Failed to render frame ${frame}`);
          }
          return canvas;
        },
        (progress) => {
          progressText.textContent = `Exporting frames ${progress.currentFrame - startFrame + 1}/${totalFrames}...`;
          progressFill.style.width = `${progress.percent}%`;
        },
        cancellationToken
      );

      // Restore original frame
      this.session.goToFrame(originalFrame);

      // Remove progress dialog
      document.body.removeChild(progressDialog);

      // Show result
      if (result.success) {
        alert(`Successfully exported ${result.exportedFrames} frames`);
      } else if (result.error?.includes('cancelled')) {
        alert('Export cancelled');
      } else {
        alert(`Export failed: ${result.error}`);
      }
    } catch (err) {
      // Restore original frame
      this.session.goToFrame(originalFrame);

      // Remove progress dialog
      if (document.body.contains(progressDialog)) {
        document.body.removeChild(progressDialog);
      }

      alert(`Export error: ${err}`);
    }
  }

  dispose(): void {
    if (this.animationId !== null) {
      cancelAnimationFrame(this.animationId);
    }
    this.viewer.dispose();
    this.timeline.dispose();
    this.toolbar.dispose();
    this.paintToolbar.dispose();
    this.colorControls.dispose();
    this.wipeControl.dispose();
    this.transformControl.dispose();
    this.filterControl.dispose();
    this.cropControl.dispose();
    this.cdlControl.dispose();
    this.lensControl.dispose();
    this.volumeControl.dispose();
    this.exportControl.dispose();
  }
}
