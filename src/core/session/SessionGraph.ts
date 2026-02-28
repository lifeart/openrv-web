import { SimpleReader, GTODTO } from 'gto-js';
import type { GTOData } from 'gto-js';
import { EventEmitter, EventMap } from '../../utils/EventEmitter';
import { parseRVEDL, type RVEDLEntry } from '../../formats/RVEDLParser';
import { Graph } from '../graph/Graph';
import { loadGTOGraph } from './GTOGraphLoader';
import type { GTOParseResult } from './GTOGraphLoader';
import {
  resolveProperty as _resolveProperty,
  resolveGTOByHash,
  resolveGTOByAt,
} from './PropertyResolver';
import type {
  HashResolveResult,
  AtResolveResult,
  GTOHashResolveResult,
  GTOAtResolveResult,
} from './PropertyResolver';
import { parseInitialSettings as _parseInitialSettings } from './GTOSettingsParser';
import { getNumberValue, getNumberArray } from './AnnotationStore';
import type { SessionMetadata, GTOViewSettings } from './Session';
import type { UncropState } from '../types/transform';
import { Logger } from '../../utils/Logger';
import type { SessionAnnotations } from './SessionAnnotations';

const log = new Logger('SessionGraph');

export interface SessionGraphEvents extends EventMap {
  graphLoaded: GTOParseResult;
  settingsLoaded: GTOViewSettings;
  sessionLoaded: void;
  edlLoaded: RVEDLEntry[];
  metadataChanged: SessionMetadata;
}

export interface SessionGraphHost {
  // Playback state mutations
  setFps(fps: number): void;
  setCurrentFrame(frame: number): void;
  setInPoint(value: number): void;
  setOutPoint(value: number): void;
  setFrameIncrement(value: number): void;
  emitInOutChanged(inPoint: number, outPoint: number): void;
  emitFrameIncrementChanged(inc: number): void;

  // Annotations access (for applying GTO session data)
  getAnnotations(): SessionAnnotations;

  // Media loading (stays on Session until Phase 3)
  loadVideoSourcesFromGraph(result: GTOParseResult): Promise<void>;
}

export class SessionGraph extends EventEmitter<SessionGraphEvents> {
  private _host: SessionGraphHost | null = null;

  // Node graph from GTO file
  private _graph: Graph | null = null;
  private _graphParseResult: GTOParseResult | null = null;
  private _gtoData: GTOData | null = null;

  // Session metadata from GTO file
  private _metadata: SessionMetadata = {
    displayName: '',
    comment: '',
    version: 2,
    origin: 'openrv-web',
    creationContext: 0,
    clipboard: 0,
    membershipContains: [],
    realtime: 0,
    bgColor: [0.18, 0.18, 0.18, 1.0],
  };

  // EDL entries parsed from RVEDL file (pending source resolution)
  private _edlEntries: RVEDLEntry[] = [];

  // Uncrop state parsed from GTO (stored for export round-trip)
  private _uncropState: UncropState | null = null;

  setHost(host: SessionGraphHost): void {
    this._host = host;
  }

  // --- Accessors ---

  get graph(): Graph | null {
    return this._graph;
  }

  get graphParseResult(): GTOParseResult | null {
    return this._graphParseResult;
  }

  get gtoData(): GTOData | null {
    return this._gtoData;
  }

  get metadata(): SessionMetadata {
    return this._metadata;
  }

  get edlEntries(): readonly RVEDLEntry[] {
    return this._edlEntries;
  }

  get uncropState(): UncropState | null {
    return this._uncropState;
  }

  set uncropState(state: UncropState | null) {
    this._uncropState = state;
  }

  // --- Methods ---

