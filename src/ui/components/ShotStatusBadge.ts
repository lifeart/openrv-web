/**
 * ShotStatusBadge - Displays and allows editing of the current shot's review status.
 *
 * Shows a colored badge next to the source name in the header bar.
 * Clicking the badge opens a dropdown to change the status.
 * Wired to session.statusManager for state management.
 */

import type { Session } from '../../core/session/Session';
import { STATUS_COLORS, VALID_STATUSES, type ShotStatus } from '../../core/session/StatusManager';
import { DropdownMenu } from './shared/DropdownMenu';

/** Human-readable labels for each status */
const STATUS_LABELS: Record<ShotStatus, string> = {
  pending: 'Pending',
  'in-review': 'In Review',
  approved: 'Approved',
  'needs-work': 'Needs Work',
  cbb: 'Could Be Better',
  final: 'Final',
  'on-hold': 'On Hold',
  omit: 'Omit',
};

export class ShotStatusBadge {
  private container: HTMLElement;
  private dot: HTMLElement;
  private label: HTMLElement;
  private session: Session;
  private dropdown: DropdownMenu;
  private _unsubscribers: (() => void)[] = [];
  private _lastTrackedSourceIndex = -1;

  constructor(session: Session) {
    this.session = session;

    // Container button
    this.container = document.createElement('button');
    (this.container as HTMLButtonElement).type = 'button';
    this.container.className = 'shot-status-badge';
    this.container.dataset.testid = 'shot-status-badge';
    this.container.setAttribute('aria-label', 'Shot status: pending');
    this.container.setAttribute('aria-haspopup', 'listbox');
    this.container.title = 'Click to change shot status';
    this.container.style.cssText = `
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 3px 8px;
      border-radius: 4px;
      border: 1px solid var(--border-secondary);
      background: transparent;
      color: var(--text-secondary);
      cursor: pointer;
      font-size: 11px;
      min-height: 32px;
      flex-shrink: 0;
      margin-left: 8px;
      transition: all 0.12s ease;
    `;

    // Color dot
    this.dot = document.createElement('span');
    this.dot.className = 'shot-status-dot';
    this.dot.dataset.testid = 'shot-status-dot';
    this.dot.style.cssText = `
      width: 8px;
      height: 8px;
      border-radius: 50%;
      flex-shrink: 0;
      background: ${STATUS_COLORS.pending};
    `;
    this.container.appendChild(this.dot);

    // Label text
    this.label = document.createElement('span');
    this.label.className = 'shot-status-label';
    this.label.dataset.testid = 'shot-status-label';
    this.label.style.cssText = `
      white-space: nowrap;
      font-size: 11px;
      line-height: 1;
    `;
    this.label.textContent = 'Pending';
    this.container.appendChild(this.label);

    // Hover styling
    this.container.addEventListener('pointerenter', () => {
      this.container.style.background = 'var(--bg-hover)';
      this.container.style.borderColor = 'var(--border-primary)';
      this.container.style.color = 'var(--text-primary)';
    });
    this.container.addEventListener('pointerleave', () => {
      this.container.style.background = 'transparent';
      this.container.style.borderColor = 'var(--border-secondary)';
      this.container.style.color = 'var(--text-secondary)';
    });

    // Dropdown for status selection
    this.dropdown = new DropdownMenu({
      minWidth: '150px',
      onSelect: (value) => {
        this.handleStatusSelect(value as ShotStatus);
      },
    });

    this.dropdown.setItems(
      VALID_STATUSES.map((status) => ({
        value: status,
        label: STATUS_LABELS[status],
        color: STATUS_COLORS[status],
      })),
    );

    // Toggle dropdown on click
    this.container.addEventListener('click', () => {
      // Pre-select current status before opening
      const currentStatus = this.getCurrentStatus();
      this.dropdown.setSelectedValue(currentStatus);
      this.dropdown.toggle(this.container);
    });

    // Bind to session events
    this.bindEvents();
  }

  private getCurrentStatus(): ShotStatus {
    const sourceIndex = this.session.currentSourceIndex;
    return this.session.statusManager.getStatus(sourceIndex);
  }

  private handleStatusSelect(status: ShotStatus): void {
    const sourceIndex = this.session.currentSourceIndex;
    this.session.statusManager.setStatus(sourceIndex, status, 'user');
  }

  private bindEvents(): void {
    // Listen for status changes
    const statusChangedHandler = () => {
      this.update();
    };
    this.session.on('statusChanged', statusChangedHandler);
    this._unsubscribers.push(() => this.session.off('statusChanged', statusChangedHandler));

    const statusesChangedHandler = () => {
      this.update();
    };
    this.session.on('statusesChanged', statusesChangedHandler);
    this._unsubscribers.push(() => this.session.off('statusesChanged', statusesChangedHandler));

    // Listen for source changes (new source loaded)
    const sourceLoadedHandler = () => {
      this.update();
    };
    this.session.on('sourceLoaded', sourceLoadedHandler);
    this._unsubscribers.push(() => this.session.off('sourceLoaded', sourceLoadedHandler));

    // Listen for frame changes to detect source switches in playlists
    const frameChangedHandler = () => {
      const currentIndex = this.session.currentSourceIndex;
      if (currentIndex !== this._lastTrackedSourceIndex) {
        this._lastTrackedSourceIndex = currentIndex;
        this.update();
      }
    };
    this.session.on('frameChanged', frameChangedHandler);
    this._unsubscribers.push(() => this.session.off('frameChanged', frameChangedHandler));

    // Listen for A/B source switches
    const abChangedHandler = () => {
      this.update();
    };
    this.session.on('abSourceChanged', abChangedHandler);
    this._unsubscribers.push(() => this.session.off('abSourceChanged', abChangedHandler));
  }

  /** Update the badge to reflect the current source's status */
  update(): void {
    const status = this.getCurrentStatus();
    const color = STATUS_COLORS[status];
    const displayLabel = STATUS_LABELS[status];

    this.dot.style.background = color;
    this.label.textContent = displayLabel;
    this.container.setAttribute('aria-label', `Shot status: ${displayLabel}`);

    this._lastTrackedSourceIndex = this.session.currentSourceIndex;
  }

  render(): HTMLElement {
    this.update();
    return this.container;
  }

  getContainer(): HTMLElement {
    return this.container;
  }

  dispose(): void {
    for (const unsub of this._unsubscribers) {
      unsub();
    }
    this._unsubscribers = [];
    this.dropdown.dispose();
  }
}
