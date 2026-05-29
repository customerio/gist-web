import { fetchBrandingIfNeeded, getBranding } from './branding-manager';
import { fetchTemplatesIfNeeded, getTemplates } from './templates-manager';
import { initializeInboxComponent } from './inbox-component-manager';
import { settings } from '../services/settings';
import { log } from '../utilities/log';
import type { NetworkResponse } from '../services/network';

export function initializeInboxFromCache(): void {
  if (!settings.inboxEnabled()) return;
  if (!getBranding() || !getTemplates()) return;

  log('Inbox enabled with cached data, showing immediately.');
  initializeInboxComponent();
}

export async function processInboxConfig(response: NetworkResponse | undefined): Promise<void> {
  const enabled = response?.headers?.['x-cio-inbox-enabled']?.toLowerCase() === 'true';
  settings.setInboxEnabledFlag(enabled);
  if (!enabled) return;

  log('Inbox enabled, ensuring branding and templates are cached.');
  await Promise.all([fetchBrandingIfNeeded(), fetchTemplatesIfNeeded()]);
  initializeInboxComponent();
}

export function isInboxEnabled(): boolean {
  return settings.inboxEnabled();
}
