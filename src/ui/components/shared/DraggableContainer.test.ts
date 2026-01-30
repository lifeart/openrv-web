/**
 * DraggableContainer Component Tests
 *
 * Tests for the draggable overlay container used for scopes and panels.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  createDraggableContainer,
  createControlButton,
  DraggableContainer,
} from './DraggableContainer';

describe('createDraggableContainer', () => {
  let container: DraggableContainer;

  afterEach(() => {
    container?.dispose();
  });

  describe('basic creation', () => {
    it('DRAG-U001: creates container element', () => {
      container = createDraggableContainer({ id: 'test', title: 'Test' });
      expect(container.element).toBeInstanceOf(HTMLElement);
    });

    it('DRAG-U002: element has correct class', () => {
      container = createDraggableContainer({ id: 'scope', title: 'Scope' });
      expect(container.element.className).toContain('scope-container');
      expect(container.element.className).toContain('draggable-scope-container');
    });

    it('DRAG-U003: element has data-testid', () => {
      container = createDraggableContainer({ id: 'test', title: 'Test' });
      expect(container.element.dataset.testid).toBe('test-container');
    });

    it('DRAG-U004: custom testId overrides default', () => {
      container = createDraggableContainer({
        id: 'test',
        title: 'Test',
        testId: 'custom-testid',
      });
      expect(container.element.dataset.testid).toBe('custom-testid');
    });

    it('DRAG-U005: element is hidden by default', () => {
      container = createDraggableContainer({ id: 'test', title: 'Test' });
      expect(container.isVisible()).toBe(false);
    });

    it('DRAG-U006: element has absolute positioning', () => {
      container = createDraggableContainer({ id: 'test', title: 'Test' });
      expect(container.element.style.position).toBe('absolute');
    });
  });

  describe('header and controls', () => {
    it('DRAG-U010: has header element', () => {
      container = createDraggableContainer({ id: 'test', title: 'Test' });
      expect(container.header).toBeInstanceOf(HTMLElement);
    });

    it('DRAG-U011: header has title text', () => {
      container = createDraggableContainer({ id: 'test', title: 'My Title' });
      expect(container.header.textContent).toContain('My Title');
    });

    it('DRAG-U012: header has data-testid', () => {
      container = createDraggableContainer({ id: 'test', title: 'Test' });
      expect(container.header.dataset.testid).toBe('test-header');
    });

    it('DRAG-U013: has controls element', () => {
      container = createDraggableContainer({ id: 'test', title: 'Test' });
      expect(container.controls).toBeInstanceOf(HTMLElement);
    });

    it('DRAG-U014: controls contain close button', () => {
      container = createDraggableContainer({ id: 'test', title: 'Test' });
      const closeBtn = container.controls.querySelector('button');
      expect(closeBtn).not.toBeNull();
    });

    it('DRAG-U015: close button has data-testid', () => {
      container = createDraggableContainer({ id: 'test', title: 'Test' });
      const closeBtn = container.controls.querySelector('[data-testid="test-close-button"]');
      expect(closeBtn).not.toBeNull();
    });
  });

  describe('content area', () => {
    it('DRAG-U020: has content element', () => {
      container = createDraggableContainer({ id: 'test', title: 'Test' });
      expect(container.content).toBeInstanceOf(HTMLElement);
    });

    it('DRAG-U021: content has correct class', () => {
      container = createDraggableContainer({ id: 'scope', title: 'Scope' });
      expect(container.content.className).toBe('scope-content');
    });

    it('DRAG-U022: content can have children appended', () => {
      container = createDraggableContainer({ id: 'test', title: 'Test' });
      const child = document.createElement('div');
      child.textContent = 'Child content';
      container.content.appendChild(child);
      expect(container.content.textContent).toContain('Child content');
    });
  });

  describe('show/hide', () => {
    it('DRAG-U030: show makes container visible', () => {
      container = createDraggableContainer({ id: 'test', title: 'Test' });
      container.show();
      expect(container.isVisible()).toBe(true);
    });

    it('DRAG-U031: show sets display to block', () => {
      container = createDraggableContainer({ id: 'test', title: 'Test' });
      container.show();
      expect(container.element.style.display).toBe('block');
    });

    it('DRAG-U032: hide makes container not visible', () => {
      container = createDraggableContainer({ id: 'test', title: 'Test' });
      container.show();
      container.hide();
      expect(container.isVisible()).toBe(false);
    });

    it('DRAG-U033: hide sets display to none', () => {
      container = createDraggableContainer({ id: 'test', title: 'Test' });
      container.show();
      container.hide();
      expect(container.element.style.display).toBe('none');
    });

    it('DRAG-U034: show twice does not double show', () => {
      container = createDraggableContainer({ id: 'test', title: 'Test' });
      container.show();
      container.show();
      expect(container.isVisible()).toBe(true);
    });

    it('DRAG-U035: hide twice does not error', () => {
      container = createDraggableContainer({ id: 'test', title: 'Test' });
      container.hide();
      container.hide();
      expect(container.isVisible()).toBe(false);
    });
  });

  describe('onClose callback', () => {
    it('DRAG-U040: close button calls onClose', () => {
      const onClose = vi.fn();
      container = createDraggableContainer({ id: 'test', title: 'Test', onClose });
      const closeBtn = container.controls.querySelector('button') as HTMLButtonElement;
      closeBtn.click();
      expect(onClose).toHaveBeenCalled();
    });

    it('DRAG-U041: close button without onClose does not error', () => {
      container = createDraggableContainer({ id: 'test', title: 'Test' });
      const closeBtn = container.controls.querySelector('button') as HTMLButtonElement;
      expect(() => closeBtn.click()).not.toThrow();
    });
  });

  describe('position management', () => {
    it('DRAG-U050: getPosition returns position object', () => {
      container = createDraggableContainer({ id: 'test', title: 'Test' });
      const pos = container.getPosition();
      expect(pos).toHaveProperty('x');
      expect(pos).toHaveProperty('y');
    });

    it('DRAG-U051: setPosition sets element position', () => {
      container = createDraggableContainer({ id: 'test', title: 'Test' });
      container.setPosition(100, 200);
      expect(container.element.style.top).toBe('200px');
      expect(container.element.style.left).toBe('100px');
    });

    it('DRAG-U052: setPosition clears right/bottom styles', () => {
      container = createDraggableContainer({
        id: 'test',
        title: 'Test',
        initialPosition: { right: '10px', bottom: '10px' },
      });
      container.setPosition(50, 50);
      expect(container.element.style.right).toBe('');
      expect(container.element.style.bottom).toBe('');
    });

    it('DRAG-U053: resetPosition restores initial position', () => {
      container = createDraggableContainer({
        id: 'test',
        title: 'Test',
        initialPosition: { top: '20px', left: '30px' },
      });
      container.setPosition(100, 100);
      container.resetPosition();
      expect(container.element.style.top).toBe('20px');
      expect(container.element.style.left).toBe('30px');
    });
  });

  describe('initial position', () => {
    it('DRAG-U060: initialPosition.top sets top style', () => {
      container = createDraggableContainer({
        id: 'test',
        title: 'Test',
        initialPosition: { top: '50px' },
      });
      expect(container.element.style.top).toBe('50px');
    });

    it('DRAG-U061: initialPosition.left sets left style', () => {
      container = createDraggableContainer({
        id: 'test',
        title: 'Test',
        initialPosition: { left: '100px' },
      });
      expect(container.element.style.left).toBe('100px');
    });

    it('DRAG-U062: initialPosition.bottom sets bottom style', () => {
      container = createDraggableContainer({
        id: 'test',
        title: 'Test',
        initialPosition: { bottom: '20px' },
      });
      expect(container.element.style.bottom).toBe('20px');
    });

    it('DRAG-U063: initialPosition.right sets right style', () => {
      container = createDraggableContainer({
        id: 'test',
        title: 'Test',
        initialPosition: { right: '30px' },
      });
      expect(container.element.style.right).toBe('30px');
    });

    it('DRAG-U064: default initialPosition is top/left 10px', () => {
      container = createDraggableContainer({ id: 'test', title: 'Test' });
      expect(container.element.style.top).toBe('10px');
      expect(container.element.style.left).toBe('10px');
    });
  });

  describe('zIndex', () => {
    it('DRAG-U070: zIndex option sets z-index', () => {
      container = createDraggableContainer({ id: 'test', title: 'Test', zIndex: 500 });
      expect(container.element.style.zIndex).toBe('500');
    });

    it('DRAG-U071: default zIndex is 100', () => {
      container = createDraggableContainer({ id: 'test', title: 'Test' });
      expect(container.element.style.zIndex).toBe('100');
    });
  });

  describe('footer', () => {
    it('DRAG-U080: footer is null initially', () => {
      container = createDraggableContainer({ id: 'test', title: 'Test' });
      expect(container.footer).toBeNull();
    });

    it('DRAG-U081: setFooter adds footer element', () => {
      container = createDraggableContainer({ id: 'test', title: 'Test' });
      const footer = document.createElement('div');
      footer.textContent = 'Footer content';
      container.setFooter(footer);
      expect(container.element.textContent).toContain('Footer content');
    });

    it('DRAG-U082: setFooter replaces existing footer', () => {
      container = createDraggableContainer({ id: 'test', title: 'Test' });
      const footer1 = document.createElement('div');
      footer1.textContent = 'Footer 1';
      const footer2 = document.createElement('div');
      footer2.textContent = 'Footer 2';

      container.setFooter(footer1);
      container.setFooter(footer2);

      expect(container.element.textContent).toContain('Footer 2');
      expect(container.element.textContent).not.toContain('Footer 1');
    });
  });

  describe('dispose', () => {
    it('DRAG-U090: dispose can be called without error', () => {
      container = createDraggableContainer({ id: 'test', title: 'Test' });
      expect(() => container.dispose()).not.toThrow();
    });

    it('DRAG-U091: dispose can be called multiple times', () => {
      container = createDraggableContainer({ id: 'test', title: 'Test' });
      expect(() => {
        container.dispose();
        container.dispose();
      }).not.toThrow();
    });
  });

  describe('header dragging behavior', () => {
    it('DRAG-U100: header has grab cursor for dragging', () => {
      container = createDraggableContainer({ id: 'test', title: 'Test' });
      expect(container.header.style.cursor).toBe('grab');
    });

    it('DRAG-U101: header has draggable-header class', () => {
      container = createDraggableContainer({ id: 'test', title: 'Test' });
      expect(container.header.className).toContain('draggable-header');
    });

    it('DRAG-U102: container has user-select none to prevent text selection during drag', () => {
      container = createDraggableContainer({ id: 'test', title: 'Test' });
      expect(container.element.style.userSelect).toBe('none');
    });
  });

  describe('structure', () => {
    it('DRAG-U103: container contains header, then content', () => {
      container = createDraggableContainer({ id: 'test', title: 'Test' });
      const children = Array.from(container.element.children);
      expect(children[0]).toBe(container.header);
      expect(children[1]).toBe(container.content);
    });

    it('DRAG-U104: header contains title and controls', () => {
      container = createDraggableContainer({ id: 'test', title: 'Test' });
      expect(container.header.contains(container.controls)).toBe(true);
    });
  });
});

describe('createControlButton', () => {
  it('DRAG-U110: creates button element', () => {
    const btn = createControlButton('X', 'Close');
    expect(btn).toBeInstanceOf(HTMLButtonElement);
  });

  it('DRAG-U111: button has text content', () => {
    const btn = createControlButton('X', 'Close');
    expect(btn.textContent).toBe('X');
  });

  it('DRAG-U112: button has title attribute', () => {
    const btn = createControlButton('X', 'Close tooltip');
    expect(btn.title).toBe('Close tooltip');
  });

  it('DRAG-U113: button has cursor pointer style', () => {
    const btn = createControlButton('X', 'Close');
    expect(btn.style.cursor).toBe('pointer');
  });

  it('DRAG-U114: button has border-radius style', () => {
    const btn = createControlButton('X', 'Close');
    expect(btn.style.borderRadius).toBe('2px');
  });

  it('DRAG-U115: mouseenter changes background', () => {
    const btn = createControlButton('X', 'Close');
    btn.dispatchEvent(new MouseEvent('mouseenter'));
    expect(btn.style.background).toContain('var(--bg-hover)');
  });

  it('DRAG-U116: mouseleave restores background', () => {
    const btn = createControlButton('X', 'Close');
    btn.dispatchEvent(new MouseEvent('mouseenter'));
    btn.dispatchEvent(new MouseEvent('mouseleave'));
    expect(btn.style.background).toContain('var(--overlay-border)');
  });
});
