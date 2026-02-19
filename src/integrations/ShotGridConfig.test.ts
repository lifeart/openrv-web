/**
 * ShotGridConfigUI Unit Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ShotGridConfigUI } from './ShotGridConfig';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fillForm(
  configUI: ShotGridConfigUI,
  values: { serverUrl?: string; scriptName?: string; apiKey?: string; projectId?: string },
): void {
  const container = configUI.render();
  const serverUrl = container.querySelector<HTMLInputElement>('[data-testid="shotgrid-server-url"]')!;
  const scriptName = container.querySelector<HTMLInputElement>('[data-testid="shotgrid-script-name"]')!;
  const apiKey = container.querySelector<HTMLInputElement>('[data-testid="shotgrid-api-key"]')!;
  const projectId = container.querySelector<HTMLInputElement>('[data-testid="shotgrid-project-id"]')!;

  if (values.serverUrl !== undefined) serverUrl.value = values.serverUrl;
  if (values.scriptName !== undefined) scriptName.value = values.scriptName;
  if (values.apiKey !== undefined) apiKey.value = values.apiKey;
  if (values.projectId !== undefined) projectId.value = values.projectId;
}

function clickConnect(configUI: ShotGridConfigUI): void {
  const container = configUI.render();
  const btn = container.querySelector<HTMLButtonElement>('[data-testid="shotgrid-connect-btn"]')!;
  btn.click();
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ShotGridConfigUI', () => {
  let configUI: ShotGridConfigUI;

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    configUI = new ShotGridConfigUI();
  });

  afterEach(() => {
    configUI.dispose();
  });

  it('SG-CFG-001: renders all form fields', () => {
    const container = configUI.render();

    expect(container.querySelector('[data-testid="shotgrid-server-url"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="shotgrid-script-name"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="shotgrid-api-key"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="shotgrid-project-id"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="shotgrid-connect-btn"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="shotgrid-remember-key"]')).toBeTruthy();
  });

  it('SG-CFG-002: API key input is password type', () => {
    const container = configUI.render();
    const apiKey = container.querySelector<HTMLInputElement>('[data-testid="shotgrid-api-key"]')!;
    expect(apiKey.type).toBe('password');
  });

  it('SG-CFG-003: validation rejects empty fields', () => {
    configUI.render();
    fillForm(configUI, { serverUrl: '', scriptName: '', apiKey: '', projectId: '' });

    expect(configUI.validate()).toBe('Server URL is required');

    fillForm(configUI, { serverUrl: 'https://example.com' });
    expect(configUI.validate()).toBe('Script Name is required');

    fillForm(configUI, { scriptName: 'test' });
    expect(configUI.validate()).toBe('API Key is required');

    fillForm(configUI, { apiKey: 'secret' });
    expect(configUI.validate()).toBe('Project ID is required');

    fillForm(configUI, { projectId: '42' });
    expect(configUI.validate()).toBeNull();
  });

  it('SG-CFG-004: validation rejects invalid server URL', () => {
    configUI.render();
    fillForm(configUI, {
      serverUrl: 'not-a-url',
      scriptName: 'test',
      apiKey: 'secret',
      projectId: '42',
    });

    expect(configUI.validate()).toBe('Server URL must be a valid URL');
  });

  it('SG-CFG-005: validation rejects non-positive project ID', () => {
    configUI.render();
    fillForm(configUI, {
      serverUrl: 'https://example.com',
      scriptName: 'test',
      apiKey: 'secret',
      projectId: '0',
    });

    expect(configUI.validate()).toBe('Project ID must be a positive integer');

    fillForm(configUI, { projectId: '-5' });
    expect(configUI.validate()).toBe('Project ID must be a positive integer');
  });

  it('SG-CFG-006: emits connect event with valid config', () => {
    configUI.render();
    fillForm(configUI, {
      serverUrl: 'https://studio.shotgrid.autodesk.com',
      scriptName: 'openrv-web',
      apiKey: 'test-key',
      projectId: '42',
    });

    const onConnect = vi.fn();
    configUI.on('connect', onConnect);
    clickConnect(configUI);

    expect(onConnect).toHaveBeenCalledWith({
      serverUrl: 'https://studio.shotgrid.autodesk.com',
      scriptName: 'openrv-web',
      apiKey: 'test-key',
      projectId: 42,
    });
    expect(configUI.getState()).toBe('connecting');
  });

  it('SG-CFG-007: does not emit connect with invalid form', () => {
    configUI.render();
    fillForm(configUI, { serverUrl: '', scriptName: '', apiKey: '', projectId: '' });

    const onConnect = vi.fn();
    configUI.on('connect', onConnect);
    clickConnect(configUI);

    expect(onConnect).not.toHaveBeenCalled();
    expect(configUI.getState()).toBe('error');
  });

  it('SG-CFG-008: state transitions: disconnected -> connecting -> connected -> disconnected', () => {
    configUI.render();
    expect(configUI.getState()).toBe('disconnected');

    fillForm(configUI, {
      serverUrl: 'https://studio.shotgrid.autodesk.com',
      scriptName: 'openrv-web',
      apiKey: 'test-key',
      projectId: '42',
    });

    clickConnect(configUI);
    expect(configUI.getState()).toBe('connecting');

    configUI.setState('connected');
    expect(configUI.getState()).toBe('connected');

    // Click again to disconnect
    const onDisconnect = vi.fn();
    configUI.on('disconnect', onDisconnect);
    clickConnect(configUI);
    expect(configUI.getState()).toBe('disconnected');
    expect(onDisconnect).toHaveBeenCalled();
  });

  it('SG-CFG-009: does NOT persist API key in localStorage', () => {
    configUI.render();
    fillForm(configUI, {
      serverUrl: 'https://studio.shotgrid.autodesk.com',
      scriptName: 'openrv-web',
      apiKey: 'super-secret',
      projectId: '42',
    });

    clickConnect(configUI);

    const stored = localStorage.getItem('openrv-sg-config');
    expect(stored).toBeTruthy();
    expect(stored).not.toContain('super-secret');

    // sessionStorage should also not have it (checkbox unchecked by default)
    expect(sessionStorage.getItem('openrv-sg-config-key')).toBeNull();
  });

  it('SG-CFG-010: dispose prevents double-dispose', () => {
    configUI.render();
    configUI.dispose();
    // Second dispose should not throw
    expect(() => configUI.dispose()).not.toThrow();
  });

  it('SG-CFG-011: has ARIA attributes for accessibility', () => {
    const container = configUI.render();
    expect(container.getAttribute('role')).toBe('form');
    expect(container.getAttribute('aria-label')).toBe('ShotGrid Configuration');

    const errorEl = container.querySelector('[data-testid="shotgrid-config-error"]')!;
    expect(errorEl.getAttribute('role')).toBe('alert');

    const statusEl = container.querySelector('[data-testid="shotgrid-config-status"]')!;
    expect(statusEl.getAttribute('aria-live')).toBe('polite');
  });

  it('SG-CFG-012: restoreConfig emits configLoaded with saved data', () => {
    // Pre-populate localStorage
    localStorage.setItem('openrv-sg-config', JSON.stringify({
      serverUrl: 'https://saved.shotgrid.autodesk.com',
      scriptName: 'saved-script',
      projectId: 77,
    }));

    configUI.render();

    const onConfigLoaded = vi.fn();
    configUI.on('configLoaded', onConfigLoaded);

    // configLoaded should NOT have fired during render (listeners not attached yet)
    expect(onConfigLoaded).not.toHaveBeenCalled();

    // Now explicitly restore
    configUI.restoreConfig();

    expect(onConfigLoaded).toHaveBeenCalledWith({
      serverUrl: 'https://saved.shotgrid.autodesk.com',
      scriptName: 'saved-script',
      apiKey: '',
      projectId: 77,
    });

    // Form fields should be populated
    const container = configUI.render();
    const serverUrl = container.querySelector<HTMLInputElement>('[data-testid="shotgrid-server-url"]')!;
    expect(serverUrl.value).toBe('https://saved.shotgrid.autodesk.com');
  });

  it('SG-CFG-013: restoreConfig restores API key from sessionStorage', () => {
    localStorage.setItem('openrv-sg-config', JSON.stringify({
      serverUrl: 'https://studio.shotgrid.autodesk.com',
      scriptName: 'test',
      projectId: 42,
    }));
    sessionStorage.setItem('openrv-sg-config-key', 'restored-secret');

    configUI.render();
    configUI.restoreConfig();

    const container = configUI.render();
    const apiKey = container.querySelector<HTMLInputElement>('[data-testid="shotgrid-api-key"]')!;
    expect(apiKey.value).toBe('restored-secret');

    const rememberKey = container.querySelector<HTMLInputElement>('[data-testid="shotgrid-remember-key"]')!;
    expect(rememberKey.checked).toBe(true);
  });
});
