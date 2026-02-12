/**
 * BackgroundPatternControl - Background pattern selector for alpha visualization.
 *
 * Provides a dropdown in the View tab for selecting background patterns
 * (black, grey18, grey50, white, checker, crosshatch, custom) that render
 * behind images to reveal transparency/alpha regions.
 */

import { EventEmitter, EventMap } from '../../utils/EventEmitter';
import { getIconSvg } from './shared/Icons';
import { applyA11yFocus } from './shared/Button';

export type { BackgroundPatternType, BackgroundPatternState } from '../../core/types/background';
export { DEFAULT_BACKGROUND_PATTERN_STATE, PATTERN_COLORS } from '../../core/types/background';

import type { BackgroundPatternType, BackgroundPatternState } from '../../core/types/background';
import { DEFAULT_BACKGROUND_PATTERN_STATE, PATTERN_COLORS } from '../../core/types/background';

/** Cycle order for Shift+B */
const CYCLE_ORDER: BackgroundPatternType[] = ['black', 'grey18', 'grey50', 'checker'];

export interface BackgroundPatternControlEvents extends EventMap {
  stateChanged: BackgroundPatternState;
}

export class BackgroundPatternControl extends EventEmitter<BackgroundPatternControlEvents> {
  private container: HTMLElement;
  private button: HTMLButtonElement;
  private dropdown: HTMLElement;
  private state: BackgroundPatternState = { ...DEFAULT_BACKGROUND_PATTERN_STATE };
  private isOpen = false;
  private boundHandleOutsideClick: (e: MouseEvent) => void;
  private boundHandleReposition: () => void;
  /** Tracks previous pattern before toggling to checker, for toggle-back */
  private previousPattern: BackgroundPatternType = 'black';

