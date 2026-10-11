import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createUserNameField, type UserNameField } from './UserNameField';
import { getPreferredUserName, setPreferredUserName } from '../../core/UserIdentity';
import { resetCorePreferencesManagerForTests } from '../../core/PreferencesManager';

describe('UserNameField', () => {
  let field: UserNameField | null = null;

  beforeEach(() => {
    localStorage.clear();
    resetCorePreferencesManagerForTests();
  });

  afterEach(() => {
    field?.dispose();
    field?.element.remove();
    field = null;
    localStorage.clear();
    resetCorePreferencesManagerForTests();
  });

  function create(options?: Parameters<typeof createUserNameField>[0]): UserNameField {
    field = createUserNameField(options);
    return field;
  }

  function type(f: UserNameField, value: string): void {
    f.input.value = value;
    f.input.dispatchEvent(new Event('input'));
  }

  it('UNF-001: renders a labelled input prefilled from preferences', () => {
    setPreferredUserName('Alice');
    const f = create({ testId: 'my-name' });
    document.body.appendChild(f.element);

    const label = f.element.querySelector('label');
    expect(label?.textContent).toBe('Your name');
    expect(label?.htmlFor).toBe(f.input.id);
    expect(f.input.dataset.testid).toBe('my-name');
    expect(f.input.value).toBe('Alice');
    expect(f.input.placeholder).toBe('User');
  });

  it('UNF-002: persists the name on change', () => {
    const f = create();
    type(f, '  Bob  ');
    f.input.dispatchEvent(new Event('change'));
    expect(getPreferredUserName()).toBe('Bob');
    expect(f.input.value).toBe('Bob');
  });

  it('UNF-003: Enter commits, Escape reverts', () => {
    setPreferredUserName('Carol');
    const f = create();

    type(f, 'Dave');
    f.input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(f.input.value).toBe('Carol');
    expect(getPreferredUserName()).toBe('Carol');

    type(f, 'Erin');
    f.input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(getPreferredUserName()).toBe('Erin');
  });

  it('UNF-004: commit() without edits never overwrites a name set elsewhere', () => {
    const f = create();
    setPreferredUserName('Frank');
    // Simulate a stale field value that the user did not type
    f.input.value = '';
    f.commit();
    expect(getPreferredUserName()).toBe('Frank');
  });

  it('UNF-005: live-syncs when the preference changes elsewhere', () => {
    const f = create();
    setPreferredUserName('Grace');
    expect(f.input.value).toBe('Grace');
  });

  it('UNF-006: keydown does not bubble to panel-level handlers', () => {
    const f = create();
    const container = document.createElement('div');
    container.appendChild(f.element);
    let bubbled = false;
    container.addEventListener('keydown', () => {
      bubbled = true;
    });
    f.input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
    expect(bubbled).toBe(false);
  });

  it('UNF-007: clearing the field restores the fallback', () => {
    setPreferredUserName('Heidi');
    const f = create();
    type(f, '   ');
    f.commit();
    expect(getPreferredUserName('Host')).toBe('Host');
  });

  it('UNF-008: inline variant uses custom label', () => {
    const f = create({ label: 'Author', inline: true });
    expect(f.element.querySelector('label')?.textContent).toBe('Author');
  });
});
