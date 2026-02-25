# Improvement 6: Fix Signal Connection Leaks

## Problem Statement

The OpenRV Web codebase has two primary event/subscription systems:

1. **`Signal<T>`** (`src/core/graph/Signal.ts`) -- used by the graph/property layer (`Property.changed`, `IPNode.inputsChanged`, `IPNode.propertyChanged`, `ActiveContextManager.contextChanged`, etc.).
2. **`EventEmitter<Events>`** (`src/utils/EventEmitter.ts`) -- used by Session, UI controls, managers, and network components.

Both follow the same contract: calling `.connect()` or `.on()` returns an unsubscribe function that **must** be called when the listener is no longer needed. The Signal JSDoc even warns:

> *"Failing to call the returned function will prevent the callback (and anything it closes over) from being garbage-collected, leading to memory leaks."*

Despite this, the codebase has **~120+ event subscriptions across wiring modules and ~30+ in App.ts** whose unsubscribe handles are silently discarded. Additionally, `ComputedSignal` and `PropertyContainer.add()` create internal subscriptions that are never cleaned up.

### Scope of the Problem

**Category 1 -- Wiring module leaks (no unsubscribe stored):**

| File | Leaked `.on()` calls | Notes |
|------|---------------------|-------|
| `src/AppColorWiring.ts` | 11 | Returns `ColorWiringState` (timer only), no unsubscribers |
| `src/AppViewWiring.ts` | 20 | Pure fire-and-forget `.on()` calls |
| `src/AppEffectsWiring.ts` | 13 | Pure fire-and-forget `.on()` calls |
| `src/AppPlaybackWiring.ts` | ~29 | Includes nested `wirePlaylistRuntime()` with session.on leaks |
| `src/AppStackWiring.ts` | 5 | Pure fire-and-forget `.on()` calls |
| `src/AppDCCWiring.ts` | 5 | Pure fire-and-forget `.on()` calls |
| `src/App.ts` (init method) | ~35 | `session.on(...)`, `controls.*.on(...)` scattered through `init()` |
| **Subtotal** | **~118** | |

These wiring functions are called once during `App.init()`. The returned `EventEmitter.on()` unsubscribe functions are thrown away. When `App.dispose()` is called, it disposes individual components (which call `removeAllListeners()` on themselves), but any cross-component subscriptions that were registered *on another component* are never removed.

For example, in `AppPlaybackWiring.ts`:
```typescript
session.on('frameChanged', (frame) => { ... });       // unsubscribe handle discarded
session.on('volumeChanged', (volume) => { ... });     // unsubscribe handle discarded
session.on('fpsChanged', (fps) => { ... });            // unsubscribe handle discarded
controls.playlistManager.on('enabledChanged', ...);    // unsubscribe handle discarded
controls.playlistManager.on('clipsChanged', ...);      // unsubscribe handle discarded
```

**Category 2 -- Internal signal leaks in core graph classes:**

| Location | Issue |
|----------|-------|
| `ComputedSignal` constructor (Signal.ts:70) | Subscribes to dependency signals via `dep.connect(...)` but never stores unsubscribe handles; no `dispose()` method exists |
| `PropertyContainer.add()` (Property.ts:236) | Subscribes to `prop.changed.connect(...)` to forward to `propertyChanged` signal; unsubscribe handle discarded |

**Category 3 -- Component-level patterns (mostly handled):**

Some components properly manage subscriptions:
- `HistoryPanel` -- stores unsubscribers in `this.unsubscribers[]`, cleans up in `dispose()`
- `AppNetworkBridge` -- stores unsubscribers in `this.unsubscribers[]`, cleans up in `dispose()`
- `AppSessionBridge` -- has a `bindSessionEvent()` helper that pushes to `this.unsubscribers[]`
- `TimecodeOverlay` -- stores unsubscribers in `this.unsubscribers[]`
- `FalseColorControl`, `HSLQualifierControl`, `LuminanceVisualizationControl` -- store unsubscribers

But several components use the older ad-hoc pattern with `boundOnThemeChange`:
- `InfoPanel` -- manually stores `boundOnThemeChange` ref, calls `getThemeManager().off()` in dispose
- `CacheIndicator` -- similar manual pattern for theme change listener
- These work but are fragile and inconsistent

**Category 4 -- addEventListener leaks on DOM elements:**

Some components add DOM `addEventListener` calls (on `document`, `window`, etc.) that may not be cleaned up:
- `AutoSaveIndicator` -- properly cleans up via `hideSettingsPopover()` and `dispose()`
- Various controls add `window.addEventListener('resize', ...)` or `document.addEventListener('keydown', ...)` in dropdown open/close -- these are typically cleaned up, but the pattern is manual and error-prone

### Impact

1. **Memory leaks**: Closures in wiring callbacks capture references to `session`, `viewer`, `controls`, `paintEngine`, and other heavyweight objects. If the app is torn down and re-created (e.g., in tests, hot-reload, or SPA navigation), these references prevent GC.
2. **Phantom callbacks**: After `dispose()`, stale listeners may fire on signals from objects that are still alive, causing errors or corrupted state.
3. **Test isolation**: Tests that create and destroy `App` instances may accumulate leaked listeners across test runs.
4. **Developer confusion**: The inconsistency between components that track unsubscribers and those that don't makes it unclear what the correct pattern is.

---

## Proposed Solution

### Core Approach: `DisposableSubscriptionManager`

Create a lightweight subscription tracker that collects unsubscribe handles and disposes them all at once. This is similar to the `unsubscribers: (() => void)[]` pattern already used in `HistoryPanel`, `AppNetworkBridge`, etc., but formalized as a reusable utility.

### Design Principles

1. **Zero breaking changes** -- existing code continues to work; migration is incremental.
2. **Composable** -- a parent manager can own child managers (e.g., App owns wiring managers).
3. **Compatible with both Signal and EventEmitter** -- both return `() => void` unsubscribe functions.
4. **Optional AbortController integration** -- for DOM `addEventListener` cleanup.
5. **Debug mode** -- optionally track subscription creation stack traces for leak detection in tests.

---

## Detailed Steps

### Step 1: Create `DisposableSubscriptionManager` utility

**File:** `src/utils/DisposableSubscriptionManager.ts`

