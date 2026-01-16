import { EventEmitter, EventMap } from '../../utils/EventEmitter';
import { ExportFormat } from '../../utils/FrameExporter';

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
    this.exportButton.textContent = '📷 Export';
    this.exportButton.title = 'Export current frame (Ctrl+S)';
    this.exportButton.style.cssText = `
      background: #444;
      border: 1px solid #555;
      color: #ddd;
      padding: 6px 12px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 13px;
      transition: all 0.15s ease;
      display: flex;
      align-items: center;
      justify-content: center;
    `;

    this.exportButton.addEventListener('click', () => this.toggleDropdown());
    this.exportButton.addEventListener('mouseenter', () => {
      this.exportButton.style.background = '#555';
    });
    this.exportButton.addEventListener('mouseleave', () => {
      if (!this.isDropdownOpen) {
        this.exportButton.style.background = '#444';
      }
    });

    // Create dropdown menu (rendered at body level)
    this.dropdown = document.createElement('div');
    this.dropdown.className = 'export-dropdown';
    this.dropdown.style.cssText = `
      position: fixed;
      background: #2a2a2a;
      border: 1px solid #444;
      border-radius: 6px;
      padding: 8px 0;
      min-width: 200px;
      z-index: 9999;
      display: none;
      box-shadow: 0 8px 24px rgba(0,0,0,0.5);
    `;

    this.createDropdownItems();

    this.container.appendChild(this.exportButton);
    // Dropdown will be appended to body when shown

    // Close dropdown on outside click
    document.addEventListener('click', (e) => {
      if (this.isDropdownOpen && !this.container.contains(e.target as Node) && !this.dropdown.contains(e.target as Node)) {
        this.closeDropdown();
      }
    });
  }

  private createDropdownItems(): void {
    // Single frame export section
    this.addSectionHeader('Single Frame');
    this.addMenuItem('🖼️', 'Save as PNG', () => this.exportAs('png'), 'Ctrl+S');
    this.addMenuItem('📸', 'Save as JPEG', () => this.exportAs('jpeg'));
    this.addMenuItem('🌐', 'Save as WebP', () => this.exportAs('webp'));
    this.addMenuItem('📋', 'Copy to Clipboard', () => this.copyToClipboard(), 'Ctrl+C');

    this.addSeparator();

    // Sequence export section
    this.addSectionHeader('Sequence Export');
    this.addMenuItem('🎬', 'Export In/Out Range', () => this.exportSequence(true));
    this.addMenuItem('📽️', 'Export All Frames', () => this.exportSequence(false));

    this.addSeparator();

    // Options section
    this.addAnnotationsToggle();
  }

  private addSectionHeader(text: string): void {
    const header = document.createElement('div');
    header.style.cssText = `
      padding: 4px 12px;
      color: #888;
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    `;
    header.textContent = text;
    this.dropdown.appendChild(header);
  }

  private addMenuItem(
    iconText: string,
    labelText: string,
    action: () => void,
    shortcut?: string
  ): void {
    const row = document.createElement('div');
    row.style.cssText = `
      display: flex;
      align-items: center;
      padding: 8px 12px;
      cursor: pointer;
      transition: background 0.1s ease;
      gap: 8px;
    `;

    row.addEventListener('mouseenter', () => {
      row.style.background = '#3a3a3a';
    });
    row.addEventListener('mouseleave', () => {
      row.style.background = 'transparent';
    });

    const icon = document.createElement('span');
    icon.textContent = iconText;
    icon.style.fontSize = '14px';

    const label = document.createElement('span');
    label.textContent = labelText;
    label.style.cssText = 'flex: 1; color: #ddd; font-size: 13px;';

    row.appendChild(icon);
    row.appendChild(label);

    if (shortcut) {
      const shortcutEl = document.createElement('span');
      shortcutEl.textContent = shortcut;
      shortcutEl.style.cssText = 'color: #888; font-size: 11px;';
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
      background: #444;
      margin: 8px 0;
    `;
    this.dropdown.appendChild(separator);
  }

  private addAnnotationsToggle(): void {
    const row = document.createElement('div');
    row.style.cssText = `
      display: flex;
      align-items: center;
      padding: 8px 12px;
      gap: 8px;
    `;

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.id = 'export-annotations';
    checkbox.checked = true;
    checkbox.style.accentColor = '#4a9eff';

    const label = document.createElement('label');
    label.htmlFor = 'export-annotations';
    label.textContent = 'Include annotations';
    label.style.cssText = 'color: #aaa; font-size: 12px; cursor: pointer;';

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
    // Append to body if not already there
    if (!document.body.contains(this.dropdown)) {
      document.body.appendChild(this.dropdown);
    }

    // Position relative to button
    const rect = this.exportButton.getBoundingClientRect();
    this.dropdown.style.top = `${rect.bottom + 4}px`;
    this.dropdown.style.left = `${Math.max(8, rect.right - 220)}px`;

    this.isDropdownOpen = true;
    this.dropdown.style.display = 'block';
    this.exportButton.style.background = '#555';
    this.exportButton.style.borderColor = '#4a9eff';
  }

  private closeDropdown(): void {
    this.isDropdownOpen = false;
    this.dropdown.style.display = 'none';
    this.exportButton.style.background = '#444';
    this.exportButton.style.borderColor = '#555';
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
      format: 'png',  // Default to PNG for sequences
      includeAnnotations: this.getIncludeAnnotations(),
      quality: 0.92,
      useInOutRange,
    });
  }

  // Public method for keyboard shortcut
  quickExport(format: ExportFormat = 'png'): void {
    this.exportAs(format);
  }

  render(): HTMLElement {
    return this.container;
  }

  dispose(): void {
    // Cleanup if needed
  }
}