  /**
   * Resolve an OpenRV property address against the session.
   *
   * Supports two addressing modes:
   * - Hash: `#RVColor.color.exposure` -- finds nodes by protocol, resolves component.property
   * - At: `@RVDisplayColor` -- finds all nodes with the given protocol
   *
   * Attempts resolution against the live Graph first; falls back to raw GTOData
   * for full component.property fidelity when no graph is loaded.
   *
   * @param address - Property address string (e.g. `#RVColor.color.exposure` or `@RVDisplayColor`)
   * @returns Matching results, or null if the address format is invalid
   */
  resolveProperty(
    address: string,
  ): HashResolveResult[] | AtResolveResult[] | GTOHashResolveResult[] | GTOAtResolveResult[] | null {
    // Try live graph first
    if (this._graph) {
      return _resolveProperty(this._graph, address);
    }

    // Fall back to raw GTO data
    if (this._gtoData) {
      if (address.startsWith('#')) {
        return resolveGTOByHash(this._gtoData, address);
      }
      if (address.startsWith('@')) {
        return resolveGTOByAt(this._gtoData, address);
      }
    }

    return null;
  }

  /**
   * Update one or more metadata fields and emit `metadataChanged`
   * when the resulting metadata differs from the current value.
   */
  updateMetadata(patch: Partial<SessionMetadata>): void {
    const current = this._metadata;
    const next: SessionMetadata = {
      displayName: patch.displayName !== undefined ? patch.displayName.trim() : current.displayName,
      comment: patch.comment !== undefined ? patch.comment : current.comment,
      version: patch.version !== undefined ? patch.version : current.version,
      origin: patch.origin !== undefined ? patch.origin : current.origin,
      creationContext: patch.creationContext !== undefined ? patch.creationContext : current.creationContext,
      clipboard: patch.clipboard !== undefined ? patch.clipboard : current.clipboard,
      membershipContains: patch.membershipContains !== undefined
        ? [...patch.membershipContains]
        : current.membershipContains,
      realtime: patch.realtime !== undefined ? patch.realtime : current.realtime,
      bgColor: patch.bgColor !== undefined ? [...patch.bgColor] as [number, number, number, number] : current.bgColor,
    };

    const membershipChanged = next.membershipContains.length !== current.membershipContains.length
      || next.membershipContains.some((value, index) => value !== current.membershipContains[index]);

    const bgColorChanged = next.bgColor.some((v, i) => v !== current.bgColor[i]);

    const hasChanged = next.displayName !== current.displayName
      || next.comment !== current.comment
      || next.version !== current.version
      || next.origin !== current.origin
      || next.creationContext !== current.creationContext
      || next.clipboard !== current.clipboard
      || membershipChanged
      || next.realtime !== current.realtime
      || bgColorChanged;

    if (!hasChanged) {
      return;
    }

    this._metadata = next;
    this.emit('metadataChanged', this._metadata);
  }

  /**
   * Convenience helper to update the session display name.
   */
  setDisplayName(displayName: string): void {
    this.updateMetadata({ displayName });
  }

  /**
   * Resets gtoData and graphParseResult (called by media loading methods).
   */
  clearData(): void {
    this._graph = null;
    this._gtoData = null;
    this._graphParseResult = null;
  }

  dispose(): void {
    this._host = null;
    this._graph = null;
    this._graphParseResult = null;
    this._gtoData = null;
    this.removeAllListeners();
  }

  /**
   * Parse an RVEDL (Edit Decision List) text, store the entries on the
   * session, and emit an `edlLoaded` event.
   *
   * Each entry describes a source path with in/out frame range.
   * In a web context the source paths reference local filesystem locations
   * that cannot be loaded directly; the caller should present the entries
   * to the user so they can resolve them by loading matching files.
   *
   * The parsed entries are accessible afterwards via {@link edlEntries}.
   */
  loadEDL(text: string): RVEDLEntry[] {
    const entries = parseRVEDL(text);
    this._edlEntries = entries;
    if (entries.length > 0) {
      this.emit('edlLoaded', entries);
    }
    return entries;
  }

