/**
 * OCIOControl - OpenColorIO color management UI component
 *
 * Provides a panel for configuring OCIO color pipeline settings including:
 * - Configuration selection (ACES 1.2, sRGB)
 * - Input color space
 * - Working color space
 * - Display and view transforms
 * - Look transforms
 */

import { EventEmitter, EventMap } from '../../utils/EventEmitter';
import {
  OCIOState,
  getAvailableConfigs,
  getInputColorSpaces,
  getWorkingColorSpaces,
  getDisplays,
  getViewsForDisplay,
  getLooks,
  registerCustomConfig,
} from '../../color/OCIOConfig';
import { OCIOProcessor } from '../../color/OCIOProcessor';
import { parseOCIOConfig, validateOCIOConfig } from '../../color/OCIOConfigParser';
import { getIconSvg } from './shared/Icons';
import { DropdownMenu } from './shared/DropdownMenu';

/**
 * OCIO Control events
 */
export interface OCIOControlEvents extends EventMap {
  stateChanged: OCIOState;
  visibilityChanged: boolean;
}

/**
 * localStorage key for OCIO state persistence
 */
const STORAGE_KEY = 'openrv-ocio-state';

/**
 * OCIO Control UI Component
 */
export class OCIOControl extends EventEmitter<OCIOControlEvents> {
  private container: HTMLElement;
  private panel: HTMLElement;
  private toggleButton: HTMLButtonElement;
  private isExpanded = false;

  private processor: OCIOProcessor;

  // Dropdowns
  private configDropdown: DropdownMenu;
  private inputColorSpaceDropdown: DropdownMenu;
  private workingColorSpaceDropdown: DropdownMenu;
  private displayDropdown: DropdownMenu;
  private viewDropdown: DropdownMenu;
  private lookDropdown: DropdownMenu;
  private lookDirectionDropdown: DropdownMenu;

  // Labels for current selections
  private configLabel: HTMLSpanElement;
  private inputColorSpaceLabel: HTMLSpanElement;
  private detectedColorSpaceLabel: HTMLSpanElement;
  private workingColorSpaceLabel: HTMLSpanElement;
  private displayLabel: HTMLSpanElement;
  private viewLabel: HTMLSpanElement;
  private lookLabel: HTMLSpanElement;
  private lookDirectionLabel: HTMLSpanElement;

  // Enable toggle
  private enableToggle: HTMLInputElement;

  // Validation feedback element
  private validationFeedback: HTMLElement | null = null;

  // Timer ID for validation feedback auto-hide
  private feedbackTimer: ReturnType<typeof setTimeout> | null = null;

  // Bound listener for outside-click cleanup
  private outsideClickHandler: ((e: MouseEvent) => void) | null = null;

