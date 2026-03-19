/**
 * RepresentationSelector - UI control for switching between media representations
 *
 * Displays a dropdown selector when the current source has multiple representations.
 * Automatically hides when no representations are available or only one exists.
 * Listens to session events to stay synchronized with the current source state.
 */

import { EventEmitter, type EventMap } from '../../utils/EventEmitter';
import type { Session } from '../../core/session/Session';
import type { MediaRepresentation } from '../../core/types/representation';
import { DropdownMenu } from './shared/DropdownMenu';
import { createButton as sharedCreateButton } from './shared/Button';
import { getIconSvg } from './shared/Icons';

export interface RepresentationSelectorEvents extends EventMap {
  /** Fired when the user selects a representation */
  representationSelected: { sourceIndex: number; repId: string };
}

/**
 * Kind label mapping for display
 */
function kindLabel(kind: string): string {
  switch (kind) {
    case 'frames':
      return 'Frames';
    case 'movie':
      return 'Movie';
    case 'proxy':
      return 'Proxy';
    case 'streaming':
      return 'Stream';
    default:
      return kind;
  }
}

/**
 * Status icon for representation status
 */
function statusIcon(status: string): string {
  switch (status) {
    case 'ready':
      return '\u2713'; // checkmark
    case 'loading':
      return '\u231B'; // hourglass
    case 'error':
      return '\u2717'; // cross
    default:
      return '';
  }
}

export class RepresentationSelector extends EventEmitter<RepresentationSelectorEvents> {
  private container: HTMLElement;
  private button: HTMLButtonElement;
  private dropdown: DropdownMenu;
  private session: Session;
  private _disposed = false;
  private _unsubscribers: Array<() => void> = [];

  constructor(session: Session) {
    super();
    this.session = session;

    // Create container
    this.container = document.createElement('div');
    this.container.className = 'representation-selector';
    this.container.dataset.testid = 'representation-selector';
    this.container.style.cssText = `
      display: none;
      align-items: center;
      flex-shrink: 0;
    `;

    // Create dropdown menu
    this.dropdown = new DropdownMenu({
      minWidth: '200px',
      onSelect: (value) => {
        this.handleSelect(value);
      },
    });

    // Create trigger button
    this.button = sharedCreateButton('', () => this.dropdown.toggle(this.button), {
      variant: 'ghost',
      size: 'md',
      title: 'Switch media representation',
      icon: getIconSvg('layers', 'sm'),
    });
    this.button.dataset.testid = 'representation-selector-button';
    this.button.setAttribute('aria-haspopup', 'listbox');
    this.button.setAttribute('aria-label', 'Switch representation');
    this.container.appendChild(this.button);

    // Bind session events
    this.bindEvents();

    // Initial update
    this.update();
  }

  private bindEvents(): void {
    // Source loaded - might have representations
    const unsubSource = this.session.on('sourceLoaded', () => this.update());
    this._unsubscribers.push(unsubSource);

    // Representation changed
    const unsubRepChanged = this.session.on('representationChanged', () => this.update());
    this._unsubscribers.push(unsubRepChanged);

    // Representation error
    const unsubRepError = this.session.on('representationError', () => this.update());
    this._unsubscribers.push(unsubRepError);

    // Fallback activated
    const unsubFallback = this.session.on('fallbackActivated', () => this.update());
    this._unsubscribers.push(unsubFallback);

    // Duration changed (often signals source switch completion)
    const unsubDuration = this.session.on('durationChanged', () => this.update());
    this._unsubscribers.push(unsubDuration);
  }

  private handleSelect(repId: string): void {
    const sourceIndex = this.session.currentSourceIndex;
    this.emit('representationSelected', { sourceIndex, repId });

    // Perform the switch
    void this.session.switchRepresentation(sourceIndex, repId, { userInitiated: true });
  }

  /**
   * Update the selector based on current source representations.
   * Shows the selector when multiple representations exist, hides otherwise.
   */
  update(): void {
    if (this._disposed) return;

    const source = this.session.currentSource;
    const representations = source?.representations;

    // Hide if no source or fewer than 2 representations
    if (!source || !representations || representations.length < 2) {
      this.container.style.display = 'none';
      return;
    }

    // Show the selector
    this.container.style.display = 'flex';

    // Get active representation
    const activeRep = this.session.getActiveRepresentation(this.session.currentSourceIndex);

    // Update button text
    const buttonText = activeRep ? activeRep.label : 'Select...';
    this.updateButtonText(buttonText);

    // Update dropdown items
    const items = representations.map((rep) => ({
      value: rep.id,
      label: `${rep.label}`,
      icon: statusIcon(rep.status),
      shortcut: kindLabel(rep.kind),
      disabled: rep.status === 'loading',
    }));
    this.dropdown.setItems(items);

    // Highlight the active representation
    if (activeRep) {
      this.dropdown.setSelectedValue(activeRep.id);
    }
  }

  private updateButtonText(text: string): void {
    // Find or create the text span within the button
    let textSpan = this.button.querySelector('.rep-button-text') as HTMLElement | null;
    if (!textSpan) {
      textSpan = document.createElement('span');
      textSpan.className = 'rep-button-text';
      textSpan.style.cssText = `
        max-width: 150px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-size: 11px;
      `;
      this.button.appendChild(textSpan);
    }
    textSpan.textContent = text;
  }

  /**
   * Check if the selector is currently visible (has multiple representations).
   */
  isVisible(): boolean {
    return this.container.style.display !== 'none';
  }

  /**
   * Get the list of representations for the current source.
   */
  getRepresentations(): readonly MediaRepresentation[] {
    const source = this.session.currentSource;
    return source?.representations ?? [];
  }

  render(): HTMLElement {
    return this.container;
  }

  dispose(): void {
    this._disposed = true;
    for (const unsub of this._unsubscribers) {
      unsub();
    }
    this._unsubscribers = [];
    this.dropdown.dispose();
    this.removeAllListeners();
  }
}
