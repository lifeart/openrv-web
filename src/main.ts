import { App } from './App';
import { exposeForTesting } from './test-helper';

// Register nodes with NodeFactory
import './nodes/sources';
import './nodes/groups';

const app = new App();
app.mount('#app');

// Expose for e2e testing (always enabled for now, can be gated by env var)
exposeForTesting(app);
