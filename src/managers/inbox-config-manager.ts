import { fetchBrandingIfNeeded } from './branding-manager';
import { fetchTemplatesIfNeeded } from './templates-manager';
import { settings } from '../services/settings';
import { log } from '../utilities/log';
import type { NetworkResponse } from '../services/network';

export async function processInboxConfig(response: NetworkResponse | undefined): Promise<void> {
  const enabled = response?.headers?.['x-cio-inbox-enabled']?.toLowerCase() === 'true';
  settings.setInboxEnabledFlag(enabled);
  if (!enabled) return;

  log('Inbox enabled, ensuring branding and templates are cached.');
  await Promise.all([fetchBrandingIfNeeded(), fetchTemplatesIfNeeded()]);
}

export function isInboxEnabled(): boolean {
  return settings.inboxEnabled();
}
