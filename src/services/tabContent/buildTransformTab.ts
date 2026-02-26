/**
 * Builds the Transform tab toolbar content.
 */
import { ContextToolbar } from '../../ui/components/layout/ContextToolbar';
import type { AppControlRegistry } from '../../AppControlRegistry';

export function buildTransformTab(registry: AppControlRegistry): HTMLElement {
  const transformContent = document.createElement('div');
  transformContent.style.cssText = 'display: flex; align-items: center; gap: 6px;';
  transformContent.appendChild(registry.transformControl.render());
  transformContent.appendChild(ContextToolbar.createDivider());
  transformContent.appendChild(registry.cropControl.render());
  return transformContent;
}
