import type { MediaSource } from '../../core/session/Session';
import type { MediaRepresentation } from '../../core/types/representation';

type SourceWithStartFrame = Pick<MediaSource, 'type' | 'sequenceInfo' | 'representations' | 'activeRepresentationIndex'> | null;
type AudioPlaybackState = { isUsingWebAudio: boolean } | null | undefined;

function getActiveRepresentation(source: SourceWithStartFrame): MediaRepresentation | null {
  if (!source?.representations?.length) {
    return null;
  }

  const index = source.activeRepresentationIndex ?? -1;
  if (index < 0 || index >= source.representations.length) {
    return null;
  }

  return source.representations[index] ?? null;
}

export function getCurrentSourceStartFrame(source: SourceWithStartFrame): number {
  const activeRepresentation = getActiveRepresentation(source);
  if (activeRepresentation) {
    return activeRepresentation.startFrame;
  }

  return source?.sequenceInfo?.startFrame ?? 0;
}

export function isAudioScrubAvailable(
  source: Pick<MediaSource, 'type'> | null,
  audioPlaybackManager: AudioPlaybackState,
): boolean {
  return source?.type === 'video' && audioPlaybackManager?.isUsingWebAudio === true;
}
