/**
 * ShotGridPanel - UI panel for browsing and loading ShotGrid versions.
 *
 * Features:
 * - Config section (embeds ShotGridConfigUI when disconnected)
 * - Toolbar with query input and mode toggle (Playlist / Shot)
 * - Scrollable version list with status badges and action buttons
 * - XSS-safe: all ShotGrid strings rendered via textContent
 */

import { EventEmitter, type EventMap } from '../../utils/EventEmitter';
import { STATUS_COLORS } from '../../core/session/StatusManager';
import { mapStatusFromShotGrid, type ShotGridVersion } from '../../integrations/ShotGridBridge';
import type { ShotGridConfigUI } from '../../integrations/ShotGridConfig';
import { getIconSvg } from './shared/Icons';
import { applyA11yFocus } from './shared/Button';

// ---------------------------------------------------------------------------
// URL parsing
// ---------------------------------------------------------------------------

export interface ShotGridInputResult {
  mode: QueryMode;
  id: number;
}

/**
 * Parse user input that may be a plain numeric ID or a ShotGrid URL.
 *
 * Supported URL patterns:
 *   https://site.shotgrid.autodesk.com/detail/Version/12345
 *   https://site.shotgunstudio.com/detail/Shot/67890
 *   https://site.shotgrid.autodesk.com/page/1234#Version_12345
 *
 * Returns null if the input cannot be parsed.
 */
export function parseShotGridInput(raw: string, currentMode: QueryMode): ShotGridInputResult | null {
  const trimmed = raw.trim();
  if (trimmed === '') return null;

  // Try URL parsing first (input contains '/' or starts with http)
  if (trimmed.includes('/') || trimmed.startsWith('http')) {
    return parseShotGridUrl(trimmed);
  }

  // Plain numeric ID
  const id = parseInt(trimmed, 10);
  if (!Number.isFinite(id) || id < 1) return null;
  return { mode: currentMode, id };
}

const ENTITY_TYPE_TO_MODE: Record<string, QueryMode> = {
  version: 'version',
  shot: 'shot',
  playlist: 'playlist',
};

