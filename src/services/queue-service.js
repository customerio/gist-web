import { NetworkInstance } from './queue-network';

export async function getUserQueue() {
  try {
    var response = await NetworkInstance().post(`/api/v1/users`, {});
    return response;
  } catch (error) {
    return error.response;
  }
}