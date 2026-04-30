import { App } from './App';
import { exposeForTesting } from './test-helper';
import { OpenRVAPI } from './api/OpenRVAPI';
import { installGlobalErrorHandler } from './utils/globalErrorHandler';
import { pluginRegistry } from './plugin/PluginRegistry';
import { getCorePreferencesManager } from './core/PreferencesManager';
import { registerMuCompat } from './compat';

// Register nodes with NodeFactory
import './nodes/sources';
import './nodes/groups';
import './nodes/CacheLUTNode';

installGlobalErrorHandler();

const app = new App();

// Expose for e2e testing only in dev/test builds (never in production)
if (import.meta.env.DEV || import.meta.env.VITE_EXPOSE_TESTING) {
  exposeForTesting(app);
}

// Expose public scripting API as window.openrv
// Dispose previous instance on hot-reload to prevent duplicate event subscriptions
if (window.openrv) {
  window.openrv.dispose();
}
window.openrv = new OpenRVAPI(app.getAPIConfig());

// Register Mu compatibility layer (window.rv.commands / window.rv.extra_commands)
// Must come after window.openrv is initialized so the compat layer has access to the API.
registerMuCompat();

// Wire plugin registry dependencies
pluginRegistry.setAPI(window.openrv);
pluginRegistry.setEventsAPI(window.openrv.events);
pluginRegistry.setPaintEngine(app.getPaintEngine());

// Restrict plugin loading to same-origin by default (security: deny-by-default)
pluginRegistry.setAllowedOrigins([window.location.origin]);

// Wire plugin settings into the unified preferences backup flow
getCorePreferencesManager().setPluginSettingsProvider(pluginRegistry.settingsStore);

// Dev-only: wire up the Vite-driven hot-reload bridge and (optionally) the
// in-tree sample plugin. The dynamic imports keep `SamplePlugin`,
// `clientBridge`, and `HotReloadManager` out of production bundles
// entirely — verified by `tests/build/no-dev-leak.test.ts`.
//
// Ordering note: we install the hot-reload bridge BEFORE registering /
// activating any plugin so the `pluginStateChanged` listener that captures
// the plugin URL fires on the initial 'active' transition. If we activated
// first, the bridge's listener would attach after the event was emitted
// and the very first save-driven reload would fail with "No URL tracked".
//
// Sample plugin opt-out: `SamplePlugin` is loaded by default in DEV but
// can be disabled by setting `VITE_LOAD_SAMPLE_PLUGIN=0` in `.env.local`.
// It can also be activated on demand via `window.__openrvDev?.activateSample()`
// when the env var is `0`. See docs/advanced/plugin-development.md.
if (import.meta.env.DEV) {
  void (async () => {
    try {
      const { installPluginHotReloadBridge } = await import('./plugin/dev/clientBridge');
      installPluginHotReloadBridge();

      const loadSample = import.meta.env.VITE_LOAD_SAMPLE_PLUGIN !== '0';
      const activateSample = async (): Promise<void> => {
        const { default: SamplePlugin } = await import('./plugin/builtins/SamplePlugin');
        pluginRegistry.register(SamplePlugin);
        await pluginRegistry.activate(SamplePlugin.manifest.id);
      };

      // Always expose the on-demand activator so devs can opt in from the
      // console even when VITE_LOAD_SAMPLE_PLUGIN=0.
      const devHandle = (window as Window & { __openrvDev?: Record<string, unknown> }).__openrvDev ?? {};
      devHandle.activateSample = activateSample;
      (window as Window & { __openrvDev?: Record<string, unknown> }).__openrvDev = devHandle;

      if (loadSample) {
        await activateSample();
      } else {
        // Use console.warn for the opt-out notice so it surfaces under the
        // repo's `no-console` lint rule (which only permits warn/error).
        console.warn(
          '[main] SamplePlugin auto-load disabled (VITE_LOAD_SAMPLE_PLUGIN=0). ' +
            'Call window.__openrvDev.activateSample() to enable on demand.',
        );
      }
    } catch (err) {
      console.warn('[main] DEV plugin hot-reload setup failed:', err);
    }
  })();
}

// Mount the app and mark the API as ready once all async initialization completes.
// This ensures isReady() returns false until persistence and URL bootstrap are done.
app.mount('#app').then(() => {
  window.openrv?.markReady();
});
