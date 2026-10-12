/**
 * ViewerLoadStateOverlay - DOM overlays for the viewer's "nothing loaded" and
 * "loading" states.
 *
 * - Empty state: accessible text ("Drop media or session files here", the
 *   supported formats) plus a real "Open file…" button, shown only while the
 *   session has no sources and nothing is loading. Previously this copy was
 *   painted onto the canvas, so it could not be clicked or read by assistive
 *   technology.
 * - Loading indicator: a small spinner HUD ("Loading shot_010.exr…") shown
 *   from `sourceLoadingStarted` until the matching `sourceLoaded` /
 *   `sourceLoadFailed`, announced through a polite live region.
 *
 * Both layers are `pointer-events: none` except the button, so viewer
 * pan/zoom, painting and drag-and-drop keep working underneath.
 */

import type { SessionEvents } from '../../core/session/SessionTypes';
import { VIEWER_PLACEHOLDER_SUPPORT_LINES } from '../../utils/media/SupportedMediaFormats';
import { applyA11yFocus } from './shared/Button';
import { getIconSvg } from './shared/Icons';
import { SHADOWS, Z_INDEX } from './shared/theme';

type LoadStateEvents = Pick<
  SessionEvents,
  'sourceLoadingStarted' | 'sourceLoaded' | 'sourceLoadFailed' | 'currentSourceChanged' | 'sessionLoaded'
>;

/** The slice of Session this overlay depends on. */
export interface ViewerLoadStateSession {
  readonly sourceCount: number;
  on<K extends keyof LoadStateEvents>(event: K, callback: (data: LoadStateEvents[K]) => void): () => void;
}

export interface ViewerLoadStateOverlayOptions {
  /** Element the overlays are positioned in (the viewer container; must be positioned). */
  container: HTMLElement;
  session: ViewerLoadStateSession;
  /** Invoked by the empty-state "Open file…" button. Omit to hide the button. */
  onOpenFile?: () => void;
  /**
   * Safety net: forget a load that never reported completion after this many
   * ms so the indicator cannot get stuck. Default 120 000.
   */
  stuckLoadTimeoutMs?: number;
}

export const EMPTY_STATE_TITLE = 'Drop media or session files here';
export const EMPTY_STATE_TIP = 'Tip: drop numbered frames to auto-detect a sequence';

const SPINNER_SVG = `
<svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
  <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-opacity="0.25" stroke-width="3"/>
  <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" stroke-width="3" stroke-linecap="round">
    <animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="0.8s" repeatCount="indefinite"/>
  </path>
</svg>`;

export class ViewerLoadStateOverlay {
  private readonly container: HTMLElement;
  private readonly session: ViewerLoadStateSession;
  private readonly stuckLoadTimeoutMs: number;
  private readonly emptyState: HTMLElement;
  private readonly openButton: HTMLButtonElement | null = null;
  private readonly loadingIndicator: HTMLElement;
  private readonly loadingText: HTMLElement;
  private readonly unsubscribers: Array<() => void> = [];
  private readonly cleanupFns: Array<() => void> = [];
  /**
   * In-flight loads by name, oldest first. Each entry holds that load's
   * stuck-load safety timer (a name can be loading more than once).
   */
  private readonly pending = new Map<string, Array<ReturnType<typeof setTimeout> | null>>();
  private disposed = false;