```typescript
/**
 * Tracks disposable subscriptions (signal connections, event listeners, etc.)
 * and disposes them all when the manager is disposed.
 *
 * Usage:
 *   const subs = new DisposableSubscriptionManager();
 *   subs.add(signal.connect(callback));
 *   subs.add(emitter.on('event', handler));
 *   subs.addDOMListener(element, 'click', handler);
 *   // Later:
 *   subs.dispose();
 */
export class DisposableSubscriptionManager {
  private disposers: (() => void)[] = [];
  private children: DisposableSubscriptionManager[] = [];
  private abortController: AbortController | null = null;
  private disposed = false;

  /**
   * Add an unsubscribe/dispose function to be called on dispose().
   * Works with both Signal.connect() and EventEmitter.on() return values.
   */
  add(disposer: () => void): void {
    if (this.disposed) {
      // Immediately call if already disposed (fail-safe)
      disposer();
      return;
    }
    this.disposers.push(disposer);
  }

  /**
   * Convenience: subscribe to a Signal and track the unsubscribe handle.
   */
  connectSignal<T>(
    signal: { connect(cb: (value: T, oldValue: T) => void): () => void },
    callback: (value: T, oldValue: T) => void
  ): void {
    this.add(signal.connect(callback));
  }

  /**
   * Convenience: subscribe to an EventEmitter event and track the handle.
   */
  onEvent<T>(
    emitter: { on(event: string, cb: (data: T) => void): () => void },
    event: string,
    callback: (data: T) => void
  ): void {
    this.add((emitter as any).on(event, callback));
  }

  /**
   * Add a DOM event listener with automatic cleanup via AbortController.
   */
  addDOMListener<K extends keyof HTMLElementEventMap>(
    target: EventTarget,
    event: K | string,
    handler: EventListenerOrEventListenerObject,
    options?: AddEventListenerOptions
  ): void {
    if (!this.abortController) {
      this.abortController = new AbortController();
    }
    target.addEventListener(event, handler, {
      ...options,
      signal: this.abortController.signal,
    });
  }

  /**
   * Create a child subscription manager whose lifetime is tied to this one.
   */
  createChild(): DisposableSubscriptionManager {
    const child = new DisposableSubscriptionManager();
    this.children.push(child);
    return child;
  }

  /**
   * Dispose all tracked subscriptions and children.
   * Idempotent: calling dispose() multiple times is safe.
   */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;

    // Dispose children first
    for (const child of this.children) {
      child.dispose();
    }
    this.children = [];

    // Abort all DOM listeners
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }

    // Call all disposers
    for (const disposer of this.disposers) {
      try {
        disposer();
      } catch (err) {
        console.error('Error disposing subscription:', err);
      }
    }
    this.disposers = [];
  }

  /**
   * Whether this manager has been disposed.
   */
  get isDisposed(): boolean {
    return this.disposed;
  }

  /**
   * Number of tracked subscriptions (useful for testing/debugging).
   */
  get count(): number {
    return this.disposers.length;
  }
}
```

### Step 2: Fix `ComputedSignal` -- add dispose method

**File:** `src/core/graph/Signal.ts`

The `ComputedSignal` constructor subscribes to dependency signals but discards the unsubscribe handles. Add disposal support:

```typescript
export class ComputedSignal<T> {
  private cachedValue: T;
  private dirty = true;
  readonly changed = new Signal<T>();
  private depUnsubscribers: (() => void)[] = [];  // NEW

  constructor(
    private compute: () => T,
    dependencies: Signal<any>[] = []
  ) {
    this.cachedValue = compute();

    for (const dep of dependencies) {
      const unsub = dep.connect(() => {       // CHANGED: capture handle
        this.dirty = true;
        const oldValue = this.cachedValue;
        this.cachedValue = this.compute();
        this.changed.emit(this.cachedValue, oldValue);
      });
      this.depUnsubscribers.push(unsub);       // NEW
    }
  }

  get value(): T {
    if (this.dirty) {
      this.cachedValue = this.compute();
      this.dirty = false;
    }
    return this.cachedValue;
  }

  dispose(): void {                             // NEW
    for (const unsub of this.depUnsubscribers) {
      unsub();
    }
    this.depUnsubscribers = [];
    this.changed.disconnectAll();
  }
}
```

### Step 3: Fix `PropertyContainer.add()` -- track internal subscription

**File:** `src/core/graph/Property.ts`

The `PropertyContainer.add()` method subscribes to each property's `changed` signal but discards the handle:

```typescript
// Current (leaks):
prop.changed.connect((value, oldValue) => {
  this.propertyChanged.emit({ name: info.name, value }, { name: info.name, value: oldValue });
});

// Fixed:
private propertyUnsubscribers = new Map<string, () => void>();

add<T>(info: PropertyInfo<T>): Property<T> {
  const prop = new Property(info);
  this.properties.set(info.name, prop as Property<unknown>);

  const unsub = prop.changed.connect((value, oldValue) => {
    this.propertyChanged.emit({ name: info.name, value }, { name: info.name, value: oldValue });
  });
  this.propertyUnsubscribers.set(info.name, unsub);

  return prop;
}

// Add a dispose method:
dispose(): void {
  for (const unsub of this.propertyUnsubscribers.values()) {
    unsub();
  }
  this.propertyUnsubscribers.clear();
  this.propertyChanged.disconnectAll();
}
```

### Step 4: Refactor wiring modules to return disposers

Each wiring module (`wireColorControls`, `wireViewControls`, `wireEffectsControls`, `wirePlaybackControls`, `wireStackControls`, `wireDCCBridge`) currently returns either `void` or a state object. Refactor each to accept or create a `DisposableSubscriptionManager` and track all `.on()` calls.

**Pattern for each wiring module:**

**File:** `src/AppColorWiring.ts` (example -- apply to all 6 wiring modules)

```typescript
import { DisposableSubscriptionManager } from './utils/DisposableSubscriptionManager';

export interface ColorWiringState {
  colorHistoryTimer: ReturnType<typeof setTimeout> | null;
  colorHistoryPrevious: ReturnType<ColorControls['getAdjustments']> | null;
  subscriptions: DisposableSubscriptionManager;  // NEW
}

export function wireColorControls(ctx: AppWiringContext): ColorWiringState {
  const { viewer, controls, sessionBridge, persistenceManager } = ctx;
  const subs = new DisposableSubscriptionManager();

  const state: ColorWiringState = {
    colorHistoryTimer: null,
    colorHistoryPrevious: controls.colorControls.getAdjustments(),
    subscriptions: subs,
  };

  // Color inversion toggle -> viewer
  subs.add(controls.colorInversionToggle.on('inversionChanged', (enabled) => {
    viewer.setColorInversion(enabled);
    sessionBridge.scheduleUpdateScopes();
  }));

  // ... all other .on() calls wrapped with subs.add(...)

  return state;
}
```

**Full list of wiring modules to update:**

| File | Estimated `.on()` calls to wrap |
|------|-------------------------------|
| `src/AppColorWiring.ts` | 11 |
| `src/AppViewWiring.ts` | 20 |
| `src/AppEffectsWiring.ts` | 13 |
| `src/AppPlaybackWiring.ts` | ~29 (including `wirePlaylistRuntime`) |
| `src/AppStackWiring.ts` | 5 |
| `src/AppDCCWiring.ts` | 5 |
| **Total** | **~83** |

