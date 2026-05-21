import { UserNetworkInstance, getNetworkErrorResponse } from './network';
import type { NetworkResponse } from './network';

export async function fetchBranding(): Promise<NetworkResponse | undefined> {
  try {
    return await UserNetworkInstance()('/api/v1/branding');
  } catch (error) {
    return getNetworkErrorResponse(error);
  }
}
