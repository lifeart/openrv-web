/**
 * AppKeyboardHandler - Extracted keyboard shortcut management from App
 *
 * Handles keyboard shortcut registration, refresh, display dialogs,
 * custom key bindings management, and key binding prompts.
 */

import { KeyboardManager, type KeyCombination } from './utils/input/KeyboardManager';
import { DEFAULT_KEY_BINDINGS, describeKeyCombo } from './utils/input/KeyBindings';
import { CustomKeyBindingsManager } from './utils/input/CustomKeyBindingsManager';
import { showModal, closeModal } from './ui/components/shared/Modal';

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

    // Some actions intentionally share keys with higher-priority global shortcuts.
    // Skip registering these to avoid overriding the intended behavior.
    const conflictingShortcuts = new Set([
      'paint.line',      // L key - handled by playback.faster
      'paint.rectangle', // R key - handled by timeline.resetInOut
      'paint.ellipse',   // O key - handled by timeline.setOutPoint
      'channel.red',     // Shift+R is reserved for transform.rotateLeft
    ]);

    // Register all keyboard shortcuts using effective combos (custom or default)
    for (const [action, defaultBinding] of Object.entries(DEFAULT_KEY_BINDINGS)) {
      // Skip known conflicts handled elsewhere or intentionally reserved
      if (conflictingShortcuts.has(action)) {
        continue;
      }

      const handler = actionHandlers[action];
      if (handler) {
        // Use effective combo if custom key bindings manager is available, otherwise use default
        const effectiveCombo = this.customKeyBindingsManager
          ? this.customKeyBindingsManager.getEffectiveCombo(action)
          : (() => {
              // Extract KeyCombination from default binding (remove description)
              const { description: _, ...combo } = defaultBinding;
              return combo as KeyCombination;
            })();
        this.keyboardManager.register(effectiveCombo, handler, defaultBinding.description);
      }
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

    // Group shortcuts by category
    const categories = {
      'TABS': ['tab.view', 'tab.color', 'tab.effects', 'tab.transform', 'tab.annotate'],
      'PLAYBACK': ['playback.toggle', 'playback.stepBackward', 'playback.stepForward', 'playback.goToStart', 'playback.goToEnd', 'playback.toggleDirection', 'playback.slower', 'playback.stop', 'playback.faster'],
      'VIEW': ['view.fitToWindow', 'view.fitToWindowAlt', 'view.zoom50', 'view.toggleAB', 'view.toggleABAlt', 'view.toggleSpotlight', 'color.toggleHSLQualifier'],
      'MOUSE CONTROLS': [], // Special case - not in DEFAULT_KEY_BINDINGS
      'CHANNEL ISOLATION': ['channel.red', 'channel.green', 'channel.blue', 'channel.alpha', 'channel.luminance', 'channel.none'],
      'SCOPES': ['panel.histogram', 'panel.waveform', 'panel.vectorscope'],
      'TIMELINE': ['timeline.setInPoint', 'timeline.setInPointAlt', 'timeline.setOutPoint', 'timeline.setOutPointAlt', 'timeline.resetInOut', 'timeline.toggleMark', 'timeline.cycleLoopMode'],
      'PAINT (Annotate tab)': ['paint.pan', 'paint.pen', 'paint.eraser', 'paint.text', 'paint.rectangle', 'paint.ellipse', 'paint.line', 'paint.arrow', 'paint.toggleBrush', 'paint.toggleGhost', 'paint.toggleHold', 'edit.undo', 'edit.redo'],
      'COLOR': ['panel.color', 'panel.curves', 'panel.ocio', 'display.cycleProfile'],
      'WIPE COMPARISON': ['view.cycleWipeMode', 'view.toggleSplitScreen'],
      'AUDIO (Video only)': [], // Special case - not in DEFAULT_KEY_BINDINGS
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

      const categoryHeader = document.createElement('div');
      categoryHeader.style.cssText = 'font-weight: bold; color: var(--accent-primary); margin-bottom: 4px;';
      categoryHeader.textContent = categoryName;
      categoryDiv.appendChild(categoryHeader);

      // Special handling for audio category
      if (categoryName === 'AUDIO (Video only)') {
        for (const shortcut of audioShortcuts) {
          const shortcutDiv = document.createElement('div');
          shortcutDiv.style.cssText = 'display: flex; justify-content: space-between; align-items: center; margin-bottom: 2px;';

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

          const shortcutDiv = document.createElement('div');
          shortcutDiv.style.cssText = 'display: flex; justify-content: space-between; align-items: center; margin-bottom: 2px;';

          const keySpan = document.createElement('span');
          keySpan.textContent = describeKeyCombo(effectiveCombo);
          keySpan.style.cssText = `min-width: 120px; ${isCustom ? 'color: var(--accent-primary); font-weight: bold;' : 'color: var(--text-muted);'}`;

          const descSpan = document.createElement('span');
          descSpan.textContent = defaultBinding.description;
          descSpan.style.cssText = 'color: var(--text-primary); flex: 1;';

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

    showModal(content, { title: 'Keyboard Shortcuts', width: '700px' });
  }

  /**
   * Show the custom key bindings management dialog.
   */
  showCustomBindingsDialog(): void {
    const content = document.createElement('div');
    content.style.cssText = `
      max-height: 70vh;
      overflow-y: auto;
      padding: 8px;
    `;

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
      setButton.textContent = 'Set';
      setButton.style.cssText = `
        background: var(--accent-primary);
        border: none;
        color: white;
        padding: 4px 8px;
        border-radius: 3px;
        cursor: pointer;
        font-size: 11px;
      `;
      setButton.onclick = () => this.promptForKeyBinding(action.action, keyCell);
      buttonCell.appendChild(setButton);

      // Reset to default button (only if custom binding exists)
      if (this.customKeyBindingsManager.hasCustomBinding(action.action)) {
        const resetButton = document.createElement('button');
        resetButton.textContent = 'Reset';
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
          keyCell.textContent = this.formatKeyCombo(this.customKeyBindingsManager.getEffectiveCombo(action.action));
          this.refresh(); // Update keyboard shortcuts immediately
          resetButton.remove(); // Remove reset button after resetting
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
      if (confirm('Reset all custom key bindings to defaults?')) {
        this.customKeyBindingsManager.resetAll();
        this.refresh(); // Update keyboard shortcuts immediately
        // Close and reopen modal to refresh the list
        closeModal();
        setTimeout(() => this.showCustomBindingsDialog(), 100);
      }
    };
    resetAllContainer.appendChild(resetAllButton);
    content.appendChild(resetAllContainer);

    showModal(content, { title: 'Custom Key Bindings', width: '700px' });
  }

  /**
   * Show a modal that captures a key binding from the user.
   */
  promptForKeyBinding(action: string, keyCell: HTMLElement): void {
    const promptContent = document.createElement('div');
    promptContent.style.cssText = `
      text-align: center;
      padding: 20px;
    `;

    const instruction = document.createElement('div');
    instruction.style.cssText = `
      color: var(--text-primary);
      margin-bottom: 16px;
      font-size: 14px;
    `;
    instruction.textContent = 'Press the key combination you want to use for this action:';
    promptContent.appendChild(instruction);

    const keyDisplay = document.createElement('div');
    keyDisplay.style.cssText = `
      background: var(--bg-hover);
      border: 2px solid var(--accent-primary);
      border-radius: 8px;
      padding: 16px;
      color: var(--accent-primary);
      font-family: monospace;
      font-size: 18px;
      font-weight: bold;
      margin: 16px 0;
      min-height: 24px;
    `;
    keyDisplay.textContent = 'Waiting for key press...';
    promptContent.appendChild(keyDisplay);

    const cancelButton = document.createElement('button');
    cancelButton.textContent = 'Cancel';
    cancelButton.style.cssText = `
      background: var(--text-muted);
      border: none;
      color: var(--bg-primary);
      padding: 8px 16px;
      border-radius: 4px;
      cursor: pointer;
      margin-top: 16px;
    `;
    // Listen for key presses
    let listening = true;

    // Cleanup function to ensure event listener is always removed
    const cleanup = () => {
      if (!listening) return;
      listening = false;
      document.removeEventListener('keydown', handleKeyDown);
    };

    // Show the prompt modal with onClose to guarantee cleanup on any dismissal
    const { close } = showModal(promptContent, { title: 'Set Key Binding', width: '400px', onClose: cleanup });

    // Set up cancel button to properly clean up
    cancelButton.onclick = () => {
      cleanup();
      close();
    };
    promptContent.appendChild(cancelButton);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (!listening) return;

      e.preventDefault();
      e.stopPropagation();

      // Ignore modifier-only presses
      if (e.key === 'Control' || e.key === 'Shift' || e.key === 'Alt' || e.key === 'Meta') {
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

      // Display the combination
      keyDisplay.textContent = this.formatKeyCombo(combo);

      // Confirm button
      const confirmButton = document.createElement('button');
      confirmButton.textContent = 'Confirm';
      confirmButton.style.cssText = `
        background: var(--accent-primary);
        border: none;
        color: white;
        padding: 8px 16px;
        border-radius: 4px;
        cursor: pointer;
        margin-left: 8px;
      `;
      confirmButton.onclick = () => {
        try {
          this.customKeyBindingsManager.setCustomBinding(action, combo);
          keyCell.textContent = this.formatKeyCombo(combo);
          this.refresh(); // Update keyboard shortcuts immediately
          cleanup();
          close();
        } catch (err) {
          alert(`Error setting key binding: ${err}`);
        }
      };

      // Replace cancel button with confirm + cancel
      const buttonContainer = document.createElement('div');
      buttonContainer.style.cssText = `
        margin-top: 16px;
        display: flex;
        justify-content: center;
        gap: 8px;
      `;
      buttonContainer.appendChild(confirmButton);

      const newCancelButton = document.createElement('button');
      newCancelButton.textContent = 'Cancel';
      newCancelButton.style.cssText = `
        background: var(--text-muted);
        border: none;
        color: var(--bg-primary);
        padding: 8px 16px;
        border-radius: 4px;
        cursor: pointer;
      `;
      newCancelButton.onclick = () => {
        cleanup();
        close();
      };
      buttonContainer.appendChild(newCancelButton);

      // Replace the old cancel button
      cancelButton.replaceWith(buttonContainer);
    };

    document.addEventListener('keydown', handleKeyDown);
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
