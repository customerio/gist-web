import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchTemplatesIfNeeded, getTemplates } from './templates-manager';
import { setKeyToLocalStore, getKeyFromLocalStore } from '../utilities/local-storage';
import { fetchTemplates } from '../services/templates-service';

vi.mock('../utilities/log', () => ({ log: vi.fn() }));
vi.mock('../utilities/local-storage', () => ({
  setKeyToLocalStore: vi.fn(),
  getKeyFromLocalStore: vi.fn(() => null),
}));
vi.mock('../services/templates-service', () => ({
  fetchTemplates: vi.fn(),
}));

describe('templates-manager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getKeyFromLocalStore).mockReturnValue(null);
    vi.mocked(fetchTemplates).mockResolvedValue(undefined);
  });

  describe('fetchTemplatesIfNeeded', () => {
    it('fetches and caches templates when cache is empty', async () => {
      vi.mocked(fetchTemplates).mockResolvedValue({
        status: 200,
        data: [{ id: 't1' }],
        headers: {},
      });

      await fetchTemplatesIfNeeded();

      expect(fetchTemplates).toHaveBeenCalled();
      expect(setKeyToLocalStore).toHaveBeenCalledWith(
        'gist.web.templates',
        [{ id: 't1' }],
        expect.any(Date)
      );
    });

    it('sets TTL to 1 hour', async () => {
      vi.mocked(fetchTemplates).mockResolvedValue({ status: 200, data: [], headers: {} });

      const before = Date.now();
      await fetchTemplatesIfNeeded();

      const ttl = vi.mocked(setKeyToLocalStore).mock.calls[0][2] as Date;
      const ttlMs = ttl.getTime() - before;
      expect(ttlMs).toBeGreaterThanOrEqual(59 * 60 * 1000);
      expect(ttlMs).toBeLessThanOrEqual(61 * 60 * 1000);
    });

    it('skips fetch when cache already has templates', async () => {
      vi.mocked(getKeyFromLocalStore).mockReturnValue([{ id: 'cached' }]);

      await fetchTemplatesIfNeeded();

      expect(fetchTemplates).not.toHaveBeenCalled();
      expect(setKeyToLocalStore).not.toHaveBeenCalled();
    });

    it('does not cache on non-2xx response', async () => {
      vi.mocked(fetchTemplates).mockResolvedValue({ status: 404, data: 'error', headers: {} });

      await fetchTemplatesIfNeeded();

      expect(setKeyToLocalStore).not.toHaveBeenCalled();
    });

    it('does not cache when fetch returns undefined', async () => {
      vi.mocked(fetchTemplates).mockResolvedValue(undefined);

      await fetchTemplatesIfNeeded();

      expect(setKeyToLocalStore).not.toHaveBeenCalled();
    });
  });

  describe('getTemplates', () => {
    it('returns cached templates from local store', () => {
      vi.mocked(getKeyFromLocalStore).mockReturnValue([{ id: 't1' }]);

      expect(getTemplates()).toEqual([{ id: 't1' }]);
      expect(getKeyFromLocalStore).toHaveBeenCalledWith('gist.web.templates');
    });

    it('returns null when no cached templates', () => {
      vi.mocked(getKeyFromLocalStore).mockReturnValue(null);

      expect(getTemplates()).toBeNull();
    });
  });
});
