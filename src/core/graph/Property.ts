import { Signal } from './Signal';

export interface PropertyInfo<T> {
  name: string;
  defaultValue: T;
  min?: number;
  max?: number;
  step?: number;
  label?: string;
  group?: string;
}

export class Property<T> {
  readonly name: string;
  readonly defaultValue: T;
  readonly changed = new Signal<T>();

  private _value: T;

  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
  readonly label?: string;
  readonly group?: string;

  constructor(info: PropertyInfo<T>) {
    this.name = info.name;
    this.defaultValue = info.defaultValue;
    this._value = info.defaultValue;
    this.min = info.min;
    this.max = info.max;
    this.step = info.step;
    this.label = info.label ?? info.name;
    this.group = info.group;
  }

  get value(): T {
    return this._value;
  }

  set value(newValue: T) {
    if (this._value === newValue) return;

    // Clamp numeric values
    if (typeof newValue === 'number' && typeof this._value === 'number') {
      if (this.min !== undefined) newValue = Math.max(this.min, newValue as number) as T;
      if (this.max !== undefined) newValue = Math.min(this.max, newValue as number) as T;
    }

    const oldValue = this._value;
    this._value = newValue;
    this.changed.emit(newValue, oldValue);
  }

  reset(): void {
    this.value = this.defaultValue;
  }

  toJSON(): { name: string; value: T } {
    return {
      name: this.name,
      value: this._value,
    };
  }
}

export class PropertyContainer {
  private properties = new Map<string, Property<unknown>>();
  readonly propertyChanged = new Signal<{ name: string; value: unknown }>();

  add<T>(info: PropertyInfo<T>): Property<T> {
    const prop = new Property(info);
    this.properties.set(info.name, prop as Property<unknown>);

    prop.changed.connect((value, oldValue) => {
      this.propertyChanged.emit({ name: info.name, value }, { name: info.name, value: oldValue });
    });

    return prop;
  }

  get<T>(name: string): Property<T> | undefined {
    return this.properties.get(name) as Property<T> | undefined;
  }

  getValue<T>(name: string): T | undefined {
    return this.properties.get(name)?.value as T | undefined;
  }

  setValue<T>(name: string, value: T): void {
    const prop = this.properties.get(name);
    if (prop) {
      prop.value = value;
    }
  }

  has(name: string): boolean {
    return this.properties.has(name);
  }

  all(): IterableIterator<Property<unknown>> {
    return this.properties.values();
  }

  names(): IterableIterator<string> {
    return this.properties.keys();
  }

  resetAll(): void {
    for (const prop of this.properties.values()) {
      prop.reset();
    }
  }

  toJSON(): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [name, prop] of this.properties) {
      result[name] = prop.value;
    }
    return result;
  }

  fromJSON(data: Record<string, unknown>): void {
    for (const [name, value] of Object.entries(data)) {
      this.setValue(name, value);
    }
  }
}
