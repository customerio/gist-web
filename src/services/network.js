import Gist from '../gist';
import { settings } from './settings';
import { getUserToken } from "../managers/user-manager";

export function UserNetworkInstance() {
  const baseURL =
    settings.getQueueAPIVersion() === "3"
      ? settings.GIST_QUEUE_V3_API_ENDPOINT[Gist.config.env]
      : settings.GIST_QUEUE_API_ENDPOINT[Gist.config.env];

  const defaultHeaders = {
    'X-CIO-Site-Id': Gist.config.siteId,
    'X-CIO-Client-Platform': 'web',
  };

  const userToken = getUserToken();
  if (userToken != null) {
    defaultHeaders['X-Gist-Encoded-User-Token'] = btoa(userToken);
  }

  async function request(path, options = {}) {
    const url = baseURL + path;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    try {
      const response = await fetch(url, {
        method: options.method || 'GET',
        headers: {
          ...defaultHeaders,
          ...(options.headers || {}),
        },
        body: options.body,
        signal: controller.signal,
      });

      clearTimeout(timeout);

      const contentType = response.headers.get("content-type");
      const isJSON = contentType && contentType.includes("application/json");
      const data = isJSON ? await response.json() : await response.text();

      const headersObj = {};
      response.headers.forEach((value, key) => {
        headersObj[key] = value;
      });

      if (response.status < 200 || response.status >= 400) {
        throw {
          response: {
            status: response.status,
            data,
            headers: headersObj,
          }
        };
      }

      return {
        status: response.status,
        headers: headersObj,
        data,
      };
    } catch (err) {
      clearTimeout(timeout);

      if (!err.response) {
        err.response = {
          status: 0,
          data: err.message || 'Unknown error',
        };
      }

      throw err;
    }
  }

  request.post = (path, data = {}, config = {}) => {
    return request(path, {
      method: 'POST',
      body: JSON.stringify(data),
      headers: {
        'Content-Type': 'application/json',
        ...(config.headers || {})
      }
    });
  };

  return request;
}
