import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { DisplaySettings, GistMessage, StepDisplayConfig } from '../types';

const mockGist = vi.hoisted(() => ({
  currentMessages: [] as GistMessage[],
  dismissMessage: vi.fn(() => Promise.resolve()),
}));

vi.mock('../gist', () => ({ default: mockGist }));
vi.mock('../utilities/log', () => ({ log: vi.fn() }));
vi.mock('./message-manager', () => ({
  applyMessageStepChange: vi.fn(),
  hideMessageVisually: vi.fn(),
}));
vi.mock('./message-component-manager', () => ({
  sendDisplaySettingsToIframe: vi.fn(),
}));
vi.mock('../utilities/message-utils', () => ({
  hasDisplayChanged: vi.fn(() => false),
  wideOverlayPositions: ['x-gist-top-full', 'x-gist-bottom-full'],
  mapOverlayPositionToElementId: vi.fn((pos: string) => pos),
}));
vi.mock('./preview-bar-styles', () => ({
  PREVIEW_BAR_CSS: '.gist-pb-toggle-btn { color: white; }',
  chevronSvg: vi.fn(() => '<svg></svg>'),
}));
vi.mock('../services/preview-service', () => ({
  savePreviewDisplaySettings: vi.fn(() => Promise.resolve({ status: 200 })),
  deletePreviewSession: vi.fn(() => Promise.resolve()),
}));
vi.mock('../utilities/preview-mode', () => ({
  PREVIEW_PARAM_ID: 'cioPreviewId',
  teardownPreview: vi.fn(),
}));

import {
  initPreviewBar,
  updatePreviewBarMessage,
  updatePreviewBarStep,
  destroyPreviewBar,
} from './preview-bar-manager';

