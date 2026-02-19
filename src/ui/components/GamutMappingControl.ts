import { EventEmitter, EventMap } from '../../utils/EventEmitter';
import { getIconSvg } from './shared/Icons';
import { applyA11yFocus } from './shared/Button';
import type { GamutMappingState, GamutMappingMode, GamutIdentifier } from '../../core/types/effects';
import { DEFAULT_GAMUT_MAPPING_STATE } from '../../core/types/effects';

export { DEFAULT_GAMUT_MAPPING_STATE };
export type { GamutMappingState };

export interface GamutMappingControlEvents extends EventMap {
  gamutMappingChanged: GamutMappingState;
}

const MODE_LABELS: Record<GamutMappingMode, string> = {
  off: 'Off',
  clip: 'Clip',
  compress: 'Soft Compress',
};

const GAMUT_LABELS: Record<GamutIdentifier, string> = {
  srgb: 'sRGB / Rec.709',
  'rec2020': 'Rec.2020',
  'display-p3': 'Display P3',
};

/**
 * Gamut width ordering (higher = wider).
 * The shader only has matrices for wider→narrower conversions
 * (Rec.2020→sRGB, Rec.2020→P3, P3→sRGB), so the UI must restrict
 * target gamut options to gamuts narrower than the selected source.
 */
const GAMUT_WIDTH: Record<GamutIdentifier, number> = {
  srgb: 0,
  'display-p3': 1,
  'rec2020': 2,
};

/**
 * Get valid target gamut options for a given source gamut.
 * Only gamuts narrower than the source are valid (wider→narrower conversion).
 */
export function getValidTargetGamuts(source: GamutIdentifier): GamutIdentifier[] {
  const sourceWidth = GAMUT_WIDTH[source];
  return (Object.keys(GAMUT_WIDTH) as GamutIdentifier[]).filter(
    (g) => GAMUT_WIDTH[g] < sourceWidth,
  );
}

export class GamutMappingControl extends EventEmitter<GamutMappingControlEvents> {
  private container: HTMLElement;
  private button: HTMLButtonElement;
  private panel: HTMLElement;
  private isPanelOpen = false;
  private state: GamutMappingState = { ...DEFAULT_GAMUT_MAPPING_STATE };

  private modeSelect: HTMLSelectElement | null = null;
  private sourceSelect: HTMLSelectElement | null = null;
  private targetSelect: HTMLSelectElement | null = null;
  private highlightCheckbox: HTMLInputElement | null = null;

  private boundHandleDocumentClick: (e: MouseEvent) => void;
  private readonly boundHandleKeyDown: (e: KeyboardEvent) => void;
  private readonly boundHandleReposition: () => void;

