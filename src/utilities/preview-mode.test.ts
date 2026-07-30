import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setupPreview, withPreviewSession } from './preview-mode';

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

vi.mock('../managers/user-manager', () => ({
  clearUserToken: vi.fn(),
  getUserToken: vi.fn(() => 'preview-token-123'),
}));

import Gist from '../gist';
import { shouldPersistSession, isSessionBeingPersisted } from './local-storage';
import { initPreviewBar, setPreviewBarInitialStep } from '../managers/preview-bar-manager';
import { getUserToken } from '../managers/user-manager';

const mockSetUserToken = vi.mocked(Gist.setUserToken);
const mockShouldPersistSession = vi.mocked(shouldPersistSession);
const mockIsSessionBeingPersisted = vi.mocked(isSessionBeingPersisted);
const mockInitPreviewBar = vi.mocked(initPreviewBar);
const mockSetPreviewBarInitialStep = vi.mocked(setPreviewBarInitialStep);
const mockGetUserToken = vi.mocked(getUserToken);

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

function setLocation(href: string) {
  Object.defineProperty(window, 'location', {
    value: { href, search: new URL(href).search },
    writable: true,
  });
}

describe('withPreviewSession', () => {
  beforeEach(() => {
    mockGetUserToken.mockReturnValue('preview-token-123');
    setLocation('https://app.example.com/start');
  });

  it('resolves relative urls against the current page and appends the session', () => {
    const result = new URL(withPreviewSession('/settings', 'step-2', 'tooltip'));

    expect(result.origin).toBe('https://app.example.com');
    expect(result.pathname).toBe('/settings');
    expect(result.searchParams.get('cioPreviewId')).toBe('preview-token-123');
    expect(JSON.parse(atob(result.searchParams.get('cioPreviewSettings') ?? ''))).toEqual({
      stepName: 'step-2',
      displayType: 'tooltip',
    });
  });

  it('preserves existing query params and hash on the destination', () => {
    const result = new URL(
      withPreviewSession('https://site.example.com/pricing?plan=pro#faq', 'step-3', 'modal')
    );

    expect(result.searchParams.get('plan')).toBe('pro');
    expect(result.hash).toBe('#faq');
    expect(result.searchParams.get('cioPreviewId')).toBe('preview-token-123');
  });

  it('returns the url unchanged when no preview token exists', () => {
    mockGetUserToken.mockReturnValue(null);

    expect(withPreviewSession('/settings', 'step-2', 'modal')).toBe('/settings');
  });

  it('keeps the session id even when the step name cannot be base64-encoded', () => {
    const result = new URL(withPreviewSession('/settings', 'étape-🚀', 'modal'));

    expect(result.searchParams.get('cioPreviewId')).toBe('preview-token-123');
    // The saved step state still opens the right step on the destination page;
    // only the preview bar's step pre-seed is skipped.
    expect(result.searchParams.get('cioPreviewSettings')).toBeNull();
  });
});
