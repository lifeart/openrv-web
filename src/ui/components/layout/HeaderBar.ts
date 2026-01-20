/**
 * HeaderBar - Top bar with file operations, playback controls, and utilities
 *
 * Layout: [File Ops] | [Playback Controls] | [Timecode Display] | [Volume] [Help]
 * Height: 40px
 */

import { EventEmitter, EventMap } from '../../../utils/EventEmitter';
import { Session, LoopMode, PLAYBACK_SPEED_PRESETS } from '../../../core/session/Session';
import { filterImageFiles } from '../../../utils/SequenceLoader';
import { VolumeControl } from '../VolumeControl';
import { ExportControl } from '../ExportControl';
import { TimecodeDisplay } from '../TimecodeDisplay';
import { ThemeControl } from '../ThemeControl';
import { showAlert } from '../shared/Modal';
import { getIconSvg, IconName } from '../shared/Icons';

export interface HeaderBarEvents extends EventMap {
  showShortcuts: void;
  showCustomKeyBindings: void;
  fileLoaded: void;
  saveProject: void;
  openProject: File;
}

export class HeaderBar extends EventEmitter<HeaderBarEvents> {
  private container: HTMLElement;
  private session: Session;
  private volumeControl: VolumeControl;
  private exportControl: ExportControl;
  private timecodeDisplay: TimecodeDisplay;
  private themeControl: ThemeControl;

  private playButton!: HTMLButtonElement;
  private loopButton!: HTMLButtonElement;
  private directionButton!: HTMLButtonElement;
  private speedButton!: HTMLButtonElement;
  private fileInput!: HTMLInputElement;
  private projectInput!: HTMLInputElement;

