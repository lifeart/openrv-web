/**
 * ShotGrid (formerly Shotgun) REST API Bridge
 *
 * Provides authentication, version loading, note push, and status sync
 * against the ShotGrid REST API v1.
 *
 * Reference: https://developers.shotgridsoftware.com/rest-api/
 */

import type { ShotStatus } from '../core/session/StatusManager';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ShotGridConfig {
  /** ShotGrid server URL, e.g. 'https://studio.shotgrid.autodesk.com' */
  serverUrl: string;
  /** API script name for authentication */
  scriptName: string;
  /** API key (secret) */
  apiKey: string;
  /** ShotGrid project ID to scope queries */
  projectId: number;
}

export interface ShotGridVersion {
  id: number;
  /** Version name/code */
  code: string;
  /** Linked entity (Shot, Asset, etc.) */
  entity: { type: string; id: number; name: string };
  /** ShotGrid status code */
  sg_status_list: string;
  /** Path to movie file */
  sg_path_to_movie: string;
  /** Path to frame sequence */
  sg_path_to_frames: string;
  /** Uploaded movie link (S3 URL) */
  sg_uploaded_movie: { url: string } | null;
  /** Thumbnail image URL */
  image: string | null;
  /** Frame range string, e.g. '1001-1100' */
  frame_range: string | null;
  /** Version description */
  description: string | null;
  /** First frame number */
  sg_first_frame: number | null;
  /** Last frame number */
  sg_last_frame: number | null;
  /** ISO 8601 creation time */
  created_at: string;
  /** Creator */
  user: { type: 'HumanUser'; id: number; name: string };
}

export interface ShotGridNote {
  id: number;
  subject: string;
  content: string;
  note_links: Array<{ type: string; id: number }>;
  created_at: string;
  user: { type: 'HumanUser'; id: number; name: string };
  /** First frame number (may be null if not set in ShotGrid) */
  sg_first_frame: number | null;
  /** Last frame number (may be null if not set in ShotGrid) */
  sg_last_frame: number | null;
  /** Frame range string, e.g. '1045-1052' (may be null) */
  frame_range: string | null;
  /** ShotGrid note status (e.g. 'opn', 'clsd', 'res') */
  sg_status_list: string | null;
  /** Reply-to entity reference for threaded notes */
  reply_to_entity: { type: 'Note'; id: number } | null;
}

/** Serialized annotation summary for a single frame */
export interface AnnotationSummary {
  /** Frame number this annotation is on */
  frame: number;
  /** Annotation type: 'pen', 'text', or 'shape' */
  type: string;
  /** User who created the annotation */
  user: string;
  /** Brief description (e.g. stroke point count, text content preview) */
  description: string;
}

/** Options for pushNote */
export interface PushNoteOptions {
  /** Note text content */
  text: string;
  /** Frame range string, e.g. '1045-1052' */
  frameRange?: string;
  /** Annotation summaries for this note's frame range */
  annotations?: AnnotationSummary[];
  /** Thumbnail image blob (PNG/JPEG) to upload as an attachment after note creation */
  thumbnailBlob?: Blob;
  /** ShotGrid note ID to reply to (for threading) */
  replyToNoteId?: number;
  /** ShotGrid note status code (e.g. 'opn', 'clsd') */
  noteStatus?: string;
}

// ---------------------------------------------------------------------------
// Status mapping
// ---------------------------------------------------------------------------

const LOCAL_TO_SG: Record<ShotStatus, string> = {
  pending: 'pnd',
  // ShotGrid's "In Progress" (ip) is the closest match for "in-review".
  // Studios with custom statuses may need to override this mapping.
  'in-review': 'ip',
  approved: 'apr',
  'needs-work': 'rev',
  cbb: 'cbb',
  final: 'fin',
  'on-hold': 'hld',
  omit: 'omt',
};

const SG_TO_LOCAL: Record<string, ShotStatus> = {
  pnd: 'pending',
  // ShotGrid's "In Progress" is the closest match for local "in-review";
  // studios may need to customize this if they use a dedicated review status.
  ip: 'in-review',
  apr: 'approved',
  rev: 'needs-work',
  cbb: 'cbb',
  fin: 'final', // 'final' maps to final
  hld: 'on-hold', // 'on hold' maps to on-hold
  wtg: 'pending', // 'waiting to start' maps to pending
  omt: 'omit',
  na: 'omit', // 'not applicable' maps to omit
  vwd: 'approved', // 'viewed' maps to approved
};

/**
 * Map a local ShotStatus to a ShotGrid status code.
 */
export function mapStatusToShotGrid(status: ShotStatus): string {
  return LOCAL_TO_SG[status] ?? 'pnd';
}

/**
 * Map a ShotGrid status code to a local ShotStatus.
 */
