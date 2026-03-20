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
  addUnsubscriber: (unsub: () => void) => void;
}

export function buildEffectsTab(deps: BuildEffectsTabDeps): HTMLElement {
  const { registry, noiseReductionPanel, watermarkPanel, slateEditorPanel, addUnsubscriber } = deps;

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

  const noiseReductionButton = ContextToolbar.createButton(
    'Denoise',
    () => {
      noiseReductionPanel.toggle(noiseReductionButton);
    },
    { title: 'Toggle noise reduction panel', icon: 'filter' },
  );
  noiseReductionButton.dataset.testid = 'noise-reduction-toggle-button';
  addUnsubscriber(
    noiseReductionPanel.onVisibilityChange((visible) => {
      setButtonActive(noiseReductionButton, visible, 'ghost');
    }),
  );
  effectsContent.appendChild(noiseReductionButton);

  const watermarkButton = ContextToolbar.createButton(
    'Watermark',
    () => {
      watermarkPanel.toggle(watermarkButton);
    },
    { title: 'Toggle watermark panel', icon: 'image' },
  );
  watermarkButton.dataset.testid = 'watermark-toggle-button';
  addUnsubscriber(
    watermarkPanel.onVisibilityChange((visible) => {
      setButtonActive(watermarkButton, visible, 'ghost');
    }),
  );
  effectsContent.appendChild(watermarkButton);

  const slateButton = ContextToolbar.createButton(
    'Slate',
    () => {
      slateEditorPanel.toggle(slateButton);
    },
    { title: 'Toggle slate/leader editor', icon: 'film' },
  );
  slateButton.dataset.testid = 'slate-editor-toggle-button';
  addUnsubscriber(
    slateEditorPanel.onVisibilityChange((visible) => {
      setButtonActive(slateButton, visible, 'ghost');
    }),
  );
  effectsContent.appendChild(slateButton);

  return effectsContent;
}
