import { describe, it, expect } from 'vitest';
import { tooltipHTMLTemplate } from './tooltip';
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
    tooltipArrowColor: '#fff',
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

describe('tooltipHTMLTemplate', () => {
  it('returns HTML containing the iframe with the correct id and src', () => {
    const html = tooltipHTMLTemplate('my-tooltip-id', makeProps(), 'https://example.com/tooltip');

    const doc = parseHTML(html);
    const iframe = doc.querySelector('#my-tooltip-id');
    expect(iframe).not.toBeNull();
    expect(iframe?.getAttribute('src')).toBe('https://example.com/tooltip');
  });

  it('contains the gist-tooltip wrapper div', () => {
    const html = tooltipHTMLTemplate('el', makeProps(), 'https://example.com');
    const doc = parseHTML(html);

    const wrapper = doc.querySelector('#gist-tooltip');
    expect(wrapper).not.toBeNull();
  });

  it('contains the gist-tooltip-container div', () => {
    const html = tooltipHTMLTemplate('el', makeProps(), 'https://example.com');
    const doc = parseHTML(html);

    const container = doc.querySelector('#gist-tooltip-container');
    expect(container).not.toBeNull();
  });

  it('does not contain an overlay or backdrop element', () => {
    const html = tooltipHTMLTemplate('el', makeProps(), 'https://example.com');
    const doc = parseHTML(html);

    expect(doc.querySelector('#gist-overlay')).toBeNull();
    expect(doc.querySelector('.gist-background')).toBeNull();
  });

  it('uses messageProperties.messageWidth for the frame width', () => {
    const html = tooltipHTMLTemplate('el', makeProps({ messageWidth: 500 }), 'https://example.com');

    expect(html).toContain('width: 500px');
  });

  it('uses default 600px breakpoint when messageWidth <= 600', () => {
    const html = tooltipHTMLTemplate('el', makeProps({ messageWidth: 414 }), 'https://example.com');

    expect(html).toContain('@media (max-width: 600px)');
  });

  it('adjusts media query breakpoint when messageWidth > 600', () => {
    const html = tooltipHTMLTemplate('el', makeProps({ messageWidth: 800 }), 'https://example.com');

    expect(html).toContain('@media (max-width: 800px)');
    expect(html).not.toContain('@media (max-width: 600px)');
  });

  it('has z-index below modal z-index', () => {
    const html = tooltipHTMLTemplate('el', makeProps(), 'https://example.com');

    expect(html).toContain('z-index: 9999999');
    expect(html).not.toContain('z-index: 9999999998');
    expect(html).not.toContain('z-index: 9999999999');
  });

  it('uses gist-arrow-bottom (arrow points down) when tooltipPosition is top', () => {
    const html = tooltipHTMLTemplate(
      'el',
      makeProps({ tooltipPosition: 'top' }),
      'https://example.com'
    );
    const doc = parseHTML(html);

    const arrow = doc.querySelector('.gist-tooltip-arrow.gist-arrow-bottom');
    expect(arrow).not.toBeNull();
  });

  it('uses gist-arrow-top (arrow points up) when tooltipPosition is bottom', () => {
    const html = tooltipHTMLTemplate(
      'el',
      makeProps({ tooltipPosition: 'bottom' }),
      'https://example.com'
    );
    const doc = parseHTML(html);

    const arrow = doc.querySelector('.gist-tooltip-arrow.gist-arrow-top');
    expect(arrow).not.toBeNull();
  });

  it('uses gist-arrow-right (arrow points right) when tooltipPosition is left', () => {
    const html = tooltipHTMLTemplate(
      'el',
      makeProps({ tooltipPosition: 'left' }),
      'https://example.com'
    );
    const doc = parseHTML(html);

    const arrow = doc.querySelector('.gist-tooltip-arrow.gist-arrow-right');
    expect(arrow).not.toBeNull();
  });

  it('uses gist-arrow-left (arrow points left) when tooltipPosition is right', () => {
    const html = tooltipHTMLTemplate(
      'el',
      makeProps({ tooltipPosition: 'right' }),
      'https://example.com'
    );
    const doc = parseHTML(html);

    const arrow = doc.querySelector('.gist-tooltip-arrow.gist-arrow-left');
    expect(arrow).not.toBeNull();
  });

  it('defaults to gist-arrow-bottom when tooltipPosition is empty', () => {
    const html = tooltipHTMLTemplate(
      'el',
      makeProps({ tooltipPosition: '' }),
      'https://example.com'
    );
    const doc = parseHTML(html);

    const arrow = doc.querySelector('.gist-tooltip-arrow.gist-arrow-bottom');
    expect(arrow).not.toBeNull();
  });

  it('defaults to gist-arrow-bottom when tooltipPosition is unrecognized', () => {
    const html = tooltipHTMLTemplate(
      'el',
      makeProps({ tooltipPosition: 'diagonal' }),
      'https://example.com'
    );
    const doc = parseHTML(html);

    const arrow = doc.querySelector('.gist-tooltip-arrow.gist-arrow-bottom');
    expect(arrow).not.toBeNull();
  });

  it('uses tooltipArrowColor from message properties in arrow styles', () => {
    const html = tooltipHTMLTemplate(
      'el',
      makeProps({ tooltipPosition: 'top', tooltipArrowColor: '#003780' }),
      'https://example.com'
    );

    expect(html).toContain('border-top: 10px solid #003780');
  });

  it('defaults arrow color to #fff when tooltipArrowColor is not customized', () => {
    const html = tooltipHTMLTemplate(
      'el',
      makeProps({ tooltipPosition: 'top' }),
      'https://example.com'
    );

    expect(html).toContain('border-top: 10px solid #fff');
  });

  it('uses position: absolute on the wrapper', () => {
    const html = tooltipHTMLTemplate('el', makeProps(), 'https://example.com');

    expect(html).toContain('#gist-tooltip');
    expect(html).toContain('position: absolute');
  });
});
