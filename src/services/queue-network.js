import Gist from '../gist';
import axios from 'axios';
import { settings } from './settings';
import { getUserToken } from "../managers/user-manager";

export function NetworkInstance() {
  var headers = { 'X-Gist-CIO-Site-Id': `${Gist.config.siteId}` };
  var userToken = getUserToken();
  if (userToken !== undefined || userToken !== null) {
    headers['X-Gist-User-Token'] = userToken;
  }
  return axios.create({
    baseURL: settings.GIST_QUEUE_API_ENDPOINT[Gist.config.env],
    timeout: 20000,
    headers: headers,
  });
}