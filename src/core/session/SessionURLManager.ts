/**
 * Session URL Manager
 *
 * Encodes/decodes session state to/from URL hash parameters for shareable
 * review links. Allows users to share a specific frame, view settings,
 * and comparison state via a URL.
 */

import type { Transform2D } from '../types/transform';
import { DEFAULT_TRANSFORM } from '../types/transform';

// ---------------------------------------------------------------------------
// URL State envelope — the subset of session state that is shareable.
// ---------------------------------------------------------------------------

export interface SessionURLState {
  /** Current frame (1-based) */
  frame: number;
  /** Frames per second */
  fps: number;
  /** In point (optional) */
  inPoint?: number;
  /** Out point (optional) */
  outPoint?: number;
  /** Index of active source */
  sourceIndex: number;
  /** Source URL (for reference / re-loading) */
  sourceUrl?: string;
  /** A/B compare source indices */
  sourceAIndex?: number;
  sourceBIndex?: number;
  currentAB?: 'A' | 'B';
  /** Transform */
  transform?: Transform2D;
  /** Comparison / wipe */
  wipeMode?: string;
  wipePosition?: number;
  /** OCIO state (only non-default fields) */
  ocio?: OCIOURLState;
}

export interface OCIOURLState {
  enabled?: boolean;
  configName?: string;
  inputColorSpace?: string;
  display?: string;
  view?: string;
  look?: string;
}

// ---------------------------------------------------------------------------
// Encoding / Decoding
// ---------------------------------------------------------------------------

/**
 * Encode session state into a URL hash string.
 * Uses JSON + base64url encoding for compact, safe URLs.
 */
export function encodeSessionState(state: SessionURLState): string {
  const compact = buildCompactState(state);
  const json = JSON.stringify(compact);
  return base64UrlEncode(json);
}

/**
 * Decode session state from a URL hash string.
 * Returns null if the hash is empty, invalid, or cannot be parsed.
 */
export function decodeSessionState(hash: string): SessionURLState | null {
  const cleaned = hash.startsWith('#') ? hash.slice(1) : hash;
  if (!cleaned) return null;

  // Support ?s=... or bare base64
  const param = extractParam(cleaned, 's') ?? cleaned;
  if (!param) return null;

  try {
    const json = base64UrlDecode(param);
    const obj = JSON.parse(json);
    return parseState(obj);
  } catch {
    return null;
  }
}

/**
 * Build a full URL string with the session state encoded in the hash.
 */
export function buildShareURL(baseUrl: string, state: SessionURLState): string {
  const encoded = encodeSessionState(state);
  const url = new URL(baseUrl);
  url.hash = `s=${encoded}`;
  return url.toString();
}

// ---------------------------------------------------------------------------
// Compact state — strip defaults to minimize URL length
// ---------------------------------------------------------------------------

interface CompactState {
  f: number;   // frame
  fps: number;
  si: number;  // sourceIndex
  su?: string; // sourceUrl
  ip?: number; // inPoint
  op?: number; // outPoint
  sai?: number; // sourceAIndex
  sbi?: number; // sourceBIndex
  ab?: string;  // currentAB
  t?: CompactTransform;
  w?: string;  // wipeMode
  wp?: number; // wipePosition
  o?: OCIOURLState;
}

interface CompactTransform {
  r?: number;  // rotation
  fh?: boolean; // flipH
  fv?: boolean; // flipV
  sx?: number; // scale.x
  sy?: number; // scale.y
  tx?: number; // translate.x
  ty?: number; // translate.y
}

function buildCompactState(state: SessionURLState): CompactState {
  const c: CompactState = {
    f: state.frame,
    fps: state.fps,
    si: state.sourceIndex,
  };

  if (state.sourceUrl) c.su = state.sourceUrl;
  if (state.inPoint != null) c.ip = state.inPoint;
  if (state.outPoint != null) c.op = state.outPoint;
  if (state.sourceAIndex != null) c.sai = state.sourceAIndex;
  if (state.sourceBIndex != null) c.sbi = state.sourceBIndex;
  if (state.currentAB && state.currentAB !== 'A') c.ab = state.currentAB;

  if (state.transform && !isDefaultTransform(state.transform)) {
    c.t = buildCompactTransform(state.transform);
  }

  if (state.wipeMode && state.wipeMode !== 'off') {
    c.w = state.wipeMode;
    if (state.wipePosition != null) c.wp = state.wipePosition;
  }

  if (state.ocio?.enabled) {
    c.o = state.ocio;
  }

  return c;
}

