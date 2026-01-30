import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { TextFormattingToolbar } from './TextFormattingToolbar';
import { PaintEngine } from '../../paint/PaintEngine';

describe('TextFormattingToolbar', () => {
  let toolbar: TextFormattingToolbar;
  let paintEngine: PaintEngine;
  let getCurrentFrame: () => number;
  let currentFrame: number;

  beforeEach(() => {
    currentFrame = 0;
    getCurrentFrame = () => currentFrame;
    paintEngine = new PaintEngine();
    toolbar = new TextFormattingToolbar(paintEngine, getCurrentFrame);
  });

  afterEach(() => {
    toolbar.dispose();
  });

  describe('rendering', () => {
    it('should render the toolbar container', () => {
      const element = toolbar.render();
      expect(element).toBeInstanceOf(HTMLElement);
      expect(element.dataset.testid).toBe('text-formatting-toolbar');
    });

    it('should have Bold, Italic, and Underline buttons', () => {
      const element = toolbar.render();
      const boldBtn = element.querySelector('[data-testid="text-format-bold"]');
      const italicBtn = element.querySelector('[data-testid="text-format-italic"]');
      const underlineBtn = element.querySelector('[data-testid="text-format-underline"]');

      expect(boldBtn).toBeTruthy();
      expect(italicBtn).toBeTruthy();
      expect(underlineBtn).toBeTruthy();
    });

    it('should be hidden by default when tool is not text', () => {
      paintEngine.tool = 'none';
      const element = toolbar.render();
      expect(element.style.display).toBe('none');
    });

    it('should be visible when text tool is selected', () => {
      paintEngine.tool = 'text';
      const element = toolbar.render();
      expect(element.style.display).toBe('flex');
    });
  });

  describe('visibility', () => {
    it('should show toolbar when text tool is selected', () => {
      toolbar.render();
      paintEngine.tool = 'text';
      expect(toolbar.isVisible()).toBe(true);
    });

    it('should hide toolbar when switching away from text tool', () => {
      toolbar.render();
      paintEngine.tool = 'text';
      expect(toolbar.isVisible()).toBe(true);

      paintEngine.tool = 'pen';
      expect(toolbar.isVisible()).toBe(false);
    });
  });

  describe('toggle functions', () => {
    it('should toggle bold state', () => {
      toolbar.render();
      expect(toolbar.getState().bold).toBe(false);
      toolbar.toggleBold();
      expect(toolbar.getState().bold).toBe(true);
      toolbar.toggleBold();
      expect(toolbar.getState().bold).toBe(false);
    });

    it('should toggle italic state', () => {
      toolbar.render();
      expect(toolbar.getState().italic).toBe(false);
      toolbar.toggleItalic();
      expect(toolbar.getState().italic).toBe(true);
      toolbar.toggleItalic();
      expect(toolbar.getState().italic).toBe(false);
    });

    it('should toggle underline state', () => {
      toolbar.render();
      expect(toolbar.getState().underline).toBe(false);
      toolbar.toggleUnderline();
      expect(toolbar.getState().underline).toBe(true);
      toolbar.toggleUnderline();
      expect(toolbar.getState().underline).toBe(false);
    });
  });

  describe('text annotation integration', () => {
    it('should update text annotation when formatting is applied', () => {
      toolbar.render();
      paintEngine.tool = 'text';

      // Add a text annotation
      const annotation = paintEngine.addText(0, { x: 0.5, y: 0.5 }, 'Test text');
      expect(annotation.bold).toBeUndefined();

      // Toggle bold
      toolbar.toggleBold();

      // Check annotation was updated
      const annotations = paintEngine.getAnnotationsForFrame(0);
      const textAnnotation = annotations.find(a => a.id === annotation.id);
      expect(textAnnotation?.type).toBe('text');
      if (textAnnotation?.type === 'text') {
        expect(textAnnotation.bold).toBe(true);
      }
    });

    it('should load state from newly created text annotation', () => {
      toolbar.render();
      paintEngine.tool = 'text';

      // Add a text annotation with formatting
      paintEngine.addText(0, { x: 0.5, y: 0.5 }, 'Formatted text', 24, {
        bold: true,
        italic: true,
      });

      // State should reflect the annotation
      expect(toolbar.getState().bold).toBe(true);
      expect(toolbar.getState().italic).toBe(true);
      expect(toolbar.getState().underline).toBe(false);
    });
  });

  describe('button click handling', () => {
    it('should toggle bold when bold button is clicked', () => {
      const element = toolbar.render();
      paintEngine.tool = 'text';

      const boldBtn = element.querySelector('[data-testid="text-format-bold"]') as HTMLButtonElement;
      boldBtn.click();

      expect(toolbar.getState().bold).toBe(true);
    });

    it('should toggle italic when italic button is clicked', () => {
      const element = toolbar.render();
      paintEngine.tool = 'text';

      const italicBtn = element.querySelector('[data-testid="text-format-italic"]') as HTMLButtonElement;
      italicBtn.click();

      expect(toolbar.getState().italic).toBe(true);
    });

    it('should toggle underline when underline button is clicked', () => {
      const element = toolbar.render();
      paintEngine.tool = 'text';

      const underlineBtn = element.querySelector('[data-testid="text-format-underline"]') as HTMLButtonElement;
      underlineBtn.click();

      expect(toolbar.getState().underline).toBe(true);
    });
  });

  describe('keyboard shortcuts', () => {
    it('should handle Ctrl+B for bold', () => {
      toolbar.render();
      paintEngine.tool = 'text';

      const handled = toolbar.handleKeyboard('b', true);
      expect(handled).toBe(true);
      expect(toolbar.getState().bold).toBe(true);
    });

    it('should handle Ctrl+I for italic', () => {
      toolbar.render();
      paintEngine.tool = 'text';

      const handled = toolbar.handleKeyboard('i', true);
      expect(handled).toBe(true);
      expect(toolbar.getState().italic).toBe(true);
    });

    it('should handle Ctrl+U for underline', () => {
      toolbar.render();
      paintEngine.tool = 'text';

      const handled = toolbar.handleKeyboard('u', true);
      expect(handled).toBe(true);
      expect(toolbar.getState().underline).toBe(true);
    });

    it('should not handle shortcuts when not visible', () => {
      toolbar.render();
      paintEngine.tool = 'pen'; // Not text tool

      const handled = toolbar.handleKeyboard('b', true);
      expect(handled).toBe(false);
    });

    it('should not handle shortcuts without Ctrl key', () => {
      toolbar.render();
      paintEngine.tool = 'text';

      const handled = toolbar.handleKeyboard('b', false);
      expect(handled).toBe(false);
    });
  });

  describe('events', () => {
    it('should emit formattingChanged event when format changes', () => {
      toolbar.render();
      paintEngine.tool = 'text';

      // Need to add a text annotation for event to be emitted
      paintEngine.addText(0, { x: 0.5, y: 0.5 }, 'Test text');

      const callback = vi.fn();
      toolbar.on('formattingChanged', callback);

      toolbar.toggleBold();

      expect(callback).toHaveBeenCalledWith({
        bold: true,
        italic: false,
        underline: false,
      });
    });
  });

  describe('button active state', () => {
    it('should show active state on bold button when bold is enabled', () => {
      const element = toolbar.render();
      paintEngine.tool = 'text';

      const boldBtn = element.querySelector('[data-testid="text-format-bold"]') as HTMLButtonElement;

      // Initially not active
      expect(boldBtn.classList.contains('active')).toBe(false);

      // Click to enable
      boldBtn.click();

      // Now should be active
      expect(boldBtn.classList.contains('active')).toBe(true);
      expect(boldBtn.style.color).toBe('var(--accent-primary)');
    });
  });
});
