/**
 * ExportProgress — Progress dialog for video export
 *
 * Shows a progress bar with frame count, percentage, elapsed time,
 * and estimated remaining time. Includes a cancel button.
 */

import { EventEmitter, EventMap } from '../../utils/EventEmitter';
import type { ExportProgress as ProgressData } from '../../export/VideoExporter';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ExportProgressEvents extends EventMap {
  cancel: void;
  close: void;
}

// ---------------------------------------------------------------------------
// ExportProgressDialog
// ---------------------------------------------------------------------------

export class ExportProgressDialog extends EventEmitter<ExportProgressEvents> {
  private backdrop: HTMLElement;
  private container: HTMLElement;
  private progressBar: HTMLElement;
  private progressFill: HTMLElement;
  private statusLabel: HTMLElement;
  private frameLabel: HTMLElement;
  private timeLabel: HTMLElement;
  private cancelButton: HTMLButtonElement;
  private visible = false;
  private disposed = false;
  private terminal = false; // true when complete/cancelled/error
  private handleClick: () => void;
  private handleKeyDown: (e: KeyboardEvent) => void;

  constructor(parent: HTMLElement) {
    super();

    // Backdrop overlay to prevent interaction behind the dialog
    this.backdrop = document.createElement('div');
    this.backdrop.className = 'export-progress-backdrop';
    this.backdrop.style.cssText = `
      position: fixed;
      inset: 0;
      z-index: 9999;
      background: rgba(0, 0, 0, 0.5);
      display: none;
    `;

    this.container = document.createElement('div');
    this.container.className = 'export-progress-dialog';
    this.container.setAttribute('role', 'dialog');
    this.container.setAttribute('aria-modal', 'true');
    this.container.setAttribute('aria-labelledby', 'export-dialog-title');
    this.container.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: var(--bg-secondary, #1e1e2e);
      border: 1px solid var(--border-color, #333);
      border-radius: 8px;
      padding: 24px;
      min-width: 400px;
      z-index: 10000;
      display: none;
      box-shadow: 0 8px 32px rgba(0,0,0,0.5);
    `;

    const title = document.createElement('div');
    title.id = 'export-dialog-title';
    title.textContent = 'Exporting Video';
    title.style.cssText = 'font-size: 16px; font-weight: 600; margin-bottom: 16px; color: var(--text-primary, #fff);';
    this.container.appendChild(title);

    this.statusLabel = document.createElement('div');
    this.statusLabel.dataset.testid = 'export-progress-status';
    this.statusLabel.setAttribute('aria-live', 'polite');
    this.statusLabel.style.cssText = `
      font-size: 12px;
      color: var(--text-secondary, #aaa);
      margin-bottom: 8px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    `;
    this.statusLabel.textContent = 'Encoding...';
    this.container.appendChild(this.statusLabel);

    this.progressBar = document.createElement('div');
    this.progressBar.setAttribute('role', 'progressbar');
    this.progressBar.setAttribute('aria-valuemin', '0');
    this.progressBar.setAttribute('aria-valuemax', '100');
    this.progressBar.setAttribute('aria-valuenow', '0');
    this.progressBar.style.cssText = `
      height: 8px;
      background: var(--bg-tertiary, #333);
      border-radius: 4px;
      overflow: hidden;
      margin-bottom: 12px;
    `;
    this.progressFill = document.createElement('div');
    this.progressFill.style.cssText = `
      height: 100%;
      width: 0%;
      background: var(--accent-primary, #6366f1);
      border-radius: 4px;
      transition: width 0.1s ease;
    `;
    this.progressBar.appendChild(this.progressFill);
    this.container.appendChild(this.progressBar);

    const infoRow = document.createElement('div');
    infoRow.style.cssText = `
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 8px;
      margin-bottom: 16px;
      white-space: nowrap;
      overflow: hidden;
      min-width: 0;
    `;

    this.frameLabel = document.createElement('div');
    this.frameLabel.dataset.testid = 'export-progress-frames';
    this.frameLabel.style.cssText = `
      font-size: 12px;
      color: var(--text-secondary, #aaa);
      flex: 1 1 0;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    `;
    this.frameLabel.textContent = '0 / 0 frames';
    infoRow.appendChild(this.frameLabel);

    this.timeLabel = document.createElement('div');
    this.timeLabel.dataset.testid = 'export-progress-time';
    this.timeLabel.style.cssText = `
      font-size: 12px;
      color: var(--text-secondary, #aaa);
      flex: 0 1 auto;
      min-width: 0;
      max-width: 55%;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      text-align: right;
    `;
    this.timeLabel.textContent = '';
    infoRow.appendChild(this.timeLabel);

    this.container.appendChild(infoRow);

    this.cancelButton = document.createElement('button');
    this.cancelButton.textContent = 'Cancel';
    this.cancelButton.style.cssText = `
      padding: 6px 16px;
      border: 1px solid var(--border-color, #555);
      border-radius: 4px;
      background: transparent;
      color: var(--text-primary, #fff);
      cursor: pointer;
      font-size: 13px;
    `;

    this.handleClick = () => {
      if (this.disposed) return;
      if (this.terminal) {
        this.emit('close', undefined);
      } else {
        this.cancelButton.textContent = 'Cancelling...';
        this.cancelButton.disabled = true;
        this.emit('cancel', undefined);
      }
    };
    this.cancelButton.addEventListener('click', this.handleClick);

    this.handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && this.visible) {
        e.preventDefault();
        e.stopPropagation();
        this.handleClick();
      }
    };
    document.addEventListener('keydown', this.handleKeyDown);

    this.container.appendChild(this.cancelButton);

    parent.appendChild(this.backdrop);
    parent.appendChild(this.container);
  }

  show(): void {
    if (this.disposed) return;
    this.visible = true;
    this.terminal = false;
    this.cancelButton.disabled = false;
    this.cancelButton.textContent = 'Cancel';
    this.backdrop.style.display = 'block';
    this.container.style.display = 'block';
    this.updateProgress({
      currentFrame: 0,
      totalFrames: 0,
      percentage: 0,
      elapsedMs: 0,
      estimatedRemainingMs: 0,
      status: 'encoding',
    });
    this.cancelButton.focus();
  }

  hide(): void {
    this.visible = false;
    this.backdrop.style.display = 'none';
    this.container.style.display = 'none';
  }

  isVisible(): boolean {
    return this.visible;
  }

  updateProgress(progress: ProgressData): void {
    if (this.disposed) return;

    this.progressFill.style.width = `${progress.percentage}%`;
    this.progressBar.setAttribute('aria-valuenow', String(progress.percentage));

    this.frameLabel.textContent = `${Math.round((progress.percentage / 100) * progress.totalFrames)} / ${progress.totalFrames} frames`;

    switch (progress.status) {
      case 'encoding':
        this.statusLabel.textContent = `Encoding... ${progress.percentage}%`;
        break;
      case 'flushing':
        this.statusLabel.textContent = 'Finalizing...';
        break;
      case 'complete':
        this.statusLabel.textContent = 'Export complete!';
        this.cancelButton.textContent = 'Close';
        this.cancelButton.disabled = false;
        this.terminal = true;
        break;
      case 'cancelled':
        this.statusLabel.textContent = 'Export cancelled';
        this.cancelButton.textContent = 'Close';
        this.cancelButton.disabled = false;
        this.terminal = true;
        break;
      case 'error':
        this.statusLabel.textContent = 'Export failed';
        this.cancelButton.textContent = 'Close';
        this.cancelButton.disabled = false;
        this.terminal = true;
        break;
    }

    if (progress.elapsedMs > 0) {
      const elapsed = formatDuration(progress.elapsedMs);
      const remaining = progress.estimatedRemainingMs > 0
        ? ` / ~${formatDuration(progress.estimatedRemainingMs)} remaining`
        : '';
      this.timeLabel.textContent = `${elapsed} elapsed${remaining}`;
    }
  }

  dispose(): void {
    this.disposed = true;
    this.cancelButton.removeEventListener('click', this.handleClick);
    document.removeEventListener('keydown', this.handleKeyDown);
    this.backdrop.remove();
    this.container.remove();
    this.removeAllListeners();
  }
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}h ${mins}m ${secs}s`;
  }
  return `${minutes}m ${secs}s`;
}
