import { UserNetworkInstance } from './network';

export async function logUserMessageView(queueId) {
  try {
    var response = await UserNetworkInstance().post(`/api/v1/logs/queue/${queueId}`);
    return response;
  } catch (error) {
    return error.response;
  }
}

export async function logMessageView(messageId) {
  try {
    var response = await UserNetworkInstance().post(`/api/v1/logs/message/${messageId}`);
    return response;
  } catch (error) {
    return error.response;
  }
}