import type { IPNode, NodeConstructor } from './IPNode';

type NodeCreator = () => IPNode;

class NodeFactoryClass {
  private registry = new Map<string, NodeCreator>();

  register(type: string, creator: NodeCreator): void {
    this.registry.set(type, creator);
  }

  create(type: string): IPNode | null {
    const creator = this.registry.get(type);
    if (!creator) {
      console.warn(`Unknown node type: ${type}`);
      return null;
    }
    return creator();
  }

  getRegisteredTypes(): string[] {
    return Array.from(this.registry.keys());
  }

  isRegistered(type: string): boolean {
    return this.registry.has(type);
  }

  unregister(type: string): boolean {
    return this.registry.delete(type);
  }
}

export const NodeFactory = new NodeFactoryClass();

// Decorator for registering nodes
export function RegisterNode(type: string) {
  return function <T extends NodeConstructor>(constructor: T) {
    NodeFactory.register(type, () => new constructor());
    return constructor;
  };
}
