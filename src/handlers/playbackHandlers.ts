/**
 * Playback event handlers: scope playback mode, prerender buffer state,
 * video preload management, and scope refresh on stop.
 */

import type { SessionBridgeContext } from '../AppSessionBridge';

/**
 * Handle playbackChanged event: update scope playback mode, prerender buffer,
 * video source preloading, and refresh scopes when playback stops.
 */
export function handlePlaybackChanged(
  context: SessionBridgeContext,
  isPlaying: boolean,
  updateHistogram: () => void,
  updateWaveform: () => void,
  updateVectorscope: () => void
): void {
  const session = context.getSession();

  context.getHistogram().setPlaybackMode(isPlaying);
  context.getWaveform().setPlaybackMode(isPlaying);
  context.getVectorscope().setPlaybackMode(isPlaying);

  // Update prerender buffer playback state
  const playDirection = session.playDirection;
  context.getViewer().updatePrerenderPlaybackState(isPlaying, playDirection);

  // Playback preload state management:
  // - START: Handled in Session.play() which calls videoSourceNode.startPlaybackPreload()
  //   This is done there because Session has immediate access to playback direction and
  //   needs to initiate preloading before the first update() call for seamless playback.
  // - STOP: Handled here via the event because App needs to coordinate with scope updates.
  //   When playback stops, we switch to scrub mode (symmetric preloading) and refresh
  //   scopes at full quality - both actions are App-level concerns.
  const source = session.currentSource;
  if (!isPlaying && source?.videoSourceNode) {
    source.videoSourceNode.stopPlaybackPreload();
  }

  // When playback stops, update scopes with full quality
  if (!isPlaying) {
    updateHistogram();
    updateWaveform();
    updateVectorscope();
  }
}