export function mapStatusFromShotGrid(sgStatus: string): ShotStatus {
  return SG_TO_LOCAL[sgStatus] ?? 'pending';
}

// ---------------------------------------------------------------------------
// Note status mapping (NoteStatus <-> ShotGrid sg_status_list for Note entities)
// ---------------------------------------------------------------------------

import type { NoteStatus } from '../core/session/NoteManager';

const NOTE_LOCAL_TO_SG: Record<NoteStatus, string> = {
  open: 'opn',
  resolved: 'clsd',
  wontfix: 'clsd',  // ShotGrid has no distinct "wontfix" status; map to Closed (terminal state)
};

const NOTE_SG_TO_LOCAL: Record<string, NoteStatus> = {
  opn: 'open',
  // Both 'resolved' and 'wontfix' map to 'clsd' on push, so on pull we default
  // to the more common case ('resolved'). This means 'wontfix' loses fidelity
  // on round-trip through ShotGrid since SG has no distinct wontfix status.
  clsd: 'resolved',
  ip: 'open',     // "In Progress" -> open
};

/**
 * Map a local NoteStatus to a ShotGrid note status code.
 */
export function mapNoteStatusToShotGrid(status: NoteStatus): string {
  return NOTE_LOCAL_TO_SG[status] ?? 'opn';
}

/**
 * Map a ShotGrid note status code to a local NoteStatus.
 */
export function mapNoteStatusFromShotGrid(sgStatus: string | null): NoteStatus {
  if (!sgStatus) return 'open';
  return NOTE_SG_TO_LOCAL[sgStatus] ?? 'open';
}

// ---------------------------------------------------------------------------
// ShotGridBridge
// ---------------------------------------------------------------------------

/** Maximum number of retries after the initial request for 429 rate limiting */
const MAX_RATE_LIMIT_RETRIES = 3;

const VERSION_FIELDS =
  'code,entity,sg_status_list,sg_path_to_movie,sg_path_to_frames,sg_uploaded_movie,image,frame_range,description,sg_first_frame,sg_last_frame,created_at,user';

/** Default maximum number of pages to follow for paginated results */
const DEFAULT_MAX_PAGES = 10;

/** Maximum number of version IDs per batch request to avoid URL length limits */
const VERSION_ID_BATCH_SIZE = 50;

export class ShotGridBridge {
  private serverUrl: string;
  private scriptName: string;
  private apiKey: string;
  private projectId: number;
  private accessToken: string | null = null;
  private tokenExpiry = 0;
  private fetchFn: typeof fetch;
  private authPromise: Promise<void> | null = null;
  private disposed = false;

  constructor(config: ShotGridConfig, fetchImpl?: typeof fetch) {
    this.serverUrl = config.serverUrl.replace(/\/+$/, '');
    this.scriptName = config.scriptName;
    this.apiKey = config.apiKey;
    this.projectId = config.projectId;
    this.fetchFn = fetchImpl ?? globalThis.fetch.bind(globalThis);
  }

  /**
   * Authenticate with ShotGrid using script credentials.
   * Obtains a bearer token for subsequent API calls.
   */
  async authenticate(): Promise<void> {
    if (this.disposed) throw new Error('ShotGridBridge is disposed');

    const url = `${this.serverUrl}/api/v1/auth/access_token`;
    const body = new URLSearchParams({
      client_id: this.scriptName,
      client_secret: this.apiKey,
      grant_type: 'client_credentials',
    });

    const response = await this.fetchFn(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new ShotGridAPIError(response.status, `Authentication failed: ${text || response.statusText}`);
    }

    const data = await response.json();
    if (!data.access_token) {
      throw new ShotGridAPIError(0, 'Authentication response missing access_token');
    }
    this.accessToken = data.access_token;
    // Token typically expires in 5 minutes; refresh 30s early
    this.tokenExpiry = Date.now() + ((data.expires_in ?? 300) - 30) * 1000;
  }

  /**
   * Whether the current token is still valid.
   */
  get isAuthenticated(): boolean {
    return this.accessToken !== null && Date.now() < this.tokenExpiry;
  }

  /**
   * Clear credentials and token. Bridge cannot be used after this.
   */
  dispose(): void {
    this.accessToken = null;
    this.tokenExpiry = 0;
    this.apiKey = '';
    this.scriptName = '';
    this.disposed = true;
  }

