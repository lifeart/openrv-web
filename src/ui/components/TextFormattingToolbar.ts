/**
 * TextFormattingToolbar - B/I/U toggle buttons for text annotation styling
 *
 * Provides Bold, Italic, and Underline toggle buttons that update
 * the currently selected or most recently created text annotation.
 */

import { EventEmitter, EventMap } from '../../utils/EventEmitter';
import { PaintEngine, PaintTool } from '../../paint/PaintEngine';
import { TextAnnotation } from '../../paint/types';
import { getIconSvg } from './shared/Icons';
import { createIconButton as sharedCreateIconButton, setButtonActive } from './shared/Button';

export interface TextFormattingToolbarEvents extends EventMap {
  formattingChanged: { bold: boolean; italic: boolean; underline: boolean };
}

interface TextFormattingState {
  bold: boolean;
  italic: boolean;
  underline: boolean;
}

export class TextFormattingToolbar extends EventEmitter<TextFormattingToolbarEvents> {
  private container: HTMLElement;
  private paintEngine: PaintEngine;
  private getCurrentFrame: () => number;

  private boldButton!: HTMLButtonElement;
  private italicButton!: HTMLButtonElement;
  private underlineButton!: HTMLButtonElement;

  // Track the currently selected/active text annotation
  private activeTextAnnotationId: string | null = null;
  private activeTextAnnotationFrame: number | null = null;
  private unsubscribers: (() => void)[] = [];

  // Current formatting state
  private state: TextFormattingState = {
    bold: false,
    italic: false,
    underline: false,
  };

  constructor(paintEngine: PaintEngine, getCurrentFrame: () => number) {
    super();
    this.paintEngine = paintEngine;
    this.getCurrentFrame = getCurrentFrame;

    this.container = document.createElement('div');
    this.container.className = 'text-formatting-toolbar';
    this.container.dataset.testid = 'text-formatting-toolbar';
    this.container.style.cssText = `
      display: none;
      align-items: center;
      gap: 2px;
    `;

    this.createButtons();
    this.bindEvents();
  }

  private createButtons(): void {
    // Bold button
    this.boldButton = this.createToggleButton('bold', 'Bold (Ctrl+B)', () => {
      this.toggleBold();
    });
    this.boldButton.dataset.testid = 'text-format-bold';
    this.container.appendChild(this.boldButton);

    // Italic button
    this.italicButton = this.createToggleButton('italic', 'Italic (Ctrl+I)', () => {
      this.toggleItalic();
    });
    this.italicButton.dataset.testid = 'text-format-italic';
    this.container.appendChild(this.italicButton);

    // Underline button
    this.underlineButton = this.createToggleButton('underline', 'Underline (Ctrl+U)', () => {
      this.toggleUnderline();
    });
    this.underlineButton.dataset.testid = 'text-format-underline';
    this.container.appendChild(this.underlineButton);
  }

  private createToggleButton(
    icon: 'bold' | 'italic' | 'underline',
    title: string,
    onClick: () => void
  ): HTMLButtonElement {
    return sharedCreateIconButton(getIconSvg(icon, 'sm'), onClick, {
      variant: 'icon',
      size: 'sm',
      title,
    });
  }

  private bindEvents(): void {
    // Listen for tool changes to show/hide toolbar
    this.unsubscribers.push(
      this.paintEngine.on('toolChanged', (tool: PaintTool) => {
        this.updateVisibility(tool);
      }),
      // Listen for new annotations to track newly created text
      this.paintEngine.on('strokeAdded', (annotation) => {
        if (annotation.type === 'text') {
          this.setActiveTextAnnotation(annotation as TextAnnotation);
        }
      }),
      // Listen for annotation changes to refresh state
      this.paintEngine.on('annotationsChanged', () => {
        this.refreshStateFromActiveAnnotation();
      }),
    );
  }

  private updateVisibility(tool: PaintTool): void {
    const isTextTool = tool === 'text';
    this.container.style.display = isTextTool ? 'flex' : 'none';

    if (isTextTool) {
      // Try to find the most recent text annotation on the current frame
      this.findAndSetActiveTextAnnotation();
    }
  }

  private findAndSetActiveTextAnnotation(): void {
    const frame = this.getCurrentFrame();
    const annotations = this.paintEngine.getAnnotationsForFrame(frame);

    // Find the most recent text annotation on this frame
    const textAnnotations = annotations.filter(
      (a): a is TextAnnotation => a.type === 'text'
    );

    if (textAnnotations.length > 0) {
      // Use the most recent one (last in array)
      const lastTextAnnotation = textAnnotations[textAnnotations.length - 1];
      if (lastTextAnnotation) {
        this.setActiveTextAnnotation(lastTextAnnotation);
      }
    } else {
      // No text annotations on this frame - reset state
      this.clearActiveTextAnnotation();
    }
  }