  constructor() {
    super();

    this.boundHandleOutsideClick = (e: MouseEvent) => this.handleOutsideClick(e);
    this.boundHandleReposition = () => this.positionDropdown();

    this.container = document.createElement('div');
    this.container.className = 'background-pattern-control';
    this.container.dataset.testid = 'background-pattern-control';
    this.container.style.cssText = `
      display: flex;
      align-items: center;
      position: relative;
    `;

    // Create toggle button
    this.button = document.createElement('button');
    this.button.dataset.testid = 'background-pattern-button';
    this.button.title = 'Background Pattern (Shift+B)';
    this.button.setAttribute('aria-haspopup', 'true');
    this.button.setAttribute('aria-expanded', 'false');
    this.button.setAttribute('aria-label', 'Background Pattern');
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
      min-width: 64px;
      gap: 4px;
      outline: none;
    `;
    this.updateButtonLabel();

    this.button.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleDropdown();
    });

    this.button.addEventListener('mouseenter', () => {
      if (!this.isOpen && !this.isActive()) {
        this.button.style.background = 'var(--bg-hover)';
        this.button.style.borderColor = 'var(--border-primary)';
        this.button.style.color = 'var(--text-primary)';
      }
    });

    this.button.addEventListener('mouseleave', () => {
      if (!this.isOpen && !this.isActive()) {
        this.button.style.background = 'transparent';
        this.button.style.borderColor = 'transparent';
        this.button.style.color = 'var(--text-muted)';
      }
    });

    applyA11yFocus(this.button);

    this.container.appendChild(this.button);

    // Create dropdown
    this.dropdown = document.createElement('div');
    this.dropdown.dataset.testid = 'background-pattern-dropdown';
    this.dropdown.setAttribute('role', 'radiogroup');
    this.dropdown.setAttribute('aria-label', 'Background pattern options');
    this.dropdown.style.cssText = `
      display: none;
      position: fixed;
      background: var(--bg-secondary);
      border: 1px solid var(--border-primary);
      border-radius: 6px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
      z-index: 9999;
      min-width: 220px;
      padding: 6px 0;
      flex-direction: column;
    `;
    this.buildDropdown();
  }

  private buildDropdown(): void {
    this.dropdown.innerHTML = '';

    // Section header: Solid Colors
    this.dropdown.appendChild(this.createSectionHeader('Solid Colors'));

    // Pattern options - solid colors
    const solidPatterns: Array<{ type: BackgroundPatternType; label: string }> = [
      { type: 'black', label: 'Black (default)' },
      { type: 'grey18', label: 'Grey 18%' },
      { type: 'grey50', label: 'Grey 50%' },
      { type: 'white', label: 'White' },
    ];

    for (const { type, label } of solidPatterns) {
      this.dropdown.appendChild(this.createPatternItem(type, label));
    }

    // Separator
    this.dropdown.appendChild(this.createSeparator());

    // Section header: Patterns
    this.dropdown.appendChild(this.createSectionHeader('Patterns'));

    // Checkerboard
    this.dropdown.appendChild(this.createPatternItem('checker', 'Checkerboard'));

    // Checker size options (only visible when checker is selected)
    const sizeRow = document.createElement('div');
    sizeRow.dataset.testid = 'checker-size-row';
    sizeRow.style.cssText = `
      display: ${this.state.pattern === 'checker' ? 'flex' : 'none'};
      align-items: center;
      gap: 4px;
      padding: 4px 12px 4px 28px;
    `;
    const sizeLabel = document.createElement('span');
    sizeLabel.style.cssText = 'font-size: 10px; color: var(--text-muted);';
    sizeLabel.textContent = 'Size:';
    sizeRow.appendChild(sizeLabel);

    const sizes: Array<{ value: 'small' | 'medium' | 'large'; label: string }> = [
      { value: 'small', label: 'S' },
      { value: 'medium', label: 'M' },
      { value: 'large', label: 'L' },
    ];

    for (const { value, label } of sizes) {
      const sizeBtn = document.createElement('button');
      sizeBtn.dataset.testid = `checker-size-${value}`;
      sizeBtn.dataset.checkerSize = value;
      sizeBtn.textContent = label;
      sizeBtn.style.cssText = `
        background: ${this.state.checkerSize === value ? 'rgba(var(--accent-primary-rgb), 0.15)' : 'var(--bg-tertiary)'};
        color: ${this.state.checkerSize === value ? 'var(--accent-primary)' : 'var(--text-secondary)'};
        border: 1px solid ${this.state.checkerSize === value ? 'var(--accent-primary)' : 'var(--border-primary)'};
        border-radius: 3px;
        padding: 2px 8px;
        font-size: 10px;
        cursor: pointer;
        outline: none;
        transition: all 0.1s ease;
      `;
      sizeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.setCheckerSize(value);
        this.buildDropdown();
      });
      sizeRow.appendChild(sizeBtn);
    }
    this.dropdown.appendChild(sizeRow);

    // Crosshatch
    this.dropdown.appendChild(this.createPatternItem('crosshatch', 'Crosshatch'));

    // Separator
    this.dropdown.appendChild(this.createSeparator());

    // Custom color
    this.dropdown.appendChild(this.createPatternItem('custom', 'Custom Color...'));

    // Custom color input row
    const customRow = document.createElement('div');
    customRow.style.cssText = `
      display: ${this.state.pattern === 'custom' ? 'flex' : 'none'};
      align-items: center;
      gap: 6px;
      padding: 4px 12px 6px 28px;
    `;

    const colorInput = document.createElement('input');
    colorInput.type = 'color';
    colorInput.dataset.testid = 'background-custom-color';
    colorInput.value = this.state.customColor;
    colorInput.style.cssText = `
      width: 28px;
      height: 24px;
      border: 1px solid var(--border-primary);
      border-radius: 3px;
      background: var(--bg-tertiary);
      cursor: pointer;
      padding: 1px;
    `;
    colorInput.addEventListener('input', (e) => {
      e.stopPropagation();
      const val = (e.target as HTMLInputElement).value;
      this.state.customColor = val;
      this.state.pattern = 'custom';
      this.updateButtonLabel();
      this.updateButtonStyle();
      this.emit('stateChanged', { ...this.state });
    });
    customRow.appendChild(colorInput);

    const hexInput = document.createElement('input');
    hexInput.type = 'text';
    hexInput.dataset.testid = 'background-custom-hex';
    hexInput.value = this.state.customColor;
    hexInput.placeholder = '#000000';
    hexInput.style.cssText = `
      width: 70px;
      padding: 3px 6px;
      border: 1px solid var(--border-primary);
      border-radius: 3px;
      background: var(--bg-tertiary);
      color: var(--text-primary);
      font-size: 11px;
      font-family: var(--font-mono);
      outline: none;
    `;
    hexInput.addEventListener('change', (e) => {
      e.stopPropagation();
      const val = (e.target as HTMLInputElement).value.trim();
      if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(val)) {
        this.state.customColor = val;
        this.state.pattern = 'custom';
        colorInput.value = val.length === 4
          ? `#${val[1]}${val[1]}${val[2]}${val[2]}${val[3]}${val[3]}`
          : val;
        this.updateButtonLabel();
        this.updateButtonStyle();
        this.emit('stateChanged', { ...this.state });
      }
    });
    customRow.appendChild(hexInput);

    this.dropdown.appendChild(customRow);
  }

  private createSectionHeader(text: string): HTMLElement {
    const header = document.createElement('div');
    header.style.cssText = `
      padding: 4px 12px;
      font-size: 10px;
      text-transform: uppercase;
      color: var(--text-muted);
      letter-spacing: 0.05em;
    `;
    header.textContent = text;
    return header;
  }

  private createPatternItem(type: BackgroundPatternType, label: string): HTMLElement {
    const item = document.createElement('div');
    item.dataset.testid = `bg-pattern-${type}`;
    item.dataset.bgPattern = type;
    item.setAttribute('role', 'radio');
    item.setAttribute('tabindex', '0');
    const isSelected = this.state.pattern === type;
    item.setAttribute('aria-checked', String(isSelected));
    item.setAttribute('aria-label', label);

    item.style.cssText = `
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 5px 12px;
      font-size: 12px;
      color: ${isSelected ? 'var(--accent-primary)' : 'var(--text-secondary)'};
      background: ${isSelected ? 'rgba(var(--accent-primary-rgb), 0.15)' : 'transparent'};
      cursor: pointer;
      transition: background 0.1s ease;
    `;

    // Radio indicator
    const radio = document.createElement('span');
    radio.style.cssText = `
      width: 12px;
      height: 12px;
      border-radius: 50%;
      border: 2px solid ${isSelected ? 'var(--accent-primary)' : 'var(--text-muted)'};
      display: inline-flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    `;
    if (isSelected) {
      const dot = document.createElement('span');
      dot.style.cssText = `
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: var(--accent-primary);
      `;
      radio.appendChild(dot);
    }
    item.appendChild(radio);

    // Color swatch preview
    const swatch = document.createElement('span');
    swatch.style.cssText = `
      width: 14px;
      height: 14px;
      border-radius: 2px;
      border: 1px solid var(--border-primary);
      flex-shrink: 0;
    `;
    if (type === 'checker') {
      swatch.style.background = `
        repeating-conic-gradient(${PATTERN_COLORS.checkerDark} 0% 25%, ${PATTERN_COLORS.checkerLight} 0% 50%)
        50% / 8px 8px
      `;
    } else if (type === 'crosshatch') {
      swatch.style.background = PATTERN_COLORS.crosshatchBg ?? '#404040';
    } else if (type === 'custom') {
      swatch.style.background = this.state.customColor;
    } else {
      swatch.style.background = PATTERN_COLORS[type] ?? '#000';
    }
    item.appendChild(swatch);

    // Label
    const labelSpan = document.createElement('span');
    labelSpan.textContent = label;
    item.appendChild(labelSpan);

    item.addEventListener('mouseenter', () => {
      if (this.state.pattern !== type) {
        item.style.background = 'var(--bg-hover)';
      }
    });

    item.addEventListener('mouseleave', () => {
      if (this.state.pattern !== type) {
        item.style.background = 'transparent';
        item.style.color = 'var(--text-secondary)';
      }
    });

    item.addEventListener('click', (e) => {
      e.stopPropagation();
      this.setPattern(type);
      // Keep dropdown open for checker (to show size options) and custom (to show color picker)
      if (type !== 'checker' && type !== 'custom') {
        this.closeDropdown();
      } else {
        this.buildDropdown();
      }
    });

    return item;
  }

  private createSeparator(): HTMLElement {
    const sep = document.createElement('div');
    sep.style.cssText = `
      height: 1px;
      background: var(--border-secondary);
      margin: 4px 8px;
    `;
    return sep;
  }

  private updateButtonLabel(): void {
    const active = this.isActive();
    let label = 'BG';
    if (active) {
      const labelMap: Record<BackgroundPatternType, string> = {
        black: 'Black',
        grey18: 'Grey18',
        grey50: 'Grey50',
        white: 'White',
        checker: 'Checker',
        crosshatch: 'Cross',
        custom: 'Custom',
      };
      label = `BG: ${labelMap[this.state.pattern] ?? 'BG'}`;
    }
    this.button.innerHTML = `${getIconSvg('grid', 'sm')}<span style="margin-left: 2px;">${label}</span><span style="font-size: 8px; margin-left: 2px;">&#9660;</span>`;
  }

  private updateButtonStyle(): void {
    const active = this.isActive();
    if (active) {
      this.button.style.background = 'rgba(var(--accent-primary-rgb), 0.15)';
      this.button.style.borderColor = 'var(--accent-primary)';
      this.button.style.color = 'var(--accent-primary)';
    } else {
      this.button.style.background = 'transparent';
      this.button.style.borderColor = 'transparent';
      this.button.style.color = 'var(--text-muted)';
    }
  }

  private toggleDropdown(): void {
    if (this.isOpen) {
      this.closeDropdown();
    } else {
      this.openDropdown();
    }
  }

  private openDropdown(): void {
    if (!document.body.contains(this.dropdown)) {
      document.body.appendChild(this.dropdown);
    }
    this.positionDropdown();
    this.dropdown.style.display = 'flex';
    this.isOpen = true;
    this.button.setAttribute('aria-expanded', 'true');

    // Rebuild to reflect current state
    this.buildDropdown();

    document.addEventListener('click', this.boundHandleOutsideClick);
    window.addEventListener('scroll', this.boundHandleReposition, true);
    window.addEventListener('resize', this.boundHandleReposition);
  }

  private closeDropdown(): void {
    this.dropdown.style.display = 'none';
    this.isOpen = false;
    this.button.setAttribute('aria-expanded', 'false');
    this.updateButtonStyle();

    document.removeEventListener('click', this.boundHandleOutsideClick);
    window.removeEventListener('scroll', this.boundHandleReposition, true);
    window.removeEventListener('resize', this.boundHandleReposition);
  }

  private positionDropdown(): void {
    const rect = this.button.getBoundingClientRect();
    this.dropdown.style.top = `${rect.bottom + 4}px`;
    this.dropdown.style.left = `${rect.left}px`;
  }

  private handleOutsideClick(e: MouseEvent): void {
    const target = e.target as HTMLElement;
    if (!this.dropdown.contains(target) && !this.button.contains(target)) {
      this.closeDropdown();
    }
  }

  // --- Public API ---

  getState(): BackgroundPatternState {
    return { ...this.state };
  }

  setState(state: BackgroundPatternState): void {
    this.state = { ...state };
    this.updateButtonLabel();
    this.updateButtonStyle();
    this.emit('stateChanged', { ...this.state });
  }

  setPattern(pattern: BackgroundPatternType): void {
    if (this.state.pattern !== 'checker' && pattern === 'checker') {
      // Save previous pattern for toggle-back
      this.previousPattern = this.state.pattern;
    }
    this.state.pattern = pattern;
    this.updateButtonLabel();
    this.updateButtonStyle();
    this.emit('stateChanged', { ...this.state });
  }

  setCheckerSize(size: 'small' | 'medium' | 'large'): void {
    this.state.checkerSize = size;
    this.emit('stateChanged', { ...this.state });
  }

  setCustomColor(color: string): void {
    if (!/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(color)) {
      throw new Error(`Invalid hex color format: ${color}`);
    }
    this.state.customColor = color;
    this.state.pattern = 'custom';
    this.updateButtonLabel();
    this.updateButtonStyle();
    this.emit('stateChanged', { ...this.state });
  }

  /**
   * Cycle through patterns: black -> grey18 -> grey50 -> checker -> black
   */
  cyclePattern(): void {
    const currentIndex = CYCLE_ORDER.indexOf(this.state.pattern);
    const nextIndex = currentIndex === -1 ? 0 : (currentIndex + 1) % CYCLE_ORDER.length;
    this.setPattern(CYCLE_ORDER[nextIndex]!);
  }

  /**
   * Toggle checkerboard on/off. When toggling off, restores the previous pattern.
   */
  toggleCheckerboard(): void {
    if (this.state.pattern === 'checker') {
      this.setPattern(this.previousPattern);
    } else {
      this.previousPattern = this.state.pattern;
      this.setPattern('checker');
    }
  }

  /**
   * Returns true when a non-default (non-black) pattern is active.
   */
  isActive(): boolean {
    return this.state.pattern !== 'black';
  }

  /**
   * Handle keyboard shortcuts.
   * @returns true if the key was handled
   */
  handleKeyboard(key: string, shiftKey: boolean, altKey: boolean): boolean {
    if (shiftKey && !altKey && (key === 'B' || key === 'b')) {
      this.cyclePattern();
      return true;
    }
    if (shiftKey && altKey && (key === 'B' || key === 'b')) {
      this.toggleCheckerboard();
      return true;
    }
    return false;
  }

  render(): HTMLElement {
    return this.container;
  }

  dispose(): void {
    this.closeDropdown();
    if (document.body.contains(this.dropdown)) {
      document.body.removeChild(this.dropdown);
    }
    this.container.remove();
    this.removeAllListeners();
    clearPatternCache();
  }
}