function isDefaultTransform(t: Transform2D): boolean {
  return (
    t.rotation === DEFAULT_TRANSFORM.rotation &&
    t.flipH === DEFAULT_TRANSFORM.flipH &&
    t.flipV === DEFAULT_TRANSFORM.flipV &&
    t.scale.x === DEFAULT_TRANSFORM.scale.x &&
    t.scale.y === DEFAULT_TRANSFORM.scale.y &&
    t.translate.x === DEFAULT_TRANSFORM.translate.x &&
    t.translate.y === DEFAULT_TRANSFORM.translate.y
  );
}

function buildCompactTransform(t: Transform2D): CompactTransform {
  const ct: CompactTransform = {};
  if (t.rotation !== 0) ct.r = t.rotation;
  if (t.flipH) ct.fh = true;
  if (t.flipV) ct.fv = true;
  if (t.scale.x !== 1) ct.sx = t.scale.x;
  if (t.scale.y !== 1) ct.sy = t.scale.y;
  if (t.translate.x !== 0) ct.tx = t.translate.x;
  if (t.translate.y !== 0) ct.ty = t.translate.y;
  return ct;
}

// ---------------------------------------------------------------------------
// Parsing — restore from compact state with validation
// ---------------------------------------------------------------------------

function parseState(obj: unknown): SessionURLState | null {
  if (!obj || typeof obj !== 'object') return null;
  const c = obj as Record<string, unknown>;

  const frame = typeof c.f === 'number' && Number.isFinite(c.f) ? c.f : undefined;
  const fps = typeof c.fps === 'number' && Number.isFinite(c.fps) ? c.fps : undefined;
  const sourceIndex = typeof c.si === 'number' && Number.isFinite(c.si) ? c.si : undefined;

  // Required fields
  if (frame == null || fps == null || sourceIndex == null) return null;
  if (frame < 1 || fps <= 0 || sourceIndex < 0) return null;

  const state: SessionURLState = { frame, fps, sourceIndex };

  if (typeof c.su === 'string') state.sourceUrl = c.su;
  if (typeof c.ip === 'number') state.inPoint = c.ip;
  if (typeof c.op === 'number') state.outPoint = c.op;
  if (typeof c.sai === 'number') state.sourceAIndex = c.sai;
  if (typeof c.sbi === 'number') state.sourceBIndex = c.sbi;
  if (c.ab === 'A' || c.ab === 'B') state.currentAB = c.ab;

  if (c.t && typeof c.t === 'object') {
    state.transform = parseTransform(c.t as Record<string, unknown>);
  }

  if (typeof c.w === 'string') {
    state.wipeMode = c.w;
    if (typeof c.wp === 'number') state.wipePosition = Math.max(0, Math.min(1, c.wp));
  }

  if (c.o && typeof c.o === 'object') {
    state.ocio = parseOCIO(c.o as Record<string, unknown>);
  }

  return state;
}

function parseTransform(t: Record<string, unknown>): Transform2D {
  const rotation = typeof t.r === 'number' && [0, 90, 180, 270].includes(t.r)
    ? (t.r as 0 | 90 | 180 | 270)
    : 0;

  return {
    rotation,
    flipH: t.fh === true,
    flipV: t.fv === true,
    scale: {
      x: typeof t.sx === 'number' ? t.sx : 1,
      y: typeof t.sy === 'number' ? t.sy : 1,
    },
    translate: {
      x: typeof t.tx === 'number' ? t.tx : 0,
      y: typeof t.ty === 'number' ? t.ty : 0,
    },
  };
}

function parseOCIO(o: Record<string, unknown>): OCIOURLState {
  const state: OCIOURLState = {};
  if (typeof o.enabled === 'boolean') state.enabled = o.enabled;
  if (typeof o.configName === 'string') state.configName = o.configName;
  if (typeof o.inputColorSpace === 'string') state.inputColorSpace = o.inputColorSpace;
  if (typeof o.display === 'string') state.display = o.display;
  if (typeof o.view === 'string') state.view = o.view;
  if (typeof o.look === 'string') state.look = o.look;
  return state;
}

// ---------------------------------------------------------------------------
// Base64url helpers (RFC 4648 §5 — URL-safe, no padding)
// ---------------------------------------------------------------------------

function base64UrlEncode(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function base64UrlDecode(str: string): string {
  let b64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const pad = b64.length % 4;
  if (pad === 2) b64 += '==';
  else if (pad === 3) b64 += '=';

  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder().decode(bytes);
}

function extractParam(query: string, name: string): string | null {
  const prefix = `${name}=`;
  if (query.startsWith(prefix)) return query.slice(prefix.length);
  const idx = query.indexOf(`&${prefix}`);
  if (idx >= 0) return query.slice(idx + prefix.length + 1).split('&')[0] ?? null;
  return null;
}
