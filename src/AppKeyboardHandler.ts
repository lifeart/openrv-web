/**
 * AppKeyboardHandler - Extracted keyboard shortcut management from App
 *
 * Handles keyboard shortcut registration, refresh, display dialogs,
 * custom key bindings management, and key binding prompts.
 */

import type { KeyboardManager, KeyCombination } from './utils/input/KeyboardManager';
import { DEFAULT_KEY_BINDINGS } from './utils/input/KeyBindings';
import type { CustomKeyBindingsManager } from './utils/input/CustomKeyBindingsManager';
import { showModal } from './ui/components/shared/Modal';
import { ShortcutEditor } from './ui/components/ShortcutEditor';

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
    'navigation.gotoFrame', // G key - handled with paint/panel context variants (gotoFrame vs toggleGhost vs gamutDiagram)
    'paint.toggleGhost', // G key - handled with global/paint context variants
    'view.fitToHeight', // H key - context-managed (fitToHeight vs flipHorizontal vs histogram)
    'view.fitToWidth', // W key - context-managed (fitToWidth vs cycleWipeMode vs waveform)
    'panel.histogram', // H key - panel context (histogram scope toggle)
    'panel.waveform', // W key - panel context (waveform scope toggle)
    'panel.gamutDiagram', // G key - panel context (gamut diagram toggle)
    'channel.red', // Shift+R is reserved for transform.rotateLeft
    'channel.blue', // Shift+B is reserved for view.cycleBackgroundPattern
    'channel.none', // Shift+N is reserved for network.togglePanel
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
   * Uses the full ShortcutEditor component with import/export and grouped actions.
   */
  showCustomBindingsDialog(): void {
    const container = document.createElement('div');
    const editor = new ShortcutEditor(container, this.customKeyBindingsManager);

    showModal(container, {
      title: 'Custom Key Bindings',
      width: '700px',
      onClose: () => editor.dispose(),
    });
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