  constructor(session: Session) {
    super();
    this.session = session;
    this.volumeControl = new VolumeControl();
    this.exportControl = new ExportControl();
    this.timecodeDisplay = new TimecodeDisplay(session);
    this.themeControl = new ThemeControl();

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

    // Hidden file input for media
    this.fileInput = document.createElement('input');
    this.fileInput.type = 'file';
    this.fileInput.accept = 'image/*,video/*,.rv,.gto';
    this.fileInput.multiple = true;
    this.fileInput.style.display = 'none';
    this.fileInput.addEventListener('change', (e) => this.handleFileSelect(e));
    this.container.appendChild(this.fileInput);

    // Hidden file input for project files
    this.projectInput = document.createElement('input');
    this.projectInput.type = 'file';
    this.projectInput.accept = '.orvproject';
    this.projectInput.style.display = 'none';
    this.projectInput.addEventListener('change', (e) => this.handleProjectOpen(e));
    this.container.appendChild(this.projectInput);

    // Open button (media)
    fileGroup.appendChild(this.createIconButton('folder', 'Open', () => this.fileInput.click(), 'Open media file'));

    // Save Project button
    fileGroup.appendChild(this.createIconButton('save', 'Save', () => this.emit('saveProject', undefined), 'Save project (Ctrl+Shift+S)'));

    // Open Project button
    fileGroup.appendChild(this.createIconButton('folder-open', 'Project', () => this.projectInput.click(), 'Open project'));

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
    this.loopButton = this.createCompactButton('', () => this.cycleLoopMode(), 'Cycle loop mode (L)');
    this.loopButton.style.minWidth = '70px';
    this.loopButton.style.marginLeft = '8px';
    playbackGroup.appendChild(this.loopButton);

    // Direction button
    this.directionButton = this.createCompactButton('', () => this.toggleDirection(), 'Toggle direction (Up)');
    this.directionButton.style.minWidth = '28px';
    playbackGroup.appendChild(this.directionButton);

    // Speed button
    this.speedButton = this.createSpeedButton();
    playbackGroup.appendChild(this.speedButton);

    this.container.appendChild(playbackGroup);
    this.addDivider();

    // === TIMECODE DISPLAY ===
    this.container.appendChild(this.timecodeDisplay.render());

    // === SPACER ===
    const spacer = document.createElement('div');
    spacer.style.flex = '1';
    this.container.appendChild(spacer);

    // === UTILITY GROUP ===
    const utilityGroup = this.createGroup();

    // Volume control
    utilityGroup.appendChild(this.volumeControl.render());

    // Theme control
    const themeElement = this.themeControl.render();
    themeElement.style.marginLeft = '8px';
    utilityGroup.appendChild(themeElement);

    // Help button
    const helpButton = this.createIconButton('help', '', () => this.emit('showShortcuts', undefined), 'Keyboard shortcuts');
    helpButton.style.marginLeft = '8px';
    utilityGroup.appendChild(helpButton);

    // Custom key binding button
    const keyBindingButton = this.createIconButton('keyboard', '', () => this.emit('showCustomKeyBindings', undefined), 'Custom key bindings');
    keyBindingButton.style.marginLeft = '4px';
    utilityGroup.appendChild(keyBindingButton);

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
      'folder-open': '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 19a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2v1M3 13h18l-2 7H5l-2-7z"/></svg>',
      'save': '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>',
      'skip-back': '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="19,20 9,12 19,4"/><line x1="5" y1="4" x2="5" y2="20" stroke="currentColor" stroke-width="2"/></svg>',
      'step-back': '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="19,20 9,12 19,4"/></svg>',
      'play': '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg>',
      'pause': '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>',
      'step-forward': '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,4 15,12 5,20"/></svg>',
      'skip-forward': '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,4 15,12 5,20"/><line x1="19" y1="4" x2="19" y2="20" stroke="currentColor" stroke-width="2"/></svg>',
      'help': '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
      'keyboard': '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="4" width="20" height="16" rx="2" ry="2"/><path d="m6 8h.01"/><path d="m10 8h.01"/><path d="m14 8h.01"/><path d="m18 8h.01"/><path d="m8 12h.01"/><path d="m12 12h.01"/><path d="m16 12h.01"/><path d="m7 16h10"/></svg>',
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

  private createSpeedButton(): HTMLButtonElement {
    const button = document.createElement('button');
    button.dataset.testid = 'playback-speed-button';
    button.title = 'Playback speed (J/K/L keys)';
    button.style.cssText = `
      background: transparent;
      border: 1px solid transparent;
      color: #bbb;
      padding: 6px 8px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 11px;
      font-family: monospace;
      transition: all 0.12s ease;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      height: 28px;
      min-width: 42px;
      margin-left: 4px;
    `;

    button.addEventListener('mouseenter', () => {
      button.style.background = 'rgba(255,255,255,0.08)';
      button.style.borderColor = 'rgba(255,255,255,0.1)';
      button.style.color = '#fff';
    });

    button.addEventListener('mouseleave', () => {
      const speed = this.session.playbackSpeed;
      if (speed !== 1) {
        button.style.background = 'rgba(74, 158, 255, 0.15)';
        button.style.borderColor = '#4a9eff';
        button.style.color = '#4a9eff';
      } else {
        button.style.background = 'transparent';
        button.style.borderColor = 'transparent';
        button.style.color = '#bbb';
      }
    });

    button.addEventListener('click', () => this.cycleSpeed());

    // Initial state
    this.updateSpeedButtonText(button);
    return button;
  }

  private cycleSpeed(): void {
    const currentSpeed = this.session.playbackSpeed;
    const currentIndex = PLAYBACK_SPEED_PRESETS.indexOf(currentSpeed as typeof PLAYBACK_SPEED_PRESETS[number]);
    if (currentIndex >= 0 && currentIndex < PLAYBACK_SPEED_PRESETS.length - 1) {
      const nextSpeed = PLAYBACK_SPEED_PRESETS[currentIndex + 1];
      if (nextSpeed !== undefined) {
        this.session.playbackSpeed = nextSpeed;
        return;
      }
    }
    // Reset to 1x when at max or not a preset
    this.session.playbackSpeed = 1;
  }

  private updateSpeedButton(): void {
    this.updateSpeedButtonText(this.speedButton);
  }

  private updateSpeedButtonText(button: HTMLButtonElement): void {
    const speed = this.session.playbackSpeed;
    button.textContent = `${speed}x`;

    // Highlight when not at 1x
    if (speed !== 1) {
      button.style.background = 'rgba(74, 158, 255, 0.15)';
      button.style.borderColor = '#4a9eff';
      button.style.color = '#4a9eff';
    } else {
      button.style.background = 'transparent';
      button.style.borderColor = 'transparent';
      button.style.color = '#bbb';
    }
  }

  private updateLoopButton(): void {
    const icons: Record<LoopMode, IconName> = {
      once: 'repeat-once',
      loop: 'repeat',
      pingpong: 'shuffle',
    };
    const labels: Record<LoopMode, string> = {
      once: 'Once',
      loop: 'Loop',
      pingpong: 'Ping',
    };
    const iconName = icons[this.session.loopMode];
    const label = labels[this.session.loopMode];
    this.loopButton.innerHTML = `${getIconSvg(iconName, 'sm')}<span style="margin-left:4px">${label}</span>`;
  }

  private updateDirectionButton(): void {
    const isForward = this.session.playDirection === 1;
    this.directionButton.innerHTML = getIconSvg(isForward ? 'arrow-right' : 'arrow-left', 'sm');
    this.directionButton.title = isForward
      ? 'Playing forward (Up to reverse)'
      : 'Playing backward (Up to reverse)';
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

    // Check for .rv or .gto files in the selection
    const sessionFile = fileArray.find(f => f.name.endsWith('.rv') || f.name.endsWith('.gto'));
    
    if (sessionFile) {
      // If we have a session file, treat other files as potential media sources
      const availableFiles = new Map<string, File>();
      for (const file of fileArray) {
        if (file !== sessionFile) {
          availableFiles.set(file.name, file);
        }
      }

      try {
        const content = await sessionFile.arrayBuffer();
        await this.session.loadFromGTO(content, availableFiles);
        this.emit('fileLoaded', undefined);
      } catch (err) {
        console.error('Failed to load session file:', err);
        showAlert(`Failed to load ${sessionFile.name}: ${err}`, { type: 'error', title: 'Load Error' });
      }
      
      // Clear input
      input.value = '';
      return;
    }

    // Standard loading (sequence or individual files)
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
        await this.session.loadFile(file);
        this.emit('fileLoaded', undefined);
      } catch (err) {
        console.error('Failed to load file:', err);
        showAlert(`Failed to load ${file.name}: ${err}`, { type: 'error', title: 'Load Error' });
      }
    }

    // Reset input so same file can be selected again
    input.value = '';
  }

  private handleProjectOpen(e: Event): void {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) {
      this.emit('openProject', file);
    }
    input.value = '';
  }

  private bindEvents(): void {
    this.session.on('playbackChanged', () => this.updatePlayButton());
    this.session.on('loopModeChanged', () => this.updateLoopButton());
    this.session.on('playDirectionChanged', () => this.updateDirectionButton());
    this.session.on('playbackSpeedChanged', () => this.updateSpeedButton());
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
    this.updateSpeedButton();
    return this.container;
  }

  dispose(): void {
    this.volumeControl.dispose();
    this.exportControl.dispose();
    this.timecodeDisplay.dispose();
    this.themeControl.dispose();
  }

  getTimecodeDisplay(): TimecodeDisplay {
    return this.timecodeDisplay;
  }
}