### Step 5: Update `App.ts` to collect and dispose wiring subscriptions

**File:** `src/App.ts`

```typescript
export class App {
  // ... existing fields ...
  private wiringSubscriptions = new DisposableSubscriptionManager();

  init(): void {
    // ... existing init code ...

    // Wire all control groups via focused wiring modules
    this.colorWiringState = wireColorControls(wiringCtx);
    this.wiringSubscriptions.add(() => this.colorWiringState.subscriptions.dispose());

    const viewSubs = wireViewControls(wiringCtx);
    this.wiringSubscriptions.add(() => viewSubs.dispose());

    // ... similarly for all wiring modules ...

    // For inline .on() calls in App.init():
    this.wiringSubscriptions.add(
      this.session.on('playbackChanged', (playing: boolean) => { ... })
    );
    this.wiringSubscriptions.add(
      this.session.on('sourceLoaded', (source) => { ... })
    );
    // ... wrap all ~35 inline .on() calls ...
  }

  dispose(): void {
    // NEW: dispose all wiring subscriptions first
    this.wiringSubscriptions.dispose();

    // ... existing dispose code (component disposal) ...
  }
}
```

### Step 6: Standardize component subscription pattern

Replace the ad-hoc `boundOnThemeChange` / manual `off()` pattern in components with the subscription manager.

**Components to update (using `boundOnThemeChange` pattern):**

| File | Current pattern |
|------|----------------|
| `src/ui/components/InfoPanel.ts` | Manual `boundOnThemeChange` + `getThemeManager().off()` |
| `src/ui/components/CacheIndicator.ts` | Manual `boundOnThemeChange` |
| `src/ui/components/HistoryPanel.ts` | Mix: `unsubscribers[]` for history events, manual `off()` for theme |

**Refactored pattern:**

```typescript
// Before (InfoPanel.ts):
private boundOnThemeChange: (() => void) | null = null;

constructor() {
  this.boundOnThemeChange = () => this.render();
  getThemeManager().on('themeChanged', this.boundOnThemeChange);
}

dispose(): void {
  if (this.boundOnThemeChange) {
    getThemeManager().off('themeChanged', this.boundOnThemeChange);
    this.boundOnThemeChange = null;
  }
  this.container.remove();
  this.removeAllListeners();
}

// After:
private subs = new DisposableSubscriptionManager();

constructor() {
  this.subs.add(getThemeManager().on('themeChanged', () => this.render()));
}

dispose(): void {
  this.subs.dispose();
  this.container.remove();
  this.removeAllListeners();
}
```

**Components already using `unsubscribers[]` pattern (migrate to `DisposableSubscriptionManager`):**

| File | Current: `unsubscribers[]` |
|------|---------------------------|
| `src/ui/components/HistoryPanel.ts` | `this.unsubscribers.push(...)` |
| `src/ui/components/TimecodeOverlay.ts` | `this.unsubscribers.push(...)` |
| `src/ui/components/TimecodeDisplay.ts` | `this.unsubscribers.push(...)` |
| `src/ui/components/TextFormattingToolbar.ts` | `this.unsubscribers.push(...)` |
| `src/ui/components/FalseColorControl.ts` | `this.unsubscribers.push(...)` |
| `src/ui/components/HSLQualifierControl.ts` | `this.unsubscribers.push(...)` |
| `src/ui/components/LuminanceVisualizationControl.ts` | `this.unsubscribers.push(...)` |
| `src/ui/components/ZebraControl.ts` | `this.unsubscribers.push(...)` |
| `src/ui/components/SafeAreasControl.ts` | `this.unsubscribers.push(...)` |
| `src/ui/components/PaintToolbar.ts` | `this.unsubscribers.push(...)` |
| `src/ui/layout/panels/LeftPanelContent.ts` | `this.unsubscribers.push(...)` |
| `src/AppNetworkBridge.ts` | `this.unsubscribers.push(...)` |
| `src/AppSessionBridge.ts` | `this.unsubscribers.push(...)` |
| `src/network/NetworkSyncManager.ts` | `this.unsubscribers.push(...)` |
| `src/integrations/ShotGridIntegrationBridge.ts` | `this.unsubscribers.push(...)` |

These are low-priority since the pattern already works. Migration would be for consistency and to gain `addDOMListener()` / child manager benefits.

### Step 7: Add ESLint rule or code review checklist

Add a custom ESLint rule (or document a code review checklist) to flag:

1. `.on(` calls whose return value is not captured.
2. `.connect(` calls whose return value is not captured.

This can be implemented as a `no-unused-expressions`-style rule or a simpler regex-based `eslint-plugin-openrv` rule:

```javascript
// .eslintrc addition (conceptual):
rules: {
  'openrv/no-leaked-subscription': 'warn',
  // Flags: `foo.on('event', handler);` where return is not captured
  // Flags: `signal.connect(handler);` where return is not captured
}
```

Alternatively, add a `// eslint-disable-next-line openrv/no-leaked-subscription` comment for intentional fire-and-forget subscriptions (rare, but valid for app-lifetime singletons).

---

## Migration Strategy

### Phase 1: Foundation (Low risk, high value)
1. Create `DisposableSubscriptionManager` utility class
2. Add `dispose()` to `ComputedSignal`
3. Add subscription tracking to `PropertyContainer`
4. Write comprehensive tests for the new utility

### Phase 2: Core wiring (Medium risk, high value)
5. Refactor all 6 wiring modules to use `DisposableSubscriptionManager`
6. Update `App.ts` to dispose wiring subscriptions
7. Wrap inline `.on()` calls in `App.init()` with subscription tracking

### Phase 3: Component standardization (Low risk, medium value)
8. Migrate components with `boundOnThemeChange` pattern
9. Migrate components with `unsubscribers[]` to `DisposableSubscriptionManager` (optional, for consistency)

### Phase 4: Prevention (Low risk, long-term value)
10. Add ESLint rule or CI check for uncaptured `.on()` / `.connect()` return values
11. Update contributing guidelines with subscription management best practices

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Double-dispose calls | Medium | Low | `DisposableSubscriptionManager.dispose()` is idempotent; safe to call multiple times |
| Breaking existing disposal order | Low | Medium | Wiring subscriptions disposed before component disposal (correct order); test thoroughly |
| Wiring module refactor introduces regressions | Low | High | Each wiring module has integration tests; add disposal-specific tests |
| `ComputedSignal.dispose()` called while signal is still in use | Low | Medium | Document that `dispose()` must only be called when the computed signal is no longer observed |
| Performance overhead of tracking subscriptions | Very Low | Very Low | Array of function references; negligible memory and CPU cost |
| Migration fatigue (too many files changed at once) | Medium | Low | Phase the migration; Phase 1-2 captures 95% of the value |

