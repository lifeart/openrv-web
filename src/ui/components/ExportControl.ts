import { EventEmitter, EventMap } from '../../utils/EventEmitter';
import { ExportFormat } from '../../utils/FrameExporter';

export interface ExportRequest {
  format: ExportFormat;
  includeAnnotations: boolean;
  quality: number;
}

export interface ExportControlEvents extends EventMap {
  exportRequested: ExportRequest;
  copyRequested: void;
}

export class ExportControl extends EventEmitter<ExportControlEvents> {
  private container: HTMLElement;
  private exportButton: HTMLButtonElement;
  private dropdown: HTMLElement;
  private isDropdownOpen = false;

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

    // Create dropdown menu
    this.dropdown = document.createElement('div');
    this.dropdown.className = 'export-dropdown';
    this.dropdown.style.cssText = `
      position: absolute;
      top: 100%;
      right: 0;
      background: #2a2a2a;
      border: 1px solid #444;
      border-radius: 6px;
      padding: 8px 0;
      min-width: 180px;
      z-index: 1000;
      display: none;
      box-shadow: 0 4px 12px rgba(0,0,0,0.4);
      margin-top: 4px;
    `;

    this.createDropdownItems();

    this.container.appendChild(this.exportButton);
    this.container.appendChild(this.dropdown);

    // Close dropdown on outside click
    document.addEventListener('click', (e) => {
      if (!this.container.contains(e.target as Node)) {
        this.closeDropdown();
      }
    });
  }

  private createDropdownItems(): void {
    const items: Array<{
      label: string;
      icon: string;
      action: () => void;
      shortcut?: string;
    }> = [
      {
        label: 'Save as PNG',
        icon: '🖼️',
        action: () => this.exportAs('png'),
        shortcut: 'Ctrl+S',
      },
      {
        label: 'Save as JPEG',
        icon: '📸',
        action: () => this.exportAs('jpeg'),
      },
      {
        label: 'Save as WebP',
        icon: '🌐',
        action: () => this.exportAs('webp'),
      },
      {
        label: 'Copy to Clipboard',
        icon: '📋',
        action: () => this.copyToClipboard(),
        shortcut: 'Ctrl+C',
      },
    ];

    for (const item of items) {
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
      icon.textContent = item.icon;
      icon.style.fontSize = '14px';

      const label = document.createElement('span');
      label.textContent = item.label;
      label.style.cssText = 'flex: 1; color: #ddd; font-size: 13px;';

      row.appendChild(icon);
      row.appendChild(label);

      if (item.shortcut) {
        const shortcut = document.createElement('span');
        shortcut.textContent = item.shortcut;
        shortcut.style.cssText = 'color: #888; font-size: 11px;';
        row.appendChild(shortcut);
      }

      row.addEventListener('click', () => {
        item.action();
        this.closeDropdown();
      });

      this.dropdown.appendChild(row);
    }

    // Add separator
    const separator = document.createElement('div');
    separator.style.cssText = `
      height: 1px;
      background: #444;
      margin: 8px 0;
    `;
    this.dropdown.appendChild(separator);

    // Add annotations toggle
    const annotationsRow = document.createElement('div');
    annotationsRow.style.cssText = `
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

    const checkboxLabel = document.createElement('label');
    checkboxLabel.htmlFor = 'export-annotations';
    checkboxLabel.textContent = 'Include annotations';
    checkboxLabel.style.cssText = 'color: #aaa; font-size: 12px; cursor: pointer;';

    annotationsRow.appendChild(checkbox);
    annotationsRow.appendChild(checkboxLabel);
    this.dropdown.appendChild(annotationsRow);

    // Store checkbox reference
    (this.dropdown as HTMLElement & { annotationsCheckbox?: HTMLInputElement }).annotationsCheckbox = checkbox;
  }

  private toggleDropdown(): void {
    this.isDropdownOpen = !this.isDropdownOpen;
    this.dropdown.style.display = this.isDropdownOpen ? 'block' : 'none';
    this.exportButton.style.background = this.isDropdownOpen ? '#555' : '#444';
    this.exportButton.style.borderColor = this.isDropdownOpen ? '#4a9eff' : '#555';
  }

  private closeDropdown(): void {
    this.isDropdownOpen = false;
    this.dropdown.style.display = 'none';
    this.exportButton.style.background = '#444';
    this.exportButton.style.borderColor = '#555';
  }

  private getIncludeAnnotations(): boolean {
    const checkbox = (this.dropdown as HTMLElement & { annotationsCheckbox?: HTMLInputElement }).annotationsCheckbox;
    return checkbox?.checked ?? true;
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
