import { EventEmitter, EventMap } from '../../utils/EventEmitter';
import { BlendMode, BLEND_MODES, BLEND_MODE_LABELS } from '../../composite/BlendModes';

export interface StackLayer {
  id: string;
  name: string;
  visible: boolean;
  opacity: number;
  blendMode: BlendMode;
  sourceIndex: number; // Index in session sources array
}

export interface StackControlEvents extends EventMap {
  layerAdded: StackLayer;
  layerRemoved: string; // layer id
  layerChanged: StackLayer;
  layerReordered: { layerId: string; newIndex: number };
  activeLayerChanged: string | null;
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
    this.stackButton.textContent = '📚 Stack';
    this.stackButton.title = 'Layer stack controls';
    this.stackButton.style.cssText = `
      background: #444;
      border: 1px solid #555;
      color: #ddd;
      padding: 6px 12px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 13px;
      transition: all 0.15s ease;
    `;

    this.stackButton.addEventListener('click', () => this.togglePanel());
    this.stackButton.addEventListener('mouseenter', () => {
      this.stackButton.style.background = '#555';
    });
    this.stackButton.addEventListener('mouseleave', () => {
      if (!this.isPanelOpen && this.layers.length <= 1) {
        this.stackButton.style.background = '#444';
      }
    });

    // Create panel
    this.panel = document.createElement('div');
    this.panel.className = 'stack-panel';
    this.panel.style.cssText = `
      position: absolute;
      top: 100%;
      right: 0;
      background: #2a2a2a;
      border: 1px solid #444;
      border-radius: 6px;
      padding: 12px;
      min-width: 280px;
      max-height: 400px;
      z-index: 1000;
      display: none;
      box-shadow: 0 4px 12px rgba(0,0,0,0.4);
      margin-top: 4px;
    `;

    this.createPanelContent();

    this.container.appendChild(this.stackButton);
    this.container.appendChild(this.panel);

