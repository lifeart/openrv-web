/**
 * HeaderBar - Top bar with file operations, playback controls, and utilities
 *
 * Layout: [File Ops] | [Playback Controls] | [Volume] [Help]
 * Height: 40px
 */

import { EventEmitter, EventMap } from '../../../utils/EventEmitter';
import { Session, LoopMode } from '../../../core/session/Session';
import { filterImageFiles } from '../../../utils/SequenceLoader';
import { VolumeControl } from '../VolumeControl';
import { ExportControl } from '../ExportControl';
import { showAlert } from '../shared/Modal';

export interface HeaderBarEvents extends EventMap {
  showShortcuts: void;
  fileLoaded: void;
}

export class HeaderBar extends EventEmitter<HeaderBarEvents> {
  private container: HTMLElement;
  private session: Session;
  private volumeControl: VolumeControl;
  private exportControl: ExportControl;

  private playButton!: HTMLButtonElement;
  private loopButton!: HTMLButtonElement;
  private directionButton!: HTMLButtonElement;
  private fileInput!: HTMLInputElement;

  constructor(session: Session) {
    super();
    this.session = session;
    this.volumeControl = new VolumeControl();
    this.exportControl = new ExportControl();

    // Create container
    this.container = document.createElement('div');
    this.container.className = 'header-bar';
    this.container.style.cssText = `
      height: 40px;
      background: linear-gradient(180deg, #2a2a2a 0%, #222 100%);
      border-bottom: 1px solid #333;
      display: flex;
      align-items: center;
      padding: 0 12px;
      gap: 0;
      flex-shrink: 0;
      user-select: none;
    `;

    this.createControls();
    this.bindEvents();
  }

  private createControls(): void {
    // === FILE OPERATIONS GROUP ===
    const fileGroup = this.createGroup();

    // Hidden file input
    this.fileInput = document.createElement('input');
    this.fileInput.type = 'file';
    this.fileInput.accept = 'image/*,video/*,.rv,.gto';
    this.fileInput.multiple = true;
    this.fileInput.style.display = 'none';
    this.fileInput.addEventListener('change', (e) => this.handleFileSelect(e));
    this.container.appendChild(this.fileInput);

    // Open button
    fileGroup.appendChild(this.createIconButton('folder', 'Open', () => this.fileInput.click(), 'Open file'));

    // Export dropdown
    fileGroup.appendChild(this.exportControl.render());

    this.container.appendChild(fileGroup);
    this.addDivider();

    // === PLAYBACK CONTROLS GROUP ===
    const playbackGroup = this.createGroup();

    playbackGroup.appendChild(this.createIconButton('skip-back', '', () => this.session.goToStart(), 'Go to start (Home)'));
    playbackGroup.appendChild(this.createIconButton('step-back', '', () => this.session.stepBackward(), 'Step back (\u2190)'));

    this.playButton = this.createIconButton('play', '', () => this.session.togglePlayback(), 'Play/Pause (Space)');
    this.playButton.style.width = '36px';
    playbackGroup.appendChild(this.playButton);

    playbackGroup.appendChild(this.createIconButton('step-forward', '', () => this.session.stepForward(), 'Step forward (\u2192)'));
    playbackGroup.appendChild(this.createIconButton('skip-forward', '', () => this.session.goToEnd(), 'Go to end (End)'));

    // Loop mode button
    this.loopButton = this.createCompactButton('\uD83D\uDD01', () => this.cycleLoopMode(), 'Cycle loop mode (L)');
    this.loopButton.style.minWidth = '60px';
    this.loopButton.style.marginLeft = '8px';
    playbackGroup.appendChild(this.loopButton);

    // Direction button
    this.directionButton = this.createCompactButton('\u2192', () => this.toggleDirection(), 'Toggle direction (\u2191)');
    this.directionButton.style.minWidth = '28px';
    playbackGroup.appendChild(this.directionButton);

    this.container.appendChild(playbackGroup);

    // === SPACER ===
    const spacer = document.createElement('div');
    spacer.style.flex = '1';
    this.container.appendChild(spacer);

    // === UTILITY GROUP ===
    const utilityGroup = this.createGroup();

    // Volume control
    utilityGroup.appendChild(this.volumeControl.render());

    // Help button
    const helpButton = this.createIconButton('help', '', () => this.emit('showShortcuts', undefined), 'Keyboard shortcuts');
    helpButton.style.marginLeft = '8px';
    utilityGroup.appendChild(helpButton);

    this.container.appendChild(utilityGroup);
  }

  private createGroup(): HTMLElement {
    const group = document.createElement('div');
    group.style.cssText = `
      display: flex;
      align-items: center;
      gap: 2px;
    `;
    return group;
  }

  private addDivider(): void {
    const divider = document.createElement('div');
    divider.style.cssText = `
      width: 1px;
      height: 24px;
      background: #444;
      margin: 0 12px;
    `;
    this.container.appendChild(divider);
  }

