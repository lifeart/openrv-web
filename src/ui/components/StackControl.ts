import { EventEmitter, EventMap } from '../../utils/EventEmitter';
import { BlendMode, BLEND_MODES, BLEND_MODE_LABELS } from '../../composite/BlendModes';
import { getIconSvg } from './shared/Icons';

export interface StackLayer {
  id: string;
  name: string;
  visible: boolean;
  opacity: number;
  blendMode: BlendMode;
  sourceIndex: number; // Index in session sources array
}

export interface SourceInfo {
  index: number;
  name: string;
}

export interface StackControlEvents extends EventMap {
  layerAdded: StackLayer;
  layerRemoved: string; // layer id
  layerChanged: StackLayer;
  layerReordered: { layerId: string; newIndex: number };
  activeLayerChanged: string | null;
  layerSourceChanged: { layerId: string; sourceIndex: number };
}

export class StackControl extends EventEmitter<StackControlEvents> {
  private container: HTMLElement;
  private stackButton: HTMLButtonElement;
  private panel: HTMLElement;
  private layerList!: HTMLElement;
  private isPanelOpen = false;
  private layers: StackLayer[] = [];
  private activeLayerId: string | null = null;
  private nextLayerId = 1;
  private boundHandleOutsideClick: (e: MouseEvent) => void;
  private availableSources: SourceInfo[] = [];

