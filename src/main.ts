import { App } from './App';
import { exposeForTesting } from './test-helper';
import { OpenRVAPI } from './api/OpenRVAPI';

// Register nodes with NodeFactory
import './nodes/sources';
import './nodes/groups';

const app = new App();
app.mount('#app');

// Expose for e2e testing (always enabled for now, can be gated by env var)
exposeForTesting(app);

// Expose public scripting API as window.openrv
// Dispose previous instance on hot-reload to prevent duplicate event subscriptions
if (window.openrv) {
  window.openrv.dispose();
}
window.openrv = new OpenRVAPI(app.getAPIConfig());