  private createIconButton(icon: string, label: string, onClick: () => void, title?: string): HTMLButtonElement {
    const button = document.createElement('button');
    button.title = title || label;
    button.style.cssText = `
      background: transparent;
      border: 1px solid transparent;
      color: #bbb;
      padding: 6px 12px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
      transition: all 0.12s ease;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 4px;
      height: 28px;
      min-width: 28px;
    `;

    // SVG icons for cleaner look
    const iconSvg = this.getIcon(icon);
    if (iconSvg) {
      button.innerHTML = iconSvg;
      if (label) {
        const span = document.createElement('span');
        span.textContent = label;
        span.style.marginLeft = '4px';
        button.appendChild(span);
      }
    } else {
      button.textContent = label;
    }

    button.addEventListener('mouseenter', () => {
      button.style.background = 'rgba(255,255,255,0.08)';
      button.style.borderColor = 'rgba(255,255,255,0.1)';
      button.style.color = '#fff';
    });

    button.addEventListener('mouseleave', () => {
      button.style.background = 'transparent';
      button.style.borderColor = 'transparent';
      button.style.color = '#bbb';
    });

    button.addEventListener('mousedown', () => {
      button.style.background = 'rgba(255,255,255,0.15)';
    });

    button.addEventListener('mouseup', () => {
      button.style.background = 'rgba(255,255,255,0.08)';
    });

    button.addEventListener('click', onClick);
    return button;
  }

  private createCompactButton(text: string, onClick: () => void, title?: string): HTMLButtonElement {
    const button = document.createElement('button');
    button.textContent = text;
    button.title = title || '';
    button.style.cssText = `
      background: transparent;
      border: 1px solid transparent;
      color: #bbb;
      padding: 6px 12px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
      transition: all 0.12s ease;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      height: 28px;
    `;

    button.addEventListener('mouseenter', () => {
      button.style.background = 'rgba(255,255,255,0.08)';
      button.style.borderColor = 'rgba(255,255,255,0.1)';
      button.style.color = '#fff';
    });

    button.addEventListener('mouseleave', () => {
      button.style.background = 'transparent';
      button.style.borderColor = 'transparent';
      button.style.color = '#bbb';
    });

    button.addEventListener('click', onClick);
    return button;
  }

  private getIcon(name: string): string {
    const icons: Record<string, string> = {
      'folder': '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>',
      'skip-back': '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="19,20 9,12 19,4"/><line x1="5" y1="4" x2="5" y2="20" stroke="currentColor" stroke-width="2"/></svg>',
      'step-back': '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="19,20 9,12 19,4"/></svg>',
      'play': '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg>',
      'pause': '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>',
      'step-forward': '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,4 15,12 5,20"/></svg>',
      'skip-forward': '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,4 15,12 5,20"/><line x1="19" y1="4" x2="19" y2="20" stroke="currentColor" stroke-width="2"/></svg>',
      'help': '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
    };
    return icons[name] || '';
  }

  private cycleLoopMode(): void {
    const modes: LoopMode[] = ['once', 'loop', 'pingpong'];
    const currentIndex = modes.indexOf(this.session.loopMode);
    this.session.loopMode = modes[(currentIndex + 1) % modes.length]!;
  }

  private toggleDirection(): void {
    this.session.togglePlayDirection();
  }

  private updateLoopButton(): void {
    const labels: Record<LoopMode, string> = {
      once: '\u27A1 Once',
      loop: '\uD83D\uDD01 Loop',
      pingpong: '\uD83D\uDD00 Ping',
    };
    this.loopButton.textContent = labels[this.session.loopMode];
  }

  private updateDirectionButton(): void {
    const isForward = this.session.playDirection === 1;
    this.directionButton.textContent = isForward ? '\u2192' : '\u2190';
    this.directionButton.title = isForward
      ? 'Playing forward (\u2191 to reverse)'
      : 'Playing backward (\u2191 to reverse)';
  }

  private updatePlayButton(): void {
    const icon = this.session.isPlaying ? 'pause' : 'play';
    this.playButton.innerHTML = this.getIcon(icon);
  }

  private async handleFileSelect(e: Event): Promise<void> {
    const input = e.target as HTMLInputElement;
    const files = input.files;
    if (!files || files.length === 0) return;

    const fileArray = Array.from(files);

    // Check if multiple image files were selected - treat as sequence
    const imageFiles = filterImageFiles(fileArray);
    if (imageFiles.length > 1) {
      try {
        await this.session.loadSequence(imageFiles);
        this.emit('fileLoaded', undefined);
        input.value = '';
        return;
      } catch (err) {
        console.error('Failed to load sequence:', err);
        showAlert(`Failed to load sequence: ${err}`, { type: 'error', title: 'Load Error' });
        input.value = '';
        return;
      }
    }

    // Single file or mixed files - load individually
    for (const file of fileArray) {
      try {
        if (file.name.endsWith('.rv') || file.name.endsWith('.gto')) {
          const content = await file.arrayBuffer();
          await this.session.loadFromGTO(content);
        } else {
          await this.session.loadFile(file);
        }
        this.emit('fileLoaded', undefined);
      } catch (err) {
        console.error('Failed to load file:', err);
        showAlert(`Failed to load ${file.name}: ${err}`, { type: 'error', title: 'Load Error' });
      }
    }

    // Reset input so same file can be selected again
    input.value = '';
  }

  private bindEvents(): void {
    this.session.on('playbackChanged', () => this.updatePlayButton());
    this.session.on('loopModeChanged', () => this.updateLoopButton());
    this.session.on('playDirectionChanged', () => this.updateDirectionButton());
  }

  // Public accessors for child controls
  getVolumeControl(): VolumeControl {
    return this.volumeControl;
  }

  getExportControl(): ExportControl {
    return this.exportControl;
  }

  render(): HTMLElement {
    this.updateLoopButton();
    this.updatePlayButton();
    this.updateDirectionButton();
    return this.container;
  }

  dispose(): void {
    this.volumeControl.dispose();
    this.exportControl.dispose();
  }
}
