import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchBranding } from './branding-service';

const mockRequest = vi.fn();

vi.mock('../gist', () => ({
  default: { config: { env: 'prod', siteId: 'test-site-id' } },
}));

vi.mock('./network', () => ({
  UserNetworkInstance: vi.fn(() => mockRequest),
  getNetworkErrorResponse: vi.fn((error: { response?: unknown }) => error?.response),
}));

describe('branding-service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sends GET to /api/v1/branding', async () => {
    mockRequest.mockResolvedValue({ status: 200, data: { color: '#fff' }, headers: {} });

    const result = await fetchBranding();

    expect(mockRequest).toHaveBeenCalledWith('/api/v1/branding');
    expect(result).toEqual({ status: 200, data: { color: '#fff' }, headers: {} });
  });

  it('returns error response on failure', async () => {
    const errorResponse = { status: 500, data: 'Server error', headers: {} };
    mockRequest.mockRejectedValue({ response: errorResponse });

    const result = await fetchBranding();

    expect(result).toEqual(errorResponse);
  });
});