/**
 * Draw a background pattern on the given canvas context.
 * Should be called BEFORE drawing the image so the pattern shows through alpha areas.
 */
export function drawBackgroundPattern(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  state: BackgroundPatternState
): void {
  if (state.pattern === 'black') {
    // Black is the default canvas background - no drawing needed
    return;
  }

  // Guard against zero or negative dimensions
  if (width <= 0 || height <= 0) {
    return;
  }

  switch (state.pattern) {
    case 'checker':
      drawCheckerboard(ctx, width, height, state.checkerSize);
      break;
    case 'crosshatch':
      drawCrosshatch(ctx, width, height);
      break;
    case 'custom':
      ctx.fillStyle = state.customColor;
      ctx.fillRect(0, 0, width, height);
      break;
    default: {
      // Solid color patterns
      const color = PATTERN_COLORS[state.pattern];
      if (color) {
        ctx.fillStyle = color;
        ctx.fillRect(0, 0, width, height);
      }
    }
  }
}

/**
 * Cache for CanvasPattern objects to avoid recreating them every frame.
 * Key format: "checker-{size}" or "crosshatch".
 */
const patternCache = new Map<string, CanvasPattern>();

/** Clear the pattern cache (e.g., if colors change). */
export function clearPatternCache(): void {
  patternCache.clear();
}

