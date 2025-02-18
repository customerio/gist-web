import Gist from '../gist';
import axios from 'axios';
import { settings } from './settings';
import { getUserToken } from "../managers/user-manager";

export function UserNetworkInstance() {
  var instance = axios.create({
    baseURL: settings.GIST_QUEUE_API_ENDPOINT[Gist.config.env],
    timeout: 5000
  });
  if (settings.getQueueAPIVersion() === "3") {
    instance.defaults.baseURL = settings.GIST_QUEUE_V3_API_ENDPOINT[Gist.config.env];
  }
  instance.defaults.headers.common['X-CIO-Site-Id'] = Gist.config.siteId;
  instance.defaults.headers.common['X-CIO-Client-Platform'] = 'web';
  var userToken = getUserToken();
  if (userToken != null) {
    instance.defaults.headers.common['X-Gist-Encoded-User-Token'] = btoa(userToken);
  }
  return instance;
}