import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  fetchMessageByInstanceId,
  isQueueIdAlreadyShowing,
  fetchMessageByElementId,
  removeMessageByInstanceId,
  updateMessageByInstanceId,
  mapOverlayPositionToElementId,
  getCurrentDisplayType,
  hasDisplayChanged,
  applyDisplaySettings,
} from './message-utils';
import type { GistMessage, DisplaySettings } from '../types';

vi.mock('../gist', () => ({
  default: {
    currentMessages: [] as GistMessage[],
  },
}));

vi.mock('../managers/page-component-manager', () => ({
  positions: [
    'x-gist-top',
    'x-gist-floating-top',
    'x-gist-bottom',
    'x-gist-floating-bottom',
    'x-gist-floating-bottom-left',
    'x-gist-floating-bottom-right',
    'x-gist-floating-top-left',
    'x-gist-floating-top-right',
  ],
}));

vi.mock('../managers/gist-properties-manager', () => ({
  resolveMessageProperties: vi.fn((message: GistMessage) => {
    const gist = message?.properties?.gist;
    return {
      isEmbedded: !!gist?.elementId,
      elementId: gist?.elementId || '',
      hasRouteRule: false,
      routeRule: '',
      position: gist?.position || '',
      hasPosition: !!gist?.position,
      shouldScale: false,
      campaignId: null,
      messageWidth: gist?.messageWidth ?? 414,
      overlayColor: gist?.overlayColor || '#00000033',
      persistent: false,
      exitClick: !!gist?.exitClick,
      hasCustomWidth: (gist?.messageWidth ?? 0) > 0,
    };
  }),
}));

vi.mock('./log', () => ({ log: vi.fn() }));

import Gist from '../gist';

function makeMessage(overrides: Partial<GistMessage> = {}): GistMessage {
  return {
    messageId: 'msg-1',
    instanceId: 'inst-1',
    queueId: 'queue-1',
    ...overrides,
  };
}

beforeEach(() => {
  Gist.currentMessages = [];
});

describe('fetchMessageByInstanceId', () => {
  it('returns the correct message when found', () => {
    const msg = makeMessage({ instanceId: 'abc' });
    Gist.currentMessages = [msg];
    expect(fetchMessageByInstanceId('abc')).toBe(msg);
  });

  it('returns undefined when not found', () => {
    Gist.currentMessages = [makeMessage({ instanceId: 'abc' })];
    expect(fetchMessageByInstanceId('xyz')).toBeUndefined();
  });
});

describe('isQueueIdAlreadyShowing', () => {
  it('returns true when a matching message exists', () => {
    Gist.currentMessages = [makeMessage({ queueId: 'q-1' })];
    expect(isQueueIdAlreadyShowing('q-1')).toBe(true);
  });

  it('returns false when no matching message exists', () => {
    Gist.currentMessages = [makeMessage({ queueId: 'q-1' })];
    expect(isQueueIdAlreadyShowing('q-2')).toBe(false);
  });

  it('returns false for undefined queueId', () => {
    Gist.currentMessages = [makeMessage({ queueId: 'q-1' })];
    expect(isQueueIdAlreadyShowing(undefined)).toBe(false);
  });
});

describe('fetchMessageByElementId', () => {
  it('returns null for null elementId', () => {
    expect(fetchMessageByElementId(null)).toBeNull();
  });

  it('returns null for undefined elementId', () => {
    expect(fetchMessageByElementId(undefined)).toBeNull();
  });

  it('returns the matching message when found', () => {
    const msg = makeMessage({ elementId: 'my-element' });
    Gist.currentMessages = [msg];
    expect(fetchMessageByElementId('my-element')).toBe(msg);
  });

  it('returns null when no message matches', () => {
    Gist.currentMessages = [makeMessage({ elementId: 'other-element' })];
    expect(fetchMessageByElementId('my-element')).toBeNull();
  });
});

