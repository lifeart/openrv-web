/**
 * Builds the QC (Quality Control) tab toolbar content.
 *
 * Includes scopes, analysis tools, pixel probe, and eyedropper.
 */
import { ContextToolbar } from '../../ui/components/layout/ContextToolbar';
import { setButtonActive } from '../../ui/components/shared/Button';
import type { AppControlRegistry } from '../../AppControlRegistry';
import type { Viewer } from '../../ui/components/Viewer';
import { ClippingOverlaySettingsMenu } from '../../ui/components/ClippingOverlaySettingsMenu';

export interface BuildQCTabDeps {
  registry: AppControlRegistry;
  viewer: Viewer;
  addUnsubscriber: (unsub: () => void) => void;
}

export function buildQCTab(deps: BuildQCTabDeps): HTMLElement {
  const { registry, viewer, addUnsubscriber } = deps;
  const clippingOverlay = viewer.getClippingOverlay();

  const qcContent = document.createElement('div');
  qcContent.style.cssText = 'display: flex; align-items: center; gap: 6px; flex-shrink: 0;';

  // --- GROUP 1: Monitoring (Scopes) ---
  qcContent.appendChild(registry.scopesControl.render());
  qcContent.appendChild(ContextToolbar.createDivider());

  // --- GROUP 2: Analysis (SafeAreas, FalseColor, Luminance, Zebra, HSL) ---
  qcContent.appendChild(registry.safeAreasControl.render());
  qcContent.appendChild(registry.falseColorControl.render());
  qcContent.appendChild(registry.luminanceVisControl.render());
  qcContent.appendChild(registry.zebraControl.render());
  qcContent.appendChild(registry.hslQualifierControl.render());

  const clippingButton = ContextToolbar.createIconButton(
    'contrast',
    () => {
      clippingOverlay.toggle();
    },
    { title: 'Toggle clipping overlay — Right-click for settings' },
  );
  clippingButton.dataset.testid = 'clipping-overlay-toggle';
  qcContent.appendChild(clippingButton);

  const clippingSettingsMenu = new ClippingOverlaySettingsMenu(clippingOverlay);
  clippingButton.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    clippingSettingsMenu.show(e.clientX, e.clientY);
  });
  addUnsubscriber(() => clippingSettingsMenu.dispose());

  qcContent.appendChild(ContextToolbar.createDivider());

  // --- GROUP 3: Tools (Pixel Probe) ---
  const pixelProbeButton = ContextToolbar.createIconButton(
    'eyedropper',
    () => {
      viewer.getPixelProbe().toggle();
    },
    { title: 'Pixel Probe (Shift+I)' },
  );
  pixelProbeButton.dataset.testid = 'pixel-probe-toggle';
  qcContent.appendChild(pixelProbeButton);

  // Update pixel probe button state
  addUnsubscriber(
    viewer.getPixelProbe().on('stateChanged', (state) => {
      setButtonActive(pixelProbeButton, state.enabled, 'icon');
    }),
  );

  // Trigger re-render when false color state changes
  addUnsubscriber(
    viewer.getFalseColor().on('stateChanged', () => {
      viewer.refresh();
    }),
  );

  // Add luminance visualization badge to canvas overlay
  const lumVisBadge = registry.luminanceVisControl.createBadge();
  viewer.getCanvasContainer().appendChild(lumVisBadge);

  // Setup eyedropper for color picking from viewer
  let pendingEyedropperHandler: ((e: MouseEvent) => void) | null = null;
  registry.hslQualifierControl.setEyedropperCallback((active) => {
    const viewerContainer = viewer.getContainer();
    if (pendingEyedropperHandler) {
      viewerContainer.removeEventListener('click', pendingEyedropperHandler);
      pendingEyedropperHandler = null;
    }
    if (active) {
      viewerContainer.style.cursor = 'crosshair';
      const clickHandler = (e: MouseEvent) => {
        pendingEyedropperHandler = null;
        const imageData = viewer.getImageData();
        if (imageData) {
          const position = viewer.getPixelCoordinatesFromClient(e.clientX, e.clientY);
          if (
            position &&
            position.x >= 0 &&
            position.x < imageData.width &&
            position.y >= 0 &&
            position.y < imageData.height
          ) {
            const idx = (position.y * imageData.width + position.x) * 4;
            const r = imageData.data[idx]!;
            const g = imageData.data[idx + 1]!;
            const b = imageData.data[idx + 2]!;
            viewer.getHSLQualifier().pickColor(r, g, b);
          }
        }
        registry.hslQualifierControl.deactivateEyedropper();
        viewerContainer.style.cursor = '';
      };
      pendingEyedropperHandler = clickHandler;
      viewerContainer.addEventListener('click', clickHandler, { once: true });
    } else {
      viewerContainer.style.cursor = '';
    }
  });

  // Sync scope visibility with ScopesControl
  addUnsubscriber(
    registry.histogram.on('visibilityChanged', (visible) => {
      registry.scopesControl.setScopeVisible('histogram', visible);
    }),
  );
  addUnsubscriber(
    registry.waveform.on('visibilityChanged', (visible) => {
      registry.scopesControl.setScopeVisible('waveform', visible);
    }),
  );
  addUnsubscriber(
    registry.vectorscope.on('visibilityChanged', (visible) => {
      registry.scopesControl.setScopeVisible('vectorscope', visible);
    }),
  );
  addUnsubscriber(
    registry.gamutDiagram.on('visibilityChanged', (visible) => {
      registry.scopesControl.setScopeVisible('gamutDiagram', visible);
    }),
  );

  // Sync histogram clipping overlay toggle with Viewer
  addUnsubscriber(
    registry.histogram.on('clippingOverlayToggled', (enabled) => {
      if (enabled) {
        clippingOverlay.enable();
      } else {
        clippingOverlay.disable();
      }
    }),
  );

  addUnsubscriber(
    clippingOverlay.on('stateChanged', (state) => {
      setButtonActive(clippingButton, state.enabled, 'icon');
      if (typeof registry.histogram.setClippingOverlay === 'function') {
        registry.histogram.setClippingOverlay(state.enabled);
      }
    }),
  );

  return qcContent;
}