function getOrCreateCheckerPattern(
  ctx: CanvasRenderingContext2D,
  checkerSize: 'small' | 'medium' | 'large'
): CanvasPattern | null {
  const cacheKey = `checker-${checkerSize}`;
  const cached = patternCache.get(cacheKey);
  if (cached) return cached;

  const sizes = { small: 8, medium: 16, large: 32 };
  const size = sizes[checkerSize];
  const tileSize = size * 2; // A 2x2 tile repeats the checker pattern

  const tileCanvas = document.createElement('canvas');
  tileCanvas.width = tileSize;
  tileCanvas.height = tileSize;
  const tileCtx = tileCanvas.getContext('2d');
  if (!tileCtx) return null;

  // Draw the 2x2 checkerboard tile
  tileCtx.fillStyle = PATTERN_COLORS.checkerLight!;
  tileCtx.fillRect(0, 0, size, size);
  tileCtx.fillStyle = PATTERN_COLORS.checkerDark!;
  tileCtx.fillRect(size, 0, size, size);
  tileCtx.fillStyle = PATTERN_COLORS.checkerDark!;
  tileCtx.fillRect(0, size, size, size);
  tileCtx.fillStyle = PATTERN_COLORS.checkerLight!;
  tileCtx.fillRect(size, size, size, size);

  const pattern = ctx.createPattern(tileCanvas, 'repeat');
  if (pattern) {
    patternCache.set(cacheKey, pattern);
  }
  return pattern;
}

