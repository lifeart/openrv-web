/**
 * KeyBindings Tests
 *
 * Tests for the keyboard shortcuts configuration and utility functions.
 */

import { describe, it, expect } from 'vitest';
import { DEFAULT_KEY_BINDINGS, describeKeyCombo } from './KeyBindings';
import type { KeyCombination } from './KeyboardManager';

describe('KeyBindings', () => {
  describe('DEFAULT_KEY_BINDINGS', () => {
    it('KB-U001: defines playback.toggle binding', () => {
      expect(DEFAULT_KEY_BINDINGS['playback.toggle']).toBeDefined();
      expect(DEFAULT_KEY_BINDINGS['playback.toggle']!.code).toBe('Space');
    });

    it('KB-U002: defines playback.stepForward binding', () => {
      expect(DEFAULT_KEY_BINDINGS['playback.stepForward']).toBeDefined();
      expect(DEFAULT_KEY_BINDINGS['playback.stepForward']!.code).toBe('ArrowRight');
    });

    it('KB-U003: defines playback.stepBackward binding', () => {
      expect(DEFAULT_KEY_BINDINGS['playback.stepBackward']).toBeDefined();
      expect(DEFAULT_KEY_BINDINGS['playback.stepBackward']!.code).toBe('ArrowLeft');
    });

    it('KB-U004: defines JKL speed controls', () => {
      expect(DEFAULT_KEY_BINDINGS['playback.slower']!.code).toBe('KeyJ');
      expect(DEFAULT_KEY_BINDINGS['playback.stop']!.code).toBe('KeyK');
      expect(DEFAULT_KEY_BINDINGS['playback.faster']!.code).toBe('KeyL');
    });

    it('KB-U005: defines timeline.setInPoint binding', () => {
      expect(DEFAULT_KEY_BINDINGS['timeline.setInPoint']).toBeDefined();
      expect(DEFAULT_KEY_BINDINGS['timeline.setInPoint']!.code).toBe('KeyI');
    });

    it('KB-U006: defines timeline.setOutPoint binding', () => {
      expect(DEFAULT_KEY_BINDINGS['timeline.setOutPoint']).toBeDefined();
      expect(DEFAULT_KEY_BINDINGS['timeline.setOutPoint']!.code).toBe('KeyO');
    });

    it('KB-U007: defines view.fitToWindow binding', () => {
      expect(DEFAULT_KEY_BINDINGS['view.fitToWindow']).toBeDefined();
      expect(DEFAULT_KEY_BINDINGS['view.fitToWindow']!.code).toBe('KeyF');
    });

    it('KB-U008: defines edit.undo with ctrl modifier', () => {
      const binding = DEFAULT_KEY_BINDINGS['edit.undo'];
      expect(binding).toBeDefined();
      expect(binding!.code).toBe('KeyZ');
      expect(binding!.ctrl).toBe(true);
    });

    it('KB-U009: defines edit.redo with ctrl modifier', () => {
      const binding = DEFAULT_KEY_BINDINGS['edit.redo'];
      expect(binding).toBeDefined();
      expect(binding!.code).toBe('KeyY');
      expect(binding!.ctrl).toBe(true);
    });

    it('KB-U010: defines tab navigation bindings', () => {
      expect(DEFAULT_KEY_BINDINGS['tab.view']!.code).toBe('Digit1');
      expect(DEFAULT_KEY_BINDINGS['tab.color']!.code).toBe('Digit2');
      expect(DEFAULT_KEY_BINDINGS['tab.effects']!.code).toBe('Digit3');
      expect(DEFAULT_KEY_BINDINGS['tab.transform']!.code).toBe('Digit4');
      expect(DEFAULT_KEY_BINDINGS['tab.annotate']!.code).toBe('Digit5');
      expect(DEFAULT_KEY_BINDINGS['tab.qc']!.code).toBe('Digit6');
    });

    it('KB-U011: defines paint tool bindings', () => {
      expect(DEFAULT_KEY_BINDINGS['paint.pan']!.code).toBe('KeyV');
      expect(DEFAULT_KEY_BINDINGS['paint.pen']!.code).toBe('KeyP');
      expect(DEFAULT_KEY_BINDINGS['paint.eraser']!.code).toBe('KeyE');
      expect(DEFAULT_KEY_BINDINGS['paint.text']!.code).toBe('KeyT');
    });

    it('KB-U012: defines channel selection bindings with shift', () => {
      const redBinding = DEFAULT_KEY_BINDINGS['channel.red'];
      expect(redBinding!.code).toBe('KeyR');
      expect(redBinding!.shift).toBe(true);
    });

    it('KB-U013: all bindings have descriptions', () => {
      for (const [action, binding] of Object.entries(DEFAULT_KEY_BINDINGS)) {
        expect(binding.description, `${action} should have description`).toBeTruthy();
      }
    });

    it('KB-U014: all bindings have code property', () => {
      for (const [action, binding] of Object.entries(DEFAULT_KEY_BINDINGS)) {
        expect(binding.code, `${action} should have code`).toBeTruthy();
      }
    });

    it('KB-U015: defines export bindings', () => {
      expect(DEFAULT_KEY_BINDINGS['export.quickExport']!.ctrl).toBe(true);
      expect(DEFAULT_KEY_BINDINGS['export.copyFrame']!.ctrl).toBe(true);
    });

    it('KB-U016: defines panel toggles', () => {
      expect(DEFAULT_KEY_BINDINGS['panel.color']).toBeDefined();
      expect(DEFAULT_KEY_BINDINGS['panel.effects']).toBeDefined();
      expect(DEFAULT_KEY_BINDINGS['panel.curves']).toBeDefined();
      expect(DEFAULT_KEY_BINDINGS['panel.histogram']).toBeDefined();
    });

    it('KB-U017: defines transform bindings', () => {
      expect(DEFAULT_KEY_BINDINGS['transform.rotateLeft']!.shift).toBe(true);
      expect(DEFAULT_KEY_BINDINGS['transform.rotateRight']!.alt).toBe(true);
      expect(DEFAULT_KEY_BINDINGS['transform.flipHorizontal']!.alt).toBe(true);
      expect(DEFAULT_KEY_BINDINGS['transform.flipVertical']!.shift).toBe(true);
    });

    it('KB-U018: defines annotation navigation', () => {
      expect(DEFAULT_KEY_BINDINGS['annotation.previous']!.code).toBe('Comma');
      expect(DEFAULT_KEY_BINDINGS['annotation.next']!.code).toBe('Period');
    });

    it('KB-U019: defines view toggles with multiple modifiers', () => {
      const falseColorBinding = DEFAULT_KEY_BINDINGS['view.toggleFalseColor'];
      expect(falseColorBinding!.shift).toBe(true);
      expect(falseColorBinding!.alt).toBe(true);
    });

    it('KB-U020: defines panel.close with Escape', () => {
      expect(DEFAULT_KEY_BINDINGS['panel.close']!.code).toBe('Escape');
    });

    it('KB-U021: difference matte and display profile shortcuts do not conflict', () => {
      const diff = DEFAULT_KEY_BINDINGS['view.toggleDifferenceMatte']!;
      const display = DEFAULT_KEY_BINDINGS['display.cycleProfile']!;

      expect(diff.code).toBe('KeyD');
      expect(diff.shift).toBe(true);

      expect(display.code).toBe('KeyD');
      expect(display.shift).toBe(true);
      expect(display.alt).toBe(true);
    });

    it('KB-U022: defines next/previous mark-or-boundary shortcuts with Alt+Arrow', () => {
      const next = DEFAULT_KEY_BINDINGS['timeline.nextMarkOrBoundary']!;
      const prev = DEFAULT_KEY_BINDINGS['timeline.previousMarkOrBoundary']!;
      expect(next.code).toBe('ArrowRight');
      expect(next.alt).toBe(true);
      expect(prev.code).toBe('ArrowLeft');
      expect(prev.alt).toBe(true);
    });

    it('KB-U023: defines shot navigation shortcuts with PageUp/PageDown', () => {
      const next = DEFAULT_KEY_BINDINGS['timeline.nextShot']!;
      const prev = DEFAULT_KEY_BINDINGS['timeline.previousShot']!;
      expect(next.code).toBe('PageDown');
      expect(prev.code).toBe('PageUp');
    });
  });

  describe('describeKeyCombo', () => {
    it('KB-U030: describes simple key', () => {
      const combo: KeyCombination = { code: 'KeyA' };
      expect(describeKeyCombo(combo)).toBe('A');
    });

    it('KB-U031: describes key with ctrl modifier', () => {
      const combo: KeyCombination = { code: 'KeyZ', ctrl: true };
      expect(describeKeyCombo(combo)).toBe('Ctrl+Z');
    });

    it('KB-U032: describes key with shift modifier', () => {
      const combo: KeyCombination = { code: 'KeyR', shift: true };
      expect(describeKeyCombo(combo)).toBe('Shift+R');
    });

    it('KB-U033: describes key with alt modifier', () => {
      const combo: KeyCombination = { code: 'KeyR', alt: true };
      expect(describeKeyCombo(combo)).toBe('Alt+R');
    });

    it('KB-U034: describes key with meta modifier', () => {
      const combo: KeyCombination = { code: 'KeyC', meta: true };
      expect(describeKeyCombo(combo)).toBe('Cmd+C');
    });

    it('KB-U035: describes key with multiple modifiers', () => {
      const combo: KeyCombination = { code: 'KeyS', ctrl: true, shift: true };
      expect(describeKeyCombo(combo)).toBe('Ctrl+Shift+S');
    });

    it('KB-U036: describes key with all modifiers', () => {
      const combo: KeyCombination = {
        code: 'KeyA',
        ctrl: true,
        shift: true,
        alt: true,
        meta: true,
      };
      expect(describeKeyCombo(combo)).toBe('Ctrl+Shift+Alt+Cmd+A');
    });

    it('KB-U037: describes Space key', () => {
      const combo: KeyCombination = { code: 'Space' };
      expect(describeKeyCombo(combo)).toBe('Space');
    });

    it('KB-U038: describes arrow keys', () => {
      expect(describeKeyCombo({ code: 'ArrowUp' })).toBe('↑');
      expect(describeKeyCombo({ code: 'ArrowDown' })).toBe('↓');
      expect(describeKeyCombo({ code: 'ArrowLeft' })).toBe('←');
      expect(describeKeyCombo({ code: 'ArrowRight' })).toBe('→');
    });

    it('KB-U039: describes Home and End keys', () => {
      expect(describeKeyCombo({ code: 'Home' })).toBe('Home');
      expect(describeKeyCombo({ code: 'End' })).toBe('End');
    });

    it('KB-U040: describes Escape key', () => {
      expect(describeKeyCombo({ code: 'Escape' })).toBe('Esc');
    });

    it('KB-U041: describes bracket keys', () => {
      expect(describeKeyCombo({ code: 'BracketLeft' })).toBe('[');
      expect(describeKeyCombo({ code: 'BracketRight' })).toBe(']');
    });

    it('KB-U042: describes Comma and Period keys', () => {
      expect(describeKeyCombo({ code: 'Comma' })).toBe(',');
      expect(describeKeyCombo({ code: 'Period' })).toBe('.');
    });

    it('KB-U043: describes Backquote key', () => {
      expect(describeKeyCombo({ code: 'Backquote' })).toBe('`');
    });

    it('KB-U044: describes Digit keys', () => {
      expect(describeKeyCombo({ code: 'Digit1' })).toBe('1');
      expect(describeKeyCombo({ code: 'Digit5' })).toBe('5');
    });

    it('KB-U045: describes KeyX format correctly', () => {
      expect(describeKeyCombo({ code: 'KeyA' })).toBe('A');
      expect(describeKeyCombo({ code: 'KeyZ' })).toBe('Z');
    });

    it('KB-U046: returns unknown code as-is', () => {
      expect(describeKeyCombo({ code: 'NumpadAdd' })).toBe('NumpadAdd');
      expect(describeKeyCombo({ code: 'F1' })).toBe('F1');
      expect(describeKeyCombo({ code: 'Tab' })).toBe('Tab');
    });

    it('KB-U047: handles false modifier values', () => {
      const combo: KeyCombination = {
        code: 'KeyA',
        ctrl: false,
        shift: false,
        alt: false,
        meta: false,
      };
      expect(describeKeyCombo(combo)).toBe('A');
    });
  });

  describe('binding categories', () => {
    it('KB-U050: has playback bindings', () => {
      const playbackBindings = Object.keys(DEFAULT_KEY_BINDINGS).filter((k) =>
        k.startsWith('playback.')
      );
      expect(playbackBindings.length).toBeGreaterThan(0);
    });

    it('KB-U051: has timeline bindings', () => {
      const timelineBindings = Object.keys(DEFAULT_KEY_BINDINGS).filter((k) =>
        k.startsWith('timeline.')
      );
      expect(timelineBindings.length).toBeGreaterThan(0);
    });

    it('KB-U052: has view bindings', () => {
      const viewBindings = Object.keys(DEFAULT_KEY_BINDINGS).filter((k) =>
        k.startsWith('view.')
      );
      expect(viewBindings.length).toBeGreaterThan(0);
    });

    it('KB-U053: has panel bindings', () => {
      const panelBindings = Object.keys(DEFAULT_KEY_BINDINGS).filter((k) =>
        k.startsWith('panel.')
      );
      expect(panelBindings.length).toBeGreaterThan(0);
    });

    it('KB-U054: has transform bindings', () => {
      const transformBindings = Object.keys(DEFAULT_KEY_BINDINGS).filter((k) =>
        k.startsWith('transform.')
      );
      expect(transformBindings.length).toBeGreaterThan(0);
    });

    it('KB-U055: has export bindings', () => {
      const exportBindings = Object.keys(DEFAULT_KEY_BINDINGS).filter((k) =>
        k.startsWith('export.')
      );
      expect(exportBindings.length).toBeGreaterThan(0);
    });

    it('KB-U056: has edit bindings', () => {
      const editBindings = Object.keys(DEFAULT_KEY_BINDINGS).filter((k) =>
        k.startsWith('edit.')
      );
      expect(editBindings.length).toBeGreaterThan(0);
    });

    it('KB-U057: has tab bindings', () => {
      const tabBindings = Object.keys(DEFAULT_KEY_BINDINGS).filter((k) =>
        k.startsWith('tab.')
      );
      expect(tabBindings.length).toBe(6); // 6 tabs
    });

    it('KB-U070: has layout bindings', () => {
      const layoutBindings = Object.keys(DEFAULT_KEY_BINDINGS).filter((k) =>
        k.startsWith('layout.')
      );
      expect(layoutBindings.length).toBe(4); // 4 presets
    });

    it('KB-U058: has paint bindings', () => {
      const paintBindings = Object.keys(DEFAULT_KEY_BINDINGS).filter((k) =>
        k.startsWith('paint.')
      );
      expect(paintBindings.length).toBeGreaterThan(0);
    });

    it('KB-U059: has channel bindings', () => {
      const channelBindings = Object.keys(DEFAULT_KEY_BINDINGS).filter((k) =>
        k.startsWith('channel.')
      );
      expect(channelBindings.length).toBeGreaterThan(0);
    });
  });

  describe('specific bindings validation', () => {
    it('KB-U060: playback.toggle uses Space', () => {
      expect(DEFAULT_KEY_BINDINGS['playback.toggle']!.code).toBe('Space');
      expect(DEFAULT_KEY_BINDINGS['playback.toggle']!.description).toContain('play');
    });

    it('KB-U061: Home/End navigate to start/end', () => {
      expect(DEFAULT_KEY_BINDINGS['playback.goToStart']!.code).toBe('Home');
      expect(DEFAULT_KEY_BINDINGS['playback.goToEnd']!.code).toBe('End');
    });

    it('KB-U062: in/out points use I/O keys', () => {
      expect(DEFAULT_KEY_BINDINGS['timeline.setInPoint']!.code).toBe('KeyI');
      expect(DEFAULT_KEY_BINDINGS['timeline.setOutPoint']!.code).toBe('KeyO');
    });

    it('KB-U063: alternative in/out points use brackets', () => {
      expect(DEFAULT_KEY_BINDINGS['timeline.setInPointAlt']!.code).toBe('BracketLeft');
      expect(DEFAULT_KEY_BINDINGS['timeline.setOutPointAlt']!.code).toBe('BracketRight');
    });

    it('KB-U064: marks toggle uses M key', () => {
      expect(DEFAULT_KEY_BINDINGS['timeline.toggleMark']!.code).toBe('KeyM');
    });

    it('KB-U065: undo is Ctrl+Z', () => {
      const undo = DEFAULT_KEY_BINDINGS['edit.undo'];
      expect(undo!.code).toBe('KeyZ');
      expect(undo!.ctrl).toBe(true);
    });

    it('KB-U066: annotation navigation uses comma/period', () => {
      expect(DEFAULT_KEY_BINDINGS['annotation.previous']!.code).toBe('Comma');
      expect(DEFAULT_KEY_BINDINGS['annotation.next']!.code).toBe('Period');
    });

    it('KB-U067: layout presets use Alt+1/2/3/4', () => {
      const def = DEFAULT_KEY_BINDINGS['layout.default']!;
      expect(def.code).toBe('Digit1');
      expect(def.alt).toBe(true);

      const review = DEFAULT_KEY_BINDINGS['layout.review']!;
      expect(review.code).toBe('Digit2');
      expect(review.alt).toBe(true);

      const color = DEFAULT_KEY_BINDINGS['layout.color']!;
      expect(color.code).toBe('Digit3');
      expect(color.alt).toBe(true);

      const paint = DEFAULT_KEY_BINDINGS['layout.paint']!;
      expect(paint.code).toBe('Digit4');
      expect(paint.alt).toBe(true);
    });

    it('KB-U068: layout bindings do not conflict with tab bindings', () => {
      const tabView = DEFAULT_KEY_BINDINGS['tab.view']!;
      const layoutDefault = DEFAULT_KEY_BINDINGS['layout.default']!;

      // Same digit keys but layout uses Alt modifier
      expect(tabView.code).toBe('Digit1');
      expect(tabView.alt).toBeUndefined();
      expect(layoutDefault.code).toBe('Digit1');
      expect(layoutDefault.alt).toBe(true);
    });
  });
});
