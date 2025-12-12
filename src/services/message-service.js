import { UserNetworkInstance } from '../services/network';

export async function updateMessage(queueId, updatedFields) {
  try {
    const response = await UserNetworkInstance()(`/api/v1/messages/${queueId}`, {
      method: 'PATCH',
      body: JSON.stringify(updatedFields),
      headers: {
        'Content-Type': 'application/json'
      }
    });
    return response;
  } catch (error) {
    return error.response;
  }
}