describe('removeMessageByInstanceId', () => {
  it('removes only the matching message', () => {
    const msg1 = makeMessage({ instanceId: 'inst-1' });
    const msg2 = makeMessage({ instanceId: 'inst-2', messageId: 'msg-2' });
    Gist.currentMessages = [msg1, msg2];

    removeMessageByInstanceId('inst-1');

    expect(Gist.currentMessages).toHaveLength(1);
    expect(Gist.currentMessages[0]).toBe(msg2);
  });

  it('does nothing when instanceId not found', () => {
    const msg = makeMessage({ instanceId: 'inst-1' });
    Gist.currentMessages = [msg];

    removeMessageByInstanceId('nonexistent');

    expect(Gist.currentMessages).toHaveLength(1);
  });
});

describe('updateMessageByInstanceId', () => {
  it('replaces the message in the array', () => {
    const original = makeMessage({ instanceId: 'inst-1' });
    const updated = makeMessage({ instanceId: 'inst-1', queueId: 'new-queue' });
    Gist.currentMessages = [original];

    updateMessageByInstanceId('inst-1', updated);

    expect(Gist.currentMessages).toHaveLength(1);
    expect(Gist.currentMessages[0]).toBe(updated);
  });
});

describe('mapOverlayPositionToElementId', () => {
  it.each([
    ['topLeft', 'x-gist-floating-top-left'],
    ['topCenter', 'x-gist-floating-top'],
    ['topRight', 'x-gist-floating-top-right'],
    ['bottomLeft', 'x-gist-floating-bottom-left'],
    ['bottomCenter', 'x-gist-floating-bottom'],
    ['bottomRight', 'x-gist-floating-bottom-right'],
  ])('maps %s to %s', (input, expected) => {
    expect(mapOverlayPositionToElementId(input)).toBe(expected);
  });

  it('defaults to topCenter for invalid input', () => {
    expect(mapOverlayPositionToElementId('invalid')).toBe('x-gist-floating-top');
  });

  it('defaults to topCenter for undefined input', () => {
    expect(mapOverlayPositionToElementId(undefined)).toBe('x-gist-floating-top');
  });
});

describe('getCurrentDisplayType', () => {
  it("returns 'tooltip' when tooltipPosition is set", () => {
    const msg = makeMessage({ tooltipPosition: 'top' });
    expect(getCurrentDisplayType(msg)).toBe('tooltip');
  });

  it("returns 'modal' when overlay is true", () => {
    const msg = makeMessage({ overlay: true });
    expect(getCurrentDisplayType(msg)).toBe('modal');
  });

  it("returns 'overlay' when elementId is a known position element", () => {
    const msg = makeMessage({
      overlay: false,
      elementId: 'x-gist-floating-top',
    });
    expect(getCurrentDisplayType(msg)).toBe('overlay');
  });

  it("returns 'inline' when elementId is a custom element", () => {
    const msg = makeMessage({ overlay: false, elementId: 'my-custom-div' });
    expect(getCurrentDisplayType(msg)).toBe('inline');
  });

  it("returns 'modal' as default when no overlay or elementId", () => {
    const msg = makeMessage({ overlay: false, elementId: undefined });
    expect(getCurrentDisplayType(msg)).toBe('modal');
  });
});

