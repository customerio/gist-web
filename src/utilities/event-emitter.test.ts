import { describe, it, expect, vi } from 'vitest';
import EventEmitter from './event-emitter';

describe('EventEmitter', () => {
  it('on() registers a callback and dispatch() calls it with the event', () => {
    const emitter = new EventEmitter();
    const callback = vi.fn();
    emitter.on('test', callback);
    emitter.dispatch('test', { foo: 'bar' });
    expect(callback).toHaveBeenCalledOnce();
    expect(callback).toHaveBeenCalledWith({ foo: 'bar' });
  });

  it('multiple callbacks on the same event are all called', () => {
    const emitter = new EventEmitter();
    const cb1 = vi.fn();
    const cb2 = vi.fn();
    emitter.on('test', cb1);
    emitter.on('test', cb2);
    emitter.dispatch('test', 'event');
    expect(cb1).toHaveBeenCalledWith('event');
    expect(cb2).toHaveBeenCalledWith('event');
  });

  it('off() with a specific callback removes only that callback', () => {
    const emitter = new EventEmitter();
    const cb1 = vi.fn();
    const cb2 = vi.fn();
    emitter.on('test', cb1);
    emitter.on('test', cb2);
    emitter.off('test', cb1);
    emitter.dispatch('test', 'event');
    expect(cb1).not.toHaveBeenCalled();
    expect(cb2).toHaveBeenCalledWith('event');
  });

  it('off() without a callback removes all listeners for that event', () => {
    const emitter = new EventEmitter();
    const cb1 = vi.fn();
    const cb2 = vi.fn();
    emitter.on('test', cb1);
    emitter.on('test', cb2);
    emitter.off('test');
    emitter.dispatch('test', 'event');
    expect(cb1).not.toHaveBeenCalled();
    expect(cb2).not.toHaveBeenCalled();
  });

  it('dispatch() on an event with no listeners does nothing (no error)', () => {
    const emitter = new EventEmitter();
    expect(() => emitter.dispatch('nonexistent', 'event')).not.toThrow();
  });
});
