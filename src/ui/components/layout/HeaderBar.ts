/**
 * HeaderBar - Top bar with file operations, playback controls, and utilities
 *
 * Layout: [File Ops] | [Playback Controls] | [Timecode Display] | [Volume] [Help]
 * Height: 40px
 */

import { EventEmitter, EventMap } from '../../../utils/EventEmitter';
import { Session, PLAYBACK_SPEED_PRESETS } from '../../../core/session/Session';
import type { LoopMode } from '../../../core/types/session';
import { filterImageFiles, inferSequenceFromSingleFile, getBestSequence } from '../../../utils/media/SequenceLoader';
import { VolumeControl } from '../VolumeControl';
import { ExportControl } from '../ExportControl';
import { TimecodeDisplay } from '../TimecodeDisplay';
import { ThemeControl } from '../ThemeControl';
import { showAlert } from '../shared/Modal';
import { getIconSvg, IconName } from '../shared/Icons';
import { applyA11yFocus } from '../shared/Button';

export interface HeaderBarEvents extends EventMap {
  showShortcuts: void;
  showCustomKeyBindings: void;
  fileLoaded: void;
  saveProject: void;
  openProject: File;
  fullscreenToggle: void;
  presentationToggle: void;
}

export class HeaderBar extends EventEmitter<HeaderBarEvents> {
  private container: HTMLElement;
  private wrapper: HTMLElement;
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
  private sessionNameDisplay!: HTMLElement;
  private autoSaveSlot!: HTMLElement;
  private networkSlot!: HTMLElement;
  private panelsSlot!: HTMLElement;
  private fullscreenButton!: HTMLButtonElement;
  private presentationButton!: HTMLButtonElement;

  // Image mode: elements to hide when viewing a single image
  private playbackGroup!: HTMLElement;
  private playbackDividerBefore!: HTMLElement;
  private playbackDividerAfter!: HTMLElement;
  private timecodeEl!: HTMLElement;
  private volumeEl!: HTMLElement;
  private _isImageMode = false;
  private _imageTransitionTimers: ReturnType<typeof setTimeout>[] = [];

  // Track the active speed menu cleanup callback for disposal
  private _activeSpeedMenuCleanup: (() => void) | null = null;

  // Overflow fade indicators
  private fadeLeft!: HTMLElement;
  private fadeRight!: HTMLElement;
  private _scrollHandler: (() => void) | null = null;
  private _resizeHandler: (() => void) | null = null;

  constructor(session: Session) {
    super();
    this.session = session;
    this.volumeControl = new VolumeControl();
    this.exportControl = new ExportControl();
    this.timecodeDisplay = new TimecodeDisplay(session);
    this.themeControl = new ThemeControl();

    // Create wrapper (position: relative to anchor fade overlays)
    this.wrapper = document.createElement('div');
    this.wrapper.className = 'header-bar';
    this.wrapper.style.cssText = `
      position: relative;
      flex-shrink: 0;
    `;

    // Create scrollable container
    this.container = document.createElement('div');
    this.container.className = 'header-bar-scroll';
    this.container.setAttribute('role', 'banner');
    this.container.style.cssText = `
      height: 40px;
      background: linear-gradient(180deg, var(--bg-secondary) 0%, var(--bg-primary) 100%);
      border-bottom: 1px solid var(--border-secondary);
      display: flex;
      align-items: center;
      padding: 0 12px;
      gap: 0;
      flex-shrink: 0;
      user-select: none;
      overflow-x: auto;
      overflow-y: hidden;
      scrollbar-width: none;
      -ms-overflow-style: none;
    `;
    // Hide scrollbar for WebKit browsers
    const scrollStyle = document.createElement('style');
    scrollStyle.textContent = `.header-bar-scroll::-webkit-scrollbar { display: none; }`;
    this.container.appendChild(scrollStyle);

    this.wrapper.appendChild(this.container);

    // Create overflow fade indicators
    this.createOverflowFades();

    this.createControls();
    this.bindEvents();
  }

