/**
 * PaintToolbar Component Tests
 *
 * Tests for the paint toolbar with tool buttons, color picker, and brush settings.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PaintToolbar } from './PaintToolbar';
import { PaintEngine } from '../../paint/PaintEngine';

describe('PaintToolbar', () => {
  let toolbar: PaintToolbar;
  let paintEngine: PaintEngine;

  beforeEach(() => {
    paintEngine = new PaintEngine();
    toolbar = new PaintToolbar(paintEngine);
  });

  afterEach(() => {
    toolbar.dispose();
  });

  describe('initialization', () => {
    it('PAINT-U001: creates PaintToolbar instance', () => {
      expect(toolbar).toBeInstanceOf(PaintToolbar);
    });
  });

  describe('render', () => {
    it('PAINT-U010: render returns container element', () => {
      const el = toolbar.render();
      expect(el).toBeInstanceOf(HTMLElement);
    });

    it('PAINT-U011: container has paint-toolbar class', () => {
      const el = toolbar.render();
      expect(el.className).toBe('paint-toolbar');
    });

    it('PAINT-U012: container has flex display', () => {
      const el = toolbar.render();
      expect(el.style.display).toBe('flex');
    });
  });

  describe('tool buttons', () => {
    it('PAINT-U020: has pan tool button', () => {
      const el = toolbar.render();
      const btn = el.querySelector('[data-testid="paint-tool-none"]');
      expect(btn).not.toBeNull();
    });

    it('PAINT-U021: has pen tool button', () => {
      const el = toolbar.render();
      const btn = el.querySelector('[data-testid="paint-tool-pen"]');
      expect(btn).not.toBeNull();
    });

    it('PAINT-U022: has eraser tool button', () => {
      const el = toolbar.render();
      const btn = el.querySelector('[data-testid="paint-tool-eraser"]');
      expect(btn).not.toBeNull();
    });

    it('PAINT-U023: has text tool button', () => {
      const el = toolbar.render();
      const btn = el.querySelector('[data-testid="paint-tool-text"]');
      expect(btn).not.toBeNull();
    });

    it('PAINT-U024: has rectangle shape button', () => {
      const el = toolbar.render();
      const btn = el.querySelector('[data-testid="paint-tool-rectangle"]');
      expect(btn).not.toBeNull();
    });

    it('PAINT-U025: has ellipse shape button', () => {
      const el = toolbar.render();
      const btn = el.querySelector('[data-testid="paint-tool-ellipse"]');
      expect(btn).not.toBeNull();
    });

    it('PAINT-U026: has line shape button', () => {
      const el = toolbar.render();
      const btn = el.querySelector('[data-testid="paint-tool-line"]');
      expect(btn).not.toBeNull();
    });

    it('PAINT-U027: has arrow shape button', () => {
      const el = toolbar.render();
      const btn = el.querySelector('[data-testid="paint-tool-arrow"]');
      expect(btn).not.toBeNull();
    });
  });

  describe('tool selection', () => {
    it('PAINT-U030: clicking pen button sets pen tool', () => {
      const el = toolbar.render();
      const btn = el.querySelector('[data-testid="paint-tool-pen"]') as HTMLButtonElement;

      btn.click();

      expect(paintEngine.tool).toBe('pen');
    });

    it('PAINT-U031: clicking eraser button sets eraser tool', () => {
      const el = toolbar.render();
      const btn = el.querySelector('[data-testid="paint-tool-eraser"]') as HTMLButtonElement;

      btn.click();

      expect(paintEngine.tool).toBe('eraser');
    });

    it('PAINT-U032: clicking text button sets text tool', () => {
      const el = toolbar.render();
      const btn = el.querySelector('[data-testid="paint-tool-text"]') as HTMLButtonElement;

      btn.click();

      expect(paintEngine.tool).toBe('text');
    });

    it('PAINT-U033: clicking pan button sets none tool', () => {
      paintEngine.tool = 'pen'; // Set different tool first
      const el = toolbar.render();
      const btn = el.querySelector('[data-testid="paint-tool-none"]') as HTMLButtonElement;

      btn.click();

      expect(paintEngine.tool).toBe('none');
    });

    it('PAINT-U034: active tool button has active styling', () => {
      paintEngine.tool = 'pen';
      const el = toolbar.render();
      const btn = el.querySelector('[data-testid="paint-tool-pen"]') as HTMLButtonElement;

      expect(btn.classList.contains('active')).toBe(true);
      expect(btn.style.cssText).toContain('var(--accent-primary)'); // #4a9eff
    });

    it('PAINT-U035: inactive tool button has default styling', () => {
      paintEngine.tool = 'pen';
      const el = toolbar.render();
      const btn = el.querySelector('[data-testid="paint-tool-eraser"]') as HTMLButtonElement;

      expect(btn.classList.contains('active')).toBe(false);
      expect(btn.style.background).toBe('transparent');
    });
  });

  describe('color picker', () => {
    it('PAINT-U040: has color picker input', () => {
      const el = toolbar.render();
      const colorPicker = el.querySelector('input[type="color"]');
      expect(colorPicker).not.toBeNull();
    });

    it('PAINT-U041: color picker has initial value from paint engine', () => {
      const el = toolbar.render();
      const colorPicker = el.querySelector('input[type="color"]') as HTMLInputElement;
      // Default color is [1, 0.3, 0.3, 1] which is reddish
      expect(colorPicker.value).toBe('#ff4d4d');
    });

    it('PAINT-U042: changing color picker updates paint engine color', () => {
      const el = toolbar.render();
      const colorPicker = el.querySelector('input[type="color"]') as HTMLInputElement;

      colorPicker.value = '#ff0000';
      colorPicker.dispatchEvent(new Event('input'));

      const color = paintEngine.color;
      expect(color[0]).toBeCloseTo(1, 1); // Red
      expect(color[1]).toBeCloseTo(0, 1); // Green
      expect(color[2]).toBeCloseTo(0, 1); // Blue
    });
  });

  describe('preset colors', () => {
    it('PAINT-U050: has preset color buttons', () => {
      const el = toolbar.render();
      // There should be 6 preset colors
      const buttons = el.querySelectorAll('button');
      // More than just tool buttons (which are 8)
      expect(buttons.length).toBeGreaterThan(8);
    });

    it('PAINT-U051: clicking preset color updates color picker', () => {
      const el = toolbar.render();
      const colorPicker = el.querySelector('input[type="color"]') as HTMLInputElement;

      // Find a red preset button (should be first preset)
      const presetButtons = Array.from(el.querySelectorAll('button')).filter(
        btn => btn.title?.startsWith('#')
      );
      const redPreset = presetButtons.find(btn => btn.title === '#ff4444');

      if (redPreset) {
        (redPreset as HTMLButtonElement).click();
        expect(colorPicker.value).toBe('#ff4444');
      }
    });
  });

  describe('width slider', () => {
    it('PAINT-U060: has width slider', () => {
      const el = toolbar.render();
      const slider = el.querySelector('[data-testid="paint-width-slider"]');
      expect(slider).not.toBeNull();
    });

    it('PAINT-U061: width slider has correct range', () => {
      const el = toolbar.render();
      const slider = el.querySelector('[data-testid="paint-width-slider"]') as HTMLInputElement;
      expect(slider.min).toBe('1');
      expect(slider.max).toBe('50');
    });

    it('PAINT-U062: width slider has initial value from paint engine', () => {
      const el = toolbar.render();
      const slider = el.querySelector('[data-testid="paint-width-slider"]') as HTMLInputElement;
      expect(slider.value).toBe(String(paintEngine.width));
    });

    it('PAINT-U063: changing width slider updates paint engine', () => {
      const el = toolbar.render();
      const slider = el.querySelector('[data-testid="paint-width-slider"]') as HTMLInputElement;

      slider.value = '25';
      slider.dispatchEvent(new Event('input'));

      expect(paintEngine.width).toBe(25);
    });

    it('PAINT-U064: width label updates with slider', () => {
      const el = toolbar.render();
      const slider = el.querySelector('[data-testid="paint-width-slider"]') as HTMLInputElement;

      slider.value = '30';
      slider.dispatchEvent(new Event('input'));

      expect(el.textContent).toContain('30');
    });
  });

  describe('keyboard shortcuts', () => {
    it('PAINT-U070: V key selects pan tool', () => {
      const handled = toolbar.handleKeyboard('v');
      expect(handled).toBe(true);
      expect(paintEngine.tool).toBe('none');
    });

    it('PAINT-U071: P key selects pen tool', () => {
      const handled = toolbar.handleKeyboard('p');
      expect(handled).toBe(true);
      expect(paintEngine.tool).toBe('pen');
    });

    it('PAINT-U072: E key selects eraser tool', () => {
      const handled = toolbar.handleKeyboard('e');
      expect(handled).toBe(true);
      expect(paintEngine.tool).toBe('eraser');
    });

    it('PAINT-U073: T key selects text tool', () => {
      const handled = toolbar.handleKeyboard('t');
      expect(handled).toBe(true);
      expect(paintEngine.tool).toBe('text');
    });

    it('PAINT-U074: B key toggles brush type', () => {
      const initialBrush = paintEngine.brush;
      const handled = toolbar.handleKeyboard('b');
      expect(handled).toBe(true);
      expect(paintEngine.brush).not.toBe(initialBrush);
    });

    it('PAINT-U075: G key toggles ghost mode', () => {
      const handled = toolbar.handleKeyboard('g');
      expect(handled).toBe(true);
      expect(paintEngine.effects.ghost).toBe(true);
    });

    it('PAINT-U076: unhandled key returns false', () => {
      const handled = toolbar.handleKeyboard('z');
      expect(handled).toBe(false);
    });

    it('PAINT-U086: X key toggles hold mode', () => {
      expect(paintEngine.effects.hold).toBe(false);
      const handled = toolbar.handleKeyboard('x');
      expect(handled).toBe(true);
      expect(paintEngine.effects.hold).toBe(true);
    });

    it('PAINT-U077: uppercase keys work', () => {
      const handled = toolbar.handleKeyboard('P');
      expect(handled).toBe(true);
      expect(paintEngine.tool).toBe('pen');
    });

    it('PAINT-U082: R key selects rectangle tool', () => {
      const handled = toolbar.handleKeyboard('r');
      expect(handled).toBe(true);
      expect(paintEngine.tool).toBe('rectangle');
    });

    it('PAINT-U083: O key selects ellipse tool', () => {
      const handled = toolbar.handleKeyboard('o');
      expect(handled).toBe(true);
      expect(paintEngine.tool).toBe('ellipse');
    });

    it('PAINT-U084: L key selects line tool', () => {
      const handled = toolbar.handleKeyboard('l');
      expect(handled).toBe(true);
      expect(paintEngine.tool).toBe('line');
    });

    it('PAINT-U085: A key selects arrow tool', () => {
      const handled = toolbar.handleKeyboard('a');
      expect(handled).toBe(true);
      expect(paintEngine.tool).toBe('arrow');
    });
  });

  describe('button hover effects', () => {
    it('PAINT-U080: inactive button changes on mouseenter', () => {
      const el = toolbar.render();
      const btn = el.querySelector('[data-testid="paint-tool-eraser"]') as HTMLButtonElement;

      btn.dispatchEvent(new MouseEvent('mouseenter'));

      expect(btn.style.cssText).toContain('var(--bg-hover)'); // #3a3a3a
    });

    it('PAINT-U081: inactive button restores on mouseleave', () => {
      const el = toolbar.render();
      const btn = el.querySelector('[data-testid="paint-tool-eraser"]') as HTMLButtonElement;

      btn.dispatchEvent(new MouseEvent('mouseenter'));
      btn.dispatchEvent(new MouseEvent('mouseleave'));

      expect(btn.style.background).toBe('transparent');
    });
  });

  describe('undo/redo buttons', () => {
    it('PAINT-U090: has undo button', () => {
      const el = toolbar.render();
      const buttons = Array.from(el.querySelectorAll('button'));
      const undoBtn = buttons.find(btn => btn.title?.includes('Undo'));
      expect(undoBtn).not.toBeUndefined();
    });

    it('PAINT-U091: has redo button', () => {
      const el = toolbar.render();
      const buttons = Array.from(el.querySelectorAll('button'));
      const redoBtn = buttons.find(btn => btn.title?.includes('Redo'));
      expect(redoBtn).not.toBeUndefined();
    });
  });

  describe('opacity slider', () => {
    it('PT-H13a: PaintToolbar should render an opacity slider input', () => {
      const el = toolbar.render();
      const slider = el.querySelector('[data-testid="paint-opacity-slider"]') as HTMLInputElement;
      expect(slider).not.toBeNull();
      expect(slider.type).toBe('range');
    });

    it('PT-H13b: Opacity slider should default to 100%', () => {
      const el = toolbar.render();
      const slider = el.querySelector('[data-testid="paint-opacity-slider"]') as HTMLInputElement;
      expect(slider.value).toBe('100');
      expect(slider.min).toBe('0');
      expect(slider.max).toBe('100');
    });

    it('PT-H13c: Changing opacity slider should update the alpha value used in hexToRgba()', () => {
      const el = toolbar.render();
      const slider = el.querySelector('[data-testid="paint-opacity-slider"]') as HTMLInputElement;

      // Set opacity to 50%
      slider.value = '50';
      slider.dispatchEvent(new Event('input'));

      // The paint engine color alpha should now be 0.5
      const color = paintEngine.color;
      expect(color[3]).toBeCloseTo(0.5, 2);
    });

    it('PT-H13d: New strokes should use the current opacity value', () => {
      const el = toolbar.render();
      const slider = el.querySelector('[data-testid="paint-opacity-slider"]') as HTMLInputElement;

      // Set opacity to 75%
      slider.value = '75';
      slider.dispatchEvent(new Event('input'));

      // Select pen tool and begin a stroke
      paintEngine.tool = 'pen';
      paintEngine.beginStroke(0, { x: 0, y: 0, pressure: 1 });

      const stroke = paintEngine.getCurrentStroke();
      expect(stroke).not.toBeNull();
      expect(stroke!.color[3]).toBeCloseTo(0.75, 2);

      paintEngine.endStroke();
    });

    it('PT-H13e: Opacity slider should display its current value as a label', () => {
      const el = toolbar.render();
      const slider = el.querySelector('[data-testid="paint-opacity-slider"]') as HTMLInputElement;
      const label = el.querySelector('[data-testid="paint-opacity-label"]') as HTMLSpanElement;

      expect(label).not.toBeNull();
      // Default label shows 100%
      expect(label.textContent).toBe('100%');

      // Change opacity to 42%
      slider.value = '42';
      slider.dispatchEvent(new Event('input'));

      expect(label.textContent).toBe('42%');
    });
  });

  describe('dispose', () => {
    it('PAINT-U100: dispose can be called without error', () => {
      expect(() => toolbar.dispose()).not.toThrow();
    });

    it('PAINT-U101: dispose can be called multiple times', () => {
      expect(() => {
        toolbar.dispose();
        toolbar.dispose();
      }).not.toThrow();
    });
  });

  describe('separators', () => {
    it('PAINT-U110: toolbar has visual separators', () => {
      const el = toolbar.render();
      // Separators are divs with width: 1px
      const dividers = Array.from(el.querySelectorAll('div')).filter(
        div => div.style.width === '1px'
      );
      expect(dividers.length).toBeGreaterThan(0);
    });
  });

  describe('tool button titles', () => {
    it('PAINT-U120: pan tool has V shortcut in title', () => {
      const el = toolbar.render();
      const btn = el.querySelector('[data-testid="paint-tool-none"]') as HTMLButtonElement;
      expect(btn.title).toContain('V');
    });

    it('PAINT-U121: pen tool has P shortcut in title', () => {
      const el = toolbar.render();
      const btn = el.querySelector('[data-testid="paint-tool-pen"]') as HTMLButtonElement;
      expect(btn.title).toContain('P');
    });

    it('PAINT-U122: eraser tool has E shortcut in title', () => {
      const el = toolbar.render();
      const btn = el.querySelector('[data-testid="paint-tool-eraser"]') as HTMLButtonElement;
      expect(btn.title).toContain('E');
    });

    it('PAINT-U123: text tool has T shortcut in title', () => {
      const el = toolbar.render();
      const btn = el.querySelector('[data-testid="paint-tool-text"]') as HTMLButtonElement;
      expect(btn.title).toContain('T');
    });
  });
});
