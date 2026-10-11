/**
 * anchorPosition - positioning helpers for dropdown panels anchored to a
 * toolbar button.
 *
 * A panel can be opened via keyboard shortcut while its toggle button lives
 * on another (hidden) context-toolbar tab. In that case the anchor is
 * disconnected or `display: none`, `getBoundingClientRect()` returns an
 * all-zero rect, and naive positioning drops the panel at (0, 0) over the
 * header. These helpers detect that case and fall back to a top-right
 * placement just below the top chrome (header + tabs + context toolbar).
 */

/** Gap between the anchor (or top chrome) and the panel. */
const ANCHOR_GAP = 4;
/** Minimum distance kept from the viewport edges. */
const EDGE_MARGIN = 8;
/** Used when the top chrome container cannot be found. */
const DEFAULT_TOP_CHROME_HEIGHT = 60;

export type PanelAlign = 'left' | 'right';

export interface PanelPosition {
  top: number;
  left: number;
}

/** True when the anchor is attached and actually laid out (non-empty box). */
export function isAnchorVisible(anchor: HTMLElement | null | undefined): anchor is HTMLElement {
  if (!anchor || !anchor.isConnected) return false;
  const rect = anchor.getBoundingClientRect();
  return rect.width > 0 || rect.height > 0;
}

/** Bottom edge (px) of the app's top chrome, used as the fallback top. */
export function getTopChromeBottom(): number {
  const top = document.querySelector<HTMLElement>('.layout-top');
  if (top) {
    const rect = top.getBoundingClientRect();
    if (rect.bottom > 0) return rect.bottom;
  }
  return DEFAULT_TOP_CHROME_HEIGHT;
}

/**
 * Compute a fixed-position {top, left} for a panel of `panelWidth` pixels.
 * Anchored below `anchor` when it is visible; otherwise pinned to the
 * top-right corner below the top chrome.
 */
export function computeAnchoredPanelPosition(
  anchor: HTMLElement | null | undefined,
  panelWidth: number,
  align: PanelAlign = 'left',
): PanelPosition {
  const viewportWidth = window.innerWidth;
  const width = Number.isFinite(panelWidth) && panelWidth > 0 ? panelWidth : 0;

  if (!isAnchorVisible(anchor)) {
    return {
      top: getTopChromeBottom() + ANCHOR_GAP,
      left: Math.max(EDGE_MARGIN, viewportWidth - width - EDGE_MARGIN),
    };
  }

  const rect = anchor.getBoundingClientRect();
  const top = rect.bottom + ANCHOR_GAP;
  const left =
    align === 'right'
      ? Math.max(EDGE_MARGIN, rect.right - width)
      : Math.min(rect.left, viewportWidth - width - EDGE_MARGIN);
  return { top, left };
}