describe('preview-bar-manager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = '';
    mockGist.currentMessages = [];
  });

  afterEach(() => {
    destroyPreviewBar();
  });

  function initBarWithMessage(
    steps: StepDisplayConfig[] = [],
    displayType: DisplaySettings['displayType'] = 'modal'
  ): GistMessage {
    initPreviewBar();
    const message: GistMessage = {
      messageId: 'msg-1',
      instanceId: 'inst-1',
      displaySettings: steps.length > 0 ? (steps as unknown as DisplaySettings) : { displayType },
    };
    mockGist.currentMessages = [message];
    updatePreviewBarMessage(message);
    return message;
  }

  describe('initPreviewBar', () => {
    it('creates the preview bar element in the DOM', () => {
      initPreviewBar();
      expect(document.getElementById('gist-preview-bar')).not.toBeNull();
    });

    it('injects preview bar styles', () => {
      initPreviewBar();
      expect(document.getElementById('gist-pb-styles')).not.toBeNull();
    });

    it('does not duplicate the bar on repeated calls', () => {
      initPreviewBar();
      initPreviewBar();
      expect(document.querySelectorAll('#gist-preview-bar').length).toBe(1);
    });
  });

  describe('display type dropdown', () => {
    it('includes tooltip option in display type dropdown', () => {
      initBarWithMessage();
      const bar = document.getElementById('gist-preview-bar')!;
      const select = bar.querySelector<HTMLSelectElement>('.gist-pb-select');
      expect(select).not.toBeNull();

      const options = Array.from(select!.options).map((o) => o.value);
      expect(options).toContain('tooltip');
    });

    it('includes all four display types: modal, overlay, inline, tooltip', () => {
      initBarWithMessage();
      const bar = document.getElementById('gist-preview-bar')!;
      const selects = bar.querySelectorAll<HTMLSelectElement>('.gist-pb-select');
      const displayTypeSelect = selects[0];
      const values = Array.from(displayTypeSelect.options).map((o) => o.value);

      expect(values).toEqual(['modal', 'overlay', 'inline', 'tooltip']);
    });
  });

  describe('tooltip controls', () => {
    it('renders element selector and position controls when display type is tooltip', () => {
      initBarWithMessage([], 'tooltip');
      const bar = document.getElementById('gist-preview-bar')!;
      const labels = Array.from(bar.querySelectorAll('.gist-pb-label')).map((el) => el.textContent);

      expect(labels).toContain('Element Selector');
      expect(labels).toContain('Position');
    });

    it('renders tooltip position options: top, bottom, left, right', () => {
      initBarWithMessage([], 'tooltip');
      const bar = document.getElementById('gist-preview-bar')!;
      const selects = bar.querySelectorAll<HTMLSelectElement>('.gist-pb-select');
      const positionSelect = Array.from(selects).find((s) =>
        Array.from(s.options).some((o) => o.value === 'left')
      );
      expect(positionSelect).not.toBeUndefined();

      const values = Array.from(positionSelect!.options).map((o) => o.value);
      expect(values).toEqual(['top', 'bottom', 'left', 'right']);
    });

    it('renders Select Element button', () => {
      initBarWithMessage([], 'tooltip');
      const bar = document.getElementById('gist-preview-bar')!;
      const selectBtn = bar.querySelector('.gist-pb-select-elem-btn');
      expect(selectBtn).not.toBeNull();
      expect(selectBtn!.textContent).toBe('Select Element');
    });

    it('renders element selector input with placeholder text', () => {
      initBarWithMessage([], 'tooltip');
      const bar = document.getElementById('gist-preview-bar')!;
      const input = bar.querySelector<HTMLInputElement>('.gist-pb-input[type="text"]');
      expect(input).not.toBeNull();
      expect(input!.placeholder).toBe('Element ID or selector');
    });
  });

  describe('inline controls', () => {
    it('renders element selector for inline display type', () => {
      initBarWithMessage([], 'inline');
      const bar = document.getElementById('gist-preview-bar')!;
      const labels = Array.from(bar.querySelectorAll('.gist-pb-label')).map((el) => el.textContent);

      expect(labels).toContain('Element Selector');
    });

    it('does not render position dropdown for inline type', () => {
      initBarWithMessage([], 'inline');
      const bar = document.getElementById('gist-preview-bar')!;
      const labels = Array.from(bar.querySelectorAll('.gist-pb-label')).map((el) => el.textContent);

      expect(labels).not.toContain('Position');
    });
  });

  describe('button type attributes', () => {
    it('toggle button has type="button"', () => {
      initBarWithMessage();
      const bar = document.getElementById('gist-preview-bar')!;
      const toggleBtn = bar.querySelector<HTMLButtonElement>('.gist-pb-toggle-btn');
      expect(toggleBtn).not.toBeNull();
      expect(toggleBtn!.type).toBe('button');
    });

    it('end session button has type="button"', () => {
      initBarWithMessage();
      const bar = document.getElementById('gist-preview-bar')!;
      const endBtn = bar.querySelector<HTMLButtonElement>('.gist-pb-save-btn');
      expect(endBtn).not.toBeNull();
      expect(endBtn!.type).toBe('button');
    });

    it('select element button has type="button"', () => {
      initBarWithMessage([], 'tooltip');
      const bar = document.getElementById('gist-preview-bar')!;
      const selectBtn = bar.querySelector<HTMLButtonElement>('.gist-pb-select-elem-btn');
      expect(selectBtn).not.toBeNull();
      expect(selectBtn!.type).toBe('button');
    });
  });

  describe('updatePreviewBarStep', () => {
    it('updates the bar when step changes', () => {
      const steps: StepDisplayConfig[] = [
        { stepName: 'step-1', displaySettings: { displayType: 'modal' } },
        {
          stepName: 'step-2',
          displaySettings: { displayType: 'tooltip', tooltipPosition: 'bottom' },
        },
      ];
      initBarWithMessage(steps);

      updatePreviewBarStep('step-2', { displayType: 'tooltip', tooltipPosition: 'bottom' });

      const bar = document.getElementById('gist-preview-bar')!;
      const labels = Array.from(bar.querySelectorAll('.gist-pb-label')).map((el) => el.textContent);
      expect(labels).toContain('Element Selector');
      expect(labels).toContain('Position');
    });
  });

  describe('destroyPreviewBar', () => {
    it('removes the bar and styles from the DOM', () => {
      initPreviewBar();
      expect(document.getElementById('gist-preview-bar')).not.toBeNull();
      expect(document.getElementById('gist-pb-styles')).not.toBeNull();

      destroyPreviewBar();

      expect(document.getElementById('gist-preview-bar')).toBeNull();
      expect(document.getElementById('gist-pb-styles')).toBeNull();
    });
  });
});
