/**
 * Callback interface for ABCompareManager to notify Session of changes
 * without importing Session (avoids circular deps).
 */
export interface ABCompareManagerCallbacks {
  onABSourceChanged(info: { current: 'A' | 'B'; sourceIndex: number }): void;
}

/**
 * ABCompareManager owns A/B source comparison state and operations:
 * - Source A and B index tracking
 * - Current A/B selection
 * - Sync playhead toggle
 * - Toggle / switch between A and B sources
 * - Auto-assignment of source B on second source load
 *
 * State is owned by this manager. Session delegates to it.
 * The manager does NOT own or modify the sources array -- it only
 * tracks indices and notifies the parent when switching is needed.
 */
export class ABCompareManager {
  private _sourceAIndex = 0;
  private _sourceBIndex = -1; // -1 means no B source assigned
  private _sourceCIndex = -1; // -1 means no C source assigned
  private _sourceDIndex = -1; // -1 means no D source assigned
  private _currentAB: 'A' | 'B' = 'A';
  private _syncPlayhead = true;
  private _callbacks: ABCompareManagerCallbacks | null = null;

  /**
   * Set the callbacks object. Called once by Session after construction.
   */
  setCallbacks(callbacks: ABCompareManagerCallbacks): void {
    this._callbacks = callbacks;
  }

  // ---- Getters ----

  /**
   * Get the current A/B state
   */
  get currentAB(): 'A' | 'B' {
    return this._currentAB;
  }

  /**
   * Get source A index
   */
  get sourceAIndex(): number {
    return this._sourceAIndex;
  }

  /**
   * Get source B index (-1 if not assigned)
   */
  get sourceBIndex(): number {
    return this._sourceBIndex;
  }

  /**
   * Get source C index (-1 if not assigned)
   */
  get sourceCIndex(): number {
    return this._sourceCIndex;
  }

  /**
   * Get source D index (-1 if not assigned)
   */
  get sourceDIndex(): number {
    return this._sourceDIndex;
  }

  /**
   * Check if A/B compare is available (B source assigned and valid)
   */
  isAvailable(sourceCount: number): boolean {
    return this._sourceBIndex >= 0 && this._sourceBIndex < sourceCount;
  }

  /**
   * Get or set sync playhead mode
   */
  get syncPlayhead(): boolean {
    return this._syncPlayhead;
  }

  set syncPlayhead(value: boolean) {
    this._syncPlayhead = value;
  }

  // ---- Source index resolution ----

  /**
   * Get the source index for the current A/B selection.
   * Returns sourceAIndex or sourceBIndex depending on currentAB.
   */
  get activeSourceIndex(): number {
    return this._currentAB === 'A' ? this._sourceAIndex : this._sourceBIndex;
  }

  // ---- Mutation operations ----

  /**
   * Called when a new source is added. Auto-assigns source B when second source is added.
   * Returns the adjusted current source index (keeps A visible on second load).
   */
  onSourceAdded(sourceCount: number): { currentSourceIndex: number; emitEvent: boolean } {
    // Auto-assign source B when second source is loaded
    if (sourceCount === 2 && this._sourceBIndex === -1) {
      this._sourceBIndex = 1; // Second source becomes B
      this._sourceAIndex = 0; // First source is A

      return {
        // Keep showing source A (stay on first source) for consistent A/B compare UX
        currentSourceIndex: this._sourceAIndex,
        emitEvent: true,
      };
    }
    return { currentSourceIndex: sourceCount - 1, emitEvent: false };
  }

  /**
   * Set source A by index
   */
  setSourceA(index: number, sourceCount: number): void {
    if (index >= 0 && index < sourceCount && index !== this._sourceAIndex) {
      this._sourceAIndex = index;
    }
  }

  /**
   * Set source B by index
   */
  setSourceB(index: number, sourceCount: number): void {
    if (index >= 0 && index < sourceCount && index !== this._sourceBIndex) {
      this._sourceBIndex = index;
    }
  }

  /**
   * Clear source B assignment.
   * Returns true if we were on B and need to switch to A.
   */
  clearSourceB(): boolean {
    this._sourceBIndex = -1;
    if (this._currentAB === 'B') {
      this._currentAB = 'A';
      return true; // Caller should switch to source A
    }
    return false;
  }

  /**
   * Set source C by index (for quad view).
   */
  setSourceC(index: number, sourceCount: number): void {
    if (index >= 0 && index < sourceCount && index !== this._sourceCIndex) {
      this._sourceCIndex = index;
    }
  }

  /**
   * Set source D by index (for quad view).
   */
  setSourceD(index: number, sourceCount: number): void {
    if (index >= 0 && index < sourceCount && index !== this._sourceDIndex) {
      this._sourceDIndex = index;
    }
  }

  /**
   * Clear source C assignment.
   */
  clearSourceC(): void {
    this._sourceCIndex = -1;
  }

  /**
   * Clear source D assignment.
   */
  clearSourceD(): void {
    this._sourceDIndex = -1;
  }

  /**
   * Check if quad view is available (all four sources assigned and valid).
   */
  isQuadAvailable(sourceCount: number): boolean {
    return (
      this._sourceBIndex >= 0 && this._sourceBIndex < sourceCount &&
      this._sourceCIndex >= 0 && this._sourceCIndex < sourceCount &&
      this._sourceDIndex >= 0 && this._sourceDIndex < sourceCount
    );
  }

  /**
   * Get the source index for a given ABCD label.
   * Returns -1 if not assigned.
   */
  getSourceIndex(label: 'A' | 'B' | 'C' | 'D'): number {
    switch (label) {
      case 'A': return this._sourceAIndex;
      case 'B': return this._sourceBIndex;
      case 'C': return this._sourceCIndex;
      case 'D': return this._sourceDIndex;
    }
  }

  /**
   * Toggle between A and B sources.
   * Returns toggle result with the new source index to switch to,
   * and whether sync playhead frame should be restored.
   * Returns null if A/B compare is not available.
   */
  toggle(sourceCount: number): {
    newSourceIndex: number;
    shouldRestoreFrame: boolean;
  } | null {
    if (!this.isAvailable(sourceCount)) return null;

    const shouldRestoreFrame = this._syncPlayhead;

    if (this._currentAB === 'A') {
      this._currentAB = 'B';
      return { newSourceIndex: this._sourceBIndex, shouldRestoreFrame };
    } else {
      this._currentAB = 'A';
      return { newSourceIndex: this._sourceAIndex, shouldRestoreFrame };
    }
  }

  /**
   * Set current A/B state directly.
   * Returns true if a toggle should be performed.
   */
  shouldToggle(ab: 'A' | 'B', sourceCount: number): boolean {
    if (ab === this._currentAB) return false;
    if (ab === 'B' && !this.isAvailable(sourceCount)) return false;
    return true;
  }

  /**
   * Emit A/B source changed event with current state.
   */
  emitChanged(currentSourceIndex: number): void {
    this._callbacks?.onABSourceChanged({
      current: this._currentAB,
      sourceIndex: currentSourceIndex,
    });
  }

  /**
   * Check if a specific source index is currently source B
   */
  isSourceB(index: number): boolean {
    return this._sourceBIndex === index;
  }

  dispose(): void {
    this._callbacks = null;
  }
}
