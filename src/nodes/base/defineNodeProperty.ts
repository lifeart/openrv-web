import type { PropertyInfo } from '../../core/graph/Property';
import type { IPNode } from './IPNode';

/**
 * Define a node property that combines PropertyContainer registration
 * with a typed getter/setter on the node instance.
 *
 * Must be called in the constructor AFTER super().
 */
export function defineNodeProperty<
  TNode extends IPNode,
  K extends string & keyof TNode,
>(
  node: TNode,
  name: K,
  info: Omit<PropertyInfo<TNode[K]>, 'name'>,
): void {
  node.properties.add({ ...info, name } as PropertyInfo<TNode[K]>);

  Object.defineProperty(node, name, {
    get(): TNode[K] {
      return node.properties.getValue(name) as TNode[K];
    },
    set(value: TNode[K]) {
      node.properties.setValue(name, value);
    },
    enumerable: true,
    configurable: true,
  });
}
