/**
 * Builds the panel toggle buttons for the HeaderBar utility area.
 *
 * These are accessible from any tab: Info, Snapshots, Playlist, Conform, ShotGrid.
 */
import { ContextToolbar } from '../../ui/components/layout/ContextToolbar';
import { setButtonActive } from '../../ui/components/shared/Button';
import type { Panel } from '../../ui/components/shared/Panel';
import type { AppControlRegistry } from '../../AppControlRegistry';
import type { AppSessionBridge } from '../../AppSessionBridge';

export interface BuildPanelTogglesDeps {
  registry: AppControlRegistry;
  sessionBridge: AppSessionBridge;
  conformPanelElement: Panel;
  addUnsubscriber: (unsub: () => void) => void;
}

export function buildPanelToggles(deps: BuildPanelTogglesDeps): HTMLElement {
  const { registry, sessionBridge, conformPanelElement, addUnsubscriber } = deps;

  const panelToggles = document.createElement('div');
  panelToggles.style.cssText = 'display: flex; align-items: center; gap: 2px;';

  // Info Panel toggle button
  const infoPanelButton = ContextToolbar.createIconButton('info', () => {
    registry.infoPanel.toggle();
    if (registry.infoPanel.isEnabled()) {
      sessionBridge.updateInfoPanel();
    }
  }, { title: 'Info Panel (Shift+Alt+I)' });
  infoPanelButton.dataset.testid = 'info-panel-toggle';
  panelToggles.appendChild(infoPanelButton);

  addUnsubscriber(registry.infoPanel.on('visibilityChanged', (visible) => {
    setButtonActive(infoPanelButton, visible, 'icon');
  }));

  // Snapshot Panel toggle button
  const snapshotButton = ContextToolbar.createIconButton('camera', () => {
    registry.snapshotPanel.toggle();
    updateSnapshotButtonStyle();
  }, { title: 'Snapshots (Ctrl+Shift+Alt+S)' });
  snapshotButton.dataset.testid = 'snapshot-panel-toggle';
  panelToggles.appendChild(snapshotButton);

  const updateSnapshotButtonStyle = () => {
    setButtonActive(snapshotButton, registry.snapshotPanel.isOpen(), 'icon');
  };
  addUnsubscriber(registry.snapshotPanel.on('visibilityChanged', () => {
    updateSnapshotButtonStyle();
  }));

  // Playlist Panel toggle button
  const playlistButton = ContextToolbar.createIconButton('film', () => {
    registry.playlistPanel.toggle();
    updatePlaylistButtonStyle();
  }, { title: 'Playlist (Shift+Alt+P)' });
  playlistButton.dataset.testid = 'playlist-panel-toggle';
  panelToggles.appendChild(playlistButton);

  const updatePlaylistButtonStyle = () => {
    setButtonActive(playlistButton, registry.playlistPanel.isOpen(), 'icon');
  };
  addUnsubscriber(registry.playlistPanel.on('visibilityChanged', () => {
    updatePlaylistButtonStyle();
  }));

  // Conform / Re-link panel toggle button
  const conformButton = ContextToolbar.createIconButton('link', () => {
    conformPanelElement.toggle(conformButton);
    setButtonActive(conformButton, conformPanelElement.isVisible(), 'icon');
    if (conformPanelElement.isVisible()) {
      registry.conformPanel.render();
    }
  }, { title: 'Conform / Re-link' });
  conformButton.dataset.testid = 'conform-panel-toggle';
  panelToggles.appendChild(conformButton);

  // ShotGrid Panel toggle button
  const shotGridButton = ContextToolbar.createIconButton('cloud', () => {
    registry.shotGridPanel.toggle();
    updateShotGridButtonStyle();
  }, { title: 'ShotGrid' });
  shotGridButton.dataset.testid = 'shotgrid-panel-toggle';
  panelToggles.appendChild(shotGridButton);

  const updateShotGridButtonStyle = () => {
    setButtonActive(shotGridButton, registry.shotGridPanel.isOpen(), 'icon');
  };
  addUnsubscriber(registry.shotGridPanel.on('visibilityChanged', () => {
    updateShotGridButtonStyle();
  }));

  return panelToggles;
}
