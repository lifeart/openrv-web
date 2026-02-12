import { EventEmitter, EventMap } from '../../utils/EventEmitter';
import { ExportFormat } from '../../utils/export/FrameExporter';
import { getIconSvg, IconName } from './shared/Icons';
import { applyA11yFocus } from './shared/Button';

export interface ExportRequest {
  format: ExportFormat;
  includeAnnotations: boolean;
  quality: number;
}

export interface SequenceExportRequest {
  format: ExportFormat;
  includeAnnotations: boolean;
  quality: number;
  useInOutRange: boolean;
}

export interface ExportControlEvents extends EventMap {
  exportRequested: ExportRequest;
  copyRequested: void;
  sequenceExportRequested: SequenceExportRequest;
  rvSessionExportRequested: { format: 'rv' | 'gto' };
  annotationsJSONExportRequested: void;
  annotationsPDFExportRequested: void;
}

export class ExportControl extends EventEmitter<ExportControlEvents> {
  private container: HTMLElement;
  private exportButton: HTMLButtonElement;
  private dropdown: HTMLElement;
  private isDropdownOpen = false;
  private annotationsCheckbox: HTMLInputElement | null = null;

  constructor() {
    super();

    // Create container
    this.container = document.createElement('div');
    this.container.className = 'export-control-container';
    this.container.style.cssText = `
      display: flex;
      align-items: center;
      position: relative;
      margin-left: 8px;
    `;

    // Create export button
    this.exportButton = document.createElement('button');
    this.exportButton.innerHTML = `${getIconSvg('download', 'sm')}<span style="margin-left: 6px;">Export</span>`;
    this.exportButton.title = 'Export current frame (Ctrl+S)';
    this.exportButton.style.cssText = `
      background: transparent;
      border: 1px solid transparent;
      color: var(--text-muted);
      padding: 6px 10px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
      transition: all 0.12s ease;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      outline: none;
    `;

    this.exportButton.addEventListener('click', () => this.toggleDropdown());
    this.exportButton.addEventListener('mouseenter', () => {
      if (!this.isDropdownOpen) {
        this.exportButton.style.background = 'var(--bg-hover)';
        this.exportButton.style.borderColor = 'var(--border-primary)';
        this.exportButton.style.color = 'var(--text-primary)';
      }
    });
    this.exportButton.addEventListener('mouseleave', () => {
      if (!this.isDropdownOpen) {
        this.exportButton.style.background = 'transparent';
        this.exportButton.style.borderColor = 'transparent';
        this.exportButton.style.color = 'var(--text-muted)';
      }
    });

    // Apply A11Y focus handling
    applyA11yFocus(this.exportButton);

    // Create dropdown menu (rendered at body level)
    this.dropdown = document.createElement('div');
    this.dropdown.className = 'export-dropdown';
    this.dropdown.style.cssText = `
      position: fixed;
      background: var(--bg-secondary);
      border: 1px solid var(--bg-hover);
      border-radius: 4px;
      padding: 4px 0;
      min-width: 200px;
      z-index: 9999;
      display: none;
      box-shadow: 0 4px 12px rgba(0,0,0,0.4);
    `;

    this.createDropdownItems();

    this.container.appendChild(this.exportButton);

    // Close dropdown on outside click
    this.boundHandleDocumentClick = this.handleDocumentClick.bind(this);
    document.addEventListener('click', this.boundHandleDocumentClick);
  }

  private boundHandleDocumentClick: (e: MouseEvent) => void;

  private handleDocumentClick(e: MouseEvent): void {
    if (this.isDropdownOpen && !this.container.contains(e.target as Node) && !this.dropdown.contains(e.target as Node)) {
      this.closeDropdown();
    }
  }

  private createDropdownItems(): void {
    // Single frame export section
    this.addSectionHeader('Single Frame');
    this.addMenuItem('image', 'Save as PNG', () => this.exportAs('png'), 'Ctrl+S');
    this.addMenuItem('image', 'Save as JPEG', () => this.exportAs('jpeg'));
    this.addMenuItem('image', 'Save as WebP', () => this.exportAs('webp'));
    this.addMenuItem('clipboard', 'Copy to Clipboard', () => this.copyToClipboard(), 'Ctrl+C');

    this.addSeparator();

    // Sequence export section
    this.addSectionHeader('Sequence Export');
    this.addMenuItem('film', 'Export In/Out Range', () => this.exportSequence(true));
    this.addMenuItem('film', 'Export All Frames', () => this.exportSequence(false));

    this.addSeparator();

    // Session export section
    this.addSectionHeader('Session');
    this.addMenuItem('download', 'Save RV Session (.rv)', () => this.exportRvSession('rv'));
    this.addMenuItem('download', 'Save RV Session (.gto)', () => this.exportRvSession('gto'));

    this.addSeparator();

    // Annotations export section
    this.addSectionHeader('Annotations');
    this.addMenuItem('download', 'Export Annotations (JSON)', () => this.exportAnnotationsJSON());
    this.addMenuItem('download', 'Export Annotations (PDF)', () => this.exportAnnotationsPDF());

    this.addSeparator();

    // Options section
    this.addAnnotationsToggle();
  }

