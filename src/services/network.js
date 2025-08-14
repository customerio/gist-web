import Gist from '../gist';
import { settings } from './settings';
import { getEncodedUserToken } from "../managers/user-manager";

export function UserNetworkInstance() {
  const baseURL = settings.GIST_QUEUE_API_ENDPOINT[Gist.config.env]
  const defaultHeaders = {
    'X-CIO-Site-Id': Gist.config.siteId,
    'X-CIO-Client-Platform': 'web',
  };

  const userToken = getEncodedUserToken();
  if (userToken != null) {
    defaultHeaders['X-Gist-Encoded-User-Token'] = userToken;
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
        body: options.method && options.method.toUpperCase() !== 'GET' ? options.body : undefined,
        signal: controller.signal,
      });

      clearTimeout(timeout);

      const isJSON = response.headers.get("content-type")?.includes("application/json");
      const data = isJSON ? await response.json() : await response.text();

      const headersObj = Object.fromEntries(response.headers.entries());

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
