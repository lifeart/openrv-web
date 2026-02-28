/**
 * Builds the Annotate tab toolbar content.
 *
 * Includes paint toolbar, text formatting, history, markers, and notes.
 */
import { ContextToolbar } from '../../ui/components/layout/ContextToolbar';
import { setButtonActive } from '../../ui/components/shared/Button';
import type { AppControlRegistry } from '../../AppControlRegistry';

export interface BuildAnnotateTabDeps {
  registry: AppControlRegistry;
  addUnsubscriber: (unsub: () => void) => void;
}

export function buildAnnotateTab(deps: BuildAnnotateTabDeps): HTMLElement {
  const { registry, addUnsubscriber } = deps;

  const annotateContent = document.createElement('div');
  annotateContent.style.cssText = 'display: flex; align-items: center; gap: 6px;';
  annotateContent.appendChild(registry.paintToolbar.render());

  annotateContent.appendChild(ContextToolbar.createDivider());

  // Text formatting toolbar (B/I/U buttons) - visible when text tool is selected
  annotateContent.appendChild(registry.textFormattingToolbar.render());

  annotateContent.appendChild(ContextToolbar.createDivider());

  // History panel toggle button
  const historyButton = ContextToolbar.createButton('History', () => {
    registry.historyPanel.toggle();
  }, { title: 'Toggle history panel (Shift+Alt+H)', icon: 'undo' });
  historyButton.dataset.testid = 'history-toggle-button';
  annotateContent.appendChild(historyButton);

  addUnsubscriber(registry.historyPanel.on('visibilityChanged', (visible) => {
    setButtonActive(historyButton, visible, 'ghost');
  }));

  // Markers panel toggle button
  const markersButton = ContextToolbar.createButton('Markers', () => {
    registry.markerListPanel.toggle();
  }, { title: 'Toggle markers list panel (Shift+Alt+M)', icon: 'marker' });
  markersButton.dataset.testid = 'markers-toggle-button';
  annotateContent.appendChild(markersButton);

  addUnsubscriber(registry.markerListPanel.on('visibilityChanged', (visible) => {
    setButtonActive(markersButton, visible, 'ghost');
  }));

  // Notes panel toggle button
  const notesButton = ContextToolbar.createButton('Notes', () => {
    registry.notePanel.toggle();
  }, { title: 'Toggle notes panel (Shift+Alt+N)', icon: 'note' });
  notesButton.dataset.testid = 'notes-toggle-button';
  annotateContent.appendChild(notesButton);

  addUnsubscriber(registry.notePanel.on('visibilityChanged', (visible) => {
    setButtonActive(notesButton, visible, 'ghost');
  }));

  return annotateContent;
}