---

## Testing Strategy

### Unit Tests for `DisposableSubscriptionManager`

**File:** `src/utils/DisposableSubscriptionManager.test.ts`

Test cases:
- `add()` tracks disposers and `dispose()` calls all of them
- `dispose()` is idempotent (second call is no-op)
- `add()` after `dispose()` immediately calls the disposer
- `connectSignal()` convenience method works with `Signal`
- `onEvent()` convenience method works with `EventEmitter`
- `addDOMListener()` cleans up via AbortController
- `createChild()` disposes children when parent disposes
- `count` property reflects tracked subscriptions
- Error in one disposer does not prevent other disposers from running

### Integration Tests for Wiring Module Disposal

For each wiring module, add a test that:
1. Creates mock dependencies
2. Calls the wire function
3. Verifies subscriptions are active (callbacks fire)
4. Calls `dispose()` on the returned subscription manager
5. Verifies callbacks no longer fire

Example:
```typescript
describe('wireColorControls disposal', () => {
  it('stops listening to events after dispose', () => {
    const ctx = createMockWiringContext();
    const state = wireColorControls(ctx);

    // Verify callback fires
    ctx.controls.colorInversionToggle.emit('inversionChanged', true);
    expect(ctx.viewer.setColorInversion).toHaveBeenCalledWith(true);

    // Dispose
    state.subscriptions.dispose();

    // Verify callback no longer fires
    ctx.viewer.setColorInversion.mockClear();
    ctx.controls.colorInversionToggle.emit('inversionChanged', false);
    expect(ctx.viewer.setColorInversion).not.toHaveBeenCalled();
  });
});
```

### Regression Tests

- Existing test suites (184 files, 7600+ tests) must pass without modification
- Run `npx vitest run` after each phase
- Run `npx tsc --noEmit` to verify type safety

### Leak Detection Tests (Optional, Phase 4)

Add a test utility that counts active signal/emitter listeners before and after a test:

```typescript
function expectNoLeakedSubscriptions(fn: () => void) {
  const beforeCount = getGlobalSubscriptionCount();
  fn();
  const afterCount = getGlobalSubscriptionCount();
  expect(afterCount).toBe(beforeCount);
}
```

---

## Success Metrics

1. **Zero leaked subscriptions in wiring modules**: All `.on()` and `.connect()` calls in wiring modules have their return values tracked by a `DisposableSubscriptionManager`.
2. **`App.dispose()` fully cleans up**: After `App.dispose()`, no cross-component subscriptions remain. Verifiable by checking `Signal.hasConnections` and `EventEmitter` listener counts.
3. **`ComputedSignal` is disposable**: `ComputedSignal.dispose()` removes all dependency subscriptions.
4. **All existing tests pass**: No regressions introduced.
5. **New tests cover disposal**: At least 15-20 new test cases covering the subscription manager and wiring module disposal.
6. **Consistent pattern across codebase**: All components use either `DisposableSubscriptionManager` or the existing `unsubscribers[]` pattern (not the ad-hoc `boundOnThemeChange` pattern).

---

## Estimated Effort

| Phase | Task | Estimated Time |
|-------|------|---------------|
| 1 | Create `DisposableSubscriptionManager` + tests | 2 hours |
| 1 | Fix `ComputedSignal` disposal | 30 minutes |
| 1 | Fix `PropertyContainer` subscription tracking | 30 minutes |
| 2 | Refactor `AppColorWiring.ts` | 30 minutes |
| 2 | Refactor `AppViewWiring.ts` | 45 minutes |
| 2 | Refactor `AppEffectsWiring.ts` | 30 minutes |
| 2 | Refactor `AppPlaybackWiring.ts` | 1 hour |
| 2 | Refactor `AppStackWiring.ts` | 20 minutes |
| 2 | Refactor `AppDCCWiring.ts` | 20 minutes |
| 2 | Update `App.ts` init + dispose | 1.5 hours |
| 2 | Wiring disposal integration tests | 2 hours |
| 3 | Migrate `InfoPanel`, `CacheIndicator`, `HistoryPanel` | 1 hour |
| 3 | Migrate remaining `unsubscribers[]` components (optional) | 2 hours |
| 4 | ESLint rule / documentation | 1-2 hours |
| **Total** | | **~13-14 hours** |

---

## Files to Create

| File | Purpose |
|------|---------|
| `src/utils/DisposableSubscriptionManager.ts` | Core subscription tracking utility |
| `src/utils/DisposableSubscriptionManager.test.ts` | Unit tests |

## Files to Modify

| File | Changes |
|------|---------|
| `src/core/graph/Signal.ts` | Add `dispose()` to `ComputedSignal`, store dep unsubscribers |
| `src/core/graph/Signal.test.ts` | Add tests for `ComputedSignal.dispose()` |
| `src/core/graph/Property.ts` | Track internal subscriptions in `PropertyContainer`, add `dispose()` |
| `src/core/graph/Property.test.ts` | Add tests for `PropertyContainer.dispose()` |
| `src/AppColorWiring.ts` | Wrap all `.on()` calls with subscription manager |
| `src/AppViewWiring.ts` | Wrap all `.on()` calls with subscription manager |
| `src/AppEffectsWiring.ts` | Wrap all `.on()` calls with subscription manager |
| `src/AppPlaybackWiring.ts` | Wrap all `.on()` calls with subscription manager |
| `src/AppStackWiring.ts` | Wrap all `.on()` calls with subscription manager |
| `src/AppDCCWiring.ts` | Wrap all `.on()` calls with subscription manager |
| `src/App.ts` | Create `wiringSubscriptions` manager, dispose in `dispose()` |
| `src/ui/components/InfoPanel.ts` | Replace `boundOnThemeChange` with subscription manager |
| `src/ui/components/CacheIndicator.ts` | Replace `boundOnThemeChange` with subscription manager |
| `src/ui/components/HistoryPanel.ts` | Unify `unsubscribers[]` + `boundOnThemeChange` into subscription manager |
| `src/nodes/base/IPNode.ts` | (Optional) Use subscription manager for `propertyChanged` forwarding |

---

## Expert Review -- Round 1

### Verdict: APPROVE WITH CHANGES

### Accuracy Check

The plan's analysis of the codebase is largely accurate after verifying against the actual source files:

1. **Signal.ts (lines 57-86)**: Confirmed. `ComputedSignal` subscribes to dependency signals via `dep.connect(...)` at line 70 but never stores the returned unsubscribe handles. No `dispose()` method exists. The plan's characterization is correct.

