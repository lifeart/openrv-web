/**
 * ShotGridPanel Unit Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ShotGridPanel } from './ShotGridPanel';
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
    panel.setVersions([
      makeVersion({ id: 101, code: 'v001' }),
      makeVersion({ id: 102, code: 'v002' }),
    ]);
    panel.show();

    const rows = document.body.querySelectorAll('[data-testid="shotgrid-version-row"]');
    expect(rows).toHaveLength(2);

    const firstCode = rows[0]!.querySelector('[data-testid="shotgrid-version-code"]');
    expect(firstCode!.textContent).toBe('v001');
  });

  it('SG-PNL-003: XSS prevention - version code uses textContent', () => {
    panel.setConnected(true);
    panel.setVersions([
      makeVersion({ code: '<img src=x onerror=alert(1)>' }),
    ]);
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

  it('SG-PNL-012: resolveMediaUrl returns null for local paths', () => {
    const version = makeVersion({
      sg_uploaded_movie: null,
      sg_path_to_movie: '/mnt/storage/movie.mov',
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
    panel.setVersions([makeVersion({
      sg_uploaded_movie: null,
      sg_path_to_movie: '/local/path.mov',
      sg_path_to_frames: '',
    })]);
    panel.show();

    const noMedia = document.body.querySelector('[data-testid="shotgrid-no-media"]');
    expect(noMedia).toBeTruthy();
    expect(noMedia!.textContent).toBe('No media');
  });
});
