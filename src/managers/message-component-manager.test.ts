import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  showEmbedComponent,
  hideEmbedComponent,
  elementHasHeight,
  resizeComponent,
  removeOverlayComponent,
  changeOverlayTitle,
} from './message-component-manager';

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
vi.mock('./page-component-manager', () => ({
  positions: ['x-gist-top', 'x-gist-bottom'],
}));
vi.mock('../utilities/message-utils', () => ({
  wideOverlayPositions: ['x-gist-top', 'x-gist-bottom'],
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
});
