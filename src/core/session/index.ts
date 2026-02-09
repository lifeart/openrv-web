/**
 * Session Module - Session management and persistence
 */

export { Session } from './Session';
export type { SessionEvents, LoopMode, MediaType, MediaSource, ParsedAnnotations } from './Session';

export { AnnotationStore } from './AnnotationStore';
export type { AnnotationStoreCallbacks } from './AnnotationStore';
export {
  getNumberValue,
  getBooleanValue,
  getNumberArray,
  getStringValue,
} from './AnnotationStore';

export { SessionSerializer } from './SessionSerializer';

export type {
  SessionState,
  MediaReference,
  PlaybackState,
  ViewState,
  SerializedPaintState,
} from './SessionState';

export {
  SESSION_STATE_VERSION,
  DEFAULT_VIEW_STATE,
  DEFAULT_PLAYBACK_STATE,
} from './SessionState';

export { loadGTOGraph, getGraphSummary } from './GTOGraphLoader';
export type { GTONodeInfo, GTOParseResult } from './GTOGraphLoader';
