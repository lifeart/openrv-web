import { EventEmitter, EventMap } from '../../utils/EventEmitter';
import { MarkerManager, MARKER_COLORS, type Marker } from './MarkerManager';
import { NoteManager } from './NoteManager';
import { VersionManager } from './VersionManager';
import { StatusManager } from './StatusManager';
import { AnnotationStore } from './AnnotationStore';
import type { ParsedAnnotations, MatteSettings } from './Session';
import type { PaintEffects } from '../../paint/types';

export interface SessionAnnotationEvents extends EventMap {
  marksChanged: ReadonlyMap<number, Marker>;
  annotationsLoaded: ParsedAnnotations;
  paintEffectsLoaded: Partial<PaintEffects>;
  matteChanged: MatteSettings;
  notesChanged: void;
  versionsChanged: void;
  statusChanged: { sourceIndex: number; status: string; previous: string };
  statusesChanged: void;
}

export class SessionAnnotations extends EventEmitter<SessionAnnotationEvents> {
  private _markerManager = new MarkerManager();
  private _noteManager = new NoteManager();
  private _versionManager = new VersionManager();
  private _statusManager = new StatusManager();
  private _annotationStore = new AnnotationStore();

  constructor() {
    super();
    // Wire all callbacks to re-emit on this emitter
    this._markerManager.setCallbacks({
      onMarksChanged: (marks) => this.emit('marksChanged', marks),
    });
    this._noteManager.setCallbacks({
      onNotesChanged: () => this.emit('notesChanged', undefined),
    });
    this._versionManager.setCallbacks({
      onVersionsChanged: () => this.emit('versionsChanged', undefined),
      onActiveVersionChanged: (_groupId, _entry) => {
        // Can be extended for source switching in future
      },
    });
    this._statusManager.setCallbacks({
      onStatusChanged: (sourceIndex, status, previous) =>
        this.emit('statusChanged', { sourceIndex, status, previous }),
      onStatusesChanged: () => this.emit('statusesChanged', undefined),
    });
    this._annotationStore.setCallbacks({
      onAnnotationsLoaded: (data) => this.emit('annotationsLoaded', data),
      onPaintEffectsLoaded: (effects) => this.emit('paintEffectsLoaded', effects),
      onMatteChanged: (settings) => this.emit('matteChanged', settings),
    });
  }

  // --- Sub-manager access ---
  get markerManager(): MarkerManager { return this._markerManager; }
  get noteManager(): NoteManager { return this._noteManager; }
  get versionManager(): VersionManager { return this._versionManager; }
  get statusManager(): StatusManager { return this._statusManager; }
  get annotationStore(): AnnotationStore { return this._annotationStore; }

  // --- Convenience delegations for markers ---
  get marks(): ReadonlyMap<number, Marker> { return this._markerManager.marks; }
  get markedFrames(): number[] { return this._markerManager.markedFrames; }
  getMarker(frame: number): Marker | undefined { return this._markerManager.getMarker(frame); }
  hasMarker(frame: number): boolean { return this._markerManager.hasMarker(frame); }
  toggleMark(frame: number): void { this._markerManager.toggleMark(frame); }
  setMarker(frame: number, note?: string, color?: string, endFrame?: number): void {
    this._markerManager.setMarker(frame, note ?? '', color ?? MARKER_COLORS[0], endFrame);
  }
  setMarkerEndFrame(frame: number, endFrame: number | undefined): void {
    this._markerManager.setMarkerEndFrame(frame, endFrame);
  }
  getMarkerAtFrame(frame: number): Marker | undefined {
    return this._markerManager.getMarkerAtFrame(frame);
  }
  setMarkerNote(frame: number, note: string): void {
    this._markerManager.setMarkerNote(frame, note);
  }
  setMarkerColor(frame: number, color: string): void {
    this._markerManager.setMarkerColor(frame, color);
  }
  removeMark(frame: number): void { this._markerManager.removeMark(frame); }
  clearMarks(): void { this._markerManager.clearMarks(); }

  // --- Matte/paint accessors ---
  get matteSettings(): MatteSettings | null { return this._annotationStore.matteSettings; }
  get sessionPaintEffects(): Partial<PaintEffects> | null { return this._annotationStore.sessionPaintEffects; }

  dispose(): void {
    this._markerManager.dispose();
    this._noteManager.dispose();
    this._versionManager.dispose();
    this._statusManager.dispose();
    this._annotationStore.dispose();
    this.removeAllListeners();
  }
}
