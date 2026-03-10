/**
 * AppKeyboardHandler - Extracted keyboard shortcut management from App
 *
 * Handles keyboard shortcut registration, refresh, display dialogs,
 * custom key bindings management, and key binding prompts.
 */

import type { KeyboardManager, KeyCombination } from './utils/input/KeyboardManager';
import { DEFAULT_KEY_BINDINGS, describeKeyCombo } from './utils/input/KeyBindings';
import type { CustomKeyBindingsManager } from './utils/input/CustomKeyBindingsManager';
import { showModal } from './ui/components/shared/Modal';

/**
 * Context interface for what AppKeyboardHandler needs from App.
 * App provides the mapping of action names to handler functions
 * and access to the container for modals.
 */
export interface KeyboardHandlerContext {
  /** Returns the record of action names to handler functions */
  getActionHandlers(): Record<string, () => void>;
  /** Returns the container element for modals */
  getContainer(): HTMLElement;
}

export class AppKeyboardHandler {
  private keyboardManager: KeyboardManager;
  private customKeyBindingsManager: CustomKeyBindingsManager;
  private context: KeyboardHandlerContext;

  /**
   * Actions whose *default* combos conflict with higher-priority global shortcuts.
   * These are only registered when the user has set a custom (non-conflicting) combo.
   */
  private static readonly CONTEXTUAL_DEFAULTS = new Set([
    'paint.line', // L key - handled by playback.faster
    'paint.rectangle', // R key - handled by timeline.resetInOut
    'paint.ellipse', // O key - handled by timeline.setOutPoint
    'paint.textBold', // Ctrl+B - paint context only; avoid global registration
    'paint.textItalic', // Ctrl+I - paint context only; conflicts with color.toggleInversion globally
    'paint.textUnderline', // Ctrl+U - paint context only; avoid global registration
    'navigation.gotoFrame', // G key - handled with paint/panel context variants
    'paint.toggleGhost', // G key - handled with global/panel context variants
    'panel.gamutDiagram', // G key - handled with global/paint context variants
    'view.fitToHeight', // H key - handled with global/panel context variants (fitToHeight global, histogram panel)
    'panel.histogram', // H key - handled with global/panel context variants (fitToHeight global, histogram panel)
    'channel.red', // Shift+R is reserved for transform.rotateLeft
    'channel.blue', // Shift+B is reserved for view.cycleBackgroundPattern
    'channel.none', // Shift+N is reserved for network.togglePanel
    'view.fitToWidth', // W key - handled with global/panel context variants (fitToWidth global, waveform panel)
    'panel.waveform', // W key - handled with global/panel context variants (fitToWidth global, waveform panel)
    'channel.luminance', // Shift+L - handled with viewer/panel context (luminance channel) vs global (LUT panel)
    'lut.togglePanel', // Shift+L - handled with global context (LUT panel) vs viewer/panel (luminance channel)
  ]);
  private static readonly HIDDEN_DEFAULTS = new Set([
    'view.toggleWaveform', // W key - legacy duplicate of panel.waveform
    'notes.addNote', // N key - handled by view.toggleFilterMode
  ]);

  constructor(
    keyboardManager: KeyboardManager,
    customKeyBindingsManager: CustomKeyBindingsManager,
    context: KeyboardHandlerContext,
  ) {
    this.keyboardManager = keyboardManager;
    this.customKeyBindingsManager = customKeyBindingsManager;
    this.context = context;
  }

  /**
   * Initial setup of keyboard shortcuts.
   * Called once during initialization.
   */
  setup(): void {
    this.registerKeyboardShortcuts();
  }

  /**
   * Refresh keyboard shortcuts by clearing and re-registering all bindings.
   * Called when custom key bindings change.
   */
  refresh(): void {
    // Clear existing bindings to prevent duplicates and memory leaks
    this.keyboardManager.clearAll();
    // Re-register all shortcuts with updated combos
    this.registerKeyboardShortcuts();
  }

