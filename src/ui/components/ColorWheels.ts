/**
 * Lift/Gamma/Gain Color Wheels Component
 *
 * Three-way color correction using intuitive circular wheels for shadows (Lift),
 * midtones (Gamma), and highlights (Gain). Industry standard for primary color correction.
 *
 * Based on DaVinci Resolve Primary Wheels / Baselight Base Grade
 *
 * Zone definitions:
 * - Lift: affects pixels where luma < 0.33 (soft falloff to 0.5)
 * - Gamma: affects pixels where 0.25 < luma < 0.75 (bell curve)
 * - Gain: affects pixels where luma > 0.67 (soft falloff from 0.5)
 */

import { EventEmitter, EventMap } from '../../utils/EventEmitter';
import { luminanceRec709 } from '../../color/ColorProcessingFacade';
import { createDraggableContainer, createControlButton, DraggableContainer } from './shared/DraggableContainer';
import { setupHiDPICanvas, clientToCanvasCoordinates } from '../../utils/ui/HiDPICanvas';
import { getThemeManager } from '../../utils/ui/ThemeManager';

export type { WheelValues, ColorWheelsState } from '../../core/types/color';
export { DEFAULT_WHEEL_VALUES, DEFAULT_COLOR_WHEELS_STATE } from '../../core/types/color';

import type { WheelValues, ColorWheelsState } from '../../core/types/color';
import { DEFAULT_WHEEL_VALUES, DEFAULT_COLOR_WHEELS_STATE } from '../../core/types/color';

// Canvas size constants for wheel rendering
const WHEEL_SIZE = 120;
const WHEEL_CANVAS_SIZE = WHEEL_SIZE + 20; // Extra space for indicator

export interface ColorWheelsEvents extends EventMap {
  stateChanged: ColorWheelsState;
  wheelChanged: { wheel: keyof ColorWheelsState; values: WheelValues };
  undoRedoChanged: { canUndo: boolean; canRedo: boolean };
  visibilityChanged: boolean;
}

export class ColorWheels extends EventEmitter<ColorWheelsEvents> {
  private draggable: DraggableContainer;
  private state: ColorWheelsState = JSON.parse(JSON.stringify(DEFAULT_COLOR_WHEELS_STATE));
  private wheels: Map<string, HTMLElement> = new Map();

  // Undo/Redo stacks
  private undoStack: ColorWheelsState[] = [];
  private redoStack: ColorWheelsState[] = [];
  private maxUndoLevels = 50;
  private boundOnThemeChange: (() => void) | null = null;

  constructor(parent: HTMLElement) {
    super();

    // Create draggable container using unified component
    this.draggable = createDraggableContainer({
      id: 'color-wheels',
      title: 'Color Wheels',
      initialPosition: { bottom: '10px', left: '10px' },
      zIndex: 100,
      onClose: () => this.hide(),
      testId: 'color-wheels-container',
    });

    parent.appendChild(this.draggable.element);
    this.createUI();

    // Listen for theme changes to redraw with new colors
    this.boundOnThemeChange = () => {
      this.redrawAllWheels();
    };
    getThemeManager().on('themeChanged', this.boundOnThemeChange);
  }

