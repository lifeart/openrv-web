/**
 * OutsideClickRegistry
 *
 * Centralized "click outside to dismiss" handler used by popovers, dropdowns,
 * settings menus, and other dismissable overlays.
 *
 * Why this exists
 * ---------------
 * Many UI components historically registered their own
 * `document.addEventListener('mousedown' | 'click', ...)` handler to dismiss
 * themselves when the user clicked outside. With dozens of such components in
 * the app, every open popover added a fresh global listener, and any missed
 * cleanup leaked listeners and produced "zombie" dismiss callbacks holding
 * references to disposed components.
 *
 * This module owns ONE listener per event type (`mousedown`, `click`, `keydown`)
 * for the lifetime of the page and dispatches dismiss events to registered
 * consumers based on the target element.
 *
 * Behavior
 * --------
 * Each consumer calls `register({ elements, onDismiss, dismissOn? })`:
 *   - `elements`: HTMLElements considered "inside" — typically the trigger
 *     button plus the body-level dropdown/popover. A click on any of these is
 *     NOT a dismiss.
 *   - `onDismiss`: called when a click lands outside all `elements`.
 *   - `dismissOn`: which event triggers dismiss; defaults to `'mousedown'` to
 *     match the most common pre-existing pattern (fires before `click`, so
 *     the popover closes before the click reaches the outside element).
 *
 * Returns a deregister function. Call it when the popover closes or when the
 * component is disposed. It is safe to call more than once.
 *
 * Capture-phase semantics
 * -----------------------
 * The internal listeners are attached with `useCapture: true`. This is a
 * deliberate semantic change from the pre-existing per-component bubble-phase
 * handlers and is NOT just a defensive default. Consequences:
 *   - The registry sees every event before bubble-phase listeners on
 *     descendants run.
 *   - A descendant calling `event.stopPropagation()` or even
 *     `event.stopImmediatePropagation()` in the bubble phase CANNOT prevent
 *     the registry from processing the event. The registry has already run by
 *     the time bubble-phase listeners execute.
 *   - To suppress dismiss for a specific click, deregister the registration
 *     before the event fires (or include the relevant element in `elements`)
 *     — do NOT rely on stopPropagation.
 *
 * Nesting
 * -------
 * Registrations are stored in LIFO order (most recently opened first).
 * On each event we walk from innermost to outermost:
 *   - If the target is inside any of a registration's `elements`, we STOP
 *     walking. That registration and any registrations registered before it
 *     (outer) are considered "safe" and are not dismissed.
 *   - Otherwise we mark that registration for dismissal and continue.
 *
 * This mirrors what users expect: clicking an inner popover dismisses neither
 * itself nor its ancestors; clicking outside everything dismisses all open
 * popovers.
 *
 * Escape handling
 * ---------------
 * The Escape key dismisses ONLY the innermost (most recently registered)
 * registration that opted into Escape handling — matching native modal/menu
 * behavior on every other platform. Each layer eats its own Escape.
 *
 * Re-entrant register/deregister during dispatch
 * ----------------------------------------------
 *   - A `register()` call made from inside an `onDismiss` callback (or any
 *     other listener fired during dispatch) takes effect immediately for
 *     FUTURE events but is NOT considered for the in-flight event. Dispatch
 *     iterates over a snapshot taken before any callback runs.
 *   - A `deregister()` call made from inside a callback prevents the
 *     deregistered entry's `onDismiss` from being invoked even if the entry
 *     was already in the snapshot for the current event. This preserves the
 *     intuitive contract: "if I deregister, my `onDismiss` won't be called."
 *
 * Lifecycle safety
 * ----------------
 * Dismissing a registration automatically removes it from the registry, so a
 * dismissed callback is never invoked twice. Callbacks that throw are caught
 * and reported via console.error so one buggy consumer does not break others.
 */

export type OutsideClickEventType = 'mousedown' | 'click';

export interface OutsideClickRegistration {
  /**
   * Elements that are "inside" the popover. A pointer event whose target is
   * inside any of these elements will NOT trigger `onDismiss`.
   *
   * Typically this is `[triggerButton, popoverElement]`. Pass an empty array
   * to dismiss on every outside event (rarely useful).
   *
   * Footgun: if the trigger button toggles the popover via a `click`
   * listener, you MUST include the trigger element here. Otherwise the click
   * sequence on the trigger is:
   *   1. `mousedown` on trigger → registry sees target outside `elements`
   *      → fires `onDismiss` → popover closes.
   *   2. `click` on trigger → trigger's toggle handler runs → popover
   *      reopens.
   * The user perceives the popover as "uncloseable by clicking the trigger."
   * Including the trigger in `elements` makes step 1 a no-op so the click
   * cleanly toggles closed.
   */
  elements: ReadonlyArray<Element | null | undefined>;

