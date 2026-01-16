import { App } from './App';

// Register nodes with NodeFactory
import './nodes/sources';
import './nodes/groups';

const app = new App();
app.mount('#app');
