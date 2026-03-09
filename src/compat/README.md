# Mu API Compatibility Layer

This module provides a compatibility bridge between desktop OpenRV's Mu scripting API and the openrv-web JavaScript runtime.

For full documentation -- API reference, migration guide, bridge modules, and differences from desktop OpenRV -- see the main documentation:

**[Mu Compat Layer Documentation](../../docs/advanced/mu-compat.md)**

## Quick Start

```js
import { registerMuCompat } from './compat';

const { commands, extra_commands } = registerMuCompat();

commands.play();
commands.setFrame(100);
extra_commands.togglePlay();
```

`window.openrv` must be initialized before calling any command. See the full docs for details.
