import { NetworkInstance } from './queue-network';
import axios from 'axios';

const CancelToken = axios.CancelToken;
let cancelGetUserSettingsRequest;

export async function getUserQueue() {
  try {
    var response = await NetworkInstance().post(`/api/v1/users`, {});
    return response;
  } catch (error) {
    return error.response;
  }
}

export async function getUserSettings() {
  try {
    var response = await NetworkInstance().get(`/api/v1/settings`, {
      cancelToken: new CancelToken(function executor(c) {
        cancelGetUserSettingsRequest = c;
      })
    });
    return response;
  } catch (error) {
    return error.response;
  }
}

export function cancelPendingGetUserSettingsRequests() {
  if (cancelGetUserSettingsRequest !== undefined) {
    cancelGetUserSettingsRequest();
  }
}