  /**
   * Load and parse a GTO file, applying session info to playback state
   * via host callbacks, and emitting graph/session events.
   */
  async loadFromGTO(data: ArrayBuffer | string, availableFiles?: Map<string, File>): Promise<void> {
    const reader = new SimpleReader();

    try {
      if (typeof data === 'string') {
        reader.open(data);
      } else {
        // Check if it's text format GTO (starts with "GTOa")
        const bytes = new Uint8Array(data);
        const isTextFormat =
          bytes[0] === 0x47 && // 'G'
          bytes[1] === 0x54 && // 'T'
          bytes[2] === 0x4f && // 'O'
          bytes[3] === 0x61;   // 'a'

        if (isTextFormat) {
          // Convert to string for text format parsing
          const textContent = new TextDecoder('utf-8').decode(bytes);
          reader.open(textContent);
        } else {
          // Binary format
          reader.open(bytes);
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.error('GTO parsing error:', message);
      throw new Error(`Failed to parse GTO file: ${message}`);
    }

    this._gtoData = reader.result as GTOData;
    const dto = new GTODTO(reader.result);
    this.parseSession(dto);

    // Parse the node graph from the already-parsed GTO (avoids double parsing)
    try {
      const result = loadGTOGraph(dto, availableFiles);
      this._graph = result.graph;
      this._graphParseResult = result;

      const annotations = this._host!.getAnnotations();

      // Apply session info from GTO
      if (result.sessionInfo.fps) {
        this._host!.setFps(result.sessionInfo.fps);
      }
      if (result.sessionInfo.frame) {
        this._host!.setCurrentFrame(result.sessionInfo.frame);
      }
      if (result.sessionInfo.inPoint !== undefined && result.sessionInfo.outPoint !== undefined) {
        this._host!.setInPoint(result.sessionInfo.inPoint);
        this._host!.setOutPoint(result.sessionInfo.outPoint);
        this._host!.emitInOutChanged(result.sessionInfo.inPoint, result.sessionInfo.outPoint);
      }
      if (result.sessionInfo.marks && result.sessionInfo.marks.length > 0) {
        annotations.markerManager.setFromFrameNumbers(result.sessionInfo.marks);
      }

      // Apply frame increment
      if (result.sessionInfo.inc !== undefined) {
        this._host!.setFrameIncrement(result.sessionInfo.inc);
        this._host!.emitFrameIncrementChanged(result.sessionInfo.inc);
      }

      // Apply paint effects from session
      if (result.sessionInfo.paintEffects) {
        annotations.annotationStore.setPaintEffects(result.sessionInfo.paintEffects);
      }

      // Apply matte settings
      if (result.sessionInfo.matte) {
        annotations.annotationStore.setMatteSettings(result.sessionInfo.matte);
      }

      // Apply notes
      if (result.sessionInfo.notes && result.sessionInfo.notes.length > 0) {
        annotations.noteManager.fromSerializable(result.sessionInfo.notes);
      }

      // Apply version groups
      if (result.sessionInfo.versionGroups && result.sessionInfo.versionGroups.length > 0) {
        annotations.versionManager.fromSerializable(result.sessionInfo.versionGroups);
      }

      // Apply statuses
      if (result.sessionInfo.statuses && result.sessionInfo.statuses.length > 0) {
        annotations.statusManager.fromSerializable(result.sessionInfo.statuses);
      }

      // Apply session metadata
      if (result.sessionInfo.displayName || result.sessionInfo.comment ||
          result.sessionInfo.version || result.sessionInfo.origin ||
          result.sessionInfo.creationContext !== undefined ||
          result.sessionInfo.clipboard !== undefined ||
          result.sessionInfo.membershipContains ||
          result.sessionInfo.realtime !== undefined ||
          result.sessionInfo.bgColor) {
        this._metadata = {
          displayName: result.sessionInfo.displayName ?? '',
          comment: result.sessionInfo.comment ?? '',
          version: result.sessionInfo.version ?? 2,
          origin: result.sessionInfo.origin ?? 'openrv-web',
          creationContext: result.sessionInfo.creationContext ?? 0,
          clipboard: result.sessionInfo.clipboard ?? 0,
          membershipContains: result.sessionInfo.membershipContains ?? [],
          realtime: result.sessionInfo.realtime ?? 0,
          bgColor: result.sessionInfo.bgColor ?? [0.18, 0.18, 0.18, 1.0],
        };
        this.emit('metadataChanged', this._metadata);
      }

      if (result.nodes.size > 0) {
        log.debug('GTO Graph loaded:', {
          nodeCount: result.nodes.size,
          rootNode: result.rootNode?.name,
          sessionInfo: result.sessionInfo,
        });
      }

      this.emit('graphLoaded', result);

      // Load video sources from graph nodes that have file data
      await this._host!.loadVideoSourcesFromGraph(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.warn('Failed to load node graph from GTO:', message);
      // Non-fatal - continue with session
    }

    this.emit('sessionLoaded', undefined);
  }

  private parseSession(dto: GTODTO): void {
    // Debug: Log all available protocols
    log.debug('GTO Result:', dto);

    const annotations = this._host!.getAnnotations();

    const sessions = dto.byProtocol('RVSession');
    log.debug('RVSession objects:', sessions.length);
    if (sessions.length === 0) {
      log.warn('No RVSession found in file');
    } else {
      const session = sessions.first();
      const sessionComp = session.component('session');
      if (sessionComp?.exists()) {
        const resolveRange = (value: unknown): [number, number] | undefined => {
          const normalized = Array.isArray(value)
            ? value
            : ArrayBuffer.isView(value)
              ? Array.from(value as unknown as ArrayLike<number>)
              : null;

          if (!normalized || normalized.length === 0) {
            return undefined;
          }

          if (normalized.length >= 2) {
            const start = normalized[0];
            const end = normalized[1];
            if (typeof start === 'number' && typeof end === 'number') {
              return [start, end];
            }
            if (Array.isArray(start) && start.length >= 2) {
              const startValue = start[0];
              const endValue = start[1];
              if (typeof startValue === 'number' && typeof endValue === 'number') {
                return [startValue, endValue];
              }
            }
          }

          if (normalized.length === 1 && Array.isArray(normalized[0]) && normalized[0].length >= 2) {
            const startValue = normalized[0][0];
            const endValue = normalized[0][1];
            if (typeof startValue === 'number' && typeof endValue === 'number') {
              return [startValue, endValue];
            }
          }

          return undefined;
        };

        const frameValue = getNumberValue(sessionComp.property('frame').value());
        const currentFrameValue = getNumberValue(sessionComp.property('currentFrame').value());
        if (frameValue !== undefined || currentFrameValue !== undefined) {
          this._host!.setCurrentFrame(frameValue ?? currentFrameValue!);
        }

        const regionValue = sessionComp.property('region').value();
        const rangeValue = sessionComp.property('range').value();
        const resolvedRange = resolveRange(regionValue) ?? resolveRange(rangeValue);
        if (resolvedRange) {
          this._host!.setInPoint(resolvedRange[0]);
          this._host!.setOutPoint(resolvedRange[1]);
          this._host!.emitInOutChanged(resolvedRange[0], resolvedRange[1]);
        }

        const marksValue = sessionComp.property('marks').value();
        if (Array.isArray(marksValue)) {
          const marks = marksValue.filter((value): value is number => typeof value === 'number');
          if (marks.length > 0) {
            annotations.markerManager.setFromFrameNumbers(marks);
          }
        }
      }
    }

    // Parse file sources and get aspect ratio
    let aspectRatio = 1;
    let sourceWidth = 0;
    let sourceHeight = 0;
    const sources = dto.byProtocol('RVFileSource');
    log.debug('RVFileSource objects:', sources.length);
    for (const source of sources) {
      // Get size from proxy component
      const proxyComp = source.component('proxy');
      if (proxyComp?.exists()) {
        const sizeValue = proxyComp.property('size').value();
        const size = getNumberArray(sizeValue);
        if (size && size.length >= 2) {
          const width = size[0]!;
          const height = size[1]!;
          if (width > 0 && height > 0) {
            if (sourceWidth === 0 && sourceHeight === 0) {
              sourceWidth = width;
              sourceHeight = height;
            }
            aspectRatio = width / height;
            log.debug('Source size:', width, 'x', height, 'aspect:', aspectRatio);
          }
        }
      }

      const mediaObj = source.component('media');
      if (mediaObj) {
        const movieProp = mediaObj.property('movie').value();
        if (movieProp) {
          log.debug('Found source:', movieProp);
        }
      }
    }

    // Parse paint annotations with aspect ratio
    annotations.annotationStore.parsePaintAnnotations(dto, aspectRatio);

    const settings = _parseInitialSettings(dto, { width: sourceWidth, height: sourceHeight });
    if (settings) {
      if (settings.uncrop) {
        this._uncropState = settings.uncrop;
      }
      this.emit('settingsLoaded', settings);
    }
  }
}
