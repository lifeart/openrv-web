import { Signal } from './Signal';

/**
 * Interpolation mode for keyframes.
 */
export type KeyframeInterpolation = 'linear' | 'step' | 'smooth';

/**
 * A keyframe defining a value at a specific frame with an interpolation mode.
 */
export interface Keyframe {
  /** The frame number at which this keyframe value is set */
  frame: number;
  /** The numeric value at this keyframe */
  value: number;
  /** How to interpolate between this keyframe and the next */
  interpolation: KeyframeInterpolation;
}

export interface PropertyInfo<T> {
  name: string;
  defaultValue: T;
  min?: number;
  max?: number;
  step?: number;
  label?: string;
  group?: string;
  /** Whether the property should be saved in session (defaults to false) */
  persistent?: boolean;
  /** Whether the property supports keyframe animation (defaults to false) */
  animatable?: boolean;
}

export class Property<T> {
  readonly name: string;
  readonly defaultValue: T;
  readonly changed = new Signal<T>();

  private _value: T;
  private _keyframes: Keyframe[] = [];

  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
  readonly label?: string;
  readonly group?: string;
  readonly persistent: boolean;
  readonly animatable: boolean;

  constructor(info: PropertyInfo<T>) {
    this.name = info.name;
    this.defaultValue = info.defaultValue;
    this._value = info.defaultValue;
    this.min = info.min;
    this.max = info.max;
    this.step = info.step;
    this.label = info.label ?? info.name;
    this.group = info.group;
    this.persistent = info.persistent ?? false;
    this.animatable = info.animatable ?? false;
  }

  get value(): T {
    return this._value;
  }

  set value(newValue: T) {
    // Clamp numeric values before equality check
    if (typeof newValue === 'number') {
      if (this.min !== undefined) newValue = Math.max(this.min, newValue as number) as T;
      if (this.max !== undefined) newValue = Math.min(this.max, newValue as number) as T;
    }

    if (this._value === newValue) return;

    const oldValue = this._value;
    this._value = newValue;
    this.changed.emit(newValue, oldValue);
  }

  reset(): void {
    this.value = this.defaultValue;
  }

  // --- Keyframe Animation API ---

  /**
   * Get all keyframes for this property.
   * Returns an empty array if not animatable or no keyframes set.
   */
  get keyframes(): readonly Keyframe[] {
    return this._keyframes;
  }

  /**
   * Add a keyframe. If a keyframe already exists at the same frame, it is replaced.
   * Throws if the property is not animatable.
   */
  addKeyframe(keyframe: Keyframe): void {
    if (!this.animatable) {
      throw new Error(`Property "${this.name}" is not animatable`);
    }

    // Remove existing keyframe at the same frame
    this._keyframes = this._keyframes.filter(kf => kf.frame !== keyframe.frame);

    // Insert in sorted order by frame
    const insertIdx = this._keyframes.findIndex(kf => kf.frame > keyframe.frame);
    if (insertIdx === -1) {
      this._keyframes.push(keyframe);
    } else {
      this._keyframes.splice(insertIdx, 0, keyframe);
    }
  }

  /**
   * Remove a keyframe at a specific frame.
   * Returns true if a keyframe was removed.
   */
  removeKeyframe(frame: number): boolean {
    const len = this._keyframes.length;
    this._keyframes = this._keyframes.filter(kf => kf.frame !== frame);
    return this._keyframes.length < len;
  }

  /**
   * Remove all keyframes.
   */
  clearKeyframes(): void {
    this._keyframes = [];
  }

  /**
   * Check if this property has any keyframes.
   */
  hasKeyframes(): boolean {
    return this._keyframes.length > 0;
  }

  /**
   * Get the animated value at a specific frame by interpolating between keyframes.
   * Returns the static value if not animatable or if no keyframes exist.
   *
   * For numeric properties only.
   */
  getAnimatedValue(frame: number): number {
    if (!this.animatable || this._keyframes.length === 0) {
      return this._value as number;
    }

    const keyframes = this._keyframes;

    // Before first keyframe: return first keyframe value
    if (frame <= keyframes[0]!.frame) {
      return keyframes[0]!.value;
    }

    // After last keyframe: return last keyframe value
    if (frame >= keyframes[keyframes.length - 1]!.frame) {
      return keyframes[keyframes.length - 1]!.value;
    }

    // Find the surrounding keyframes
    let prevKf = keyframes[0]!;
    let nextKf = keyframes[1]!;

    for (let i = 0; i < keyframes.length - 1; i++) {
      if (frame >= keyframes[i]!.frame && frame <= keyframes[i + 1]!.frame) {
        prevKf = keyframes[i]!;
        nextKf = keyframes[i + 1]!;
        break;
      }
    }

    // Interpolate based on the previous keyframe's interpolation mode
    return interpolateKeyframes(prevKf, nextKf, frame);
  }

  toJSON(): { name: string; value: T; persistent?: boolean; animatable?: boolean; keyframes?: Keyframe[] } {
    const result: { name: string; value: T; persistent?: boolean; animatable?: boolean; keyframes?: Keyframe[] } = {
      name: this.name,
      value: this._value,
    };

    if (this.persistent) {
      result.persistent = true;
    }
    if (this.animatable) {
      result.animatable = true;
      if (this._keyframes.length > 0) {
        result.keyframes = [...this._keyframes];
      }
    }

    return result;
  }
}

/**
 * Interpolate between two keyframes at a given frame.
 */
export function interpolateKeyframes(prev: Keyframe, next: Keyframe, frame: number): number {
  const duration = next.frame - prev.frame;
  if (duration === 0) return prev.value;

  const t = (frame - prev.frame) / duration;

  switch (prev.interpolation) {
    case 'step':
      // Step: hold the previous value until the next keyframe
      return prev.value;

    case 'linear':
      // Linear: straight interpolation
      return prev.value + (next.value - prev.value) * t;

    case 'smooth': {
      // Smooth: Hermite / smoothstep interpolation
      const s = t * t * (3 - 2 * t);
      return prev.value + (next.value - prev.value) * s;
    }

    default:
      return prev.value + (next.value - prev.value) * t;
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

  /**
   * Serialize only persistent properties for session saving.
   */
  toPersistentJSON(): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [name, prop] of this.properties) {
      if (prop.persistent) {
        result[name] = prop.value;
      }
    }
    return result;
  }

  /**
   * Get all animatable properties.
   */
  getAnimatableProperties(): Property<unknown>[] {
    const result: Property<unknown>[] = [];
    for (const prop of this.properties.values()) {
      if (prop.animatable) {
        result.push(prop);
      }
    }
    return result;
  }

  /**
   * Get all persistent properties.
   */
  getPersistentProperties(): Property<unknown>[] {
    const result: Property<unknown>[] = [];
    for (const prop of this.properties.values()) {
      if (prop.persistent) {
        result.push(prop);
      }
    }
    return result;
  }

  fromJSON(data: Record<string, unknown>): void {
    for (const [name, value] of Object.entries(data)) {
      this.setValue(name, value);
    }
  }
}