  constructor() {
    super();

    // Create container
    this.container = document.createElement('div');
    this.container.className = 'stack-control-container';
    this.container.style.cssText = `
      display: flex;
      align-items: center;
      position: relative;
      margin-left: 8px;
    `;

    // Create stack button
    this.stackButton = document.createElement('button');
    this.stackButton.innerHTML = `${getIconSvg('layers', 'sm')}<span style="margin-left: 6px;">Stack</span>`;
    this.stackButton.title = 'Layer stack controls';
    this.stackButton.setAttribute('data-testid', 'stack-button');
    this.stackButton.style.cssText = `
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
    `;

    this.stackButton.addEventListener('click', () => this.togglePanel());
    this.stackButton.addEventListener('mouseenter', () => {
      if (!this.isPanelOpen) {
        this.stackButton.style.background = 'var(--bg-hover)';
        this.stackButton.style.borderColor = 'var(--border-primary)';
        this.stackButton.style.color = 'var(--text-primary)';
      }
    });
    this.stackButton.addEventListener('mouseleave', () => {
      if (!this.isPanelOpen && this.layers.length <= 1) {
        this.stackButton.style.background = 'transparent';
        this.stackButton.style.borderColor = 'transparent';
        this.stackButton.style.color = 'var(--text-muted)';
      }
    });

    // Create panel (rendered at body level to avoid z-index issues)
    this.panel = document.createElement('div');
    this.panel.className = 'stack-panel';
    this.panel.setAttribute('data-testid', 'stack-panel');
    this.panel.style.cssText = `
      position: fixed;
      background: var(--bg-secondary);
      border: 1px solid var(--border-primary);
      border-radius: 6px;
      padding: 12px;
      min-width: 280px;
      max-height: 400px;
      z-index: 9999;
      display: none;
      box-shadow: 0 8px 24px rgba(0,0,0,0.5);
    `;

    this.createPanelContent();

    this.container.appendChild(this.stackButton);
    // Panel will be appended to body when shown

    // Close panel on outside click (store reference for cleanup)
    this.boundHandleOutsideClick = (e: MouseEvent) => {
      if (!this.container.contains(e.target as Node) && !this.panel.contains(e.target as Node)) {
        this.hidePanel();
      }
    };
    document.addEventListener('click', this.boundHandleOutsideClick);
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
      border-bottom: 1px solid var(--border-primary);
    `;

    const title = document.createElement('span');
    title.textContent = 'Layer Stack';
    title.style.cssText = 'color: var(--text-primary); font-size: 13px; font-weight: 500;';

    const addBtn = document.createElement('button');
    addBtn.textContent = '+ Add';
    addBtn.title = 'Add current source as new layer';
    addBtn.setAttribute('data-testid', 'stack-add-layer-button');
    addBtn.style.cssText = `
      background: var(--accent-primary);
      border: none;
      color: white;
      padding: 4px 8px;
      border-radius: 3px;
      cursor: pointer;
      font-size: 11px;
    `;
    addBtn.addEventListener('click', () => this.addLayerFromCurrentSource());
    addBtn.addEventListener('mouseenter', () => { addBtn.style.background = 'var(--accent-hover)'; });
    addBtn.addEventListener('mouseleave', () => { addBtn.style.background = 'var(--accent-primary)'; });

    header.appendChild(title);
    header.appendChild(addBtn);
    this.panel.appendChild(header);

    // Layer list container
    this.layerList = document.createElement('div');
    this.layerList.className = 'layer-list';
    this.layerList.setAttribute('data-testid', 'stack-layer-list');
    this.layerList.style.cssText = `
      max-height: 300px;
      overflow-y: auto;
    `;
    this.panel.appendChild(this.layerList);

    // Empty state message
    this.updateLayerList();
  }

  private updateLayerList(): void {
    this.layerList.innerHTML = '';

    if (this.layers.length === 0) {
      const emptyMsg = document.createElement('div');
      emptyMsg.style.cssText = `
        color: var(--text-muted);
        font-size: 12px;
        text-align: center;
        padding: 20px;
      `;
      emptyMsg.textContent = 'No layers. Load media and click "+ Add" to create layers.';
      this.layerList.appendChild(emptyMsg);
      return;
    }

    // Visual Stacking Order:
    // - Array index 0 = bottom layer (rendered first, appears below others)
    // - Array index N = top layer (rendered last, appears above others)
    // We display layers in reverse order so the topmost layer appears at the
    // top of the UI list, matching typical graphics software conventions
    // (e.g., Photoshop, After Effects, OpenRV)
    for (let i = this.layers.length - 1; i >= 0; i--) {
      const layer = this.layers[i]!;
      const layerEl = this.createLayerElement(layer, i);
      this.layerList.appendChild(layerEl);
    }
  }

  private createLayerElement(layer: StackLayer, index: number): HTMLElement {
    const isActive = layer.id === this.activeLayerId;

    const el = document.createElement('div');
    el.className = 'layer-item';
    el.setAttribute('data-testid', `stack-layer-${layer.id}`);
    el.setAttribute('data-layer-index', String(index));
    el.style.cssText = `
      display: flex;
      flex-direction: column;
      gap: 6px;
      padding: 8px;
      background: ${isActive ? 'var(--bg-hover)' : 'var(--bg-tertiary)'};
      border: 1px solid ${isActive ? 'var(--accent-primary)' : 'var(--border-primary)'};
      border-radius: 4px;
      margin-bottom: 6px;
    `;

    // Top row: visibility, name, delete
    const topRow = document.createElement('div');
    topRow.style.cssText = 'display: flex; align-items: center; gap: 8px;';

    // Visibility toggle
    const visBtn = document.createElement('button');
    visBtn.innerHTML = getIconSvg(layer.visible ? 'eye' : 'eye-off', 'sm');
    visBtn.title = layer.visible ? 'Hide layer' : 'Show layer';
    visBtn.setAttribute('data-testid', `stack-layer-visibility-${layer.id}`);
    visBtn.style.cssText = `
      background: none;
      border: none;
      cursor: pointer;
      padding: 2px;
      color: ${layer.visible ? 'var(--text-muted)' : 'var(--border-secondary)'};
      display: flex;
      align-items: center;
    `;
    visBtn.addEventListener('click', (e) => {
      e.stopPropagation(); // Prevent panel from closing when button is clicked
      layer.visible = !layer.visible;
      this.emit('layerChanged', { ...layer });
      this.updateLayerList();
    });

    // Layer name (clickable to select)
    const nameEl = document.createElement('span');
    nameEl.textContent = layer.name;
    nameEl.setAttribute('data-testid', `stack-layer-name-${layer.id}`);
    nameEl.style.cssText = `
      flex: 1;
      color: var(--text-primary);
      font-size: 12px;
      cursor: pointer;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    `;
    nameEl.addEventListener('click', (e) => {
      e.stopPropagation(); // Prevent panel from closing when name is clicked
      this.activeLayerId = layer.id;
      this.emit('activeLayerChanged', layer.id);
      this.updateLayerList();
    });

    // Move up/down buttons
    const moveUp = document.createElement('button');
    moveUp.innerHTML = getIconSvg('chevron-up', 'sm');
    moveUp.title = 'Move up';
    moveUp.setAttribute('data-testid', `stack-layer-move-up-${layer.id}`);
    moveUp.style.cssText = `
      background: transparent;
      border: 1px solid transparent;
      color: var(--text-muted);
      padding: 2px;
      border-radius: 2px;
      cursor: pointer;
      display: flex;
      align-items: center;
    `;
    moveUp.disabled = index === this.layers.length - 1;
    moveUp.style.opacity = moveUp.disabled ? '0.3' : '1';
    moveUp.addEventListener('click', (e) => {
      e.stopPropagation(); // Prevent panel from closing
      if (index < this.layers.length - 1) {
        this.swapLayers(index, index + 1);
      }
    });

    const moveDown = document.createElement('button');
    moveDown.innerHTML = getIconSvg('chevron-down', 'sm');
    moveDown.title = 'Move down';
    moveDown.setAttribute('data-testid', `stack-layer-move-down-${layer.id}`);
    moveDown.style.cssText = `
      background: transparent;
      border: 1px solid transparent;
      color: var(--text-muted);
      padding: 2px;
      border-radius: 2px;
      cursor: pointer;
      display: flex;
      align-items: center;
    `;
    moveDown.disabled = index === 0;
    moveDown.style.opacity = moveDown.disabled ? '0.3' : '1';
    moveDown.addEventListener('click', (e) => {
      e.stopPropagation(); // Prevent panel from closing
      if (index > 0) {
        this.swapLayers(index, index - 1);
      }
    });

    // Delete button
    const deleteBtn = document.createElement('button');
    deleteBtn.innerHTML = getIconSvg('x', 'sm');
    deleteBtn.title = 'Remove layer';
    deleteBtn.setAttribute('data-testid', `stack-layer-delete-${layer.id}`);
    deleteBtn.style.cssText = `
      background: transparent;
      border: 1px solid transparent;
      color: var(--error);
      padding: 2px;
      border-radius: 2px;
      cursor: pointer;
      display: flex;
      align-items: center;
    `;
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation(); // Prevent panel from closing
      this.removeLayer(layer.id);
    });

    topRow.appendChild(visBtn);
    topRow.appendChild(nameEl);
    topRow.appendChild(moveUp);
    topRow.appendChild(moveDown);
    topRow.appendChild(deleteBtn);
    el.appendChild(topRow);

    // Middle row: source selector (only show if multiple sources available)
    if (this.availableSources.length > 1) {
      const sourceRow = document.createElement('div');
      sourceRow.style.cssText = 'display: flex; align-items: center; gap: 8px;';

      const sourceLabel = document.createElement('span');
      sourceLabel.style.cssText = 'color: var(--text-secondary); font-size: 10px;';
      sourceLabel.textContent = 'Source:';

      // Check if current source is valid (exists in available sources)
      const isSourceValid = this.availableSources.some(s => s.index === layer.sourceIndex);

      const sourceSelect = document.createElement('select');
      sourceSelect.setAttribute('data-testid', `stack-layer-source-${layer.id}`);
      sourceSelect.style.cssText = `
        background: ${isSourceValid ? 'var(--border-primary)' : 'rgba(var(--error-rgb, 255, 100, 100), 0.2)'};
        border: 1px solid ${isSourceValid ? 'var(--border-secondary)' : 'var(--error)'};
        color: ${isSourceValid ? 'var(--text-primary)' : 'var(--error)'};
        padding: 3px 6px;
        border-radius: 3px;
        font-size: 11px;
        cursor: pointer;
        flex: 1;
        max-width: 180px;
        overflow: hidden;
        text-overflow: ellipsis;
      `;

      if (!isSourceValid) {
        sourceSelect.title = 'Source no longer available. Please select a valid source.';
      }

      // If source is invalid, add a placeholder option showing the missing source
      if (!isSourceValid && layer.sourceIndex >= 0) {
        const missingOpt = document.createElement('option');
        missingOpt.value = String(layer.sourceIndex);
        missingOpt.textContent = `Source ${layer.sourceIndex} (Missing)`;
        missingOpt.selected = true;
        missingOpt.disabled = true;
        sourceSelect.appendChild(missingOpt);
      }

      for (const source of this.availableSources) {
        const opt = document.createElement('option');
        opt.value = String(source.index);
        opt.textContent = source.name;
        opt.selected = source.index === layer.sourceIndex;
        sourceSelect.appendChild(opt);
      }

      sourceSelect.addEventListener('change', () => {
        const newSourceIndex = parseInt(sourceSelect.value);
        layer.sourceIndex = newSourceIndex;
        // Keep the original layer name - don't change it when source changes
        this.emit('layerSourceChanged', { layerId: layer.id, sourceIndex: newSourceIndex });
        this.emit('layerChanged', { ...layer });
        // Update visual state to remove warning styling if source is now valid
        const nowValid = this.availableSources.some(s => s.index === newSourceIndex);
        if (nowValid) {
          sourceSelect.style.background = 'var(--border-primary)';
          sourceSelect.style.border = '1px solid var(--border-secondary)';
          sourceSelect.style.color = 'var(--text-primary)';
          sourceSelect.title = '';
          // Remove the "(Missing)" option if it exists
          const missingOption = sourceSelect.querySelector('option[disabled]');
          if (missingOption) {
            sourceSelect.removeChild(missingOption);
          }
        }
      });

      sourceRow.appendChild(sourceLabel);
      sourceRow.appendChild(sourceSelect);
      el.appendChild(sourceRow);
    }

    // Bottom row: blend mode and opacity
    const bottomRow = document.createElement('div');
    bottomRow.style.cssText = 'display: flex; align-items: center; gap: 8px;';

    // Blend mode select
    const blendSelect = document.createElement('select');
    blendSelect.setAttribute('data-testid', `stack-layer-blend-${layer.id}`);
    blendSelect.style.cssText = `
      background: var(--border-primary);
      border: 1px solid var(--border-secondary);
      color: var(--text-primary);
      padding: 3px 6px;
      border-radius: 3px;
      font-size: 11px;
      cursor: pointer;
    `;
    for (const mode of BLEND_MODES) {
      const opt = document.createElement('option');
      opt.value = mode;
      opt.textContent = BLEND_MODE_LABELS[mode];
      opt.selected = mode === layer.blendMode;
      blendSelect.appendChild(opt);
    }
    blendSelect.addEventListener('change', () => {
      layer.blendMode = blendSelect.value as BlendMode;
      this.emit('layerChanged', { ...layer });
    });

    // Opacity slider
    const opacityLabel = document.createElement('span');
    opacityLabel.style.cssText = 'color: var(--text-secondary); font-size: 10px;';
    opacityLabel.textContent = 'Opacity:';

    const opacitySlider = document.createElement('input');
    opacitySlider.type = 'range';
    opacitySlider.min = '0';
    opacitySlider.max = '100';
    opacitySlider.value = String(Math.round(layer.opacity * 100));
    opacitySlider.setAttribute('data-testid', `stack-layer-opacity-${layer.id}`);
    opacitySlider.style.cssText = `
      width: 60px;
      height: 4px;
      cursor: pointer;
    `;
    opacitySlider.addEventListener('input', () => {
      layer.opacity = parseInt(opacitySlider.value) / 100;
      opacityValue.textContent = `${opacitySlider.value}%`;
      this.emit('layerChanged', { ...layer });
    });

    const opacityValue = document.createElement('span');
    opacityValue.style.cssText = 'color: var(--text-secondary); font-size: 10px; min-width: 32px;';
    opacityValue.textContent = `${Math.round(layer.opacity * 100)}%`;

    bottomRow.appendChild(blendSelect);
    bottomRow.appendChild(opacityLabel);
    bottomRow.appendChild(opacitySlider);
    bottomRow.appendChild(opacityValue);
    el.appendChild(bottomRow);

    return el;
  }

  private swapLayers(indexA: number, indexB: number): void {
    const temp = this.layers[indexA]!;
    this.layers[indexA] = this.layers[indexB]!;
    this.layers[indexB] = temp;

    this.emit('layerReordered', {
      layerId: temp.id,
      newIndex: indexB,
    });

    this.updateLayerList();
    this.updateButtonState();
  }

  addLayerFromCurrentSource(): void {
    // This will be called from App.ts which has access to the session
    // Emit an event that App can listen to
    const layer: StackLayer = {
      id: `layer_${this.nextLayerId++}`,
      name: `Layer ${this.layers.length + 1}`,
      visible: true,
      opacity: 1,
      blendMode: 'normal',
      sourceIndex: -1, // Will be set by App
    };

    this.layers.push(layer);
    this.activeLayerId = layer.id;

    this.emit('layerAdded', layer);
    this.emit('activeLayerChanged', layer.id);
    this.updateLayerList();
    this.updateButtonState();
  }

  addLayer(layer: Omit<StackLayer, 'id'>): StackLayer {
    const newLayer: StackLayer = {
      ...layer,
      id: `layer_${this.nextLayerId++}`,
    };

    this.layers.push(newLayer);
    if (!this.activeLayerId) {
      this.activeLayerId = newLayer.id;
    }

    this.updateLayerList();
    this.updateButtonState();
    return newLayer;
  }

  removeLayer(layerId: string): void {
    const index = this.layers.findIndex(l => l.id === layerId);
    if (index === -1) return;

    this.layers.splice(index, 1);
    this.emit('layerRemoved', layerId);

    // Update active layer if needed
    if (this.activeLayerId === layerId) {
      this.activeLayerId = this.layers.length > 0 ? this.layers[this.layers.length - 1]!.id : null;
      this.emit('activeLayerChanged', this.activeLayerId);
    }

    this.updateLayerList();
    this.updateButtonState();
  }

  getLayers(): StackLayer[] {
    return [...this.layers];
  }

  getActiveLayer(): StackLayer | null {
    return this.layers.find(l => l.id === this.activeLayerId) ?? null;
  }

  setActiveLayer(layerId: string | null): void {
    this.activeLayerId = layerId;
    this.emit('activeLayerChanged', layerId);
    this.updateLayerList();
  }

  updateLayerName(layerId: string, name: string): void {
    const layer = this.layers.find(l => l.id === layerId);
    if (layer) {
      layer.name = name;
      this.updateLayerList();
    }
  }

  updateLayerSource(layerId: string, sourceIndex: number): void {
    const layer = this.layers.find(l => l.id === layerId);
    if (layer) {
      layer.sourceIndex = sourceIndex;
    }
  }

  /**
   * Set available sources that can be selected for layers
   */
  setAvailableSources(sources: SourceInfo[]): void {
    this.availableSources = [...sources];
    // Update UI if panel is open
    if (this.isPanelOpen) {
      this.updateLayerList();
    }
  }

  getAvailableSources(): SourceInfo[] {
    return [...this.availableSources];
  }

  clearLayers(): void {
    this.layers = [];
    this.activeLayerId = null;
    this.emit('activeLayerChanged', null);
    this.updateLayerList();
    this.updateButtonState();
  }

  private updateButtonState(): void {
    const hasMultipleLayers = this.layers.length > 1;
    if (hasMultipleLayers || this.isPanelOpen) {
      this.stackButton.style.background = 'rgba(var(--accent-primary-rgb), 0.15)';
      this.stackButton.style.borderColor = 'var(--accent-primary)';
      this.stackButton.style.color = 'var(--accent-primary)';
    } else {
      this.stackButton.style.background = 'transparent';
      this.stackButton.style.borderColor = 'transparent';
      this.stackButton.style.color = 'var(--text-muted)';
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
    const rect = this.stackButton.getBoundingClientRect();
    this.panel.style.top = `${rect.bottom + 4}px`;
    this.panel.style.left = `${Math.max(8, rect.right - 280)}px`; // Align right edge, min 8px from left

    this.panel.style.display = 'block';
    this.updateButtonState();
  }

  hidePanel(): void {
    this.isPanelOpen = false;
    this.panel.style.display = 'none';
    this.updateButtonState();
  }

  toggle(): void {
    this.togglePanel();
  }

  render(): HTMLElement {
    return this.container;
  }

  dispose(): void {
    // Remove outside click listener
    document.removeEventListener('click', this.boundHandleOutsideClick);

    // Remove panel from body if present
    if (document.body.contains(this.panel)) {
      document.body.removeChild(this.panel);
    }
  }
}
