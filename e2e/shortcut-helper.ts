/**
 * E2E Shortcut Helper
 *
 * Derives Playwright key strings from DEFAULT_KEY_BINDINGS to prevent
 * hardcoded key strings from drifting out of sync with actual bindings.
 */

import type { Page } from '@playwright/test';
import { DEFAULT_KEY_BINDINGS } from '../src/utils/input/KeyBindings';
import type { KeyCombination } from '../src/utils/input/KeyboardManager';

/**
 * Convert a KeyCombination code (e.g., 'KeyH', 'Space', 'Digit3') to
 * the Playwright key name (e.g., 'h', 'Space', '3').
 */
function codeToPlaywrightKey(code: string): string {
  if (code.startsWith('Key')) {
    return code.slice(3).toLowerCase();
  }
  if (code.startsWith('Digit')) {
    return code.slice(5);
  }
  switch (code) {
    case 'Space': return 'Space';
    case 'ArrowUp': return 'ArrowUp';
    case 'ArrowDown': return 'ArrowDown';
    case 'ArrowLeft': return 'ArrowLeft';
    case 'ArrowRight': return 'ArrowRight';
    case 'Home': return 'Home';
    case 'End': return 'End';
    case 'Escape': return 'Escape';
    case 'BracketLeft': return '[';
    case 'BracketRight': return ']';
    case 'Comma': return ',';
    case 'Period': return '.';
    case 'Backquote': return '`';
    default: return code;
  }
}

/**
 * Convert a KeyCombination to a Playwright-compatible key string
 * (e.g., { code: 'KeyH', alt: true } → 'Alt+h').
 */
export function comboToPlaywrightKey(combo: KeyCombination): string {
  const parts: string[] = [];
  if (combo.ctrl) parts.push('Control');
  if (combo.shift) parts.push('Shift');
  if (combo.alt) parts.push('Alt');
  if (combo.meta) parts.push('Meta');
  parts.push(codeToPlaywrightKey(combo.code));
  return parts.join('+');
}

/**
 * Get the Playwright key string for a given action ID
 * from DEFAULT_KEY_BINDINGS.
 */
export function getShortcutKey(action: string): string {
  const binding = DEFAULT_KEY_BINDINGS[action];
  if (!binding) {
    throw new Error(`Unknown action: ${action}`);
  }
  const { description: _, ...combo } = binding;
  return comboToPlaywrightKey(combo as KeyCombination);
}

/**
 * Press the keyboard shortcut for a given action ID on the page.
 * Uses DEFAULT_KEY_BINDINGS to derive the correct key combo.
 */
export async function pressShortcut(page: Page, action: string): Promise<void> {
  const key = getShortcutKey(action);
  await page.keyboard.press(key);
}
