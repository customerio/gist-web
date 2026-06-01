import { UserNetworkInstance, getNetworkErrorResponse } from './network';
import type { NetworkResponse } from './network';

export async function fetchTemplates(): Promise<NetworkResponse | undefined> {
  try {
    return await UserNetworkInstance()('/api/v1/templates');
  } catch (error) {
    return getNetworkErrorResponse(error);
  }
}
