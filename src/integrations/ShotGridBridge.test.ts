/**
 * ShotGridBridge Unit Tests
 *
 * Tests for the ShotGrid REST API client. Uses mock fetch to simulate
 * all API interactions without network access.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  ShotGridBridge,
  ShotGridAPIError,
  mapStatusToShotGrid,
  mapStatusFromShotGrid,
  type ShotGridConfig,
} from './ShotGridBridge';
import type { ShotStatus } from '../core/session/StatusManager';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function defaultConfig(overrides?: Partial<ShotGridConfig>): ShotGridConfig {
  return {
    serverUrl: 'https://studio.shotgrid.autodesk.com',
    scriptName: 'openrv-web',
    apiKey: 'test-api-key-12345',
    projectId: 42,
    ...overrides,
  };
}

function createMockFetch() {
  return vi.fn<[input: RequestInfo | URL, init?: RequestInit], Promise<Response>>();
}

type MockFetchFn = ReturnType<typeof createMockFetch>;

function jsonResponse(data: unknown, status = 200, headers?: Record<string, string>): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Unauthorized',
    headers: new Headers(headers),
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data)),
  } as Response;
}

function authResponse(token = 'mock-bearer-token', expiresIn = 300): Response {
  return jsonResponse({
    access_token: token,
    token_type: 'Bearer',
    expires_in: expiresIn,
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Status mapping', () => {
  it('SG-MAP-001: mapStatusToShotGrid maps all local statuses', () => {
    expect(mapStatusToShotGrid('approved')).toBe('apr');
    expect(mapStatusToShotGrid('needs-work')).toBe('rev');
    expect(mapStatusToShotGrid('cbb')).toBe('cbb');
    expect(mapStatusToShotGrid('pending')).toBe('pnd');
    expect(mapStatusToShotGrid('omit')).toBe('omt');
  });

  it('SG-MAP-002: mapStatusFromShotGrid maps known ShotGrid codes', () => {
    expect(mapStatusFromShotGrid('apr')).toBe('approved');
    expect(mapStatusFromShotGrid('rev')).toBe('needs-work');
    expect(mapStatusFromShotGrid('cbb')).toBe('cbb');
    expect(mapStatusFromShotGrid('pnd')).toBe('pending');
    expect(mapStatusFromShotGrid('omt')).toBe('omit');
    expect(mapStatusFromShotGrid('fin')).toBe('approved');
  });

  it('SG-MAP-003: mapStatusFromShotGrid defaults unknown codes to pending', () => {
    expect(mapStatusFromShotGrid('xyz')).toBe('pending');
    expect(mapStatusFromShotGrid('')).toBe('pending');
  });

  it('SG-MAP-004: expanded status mappings from ShotGrid', () => {
    expect(mapStatusFromShotGrid('ip')).toBe('pending');
    expect(mapStatusFromShotGrid('hld')).toBe('pending');
    expect(mapStatusFromShotGrid('wtg')).toBe('pending');
    expect(mapStatusFromShotGrid('na')).toBe('omit');
    expect(mapStatusFromShotGrid('vwd')).toBe('approved');
  });
});

describe('ShotGridBridge', () => {
  let mockFetch: MockFetchFn;
  let bridge: ShotGridBridge;

  beforeEach(() => {
    mockFetch = createMockFetch();
    bridge = new ShotGridBridge(defaultConfig(), mockFetch as unknown as typeof fetch);
  });

  describe('authentication', () => {
    it('SG-001: authenticate() obtains bearer token', async () => {
      mockFetch.mockResolvedValueOnce(authResponse());

      await bridge.authenticate();

      expect(bridge.isAuthenticated).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(1);

      const [url, options] = mockFetch.mock.calls[0]!;
      expect(url).toBe('https://studio.shotgrid.autodesk.com/api/v1/auth/access_token');
      expect(options?.method).toBe('POST');
    });

    it('SG-001b: authenticate sends correct credentials', async () => {
      mockFetch.mockResolvedValueOnce(authResponse());

      await bridge.authenticate();

      const body = mockFetch.mock.calls[0]![1]?.body as string;
      expect(body).toContain('client_id=openrv-web');
      expect(body).toContain('client_secret=test-api-key-12345');
      expect(body).toContain('grant_type=client_credentials');
    });

    it('SG-001c: authenticate throws on failure', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ error: 'invalid' }, 401));

      await expect(bridge.authenticate()).rejects.toThrow(ShotGridAPIError);
      expect(bridge.isAuthenticated).toBe(false);
    });

    it('SG-001d: isAuthenticated is false before auth', () => {
      expect(bridge.isAuthenticated).toBe(false);
    });

    it('SG-001e: authenticate throws if response missing access_token', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ token_type: 'Bearer' }));

      await expect(bridge.authenticate()).rejects.toThrow('missing access_token');
    });

    it('SG-001f: normalizes trailing slash in server URL', async () => {
      bridge = new ShotGridBridge(
        defaultConfig({ serverUrl: 'https://studio.shotgrid.autodesk.com/' }),
        mockFetch as unknown as typeof fetch,
      );
      mockFetch.mockResolvedValueOnce(authResponse());
      await bridge.authenticate();

      const url = mockFetch.mock.calls[0]![0] as string;
      expect(url).not.toContain('//api');
    });
  });

  describe('getVersionsForPlaylist', () => {
    it('SG-002: two-step query fetches connections then versions', async () => {
      // Auth
      mockFetch.mockResolvedValueOnce(authResponse());
      // Step 1: connections
      mockFetch.mockResolvedValueOnce(jsonResponse({
        data: [
          { version: { id: 101 }, sg_sort_order: 1 },
          { version: { id: 102 }, sg_sort_order: 2 },
        ],
      }));
      // Step 2: versions
      mockFetch.mockResolvedValueOnce(jsonResponse({
        data: [
          {
            id: 102,
            code: 'shot010_comp_v004',
            entity: { type: 'Shot', id: 10, name: 'shot010' },
            sg_status_list: 'apr',
            sg_path_to_movie: '/movie2.mov',
            sg_path_to_frames: '',
            sg_uploaded_movie: null,
            image: null,
            frame_range: null,
            description: null,
            sg_first_frame: null,
            sg_last_frame: null,
            created_at: '2024-01-16T10:30:00Z',
            user: { type: 'HumanUser', id: 5, name: 'Artist' },
          },
          {
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
          },
        ],
      }));

      const versions = await bridge.getVersionsForPlaylist(99);

      expect(versions).toHaveLength(2);
      // Verify playlist ordering (101 first per connection sort order)
      expect(versions[0]!.id).toBe(101);
      expect(versions[1]!.id).toBe(102);
    });

    it('SG-002b: returns empty array if no connections', async () => {
      mockFetch
        .mockResolvedValueOnce(authResponse())
        .mockResolvedValueOnce(jsonResponse({ data: [] }));

      const versions = await bridge.getVersionsForPlaylist(99);
      expect(versions).toEqual([]);
      // Only auth + connections query (no versions query needed)
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('SG-002c: queries connections endpoint with playlist filter', async () => {
      mockFetch
        .mockResolvedValueOnce(authResponse())
        .mockResolvedValueOnce(jsonResponse({ data: [] }));

      await bridge.getVersionsForPlaylist(42);

      const url = mockFetch.mock.calls[1]![0] as string;
      expect(url).toContain('/api/v1/entity/playlist_version_connections');
      expect(url).toContain('filter[playlist]=42');
      expect(url).toContain('sort=sg_sort_order');
    });

    it('SG-002d: returns empty array for null connection data', async () => {
      mockFetch
        .mockResolvedValueOnce(authResponse())
        .mockResolvedValueOnce(jsonResponse({ data: null }));

      const versions = await bridge.getVersionsForPlaylist(99);
      expect(versions).toEqual([]);
    });
  });

  describe('getVersionsForShot', () => {
    it('SG-010: returns versions for a shot', async () => {
      mockFetch
        .mockResolvedValueOnce(authResponse())
        .mockResolvedValueOnce(jsonResponse({
          data: [
            {
              id: 201,
              code: 'shot020_fx_v001',
              entity: { type: 'Shot', id: 20, name: 'shot020' },
              sg_status_list: 'apr',
              sg_path_to_movie: '/movie.mov',
              sg_path_to_frames: '/frames/',
              sg_uploaded_movie: null,
              image: null,
              frame_range: null,
              description: null,
              sg_first_frame: null,
              sg_last_frame: null,
              created_at: '2024-02-01T08:00:00Z',
              user: { type: 'HumanUser', id: 3, name: 'FXArtist' },
            },
          ],
        }));

      const versions = await bridge.getVersionsForShot(20);
      expect(versions).toHaveLength(1);
      expect(versions[0]!.code).toBe('shot020_fx_v001');
    });

    it('SG-010b: uses filter[entity] on versions endpoint', async () => {
      mockFetch
        .mockResolvedValueOnce(authResponse())
        .mockResolvedValueOnce(jsonResponse({ data: [] }));

      await bridge.getVersionsForShot(20);

      const url = mockFetch.mock.calls[1]![0] as string;
      expect(url).toContain('/api/v1/entity/versions');
      expect(url).toContain('filter[entity]=20');
      expect(url).toContain('filter[project]=42');
    });

    it('SG-010c: returns empty array for null data', async () => {
      mockFetch
        .mockResolvedValueOnce(authResponse())
        .mockResolvedValueOnce(jsonResponse({ data: null }));

      const versions = await bridge.getVersionsForShot(10);
      expect(versions).toEqual([]);
    });
  });

  describe('getNotesForVersion', () => {
    it('SG-NOTE-001: fetches notes for a version', async () => {
      mockFetch
        .mockResolvedValueOnce(authResponse())
        .mockResolvedValueOnce(jsonResponse({
          data: [
            {
              id: 700,
              subject: 'Edge blending',
              content: 'Fix the left edge',
              note_links: [{ type: 'Version', id: 101 }],
              created_at: '2024-03-01T12:00:00Z',
              user: { type: 'HumanUser', id: 5, name: 'Reviewer' },
            },
          ],
        }));

      const notes = await bridge.getNotesForVersion(101);
      expect(notes).toHaveLength(1);
      expect(notes[0]!.subject).toBe('Edge blending');
      expect(notes[0]!.id).toBe(700);
    });

    it('SG-NOTE-002: queries notes endpoint with note_links filter', async () => {
      mockFetch
        .mockResolvedValueOnce(authResponse())
        .mockResolvedValueOnce(jsonResponse({ data: [] }));

      await bridge.getNotesForVersion(101);

      const url = mockFetch.mock.calls[1]![0] as string;
      expect(url).toContain('/api/v1/entity/notes');
      expect(url).toContain('filter[note_links]');
      expect(url).toContain('"type":"Version"');
      expect(url).toContain('"id":101');
      expect(url).toContain('filter[project]=42');
    });

    it('SG-NOTE-003: returns empty array when no notes', async () => {
      mockFetch
        .mockResolvedValueOnce(authResponse())
        .mockResolvedValueOnce(jsonResponse({ data: [] }));

      const notes = await bridge.getNotesForVersion(999);
      expect(notes).toEqual([]);
    });
  });

  describe('pagination', () => {
    it('SG-PAGE-001: follows links.next for paginated results', async () => {
      mockFetch
        .mockResolvedValueOnce(authResponse())
        // Page 1
        .mockResolvedValueOnce(jsonResponse({
          data: [{ id: 1, code: 'v1' }],
          links: { next: 'https://studio.shotgrid.autodesk.com/api/v1/entity/versions?page=2' },
        }))
        // Page 2 (no next = last page)
        .mockResolvedValueOnce(jsonResponse({
          data: [{ id: 2, code: 'v2' }],
        }));

      const versions = await bridge.getVersionsForShot(10);
      expect(versions).toHaveLength(2);
      expect(versions[0]!.id).toBe(1);
      expect(versions[1]!.id).toBe(2);
    });

    it('SG-PAGE-002: stops at maxPages to prevent infinite loops', async () => {
      mockFetch.mockResolvedValueOnce(authResponse());

      // Return infinite pagination (always has next)
      for (let i = 0; i < 12; i++) {
        mockFetch.mockResolvedValueOnce(jsonResponse({
          data: [{ id: i }],
          links: { next: `https://studio.shotgrid.autodesk.com/api/v1/entity/versions?page=${i + 2}` },
        }));
      }

      const versions = await bridge.getVersionsForShot(10);
      // Default maxPages = 10, so we should get at most 10 items
      expect(versions).toHaveLength(10);
    });
  });

  describe('pushNote', () => {
    it('SG-003: sends correct POST body', async () => {
      mockFetch
        .mockResolvedValueOnce(authResponse())
        .mockResolvedValueOnce(jsonResponse({
          data: {
            id: 500,
            subject: 'Fix edge blend',
            content: 'Fix edge blending on left side',
            note_links: [{ type: 'Version', id: 101 }],
            created_at: '2024-03-01T12:00:00Z',
            user: { type: 'HumanUser', id: 5, name: 'Reviewer' },
          },
        }));

      const result = await bridge.pushNote(101, {
        text: 'Fix edge blending on left side',
      });

      expect(result.id).toBe(500);

      const call = mockFetch.mock.calls[1]!;
      expect(call[0]).toBe('https://studio.shotgrid.autodesk.com/api/v1/entity/notes');
      expect(call[1]?.method).toBe('POST');

      const body = JSON.parse(call[1]?.body as string);
      expect(body.data.type).toBe('Note');
      expect(body.data.attributes.content).toBe('Fix edge blending on left side');
      expect(body.data.relationships.note_links.data[0]).toEqual({ type: 'Version', id: 101 });
      expect(body.data.relationships.project.data.id).toBe(42);
    });

    it('SG-003b: subject is truncated at word boundary', async () => {
      mockFetch
        .mockResolvedValueOnce(authResponse())
        .mockResolvedValueOnce(jsonResponse({ data: { id: 501 } }));

      const longText = 'The edge blending on the left side of the frame needs adjustment because the compositing mask is not aligned properly with the plate';
      await bridge.pushNote(101, { text: longText });

      const body = JSON.parse(mockFetch.mock.calls[1]![1]?.body as string);
      expect(body.data.attributes.subject.length).toBeLessThanOrEqual(83); // 80 + '...'
      expect(body.data.attributes.subject).toMatch(/\.\.\.$/);
      expect(body.data.attributes.content).toBe(longText);
    });

    it('SG-003c: includes frame_range when provided', async () => {
      mockFetch
        .mockResolvedValueOnce(authResponse())
        .mockResolvedValueOnce(jsonResponse({ data: { id: 502 } }));

      await bridge.pushNote(101, { text: 'Edge issue', frameRange: '1045-1052' });

      const body = JSON.parse(mockFetch.mock.calls[1]![1]?.body as string);
      expect(body.data.attributes.frame_range).toBe('1045-1052');
    });

    it('SG-003d: omits frame_range when not provided', async () => {
      mockFetch
        .mockResolvedValueOnce(authResponse())
        .mockResolvedValueOnce(jsonResponse({ data: { id: 503 } }));

      await bridge.pushNote(101, { text: 'General note' });

      const body = JSON.parse(mockFetch.mock.calls[1]![1]?.body as string);
      expect(body.data.attributes.frame_range).toBeUndefined();
    });
  });

  describe('pushStatus', () => {
    it('SG-004: maps local status to ShotGrid codes', async () => {
      const statuses: ShotStatus[] = ['approved', 'needs-work', 'cbb', 'pending', 'omit'];
      const expected = ['apr', 'rev', 'cbb', 'pnd', 'omt'];

      for (let i = 0; i < statuses.length; i++) {
        mockFetch.mockReset();
        mockFetch
          .mockResolvedValueOnce(authResponse())
          .mockResolvedValueOnce(jsonResponse({ data: {} }));

        bridge = new ShotGridBridge(defaultConfig(), mockFetch as unknown as typeof fetch);
        await bridge.pushStatus(100 + i, statuses[i]!);

        const body = JSON.parse(mockFetch.mock.calls[1]![1]?.body as string);
        expect(body.data.attributes.sg_status_list).toBe(expected[i]);
      }
    });

    it('SG-004b: sends correct PUT to version endpoint', async () => {
      mockFetch
        .mockResolvedValueOnce(authResponse())
        .mockResolvedValueOnce(jsonResponse({ data: {} }));

      await bridge.pushStatus(777, 'approved');

      const call = mockFetch.mock.calls[1]!;
      expect(call[0]).toBe('https://studio.shotgrid.autodesk.com/api/v1/entity/versions/777');
      expect(call[1]?.method).toBe('PUT');
    });
  });

  describe('error handling', () => {
    it('SG-005: handles 401 by re-authenticating once', async () => {
      mockFetch.mockResolvedValueOnce(authResponse());
      mockFetch.mockResolvedValueOnce(jsonResponse({ error: 'unauthorized' }, 401));
      mockFetch.mockResolvedValueOnce(authResponse('new-token'));
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: [] }));

      const versions = await bridge.getVersionsForShot(10);
      expect(versions).toEqual([]);
      expect(mockFetch).toHaveBeenCalledTimes(4);
    });

    it('SG-005b: throws after double 401 (re-auth also fails)', async () => {
      mockFetch.mockResolvedValueOnce(authResponse());
      // First request: 401
      mockFetch.mockResolvedValueOnce(jsonResponse({}, 401));
      // Re-auth succeeds
      mockFetch.mockResolvedValueOnce(authResponse('new-token'));
      // Retry still 401
      mockFetch.mockResolvedValueOnce(jsonResponse({}, 401));

      await expect(bridge.getVersionsForShot(10)).rejects.toThrow(ShotGridAPIError);
    });

    it('SG-006: handles network errors gracefully', async () => {
      mockFetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));

      await expect(bridge.authenticate()).rejects.toThrow('Failed to fetch');
    });

    it('SG-006b: throws ShotGridAPIError with status on non-OK response', async () => {
      mockFetch
        .mockResolvedValueOnce(authResponse())
        .mockResolvedValueOnce(jsonResponse({ error: 'forbidden' }, 403));

      try {
        await bridge.getVersionsForShot(10);
        expect.fail('Should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(ShotGridAPIError);
        expect((e as ShotGridAPIError).status).toBe(403);
      }
    });

    it('SG-007: handles rate limiting (429) with retry', async () => {
      mockFetch
        .mockResolvedValueOnce(authResponse())
        .mockResolvedValueOnce({
          ok: false,
          status: 429,
          statusText: 'Too Many Requests',
          headers: new Headers({ 'Retry-After': '0' }),
          json: () => Promise.resolve({}),
          text: () => Promise.resolve(''),
        } as Response)
        .mockResolvedValueOnce(jsonResponse({ data: [] }));

      const versions = await bridge.getVersionsForShot(10);
      expect(versions).toEqual([]);
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it('SG-007b: retries multiple 429s up to max', async () => {
      const rateResponse = {
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
        headers: new Headers({ 'Retry-After': '0' }),
        json: () => Promise.resolve({}),
        text: () => Promise.resolve(''),
      } as Response;

      mockFetch
        .mockResolvedValueOnce(authResponse())
        .mockResolvedValueOnce(rateResponse)
        .mockResolvedValueOnce(rateResponse)
        .mockResolvedValueOnce(jsonResponse({ data: [] }));

      const versions = await bridge.getVersionsForShot(10);
      expect(versions).toEqual([]);
      // auth + first(429) + retry(429) + retry(ok)
      expect(mockFetch).toHaveBeenCalledTimes(4);
    });

    it('SG-007c: throws after max rate limit retries exceeded', async () => {
      const rateResponse = {
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
        headers: new Headers({ 'Retry-After': '0' }),
        json: () => Promise.resolve({}),
        text: () => Promise.resolve('rate limited'),
      } as Response;

      mockFetch
        .mockResolvedValueOnce(authResponse())
        .mockResolvedValue(rateResponse);

      await expect(bridge.getVersionsForShot(10)).rejects.toThrow(ShotGridAPIError);
    });
  });

  describe('auto-authentication', () => {
    it('SG-008: auto-authenticates on first request', async () => {
      mockFetch
        .mockResolvedValueOnce(authResponse())
        .mockResolvedValueOnce(jsonResponse({ data: [] }));

      const versions = await bridge.getVersionsForShot(10);
      expect(versions).toEqual([]);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('SG-008b: reuses token for subsequent requests', async () => {
      mockFetch
        .mockResolvedValueOnce(authResponse())
        .mockResolvedValueOnce(jsonResponse({ data: [] }))
        .mockResolvedValueOnce(jsonResponse({ data: [] }));

      await bridge.getVersionsForShot(10);
      await bridge.getVersionsForShot(20);

      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it('SG-008c: re-authenticates when token expires', async () => {
      vi.useFakeTimers();
      try {
        // Token expires in 60s, buffer is 30s, so effective lifetime is 30s
        mockFetch
          .mockResolvedValueOnce(authResponse('token-1', 60))
          .mockResolvedValueOnce(jsonResponse({ data: [] }));

        await bridge.getVersionsForShot(10);
        expect(mockFetch).toHaveBeenCalledTimes(2);

        // Advance time past token expiry
        vi.advanceTimersByTime(31_000);

        // Should need to re-auth
        mockFetch
          .mockResolvedValueOnce(authResponse('token-2', 300))
          .mockResolvedValueOnce(jsonResponse({ data: [] }));

        await bridge.getVersionsForShot(20);
        // 2 (initial) + 2 (re-auth + request)
        expect(mockFetch).toHaveBeenCalledTimes(4);
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe('request headers', () => {
    it('SG-009: sends Authorization Bearer header', async () => {
      mockFetch
        .mockResolvedValueOnce(authResponse('my-token-123'))
        .mockResolvedValueOnce(jsonResponse({ data: [] }));

      await bridge.getVersionsForShot(10);

      const headers = mockFetch.mock.calls[1]![1]?.headers as Record<string, string>;
      expect(headers.Authorization).toBe('Bearer my-token-123');
      expect(headers.Accept).toBe('application/json');
    });

    it('SG-009b: POST requests include Content-Type JSON', async () => {
      mockFetch
        .mockResolvedValueOnce(authResponse())
        .mockResolvedValueOnce(jsonResponse({ data: { id: 500 } }));

      await bridge.pushNote(101, { text: 'Test' });

      const headers = mockFetch.mock.calls[1]![1]?.headers as Record<string, string>;
      expect(headers['Content-Type']).toBe('application/json');
    });

    it('SG-009c: GET requests omit Content-Type', async () => {
      mockFetch
        .mockResolvedValueOnce(authResponse())
        .mockResolvedValueOnce(jsonResponse({ data: [] }));

      await bridge.getVersionsForShot(10);

      const headers = mockFetch.mock.calls[1]![1]?.headers as Record<string, string>;
      expect(headers['Content-Type']).toBeUndefined();
    });
  });

  describe('dispose', () => {
    it('SG-DISP-001: dispose clears credentials', async () => {
      mockFetch.mockResolvedValueOnce(authResponse());
      await bridge.authenticate();
      expect(bridge.isAuthenticated).toBe(true);

      bridge.dispose();
      expect(bridge.isAuthenticated).toBe(false);
    });

    it('SG-DISP-002: authenticate throws after dispose', async () => {
      bridge.dispose();
      await expect(bridge.authenticate()).rejects.toThrow('disposed');
    });

    it('SG-DISP-003: API methods throw after dispose', async () => {
      mockFetch.mockResolvedValueOnce(authResponse());
      await bridge.authenticate();
      bridge.dispose();

      await expect(bridge.getVersionsForShot(10)).rejects.toThrow('disposed');
    });
  });

  describe('concurrent auth deduplication', () => {
    it('SG-CONC-001: concurrent requests share a single auth call', async () => {
      let authResolve: (() => void) | null = null;
      // Auth returns a promise we control manually
      mockFetch.mockImplementationOnce(() => new Promise<Response>(resolve => {
        authResolve = () => resolve(authResponse());
      }));
      // Two data responses for the concurrent requests
      mockFetch
        .mockResolvedValueOnce(jsonResponse({ data: [] }))
        .mockResolvedValueOnce(jsonResponse({ data: [] }));

      // Fire two requests concurrently before auth completes
      const p1 = bridge.getVersionsForShot(10);
      const p2 = bridge.getVersionsForShot(20);

      // Now let auth complete
      authResolve!();

      const [v1, v2] = await Promise.all([p1, p2]);
      expect(v1).toEqual([]);
      expect(v2).toEqual([]);
      // Only 1 auth call + 2 data calls = 3 total
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });
  });

  describe('combined error scenarios', () => {
    it('SG-COMBO-001: 401 then 429 then success', async () => {
      mockFetch
        .mockResolvedValueOnce(authResponse())
        // First request: 401
        .mockResolvedValueOnce(jsonResponse({}, 401))
        // Re-auth
        .mockResolvedValueOnce(authResponse('new-token'))
        // Retry: 429
        .mockResolvedValueOnce({
          ok: false,
          status: 429,
          statusText: 'Too Many Requests',
          headers: new Headers({ 'Retry-After': '0' }),
          json: () => Promise.resolve({}),
          text: () => Promise.resolve(''),
        } as Response)
        // After rate-limit delay: success
        .mockResolvedValueOnce(jsonResponse({ data: [] }));

      const versions = await bridge.getVersionsForShot(10);
      expect(versions).toEqual([]);
      // auth + req(401) + re-auth + retry(429) + retry(ok) = 5
      expect(mockFetch).toHaveBeenCalledTimes(5);
    });

    it('SG-COMBO-002: max rate-limit retries asserts exact call count', async () => {
      mockFetch.mockResolvedValueOnce(authResponse());

      // Initial + 3 retries all return 429 (4 total 429s)
      for (let i = 0; i < 4; i++) {
        mockFetch.mockResolvedValueOnce({
          ok: false,
          status: 429,
          statusText: 'Too Many Requests',
          headers: new Headers({ 'Retry-After': '0' }),
          json: () => Promise.resolve({}),
          text: () => Promise.resolve('rate limited'),
        } as Response);
      }

      await expect(bridge.getVersionsForShot(10)).rejects.toThrow(ShotGridAPIError);
      // auth(1) + initial(1) + 3 retries = 5
      expect(mockFetch).toHaveBeenCalledTimes(5);
    });
  });
});
