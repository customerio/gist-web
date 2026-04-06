import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  setKeyToLocalStore,
  getKeyFromLocalStore,
  clearKeyFromLocalStore,
  clearExpiredFromLocalStore,
  shouldPersistSession,
  isSessionBeingPersisted,
} from './local-storage';

vi.mock('./log', () => ({ log: vi.fn() }));

describe('local-storage', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('setKeyToLocalStore / getKeyFromLocalStore round-trips a value', () => {
    shouldPersistSession(true);
    setKeyToLocalStore('gist.test-key', { foo: 'bar' });
    expect(getKeyFromLocalStore('gist.test-key')).toEqual({ foo: 'bar' });
  });

  it('getKeyFromLocalStore returns null for a missing key', () => {
    shouldPersistSession(true);
    expect(getKeyFromLocalStore('gist.nonexistent')).toBeNull();
  });

  it('getKeyFromLocalStore returns null for keys not starting with "gist."', () => {
    shouldPersistSession(true);
    setKeyToLocalStore('other.key', 'value');
    expect(getKeyFromLocalStore('other.key')).toBeNull();
    expect(getKeyFromLocalStore('nonexistent')).toBeNull();
  });

  it('expired keys return null and are removed from storage', () => {
    shouldPersistSession(true);
    const pastDate = new Date(Date.now() - 1000);
    setKeyToLocalStore('gist.expired-key', 'value', pastDate);
    expect(getKeyFromLocalStore('gist.expired-key')).toBeNull();
    expect(localStorage.getItem('gist.expired-key')).toBeNull();
  });

  it('clearKeyFromLocalStore removes a key', () => {
    shouldPersistSession(true);
    setKeyToLocalStore('gist.to-clear', 'value');
    expect(getKeyFromLocalStore('gist.to-clear')).toBe('value');
    clearKeyFromLocalStore('gist.to-clear');
    expect(getKeyFromLocalStore('gist.to-clear')).toBeNull();
  });

  it('clearExpiredFromLocalStore removes all expired keys, keeps non-expired', () => {
    shouldPersistSession(true);
    const pastDate = new Date(Date.now() - 1000);
    setKeyToLocalStore('gist.expired', 'old', pastDate);
    setKeyToLocalStore('gist.valid', 'new');
    clearExpiredFromLocalStore();
    expect(getKeyFromLocalStore('gist.expired')).toBeNull();
    expect(getKeyFromLocalStore('gist.valid')).toBe('new');
  });

  it('shouldPersistSession(false) causes storage to use sessionStorage', () => {
    shouldPersistSession(false);
    setKeyToLocalStore('gist.session-key', 'session-value');
    expect(getKeyFromLocalStore('gist.session-key')).toBe('session-value');
    expect(sessionStorage.length).toBeGreaterThan(0);
    expect(localStorage.getItem('gist.session-key')).toBeNull();
  });

  it('shouldPersistSession(true) causes storage to use localStorage', () => {
    shouldPersistSession(true);
    setKeyToLocalStore('gist.local-key', 'local-value');
    expect(getKeyFromLocalStore('gist.local-key')).toBe('local-value');
    expect(localStorage.getItem('gist.local-key')).not.toBeNull();
  });

  it('broadcast/user keys with expiry >60 minutes in the future are cleared', () => {
    shouldPersistSession(true);
    const twoHoursFromNow = new Date(Date.now() + 2 * 60 * 60 * 1000);
    setKeyToLocalStore('gist.web.message.broadcasts.abc123', 'value', twoHoursFromNow);
    expect(getKeyFromLocalStore('gist.web.message.broadcasts.abc123')).toBeNull();
  });

  it('isSessionBeingPersisted() returns true by default and reflects shouldPersistSession()', () => {
    expect(isSessionBeingPersisted()).toBe(true);
    shouldPersistSession(false);
    expect(isSessionBeingPersisted()).toBe(false);
    shouldPersistSession(true);
    expect(isSessionBeingPersisted()).toBe(true);
  });
});