function parseShotGridUrl(input: string): ShotGridInputResult | null {
  // Pattern 1: /detail/EntityType/ID
  const detailMatch = input.match(/\/detail\/(\w+)\/(\d+)/);
  if (detailMatch) {
    const entityType = detailMatch[1]!.toLowerCase();
    const id = parseInt(detailMatch[2]!, 10);
    const mode = ENTITY_TYPE_TO_MODE[entityType];
    if (mode && Number.isFinite(id) && id > 0) {
      return { mode, id };
    }
    return null;
  }

  // Pattern 2: #EntityType_ID (fragment-based)
  const fragmentMatch = input.match(/#(\w+)_(\d+)/);
  if (fragmentMatch) {
    const entityType = fragmentMatch[1]!.toLowerCase();
    const id = parseInt(fragmentMatch[2]!, 10);
    const mode = ENTITY_TYPE_TO_MODE[entityType];
    if (mode && Number.isFinite(id) && id > 0) {
      return { mode, id };
    }
    return null;
  }

  return null;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type QueryMode = 'playlist' | 'shot' | 'version';

export interface ShotGridPanelEvents extends EventMap {
  loadVersion: { version: ShotGridVersion; mediaUrl: string | null };
  pushNotes: { versionId: number; sourceIndex: number };
  pullNotes: { versionId: number; sourceIndex: number };
  pushStatus: { versionId: number; sourceIndex: number };
  loadPlaylist: { playlistId: number };
  loadShot: { shotId: number };
  loadVersionById: { versionId: number };
  visibilityChanged: boolean;
}

// ---------------------------------------------------------------------------
// ShotGridPanel
// ---------------------------------------------------------------------------

export class ShotGridPanel extends EventEmitter<ShotGridPanelEvents> {
  private container: HTMLElement;
  private configSection: HTMLElement;
  private toolbarSection: HTMLElement;
  private listContainer: HTMLElement;
  private stateContainer: HTMLElement;
  private queryInput: HTMLInputElement;
  private modeToggle: HTMLButtonElement;
  private loadBtn: HTMLButtonElement;
  private isVisible = false;
  private disposed = false;
  private connected = false;
  private queryMode: QueryMode = 'playlist';
  private versions: ShotGridVersion[] = [];
  /** versionId -> sourceIndex */
  private versionSourceMap = new Map<number, number>();
  /** sourceIndex -> versionId */
  private sourceVersionMap = new Map<number, number>();

  constructor() {
    super();

    // Main container
    this.container = document.createElement('div');
    this.container.className = 'shotgrid-panel';
    this.container.dataset.testid = 'shotgrid-panel';
    this.container.style.cssText = `
      position: fixed;
      right: 16px;
      top: 60px;
      width: 380px;
      max-height: calc(100vh - 120px);
      background: var(--bg-secondary);
      border: 1px solid var(--border-primary);
      border-radius: 8px;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
      z-index: 1000;
      display: none;
      flex-direction: column;
      overflow: hidden;
    `;

    // Header
    const header = document.createElement('div');
    header.style.cssText = `
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px 16px;
      border-bottom: 1px solid var(--border-primary);
      background: var(--bg-tertiary);
    `;

    const title = document.createElement('div');
    title.style.cssText = 'display: flex; align-items: center; gap: 8px; font-weight: 600; color: var(--text-primary);';
    title.innerHTML = `${getIconSvg('cloud', 'sm')}`;
    const titleText = document.createElement('span');
    titleText.textContent = 'ShotGrid';
    title.appendChild(titleText);
    header.appendChild(title);

    const closeBtn = document.createElement('button');
    closeBtn.innerHTML = getIconSvg('close', 'sm');
    closeBtn.title = 'Close';
    closeBtn.dataset.testid = 'shotgrid-panel-close';
    closeBtn.style.cssText = `
      background: transparent;
      border: none;
      color: var(--text-muted);
      cursor: pointer;
      padding: 4px;
      border-radius: 4px;
      display: flex;
      align-items: center;
      justify-content: center;
    `;
    closeBtn.addEventListener('click', () => this.hide());
    closeBtn.addEventListener('pointerenter', () => {
      closeBtn.style.background = 'var(--bg-hover)';
      closeBtn.style.color = 'var(--text-primary)';
    });
    closeBtn.addEventListener('pointerleave', () => {
      closeBtn.style.background = 'transparent';
      closeBtn.style.color = 'var(--text-muted)';
    });
    applyA11yFocus(closeBtn);
    header.appendChild(closeBtn);
    this.container.appendChild(header);

    // Config section (shown when disconnected)
    this.configSection = document.createElement('div');
    this.configSection.dataset.testid = 'shotgrid-config-section';
    this.configSection.style.cssText = 'border-bottom: 1px solid var(--border-primary);';
    this.container.appendChild(this.configSection);

    // Toolbar
    this.toolbarSection = document.createElement('div');
    this.toolbarSection.dataset.testid = 'shotgrid-toolbar';
    this.toolbarSection.style.cssText = `
      display: flex;
      gap: 6px;
      padding: 10px 12px;
      border-bottom: 1px solid var(--border-primary);
      align-items: center;
    `;

    this.queryInput = document.createElement('input');
    this.queryInput.type = 'text';
    this.queryInput.placeholder = 'Playlist ID or ShotGrid URL';
    this.queryInput.dataset.testid = 'shotgrid-query-input';
    this.queryInput.style.cssText = `
      flex: 1;
      padding: 6px 8px;
      border: 1px solid var(--border-primary);
      border-radius: 4px;
      background: var(--bg-primary);
      color: var(--text-primary);
      font-size: 12px;
      outline: none;
    `;
    this.queryInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.handleLoad();
    });
    this.toolbarSection.appendChild(this.queryInput);

    this.modeToggle = document.createElement('button');
    this.modeToggle.type = 'button';
    this.modeToggle.dataset.testid = 'shotgrid-mode-toggle';
    this.modeToggle.textContent = 'Playlist';
    this.modeToggle.title = 'Toggle between Playlist, Shot, and Version mode';
    this.modeToggle.style.cssText = `
      padding: 6px 10px;
      border: 1px solid var(--border-primary);
      border-radius: 4px;
      background: transparent;
      color: var(--text-secondary);
      cursor: pointer;
      font-size: 11px;
      white-space: nowrap;
    `;
    this.modeToggle.addEventListener('click', () => this.toggleMode());
    applyA11yFocus(this.modeToggle);
    this.toolbarSection.appendChild(this.modeToggle);

    this.loadBtn = document.createElement('button');
    this.loadBtn.type = 'button';
    this.loadBtn.dataset.testid = 'shotgrid-load-btn';
    this.loadBtn.textContent = 'Load';
    this.loadBtn.style.cssText = `
      padding: 6px 12px;
      border: 1px solid var(--accent-primary);
      border-radius: 4px;
      background: rgba(59, 130, 246, 0.1);
      color: var(--accent-primary);
      cursor: pointer;
      font-size: 12px;
      font-weight: 500;
    `;
    this.loadBtn.addEventListener('click', () => this.handleLoad());
    applyA11yFocus(this.loadBtn);
    this.toolbarSection.appendChild(this.loadBtn);

    this.container.appendChild(this.toolbarSection);

    // State display (loading, error, empty)
    this.stateContainer = document.createElement('div');
    this.stateContainer.dataset.testid = 'shotgrid-state';
    this.stateContainer.style.cssText =
      'display: none; text-align: center; padding: 24px 16px; color: var(--text-muted); font-size: 12px;';
    this.container.appendChild(this.stateContainer);

    // Version list
    this.listContainer = document.createElement('div');
    this.listContainer.dataset.testid = 'shotgrid-version-list';
    this.listContainer.style.cssText = 'flex: 1; overflow-y: auto; padding: 8px;';
    this.container.appendChild(this.listContainer);

    // Initial state
    this.updateToolbarVisibility();
  }

  // ---- Public API ----

  setConfigUI(configUI: ShotGridConfigUI): void {
    this.configSection.replaceChildren(configUI.render());
  }

  setConnected(connected: boolean): void {
    this.connected = connected;
    this.configSection.style.display = connected ? 'none' : 'block';
    this.updateToolbarVisibility();
    if (!connected) {
      this.versions = [];
      this.renderVersions();
    }
  }

  setVersions(versions: ShotGridVersion[]): void {
    this.versions = versions;
    this.renderVersions();
    this.showState(null);
  }

  setLoading(loading: boolean): void {
    if (loading) {
      this.showState('loading');
      this.listContainer.replaceChildren();
    } else {
      this.showState(null);
    }
  }

  setError(message: string): void {
    this.showState('error', message);
    this.listContainer.replaceChildren();
  }

  mapVersionToSource(versionId: number, sourceIndex: number): void {
    this.versionSourceMap.set(versionId, sourceIndex);
    this.sourceVersionMap.set(sourceIndex, versionId);
  }

  getSourceForVersion(versionId: number): number | undefined {
    return this.versionSourceMap.get(versionId);
  }

  getVersionForSource(sourceIndex: number): number | undefined {
    return this.sourceVersionMap.get(sourceIndex);
  }

  show(): void {
    if (!document.body.contains(this.container)) {
      document.body.appendChild(this.container);
    }
    this.container.style.display = 'flex';
    this.isVisible = true;
    this.emit('visibilityChanged', true);
  }

  hide(): void {
    this.container.style.display = 'none';
    this.isVisible = false;
    this.emit('visibilityChanged', false);
  }

  toggle(): void {
    if (this.isVisible) this.hide();
    else this.show();
  }

  isOpen(): boolean {
    return this.isVisible;
  }

  /**
   * Resolve the best playable media URL from a version.
   * Called lazily at load time (S3 URLs may expire).
   */
  resolveMediaUrl(version: ShotGridVersion): string | null {
    if (version.sg_uploaded_movie?.url) return version.sg_uploaded_movie.url;

    const moviePath = version.sg_path_to_movie;
    if (moviePath && (moviePath.startsWith('http://') || moviePath.startsWith('https://'))) {
      return moviePath;
    }

    // Fall back to frame-sequence path when no movie URL is available
    if (version.sg_path_to_frames) {
      return version.sg_path_to_frames;
    }

    return null;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.hide();
    if (document.body.contains(this.container)) {
      document.body.removeChild(this.container);
    }
    this.versionSourceMap.clear();
    this.sourceVersionMap.clear();
    this.removeAllListeners();
  }

  // ---- Private ----

  private updateToolbarVisibility(): void {
    this.toolbarSection.style.display = this.connected ? 'flex' : 'none';
  }

  private static readonly MODE_CYCLE: QueryMode[] = ['playlist', 'shot', 'version'];
  private static readonly MODE_LABELS: Record<QueryMode, string> = {
    playlist: 'Playlist',
    shot: 'Shot',
    version: 'Version',
  };
  private static readonly MODE_PLACEHOLDERS: Record<QueryMode, string> = {
    playlist: 'Playlist ID or ShotGrid URL',
    shot: 'Shot ID or ShotGrid URL',
    version: 'Version ID or ShotGrid URL',
  };

  private toggleMode(): void {
    const cycle = ShotGridPanel.MODE_CYCLE;
    const idx = cycle.indexOf(this.queryMode);
    this.queryMode = cycle[(idx + 1) % cycle.length]!;
    this.syncModeUI();
  }

  /** Update UI to reflect the current queryMode. */
  private syncModeUI(): void {
    this.modeToggle.textContent = ShotGridPanel.MODE_LABELS[this.queryMode];
    this.queryInput.placeholder = ShotGridPanel.MODE_PLACEHOLDERS[this.queryMode];
  }

  private handleLoad(): void {
    const raw = this.queryInput.value.trim();
    const result = parseShotGridInput(raw, this.queryMode);

    if (!result) {
      // Show inline validation error
      this.queryInput.setAttribute('aria-invalid', 'true');
      this.queryInput.style.borderColor = 'var(--text-danger, #ef4444)';

      const label = ShotGridPanel.MODE_LABELS[this.queryMode];
      this.showState('error', raw === '' ? `${label} ID is required` : `Invalid input: "${raw}"`);
      return;
    }

    // Auto-switch mode when URL detection yields a different entity type
    if (result.mode !== this.queryMode) {
      this.queryMode = result.mode;
      this.syncModeUI();
    }

    // Clear any previous validation error
    this.queryInput.removeAttribute('aria-invalid');
    this.queryInput.style.borderColor = 'var(--border-primary)';
    this.showState(null);

    if (result.mode === 'playlist') {
      this.emit('loadPlaylist', { playlistId: result.id });
    } else if (result.mode === 'shot') {
      this.emit('loadShot', { shotId: result.id });
    } else {
      this.emit('loadVersionById', { versionId: result.id });
    }
  }

  private showState(type: 'loading' | 'error' | null, message?: string): void {
    if (!type) {
      this.stateContainer.style.display = 'none';
      return;
    }

    this.stateContainer.style.display = 'block';
    this.stateContainer.textContent = '';
    this.stateContainer.style.color = 'var(--text-muted)';

    if (type === 'loading') {
      this.stateContainer.textContent = 'Loading versions...';
    } else if (type === 'error') {
      this.stateContainer.style.color = 'var(--text-danger, #ef4444)';
      this.stateContainer.textContent = message ?? 'An error occurred';
    }
  }

  private renderVersions(): void {
    this.listContainer.replaceChildren();

    if (this.versions.length === 0) {
      const empty = document.createElement('div');
      empty.dataset.testid = 'shotgrid-empty-state';
      empty.style.cssText = 'text-align: center; padding: 24px 16px; color: var(--text-muted); font-size: 12px;';
      empty.textContent = 'No versions found';
      this.listContainer.appendChild(empty);
      return;
    }

    for (const version of this.versions) {
      this.listContainer.appendChild(this.createVersionRow(version));
    }
  }

  private createVersionRow(version: ShotGridVersion): HTMLElement {
    const row = document.createElement('div');
    row.className = 'shotgrid-version-row';
    row.dataset.testid = 'shotgrid-version-row';
    row.dataset.versionId = String(version.id);
    row.style.cssText = `
      padding: 10px 12px;
      margin-bottom: 6px;
      border: 1px solid var(--border-primary);
      border-radius: 6px;
      background: var(--bg-primary);
      transition: all 0.12s ease;
    `;
    row.addEventListener('pointerenter', () => {
      row.style.borderColor = 'var(--border-hover)';
      row.style.background = 'var(--bg-hover)';
    });
    row.addEventListener('pointerleave', () => {
      row.style.borderColor = 'var(--border-primary)';
      row.style.background = 'var(--bg-primary)';
    });

    // Top row: thumbnail placeholder + version code + status
    const topRow = document.createElement('div');
    topRow.style.cssText = 'display: flex; align-items: center; gap: 8px; margin-bottom: 6px;';

    // Gray thumbnail placeholder (auth required for actual thumbnails)
    const thumb = document.createElement('div');
    thumb.dataset.testid = 'shotgrid-version-thumb';
    thumb.style.cssText = `
      width: 48px;
      height: 36px;
      border-radius: 4px;
      background: var(--bg-tertiary);
      flex-shrink: 0;
    `;
    topRow.appendChild(thumb);

    // Version code (XSS safe: textContent)
    const codeEl = document.createElement('div');
    codeEl.dataset.testid = 'shotgrid-version-code';
    codeEl.style.cssText = `
      flex: 1;
      font-weight: 500;
      color: var(--text-primary);
      font-size: 12px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    `;
    codeEl.textContent = version.code;
    codeEl.title = version.code;
    topRow.appendChild(codeEl);

    // Status badge
    const localStatus = mapStatusFromShotGrid(version.sg_status_list);
    const badge = document.createElement('span');
    badge.dataset.testid = 'shotgrid-status-badge';
    badge.style.cssText = `
      padding: 2px 8px;
      border-radius: 10px;
      font-size: 10px;
      font-weight: 600;
      color: #fff;
      background: ${STATUS_COLORS[localStatus]};
      text-transform: uppercase;
      flex-shrink: 0;
    `;
    badge.textContent = version.sg_status_list;
    topRow.appendChild(badge);
    row.appendChild(topRow);

    // Entity name (XSS safe)
    const entityEl = document.createElement('div');
    entityEl.style.cssText = 'font-size: 11px; color: var(--text-muted); margin-bottom: 6px;';
    entityEl.textContent = `${version.entity.type}: ${version.entity.name}`;
    row.appendChild(entityEl);

    // Media availability indicator
    const mediaUrl = this.resolveMediaUrl(version);
    const isFrameSequence =
      !version.sg_uploaded_movie?.url &&
      !(
        version.sg_path_to_movie &&
        (version.sg_path_to_movie.startsWith('http://') || version.sg_path_to_movie.startsWith('https://'))
      ) &&
      !!version.sg_path_to_frames;
    if (isFrameSequence) {
      const framesLabel = document.createElement('div');
      framesLabel.dataset.testid = 'shotgrid-frame-sequence-label';
      framesLabel.style.cssText = 'font-size: 10px; color: var(--text-muted); margin-bottom: 6px;';
      framesLabel.textContent = 'Frame sequence';
      row.appendChild(framesLabel);
    } else if (!mediaUrl) {
      const noMediaLabel = document.createElement('div');
      noMediaLabel.dataset.testid = 'shotgrid-no-media';
      noMediaLabel.style.cssText = 'font-size: 10px; color: var(--text-danger, #ef4444); margin-bottom: 6px;';
      noMediaLabel.textContent = 'No media';
      row.appendChild(noMediaLabel);
    }

    // Action buttons
    const actions = document.createElement('div');
    actions.style.cssText = 'display: flex; gap: 4px; margin-top: 4px;';

    const loadBtn = this.createActionButton('Load', !mediaUrl);
    loadBtn.dataset.testid = 'shotgrid-load-version';
    loadBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const url = this.resolveMediaUrl(version);
      this.emit('loadVersion', { version, mediaUrl: url });
    });
    actions.appendChild(loadBtn);

    const sourceIndex = this.versionSourceMap.get(version.id);
    const isMapped = sourceIndex !== undefined;

    const syncNotesBtn = this.createActionButton('Sync Notes', !isMapped);
    syncNotesBtn.dataset.testid = 'shotgrid-sync-notes';
    syncNotesBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (sourceIndex !== undefined) {
        this.emit('pullNotes', { versionId: version.id, sourceIndex });
      }
    });
    actions.appendChild(syncNotesBtn);

    const pushNotesBtn = this.createActionButton('Push Notes', !isMapped);
    pushNotesBtn.dataset.testid = 'shotgrid-push-notes';
    pushNotesBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (sourceIndex !== undefined) {
        this.emit('pushNotes', { versionId: version.id, sourceIndex });
      }
    });
    actions.appendChild(pushNotesBtn);

    const pushStatusBtn = this.createActionButton('Push Status', !isMapped);
    pushStatusBtn.dataset.testid = 'shotgrid-push-status';
    pushStatusBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (sourceIndex !== undefined) {
        this.emit('pushStatus', { versionId: version.id, sourceIndex });
      }
    });
    actions.appendChild(pushStatusBtn);

    row.appendChild(actions);
    return row;
  }

  private createActionButton(label: string, disabled: boolean): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = label;
    btn.disabled = disabled;
    btn.style.cssText = `
      padding: 4px 8px;
      border: 1px solid var(--border-primary);
      border-radius: 4px;
      background: transparent;
      color: ${disabled ? 'var(--text-muted)' : 'var(--text-secondary)'};
      cursor: ${disabled ? 'not-allowed' : 'pointer'};
      font-size: 10px;
      opacity: ${disabled ? '0.5' : '1'};
    `;
    if (!disabled) {
      btn.addEventListener('pointerenter', () => {
        btn.style.background = 'var(--bg-hover)';
      });
      btn.addEventListener('pointerleave', () => {
        btn.style.background = 'transparent';
      });
    }
    return btn;
  }
}
