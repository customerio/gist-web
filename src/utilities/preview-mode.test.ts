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

vi.mock('../managers/preview-bar-manager', () => ({
  initPreviewBar: vi.fn(),
  setPreviewBarInitialStep: vi.fn(),
}));

import Gist from '../gist';
import { shouldPersistSession, isSessionBeingPersisted } from './local-storage';
import { initPreviewBar, setPreviewBarInitialStep } from '../managers/preview-bar-manager';

const mockSetUserToken = vi.mocked(Gist.setUserToken);
const mockShouldPersistSession = vi.mocked(shouldPersistSession);
const mockIsSessionBeingPersisted = vi.mocked(isSessionBeingPersisted);
const mockInitPreviewBar = vi.mocked(initPreviewBar);
const mockSetPreviewBarInitialStep = vi.mocked(setPreviewBarInitialStep);

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

  it('initializes the preview bar when preview mode is active', () => {
    setSearchParams('?cioPreviewId=token-abc');
    mockIsSessionBeingPersisted.mockReturnValue(false);

    setupPreview();

    expect(mockInitPreviewBar).toHaveBeenCalled();
  });

  it('does not initialize preview bar when no preview param', () => {
    setSearchParams('');
    mockIsSessionBeingPersisted.mockReturnValue(true);

    setupPreview();

    expect(mockInitPreviewBar).not.toHaveBeenCalled();
  });

  it('parses cioPreviewSettings and sets initial step', () => {
    const settings = { stepName: 'step-2', displayType: 'modal' };
    const encoded = btoa(JSON.stringify(settings));
    setSearchParams(`?cioPreviewId=token-abc&cioPreviewSettings=${encoded}`);
    mockIsSessionBeingPersisted.mockReturnValue(false);

    setupPreview();

    expect(mockSetPreviewBarInitialStep).toHaveBeenCalledWith('step-2', 'modal');
  });

  it('does not call setPreviewBarInitialStep when settings param is absent', () => {
    setSearchParams('?cioPreviewId=token-abc');
    mockIsSessionBeingPersisted.mockReturnValue(false);

    setupPreview();

    expect(mockSetPreviewBarInitialStep).not.toHaveBeenCalled();
  });

  it('does not call setPreviewBarInitialStep when decoded settings have no stepName or displayType', () => {
    const settings = { other: 'value' };
    const encoded = btoa(JSON.stringify(settings));
    setSearchParams(`?cioPreviewId=token-abc&cioPreviewSettings=${encoded}`);
    mockIsSessionBeingPersisted.mockReturnValue(false);

    setupPreview();

    expect(mockSetPreviewBarInitialStep).not.toHaveBeenCalled();
  });

  it('handles malformed cioPreviewSettings gracefully', () => {
    setSearchParams('?cioPreviewId=token-abc&cioPreviewSettings=not-valid-base64!!!');
    mockIsSessionBeingPersisted.mockReturnValue(false);

    expect(() => setupPreview()).not.toThrow();
    expect(mockSetPreviewBarInitialStep).not.toHaveBeenCalled();
  });
});