  /**
   * Register all keyboard shortcuts using effective combos (custom or default).
   * The action handlers are obtained from the context (App).
   */
  private registerKeyboardShortcuts(): void {
    const actionHandlers = this.context.getActionHandlers();

    // Register all keyboard shortcuts using effective combos (custom or default)
    for (const [action, defaultBinding] of Object.entries(DEFAULT_KEY_BINDINGS)) {
      const handler = actionHandlers[action];
      if (!handler) continue;

      // Use effective combo if custom key bindings manager is available, otherwise use default
      const effectiveCombo = this.customKeyBindingsManager
        ? this.customKeyBindingsManager.getEffectiveCombo(action)
        : (() => {
            const { description: _, ...combo } = defaultBinding;
            return combo as KeyCombination;
          })();

      // Skip conflicting defaults only when still using the default combo
      if (this.skipsDirectRegistration(action)) {
        continue;
      }

      this.keyboardManager.register(effectiveCombo, handler, defaultBinding.description);
    }
  }

  /**
   * Show the custom key bindings management dialog.
   * Renders the list of actions with their current key bindings inline.
   *
   * TODO(#57): This inline rebind table doesn't expose the full ShortcutEditor
   * capabilities (Export, Import, Reset All with grouping). Route Help menu
   * "Custom Key Bindings" to the ShortcutEditor component instead.
   */
  showCustomBindingsDialog(): void {
    // eslint-disable-next-line no-console
    console.info(
      '[AppKeyboardHandler] showCustomBindingsDialog: This simple rebind dialog lacks the full ShortcutEditor features (import/export). See Issue #57.',
    );
    const content = document.createElement('div');
    content.style.cssText = `
      max-height: 70vh;
      overflow-y: auto;
      padding: 8px;
    `;
    content.setAttribute('data-testid', 'custom-keybindings-dialog');

    this.renderCustomBindingsContent(content);

    showModal(content, { title: 'Custom Key Bindings', width: '700px' });
  }