  private setActiveTextAnnotation(annotation: TextAnnotation): void {
    this.activeTextAnnotationId = annotation.id;
    this.activeTextAnnotationFrame = annotation.frame;

    // Update state from annotation
    this.state = {
      bold: annotation.bold ?? false,
      italic: annotation.italic ?? false,
      underline: annotation.underline ?? false,
    };

    this.updateButtonStates();
  }

  private clearActiveTextAnnotation(): void {
    this.activeTextAnnotationId = null;
    this.activeTextAnnotationFrame = null;
    this.state = { bold: false, italic: false, underline: false };
    this.updateButtonStates();
  }

  private refreshStateFromActiveAnnotation(): void {
    if (!this.activeTextAnnotationId || this.activeTextAnnotationFrame === null) {
      return;
    }

    const annotations = this.paintEngine.getAnnotationsForFrame(
      this.activeTextAnnotationFrame
    );
    const annotation = annotations.find(
      (a) => a.id === this.activeTextAnnotationId && a.type === 'text'
    ) as TextAnnotation | undefined;

    if (annotation) {
      this.state = {
        bold: annotation.bold ?? false,
        italic: annotation.italic ?? false,
        underline: annotation.underline ?? false,
      };
      this.updateButtonStates();
    }
  }

  private updateButtonStates(): void {
    this.updateButtonState(this.boldButton, this.state.bold);
    this.updateButtonState(this.italicButton, this.state.italic);
    this.updateButtonState(this.underlineButton, this.state.underline);
  }

  private updateButtonState(button: HTMLButtonElement, isActive: boolean): void {
    setButtonActive(button, isActive, 'icon');
  }

  private applyFormattingToActiveAnnotation(): void {
    if (!this.activeTextAnnotationId || this.activeTextAnnotationFrame === null) {
      return;
    }

    this.paintEngine.updateTextAnnotation(
      this.activeTextAnnotationFrame,
      this.activeTextAnnotationId,
      {
        bold: this.state.bold,
        italic: this.state.italic,
        underline: this.state.underline,
      }
    );

    this.emit('formattingChanged', { ...this.state });
  }

  /**
   * Toggle bold state
   */
  toggleBold(): void {
    this.state.bold = !this.state.bold;
    this.updateButtonStates();
    this.applyFormattingToActiveAnnotation();
  }

  /**
   * Toggle italic state
   */
  toggleItalic(): void {
    this.state.italic = !this.state.italic;
    this.updateButtonStates();
    this.applyFormattingToActiveAnnotation();
  }

  /**
   * Toggle underline state
   */
  toggleUnderline(): void {
    this.state.underline = !this.state.underline;
    this.updateButtonStates();
    this.applyFormattingToActiveAnnotation();
  }

  /**
   * Set the active text annotation externally
   */
  setActiveAnnotation(id: string, frame: number): void {
    const annotations = this.paintEngine.getAnnotationsForFrame(frame);
    const annotation = annotations.find(
      (a) => a.id === id && a.type === 'text'
    ) as TextAnnotation | undefined;

    if (annotation) {
      this.setActiveTextAnnotation(annotation);
    }
  }

  /**
   * Get current formatting state
   */
  getState(): TextFormattingState {
    return { ...this.state };
  }

  /**
   * Check if toolbar is visible
   */
  isVisible(): boolean {
    return this.container.style.display !== 'none';
  }

  /**
   * Show the toolbar
   */
  show(): void {
    this.container.style.display = 'flex';
    this.findAndSetActiveTextAnnotation();
  }

  /**
   * Hide the toolbar
   */
  hide(): void {
    this.container.style.display = 'none';
  }

  /**
   * Render the toolbar element
   */
  render(): HTMLElement {
    // Initial visibility based on current tool
    this.updateVisibility(this.paintEngine.tool);
    return this.container;
  }

  /**
   * Handle keyboard shortcuts
   */
  handleKeyboard(key: string, ctrlKey: boolean): boolean {
    if (!this.isVisible()) return false;

    if (ctrlKey) {
      switch (key.toLowerCase()) {
        case 'b':
          this.toggleBold();
          return true;
        case 'i':
          this.toggleItalic();
          return true;
        case 'u':
          this.toggleUnderline();
          return true;
      }
    }
    return false;
  }

  dispose(): void {
    for (const unsub of this.unsubscribers) {
      unsub();
    }
    this.unsubscribers = [];
    this.removeAllListeners();
  }
}
