import { describe, it, expect, vi, beforeEach } from 'vitest';
import { processInboxConfig, isInboxEnabled } from './inbox-config-manager';
import { fetchBrandingIfNeeded } from './branding-manager';
import { fetchTemplatesIfNeeded } from './templates-manager';
import { settings } from '../services/settings';
import type { NetworkResponse } from '../services/network';

vi.mock('../utilities/log', () => ({ log: vi.fn() }));
vi.mock('./branding-manager', () => ({
  fetchBrandingIfNeeded: vi.fn(() => Promise.resolve()),
}));
vi.mock('./templates-manager', () => ({
  fetchTemplatesIfNeeded: vi.fn(() => Promise.resolve()),
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

    it('stores false when header is missing', async () => {
      await processInboxConfig(makeResponse());

      expect(settings.setInboxEnabledFlag).toHaveBeenCalledWith(false);
    });

    it('stores false when response is undefined', async () => {
      await processInboxConfig(undefined);

      expect(settings.setInboxEnabledFlag).toHaveBeenCalledWith(false);
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