2. **Property.ts (lines 232-241)**: Confirmed. `PropertyContainer.add()` calls `prop.changed.connect(...)` at line 236 and discards the unsubscribe handle. The plan is correct.

3. **IPNode.ts (lines 42-45)**: The plan mentions `IPNode` as optional, but this is a more significant leak than described. `IPNode` constructor subscribes to `this.properties.propertyChanged.connect(...)` at line 42, and while `IPNode.dispose()` calls `this.propertyChanged.disconnectAll()` at line 160, it never calls anything to disconnect the _source_ subscription on `this.properties.propertyChanged`. The downstream signal's listeners are cleared, but the upstream connection from `PropertyContainer.propertyChanged` to the IPNode's forwarding callback persists. This is partially mitigated by the fact that both objects share the same lifetime, but it is still an architectural gap.

4. **Wiring modules**: All six wiring modules confirmed. The `.on()` call counts are accurate:
   - `AppColorWiring.ts`: 11 `.on()` calls, all fire-and-forget -- confirmed.
   - `AppViewWiring.ts`: ~20 `.on()` calls plus one raw `addEventListener('mousemove', ...)` at line 174 -- confirmed.
   - `AppEffectsWiring.ts`: 12 `.on()` calls plus one `viewer.setOnCropRegionChanged(...)` callback-setter -- confirmed.
   - `AppPlaybackWiring.ts`: ~29 `.on()` calls including nested `wirePlaylistRuntime()` -- confirmed.
   - `AppStackWiring.ts`: 5 `.on()` calls -- confirmed.
   - `AppDCCWiring.ts`: 5 `.on()` calls -- confirmed.

5. **App.ts inline subscriptions**: The plan claims ~35 inline `.on()` calls. Actual grep shows approximately 35 `.on()` calls in `App.ts` (across `init()` and `bindEvents()`), confirming the estimate.

6. **Existing patterns**: The plan correctly identifies that `AppSessionBridge`, `AppNetworkBridge`, and several UI components already use the `unsubscribers[]` pattern properly. The `AppSessionBridge` has a private `on()` helper method (line 298-304) that wraps `session.on()` and pushes to `this.unsubscribers` -- this is essentially a manual version of the proposed `DisposableSubscriptionManager`.

7. **EventEmitter.on() return type**: Confirmed that both `Signal.connect()` and `EventEmitter.on()` return `() => void`, so the `DisposableSubscriptionManager.add()` interface is compatible with both.

### Strengths

1. **Well-scoped problem statement**: The categorization into four categories (wiring leaks, core graph leaks, component-level patterns, DOM listener leaks) is clear and complete. The table-driven inventory of affected files makes the scope easy to audit.

2. **Incremental migration**: The phased approach (Foundation, Core wiring, Component standardization, Prevention) is pragmatic. Phase 1-2 captures the highest-value fixes, and Phase 3 is correctly marked as optional since those components already work.

3. **Compatibility with existing patterns**: The `DisposableSubscriptionManager` is essentially a formalization of the `unsubscribers: (() => void)[]` + loop-and-call pattern already proven in `AppSessionBridge`, `AppNetworkBridge`, `HistoryPanel`, and ~12 other components. This is not a novel abstraction -- it is a standardization of an established internal pattern.

4. **Correct disposal order**: The plan specifies that wiring subscriptions should be disposed _before_ component disposal in `App.dispose()`. This is critical because wiring callbacks reference component methods; disposing components first could cause callbacks to fire on disposed objects.

5. **ComputedSignal fix is necessary**: Even though `ComputedSignal` is currently only used in tests, adding `dispose()` is the right call. Without it, any future production use of `ComputedSignal` with dependencies would leak.

6. **Idempotent dispose**: The `disposed` flag and early-return guard are essential. Multiple `dispose()` calls are common in complex teardown sequences.

### Concerns

1. **The `onEvent()` convenience method has a type-safety gap.** The signature uses `(emitter: { on(event: string, cb: (data: T) => void): () => void }, event: string, callback: (data: T) => void)` with a `string` event parameter. This loses the type safety that `EventEmitter<Events>` provides through its `K extends keyof Events` constraint. In practice, callers will likely use `subs.add(emitter.on('event', handler))` directly (which preserves types) rather than `subs.onEvent(emitter, 'event', handler)`. Consider either removing `onEvent()` to avoid the false convenience, or making it generic over the emitter's event map. At minimum, document that `subs.add(emitter.on(...))` is the preferred pattern for type safety.

2. **The `connectSignal()` method has a subtle signature mismatch.** The plan defines the callback as `(value: T, oldValue: T) => void`, which matches `Signal<T>`, but `EventEmitter.on()` callbacks receive only `(data: T) => void` (single argument). This is fine since `connectSignal` is intended only for `Signal`, but the JSDoc should explicitly note that this method is for `Signal` only, not `EventEmitter`.

3. **`addDOMListener()` uses a single shared `AbortController`.** This means aborting (on dispose) cancels ALL DOM listeners at once. This is correct for the disposal use case, but there is a subtle issue: if a caller passes their own `signal` in the `options` parameter, it will be overwritten by the spread `{ ...options, signal: this.abortController.signal }`. This should either (a) merge signals using `AbortSignal.any()` (available in modern browsers), or (b) throw/warn if `options.signal` is already set. Given that `AbortSignal.any()` is not universally available and the codebase currently does not use `addEventListener` with `signal` at all (confirmed by grep), the simpler approach is to document that callers must not pass their own `signal` option.

4. **`PropertyContainer.dispose()` has a downstream impact on `IPNode`.** Adding `dispose()` to `PropertyContainer` is correct, but the plan does not address who calls it. Currently, `IPNode.dispose()` calls `disconnectAll()` on its own signals but does not call `this.properties.dispose()`. The plan should explicitly add `this.properties.dispose()` to `IPNode.dispose()`. Without this, the new `PropertyContainer.dispose()` method exists but is never invoked in the primary usage path.

5. **The `handleVideoExport` function in `AppPlaybackWiring.ts` already correctly manages its own listener lifecycle** (lines 457-458: `disposeCancelListener` and `disposeProgressListener` are called in the `finally` block at lines 561-562). The plan should note that these specific subscriptions do NOT need to be migrated to the wiring-level subscription manager, because they are scoped to the lifetime of the export operation, not the lifetime of the wiring.

6. **`viewer.setOnCropRegionChanged(callback)` in `AppEffectsWiring.ts` (line 43) is a callback-setter pattern, not an EventEmitter subscription.** It does not return an unsubscribe function. The plan's inventory says "13 pure fire-and-forget `.on()` calls" for effects wiring, but this callback-setter is a different kind of leak. To clean it up, the wiring module would need to call `viewer.setOnCropRegionChanged(null)` on dispose. The `DisposableSubscriptionManager.add()` can handle this via `subs.add(() => viewer.setOnCropRegionChanged(null))`, but the plan should explicitly call this out.

