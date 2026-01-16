import { EventEmitter, EventMap } from '../../utils/EventEmitter';
import { getIconSvg } from './shared/Icons';

export interface CropRegion {
  x: number;      // 0-1 normalized left position
  y: number;      // 0-1 normalized top position
  width: number;  // 0-1 normalized width
  height: number; // 0-1 normalized height
}

export interface CropState {
  enabled: boolean;
  region: CropRegion;
  aspectRatio: string | null;  // null = free, "16:9", "4:3", "1:1", etc.
}

export const DEFAULT_CROP_REGION: CropRegion = {
  x: 0,
  y: 0,
  width: 1,
  height: 1,
};

export const DEFAULT_CROP_STATE: CropState = {
  enabled: false,
  region: { ...DEFAULT_CROP_REGION },
  aspectRatio: null,
};

export interface CropControlEvents extends EventMap {
  cropStateChanged: CropState;
  cropModeToggled: boolean;
}

const ASPECT_RATIOS: { label: string; value: string | null; ratio: number | null }[] = [
  { label: 'Free', value: null, ratio: null },
  { label: '16:9', value: '16:9', ratio: 16 / 9 },
  { label: '4:3', value: '4:3', ratio: 4 / 3 },
  { label: '1:1', value: '1:1', ratio: 1 },
  { label: '9:16', value: '9:16', ratio: 9 / 16 },
  { label: '2.35:1', value: '2.35:1', ratio: 2.35 },
];

export class CropControl extends EventEmitter<CropControlEvents> {
  private container: HTMLElement;
  private cropButton: HTMLButtonElement;
  private panel: HTMLElement;
  private isPanelOpen = false;
  private state: CropState = { ...DEFAULT_CROP_STATE };

  private aspectSelect: HTMLSelectElement | null = null;

  constructor() {
    super();

    // Create container
    this.container = document.createElement('div');
    this.container.className = 'crop-control-container';
    this.container.style.cssText = `
      display: flex;
      align-items: center;
      position: relative;
      margin-left: 8px;
    `;

    // Create crop button
    this.cropButton = document.createElement('button');
    this.cropButton.innerHTML = `${getIconSvg('crop', 'sm')}<span style="margin-left: 6px;">Crop</span>`;
    this.cropButton.title = 'Crop image (K)';
    this.cropButton.style.cssText = `
      background: transparent;
      border: 1px solid transparent;
      color: #999;
      padding: 6px 10px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
      transition: all 0.12s ease;
      display: inline-flex;
      align-items: center;
      justify-content: center;
    `;

    this.cropButton.addEventListener('click', () => this.togglePanel());
    this.cropButton.addEventListener('mouseenter', () => {
      if (!this.isPanelOpen && !this.state.enabled) {
        this.cropButton.style.background = '#3a3a3a';
        this.cropButton.style.borderColor = '#4a4a4a';
        this.cropButton.style.color = '#ccc';
      }
    });
    this.cropButton.addEventListener('mouseleave', () => {
      if (!this.isPanelOpen && !this.state.enabled) {
        this.cropButton.style.background = 'transparent';
        this.cropButton.style.borderColor = 'transparent';
        this.cropButton.style.color = '#999';
      }
    });

    // Create panel (rendered at body level to avoid z-index issues)
    this.panel = document.createElement('div');
    this.panel.className = 'crop-panel';
    this.panel.style.cssText = `
      position: fixed;
      background: #2a2a2a;
      border: 1px solid #444;
      border-radius: 6px;
      padding: 12px;
      min-width: 200px;
      z-index: 9999;
      display: none;
      box-shadow: 0 4px 12px rgba(0,0,0,0.4);
    `;

    this.createPanelContent();

    this.container.appendChild(this.cropButton);
    // Panel will be appended to body when shown

    // Close panel on outside click
    document.addEventListener('click', (e) => {
      if (!this.container.contains(e.target as Node) && !this.panel.contains(e.target as Node)) {
        this.hidePanel();
      }
    });
  }

