import { describe, it, expect, vi } from 'vitest';
import { IPNode } from './IPNode';
import type { EvalContext } from '../../core/graph/Graph';
import type { IPImage } from '../../core/image/Image';

// Concrete subclass for testing (IPNode is abstract)
class TestNode extends IPNode {
  constructor(name?: string) {
    super('TestNode', name);
  }

  protected process(_context: EvalContext, inputs: (IPImage | null)[]): IPImage | null {
    return inputs[0] ?? null;
  }
}

describe('IPNode', () => {
  describe('disposal', () => {
    it('IPNODE-DISP-001: after IPNode.dispose(), property change does not forward to IPNode.propertyChanged', () => {
      const node = new TestNode('disposeTest');

      // Add a property
      const prop = node.properties.add({ name: 'opacity', defaultValue: 1.0 });

      // Connect a listener to node.propertyChanged
      const listener = vi.fn();
      node.propertyChanged.connect(listener);

      // Verify the forwarding works before dispose
      prop.value = 0.5;
      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith({ name: 'opacity', value: 0.5 }, { name: 'opacity', value: 1.0 });

      // Dispose the node
      node.dispose();

      // Reset and change the property value
      listener.mockClear();
      prop.value = 0.75;

      // Listener should NOT have been called after dispose
      expect(listener).not.toHaveBeenCalled();
    });

    it('NODE-W4-06: propertyChanged forwards oldValue (not duplicated newValue) to subscribers', () => {
      const node = new TestNode('oldValueTest');
      const prop = node.properties.add({ name: 'gain', defaultValue: 1.0 });

      const listener = vi.fn();
      node.propertyChanged.connect(listener);

      // First change: 1.0 -> 2.5
      prop.value = 2.5;
      expect(listener).toHaveBeenCalledTimes(1);
      const [firstNew, firstOld] = listener.mock.calls[0]!;
      expect(firstNew).toEqual({ name: 'gain', value: 2.5 });
      expect(firstOld).toEqual({ name: 'gain', value: 1.0 });
      // Critical: ensure the oldValue object is NOT identical to newValue (the original bug)
      expect(firstOld).not.toBe(firstNew);
      expect((firstOld as { value: unknown }).value).not.toBe((firstNew as { value: unknown }).value);

      // Second change: 2.5 -> 3.0; oldValue should reflect 2.5, not 3.0
      prop.value = 3.0;
      expect(listener).toHaveBeenCalledTimes(2);
      const [secondNew, secondOld] = listener.mock.calls[1]!;
      expect(secondNew).toEqual({ name: 'gain', value: 3.0 });
      expect(secondOld).toEqual({ name: 'gain', value: 2.5 });

      node.dispose();
    });

    it('IPNODE-DISP-002: after dispose(), properties.propertyChanged has no connections (forwarding subscription removed)', () => {
      const node = new TestNode('disposeTest2');
      node.properties.add({ name: 'opacity', defaultValue: 1.0 });

      // Before dispose: forwarding subscription exists
      expect(node.properties.propertyChanged.hasConnections).toBe(true);

      node.dispose();

      // After dispose: forwarding subscription removed by properties.dispose()
      expect(node.properties.propertyChanged.hasConnections).toBe(false);
    });
  });
});