7. **Child manager lifecycle concern.** The `createChild()` method adds the child to `this.children` but provides no way to remove a child without disposing it. If a child's scope ends before the parent's (e.g., a `wirePlaylistRuntime` child that needs to be reset when the playlist is disabled), the parent would accumulate stale child references. Consider adding a `removeChild()` method or having `child.dispose()` automatically remove itself from the parent's `children` array.

### Recommended Changes

1. **Remove or retype `onEvent()`.** Either remove it entirely (since `subs.add(emitter.on('event', handler))` is one line and fully type-safe), or give it a properly generic signature:
   ```typescript
   onEvent<E extends EventMap, K extends keyof E>(
     emitter: EventEmitter<E>,
     event: K,
     callback: (data: E[K]) => void
   ): void
   ```
   The simpler option (remove it) is better, as it avoids creating a second way to do the same thing.

2. **Add `this.properties.dispose()` to `IPNode.dispose()`.** After `PropertyContainer` gains a `dispose()` method, `IPNode.dispose()` (in `/Users/lifeart/Repos/openrv-web/src/nodes/base/IPNode.ts`, line 156) should call it. Without this, the fix is incomplete for the node graph layer. The updated `IPNode.dispose()` should be:
   ```typescript
   dispose(): void {
     this.disconnectAllInputs();
     this.properties.dispose();  // NEW: clean up property->node forwarding subscriptions
     this.inputsChanged.disconnectAll();
     this.outputsChanged.disconnectAll();
     this.propertyChanged.disconnectAll();
     this.cachedImage = null;
     if (this.processor) {
       this.processor.dispose();
       this.processor = null;
     }
   }
   ```

3. **Add `Signal.disconnectAll()` to `PropertyContainer.dispose()`.** The proposed `PropertyContainer.dispose()` calls `this.propertyChanged.disconnectAll()`, which is correct. However, it should also iterate over all owned `Property` instances and call `prop.changed.disconnectAll()` to ensure no stale listeners remain on individual property signals:
   ```typescript
   dispose(): void {
     for (const unsub of this.propertyUnsubscribers.values()) {
       unsub();
     }
     this.propertyUnsubscribers.clear();
     for (const prop of this.properties.values()) {
       prop.changed.disconnectAll();
     }
     this.propertyChanged.disconnectAll();
   }
   ```

4. **Handle `setOnCropRegionChanged` in `AppEffectsWiring`.** Add an explicit nullification disposer for the callback-setter pattern:
   ```typescript
   subs.add(() => viewer.setOnCropRegionChanged(null));
   ```

5. **Prevent `options.signal` override in `addDOMListener`.** Add a guard:
   ```typescript
   addDOMListener(...): void {
     if (options?.signal) {
       throw new Error('DisposableSubscriptionManager.addDOMListener: do not pass options.signal; the manager controls the AbortController');
     }
     // ...
   }
   ```

6. **Add `removeChild()` or self-removal.** When a child is disposed independently of its parent, it should remove itself from the parent's `children` array to prevent the parent from holding a reference to the disposed child and attempting to double-dispose it:
   ```typescript
   createChild(): DisposableSubscriptionManager {
     const child = new DisposableSubscriptionManager();
     this.children.push(child);
     child._parent = this;  // back-reference for self-removal
     return child;
   }

   dispose(): void {
     if (this.disposed) return;
     this.disposed = true;
     // Self-remove from parent
     if (this._parent) {
       const idx = this._parent.children.indexOf(this);
       if (idx !== -1) this._parent.children.splice(idx, 1);
       this._parent = null;
     }
     // ... rest of dispose
   }
   ```
   Alternatively, since `dispose()` is already idempotent, the double-dispose from the parent is harmless -- but the stale reference in the parent's `children` array still prevents GC of the child's closure references until the parent is also disposed. At minimum, document this trade-off.

7. **`AppTransformWiring.ts` is missing from the plan's file inventory.** `App.ts` line 498 calls `wireTransformControls(wiringCtx)`, and `AppTransformWiring.ts` has 1 `.on()` call (line 31: `controls.transformControl.on('transformChanged', ...)`). Add this to the wiring modules table and the files-to-modify list.

### Missing Considerations

1. **`App.ts` `bindEvents()` method (starting around line 778)** contains an additional ~20 `.on()` calls that are separate from `init()`. The plan mentions "~35 inline .on() calls in App.init()" but some of these are actually in `bindEvents()`, which is called from `mount()`. The disposal strategy needs to cover both `init()` and `bindEvents()` subscriptions. This may mean the `wiringSubscriptions` manager needs to be used in both methods, or a second manager should be created for `bindEvents()`.

2. **`this.session.on('frameChanged', ...)` is subscribed to THREE times in App.ts** (lines 391, 713/implicit via bindEvents, and 1000), plus once in `AppViewWiring.ts` (line 200), plus once in `AppDCCWiring.ts` (line 120), plus once in `AppSessionBridge` (line 130), plus once in `AppPlaybackWiring.ts` (line 713 via `wirePlaylistRuntime`). That is seven separate subscriptions to the same event across different modules. While the plan correctly identifies all of these as needing tracking, it would be worth noting in the plan that the `frameChanged` event is the single most-subscribed event and any performance consideration around disposal order should account for this.

3. **`EventEmitter.removeAllListeners()` interaction.** Many components call `this.removeAllListeners()` in their own `dispose()` (confirmed in ~30 files). This clears all listeners _on that emitter_. If a wiring subscription was registered on a component that calls `removeAllListeners()` in its dispose, the wiring's unsubscribe function will be a no-op (calling `delete` on an already-cleared Set is safe). This means the disposal order concern is actually less severe than it appears -- but it also means some unsubscribe calls will be redundant. The plan should note this is harmless (idempotent `Set.delete`) rather than leaving it as an implicit assumption.

4. **No consideration of `viewer.getPerspectiveGridOverlay().on(...)` in `AppEffectsWiring.ts` (line 97).** This subscribes to a sub-object's event emitter. If the perspective grid overlay is recreated during the viewer's lifetime, the old subscription would be orphaned. The `DisposableSubscriptionManager` would correctly track this, but only if the overlay object is stable for the app's lifetime. Worth documenting this assumption.

5. **The ESLint rule in Step 7 would produce many false positives.** Patterns like `emitter.on('event', handler)` where the emitter is a local/short-lived object (e.g., the `ExportProgressDialog` in `handleVideoExport`) do not need tracked unsubscribe handles because both the emitter and subscriber share the same scope lifetime. The ESLint rule would flag these. Consider scoping the rule to only flag `.on()` calls on constructor-injected or class-field dependencies (i.e., long-lived objects), or provide a `// eslint-disable` annotation convention for intentional short-lived subscriptions.

