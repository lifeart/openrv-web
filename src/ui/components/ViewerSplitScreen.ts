/**
 * Viewer Split Screen Module
 * Handles split screen A/B comparison UI elements and rendering logic.
 * Unlike wipe mode which shows original vs graded on the same source,
 * split screen shows Source A on one side and Source B on the other.
 */

export type SplitScreenMode = 'off' | 'splitscreen-h' | 'splitscreen-v';

export interface SplitScreenState {
  mode: SplitScreenMode;
  position: number;  // 0-1, position of split line
}

export const DEFAULT_SPLIT_SCREEN_STATE: SplitScreenState = {
  mode: 'off',
  position: 0.5,
};

export interface SplitScreenUIElements {
  splitLine: HTMLElement;
  labelA: HTMLElement;
  labelB: HTMLElement;
}

const LABEL_HIDE_THRESHOLD_LOW = 0.1;
const LABEL_HIDE_THRESHOLD_HIGH = 0.9;

/**
 * Create split screen UI elements (divider line and A/B labels)
 */
export function createSplitScreenUIElements(container: HTMLElement): SplitScreenUIElements {
  // Create split line divider
  const splitLine = document.createElement('div');
  splitLine.className = 'split-screen-line';
  splitLine.dataset.testid = 'split-screen-line';
  splitLine.style.cssText = `
    position: absolute;
    background: linear-gradient(to bottom, var(--accent-primary), rgba(var(--accent-primary-rgb), 0.5));
    cursor: ew-resize;
    z-index: 52;
    display: none;
    box-shadow: 0 0 8px rgba(var(--accent-primary-rgb), 0.6), 0 0 2px rgba(0, 0, 0, 0.8);
  `;
  container.appendChild(splitLine);

  // Create A label (left/top side)
  const labelA = document.createElement('div');
  labelA.className = 'split-screen-label-a';
  labelA.dataset.testid = 'split-screen-label-a';
  labelA.textContent = 'A';
  labelA.style.cssText = `
    position: absolute;
    background: rgba(var(--accent-primary-rgb), 0.85);
    color: white;
    padding: 6px 12px;
    border-radius: 4px;
    font-size: 13px;
    font-weight: 700;
    z-index: 53;
    display: none;
    pointer-events: none;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
  `;
  container.appendChild(labelA);

  // Create B label (right/bottom side)
  const labelB = document.createElement('div');
  labelB.className = 'split-screen-label-b';
  labelB.dataset.testid = 'split-screen-label-b';
  labelB.textContent = 'B';
  labelB.style.cssText = `
    position: absolute;
    background: rgba(255, 180, 50, 0.9);
    color: var(--bg-primary);
    padding: 6px 12px;
    border-radius: 4px;
    font-size: 13px;
    font-weight: 700;
    z-index: 53;
    display: none;
    pointer-events: none;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
  `;
  container.appendChild(labelB);

  return { splitLine, labelA, labelB };
}

/**
 * Update split screen line position and labels based on current state
 */
export function updateSplitScreenPosition(
  state: SplitScreenState,
  elements: SplitScreenUIElements,
  containerRect: DOMRect,
  canvasRect: DOMRect,
  displayWidth: number,
  displayHeight: number
): void {
  const { splitLine, labelA, labelB } = elements;

  if (state.mode === 'off') {
    splitLine.style.display = 'none';
    labelA.style.display = 'none';
    labelB.style.display = 'none';
    return;
  }

  splitLine.style.display = 'block';

  const canvasLeft = canvasRect.left - containerRect.left;
  const canvasTop = canvasRect.top - containerRect.top;
  const position = state.position;

  if (state.mode === 'splitscreen-h') {
    // Vertical line for horizontal split (A on left, B on right)
    const x = canvasLeft + displayWidth * position;
    splitLine.style.width = '4px';
    splitLine.style.height = `${displayHeight}px`;
    splitLine.style.left = `${x - 2}px`;
    splitLine.style.top = `${canvasTop}px`;
    splitLine.style.cursor = 'ew-resize';
    splitLine.style.background = 'linear-gradient(to bottom, var(--accent-primary), rgba(var(--accent-primary-rgb), 0.5))';

    // Position A label in bottom-left corner
    if (position < LABEL_HIDE_THRESHOLD_LOW) {
      labelA.style.display = 'none';
    } else {
      labelA.style.display = 'block';
      labelA.style.left = `${canvasLeft + 12}px`;
      labelA.style.top = `${canvasTop + displayHeight - 40}px`;
    }

    // Position B label in bottom-right corner
    if (position > LABEL_HIDE_THRESHOLD_HIGH) {
      labelB.style.display = 'none';
    } else {
      labelB.style.display = 'block';
      labelB.style.left = `${canvasLeft + displayWidth - 40}px`;
      labelB.style.top = `${canvasTop + displayHeight - 40}px`;
    }
  } else if (state.mode === 'splitscreen-v') {
    // Horizontal line for vertical split (A on top, B on bottom)
    const y = canvasTop + displayHeight * position;
    splitLine.style.width = `${displayWidth}px`;
    splitLine.style.height = '4px';
    splitLine.style.left = `${canvasLeft}px`;
    splitLine.style.top = `${y - 2}px`;
    splitLine.style.cursor = 'ns-resize';
    splitLine.style.background = 'linear-gradient(to right, var(--accent-primary), rgba(var(--accent-primary-rgb), 0.5))';

    // Position A label in top-left corner
    if (position < LABEL_HIDE_THRESHOLD_LOW) {
      labelA.style.display = 'none';
    } else {
      labelA.style.display = 'block';
      labelA.style.left = `${canvasLeft + 12}px`;
      labelA.style.top = `${canvasTop + 12}px`;
    }

    // Position B label in bottom-left corner
    if (position > LABEL_HIDE_THRESHOLD_HIGH) {
      labelB.style.display = 'none';
    } else {
      labelB.style.display = 'block';
      labelB.style.left = `${canvasLeft + 12}px`;
      labelB.style.top = `${canvasTop + displayHeight - 40}px`;
    }
  }
}

/**
 * Check if pointer is on or near the split screen line
 */
export function isPointerOnSplitLine(
  e: PointerEvent,
  state: SplitScreenState,
  splitLineRect: DOMRect,
  tolerance: number = 12
): boolean {
  if (state.mode === 'off') return false;

  if (state.mode === 'splitscreen-h') {
    return Math.abs(e.clientX - (splitLineRect.left + splitLineRect.width / 2)) <= tolerance;
  } else if (state.mode === 'splitscreen-v') {
    return Math.abs(e.clientY - (splitLineRect.top + splitLineRect.height / 2)) <= tolerance;
  }

  return false;
}

/**
 * Calculate new split position from pointer movement
 */
export function calculateSplitPosition(
  e: PointerEvent,
  state: SplitScreenState,
  canvasRect: DOMRect,
  displayWidth: number,
  displayHeight: number
): number {
  if (state.mode === 'splitscreen-h') {
    const x = e.clientX - canvasRect.left;
    return Math.max(0.05, Math.min(0.95, x / displayWidth));
  } else if (state.mode === 'splitscreen-v') {
    const y = e.clientY - canvasRect.top;
    return Math.max(0.05, Math.min(0.95, y / displayHeight));
  }
  return state.position;
}

/**
 * Check if split screen mode is active
 */
export function isSplitScreenMode(mode: string): mode is SplitScreenMode {
  return mode === 'splitscreen-h' || mode === 'splitscreen-v';
}