  constructor(processor?: OCIOProcessor) {
    super();

    this.processor = processor ?? new OCIOProcessor();

    // Create main container
    this.container = document.createElement('div');
    this.container.className = 'ocio-control-container';
    this.container.style.cssText = `
      display: flex;
      align-items: center;
      position: relative;
    `;

    // Create toggle button
    this.toggleButton = document.createElement('button');
    this.toggleButton.innerHTML = `${getIconSvg('palette', 'sm')}<span style="margin-left: 6px;">OCIO</span>`;
    this.toggleButton.title = 'Toggle OCIO color management panel (Shift+O)';
    this.toggleButton.dataset.testid = 'ocio-panel-button';
    this.toggleButton.style.cssText = `
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
      outline: none;
    `;
    this.toggleButton.addEventListener('click', () => this.toggle());
    this.toggleButton.addEventListener('mouseenter', () => {
      if (!this.isExpanded) {
        this.toggleButton.style.background = 'var(--bg-hover)';
        this.toggleButton.style.borderColor = 'var(--border-primary)';
        this.toggleButton.style.color = 'var(--text-primary)';
      }
    });
    this.toggleButton.addEventListener('mouseleave', () => {
      if (!this.isExpanded) {
        this.updateButtonStyle();
      }
    });
    this.container.appendChild(this.toggleButton);

    // Create panel (rendered at body level)
    this.panel = document.createElement('div');
    this.panel.className = 'ocio-panel';
    this.panel.dataset.testid = 'ocio-panel';
    this.panel.setAttribute('role', 'dialog');
    this.panel.setAttribute('aria-label', 'OCIO Color Management Settings');
    this.panel.setAttribute('aria-modal', 'false');
    this.panel.style.cssText = `
      position: fixed;
      background: var(--bg-secondary);
      border: 1px solid var(--border-primary);
      border-radius: 6px;
      padding: 12px;
      min-width: 340px;
      max-height: 80vh;
      overflow-y: auto;
      z-index: 9999;
      display: none;
      box-shadow: 0 8px 24px rgba(0,0,0,0.5);
    `;

    // Initialize dropdowns
    this.configDropdown = new DropdownMenu({ minWidth: '200px' });
    this.inputColorSpaceDropdown = new DropdownMenu({ minWidth: '200px' });
    this.workingColorSpaceDropdown = new DropdownMenu({ minWidth: '200px' });
    this.displayDropdown = new DropdownMenu({ minWidth: '150px' });
    this.viewDropdown = new DropdownMenu({ minWidth: '180px' });
    this.lookDropdown = new DropdownMenu({ minWidth: '150px' });
    this.lookDirectionDropdown = new DropdownMenu({ minWidth: '120px' });

    // Initialize labels
    this.configLabel = document.createElement('span');
    this.inputColorSpaceLabel = document.createElement('span');
    this.detectedColorSpaceLabel = document.createElement('span');
    this.workingColorSpaceLabel = document.createElement('span');
    this.displayLabel = document.createElement('span');
    this.viewLabel = document.createElement('span');
    this.lookLabel = document.createElement('span');
    this.lookDirectionLabel = document.createElement('span');
    this.enableToggle = document.createElement('input');

    this.buildPanel();
    this.setupDropdownHandlers();

    // Load persisted state before updating UI
    this.loadState();

    this.updateUIFromState();

    // Listen to processor state changes
    this.processor.on('stateChanged', (state) => {
      this.updateUIFromState();
      this.updateButtonStyle();
      this.saveState();
      this.emit('stateChanged', state);
    });

    // Close panel on outside click
    this.outsideClickHandler = (e: MouseEvent) => {
      if (
        this.isExpanded &&
        !this.container.contains(e.target as Node) &&
        !this.panel.contains(e.target as Node)
      ) {
        this.hide();
      }
    };
    document.addEventListener('click', this.outsideClickHandler);
  }