  /**
   * Render the custom keybindings dialog content into the given container.
   * This can be called to refresh the dialog in-place without reopening the modal.
   */
  private renderCustomBindingsContent(content: HTMLElement): void {
    content.innerHTML = '';
    const actions = this.customKeyBindingsManager.getAvailableActions();

    // Create table header
    const header = document.createElement('div');
    header.style.cssText = `
      display: grid;
      grid-template-columns: 1fr 120px 80px;
      gap: 8px;
      padding: 8px 0;
      border-bottom: 1px solid var(--border-primary);
      font-weight: bold;
      color: var(--text-primary);
      font-size: 12px;
    `;
    header.innerHTML = `
      <div>Action</div>
      <div>Current Key</div>
      <div>Actions</div>
    `;
    content.appendChild(header);

    // Create rows for each action
    for (const action of actions) {
      const row = document.createElement('div');
      row.style.cssText = `
        display: grid;
        grid-template-columns: 1fr 120px 80px;
        gap: 8px;
        padding: 8px 0;
        border-bottom: 1px solid var(--border-secondary);
        align-items: center;
      `;
      row.setAttribute('data-testid', 'binding-row');
      row.dataset.action = action.action;

      // Action description
      const descCell = document.createElement('div');
      descCell.style.cssText = `
        color: var(--text-primary);
        font-size: 13px;
      `;
      descCell.textContent = action.description;
      row.appendChild(descCell);

      // Current key combination
      const keyCell = document.createElement('div');
      keyCell.style.cssText = `
        background: var(--bg-hover);
        border: 1px solid var(--bg-active);
        border-radius: 4px;
        padding: 4px 8px;
        color: var(--text-primary);
        font-family: monospace;
        font-size: 12px;
        text-align: center;
      `;
      keyCell.setAttribute('data-testid', 'binding-key');
      keyCell.textContent = this.formatKeyCombo(action.currentCombo);
      row.appendChild(keyCell);

      // Action buttons
      const buttonCell = document.createElement('div');
      buttonCell.style.cssText = `
        display: flex;
        gap: 4px;
      `;

      // Set custom binding button
      const setButton = document.createElement('button');
      setButton.textContent = 'Rebind';
      setButton.dataset.testid = 'rebind-button';
      setButton.style.cssText = `
        background: var(--accent-primary);
        border: none;
        color: white;
        padding: 4px 8px;
        border-radius: 3px;
        cursor: pointer;
        font-size: 11px;
      `;
      setButton.onclick = () => this.promptForKeyBinding(action.action, content);
      buttonCell.appendChild(setButton);

      // Reset to default button (only if custom binding exists)
      if (this.customKeyBindingsManager.hasCustomBinding(action.action)) {
        const resetButton = document.createElement('button');
        resetButton.textContent = 'Reset';
        resetButton.dataset.testid = 'reset-binding-button';
        resetButton.style.cssText = `
          background: var(--text-muted);
          border: none;
          color: var(--bg-primary);
          padding: 4px 6px;
          border-radius: 3px;
          cursor: pointer;
          font-size: 11px;
        `;
        resetButton.onclick = () => {
          this.customKeyBindingsManager.removeCustomBinding(action.action);
          this.refresh(); // Update keyboard shortcuts immediately
          this.renderCustomBindingsContent(content); // Re-render in-place
        };
        buttonCell.appendChild(resetButton);
      }

      row.appendChild(buttonCell);
      content.appendChild(row);
    }

    // Reset all button at bottom
    const resetAllContainer = document.createElement('div');
    resetAllContainer.style.cssText = `
      margin-top: 16px;
      padding-top: 16px;
      border-top: 1px solid var(--border-primary);
      text-align: center;
    `;

    const resetAllButton = document.createElement('button');
    resetAllButton.textContent = 'Reset All to Defaults';
    resetAllButton.dataset.testid = 'reset-all-bindings-button';
    resetAllButton.style.cssText = `
      background: var(--error);
      border: none;
      color: white;
      padding: 8px 16px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
    `;
    resetAllButton.onclick = () => {
      this.customKeyBindingsManager.resetAll();
      this.refresh(); // Update keyboard shortcuts immediately
      this.renderCustomBindingsContent(content); // Re-render in-place
    };
    resetAllContainer.appendChild(resetAllButton);
    content.appendChild(resetAllContainer);
  }