  private addSectionHeader(text: string): void {
    const header = document.createElement('div');
    header.style.cssText = `
      padding: 6px 12px 4px;
      color: var(--text-muted);
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    `;
    header.textContent = text;
    this.dropdown.appendChild(header);
  }

  private addMenuItem(
    icon: IconName,
    labelText: string,
    action: () => void,
    shortcut?: string
  ): void {
    const row = document.createElement('div');
    row.style.cssText = `
      display: flex;
      align-items: center;
      padding: 6px 12px;
      cursor: pointer;
      transition: background 0.1s ease;
      gap: 8px;
      color: var(--text-muted);
    `;

    row.addEventListener('mouseenter', () => {
      row.style.background = 'var(--bg-hover)';
      row.style.color = 'var(--text-primary)';
    });
    row.addEventListener('mouseleave', () => {
      row.style.background = 'transparent';
      row.style.color = 'var(--text-muted)';
    });

    const iconEl = document.createElement('span');
    iconEl.innerHTML = getIconSvg(icon, 'sm');
    iconEl.style.cssText = 'display: flex; align-items: center;';

    const label = document.createElement('span');
    label.textContent = labelText;
    label.style.cssText = 'flex: 1; font-size: 12px;';

    row.appendChild(iconEl);
    row.appendChild(label);

    if (shortcut) {
      const shortcutEl = document.createElement('span');
      shortcutEl.textContent = shortcut;
      shortcutEl.style.cssText = 'color: var(--border-secondary); font-size: 10px;';
      row.appendChild(shortcutEl);
    }

    row.addEventListener('click', () => {
      action();
      this.closeDropdown();
    });

    this.dropdown.appendChild(row);
  }

  private addSeparator(): void {
    const separator = document.createElement('div');
    separator.style.cssText = `
      height: 1px;
      background: var(--bg-hover);
      margin: 4px 0;
    `;
    this.dropdown.appendChild(separator);
  }

  private addAnnotationsToggle(): void {
    const row = document.createElement('div');
    row.style.cssText = `
      display: flex;
      align-items: center;
      padding: 6px 12px;
      gap: 8px;
    `;

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.id = 'export-annotations';
    checkbox.checked = true;
    checkbox.style.cssText = `
      width: 14px;
      height: 14px;
      accent-color: var(--accent-primary);
      cursor: pointer;
    `;

    const label = document.createElement('label');
    label.htmlFor = 'export-annotations';
    label.textContent = 'Include annotations';
    label.style.cssText = 'color: var(--text-secondary); font-size: 11px; cursor: pointer;';

    row.appendChild(checkbox);
    row.appendChild(label);
    this.dropdown.appendChild(row);

    this.annotationsCheckbox = checkbox;
  }

  private toggleDropdown(): void {
    if (this.isDropdownOpen) {
      this.closeDropdown();
    } else {
      this.openDropdown();
    }
  }

  private openDropdown(): void {
    if (!document.body.contains(this.dropdown)) {
      document.body.appendChild(this.dropdown);
    }

    const rect = this.exportButton.getBoundingClientRect();
    this.dropdown.style.top = `${rect.bottom + 4}px`;
    this.dropdown.style.left = `${Math.max(8, rect.right - 220)}px`;

    this.isDropdownOpen = true;
    this.dropdown.style.display = 'block';
    this.exportButton.style.background = 'rgba(var(--accent-primary-rgb), 0.15)';
    this.exportButton.style.borderColor = 'var(--accent-primary)';
    this.exportButton.style.color = 'var(--accent-primary)';
  }

  private closeDropdown(): void {
    this.isDropdownOpen = false;
    this.dropdown.style.display = 'none';
    this.exportButton.style.background = 'transparent';
    this.exportButton.style.borderColor = 'transparent';
    this.exportButton.style.color = 'var(--text-muted)';
  }

  private getIncludeAnnotations(): boolean {
    return this.annotationsCheckbox?.checked ?? true;
  }

  private exportAs(format: ExportFormat): void {
    this.emit('exportRequested', {
      format,
      includeAnnotations: this.getIncludeAnnotations(),
      quality: 0.92,
    });
  }

  private copyToClipboard(): void {
    this.emit('copyRequested', undefined);
  }

  private exportSequence(useInOutRange: boolean): void {
    this.emit('sequenceExportRequested', {
      format: 'png',
      includeAnnotations: this.annotationsCheckbox?.checked ?? true,
      quality: 0.95,
      useInOutRange,
    });
  }

  private exportRvSession(format: 'rv' | 'gto'): void {
    this.emit('rvSessionExportRequested', { format });
  }

  private exportAnnotationsJSON(): void {
    this.emit('annotationsJSONExportRequested', undefined);
  }

  private exportAnnotationsPDF(): void {
    this.emit('annotationsPDFExportRequested', undefined);
  }

  quickExport(format: ExportFormat = 'png'): void {
    this.exportAs(format);
  }

  render(): HTMLElement {
    return this.container;
  }

  dispose(): void {
    document.removeEventListener('click', this.boundHandleDocumentClick);
  }
}