6. **The plan does not mention `once()`.** `EventEmitter` has a `once()` method that auto-unsubscribes after the first emission. If any of the wiring subscriptions should logically be `once()` instead of `on()`, they would not need tracking. A quick audit of the wiring modules shows all subscriptions are intended to be persistent (not one-shot), so this is not a practical issue, but it is worth noting in the migration guide that `once()` subscriptions do not need to be tracked.

---

## QA Review -- Round 1

### Verdict: APPROVE WITH CHANGES

The plan is architecturally sound, the problem inventory is accurate, and the `DisposableSubscriptionManager` is a well-grounded abstraction. The existing codebase already has strong disposal test patterns (HistoryPanel: 8 tests, AppNetworkBridge: 9 tests) that serve as templates. The concerns below focus on leak detection testability, regression safety, and one infeasible proposal (ESLint).

### Test Coverage Assessment

**Current disposal test coverage is bifurcated.** Components that already manage subscriptions (`HistoryPanel`, `AppNetworkBridge`, `AppSessionBridge`) have thorough disposal tests. Everything else -- the 6 wiring modules, `ComputedSignal`, `PropertyContainer`, and `App.ts` itself -- has zero disposal test coverage.

Specifically:

| Area | Existing Disposal Tests | Gap |
|------|------------------------|-----|
| `Signal` (connect/disconnect/emit/disconnectAll/hasConnections) | 13 tests | None -- well covered |
| `ComputedSignal` (compute, cache, dependencies) | 5 tests | No `dispose()` test (method does not yet exist) |
| `PropertyContainer` (add/get/set/reset/JSON/propertyChanged) | 12 tests | No `dispose()` test (method does not yet exist) |
| `EventEmitter` (on/off/emit/once/removeAllListeners) | 16 tests | None -- well covered |
| `HistoryPanel` disposal | 8 tests (HP-020 to HP-025, HP-043, HP-044) | None -- gold standard pattern |
| `AppNetworkBridge` disposal | 9 tests (ANB-020 to ANB-031, ANB-092) | None -- gold standard pattern |
| `AppColorWiring` | Tests exist but 0 disposal tests | Full gap |
| `AppViewWiring` | Tests exist but 0 disposal tests | Full gap |
| `AppEffectsWiring` | Tests exist but 0 disposal tests | Full gap |
| `AppPlaybackWiring` | Tests exist, 0 disposal tests (3 refs to dispose are for ExportProgressDialog, not wiring) | Full gap |
| `AppStackWiring` | Tests exist but 0 disposal tests | Full gap |
| `AppDCCWiring` (via AppWiringFixes.test.ts) | Tests exist but 0 disposal tests | Full gap |
| `AppTransformWiring` | No test file at all | Full gap (also missing from plan) |
| `App.dispose()` | No integration test | Full gap |

**Signal.hasConnections is the key observability hook for leak detection testing.** The `Signal` class exposes `hasConnections` (checks `callbacks.size > 0`). This is the only introspection mechanism in the codebase for verifying cleanup. `EventEmitter` has NO equivalent property -- there is no `hasListeners()`, `listenerCount()`, or `listeners` accessor. This creates an asymmetry: you can verify Signal cleanup but not EventEmitter cleanup.

**Recommendation:** Before Phase 2 begins, add a `listenerCount(event?: K): number` method (or at minimum `hasListeners(event?: K): boolean`) to `EventEmitter`. Without this, wiring disposal tests must rely on indirect observation (emit an event and check that a mock was NOT called), which is more fragile than directly asserting `emitter.hasListeners('frameChanged') === false`. The HistoryPanel and AppNetworkBridge tests already use the indirect pattern successfully, so this is not a blocker, but it would significantly improve test confidence.

### Risk Assessment

**Phase 1 risk is minimal.** Adding `dispose()` to `ComputedSignal` and subscription tracking to `PropertyContainer` are purely additive changes. The existing 5 `ComputedSignal` tests and 12 `PropertyContainer` tests establish a behavioral baseline that will catch any inadvertent breakage.

**Phase 2 risk is the primary concern.** The six wiring modules contain ~83 `.on()` calls that must each be individually wrapped with `subs.add(...)`. This is a mechanical transformation, but:
- There are zero existing disposal tests across all wiring modules. If a wrap is accidentally omitted, no test catches it.
- The wiring modules fire side effects (e.g., `viewer.setColorAdjustments`, `sessionBridge.scheduleUpdateScopes`) through closures. If the `subs.add()` wrapping changes the execution timing or order in any way (it should not, but...), subtle behavioral changes could occur.
- The `App.dispose()` integration is the riskiest single change: inserting `this.wiringSubscriptions.dispose()` at the top of a method that then proceeds to dispose ~20 components. If any wiring callback fires during the tear-down cascade (between wiring disposal and component disposal), the callback would hit an already-unsubscribed-but-not-yet-disposed component. In practice this is safe because `Signal.disconnect` and `EventEmitter.off` prevent further invocation, but the plan should include an explicit integration test for this.

**Phase 3 risk is low but scope is underestimated.** The plan lists 3 components using `boundOnThemeChange`, but the actual count is 16 files. The 13 additional files are: `CurveEditor`, `Waveform`, `MarkerListPanel`, `ColorWheels`, `Histogram`, `ThemeControl`, `Viewer`, `NotePanel`, `Timeline`, `Vectorscope`, `GamutDiagram`, `FalseColorControl`, `HSLQualifierControl`. Several of these (FalseColorControl, HSLQualifierControl) also appear in the `unsubscribers[]` list, meaning they use BOTH patterns simultaneously. Migration must handle the combination correctly.

### Recommended Test Additions

**Priority 1 -- Must have before implementation starts:**

1. **`ComputedSignal.dispose()` tests** (add to `src/core/graph/Signal.test.ts`):
   - Dependency signal emission after `dispose()` does NOT recompute and does NOT emit `changed`.
   - `changed.hasConnections` returns false after `dispose()`.
   - `dispose()` is idempotent (calling twice does not throw).
   - `.value` after `dispose()` returns the last cached value without recomputing.
   - `dispose()` on a zero-dependency ComputedSignal is safe.

2. **`PropertyContainer.dispose()` tests** (add to `src/core/graph/Property.test.ts`):
   - After `dispose()`, setting a property value does NOT emit on `propertyChanged`.
   - `propertyChanged.hasConnections` returns false after `dispose()`.
   - `dispose()` is idempotent.
   - Individual property `changed` signals remain functional after container disposal (the property itself is not destroyed, only the forwarding subscription is severed -- OR document that all property signals are also cleared).
   - Re-adding a property with the same name after a previous `add()` does not leak the old forwarding subscription.

