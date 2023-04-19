import { UserNetworkInstance } from './network';

export async function getUserQueue() {
  try {
    var response = await UserNetworkInstance().post(`/api/v1/users`, {});
    return response;
  } catch (error) {
    return error.response;
  }
}