  /**
   * Get versions for a ShotGrid playlist.
   * Two-step: query PlaylistVersionConnection for ordered version IDs,
   * then batch-fetch versions. This preserves playlist ordering.
   */
  async getVersionsForPlaylist(playlistId: number): Promise<ShotGridVersion[]> {
    // Step 1: Get PlaylistVersionConnection entries (ordered by sg_sort_order)
    const connectionsUrl =
      `${this.serverUrl}/api/v1/entity/playlist_version_connections` +
      `?filter[playlist]=${playlistId}` +
      `&fields=version,sg_sort_order` +
      `&sort=sg_sort_order`;

    const connections = await this.fetchAllPages<{ version: { id: number }; sg_sort_order: number }>(connectionsUrl);
    if (connections.length === 0) return [];

    // Step 2: Batch-fetch versions by ID (chunked to avoid URL length limits)
    const versionIds = connections.map((c) => c.version.id);
    const versions = await this.fetchVersionsByIds(versionIds);

    // Re-sort to match playlist order
    const versionMap = new Map(versions.map((v) => [v.id, v]));
    const ordered: ShotGridVersion[] = [];
    for (const id of versionIds) {
      const v = versionMap.get(id);
      if (v) ordered.push(v);
    }
    return ordered;
  }

  /**
   * Get a single Version by its ID.
   */
  async getVersionById(versionId: number): Promise<ShotGridVersion | null> {
    const url =
      `${this.serverUrl}/api/v1/entity/versions/${versionId}` +
      `?fields=${VERSION_FIELDS}`;

    const response = await this.request(url);
    const data = await response.json();
    return (data.data as ShotGridVersion) ?? null;
  }

  /**
   * Get versions linked to a specific Shot, scoped by project.
   */
  async getVersionsForShot(shotId: number): Promise<ShotGridVersion[]> {
    const url =
      `${this.serverUrl}/api/v1/entity/versions` +
      `?filter[entity]=${shotId}` +
      `&filter[project]=${this.projectId}` +
      `&fields=${VERSION_FIELDS}`;

    return this.fetchAllPages<ShotGridVersion>(url);
  }

  /**
   * Get notes linked to a specific Version.
   */
  async getNotesForVersion(versionId: number): Promise<ShotGridNote[]> {
    const url =
      `${this.serverUrl}/api/v1/entity/notes` +
      `?filter[note_links]=[{"type":"Version","id":${versionId}}]` +
      `&filter[project]=${this.projectId}` +
      `&fields=subject,content,note_links,created_at,user,sg_first_frame,sg_last_frame,frame_range,sg_status_list,reply_to_entity`;

    return this.fetchAllPages<ShotGridNote>(url);
  }

  /**
   * Push a note to ShotGrid linked to a Version.
   * When annotations are provided, they are appended to the note content.
   * When a thumbnailBlob is provided, it is uploaded as an attachment to the created note.
   */
  async pushNote(versionId: number, note: PushNoteOptions): Promise<ShotGridNote> {
    const url = `${this.serverUrl}/api/v1/entity/notes`;
    const subject = truncateSubject(note.text);

    // Build content: original text + annotation summary block
    let content = note.text;
    if (note.annotations && note.annotations.length > 0) {
      content += '\n\n--- Annotations ---\n';
      for (const ann of note.annotations) {
        content += `[Frame ${ann.frame}] ${ann.type}: ${ann.description} (by ${ann.user})\n`;
      }
    }

    const attributes: Record<string, string> = {
      subject,
      content,
    };
    if (note.frameRange) {
      attributes.frame_range = note.frameRange;
    }
    if (note.noteStatus) {
      attributes.sg_status_list = note.noteStatus;
    }

    const relationships: Record<string, { data: unknown }> = {
      note_links: {
        data: [{ type: 'Version', id: versionId }],
      },
      project: {
        data: { type: 'Project', id: this.projectId },
      },
    };

    if (note.replyToNoteId != null) {
      relationships.reply_to_entity = {
        data: { type: 'Note', id: note.replyToNoteId },
      };
    }

    const body = {
      data: {
        type: 'Note',
        attributes,
        relationships,
      },
    };

    const response = await this.request(url, {
      method: 'POST',
      body: JSON.stringify(body),
    });

    const result = await response.json();
    const sgNote = result.data as ShotGridNote;

    // Upload thumbnail as attachment if provided
    if (note.thumbnailBlob) {
      try {
        await this.uploadAttachment(sgNote.id, note.thumbnailBlob);
      } catch (err) {
        // Attachment upload failure is non-fatal; the note was already created
        const message = err instanceof Error ? err.message : 'Unknown error';
        console.warn(`[ShotGrid] Thumbnail upload failed for note ${sgNote.id}: ${message}`);
      }
    }

    return sgNote;
  }

  /**
   * Upload a thumbnail image as an attachment to a ShotGrid Note entity.
   * Uses the ShotGrid REST API's file upload endpoint.
   */
  async uploadAttachment(noteId: number, blob: Blob, filename = 'annotation_thumbnail.png'): Promise<void> {
    if (this.disposed) throw new Error('ShotGridBridge is disposed');
    await this.ensureAuthenticated();

    const url = `${this.serverUrl}/api/v1/entity/notes/${noteId}/_upload`;

    const formData = new FormData();
    formData.append('image', blob, filename);

    const response = await this.fetchFn(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        Accept: 'application/json',
      },
      body: formData,
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new ShotGridAPIError(response.status, text || response.statusText);
    }

