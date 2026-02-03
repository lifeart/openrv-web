/**
 * NetworkControl - Network sync button and connection panel UI
 *
 * Provides the UI for creating/joining rooms, displaying connected users,
 * and configuring sync settings. Appears in the header bar.
 */

import { EventEmitter, EventMap } from '../../utils/EventEmitter';
import { getIconSvg } from './shared/Icons';
import { applyA11yFocus } from './shared/Button';
import type { ConnectionState, SyncUser, SyncSettings, RoomInfo } from '../../network/types';
import { DEFAULT_SYNC_SETTINGS, USER_COLORS } from '../../network/types';

/**
 * Validate that a color string is a safe CSS color value.
 * Only allows hex colors (#RGB, #RRGGBB, #RRGGBBAA) to prevent CSS injection.
 */
function sanitizeColor(color: string): string {
  if (/^#[0-9a-fA-F]{3,8}$/.test(color)) {
    return color;
  }
  return USER_COLORS[0]; // fallback to default color
}

// ---- Events ----

export interface NetworkControlEvents extends EventMap {
  createRoom: { userName: string };
  joinRoom: { roomCode: string; userName: string };
  leaveRoom: void;
  syncSettingsChanged: SyncSettings;
  copyLink: string;
  panelToggled: boolean;
}

// ---- State ----

export interface NetworkControlState {
  connectionState: ConnectionState;
  roomInfo: RoomInfo | null;
  users: SyncUser[];
  syncSettings: SyncSettings;
  isPanelOpen: boolean;
  rtt: number;
}

export class NetworkControl extends EventEmitter<NetworkControlEvents> {
  private container: HTMLElement;
  private button: HTMLButtonElement;
  private badge: HTMLElement;
  private panel: HTMLElement;
  private state: NetworkControlState;
  private isOpen = false;

  // Panel elements
  private disconnectedPanel!: HTMLElement;
  private connectedPanel!: HTMLElement;
  private connectingPanel!: HTMLElement;
  private userListContainer!: HTMLElement;
  private roomCodeDisplay!: HTMLElement;
  private roomCodeInput!: HTMLInputElement;
  private errorDisplay!: HTMLElement;

  private boundHandleOutsideClick: (e: MouseEvent) => void;
  private boundHandleReposition: () => void;

  constructor() {
    super();

    this.state = {
      connectionState: 'disconnected',
      roomInfo: null,
      users: [],
      syncSettings: { ...DEFAULT_SYNC_SETTINGS },
      isPanelOpen: false,
      rtt: 0,
    };

    this.boundHandleOutsideClick = (e: MouseEvent) => this.handleOutsideClick(e);
    this.boundHandleReposition = () => this.positionPanel();

    // Container
    this.container = document.createElement('div');
    this.container.className = 'network-control';
    this.container.dataset.testid = 'network-control';
    this.container.style.cssText = `
      display: flex;
      align-items: center;
      position: relative;
    `;

    // Button
    this.button = document.createElement('button');
    this.button.dataset.testid = 'network-sync-button';
    this.button.title = 'Network Sync (Shift+N)';
    this.button.setAttribute('aria-haspopup', 'true');
    this.button.setAttribute('aria-expanded', 'false');
    this.button.setAttribute('aria-label', 'Network Sync');
    this.button.style.cssText = `
      background: transparent;
      border: 1px solid transparent;
      color: var(--text-muted);
      padding: 4px 8px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
      transition: all 0.12s ease;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 4px;
      outline: none;
      position: relative;
    `;
    this.button.innerHTML = getIconSvg('users', 'sm');
    applyA11yFocus(this.button);

    // Badge (user count)
    this.badge = document.createElement('span');
    this.badge.dataset.testid = 'network-user-badge';
    this.badge.style.cssText = `
      position: absolute;
      top: -2px;
      right: -2px;
      background: var(--accent-primary);
      color: white;
      font-size: 9px;
      font-weight: bold;
      min-width: 14px;
      height: 14px;
      border-radius: 7px;
      display: none;
      align-items: center;
      justify-content: center;
      padding: 0 3px;
      line-height: 1;
    `;
    this.button.appendChild(this.badge);

    // Hover states
    this.button.addEventListener('mouseenter', () => {
      if (this.state.connectionState !== 'connected') {
        this.button.style.background = 'var(--bg-hover)';
        this.button.style.borderColor = 'var(--border-primary)';
        this.button.style.color = 'var(--text-primary)';
      }
    });
    this.button.addEventListener('mouseleave', () => {
      if (this.state.connectionState !== 'connected') {
        this.button.style.background = 'transparent';
        this.button.style.borderColor = 'transparent';
        this.button.style.color = 'var(--text-muted)';
      }
    });

    // Click to toggle panel
    this.button.addEventListener('click', (e) => {
      e.stopPropagation();
      this.togglePanel();
    });

    this.container.appendChild(this.button);

    // Panel
    this.panel = document.createElement('div');
    this.panel.dataset.testid = 'network-panel';
    this.panel.style.cssText = `
      position: fixed;
      width: 280px;
      background: var(--bg-secondary);
      border: 1px solid var(--border-primary);
      border-radius: 8px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
      z-index: 9999;
      display: none;
      flex-direction: column;
      overflow: hidden;
      font-size: 12px;
    `;

    this.buildPanelContents();
  }

