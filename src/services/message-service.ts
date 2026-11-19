import { UserNetworkInstance, getNetworkErrorResponse } from './network';
import type { NetworkResponse } from './network';
import { getRequestIdentity, handleUserJwtRejection } from '../managers/user-jwt-manager';

export async function updateMessage(
  queueId: string,
  updatedFields: Record<string, unknown>
): Promise<NetworkResponse | undefined> {
  const sentWith = getRequestIdentity();
  try {
    const response = await UserNetworkInstance()(`/api/v1/messages/${queueId}`, {
      method: 'PATCH',
      body: JSON.stringify(updatedFields),
      headers: {
        'Content-Type': 'application/json',
      },
    });
    return response;
  } catch (error) {
    const response = getNetworkErrorResponse(error);
    handleUserJwtRejection(response, sentWith);
    return response;
  }
}
