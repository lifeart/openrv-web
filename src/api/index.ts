/**
 * OpenRV Web Scripting API
 *
 * Public API for controlling OpenRV Web from the browser console or external scripts.
 * Exposed as `window.openrv`.
 *
 * @example
 * ```javascript
 * // Playback
 * window.openrv.playback.play();
 * window.openrv.playback.seek(50);
 * window.openrv.playback.setSpeed(2);
 *
 * // View
 * window.openrv.view.setZoom(2);
 * window.openrv.view.setChannel('red');
 * window.openrv.view.fitToWindow();
 *
 * // Events
 * window.openrv.events.on('frameChange', (data) => console.log(data.frame));
 *
 * // Info
 * window.openrv.version; // "1.0.0"
 * window.openrv.isReady(); // true
 * ```
 */

export { OpenRVAPI } from './OpenRVAPI';
export type { OpenRVAPIConfig } from './OpenRVAPI';
export type { ViewerProvider, ColorAdjustmentProvider, CDLProvider, CurvesProvider } from './types';

export { PlaybackAPI } from './PlaybackAPI';
export { MediaAPI } from './MediaAPI';
export type { SourceInfo } from './MediaAPI';
export { AudioAPI } from './AudioAPI';
export { LoopAPI } from './LoopAPI';
export { ViewAPI } from './ViewAPI';
export { ColorAPI } from './ColorAPI';
export type { PublicColorAdjustments, PublicColorCurvesData, PublicColorCurvesUpdate } from './ColorAPI';
export { MarkersAPI } from './MarkersAPI';
export type { MarkerInfo } from './MarkersAPI';
export { EventsAPI } from './EventsAPI';
export type { OpenRVEventName, OpenRVEventData } from './EventsAPI';

// Plugin system re-exports for external consumers
export type {
  Plugin,
  PluginManifest,
  PluginId,
  PluginState,
  PluginContext,
  PluginContributionType,
  ExporterContribution,
  BlendModeContribution,
  UIPanelContribution,
} from '../plugin/types';

// Type augmentation for window.openrv
declare global {
  interface Window {
    /**
     * OpenRV Web public scripting API.
     *
     * Provides programmatic access to playback, media, audio, loop, view,
     * color, markers, and event subscription from the browser console or
     * external scripts.
     *
     * @example
     * ```js
     * window.openrv.version;          // "1.0.0"
     * window.openrv.isReady();        // true
     * window.openrv.playback.play();
     * window.openrv.view.setZoom(2);
     * window.openrv.events.on('frameChange', (d) => console.log(d.frame));
     * ```
     */
    openrv?: import('./OpenRVAPI').OpenRVAPI;
  }
}