    // Close panel on outside click
    document.addEventListener('click', (e) => {
      if (!this.container.contains(e.target as Node)) {
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
    title.textContent = 'Layer Stack';
    title.style.cssText = 'color: #ddd; font-size: 13px; font-weight: 500;';

    const addBtn = document.createElement('button');
    addBtn.textContent = '+ Add';
    addBtn.title = 'Add current source as new layer';
    addBtn.style.cssText = `
      background: #4a9eff;
      border: none;
      color: white;
      padding: 4px 8px;
      border-radius: 3px;
      cursor: pointer;
      font-size: 11px;
    `;
    addBtn.addEventListener('click', () => this.addLayerFromCurrentSource());
    addBtn.addEventListener('mouseenter', () => { addBtn.style.background = '#5aafff'; });
    addBtn.addEventListener('mouseleave', () => { addBtn.style.background = '#4a9eff'; });

    header.appendChild(title);
    header.appendChild(addBtn);
    this.panel.appendChild(header);

    // Layer list container
    this.layerList = document.createElement('div');
    this.layerList.className = 'layer-list';
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
        color: #666;
        font-size: 12px;
        text-align: center;
        padding: 20px;
      `;
      emptyMsg.textContent = 'No layers. Load media and click "+ Add" to create layers.';
      this.layerList.appendChild(emptyMsg);
      return;
    }

    // Render layers from top to bottom (last in array = top of stack)
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
    el.style.cssText = `
      display: flex;
      flex-direction: column;
      gap: 6px;
      padding: 8px;
      background: ${isActive ? '#3a3a3a' : '#333'};
      border: 1px solid ${isActive ? '#4a9eff' : '#444'};
      border-radius: 4px;
      margin-bottom: 6px;
    `;

    // Top row: visibility, name, delete
    const topRow = document.createElement('div');
    topRow.style.cssText = 'display: flex; align-items: center; gap: 8px;';

    // Visibility toggle
    const visBtn = document.createElement('button');
    visBtn.textContent = layer.visible ? '👁' : '👁‍🗨';
    visBtn.title = layer.visible ? 'Hide layer' : 'Show layer';
    visBtn.style.cssText = `
      background: none;
      border: none;
      cursor: pointer;
      font-size: 14px;
      padding: 2px;
      opacity: ${layer.visible ? 1 : 0.5};
    `;
    visBtn.addEventListener('click', () => {
      layer.visible = !layer.visible;
      this.emit('layerChanged', { ...layer });
      this.updateLayerList();
    });

    // Layer name (clickable to select)
    const nameEl = document.createElement('span');
    nameEl.textContent = layer.name;
    nameEl.style.cssText = `
      flex: 1;
      color: #ddd;
      font-size: 12px;
      cursor: pointer;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    `;
    nameEl.addEventListener('click', () => {
      this.activeLayerId = layer.id;
      this.emit('activeLayerChanged', layer.id);
      this.updateLayerList();
    });

    // Move up/down buttons
    const moveUp = document.createElement('button');
    moveUp.textContent = '▲';
    moveUp.title = 'Move up';
    moveUp.style.cssText = `
      background: #444;
      border: 1px solid #555;
      color: #aaa;
      padding: 2px 6px;
      border-radius: 2px;
      cursor: pointer;
      font-size: 10px;
    `;
    moveUp.disabled = index === this.layers.length - 1;
    moveUp.style.opacity = moveUp.disabled ? '0.3' : '1';
    moveUp.addEventListener('click', () => {
      if (index < this.layers.length - 1) {
        this.swapLayers(index, index + 1);
      }
    });

    const moveDown = document.createElement('button');
    moveDown.textContent = '▼';
    moveDown.title = 'Move down';
    moveDown.style.cssText = `
      background: #444;
      border: 1px solid #555;
      color: #aaa;
      padding: 2px 6px;
      border-radius: 2px;
      cursor: pointer;
      font-size: 10px;
    `;
    moveDown.disabled = index === 0;
    moveDown.style.opacity = moveDown.disabled ? '0.3' : '1';
    moveDown.addEventListener('click', () => {
      if (index > 0) {
        this.swapLayers(index, index - 1);
      }
    });

    // Delete button
    const deleteBtn = document.createElement('button');
    deleteBtn.textContent = '✕';
    deleteBtn.title = 'Remove layer';
    deleteBtn.style.cssText = `
      background: #553333;
      border: 1px solid #664444;
      color: #ff8888;
      padding: 2px 6px;
      border-radius: 2px;
      cursor: pointer;
      font-size: 10px;
    `;
    deleteBtn.addEventListener('click', () => this.removeLayer(layer.id));

    topRow.appendChild(visBtn);
    topRow.appendChild(nameEl);
    topRow.appendChild(moveUp);
    topRow.appendChild(moveDown);
    topRow.appendChild(deleteBtn);
    el.appendChild(topRow);

    // Bottom row: blend mode and opacity
    const bottomRow = document.createElement('div');
    bottomRow.style.cssText = 'display: flex; align-items: center; gap: 8px;';

    // Blend mode select
    const blendSelect = document.createElement('select');
    blendSelect.style.cssText = `
      background: #444;
      border: 1px solid #555;
      color: #ddd;
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
    opacityLabel.style.cssText = 'color: #888; font-size: 10px;';
    opacityLabel.textContent = 'Opacity:';

    const opacitySlider = document.createElement('input');
    opacitySlider.type = 'range';
    opacitySlider.min = '0';
    opacitySlider.max = '100';
    opacitySlider.value = String(Math.round(layer.opacity * 100));
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
    opacityValue.style.cssText = 'color: #888; font-size: 10px; min-width: 32px;';
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

  clearLayers(): void {
    this.layers = [];
    this.activeLayerId = null;
    this.emit('activeLayerChanged', null);
    this.updateLayerList();
    this.updateButtonState();
  }

  private updateButtonState(): void {
    const hasMultipleLayers = this.layers.length > 1;
    this.stackButton.style.borderColor = hasMultipleLayers ? '#4a9eff' : '#555';
    this.stackButton.style.color = hasMultipleLayers ? '#4a9eff' : '#ddd';
    this.stackButton.style.background = hasMultipleLayers || this.isPanelOpen ? '#555' : '#444';
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
    // Cleanup if needed
  }
}
