# Repository Conventions

## Module Suffix Doctrine

Used to make file purposes legible at a glance. New modules must follow these conventions; existing modules will migrate over time.

- **Manager** — Owns lifecycle and state for a single domain. Has a clear "create / dispose" contract. Examples: `AudioPlaybackManager`, `MediaCacheManager`, `AutoSaveManager`.
- **Service** — Stateless operation set; pure or near-pure functions wrapped in a class for ergonomic injection. Holds no domain state. Examples: `SessionURLService`.
- **Orchestrator** — Cross-system glue: composes Managers/Services to deliver a workflow. Owns no domain state itself. Examples: `AudioOrchestrator`, `LayoutOrchestrator`.
- **Engine** — Compute-heavy core (timing loops, processing pipelines). May spawn workers. Examples: `PlaybackEngine`.
- **Bridge** — Compatibility shim across a module boundary (e.g., legacy API surface or external integration). Examples: `MuSettingsBridge`, `ShotGridIntegrationBridge`.
- **Controller** — Mediates between view and state. Examples: `FrameCacheController`.

When in doubt, prefer `Manager` if the module owns state, `Service` if it does not.
