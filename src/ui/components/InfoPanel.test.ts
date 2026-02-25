/**
 * InfoPanel Component Tests
 *
 * Tests for the floating info panel showing file metadata.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { InfoPanel, InfoPanelPosition } from './InfoPanel';
import { getThemeManager } from '../../utils/ui/ThemeManager';

describe('InfoPanel', () => {
  let panel: InfoPanel;

  beforeEach(() => {
    panel = new InfoPanel();
  });

  afterEach(() => {
    panel.dispose();
  });

  describe('initialization', () => {
    it('INFO-U001: creates InfoPanel instance', () => {
      expect(panel).toBeInstanceOf(InfoPanel);
    });

    it('INFO-U002: panel is disabled by default', () => {
      expect(panel.isEnabled()).toBe(false);
    });

    it('INFO-U003: default position is top-left', () => {
      expect(panel.getPosition()).toBe('top-left');
    });
  });

  describe('getElement', () => {
    it('INFO-U010: getElement returns container element', () => {
      const el = panel.getElement();
      expect(el).toBeInstanceOf(HTMLElement);
    });

    it('INFO-U011: container has data-testid', () => {
      const el = panel.getElement();
      expect(el.dataset.testid).toBe('info-panel');
    });

    it('INFO-U012: container has info-panel class', () => {
      const el = panel.getElement();
      expect(el.className).toBe('info-panel');
    });

    it('INFO-U013: container is hidden by default', () => {
      const el = panel.getElement();
      expect(el.style.display).toBe('none');
    });
  });

  describe('enable/disable', () => {
    it('INFO-U020: enable shows panel', () => {
      panel.enable();
      expect(panel.isEnabled()).toBe(true);
      expect(panel.getElement().style.display).toBe('block');
    });

    it('INFO-U021: disable hides panel', () => {
      panel.enable();
      panel.disable();
      expect(panel.isEnabled()).toBe(false);
      expect(panel.getElement().style.display).toBe('none');
    });

    it('INFO-U022: toggle shows hidden panel', () => {
      panel.toggle();
      expect(panel.isEnabled()).toBe(true);
    });

    it('INFO-U023: toggle hides visible panel', () => {
      panel.enable();
      panel.toggle();
      expect(panel.isEnabled()).toBe(false);
    });

    it('INFO-U024: enable emits visibilityChanged event', () => {
      const callback = vi.fn();
      panel.on('visibilityChanged', callback);

      panel.enable();

      expect(callback).toHaveBeenCalledWith(true);
    });

    it('INFO-U025: disable emits visibilityChanged event', () => {
      panel.enable();
      const callback = vi.fn();
      panel.on('visibilityChanged', callback);

      panel.disable();

      expect(callback).toHaveBeenCalledWith(false);
    });
  });

  describe('position', () => {
    it('INFO-U030: setPosition changes position', () => {
      panel.setPosition('bottom-right');
      expect(panel.getPosition()).toBe('bottom-right');
    });

    it('INFO-U031: top-left position sets top and left', () => {
      panel.setPosition('top-left');
      const el = panel.getElement();
      expect(el.style.top).toBe('10px');
      expect(el.style.left).toBe('10px');
    });

    it('INFO-U032: top-right position sets top and right', () => {
      panel.setPosition('top-right');
      const el = panel.getElement();
      expect(el.style.top).toBe('10px');
      expect(el.style.right).toBe('10px');
    });

    it('INFO-U033: bottom-left position sets bottom and left', () => {
      panel.setPosition('bottom-left');
      const el = panel.getElement();
      expect(el.style.bottom).toBe('10px');
      expect(el.style.left).toBe('10px');
    });

    it('INFO-U034: bottom-right position sets bottom and right', () => {
      panel.setPosition('bottom-right');
      const el = panel.getElement();
      expect(el.style.bottom).toBe('10px');
      expect(el.style.right).toBe('10px');
    });

    it('INFO-U035: setPosition emits stateChanged', () => {
      const callback = vi.fn();
      panel.on('stateChanged', callback);

      panel.setPosition('bottom-left');

      expect(callback).toHaveBeenCalled();
    });
  });

  describe('fields', () => {
    it('INFO-U040: default fields include filename', () => {
      const fields = panel.getFields();
      expect(fields.filename).toBe(true);
    });

    it('INFO-U041: default fields include resolution', () => {
      const fields = panel.getFields();
      expect(fields.resolution).toBe(true);
    });

    it('INFO-U042: default fields include frameInfo', () => {
      const fields = panel.getFields();
      expect(fields.frameInfo).toBe(true);
    });

    it('INFO-U043: default fields exclude duration', () => {
      const fields = panel.getFields();
      expect(fields.duration).toBe(false);
    });

    it('INFO-U044: setFields updates field settings', () => {
      panel.setFields({ duration: true });
      expect(panel.getFields().duration).toBe(true);
    });

    it('INFO-U045: toggleField toggles specific field', () => {
      const initialValue = panel.getFields().duration;
      panel.toggleField('duration');
      expect(panel.getFields().duration).toBe(!initialValue);
    });

    it('INFO-U046: setFields emits stateChanged', () => {
      const callback = vi.fn();
      panel.on('stateChanged', callback);

      panel.setFields({ fps: false });

      expect(callback).toHaveBeenCalled();
    });

    it('INFO-U047: getFields returns copy of fields', () => {
      const fields1 = panel.getFields();
      const fields2 = panel.getFields();
      expect(fields1).toEqual(fields2);
      expect(fields1).not.toBe(fields2);
    });
  });

  describe('update data', () => {
    it('INFO-U050: update stores data', () => {
      panel.enable();
      panel.update({ filename: 'test.exr' });
      // Data is stored internally, verify by checking content
      expect(panel.getElement().textContent).toContain('test.exr');
    });

    it('INFO-U051: update with resolution shows dimensions', () => {
      panel.enable();
      panel.update({ width: 1920, height: 1080 });
      expect(panel.getElement().textContent).toContain('1920');
      expect(panel.getElement().textContent).toContain('1080');
    });

    it('INFO-U052: update with frame info shows frame', () => {
      panel.enable();
      panel.update({ currentFrame: 0, totalFrames: 100 });
      expect(panel.getElement().textContent).toContain('1 / 100'); // 1-based
    });

    it('INFO-U053: update with fps shows fps', () => {
      panel.enable();
      panel.update({ fps: 24 });
      expect(panel.getElement().textContent).toContain('24 fps');
    });

    it('INFO-U054: update with color shows RGB values', () => {
      panel.enable();
      panel.update({ colorAtCursor: { r: 128, g: 64, b: 32 } });
      expect(panel.getElement().textContent).toContain('128');
      expect(panel.getElement().textContent).toContain('64');
      expect(panel.getElement().textContent).toContain('32');
    });

    it('INFO-U055: update does not render when disabled', () => {
      // Panel is disabled
      panel.update({ filename: 'hidden.exr' });
      // Content should not be updated since panel is disabled
      expect(panel.getElement().textContent).not.toContain('hidden.exr');
    });

  });

  describe('getState', () => {
    it('INFO-U060: getState returns current state', () => {
      panel.enable();
      panel.setPosition('bottom-right');

      const state = panel.getState();

      expect(state.enabled).toBe(true);
      expect(state.position).toBe('bottom-right');
      expect(state.fields).toBeDefined();
    });

    it('INFO-U061: getState returns copy of fields', () => {
      const state1 = panel.getState();
      const state2 = panel.getState();
      expect(state1.fields).toEqual(state2.fields);
      expect(state1.fields).not.toBe(state2.fields);
    });
  });

  describe('setState', () => {
    it('INFO-U070: setState restores position', () => {
      panel.setState({ position: 'bottom-left' });
      expect(panel.getPosition()).toBe('bottom-left');
    });

    it('INFO-U071: setState restores enabled state', () => {
      panel.setState({ enabled: true });
      expect(panel.isEnabled()).toBe(true);
    });

    it('INFO-U072: setState restores fields', () => {
      panel.setState({ fields: { filename: false, resolution: true } as any });
      expect(panel.getFields().filename).toBe(false);
    });

    it('INFO-U073: setState with partial state works', () => {
      const originalPosition = panel.getPosition();
      panel.setState({ enabled: true });
      expect(panel.getPosition()).toBe(originalPosition);
    });
  });

  describe('dispose', () => {
    it('INFO-U080: dispose can be called without error', () => {
      expect(() => panel.dispose()).not.toThrow();
    });

    it('INFO-U081: dispose can be called multiple times', () => {
      expect(() => {
        panel.dispose();
        panel.dispose();
      }).not.toThrow();
    });

    it('INFO-U082: dispose removes element', () => {
      const el = panel.getElement();
      document.body.appendChild(el);
      panel.dispose();
      expect(document.body.contains(el)).toBe(false);
    });
  });

  describe('styling', () => {
    it('INFO-U090: panel has absolute positioning', () => {
      const el = panel.getElement();
      expect(el.style.position).toBe('absolute');
    });

    it('INFO-U091: panel has high z-index', () => {
      const el = panel.getElement();
      expect(parseInt(el.style.zIndex, 10)).toBeGreaterThan(100);
    });

    it('INFO-U092: panel has no pointer events', () => {
      const el = panel.getElement();
      expect(el.style.pointerEvents).toBe('none');
    });

    it('INFO-U093: panel uses monospace font', () => {
      const el = panel.getElement();
      expect(el.style.fontFamily).toContain('monospace');
    });
  });

  describe('field visibility', () => {
    it('INFO-U100: disabled field is not rendered', () => {
      panel.enable();
      panel.setFields({ filename: false });
      panel.update({ filename: 'hidden.exr' });
      expect(panel.getElement().textContent).not.toContain('hidden.exr');
    });

    it('INFO-U101: enabled field is rendered', () => {
      panel.enable();
      panel.setFields({ filename: true });
      panel.update({ filename: 'visible.exr' });
      expect(panel.getElement().textContent).toContain('visible.exr');
    });
  });

  describe('all positions', () => {
    const positions: InfoPanelPosition[] = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];

    positions.forEach(position => {
      it(`INFO-U110-${position}: ${position} position is valid`, () => {
        panel.setPosition(position);
        expect(panel.getPosition()).toBe(position);
      });
    });
  });

  describe('XSS prevention', () => {
    it('INFO-U056: escapes HTML in filename to prevent XSS', () => {
      panel.enable();
      const maliciousName = '<img src="x" onerror="alert(1)">_test.exr';
      panel.update({ filename: maliciousName });

      const content = panel.getElement().innerHTML;
      // Must not contain unescaped HTML tags (XSS prevention)
      expect(content).not.toContain('<img');
      // Escaped characters should be present (filename is truncated to 25 chars)
      expect(content).toContain('&lt;img');
    });

    it('INFO-U057: escapes HTML in timecode to prevent XSS', () => {
      panel.enable();
      panel.update({ timecode: '<script>alert(1)</script>' });

      const content = panel.getElement().innerHTML;
      expect(content).not.toContain('<script>');
      expect(content).toContain('&lt;script&gt;');
    });

    it('INFO-U058: escapes HTML in duration to prevent XSS', () => {
      panel.enable();
      panel.setFields({ duration: true });
      panel.update({ duration: '<img onerror="alert(1)">' });

      const content = panel.getElement().innerHTML;
      expect(content).not.toContain('<img');
      expect(content).toContain('&lt;img');
    });

    it('INFO-U059: does not execute script tags in filename', () => {
      panel.enable();
      const malicious = '<script>window.__xss=1</script>.exr';
      panel.update({ filename: malicious });

      const el = panel.getElement();
      // Script must not be parsed as an element
      expect(el.querySelector('script')).toBeNull();
      // The text should appear safely in textContent
      expect(el.textContent).toContain('<script>');
    });

    it('INFO-U060b: does not create img elements from filename metadata', () => {
      panel.enable();
      panel.update({ filename: '<img src=x onerror=alert(1)>.exr' });

      const el = panel.getElement();
      expect(el.querySelector('img')).toBeNull();
    });

    it('INFO-U060c: handles nested HTML injection attempts in timecode', () => {
      panel.enable();
      panel.update({ timecode: '"><svg onload="alert(1)">' });

      const el = panel.getElement();
      expect(el.querySelector('svg')).toBeNull();
      expect(el.textContent).toContain('"><svg onload="alert(1)">');
    });

    it('INFO-U060d: handles event handler injection in duration', () => {
      panel.enable();
      panel.setFields({ duration: true });
      panel.update({ duration: '" onmouseover="alert(1)" data-x="' });

      const el = panel.getElement();
      // The injected string must NOT appear as an actual attribute on any element
      const allElements = el.querySelectorAll('*');
      allElements.forEach(child => {
        expect(child.getAttribute('onmouseover')).toBeNull();
      });
      // The literal text should still be present in textContent
      expect(el.textContent).toContain('onmouseover');
    });

    it('INFO-U060e: all user-provided strings are set via textContent, not innerHTML', () => {
      panel.enable();
      panel.setFields({ duration: true });
      panel.update({
        filename: '<b>bold</b>',
        timecode: '<i>italic</i>',
        duration: '<u>underline</u>',
      });

      const el = panel.getElement();
      // None of these should create actual HTML elements
      expect(el.querySelector('b')).toBeNull();
      expect(el.querySelector('i')).toBeNull();
      expect(el.querySelector('u')).toBeNull();
      // The text should appear literally
      expect(el.textContent).toContain('<b>bold</b>');
      expect(el.textContent).toContain('<i>italic</i>');
      expect(el.textContent).toContain('<u>underline</u>');
    });
  });

  describe('theme changes', () => {
    it('INFO-U120: container uses CSS variables for background and border', () => {
      const style = panel.getElement().style.cssText;
      expect(style).toContain('var(--overlay-bg)');
      expect(style).toContain('var(--overlay-border)');
      expect(style).not.toContain('rgba(0, 0, 0, 0.75)');
      expect(style).not.toContain('rgba(255, 255, 255, 0.1)');
    });

    it('INFO-U121: re-renders content when theme changes', () => {
      panel.enable();
      panel.update({ filename: 'theme-test.exr', width: 1920, height: 1080 });

      const contentEl = panel.getElement().querySelector('.info-panel-content')!;
      const oldChild = contentEl.firstChild;
      expect(oldChild).toBeTruthy();

      getThemeManager().emit('themeChanged', 'light');

      // render() rebuilds innerHTML — old child is detached
      expect(contentEl.contains(oldChild)).toBe(false);
      // content is re-created with same data
      expect(contentEl.textContent).toContain('theme-test.exr');
    });

    it('INFO-U122: does not re-render after dispose on theme change', () => {
      panel.enable();
      panel.update({ filename: 'dispose-test.exr' });
      panel.dispose();

      const htmlAfterDispose = panel.getElement().innerHTML;

      getThemeManager().emit('themeChanged', 'light');

      expect(panel.getElement().innerHTML).toBe(htmlAfterDispose);
    });
  });
});
