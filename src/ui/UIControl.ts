/**
 * UIControl - Common interface for UI controls
 *
 * All UI controls (panels, overlays, toolbars) implement this interface
 * to provide a consistent way to retrieve their DOM element and clean up resources.
 */
export interface UIControl {
  getElement(): HTMLElement;
  dispose(): void;
}
