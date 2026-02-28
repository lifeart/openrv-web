/**
 * AppKeyboardHandler - Extracted keyboard shortcut management from App
 *
 * Handles keyboard shortcut registration, refresh, display dialogs,
 * custom key bindings management, and key binding prompts.
 */

import { KeyboardManager, type KeyCombination } from './utils/input/KeyboardManager';
import { DEFAULT_KEY_BINDINGS, describeKeyCombo } from './utils/input/KeyBindings';
import { CustomKeyBindingsManager } from './utils/input/CustomKeyBindingsManager';
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
  private static readonly CONFLICTING_DEFAULTS = new Set([
    'paint.line',      // L key - handled by playback.faster
    'paint.rectangle', // R key - handled by timeline.resetInOut
    'paint.ellipse',   // O key - handled by timeline.setOutPoint
    'channel.red',     // Shift+R is reserved for transform.rotateLeft
    'channel.blue',    // Shift+B is reserved for view.cycleBackgroundPattern
    'channel.none',    // Shift+N is reserved for network.togglePanel
  ]);

  constructor(
    keyboardManager: KeyboardManager,
    customKeyBindingsManager: CustomKeyBindingsManager,
    context: KeyboardHandlerContext
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
      if (AppKeyboardHandler.CONFLICTING_DEFAULTS.has(action) && !this.customKeyBindingsManager?.hasCustomBinding(action)) {
        continue;
      }

      this.keyboardManager.register(effectiveCombo, handler, defaultBinding.description);
    }
  }

  /**
   * Show the keyboard shortcuts reference dialog.
   */
  showShortcutsDialog(): void {
    const content = document.createElement('div');
    content.style.cssText = `
      max-height: 70vh;
      overflow-y: auto;
      padding: 8px;
      font-family: monospace;
      font-size: 12px;
      color: var(--text-primary);
      line-height: 1.6;
    `;

    // Search/filter input
    const searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.placeholder = 'Search shortcuts...';
    searchInput.setAttribute('data-testid', 'shortcuts-search');
    searchInput.style.cssText = `
      width: 100%;
      box-sizing: border-box;
      padding: 6px 10px;
      margin-bottom: 12px;
      font-family: monospace;
      font-size: 12px;
      background: var(--bg-hover);
      border: 1px solid var(--bg-active);
      border-radius: 4px;
      color: var(--text-primary);
      outline: none;
    `;
    content.appendChild(searchInput);

    // Group shortcuts by category
    const categories = {
      'TABS': ['tab.view', 'tab.color', 'tab.effects', 'tab.transform', 'tab.annotate', 'tab.qc'],
      'PLAYBACK': ['playback.toggle', 'playback.stepBackward', 'playback.stepForward', 'playback.goToStart', 'playback.goToEnd', 'playback.toggleDirection', 'playback.slower', 'playback.stop', 'playback.faster'],
      'VIEW': ['view.fitToWindow', 'view.fitToWindowAlt', 'view.zoom50', 'view.toggleAB', 'view.toggleABAlt', 'view.toggleSpotlight', 'color.toggleHSLQualifier'],
      'MOUSE CONTROLS': [], // Special case - not in DEFAULT_KEY_BINDINGS
      'CHANNEL ISOLATION': ['channel.red', 'channel.green', 'channel.blue', 'channel.alpha', 'channel.luminance', 'channel.grayscale', 'channel.none'],
      'SCOPES': ['panel.histogram', 'panel.waveform', 'panel.vectorscope', 'panel.gamutDiagram'],
      'TIMELINE': [
        'timeline.setInPoint',
        'timeline.setInPointAlt',
        'timeline.setOutPoint',
        'timeline.setOutPointAlt',
        'timeline.resetInOut',
        'timeline.toggleMark',
        'timeline.nextMarkOrBoundary',
        'timeline.previousMarkOrBoundary',
        'timeline.nextShot',
        'timeline.previousShot',
        'timeline.cycleLoopMode'
      ],
      'PAINT (Annotate tab)': ['paint.pan', 'paint.pen', 'paint.eraser', 'paint.text', 'paint.rectangle', 'paint.ellipse', 'paint.line', 'paint.arrow', 'paint.toggleBrush', 'paint.toggleGhost', 'paint.toggleHold', 'edit.undo', 'edit.redo'],
      'COLOR': ['panel.color', 'panel.curves', 'panel.ocio', 'display.cycleProfile'],
      'WIPE COMPARISON': ['view.cycleWipeMode', 'view.toggleSplitScreen'],
      'AUDIO (Video only)': ['audio.toggleMute'], // Also has special non-binding entries below
      'EXPORT': ['export.quickExport', 'export.copyFrame'],
      'ANNOTATIONS': ['annotation.previous', 'annotation.next'],
      'TRANSFORM': ['transform.rotateLeft', 'transform.rotateRight', 'transform.flipHorizontal', 'transform.flipVertical'],
      'PANELS': ['panel.effects', 'panel.crop', 'panel.close'],
      'STEREO': ['stereo.toggle', 'stereo.eyeTransform', 'stereo.cycleAlign']
    };

    // Add special audio shortcuts
    const audioShortcuts = [
      { key: 'Hover vol', desc: 'Show volume slider' },
      { key: 'Click icon', desc: 'Toggle mute' }
    ];

    // Generate content for each category
    for (const [categoryName, actionKeys] of Object.entries(categories)) {
      if (actionKeys.length === 0 && categoryName !== 'AUDIO (Video only)') continue;

      const categoryDiv = document.createElement('div');
      categoryDiv.style.cssText = 'margin-bottom: 16px;';
      categoryDiv.setAttribute('data-shortcut-category', categoryName);

      const categoryHeader = document.createElement('div');
      categoryHeader.style.cssText = 'font-weight: bold; color: var(--accent-primary); margin-bottom: 4px;';
      categoryHeader.textContent = categoryName;
      categoryDiv.appendChild(categoryHeader);

      // Special handling for audio category
      if (categoryName === 'AUDIO (Video only)') {
        // Render regular key bindings first (e.g., audio.toggleMute)
        for (const actionKey of actionKeys) {
          const defaultBinding = DEFAULT_KEY_BINDINGS[actionKey as keyof typeof DEFAULT_KEY_BINDINGS];
          if (!defaultBinding) continue;

          const effectiveCombo = this.customKeyBindingsManager.getEffectiveCombo(actionKey);
          const isCustom = this.customKeyBindingsManager.hasCustomBinding(actionKey);

          const shortcutDiv = document.createElement('div');
          shortcutDiv.style.cssText = 'display: flex; justify-content: space-between; align-items: center; margin-bottom: 2px;';
          shortcutDiv.setAttribute('data-shortcut-row', '');

          const keyText = describeKeyCombo(effectiveCombo);
          const keySpan = document.createElement('span');
          keySpan.textContent = keyText;
          keySpan.style.cssText = `min-width: 120px; ${isCustom ? 'color: var(--accent-primary); font-weight: bold;' : 'color: var(--text-muted);'}`;

          const descSpan = document.createElement('span');
          descSpan.textContent = defaultBinding.description;
          descSpan.style.cssText = 'color: var(--text-primary); flex: 1;';

          shortcutDiv.setAttribute('data-shortcut-key', keyText.toLowerCase());
          shortcutDiv.setAttribute('data-shortcut-desc', defaultBinding.description.toLowerCase());

          shortcutDiv.appendChild(keySpan);
          shortcutDiv.appendChild(descSpan);
          categoryDiv.appendChild(shortcutDiv);
        }

        // Then render special non-binding audio shortcuts
        for (const shortcut of audioShortcuts) {
          const shortcutDiv = document.createElement('div');
          shortcutDiv.style.cssText = 'display: flex; justify-content: space-between; align-items: center; margin-bottom: 2px;';
          shortcutDiv.setAttribute('data-shortcut-row', '');
          shortcutDiv.setAttribute('data-shortcut-key', shortcut.key.toLowerCase());
          shortcutDiv.setAttribute('data-shortcut-desc', shortcut.desc.toLowerCase());

          const keySpan = document.createElement('span');
          keySpan.textContent = shortcut.key;
          keySpan.style.cssText = 'color: var(--text-muted); min-width: 120px;';

          const descSpan = document.createElement('span');
          descSpan.textContent = shortcut.desc;
          descSpan.style.cssText = 'color: var(--text-primary); flex: 1;';

          shortcutDiv.appendChild(keySpan);
          shortcutDiv.appendChild(descSpan);
          categoryDiv.appendChild(shortcutDiv);
        }
      } else if (categoryName === 'MOUSE CONTROLS') {
        const mouseShortcuts = [
          { key: 'Drag', desc: 'Pan image' },
          { key: 'Scroll', desc: 'Zoom in/out' },
          { key: 'Dbl-click', desc: 'Reset individual slider (color panel)' },
          { key: 'Dbl-click', desc: 'Jump to nearest annotation (timeline)' },
          { key: 'Drag line', desc: 'Adjust wipe position' }
        ];

        for (const shortcut of mouseShortcuts) {
          const shortcutDiv = document.createElement('div');
          shortcutDiv.style.cssText = 'display: flex; justify-content: space-between; align-items: center; margin-bottom: 2px;';
          shortcutDiv.setAttribute('data-shortcut-row', '');
          shortcutDiv.setAttribute('data-shortcut-key', shortcut.key.toLowerCase());
          shortcutDiv.setAttribute('data-shortcut-desc', shortcut.desc.toLowerCase());

          const keySpan = document.createElement('span');
          keySpan.textContent = shortcut.key;
          keySpan.style.cssText = 'color: var(--text-muted); min-width: 120px;';

          const descSpan = document.createElement('span');
          descSpan.textContent = shortcut.desc;
          descSpan.style.cssText = 'color: var(--text-primary); flex: 1;';

          shortcutDiv.appendChild(keySpan);
          shortcutDiv.appendChild(descSpan);
          categoryDiv.appendChild(shortcutDiv);
        }
      } else {
        // Regular shortcuts from DEFAULT_KEY_BINDINGS
        for (const actionKey of actionKeys) {
          const defaultBinding = DEFAULT_KEY_BINDINGS[actionKey as keyof typeof DEFAULT_KEY_BINDINGS];
          if (!defaultBinding) continue;

          const effectiveCombo = this.customKeyBindingsManager.getEffectiveCombo(actionKey);
          const isCustom = this.customKeyBindingsManager.hasCustomBinding(actionKey);
          const isConflicting = AppKeyboardHandler.CONFLICTING_DEFAULTS.has(actionKey) && !isCustom;

          const shortcutDiv = document.createElement('div');
          shortcutDiv.style.cssText = 'display: flex; justify-content: space-between; align-items: center; margin-bottom: 2px;';
          shortcutDiv.setAttribute('data-shortcut-row', '');

          const keyText = describeKeyCombo(effectiveCombo);
          const keySpan = document.createElement('span');
          keySpan.textContent = keyText;
          keySpan.style.cssText = `min-width: 120px; ${isCustom ? 'color: var(--accent-primary); font-weight: bold;' : isConflicting ? 'color: var(--text-muted); opacity: 0.5;' : 'color: var(--text-muted);'}`;

          const descSpan = document.createElement('span');
          descSpan.textContent = defaultBinding.description + (isConflicting ? ' (requires custom binding)' : '');
          descSpan.style.cssText = `flex: 1; ${isConflicting ? 'color: var(--text-muted); font-style: italic;' : 'color: var(--text-primary);'}`;

          shortcutDiv.setAttribute('data-shortcut-key', keyText.toLowerCase());
          shortcutDiv.setAttribute('data-shortcut-desc', defaultBinding.description.toLowerCase());
          if (isConflicting) {
            shortcutDiv.setAttribute('data-conflicting', 'true');
          }

          const actionsDiv = document.createElement('div');
          actionsDiv.style.cssText = 'display: flex; gap: 4px;';

          // Reset button (only show if custom binding exists)
          if (isCustom) {
            const resetButton = document.createElement('button');
            resetButton.textContent = 'Reset';
            resetButton.style.cssText = `
              background: var(--text-muted);
              border: none;
              color: var(--bg-primary);
              padding: 2px 6px;
              border-radius: 3px;
              cursor: pointer;
              font-size: 10px;
            `;
            resetButton.onclick = () => {
              this.customKeyBindingsManager.removeCustomBinding(actionKey);
              this.refresh();
              this.showShortcutsDialog(); // Refresh the display
            };
            actionsDiv.appendChild(resetButton);
          }

          shortcutDiv.appendChild(keySpan);
          shortcutDiv.appendChild(descSpan);
          shortcutDiv.appendChild(actionsDiv);
          categoryDiv.appendChild(shortcutDiv);
        }
      }

      content.appendChild(categoryDiv);
    }

    // Reset all button at bottom
    const resetAllContainer = document.createElement('div');
    resetAllContainer.style.cssText = `
      margin-top: 20px;
      padding-top: 16px;
      border-top: 1px solid var(--border-primary);
      text-align: center;
    `;

    const resetAllButton = document.createElement('button');
    resetAllButton.textContent = 'Reset All Shortcuts to Defaults';
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
      if (confirm('Reset all keyboard shortcuts to defaults?')) {
        this.customKeyBindingsManager.resetAll();
        this.refresh();
        this.showShortcutsDialog(); // Refresh the display
      }
    };
    resetAllContainer.appendChild(resetAllButton);
    content.appendChild(resetAllContainer);

    // Wire up search filtering
    searchInput.addEventListener('input', () => {
      const term = searchInput.value.toLowerCase().trim();
      const categoryDivs = content.querySelectorAll<HTMLElement>('[data-shortcut-category]');
      for (const catDiv of categoryDivs) {
        const rows = catDiv.querySelectorAll<HTMLElement>('[data-shortcut-row]');
        let anyVisible = false;
        for (const row of rows) {
          const keyText = row.getAttribute('data-shortcut-key') || '';
          const descText = row.getAttribute('data-shortcut-desc') || '';
          const matches = term === '' || keyText.includes(term) || descText.includes(term);
          row.style.display = matches ? '' : 'none';
          if (matches) anyVisible = true;
        }
        // Hide entire category if no rows match (unless search is empty)
        catDiv.style.display = (term === '' || anyVisible) ? '' : 'none';
      }
    });

    showModal(content, { title: 'Keyboard Shortcuts', width: '700px' });

    // Auto-focus the search input when the dialog opens
    searchInput.focus();
  }

  /**
   * Show the custom key bindings management dialog.
   * Renders the list of actions with their current key bindings inline.
   */
  showCustomBindingsDialog(): void {
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
        meta: e.metaKey && !e.ctrlKey
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

  /**
   * Dispose of resources.
   */
  dispose(): void {
    // KeyboardManager and CustomKeyBindingsManager are owned by App,
    // so we don't dispose them here. This is just for any future cleanup.
  }
}
