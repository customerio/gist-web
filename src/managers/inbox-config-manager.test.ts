import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  processInboxConfig,
  isInboxEnabled,
  initializeInboxFromCache,
} from './inbox-config-manager';
import { fetchBrandingIfNeeded, getBranding } from './branding-manager';
import { fetchTemplatesIfNeeded, getTemplates } from './templates-manager';
import { initializeInboxComponent } from './inbox-component-manager';
import { settings } from '../services/settings';
import type { NetworkResponse } from '../services/network';

vi.mock('../utilities/log', () => ({ log: vi.fn() }));
vi.mock('./branding-manager', () => ({
  fetchBrandingIfNeeded: vi.fn(() => Promise.resolve()),
  getBranding: vi.fn(() => null),
}));
vi.mock('./templates-manager', () => ({
  fetchTemplatesIfNeeded: vi.fn(() => Promise.resolve()),
  getTemplates: vi.fn(() => null),
}));
vi.mock('./inbox-component-manager', () => ({
  initializeInboxComponent: vi.fn(),
}));
vi.mock('../services/settings', () => ({
  settings: {
    inboxEnabled: vi.fn(() => false),
    setInboxEnabledFlag: vi.fn(),
  },
}));

function makeResponse(headers: Record<string, string> = {}): NetworkResponse {
  return { status: 200, data: {}, headers };
}

describe('inbox-config-manager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('processInboxConfig', () => {
    it('stores true via settings when header is "true"', async () => {
      await processInboxConfig(makeResponse({ 'x-cio-inbox-enabled': 'true' }));

      expect(settings.setInboxEnabledFlag).toHaveBeenCalledWith(true);
    });

    it('stores false via settings when header is "false"', async () => {
      await processInboxConfig(makeResponse({ 'x-cio-inbox-enabled': 'false' }));

      expect(settings.setInboxEnabledFlag).toHaveBeenCalledWith(false);
    });

    it('does not change flag when header is missing', async () => {
      await processInboxConfig(makeResponse());

      expect(settings.setInboxEnabledFlag).not.toHaveBeenCalled();
    });

    it('does not change flag when response is undefined', async () => {
      await processInboxConfig(undefined);

      expect(settings.setInboxEnabledFlag).not.toHaveBeenCalled();
    });

    it('handles case-insensitive header value', async () => {
      await processInboxConfig(makeResponse({ 'x-cio-inbox-enabled': 'True' }));

      expect(settings.setInboxEnabledFlag).toHaveBeenCalledWith(true);
    });

    it('fetches branding and templates when inbox is enabled', async () => {
      await processInboxConfig(makeResponse({ 'x-cio-inbox-enabled': 'true' }));

      expect(fetchBrandingIfNeeded).toHaveBeenCalled();
      expect(fetchTemplatesIfNeeded).toHaveBeenCalled();
    });

    it('initializes inbox component after fetching branding and templates', async () => {
      await processInboxConfig(makeResponse({ 'x-cio-inbox-enabled': 'true' }));

      expect(initializeInboxComponent).toHaveBeenCalled();
    });

    it('does not initialize inbox component when disabled', async () => {
      await processInboxConfig(makeResponse({ 'x-cio-inbox-enabled': 'false' }));

      expect(initializeInboxComponent).not.toHaveBeenCalled();
    });

    it('does not fetch when inbox is disabled', async () => {
      await processInboxConfig(makeResponse({ 'x-cio-inbox-enabled': 'false' }));

      expect(fetchBrandingIfNeeded).not.toHaveBeenCalled();
      expect(fetchTemplatesIfNeeded).not.toHaveBeenCalled();
    });

    it('does not fetch when response is undefined', async () => {
      await processInboxConfig(undefined);

      expect(fetchBrandingIfNeeded).not.toHaveBeenCalled();
      expect(fetchTemplatesIfNeeded).not.toHaveBeenCalled();
    });
  });

  describe('initializeInboxFromCache', () => {
    it('initializes inbox immediately when enabled flag and cached data are present', async () => {
      vi.mocked(settings.inboxEnabled).mockReturnValue(true);
      vi.mocked(getBranding).mockReturnValue({ theme: {}, patterns: { inbox: {} } } as never);
      vi.mocked(getTemplates).mockReturnValue({ basic: {} });

      await initializeInboxFromCache();

      expect(initializeInboxComponent).toHaveBeenCalled();
      expect(fetchBrandingIfNeeded).not.toHaveBeenCalled();
      expect(fetchTemplatesIfNeeded).not.toHaveBeenCalled();
    });

    it('does not initialize when inbox is not enabled', async () => {
      vi.mocked(settings.inboxEnabled).mockReturnValue(false);

      await initializeInboxFromCache();

      expect(initializeInboxComponent).not.toHaveBeenCalled();
      expect(fetchBrandingIfNeeded).not.toHaveBeenCalled();
    });

    it('fetches branding and templates when not cached then initializes', async () => {
      vi.mocked(settings.inboxEnabled).mockReturnValue(true);
      vi.mocked(getBranding).mockReturnValue(null);
      vi.mocked(getTemplates).mockReturnValue(null);

      await initializeInboxFromCache();

      expect(fetchBrandingIfNeeded).toHaveBeenCalled();
      expect(fetchTemplatesIfNeeded).toHaveBeenCalled();
      expect(initializeInboxComponent).toHaveBeenCalled();
    });

    it('fetches when only branding is missing', async () => {
      vi.mocked(settings.inboxEnabled).mockReturnValue(true);
      vi.mocked(getBranding).mockReturnValue(null);
      vi.mocked(getTemplates).mockReturnValue({ basic: {} });

      await initializeInboxFromCache();

      expect(fetchBrandingIfNeeded).toHaveBeenCalled();
      expect(initializeInboxComponent).toHaveBeenCalled();
    });
  });

  describe('isInboxEnabled', () => {
    it('delegates to settings.inboxEnabled', () => {
      vi.mocked(settings.inboxEnabled).mockReturnValue(true);

      expect(isInboxEnabled()).toBe(true);
      expect(settings.inboxEnabled).toHaveBeenCalled();
    });

    it('returns false when settings returns false', () => {
      vi.mocked(settings.inboxEnabled).mockReturnValue(false);

      expect(isInboxEnabled()).toBe(false);
    });
  });
});
