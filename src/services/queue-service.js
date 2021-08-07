import { NetworkInstance } from './queue-network';

export async function getUserQueue(topics = []) {
  try {
    var response = await NetworkInstance().post(`/api/v1/users`, { 'topics': topics });
    return response;
  } catch (error) {
    return error.response;
  }
}