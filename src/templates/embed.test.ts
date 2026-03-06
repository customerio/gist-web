import { describe, it, expect } from 'vitest';
import { embedHTMLTemplate } from './embed';
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

describe('embedHTMLTemplate', () => {
  it('returns HTML containing the iframe with the correct id and src', () => {
    const html = embedHTMLTemplate('my-embed-id', makeProps(), 'https://example.com/embed');

    const doc = parseHTML(html);
    const iframe = doc.querySelector('#my-embed-id');
    expect(iframe).not.toBeNull();
    expect(iframe?.getAttribute('src')).toBe('https://example.com/embed');
  });

  it('includes positioning styles for floating-top positions', () => {
    const html = embedHTMLTemplate('el', makeProps(), 'https://example.com');

    expect(html).toContain(
      '#x-gist-floating-top, #x-gist-floating-top-left, #x-gist-floating-top-right'
    );
    expect(html).toContain('position: fixed');
    expect(html).toContain('top: 0px');
  });

  it('includes positioning styles for floating-bottom positions', () => {
    const html = embedHTMLTemplate('el', makeProps(), 'https://example.com');

    expect(html).toContain(
      '#x-gist-floating-bottom, #x-gist-floating-bottom-left, #x-gist-floating-bottom-right'
    );
    expect(html).toContain('bottom: 0px');
  });

  it('uses default 800px breakpoint when messageWidth <= 800', () => {
    const html = embedHTMLTemplate('el', makeProps({ messageWidth: 414 }), 'https://example.com');

    expect(html).toContain('@media (max-width: 800px)');
  });

  it('adjusts media query breakpoint when messageWidth > 800', () => {
    const html = embedHTMLTemplate('el', makeProps({ messageWidth: 1000 }), 'https://example.com');

    expect(html).toContain('@media (max-width: 1000px)');
    expect(html).not.toContain('@media (max-width: 800px)');
  });

  it('includes elementId in CSS selectors for transition styles', () => {
    const html = embedHTMLTemplate('my-embed-id', makeProps(), 'https://example.com');

    expect(html).toContain('#x-gist-top.my-embed-id');
    expect(html).toContain('#x-gist-bottom.my-embed-id');
    expect(html).toContain('#x-gist-floating-top.my-embed-id');
    expect(html).toContain('transition: height 0.1s ease-in-out');
  });

  it('includes width: 100% !important in media query for elementId selectors', () => {
    const html = embedHTMLTemplate('my-embed-id', makeProps(), 'https://example.com');

    expect(html).toContain('width: 100% !important');
  });

  it('contains the gist-embed-container wrapper div', () => {
    const html = embedHTMLTemplate('el', makeProps(), 'https://example.com');
    const doc = parseHTML(html);

    const container = doc.querySelector('#gist-embed-container');
    const embed = doc.querySelector('#gist-embed');
    expect(container).not.toBeNull();
    expect(embed).not.toBeNull();
  });
});
