/**
 * Conform / Re-link Panel
 *
 * When importing OTIO/EDL with unresolvable media references, this panel
 * shows unresolved clips and lets the user re-link them to available sources.
 * Supports per-clip browse, batch re-link by folder, and fuzzy filename matching.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** An unresolved clip from an OTIO/EDL import. */
export interface UnresolvedClip {
  /** Unique ID for tracking */
  id: string;
  /** Clip name from the timeline */
  name: string;
  /** Original media reference URL (may be a file path) */
  originalUrl: string;
  /** Source in-frame (0-based from OTIO) */
  inFrame: number;
  /** Source out-frame (0-based from OTIO) */
  outFrame: number;
  /** Timeline position (0-based) */
  timelineIn: number;
  /** Why the clip could not be resolved */
  reason: 'not_found' | 'load_failed';
}

/** An available source that can be linked to an unresolved clip. */
export interface ConformSource {
  index: number;
  name: string;
  url: string;
  frameCount: number;
}

/** Resolution status for the entire conform operation. */
export interface ConformStatus {
  resolved: number;
  total: number;
}

/** Minimal manager interface — avoids hard coupling to session internals. */
export interface ConformPanelManager {
  getUnresolvedClips(): UnresolvedClip[];
  getAvailableSources(): ConformSource[];
  relinkClip(clipId: string, sourceIndex: number): boolean;
  getResolutionStatus(): ConformStatus;
}

// ---------------------------------------------------------------------------
// Display entry built from manager state
// ---------------------------------------------------------------------------

export interface ConformEntry {
  clip: UnresolvedClip;
  /** Filename extracted from originalUrl for display */
  filename: string;
  /** Suggested matches from available sources, best first */
  suggestions: ConformSource[];
}

// ---------------------------------------------------------------------------
// Utility: extract filename from a URL or path
// ---------------------------------------------------------------------------

export function extractFilename(urlOrPath: string): string {
  // Handle both URL paths and OS file paths
  const cleaned = urlOrPath.replace(/\\/g, '/');
  const parts = cleaned.split('/').filter(Boolean);
  return parts[parts.length - 1] || urlOrPath;
}

// ---------------------------------------------------------------------------
// Utility: fuzzy filename matching
// ---------------------------------------------------------------------------

/**
 * Score how well a candidate source name matches a target filename.
 * Returns 0 for no match, higher values for better matches.
 *  - Exact match (case-insensitive) = 100
 *  - Basename match (ignoring extension) = 80
 *  - Contains target stem = 50
 *  - Contains any word from target = 20
 */
export function matchScore(targetFilename: string, candidateName: string): number {
  const tLower = targetFilename.toLowerCase();
  const cLower = candidateName.toLowerCase();

  // Exact match
  if (tLower === cLower) return 100;

  // Strip extensions for basename comparison
  const tStem = tLower.replace(/\.[^.]+$/, '');
  const cStem = cLower.replace(/\.[^.]+$/, '');

  if (tStem === cStem) return 80;

  // Candidate contains target stem
  if (cLower.includes(tStem) || tLower.includes(cStem)) return 50;

  // Any 3+ char word overlap
  const tWords = tStem.split(/[^a-z0-9]+/).filter(w => w.length >= 3);
  for (const word of tWords) {
    if (cLower.includes(word)) return 20;
  }

  return 0;
}

/**
 * Find suggested sources for an unresolved clip, sorted by match quality.
 */
export function findSuggestions(
  clip: UnresolvedClip,
  sources: ConformSource[],
  maxResults = 5,
): ConformSource[] {
  const filename = extractFilename(clip.originalUrl);

  const scored = sources
    .map(s => ({ source: s, score: matchScore(filename, s.name) }))
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score);

  return scored.slice(0, maxResults).map(s => s.source);
}

// ---------------------------------------------------------------------------
// Build conform entries from manager state
// ---------------------------------------------------------------------------

export function buildConformEntries(manager: ConformPanelManager): ConformEntry[] {
  const clips = manager.getUnresolvedClips();
  const sources = manager.getAvailableSources();

  return clips.map(clip => ({
    clip,
    filename: extractFilename(clip.originalUrl),
    suggestions: findSuggestions(clip, sources),
  }));
}

// ---------------------------------------------------------------------------
// Batch re-link: match unresolved clips to sources by filename
// ---------------------------------------------------------------------------

/**
 * Attempt to automatically re-link all unresolved clips by matching filenames
 * against available sources. Returns the number of clips successfully re-linked.
 */
export function batchRelinkByName(manager: ConformPanelManager): number {
  const clips = manager.getUnresolvedClips();
  const sources = manager.getAvailableSources();
  let count = 0;

  for (const clip of clips) {
    const filename = extractFilename(clip.originalUrl);
    const suggestions = findSuggestions(clip, sources);

    // Only auto-link if there's a strong match (score >= 80)
    if (suggestions.length > 0) {
      const bestMatch = suggestions[0]!;
      const score = matchScore(filename, bestMatch.name);
      if (score >= 80) {
        if (manager.relinkClip(clip.id, bestMatch.index)) {
          count++;
        }
      }
    }
  }

  return count;
}

/**
 * Batch re-link by mapping each unresolved clip to a source found within
 * a folder URL prefix. Sources whose URL starts with the folder prefix are
 * candidates, matched by filename.
 */
