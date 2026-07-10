import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('./gist', () => ({
  default: class MockGist {},
}));
vi.mock('./utilities/debug-mode', () => ({
  setupDebugOverlay: vi.fn(),
}));

type LoadedWindow = typeof window & { __gistWebLoaded?: boolean; Gist?: unknown };

// The entry's behavior lives in its module body, so every test re-evaluates
// it via vi.resetModules() + a dynamic import, with window state arranged
// beforehand. Mocked modules are re-imported inside each test so assertions
// target the same instances the entry saw.
describe('index (SDK entry)', () => {
  const w = window as LoadedWindow;
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    delete w.__gistWebLoaded;
    delete w.Gist;
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  describe('first load', () => {
    it('marks the window, sets up the debug overlay, and does not warn', async () => {
      await import('./index');
      const { setupDebugOverlay } = await import('./utilities/debug-mode');

      expect(w.__gistWebLoaded).toBe(true);
      expect(setupDebugOverlay).toHaveBeenCalledTimes(1);
      expect(warnSpy).not.toHaveBeenCalled();
    });

    it('exports its own Gist class', async () => {
      const entry = await import('./index');
      const gistModule = await import('./gist');

      expect(entry.default).toBe(gistModule.default);
    });
  });

  describe('duplicate load', () => {
    it('warns that the SDK is already loaded', async () => {
      w.__gistWebLoaded = true;

      await import('./index');

      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('loaded more than once'));
    });

    it('does not set up the debug overlay again', async () => {
      w.__gistWebLoaded = true;

      await import('./index');
      const { setupDebugOverlay } = await import('./utilities/debug-mode');

      expect(setupDebugOverlay).not.toHaveBeenCalled();
    });

    it('yields to the already-loaded instance instead of exporting a fresh class', async () => {
      const firstInstance = class FirstLoadedGist {};
      w.__gistWebLoaded = true;
      w.Gist = firstInstance;

      const entry = await import('./index');

      expect(entry.default).toBe(firstInstance);
    });

    it('falls back to its own class when no prior instance is on the window', async () => {
      // e.g. an npm-bundled copy loaded first and never set the UMD global
      w.__gistWebLoaded = true;

      const entry = await import('./index');
      const gistModule = await import('./gist');

      expect(entry.default).toBe(gistModule.default);
    });
  });
});
