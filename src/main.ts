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
app.mount('#app');

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