  /**
   * Create left/right gradient fade overlays that indicate hidden
   * scrollable content. They are absolutely positioned over the
   * scrollable container edges and toggled via a scroll listener.
   */
  private createOverflowFades(): void {
    const fadeBase = `
      position: absolute;
      top: 0;
      width: 24px;
      height: 40px;
      pointer-events: none;
      opacity: 0;
      transition: opacity 0.15s ease;
      z-index: 1;
    `;

    // Left fade
    this.fadeLeft = document.createElement('div');
    this.fadeLeft.className = 'header-fade-left';
    this.fadeLeft.dataset.testid = 'header-fade-left';
    this.fadeLeft.setAttribute('aria-hidden', 'true');
    this.fadeLeft.style.cssText = `
      ${fadeBase}
      left: 0;
      background: linear-gradient(to right, var(--bg-primary), transparent);
    `;
    this.wrapper.appendChild(this.fadeLeft);

    // Right fade
    this.fadeRight = document.createElement('div');
    this.fadeRight.className = 'header-fade-right';
    this.fadeRight.dataset.testid = 'header-fade-right';
    this.fadeRight.setAttribute('aria-hidden', 'true');
    this.fadeRight.style.cssText = `
      ${fadeBase}
      right: 0;
      background: linear-gradient(to left, var(--bg-primary), transparent);
    `;
    this.wrapper.appendChild(this.fadeRight);

    // Scroll handler to show/hide fades based on scroll position
    this._scrollHandler = () => this.updateOverflowFades();
    this._resizeHandler = () => this.updateOverflowFades();

    this.container.addEventListener('scroll', this._scrollHandler);
    window.addEventListener('resize', this._resizeHandler);
  }

  /**
   * Update visibility of left/right overflow fade indicators
   * based on the current scroll position of the container.
   */
  updateOverflowFades(): void {
    const { scrollLeft, scrollWidth, clientWidth } = this.container;
    const threshold = 2; // small tolerance for sub-pixel rounding

    // Show left fade when scrolled away from the start
    const showLeft = scrollLeft > threshold;
    this.fadeLeft.style.opacity = showLeft ? '1' : '0';

    // Show right fade when there is more content to the right
    const showRight = scrollLeft + clientWidth < scrollWidth - threshold;
    this.fadeRight.style.opacity = showRight ? '1' : '0';
  }