3. **`DisposableSubscriptionManager` unit tests** (new file `src/utils/DisposableSubscriptionManager.test.ts`):
   - The 9 cases listed in the plan, plus:
   - Error in one disposer does not prevent remaining disposers from running (the code has try/catch; test it).
   - Child disposal does NOT dispose the parent.
   - Integration test with a real `Signal`: `subs.add(signal.connect(cb))` -> `subs.dispose()` -> verify `signal.hasConnections === false`.
   - Integration test with a real `EventEmitter`: `subs.add(emitter.on('event', cb))` -> `subs.dispose()` -> verify callback no longer fires.

**Priority 2 -- Must have during Phase 2:**

4. **Wiring disposal tests** (one per wiring module, following the pattern shown in the plan at lines 557-575):
   - Create mock context, call wire function, verify callback fires, dispose, verify callback no longer fires.
   - At minimum, test the first and last `.on()` call in each module to verify both are tracked.
   - For `AppPlaybackWiring`, additionally test that nested `wirePlaylistRuntime` subscriptions are disposed.

5. **App.dispose() integration test**:
   - Verify that after `App.dispose()`, emitting `session.on('frameChanged', ...)` does NOT trigger any wiring callback.
   - This may require a simplified App construction (mock dependencies) rather than full App instantiation.

**Priority 3 -- Phase 4 (leak detection framework):**

6. **Leak detection utility**: The plan proposes `getGlobalSubscriptionCount()` which does not exist and would require a global registry. A more practical approach:
   - Add `EventEmitter.listenerCount(event?: K): number` that returns `this.listeners.get(event)?.size ?? 0` (or total across all events if no event specified).
   - Write a test helper: `assertNoActiveListeners(emitter: EventEmitter, events: string[])` that checks `listenerCount === 0` for each event.
   - Write a test helper: `assertNoActiveConnections(signal: Signal<any>)` that checks `signal.hasConnections === false`.
   - These instance-level checks are more useful than global counts because they identify the specific leaking object.

### Migration Safety

- **TypeScript strict mode with `noUnusedLocals`** will catch the case where someone assigns the unsubscribe handle to a variable but never uses it. However, it will NOT catch the case where the return value of `.on()` is silently discarded (which is the entire problem). TypeScript does not flag unused return values. This confirms that the ESLint rule or CI check is needed for prevention.

- **The existing 7600+ test suite is the primary safety net.** All wiring tests verify that callbacks fire correctly, so any accidental breakage of the subscription wiring itself (rather than the disposal) will be caught. The gap is exclusively in disposal testing.

- **jsdom + AbortController works.** Confirmed: `AbortController` is available in the jsdom test environment (used in 3 existing test files). The `addDOMListener()` method will work in tests.

- **No ESLint means no automated prevention today.** This is acceptable for Phases 1-3 (fix the leaks), but the plan's Phase 4 ESLint proposal is not feasible without a significant new dependency. See Concerns below.

### Concerns

1. **ESLint rule proposal is not feasible as written.** The project has zero ESLint infrastructure -- no `eslint` package, no config files, no plugins. Adding ESLint (plus `@typescript-eslint/parser`, a custom plugin, etc.) is a nontrivial dependency addition that is orthogonal to the memory leak fix. **Recommendation:** Replace Step 7 with a simpler CI check -- a grep-based script that searches for `\.on\(` and `\.connect\(` patterns as standalone statements (no assignment target). Example:
   ```bash
   # In CI, flag potential subscription leaks
   grep -rn '^\s*[a-zA-Z_].*\.on(' src/ --include='*.ts' | grep -v 'subs\.\|unsub\|\/\/' | head -20
   ```
   This is imprecise but catches the most obvious cases and requires no new dependencies. Alternatively, defer automated prevention entirely and rely on code review conventions.

2. **Leak detection testing has a practical ceiling.** True memory leak detection (proving that objects are garbage-collected) requires `WeakRef` and `FinalizationRegistry`, which are available in V8 but their GC timing is nondeterministic. The plan's `expectNoLeakedSubscriptions` utility (counting active listeners) is a proxy for leak detection, not actual GC verification. This is the right approach for a deterministic test suite -- but it should be clearly documented that it verifies subscription cleanup, not actual memory reclamation. A leaked closure that captures heavyweight objects will only be GC-eligible after unsubscription, but unsubscription alone does not guarantee collection (circular references, etc.). For practical purposes in this codebase, subscription cleanup IS sufficient to prevent the described leaks.

3. **The plan's test count target of "15-20 new test cases" is conservative.** Based on the breakdown above:
   - ComputedSignal.dispose: 5 tests
   - PropertyContainer.dispose: 5 tests
   - DisposableSubscriptionManager: 12+ tests
   - Wiring module disposal (7 modules x 2 tests each): 14 tests
   - App.dispose integration: 1-2 tests
   - Total: ~37-39 tests
   Recommend updating the target to "at least 35 new test cases."

4. **`ComputedSignal.value` getter after `dispose()` needs protection.** Currently, accessing `.value` when `dirty === true` calls `this.compute()`. If `dispose()` is called while `dirty` is true (which can happen if a dependency fires between the last `.value` access and `dispose()`), a subsequent `.value` access will recompute using potentially stale or disposed dependencies. The `dispose()` method should set `this.dirty = false` to freeze the cached value, preventing any further recomputation. The Expert Review mentions this but it warrants emphasis as a correctness requirement, not just a nice-to-have.

5. **No `remove()` on `PropertyContainer` means `add()` overwrites are a leak.** If `container.add({ name: 'foo', ... })` is called twice, the second call overwrites the property in the `Map`, but the first property's `changed.connect(...)` forwarding subscription survives (the old `Property` instance is still connected to `propertyChanged`). The proposed `propertyUnsubscribers` Map will correctly overwrite the key, causing the old unsubscribe handle to be lost. **This is a new leak introduced by the plan if not handled.** The `add()` method must check for an existing entry and call the old unsubscriber before creating the new one:
   ```typescript
   add<T>(info: PropertyInfo<T>): Property<T> {
     // Clean up old subscription if re-adding same name
     const existingUnsub = this.propertyUnsubscribers.get(info.name);
     if (existingUnsub) existingUnsub();
     // ... rest of add
   }
   ```

6. **The `boundOnThemeChange` scope is 16 files, not 3.** As noted in Risk Assessment, the migration scope for Phase 3 is significantly larger than documented. If Phase 3 is intended to be incremental, the plan should explicitly list which files are in-scope for the initial pass and which are deferred.
