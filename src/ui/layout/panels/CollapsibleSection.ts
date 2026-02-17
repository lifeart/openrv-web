/**
 * CollapsibleSection - Reusable accordion component for panel content.
 *
 * Provides a clickable header with chevron icon and a collapsible content area.
 */

export interface CollapsibleSectionOptions {
  expanded?: boolean;
  testId?: string;
  onToggle?: (expanded: boolean) => void;
}

export class CollapsibleSection {
  private element: HTMLElement;
  private header: HTMLElement;
  private chevron: HTMLElement;
  private contentWrapper: HTMLElement;
  private content: HTMLElement;
  private _expanded: boolean;
  private _onToggle?: (expanded: boolean) => void;

  constructor(title: string, opts?: CollapsibleSectionOptions) {
    this._expanded = opts?.expanded ?? true;
    this._onToggle = opts?.onToggle;

    this.element = document.createElement('div');
    this.element.className = 'collapsible-section';
    if (opts?.testId) {
      this.element.dataset.testid = opts.testId;
    }
    this.element.style.cssText = `
      border-bottom: 1px solid var(--border-primary);
    `;

    // Header
    this.header = document.createElement('div');
    this.header.className = 'collapsible-section-header';
    this.header.style.cssText = `
      display: flex;
      align-items: center;
      padding: 6px 0;
      cursor: pointer;
      user-select: none;
      gap: 4px;
    `;

    this.chevron = document.createElement('span');
    this.chevron.className = 'collapsible-chevron';
    this.chevron.textContent = '\u25B6'; // right-pointing triangle
    this.chevron.style.cssText = `
      font-size: 8px;
      color: var(--text-muted);
      transition: transform 0.15s ease;
      display: inline-block;
      width: 12px;
      text-align: center;
    `;

    const titleEl = document.createElement('span');
    titleEl.textContent = title;
    titleEl.style.cssText = `
      font-size: 11px;
      font-weight: 600;
      color: var(--text-primary);
      flex: 1;
    `;

    this.header.appendChild(this.chevron);
    this.header.appendChild(titleEl);
    this.header.addEventListener('click', () => this.toggle());

    // Content wrapper (handles height animation)
    this.contentWrapper = document.createElement('div');
    this.contentWrapper.className = 'collapsible-section-content-wrapper';
    this.contentWrapper.style.cssText = `
      overflow: hidden;
      transition: max-height 0.15s ease;
    `;

    this.content = document.createElement('div');
    this.content.className = 'collapsible-section-content';
    this.content.style.cssText = `
      padding: 0 0 8px 0;
    `;

    this.contentWrapper.appendChild(this.content);
    this.element.appendChild(this.header);
    this.element.appendChild(this.contentWrapper);

    this.applyState();
  }

  private applyState(): void {
    if (this._expanded) {
      this.chevron.style.transform = 'rotate(90deg)';
      this.contentWrapper.style.maxHeight = 'none';
      this.contentWrapper.style.display = '';
    } else {
      this.chevron.style.transform = 'rotate(0deg)';
      this.contentWrapper.style.maxHeight = '0';
      this.contentWrapper.style.display = 'none';
    }
  }

  toggle(): void {
    this._expanded = !this._expanded;
    this.applyState();
    this._onToggle?.(this._expanded);
  }

  setExpanded(expanded: boolean): void {
    if (this._expanded === expanded) return;
    this._expanded = expanded;
    this.applyState();
    this._onToggle?.(this._expanded);
  }

  isExpanded(): boolean {
    return this._expanded;
  }

  getElement(): HTMLElement {
    return this.element;
  }

  getContent(): HTMLElement {
    return this.content;
  }

  getHeader(): HTMLElement {
    return this.header;
  }

  dispose(): void {
    this.element.remove();
  }
}
