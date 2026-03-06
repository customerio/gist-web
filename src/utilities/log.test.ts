import { describe, it, expect, vi, beforeEach } from 'vitest';
import { log } from './log';
import Gist from '../gist';

vi.mock('../gist', () => ({
  default: { config: undefined as { logging?: boolean } | undefined },
}));

describe('log', () => {
  const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

  beforeEach(() => {
    consoleLogSpy.mockClear();
    (Gist as { config?: { logging?: boolean } }).config = undefined;
  });

  it('when Gist.config.logging is true, console.log is called with "Gist: <message>"', () => {
    Gist.config = { logging: true } as never;
    log('hello world');
    expect(consoleLogSpy).toHaveBeenCalledWith('Gist: hello world');
  });

  it('when Gist.config.logging is false, console.log is not called', () => {
    Gist.config = { logging: false } as never;
    log('hello world');
    expect(consoleLogSpy).not.toHaveBeenCalled();
  });

  it('when Gist.config is undefined, console.log is not called', () => {
    (Gist as { config?: { logging?: boolean } }).config = undefined;
    log('hello world');
    expect(consoleLogSpy).not.toHaveBeenCalled();
  });
});