  private createUI(): void {
    // Add Link toggle to header controls (before close button)
    const linkLabel = document.createElement('label');
    linkLabel.style.cssText = 'display: flex; align-items: center; gap: 3px; color: var(--text-muted); font-size: 10px; cursor: pointer;';
    const linkCheckbox = document.createElement('input');
    linkCheckbox.type = 'checkbox';
    linkCheckbox.checked = this.state.linked;
    linkCheckbox.style.cssText = 'accent-color: var(--accent-primary); width: 12px; height: 12px;';
    linkCheckbox.addEventListener('change', () => {
      this.state.linked = linkCheckbox.checked;
      this.emitChange();
    });
    linkLabel.appendChild(linkCheckbox);
    linkLabel.appendChild(document.createTextNode('Link'));

    // Reset all button
    const resetAllBtn = createControlButton('Reset', 'Reset all wheels');
    resetAllBtn.addEventListener('click', () => this.reset());

    // Insert controls before close button
    this.draggable.controls.insertBefore(linkLabel, this.draggable.controls.firstChild);
    this.draggable.controls.insertBefore(resetAllBtn, this.draggable.controls.firstChild);

    // Wheels container
    const wheelsRow = document.createElement('div');
    wheelsRow.style.cssText = `
      display: flex;
      gap: 12px;
      flex-wrap: wrap;
      justify-content: center;
    `;

    // Create four wheels: Lift, Gamma, Gain, Master
    const wheelConfigs: Array<{ key: keyof ColorWheelsState; label: string; color: string }> = [
      { key: 'lift', label: 'Lift', color: '#6666cc' },      // Blue-ish for shadows
      { key: 'gamma', label: 'Gamma', color: '#66cc66' },    // Green-ish for midtones
      { key: 'gain', label: 'Gain', color: '#cccc66' },      // Yellow-ish for highlights
      { key: 'master', label: 'Master', color: '#cc6666' },  // Red-ish for master
    ];

    for (const config of wheelConfigs) {
      const wheel = this.createWheel(config.key, config.label, config.color);
      wheelsRow.appendChild(wheel);
      this.wheels.set(config.key, wheel);
    }

    this.draggable.content.appendChild(wheelsRow);
  }

