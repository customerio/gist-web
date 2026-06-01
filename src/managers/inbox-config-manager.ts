import { fetchBrandingIfNeeded, getBranding } from './branding-manager';
import { fetchTemplatesIfNeeded, getTemplates } from './templates-manager';
import { initializeInboxComponent } from './inbox-component-manager';
import { settings } from '../services/settings';
import { log } from '../utilities/log';
import type { NetworkResponse } from '../services/network';

export async function ensureInboxDependencies(): Promise<void> {
  await Promise.all([fetchBrandingIfNeeded(), fetchTemplatesIfNeeded()]);
}

export async function initializeInboxFromCache(): Promise<void> {
  if (!settings.inboxEnabled()) return;

  if (!getBranding() || !getTemplates()) {
    log('Inbox enabled but missing cached branding/templates, fetching.');
    await ensureInboxDependencies();
  }

  initializeInboxComponent();
}

export async function processInboxConfig(response: NetworkResponse | undefined): Promise<void> {
  const headerValue = response?.headers?.['x-cio-inbox-enabled']?.toLowerCase();
  if (headerValue === undefined) return;

  const enabled = headerValue === 'true';
  settings.setInboxEnabledFlag(enabled);
  if (!enabled) return;

  log('Inbox enabled, ensuring branding and templates are cached.');
  await ensureInboxDependencies();
  initializeInboxComponent();
}

export function isInboxEnabled(): boolean {
  return settings.inboxEnabled();
}
