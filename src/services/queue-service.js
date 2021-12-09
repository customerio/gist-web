import { NetworkInstance } from './queue-network';

export async function getUserQueue(topics = []) {
  try {
    var response = await NetworkInstance().post(`/api/v1/users`, { 'topics': topics });
    return response;
  } catch (error) {
    return error.response;
  }
}

export async function getUserSettings() {
  try {
    var response = await NetworkInstance().get(`/api/v1/settings`);
    return response;
  } catch (error) {
    return error.response;
  }
}