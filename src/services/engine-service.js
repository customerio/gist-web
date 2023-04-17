import { EngineNetworkInstance } from './network';

export async function getEngineConfiguration() {
  try {
    var response = await EngineNetworkInstance().post(`/api/v2/configuration`, {
      "engineVersion": 1,
      "version": 1
    });
    return response;
  } catch (error) {
    return error.response;
  }
}