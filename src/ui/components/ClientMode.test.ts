import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ClientMode } from './ClientMode';

describe('ClientMode', () => {
  let clientMode: ClientMode;
  let originalLocation: Location;

  beforeEach(() => {
    clientMode = new ClientMode();
    originalLocation = window.location;
  });

  afterEach(() => {
    clientMode.dispose();
    // Restore window.location
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

  it('CM-001: constructor creates instance with default config', () => {
    expect(clientMode).toBeInstanceOf(ClientMode);
    expect(clientMode.isEnabled()).toBe(false);
    expect(clientMode.isLocked()).toBe(false);
  });

  it('CM-002: enable/disable/toggle/isEnabled work correctly', () => {
    expect(clientMode.isEnabled()).toBe(false);

    clientMode.enable();
    expect(clientMode.isEnabled()).toBe(true);

    clientMode.disable();
    expect(clientMode.isEnabled()).toBe(false);

    clientMode.toggle();
    expect(clientMode.isEnabled()).toBe(true);

    clientMode.toggle();
    expect(clientMode.isEnabled()).toBe(false);
  });

  it('CM-003: emits stateChanged on enable', () => {
    const handler = vi.fn();
    clientMode.on('stateChanged', handler);

    clientMode.enable();

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith({ enabled: true, locked: false, source: 'api' });
  });

  it('CM-004: emits stateChanged on disable', () => {
    clientMode.enable();

    const handler = vi.fn();
    clientMode.on('stateChanged', handler);

    clientMode.disable();

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith({ enabled: false, locked: false, source: 'api' });
  });

  it('CM-005: checkURLParam enables from URL param', () => {
    mockLocationSearch('?clientMode=1');

    const handler = vi.fn();
    clientMode.on('stateChanged', handler);

    clientMode.checkURLParam();

    expect(clientMode.isEnabled()).toBe(true);
    expect(clientMode.isLocked()).toBe(true);
    expect(handler).toHaveBeenCalledWith({ enabled: true, locked: true, source: 'url' });
  });

  it('CM-006: checkURLParam does nothing when param absent', () => {
    mockLocationSearch('');

    const handler = vi.fn();
    clientMode.on('stateChanged', handler);

    clientMode.checkURLParam();

    expect(clientMode.isEnabled()).toBe(false);
    expect(clientMode.isLocked()).toBe(false);
    expect(handler).not.toHaveBeenCalled();
  });

  it('CM-007: isLocked returns true when enabled via URL', () => {
    mockLocationSearch('?clientMode=1');

    clientMode.checkURLParam();

    expect(clientMode.isLocked()).toBe(true);
  });

  it('CM-008: disable is no-op when locked via URL', () => {
    mockLocationSearch('?clientMode=1');

    clientMode.checkURLParam();
    expect(clientMode.isEnabled()).toBe(true);

    const handler = vi.fn();
    clientMode.on('stateChanged', handler);

    clientMode.disable();

    // Should still be enabled — locked
    expect(clientMode.isEnabled()).toBe(true);
    expect(handler).not.toHaveBeenCalled();
  });

  it('CM-009: isActionAllowed allows playback actions', () => {
    clientMode.enable();

    expect(clientMode.isActionAllowed('playback.toggle')).toBe(true);
    expect(clientMode.isActionAllowed('playback.stepForward')).toBe(true);
    expect(clientMode.isActionAllowed('playback.stepBackward')).toBe(true);
    expect(clientMode.isActionAllowed('playback.goToStart')).toBe(true);
    expect(clientMode.isActionAllowed('playback.goToEnd')).toBe(true);
    expect(clientMode.isActionAllowed('playback.slower')).toBe(true);
    expect(clientMode.isActionAllowed('playback.stop')).toBe(true);
    expect(clientMode.isActionAllowed('playback.faster')).toBe(true);
  });

  it('CM-010: isActionAllowed blocks edit actions', () => {
    clientMode.enable();

    expect(clientMode.isActionAllowed('edit.undo')).toBe(false);
    expect(clientMode.isActionAllowed('edit.redo')).toBe(false);
  });

  it('CM-011: isActionAllowed blocks paint actions', () => {
    clientMode.enable();

    expect(clientMode.isActionAllowed('paint.pen')).toBe(false);
    expect(clientMode.isActionAllowed('paint.eraser')).toBe(false);
    expect(clientMode.isActionAllowed('paint.text')).toBe(false);
    expect(clientMode.isActionAllowed('paint.rectangle')).toBe(false);
  });

  it('CM-012: isActionAllowed allows timeline navigation', () => {
    clientMode.enable();

    expect(clientMode.isActionAllowed('timeline.nextShot')).toBe(true);
    expect(clientMode.isActionAllowed('timeline.previousShot')).toBe(true);

    // Other timeline actions should be blocked
    expect(clientMode.isActionAllowed('timeline.setInPoint')).toBe(false);
    expect(clientMode.isActionAllowed('timeline.setOutPoint')).toBe(false);
    expect(clientMode.isActionAllowed('timeline.toggleMark')).toBe(false);
  });

  it('CM-013: isActionAllowed blocks color actions', () => {
    clientMode.enable();

    expect(clientMode.isActionAllowed('color.toggleColorWheels')).toBe(false);
    expect(clientMode.isActionAllowed('color.toggleInversion')).toBe(false);
    expect(clientMode.isActionAllowed('color.toggleHSLQualifier')).toBe(false);
  });

  it('CM-014: custom allowedCategories overrides defaults', () => {
    const custom = new ClientMode({
      allowedCategories: ['playback', 'edit'],
    });

    custom.enable();

    // Playback should be allowed (custom list)
    expect(custom.isActionAllowed('playback.toggle')).toBe(true);
    // Edit should now be allowed (custom list)
    expect(custom.isActionAllowed('edit.undo')).toBe(true);
    // Timeline navigation should now be blocked (not in custom list)
    expect(custom.isActionAllowed('timeline.nextShot')).toBe(false);
    // Help should be blocked (not in custom list)
    expect(custom.isActionAllowed('help.toggleCheatSheet')).toBe(false);

    custom.dispose();
  });

  it('CM-015: getRestrictedCategories returns blocked categories', () => {
    const categories = clientMode.getRestrictedCategories();

    expect(categories).toContain('edit');
    expect(categories).toContain('paint');
    expect(categories).toContain('annotation');
    expect(categories).toContain('color');
    expect(categories).toContain('transform');
    expect(categories).toContain('export');
    expect(categories).toContain('channel');
    expect(categories).toContain('stereo');
    expect(categories).toContain('display');
    expect(categories).toContain('snapshot');
    expect(categories).toContain('notes');
    expect(categories).toContain('network');
    expect(categories).toContain('tab');
    expect(categories).toContain('layout');

    // Should not contain allowed categories
    expect(categories).not.toContain('playback');
    expect(categories).not.toContain('help');
    expect(categories).not.toContain('view');
    expect(categories).not.toContain('focus');
  });

  it('CM-016: dispose cleans up listeners and resets state', () => {
    const handler = vi.fn();
    clientMode.on('stateChanged', handler);

    clientMode.enable();
    expect(handler).toHaveBeenCalledTimes(1);

    clientMode.dispose();

    // After dispose, state is reset
    expect(clientMode.isEnabled()).toBe(false);
    expect(clientMode.isLocked()).toBe(false);

    // enable is a no-op after dispose
    clientMode.enable();
    expect(handler).toHaveBeenCalledTimes(1); // still 1
  });

  it('CM-017: isActionAllowed returns true for all actions when disabled', () => {
    expect(clientMode.isEnabled()).toBe(false);

    // All actions should be allowed when client mode is off
    expect(clientMode.isActionAllowed('edit.undo')).toBe(true);
    expect(clientMode.isActionAllowed('paint.pen')).toBe(true);
    expect(clientMode.isActionAllowed('color.toggleColorWheels')).toBe(true);
    expect(clientMode.isActionAllowed('transform.rotateLeft')).toBe(true);
    expect(clientMode.isActionAllowed('export.quickExport')).toBe(true);
    expect(clientMode.isActionAllowed('annotation.next')).toBe(true);
    expect(clientMode.isActionAllowed('playback.toggle')).toBe(true);
  });

  it('CM-018: toggle cycles enabled state', () => {
    expect(clientMode.isEnabled()).toBe(false);

    clientMode.toggle();
    expect(clientMode.isEnabled()).toBe(true);

    clientMode.toggle();
    expect(clientMode.isEnabled()).toBe(false);

    clientMode.toggle();
    expect(clientMode.isEnabled()).toBe(true);
  });

  it('CM-019: enable is idempotent (double-enable does not double-emit)', () => {
    const handler = vi.fn();
    clientMode.on('stateChanged', handler);

    clientMode.enable();
    clientMode.enable();

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('CM-020: disable is idempotent (double-disable does not double-emit)', () => {
    clientMode.enable();

    const handler = vi.fn();
    clientMode.on('stateChanged', handler);

    clientMode.disable();
    clientMode.disable();

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('CM-021: checkURLParam with ?clientMode=0 does NOT enable', () => {
    mockLocationSearch('?clientMode=0');

    clientMode.checkURLParam();

    expect(clientMode.isEnabled()).toBe(false);
    expect(clientMode.isLocked()).toBe(false);
  });

  it('CM-022: checkURLParam with ?clientMode=false does NOT enable', () => {
    mockLocationSearch('?clientMode=false');

    clientMode.checkURLParam();

    expect(clientMode.isEnabled()).toBe(false);
    expect(clientMode.isLocked()).toBe(false);
  });

  it('CM-023: checkURLParam with ?clientMode=FALSE is case-insensitive', () => {
    mockLocationSearch('?clientMode=FALSE');

    clientMode.checkURLParam();

    expect(clientMode.isEnabled()).toBe(false);
    expect(clientMode.isLocked()).toBe(false);
  });

  it('CM-024: checkURLParam with ?clientMode=no does NOT enable', () => {
    mockLocationSearch('?clientMode=no');

    clientMode.checkURLParam();

    expect(clientMode.isEnabled()).toBe(false);
    expect(clientMode.isLocked()).toBe(false);
  });

  it('CM-024b: checkURLParam with ?clientMode=off does NOT enable', () => {
    mockLocationSearch('?clientMode=off');

    clientMode.checkURLParam();

    expect(clientMode.isEnabled()).toBe(false);
    expect(clientMode.isLocked()).toBe(false);
  });

  it('CM-025: checkURLParam with ?clientMode (empty value) enables', () => {
    mockLocationSearch('?clientMode');

    clientMode.checkURLParam();

    expect(clientMode.isEnabled()).toBe(true);
    expect(clientMode.isLocked()).toBe(true);
  });

  it('CM-026: custom urlParamName works', () => {
    const custom = new ClientMode({ urlParamName: 'reviewMode' });
    mockLocationSearch('?reviewMode=1');

    custom.checkURLParam();

    expect(custom.isEnabled()).toBe(true);
    expect(custom.isLocked()).toBe(true);

    custom.dispose();
  });

  it('CM-027: toggle on locked instance remains enabled', () => {
    mockLocationSearch('?clientMode=1');
    clientMode.checkURLParam();

    const handler = vi.fn();
    clientMode.on('stateChanged', handler);

    clientMode.toggle(); // tries to disable, but locked

    expect(clientMode.isEnabled()).toBe(true);
    expect(clientMode.isLocked()).toBe(true);
    expect(handler).not.toHaveBeenCalled();
  });

  it('CM-028: getRestrictedElements returns CSS selectors', () => {
    const elements = clientMode.getRestrictedElements();

    expect(Array.isArray(elements)).toBe(true);
    expect(elements.length).toBeGreaterThan(0);
    expect(elements).toContain('[data-panel="color"]');
    expect(elements).toContain('[data-toolbar="editing"]');
  });

  it('CM-029: isActionAllowed allows view actions in client mode', () => {
    clientMode.enable();

    expect(clientMode.isActionAllowed('view.fitToWindow')).toBe(true);
    expect(clientMode.isActionAllowed('view.toggleFullscreen')).toBe(true);
    expect(clientMode.isActionAllowed('view.toggleWaveform')).toBe(true);
    expect(clientMode.isActionAllowed('view.togglePixelProbe')).toBe(true);
    expect(clientMode.isActionAllowed('view.toggleFalseColor')).toBe(true);
    expect(clientMode.isActionAllowed('view.toggleGuides')).toBe(true);
    expect(clientMode.isActionAllowed('view.toggleTimecodeOverlay')).toBe(true);
    expect(clientMode.isActionAllowed('view.toggleAB')).toBe(true);
  });

  it('CM-030: checkURLParam after API enable promotes to locked', () => {
    clientMode.enable();
    expect(clientMode.isLocked()).toBe(false);

    const handler = vi.fn();
    clientMode.on('stateChanged', handler);

    mockLocationSearch('?clientMode=1');
    clientMode.checkURLParam();

    expect(clientMode.isLocked()).toBe(true);
    // Should emit to notify about lock change
    expect(handler).toHaveBeenCalledWith({ enabled: true, locked: true, source: 'url' });
  });

  it('CM-031: double dispose is safe', () => {
    clientMode.dispose();
    expect(() => clientMode.dispose()).not.toThrow();
  });

  it('CM-032: empty allowedCategories blocks all actions', () => {
    const custom = new ClientMode({ allowedCategories: [] });
    custom.enable();

    expect(custom.isActionAllowed('playback.toggle')).toBe(false);
    expect(custom.isActionAllowed('help.toggleCheatSheet')).toBe(false);
    expect(custom.isActionAllowed('view.fitToWindow')).toBe(false);

    custom.dispose();
  });
});