describe('hasDisplayChanged', () => {
  it('returns false when displayType is undefined', () => {
    const msg = makeMessage({ overlay: true });
    expect(hasDisplayChanged(msg, {})).toBe(false);
  });

  it('returns true when displayType changes', () => {
    const msg = makeMessage({ overlay: true });
    expect(hasDisplayChanged(msg, { displayType: 'overlay' })).toBe(true);
  });

  it('returns true when modal position changes', () => {
    const msg = makeMessage({ overlay: true, position: 'center' });
    expect(hasDisplayChanged(msg, { displayType: 'modal', modalPosition: 'bottom' })).toBe(true);
  });

  it('returns true when overlay position changes', () => {
    const msg = makeMessage({
      overlay: false,
      elementId: 'x-gist-floating-top',
    });
    expect(
      hasDisplayChanged(msg, {
        displayType: 'overlay',
        overlayPosition: 'bottomCenter',
      })
    ).toBe(true);
  });

  it('returns true when overlayColor changes for modal', () => {
    const msg = makeMessage({
      overlay: true,
      properties: { gist: { overlayColor: '#00000033' } },
    });
    expect(
      hasDisplayChanged(msg, {
        displayType: 'modal',
        overlayColor: '#ff000033',
      })
    ).toBe(true);
  });

  it('returns true when dismissOutsideClick changes for modal', () => {
    const msg = makeMessage({
      overlay: true,
      properties: { gist: { exitClick: false } },
    });
    expect(
      hasDisplayChanged(msg, {
        displayType: 'modal',
        dismissOutsideClick: true,
      })
    ).toBe(true);
  });

  it('returns false when nothing changed for modal', () => {
    const msg = makeMessage({
      overlay: true,
      position: 'center',
      properties: { gist: { overlayColor: '#00000033', exitClick: false } },
    });
    const settings: DisplaySettings = {
      displayType: 'modal',
      modalPosition: 'center',
      overlayColor: '#00000033',
      dismissOutsideClick: false,
    };
    expect(hasDisplayChanged(msg, settings)).toBe(false);
  });

  it('returns false when nothing changed for overlay', () => {
    const msg = makeMessage({
      overlay: false,
      elementId: 'x-gist-floating-top',
    });
    expect(
      hasDisplayChanged(msg, {
        displayType: 'overlay',
        overlayPosition: 'topCenter',
      })
    ).toBe(false);
  });

  it('returns true when inline elementSelector changes', () => {
    const msg = makeMessage({ overlay: false, elementId: 'my-div' });
    expect(
      hasDisplayChanged(msg, {
        displayType: 'inline',
        elementSelector: 'other-div',
      })
    ).toBe(true);
  });

  it('returns true when tooltip position changes', () => {
    const msg = makeMessage({ tooltipPosition: 'top', elementId: 'my-element' });
    expect(
      hasDisplayChanged(msg, {
        displayType: 'tooltip',
        tooltipPosition: 'bottom',
      })
    ).toBe(true);
  });

  it('returns true when tooltip elementSelector changes', () => {
    const msg = makeMessage({ tooltipPosition: 'top', elementId: 'my-element' });
    expect(
      hasDisplayChanged(msg, {
        displayType: 'tooltip',
        tooltipPosition: 'top',
        elementSelector: 'other-element',
      })
    ).toBe(true);
  });

  it('returns false when nothing changed for tooltip', () => {
    const msg = makeMessage({ tooltipPosition: 'top', elementId: 'my-element' });
    expect(
      hasDisplayChanged(msg, {
        displayType: 'tooltip',
        tooltipPosition: 'top',
        elementSelector: 'my-element',
      })
    ).toBe(false);
  });

  it('returns true when maxWidth changes', () => {
    const msg = makeMessage({
      overlay: true,
      properties: { gist: { messageWidth: 414 } },
    });
    expect(hasDisplayChanged(msg, { displayType: 'modal', maxWidth: 600 })).toBe(true);
  });
});