  private createWheel(key: keyof ColorWheelsState, label: string, accentColor: string): HTMLElement {
    const wheelContainer = document.createElement('div');
    wheelContainer.className = `wheel-${key}`;
    wheelContainer.style.cssText = `
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
    `;

    // Label
    const labelEl = document.createElement('div');
    labelEl.textContent = label;
    labelEl.style.cssText = `
      color: ${accentColor};
      font-size: 11px;
      font-weight: 500;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    `;
    wheelContainer.appendChild(labelEl);

    // Wheel and slider row
    const row = document.createElement('div');
    row.style.cssText = 'display: flex; align-items: center; gap: 8px;';

    // Wheel canvas - spec requires 120px minimum
    const canvas = document.createElement('canvas');
    canvas.tabIndex = 0;
    canvas.setAttribute('role', 'slider');
    canvas.setAttribute('aria-label', `${label} color wheel`);
    canvas.style.cssText = `
      cursor: crosshair;
    `;

    // Setup hi-DPI canvas with logical dimensions
    const ctx = canvas.getContext('2d')!;
    setupHiDPICanvas({
      canvas,
      ctx,
      width: WHEEL_CANVAS_SIZE,
      height: WHEEL_CANVAS_SIZE,
    });

    // Draw initial wheel
    this.drawWheel(canvas, key);

    // Wheel interaction
    let isDragging = false;
    const handleWheelInteraction = (e: MouseEvent | PointerEvent) => {
      const centerX = WHEEL_CANVAS_SIZE / 2;
      const centerY = WHEEL_CANVAS_SIZE / 2;
      const radius = WHEEL_SIZE / 2;

      // Convert client coordinates to logical canvas coordinates (handles hi-DPI correctly)
      const canvasCoords = clientToCanvasCoordinates(
        canvas,
        e.clientX,
        e.clientY,
        WHEEL_CANVAS_SIZE,
        WHEEL_CANVAS_SIZE
      );

      // Calculate position relative to center (normalized to -1..1 range)
      const x = (canvasCoords.x - centerX) / radius;
      const y = (canvasCoords.y - centerY) / radius;

      // Clamp to circle
      const distance = Math.sqrt(x * x + y * y);
      const clampedX = distance > 1 ? x / distance : x;
      const clampedY = distance > 1 ? y / distance : y;

      // Map to RGB (x = R/C, y = G/M)
      // Negative x = more cyan (less red), positive x = more red
      // Negative y = more magenta (less green), positive y = more green
      const values = this.state[key] as WheelValues;
      values.r = clampedX;
      values.g = -clampedY; // Invert Y for intuitive control
      // Blue is derived: when pushing red/green, reduce blue (complementary)
      values.b = -(clampedX * 0.5 + (-clampedY) * 0.5);

      if (this.state.linked && key !== 'master') {
        // Apply same change to other non-master wheels
        for (const otherKey of ['lift', 'gamma', 'gain'] as const) {
          if (otherKey !== key) {
            const otherValues = this.state[otherKey] as WheelValues;
            otherValues.r = values.r;
            otherValues.g = values.g;
            otherValues.b = values.b;
          }
        }
      }

      this.redrawAllWheels();
      this.emitChange();
    };

    canvas.addEventListener('pointerdown', (e) => {
      isDragging = true;
      canvas.setPointerCapture(e.pointerId);
      this.saveStateForUndo(); // Save state before modification
      handleWheelInteraction(e);
    });

    canvas.addEventListener('pointermove', (e) => {
      if (isDragging) {
        handleWheelInteraction(e);
      }
    });

    canvas.addEventListener('pointerup', (e) => {
      isDragging = false;
      canvas.releasePointerCapture(e.pointerId);
    });

    // Double-click to reset wheel
    canvas.addEventListener('dblclick', () => {
      this.resetWheel(key);
    });

    // Keyboard navigation for accessibility
    canvas.addEventListener('keydown', (e: KeyboardEvent) => {
      const delta = 0.05;
      let handled = false;
      const values = this.state[key] as WheelValues;

      switch (e.key) {
        case 'ArrowRight':
          this.saveStateForUndo();
          values.r = Math.min(1, values.r + delta);
          handled = true;
          break;
        case 'ArrowLeft':
          this.saveStateForUndo();
          values.r = Math.max(-1, values.r - delta);
          handled = true;
          break;
        case 'ArrowUp':
          this.saveStateForUndo();
          values.g = Math.min(1, values.g + delta);
          handled = true;
          break;
        case 'ArrowDown':
          this.saveStateForUndo();
          values.g = Math.max(-1, values.g - delta);
          handled = true;
          break;
      }

      if (handled) {
        e.preventDefault();
        // Derive blue from red/green (same as pointer interaction)
        values.b = -(values.r * 0.5 + values.g * 0.5);

        if (this.state.linked && key !== 'master') {
          for (const otherKey of ['lift', 'gamma', 'gain'] as const) {
            if (otherKey !== key) {
              const otherValues = this.state[otherKey] as WheelValues;
              otherValues.r = values.r;
              otherValues.g = values.g;
              otherValues.b = values.b;
            }
          }
        }

        this.redrawAllWheels();
        this.emitChange();
      }
    });

    row.appendChild(canvas);

    // Luminance slider (vertical)
    const sliderContainer = document.createElement('div');
    sliderContainer.style.cssText = `
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 4px;
    `;

    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = '-100';
    slider.max = '100';
    slider.value = '0';
    slider.style.cssText = `
      writing-mode: vertical-lr;
      direction: rtl;
      width: 20px;
      height: 80px;
      accent-color: ${accentColor};
      cursor: pointer;
    `;

    const sliderValue = document.createElement('div');
    sliderValue.textContent = '0';
    sliderValue.style.cssText = 'color: var(--text-muted); font-size: 10px; font-family: monospace;';

    slider.addEventListener('pointerdown', () => {
      this.saveStateForUndo(); // Save state before modification
    });

    slider.addEventListener('input', () => {
      const y = parseInt(slider.value, 10) / 100;
      const values = this.state[key] as WheelValues;
      values.y = y;
      sliderValue.textContent = y >= 0 ? `+${y.toFixed(2)}` : y.toFixed(2);

      if (this.state.linked && key !== 'master') {
        for (const otherKey of ['lift', 'gamma', 'gain'] as const) {
          if (otherKey !== key) {
            const otherValues = this.state[otherKey] as WheelValues;
            otherValues.y = y;
          }
        }
        this.updateAllSliders();
      }

      this.emitChange();
    });

    sliderContainer.appendChild(slider);
    sliderContainer.appendChild(sliderValue);
    row.appendChild(sliderContainer);

    wheelContainer.appendChild(row);

    // Numeric inputs row
    const numericRow = document.createElement('div');
    numericRow.style.cssText = `
      display: flex;
      gap: 4px;
      font-size: 10px;
    `;

    for (const channel of ['R', 'G', 'B'] as const) {
      const input = document.createElement('input');
      input.type = 'number';
      input.min = '-1';
      input.max = '1';
      input.step = '0.01';
      input.value = '0.00';
      input.style.cssText = `
        width: 40px;
        padding: 2px;
        background: var(--bg-tertiary);
        border: 1px solid var(--border-primary);
        border-radius: 2px;
        color: ${channel === 'R' ? '#ff6666' : channel === 'G' ? '#66ff66' : '#6666ff'};
        font-size: 10px;
        font-family: monospace;
        text-align: center;
      `;

      const channelKey = channel.toLowerCase() as 'r' | 'g' | 'b';
      input.addEventListener('change', () => {
        this.saveStateForUndo(); // Save state before modification
        const val = Math.max(-1, Math.min(1, parseFloat(input.value) || 0));
        const values = this.state[key] as WheelValues;
        values[channelKey] = val;
        input.value = val.toFixed(2);
        this.drawWheel(canvas, key);
        this.emitChange();
      });

      numericRow.appendChild(input);
    }

    wheelContainer.appendChild(numericRow);

    // Reset button
    const resetBtn = document.createElement('button');
    resetBtn.textContent = 'Reset';
    resetBtn.style.cssText = `
      padding: 2px 8px;
      background: var(--bg-tertiary);
      border: 1px solid var(--border-primary);
      border-radius: 3px;
      color: var(--text-muted);
      font-size: 10px;
      cursor: pointer;
    `;
    resetBtn.addEventListener('click', () => this.resetWheel(key));
    wheelContainer.appendChild(resetBtn);

    return wheelContainer;
  }