  private createPanelContent(): void {
    // Header
    const header = document.createElement('div');
    header.style.cssText = `
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;
      padding-bottom: 8px;
      border-bottom: 1px solid #444;
    `;

    const title = document.createElement('span');
    title.textContent = 'Crop Settings';
    title.style.cssText = 'color: #ddd; font-size: 13px; font-weight: 500;';

    header.appendChild(title);
    this.panel.appendChild(header);

    // Enable/Disable toggle
    const toggleRow = document.createElement('div');
    toggleRow.style.cssText = `
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 12px;
    `;

    const toggleLabel = document.createElement('span');
    toggleLabel.textContent = 'Enable Crop';
    toggleLabel.style.cssText = 'color: #aaa; font-size: 12px;';

    const toggleSwitch = document.createElement('button');
    toggleSwitch.textContent = this.state.enabled ? 'ON' : 'OFF';
    toggleSwitch.style.cssText = `
      background: ${this.state.enabled ? '#4a9eff' : '#555'};
      border: none;
      color: #fff;
      padding: 4px 12px;
      border-radius: 3px;
      cursor: pointer;
      font-size: 11px;
      min-width: 40px;
    `;

    toggleSwitch.addEventListener('click', () => {
      this.state.enabled = !this.state.enabled;
      toggleSwitch.textContent = this.state.enabled ? 'ON' : 'OFF';
      toggleSwitch.style.background = this.state.enabled ? '#4a9eff' : '#555';
      this.updateButtonState();
      this.emitChange();
      this.emit('cropModeToggled', this.state.enabled);
    });

    toggleRow.appendChild(toggleLabel);
    toggleRow.appendChild(toggleSwitch);
    this.panel.appendChild(toggleRow);

    // Aspect ratio selector
    const aspectRow = document.createElement('div');
    aspectRow.style.cssText = 'margin-bottom: 12px;';

    const aspectLabel = document.createElement('div');
    aspectLabel.textContent = 'Aspect Ratio';
    aspectLabel.style.cssText = 'color: #aaa; font-size: 12px; margin-bottom: 4px;';

    this.aspectSelect = document.createElement('select');
    this.aspectSelect.dataset.testid = 'crop-aspect-select';
    this.aspectSelect.style.cssText = `
      width: 100%;
      background: #444;
      border: 1px solid #555;
      color: #ddd;
      padding: 6px 8px;
      border-radius: 4px;
      font-size: 12px;
      cursor: pointer;
    `;

    ASPECT_RATIOS.forEach(ar => {
      const option = document.createElement('option');
      option.value = ar.value || '';
      option.textContent = ar.label;
      this.aspectSelect!.appendChild(option);
    });

    this.aspectSelect.addEventListener('change', () => {
      const value = this.aspectSelect!.value || null;
      this.state.aspectRatio = value;
      this.applyAspectRatio();
      this.emitChange();
    });

    aspectRow.appendChild(aspectLabel);
    aspectRow.appendChild(this.aspectSelect);
    this.panel.appendChild(aspectRow);

    // Reset button
    const resetBtn = document.createElement('button');
    resetBtn.textContent = 'Reset Crop';
    resetBtn.style.cssText = `
      width: 100%;
      background: #555;
      border: none;
      color: #ddd;
      padding: 8px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
      margin-top: 8px;
    `;
    resetBtn.addEventListener('click', () => this.reset());
    resetBtn.addEventListener('mouseenter', () => {
      resetBtn.style.background = '#666';
    });
    resetBtn.addEventListener('mouseleave', () => {
      resetBtn.style.background = '#555';
    });

    this.panel.appendChild(resetBtn);

    // Instructions
    const instructions = document.createElement('div');
    instructions.style.cssText = `
      color: #666;
      font-size: 10px;
      margin-top: 12px;
      line-height: 1.4;
    `;
    instructions.textContent = 'Drag on the image to set crop region. Hold Shift to constrain aspect ratio.';
    this.panel.appendChild(instructions);
  }

  private applyAspectRatio(): void {
    if (!this.state.aspectRatio) return;

    const ar = ASPECT_RATIOS.find(a => a.value === this.state.aspectRatio);
    if (!ar || !ar.ratio) return;

    // Adjust crop region to match aspect ratio
    // Keep it centered and as large as possible
    const currentAspect = this.state.region.width / this.state.region.height;

    if (currentAspect > ar.ratio) {
      // Too wide, reduce width
      const newWidth = this.state.region.height * ar.ratio;
      const widthDiff = this.state.region.width - newWidth;
      this.state.region.x += widthDiff / 2;
      this.state.region.width = newWidth;
    } else {
      // Too tall, reduce height
      const newHeight = this.state.region.width / ar.ratio;
      const heightDiff = this.state.region.height - newHeight;
      this.state.region.y += heightDiff / 2;
      this.state.region.height = newHeight;
    }
  }

  private emitChange(): void {
    this.emit('cropStateChanged', { ...this.state, region: { ...this.state.region } });
  }

  private updateButtonState(): void {
    const isActive = this.state.enabled || this.isPanelOpen;
    if (isActive) {
      this.cropButton.style.background = 'rgba(74, 158, 255, 0.15)';
      this.cropButton.style.borderColor = '#4a9eff';
      this.cropButton.style.color = '#4a9eff';
    } else {
      this.cropButton.style.background = 'transparent';
      this.cropButton.style.borderColor = 'transparent';
      this.cropButton.style.color = '#999';
    }
  }

  togglePanel(): void {
    if (this.isPanelOpen) {
      this.hidePanel();
    } else {
      this.showPanel();
    }
  }

  showPanel(): void {
    this.isPanelOpen = true;

    // Append to body if not already there
    if (!document.body.contains(this.panel)) {
      document.body.appendChild(this.panel);
    }

    // Position relative to button
    const rect = this.cropButton.getBoundingClientRect();
    this.panel.style.top = `${rect.bottom + 4}px`;
    this.panel.style.left = `${Math.max(8, rect.right - 200)}px`; // Align right edge, min 8px from left

    this.panel.style.display = 'block';
    this.updateButtonState();
  }

  hidePanel(): void {
    this.isPanelOpen = false;
    this.panel.style.display = 'none';
    this.updateButtonState();
  }

  toggle(): void {
    this.state.enabled = !this.state.enabled;
    this.updateButtonState();
    this.emitChange();
    this.emit('cropModeToggled', this.state.enabled);
  }

  reset(): void {
    this.state = {
      enabled: false,
      region: { ...DEFAULT_CROP_REGION },
      aspectRatio: null,
    };

    if (this.aspectSelect) {
      this.aspectSelect.value = '';
    }

    this.updateButtonState();
    this.emitChange();
  }

  setCropRegion(region: CropRegion): void {
    this.state.region = { ...region };
    this.emitChange();
  }

  getCropState(): CropState {
    return { ...this.state, region: { ...this.state.region } };
  }

  getAspectRatio(): number | null {
    if (!this.state.aspectRatio) return null;
    const ar = ASPECT_RATIOS.find(a => a.value === this.state.aspectRatio);
    return ar?.ratio || null;
  }

  render(): HTMLElement {
    return this.container;
  }

  dispose(): void {
    // Remove panel from body if present
    if (document.body.contains(this.panel)) {
      document.body.removeChild(this.panel);
    }
  }
}
