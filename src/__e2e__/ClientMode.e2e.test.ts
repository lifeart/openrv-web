/**
 * ClientMode E2E Tests
 *
 * Verifies end-to-end wiring of ClientMode within App:
 * - URL parameter detection and locked state
 * - Restriction application to DOM elements
 * - State change event propagation
 * - Category-to-tab mapping coherence
 * - Edge cases: no container, already restricted, disposed state
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ClientMode, type ClientModeStateChange } from '../ui/components/ClientMode';

describe('ClientMode E2E', () => {
  let clientMode: ClientMode;
  let originalLocation: Location;

  beforeEach(() => {
    originalLocation = window.location;
    clientMode = new ClientMode();
  });

  afterEach(() => {
    clientMode.dispose();
    Object.defineProperty(window, 'location', {
      writable: true,
      value: originalLocation,
    });
  });

  function mockLocationSearch(search: string): void {
    Object.defineProperty(window, 'location', {
      writable: true,
      value: { ...window.location, search },
    });
  }

  // ===== URL Parameter Detection =====

  describe('URL parameter detection', () => {
    it('E2E-CM-001: ?clientMode=1 enables and locks', () => {
      mockLocationSearch('?clientMode=1');
      const cm = new ClientMode();
      cm.checkURLParam();

      expect(cm.isEnabled()).toBe(true);
      expect(cm.isLocked()).toBe(true);
      cm.dispose();
    });

    it('E2E-CM-002: ?clientMode=true enables and locks', () => {
      mockLocationSearch('?clientMode=true');
      const cm = new ClientMode();
      cm.checkURLParam();

      expect(cm.isEnabled()).toBe(true);
      expect(cm.isLocked()).toBe(true);
      cm.dispose();
    });

    it('E2E-CM-003: ?clientMode (no value) enables and locks', () => {
      mockLocationSearch('?clientMode');
      const cm = new ClientMode();
      cm.checkURLParam();

      expect(cm.isEnabled()).toBe(true);
      expect(cm.isLocked()).toBe(true);
      cm.dispose();
    });

    it('E2E-CM-004: ?clientMode=yes enables and locks', () => {
      mockLocationSearch('?clientMode=yes');
      const cm = new ClientMode();
      cm.checkURLParam();

      expect(cm.isEnabled()).toBe(true);
      expect(cm.isLocked()).toBe(true);
      cm.dispose();
    });

    it('E2E-CM-005: falsy values (0, false, no, off) do NOT enable', () => {
      const falsyValues = ['0', 'false', 'no', 'off', 'FALSE', 'No', 'OFF'];
      for (const val of falsyValues) {
        mockLocationSearch(`?clientMode=${val}`);
        const cm = new ClientMode();
        cm.checkURLParam();

        expect(cm.isEnabled()).toBe(false);
        expect(cm.isLocked()).toBe(false);
        cm.dispose();
      }
    });

    it('E2E-CM-006: absent param does not enable', () => {
      mockLocationSearch('?other=1');
      const cm = new ClientMode();
      cm.checkURLParam();

      expect(cm.isEnabled()).toBe(false);
      expect(cm.isLocked()).toBe(false);
      cm.dispose();
    });

    it('E2E-CM-007: custom urlParamName works end-to-end', () => {
      mockLocationSearch('?review=1');
      const cm = new ClientMode({ urlParamName: 'review' });
      cm.checkURLParam();

      expect(cm.isEnabled()).toBe(true);
      expect(cm.isLocked()).toBe(true);
      cm.dispose();
    });

    it('E2E-CM-008: checkURLParam is safe in SSR-like environment', () => {
      // Temporarily make window.location.search throw
      const broken = new Proxy({} as Location, {
        get() {
          throw new Error('SSR environment');
        },
      });
      Object.defineProperty(window, 'location', { writable: true, value: broken });

      const cm = new ClientMode();
      expect(() => cm.checkURLParam()).not.toThrow();
      expect(cm.isEnabled()).toBe(false);
      cm.dispose();
    });

    it('E2E-CM-009: constructor + checkURLParam in sequence mirrors App constructor', () => {
      // This replicates the exact pattern in App.ts constructor:
      //   this.clientMode = new ClientMode();
      //   this.clientMode.checkURLParam();
      mockLocationSearch('?clientMode=1');
      const cm = new ClientMode();
      cm.checkURLParam();

      expect(cm.isEnabled()).toBe(true);
      expect(cm.isLocked()).toBe(true);
      cm.dispose();
    });
  });

  // ===== Restriction Application =====

  describe('restriction application to DOM', () => {
    let container: HTMLDivElement;

    beforeEach(() => {
      container = document.createElement('div');
      document.body.appendChild(container);
    });

    afterEach(() => {
      container.remove();
    });

    it('E2E-CM-010: applyClientModeRestrictions hides matching elements', () => {
      // Create DOM elements matching the restricted selectors
      const colorPanel = document.createElement('div');
      colorPanel.setAttribute('data-panel', 'color');
      container.appendChild(colorPanel);

      const effectsPanel = document.createElement('div');
      effectsPanel.setAttribute('data-panel', 'effects');
      container.appendChild(effectsPanel);

      const editingToolbar = document.createElement('div');
      editingToolbar.setAttribute('data-toolbar', 'editing');
      container.appendChild(editingToolbar);

      // Non-restricted element should remain visible
      const playbackControls = document.createElement('div');
      playbackControls.setAttribute('data-panel', 'playback');
      container.appendChild(playbackControls);

      // Apply restrictions (mirrors App.applyClientModeRestrictions)
      clientMode.enable();
      const selectors = clientMode.getRestrictedElements();
      for (const selector of selectors) {
        const els = container.querySelectorAll<HTMLElement>(selector);
        els.forEach((el) => {
          el.style.display = 'none';
        });
      }

      expect(colorPanel.style.display).toBe('none');
      expect(effectsPanel.style.display).toBe('none');
      expect(editingToolbar.style.display).toBe('none');
      expect(playbackControls.style.display).not.toBe('none');
    });

    it('E2E-CM-011: all default restricted elements have valid CSS selectors', () => {
      const selectors = clientMode.getRestrictedElements();

      for (const selector of selectors) {
        // Should not throw when passed to querySelector
        expect(() => container.querySelectorAll(selector)).not.toThrow();
      }
    });

    it('E2E-CM-012: restricted elements list covers all expected panels', () => {
      const selectors = clientMode.getRestrictedElements();
      const selectorString = selectors.join(' ');

      // All panel types that should be hidden
      const expectedPanels = ['color', 'effects', 'transform', 'annotate', 'export', 'paint', 'channel', 'stereo', 'notes', 'snapshots', 'network'];
      for (const panel of expectedPanels) {
        expect(selectorString).toContain(`data-panel="${panel}"`);
      }

      // All toolbar types that should be hidden
      const expectedToolbars = ['editing', 'annotation', 'paint'];
      for (const toolbar of expectedToolbars) {
        expect(selectorString).toContain(`data-toolbar="${toolbar}"`);
      }
    });

    it('E2E-CM-013: no-op when container has no matching elements', () => {
      // Container with unrelated elements
      const unrelatedEl = document.createElement('div');
      unrelatedEl.setAttribute('data-panel', 'something-else');
      container.appendChild(unrelatedEl);

      const selectors = clientMode.getRestrictedElements();
      for (const selector of selectors) {
        const els = container.querySelectorAll<HTMLElement>(selector);
        els.forEach((el) => {
          el.style.display = 'none';
        });
      }

      // No elements should have been hidden
      expect(unrelatedEl.style.display).not.toBe('none');
    });

    it('E2E-CM-014: applying restrictions twice is safe (idempotent)', () => {
      const panel = document.createElement('div');
      panel.setAttribute('data-panel', 'color');
      container.appendChild(panel);

      const selectors = clientMode.getRestrictedElements();
      const applyRestrictions = () => {
        for (const selector of selectors) {
          const els = container.querySelectorAll<HTMLElement>(selector);
          els.forEach((el) => {
            el.style.display = 'none';
          });
        }
      };

      applyRestrictions();
      applyRestrictions();

      expect(panel.style.display).toBe('none');
    });
  });

  // ===== State Events =====

  describe('state change events', () => {
    it('E2E-CM-020: stateChanged fires with correct payload on enable', () => {
      const events: ClientModeStateChange[] = [];
      clientMode.on('stateChanged', (e) => events.push(e));

      clientMode.enable();

      expect(events).toHaveLength(1);
      expect(events[0]).toEqual({ enabled: true, locked: false, source: 'api' });
    });

    it('E2E-CM-021: stateChanged fires with correct payload on URL lock', () => {
      mockLocationSearch('?clientMode=1');
      const events: ClientModeStateChange[] = [];
      clientMode.on('stateChanged', (e) => events.push(e));

      clientMode.checkURLParam();

      expect(events).toHaveLength(1);
      expect(events[0]).toEqual({ enabled: true, locked: true, source: 'url' });
    });

    it('E2E-CM-022: stateChanged event can trigger restriction application', () => {
      const container = document.createElement('div');
      const panel = document.createElement('div');
      panel.setAttribute('data-panel', 'color');
      container.appendChild(panel);

      // Wire like App.ts does
      clientMode.on('stateChanged', (state) => {
        if (state.enabled) {
          const selectors = clientMode.getRestrictedElements();
          for (const selector of selectors) {
            const els = container.querySelectorAll<HTMLElement>(selector);
            els.forEach((el) => {
              el.style.display = 'none';
            });
          }
        }
      });

      // Initially visible
      expect(panel.style.display).not.toBe('none');

      clientMode.enable();

      // Now hidden via event handler
      expect(panel.style.display).toBe('none');
    });

    it('E2E-CM-023: promote from api-enabled to url-locked emits event', () => {
      clientMode.enable();
      expect(clientMode.isLocked()).toBe(false);

      const events: ClientModeStateChange[] = [];
      clientMode.on('stateChanged', (e) => events.push(e));

      mockLocationSearch('?clientMode=1');
      clientMode.checkURLParam();

      expect(events).toHaveLength(1);
      expect(events[0]).toEqual({ enabled: true, locked: true, source: 'url' });
      expect(clientMode.isLocked()).toBe(true);
    });

    it('E2E-CM-024: locked mode prevents disable via toggle', () => {
      mockLocationSearch('?clientMode=1');
      clientMode.checkURLParam();

      const events: ClientModeStateChange[] = [];
      clientMode.on('stateChanged', (e) => events.push(e));

      clientMode.toggle();

      expect(events).toHaveLength(0);
      expect(clientMode.isEnabled()).toBe(true);
    });

    it('E2E-CM-025: double checkURLParam when already locked does not re-emit', () => {
      mockLocationSearch('?clientMode=1');
      clientMode.checkURLParam();

      const events: ClientModeStateChange[] = [];
      clientMode.on('stateChanged', (e) => events.push(e));

      clientMode.checkURLParam();

      // Already locked, no new emission
      expect(events).toHaveLength(0);
    });

    it('E2E-CM-026: no events after dispose', () => {
      const events: ClientModeStateChange[] = [];
      clientMode.on('stateChanged', (e) => events.push(e));

      clientMode.enable();
      expect(events).toHaveLength(1);

      clientMode.dispose();

      // After dispose, operations are no-ops
      clientMode.enable();
      clientMode.disable();
      clientMode.toggle();

      expect(events).toHaveLength(1);
    });
  });

  // ===== Category-to-Tab Mapping Coherence =====

  describe('category-to-tab mapping', () => {
    it('E2E-CM-030: restricted categories cover all non-viewer tabs', () => {
      const categories = clientMode.getRestrictedCategories();

      // TabIds: 'view' | 'color' | 'effects' | 'transform' | 'annotate' | 'qc'
      // In client mode, 'view' and 'qc' should remain accessible.
      // The restricted categories should block the rest.

      // 'color' tab -> 'color' category
      expect(categories).toContain('color');
      // 'transform' tab -> 'transform' category
      expect(categories).toContain('transform');
      // 'annotate' tab -> 'annotation' and 'paint' categories
      expect(categories).toContain('annotation');
      expect(categories).toContain('paint');
      // 'edit' category (undo/redo)
      expect(categories).toContain('edit');
      // 'export' category
      expect(categories).toContain('export');

      // 'view' should NOT be restricted
      expect(categories).not.toContain('view');
      // 'playback' should NOT be restricted
      expect(categories).not.toContain('playback');
      // 'help' should NOT be restricted
      expect(categories).not.toContain('help');
    });

    it('E2E-CM-031: tab category is restricted (switching tabs blocked)', () => {
      const categories = clientMode.getRestrictedCategories();
      expect(categories).toContain('tab');

      // But specific tab actions for allowed tabs should pass isActionAllowed
      clientMode.enable();
      expect(clientMode.isActionAllowed('tab.view')).toBe(true);
      expect(clientMode.isActionAllowed('tab.qc')).toBe(true);
      // Blocked tabs
      expect(clientMode.isActionAllowed('tab.color')).toBe(false);
      expect(clientMode.isActionAllowed('tab.effects')).toBe(false);
      expect(clientMode.isActionAllowed('tab.transform')).toBe(false);
      expect(clientMode.isActionAllowed('tab.annotate')).toBe(false);
    });

    it('E2E-CM-032: help and panel.close are always allowed', () => {
      clientMode.enable();

      expect(clientMode.isActionAllowed('help.toggleCheatSheet')).toBe(true);
      expect(clientMode.isActionAllowed('panel.close')).toBe(true);
    });

    it('E2E-CM-033: focus navigation actions remain available', () => {
      clientMode.enable();

      expect(clientMode.isActionAllowed('focus.nextZone')).toBe(true);
      expect(clientMode.isActionAllowed('focus.previousZone')).toBe(true);
    });
  });

  // ===== Action Filtering Comprehensive =====

  describe('action filtering comprehensive', () => {
    it('E2E-CM-040: all playback actions allowed when enabled', () => {
      clientMode.enable();

      const playbackActions = [
        'playback.toggle', 'playback.stepForward', 'playback.stepBackward',
        'playback.toggleDirection', 'playback.goToStart', 'playback.goToEnd',
        'playback.slower', 'playback.stop', 'playback.faster',
      ];

      for (const action of playbackActions) {
        expect(clientMode.isActionAllowed(action)).toBe(true);
      }
    });

    it('E2E-CM-041: all view actions allowed when enabled', () => {
      clientMode.enable();

      const viewActions = [
        'view.fitToWindow', 'view.cycleWipeMode', 'view.toggleWaveform',
        'view.toggleAB', 'view.toggleGuides', 'view.togglePixelProbe',
        'view.toggleFalseColor', 'view.toggleToneMapping',
        'view.toggleTimecodeOverlay', 'view.toggleFullscreen',
        'view.togglePresentation', 'view.toggleZebraStripes',
        'view.toggleSpotlight', 'view.cycleLuminanceVis',
        'view.toggleGhostFrames', 'view.togglePAR',
        'view.cycleBackgroundPattern', 'view.toggleCheckerboard',
        'view.toggleDifferenceMatte', 'view.toggleSplitScreen',
        'view.toggleInfoPanel', 'view.openPresentationWindow',
      ];

      for (const action of viewActions) {
        expect(clientMode.isActionAllowed(action)).toBe(true);
      }
    });

    it('E2E-CM-042: all blocked categories produce blocked actions', () => {
      clientMode.enable();

      const blockedActions = [
        'edit.undo', 'edit.redo',
        'paint.pen', 'paint.eraser', 'paint.text', 'paint.rectangle',
        'annotation.previous', 'annotation.next',
        'color.toggleColorWheels', 'color.toggleInversion',
        'transform.rotateLeft', 'transform.flipHorizontal',
        'export.quickExport', 'export.copyFrame',
        'channel.red', 'channel.green',
        'stereo.toggle',
        'display.cycleProfile',
        'snapshot.create',
        'notes.addNote',
        'network.togglePanel',
        'layout.default',
      ];

      for (const action of blockedActions) {
        expect(clientMode.isActionAllowed(action)).toBe(false);
      }
    });

    it('E2E-CM-043: all actions allowed when client mode is disabled', () => {
      expect(clientMode.isEnabled()).toBe(false);

      const allActions = [
        'playback.toggle', 'edit.undo', 'paint.pen', 'color.toggleColorWheels',
        'transform.rotateLeft', 'export.quickExport', 'annotation.next',
        'channel.red', 'stereo.toggle', 'display.cycleProfile',
        'snapshot.create', 'notes.addNote', 'network.togglePanel',
        'layout.default', 'view.fitToWindow', 'help.toggleCheatSheet',
      ];

      for (const action of allActions) {
        expect(clientMode.isActionAllowed(action)).toBe(true);
      }
    });
  });

  // ===== Dispose Lifecycle =====

  describe('dispose lifecycle', () => {
    it('E2E-CM-050: dispose resets all state', () => {
      mockLocationSearch('?clientMode=1');
      clientMode.checkURLParam();
      expect(clientMode.isEnabled()).toBe(true);
      expect(clientMode.isLocked()).toBe(true);

      clientMode.dispose();

      expect(clientMode.isEnabled()).toBe(false);
      expect(clientMode.isLocked()).toBe(false);
    });

    it('E2E-CM-051: operations are no-ops after dispose', () => {
      clientMode.dispose();

      clientMode.enable();
      expect(clientMode.isEnabled()).toBe(false);

      clientMode.toggle();
      expect(clientMode.isEnabled()).toBe(false);

      mockLocationSearch('?clientMode=1');
      clientMode.checkURLParam();
      expect(clientMode.isEnabled()).toBe(false);
    });

    it('E2E-CM-052: double dispose is safe', () => {
      clientMode.dispose();
      expect(() => clientMode.dispose()).not.toThrow();
    });
  });

  // ===== Integration: Simulated App Wiring =====

  describe('simulated App wiring', () => {
    it('E2E-CM-060: full lifecycle - construct, check URL, mount, apply restrictions, dispose', () => {
      // 1. Construct (App constructor)
      mockLocationSearch('?clientMode=1');
      const cm = new ClientMode();
      cm.checkURLParam();

      expect(cm.isEnabled()).toBe(true);
      expect(cm.isLocked()).toBe(true);

      // 2. Create DOM (App.createLayout)
      const container = document.createElement('div');
      const colorPanel = document.createElement('div');
      colorPanel.setAttribute('data-panel', 'color');
      container.appendChild(colorPanel);

      const paintToolbar = document.createElement('div');
      paintToolbar.setAttribute('data-toolbar', 'paint');
      container.appendChild(paintToolbar);

      // 3. Apply restrictions (App.createLayout checks clientMode.isEnabled())
      if (cm.isEnabled()) {
        const selectors = cm.getRestrictedElements();
        for (const selector of selectors) {
          container.querySelectorAll<HTMLElement>(selector).forEach((el) => {
            el.style.display = 'none';
          });
        }
      }

      expect(colorPanel.style.display).toBe('none');
      expect(paintToolbar.style.display).toBe('none');

      // 4. Wire stateChanged for dynamic changes
      cm.on('stateChanged', (state) => {
        if (state.enabled) {
          const selectors = cm.getRestrictedElements();
          for (const selector of selectors) {
            container.querySelectorAll<HTMLElement>(selector).forEach((el) => {
              el.style.display = 'none';
            });
          }
        }
      });

      // 5. Dispose (App.dispose)
      cm.dispose();
      expect(cm.isEnabled()).toBe(false);

      container.remove();
    });

    it('E2E-CM-061: API enable triggers stateChanged which applies restrictions', () => {
      const container = document.createElement('div');
      const effectsPanel = document.createElement('div');
      effectsPanel.setAttribute('data-panel', 'effects');
      container.appendChild(effectsPanel);

      // Wire stateChanged listener (mirrors App wiring)
      clientMode.on('stateChanged', (state) => {
        if (state.enabled) {
          const selectors = clientMode.getRestrictedElements();
          for (const selector of selectors) {
            container.querySelectorAll<HTMLElement>(selector).forEach((el) => {
              el.style.display = 'none';
            });
          }
        }
      });

      // Initially visible
      expect(effectsPanel.style.display).not.toBe('none');

      // Enable via API
      clientMode.enable();

      // Now hidden
      expect(effectsPanel.style.display).toBe('none');

      container.remove();
    });
  });

  // ===== Edge Cases =====

  describe('edge cases', () => {
    it('E2E-CM-070: isActionAllowed with empty string returns false when enabled', () => {
      clientMode.enable();
      expect(clientMode.isActionAllowed('')).toBe(false);
    });

    it('E2E-CM-071: isActionAllowed with unknown action returns false when enabled', () => {
      clientMode.enable();
      expect(clientMode.isActionAllowed('unknown.action')).toBe(false);
    });

    it('E2E-CM-072: getRestrictedElements returns copies (not references)', () => {
      const elements1 = clientMode.getRestrictedElements();
      const elements2 = clientMode.getRestrictedElements();

      expect(elements1).toEqual(elements2);
      expect(elements1).not.toBe(elements2);

      // Mutating one should not affect the other
      elements1.push('[data-panel="custom"]');
      expect(elements2).not.toContain('[data-panel="custom"]');
    });

    it('E2E-CM-073: getRestrictedCategories returns copies (not references)', () => {
      const cats1 = clientMode.getRestrictedCategories();
      const cats2 = clientMode.getRestrictedCategories();

      expect(cats1).toEqual(cats2);
      expect(cats1).not.toBe(cats2);
    });

    it('E2E-CM-074: custom allowedCategories with trailing dot handled correctly', () => {
      const cm = new ClientMode({ allowedCategories: ['playback.', 'edit'] });
      cm.enable();

      // 'playback.' should match playback actions
      expect(cm.isActionAllowed('playback.toggle')).toBe(true);
      // 'edit' gets converted to 'edit.' so it matches edit actions
      expect(cm.isActionAllowed('edit.undo')).toBe(true);

      cm.dispose();
    });
  });
});