function getOrCreateCrosshatchPattern(
  ctx: CanvasRenderingContext2D
): CanvasPattern | null {
  const cacheKey = 'crosshatch';
  const cached = patternCache.get(cacheKey);
  if (cached) return cached;

  const spacing = 12;
  // The tile must be large enough for the diagonal lines to tile seamlessly.
  // For 45-degree lines with `spacing` pixels apart, a tile of spacing x spacing works.
  const tileSize = spacing;

  const tileCanvas = document.createElement('canvas');
  tileCanvas.width = tileSize;
  tileCanvas.height = tileSize;
  const tileCtx = tileCanvas.getContext('2d');
  if (!tileCtx) return null;

  // Fill background
  tileCtx.fillStyle = PATTERN_COLORS.crosshatchBg!;
  tileCtx.fillRect(0, 0, tileSize, tileSize);

  // Draw diagonal lines within the tile
  tileCtx.strokeStyle = PATTERN_COLORS.crosshatchLine!;
  tileCtx.lineWidth = 1;
  tileCtx.beginPath();
  // Top-left to bottom-right diagonal
  tileCtx.moveTo(0, 0);
  tileCtx.lineTo(tileSize, tileSize);
  tileCtx.moveTo(-tileSize, 0);
  tileCtx.lineTo(tileSize, tileSize * 2);
  tileCtx.moveTo(0, -tileSize);
  tileCtx.lineTo(tileSize * 2, tileSize);
  // Top-right to bottom-left diagonal
  tileCtx.moveTo(tileSize, 0);
  tileCtx.lineTo(0, tileSize);
  tileCtx.moveTo(tileSize * 2, 0);
  tileCtx.lineTo(0, tileSize * 2);
  tileCtx.moveTo(tileSize, -tileSize);
  tileCtx.lineTo(-tileSize, tileSize);
  tileCtx.stroke();

  const pattern = ctx.createPattern(tileCanvas, 'repeat');
  if (pattern) {
    patternCache.set(cacheKey, pattern);
  }
  return pattern;
}