  private drawWheel(canvas: HTMLCanvasElement, key: keyof ColorWheelsState): void {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Use logical dimensions for drawing (hi-DPI context is scaled)
    const size = WHEEL_CANVAS_SIZE;
    const center = size / 2;
    const wheelRadius = WHEEL_SIZE / 2;

    // Clear
    ctx.clearRect(0, 0, size, size);

    // Draw color wheel background
    const gradient = ctx.createConicGradient(0, center, center);
    gradient.addColorStop(0, 'hsl(0, 50%, 35%)');      // Red
    gradient.addColorStop(0.166, 'hsl(60, 50%, 35%)');  // Yellow
    gradient.addColorStop(0.333, 'hsl(120, 50%, 35%)'); // Green
    gradient.addColorStop(0.5, 'hsl(180, 50%, 35%)');   // Cyan
    gradient.addColorStop(0.666, 'hsl(240, 50%, 35%)'); // Blue
    gradient.addColorStop(0.833, 'hsl(300, 50%, 35%)'); // Magenta
    gradient.addColorStop(1, 'hsl(360, 50%, 35%)');     // Red

    ctx.beginPath();
    ctx.arc(center, center, wheelRadius, 0, Math.PI * 2);
    ctx.fillStyle = gradient;
    ctx.fill();

    // Draw center gradient (white in middle)
    const centerGradient = ctx.createRadialGradient(center, center, 0, center, center, wheelRadius);
    centerGradient.addColorStop(0, 'rgba(128, 128, 128, 1)');
    centerGradient.addColorStop(0.5, 'rgba(128, 128, 128, 0.5)');
    centerGradient.addColorStop(1, 'rgba(128, 128, 128, 0)');
    ctx.fillStyle = centerGradient;
    ctx.fill();

    // Draw wheel border
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Draw color preview ring showing current bias
    const values = this.state[key] as WheelValues;
    if (values.r !== 0 || values.g !== 0 || values.b !== 0) {
      const ringRadius = wheelRadius + 6;
      const biasR = Math.round(128 + values.r * 127);
      const biasG = Math.round(128 + values.g * 127);
      const biasB = Math.round(128 + values.b * 127);
      ctx.strokeStyle = `rgb(${biasR}, ${biasG}, ${biasB})`;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(center, center, ringRadius, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Draw crosshairs
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(center - wheelRadius, center);
    ctx.lineTo(center + wheelRadius, center);
    ctx.moveTo(center, center - wheelRadius);
    ctx.lineTo(center, center + wheelRadius);
    ctx.stroke();

    // Draw current position indicator (values already declared above for ring)
    const indicatorX = center + values.r * wheelRadius;
    const indicatorY = center - values.g * wheelRadius; // Invert Y

    // Line from center to indicator
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(center, center);
    ctx.lineTo(indicatorX, indicatorY);
    ctx.stroke();

    // Indicator circle
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(indicatorX, indicatorY, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Inner dot showing color bias
    const biasR = Math.round(128 + values.r * 64);
    const biasG = Math.round(128 + values.g * 64);
    const biasB = Math.round(128 + values.b * 64);
    ctx.fillStyle = `rgb(${biasR}, ${biasG}, ${biasB})`;
    ctx.beginPath();
    ctx.arc(indicatorX, indicatorY, 3, 0, Math.PI * 2);
    ctx.fill();
  }

  private redrawAllWheels(): void {
    for (const [key, wheelEl] of this.wheels) {
      const canvas = wheelEl.querySelector('canvas');
      if (canvas) {
        this.drawWheel(canvas, key as keyof ColorWheelsState);
      }
    }
  }

  private updateAllSliders(): void {
    for (const [key, wheelEl] of this.wheels) {
      const slider = wheelEl.querySelector('input[type="range"]') as HTMLInputElement;
      const valueEl = wheelEl.querySelector('div[style*="font-family: monospace"]') as HTMLElement;
      if (slider && valueEl) {
        const values = this.state[key as keyof ColorWheelsState] as WheelValues;
        slider.value = String(Math.round(values.y * 100));
        valueEl.textContent = values.y >= 0 ? `+${values.y.toFixed(2)}` : values.y.toFixed(2);
      }
    }
  }

  private updateAllNumericInputs(): void {
    for (const [key, wheelEl] of this.wheels) {
      const numInputs = wheelEl.querySelectorAll('input[type="number"]') as NodeListOf<HTMLInputElement>;
      const values = this.state[key as keyof ColorWheelsState] as WheelValues;
      if (numInputs.length >= 3) {
        numInputs[0]!.value = values.r.toFixed(2);
        numInputs[1]!.value = values.g.toFixed(2);
        numInputs[2]!.value = values.b.toFixed(2);
      }
    }
  }

  private saveStateForUndo(): void {
    // Save current state before modification
    this.undoStack.push(JSON.parse(JSON.stringify(this.state)));
    // Clear redo stack on new action
    this.redoStack = [];
    // Limit undo history
    if (this.undoStack.length > this.maxUndoLevels) {
      this.undoStack.shift();
    }
    this.emitUndoRedoChange();
  }

  private emitUndoRedoChange(): void {
    this.emit('undoRedoChanged', {
      canUndo: this.undoStack.length > 0,
      canRedo: this.redoStack.length > 0,
    });
  }

  private emitChange(): void {
    this.emit('stateChanged', JSON.parse(JSON.stringify(this.state)));
  }

  /**
   * Undo the last color wheel change
   */
  undo(): boolean {
    const previousState = this.undoStack.pop();
    if (!previousState) return false;

    // Save current state to redo stack
    this.redoStack.push(JSON.parse(JSON.stringify(this.state)));

    // Restore previous state
    this.state = previousState;
    this.redrawAllWheels();
    this.updateAllSliders();
    this.updateAllNumericInputs();
    this.emitChange();
    this.emitUndoRedoChange();
    return true;
  }

  /**
   * Redo the last undone color wheel change
   */
  redo(): boolean {
    const nextState = this.redoStack.pop();
    if (!nextState) return false;

    // Save current state to undo stack
    this.undoStack.push(JSON.parse(JSON.stringify(this.state)));

    // Restore next state
    this.state = nextState;
    this.redrawAllWheels();
    this.updateAllSliders();
    this.updateAllNumericInputs();
    this.emitChange();
    this.emitUndoRedoChange();
    return true;
  }

  /**
   * Check if undo is available
   */
  canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  /**
   * Check if redo is available
   */
  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  /**
   * Clear undo/redo history
   */
  clearHistory(): void {
    this.undoStack = [];
    this.redoStack = [];
    this.emitUndoRedoChange();
  }

  /**
   * Reset a single wheel to neutral
   */
  resetWheel(key: keyof ColorWheelsState): void {
    if (key === 'linked') return; // Not a wheel
    this.saveStateForUndo(); // Save state before modification
    (this.state[key] as WheelValues) = { ...DEFAULT_WHEEL_VALUES };

    const wheelEl = this.wheels.get(key);
    if (wheelEl) {
      // Reset canvas
      const canvas = wheelEl.querySelector('canvas');
      if (canvas) this.drawWheel(canvas, key);

      // Reset slider
      const slider = wheelEl.querySelector('input[type="range"]') as HTMLInputElement;
      if (slider) slider.value = '0';

      // Reset numeric inputs
      const numInputs = wheelEl.querySelectorAll('input[type="number"]') as NodeListOf<HTMLInputElement>;
      numInputs.forEach(input => input.value = '0.00');

      // Reset value display
      const valueEl = wheelEl.querySelector('div[style*="font-family: monospace"]') as HTMLElement;
      if (valueEl) valueEl.textContent = '0';
    }

    this.emitChange();
  }

  /**
   * Reset all wheels to neutral
   */
  reset(): void {
    this.saveStateForUndo(); // Save state before modification
    this.state = JSON.parse(JSON.stringify(DEFAULT_COLOR_WHEELS_STATE));
    this.redrawAllWheels();
    this.updateAllSliders();

    // Reset all numeric inputs
    for (const wheelEl of this.wheels.values()) {
      const numInputs = wheelEl.querySelectorAll('input[type="number"]') as NodeListOf<HTMLInputElement>;
      numInputs.forEach(input => input.value = '0.00');
    }

    this.emitChange();
  }

  /**
   * Get current state
   */
  getState(): ColorWheelsState {
    return JSON.parse(JSON.stringify(this.state));
  }

  /**
   * Set state (e.g., from saved session)
   */
  setState(state: Partial<ColorWheelsState>): void {
    if (state.lift) this.state.lift = { ...state.lift };
    if (state.gamma) this.state.gamma = { ...state.gamma };
    if (state.gain) this.state.gain = { ...state.gain };
    if (state.master) this.state.master = { ...state.master };
    if (state.linked !== undefined) this.state.linked = state.linked;

    this.redrawAllWheels();
    this.updateAllSliders();
    this.emitChange();
  }

  /**
   * Check if any values are non-default
   */
  hasAdjustments(): boolean {
    const isDefault = (w: WheelValues) =>
      w.r === 0 && w.g === 0 && w.b === 0 && w.y === 0;
    return !isDefault(this.state.lift) ||
           !isDefault(this.state.gamma) ||
           !isDefault(this.state.gain) ||
           !isDefault(this.state.master);
  }

  /**
   * Show the color wheels panel
   */
  show(): void {
    this.draggable.show();
    this.emit('visibilityChanged', true);
  }

  /**
   * Hide the color wheels panel
   */
  hide(): void {
    this.draggable.hide();
    this.emit('visibilityChanged', false);
  }

  /**
   * Toggle visibility
   */
  toggle(): void {
    if (this.draggable.isVisible()) {
      this.hide();
    } else {
      this.show();
    }
  }

  /**
   * Check if visible
   */
  isVisible(): boolean {
    return this.draggable.isVisible();
  }

  /**
   * Apply color wheel adjustments to ImageData
   *
   * @param imageData - The image data to modify in-place
   */
  apply(imageData: ImageData): void {
    if (!this.hasAdjustments()) return;

    const data = imageData.data;
    const len = data.length;

    for (let i = 0; i < len; i += 4) {
      let r = data[i]! / 255;
      let g = data[i + 1]! / 255;
      let b = data[i + 2]! / 255;

      // Calculate luminance (Rec. 709)
      const luma = luminanceRec709(r, g, b);

      // Apply Master (affects all tones equally)
      if (this.state.master.r !== 0 || this.state.master.g !== 0 ||
          this.state.master.b !== 0 || this.state.master.y !== 0) {
        r = r + this.state.master.r * 0.5 + this.state.master.y;
        g = g + this.state.master.g * 0.5 + this.state.master.y;
        b = b + this.state.master.b * 0.5 + this.state.master.y;
      }

      // Calculate zone weights using smooth falloff curves
      // Lift: affects pixels where luma < 0.33 (soft falloff to 0.5)
      const liftWeight = this.smoothstep(0.5, 0.33, luma) * this.smoothstep(0, 0.15, luma);

      // Gamma: affects pixels where 0.25 < luma < 0.75 (bell curve centered at 0.5)
      const gammaWeight = this.bellCurve(luma, 0.5, 0.25);

      // Gain: affects pixels where luma > 0.67 (soft falloff from 0.5)
      const gainWeight = this.smoothstep(0.5, 0.67, luma) * this.smoothstep(1.0, 0.85, luma);

      // Apply Lift (shadows)
      if (liftWeight > 0 && (this.state.lift.r !== 0 || this.state.lift.g !== 0 ||
          this.state.lift.b !== 0 || this.state.lift.y !== 0)) {
        r += (this.state.lift.r * 0.3 + this.state.lift.y * 0.3) * liftWeight;
        g += (this.state.lift.g * 0.3 + this.state.lift.y * 0.3) * liftWeight;
        b += (this.state.lift.b * 0.3 + this.state.lift.y * 0.3) * liftWeight;
      }

      // Apply Gamma (midtones)
      if (gammaWeight > 0 && (this.state.gamma.r !== 0 || this.state.gamma.g !== 0 ||
          this.state.gamma.b !== 0 || this.state.gamma.y !== 0)) {
        // Gamma uses power function for more natural midtone adjustment
        const gammaR = 1.0 - this.state.gamma.r * 0.5 - this.state.gamma.y * 0.3;
        const gammaG = 1.0 - this.state.gamma.g * 0.5 - this.state.gamma.y * 0.3;
        const gammaB = 1.0 - this.state.gamma.b * 0.5 - this.state.gamma.y * 0.3;

        r = r * (1 - gammaWeight) + Math.pow(r, gammaR) * gammaWeight;
        g = g * (1 - gammaWeight) + Math.pow(g, gammaG) * gammaWeight;
        b = b * (1 - gammaWeight) + Math.pow(b, gammaB) * gammaWeight;
      }

      // Apply Gain (highlights)
      if (gainWeight > 0 && (this.state.gain.r !== 0 || this.state.gain.g !== 0 ||
          this.state.gain.b !== 0 || this.state.gain.y !== 0)) {
        const gainR = 1.0 + this.state.gain.r * 0.5 + this.state.gain.y * 0.5;
        const gainG = 1.0 + this.state.gain.g * 0.5 + this.state.gain.y * 0.5;
        const gainB = 1.0 + this.state.gain.b * 0.5 + this.state.gain.y * 0.5;

        r = r * (1 - gainWeight) + r * gainR * gainWeight;
        g = g * (1 - gainWeight) + g * gainG * gainWeight;
        b = b * (1 - gainWeight) + b * gainB * gainWeight;
      }

      // Clamp and write back
      data[i] = Math.max(0, Math.min(255, Math.round(r * 255)));
      data[i + 1] = Math.max(0, Math.min(255, Math.round(g * 255)));
      data[i + 2] = Math.max(0, Math.min(255, Math.round(b * 255)));
    }
  }

  /**
   * Smoothstep function for soft transitions
   */
  private smoothstep(edge0: number, edge1: number, x: number): number {
    const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
    return t * t * (3 - 2 * t);
  }

  /**
   * Bell curve centered at 'center' with 'width' spread
   */
  private bellCurve(x: number, center: number, width: number): number {
    const d = (x - center) / width;
    return Math.exp(-d * d * 2);
  }

  dispose(): void {
    // Clean up theme change listener
    if (this.boundOnThemeChange) {
      getThemeManager().off('themeChanged', this.boundOnThemeChange);
    }
    this.boundOnThemeChange = null;
    this.draggable.dispose();
    this.draggable.element.remove();
    this.wheels.clear();
  }
}
