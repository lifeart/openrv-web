/**
 * Builds the panel toggle buttons for the HeaderBar utility area.
 *
 * These are accessible from any tab: Info, Snapshots, Playlist, Conform, ShotGrid.
 * Also provides helpers for dynamically adding/removing plugin-contributed panel toggles.
 */
import { ContextToolbar } from '../../ui/components/layout/ContextToolbar';
import { setButtonActive } from '../../ui/components/shared/Button';
import { InfoPanelSettingsMenu } from '../../ui/components/InfoPanelSettingsMenu';
import type { Panel } from '../../ui/components/shared/Panel';
import type { AppControlRegistry } from '../../AppControlRegistry';
import type { AppSessionBridge } from '../../AppSessionBridge';

export interface BuildPanelTogglesDeps {
  registry: AppControlRegistry;
  sessionBridge: AppSessionBridge;
  conformPanelElement: Panel;
  addUnsubscriber: (unsub: () => void) => void;
}

export interface PanelTogglesResult {
  /** The container element with all toggle buttons */
  element: HTMLElement;
  /**
   * Add a plugin-contributed panel toggle button.
   * Returns the created button and a floating container for the panel content.
   */
  addPluginPanel(id: string, label: string, icon?: string): { button: HTMLButtonElement; container: HTMLElement };
  /** Remove a plugin-contributed panel toggle button by ID */
  removePluginPanel(id: string): void;
}

export function buildPanelToggles(deps: BuildPanelTogglesDeps): PanelTogglesResult {
  const { registry, sessionBridge, conformPanelElement, addUnsubscriber } = deps;

  const panelToggles = document.createElement('div');
  panelToggles.style.cssText = 'display: flex; align-items: center; gap: 2px;';

  // Info Panel toggle button
  const infoPanelButton = ContextToolbar.createIconButton(
    'info',
    () => {
      registry.infoPanel.toggle();
      if (registry.infoPanel.isEnabled()) {
        sessionBridge.updateInfoPanel();
      }
    },
    { title: 'Info Panel (Shift+Alt+I) — Right-click for settings' },
  );
  infoPanelButton.dataset.testid = 'info-panel-toggle';
  panelToggles.appendChild(infoPanelButton);

  // Right-click context menu for InfoPanel settings
  const infoPanelSettingsMenu = new InfoPanelSettingsMenu(registry.infoPanel);
  infoPanelButton.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    infoPanelSettingsMenu.show(e.clientX, e.clientY);
  });
  addUnsubscriber(() => infoPanelSettingsMenu.dispose());

  addUnsubscriber(
    registry.infoPanel.on('visibilityChanged', (visible) => {
      setButtonActive(infoPanelButton, visible, 'icon');
    }),
  );

  // Snapshot Panel toggle button
  const snapshotButton = ContextToolbar.createIconButton(
    'camera',
    () => {
      registry.snapshotPanel.toggle();
      updateSnapshotButtonStyle();
    },
    { title: 'Snapshots (Ctrl+Shift+Alt+S)' },
  );
  snapshotButton.dataset.testid = 'snapshot-panel-toggle';
  panelToggles.appendChild(snapshotButton);

  const updateSnapshotButtonStyle = () => {
    setButtonActive(snapshotButton, registry.snapshotPanel.isOpen(), 'icon');
  };
  addUnsubscriber(
    registry.snapshotPanel.on('visibilityChanged', () => {
      updateSnapshotButtonStyle();
    }),
  );

  // Playlist Panel toggle button
  const playlistButton = ContextToolbar.createIconButton(
    'film',
    () => {
      registry.playlistPanel.toggle();
      updatePlaylistButtonStyle();
    },
    { title: 'Playlist (Shift+Alt+P)' },
  );
  playlistButton.dataset.testid = 'playlist-panel-toggle';
  panelToggles.appendChild(playlistButton);

  const updatePlaylistButtonStyle = () => {
    setButtonActive(playlistButton, registry.playlistPanel.isOpen(), 'icon');
  };
  addUnsubscriber(
    registry.playlistPanel.on('visibilityChanged', () => {
      updatePlaylistButtonStyle();
    }),
  );

  // Cache Management Panel toggle button
  if (registry.cacheManagementPanel) {
    const cachePanel = registry.cacheManagementPanel;
    const cachePanelButton = ContextToolbar.createIconButton(
      'box',
      () => {
        cachePanel.toggle();
      },
      { title: 'Media Cache' },
    );
    cachePanelButton.dataset.testid = 'cache-panel-toggle';
    panelToggles.appendChild(cachePanelButton);

    addUnsubscriber(
      cachePanel.on('visibilityChanged', (visible) => {
        setButtonActive(cachePanelButton, visible, 'icon');
      }),
    );
  }

  // Conform / Re-link panel toggle button
  const conformButton = ContextToolbar.createIconButton(
    'link',
    () => {
      conformPanelElement.toggle(conformButton);
      if (conformPanelElement.isVisible()) {
        registry.conformPanel.render();
      }
    },
    { title: 'Conform / Re-link' },
  );
  conformButton.dataset.testid = 'conform-panel-toggle';
  addUnsubscriber(
    conformPanelElement.onVisibilityChange((visible) => {
      setButtonActive(conformButton, visible, 'icon');
    }),
  );
  panelToggles.appendChild(conformButton);

  // ShotGrid Panel toggle button
  const shotGridButton = ContextToolbar.createIconButton(
    'cloud',
    () => {
      registry.shotGridPanel.toggle();
      updateShotGridButtonStyle();
    },
    { title: 'ShotGrid' },
  );
  shotGridButton.dataset.testid = 'shotgrid-panel-toggle';
  panelToggles.appendChild(shotGridButton);

  const updateShotGridButtonStyle = () => {
    setButtonActive(shotGridButton, registry.shotGridPanel.isOpen(), 'icon');
  };
  addUnsubscriber(
    registry.shotGridPanel.on('visibilityChanged', () => {
      updateShotGridButtonStyle();
    }),
  );

  // --- Plugin panel toggle management ---
  const pluginPanelEntries = new Map<string, { button: HTMLButtonElement; container: HTMLElement }>();

  function addPluginPanel(id: string, label: string, icon?: string): { button: HTMLButtonElement; container: HTMLElement } {
    // Create the floating container for plugin panel content
    const container = document.createElement('div');
    container.dataset.pluginPanelId = id;
    container.style.cssText =
      'display: none; position: absolute; top: 100%; right: 0; z-index: 1000; ' +
      'background: var(--bg-primary, #1e1e1e); border: 1px solid var(--border-color, #444); ' +
      'border-radius: 4px; box-shadow: 0 4px 12px rgba(0,0,0,0.3); min-width: 200px; padding: 8px;';

    // Use 'grid' as a fallback icon when no icon is provided
    const iconName = (icon || 'grid') as import('../../ui/components/shared/Icons').IconName;
    const button = ContextToolbar.createIconButton(
      iconName,
      () => {
        const isVisible = container.style.display !== 'none';
        container.style.display = isVisible ? 'none' : 'block';
        setButtonActive(button, !isVisible, 'icon');
      },
      { title: label },
    );
    button.dataset.testid = `plugin-panel-toggle-${id}`;
    panelToggles.appendChild(button);

    pluginPanelEntries.set(id, { button, container });
    return { button, container };
  }

  function removePluginPanel(id: string): void {
    const entry = pluginPanelEntries.get(id);
    if (!entry) return;
    entry.button.remove();
    entry.container.remove();
    pluginPanelEntries.delete(id);
  }

  return { element: panelToggles, addPluginPanel, removePluginPanel };
}