  /**
   * Build the panel UI
   */
  private buildPanel(): void {
    // Header
    const header = this.createHeader();
    this.panel.appendChild(header);

    // Config section
    const configSection = this.createSection('Configuration');
    const configRow = this.createSelectRow('Config:', this.configLabel, 'ocio-config-select');
    configSection.appendChild(configRow);

    // Load Config button
    const loadConfigRow = document.createElement('div');
    loadConfigRow.style.cssText = `
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 6px;
      margin-left: 90px;
    `;
    const loadConfigButton = document.createElement('button');
    loadConfigButton.innerHTML = `${getIconSvg('upload', 'sm')}<span style="margin-left: 4px;">Load Config</span>`;
    loadConfigButton.title = 'Load a custom .ocio config file';
    loadConfigButton.dataset.testid = 'ocio-load-config';
    loadConfigButton.style.cssText = `
      background: var(--bg-tertiary);
      border: 1px solid var(--border-primary);
      color: var(--text-primary);
      padding: 4px 10px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 11px;
      display: inline-flex;
      align-items: center;
    `;
    loadConfigButton.addEventListener('mouseenter', () => {
      loadConfigButton.style.background = 'var(--bg-hover)';
    });
    loadConfigButton.addEventListener('mouseleave', () => {
      loadConfigButton.style.background = 'var(--bg-tertiary)';
    });
    loadConfigButton.addEventListener('click', () => this.handleLoadConfig());
    loadConfigRow.appendChild(loadConfigButton);
    configSection.appendChild(loadConfigRow);

    // Drag-and-drop zone
    const dropZone = document.createElement('div');
    dropZone.dataset.testid = 'ocio-drop-zone';
    dropZone.style.cssText = `
      margin: 6px 0 6px 90px;
      padding: 12px;
      border: 2px dashed var(--border-secondary);
      border-radius: 6px;
      text-align: center;
      font-size: 10px;
      color: var(--text-muted);
      cursor: pointer;
      transition: all 0.15s ease;
    `;
    dropZone.textContent = 'Drop .ocio file here';

    dropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropZone.style.borderColor = 'var(--accent-primary)';
      dropZone.style.color = 'var(--accent-primary)';
      dropZone.style.background = 'rgba(var(--accent-primary-rgb), 0.05)';
    });
    dropZone.addEventListener('dragleave', (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropZone.style.borderColor = 'var(--border-secondary)';
      dropZone.style.color = 'var(--text-muted)';
      dropZone.style.background = 'transparent';
    });
    dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropZone.style.borderColor = 'var(--border-secondary)';
      dropZone.style.color = 'var(--text-muted)';
      dropZone.style.background = 'transparent';
      const file = e.dataTransfer?.files[0];
      if (file && /\.ocio$/i.test(file.name)) {
        this.loadConfigFromFile(file);
      } else {
        this.showValidationFeedback('Please drop a .ocio file', 'error');
      }
    });
    dropZone.addEventListener('click', () => this.handleLoadConfig());
    configSection.appendChild(dropZone);

    // Validation feedback area
    this.validationFeedback = document.createElement('div');
    this.validationFeedback.dataset.testid = 'ocio-validation-feedback';
    this.validationFeedback.style.cssText = `
      margin: 0 0 6px 90px;
      padding: 6px 8px;
      border-radius: 4px;
      font-size: 10px;
      display: none;
    `;
    configSection.appendChild(this.validationFeedback);

    this.panel.appendChild(configSection);

    // Input section
    const inputSection = this.createSection('Input');
    const inputRow = this.createSelectRow('Color Space:', this.inputColorSpaceLabel, 'ocio-input-colorspace');
    inputSection.appendChild(inputRow);

    // Detected color space display
    const detectedRow = document.createElement('div');
    detectedRow.style.cssText = `
      display: flex;
      align-items: center;
      gap: 8px;
      margin-top: 4px;
      margin-left: 90px;
    `;
    const detectedPrefix = document.createElement('span');
    detectedPrefix.textContent = 'Detected:';
    detectedPrefix.style.cssText = 'color: var(--text-muted); font-size: 11px;';
    this.detectedColorSpaceLabel.dataset.testid = 'ocio-detected-colorspace';
    this.detectedColorSpaceLabel.style.cssText = 'color: var(--text-secondary); font-size: 11px; font-style: italic;';
    detectedRow.appendChild(detectedPrefix);
    detectedRow.appendChild(this.detectedColorSpaceLabel);
    inputSection.appendChild(detectedRow);
    this.panel.appendChild(inputSection);

    // Working section
    const workingSection = this.createSection('Working');
    const workingRow = this.createSelectRow('Working Space:', this.workingColorSpaceLabel, 'ocio-working-colorspace');
    workingSection.appendChild(workingRow);
    this.panel.appendChild(workingSection);

    // Display section
    const displaySection = this.createSection('Display');
    const displayRow = this.createSelectRow('Display:', this.displayLabel, 'ocio-display-select');
    displaySection.appendChild(displayRow);
    const viewRow = this.createSelectRow('View:', this.viewLabel, 'ocio-view-select');
    displaySection.appendChild(viewRow);
    this.panel.appendChild(displaySection);

    // Look section
    const lookSection = this.createSection('Look');
    const lookRow = this.createSelectRow('Look:', this.lookLabel, 'ocio-look-select');
    lookSection.appendChild(lookRow);
    const directionRow = this.createSelectRow('Direction:', this.lookDirectionLabel, 'ocio-look-direction');
    lookSection.appendChild(directionRow);
    this.panel.appendChild(lookSection);

    // Footer with enable toggle and reset
    const footer = this.createFooter();
    this.panel.appendChild(footer);
  }

  /**
   * Create panel header
   */
  private createHeader(): HTMLElement {
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
    title.textContent = 'OCIO Color Management';
    title.style.cssText = 'font-weight: 600; color: var(--text-primary); font-size: 13px;';

    const closeButton = document.createElement('button');
    closeButton.innerHTML = getIconSvg('x', 'sm');
    closeButton.title = 'Close';
    closeButton.dataset.testid = 'ocio-panel-close';
    closeButton.style.cssText = `
      background: transparent;
      border: none;
      color: var(--text-secondary);
      padding: 4px;
      cursor: pointer;
      border-radius: 4px;
      display: flex;
      align-items: center;
      justify-content: center;
    `;
    closeButton.addEventListener('click', () => this.hide());
    closeButton.addEventListener('mouseenter', () => {
      closeButton.style.background = 'var(--bg-hover)';
      closeButton.style.color = 'var(--text-primary)';
    });
    closeButton.addEventListener('mouseleave', () => {
      closeButton.style.background = 'transparent';
      closeButton.style.color = 'var(--text-secondary)';
    });

    header.appendChild(title);
    header.appendChild(closeButton);
    return header;
  }

  /**
   * Create a section with title
   */
  private createSection(title: string): HTMLElement {
    const section = document.createElement('div');
    section.style.cssText = 'margin-bottom: 12px;';

    const sectionTitle = document.createElement('div');
    sectionTitle.textContent = title;
    sectionTitle.style.cssText = `
      font-size: 11px;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 6px;
      padding-bottom: 4px;
      border-bottom: 1px solid var(--border-secondary);
    `;
    section.appendChild(sectionTitle);

    return section;
  }

  /**
   * Create a select row with label
   */
  private createSelectRow(
    label: string,
    valueLabel: HTMLSpanElement,
    testId: string
  ): HTMLElement {
    const row = document.createElement('div');
    row.setAttribute('role', 'group');
    row.style.cssText = `
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 6px;
    `;

    // Generate unique ID for accessibility
    const buttonId = `ocio-btn-${testId}`;
    const labelId = `ocio-label-${testId}`;

    const labelEl = document.createElement('label');
    labelEl.id = labelId;
    labelEl.textContent = label;
    labelEl.setAttribute('for', buttonId);
    labelEl.style.cssText = `
      color: var(--text-primary);
      font-size: 12px;
      width: 90px;
      flex-shrink: 0;
    `;

    const selectButton = document.createElement('button');
    selectButton.id = buttonId;
    selectButton.dataset.testid = testId;
    selectButton.setAttribute('aria-labelledby', labelId);
    selectButton.setAttribute('aria-haspopup', 'listbox');
    selectButton.setAttribute('aria-expanded', 'false');
    selectButton.setAttribute('type', 'button');
    selectButton.style.cssText = `
      flex: 1;
      background: var(--bg-tertiary);
      border: 1px solid var(--border-primary);
      color: var(--text-primary);
      padding: 6px 10px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
      text-align: left;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 4px;
    `;

    valueLabel.style.cssText = 'flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;';

    const arrow = document.createElement('span');
    arrow.textContent = '\u25BC';
    arrow.setAttribute('aria-hidden', 'true');
    arrow.style.cssText = 'font-size: 8px; color: var(--text-muted);';

    selectButton.appendChild(valueLabel);
    selectButton.appendChild(arrow);

    // Store button reference on label for dropdown handling
    (valueLabel as HTMLSpanElement & { _button?: HTMLButtonElement })._button = selectButton;

    selectButton.addEventListener('mouseenter', () => {
      selectButton.style.borderColor = 'var(--accent-primary)';
    });
    selectButton.addEventListener('mouseleave', () => {
      selectButton.style.borderColor = 'var(--border-primary)';
    });

    row.appendChild(labelEl);
    row.appendChild(selectButton);

    return row;
  }

  /**
   * Create footer with enable toggle and reset
   */
  private createFooter(): HTMLElement {
    const footer = document.createElement('div');
    footer.style.cssText = `
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-top: 16px;
      padding-top: 12px;
      border-top: 1px solid var(--border-primary);
    `;

    // Reset button
    const resetButton = document.createElement('button');
    resetButton.textContent = 'Reset All';
    resetButton.title = 'Reset OCIO to defaults';
    resetButton.dataset.testid = 'ocio-reset-button';
    resetButton.style.cssText = `
      background: var(--bg-tertiary);
      border: 1px solid var(--border-primary);
      color: var(--text-primary);
      padding: 6px 12px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
    `;
    resetButton.addEventListener('click', () => this.reset());
    resetButton.addEventListener('mouseenter', () => {
      resetButton.style.background = 'var(--bg-hover)';
    });
    resetButton.addEventListener('mouseleave', () => {
      resetButton.style.background = 'var(--bg-tertiary)';
    });

    // Enable toggle
    const toggleContainer = document.createElement('label');
    toggleContainer.style.cssText = `
      display: flex;
      align-items: center;
      gap: 8px;
      cursor: pointer;
    `;

    this.enableToggle.type = 'checkbox';
    this.enableToggle.checked = this.processor.isEnabled();
    this.enableToggle.dataset.testid = 'ocio-enable-toggle';
    this.enableToggle.style.cssText = `
      width: 16px;
      height: 16px;
      accent-color: var(--accent-primary);
      cursor: pointer;
    `;
    this.enableToggle.addEventListener('change', () => {
      this.processor.setEnabled(this.enableToggle.checked);
    });

    const toggleLabel = document.createElement('span');
    toggleLabel.textContent = 'Enable OCIO Pipeline';
    toggleLabel.style.cssText = 'font-size: 12px; color: var(--text-primary);';

    toggleContainer.appendChild(this.enableToggle);
    toggleContainer.appendChild(toggleLabel);

    footer.appendChild(resetButton);
    footer.appendChild(toggleContainer);

    return footer;
  }

  /**
   * Setup dropdown event handlers
   */
  private setupDropdownHandlers(): void {
    // Recreate dropdowns with onSelect handlers
    this.configDropdown.dispose();
    this.inputColorSpaceDropdown.dispose();
    this.workingColorSpaceDropdown.dispose();
    this.displayDropdown.dispose();
    this.viewDropdown.dispose();
    this.lookDropdown.dispose();
    this.lookDirectionDropdown.dispose();

    this.configDropdown = new DropdownMenu({
      minWidth: '200px',
      onSelect: (value) => {
        this.processor.loadConfig(value);
      },
    });
    this.inputColorSpaceDropdown = new DropdownMenu({
      minWidth: '200px',
      onSelect: (value) => {
        this.processor.setInputColorSpace(value);
      },
    });
    this.workingColorSpaceDropdown = new DropdownMenu({
      minWidth: '200px',
      onSelect: (value) => {
        this.processor.setWorkingColorSpace(value);
      },
    });
    this.displayDropdown = new DropdownMenu({
      minWidth: '150px',
      onSelect: (value) => {
        this.processor.setDisplay(value);
      },
    });
    this.viewDropdown = new DropdownMenu({
      minWidth: '180px',
      onSelect: (value) => {
        this.processor.setView(value);
      },
    });
    this.lookDropdown = new DropdownMenu({
      minWidth: '150px',
      onSelect: (value) => {
        this.processor.setLook(value);
      },
    });
    this.lookDirectionDropdown = new DropdownMenu({
      minWidth: '120px',
      onSelect: (value) => {
        this.processor.setLookDirection(value as 'forward' | 'inverse');
      },
    });

    // Config dropdown items
    this.configDropdown.setItems(
      getAvailableConfigs().map((c) => ({
        value: c.name,
        label: c.description,
      }))
    );
    this.configDropdown.setSelectedValue(this.processor.getState().configName);

    // Look direction items
    this.lookDirectionDropdown.setItems([
      { value: 'forward', label: 'Forward' },
      { value: 'inverse', label: 'Inverse' },
    ]);

    // Attach click handlers to buttons
    const configButton = (this.configLabel as HTMLSpanElement & { _button?: HTMLButtonElement })._button;
    if (configButton) {
      configButton.addEventListener('click', () => {
        this.configDropdown.toggle(configButton);
      });
    }

    const inputButton = (this.inputColorSpaceLabel as HTMLSpanElement & { _button?: HTMLButtonElement })._button;
    if (inputButton) {
      inputButton.addEventListener('click', () => {
        this.updateInputColorSpaceItems();
        this.inputColorSpaceDropdown.toggle(inputButton);
      });
    }

    const workingButton = (this.workingColorSpaceLabel as HTMLSpanElement & { _button?: HTMLButtonElement })._button;
    if (workingButton) {
      workingButton.addEventListener('click', () => {
        this.updateWorkingColorSpaceItems();
        this.workingColorSpaceDropdown.toggle(workingButton);
      });
    }

    const displayButton = (this.displayLabel as HTMLSpanElement & { _button?: HTMLButtonElement })._button;
    if (displayButton) {
      displayButton.addEventListener('click', () => {
        this.updateDisplayItems();
        this.displayDropdown.toggle(displayButton);
      });
    }

    const viewButton = (this.viewLabel as HTMLSpanElement & { _button?: HTMLButtonElement })._button;
    if (viewButton) {
      viewButton.addEventListener('click', () => {
        this.updateViewItems();
        this.viewDropdown.toggle(viewButton);
      });
    }

    const lookButton = (this.lookLabel as HTMLSpanElement & { _button?: HTMLButtonElement })._button;
    if (lookButton) {
      lookButton.addEventListener('click', () => {
        this.updateLookItems();
        this.lookDropdown.toggle(lookButton);
      });
    }

    const directionButton = (this.lookDirectionLabel as HTMLSpanElement & { _button?: HTMLButtonElement })._button;
    if (directionButton) {
      directionButton.addEventListener('click', () => {
        this.lookDirectionDropdown.toggle(directionButton);
      });
    }
  }

  /**
   * Update input color space dropdown items
   */
  private updateInputColorSpaceItems(): void {
    const state = this.processor.getState();
    this.inputColorSpaceDropdown.setItems(
      getInputColorSpaces(state.configName).map((cs) => ({
        value: cs,
        label: cs,
      }))
    );
    this.inputColorSpaceDropdown.setSelectedValue(state.inputColorSpace);
  }

  /**
   * Update working color space dropdown items
   */
  private updateWorkingColorSpaceItems(): void {
    const state = this.processor.getState();
    this.workingColorSpaceDropdown.setItems(
      getWorkingColorSpaces(state.configName).map((cs) => ({
        value: cs,
        label: cs,
      }))
    );
    this.workingColorSpaceDropdown.setSelectedValue(state.workingColorSpace);
  }

  /**
   * Update display dropdown items
   */
  private updateDisplayItems(): void {
    const state = this.processor.getState();
    this.displayDropdown.setItems(
      getDisplays(state.configName).map((d) => ({
        value: d,
        label: d,
      }))
    );
    this.displayDropdown.setSelectedValue(state.display);
  }

  /**
   * Update view dropdown items
   */
  private updateViewItems(): void {
    const state = this.processor.getState();
    this.viewDropdown.setItems(
      getViewsForDisplay(state.configName, state.display).map((v) => ({
        value: v,
        label: v,
      }))
    );
    this.viewDropdown.setSelectedValue(state.view);
  }

  /**
   * Update look dropdown items
   */
  private updateLookItems(): void {
    const state = this.processor.getState();
    this.lookDropdown.setItems(
      getLooks(state.configName).map((l) => ({
        value: l,
        label: l,
      }))
    );
    this.lookDropdown.setSelectedValue(state.look);
  }

  /**
   * Update UI from processor state
   */
  private updateUIFromState(): void {
    const state = this.processor.getState();

    // Update labels
    const configDef = getAvailableConfigs().find((c) => c.name === state.configName);
    this.configLabel.textContent = configDef?.description ?? state.configName;
    this.inputColorSpaceLabel.textContent = state.inputColorSpace;
    this.detectedColorSpaceLabel.textContent = state.detectedColorSpace ?? 'None';
    this.workingColorSpaceLabel.textContent = state.workingColorSpace;
    this.displayLabel.textContent = state.display;
    this.viewLabel.textContent = state.view;
    this.lookLabel.textContent = state.look;
    this.lookDirectionLabel.textContent = state.lookDirection === 'forward' ? 'Forward' : 'Inverse';

    // Update enable toggle
    this.enableToggle.checked = state.enabled;
  }

  /**
   * Update button style based on enabled state
   */
  private updateButtonStyle(): void {
    const isEnabled = this.processor.isEnabled();
    if (isEnabled) {
      this.toggleButton.style.background = 'rgba(var(--accent-primary-rgb), 0.15)';
      this.toggleButton.style.borderColor = 'var(--accent-primary)';
      this.toggleButton.style.color = 'var(--accent-primary)';
    } else {
      this.toggleButton.style.background = 'transparent';
      this.toggleButton.style.borderColor = 'transparent';
      this.toggleButton.style.color = 'var(--text-muted)';
    }
  }

  // ==========================================================================
  // Custom Config Loading
  // ==========================================================================

  /**
   * Handle loading a custom .ocio config file via file upload dialog.
   */
  private handleLoadConfig(): void {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.ocio,.OCIO';
    input.style.display = 'none';

    const cleanup = () => {
      input.remove();
    };

    input.addEventListener('change', () => {
      const file = input.files?.[0];
      cleanup();
      if (!file) return;
      this.loadConfigFromFile(file);
    });

    // Remove the input from DOM if the user cancels the file dialog.
    // The 'cancel' event fires when the dialog is dismissed without a selection.
    input.addEventListener('cancel', cleanup);

    document.body.appendChild(input);
    input.click();
  }

  /**
   * Load and validate an OCIO config from a File object (used by both file picker and drag-drop).
   */
  private loadConfigFromFile(file: File): void {
    const reader = new FileReader();
    reader.onerror = () => {
      this.showValidationFeedback('Failed to read file', 'error');
    };
    reader.onload = () => {
      try {
        const configText = reader.result as string;

        // Validate before parsing
        const validation = validateOCIOConfig(configText);
        if (!validation.valid) {
          const errors = validation.errors.slice(0, 3).join('; ');
          this.showValidationFeedback(`Invalid config: ${errors}`, 'error');
          return;
        }

        // Show warnings if any
        if (validation.warnings.length > 0) {
          const warnings = validation.warnings.slice(0, 3).join('; ');
          this.showValidationFeedback(`Loaded with warnings: ${warnings}`, 'warning');
        }

        const configName = file.name.replace(/\.ocio$/i, '').replace(/[^a-zA-Z0-9_.-]/g, '_');
        const config = parseOCIOConfig(configText, configName);

        // Register the custom config
        registerCustomConfig(config);

        // Update the config dropdown with new items
        this.refreshConfigDropdown();

        // Load the new config in the processor
        this.processor.loadConfig(config.name);

        if (validation.warnings.length === 0) {
          this.showValidationFeedback(`Loaded "${file.name}" successfully`, 'success');
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Unknown error';
        this.showValidationFeedback(`Load failed: ${msg}`, 'error');
      }
    };
    reader.readAsText(file);
  }

  /**
   * Show validation feedback message
   */
  private showValidationFeedback(message: string, type: 'success' | 'warning' | 'error'): void {
    if (!this.validationFeedback) return;

    const colors: Record<string, { bg: string; border: string; text: string }> = {
      success: { bg: 'rgba(40, 167, 69, 0.1)', border: '#28a745', text: '#28a745' },
      warning: { bg: 'rgba(255, 193, 7, 0.1)', border: '#ffc107', text: '#ffc107' },
      error: { bg: 'rgba(220, 53, 69, 0.1)', border: '#dc3545', text: '#dc3545' },
    };
    const c = colors[type]!;
    this.validationFeedback.textContent = message;
    this.validationFeedback.style.display = 'block';
    this.validationFeedback.style.background = c.bg;
    this.validationFeedback.style.border = `1px solid ${c.border}`;
    this.validationFeedback.style.color = c.text;

    // Clear any existing timer to prevent stacking
    if (this.feedbackTimer) {
      clearTimeout(this.feedbackTimer);
    }

    // Auto-hide after 5 seconds
    this.feedbackTimer = setTimeout(() => {
      if (this.validationFeedback) {
        this.validationFeedback.style.display = 'none';
      }
      this.feedbackTimer = null;
    }, 5000);
  }

  /**
   * Refresh the config dropdown items to include any newly registered custom configs.
   */
  private refreshConfigDropdown(): void {
    this.configDropdown.setItems(
      getAvailableConfigs().map((c) => ({
        value: c.name,
        label: c.description,
      }))
    );
  }

  // ==========================================================================
  // Public API
  // ==========================================================================

  /**
   * Toggle panel visibility
   */
  toggle(): void {
    if (this.isExpanded) {
      this.hide();
    } else {
      this.show();
    }
  }

  /**
   * Show the panel
   */
  show(): void {
    if (this.isExpanded) return;

    // Append to body if not already there
    if (!document.body.contains(this.panel)) {
      document.body.appendChild(this.panel);
    }

    // Position relative to button
    const rect = this.toggleButton.getBoundingClientRect();
    this.panel.style.top = `${rect.bottom + 4}px`;
    this.panel.style.left = `${Math.min(rect.left, window.innerWidth - 360)}px`;

    this.isExpanded = true;
    this.panel.style.display = 'block';
    this.toggleButton.style.background = 'rgba(var(--accent-primary-rgb), 0.15)';
    this.toggleButton.style.borderColor = 'var(--accent-primary)';
    this.toggleButton.style.color = 'var(--accent-primary)';
    this.emit('visibilityChanged', true);
  }

  /**
   * Hide the panel
   */
  hide(): void {
    if (!this.isExpanded) return;

    this.isExpanded = false;
    this.panel.style.display = 'none';
    this.updateButtonStyle();
    this.emit('visibilityChanged', false);
  }

  /**
   * Reset OCIO to defaults
   */
  reset(): void {
    this.processor.reset();
  }

  /**
   * Get current OCIO state
   */
  getState(): OCIOState {
    return this.processor.getState();
  }

  /**
   * Set OCIO state
   */
  setState(state: Partial<OCIOState>): void {
    this.processor.setState(state);
  }

  /**
   * Get the OCIO processor
   */
  getProcessor(): OCIOProcessor {
    return this.processor;
  }

  /**
   * Check if OCIO is enabled
   */
  isEnabled(): boolean {
    return this.processor.isEnabled();
  }

  /**
   * Render the component
   */
  render(): HTMLElement {
    return this.container;
  }

  // ==========================================================================
  // State Persistence
  // ==========================================================================

  /**
   * Load OCIO state from localStorage
   */
  private loadState(): void {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const raw = JSON.parse(stored);
        if (typeof raw !== 'object' || raw === null) return;

        // Only apply known, correctly-typed properties
        const safe: Partial<OCIOState> = {};
        if (typeof raw.enabled === 'boolean') safe.enabled = raw.enabled;
        if (typeof raw.configName === 'string') safe.configName = raw.configName;
        if (typeof raw.inputColorSpace === 'string') safe.inputColorSpace = raw.inputColorSpace;
        if (typeof raw.workingColorSpace === 'string') safe.workingColorSpace = raw.workingColorSpace;
        if (typeof raw.display === 'string') safe.display = raw.display;
        if (typeof raw.view === 'string') safe.view = raw.view;
        if (typeof raw.look === 'string') safe.look = raw.look;
        if (raw.lookDirection === 'forward' || raw.lookDirection === 'inverse') safe.lookDirection = raw.lookDirection;

        if (Object.keys(safe).length > 0) {
          this.processor.setState(safe);
        }
      }
    } catch {
      // localStorage not available or invalid JSON, use defaults
    }
  }

  /**
   * Save OCIO state to localStorage
   */
  private saveState(): void {
    try {
      const state = this.processor.getState();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // localStorage not available
    }
  }

  /**
   * Dispose of resources
   */
  dispose(): void {
    // Remove global document click listener
    if (this.outsideClickHandler) {
      document.removeEventListener('click', this.outsideClickHandler);
      this.outsideClickHandler = null;
    }

    this.configDropdown.dispose();
    this.inputColorSpaceDropdown.dispose();
    this.workingColorSpaceDropdown.dispose();
    this.displayDropdown.dispose();
    this.viewDropdown.dispose();
    this.lookDropdown.dispose();
    this.lookDirectionDropdown.dispose();

    if (document.body.contains(this.panel)) {
      document.body.removeChild(this.panel);
    }

    this.container.remove();
  }
}