function drawCheckerboard(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  checkerSize: 'small' | 'medium' | 'large'
): void {
  const pattern = getOrCreateCheckerPattern(ctx, checkerSize);
  if (pattern) {
    ctx.fillStyle = pattern;
    ctx.fillRect(0, 0, width, height);
    return;
  }

  // Fallback: draw tile-by-tile if pattern creation fails (e.g., in test environments)
  const sizes = { small: 8, medium: 16, large: 32 };
  const size = sizes[checkerSize];

  for (let y = 0; y < height; y += size) {
    for (let x = 0; x < width; x += size) {
      const isLight = ((Math.floor(x / size)) + (Math.floor(y / size))) % 2 === 0;
      ctx.fillStyle = isLight ? PATTERN_COLORS.checkerLight! : PATTERN_COLORS.checkerDark!;
      ctx.fillRect(x, y, size, size);
    }
  }
}

function drawCrosshatch(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number
): void {
  const pattern = getOrCreateCrosshatchPattern(ctx);
  if (pattern) {
    ctx.fillStyle = pattern;
    ctx.fillRect(0, 0, width, height);
    return;
  }

  // Fallback: draw lines directly if pattern creation fails
  ctx.fillStyle = PATTERN_COLORS.crosshatchBg!;
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = PATTERN_COLORS.crosshatchLine!;
  ctx.lineWidth = 1;
  const spacing = 12;

  ctx.beginPath();
  // Diagonal lines (top-left to bottom-right)
  for (let i = -height; i < width + height; i += spacing) {
    ctx.moveTo(i, 0);
    ctx.lineTo(i + height, height);
  }
  // Diagonal lines (top-right to bottom-left)
  for (let i = -height; i < width + height; i += spacing) {
    ctx.moveTo(i + height, 0);
    ctx.lineTo(i, height);
  }
  ctx.stroke();
}
