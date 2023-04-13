import Gist from '../gist';
import axios from 'axios';
import { settings } from './settings';
import { getUserToken } from "../managers/user-manager";

export function NetworkInstance() {
  var headers = { 'X-CIO-Site-Id': `${Gist.config.siteId}`, "X-CIO-Datacenter": `${Gist.config.dataCenter}` };
  var userToken = getUserToken();
  if (userToken != null) {
    headers['X-Gist-Encoded-User-Token'] = btoa(userToken);
  }
  return axios.create({
    baseURL: settings.GIST_QUEUE_API_ENDPOINT[Gist.config.env],
    timeout: 20000,
    headers: headers,
  });
}