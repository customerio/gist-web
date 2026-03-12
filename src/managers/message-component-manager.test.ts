import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  showEmbedComponent,
  hideEmbedComponent,
  elementHasHeight,
  resizeComponent,
  removeOverlayComponent,
  changeOverlayTitle,
  loadTooltipComponent,
  showTooltipComponent,
  hideTooltipComponent,
} from './message-component-manager';
import { log } from '../utilities/log';
import { resolveMessageProperties } from './gist-properties-manager';
import { positionTooltip } from './tooltip-position-manager';
import type { GistMessage } from '../types';

vi.mock('../utilities/log', () => ({ log: vi.fn() }));
vi.mock('../gist', () => ({
  default: { dismissMessage: vi.fn() },
}));
vi.mock('./gist-properties-manager', () => ({
  resolveMessageProperties: vi.fn(() => ({
    isEmbedded: false,
    elementId: '',
    hasRouteRule: false,
    routeRule: '',
    position: '',
    hasPosition: false,
    tooltipPosition: '',
    hasTooltipPosition: false,
    tooltipArrowColor: '#fff',
    shouldScale: false,
    campaignId: null,
    messageWidth: 414,
    overlayColor: '#00000033',
    persistent: false,
    exitClick: false,
    hasCustomWidth: false,
  })),
}));
vi.mock('../templates/embed', () => ({
  embedHTMLTemplate: vi.fn(
    (_id: string, _props: unknown, url: string) => `<iframe id="${_id}" src="${url}"></iframe>`
  ),
}));
vi.mock('../templates/message', () => ({
  messageHTMLTemplate: vi.fn(
    (_id: string, _props: unknown, url: string) =>
      `<div id="gist-embed-message"><div id="gist-overlay"><div class="gist-message"><iframe id="${_id}" src="${url}"></iframe></div></div></div>`
  ),
}));
vi.mock('../templates/tooltip', () => ({
  tooltipHTMLTemplate: vi.fn(
    (_id: string, _props: unknown, url: string) =>
      `<div id="gist-tooltip"><div id="gist-tooltip-container"><iframe id="${_id}" class="gist-tooltip-frame" src="${url}"></iframe></div></div>`
  ),
}));
vi.mock('./page-component-manager', () => ({
  positions: ['x-gist-top', 'x-gist-bottom'],
}));
vi.mock('../utilities/message-utils', () => ({
  wideOverlayPositions: ['x-gist-top', 'x-gist-bottom'],
}));
vi.mock('./tooltip-position-manager', () => ({
  positionTooltip: vi.fn(),
}));

