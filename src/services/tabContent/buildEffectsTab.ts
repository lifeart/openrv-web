/**
 * Builds the Effects tab toolbar content.
 *
 * Includes filter, lens, deinterlace, film emulation, perspective correction,
 * stabilization, noise reduction, watermark, and slate editor.
 */
import { ContextToolbar } from '../../ui/components/layout/ContextToolbar';
import { setButtonActive } from '../../ui/components/shared/Button';
import type { Panel } from '../../ui/components/shared/Panel';
import type { AppControlRegistry } from '../../AppControlRegistry';

export interface BuildEffectsTabDeps {
  registry: AppControlRegistry;
  noiseReductionPanel: Panel;
  watermarkPanel: Panel;
  slateEditorPanel: Panel;
}

export function buildEffectsTab(deps: BuildEffectsTabDeps): HTMLElement {
  const { registry, noiseReductionPanel, watermarkPanel, slateEditorPanel } = deps;

  const effectsContent = document.createElement('div');
  effectsContent.style.cssText = 'display: flex; align-items: center; gap: 6px;';
  effectsContent.appendChild(registry.filterControl.render());
  effectsContent.appendChild(ContextToolbar.createDivider());
  effectsContent.appendChild(registry.lensControl.render());
  effectsContent.appendChild(ContextToolbar.createDivider());
  effectsContent.appendChild(registry.deinterlaceControl.render());
  effectsContent.appendChild(ContextToolbar.createDivider());
  effectsContent.appendChild(registry.filmEmulationControl.render());
  effectsContent.appendChild(ContextToolbar.createDivider());
  effectsContent.appendChild(registry.perspectiveCorrectionControl.render());
  effectsContent.appendChild(ContextToolbar.createDivider());
  effectsContent.appendChild(registry.stabilizationControl.render());
  effectsContent.appendChild(ContextToolbar.createDivider());

  const noiseReductionButton = ContextToolbar.createButton('Denoise', () => {
    noiseReductionPanel.toggle(noiseReductionButton);
    setButtonActive(noiseReductionButton, noiseReductionPanel.isVisible(), 'ghost');
  }, { title: 'Toggle noise reduction panel', icon: 'filter' });
  noiseReductionButton.dataset.testid = 'noise-reduction-toggle-button';
  effectsContent.appendChild(noiseReductionButton);

  const watermarkButton = ContextToolbar.createButton('Watermark', () => {
    watermarkPanel.toggle(watermarkButton);
    setButtonActive(watermarkButton, watermarkPanel.isVisible(), 'ghost');
  }, { title: 'Toggle watermark panel', icon: 'image' });
  watermarkButton.dataset.testid = 'watermark-toggle-button';
  effectsContent.appendChild(watermarkButton);

  const slateButton = ContextToolbar.createButton('Slate', () => {
    slateEditorPanel.toggle(slateButton);
    setButtonActive(slateButton, slateEditorPanel.isVisible(), 'ghost');
  }, { title: 'Toggle slate/leader editor', icon: 'film' });
  slateButton.dataset.testid = 'slate-editor-toggle-button';
  effectsContent.appendChild(slateButton);

  return effectsContent;
}
