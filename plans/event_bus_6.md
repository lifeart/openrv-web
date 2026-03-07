# Implementation Plan: Event Bus / Wiring Architecture Improvement

## 1. Current Architecture Analysis

The application uses 7 `AppXxxWiring.ts` modules, each following the same pattern:

1. Receive an `AppWiringContext` with references to `Session`, `Viewer`, `PaintEngine`, `HeaderBar`, `TabBar`, `AppControlRegistry`, `AppSessionBridge`, `AppPersistenceManager`
2. Create a `DisposableSubscriptionManager` to track subscriptions
3. Subscribe to UI control events and call methods on `Viewer`/`Session`/bridges in response
4. Return the `DisposableSubscriptionManager` or a state object containing it
5. `App.ts` calls each `wireXxx()` and registers dispose callbacks

**Key observations:**
- 144 classes extend `EventEmitter`, each with typed event maps
- Controls are event sources; `Viewer` and `Session` are sinks. Some flows are bidirectional
- Common side-effects: `sessionBridge.scheduleUpdateScopes()`, `persistenceManager.syncGTOStore()`
- Some wiring modules maintain mutable state (debounce timers, history tracking, loop protection)

---

## 2. Approach Evaluation

| Option | Verdict |
|--------|---------|
| **A: Central Typed Event Bus** | Poor fit. 144 independent emitters with well-scoped event maps would collapse into one massive type. Loses locality and type safety. |
| **B: Mediator Pattern** | Marginal improvement. Essentially what wiring modules already are, just merged into a god object. |
| **C: Message Broker with Topics** | Over-engineering. This is a single-page app, not a distributed system. |
| **D: Keep Current Pattern, Improve It** | **RECOMMENDED.** The architecture is fundamentally sound. Extract cross-cutting concerns, add debugging, enable plugin access. |

---

## 3. Recommended Design: Improved Wiring Architecture

### 3.1 Extract Cross-Cutting Concerns

The most common boilerplate is the triple side-effect: `viewer.setXxx(state)` + `scheduleUpdateScopes()` + `syncGTOStore()`.

```typescript
// src/utils/WiringHelpers.ts

export interface WiringSideEffects {
  scheduleUpdateScopes(): void;
  syncGTOStore(): void;
}

/**
 * Create a wiring handler that calls the primary action,
 * then conditionally triggers scopes and/or GTO sync.
 */
export function withSideEffects<T>(
  effects: WiringSideEffects,
  primaryAction: (value: T) => void,
  options: { scopes?: boolean; gto?: boolean } = { scopes: true, gto: false },
): (value: T) => void {
  return (value: T) => {
    primaryAction(value);
    if (options.scopes) effects.scheduleUpdateScopes();
    if (options.gto) effects.syncGTOStore();
  };
}
```

### 3.2 Standardize Wiring Return Types

```typescript
// src/AppWiringContext.ts (extended)

export interface WiringResult {
  subscriptions: DisposableSubscriptionManager;
}

export interface StatefulWiringResult<S> extends WiringResult {
  state: S;
}
```

App.ts cleanup becomes uniform:
```typescript
const results: WiringResult[] = [];
results.push(wireColorControls(ctx));
results.push(wireViewControls(ctx));
// dispose all:
results.forEach(r => r.subscriptions.dispose());
```

### 3.3 Debugging: WiringEventLog

```typescript
// src/utils/WiringEventLog.ts

export interface WiringEvent {
  timestamp: number;
  source: string;       // e.g., 'colorControls'
  event: string;        // e.g., 'adjustmentsChanged'
  target: string;       // e.g., 'viewer.setColorAdjustments'
  data?: unknown;
}

export class WiringEventLog {
  private log: WiringEvent[] = [];
  private maxSize = 1000;
  enabled = false;

  record(source: string, event: string, target: string, data?: unknown): void {
    if (!this.enabled) return;
    if (this.log.length >= this.maxSize) this.log.shift();
    this.log.push({ timestamp: performance.now(), source, event, target, data });
  }

  getLog(): ReadonlyArray<WiringEvent> { return this.log; }
  clear(): void { this.log = []; }
  dump(): void { console.table(this.log); }
}

export const wiringEventLog = new WiringEventLog();
```

### 3.4 Plugin Wiring API (Phase 2 Readiness)

Extend `PluginContext` with event subscriptions:

```typescript
// src/plugin/types.ts (extended)

export interface PluginContext {
  // ... existing members ...

  events: {
    onFrameChanged(handler: (frame: number) => void): void;
    onSourceLoaded(handler: (source: SourceInfo) => void): void;
    onPlaybackChanged(handler: (playing: boolean) => void): void;
    onColorChanged(handler: (adjustments: ColorAdjustments) => void): void;
  };
}
```

Implementation tracks subscriptions for automatic cleanup on plugin deactivation.

---

## 4. Before/After Examples

### AppEffectsWiring

