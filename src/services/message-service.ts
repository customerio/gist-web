import { UserNetworkInstance, getNetworkErrorResponse } from './network';
import type { NetworkResponse } from './network';

export async function updateMessage(
  queueId: string,
  updatedFields: Record<string, unknown>
): Promise<NetworkResponse | undefined> {
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
    return getNetworkErrorResponse(error);
  }
}
