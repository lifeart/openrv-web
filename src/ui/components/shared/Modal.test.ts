/**
 * Modal Component Tests
 *
 * Tests for the unified modal system including alert, confirm,
 * and prompt dialogs.
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import { showAlert, showConfirm, showPrompt, showModal, closeModal } from './Modal';

describe('Modal showAlert', () => {
  afterEach(() => {
    closeModal();
  });

  it('MODAL-U001: showAlert creates modal container', () => {
    showAlert('Test message');

    const container = document.getElementById('modal-container');
    expect(container).not.toBeNull();
  });

  it('MODAL-U002: showAlert shows message', () => {
    showAlert('Test alert message');

    const container = document.getElementById('modal-container');
    expect(container?.textContent).toContain('Test alert message');
  });

  it('MODAL-U003: showAlert shows title', () => {
    showAlert('Message', { title: 'Custom Title' });

    const container = document.getElementById('modal-container');
    expect(container?.textContent).toContain('Custom Title');
  });

  it('MODAL-U004: showAlert shows OK button', () => {
    showAlert('Message');

    const container = document.getElementById('modal-container');
    const buttons = container?.querySelectorAll('button');
    const buttonTexts = Array.from(buttons || []).map(b => b.textContent);
    expect(buttonTexts).toContain('OK');
  });

  it('MODAL-U005: showAlert default type is info', () => {
    showAlert('Info message');

    const container = document.getElementById('modal-container');
    // The icon is inside a span (not the close button's inline SVG)
    const iconSpan = container?.querySelector('span[style*="inline-flex"]');
    const svg = iconSpan?.querySelector('svg');
    expect(svg).not.toBeNull();
    // Info icon: circle + 2 lines with y1="16" (unique to info)
    expect(svg?.innerHTML).toContain('y1="16"');
  });

  it('MODAL-U006: showAlert success type shows checkmark', () => {
    showAlert('Success!', { type: 'success' });

    const container = document.getElementById('modal-container');
    const iconSpan = container?.querySelector('span[style*="inline-flex"]');
    const svg = iconSpan?.querySelector('svg');
    expect(svg).not.toBeNull();
    // Check-circle icon: has "polyline" element with points (unique)
    expect(svg?.innerHTML).toContain('points=');
  });

  it('MODAL-U007: showAlert warning type shows warning icon', () => {
    showAlert('Warning!', { type: 'warning' });

    const container = document.getElementById('modal-container');
    const iconSpan = container?.querySelector('span[style*="inline-flex"]');
    const svg = iconSpan?.querySelector('svg');
    expect(svg).not.toBeNull();
    // Warning icon: triangle path with "3.86" (unique to warning)
    expect(svg?.innerHTML).toContain('3.86');
  });

  it('MODAL-U008: showAlert error type shows X icon', () => {
    showAlert('Error!', { type: 'error' });

    const container = document.getElementById('modal-container');
    const iconSpan = container?.querySelector('span[style*="inline-flex"]');
    const svg = iconSpan?.querySelector('svg');
    expect(svg).not.toBeNull();
    // Error icon: crossed lines with x1="15" (unique X pattern, not close button)
    expect(svg?.innerHTML).toContain('x1="15"');
  });

  it('MODAL-U009: showAlert resolves when OK clicked', async () => {
    const promise = showAlert('Message');

    const container = document.getElementById('modal-container');
    const okButton = Array.from(container?.querySelectorAll('button') || [])
      .find(btn => btn.textContent === 'OK');
    okButton?.click();

    await expect(promise).resolves.toBeUndefined();
  });
});

describe('Modal showConfirm', () => {
  afterEach(() => {
    closeModal();
  });

  it('MODAL-U010: showConfirm creates modal', () => {
    showConfirm('Are you sure?');

    const container = document.getElementById('modal-container');
    expect(container).not.toBeNull();
  });

  it('MODAL-U011: showConfirm shows message', () => {
    showConfirm('Confirm this action?');

    const container = document.getElementById('modal-container');
    expect(container?.textContent).toContain('Confirm this action?');
  });

  it('MODAL-U012: showConfirm has Cancel and OK buttons', () => {
    showConfirm('Question');

    const container = document.getElementById('modal-container');
    const buttons = container?.querySelectorAll('button');
    const buttonTexts = Array.from(buttons || []).map(b => b.textContent);

    expect(buttonTexts).toContain('Cancel');
    expect(buttonTexts).toContain('OK');
  });

  it('MODAL-U013: showConfirm resolves true when OK clicked', async () => {
    const promise = showConfirm('Confirm?');

    const container = document.getElementById('modal-container');
    const okButton = Array.from(container?.querySelectorAll('button') || [])
      .find(btn => btn.textContent === 'OK');
    okButton?.click();

    await expect(promise).resolves.toBe(true);
  });

  it('MODAL-U014: showConfirm resolves false when Cancel clicked', async () => {
    const promise = showConfirm('Confirm?');

    const container = document.getElementById('modal-container');
    const cancelButton = Array.from(container?.querySelectorAll('button') || [])
      .find(btn => btn.textContent === 'Cancel');
    cancelButton?.click();

    await expect(promise).resolves.toBe(false);
  });

  it('MODAL-U015: showConfirm accepts custom button text', () => {
    showConfirm('Delete?', {
      confirmText: 'Delete',
      cancelText: 'Keep',
    });

    const container = document.getElementById('modal-container');
    const buttons = container?.querySelectorAll('button');
    const buttonTexts = Array.from(buttons || []).map(b => b.textContent);

    expect(buttonTexts).toContain('Delete');
    expect(buttonTexts).toContain('Keep');
  });
});

describe('Modal showPrompt', () => {
  afterEach(() => {
    closeModal();
  });

  it('MODAL-U020: showPrompt creates modal with input', () => {
    showPrompt('Enter value:');

    const container = document.getElementById('modal-container');
    const input = container?.querySelector('input');
    expect(input).not.toBeNull();
  });

  it('MODAL-U021: showPrompt shows message as label', () => {
    showPrompt('Enter your name:');

    const container = document.getElementById('modal-container');
    expect(container?.textContent).toContain('Enter your name:');
  });

  it('MODAL-U022: showPrompt sets placeholder', () => {
    showPrompt('Enter value:', { placeholder: 'Type here...' });

    const container = document.getElementById('modal-container');
    const input = container?.querySelector('input') as HTMLInputElement;
    expect(input?.placeholder).toBe('Type here...');
  });

  it('MODAL-U023: showPrompt sets default value', () => {
    showPrompt('Enter value:', { defaultValue: 'default text' });

    const container = document.getElementById('modal-container');
    const input = container?.querySelector('input') as HTMLInputElement;
    expect(input?.value).toBe('default text');
  });

  it('MODAL-U024: showPrompt resolves with input value on OK', async () => {
    const promise = showPrompt('Enter value:');

    const container = document.getElementById('modal-container');
    const input = container?.querySelector('input') as HTMLInputElement;
    input.value = 'test input';

    const okButton = Array.from(container?.querySelectorAll('button') || [])
      .find(btn => btn.textContent === 'OK');
    okButton?.click();

    await expect(promise).resolves.toBe('test input');
  });

  it('MODAL-U025: showPrompt resolves with null on Cancel', async () => {
    const promise = showPrompt('Enter value:');

    const container = document.getElementById('modal-container');
    const cancelButton = Array.from(container?.querySelectorAll('button') || [])
      .find(btn => btn.textContent === 'Cancel');
    cancelButton?.click();

    await expect(promise).resolves.toBeNull();
  });
});

describe('Modal showModal', () => {
  afterEach(() => {
    closeModal();
  });

  it('MODAL-U030: showModal displays custom content', () => {
    const content = document.createElement('div');
    content.textContent = 'Custom modal content';

    const { close } = showModal(content);

    const container = document.getElementById('modal-container');
    expect(container?.textContent).toContain('Custom modal content');

    close();
  });

  it('MODAL-U031: showModal returns close function', () => {
    const content = document.createElement('div');
    const { close } = showModal(content);

    expect(typeof close).toBe('function');
    expect(() => close()).not.toThrow();
  });

  it('MODAL-U032: showModal accepts title option', () => {
    const content = document.createElement('div');
    const { close } = showModal(content, { title: 'Custom Title' });

    const container = document.getElementById('modal-container');
    expect(container?.textContent).toContain('Custom Title');

    close();
  });

  it('MODAL-U033: showModal accepts width option', () => {
    const content = document.createElement('div');
    const { close } = showModal(content, { width: '600px' });

    // Modal should be created
    const container = document.getElementById('modal-container');
    expect(container).not.toBeNull();

    close();
  });

  it('MODAL-U034: showModal calls onClose callback', () => {
    const onClose = vi.fn();
    const content = document.createElement('div');
    const { close } = showModal(content, { onClose });

    close();

    expect(onClose).toHaveBeenCalled();
  });
});

describe('Modal closeModal', () => {
  it('MODAL-U040: closeModal can be called without error', () => {
    showAlert('Test');
    expect(() => closeModal()).not.toThrow();
  });

  it('MODAL-U041: closeModal can be called when no modal is open', () => {
    expect(() => closeModal()).not.toThrow();
  });

  it('MODAL-U042: closeModal can be called multiple times', () => {
    showAlert('Test');
    expect(() => {
      closeModal();
      closeModal();
      closeModal();
    }).not.toThrow();
  });
});

describe('Modal keyboard handling', () => {
  afterEach(() => {
    closeModal();
  });

  it('MODAL-U050: alert closes on Escape', async () => {
    const promise = showAlert('Test');

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

    await expect(promise).resolves.toBeUndefined();
  });

  it('MODAL-U051: alert closes on Enter', async () => {
    const promise = showAlert('Test');

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));

    await expect(promise).resolves.toBeUndefined();
  });

  it('MODAL-U052: confirm returns false on Escape', async () => {
    const promise = showConfirm('Test');

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

    await expect(promise).resolves.toBe(false);
  });

  it('MODAL-U053: confirm returns true on Enter', async () => {
    const promise = showConfirm('Test');

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));

    await expect(promise).resolves.toBe(true);
  });

  it('MODAL-U054: prompt returns null on Escape', async () => {
    const promise = showPrompt('Test');

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

    await expect(promise).resolves.toBeNull();
  });

  it('MODAL-U055: prompt returns value on Enter', async () => {
    const promise = showPrompt('Test', { defaultValue: 'hello' });

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));

    await expect(promise).resolves.toBe('hello');
  });

  it('MODAL-U056: custom modal closes on Escape', () => {
    const content = document.createElement('div');
    showModal(content);

    const container = document.getElementById('modal-container');
    expect(container?.style.display).toBe('flex');

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

    expect(container?.style.display).toBe('none');
  });
});

describe('Modal event listener cleanup', () => {
  afterEach(() => {
    closeModal();
  });

  it('MODAL-U056: alert removes keydown listener when OK clicked', async () => {
    const addSpy = vi.spyOn(document, 'addEventListener');
    const removeSpy = vi.spyOn(document, 'removeEventListener');

    const promise = showAlert('Test');
    const keydownAdds = addSpy.mock.calls.filter(([type]) => type === 'keydown');
    expect(keydownAdds).toHaveLength(1);

    const container = document.getElementById('modal-container');
    const okButton = Array.from(container?.querySelectorAll('button') || [])
      .find(btn => btn.textContent === 'OK');
    okButton?.click();

    await promise;
    const keydownRemoves = removeSpy.mock.calls.filter(([type]) => type === 'keydown');
    expect(keydownRemoves).toHaveLength(1);

    addSpy.mockRestore();
    removeSpy.mockRestore();
  });

  it('MODAL-U057: confirm removes keydown listener when Cancel clicked', async () => {
    const addSpy = vi.spyOn(document, 'addEventListener');
    const removeSpy = vi.spyOn(document, 'removeEventListener');

    const promise = showConfirm('Test');
    const keydownAdds = addSpy.mock.calls.filter(([type]) => type === 'keydown');
    expect(keydownAdds).toHaveLength(1);

    const container = document.getElementById('modal-container');
    const cancelButton = Array.from(container?.querySelectorAll('button') || [])
      .find(btn => btn.textContent === 'Cancel');
    cancelButton?.click();

    await promise;
    const keydownRemoves = removeSpy.mock.calls.filter(([type]) => type === 'keydown');
    expect(keydownRemoves).toHaveLength(1);

    addSpy.mockRestore();
    removeSpy.mockRestore();
  });

  it('MODAL-U058: prompt removes keydown listener when OK clicked', async () => {
    const addSpy = vi.spyOn(document, 'addEventListener');
    const removeSpy = vi.spyOn(document, 'removeEventListener');

    const promise = showPrompt('Test');
    const keydownAdds = addSpy.mock.calls.filter(([type]) => type === 'keydown');
    expect(keydownAdds).toHaveLength(1);

    const container = document.getElementById('modal-container');
    const okButton = Array.from(container?.querySelectorAll('button') || [])
      .find(btn => btn.textContent === 'OK');
    okButton?.click();

    await promise;
    const keydownRemoves = removeSpy.mock.calls.filter(([type]) => type === 'keydown');
    expect(keydownRemoves).toHaveLength(1);

    addSpy.mockRestore();
    removeSpy.mockRestore();
  });
});

describe('Modal options', () => {
  afterEach(() => {
    closeModal();
  });

  it('MODAL-U060: showAlert uses default title Alert', () => {
    showAlert('Test');

    const container = document.getElementById('modal-container');
    expect(container?.textContent).toContain('Alert');
  });

  it('MODAL-U061: showConfirm uses default title Confirm', () => {
    showConfirm('Test');

    const container = document.getElementById('modal-container');
    expect(container?.textContent).toContain('Confirm');
  });

  it('MODAL-U062: showPrompt uses default title Input', () => {
    showPrompt('Test');

    const container = document.getElementById('modal-container');
    expect(container?.textContent).toContain('Input');
  });
});
