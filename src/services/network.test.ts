import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UserNetworkInstance } from './network';
import { getEncodedUserToken } from '../managers/user-manager';

const mockFetch = vi.fn();

vi.mock('../gist', () => ({
  default: {
    config: {
      env: 'prod',
      siteId: 'test-site-id',
    },
  },
}));

vi.mock('./settings', () => ({
  settings: {
    GIST_QUEUE_API_ENDPOINT: {
      prod: 'https://consumer.cloud.gist.build',
      dev: 'https://consumer.cloud.dev.gist.build',
      local: 'http://api.local.gist.build:86',
    },
  },
}));

vi.mock('../managers/user-manager', () => ({
  getEncodedUserToken: vi.fn(() => null),
}));

describe('network', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = mockFetch;
    vi.mocked(getEncodedUserToken).mockReturnValue(null);
  });

  it('GET request sends correct URL and default headers (X-CIO-Site-Id, X-CIO-Client-Platform)', async () => {
    mockFetch.mockResolvedValue({
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: () => Promise.resolve({ ok: true }),
    });

    const request = UserNetworkInstance();
    await request('/api/v1/test');

    expect(mockFetch).toHaveBeenCalledWith(
      'https://consumer.cloud.gist.build/api/v1/test',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          'X-CIO-Site-Id': 'test-site-id',
          'X-CIO-Client-Platform': 'web',
        }),
      })
    );
  });

  it('POST request sends JSON body and Content-Type header', async () => {
    mockFetch.mockResolvedValue({
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: () => Promise.resolve({ ok: true }),
    });

    const request = UserNetworkInstance();
    await request.post('/api/v1/test', { foo: 'bar' });

    expect(mockFetch).toHaveBeenCalledWith(
      'https://consumer.cloud.gist.build/api/v1/test',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ foo: 'bar' }),
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
        }),
      })
    );
  });

  it('includes X-Gist-Encoded-User-Token header when user token exists', async () => {
    vi.mocked(getEncodedUserToken).mockReturnValue('encoded-token-123');

    mockFetch.mockResolvedValue({
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: () => Promise.resolve({ ok: true }),
    });

    const request = UserNetworkInstance();
    await request('/api/v1/test');

    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          'X-Gist-Encoded-User-Token': 'encoded-token-123',
        }),
      })
    );
  });

  it('throws with response.status for 4xx/5xx responses', async () => {
    mockFetch.mockResolvedValue({
      status: 404,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: () => Promise.resolve({ error: 'Not found' }),
    });

    const request = UserNetworkInstance();

    await expect(request('/api/v1/missing')).rejects.toMatchObject({
      response: expect.objectContaining({
        status: 404,
        data: { error: 'Not found' },
      }),
    });
  });

  it('passes AbortSignal to fetch for 5s timeout', async () => {
    mockFetch.mockResolvedValue({
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: () => Promise.resolve({ ok: true }),
    });

    const request = UserNetworkInstance();
    await request('/api/v1/test');

    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        signal: expect.any(AbortSignal),
      })
    );
  });
});
