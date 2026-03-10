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
      const textAnnotation = annotations.find((a) => a.id === annotation.id);
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

  describe('issue #105: Ctrl+shortcut hints in button titles', () => {
    it('TFT-105a: bold button title should contain Ctrl+B', () => {
      const element = toolbar.render();
      const boldBtn = element.querySelector('[data-testid="text-format-bold"]') as HTMLButtonElement;
      expect(boldBtn.title).toBe('Bold (Ctrl+B)');
    });

    it('TFT-105b: italic button title should contain Ctrl+I', () => {
      const element = toolbar.render();
      const italicBtn = element.querySelector('[data-testid="text-format-italic"]') as HTMLButtonElement;
      expect(italicBtn.title).toBe('Italic (Ctrl+I)');
    });

    it('TFT-105c: underline button title should contain Ctrl+U', () => {
      const element = toolbar.render();
      const underlineBtn = element.querySelector('[data-testid="text-format-underline"]') as HTMLButtonElement;
      expect(underlineBtn.title).toBe('Underline (Ctrl+U)');
    });
  });

  describe('issue #106: annotationSelected event wires to toolbar', () => {
    it('TFT-106a: setActiveAnnotation updates toolbar state from annotation', () => {
      toolbar.render();
      paintEngine.tool = 'text';

      // Add two annotations with different formatting
      paintEngine.addText(0, { x: 0.2, y: 0.2 }, 'Plain');
      const formatted = paintEngine.addText(0, { x: 0.5, y: 0.5 }, 'Test', 24, {
        bold: true,
        italic: true,
        underline: false,
      });

      // Toolbar state reflects the last-added annotation (formatted)
      expect(toolbar.getState().bold).toBe(true);
      expect(toolbar.getState().italic).toBe(true);

      // Now select the plain annotation (no bold/italic)
      const annotations = paintEngine.getAnnotationsForFrame(0);
      const plainAnn = annotations.find((a) => a.type === 'text' && a.id !== formatted.id);
      expect(plainAnn).toBeTruthy();
      if (plainAnn) {
        toolbar.setActiveAnnotation(plainAnn.id, 0);
        expect(toolbar.getState().bold).toBe(false);
        expect(toolbar.getState().italic).toBe(false);
      }

      // Now select the formatted annotation again
      toolbar.setActiveAnnotation(formatted.id, 0);
      expect(toolbar.getState().bold).toBe(true);
      expect(toolbar.getState().italic).toBe(true);
      expect(toolbar.getState().underline).toBe(false);
    });

    it('TFT-106b: annotationSelected event triggers setActiveAnnotation on toolbar', () => {
      toolbar.render();
      paintEngine.tool = 'text';

      // Add two text annotations with different formatting
      paintEngine.addText(0, { x: 0.2, y: 0.2 }, 'First', 24, { bold: true });
      const second = paintEngine.addText(0, { x: 0.8, y: 0.8 }, 'Second', 24, {
        italic: true,
      });

      // Toolbar state should reflect the last-added annotation (Second)
      expect(toolbar.getState().italic).toBe(true);
      expect(toolbar.getState().bold).toBe(false);

      // Emit annotationSelected for the first annotation
      const annotations = paintEngine.getAnnotationsForFrame(0);
      const firstAnn = annotations.find((a) => a.type === 'text' && a.id !== second.id);
      expect(firstAnn).toBeTruthy();
      if (firstAnn) {
        paintEngine.emit('annotationSelected', { annotation: firstAnn as any, frame: 0 });
        // Toolbar should now reflect the first annotation's formatting
        expect(toolbar.getState().bold).toBe(true);
        expect(toolbar.getState().italic).toBe(false);
      }
    });

    it('TFT-106c: null annotationSelected does not crash', () => {
      toolbar.render();
      paintEngine.tool = 'text';
      // Should not throw
      paintEngine.emit('annotationSelected', null);
      expect(toolbar.getState().bold).toBe(false);
    });
  });
});
