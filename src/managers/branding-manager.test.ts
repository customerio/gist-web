import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchBrandingIfNeeded, getBranding } from './branding-manager';
import { setKeyToLocalStore, getKeyFromLocalStore } from '../utilities/local-storage';
import { fetchBranding } from '../services/branding-service';

vi.mock('../utilities/log', () => ({ log: vi.fn() }));
vi.mock('../utilities/local-storage', () => ({
  setKeyToLocalStore: vi.fn(),
  getKeyFromLocalStore: vi.fn(() => null),
}));
vi.mock('../services/branding-service', () => ({
  fetchBranding: vi.fn(),
}));

describe('branding-manager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getKeyFromLocalStore).mockReturnValue(null);
    vi.mocked(fetchBranding).mockResolvedValue(undefined);
  });

  describe('fetchBrandingIfNeeded', () => {
    it('fetches and caches branding when cache is empty', async () => {
      vi.mocked(fetchBranding).mockResolvedValue({
        status: 200,
        data: { color: '#000' },
        headers: {},
      });

      await fetchBrandingIfNeeded();

      expect(fetchBranding).toHaveBeenCalled();
      expect(setKeyToLocalStore).toHaveBeenCalledWith(
        'gist.web.branding',
        { color: '#000' },
        expect.any(Date)
      );
    });

    it('sets TTL to 10 minutes', async () => {
      vi.mocked(fetchBranding).mockResolvedValue({ status: 200, data: {}, headers: {} });

      const before = Date.now();
      await fetchBrandingIfNeeded();

      const ttl = vi.mocked(setKeyToLocalStore).mock.calls[0][2] as Date;
      const ttlMs = ttl.getTime() - before;
      expect(ttlMs).toBeGreaterThanOrEqual(9 * 60 * 1000);
      expect(ttlMs).toBeLessThanOrEqual(11 * 60 * 1000);
    });

    it('skips fetch when cache already has branding', async () => {
      vi.mocked(getKeyFromLocalStore).mockReturnValue({ color: '#cached' });

      await fetchBrandingIfNeeded();

      expect(fetchBranding).not.toHaveBeenCalled();
      expect(setKeyToLocalStore).not.toHaveBeenCalled();
    });

    it('does not cache on non-2xx response', async () => {
      vi.mocked(fetchBranding).mockResolvedValue({ status: 500, data: 'error', headers: {} });

      await fetchBrandingIfNeeded();

      expect(setKeyToLocalStore).not.toHaveBeenCalled();
    });

    it('does not cache when fetch returns undefined', async () => {
      vi.mocked(fetchBranding).mockResolvedValue(undefined);

      await fetchBrandingIfNeeded();

      expect(setKeyToLocalStore).not.toHaveBeenCalled();
    });
  });

  describe('getBranding', () => {
    it('returns cached branding from local store', () => {
      vi.mocked(getKeyFromLocalStore).mockReturnValue({ color: '#000' });

      expect(getBranding()).toEqual({ color: '#000' });
      expect(getKeyFromLocalStore).toHaveBeenCalledWith('gist.web.branding');
    });

    it('returns null when no cached branding', () => {
      vi.mocked(getKeyFromLocalStore).mockReturnValue(null);

      expect(getBranding()).toBeNull();
    });
  });
});
