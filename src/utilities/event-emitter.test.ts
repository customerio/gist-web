import { describe, it, expect, vi } from 'vitest';
import EventEmitter from './event-emitter';

describe('EventEmitter', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

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

  it('a throwing callback does not prevent other callbacks from firing', () => {
    const emitter = new EventEmitter();
    const cb1 = vi.fn(() => {
      throw new Error('cb1 exploded');
    });
    const cb2 = vi.fn();
    emitter.on('test', cb1);
    emitter.on('test', cb2);

    vi.spyOn(console, 'warn').mockImplementation(() => {});
    emitter.dispatch('test', 'event');

    expect(cb2).toHaveBeenCalledWith('event');
  });

  it('multiple throwing callbacks each log a warning and do not break the chain', () => {
    const emitter = new EventEmitter();
    const error1 = new Error('first');
    const error2 = new Error('second');
    const cb1 = vi.fn(() => {
      throw error1;
    });
    const cb2 = vi.fn(() => {
      throw error2;
    });
    const cb3 = vi.fn();
    emitter.on('test', cb1);
    emitter.on('test', cb2);
    emitter.on('test', cb3);

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    emitter.dispatch('test', 'event');

    expect(cb3).toHaveBeenCalledWith('event');
    expect(warnSpy).toHaveBeenCalledTimes(2);
    expect(warnSpy).toHaveBeenCalledWith('[Gist] Error in "test" event listener:', error1);
    expect(warnSpy).toHaveBeenCalledWith('[Gist] Error in "test" event listener:', error2);
  });

  it('a throwing callback logs a warning to console', () => {
    const emitter = new EventEmitter();
    const error = new Error('listener failed');
    emitter.on('test', () => {
      throw error;
    });

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    emitter.dispatch('test', 'event');

    expect(warnSpy).toHaveBeenCalledWith('[Gist] Error in "test" event listener:', error);
  });

  it('dispatch iterates over a snapshot so removing a listener during dispatch is safe', () => {
    const emitter = new EventEmitter();
    const cb1 = vi.fn(() => {
      emitter.off('test', cb2);
    });
    const cb2 = vi.fn();
    emitter.on('test', cb1);
    emitter.on('test', cb2);

    emitter.dispatch('test', 'event');

    expect(cb1).toHaveBeenCalledWith('event');
    expect(cb2).toHaveBeenCalledWith('event');
  });
});
