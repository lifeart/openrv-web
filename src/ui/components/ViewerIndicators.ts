/**
 * ViewerIndicators - HUD indicator/badge management for the Viewer.
 *
 * Extracted from Viewer.ts to separate the visual indicator/badge management
 * (LUT indicator, A/B indicator, filter mode badge/indicator, fit mode indicator)
 * from the monolithic Viewer class.
 *
 * All functions are standalone and operate on the DOM elements directly.
 */

import type { TextureFilterMode } from '../../core/types/filter';
import type { Session } from '../../core/session/Session';
import type { WipeManager } from './WipeManager';

const FILTER_MODE_STORAGE_KEY = 'openrv.filterMode';

/**
 * Create the LUT indicator badge element.
 */
export function createLutIndicator(): HTMLElement {
  const lutIndicator = document.createElement('div');
  lutIndicator.className = 'lut-indicator';
  lutIndicator.style.cssText = `
    position: absolute;
    top: 10px;
    right: 10px;
    background: rgba(var(--accent-primary-rgb), 0.8);
    color: white;
    padding: 4px 8px;
    border-radius: 4px;
    font-size: 11px;
    font-weight: 600;
    z-index: 60;
    display: none;
    pointer-events: none;
  `;
  lutIndicator.textContent = 'LUT';
  return lutIndicator;
}

/**
 * Create the A/B indicator badge element.
 */
export function createABIndicator(): HTMLElement {
  const abIndicator = document.createElement('div');
  abIndicator.className = 'ab-indicator';
  abIndicator.dataset.testid = 'ab-indicator';
  abIndicator.style.cssText = `
    position: absolute;
    top: 10px;
    right: 60px;
    background: rgba(255, 180, 50, 0.9);
    color: var(--bg-primary);
    padding: 4px 10px;
    border-radius: 4px;
    font-size: 12px;
    font-weight: 700;
    z-index: 60;
    display: none;
    pointer-events: none;
  `;
  abIndicator.textContent = 'A';
  return abIndicator;
}

/**
 * Create the filter mode persistent badge element.
 */
export function createFilterModeBadge(): HTMLElement {
  const filterModeBadge = document.createElement('div');
  filterModeBadge.className = 'filter-mode-badge';
  filterModeBadge.dataset.testid = 'filter-mode-badge';
  filterModeBadge.style.cssText = `
    position: absolute;
    top: 10px;
    right: 110px;
    background: rgba(120, 200, 255, 0.9);
    color: #000;
    padding: 4px 8px;
    border-radius: 4px;
    font-size: 11px;
    font-weight: 700;
    z-index: 60;
    display: none;
    pointer-events: none;
  `;
  filterModeBadge.textContent = 'NN';
  return filterModeBadge;
}

/**
 * Update A/B indicator visibility and text.
 */
export function updateABIndicator(
  abIndicator: HTMLElement | null,
  session: Session,
  wipeManager: WipeManager,
  current?: 'A' | 'B'
): void {
  if (!abIndicator) return;

  const ab = current ?? session.currentAB;
  const available = session.abCompareAvailable;

  // Hide the A/B indicator in split screen mode since both sources are visible
  if (wipeManager.isSplitScreen) {
    abIndicator.style.display = 'none';
    return;
  }

  if (available) {
    abIndicator.style.display = 'block';
    abIndicator.textContent = ab;
    if (ab === 'A') {
      abIndicator.style.background = 'rgba(var(--accent-primary-rgb), 0.9)';
      abIndicator.style.color = 'white';
    } else {
      abIndicator.style.background = 'rgba(255, 180, 50, 0.9)';
      abIndicator.style.color = 'var(--bg-primary)';
    }
  } else {
    abIndicator.style.display = 'none';
  }
}

/**
 * Show a transient filter mode indicator.
 * Returns cleanup handles (indicator element, timeout).
 */
export function showFilterModeIndicator(
  container: HTMLElement,
  mode: TextureFilterMode,
  previousIndicator: HTMLElement | null,
  previousTimeout: ReturnType<typeof setTimeout> | null
): { indicator: HTMLElement; timeout: ReturnType<typeof setTimeout> } {
  // Remove previous indicator
  if (previousIndicator?.parentNode) {
    previousIndicator.remove();
  }
  if (previousTimeout) {
    clearTimeout(previousTimeout);
  }

  const indicator = document.createElement('div');
  indicator.dataset.testid = 'filter-mode-indicator';
  indicator.textContent = mode === 'nearest' ? 'Nearest Neighbor' : 'Bilinear';
  indicator.style.cssText = `
    position: absolute;
    top: 12px;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(0, 0, 0, 0.75);
    color: #fff;
    font-family: monospace;
    font-size: 12px;
    padding: 6px 14px;
    border-radius: 4px;
    z-index: 100;
    pointer-events: none;
    opacity: 1;
    transition: opacity 0.3s ease-out;
  `;

  container.appendChild(indicator);

  const timeout = setTimeout(() => {
    indicator.style.opacity = '0';
    setTimeout(() => {
      if (indicator.parentNode) indicator.remove();
    }, 300);
  }, 1200);

  return { indicator, timeout };
}

/**
 * Show a brief transient indicator when fit mode changes.
 */
export function showFitModeIndicator(container: HTMLElement, mode: 'all' | 'width' | 'height'): void {
  const labels: Record<string, string> = {
    all: 'Fit All',
    width: 'Fit Width',
    height: 'Fit Height',
  };
  const label = labels[mode] ?? mode;

  // Remove any existing indicator
  const existing = container.querySelector('.fit-mode-indicator');
  if (existing) {
    existing.remove();
  }

  const indicator = document.createElement('div');
  indicator.className = 'fit-mode-indicator';
  indicator.textContent = label;
  indicator.style.cssText = `
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: rgba(0, 0, 0, 0.7);
    color: white;
    padding: 8px 16px;
    border-radius: 6px;
    font-size: 14px;
    font-family: -apple-system, BlinkMacSystemFont, sans-serif;
    pointer-events: none;
    z-index: 1000;
    transition: opacity 0.3s ease;
    opacity: 1;
  `;
  container.appendChild(indicator);

  setTimeout(() => {
    indicator.style.opacity = '0';
    setTimeout(() => {
      if (indicator.parentNode) {
        indicator.remove();
      }
    }, 300);
  }, 1200);
}

/**
 * Load filter mode preference from localStorage.
 */
export function loadFilterModePreference(): TextureFilterMode {
  try {
    const stored = localStorage.getItem(FILTER_MODE_STORAGE_KEY);
    if (stored === 'nearest' || stored === 'linear') return stored;
  } catch {
    // localStorage may be unavailable
  }
  return 'linear';
}

/**
 * Persist filter mode preference to localStorage.
 */
export function persistFilterModePreference(mode: TextureFilterMode): void {
  try {
    localStorage.setItem(FILTER_MODE_STORAGE_KEY, mode);
  } catch {
    // localStorage may be unavailable
  }
}
