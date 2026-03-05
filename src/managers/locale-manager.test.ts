import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getUserLocale, setUserLocale } from './locale-manager';
import { setKeyToLocalStore, getKeyFromLocalStore } from '../utilities/local-storage';

vi.mock('../utilities/log', () => ({ log: vi.fn() }));
vi.mock('../utilities/local-storage', () => ({
  setKeyToLocalStore: vi.fn(),
  getKeyFromLocalStore: vi.fn(() => null),
}));

describe('locale-manager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('setUserLocale stores the locale', () => {
    setUserLocale('fr-FR');
    expect(setKeyToLocalStore).toHaveBeenCalledWith('gist.web.userLocale', 'fr-FR');
  });

  it('getUserLocale returns stored locale', () => {
    vi.mocked(getKeyFromLocalStore).mockReturnValue('de-DE');
    expect(getUserLocale()).toBe('de-DE');
  });

  it('getUserLocale falls back to navigator.language when nothing stored', () => {
    vi.mocked(getKeyFromLocalStore).mockReturnValue(null);
    Object.defineProperty(navigator, 'language', {
      value: 'en-GB',
      configurable: true,
    });
    expect(getUserLocale()).toBe('en-GB');
  });
});
