type EventCallback = (event: unknown) => void;

export default class EventEmitter {
  private callbacks: Record<string, EventCallback[]> = {};

  on(name: string, callback: EventCallback): void {
    const callbacks = this.callbacks[name];
    if (!callbacks) {
      this.callbacks[name] = [callback];
    } else {
      callbacks.push(callback);
    }
  }

  off(name: string, callback?: EventCallback): void {
    const callbacks = this.callbacks[name];
    if (!callbacks) return;

    if (!callback) {
      delete this.callbacks[name];
      return;
    }

    const index = callbacks.indexOf(callback);
    if (index !== -1) {
      callbacks.splice(index, 1);
    }

    if (callbacks.length === 0) {
      delete this.callbacks[name];
    }
  }

  dispatch(name: string, event: unknown): void {
    const callbacks = this.callbacks[name];
    if (callbacks) {
      callbacks.forEach((cb) => cb(event));
    }
  }
}
