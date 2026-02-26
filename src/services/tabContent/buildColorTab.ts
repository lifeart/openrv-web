/**
 * Builds the Color tab toolbar content.
 *
 * Includes OCIO, display pipeline, color controls, CDL, curves, wheels, LUT pipeline.
 */
import { ContextToolbar } from '../../ui/components/layout/ContextToolbar';
import { setButtonActive } from '../../ui/components/shared/Button';
import type { AppControlRegistry } from '../../AppControlRegistry';
import type { Viewer } from '../../ui/components/Viewer';

export interface BuildColorTabDeps {
  registry: AppControlRegistry;
  viewer: Viewer;
  addUnsubscriber: (unsub: () => void) => void;
}

export function buildColorTab(deps: BuildColorTabDeps): HTMLElement {
  const { registry, viewer, addUnsubscriber } = deps;

  const colorContent = document.createElement('div');
  colorContent.style.cssText = 'display: flex; align-items: center; gap: 6px;';
  colorContent.appendChild(registry.ocioControl.render());
  colorContent.appendChild(ContextToolbar.createDivider());
  // Display Pipeline: Display Profile, Gamut Mapping, Tone Mapping
  colorContent.appendChild(registry.displayProfileControl.render());
  colorContent.appendChild(registry.gamutMappingControl.render());
  colorContent.appendChild(registry.toneMappingControl.render());
  colorContent.appendChild(ContextToolbar.createDivider());
  colorContent.appendChild(registry.colorControls.render());
  colorContent.appendChild(ContextToolbar.createDivider());
  colorContent.appendChild(registry.cdlControl.render());
  colorContent.appendChild(ContextToolbar.createDivider());
  colorContent.appendChild(registry.colorInversionToggle.render());
  colorContent.appendChild(ContextToolbar.createDivider());
  colorContent.appendChild(registry.premultControl.render());
  colorContent.appendChild(ContextToolbar.createDivider());

  // Curves toggle button
  const curvesButton = ContextToolbar.createButton('Curves', () => {
    registry.curvesControl.toggle();
  }, { title: 'Toggle color curves panel (U)', icon: 'curves' });
  curvesButton.dataset.testid = 'curves-toggle-button';
  colorContent.appendChild(curvesButton);

  addUnsubscriber(registry.curvesControl.on('visibilityChanged', (visible) => {
    setButtonActive(curvesButton, visible, 'ghost');
  }));

  // Color Wheels toggle button
  const colorWheels = viewer.getColorWheels();
  const colorWheelsButton = ContextToolbar.createButton('Wheels', () => {
    colorWheels.toggle();
  }, { title: 'Toggle Lift/Gamma/Gain color wheels (Shift+Alt+W)', icon: 'palette' });
  colorWheelsButton.dataset.testid = 'color-wheels-toggle-button';
  colorContent.appendChild(colorWheelsButton);

  addUnsubscriber(colorWheels.on('visibilityChanged', (visible) => {
    setButtonActive(colorWheelsButton, visible, 'ghost');
  }));

  // LUT Pipeline toggle button
  const lutPipelineButton = ContextToolbar.createButton('LUT Graph', () => {
    registry.lutPipelinePanel.toggle();
  }, { title: 'Toggle LUT pipeline panel (Shift+L on Color tab)', icon: 'monitor' });
  lutPipelineButton.dataset.testid = 'lut-pipeline-toggle-button';
  colorContent.appendChild(lutPipelineButton);
  addUnsubscriber(registry.lutPipelinePanel.on('visibilityChanged', (visible) => {
    setButtonActive(lutPipelineButton, visible, 'ghost');
  }));

  return colorContent;
}
