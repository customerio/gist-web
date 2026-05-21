import { getKeyFromLocalStore, setKeyToLocalStore } from '../utilities/local-storage';
import { fetchTemplates } from '../services/templates-service';
import { log } from '../utilities/log';

const templatesLocalStoreName = 'gist.web.templates';
const templatesTTLInMinutes = 60;

export async function fetchTemplatesIfNeeded(): Promise<void> {
  if (getKeyFromLocalStore(templatesLocalStoreName) !== null) {
    log('Templates already cached.');
    return;
  }

  const response = await fetchTemplates();
  if (response && response.status >= 200 && response.status < 300) {
    const expiryDate = new Date();
    expiryDate.setMinutes(expiryDate.getMinutes() + templatesTTLInMinutes);
    setKeyToLocalStore(templatesLocalStoreName, response.data, expiryDate);
    log('Templates fetched and cached.');
  }
}

export function getTemplates(): unknown {
  return getKeyFromLocalStore(templatesLocalStoreName);
}