    // Read response to ensure the upload was accepted
    await response.json();
  }

  /**
   * Push a local status to a ShotGrid Version entity.
   */
  async pushStatus(versionId: number, status: ShotStatus): Promise<void> {
    const url = `${this.serverUrl}/api/v1/entity/versions/${versionId}`;
    const sgStatus = mapStatusToShotGrid(status);

    const body = {
      data: {
        type: 'Version',
        id: versionId,
        attributes: {
          sg_status_list: sgStatus,
        },
      },
    };

    const response = await this.request(url, {
      method: 'PUT',
      body: JSON.stringify(body),
    });

    // Read response to ensure the update was accepted
    await response.json();
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  /**
   * Follow paginated results, collecting all items up to maxPages.
   */
  private async fetchAllPages<T>(url: string, maxPages = DEFAULT_MAX_PAGES): Promise<T[]> {
    const results: T[] = [];
    let currentUrl: string | null = url;
    let page = 0;

    while (currentUrl && page < maxPages) {
      const response = await this.request(currentUrl);
      const data = await response.json();

      if (Array.isArray(data.data)) {
        results.push(...data.data);
      }

      currentUrl = data.links?.next ?? null;
      page++;
    }

    return results;
  }

  /**
   * Fetch versions by IDs, chunking to avoid URL length limits.
   * Each chunk produces a separate request with at most VERSION_ID_BATCH_SIZE IDs.
   */
  private async fetchVersionsByIds(ids: number[]): Promise<ShotGridVersion[]> {
    if (ids.length === 0) return [];

    const results: ShotGridVersion[] = [];
    for (let i = 0; i < ids.length; i += VERSION_ID_BATCH_SIZE) {
      const chunk = ids.slice(i, i + VERSION_ID_BATCH_SIZE);
      const idsFilter = chunk.map((id) => `filter[id]=${id}`).join('&');
      const url =
        `${this.serverUrl}/api/v1/entity/versions` +
        `?${idsFilter}` +
        `&filter[project]=${this.projectId}` +
        `&fields=${VERSION_FIELDS}`;
      const batch = await this.fetchAllPages<ShotGridVersion>(url);
      results.push(...batch);
    }
    return results;
  }

  /**
   * Ensure we have a valid token, deduplicating concurrent auth calls.
   */
  private async ensureAuthenticated(): Promise<void> {
    if (this.isAuthenticated) return;
    if (!this.authPromise) {
      this.authPromise = this.authenticate().finally(() => {
        this.authPromise = null;
      });
    }
    return this.authPromise;
  }

  /**
   * Make an authenticated request with auto-retry on 401 and rate-limit handling.
   */
  private async request(url: string, init?: RequestInit): Promise<Response> {
    if (this.disposed) throw new Error('ShotGridBridge is disposed');
    await this.ensureAuthenticated();

    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.accessToken}`,
      Accept: 'application/json',
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
    };

    const doFetch = () =>
      this.fetchFn(url, {
        ...init,
        headers: { ...headers, ...(init?.headers as Record<string, string> | undefined) },
      });

    let response = await doFetch();

    // Handle 401 by re-authenticating once
    if (response.status === 401) {
      await this.authenticate();
      headers.Authorization = `Bearer ${this.accessToken}`;
      response = await doFetch();
      // Do not retry again — if still 401, fall through to error
    }

    // Handle rate limiting (429) with retries
    let rateLimitRetries = 0;
    while (response.status === 429 && rateLimitRetries < MAX_RATE_LIMIT_RETRIES) {
      const retryAfter = parseInt(response.headers.get('Retry-After') ?? '2', 10);
      await sleep(retryAfter * 1000);
      response = await doFetch();
      rateLimitRetries++;
    }

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new ShotGridAPIError(response.status, text || response.statusText);
    }

    return response;
  }
}

// ---------------------------------------------------------------------------
// Error class
// ---------------------------------------------------------------------------

export class ShotGridAPIError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(`ShotGrid API error ${status}: ${message}`);
    this.name = 'ShotGridAPIError';
    this.status = status;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Truncate text for a ShotGrid subject line (max 80 chars), avoiding mid-word cuts.
 */
function truncateSubject(text: string, maxLen = 80): string {
  if (text.length <= maxLen) return text;
  const truncated = text.slice(0, maxLen);
  const lastSpace = truncated.lastIndexOf(' ');
  return (lastSpace > maxLen * 0.5 ? truncated.slice(0, lastSpace) : truncated) + '...';
}