  /**
   * Called when a pointer event lands outside all `elements`. The registration
   * is automatically deregistered immediately before this is invoked, so
   * `onDismiss` is guaranteed to be called at most once for the lifetime of
   * the registration.
   */
  onDismiss: () => void;

  /**
   * Which pointer event triggers dismiss.
   *
   * - `'mousedown'` (default): fires BEFORE `click`. Matches the existing
   *   settings-menu pattern. Dismisses the popover before the outside element
   *   receives its click. Preferred for menus where the popover should close
   *   on the press, not the release.
   * - `'click'`: fires after the full press+release. Use when the trigger
   *   button itself toggles the popover via a `click` listener — listening to
   *   `mousedown` would race with the toggle.
   */
  dismissOn?: OutsideClickEventType;

  /**
   * If true, pressing Escape (when this is the innermost registration) calls
   * `onDismiss`. Default: true.
   */
  dismissOnEscape?: boolean;
}

/**
 * Returned from `register`. Call to remove the registration. Idempotent —
 * calling more than once is a no-op.
 */
export type OutsideClickDeregister = () => void;

interface InternalEntry {
  id: number;
  elements: ReadonlyArray<Element | null | undefined>;
  onDismiss: () => void;
  dismissOn: OutsideClickEventType;
  dismissOnEscape: boolean;
  /**
   * Set to true when the entry's deregister function is invoked, OR when the
   * entry is removed during dispatch. Checked between snapshot iteration and
   * callback invocation so that a callback that deregisters a peer prevents
   * the peer's `onDismiss` from being called for the same in-flight event.
   */
  deregistered: boolean;
}

/**
 * Centralized outside-click registry. Use the exported singleton
 * `outsideClickRegistry` for the application instance, or instantiate this
 * class directly in tests.
 */
export class OutsideClickRegistry {
  /** Most recently registered first (LIFO). */
  private entries: InternalEntry[] = [];
  private nextId = 1;
  private listenersAttached = false;

  // Bound handlers so add/remove use the same identity.
  private readonly boundMousedown = (e: MouseEvent): void => this.handlePointerEvent(e, 'mousedown');
  private readonly boundClick = (e: MouseEvent): void => this.handlePointerEvent(e, 'click');
  private readonly boundKeydown = (e: KeyboardEvent): void => this.handleKeydown(e);

  /**
   * Register a popover for outside-click dismiss handling.
   * Returns a function that, when called, removes the registration.
   */
  register(registration: OutsideClickRegistration): OutsideClickDeregister {
    const entry: InternalEntry = {
      id: this.nextId++,
      elements: registration.elements,
      onDismiss: registration.onDismiss,
      dismissOn: registration.dismissOn ?? 'mousedown',
      dismissOnEscape: registration.dismissOnEscape ?? true,
      deregistered: false,
    };
    // Insert at front: most recently registered = innermost.
    // Note: if a callback fired during dispatch calls `register()`, the new
    // entry is added here but is NOT visible to the in-flight event because
    // `handlePointerEvent` iterates over a snapshot taken before any callback
    // ran. The new entry will participate in subsequent events.
    this.entries.unshift(entry);
    this.ensureListenersAttached();

    return () => {
      if (entry.deregistered) return;
      entry.deregistered = true;
      this.removeEntry(entry.id);
    };
  }

  /**
   * Returns the current number of active registrations. Useful for tests and
   * leak detection.
   */
  getRegistrationCount(): number {
    return this.entries.length;
  }

  /**
   * Remove all registrations and detach global listeners. Primarily for tests
   * — production code should rely on per-registration deregister functions.
   */
  reset(): void {
    this.entries = [];
    this.detachListeners();
  }

  private ensureListenersAttached(): void {
    if (this.listenersAttached) return;
    if (typeof document === 'undefined') return;
    // Capture-phase (`useCapture: true`) is a deliberate semantic change from
    // the per-component bubble-phase handlers this registry replaced. It
    // means the registry observes every event before any descendant
    // bubble-phase handler runs, and a descendant calling
    // `event.stopPropagation()` or `event.stopImmediatePropagation()` in the
    // bubble phase CANNOT block the registry. Consumers must not rely on
    // stopPropagation to suppress dismiss; instead, deregister beforehand or
    // include the relevant element in `elements`.
    document.addEventListener('mousedown', this.boundMousedown, true);
    document.addEventListener('click', this.boundClick, true);
    document.addEventListener('keydown', this.boundKeydown, true);
    this.listenersAttached = true;
  }

