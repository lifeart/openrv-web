/**
 * ShotGridPanel Unit Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ShotGridPanel, parseShotGridInput } from './ShotGridPanel';
import type { ShotGridVersion } from '../../integrations/ShotGridBridge';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeVersion(overrides?: Partial<ShotGridVersion>): ShotGridVersion {
  return {
    id: 101,
    code: 'shot010_comp_v003',
    entity: { type: 'Shot', id: 10, name: 'shot010' },
    sg_status_list: 'rev',
    sg_path_to_movie: '/path/to/movie.mov',
    sg_path_to_frames: '/path/to/frames/',
    sg_uploaded_movie: null,
    image: null,
    frame_range: null,
    description: null,
    sg_first_frame: null,
    sg_last_frame: null,
    created_at: '2024-01-15T10:30:00Z',
    user: { type: 'HumanUser', id: 5, name: 'Artist' },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ShotGridPanel', () => {
  let panel: ShotGridPanel;

  beforeEach(() => {
    panel = new ShotGridPanel();
  });

  afterEach(() => {
    panel.dispose();
  });

  it('SG-PNL-001: renders empty state by default', () => {
    panel.setConnected(true);
    panel.setVersions([]);
    panel.show();

    const container = document.body.querySelector('[data-testid="shotgrid-panel"]')!;
    expect(container).toBeTruthy();

    const empty = container.querySelector('[data-testid="shotgrid-empty-state"]');
    expect(empty).toBeTruthy();
    expect(empty!.textContent).toBe('No versions found');
  });

  it('SG-PNL-002: renders version list', () => {
    panel.setConnected(true);
    panel.setVersions([makeVersion({ id: 101, code: 'v001' }), makeVersion({ id: 102, code: 'v002' })]);
    panel.show();

    const rows = document.body.querySelectorAll('[data-testid="shotgrid-version-row"]');
    expect(rows).toHaveLength(2);

    const firstCode = rows[0]!.querySelector('[data-testid="shotgrid-version-code"]');
    expect(firstCode!.textContent).toBe('v001');
  });

  it('SG-PNL-003: XSS prevention - version code uses textContent', () => {
    panel.setConnected(true);
    panel.setVersions([makeVersion({ code: '<img src=x onerror=alert(1)>' })]);
    panel.show();

    const codeEl = document.body.querySelector('[data-testid="shotgrid-version-code"]')!;
    expect(codeEl.textContent).toBe('<img src=x onerror=alert(1)>');
    // innerHTML should be escaped (textContent doesn't interpret HTML)
    expect(codeEl.innerHTML).not.toContain('<img');
  });

  it('SG-PNL-004: emits loadVersion on Load click', () => {
    panel.setConnected(true);
    const version = makeVersion({ sg_uploaded_movie: { url: 'https://s3.example.com/movie.mp4' } });
    panel.setVersions([version]);
    panel.show();

    const onLoad = vi.fn();
    panel.on('loadVersion', onLoad);

    const loadBtn = document.body.querySelector<HTMLButtonElement>('[data-testid="shotgrid-load-version"]')!;
    loadBtn.click();

    expect(onLoad).toHaveBeenCalledWith({
      version,
      mediaUrl: 'https://s3.example.com/movie.mp4',
    });
  });

  it('SG-PNL-005: emits loadPlaylist on Load button click in playlist mode', () => {
    panel.setConnected(true);
    panel.show();

    const onLoadPlaylist = vi.fn();
    panel.on('loadPlaylist', onLoadPlaylist);

    const queryInput = document.body.querySelector<HTMLInputElement>('[data-testid="shotgrid-query-input"]')!;
    queryInput.value = '99';

    const loadBtn = document.body.querySelector<HTMLButtonElement>('[data-testid="shotgrid-load-btn"]')!;
    loadBtn.click();

    expect(onLoadPlaylist).toHaveBeenCalledWith({ playlistId: 99 });
  });

  it('SG-PNL-006: emits loadShot after mode toggle', () => {
    panel.setConnected(true);
    panel.show();

    const onLoadShot = vi.fn();
    panel.on('loadShot', onLoadShot);

    // Toggle to shot mode
    const modeToggle = document.body.querySelector<HTMLButtonElement>('[data-testid="shotgrid-mode-toggle"]')!;
    modeToggle.click();
    expect(modeToggle.textContent).toBe('Shot');

    const queryInput = document.body.querySelector<HTMLInputElement>('[data-testid="shotgrid-query-input"]')!;
    queryInput.value = '20';

    const loadBtn = document.body.querySelector<HTMLButtonElement>('[data-testid="shotgrid-load-btn"]')!;
    loadBtn.click();

    expect(onLoadShot).toHaveBeenCalledWith({ shotId: 20 });
  });

  it('SG-PNL-007: shows loading state', () => {
    panel.setConnected(true);
    panel.show();
    panel.setLoading(true);

    const state = document.body.querySelector('[data-testid="shotgrid-state"]') as HTMLElement;
    expect(state.textContent).toBe('Loading versions...');
    expect(state.style.display).toBe('block');
  });

  it('SG-PNL-008: shows error state', () => {
    panel.setConnected(true);
    panel.show();
    panel.setError('Connection failed');

    const state = document.body.querySelector('[data-testid="shotgrid-state"]')!;
    expect(state.textContent).toBe('Connection failed');
  });

  it('SG-PNL-009: status badges show correct colors', () => {
    panel.setConnected(true);
    panel.setVersions([makeVersion({ sg_status_list: 'apr' })]);
    panel.show();

    const badge = document.body.querySelector<HTMLElement>('[data-testid="shotgrid-status-badge"]')!;
    expect(badge.textContent).toBe('apr');
    // approved maps to green - browser may convert hex to rgb
    const bg = badge.style.background;
    expect(bg === '#22c55e' || bg.includes('rgb(34, 197, 94)')).toBe(true);
  });

  it('SG-PNL-010: resolveMediaUrl prioritizes sg_uploaded_movie', () => {
    const version = makeVersion({
      sg_uploaded_movie: { url: 'https://s3.example.com/movie.mp4' },
      sg_path_to_movie: 'https://other.example.com/movie.mov',
    });

    expect(panel.resolveMediaUrl(version)).toBe('https://s3.example.com/movie.mp4');
  });

  it('SG-PNL-011: resolveMediaUrl falls back to sg_path_to_movie if URL-like', () => {
    const version = makeVersion({
      sg_uploaded_movie: null,
      sg_path_to_movie: 'https://storage.example.com/movie.mov',
    });

    expect(panel.resolveMediaUrl(version)).toBe('https://storage.example.com/movie.mov');
  });

  it('SG-PNL-012: resolveMediaUrl returns null for local movie path without frame path', () => {
    const version = makeVersion({
      sg_uploaded_movie: null,
      sg_path_to_movie: '/mnt/storage/movie.mov',
      sg_path_to_frames: '',
    });

    expect(panel.resolveMediaUrl(version)).toBeNull();
  });

  it('SG-PNL-013: dispose is idempotent', () => {
    panel.show();
    panel.dispose();
    expect(() => panel.dispose()).not.toThrow();
  });

  it('SG-PNL-014: toggle show/hide', () => {
    const onVisChange = vi.fn();
    panel.on('visibilityChanged', onVisChange);

    panel.toggle(); // show
    expect(panel.isOpen()).toBe(true);
    expect(onVisChange).toHaveBeenLastCalledWith(true);

    panel.toggle(); // hide
    expect(panel.isOpen()).toBe(false);
    expect(onVisChange).toHaveBeenLastCalledWith(false);
  });

  it('SG-PNL-015: hides toolbar when disconnected', () => {
    panel.setConnected(false);
    panel.show();

    const toolbar = document.body.querySelector('[data-testid="shotgrid-toolbar"]') as HTMLElement;
    expect(toolbar.style.display).toBe('none');
  });

  it('SG-PNL-016: version-source mapping', () => {
    panel.mapVersionToSource(101, 0);
    expect(panel.getSourceForVersion(101)).toBe(0);
    expect(panel.getVersionForSource(0)).toBe(101);
    expect(panel.getSourceForVersion(999)).toBeUndefined();
  });

  it('SG-PNL-017: shows "No media" for versions without playable URL', () => {
    panel.setConnected(true);
    panel.setVersions([
      makeVersion({
        sg_uploaded_movie: null,
        sg_path_to_movie: '/local/path.mov',
        sg_path_to_frames: '',
      }),
    ]);
    panel.show();

    const noMedia = document.body.querySelector('[data-testid="shotgrid-no-media"]');
    expect(noMedia).toBeTruthy();
    expect(noMedia!.textContent).toBe('No media');
  });

  it('SG-PNL-018: loading state resets text color after error state', () => {
    panel.setConnected(true);
    panel.show();

    // First show error (sets color to danger)
    panel.setError('Something failed');
    const state = document.body.querySelector('[data-testid="shotgrid-state"]') as HTMLElement;
    expect(state.style.color).toContain('ef4444');

    // Then show loading - color must reset to muted
    panel.setLoading(true);
    expect(state.textContent).toBe('Loading versions...');
    expect(state.style.color).toBe('var(--text-muted)');
  });

  it('SG-PNL-019: pushStatus event does not include status field', () => {
    panel.setConnected(true);
    // Map version before rendering so the button is enabled
    panel.mapVersionToSource(101, 0);
    panel.setVersions([makeVersion({ id: 101, sg_status_list: 'apr' })]);
    panel.show();

    const onPushStatus = vi.fn();
    panel.on('pushStatus', onPushStatus);

    const pushStatusBtn = document.body.querySelector<HTMLButtonElement>('[data-testid="shotgrid-push-status"]')!;
    expect(pushStatusBtn.disabled).toBe(false);
    pushStatusBtn.click();

    expect(onPushStatus).toHaveBeenCalledWith({ versionId: 101, sourceIndex: 0 });
    // Verify no 'status' key in the emitted object
    const emittedArg = onPushStatus.mock.calls[0]![0];
    expect(Object.keys(emittedArg)).toEqual(['versionId', 'sourceIndex']);
  });

  it('SG-PNL-020: resolveMediaUrl returns frame path when no movie URL exists', () => {
    const version = makeVersion({
      sg_uploaded_movie: null,
      sg_path_to_movie: '/local/path.mov',
      sg_path_to_frames: '/path/to/frames/shot.####.exr',
    });

    expect(panel.resolveMediaUrl(version)).toBe('/path/to/frames/shot.####.exr');
  });

  it('SG-PNL-021: Load button is enabled for frame-sequence-only versions', () => {
    panel.setConnected(true);
    panel.setVersions([
      makeVersion({
        sg_uploaded_movie: null,
        sg_path_to_movie: '',
        sg_path_to_frames: '/path/to/frames/shot.####.exr',
      }),
    ]);
    panel.show();

    const loadBtn = document.body.querySelector<HTMLButtonElement>('[data-testid="shotgrid-load-version"]')!;
    expect(loadBtn.disabled).toBe(false);

    const framesLabel = document.body.querySelector('[data-testid="shotgrid-frame-sequence-label"]');
    expect(framesLabel).toBeTruthy();
    expect(framesLabel!.textContent).toBe('Frame sequence');
  });

  it('SG-PNL-022: Load button emits mediaUrl for frame-sequence-only versions', () => {
    panel.setConnected(true);
    const version = makeVersion({
      sg_uploaded_movie: null,
      sg_path_to_movie: '',
      sg_path_to_frames: '/path/to/frames/shot.####.exr',
    });
    panel.setVersions([version]);
    panel.show();

    const onLoad = vi.fn();
    panel.on('loadVersion', onLoad);

    const loadBtn = document.body.querySelector<HTMLButtonElement>('[data-testid="shotgrid-load-version"]')!;
    loadBtn.click();

    expect(onLoad).toHaveBeenCalledWith({
      version,
      mediaUrl: '/path/to/frames/shot.####.exr',
    });
  });

  it('SG-PNL-023: versions with neither movie URL nor frame path remain disabled', () => {
    panel.setConnected(true);
    panel.setVersions([
      makeVersion({
        sg_uploaded_movie: null,
        sg_path_to_movie: '',
        sg_path_to_frames: '',
      }),
    ]);
    panel.show();

    const loadBtn = document.body.querySelector<HTMLButtonElement>('[data-testid="shotgrid-load-version"]')!;
    expect(loadBtn.disabled).toBe(true);

    const noMedia = document.body.querySelector('[data-testid="shotgrid-no-media"]');
    expect(noMedia).toBeTruthy();
    expect(noMedia!.textContent).toBe('No media');
  });

  it('SG-PNL-024: resolveMediaUrl still prioritizes uploaded movie over frame path', () => {
    const version = makeVersion({
      sg_uploaded_movie: { url: 'https://s3.example.com/movie.mp4' },
      sg_path_to_frames: '/path/to/frames/shot.####.exr',
    });

    expect(panel.resolveMediaUrl(version)).toBe('https://s3.example.com/movie.mp4');
  });

  it('SG-PNL-025: resolveMediaUrl prioritizes HTTP movie path over frame path', () => {
    const version = makeVersion({
      sg_uploaded_movie: null,
      sg_path_to_movie: 'https://storage.example.com/movie.mov',
      sg_path_to_frames: '/path/to/frames/shot.####.exr',
    });

    expect(panel.resolveMediaUrl(version)).toBe('https://storage.example.com/movie.mov');
  });

  it('SG-PNL-026: shows inline validation error for empty query input', () => {
    panel.setConnected(true);
    panel.show();

    const input = document.body.querySelector<HTMLInputElement>('[data-testid="shotgrid-query-input"]')!;
    const loadBtn = document.body.querySelector<HTMLButtonElement>('[data-testid="shotgrid-load-btn"]')!;

    input.value = '';
    loadBtn.click();

    const state = document.body.querySelector<HTMLElement>('[data-testid="shotgrid-state"]')!;
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(state.style.display).toBe('block');
    expect(state.textContent).toContain('required');
  });

  it('SG-PNL-027: marks invalid non-positive IDs with aria-invalid and error text', () => {
    panel.setConnected(true);
    panel.show();

    const input = document.body.querySelector<HTMLInputElement>('[data-testid="shotgrid-query-input"]')!;
    const loadBtn = document.body.querySelector<HTMLButtonElement>('[data-testid="shotgrid-load-btn"]')!;

    input.value = '-5';
    loadBtn.click();

    const state = document.body.querySelector<HTMLElement>('[data-testid="shotgrid-state"]')!;
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(state.textContent).toContain('Invalid');
  });

  // --- URL parsing and version mode (Issue #324) ---

  it('SG-PNL-028: mode toggle cycles through playlist -> shot -> version', () => {
    panel.setConnected(true);
    panel.show();

    const modeToggle = document.body.querySelector<HTMLButtonElement>('[data-testid="shotgrid-mode-toggle"]')!;
    expect(modeToggle.textContent).toBe('Playlist');

    modeToggle.click();
    expect(modeToggle.textContent).toBe('Shot');

    modeToggle.click();
    expect(modeToggle.textContent).toBe('Version');

    modeToggle.click();
    expect(modeToggle.textContent).toBe('Playlist');
  });

  it('SG-PNL-029: emits loadVersionById in version mode with plain numeric ID', () => {
    panel.setConnected(true);
    panel.show();

    const onLoadVersion = vi.fn();
    panel.on('loadVersionById', onLoadVersion);

    // Toggle to version mode (playlist -> shot -> version)
    const modeToggle = document.body.querySelector<HTMLButtonElement>('[data-testid="shotgrid-mode-toggle"]')!;
    modeToggle.click(); // shot
    modeToggle.click(); // version

    const queryInput = document.body.querySelector<HTMLInputElement>('[data-testid="shotgrid-query-input"]')!;
    queryInput.value = '12345';

    const loadBtn = document.body.querySelector<HTMLButtonElement>('[data-testid="shotgrid-load-btn"]')!;
    loadBtn.click();

    expect(onLoadVersion).toHaveBeenCalledWith({ versionId: 12345 });
  });

  it('SG-PNL-030: pasting a Version URL auto-switches to version mode and emits loadVersionById', () => {
    panel.setConnected(true);
    panel.show();

    const onLoadVersion = vi.fn();
    panel.on('loadVersionById', onLoadVersion);

    const queryInput = document.body.querySelector<HTMLInputElement>('[data-testid="shotgrid-query-input"]')!;
    queryInput.value = 'https://studio.shotgrid.autodesk.com/detail/Version/12345';

    const loadBtn = document.body.querySelector<HTMLButtonElement>('[data-testid="shotgrid-load-btn"]')!;
    loadBtn.click();

    expect(onLoadVersion).toHaveBeenCalledWith({ versionId: 12345 });

    // Mode should have auto-switched
    const modeToggle = document.body.querySelector<HTMLButtonElement>('[data-testid="shotgrid-mode-toggle"]')!;
    expect(modeToggle.textContent).toBe('Version');
  });

  it('SG-PNL-031: pasting a Shot URL auto-switches to shot mode and emits loadShot', () => {
    panel.setConnected(true);
    panel.show();

    const onLoadShot = vi.fn();
    panel.on('loadShot', onLoadShot);

    const queryInput = document.body.querySelector<HTMLInputElement>('[data-testid="shotgrid-query-input"]')!;
    queryInput.value = 'https://studio.shotgunstudio.com/detail/Shot/67890';

    const loadBtn = document.body.querySelector<HTMLButtonElement>('[data-testid="shotgrid-load-btn"]')!;
    loadBtn.click();

    expect(onLoadShot).toHaveBeenCalledWith({ shotId: 67890 });

    const modeToggle = document.body.querySelector<HTMLButtonElement>('[data-testid="shotgrid-mode-toggle"]')!;
    expect(modeToggle.textContent).toBe('Shot');
  });

  it('SG-PNL-032: pasting a Playlist URL auto-switches to playlist mode and emits loadPlaylist', () => {
    panel.setConnected(true);
    panel.show();

    // Start in shot mode
    const modeToggle = document.body.querySelector<HTMLButtonElement>('[data-testid="shotgrid-mode-toggle"]')!;
    modeToggle.click(); // shot

    const onLoadPlaylist = vi.fn();
    panel.on('loadPlaylist', onLoadPlaylist);

    const queryInput = document.body.querySelector<HTMLInputElement>('[data-testid="shotgrid-query-input"]')!;
    queryInput.value = 'https://studio.shotgrid.autodesk.com/detail/Playlist/555';

    const loadBtn = document.body.querySelector<HTMLButtonElement>('[data-testid="shotgrid-load-btn"]')!;
    loadBtn.click();

    expect(onLoadPlaylist).toHaveBeenCalledWith({ playlistId: 555 });
    expect(modeToggle.textContent).toBe('Playlist');
  });

  it('SG-PNL-033: fragment-based URL (#Version_12345) is parsed correctly', () => {
    panel.setConnected(true);
    panel.show();

    const onLoadVersion = vi.fn();
    panel.on('loadVersionById', onLoadVersion);

    const queryInput = document.body.querySelector<HTMLInputElement>('[data-testid="shotgrid-query-input"]')!;
    queryInput.value = 'https://studio.shotgrid.autodesk.com/page/1234#Version_12345';

    const loadBtn = document.body.querySelector<HTMLButtonElement>('[data-testid="shotgrid-load-btn"]')!;
    loadBtn.click();

    expect(onLoadVersion).toHaveBeenCalledWith({ versionId: 12345 });
  });

  it('SG-PNL-034: invalid URL shows error state', () => {
    panel.setConnected(true);
    panel.show();

    const queryInput = document.body.querySelector<HTMLInputElement>('[data-testid="shotgrid-query-input"]')!;
    queryInput.value = 'https://example.com/not-a-shotgrid-url';

    const loadBtn = document.body.querySelector<HTMLButtonElement>('[data-testid="shotgrid-load-btn"]')!;
    loadBtn.click();

    expect(queryInput.getAttribute('aria-invalid')).toBe('true');
    const state = document.body.querySelector<HTMLElement>('[data-testid="shotgrid-state"]')!;
    expect(state.textContent).toContain('Invalid');
  });

  it('SG-PNL-035: plain numeric IDs still work in playlist mode (backward compat)', () => {
    panel.setConnected(true);
    panel.show();

    const onLoadPlaylist = vi.fn();
    panel.on('loadPlaylist', onLoadPlaylist);

    const queryInput = document.body.querySelector<HTMLInputElement>('[data-testid="shotgrid-query-input"]')!;
    queryInput.value = '42';

    const loadBtn = document.body.querySelector<HTMLButtonElement>('[data-testid="shotgrid-load-btn"]')!;
    loadBtn.click();

    expect(onLoadPlaylist).toHaveBeenCalledWith({ playlistId: 42 });
  });
});

// ---------------------------------------------------------------------------
// parseShotGridInput unit tests
// ---------------------------------------------------------------------------

describe('parseShotGridInput', () => {
  it('returns null for empty string', () => {
    expect(parseShotGridInput('', 'playlist')).toBeNull();
    expect(parseShotGridInput('   ', 'shot')).toBeNull();
  });

  it('parses plain positive integer using current mode', () => {
    expect(parseShotGridInput('123', 'playlist')).toEqual({ mode: 'playlist', id: 123 });
    expect(parseShotGridInput('456', 'shot')).toEqual({ mode: 'shot', id: 456 });
    expect(parseShotGridInput('789', 'version')).toEqual({ mode: 'version', id: 789 });
  });

  it('returns null for non-positive integers', () => {
    expect(parseShotGridInput('0', 'playlist')).toBeNull();
    expect(parseShotGridInput('-1', 'shot')).toBeNull();
    expect(parseShotGridInput('abc', 'playlist')).toBeNull();
  });

  it('parses /detail/Version/ID URL', () => {
    const result = parseShotGridInput(
      'https://studio.shotgrid.autodesk.com/detail/Version/12345',
      'playlist',
    );
    expect(result).toEqual({ mode: 'version', id: 12345 });
  });

  it('parses /detail/Shot/ID URL', () => {
    const result = parseShotGridInput(
      'https://studio.shotgunstudio.com/detail/Shot/67890',
      'playlist',
    );
    expect(result).toEqual({ mode: 'shot', id: 67890 });
  });

  it('parses /detail/Playlist/ID URL', () => {
    const result = parseShotGridInput(
      'https://studio.shotgrid.autodesk.com/detail/Playlist/100',
      'version',
    );
    expect(result).toEqual({ mode: 'playlist', id: 100 });
  });

  it('parses fragment-based URL (#Version_12345)', () => {
    const result = parseShotGridInput(
      'https://studio.shotgrid.autodesk.com/page/1234#Version_12345',
      'playlist',
    );
    expect(result).toEqual({ mode: 'version', id: 12345 });
  });

  it('parses fragment-based URL (#Shot_67890)', () => {
    const result = parseShotGridInput(
      'https://studio.shotgrid.autodesk.com/page/99#Shot_67890',
      'playlist',
    );
    expect(result).toEqual({ mode: 'shot', id: 67890 });
  });

  it('returns null for URL with unknown entity type', () => {
    expect(parseShotGridInput(
      'https://studio.shotgrid.autodesk.com/detail/Asset/123',
      'playlist',
    )).toBeNull();
  });

  it('returns null for non-ShotGrid URL', () => {
    expect(parseShotGridInput('https://example.com/page', 'playlist')).toBeNull();
  });

  it('is case-insensitive for entity types in URLs', () => {
    const result = parseShotGridInput(
      'https://studio.shotgrid.autodesk.com/detail/version/999',
      'playlist',
    );
    expect(result).toEqual({ mode: 'version', id: 999 });
  });
});