  constructor(options: ViewerLoadStateOverlayOptions) {
    this.container = options.container;
    this.session = options.session;
    this.stuckLoadTimeoutMs = options.stuckLoadTimeoutMs ?? 120_000;

    // ---- Empty state ----
    this.emptyState = document.createElement('div');
    this.emptyState.className = 'viewer-empty-state';
    this.emptyState.dataset.testid = 'viewer-empty-state';
    this.emptyState.setAttribute('role', 'region');
    this.emptyState.setAttribute('aria-label', 'No media loaded');
    this.emptyState.style.cssText = `
      position: absolute;
      inset: 0;
      display: none;
      align-items: center;
      justify-content: center;
      padding: 24px;
      box-sizing: border-box;
      pointer-events: none;
      z-index: ${Z_INDEX.viewerOverlay};
    `;

    const card = document.createElement('div');
    card.style.cssText = `
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 10px;
      max-width: min(720px, 100%);
      text-align: center;
      color: var(--text-secondary);
      font-family: var(--font-family, -apple-system, BlinkMacSystemFont, sans-serif);
    `;

    const icon = document.createElement('div');
    icon.setAttribute('aria-hidden', 'true');
    icon.innerHTML = getIconSvg('folder-open', 'lg');
    icon.style.cssText = 'color: var(--text-muted); display: flex;';
    card.appendChild(icon);

    const title = document.createElement('p');
    title.className = 'viewer-empty-state-title';
    title.textContent = EMPTY_STATE_TITLE;
    title.style.cssText = 'margin: 0; font-size: 20px; color: var(--text-secondary);';
    card.appendChild(title);

    if (options.onOpenFile) {
      const onOpenFile = options.onOpenFile;
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.testid = 'viewer-empty-state-open';
      button.innerHTML = `${getIconSvg('folder-open', 'sm')}<span>Open file…</span>`;
      button.style.cssText = `
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 6px 14px;
        background: var(--accent-primary);
        color: var(--text-on-accent, #fff);
        border: 1px solid var(--accent-primary);
        border-radius: 4px;
        font-size: 12px;
        font-weight: 500;
        cursor: pointer;
        pointer-events: auto;
        outline: none;
      `;
      const onEnter = (): void => {
        button.style.background = 'var(--accent-hover)';
      };
      const onLeave = (): void => {
        button.style.background = 'var(--accent-primary)';
      };
      button.addEventListener('pointerenter', onEnter);
      button.addEventListener('pointerleave', onLeave);
      button.addEventListener('click', (e) => {
        e.stopPropagation();
        onOpenFile();
      });
      this.cleanupFns.push(applyA11yFocus(button));
      card.appendChild(button);
      this.openButton = button;
    }

    const support = document.createElement('div');
    support.style.cssText =
      'display: flex; flex-direction: column; gap: 2px; font-size: 12px; color: var(--text-muted);';
    for (const line of VIEWER_PLACEHOLDER_SUPPORT_LINES) {
      const p = document.createElement('p');
      p.textContent = line;
      p.style.margin = '0';
      support.appendChild(p);
    }
    card.appendChild(support);

    const tip = document.createElement('p');
    tip.textContent = EMPTY_STATE_TIP;
    tip.style.cssText = 'margin: 0; font-size: 12px; color: var(--text-secondary);';
    card.appendChild(tip);

    this.emptyState.appendChild(card);

    // ---- Loading indicator ----
    this.loadingIndicator = document.createElement('div');
    this.loadingIndicator.className = 'viewer-loading-indicator';
    this.loadingIndicator.dataset.testid = 'viewer-loading-indicator';
    this.loadingIndicator.setAttribute('role', 'status');
    this.loadingIndicator.setAttribute('aria-live', 'polite');
    this.loadingIndicator.style.cssText = `
      position: absolute;
      left: 50%;
      bottom: 16px;
      transform: translateX(-50%);
      display: none;
      align-items: center;
      gap: 8px;
      max-width: calc(100% - 32px);
      padding: 6px 12px;
      background: var(--overlay-bg);
      color: var(--text-primary);
      border: 1px solid var(--overlay-border);
      border-radius: 999px;
      box-shadow: ${SHADOWS.dropdown};
      font-size: 12px;
      pointer-events: none;
      z-index: ${Z_INDEX.viewerHud};
    `;
    const spinner = document.createElement('span');
    spinner.innerHTML = SPINNER_SVG;
    spinner.style.cssText = 'display: inline-flex; color: var(--accent-primary); flex-shrink: 0;';
    this.loadingText = document.createElement('span');
    this.loadingText.style.cssText = 'overflow: hidden; text-overflow: ellipsis; white-space: nowrap;';
    this.loadingIndicator.appendChild(spinner);
    this.loadingIndicator.appendChild(this.loadingText);

    this.container.appendChild(this.emptyState);
    this.container.appendChild(this.loadingIndicator);

    // ---- Session wiring ----
    this.unsubscribers.push(
      this.session.on('sourceLoadingStarted', ({ name }) => this.onLoadStarted(name)),
      this.session.on('sourceLoaded', (source) => this.onLoadFinished(source.name)),
      this.session.on('sourceLoadFailed', ({ name }) => this.onLoadFinished(name)),
      this.session.on('currentSourceChanged', () => this.update()),
      this.session.on('sessionLoaded', () => this.update()),
    );

    this.update();
  }

