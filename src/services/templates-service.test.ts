import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchTemplates } from './templates-service';

const mockRequest = vi.fn();

vi.mock('../gist', () => ({
  default: { config: { env: 'prod', siteId: 'test-site-id' } },
}));

vi.mock('./network', () => ({
  UserNetworkInstance: vi.fn(() => mockRequest),
  getNetworkErrorResponse: vi.fn((error: { response?: unknown }) => error?.response),
}));

describe('templates-service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sends GET to /api/v1/templates', async () => {
    mockRequest.mockResolvedValue({ status: 200, data: [{ id: 't1' }], headers: {} });

    const result = await fetchTemplates();

    expect(mockRequest).toHaveBeenCalledWith('/api/v1/templates');
    expect(result).toEqual({ status: 200, data: [{ id: 't1' }], headers: {} });
  });

  it('returns error response on failure', async () => {
    const errorResponse = { status: 404, data: 'Not found', headers: {} };
    mockRequest.mockRejectedValue({ response: errorResponse });

    const result = await fetchTemplates();

    expect(result).toEqual(errorResponse);
  });
});
