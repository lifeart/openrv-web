/**
 * Viewer Wipe Module
 * Handles wipe comparison UI elements and interaction logic.
 */

import { WipeState } from './WipeControl';

// Wipe label constants
const DEFAULT_WIPE_LABEL_A = 'Original';
const DEFAULT_WIPE_LABEL_B = 'Graded';
const WIPE_LABEL_HIDE_THRESHOLD_LOW = 0.1; // Hide label A below 10%
const WIPE_LABEL_HIDE_THRESHOLD_HIGH = 0.9; // Hide label B above 90%

export interface WipeUIElements {
  wipeLine: HTMLElement;
  wipeLabelA: HTMLElement;
  wipeLabelB: HTMLElement;
}

/**
 * Create wipe UI elements (line and labels)
 */
export function createWipeUIElements(container: HTMLElement): WipeUIElements {
  // Create wipe line
  const wipeLine = document.createElement('div');
  wipeLine.className = 'wipe-line';
  wipeLine.style.cssText = `
    position: absolute;
    background: #4a9eff;
    cursor: ew-resize;
    z-index: 50;
    display: none;
    box-shadow: 0 0 4px rgba(74, 158, 255, 0.5);
  `;
  container.appendChild(wipeLine);

  // Create wipe source labels
  const wipeLabelA = document.createElement('div');
  wipeLabelA.className = 'wipe-label-a';
  wipeLabelA.dataset.testid = 'wipe-label-a';
  wipeLabelA.textContent = DEFAULT_WIPE_LABEL_A;
  wipeLabelA.style.cssText = `
    position: absolute;
    background: rgba(0, 0, 0, 0.7);
    color: #fff;
    padding: 4px 8px;
    border-radius: 4px;
    font-size: 11px;
    font-weight: 500;
    z-index: 51;
    display: none;
    pointer-events: none;
  `;
  container.appendChild(wipeLabelA);

  const wipeLabelB = document.createElement('div');
  wipeLabelB.className = 'wipe-label-b';
  wipeLabelB.dataset.testid = 'wipe-label-b';
  wipeLabelB.textContent = DEFAULT_WIPE_LABEL_B;
  wipeLabelB.style.cssText = `
    position: absolute;
    background: rgba(74, 158, 255, 0.7);
    color: #fff;
    padding: 4px 8px;
    border-radius: 4px;
    font-size: 11px;
    font-weight: 500;
    z-index: 51;
    display: none;
    pointer-events: none;
  `;
  container.appendChild(wipeLabelB);

  return { wipeLine, wipeLabelA, wipeLabelB };
}

/**
 * Update wipe label visibility based on position (internal helper)
 */
function updateWipeLabelVisibility(
  label: HTMLElement | null,
  position: number,
  isLowBoundary: boolean,
  left: string,
  top: string
): void {
  if (!label) return;

  // Determine visibility based on position thresholds
  const shouldHide = isLowBoundary
    ? position < WIPE_LABEL_HIDE_THRESHOLD_LOW
    : position > WIPE_LABEL_HIDE_THRESHOLD_HIGH;

  if (shouldHide) {
    label.style.display = 'none';
  } else {
    label.style.display = 'block';
    label.style.left = left;
    label.style.top = top;
  }
}

/**
 * Update wipe line position and labels based on current state
 */
export function updateWipeLinePosition(
  wipeState: WipeState,
  elements: WipeUIElements,
  containerRect: DOMRect,
  canvasRect: DOMRect,
  displayWidth: number,
  displayHeight: number
): void {
  const { wipeLine, wipeLabelA, wipeLabelB } = elements;

  if (wipeState.mode === 'off') {
    wipeLine.style.display = 'none';
    wipeLabelA.style.display = 'none';
    wipeLabelB.style.display = 'none';
    return;
  }

  wipeLine.style.display = 'block';

  const canvasLeft = canvasRect.left - containerRect.left;
  const canvasTop = canvasRect.top - containerRect.top;
  const position = wipeState.position;

  if (wipeState.mode === 'horizontal') {
    // Vertical line for horizontal wipe
    const x = canvasLeft + displayWidth * position;
    wipeLine.style.width = '3px';
    wipeLine.style.height = `${displayHeight}px`;
    wipeLine.style.left = `${x - 1}px`;
    wipeLine.style.top = `${canvasTop}px`;
    wipeLine.style.cursor = 'ew-resize';

    // Position labels at bottom of each side, hide at boundaries
    updateWipeLabelVisibility(
      wipeLabelA,
      position,
      true, // isLowBoundary
      `${canvasLeft + 10}px`,
      `${canvasTop + displayHeight - 30}px`
    );
    updateWipeLabelVisibility(
      wipeLabelB,
      position,
      false, // isLowBoundary
      `${x + 10}px`,
      `${canvasTop + displayHeight - 30}px`
    );
  } else if (wipeState.mode === 'vertical') {
    // Horizontal line for vertical wipe
    const y = canvasTop + displayHeight * position;
    wipeLine.style.width = `${displayWidth}px`;
    wipeLine.style.height = '3px';
    wipeLine.style.left = `${canvasLeft}px`;
    wipeLine.style.top = `${y - 1}px`;
    wipeLine.style.cursor = 'ns-resize';

    // Position labels on left side, hide at boundaries
    updateWipeLabelVisibility(
      wipeLabelA,
      position,
      true, // isLowBoundary
      `${canvasLeft + 10}px`,
      `${canvasTop + 10}px`
    );
    updateWipeLabelVisibility(
      wipeLabelB,
      position,
      false, // isLowBoundary
      `${canvasLeft + 10}px`,
      `${y + 10}px`
    );
  }
}

/**
 * Check if pointer is on or near the wipe line
 */
export function isPointerOnWipeLine(
  e: PointerEvent,
  wipeState: WipeState,
  wipeLineRect: DOMRect,
  tolerance: number = 10
): boolean {
  if (wipeState.mode === 'off') return false;

  if (wipeState.mode === 'horizontal') {
    return Math.abs(e.clientX - (wipeLineRect.left + wipeLineRect.width / 2)) <= tolerance;
  } else if (wipeState.mode === 'vertical') {
    return Math.abs(e.clientY - (wipeLineRect.top + wipeLineRect.height / 2)) <= tolerance;
  }

  return false;
}

/**
 * Calculate new wipe position from pointer movement
 */
export function calculateWipePosition(
  e: PointerEvent,
  wipeState: WipeState,
  canvasRect: DOMRect,
  displayWidth: number,
  displayHeight: number
): number {
  if (wipeState.mode === 'horizontal') {
    const x = e.clientX - canvasRect.left;
    return Math.max(0, Math.min(1, x / displayWidth));
  } else if (wipeState.mode === 'vertical') {
    const y = e.clientY - canvasRect.top;
    return Math.max(0, Math.min(1, y / displayHeight));
  }
  return wipeState.position;
}

/**
 * Set wipe labels text
 */
export function setWipeLabels(
  elements: WipeUIElements,
  labelA: string,
  labelB: string
): void {
  elements.wipeLabelA.textContent = labelA;
  elements.wipeLabelB.textContent = labelB;
}

/**
 * Get wipe labels text
 */
export function getWipeLabels(elements: WipeUIElements): { labelA: string; labelB: string } {
  return {
    labelA: elements.wipeLabelA.textContent || DEFAULT_WIPE_LABEL_A,
    labelB: elements.wipeLabelB.textContent || DEFAULT_WIPE_LABEL_B,
  };
}
