/**
 * ShotGridConfigUI - Configuration panel for ShotGrid connection.
 *
 * Provides form UI for server URL, script name, API key, and project ID.
 * Emits events on connect/disconnect. Security: API key is NOT persisted
 * by default; only stored in sessionStorage when user opts in.
 */

import { EventEmitter, type EventMap } from '../utils/EventEmitter';
import type { ShotGridConfig } from './ShotGridBridge';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface ShotGridConfigEvents extends EventMap {
  connect: ShotGridConfig;
  disconnect: void;
  configLoaded: ShotGridConfig;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'openrv-sg-config';

// ---------------------------------------------------------------------------
// ShotGridConfigUI
// ---------------------------------------------------------------------------

export class ShotGridConfigUI extends EventEmitter<ShotGridConfigEvents> {
  private container: HTMLElement | null = null;
  private state: ConnectionState = 'disconnected';
  private disposed = false;

  // Form elements (created lazily)
  private serverUrlInput!: HTMLInputElement;
  private scriptNameInput!: HTMLInputElement;
  private apiKeyInput!: HTMLInputElement;
  private projectIdInput!: HTMLInputElement;
  private rememberKeyCheckbox!: HTMLInputElement;
  private connectBtn!: HTMLButtonElement;
  private statusEl!: HTMLElement;
  private errorEl!: HTMLElement;

  getState(): ConnectionState {
    return this.state;
  }

  setState(newState: ConnectionState, errorMessage?: string): void {
    this.state = newState;
    if (this.container) {
      this.updateUI(errorMessage);
    }
  }

  /**
   * Render the config form. Returns the container element.
   */
  render(): HTMLElement {
    if (this.container) return this.container;

    this.container = document.createElement('div');
    this.container.dataset.testid = 'shotgrid-config';
    this.container.setAttribute('role', 'form');
    this.container.setAttribute('aria-label', 'ShotGrid Configuration');
    this.container.style.cssText = 'display: flex; flex-direction: column; gap: 10px; padding: 12px;';

    // --- Server URL ---
    this.serverUrlInput = this.createInput('Server URL', 'url', 'https://studio.shotgrid.autodesk.com', 'shotgrid-server-url');

    // --- Script Name ---
    this.scriptNameInput = this.createInput('Script Name', 'text', 'my-script', 'shotgrid-script-name');

    // --- API Key ---
    this.apiKeyInput = this.createInput('API Key', 'password', '', 'shotgrid-api-key');

    // --- Project ID ---
    this.projectIdInput = this.createInput('Project ID', 'number', '', 'shotgrid-project-id');
    this.projectIdInput.min = '1';

    // --- Remember API Key checkbox ---
    const rememberRow = document.createElement('div');
    rememberRow.style.cssText = 'display: flex; align-items: center; gap: 6px; font-size: 11px; color: var(--text-muted);';

    this.rememberKeyCheckbox = document.createElement('input');
    this.rememberKeyCheckbox.type = 'checkbox';
    this.rememberKeyCheckbox.id = 'shotgrid-remember-key';
    this.rememberKeyCheckbox.dataset.testid = 'shotgrid-remember-key';

    const rememberLabel = document.createElement('label');
    rememberLabel.htmlFor = 'shotgrid-remember-key';
    rememberLabel.textContent = 'Remember API Key (session only)';

    rememberRow.appendChild(this.rememberKeyCheckbox);
    rememberRow.appendChild(rememberLabel);
    this.container.appendChild(rememberRow);

    // --- Error display ---
    this.errorEl = document.createElement('div');
    this.errorEl.dataset.testid = 'shotgrid-config-error';
    this.errorEl.setAttribute('role', 'alert');
    this.errorEl.style.cssText = 'color: var(--text-danger, #ef4444); font-size: 11px; display: none;';
    this.container.appendChild(this.errorEl);

    // --- Status ---
    this.statusEl = document.createElement('div');
    this.statusEl.dataset.testid = 'shotgrid-config-status';
    this.statusEl.setAttribute('aria-live', 'polite');
    this.statusEl.style.cssText = 'font-size: 11px; color: var(--text-muted); display: none;';
    this.container.appendChild(this.statusEl);

    // --- Connect button ---
    this.connectBtn = document.createElement('button');
    this.connectBtn.type = 'button';
    this.connectBtn.dataset.testid = 'shotgrid-connect-btn';
    this.connectBtn.textContent = 'Connect';
    this.connectBtn.style.cssText = `
      padding: 8px 16px;
      border: 1px solid var(--accent-primary, #3b82f6);
      border-radius: 4px;
      background: rgba(59, 130, 246, 0.1);
      color: var(--accent-primary, #3b82f6);
      cursor: pointer;
      font-size: 12px;
      font-weight: 500;
      transition: all 0.12s ease;
    `;
    this.connectBtn.addEventListener('click', () => this.handleConnect());
    this.container.appendChild(this.connectBtn);

    // Enter key in any input triggers connect
    const inputs = [this.serverUrlInput, this.scriptNameInput, this.apiKeyInput, this.projectIdInput];
    for (const input of inputs) {
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') this.handleConnect();
      });
    }

    return this.container;
  }

  /**
   * Validate all form fields. Returns error message or null if valid.
   */
  validate(): string | null {
    const serverUrl = this.serverUrlInput.value.trim();
    const scriptName = this.scriptNameInput.value.trim();
    const apiKey = this.apiKeyInput.value.trim();
    const projectId = this.projectIdInput.value.trim();

    if (!serverUrl) return 'Server URL is required';
    try {
      const url = new URL(serverUrl);
      if (url.protocol !== 'https:' && url.protocol !== 'http:') {
        return 'Server URL must use http or https';
      }
    } catch {
      return 'Server URL must be a valid URL';
    }

    if (!scriptName) return 'Script Name is required';
    if (!apiKey) return 'API Key is required';
    if (!projectId) return 'Project ID is required';

    const id = parseInt(projectId, 10);
    if (!Number.isFinite(id) || id < 1) return 'Project ID must be a positive integer';

    return null;
  }

  /**
   * Get the current form values as a ShotGridConfig.
   */
  getConfig(): ShotGridConfig {
    return {
      serverUrl: this.serverUrlInput.value.trim(),
      scriptName: this.scriptNameInput.value.trim(),
      apiKey: this.apiKeyInput.value.trim(),
      projectId: parseInt(this.projectIdInput.value.trim(), 10),
    };
  }

  /**
   * Restore saved config from storage and emit configLoaded if available.
   * Must be called after event listeners are attached.
   */
  restoreConfig(): void {
    this.loadConfig();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.container?.parentNode) {
      this.container.parentNode.removeChild(this.container);
    }
    this.container = null;
    this.removeAllListeners();
  }

  // ---- Private ----

  private createInput(label: string, type: string, placeholder: string, testId: string): HTMLInputElement {
    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'display: flex; flex-direction: column; gap: 4px;';

    const labelEl = document.createElement('label');
    labelEl.textContent = label;
    labelEl.style.cssText = 'font-size: 11px; color: var(--text-muted); font-weight: 500;';
    labelEl.htmlFor = testId;

    const input = document.createElement('input');
    input.type = type;
    input.id = testId;
    input.dataset.testid = testId;
    input.placeholder = placeholder;
    input.autocomplete = type === 'password' ? 'off' : 'on';
    input.style.cssText = `
      padding: 6px 8px;
      border: 1px solid var(--border-primary, #334155);
      border-radius: 4px;
      background: var(--bg-primary, #1e293b);
      color: var(--text-primary, #f1f5f9);
      font-size: 12px;
      outline: none;
    `;

    wrapper.appendChild(labelEl);
    wrapper.appendChild(input);
    this.container!.appendChild(wrapper);

    return input;
  }

  private handleConnect(): void {
    if (this.state === 'connected') {
      // Disconnect
      this.setState('disconnected');
      this.emit('disconnect', undefined);
      return;
    }

    if (this.state === 'connecting') return;

    const error = this.validate();
    if (error) {
      this.setState('error', error);
      return;
    }

    const config = this.getConfig();
    this.saveConfig(config);
    this.setState('connecting');
    this.emit('connect', config);
  }

  private updateUI(errorMessage?: string): void {
    const isConnecting = this.state === 'connecting';
    const isConnected = this.state === 'connected';

    // Disable form during connecting
    const inputs = [this.serverUrlInput, this.scriptNameInput, this.apiKeyInput, this.projectIdInput];
    for (const input of inputs) {
      input.disabled = isConnecting;
    }

    // Update connect button
    if (isConnecting) {
      this.connectBtn.textContent = 'Connecting...';
      this.connectBtn.disabled = true;
    } else if (isConnected) {
      this.connectBtn.textContent = 'Disconnect';
      this.connectBtn.disabled = false;
    } else {
      this.connectBtn.textContent = 'Connect';
      this.connectBtn.disabled = false;
    }

    // Error display
    if (this.state === 'error' && errorMessage) {
      this.errorEl.textContent = errorMessage;
      this.errorEl.style.display = 'block';
    } else {
      this.errorEl.style.display = 'none';
    }

    // Status display
    if (isConnecting) {
      this.statusEl.textContent = 'Connecting to ShotGrid...';
      this.statusEl.style.display = 'block';
    } else if (isConnected) {
      this.statusEl.textContent = 'Connected';
      this.statusEl.style.display = 'block';
      this.statusEl.style.color = 'var(--text-success, #22c55e)';
    } else {
      this.statusEl.style.display = 'none';
      this.statusEl.style.color = 'var(--text-muted)';
    }
  }

  private saveConfig(config: ShotGridConfig): void {
    const saved = {
      serverUrl: config.serverUrl,
      scriptName: config.scriptName,
      projectId: config.projectId,
    };

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
    } catch { /* localStorage unavailable */ }

    // Only store API key in sessionStorage when opted in
    if (this.rememberKeyCheckbox.checked) {
      try {
        sessionStorage.setItem(`${STORAGE_KEY}-key`, config.apiKey);
      } catch { /* sessionStorage unavailable */ }
    } else {
      try {
        sessionStorage.removeItem(`${STORAGE_KEY}-key`);
      } catch { /* ignore */ }
    }
  }

  private loadConfig(): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;

      const saved = JSON.parse(raw);
      if (saved.serverUrl) this.serverUrlInput.value = saved.serverUrl;
      if (saved.scriptName) this.scriptNameInput.value = saved.scriptName;
      if (typeof saved.projectId === 'number') this.projectIdInput.value = String(saved.projectId);

      // Restore API key from sessionStorage if available
      const savedKey = sessionStorage.getItem(`${STORAGE_KEY}-key`);
      if (savedKey) {
        this.apiKeyInput.value = savedKey;
        this.rememberKeyCheckbox.checked = true;
      }

      if (saved.serverUrl && saved.scriptName && saved.projectId) {
        this.emit('configLoaded', {
          serverUrl: saved.serverUrl,
          scriptName: saved.scriptName,
          apiKey: savedKey ?? '',
          projectId: saved.projectId,
        });
      }
    } catch { /* corrupted data */ }
  }
}