  // ---- Build Panel ----

  private buildPanelContents(): void {
    // Panel header
    const header = document.createElement('div');
    header.style.cssText = `
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 10px 12px;
      border-bottom: 1px solid var(--border-secondary);
      background: var(--bg-tertiary);
    `;
    header.innerHTML = `<span style="font-weight: 600; color: var(--text-primary);">Network Sync</span>`;

    // Close button
    const closeBtn = document.createElement('button');
    closeBtn.dataset.testid = 'network-panel-close';
    closeBtn.innerHTML = getIconSvg('x', 'sm');
    closeBtn.style.cssText = `
      background: transparent;
      border: none;
      color: var(--text-muted);
      cursor: pointer;
      padding: 2px;
      border-radius: 4px;
      display: flex;
      align-items: center;
    `;
    closeBtn.addEventListener('click', () => this.closePanel());
    header.appendChild(closeBtn);
    this.panel.appendChild(header);

    // Error display
    this.errorDisplay = document.createElement('div');
    this.errorDisplay.dataset.testid = 'network-error-display';
    this.errorDisplay.style.cssText = `
      display: none;
      padding: 8px 12px;
      background: rgba(248, 113, 113, 0.1);
      color: var(--error);
      font-size: 11px;
      border-bottom: 1px solid var(--border-secondary);
    `;
    this.panel.appendChild(this.errorDisplay);

    // Disconnected state panel
    this.disconnectedPanel = this.buildDisconnectedPanel();
    this.panel.appendChild(this.disconnectedPanel);

    // Connecting state panel
    this.connectingPanel = this.buildConnectingPanel();
    this.panel.appendChild(this.connectingPanel);

    // Connected state panel
    this.connectedPanel = this.buildConnectedPanel();
    this.panel.appendChild(this.connectedPanel);

    this.updatePanelVisibility();
  }

