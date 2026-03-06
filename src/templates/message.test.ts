import { describe, it, expect } from 'vitest';
import { messageHTMLTemplate } from './message';
import type { ResolvedMessageProperties } from '../types';

function parseHTML(html: string): Document {
  const parser = new DOMParser();
  return parser.parseFromString(html, 'text/html');
}

function makeProps(overrides: Partial<ResolvedMessageProperties> = {}): ResolvedMessageProperties {
  return {
    isEmbedded: false,
    elementId: '',
    hasRouteRule: false,
    routeRule: '',
    position: '',
    hasPosition: false,
    tooltipPosition: '',
    hasTooltipPosition: false,
    shouldScale: false,
    campaignId: null,
    messageWidth: 414,
    overlayColor: '#00000033',
    persistent: false,
    exitClick: false,
    hasCustomWidth: false,
    ...overrides,
  };
}

describe('messageHTMLTemplate', () => {
  it('returns HTML containing the iframe with the correct id and src', () => {
    const html = messageHTMLTemplate('my-element-id', makeProps(), 'https://example.com/msg');

    const doc = parseHTML(html);
    const iframe = doc.querySelector('#my-element-id');
    expect(iframe).not.toBeNull();
    expect(iframe?.getAttribute('src')).toBe('https://example.com/msg');
  });

  it('uses messageProperties.overlayColor in the background style', () => {
    const html = messageHTMLTemplate(
      'el',
      makeProps({ overlayColor: '#ff000080' }),
      'https://example.com'
    );

    expect(html).toContain('background-color: #ff000080');
  });

  it('uses messageProperties.messageWidth for the message width', () => {
    const html = messageHTMLTemplate('el', makeProps({ messageWidth: 500 }), 'https://example.com');

    expect(html).toContain('width: 500px');
  });

  it('uses default 600px breakpoint when messageWidth <= 600', () => {
    const html = messageHTMLTemplate('el', makeProps({ messageWidth: 414 }), 'https://example.com');

    expect(html).toContain('@media (max-width: 600px)');
  });

  it('adjusts media query breakpoint when messageWidth > 600', () => {
    const html = messageHTMLTemplate('el', makeProps({ messageWidth: 800 }), 'https://example.com');

    expect(html).toContain('@media (max-width: 800px)');
    expect(html).not.toContain('@media (max-width: 600px)');
  });

  it('contains the gist-overlay wrapper div', () => {
    const html = messageHTMLTemplate('el', makeProps(), 'https://example.com');
    const doc = parseHTML(html);

    const overlay = doc.querySelector('#gist-overlay.gist-background');
    expect(overlay).not.toBeNull();
  });

  it('contains the gist-embed-message wrapper div', () => {
    const html = messageHTMLTemplate('el', makeProps(), 'https://example.com');
    const doc = parseHTML(html);

    const wrapper = doc.querySelector('#gist-embed-message');
    expect(wrapper).not.toBeNull();
  });
});
