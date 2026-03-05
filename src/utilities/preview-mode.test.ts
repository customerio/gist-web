import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setupPreview } from './preview-mode';

vi.mock('../gist', () => ({
  default: {
    setUserToken: vi.fn(),
  },
}));

vi.mock('./log', () => ({ log: vi.fn() }));

vi.mock('./local-storage', () => ({
  shouldPersistSession: vi.fn(),
  isSessionBeingPersisted: vi.fn(),
}));

import Gist from '../gist';
import { shouldPersistSession, isSessionBeingPersisted } from './local-storage';

const mockSetUserToken = vi.mocked(Gist.setUserToken);
const mockShouldPersistSession = vi.mocked(shouldPersistSession);
const mockIsSessionBeingPersisted = vi.mocked(isSessionBeingPersisted);

function setSearchParams(params: string) {
  Object.defineProperty(window, 'location', {
    value: { search: params },
    writable: true,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  setSearchParams('');
});

describe('setupPreview', () => {
  it('returns true when cioPreviewId param is present', () => {
    setSearchParams('?cioPreviewId=test-token-123');
    mockIsSessionBeingPersisted.mockReturnValue(false);

    const result = setupPreview();

    expect(result).toBe(true);
  });

  it('sets user token from the URL param value', () => {
    setSearchParams('?cioPreviewId=my-preview-token');
    mockIsSessionBeingPersisted.mockReturnValue(false);

    setupPreview();

    expect(mockSetUserToken).toHaveBeenCalledWith('my-preview-token');
  });

  it('switches to session storage in preview mode', () => {
    setSearchParams('?cioPreviewId=some-token');
    mockIsSessionBeingPersisted.mockReturnValue(false);

    setupPreview();

    expect(mockShouldPersistSession).toHaveBeenCalledWith(false);
  });

  it('returns false when no cioPreviewId param in URL', () => {
    setSearchParams('?otherParam=value');
    mockIsSessionBeingPersisted.mockReturnValue(true);

    const result = setupPreview();

    expect(result).toBe(false);
    expect(mockSetUserToken).not.toHaveBeenCalled();
    expect(mockShouldPersistSession).not.toHaveBeenCalled();
  });

  it('does not call setUserToken when no preview param', () => {
    setSearchParams('');
    mockIsSessionBeingPersisted.mockReturnValue(true);

    setupPreview();

    expect(mockSetUserToken).not.toHaveBeenCalled();
  });
});