export function batchRelinkByFolder(
  manager: ConformPanelManager,
  folderUrl: string,
): number {
  const clips = manager.getUnresolvedClips();
  const sources = manager.getAvailableSources();
  const prefix = folderUrl.endsWith('/') ? folderUrl : folderUrl + '/';

  // Filter sources to those in the target folder
  const folderSources = sources.filter(s => s.url.startsWith(prefix));
  if (folderSources.length === 0) return 0;

  let count = 0;
  for (const clip of clips) {
    const filename = extractFilename(clip.originalUrl);
    for (const source of folderSources) {
      const sourceName = extractFilename(source.url);
      if (matchScore(filename, sourceName) >= 80) {
        if (manager.relinkClip(clip.id, source.index)) {
          count++;
          break;
        }
      }
    }
  }

  return count;
}

// ---------------------------------------------------------------------------
// ConformPanel DOM component
// ---------------------------------------------------------------------------

export class ConformPanel {
  private container: HTMLElement;
  private manager: ConformPanelManager;
  private listContainer: HTMLElement;
  private toolbar: HTMLElement;
  private resolvedIds = new Set<string>();

  constructor(container: HTMLElement, manager: ConformPanelManager) {
    this.container = container;
    this.manager = manager;
    this.listContainer = document.createElement('div');
    this.listContainer.className = 'conform-list';
    this.container.appendChild(this.listContainer);
    this.toolbar = this.createToolbar();
    this.container.appendChild(this.toolbar);
    this.render();
  }

  getResolvedIds(): ReadonlySet<string> {
    return this.resolvedIds;
  }

  render(): void {
    this.listContainer.innerHTML = '';
    const entries = buildConformEntries(this.manager);
    const status = this.manager.getResolutionStatus();

    // Status bar
    const statusBar = document.createElement('div');
    statusBar.className = 'conform-status';
    statusBar.setAttribute('role', 'status');
    statusBar.textContent = `${status.resolved} of ${status.total} clips resolved`;
    this.listContainer.appendChild(statusBar);

    if (entries.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'conform-empty';
      empty.textContent = 'All clips resolved.';
      this.listContainer.appendChild(empty);
      return;
    }

    // Clip rows
    for (const entry of entries) {
      const row = document.createElement('div');
      row.className = 'conform-row';
      row.dataset.clipId = entry.clip.id;

      if (this.resolvedIds.has(entry.clip.id)) {
        row.classList.add('conform-resolved');
      }

      // Clip name
      const nameEl = document.createElement('span');
      nameEl.className = 'conform-clip-name';
      nameEl.textContent = entry.clip.name;
      row.appendChild(nameEl);

      // Original URL (truncated filename)
      const urlEl = document.createElement('span');
      urlEl.className = 'conform-original-url';
      urlEl.textContent = entry.filename;
      urlEl.title = entry.clip.originalUrl;
      row.appendChild(urlEl);

      // Reason badge
      const reasonEl = document.createElement('span');
      reasonEl.className = 'conform-reason';
      reasonEl.textContent = entry.clip.reason === 'not_found' ? 'Not Found' : 'Load Failed';
      row.appendChild(reasonEl);

      // Suggestions dropdown (if any)
      if (entry.suggestions.length > 0) {
        const select = document.createElement('select');
        select.className = 'conform-suggestions';
        select.setAttribute('aria-label', `Re-link source for ${entry.clip.name}`);

        const placeholder = document.createElement('option');
        placeholder.value = '';
        placeholder.textContent = 'Select source...';
        select.appendChild(placeholder);

        for (const s of entry.suggestions) {
          const opt = document.createElement('option');
          opt.value = String(s.index);
          opt.textContent = s.name;
          select.appendChild(opt);
        }

        select.addEventListener('change', () => {
          const idx = parseInt(select.value, 10);
          if (!isNaN(idx)) {
            this.relinkClip(entry.clip.id, idx);
          }
        });

        row.appendChild(select);
      }

      // Browse button
      const browseBtn = document.createElement('button');
      browseBtn.className = 'conform-browse';
      browseBtn.textContent = 'Browse...';
      browseBtn.addEventListener('click', () => this.browseForClip(entry.clip.id));
      row.appendChild(browseBtn);

      this.listContainer.appendChild(row);
    }
  }

  private createToolbar(): HTMLElement {
    const toolbar = document.createElement('div');
    toolbar.className = 'conform-toolbar';

    const autoBtn = document.createElement('button');
    autoBtn.className = 'conform-auto-relink';
    autoBtn.textContent = 'Auto Re-link';
    autoBtn.addEventListener('click', () => {
      const count = batchRelinkByName(this.manager);
      if (count > 0) this.render();
    });

    const folderBtn = document.createElement('button');
    folderBtn.className = 'conform-folder-relink';
    folderBtn.textContent = 'Re-link by Folder...';
    folderBtn.addEventListener('click', () => this.browseFolder());

    toolbar.appendChild(autoBtn);
    toolbar.appendChild(folderBtn);
    return toolbar;
  }

  private relinkClip(clipId: string, sourceIndex: number): void {
    const success = this.manager.relinkClip(clipId, sourceIndex);
    if (success) {
      this.resolvedIds.add(clipId);
      this.render();
    }
  }

  private browseForClip(clipId: string): void {
    // Show available sources in a simple prompt-style selection
    const sources = this.manager.getAvailableSources();
    if (sources.length === 0) return;

    // In a real implementation this would open a file picker.
    // For testability, we dispatch a custom event that the host can handle.
    const event = new CustomEvent('conform-browse', {
      detail: { clipId, sources },
      bubbles: true,
    });
    this.container.dispatchEvent(event);
  }

  private browseFolder(): void {
    const event = new CustomEvent('conform-browse-folder', {
      bubbles: true,
    });
    this.container.dispatchEvent(event);
  }

  dispose(): void {
    this.container.innerHTML = '';
    this.resolvedIds.clear();
  }
}
