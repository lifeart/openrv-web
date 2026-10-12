/**
 * UserNameField - labelled "Your name" input bound to `GeneralPrefs.userName`.
 *
 * Reused by the collaboration (network) panel and the notes panel so the
 * user can set the name that attributes their notes and identifies them to
 * other participants. Edits are persisted on `change` (blur / Enter), and the
 * field stays in sync when the preference changes elsewhere.
 */

import { getCorePreferencesManager } from '../../core/PreferencesManager';
import {
  DEFAULT_USER_NAME,
  MAX_USER_NAME_LENGTH,
  getStoredUserName,
  normalizeUserName,
  setPreferredUserName,
} from '../../core/UserIdentity';
import { Logger } from '../../utils/Logger';

const logger = new Logger('UserNameField');

let fieldIdCounter = 0;

export interface UserNameFieldOptions {
  /** data-testid for the <input>. Default: 'user-name-input'. */
  testId?: string;
  /** Visible label text. Default: 'Your name'. */
  label?: string;
  /** Placeholder shown when no name is set. Default: 'User'. */
  placeholder?: string;
  /** Use the compact inline (label + input on one row) layout. */
  inline?: boolean;
}

export interface UserNameField {
  element: HTMLElement;
  input: HTMLInputElement;
  /** Current (normalized) value of the input; '' when blank. */
  getValue(): string;
  /** Persist the input's current value immediately. */
  commit(): void;
  dispose(): void;
}

export function createUserNameField(options: UserNameFieldOptions = {}): UserNameField {
  const { testId = 'user-name-input', label = 'Your name', placeholder = DEFAULT_USER_NAME, inline = false } = options;

  const id = `user-name-field-${++fieldIdCounter}`;

  const element = document.createElement('div');
  element.className = 'user-name-field';
  element.style.cssText = inline
    ? 'display: flex; align-items: center; gap: 8px;'
    : 'display: flex; flex-direction: column; gap: 6px;';

  const labelEl = document.createElement('label');
  labelEl.htmlFor = id;
  labelEl.textContent = label;
  labelEl.style.cssText = inline
    ? 'color: var(--text-muted); font-size: 11px; white-space: nowrap;'
    : `
      color: var(--text-muted);
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    `;

  const input = document.createElement('input');
  input.id = id;
  input.type = 'text';
  input.setAttribute('autocomplete', 'nickname');
  input.spellcheck = false;
  input.maxLength = MAX_USER_NAME_LENGTH;
  input.placeholder = placeholder;
  input.dataset.testid = testId;
  input.title = 'Shown on your notes and to other participants in a review session';
  input.value = getStoredUserName();
  input.style.cssText = `
    ${inline ? 'flex: 1; min-width: 0;' : 'width: 100%;'}
    padding: ${inline ? '4px 8px' : '8px 12px'};
    background: var(--bg-primary);
    color: var(--text-primary);
    border: 1px solid var(--border-primary);
    border-radius: 4px;
    font-size: ${inline ? '11px' : '12px'};
    box-sizing: border-box;
    outline: none;
  `;

  // Only persist values the user actually edited, so a stale field can never
  // overwrite a name set elsewhere (another field, preferences import).
  let dirty = false;
  input.addEventListener('input', () => {
    dirty = true;
  });

  const commit = (): void => {
    if (!dirty) return;
    dirty = false;
    const normalized = normalizeUserName(input.value);
    input.value = normalized;
    if (normalized !== getStoredUserName()) {
      setPreferredUserName(normalized);
    }
  };

  input.addEventListener('focus', () => {
    input.style.borderColor = 'var(--accent-primary)';
  });
  input.addEventListener('blur', () => {
    input.style.borderColor = 'var(--border-primary)';
  });
  input.addEventListener('change', commit);
  input.addEventListener('keydown', (e) => {
    // Keep typing inside the field from reaching panel-level key handlers
    // (list navigation, shortcuts).
    e.stopPropagation();
    if (e.key === 'Enter') {
      commit();
      input.blur();
    } else if (e.key === 'Escape') {
      dirty = false;
      input.value = getStoredUserName();
      input.blur();
    }
  });

  element.appendChild(labelEl);
  element.appendChild(input);

  // Stay in sync with edits made through another field / preferences import.
  let unsubscribe: (() => void) | null = null;
  try {
    unsubscribe = getCorePreferencesManager().on('generalPrefsChanged', (prefs) => {
      if (dirty) return;
      input.value = normalizeUserName(prefs.userName ?? '');
    });
  } catch (error) {
    logger.debug('PreferencesManager unavailable; name field will not live-sync', { error });
  }

  return {
    element,
    input,
    getValue: () => normalizeUserName(input.value),
    commit,
    dispose: () => {
      unsubscribe?.();
      unsubscribe = null;
    },
  };
}
