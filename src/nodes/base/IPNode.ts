import { PropertyContainer } from '../../core/graph/Property';
import { Signal } from '../../core/graph/Signal';
import { IPImage } from '../../core/image/Image';
import type { EvalContext } from '../../core/graph/Graph';

let nodeIdCounter = 0;

export abstract class IPNode {
  readonly id: string;
  readonly type: string;
  readonly properties: PropertyContainer;

  private _inputs: IPNode[] = [];
  private _outputs: IPNode[] = [];
  private _name: string;

  readonly inputsChanged = new Signal<IPNode[]>();
  readonly outputsChanged = new Signal<IPNode[]>();
  readonly propertyChanged = new Signal<{ name: string; value: unknown }>();

  // Cached evaluation result
  protected cachedImage: IPImage | null = null;
  protected cacheFrame = -1;
  protected dirty = true;

  constructor(type: string, name?: string) {
    this.id = `${type}_${++nodeIdCounter}`;
    this.type = type;
    this._name = name ?? this.id;
    this.properties = new PropertyContainer();

    // Forward property changes
    this.properties.propertyChanged.connect((data) => {
      this.markDirty();
      this.propertyChanged.emit(data, data);
    });
  }

  get name(): string {
    return this._name;
  }

  set name(value: string) {
    this._name = value;
  }

  get inputs(): readonly IPNode[] {
    return this._inputs;
  }

  get outputs(): readonly IPNode[] {
    return this._outputs;
  }

  // Input management
  connectInput(node: IPNode): void {
    if (this._inputs.includes(node)) return;

    this._inputs.push(node);
    node._outputs.push(this);

    this.markDirty();
    this.inputsChanged.emit([...this._inputs], this._inputs);
    node.outputsChanged.emit([...node._outputs], node._outputs);
  }

  disconnectInput(node: IPNode): void {
    const idx = this._inputs.indexOf(node);
    if (idx === -1) return;

    this._inputs.splice(idx, 1);
    const outIdx = node._outputs.indexOf(this);
    if (outIdx !== -1) {
      node._outputs.splice(outIdx, 1);
    }

    this.markDirty();
    this.inputsChanged.emit([...this._inputs], this._inputs);
    node.outputsChanged.emit([...node._outputs], node._outputs);
  }

  disconnectAllInputs(): void {
    for (const input of [...this._inputs]) {
      this.disconnectInput(input);
    }
  }

  // Get a specific input by index
  getInput(index: number): IPNode | undefined {
    return this._inputs[index];
  }

  // Number of inputs
  get inputCount(): number {
    return this._inputs.length;
  }

  // Mark node as needing re-evaluation
  markDirty(): void {
    this.dirty = true;
    // Notify outputs they might be dirty too
    for (const output of this._outputs) {
      output.markDirty();
    }
  }

  // Clear dirty flag (usually after successful evaluation)
  clearDirty(): void {
    this.dirty = false;
  }

  get isDirty(): boolean {
    return this.dirty;
  }

  // Evaluate the node
  evaluate(context: EvalContext): IPImage | null {
    // Check cache
    if (!this.dirty && this.cacheFrame === context.frame && this.cachedImage) {
      return this.cachedImage;
    }

    // Evaluate inputs first
    const inputImages: (IPImage | null)[] = [];
    for (const input of this._inputs) {
      inputImages.push(input.evaluate(context));
    }

    // Perform node-specific evaluation
    this.cachedImage = this.process(context, inputImages);
    this.cacheFrame = context.frame;
    this.dirty = false;

    return this.cachedImage;
  }

  // Abstract method for node-specific processing
  protected abstract process(context: EvalContext, inputs: (IPImage | null)[]): IPImage | null;

  // Cleanup
  dispose(): void {
    this.disconnectAllInputs();
    this.inputsChanged.disconnectAll();
    this.outputsChanged.disconnectAll();
    this.propertyChanged.disconnectAll();
    this.cachedImage = null;
  }
}

// Utility type for node constructor
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type NodeConstructor<T extends IPNode = IPNode> = new (...args: any[]) => T;