  constructor() {
    super();

    this.container = document.createElement('div');
    this.container.className = 'gamut-mapping-control-container';
    this.container.style.cssText = `
      display: flex;
      align-items: center;
      position: relative;
    `;

    this.button = document.createElement('button');
    this.button.innerHTML = `${getIconSvg('gamut', 'sm')}<span style="margin-left: 6px;">Gamut</span>`;
    this.button.dataset.testid = 'gamut-mapping-control-button';
    this.button.title = 'Gamut mapping (source \u2192 target gamut conversion)';
    this.button.setAttribute('aria-haspopup', 'dialog');
    this.button.setAttribute('aria-expanded', 'false');
    this.button.style.cssText = `
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

    this.button.addEventListener('click', () => this.toggle());
    this.button.addEventListener('mouseenter', () => {
      if (!this.isPanelOpen) {
        this.button.style.background = 'var(--bg-hover)';
        this.button.style.borderColor = 'var(--border-primary)';
        this.button.style.color = 'var(--text-primary)';
      }
    });
    this.button.addEventListener('mouseleave', () => {
      if (!this.isPanelOpen) {
        if (this.state.mode === 'off') {
          this.button.style.background = 'transparent';
          this.button.style.borderColor = 'transparent';
          this.button.style.color = 'var(--text-muted)';
        } else {
          this.updateButtonState();
        }
      }
    });

    applyA11yFocus(this.button);

    this.panel = document.createElement('div');
    this.panel.className = 'gamut-mapping-panel';
    this.panel.dataset.testid = 'gamut-mapping-panel';
    this.panel.setAttribute('role', 'dialog');
    this.panel.setAttribute('aria-label', 'Gamut Mapping Settings');
    this.panel.style.cssText = `
      position: fixed;
      background: var(--bg-secondary);
      border: 1px solid var(--border-primary);
      border-radius: 6px;
      padding: 12px;
      min-width: 220px;
      z-index: 9999;
      display: none;
      box-shadow: 0 8px 24px rgba(0,0,0,0.5);
    `;

    this.createPanelContent();
    this.container.appendChild(this.button);

    this.boundHandleDocumentClick = this.handleDocumentClick.bind(this);
    document.addEventListener('click', this.boundHandleDocumentClick);

    // Close on Escape key
    this.boundHandleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && this.isPanelOpen) {
        this.hide();
      }
    };

    // Reposition on scroll/resize
    this.boundHandleReposition = () => {
      if (this.isPanelOpen) {
        const rect = this.button.getBoundingClientRect();
        this.panel.style.top = `${rect.bottom + 4}px`;
        this.panel.style.left = `${Math.max(8, rect.right - 240)}px`;
      }
    };
  }

  private handleDocumentClick(e: MouseEvent): void {
    if (this.isPanelOpen && !this.container.contains(e.target as Node) && !this.panel.contains(e.target as Node)) {
      this.hide();
    }
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
    title.textContent = 'Gamut Mapping';
    title.style.cssText = 'color: var(--text-primary); font-size: 13px; font-weight: 500;';

    const resetBtn = document.createElement('button');
    resetBtn.textContent = 'Reset';
    resetBtn.dataset.testid = 'gamut-mapping-reset-button';
    resetBtn.style.cssText = `
      background: var(--border-secondary);
      border: none;
      color: var(--text-secondary);
      padding: 4px 8px;
      border-radius: 3px;
      cursor: pointer;
      font-size: 11px;
    `;
    resetBtn.addEventListener('click', () => this.reset());
    resetBtn.addEventListener('mouseenter', () => { resetBtn.style.background = 'var(--text-muted)'; });
    resetBtn.addEventListener('mouseleave', () => { resetBtn.style.background = 'var(--border-secondary)'; });

    header.appendChild(title);
    header.appendChild(resetBtn);
    this.panel.appendChild(header);

    // Mode dropdown
    const modeRow = this.createSelectRow('Mode', Object.entries(MODE_LABELS), this.state.mode, (value) => {
      this.state.mode = value as GamutMappingMode;
      this.updateGamutSelectsEnabled();
      this.emitChange();
    });
    this.modeSelect = modeRow.select;
    this.modeSelect.dataset.testid = 'gamut-mapping-mode-select';
    this.panel.appendChild(modeRow.container);

    // Source gamut dropdown
    const sourceRow = this.createSelectRow('Source Gamut', Object.entries(GAMUT_LABELS), this.state.sourceGamut, (value) => {
      this.state.sourceGamut = value as GamutIdentifier;
      this.updateTargetGamutOptions();
      this.emitChange();
    });
    this.sourceSelect = sourceRow.select;
    this.sourceSelect.dataset.testid = 'gamut-mapping-source-select';
    this.panel.appendChild(sourceRow.container);

    // Target gamut dropdown — initially populated, then dynamically filtered
    const validTargets = getValidTargetGamuts(this.state.sourceGamut);
    const targetOptions: [string, string][] = validTargets.map((g) => [g, GAMUT_LABELS[g]]);
    const targetRow = this.createSelectRow('Target Gamut', targetOptions, this.state.targetGamut, (value) => {
      this.state.targetGamut = value as GamutIdentifier;
      this.emitChange();
    });
    this.targetSelect = targetRow.select;
    this.targetSelect.dataset.testid = 'gamut-mapping-target-select';
    this.panel.appendChild(targetRow.container);

    // Highlight out-of-gamut checkbox
    const highlightRow = document.createElement('div');
    highlightRow.style.cssText = 'margin-bottom: 12px; display: flex; align-items: center; gap: 8px;';

    this.highlightCheckbox = document.createElement('input');
    this.highlightCheckbox.type = 'checkbox';
    this.highlightCheckbox.checked = this.state.highlightOutOfGamut ?? false;
    this.highlightCheckbox.dataset.testid = 'gamut-mapping-highlight-checkbox';
    this.highlightCheckbox.style.cssText = 'cursor: pointer; margin: 0;';
    this.highlightCheckbox.addEventListener('change', () => {
      this.state.highlightOutOfGamut = this.highlightCheckbox!.checked;
      this.emitChange();
    });

    const highlightLabel = document.createElement('label');
    highlightLabel.textContent = 'Highlight out-of-gamut pixels';
    highlightLabel.style.cssText = 'color: var(--text-secondary); font-size: 12px; cursor: pointer; user-select: none;';
    highlightLabel.addEventListener('click', () => {
      this.highlightCheckbox!.checked = !this.highlightCheckbox!.checked;
      this.state.highlightOutOfGamut = this.highlightCheckbox!.checked;
      this.emitChange();
    });

    highlightRow.appendChild(this.highlightCheckbox);
    highlightRow.appendChild(highlightLabel);
    this.panel.appendChild(highlightRow);

    this.updateGamutSelectsEnabled();
  }

  private createSelectRow(label: string, options: [string, string][], initialValue: string, onChange: (value: string) => void): { container: HTMLElement; select: HTMLSelectElement } {
    const row = document.createElement('div');
    row.style.cssText = 'margin-bottom: 12px;';

    const labelEl = document.createElement('div');
    labelEl.textContent = label;
    labelEl.style.cssText = 'color: var(--text-secondary); font-size: 12px; margin-bottom: 4px;';

    const select = document.createElement('select');
    select.style.cssText = `
      width: 100%;
      background: var(--bg-tertiary);
      border: 1px solid var(--border-primary);
      color: var(--text-primary);
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 12px;
      cursor: pointer;
    `;

    for (const [value, text] of options) {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = text;
      if (value === initialValue) option.selected = true;
      select.appendChild(option);
    }

    select.addEventListener('change', () => onChange(select.value));

    row.appendChild(labelEl);
    row.appendChild(select);

    return { container: row, select };
  }

  private updateGamutSelectsEnabled(): void {
    const disabled = this.state.mode === 'off';
    if (this.sourceSelect) {
      this.sourceSelect.disabled = disabled;
      this.sourceSelect.style.opacity = disabled ? '0.5' : '1';
    }
    if (this.targetSelect) {
      const validTargets = getValidTargetGamuts(this.state.sourceGamut);
      const noTargets = validTargets.length === 0;
      this.targetSelect.disabled = disabled || noTargets;
      this.targetSelect.style.opacity = (disabled || noTargets) ? '0.5' : '1';
    }
    if (this.highlightCheckbox) {
      this.highlightCheckbox.disabled = disabled;
      this.highlightCheckbox.style.opacity = disabled ? '0.5' : '1';
    }
  }

  /**
   * Rebuild target gamut <option> elements based on current source gamut.
   * Only gamuts narrower than the source are shown (shader only has wider→narrower matrices).
   * If the current target is no longer valid, reset it to sRGB or the first valid option.
   */
  private updateTargetGamutOptions(): void {
    if (!this.targetSelect) return;

    const validTargets = getValidTargetGamuts(this.state.sourceGamut);

    // Remove existing options
    while (this.targetSelect.options.length > 0) {
      this.targetSelect.remove(0);
    }

    // Populate with valid options
    for (const g of validTargets) {
      const option = document.createElement('option');
      option.value = g;
      option.textContent = GAMUT_LABELS[g];
      this.targetSelect.appendChild(option);
    }

    // If current target is not in the valid list, reset to first valid or srgb
    if (!validTargets.includes(this.state.targetGamut)) {
      this.state.targetGamut = validTargets[0] ?? 'srgb';
    }
    this.targetSelect.value = this.state.targetGamut;

    // Update enabled/disabled state (no targets = disabled)
    this.updateGamutSelectsEnabled();
  }

  private emitChange(): void {
    this.emit('gamutMappingChanged', { ...this.state });
    this.updateButtonState();
  }

  private updateButtonState(): void {
    const isActive = this.state.mode !== 'off' && this.state.sourceGamut !== this.state.targetGamut;
    if (isActive || this.isPanelOpen) {
      this.button.style.background = 'rgba(var(--accent-primary-rgb), 0.15)';
      this.button.style.borderColor = 'var(--accent-primary)';
      this.button.style.color = 'var(--accent-primary)';
    } else {
      this.button.style.background = 'transparent';
      this.button.style.borderColor = 'transparent';
      this.button.style.color = 'var(--text-muted)';
    }
  }

  toggle(): void {
    if (this.isPanelOpen) {
      this.hide();
    } else {
      this.show();
    }
  }

  show(): void {
    if (!document.body.contains(this.panel)) {
      document.body.appendChild(this.panel);
    }
    const rect = this.button.getBoundingClientRect();
    this.panel.style.top = `${rect.bottom + 4}px`;
    this.panel.style.left = `${Math.max(8, rect.right - 240)}px`;
    this.isPanelOpen = true;
    this.panel.style.display = 'block';
    this.button.setAttribute('aria-expanded', 'true');
    this.updateButtonState();
    document.addEventListener('keydown', this.boundHandleKeyDown);
    window.addEventListener('scroll', this.boundHandleReposition, true);
    window.addEventListener('resize', this.boundHandleReposition);

    // Move focus to the first interactive element in the panel
    this.modeSelect?.focus();
  }

  hide(): void {
    this.isPanelOpen = false;
    this.panel.style.display = 'none';
    this.button.setAttribute('aria-expanded', 'false');
    this.updateButtonState();
    document.removeEventListener('keydown', this.boundHandleKeyDown);
    window.removeEventListener('scroll', this.boundHandleReposition, true);
    window.removeEventListener('resize', this.boundHandleReposition);

    // Return focus to the toggle button
    this.button.focus();
  }

  reset(): void {
    this.state = { ...DEFAULT_GAMUT_MAPPING_STATE };
    if (this.modeSelect) this.modeSelect.value = 'off';
    if (this.sourceSelect) this.sourceSelect.value = 'srgb';
    if (this.highlightCheckbox) this.highlightCheckbox.checked = false;
    this.updateTargetGamutOptions();
    this.updateGamutSelectsEnabled();
    this.emitChange();
  }

  getState(): GamutMappingState {
    return { ...this.state };
  }

  setState(state: GamutMappingState): void {
    this.state = { ...state };
    if (this.modeSelect) this.modeSelect.value = state.mode;
    if (this.sourceSelect) this.sourceSelect.value = state.sourceGamut;
    if (this.highlightCheckbox) this.highlightCheckbox.checked = state.highlightOutOfGamut ?? false;
    this.updateTargetGamutOptions();
    this.updateGamutSelectsEnabled();
    this.updateButtonState();
  }

  get isOpen(): boolean {
    return this.isPanelOpen;
  }

  render(): HTMLElement {
    return this.container;
  }

  dispose(): void {
    document.removeEventListener('keydown', this.boundHandleKeyDown);
    document.removeEventListener('click', this.boundHandleDocumentClick);
    window.removeEventListener('scroll', this.boundHandleReposition, true);
    window.removeEventListener('resize', this.boundHandleReposition);
    if (this.panel.parentNode) {
      this.panel.parentNode.removeChild(this.panel);
    }
  }
}
