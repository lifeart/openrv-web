import { Session, LoopMode } from '../../core/session/Session';

export class Toolbar {
  private container: HTMLElement;
  private session: Session;

  private playButton!: HTMLButtonElement;
  private loopButton!: HTMLButtonElement;
  private sourceInfo!: HTMLSpanElement;
  private fileInput!: HTMLInputElement;

  constructor(session: Session) {
    this.session = session;

    // Create container
    this.container = document.createElement('div');
    this.container.className = 'toolbar-container';
    this.container.style.cssText = `
      height: 48px;
      background: linear-gradient(180deg, #333 0%, #2a2a2a 100%);
      border-bottom: 1px solid #444;
      display: flex;
      align-items: center;
      padding: 0 16px;
      gap: 8px;
      flex-shrink: 0;
    `;

    this.createControls();
    this.bindEvents();
  }

  private createControls(): void {
    // File input (hidden)
    this.fileInput = document.createElement('input');
    this.fileInput.type = 'file';
    this.fileInput.accept = 'image/*,video/*,.rv,.gto';
    this.fileInput.multiple = true;
    this.fileInput.style.display = 'none';
    this.fileInput.addEventListener('change', (e) => this.handleFileSelect(e));
    this.container.appendChild(this.fileInput);

    // Open button
    this.createButton('📂 Open', () => this.fileInput.click(), 'Open file (drag & drop also works)');

    this.addSeparator();

    // Playback controls
    this.createButton('⏮', () => this.session.goToStart(), 'Go to start (Home)');
    this.createButton('⏪', () => this.session.stepBackward(), 'Step back (←)');

    this.playButton = this.createButton('▶', () => this.session.togglePlayback(), 'Play/Pause (Space)');
    this.playButton.style.minWidth = '40px';

    this.createButton('⏩', () => this.session.stepForward(), 'Step forward (→)');
    this.createButton('⏭', () => this.session.goToEnd(), 'Go to end (End)');

    this.addSeparator();

    // Loop mode
    this.loopButton = this.createButton('🔁 Loop', () => this.cycleLoopMode(), 'Cycle loop mode (L)');
    this.loopButton.style.minWidth = '90px';

    this.addSeparator();

    // In/Out point buttons
    this.createButton('[', () => this.session.setInPoint(), 'Set in point (I)');
    this.createButton(']', () => this.session.setOutPoint(), 'Set out point (O)');

    this.addSeparator();

    // Mark button
    this.createButton('🔖', () => this.session.toggleMark(), 'Toggle mark (M)');

    // Spacer
    const spacer = document.createElement('div');
    spacer.style.flex = '1';
    this.container.appendChild(spacer);

    // Source info
    this.sourceInfo = document.createElement('span');
    this.sourceInfo.style.cssText = `
      color: #888;
      font-size: 12px;
      margin-right: 16px;
    `;
    this.container.appendChild(this.sourceInfo);

    // Keyboard shortcuts help
    this.createButton('⌨', () => this.showShortcuts(), 'Keyboard shortcuts');
  }

  private createButton(text: string, onClick: () => void, title?: string): HTMLButtonElement {
    const button = document.createElement('button');
    button.textContent = text;
    button.title = title || '';
    button.style.cssText = `
      background: #444;
      border: 1px solid #555;
      color: #ddd;
      padding: 6px 12px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 13px;
      transition: all 0.15s ease;
      display: flex;
      align-items: center;
      justify-content: center;
    `;

    button.addEventListener('mouseenter', () => {
      button.style.background = '#555';
      button.style.borderColor = '#666';
    });

    button.addEventListener('mouseleave', () => {
      button.style.background = '#444';
      button.style.borderColor = '#555';
    });

    button.addEventListener('mousedown', () => {
      button.style.background = '#333';
    });

    button.addEventListener('mouseup', () => {
      button.style.background = '#555';
    });

    button.addEventListener('click', onClick);
    this.container.appendChild(button);
    return button;
  }

  private addSeparator(): void {
    const sep = document.createElement('div');
    sep.style.cssText = `
      width: 1px;
      height: 24px;
      background: #444;
      margin: 0 4px;
    `;
    this.container.appendChild(sep);
  }

  private cycleLoopMode(): void {
    const modes: LoopMode[] = ['once', 'loop', 'pingpong'];
    const currentIndex = modes.indexOf(this.session.loopMode);
    this.session.loopMode = modes[(currentIndex + 1) % modes.length]!;
    this.updateLoopButton();
  }

  private updateLoopButton(): void {
    const labels: Record<LoopMode, string> = {
      once: '➡ Once',
      loop: '🔁 Loop',
      pingpong: '🔀 Ping',
    };
    this.loopButton.textContent = labels[this.session.loopMode];
  }

  private updatePlayButton(): void {
    this.playButton.textContent = this.session.isPlaying ? '⏸' : '▶';
  }

  private updateSourceInfo(): void {
    const source = this.session.currentSource;
    if (source) {
      const type = source.type === 'video' ? '🎬' : '🖼';
      this.sourceInfo.textContent = `${type} ${source.name}`;
    } else {
      this.sourceInfo.textContent = 'No source loaded';
    }
  }

  private async handleFileSelect(e: Event): Promise<void> {
    const input = e.target as HTMLInputElement;
    const files = input.files;
    if (!files) return;

    for (const file of files) {
      try {
        if (file.name.endsWith('.rv') || file.name.endsWith('.gto')) {
          const content = await file.arrayBuffer();
          await this.session.loadFromGTO(content);
        } else {
          await this.session.loadFile(file);
        }
      } catch (err) {
        console.error('Failed to load file:', err);
        alert(`Failed to load ${file.name}: ${err}`);
      }
    }

    // Reset input so same file can be selected again
    input.value = '';
  }

  private showShortcuts(): void {
    alert(`Keyboard Shortcuts:

PLAYBACK
Space     - Play/Pause
← / →     - Step frame
Home/End  - Go to start/end
↑         - Toggle direction

VIEW
F         - Fit to window
0-4       - Zoom levels
Drag      - Pan image
Scroll    - Zoom

TIMELINE
I / [     - Set in point
O / ]     - Set out point
M         - Toggle mark
L         - Cycle loop mode

PAINT
V         - Pan tool (no paint)
P         - Pen tool
E         - Eraser tool
T         - Text tool
B         - Toggle brush type
G         - Toggle ghost mode
Ctrl+Z    - Undo
Ctrl+Y    - Redo`);
  }

  private bindEvents(): void {
    this.session.on('playbackChanged', () => this.updatePlayButton());
    this.session.on('sourceLoaded', () => this.updateSourceInfo());
  }

  render(): HTMLElement {
    this.updateLoopButton();
    this.updatePlayButton();
    this.updateSourceInfo();
    return this.container;
  }

  dispose(): void {
    // Cleanup if needed
  }
}
