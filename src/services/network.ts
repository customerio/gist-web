import Gist from '../gist';
import { settings } from './settings';
import { getEncodedUserToken } from '../managers/user-manager';
import { getUserJwt } from '../managers/user-jwt-manager';

export interface NetworkResponse {
  status: number;
  headers: Record<string, string>;
  data: unknown;
}

export interface NetworkError extends Error {
  response: NetworkResponse;
}

function isNetworkError(error: unknown): error is NetworkError {
  return error !== null && typeof error === 'object' && 'response' in error;
}

function createNetworkError(response: NetworkResponse): NetworkError {
  return Object.assign(new Error(), { response }) as NetworkError;
}

export function getNetworkErrorResponse(error: unknown): NetworkResponse | undefined {
  return isNetworkError(error) ? error.response : undefined;
}

export interface RequestOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
}

export type UserNetworkRequest = ((
  path: string,
  options?: RequestOptions
) => Promise<NetworkResponse>) & {
  post: (
    path: string,
    data?: Record<string, unknown>,
    config?: { headers?: Record<string, string> }
  ) => Promise<NetworkResponse>;
};

export function UserNetworkInstance(): UserNetworkRequest {
  const baseURL = settings.GIST_QUEUE_API_ENDPOINT[Gist.config.env ?? 'prod'];
  const defaultHeaders: Record<string, string> = {
    'X-CIO-Site-Id': Gist.config.siteId,
    'X-CIO-Client-Platform': 'web',
  };

  const userToken = getEncodedUserToken();
  if (userToken != null) {
    defaultHeaders['X-Gist-Encoded-User-Token'] = userToken;
  }

  const userJwt = getUserJwt();
  if (userJwt !== null) {
    defaultHeaders['X-CIO-User-JWT'] = userJwt;
  }

  async function request(path: string, options: RequestOptions = {}): Promise<NetworkResponse> {
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

      const headersObj = Object.fromEntries(response.headers.entries()) as Record<string, string>;
      const isError = response.status < 200 || response.status >= 400;

      const isJSON = response.headers.get('content-type')?.includes('application/json');
      let data: unknown;
      try {
        data = isJSON ? await response.json() : await response.text();
      } catch (bodyError) {
        // An error keeps its status and headers when its body doesn't parse, such
        // as Gist's 401 with a JSON content type and no body. A success can't be
        // used without its body, so it still fails as a network error.
        if (!isError) throw bodyError;
      }

      if (isError) {
        throw createNetworkError({
          status: response.status,
          data,
          headers: headersObj,
        });
      }

      return {
        status: response.status,
        headers: headersObj,
        data,
      };
    } catch (err) {
      clearTimeout(timeout);

      if (isNetworkError(err)) {
        throw err;
      }

      if (err instanceof Error) {
        const networkErr = Object.assign(err, {
          response: {
            status: 0,
            data: err.message || 'Unknown error',
            headers: {},
          },
        }) as NetworkError;
        throw networkErr;
      }

      throw err;
    }
  }

  request.post = (
    path: string,
    data: Record<string, unknown> = {},
    config: { headers?: Record<string, string> } = {}
  ) => {
    return request(path, {
      method: 'POST',
      body: JSON.stringify(data),
      headers: {
        'Content-Type': 'application/json',
        ...(config.headers || {}),
      },
    });
  };

  return request as UserNetworkRequest;
}