  private detachListeners(): void {
    if (!this.listenersAttached) return;
    if (typeof document === 'undefined') return;
    document.removeEventListener('mousedown', this.boundMousedown, true);
    document.removeEventListener('click', this.boundClick, true);
    document.removeEventListener('keydown', this.boundKeydown, true);
    this.listenersAttached = false;
  }

  private removeEntry(id: number): void {
    const idx = this.entries.findIndex((e) => e.id === id);
    if (idx >= 0) this.entries.splice(idx, 1);
    if (this.entries.length === 0) {
      this.detachListeners();
    }
  }

  private isTargetInside(target: EventTarget | null, elements: ReadonlyArray<Element | null | undefined>): boolean {
    if (!(target instanceof Node)) return false;
    for (const el of elements) {
      if (el && el.contains(target)) return true;
    }
    return false;
  }

  private safeInvoke(fn: () => void): void {
    try {
      fn();
    } catch (err) {
      // Don't let one buggy consumer break the whole registry.
      // eslint-disable-next-line no-console
      console.error('[OutsideClickRegistry] dismiss callback threw:', err);
    }
  }

  private handlePointerEvent(event: MouseEvent, type: OutsideClickEventType): void {
    if (this.entries.length === 0) return;

    // Walk LIFO (innermost first). Collect entries to dismiss until we hit
    // an entry whose elements contain the target — that entry and all outer
    // entries are safe.
    const toDismiss: InternalEntry[] = [];
    // Iterate over a snapshot — `onDismiss` may register/deregister others.
    // Re-entrant `register()` calls during dispatch are NOT visible here; the
    // new entries land in `this.entries` but not in this snapshot.
    const snapshot = this.entries.slice();
    for (const entry of snapshot) {
      if (this.isTargetInside(event.target, entry.elements)) {
        // Target is inside this registration. This and any earlier (outer)
        // registrations are not dismissed.
        break;
      }
      // Only dismiss entries that opted into this event type.
      if (entry.dismissOn === type) {
        toDismiss.push(entry);
      }
      // If the entry uses a different event type but target is outside, we
      // still continue walking — outer registrations may still need to fire.
    }

    if (toDismiss.length === 0) return;

    // Remove the to-dismiss entries from the registry array first, so any
    // `register`/`deregister` calls made from inside callbacks see a
    // consistent state and `getRegistrationCount()` is accurate during
    // callbacks.
    //
    // We do NOT set `entry.deregistered` here — that flag belongs to the
    // deregister closure. A callback that calls a peer's deregister function
    // will flip that peer's `deregistered` flag, and the invocation loop
    // below will then skip the peer's `onDismiss`. This honors the contract:
    // "if I deregister, my onDismiss won't be called."
    for (const entry of toDismiss) {
      this.removeEntry(entry.id);
    }
    for (const entry of toDismiss) {
      // Skip entries whose deregister was invoked before we got to them in
      // this dispatch (either by a peer callback or by external code racing
      // with the event). This is the "deregister wins over in-flight
      // dismiss" contract.
      if (entry.deregistered) continue;
      // Mark deregistered now so a callback calling our own deregister
      // closure during onDismiss is a no-op rather than re-firing.
      entry.deregistered = true;
      this.safeInvoke(entry.onDismiss);
    }
  }

  private handleKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Escape') return;
    if (this.entries.length === 0) return;

    // Escape dismisses the innermost registration that opted in.
    const innermost = this.entries.find((e) => e.dismissOnEscape);
    if (!innermost) return;

    this.removeEntry(innermost.id);
    if (innermost.deregistered) return;
    innermost.deregistered = true;
    this.safeInvoke(innermost.onDismiss);
  }
}

/**
 * Application-wide singleton. Components should use this directly:
 *
 * ```ts
 * const deregister = outsideClickRegistry.register({
 *   elements: [this.button, this.popover],
 *   onDismiss: () => this.close(),
 * });
 * // …later, on close or dispose:
 * deregister();
 * ```
 */
export const outsideClickRegistry = new OutsideClickRegistry();