describe('applyDisplaySettings', () => {
  it('sets overlay: true and clears elementId for modal type', () => {
    const msg = makeMessage({ overlay: false, elementId: 'some-element' });
    applyDisplaySettings(msg, { displayType: 'modal' });

    expect(msg.overlay).toBe(true);
    expect(msg.elementId).toBeNull();
    expect(msg.position).toBe('center');
  });

  it('sets correct elementId for overlay type', () => {
    const msg = makeMessage({ overlay: true });
    applyDisplaySettings(msg, {
      displayType: 'overlay',
      overlayPosition: 'bottomRight',
    });

    expect(msg.overlay).toBe(false);
    expect(msg.elementId).toBe('x-gist-floating-bottom-right');
    expect(msg.position).toBeNull();
  });

  it('sets custom elementId for inline type', () => {
    const msg = makeMessage({ overlay: true });
    applyDisplaySettings(msg, {
      displayType: 'inline',
      elementSelector: 'my-container',
    });

    expect(msg.overlay).toBe(false);
    expect(msg.elementId).toBe('my-container');
    expect(msg.position).toBeNull();
  });

  it('sets custom elementId and tooltipPosition for tooltip type', () => {
    const msg = makeMessage({ overlay: true });
    applyDisplaySettings(msg, {
      displayType: 'tooltip',
      elementSelector: 'my-element',
      tooltipPosition: 'top',
    });

    expect(msg.overlay).toBe(false);
    expect(msg.elementId).toBe('my-element');
    expect(msg.tooltipPosition).toBe('top');
    expect(msg.properties?.gist?.tooltipPosition).toBe('top');
    expect(msg.position).toBeNull();
  });

  it('clears tooltipPosition when switching from tooltip to modal', () => {
    const msg = makeMessage({ tooltipPosition: 'top', elementId: 'my-element' });
    applyDisplaySettings(msg, { displayType: 'modal' });

    expect(msg.tooltipPosition).toBeUndefined();
    expect(msg.properties?.gist?.tooltipPosition).toBeUndefined();
    expect(getCurrentDisplayType(msg)).toBe('modal');
  });

  it('clears tooltipPosition when switching from tooltip to overlay', () => {
    const msg = makeMessage({ tooltipPosition: 'top', elementId: 'my-element' });
    applyDisplaySettings(msg, { displayType: 'overlay', overlayPosition: 'topCenter' });

    expect(msg.tooltipPosition).toBeUndefined();
    expect(msg.properties?.gist?.tooltipPosition).toBeUndefined();
    expect(getCurrentDisplayType(msg)).toBe('overlay');
  });

  it('clears tooltipPosition when switching from tooltip to inline', () => {
    const msg = makeMessage({ tooltipPosition: 'top', elementId: 'my-element' });
    applyDisplaySettings(msg, { displayType: 'inline', elementSelector: 'my-container' });

    expect(msg.tooltipPosition).toBeUndefined();
    expect(msg.properties?.gist?.tooltipPosition).toBeUndefined();
    expect(getCurrentDisplayType(msg)).toBe('inline');
  });

  it('clears custom width for wide overlay positions', () => {
    const msg = makeMessage({
      overlay: false,
      properties: { gist: { messageWidth: 500 } },
    });
    applyDisplaySettings(msg, {
      displayType: 'overlay',
      overlayPosition: 'topCenter',
    });

    expect(msg.properties?.gist?.messageWidth).toBeUndefined();
  });

  it('sets messageWidth when not a wide overlay position', () => {
    const msg = makeMessage({ overlay: false });
    applyDisplaySettings(msg, {
      displayType: 'overlay',
      overlayPosition: 'topLeft',
      maxWidth: 400,
    });

    expect(msg.properties?.gist?.messageWidth).toBe(400);
  });

  it('sets overlayColor when provided', () => {
    const msg = makeMessage({ overlay: true });
    applyDisplaySettings(msg, {
      displayType: 'modal',
      overlayColor: '#ff0000',
    });

    expect(msg.properties?.gist?.overlayColor).toBe('#ff0000');
  });

  it('sets exitClick when dismissOutsideClick is provided', () => {
    const msg = makeMessage({ overlay: true });
    applyDisplaySettings(msg, {
      displayType: 'modal',
      dismissOutsideClick: true,
    });

    expect(msg.properties?.gist?.exitClick).toBe(true);
  });

  it('initializes properties.gist if missing', () => {
    const msg: GistMessage = { messageId: 'msg-1' };
    applyDisplaySettings(msg, { displayType: 'modal' });

    expect(msg.properties?.gist).toBeDefined();
    expect(msg.overlay).toBe(true);
  });
});