**BEFORE** (~117 lines):
```typescript
subs.add(controls.filterControl.on('filtersChanged', (settings) => {
  viewer.setFilterSettings(settings);
  sessionBridge.scheduleUpdateScopes();
  persistenceManager.syncGTOStore();
}));

subs.add(controls.lensControl.on('lensChanged', (params) => {
  viewer.setLensParams(params);
  sessionBridge.scheduleUpdateScopes();
  persistenceManager.syncGTOStore();
}));
// ... 8 more identical patterns
```

**AFTER** (~70 lines):
```typescript
const fx = { scheduleUpdateScopes: sessionBridge.scheduleUpdateScopes,
             syncGTOStore: persistenceManager.syncGTOStore };

subs.add(controls.filterControl.on('filtersChanged',
  withSideEffects(fx, (s) => viewer.setFilterSettings(s), { scopes: true, gto: true })));

subs.add(controls.lensControl.on('lensChanged',
  withSideEffects(fx, (p) => viewer.setLensParams(p), { scopes: true, gto: true })));
```

~40% fewer lines, zero behavioral change.

### AppStackWiring

**BEFORE:**
```typescript
subs.add(controls.stackControl.on('layerChanged', () => {
  viewer.setStackLayers(controls.stackControl.getLayers());
  sessionBridge.scheduleUpdateScopes();
}));
subs.add(controls.stackControl.on('layerRemoved', () => {
  viewer.setStackLayers(controls.stackControl.getLayers());
  sessionBridge.scheduleUpdateScopes();
}));
subs.add(controls.stackControl.on('layerReordered', () => {
  viewer.setStackLayers(controls.stackControl.getLayers());
  sessionBridge.scheduleUpdateScopes();
}));
```

**AFTER:**
```typescript
const syncLayers = withSideEffects(fx,
  () => viewer.setStackLayers(controls.stackControl.getLayers()),
  { scopes: true });

for (const event of ['layerChanged', 'layerRemoved', 'layerReordered'] as const) {
  subs.add(controls.stackControl.on(event, syncLayers));
}
```

---

## 5. Migration Strategy

### Phase 1: Infrastructure (no behavioral changes)
1. Create `src/utils/WiringHelpers.ts` with `withSideEffects()`
2. Create `src/utils/WiringEventLog.ts` with tracing infrastructure
3. Define `WiringResult` / `StatefulWiringResult<S>` in `AppWiringContext.ts`
4. All existing tests pass unchanged

### Phase 2: Incremental conversion (one module at a time)
5. Convert `AppEffectsWiring.ts` (simplest, most repetitive)
6. Convert `AppStackWiring.ts` (next simplest)
7. Convert `AppColorWiring.ts` (has debounce -- keep custom logic for history)
8. Convert `AppViewWiring.ts` (largest, mix of simple and complex)
9. Convert `AppTransformWiring.ts` (has history -- keep custom)
10. Convert `AppPlaybackWiring.ts` (most complex -- minimize changes)
11. `AppDCCWiring.ts` -- leave as-is (unique patterns, already clean)

### Phase 3: Standardize return types
12. Update all `wireXxx()` to return `WiringResult` or `StatefulWiringResult<S>`
13. Simplify `App.ts` cleanup to iterate over results array

### Phase 4: Plugin event access
14. Add `events` property to `PluginContext` interface
15. Implement in `PluginRegistry.createContext()` with tracked subscriptions
16. Add cleanup to `unregisterContributions()`

### Phase 5: DevTools integration
17. Expose `wiringEventLog` in development builds
18. Optional `WiringInspector` UI panel behind dev flag

---

## 6. Performance Considerations

- Highest-frequency event is `frameChanged` at 24-60 Hz. `withSideEffects` adds one function call -- negligible vs WebGL rendering
- `WiringEventLog` uses bounded ring buffer (1000 entries), gated behind `enabled = false`
- No changes to hot paths. `EventEmitter.emit()` and `Signal.emit()` remain untouched

---

## 7. Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|------------|
| Helper hides behavior | Low | `withSideEffects` is 5 lines, transparent |
| Breaking tests | Very Low | Phase 1 adds no behavioral changes |
| Over-abstracting complex wiring | Medium | PlaybackWiring and DCCWiring marked "minimize changes" |
| Plugin event surface too narrow | Low | Start with 4-5 events, expand based on feedback |

---

## 8. What NOT to Do

- **Do not introduce a central EventBus.** 144 independent emitters with typed maps > one global bus
- **Do not replace EventEmitter with Signal.** They serve different purposes
- **Do not merge wiring modules.** Current separation by domain is clean and testable
- **Do not add runtime event filtering/middleware.** Premature complexity

---

## Critical Files

- `src/utils/EventEmitter.ts` -- Foundation; must remain unchanged
- `src/AppWiringContext.ts` -- Extend with standardized return types
- `src/AppEffectsWiring.ts` -- First conversion target
- `src/plugin/PluginRegistry.ts` -- Extend for plugin event subscriptions (Phase 4)
- `src/App.ts` -- Orchestrator; needs cleanup standardization (Phase 3)