  private buildDisconnectedPanel(): HTMLElement {
    const panel = document.createElement('div');
    panel.dataset.testid = 'network-disconnected-panel';
    panel.style.cssText = 'padding: 12px;';

    // Create Room section
    const createSection = document.createElement('div');
    createSection.style.cssText = 'margin-bottom: 12px;';

    const createBtn = document.createElement('button');
    createBtn.dataset.testid = 'network-create-room-button';
    createBtn.textContent = 'Create Room';
    createBtn.style.cssText = `
      width: 100%;
      padding: 8px 12px;
      background: var(--accent-primary);
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
      font-weight: 500;
      transition: background 0.12s ease;
    `;
    createBtn.addEventListener('mouseenter', () => {
      createBtn.style.background = 'var(--accent-hover)';
    });
    createBtn.addEventListener('mouseleave', () => {
      createBtn.style.background = 'var(--accent-primary)';
    });
    createBtn.addEventListener('click', () => {
      this.emit('createRoom', { userName: this.state.syncSettings ? 'Host' : 'User' });
    });
    createSection.appendChild(createBtn);
    panel.appendChild(createSection);

    // Divider
    const divider = document.createElement('div');
    divider.style.cssText = `
      text-align: center;
      color: var(--text-muted);
      font-size: 11px;
      margin-bottom: 12px;
      position: relative;
    `;
    divider.innerHTML = '<span style="background: var(--bg-secondary); padding: 0 8px; position: relative; z-index: 1;">or join a room</span>';
    divider.style.background = `linear-gradient(var(--border-secondary), var(--border-secondary)) no-repeat center / calc(100% - 16px) 1px`;
    panel.appendChild(divider);

    // Join Room section
    const joinSection = document.createElement('div');

    this.roomCodeInput = document.createElement('input');
    this.roomCodeInput.dataset.testid = 'network-room-code-input';
    this.roomCodeInput.type = 'text';
    this.roomCodeInput.placeholder = 'Room Code (XXXX-XXXX)';
    this.roomCodeInput.maxLength = 9;
    this.roomCodeInput.style.cssText = `
      width: 100%;
      padding: 8px 12px;
      background: var(--bg-primary);
      color: var(--text-primary);
      border: 1px solid var(--border-primary);
      border-radius: 4px;
      font-size: 12px;
      font-family: var(--font-mono);
      box-sizing: border-box;
      margin-bottom: 8px;
      outline: none;
      text-transform: uppercase;
      letter-spacing: 1px;
    `;
    this.roomCodeInput.addEventListener('focus', () => {
      this.roomCodeInput.style.borderColor = 'var(--accent-primary)';
    });
    this.roomCodeInput.addEventListener('blur', () => {
      this.roomCodeInput.style.borderColor = 'var(--border-primary)';
    });
    this.roomCodeInput.addEventListener('input', () => {
      // Auto-insert hyphen
      let val = this.roomCodeInput.value.replace(/[^A-Z0-9]/gi, '').toUpperCase();
      if (val.length > 4) {
        val = val.slice(0, 4) + '-' + val.slice(4, 8);
      }
      this.roomCodeInput.value = val;
    });
    this.roomCodeInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        this.handleJoinRoom();
      }
      // Stop propagation so keyboard shortcuts don't fire
      e.stopPropagation();
    });
    joinSection.appendChild(this.roomCodeInput);

    const joinBtn = document.createElement('button');
    joinBtn.dataset.testid = 'network-join-room-button';
    joinBtn.textContent = 'Join Room';
    joinBtn.style.cssText = `
      width: 100%;
      padding: 8px 12px;
      background: var(--bg-tertiary);
      color: var(--text-primary);
      border: 1px solid var(--border-primary);
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
      transition: all 0.12s ease;
    `;
    joinBtn.addEventListener('mouseenter', () => {
      joinBtn.style.background = 'var(--bg-hover)';
    });
    joinBtn.addEventListener('mouseleave', () => {
      joinBtn.style.background = 'var(--bg-tertiary)';
    });
    joinBtn.addEventListener('click', () => this.handleJoinRoom());
    joinSection.appendChild(joinBtn);

    panel.appendChild(joinSection);
    return panel;
  }

  private buildConnectingPanel(): HTMLElement {
    const panel = document.createElement('div');
    panel.dataset.testid = 'network-connecting-panel';
    panel.style.cssText = `
      padding: 24px 12px;
      text-align: center;
      color: var(--text-secondary);
    `;
    panel.innerHTML = `
      <div style="margin-bottom: 8px; color: var(--text-muted);">
        ${getIconSvg('refresh', 'lg')}
      </div>
      <div>Connecting...</div>
    `;
    return panel;
  }

  private buildConnectedPanel(): HTMLElement {
    const panel = document.createElement('div');
    panel.dataset.testid = 'network-connected-panel';
    panel.style.cssText = 'display: flex; flex-direction: column;';

    // Room code display
    this.roomCodeDisplay = document.createElement('div');
    this.roomCodeDisplay.dataset.testid = 'network-room-code-display';
    this.roomCodeDisplay.style.cssText = `
      padding: 8px 12px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-bottom: 1px solid var(--border-secondary);
    `;
    panel.appendChild(this.roomCodeDisplay);

    // User list
    const usersSection = document.createElement('div');
    usersSection.style.cssText = `
      padding: 8px 12px;
      border-bottom: 1px solid var(--border-secondary);
    `;

    const usersLabel = document.createElement('div');
    usersLabel.style.cssText = 'color: var(--text-muted); font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 6px;';
    usersLabel.textContent = 'Connected Users';
    usersSection.appendChild(usersLabel);

    this.userListContainer = document.createElement('div');
    this.userListContainer.dataset.testid = 'network-user-list';
    this.userListContainer.style.cssText = 'display: flex; flex-direction: column; gap: 4px;';
    usersSection.appendChild(this.userListContainer);

    panel.appendChild(usersSection);

    // Sync settings
    const settingsSection = document.createElement('div');
    settingsSection.style.cssText = `
      padding: 8px 12px;
      border-bottom: 1px solid var(--border-secondary);
    `;

    const settingsLabel = document.createElement('div');
    settingsLabel.style.cssText = 'color: var(--text-muted); font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 6px;';
    settingsLabel.textContent = 'Sync Settings';
    settingsSection.appendChild(settingsLabel);

    const settings: Array<{ key: keyof SyncSettings; label: string }> = [
      { key: 'playback', label: 'Playback' },
      { key: 'view', label: 'View (Pan/Zoom)' },
      { key: 'color', label: 'Color Adjustments' },
      { key: 'annotations', label: 'Annotations' },
    ];

    settings.forEach(({ key, label }) => {
      const row = document.createElement('label');
      row.dataset.testid = `network-sync-${key}`;
      row.style.cssText = `
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 3px 0;
        cursor: pointer;
        color: var(--text-primary);
      `;

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = this.state.syncSettings[key];
      checkbox.style.cssText = 'accent-color: var(--accent-primary); cursor: pointer;';
      checkbox.addEventListener('change', () => {
        this.state.syncSettings[key] = checkbox.checked;
        this.emit('syncSettingsChanged', { ...this.state.syncSettings });
      });

      const text = document.createElement('span');
      text.textContent = label;

      row.appendChild(checkbox);
      row.appendChild(text);
      settingsSection.appendChild(row);
    });

    panel.appendChild(settingsSection);

    // Actions
    const actionsSection = document.createElement('div');
    actionsSection.style.cssText = 'padding: 8px 12px; display: flex; gap: 8px;';

    const copyBtn = document.createElement('button');
    copyBtn.dataset.testid = 'network-copy-link-button';
    copyBtn.textContent = 'Copy Link';
    copyBtn.style.cssText = `
      flex: 1;
      padding: 6px 12px;
      background: var(--bg-tertiary);
      color: var(--text-primary);
      border: 1px solid var(--border-primary);
      border-radius: 4px;
      cursor: pointer;
      font-size: 11px;
      transition: all 0.12s ease;
    `;
    copyBtn.addEventListener('click', () => {
      const code = this.state.roomInfo?.roomCode ?? '';
      const link = `${window.location.origin}${window.location.pathname}?room=${code}`;
      this.emit('copyLink', link);

      // Visual feedback
      copyBtn.textContent = 'Copied!';
      copyBtn.style.color = 'var(--success)';
      setTimeout(() => {
        copyBtn.textContent = 'Copy Link';
        copyBtn.style.color = 'var(--text-primary)';
      }, 2000);
    });
    actionsSection.appendChild(copyBtn);

    const leaveBtn = document.createElement('button');
    leaveBtn.dataset.testid = 'network-leave-button';
    leaveBtn.textContent = 'Leave';
    leaveBtn.style.cssText = `
      flex: 1;
      padding: 6px 12px;
      background: transparent;
      color: var(--error);
      border: 1px solid var(--error);
      border-radius: 4px;
      cursor: pointer;
      font-size: 11px;
      transition: all 0.12s ease;
    `;
    leaveBtn.addEventListener('mouseenter', () => {
      leaveBtn.style.background = 'rgba(248, 113, 113, 0.1)';
    });
    leaveBtn.addEventListener('mouseleave', () => {
      leaveBtn.style.background = 'transparent';
    });
    leaveBtn.addEventListener('click', () => {
      this.emit('leaveRoom', undefined);
    });
    actionsSection.appendChild(leaveBtn);

    panel.appendChild(actionsSection);
    return panel;
  }

  // ---- Panel Management ----

  togglePanel(): void {
    if (this.isOpen) {
      this.closePanel();
    } else {
      this.openPanel();
    }
  }

  openPanel(): void {
    if (this.isOpen) return;
    this.isOpen = true;

    if (!document.body.contains(this.panel)) {
      document.body.appendChild(this.panel);
    }

    this.positionPanel();
    this.panel.style.display = 'flex';
    this.button.setAttribute('aria-expanded', 'true');

    // Add listeners
    requestAnimationFrame(() => {
      document.addEventListener('click', this.boundHandleOutsideClick);
      window.addEventListener('scroll', this.boundHandleReposition, true);
      window.addEventListener('resize', this.boundHandleReposition);
    });

    this.emit('panelToggled', true);
  }

  closePanel(): void {
    if (!this.isOpen) return;
    this.isOpen = false;

    this.panel.style.display = 'none';
    this.button.setAttribute('aria-expanded', 'false');

    // Remove listeners
    document.removeEventListener('click', this.boundHandleOutsideClick);
    window.removeEventListener('scroll', this.boundHandleReposition, true);
    window.removeEventListener('resize', this.boundHandleReposition);

    // Clear error
    this.hideError();

    this.emit('panelToggled', false);
  }

  private positionPanel(): void {
    const rect = this.button.getBoundingClientRect();
    this.panel.style.top = `${rect.bottom + 4}px`;
    // Align right edge of panel with right edge of button
    const panelWidth = 280;
    const left = Math.max(8, rect.right - panelWidth);
    this.panel.style.left = `${left}px`;
  }

  private handleOutsideClick(e: MouseEvent): void {
    const target = e.target as Node;
    if (!this.panel.contains(target) && !this.button.contains(target)) {
      this.closePanel();
    }
  }

  private handleJoinRoom(): void {
    const code = this.roomCodeInput.value.trim().toUpperCase();
    if (!code || code.length < 9) {
      this.showError('Please enter a valid room code (XXXX-XXXX)');
      return;
    }
    this.hideError();
    this.emit('joinRoom', { roomCode: code, userName: 'User' });
  }

  // ---- State Updates ----

  setConnectionState(state: ConnectionState): void {
    this.state.connectionState = state;
    this.updateButtonStyle();
    this.updatePanelVisibility();
  }

  setRoomInfo(info: RoomInfo | null): void {
    this.state.roomInfo = info;
    this.updateRoomCodeDisplay();
  }

  setUsers(users: SyncUser[]): void {
    this.state.users = users;
    this.updateUserList();
    this.updateBadge();
  }

  setRTT(rtt: number): void {
    this.state.rtt = rtt;
  }

  showError(message: string): void {
    this.errorDisplay.textContent = message;
    this.errorDisplay.style.display = 'block';
  }

  hideError(): void {
    this.errorDisplay.style.display = 'none';
    this.errorDisplay.textContent = '';
  }

  // ---- UI Updates ----

  private updateButtonStyle(): void {
    const { connectionState } = this.state;

    if (connectionState === 'connected') {
      this.button.style.background = 'rgba(var(--accent-primary-rgb), 0.15)';
      this.button.style.borderColor = 'var(--accent-primary)';
      this.button.style.color = 'var(--accent-primary)';
    } else if (connectionState === 'connecting' || connectionState === 'reconnecting') {
      this.button.style.background = 'rgba(250, 204, 21, 0.1)';
      this.button.style.borderColor = 'var(--warning)';
      this.button.style.color = 'var(--warning)';
    } else {
      this.button.style.background = 'transparent';
      this.button.style.borderColor = 'transparent';
      this.button.style.color = 'var(--text-muted)';
    }
  }

  private updateBadge(): void {
    const count = this.state.users.length;
    if (count > 1) {
      this.badge.textContent = String(count);
      this.badge.style.display = 'flex';
    } else {
      this.badge.style.display = 'none';
    }
  }

  private updatePanelVisibility(): void {
    const { connectionState } = this.state;

    this.disconnectedPanel.style.display = connectionState === 'disconnected' || connectionState === 'error' ? 'block' : 'none';
    this.connectingPanel.style.display = connectionState === 'connecting' || connectionState === 'reconnecting' ? 'block' : 'none';
    this.connectedPanel.style.display = connectionState === 'connected' ? 'flex' : 'none';
  }

  private updateRoomCodeDisplay(): void {
    const info = this.state.roomInfo;
    if (!info) {
      this.roomCodeDisplay.innerHTML = '';
      return;
    }

    // Use textContent for user-controlled data to prevent XSS
    this.roomCodeDisplay.innerHTML = '';

    const label = document.createElement('span');
    label.style.cssText = 'color: var(--text-secondary); font-size: 11px;';
    label.textContent = 'Room:';

    const code = document.createElement('span');
    code.style.cssText = 'color: var(--text-primary); font-family: var(--font-mono); font-weight: 600; letter-spacing: 1px;';
    code.textContent = info.roomCode;

    this.roomCodeDisplay.appendChild(label);
    this.roomCodeDisplay.appendChild(code);
  }

  private updateUserList(): void {
    this.userListContainer.innerHTML = '';

    this.state.users.forEach((user) => {
      const row = document.createElement('div');
      row.dataset.testid = `network-user-${user.id}`;
      row.style.cssText = `
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 3px 0;
      `;

      // Color dot / avatar
      const avatar = document.createElement('div');
      avatar.style.cssText = `
        width: 20px;
        height: 20px;
        border-radius: 50%;
        background: ${sanitizeColor(user.color)};
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 10px;
        font-weight: bold;
        color: white;
        flex-shrink: 0;
      `;
      avatar.textContent = user.name.charAt(0).toUpperCase();

      // Name
      const name = document.createElement('span');
      name.style.cssText = 'color: var(--text-primary); flex: 1;';
      name.textContent = user.name;

      // Host badge
      if (user.isHost) {
        const hostBadge = document.createElement('span');
        hostBadge.style.cssText = `
          font-size: 9px;
          color: var(--accent-primary);
          background: rgba(var(--accent-primary-rgb), 0.1);
          padding: 1px 6px;
          border-radius: 3px;
        `;
        hostBadge.textContent = 'Host';
        name.appendChild(document.createTextNode(' '));
        name.appendChild(hostBadge);
      }

      row.appendChild(avatar);
      row.appendChild(name);
      this.userListContainer.appendChild(row);
    });
  }

  // ---- Keyboard Handler ----

  handleKeyboard(key: string, shiftKey: boolean): boolean {
    if (shiftKey && key === 'N') {
      this.togglePanel();
      return true;
    }
    return false;
  }

  // ---- Render / Dispose ----

  getState(): NetworkControlState {
    return { ...this.state };
  }

  render(): HTMLElement {
    return this.container;
  }

  dispose(): void {
    this.closePanel();
    if (document.body.contains(this.panel)) {
      document.body.removeChild(this.panel);
    }
    this.removeAllListeners();
  }
}
