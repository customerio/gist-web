import { UserNetworkInstance } from "./network";
import type { NetworkResponse } from "./network";

export async function logUserMessageView(
  queueId: string,
): Promise<NetworkResponse | undefined> {
  try {
    const response = await UserNetworkInstance().post(
      `/api/v1/logs/queue/${queueId}`,
    );
    return response;
  } catch (error) {
    return (error as { response?: NetworkResponse }).response;
  }
}

export async function logMessageView(
  messageId: string,
): Promise<NetworkResponse | undefined> {
  try {
    const response = await UserNetworkInstance().post(
      `/api/v1/logs/message/${messageId}`,
    );
    return response;
  } catch (error) {
    return (error as { response?: NetworkResponse }).response;
  }
}