  /** Whether the empty-state overlay is currently shown. */
  isEmptyStateVisible(): boolean {
    return this.emptyState.style.display !== 'none';
  }

  /** Whether the loading indicator is currently shown. */
  isLoadingVisible(): boolean {
    return this.loadingIndicator.style.display !== 'none';
  }

  getEmptyStateElement(): HTMLElement {
    return this.emptyState;
  }

  getLoadingElement(): HTMLElement {
    return this.loadingIndicator;
  }

  getOpenButton(): HTMLButtonElement | null {
    return this.openButton;
  }

  /** Re-evaluate visibility (e.g. after sources were removed). */
  update(): void {
    if (this.disposed) return;

    const loadingCount = this.pendingCount();
    if (loadingCount > 0) {
      const names = [...this.pending.keys()];
      this.loadingText.textContent =
        loadingCount === 1 && names[0] ? `Loading ${names[0]}…` : `Loading ${loadingCount} files…`;
      this.loadingIndicator.style.display = 'flex';
    } else {
      this.loadingText.textContent = '';
      this.loadingIndicator.style.display = 'none';
    }

    const showEmpty = this.session.sourceCount === 0 && loadingCount === 0;
    this.emptyState.style.display = showEmpty ? 'flex' : 'none';
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const unsub of this.unsubscribers) unsub();
    this.unsubscribers.length = 0;
    for (const fn of this.cleanupFns) fn();
    this.cleanupFns.length = 0;
    for (const timers of this.pending.values()) {
      for (const timer of timers) if (timer !== null) clearTimeout(timer);
    }
    this.pending.clear();
    this.emptyState.remove();
    this.loadingIndicator.remove();
  }

  private pendingCount(): number {
    let count = 0;
    for (const timers of this.pending.values()) count += timers.length;
    return count;
  }

  private onLoadStarted(name: string): void {
    const key = name || 'media';
    const timers = this.pending.get(key) ?? [];
    let timer: ReturnType<typeof setTimeout> | null = null;
    if (this.stuckLoadTimeoutMs > 0) {
      timer = setTimeout(() => this.releaseTimer(key, timer), this.stuckLoadTimeoutMs);
    }
    timers.push(timer);
    this.pending.set(key, timers);
    this.update();
  }

  private onLoadFinished(name: string): void {
    const key = name || 'media';
    if (this.pending.has(key)) {
      this.releaseOldest(key);
      return;
    }
    // The finished source can carry a different name than the one announced
    // at start (e.g. sequence pattern -> display name). Release the oldest
    // pending load so the indicator cannot get stuck.
    const first = this.pending.keys().next().value;
    if (first !== undefined) {
      this.releaseOldest(first);
    } else {
      this.update();
    }
  }

  private releaseOldest(key: string): void {
    const timers = this.pending.get(key);
    if (!timers) return;
    const timer = timers.shift();
    if (timer !== undefined && timer !== null) clearTimeout(timer);
    if (timers.length === 0) this.pending.delete(key);
    this.update();
  }

  private releaseTimer(key: string, timer: ReturnType<typeof setTimeout> | null): void {
    const timers = this.pending.get(key);
    if (!timers) return;
    const index = timers.indexOf(timer);
    if (index === -1) return;
    timers.splice(index, 1);
    if (timers.length === 0) this.pending.delete(key);
    this.update();
  }
}
