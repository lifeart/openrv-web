import { describe, it, expect } from 'vitest';
import { shortcutCode } from './shortcutCode';

describe('shortcutCode', () => {
  it.each([
    // [code, key, expected]
    ['KeyA', 'a', 'KeyA'], // QWERTY
    ['KeyQ', 'a', 'KeyA'], // AZERTY A
    ['KeyA', 'q', 'KeyQ'], // AZERTY Q
    ['KeyY', 'z', 'KeyZ'], // QWERTZ Z
    ['Semicolon', 'm', 'KeyM'], // AZERTY M
    ['KeyS', 'O', 'KeyO'], // Dvorak, with Shift
    ['KeyL', 'д', 'KeyL'], // Russian: physical position
    ['KeyL', '¬', 'KeyL'], // macOS Option+L
    ['Digit1', '&', 'Digit1'], // AZERTY digit row
    ['Space', ' ', 'Space'],
    ['ArrowLeft', 'ArrowLeft', 'ArrowLeft'],
    ['KeyE', 'Dead', 'KeyE'], // dead key
    ['KeyA', '', 'KeyA'], // synthetic event without key
  ])('code %s with key %j -> %s', (code, key, expected) => {
    expect(shortcutCode({ code, key })).toBe(expected);
  });
});
