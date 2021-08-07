import Gist from '../gist';
import axios from 'axios';
import { settings } from './settings';

export function NetworkInstance() {
  var headers = { 'X-Bourbon-Organization-Id': `${Gist.config.organizationId}` };
  return axios.create({
    baseURL: settings.GIST_ANALYTICS_API_ENDPOINT[Gist.config.env],
    timeout: 20000,
    headers: headers,
  });
}