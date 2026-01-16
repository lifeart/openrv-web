import { EventEmitter, EventMap } from '../../utils/EventEmitter';
import { CDLValues, DEFAULT_CDL, isDefaultCDL, parseCDLXML, exportCDLXML } from '../../color/CDL';
import { showAlert } from './shared/Modal';
import { getIconSvg } from './shared/Icons';

export interface CDLControlEvents extends EventMap {
  cdlChanged: CDLValues;
}

export class CDLControl extends EventEmitter<CDLControlEvents> {
  private container: HTMLElement;
  private cdlButton: HTMLButtonElement;
  private panel: HTMLElement;
  private isPanelOpen = false;
  private cdl: CDLValues = JSON.parse(JSON.stringify(DEFAULT_CDL));

  // Slider references for updates
  private sliders: Map<string, HTMLInputElement> = new Map();
  private valueLabels: Map<string, HTMLSpanElement> = new Map();

  constructor() {
    super();

    // Create container
    this.container = document.createElement('div');
    this.container.className = 'cdl-control-container';
    this.container.style.cssText = `
      display: flex;
      align-items: center;
      position: relative;
      margin-left: 8px;
    `;

    // Create CDL button
    this.cdlButton = document.createElement('button');
    this.cdlButton.innerHTML = `${getIconSvg('film-slate', 'sm')}<span style="margin-left: 6px;">CDL</span>`;
    this.cdlButton.title = 'ASC CDL Color Correction';
    this.cdlButton.style.cssText = `
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

    this.cdlButton.addEventListener('click', () => this.togglePanel());
    this.cdlButton.addEventListener('mouseenter', () => {
      if (!this.isPanelOpen) {
        this.cdlButton.style.background = '#3a3a3a';
        this.cdlButton.style.borderColor = '#4a4a4a';
        this.cdlButton.style.color = '#ccc';
      }
    });
    this.cdlButton.addEventListener('mouseleave', () => {
      if (!this.isPanelOpen && isDefaultCDL(this.cdl)) {
        this.cdlButton.style.background = 'transparent';
        this.cdlButton.style.borderColor = 'transparent';
        this.cdlButton.style.color = '#999';
      }
    });

    // Create panel (rendered at body level)
    this.panel = document.createElement('div');
    this.panel.className = 'cdl-panel';
    this.panel.style.cssText = `
      position: fixed;
      background: #2a2a2a;
      border: 1px solid #444;
      border-radius: 6px;
      padding: 12px;
      min-width: 300px;
      max-height: 80vh;
      overflow-y: auto;
      z-index: 9999;
      display: none;
      box-shadow: 0 8px 24px rgba(0,0,0,0.5);
    `;

    this.createPanelContent();

    this.container.appendChild(this.cdlButton);
    // Panel will be appended to body when shown

    // Close panel on outside click
    document.addEventListener('click', (e) => {
      if (this.isPanelOpen && !this.container.contains(e.target as Node) && !this.panel.contains(e.target as Node)) {
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
    title.textContent = 'ASC CDL';
    title.style.cssText = 'color: #ddd; font-size: 13px; font-weight: 500;';

    const buttonGroup = document.createElement('div');
    buttonGroup.style.cssText = 'display: flex; gap: 4px;';

    const loadBtn = this.createSmallButton('Load', () => this.loadCDL());
    const saveBtn = this.createSmallButton('Save', () => this.saveCDL());
    const resetBtn = this.createSmallButton('Reset', () => this.reset());

    buttonGroup.appendChild(loadBtn);
    buttonGroup.appendChild(saveBtn);
    buttonGroup.appendChild(resetBtn);

    header.appendChild(title);
    header.appendChild(buttonGroup);
    this.panel.appendChild(header);

    // Slope section
    this.createSection('Slope', 'slope', 0, 4, 0.01, 1);

    // Offset section
    this.createSection('Offset', 'offset', -1, 1, 0.01, 0);

    // Power section
    this.createSection('Power', 'power', 0.1, 4, 0.01, 1);

    // Saturation slider
    this.createSaturationSlider();
  }

  private createSmallButton(text: string, onClick: () => void): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.textContent = text;
    btn.style.cssText = `
      background: #555;
      border: none;
      color: #aaa;
      padding: 3px 8px;
      border-radius: 3px;
      cursor: pointer;
      font-size: 10px;
    `;
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      onClick();
    });
    btn.addEventListener('mouseenter', () => { btn.style.background = '#666'; });
    btn.addEventListener('mouseleave', () => { btn.style.background = '#555'; });
    return btn;
  }

  private createSection(
    title: string,
    key: 'slope' | 'offset' | 'power',
    min: number,
    max: number,
    step: number,
    defaultValue: number
  ): void {
    const section = document.createElement('div');
    section.style.cssText = 'margin-bottom: 12px;';

    const sectionHeader = document.createElement('div');
    sectionHeader.textContent = title;
    sectionHeader.style.cssText = `
      color: #888;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 6px;
    `;
    section.appendChild(sectionHeader);

    const channels: Array<{ label: string; channel: 'r' | 'g' | 'b'; color: string }> = [
      { label: 'R', channel: 'r', color: '#ff6b6b' },
      { label: 'G', channel: 'g', color: '#6bff6b' },
      { label: 'B', channel: 'b', color: '#6b6bff' },
    ];

    for (const ch of channels) {
      const row = this.createChannelSlider(key, ch.channel, ch.label, ch.color, min, max, step, defaultValue);
      section.appendChild(row);
    }

    this.panel.appendChild(section);
  }

  private createChannelSlider(
    key: 'slope' | 'offset' | 'power',
    channel: 'r' | 'g' | 'b',
    label: string,
    color: string,
    min: number,
    max: number,
    step: number,
    defaultValue: number
  ): HTMLElement {
    const row = document.createElement('div');
    row.style.cssText = `
      display: flex;
      align-items: center;
      margin-bottom: 4px;
      gap: 8px;
    `;

    const labelEl = document.createElement('span');
    labelEl.textContent = label;
    labelEl.style.cssText = `
      color: ${color};
      font-size: 11px;
      font-weight: bold;
      width: 12px;
    `;

    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = String(min);
    slider.max = String(max);
    slider.step = String(step);
    slider.value = String(defaultValue);
    slider.style.cssText = `
      flex: 1;
      height: 4px;
      -webkit-appearance: none;
      background: #444;
      border-radius: 2px;
      outline: none;
      cursor: pointer;
    `;

    const valueEl = document.createElement('span');
    valueEl.textContent = defaultValue.toFixed(2);
    valueEl.style.cssText = `
      color: #888;
      font-size: 10px;
      width: 40px;
      text-align: right;
    `;

    const sliderId = `${key}-${channel}`;
    this.sliders.set(sliderId, slider);
    this.valueLabels.set(sliderId, valueEl);

    slider.addEventListener('input', () => {
      const value = parseFloat(slider.value);
      valueEl.textContent = value.toFixed(2);
      this.cdl[key][channel] = value;
      this.emitChange();
    });

    // Double-click to reset
    slider.addEventListener('dblclick', () => {
      slider.value = String(defaultValue);
      valueEl.textContent = defaultValue.toFixed(2);
      this.cdl[key][channel] = defaultValue;
      this.emitChange();
    });

    row.appendChild(labelEl);
    row.appendChild(slider);
    row.appendChild(valueEl);

    return row;
  }

  private createSaturationSlider(): void {
    const section = document.createElement('div');
    section.style.cssText = `
      margin-top: 12px;
      padding-top: 12px;
      border-top: 1px solid #444;
    `;

    const row = document.createElement('div');
    row.style.cssText = `
      display: flex;
      align-items: center;
      gap: 8px;
    `;

    const labelEl = document.createElement('span');
    labelEl.textContent = 'Saturation';
    labelEl.style.cssText = 'color: #aaa; font-size: 12px; width: 70px;';

    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = '0';
    slider.max = '2';
    slider.step = '0.01';
    slider.value = '1';
    slider.style.cssText = `
      flex: 1;
      height: 4px;
      -webkit-appearance: none;
      background: #444;
      border-radius: 2px;
      outline: none;
      cursor: pointer;
    `;

    const valueEl = document.createElement('span');
    valueEl.textContent = '1.00';
    valueEl.style.cssText = `
      color: #888;
      font-size: 10px;
      width: 40px;
      text-align: right;
    `;

    this.sliders.set('saturation', slider);
    this.valueLabels.set('saturation', valueEl);

    slider.addEventListener('input', () => {
      const value = parseFloat(slider.value);
      valueEl.textContent = value.toFixed(2);
      this.cdl.saturation = value;
      this.emitChange();
    });

    slider.addEventListener('dblclick', () => {
      slider.value = '1';
      valueEl.textContent = '1.00';
      this.cdl.saturation = 1;
      this.emitChange();
    });

    row.appendChild(labelEl);
    row.appendChild(slider);
    row.appendChild(valueEl);
    section.appendChild(row);
    this.panel.appendChild(section);
  }

  private emitChange(): void {
    this.emit('cdlChanged', JSON.parse(JSON.stringify(this.cdl)));
    this.updateButtonState();
  }

  private updateButtonState(): void {
    const isActive = !isDefaultCDL(this.cdl);
    if (isActive || this.isPanelOpen) {
      this.cdlButton.style.background = 'rgba(74, 158, 255, 0.15)';
      this.cdlButton.style.borderColor = '#4a9eff';
      this.cdlButton.style.color = '#4a9eff';
    } else {
      this.cdlButton.style.background = 'transparent';
      this.cdlButton.style.borderColor = 'transparent';
      this.cdlButton.style.color = '#999';
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
    // Append to body if not already there
    if (!document.body.contains(this.panel)) {
      document.body.appendChild(this.panel);
    }

    // Position relative to button
    const rect = this.cdlButton.getBoundingClientRect();
    this.panel.style.top = `${rect.bottom + 4}px`;
    this.panel.style.left = `${Math.max(8, rect.right - 320)}px`;

    this.isPanelOpen = true;
    this.panel.style.display = 'block';
    this.updateButtonState();
  }

  hidePanel(): void {
    this.isPanelOpen = false;
    this.panel.style.display = 'none';
    this.updateButtonState();
  }

  reset(): void {
    this.cdl = JSON.parse(JSON.stringify(DEFAULT_CDL));

    // Update all sliders
    for (const key of ['slope', 'offset', 'power'] as const) {
      for (const ch of ['r', 'g', 'b'] as const) {
        const sliderId = `${key}-${ch}`;
        const slider = this.sliders.get(sliderId);
        const valueEl = this.valueLabels.get(sliderId);
        const defaultVal = DEFAULT_CDL[key][ch];
        if (slider) slider.value = String(defaultVal);
        if (valueEl) valueEl.textContent = defaultVal.toFixed(2);
      }
    }

    const satSlider = this.sliders.get('saturation');
    const satValue = this.valueLabels.get('saturation');
    if (satSlider) satSlider.value = '1';
    if (satValue) satValue.textContent = '1.00';

    this.emitChange();
  }

  private async loadCDL(): Promise<void> {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.cdl,.xml';

    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;

      try {
        const text = await file.text();
        const parsed = parseCDLXML(text);
        if (parsed) {
          this.setCDL(parsed);
        } else {
          showAlert('Failed to parse CDL file', { type: 'error', title: 'CDL Error' });
        }
      } catch (err) {
        showAlert(`Error loading CDL: ${err}`, { type: 'error', title: 'CDL Error' });
      }
    };

    input.click();
  }

  private saveCDL(): void {
    const xml = exportCDLXML(this.cdl);
    const blob = new Blob([xml], { type: 'application/xml' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = 'grade.cdl';
    a.click();

    URL.revokeObjectURL(url);
  }

  setCDL(cdl: CDLValues): void {
    this.cdl = JSON.parse(JSON.stringify(cdl));

    // Update all sliders
    for (const key of ['slope', 'offset', 'power'] as const) {
      for (const ch of ['r', 'g', 'b'] as const) {
        const sliderId = `${key}-${ch}`;
        const slider = this.sliders.get(sliderId);
        const valueEl = this.valueLabels.get(sliderId);
        const val = cdl[key][ch];
        if (slider) slider.value = String(val);
        if (valueEl) valueEl.textContent = val.toFixed(2);
      }
    }

    const satSlider = this.sliders.get('saturation');
    const satValue = this.valueLabels.get('saturation');
    if (satSlider) satSlider.value = String(cdl.saturation);
    if (satValue) satValue.textContent = cdl.saturation.toFixed(2);

    this.emitChange();
  }

  getCDL(): CDLValues {
    return JSON.parse(JSON.stringify(this.cdl));
  }

  render(): HTMLElement {
    return this.container;
  }

  dispose(): void {
    // Cleanup if needed
  }
}
