import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  setCustomAttribute,
  getCustomAttribute,
  getAllCustomAttributes,
  removeCustomAttribute,
  clearCustomAttributes,
} from './custom-attribute-manager';
import { setKeyToLocalStore, clearKeyFromLocalStore } from '../utilities/local-storage';

vi.mock('../utilities/log', () => ({ log: vi.fn() }));
vi.mock('../utilities/local-storage', () => ({
  setKeyToLocalStore: vi.fn(),
  getKeyFromLocalStore: vi.fn(() => null),
  clearKeyFromLocalStore: vi.fn(),
  STORAGE_KEYS: {
    customAttributes: 'gist.web.customAttributes',
  },
}));

describe('custom-attribute-manager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearCustomAttributes();
  });

  it('setCustomAttribute stores a key-value pair and returns true', () => {
    const result = setCustomAttribute('plan', 'pro');
    expect(result).toBe(true);
    expect(getCustomAttribute('plan')).toBe('pro');
    expect(setKeyToLocalStore).toHaveBeenCalled();
  });

  it('setCustomAttribute returns false for invalid keys (null, empty string, non-string)', () => {
    expect(setCustomAttribute(null as unknown as string, 'value')).toBe(false);
    expect(setCustomAttribute('', 'value')).toBe(false);
    expect(setCustomAttribute(123 as unknown as string, 'value')).toBe(false);
    expect(setKeyToLocalStore).not.toHaveBeenCalled();
  });

  it('getCustomAttribute retrieves a stored value', () => {
    setCustomAttribute('role', 'admin');
    expect(getCustomAttribute('role')).toBe('admin');
  });

  it('getCustomAttribute returns null for missing key', () => {
    expect(getCustomAttribute('nonexistent')).toBe(null);
  });

  it('getAllCustomAttributes returns a copy (not the internal map)', () => {
    setCustomAttribute('a', 1);
    const copy = getAllCustomAttributes();
    copy.set('b', 2);
    expect(getCustomAttribute('b')).toBe(null);
  });

  it('removeCustomAttribute returns true if key existed, false otherwise', () => {
    setCustomAttribute('temp', 'value');
    expect(removeCustomAttribute('temp')).toBe(true);
    expect(removeCustomAttribute('temp')).toBe(false);
    expect(removeCustomAttribute('never-existed')).toBe(false);
  });

  it('clearCustomAttributes removes all attributes from memory and storage', () => {
    setCustomAttribute('x', 1);
    setCustomAttribute('y', 2);
    clearCustomAttributes();
    expect(getCustomAttribute('x')).toBe(null);
    expect(getCustomAttribute('y')).toBe(null);
    expect(clearKeyFromLocalStore).toHaveBeenCalled();
  });
});