  private createControls(): void {
    // === FILE OPERATIONS GROUP ===
    const fileGroup = this.createGroup();
    fileGroup.setAttribute('role', 'toolbar');
    fileGroup.setAttribute('aria-label', 'File operations');

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

    // === SESSION NAME DISPLAY ===
    this.sessionNameDisplay = this.createSessionNameDisplay();
    this.container.appendChild(this.sessionNameDisplay);

    // === AUTO-SAVE INDICATOR SLOT ===
    this.autoSaveSlot = document.createElement('div');
    this.autoSaveSlot.className = 'autosave-slot';
    this.autoSaveSlot.dataset.testid = 'autosave-slot';
    this.autoSaveSlot.style.cssText = `
      display: flex;
      align-items: center;
      margin-left: 8px;
      flex-shrink: 0;
    `;
    this.container.appendChild(this.autoSaveSlot);
    this.playbackDividerBefore = this.createDivider();
    this.container.appendChild(this.playbackDividerBefore);

    // === PLAYBACK CONTROLS GROUP ===
    const playbackGroup = this.createGroup();
    playbackGroup.setAttribute('role', 'toolbar');
    playbackGroup.setAttribute('aria-label', 'Playback controls');
    this.playbackGroup = playbackGroup;

    playbackGroup.appendChild(this.createIconButton('skip-back', '', () => this.session.goToStart(), 'Go to start (Home)'));
    playbackGroup.appendChild(this.createIconButton('step-back', '', () => this.session.stepBackward(), 'Step back (\u2190)'));

    this.playButton = this.createIconButton('play', '', () => this.session.togglePlayback(), 'Play/Pause (Space)');
    this.playButton.setAttribute('aria-pressed', 'false');
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
    this.playbackDividerAfter = this.createDivider();
    this.container.appendChild(this.playbackDividerAfter);

    // === TIMECODE DISPLAY ===
    this.timecodeEl = this.timecodeDisplay.render();
    this.timecodeEl.style.flexShrink = '0';
    this.container.appendChild(this.timecodeEl);

    // === SPACER ===
    const spacer = document.createElement('div');
    spacer.style.flex = '1';
    this.container.appendChild(spacer);

    // === UTILITY GROUP ===
    const utilityGroup = this.createGroup();
    utilityGroup.setAttribute('role', 'toolbar');
    utilityGroup.setAttribute('aria-label', 'Utility controls');

    // Network sync slot (populated by App.ts)
    this.networkSlot = document.createElement('div');
    this.networkSlot.dataset.testid = 'network-slot';
    this.networkSlot.style.cssText = 'display: flex; align-items: center;';
    utilityGroup.appendChild(this.networkSlot);

    // Panel toggles slot (populated by AppControlRegistry)
    this.panelsSlot = document.createElement('div');
    this.panelsSlot.dataset.testid = 'panels-slot';
    this.panelsSlot.style.cssText = 'display: flex; align-items: center; gap: 2px;';
    utilityGroup.appendChild(this.panelsSlot);

    // Presentation mode button
    this.presentationButton = this.createIconButton('monitor', '', () => this.emit('presentationToggle', undefined), 'Presentation Mode (Ctrl+Shift+P)');
    this.presentationButton.dataset.testid = 'presentation-mode-button';
    utilityGroup.appendChild(this.presentationButton);

    // Fullscreen button
    this.fullscreenButton = this.createIconButton('maximize', '', () => this.emit('fullscreenToggle', undefined), 'Fullscreen (F11)');
    this.fullscreenButton.dataset.testid = 'fullscreen-toggle-button';
    utilityGroup.appendChild(this.fullscreenButton);

    // Volume control
    this.volumeEl = this.volumeControl.render();
    utilityGroup.appendChild(this.volumeEl);

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
      flex-shrink: 0;
    `;
    return group;
  }

  private createDivider(): HTMLElement {
    const divider = document.createElement('div');
    divider.style.cssText = `
      width: 1px;
      height: 24px;
      background: var(--border-primary);
      margin: 0 12px;
      flex-shrink: 0;
    `;
    return divider;
  }

  private addDivider(): void {
    this.container.appendChild(this.createDivider());
  }

  private createIconButton(icon: string, label: string, onClick: () => void, title?: string): HTMLButtonElement {
    const button = document.createElement('button');
    button.title = title || label;
    // Set aria-label for icon-only buttons (no text label)
    if (!label && title) {
      button.setAttribute('aria-label', title);
    }
    button.style.cssText = `
      background: transparent;
      border: 1px solid transparent;
      color: var(--text-secondary);
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

    button.addEventListener('pointerenter', () => {
      button.style.background = 'var(--bg-hover)';
      button.style.borderColor = 'var(--border-secondary)';
      button.style.color = 'var(--text-primary)';
    });

    button.addEventListener('pointerleave', () => {
      button.style.background = 'transparent';
      button.style.borderColor = 'transparent';
      button.style.color = 'var(--text-secondary)';
    });

    button.addEventListener('pointerdown', () => {
      button.style.background = 'var(--bg-active)';
    });

    button.addEventListener('pointerup', () => {
      button.style.background = 'var(--bg-hover)';
    });

    button.addEventListener('click', onClick);
    applyA11yFocus(button);
    return button;
  }

