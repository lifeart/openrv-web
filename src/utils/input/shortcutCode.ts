/**
 * Layout-aware key code for shortcut matching.
 *
 * Bindings are stored as KeyboardEvent.code values ('KeyA', 'Digit1', ...).
 * `code` names the physical key on a US QWERTY board, so on AZERTY the key
 * labelled A reports 'KeyQ' and on QWERTZ the key labelled Z reports 'KeyY'.
 * For letters this returns the code of the letter the user actually typed
 * (from `key`), so "A" means the key with A on it on every Latin layout.
 *
 * Everything else keeps `code`: digits, punctuation and named keys, and
 * letters typed on non-Latin layouts (Cyrillic, Greek, ...) or produced with
 * Alt/Option, which fall back to the physical QWERTY position.
 */
export function shortcutCode(e: Pick<KeyboardEvent, 'code' | 'key'>): string {
  const key = e.key;
  if (typeof key === 'string' && key.length === 1) {
    const lower = key.toLowerCase();
    if (lower >= 'a' && lower <= 'z') {
      return `Key${lower.toUpperCase()}`;
    }
  }
  return e.code;
}
