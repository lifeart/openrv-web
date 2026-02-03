/**
 * LuminanceVisualizationControl - UI control for luminance visualization modes
 *
 * Provides a dropdown selector for switching between visualization modes
 * with mode-specific sub-controls (band count, contour levels, etc.)
 */

import { LuminanceVisualization, LuminanceVisMode } from './LuminanceVisualization';
import { getIconSvg } from './shared/Icons';

const MODE_LABELS: Record<LuminanceVisMode, string> = {
  'off': 'Off',
  'false-color': 'False Color',
  'hsv': 'HSV',
  'random-color': 'Random Color',
  'contour': 'Contour',
};

export class LuminanceVisualizationControl {
  private container: HTMLElement;
  private dropdown: HTMLElement;
  private toggleButton: HTMLButtonElement;
  private subControlsContainer: HTMLElement;
  private badgeElement: HTMLElement | null = null;
  private luminanceVis: LuminanceVisualization;
  private isDropdownOpen = false;
  private boundHandleReposition: () => void;

  constructor(luminanceVis: LuminanceVisualization) {
    this.luminanceVis = luminanceVis;
    this.boundHandleReposition = () => this.positionDropdown();

    // Create container
    this.container = document.createElement('div');
    this.container.className = 'luminance-vis-control';
    this.container.style.cssText = `
      position: relative;
      display: flex;
      align-items: center;
    `;

    // Create toggle button
    this.toggleButton = document.createElement('button');
    this.toggleButton.className = 'luminance-vis-toggle';
    this.toggleButton.dataset.testid = 'luminance-vis-selector';
    this.toggleButton.innerHTML = `${getIconSvg('contrast', 'sm')} <span>Lum Vis</span> ${getIconSvg('chevron-down', 'sm')}`;
    this.toggleButton.title = 'Luminance Visualization (Shift+Alt+V)';
    this.toggleButton.style.cssText = `
      display: flex;
      align-items: center;
      gap: 4px;
      padding: 6px 10px;
      border: 1px solid transparent;
      border-radius: 4px;
      background: transparent;
      color: var(--text-muted);
      font-size: 12px;
      cursor: pointer;
      transition: all 0.12s ease;
    `;

    this.toggleButton.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleDropdown();
    });

    this.toggleButton.addEventListener('mouseenter', () => {
      if (this.luminanceVis.getMode() === 'off') {
        this.toggleButton.style.background = 'var(--bg-hover)';
        this.toggleButton.style.borderColor = 'var(--border-primary)';
        this.toggleButton.style.color = 'var(--text-primary)';
      }
    });

    this.toggleButton.addEventListener('mouseleave', () => {
      if (this.luminanceVis.getMode() === 'off') {
        this.toggleButton.style.background = 'transparent';
        this.toggleButton.style.color = 'var(--text-muted)';
      }
    });

    this.container.appendChild(this.toggleButton);

    // Create dropdown panel
    this.dropdown = document.createElement('div');
    this.dropdown.className = 'luminance-vis-dropdown';
    this.dropdown.style.cssText = `
      position: fixed;
      background: var(--bg-secondary);
      border: 1px solid var(--border-primary);
      border-radius: 4px;
      padding: 8px;
      min-width: 220px;
      z-index: 9999;
      display: none;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
    `;

    // Sub-controls container (inside dropdown, below mode buttons)
    this.subControlsContainer = document.createElement('div');
    this.subControlsContainer.style.cssText = `
      margin-top: 8px;
      padding-top: 8px;
      border-top: 1px solid var(--border-primary);
    `;

    this.createDropdownContent();
    this.container.appendChild(this.dropdown);

    // Close dropdown on outside click
    document.addEventListener('click', this.handleOutsideClick);

    // Listen for state changes
    this.luminanceVis.on('stateChanged', () => {
      this.updateButtonState();
      this.updateSubControls();
    });
  }

  private createDropdownContent(): void {
    // Mode label
    const modeLabel = document.createElement('div');
    modeLabel.textContent = 'Visualization Mode';
    modeLabel.style.cssText = `
      color: var(--text-secondary);
      font-size: 10px;
      text-transform: uppercase;
      margin-bottom: 6px;
    `;
    this.dropdown.appendChild(modeLabel);

    // Mode buttons
    const modes: LuminanceVisMode[] = ['off', 'false-color', 'hsv', 'random-color', 'contour'];
    const modeGrid = document.createElement('div');
    modeGrid.style.cssText = `
      display: flex;
      flex-direction: column;
      gap: 2px;
    `;

    for (const mode of modes) {
      const btn = document.createElement('button');
      btn.textContent = MODE_LABELS[mode];
      btn.dataset.testid = `luminance-vis-${mode === 'false-color' ? 'false-color' : mode === 'random-color' ? 'random' : mode}`;
      btn.style.cssText = `
        padding: 5px 8px;
        border: 1px solid var(--border-secondary);
        border-radius: 3px;
        background: var(--bg-secondary);
        color: var(--text-secondary);
        font-size: 11px;
        cursor: pointer;
        text-align: left;
        transition: all 0.1s ease;
      `;

      if (this.luminanceVis.getMode() === mode) {
        btn.style.background = 'var(--accent-primary)';
        btn.style.borderColor = 'var(--accent-primary)';
        btn.style.color = '#fff';
      }

      btn.addEventListener('click', () => {
        this.luminanceVis.setMode(mode);
        // Update all buttons
        const buttons = modeGrid.querySelectorAll('button');
        buttons.forEach((b) => {
          b.style.background = 'var(--bg-secondary)';
          b.style.borderColor = 'var(--border-secondary)';
          b.style.color = 'var(--text-secondary)';
        });
        btn.style.background = 'var(--accent-primary)';
        btn.style.borderColor = 'var(--accent-primary)';
        btn.style.color = '#fff';
      });

      modeGrid.appendChild(btn);
    }

    this.dropdown.appendChild(modeGrid);
    this.dropdown.appendChild(this.subControlsContainer);
    this.updateSubControls();
  }

  private updateSubControls(): void {
    this.subControlsContainer.innerHTML = '';
    const mode = this.luminanceVis.getMode();

    if (mode === 'hsv') {
      this.createHSVControls();
    } else if (mode === 'random-color') {
      this.createRandomControls();
    } else if (mode === 'contour') {
      this.createContourControls();
    }
  }

  private createHSVControls(): void {
    // HSV legend bar
    const legend = document.createElement('div');
    legend.dataset.testid = 'hsv-legend';
    legend.style.cssText = `
      height: 16px;
      border-radius: 3px;
      background: linear-gradient(to right,
        hsl(0, 100%, 50%),
        hsl(60, 100%, 50%),
        hsl(120, 100%, 50%),
        hsl(180, 100%, 50%),
        hsl(240, 100%, 50%),
        hsl(300, 100%, 50%)
      );
      border: 1px solid var(--border-primary);
    `;
    this.subControlsContainer.appendChild(legend);

    const legendLabel = document.createElement('div');
    legendLabel.style.cssText = `
      display: flex;
      justify-content: space-between;
      font-size: 9px;
      color: var(--text-secondary);
      margin-top: 2px;
    `;
    legendLabel.innerHTML = '<span>Dark</span><span>Mid</span><span>Bright</span>';
    this.subControlsContainer.appendChild(legendLabel);
  }

  private createRandomControls(): void {
    const state = this.luminanceVis.getState();

    // Band count slider
    const bandRow = document.createElement('div');
    bandRow.style.cssText = `
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 6px;
    `;

    const bandLabel = document.createElement('span');
    bandLabel.dataset.testid = 'random-color-band-label';
    bandLabel.textContent = `${state.randomBandCount} bands`;
    bandLabel.style.cssText = 'color: var(--text-secondary); font-size: 11px; width: 60px;';

    const bandSlider = document.createElement('input');
    bandSlider.type = 'range';
    bandSlider.min = '4';
    bandSlider.max = '64';
    bandSlider.value = String(state.randomBandCount);
    bandSlider.dataset.testid = 'random-color-band-slider';
    bandSlider.style.cssText = 'flex: 1; height: 4px; cursor: pointer; accent-color: var(--accent-primary);';

    bandSlider.addEventListener('input', () => {
      const v = parseInt(bandSlider.value, 10);
      bandLabel.textContent = `${v} bands`;
      this.luminanceVis.setRandomBandCount(v);
    });

    bandRow.appendChild(bandLabel);
    bandRow.appendChild(bandSlider);
    this.subControlsContainer.appendChild(bandRow);

    // Reseed button
    const reseedBtn = document.createElement('button');
    reseedBtn.textContent = 'Reseed';
    reseedBtn.dataset.testid = 'random-color-reseed-btn';
    reseedBtn.style.cssText = `
      padding: 4px 10px;
      border: 1px solid var(--border-secondary);
      border-radius: 3px;
      background: var(--bg-secondary);
      color: var(--text-secondary);
      font-size: 10px;
      cursor: pointer;
    `;
    reseedBtn.addEventListener('click', () => {
      this.luminanceVis.reseedRandom();
    });
    this.subControlsContainer.appendChild(reseedBtn);
  }

  private createContourControls(): void {
    const state = this.luminanceVis.getState();

    // Level count slider
    const levelRow = document.createElement('div');
    levelRow.style.cssText = `
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 6px;
    `;

    const levelLabel = document.createElement('span');
    levelLabel.dataset.testid = 'contour-level-label';
    levelLabel.textContent = `${state.contourLevels} levels`;
    levelLabel.style.cssText = 'color: var(--text-secondary); font-size: 11px; width: 60px;';

    const levelSlider = document.createElement('input');
    levelSlider.type = 'range';
    levelSlider.min = '2';
    levelSlider.max = '50';
    levelSlider.value = String(state.contourLevels);
    levelSlider.dataset.testid = 'contour-level-slider';
    levelSlider.style.cssText = 'flex: 1; height: 4px; cursor: pointer; accent-color: var(--accent-primary);';

    levelSlider.addEventListener('input', () => {
      const v = parseInt(levelSlider.value, 10);
      levelLabel.textContent = `${v} levels`;
      this.luminanceVis.setContourLevels(v);
    });

    levelRow.appendChild(levelLabel);
    levelRow.appendChild(levelSlider);
    this.subControlsContainer.appendChild(levelRow);

    // Preset buttons
    const presetRow = document.createElement('div');
    presetRow.style.cssText = `
      display: flex;
      gap: 4px;
      margin-bottom: 6px;
    `;

    for (const preset of [5, 10, 20, 50]) {
      const btn = document.createElement('button');
      btn.textContent = String(preset);
      btn.dataset.testid = `contour-preset-${preset}`;
      btn.style.cssText = `
        flex: 1;
        padding: 3px 6px;
        border: 1px solid var(--border-secondary);
        border-radius: 3px;
        background: var(--bg-secondary);
        color: var(--text-secondary);
        font-size: 10px;
        cursor: pointer;
      `;
      btn.addEventListener('click', () => {
        this.luminanceVis.setContourLevels(preset);
        levelSlider.value = String(preset);
        levelLabel.textContent = `${preset} levels`;
      });
      presetRow.appendChild(btn);
    }

    this.subControlsContainer.appendChild(presetRow);

    // Desaturate toggle
    const desatRow = document.createElement('div');
    desatRow.style.cssText = `
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 4px;
    `;

    const desatLabel = document.createElement('span');
    desatLabel.textContent = 'Desaturate';
    desatLabel.style.cssText = 'color: var(--text-secondary); font-size: 11px;';

    const desatCheckbox = document.createElement('input');
    desatCheckbox.type = 'checkbox';
    desatCheckbox.checked = state.contourDesaturate;
    desatCheckbox.dataset.testid = 'contour-desaturate-toggle';
    desatCheckbox.style.cssText = 'cursor: pointer; accent-color: var(--accent-primary);';
    desatCheckbox.addEventListener('change', () => {
      this.luminanceVis.setContourDesaturate(desatCheckbox.checked);
    });

    desatRow.appendChild(desatLabel);
    desatRow.appendChild(desatCheckbox);
    this.subControlsContainer.appendChild(desatRow);
  }

  private updateButtonState(): void {
    const mode = this.luminanceVis.getMode();
    if (mode !== 'off') {
      this.toggleButton.style.background = 'rgba(var(--accent-primary-rgb), 0.15)';
      this.toggleButton.style.borderColor = 'var(--accent-primary)';
      this.toggleButton.style.color = 'var(--accent-primary)';
    } else {
      this.toggleButton.style.background = 'transparent';
      this.toggleButton.style.borderColor = 'transparent';
      this.toggleButton.style.color = 'var(--text-muted)';
    }
  }

  private toggleDropdown(): void {
    this.isDropdownOpen = !this.isDropdownOpen;
    if (this.isDropdownOpen) {
      this.dropdown.style.display = 'block';
      this.positionDropdown();
      window.addEventListener('resize', this.boundHandleReposition);
      window.addEventListener('scroll', this.boundHandleReposition, true);
    } else {
      this.dropdown.style.display = 'none';
      window.removeEventListener('resize', this.boundHandleReposition);
      window.removeEventListener('scroll', this.boundHandleReposition, true);
    }
  }

  private positionDropdown(): void {
    const rect = this.toggleButton.getBoundingClientRect();
    this.dropdown.style.top = `${rect.bottom + 4}px`;
    this.dropdown.style.left = `${rect.left}px`;
  }

  private handleOutsideClick = (e: MouseEvent): void => {
    if (!this.container.contains(e.target as Node)) {
      if (this.isDropdownOpen) {
        this.isDropdownOpen = false;
        this.dropdown.style.display = 'none';
        window.removeEventListener('resize', this.boundHandleReposition);
        window.removeEventListener('scroll', this.boundHandleReposition, true);
      }
    }
  };

  /**
   * Create the badge element that shows the active mode on the canvas overlay
   */
  createBadge(): HTMLElement {
    if (this.badgeElement) return this.badgeElement;

    this.badgeElement = document.createElement('div');
    this.badgeElement.dataset.testid = 'luminance-vis-badge';
    this.badgeElement.style.cssText = `
      position: absolute;
      top: 8px;
      left: 8px;
      background: rgba(0, 0, 0, 0.6);
      color: white;
      font-size: 12px;
      padding: 2px 8px;
      border-radius: 3px;
      pointer-events: none;
      z-index: 10;
      display: none;
    `;

    this.luminanceVis.on('stateChanged', (state) => {
      if (!this.badgeElement) return;
      if (state.mode === 'off') {
        this.badgeElement.style.display = 'none';
      } else {
        this.badgeElement.style.display = 'block';
        let text = MODE_LABELS[state.mode];
        if (state.mode === 'random-color') {
          text = `Random (${state.randomBandCount})`;
        } else if (state.mode === 'contour') {
          text = `Contour (${state.contourLevels})`;
        }
        this.badgeElement.textContent = text;
      }
    });

    return this.badgeElement;
  }

  render(): HTMLElement {
    return this.container;
  }

  dispose(): void {
    document.removeEventListener('click', this.handleOutsideClick);
    window.removeEventListener('resize', this.boundHandleReposition);
    window.removeEventListener('scroll', this.boundHandleReposition, true);
  }
}