  /**
   * Prompt the user to press a key combination for rebinding an action.
   * Transforms the binding row into an inline key capture area.
   * On key press: applies binding immediately and re-renders the dialog.
   * On Escape: cancels the capture.
   * If a conflict is detected, a warning is shown below the row.
   */
  promptForKeyBinding(action: string, dialogContent: HTMLElement): void {
    // Find the row for this action
    const rows = dialogContent.querySelectorAll<HTMLElement>('[data-testid="binding-row"]');
    let targetRow: HTMLElement | null = null;
    for (const row of rows) {
      if (row.dataset.action === action) {
        targetRow = row;
        break;
      }
    }

    // Find the key cell in this row
    const keyCell = targetRow?.querySelector<HTMLElement>('[data-testid="binding-key"]');
    if (!keyCell) return;

    // Store original text for cancel
    const originalText = keyCell.textContent || '';

    // Create a key-capture-prompt element appended to the dialog
    const promptEl = document.createElement('div');
    promptEl.setAttribute('data-testid', 'key-capture-prompt');
    promptEl.className = 'key-capture-prompt';
    promptEl.style.cssText = `
      text-align: center;
      padding: 12px;
      margin: 8px 0;
      background: var(--bg-hover, #2a2a3e);
      border: 2px solid var(--accent-primary, #4a7dff);
      border-radius: 8px;
      color: var(--text-primary, #e0e0e0);
      font-size: 13px;
    `;
    promptEl.textContent = 'Press a key combination... (Escape to cancel)';
    // Insert the prompt after the target row
    if (targetRow?.nextSibling) {
      dialogContent.insertBefore(promptEl, targetRow.nextSibling);
    } else {
      dialogContent.appendChild(promptEl);
    }

    // Visual feedback on the key cell
    keyCell.textContent = '...';
    keyCell.style.borderColor = 'var(--accent-primary, #4a7dff)';

    let listening = true;

    const cleanup = () => {
      if (!listening) return;
      listening = false;
      document.removeEventListener('keydown', handleKeyDown, true);
      if (promptEl.parentNode) promptEl.remove();
      // Also remove any conflict warning
      const warning = dialogContent.querySelector('[data-testid="binding-conflict-warning"]');
      if (warning) warning.remove();
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (!listening) return;

      e.preventDefault();
      e.stopPropagation();

      // Ignore modifier-only presses
      if (e.key === 'Control' || e.key === 'Shift' || e.key === 'Alt' || e.key === 'Meta') {
        return;
      }

      // Handle Escape as cancel
      if (e.code === 'Escape') {
        keyCell.textContent = originalText;
        keyCell.style.borderColor = '';
        cleanup();
        return;
      }

      // Create key combination
      const combo: KeyCombination = {
        code: e.code,
        ctrl: e.ctrlKey || e.metaKey,
        shift: e.shiftKey,
        alt: e.altKey,
        meta: e.metaKey && !e.ctrlKey,
      };

      // Check for conflicts with other actions
      const conflictAction = this.customKeyBindingsManager.findConflictingAction(combo, action);

      if (conflictAction) {
        // Show conflict warning below the row
        // Remove any previous warning
        const existingWarning = dialogContent.querySelector('[data-testid="binding-conflict-warning"]');
        if (existingWarning) existingWarning.remove();

        const warning = document.createElement('div');
        warning.className = 'conflict-warning';
        warning.setAttribute('role', 'alert');
        warning.style.cssText = `
          color: #f5a623;
          background: rgba(245, 166, 35, 0.1);
          border: 1px solid rgba(245, 166, 35, 0.3);
          border-radius: 4px;
          padding: 8px 12px;
          margin: 4px 0;
          font-size: 12px;
          text-align: center;
        `;
        warning.setAttribute('data-testid', 'binding-conflict-warning');
        warning.textContent = `This combo conflicts with "${conflictAction}".`;

        // Insert the warning after the prompt
        promptEl.insertAdjacentElement('afterend', warning);

        // Update key cell to show the pressed combo
        keyCell.textContent = this.formatKeyCombo(combo);
        // Keep listening - don't auto-apply on conflict
        return;
      }

      // No conflict - apply the binding immediately
      try {
        this.customKeyBindingsManager.setCustomBinding(action, combo, true);
        this.refresh(); // Update keyboard shortcuts immediately
      } catch {
        // Binding failed silently
      }

      // Clean up and re-render the dialog content
      cleanup();
      this.renderCustomBindingsContent(dialogContent);
    };

    document.addEventListener('keydown', handleKeyDown, true);
  }

  /**
   * Format a key combination for display.
   */
  formatKeyCombo(combo: KeyCombination): string {
    return describeKeyCombo(combo);
  }

  private skipsDirectRegistration(action: string): boolean {
    return (
      (AppKeyboardHandler.CONTEXTUAL_DEFAULTS.has(action) || AppKeyboardHandler.HIDDEN_DEFAULTS.has(action)) &&
      !this.customKeyBindingsManager.hasCustomBinding(action)
    );
  }

  /**
   * Dispose of resources.
   */
  dispose(): void {
    // KeyboardManager and CustomKeyBindingsManager are owned by App,
    // so we don't dispose them here. This is just for any future cleanup.
  }
}