describe('message-component-manager', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    vi.clearAllMocks();
  });

  it('showEmbedComponent adds gist-visible class', () => {
    const div = document.createElement('div');
    div.id = 'test-embed';
    document.body.appendChild(div);

    showEmbedComponent('test-embed');

    expect(div.classList.contains('gist-visible')).toBe(true);
  });

  it('hideEmbedComponent removes gist-visible class and clears innerHTML', () => {
    const div = document.createElement('div');
    div.id = 'test-embed';
    div.classList.add('gist-visible');
    div.innerHTML = '<span>content</span>';
    document.body.appendChild(div);

    hideEmbedComponent('test-embed');

    expect(div.classList.contains('gist-visible')).toBe(false);
    expect(div.innerHTML).toBe('');
  });

  it('elementHasHeight returns true when element has non-zero height', () => {
    const div = document.createElement('div');
    div.id = 'test-embed';
    div.style.height = '100px';
    document.body.appendChild(div);

    expect(elementHasHeight('test-embed')).toBe(true);
  });

  it('elementHasHeight returns false when element has zero height', () => {
    const div = document.createElement('div');
    div.id = 'test-embed';
    div.style.height = '0px';
    document.body.appendChild(div);

    expect(elementHasHeight('test-embed')).toBe(false);
  });

  it('resizeComponent sets height on the element', () => {
    const div = document.createElement('div');
    div.id = 'gist-inst-1';
    document.body.appendChild(div);

    resizeComponent({ messageId: 'm1', instanceId: 'inst-1' }, { width: 400, height: 300 });

    expect(div.style.height).toBe('300px');
  });

  it('removeOverlayComponent removes the overlay element from DOM', () => {
    const overlay = document.createElement('div');
    overlay.id = 'gist-embed-message';
    document.body.appendChild(overlay);

    removeOverlayComponent();

    expect(document.getElementById('gist-embed-message')).toBeNull();
  });

  it('changeOverlayTitle sets the iframe title attribute', () => {
    const iframe = document.createElement('iframe');
    iframe.id = 'gist-inst-1';
    document.body.appendChild(iframe);

    changeOverlayTitle('inst-1', 'My message title');

    expect(iframe.title).toBe('My message title');
  });

  describe('loadTooltipComponent', () => {
    const baseOptions = {
      endpoint: 'https://api.example.com',
      siteId: 'site-1',
      messageId: 'msg-1',
      instanceId: 'inst-1',
      livePreview: false,
    };

    it('creates a tooltip wrapper and appends it to the body', () => {
      const message: GistMessage = { messageId: 'msg-1', instanceId: 'inst-1' };

      loadTooltipComponent('https://view.example.com/index.html', message, baseOptions);

      const wrapper = document.getElementById('gist-tooltip-inst-1');
      expect(wrapper).not.toBeNull();
      expect(wrapper?.parentNode).toBe(document.body);
    });

    it('renders the tooltip template with the correct iframe', () => {
      const message: GistMessage = { messageId: 'msg-1', instanceId: 'inst-1' };

      loadTooltipComponent('https://view.example.com/index.html', message, baseOptions);

      const iframe = document.getElementById('gist-inst-1') as HTMLIFrameElement | null;
      expect(iframe).not.toBeNull();
      expect(iframe?.src).toContain('https://view.example.com/index.html');
    });

    it('removes any existing tooltip wrapper for the same instance before creating a new one', () => {
      const message: GistMessage = { messageId: 'msg-1', instanceId: 'inst-1' };

      loadTooltipComponent('https://view.example.com/index.html', message, baseOptions);
      loadTooltipComponent('https://view.example.com/index.html', message, baseOptions);

      const wrappers = document.querySelectorAll('#gist-tooltip-inst-1');
      expect(wrappers.length).toBe(1);
    });

    it('attaches an iframe onload handler', () => {
      const message: GistMessage = { messageId: 'msg-1', instanceId: 'inst-1' };

      loadTooltipComponent('https://view.example.com/index.html', message, baseOptions);

      const iframe = document.getElementById('gist-inst-1') as HTMLIFrameElement | null;
      expect(iframe?.onload).toBeTypeOf('function');
    });

    it('cleans up existing position listeners before re-creating the tooltip', () => {
      const mockCleanup = vi.fn();
      vi.mocked(positionTooltip).mockReturnValue(mockCleanup);

      vi.mocked(resolveMessageProperties).mockReturnValue({
        isEmbedded: false,
        elementId: '',
        hasRouteRule: false,
        routeRule: '',
        position: '',
        hasPosition: false,
        tooltipPosition: 'bottom',
        hasTooltipPosition: true,
        tooltipArrowColor: '#fff',
        shouldScale: false,
        campaignId: null,
        messageWidth: 414,
        overlayColor: '#00000033',
        persistent: false,
        exitClick: false,
        hasCustomWidth: false,
      });

      const message: GistMessage = {
        messageId: 'msg-1',
        instanceId: 'inst-1',
        properties: { gist: { elementId: '#target-el' } },
      };

      loadTooltipComponent('https://view.example.com/index.html', message, baseOptions);
      showTooltipComponent(message);

      expect(mockCleanup).not.toHaveBeenCalled();

      loadTooltipComponent('https://view.example.com/index.html', message, baseOptions);

      expect(mockCleanup).toHaveBeenCalledTimes(1);
    });
  });

  describe('showTooltipComponent', () => {
    function setupTooltipWrapper(instanceId: string): HTMLElement {
      const wrapper = document.createElement('div');
      wrapper.id = `gist-tooltip-${instanceId}`;
      const tooltip = document.createElement('div');
      tooltip.id = 'gist-tooltip';
      const container = document.createElement('div');
      container.id = 'gist-tooltip-container';
      const iframe = document.createElement('iframe');
      iframe.className = 'gist-tooltip-frame';
      container.appendChild(iframe);
      tooltip.appendChild(container);
      wrapper.appendChild(tooltip);
      document.body.appendChild(wrapper);
      return wrapper;
    }

    it('adds gist-visible class to the tooltip iframe', () => {
      setupTooltipWrapper('inst-1');
      const message: GistMessage = {
        messageId: 'msg-1',
        instanceId: 'inst-1',
        properties: { gist: { elementId: '#target-el' } },
      };

      showTooltipComponent(message);

      const iframe = document.querySelector('.gist-tooltip-frame');
      expect(iframe?.classList.contains('gist-visible')).toBe(true);
    });

    it('calls positionTooltip with the wrapper, selector, and position', () => {
      setupTooltipWrapper('inst-1');
      vi.mocked(resolveMessageProperties).mockReturnValue({
        isEmbedded: false,
        elementId: '',
        hasRouteRule: false,
        routeRule: '',
        position: '',
        hasPosition: false,
        tooltipPosition: 'top',
        hasTooltipPosition: true,
        tooltipArrowColor: '#fff',
        shouldScale: false,
        campaignId: null,
        messageWidth: 414,
        overlayColor: '#00000033',
        persistent: false,
        exitClick: false,
        hasCustomWidth: false,
      });

      const message: GistMessage = {
        messageId: 'msg-1',
        instanceId: 'inst-1',
        properties: { gist: { elementId: '#target-el', tooltipPosition: 'top' } },
      };

      showTooltipComponent(message);

      const tooltipElement = document.getElementById('gist-tooltip');
      expect(positionTooltip).toHaveBeenCalledWith(tooltipElement, '#target-el', 'top');
    });

    it('defaults tooltip position to bottom when not specified', () => {
      setupTooltipWrapper('inst-1');
      vi.mocked(resolveMessageProperties).mockReturnValue({
        isEmbedded: false,
        elementId: '',
        hasRouteRule: false,
        routeRule: '',
        position: '',
        hasPosition: false,
        tooltipPosition: '',
        hasTooltipPosition: false,
        tooltipArrowColor: '#fff',
        shouldScale: false,
        campaignId: null,
        messageWidth: 414,
        overlayColor: '#00000033',
        persistent: false,
        exitClick: false,
        hasCustomWidth: false,
      });

      const message: GistMessage = {
        messageId: 'msg-1',
        instanceId: 'inst-1',
        properties: { gist: { elementId: '#target-el' } },
      };

      showTooltipComponent(message);

      expect(positionTooltip).toHaveBeenCalledWith(expect.any(HTMLElement), '#target-el', 'bottom');
    });

    it('logs and returns early when wrapper is not found', () => {
      const message: GistMessage = {
        messageId: 'msg-1',
        instanceId: 'inst-1',
        properties: { gist: { elementId: '#target-el' } },
      };

      showTooltipComponent(message);

      expect(log).toHaveBeenCalledWith('Tooltip wrapper not found for instance inst-1');
      expect(positionTooltip).not.toHaveBeenCalled();
    });

    it('logs and returns early when no target selector is provided', () => {
      setupTooltipWrapper('inst-1');
      const message: GistMessage = {
        messageId: 'msg-1',
        instanceId: 'inst-1',
      };

      showTooltipComponent(message);

      expect(log).toHaveBeenCalledWith('No target selector for tooltip inst-1');
      expect(positionTooltip).not.toHaveBeenCalled();

      const iframe = document.querySelector('.gist-tooltip-frame');
      expect(iframe?.classList.contains('gist-visible')).toBe(false);
    });
  });

  describe('hideTooltipComponent', () => {
    it('removes the tooltip wrapper from the DOM', () => {
      const wrapper = document.createElement('div');
      wrapper.id = 'gist-tooltip-inst-1';
      document.body.appendChild(wrapper);

      hideTooltipComponent({ messageId: 'msg-1', instanceId: 'inst-1' });

      expect(document.getElementById('gist-tooltip-inst-1')).toBeNull();
    });

    it('calls the position cleanup function when one exists', () => {
      const wrapper = document.createElement('div');
      wrapper.id = 'gist-tooltip-inst-1';
      const tooltip = document.createElement('div');
      tooltip.id = 'gist-tooltip';
      const container = document.createElement('div');
      container.id = 'gist-tooltip-container';
      const iframe = document.createElement('iframe');
      iframe.className = 'gist-tooltip-frame';
      container.appendChild(iframe);
      tooltip.appendChild(container);
      wrapper.appendChild(tooltip);
      document.body.appendChild(wrapper);

      const mockCleanup = vi.fn();
      vi.mocked(positionTooltip).mockReturnValue(mockCleanup);

      vi.mocked(resolveMessageProperties).mockReturnValue({
        isEmbedded: false,
        elementId: '',
        hasRouteRule: false,
        routeRule: '',
        position: '',
        hasPosition: false,
        tooltipPosition: 'bottom',
        hasTooltipPosition: true,
        tooltipArrowColor: '#fff',
        shouldScale: false,
        campaignId: null,
        messageWidth: 414,
        overlayColor: '#00000033',
        persistent: false,
        exitClick: false,
        hasCustomWidth: false,
      });

      const message: GistMessage = {
        messageId: 'msg-1',
        instanceId: 'inst-1',
        properties: { gist: { elementId: '#target-el' } },
      };

      showTooltipComponent(message);
      hideTooltipComponent(message);

      expect(mockCleanup).toHaveBeenCalled();
      expect(document.getElementById('gist-tooltip-inst-1')).toBeNull();
    });

    it('handles missing wrapper gracefully', () => {
      expect(() => {
        hideTooltipComponent({ messageId: 'msg-1', instanceId: 'inst-1' });
      }).not.toThrow();
    });
  });
});