  private createCompactButton(text: string, onClick: () => void, title?: string): HTMLButtonElement {
    const button = document.createElement('button');
    button.textContent = text;
    button.title = title || '';
    button.style.cssText = `
      background: transparent;
      border: 1px solid transparent;
      color: var(--text-secondary);
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

    button.addEventListener('pointerenter', () => {
      button.style.background = 'var(--bg-hover)';
      button.style.borderColor = 'var(--border-secondary)';
      button.style.color = 'var(--text-primary)';
    });

    button.addEventListener('pointerleave', () => {
      button.style.background = 'transparent';
      button.style.borderColor = 'transparent';
      button.style.color = 'var(--text-secondary)';
    });

    button.addEventListener('click', onClick);
    applyA11yFocus(button);
    return button;
  }

  private getIcon(name: string): string {
    const icons: Record<string, string> = {
      'folder': '<svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>',
      'folder-open': '<svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 19a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2v1M3 13h18l-2 7H5l-2-7z"/></svg>',
      'save': '<svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>',
      'skip-back': '<svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="19,20 9,12 19,4"/><line x1="5" y1="4" x2="5" y2="20" stroke="currentColor" stroke-width="2"/></svg>',
      'step-back': '<svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="19,20 9,12 19,4"/></svg>',
      'play': '<svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg>',
      'pause': '<svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>',
      'step-forward': '<svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,4 15,12 5,20"/></svg>',
      'skip-forward': '<svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,4 15,12 5,20"/><line x1="19" y1="4" x2="19" y2="20" stroke="currentColor" stroke-width="2"/></svg>',
      'help': '<svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
      'keyboard': '<svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="4" width="20" height="16" rx="2" ry="2"/><path d="m6 8h.01"/><path d="m10 8h.01"/><path d="m14 8h.01"/><path d="m18 8h.01"/><path d="m8 12h.01"/><path d="m12 12h.01"/><path d="m16 12h.01"/><path d="m7 16h10"/></svg>',
      'maximize': '<svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>',
      'minimize': '<svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"/></svg>',
      'monitor': '<svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>',
    };
    return icons[name] || '';
  }

  private createSessionNameDisplay(): HTMLElement {
    const container = document.createElement('div');
    container.className = 'session-name-display';
    container.dataset.testid = 'session-name-display';
    container.style.cssText = `
      display: flex;
      align-items: center;
      gap: 6px;
      max-width: 200px;
      min-width: 80px;
      padding: 4px 8px;
      border-radius: 4px;
      cursor: default;
      flex-shrink: 0;
    `;

    // Icon
    const icon = document.createElement('span');
    icon.innerHTML = '<svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg>';
    icon.style.cssText = `
      color: var(--text-muted);
      display: flex;
      align-items: center;
      flex-shrink: 0;
    `;
    container.appendChild(icon);

    // Name text
    const nameText = document.createElement('span');
    nameText.className = 'session-name-text';
    nameText.style.cssText = `
      color: var(--text-primary);
      font-size: 12px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    `;
    nameText.textContent = 'Untitled';
    container.appendChild(nameText);

    return container;
  }

  private updateSessionNameDisplay(): void {
    const metadata = this.session.metadata;
    const nameText = this.sessionNameDisplay.querySelector('.session-name-text') as HTMLElement;

    if (nameText) {
      const displayName = metadata.displayName || 'Untitled';
      nameText.textContent = displayName;

      // Build tooltip with name and comment
      let tooltip = displayName;
      if (metadata.comment) {
        tooltip += `\n\n${metadata.comment}`;
      }
      if (metadata.origin && metadata.origin !== 'openrv-web') {
        tooltip += `\n\nCreated in: ${metadata.origin}`;
      }
      if (metadata.version > 0) {
        tooltip += `\nSession version: ${metadata.version}`;
      }

      this.sessionNameDisplay.title = tooltip;
    }
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
    button.title = 'Playback speed: Click to increase, Shift+Click to decrease, Right-click or Shift+Enter for menu (J/K/L keys)';
    button.setAttribute('aria-haspopup', 'menu');
    button.style.cssText = `
      background: transparent;
      border: 1px solid transparent;
      color: var(--text-secondary);
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

    button.addEventListener('pointerenter', () => {
      button.style.background = 'var(--bg-hover)';
      button.style.borderColor = 'var(--border-secondary)';
      button.style.color = 'var(--text-primary)';
    });

    button.addEventListener('pointerleave', () => {
      const speed = this.session.playbackSpeed;
      if (speed !== 1) {
        button.style.background = 'rgba(var(--accent-primary-rgb), 0.15)';
        button.style.borderColor = 'var(--accent-primary)';
        button.style.color = 'var(--accent-primary)';
      } else {
        button.style.background = 'transparent';
        button.style.borderColor = 'transparent';
        button.style.color = 'var(--text-secondary)';
      }
    });

    button.addEventListener('click', (e) => this.cycleSpeed(e.shiftKey ? -1 : 1));

    // Right-click context menu with all speed presets
    button.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      this.showSpeedMenu(button);
    });

    // Keyboard activation: Shift+Enter or Shift+Space opens the speed menu
    button.addEventListener('keydown', (e) => {
      if (e.shiftKey && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        this.showSpeedMenu(button);
      }
    });

    // Initial state
    this.updateSpeedButtonText(button);
    return button;
  }

  private showSpeedMenu(anchor: HTMLElement): void {
    // Remove any existing speed menu via tracked cleanup
    if (this._activeSpeedMenuCleanup) {
      this._activeSpeedMenuCleanup();
    }
    const existingMenu = document.getElementById('speed-preset-menu');
    if (existingMenu) {
      existingMenu.remove();
    }

    const menu = document.createElement('div');
    menu.id = 'speed-preset-menu';
    menu.setAttribute('role', 'menu');
    menu.style.cssText = `
      position: fixed;
      background: var(--bg-secondary);
      border: 1px solid var(--border-primary);
      border-radius: 6px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
      padding: 4px 0;
      z-index: 10000;
      min-width: 80px;
    `;

    const currentSpeed = this.session.playbackSpeed;
    let activeItem: HTMLButtonElement | null = null;

    for (const preset of PLAYBACK_SPEED_PRESETS) {
      const item = document.createElement('button');
      item.dataset.testid = `speed-preset-${preset}`;
      item.setAttribute('role', 'menuitem');
      item.tabIndex = -1;
      item.textContent = `${preset}x`;

      const isActive = preset === currentSpeed;
      if (isActive) {
        item.setAttribute('aria-checked', 'true');
        activeItem = item;
      }

      item.style.cssText = `
        display: block;
        width: 100%;
        padding: 6px 12px;
        background: ${isActive ? 'var(--accent-primary)' : 'transparent'};
        color: ${isActive ? 'white' : 'var(--text-primary)'};
        border: none;
        text-align: left;
        cursor: pointer;
        font-size: 12px;
        font-family: monospace;
        outline: none;
      `;

      item.addEventListener('mouseenter', () => {
        if (preset !== currentSpeed) {
          item.style.background = 'var(--bg-hover)';
        }
      });

      item.addEventListener('mouseleave', () => {
        if (preset !== currentSpeed) {
          item.style.background = 'transparent';
        }
      });

      item.addEventListener('focus', () => {
        if (preset !== currentSpeed) {
          item.style.background = 'var(--bg-hover)';
        }
      });

      item.addEventListener('blur', () => {
        if (preset !== currentSpeed) {
          item.style.background = 'transparent';
        }
      });

      item.addEventListener('click', () => {
        this.session.playbackSpeed = preset;
        removeMenu();
      });

      menu.appendChild(item);
    }

    // Separator before pitch correction toggle
    const separator = document.createElement('div');
    separator.style.cssText = `
      height: 1px;
      background: var(--border-primary);
      margin: 4px 0;
    `;
    menu.appendChild(separator);

    // Pitch correction toggle
    const pitchItem = document.createElement('button');
    pitchItem.dataset.testid = 'pitch-correction-toggle';
    pitchItem.setAttribute('role', 'menuitem');
    pitchItem.tabIndex = -1;
    const pitchEnabled = this.session.preservesPitch;
    pitchItem.textContent = `${pitchEnabled ? '\u2713 ' : '  '}Preserve Pitch`;
    pitchItem.style.cssText = `
      display: block;
      width: 100%;
      padding: 6px 12px;
      background: transparent;
      color: var(--text-primary);
      border: none;
      text-align: left;
      cursor: pointer;
      font-size: 12px;
      font-family: monospace;
      outline: none;
    `;

    pitchItem.addEventListener('mouseenter', () => {
      pitchItem.style.background = 'var(--bg-hover)';
    });

    pitchItem.addEventListener('mouseleave', () => {
      pitchItem.style.background = 'transparent';
    });

    pitchItem.addEventListener('focus', () => {
      pitchItem.style.background = 'var(--bg-hover)';
    });

    pitchItem.addEventListener('blur', () => {
      pitchItem.style.background = 'transparent';
    });

    pitchItem.addEventListener('click', () => {
      this.session.preservesPitch = !this.session.preservesPitch;
      removeMenu();
    });

    menu.appendChild(pitchItem);

    // Keyboard navigation for the menu
    const getMenuItems = (): HTMLElement[] => {
      return Array.from(menu.querySelectorAll('[role="menuitem"]'));
    };

    menu.addEventListener('keydown', (e: KeyboardEvent) => {
      const items = getMenuItems();
      const currentIndex = items.indexOf(document.activeElement as HTMLElement);

      switch (e.key) {
        case 'ArrowDown': {
          e.preventDefault();
          const nextIndex = currentIndex < items.length - 1 ? currentIndex + 1 : 0;
          items[nextIndex]?.focus();
          break;
        }
        case 'ArrowUp': {
          e.preventDefault();
          const prevIndex = currentIndex > 0 ? currentIndex - 1 : items.length - 1;
          items[prevIndex]?.focus();
          break;
        }
        case 'Escape': {
          e.preventDefault();
          removeMenu();
          anchor.focus();
          break;
        }
        case 'Tab': {
          e.preventDefault();
          removeMenu();
          anchor.focus();
          break;
        }
      }
    });

    // Position the menu below the button
    const rect = anchor.getBoundingClientRect();
    menu.style.left = `${rect.left}px`;
    menu.style.top = `${rect.bottom + 4}px`;

    document.body.appendChild(menu);

    // Focus the active item, or the first item if none is active
    const focusTarget = activeItem || getMenuItems()[0];
    if (focusTarget) {
      focusTarget.focus();
    }

    // Cleanup function to remove menu and listener
    const removeMenu = () => {
      menu.remove();
      document.removeEventListener('click', closeMenu);
      this._activeSpeedMenuCleanup = null;
    };

    // Close menu when clicking outside
    const closeMenu = (e: MouseEvent) => {
      if (!menu.contains(e.target as Node)) {
        removeMenu();
      }
    };
    setTimeout(() => document.addEventListener('click', closeMenu), 0);

    // Track the active menu cleanup for disposal
    this._activeSpeedMenuCleanup = removeMenu;
  }

  private cycleSpeed(direction: number): void {
    const currentSpeed = this.session.playbackSpeed;
    const currentIndex = PLAYBACK_SPEED_PRESETS.indexOf(currentSpeed as typeof PLAYBACK_SPEED_PRESETS[number]);

    if (direction > 0) {
      // Cycle forward (increase speed)
      if (currentIndex >= 0 && currentIndex < PLAYBACK_SPEED_PRESETS.length - 1) {
        const nextSpeed = PLAYBACK_SPEED_PRESETS[currentIndex + 1];
        if (nextSpeed !== undefined) {
          this.session.playbackSpeed = nextSpeed;
          return;
        }
      }
      // Reset to 1x when at max or not a preset
      this.session.playbackSpeed = 1;
    } else {
      // Cycle backward (decrease speed)
      if (currentIndex > 0) {
        const prevSpeed = PLAYBACK_SPEED_PRESETS[currentIndex - 1];
        if (prevSpeed !== undefined) {
          this.session.playbackSpeed = prevSpeed;
          return;
        }
      } else if (currentIndex === -1) {
        // Not a preset, find nearest lower preset
        const lowerPreset = [...PLAYBACK_SPEED_PRESETS].reverse().find(p => p < currentSpeed);
        if (lowerPreset !== undefined) {
          this.session.playbackSpeed = lowerPreset;
          return;
        }
      }
      // Reset to 1x when at min or not a preset
      this.session.playbackSpeed = 1;
    }
  }

  private updateSpeedButton(): void {
    this.updateSpeedButtonText(this.speedButton);
  }

  private updateSpeedButtonText(button: HTMLButtonElement): void {
    const speed = this.session.playbackSpeed;
    button.textContent = `${speed}x`;

    // Highlight when not at 1x
    if (speed !== 1) {
      button.style.background = 'rgba(var(--accent-primary-rgb), 0.15)';
      button.style.borderColor = 'var(--accent-primary)';
      button.style.color = 'var(--accent-primary)';
    } else {
      button.style.background = 'transparent';
      button.style.borderColor = 'transparent';
      button.style.color = 'var(--text-secondary)';
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
    this.playButton.setAttribute('aria-pressed', this.session.isPlaying ? 'true' : 'false');
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
      // Try to find the best sequence from the selected files
      const bestSequence = getBestSequence(imageFiles);
      if (bestSequence && bestSequence.length > 1) {
        try {
          await this.session.loadSequence(bestSequence);
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
    }

    // Single image file - try to infer a sequence from available files
    if (imageFiles.length === 1) {
      const singleFile = imageFiles[0]!;
      try {
        // Try to infer sequence from the single file and all available files
        const sequenceInfo = await inferSequenceFromSingleFile(singleFile, fileArray);
        if (sequenceInfo) {
          // Successfully inferred a sequence
          const sequenceFiles = sequenceInfo.frames.map(f => f.file);
          await this.session.loadSequence(sequenceFiles);
          this.emit('fileLoaded', undefined);
          input.value = '';
          return;
        }
      } catch (err) {
        console.error('Failed to infer sequence:', err);
        // Fall through to single file loading
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
    this.session.on('metadataChanged', () => this.updateSessionNameDisplay());
  }

  // Public accessors for child controls
  getVolumeControl(): VolumeControl {
    return this.volumeControl;
  }

  getExportControl(): ExportControl {
    return this.exportControl;
  }

  getContainer(): HTMLElement {
    return this.container;
  }

  render(): HTMLElement {
    this.updateLoopButton();
    this.updatePlayButton();
    this.updateDirectionButton();
    this.updateSpeedButton();
    this.updateSessionNameDisplay();
    return this.wrapper;
  }

  dispose(): void {
    // Remove any open speed menu from document.body
    if (this._activeSpeedMenuCleanup) {
      this._activeSpeedMenuCleanup();
    }

    // Remove overflow fade listeners
    if (this._scrollHandler) {
      this.container.removeEventListener('scroll', this._scrollHandler);
      this._scrollHandler = null;
    }
    if (this._resizeHandler) {
      window.removeEventListener('resize', this._resizeHandler);
      this._resizeHandler = null;
    }

    // Clear image mode transition timers
    for (const timer of this._imageTransitionTimers) {
      clearTimeout(timer);
    }
    this._imageTransitionTimers = [];

    this.volumeControl.dispose();
    this.exportControl.dispose();
    this.timecodeDisplay.dispose();
    this.themeControl.dispose();
  }

  getTimecodeDisplay(): TimecodeDisplay {
    return this.timecodeDisplay;
  }

  /**
   * Set the auto-save indicator element to display in the header
   */
  setAutoSaveIndicator(element: HTMLElement): void {
    // Clear existing content
    this.autoSaveSlot.innerHTML = '';
    this.autoSaveSlot.appendChild(element);
  }

  /**
   * Set the network control element to display in the header utility group
   */
  setNetworkControl(element: HTMLElement): void {
    this.networkSlot.innerHTML = '';
    this.networkSlot.appendChild(element);
  }

  /**
   * Get the auto-save indicator slot element
   */
  getAutoSaveSlot(): HTMLElement {
    return this.autoSaveSlot;
  }

  /**
   * Set panel toggle elements (Info Panel, Snapshots, Playlist) to display in the header utility group
   */
  setPanelToggles(element: HTMLElement): void {
    this.panelsSlot.innerHTML = '';
    this.panelsSlot.appendChild(element);
  }

  /**
   * Get the panels slot element
   */
  getPanelsSlot(): HTMLElement {
    return this.panelsSlot;
  }

  /**
   * Update the fullscreen button icon based on fullscreen state
   */
  setFullscreenState(isFullscreen: boolean): void {
    const icon = isFullscreen ? 'minimize' : 'maximize';
    const tooltip = isFullscreen ? 'Exit Fullscreen (Esc)' : 'Fullscreen (F11)';
    this.fullscreenButton.innerHTML = this.getIcon(icon);
    this.fullscreenButton.title = tooltip;
  }

  /**
   * Update the presentation mode button active state
   */
  setPresentationState(isEnabled: boolean): void {
    if (isEnabled) {
      this.presentationButton.style.background = 'rgba(var(--accent-primary-rgb), 0.15)';
      this.presentationButton.style.borderColor = 'var(--accent-primary)';
      this.presentationButton.style.color = 'var(--accent-primary)';
    } else {
      this.presentationButton.style.background = 'transparent';
      this.presentationButton.style.borderColor = 'transparent';
      this.presentationButton.style.color = 'var(--text-secondary)';
    }
  }

  /**
   * Toggle visibility of playback controls, timecode, and volume
   * for single-image sources. Uses fade transition following
   * the same pattern as PresentationMode.
   */
  setImageMode(isImage: boolean): void {
    if (this._isImageMode === isImage) return;
    this._isImageMode = isImage;

    // Clear any pending transition timers to prevent race conditions
    for (const timer of this._imageTransitionTimers) {
      clearTimeout(timer);
    }
    this._imageTransitionTimers = [];

    const elements = [
      this.playbackGroup,
      this.playbackDividerBefore,
      this.playbackDividerAfter,
      this.timecodeEl,
      this.volumeEl,
    ];

    if (isImage) {
      // Fade out then collapse
      for (const el of elements) {
        el.style.transition = 'opacity 0.3s ease';
        el.style.opacity = '0';
        el.style.pointerEvents = 'none';
        el.setAttribute('aria-hidden', 'true');
        const timer = setTimeout(() => {
          if (this._isImageMode) {
            el.style.display = 'none';
          }
        }, 300);
        this._imageTransitionTimers.push(timer);
      }
    } else {
      // Restore: un-collapse, force reflow, fade in
      for (const el of elements) {
        el.style.display = '';
        el.style.pointerEvents = '';
        el.removeAttribute('aria-hidden');
        // Force reflow before changing opacity for animation
        void el.offsetHeight;
        el.style.transition = 'opacity 0.3s ease';
        el.style.opacity = '1';
        const timer = setTimeout(() => {
          el.style.transition = '';
        }, 300);
        this._imageTransitionTimers.push(timer);
      }
    }
  }
}
