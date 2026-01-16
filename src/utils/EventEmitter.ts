type EventCallback<T = unknown> = (data: T) => void;

export interface EventMap {
  [event: string]: unknown;
}

export class EventEmitter<Events extends EventMap = EventMap> {
  private listeners = new Map<keyof Events, Set<EventCallback>>();

  on<K extends keyof Events>(event: K, callback: EventCallback<Events[K]>): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback as EventCallback);

    // Return unsubscribe function
    return () => this.off(event, callback);
  }

  off<K extends keyof Events>(event: K, callback: EventCallback<Events[K]>): void {
    this.listeners.get(event)?.delete(callback as EventCallback);
  }

  emit<K extends keyof Events>(event: K, data: Events[K]): void {
    this.listeners.get(event)?.forEach((callback) => {
      try {
        callback(data);
      } catch (err) {
        console.error(`Error in event listener for "${String(event)}":`, err);
      }
    });
  }

  once<K extends keyof Events>(event: K, callback: EventCallback<Events[K]>): () => void {
    const wrapper: EventCallback<Events[K]> = (data) => {
      this.off(event, wrapper);
      callback(data);
    };
    return this.on(event, wrapper);
  }

  removeAllListeners(event?: keyof Events): void {
    if (event) {
      this.listeners.delete(event);
    } else {
      this.listeners.clear();
    }
  }
}
