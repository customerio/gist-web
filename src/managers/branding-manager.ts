import { getKeyFromLocalStore, setKeyToLocalStore } from '../utilities/local-storage';
import { fetchBranding } from '../services/branding-service';
import { log } from '../utilities/log';

const brandingLocalStoreName = 'gist.web.branding';
const brandingTTLInMinutes = 10;

export async function fetchBrandingIfNeeded(): Promise<void> {
  if (getKeyFromLocalStore(brandingLocalStoreName) !== null) {
    log('Branding already cached.');
    return;
  }

  const response = await fetchBranding();
  if (response && response.status >= 200 && response.status < 300) {
    const expiryDate = new Date();
    expiryDate.setMinutes(expiryDate.getMinutes() + brandingTTLInMinutes);
    setKeyToLocalStore(brandingLocalStoreName, response.data, expiryDate);
    log('Branding fetched and cached.');
  }
}

export function getBranding(): unknown {
  return getKeyFromLocalStore(brandingLocalStoreName);
}
