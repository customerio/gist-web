import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  shouldRenderEmbed,
  recordEmbedShown,
  recordEmbedHidden,
  clearEmbedState,
  releaseEmbedClaim,
  renderEmbed,
  mountEmbedsFromDom,
  resetRenderedEmbeds,
} from './embed-manager';
import { embedMessage } from './message-manager';
import { resolveMessageProperties } from './gist-properties-manager';
import {
  setKeyToLocalStore,
  getKeyFromLocalStore,
  setKeyToSessionStore,
  getKeyFromSessionStore,
  clearKeyFromLocalStore,
  clearKeyFromSessionStore,
} from '../utilities/local-storage';
import type { EmbedDisplayConfig, EmbedPayload, GistMessage } from '../types';

vi.mock('../utilities/log', () => ({ log: vi.fn() }));

// localStorage is unavailable in this test environment, so the store is mocked
// with an in-memory stand-in that still round-trips values.
const localValues = new Map<string, unknown>();
const sessionValues = new Map<string, string>();

vi.mock('../utilities/local-storage', () => ({
  setKeyToLocalStore: vi.fn((key: string, value: unknown) => {
    localValues.set(key, value);
  }),
  getKeyFromLocalStore: vi.fn((key: string) => localValues.get(key) ?? null),
  clearKeyFromLocalStore: vi.fn((key: string) => {
    localValues.delete(key);
  }),
  setKeyToSessionStore: vi.fn((key: string, value: string) => {
    sessionValues.set(key, value);
  }),
  getKeyFromSessionStore: vi.fn((key: string) => sessionValues.get(key) ?? null),
  clearKeyFromSessionStore: vi.fn((key: string) => {
    sessionValues.delete(key);
  }),
}));

vi.mock('./message-manager', () => ({
  embedMessage: vi.fn((message: GistMessage) => ({ ...message, instanceId: 'instance-1' })),
}));

const embedId = 'emb_1';
const hiddenKey = `gist.web.embed.${embedId}.hidden`;
const shownKey = `gist.web.embed.${embedId}.shown`;
const sessionShownKey = `gist.web.embed.${embedId}.sessionShown`;

function makeMessage(embed?: EmbedDisplayConfig, id: string = embedId): GistMessage {
  return {
    messageId: 'gist-html-1',
    embedId: id,
    properties: { gist: { encodedMessageHtml: 'H4sIAAAA', embed } },
  };
}

function makePayload(overrides: Partial<EmbedPayload> = {}): EmbedPayload {
  return { v: 1, embedId, message: makeMessage(), ...overrides };
}

function propsFor(embed?: EmbedDisplayConfig) {
  return resolveMessageProperties(makeMessage(embed));
}

describe('embed-manager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localValues.clear();
    sessionValues.clear();
    resetRenderedEmbeds();
    document.body.innerHTML = '';
  });

  describe('shouldRenderEmbed', () => {
    it('always renders and touches no storage', () => {
      expect(shouldRenderEmbed(embedId, propsFor({ frequency: 'always' }))).toBe(true);
      expect(getKeyFromLocalStore).not.toHaveBeenCalled();
      expect(getKeyFromSessionStore).not.toHaveBeenCalled();
    });

    it('defaults to always when no embed config is present', () => {
      expect(shouldRenderEmbed(embedId, propsFor())).toBe(true);
    });

    it('suppresses an untilDismissed embed once it has been hidden', () => {
      const properties = propsFor({ frequency: 'untilDismissed' });
      expect(shouldRenderEmbed(embedId, properties)).toBe(true);
      localValues.set(hiddenKey, true);
      expect(shouldRenderEmbed(embedId, properties)).toBe(false);
    });

    it('suppresses an onceEver embed once it has been shown', () => {
      const properties = propsFor({ frequency: 'onceEver' });
      expect(shouldRenderEmbed(embedId, properties)).toBe(true);
      localValues.set(shownKey, true);
      expect(shouldRenderEmbed(embedId, properties)).toBe(false);
    });

    it('suppresses a oncePerSession embed once it has been shown this session', () => {
      const properties = propsFor({ frequency: 'oncePerSession' });
      expect(shouldRenderEmbed(embedId, properties)).toBe(true);
      sessionValues.set(sessionShownKey, 'true');
      expect(shouldRenderEmbed(embedId, properties)).toBe(false);
    });
  });

  describe('recordEmbedShown', () => {
    it('records onceEver in local storage', () => {
      recordEmbedShown(makeMessage({ frequency: 'onceEver' }));
      expect(setKeyToLocalStore).toHaveBeenCalledWith(shownKey, true);
    });

    it('records oncePerSession in session storage', () => {
      recordEmbedShown(makeMessage({ frequency: 'oncePerSession' }));
      expect(setKeyToSessionStore).toHaveBeenCalledWith(sessionShownKey, 'true');
    });

    it('records nothing for always or untilDismissed', () => {
      recordEmbedShown(makeMessage({ frequency: 'always' }));
      recordEmbedShown(makeMessage({ frequency: 'untilDismissed' }));
      expect(setKeyToLocalStore).not.toHaveBeenCalled();
      expect(setKeyToSessionStore).not.toHaveBeenCalled();
    });

    it('ignores a message that is not an embed', () => {
      recordEmbedShown({ messageId: 'gist-html-1' });
      expect(setKeyToLocalStore).not.toHaveBeenCalled();
    });
  });

  describe('recordEmbedHidden', () => {
    it('persists a dismissal indefinitely for untilDismissed', () => {
      recordEmbedHidden(makeMessage({ frequency: 'untilDismissed' }));
      expect(setKeyToLocalStore).toHaveBeenCalledWith(hiddenKey, true, null);
    });

    it('persists a dismissal for reshowAfterMinutes when set', () => {
      recordEmbedHidden(makeMessage({ frequency: 'untilDismissed', reshowAfterMinutes: 30 }));
      const [, , expiry] = vi.mocked(setKeyToLocalStore).mock.calls[0];
      const expected = Date.now() + 30 * 60 * 1000;
      expect((expiry as Date).getTime()).toBeGreaterThan(expected - 5000);
      expect((expiry as Date).getTime()).toBeLessThanOrEqual(expected + 5000);
    });

    it('forgets the close for an always embed', () => {
      recordEmbedHidden(makeMessage({ frequency: 'always' }));
      expect(setKeyToLocalStore).not.toHaveBeenCalled();
    });

    it('honours a snooze duration whatever the frequency rule', () => {
      recordEmbedHidden(makeMessage({ frequency: 'always' }), 15);
      const [key, , expiry] = vi.mocked(setKeyToLocalStore).mock.calls[0];
      expect(key).toBe(hiddenKey);
      expect((expiry as Date).getTime()).toBeGreaterThan(Date.now() + 14 * 60 * 1000);
    });
  });

  it('clearEmbedState forgets every stored key for the embed', () => {
    clearEmbedState(embedId);
    expect(clearKeyFromLocalStore).toHaveBeenCalledWith(hiddenKey);
    expect(clearKeyFromLocalStore).toHaveBeenCalledWith(shownKey);
    expect(clearKeyFromSessionStore).toHaveBeenCalledWith(sessionShownKey);
  });

  describe('renderEmbed', () => {
    it('renders into the default container selector for the embed id', async () => {
      document.body.innerHTML = `<div data-cio-embed="${embedId}"></div>`;

      const instanceId = await renderEmbed(makePayload());

      expect(instanceId).toBe('instance-1');
      expect(embedMessage).toHaveBeenCalledWith(
        expect.objectContaining({ embedId }),
        `[data-cio-embed="${embedId}"]`
      );
    });

    it('renders into an explicit target when the payload names one', async () => {
      document.body.innerHTML = '<div id="somewhere-else"></div>';

      await renderEmbed(makePayload({ target: '#somewhere-else' }));

      expect(embedMessage).toHaveBeenCalledWith(expect.anything(), '#somewhere-else');
    });

    it('applies display config from the payload to the message', async () => {
      document.body.innerHTML = `<div data-cio-embed="${embedId}"></div>`;

      const payload = makePayload({ display: { frequency: 'onceEver' } });
      await renderEmbed(payload);

      expect(payload.message.properties?.gist?.embed).toEqual({ frequency: 'onceEver' });
    });

    it('lets display config already on the message win over the payload', async () => {
      document.body.innerHTML = `<div data-cio-embed="${embedId}"></div>`;

      const payload = makePayload({
        display: { frequency: 'always' },
        message: makeMessage({ frequency: 'untilDismissed' }),
      });
      await renderEmbed(payload);

      expect(payload.message.properties?.gist?.embed?.frequency).toBe('untilDismissed');
    });

    it('skips a payload with no message html', async () => {
      document.body.innerHTML = `<div data-cio-embed="${embedId}"></div>`;

      const instanceId = await renderEmbed({
        embedId,
        message: { messageId: 'gist-html-1', properties: { gist: {} } },
      });

      expect(instanceId).toBeNull();
      expect(embedMessage).not.toHaveBeenCalled();
    });

    it('skips a payload with no embedId', async () => {
      expect(await renderEmbed({ embedId: '', message: makeMessage() })).toBeNull();
      expect(embedMessage).not.toHaveBeenCalled();
    });

    it('skips an embed suppressed by its frequency rule', async () => {
      document.body.innerHTML = `<div data-cio-embed="${embedId}"></div>`;
      localValues.set(hiddenKey, true);

      const instanceId = await renderEmbed(
        makePayload({ message: makeMessage({ frequency: 'untilDismissed' }) })
      );

      expect(instanceId).toBeNull();
      expect(embedMessage).not.toHaveBeenCalled();
    });

    it('renders an embed only once per page load', async () => {
      document.body.innerHTML = `<div data-cio-embed="${embedId}"></div>`;

      expect(await renderEmbed(makePayload())).toBe('instance-1');
      expect(await renderEmbed(makePayload())).toBeNull();
      expect(embedMessage).toHaveBeenCalledTimes(1);
    });

    it('can be mounted again once its container has been torn down', async () => {
      document.body.innerHTML = `<div data-cio-embed="${embedId}"></div>`;
      const message = makeMessage();

      expect(await renderEmbed(makePayload({ message }))).toBe('instance-1');

      // What a route change that replaced the container does: the message is
      // torn down, so a re-mount has to be able to render it again.
      releaseEmbedClaim(message);
      document.body.innerHTML = `<div data-cio-embed="${embedId}"></div>`;

      expect(await renderEmbed(makePayload())).toBe('instance-1');
      expect(embedMessage).toHaveBeenCalledTimes(2);
    });

    it('does not reopen an embed the visitor closed, even after a teardown', async () => {
      document.body.innerHTML = `<div data-cio-embed="${embedId}"></div>`;
      const message = makeMessage({ frequency: 'always' });

      expect(await renderEmbed(makePayload({ message }))).toBe('instance-1');

      recordEmbedHidden(message);
      releaseEmbedClaim(message);
      document.body.innerHTML = `<div data-cio-embed="${embedId}"></div>`;

      expect(await renderEmbed(makePayload())).toBeNull();
      expect(embedMessage).toHaveBeenCalledTimes(1);
    });

    it('stays retryable when the render was refused', async () => {
      document.body.innerHTML = `<div data-cio-embed="${embedId}"></div>`;
      vi.mocked(embedMessage).mockReturnValueOnce(null);

      expect(await renderEmbed(makePayload())).toBeNull();
      expect(await renderEmbed(makePayload())).toBe('instance-1');
    });

    it('waits for a container that mounts after the SDK runs', async () => {
      const pending = renderEmbed(makePayload());
      await Promise.resolve();
      expect(embedMessage).not.toHaveBeenCalled();

      const container = document.createElement('div');
      container.setAttribute('data-cio-embed', embedId);
      document.body.appendChild(container);

      expect(await pending).toBe('instance-1');
    });

    it('skips a container that already holds a message', async () => {
      document.body.innerHTML = `<div data-cio-embed="${embedId}"><iframe class="gist-frame"></iframe></div>`;

      expect(await renderEmbed(makePayload())).toBeNull();
      expect(embedMessage).not.toHaveBeenCalled();
    });
  });

  describe('mountEmbedsFromDom', () => {
    function payloadBlock(id: string, payload: unknown): string {
      return `<div data-cio-embed="${id}"></div>
        <script type="application/json" data-cio-embed-payload="${id}">${JSON.stringify(payload)}</script>`;
    }

    it('renders every payload block declared on the page', async () => {
      document.body.innerHTML =
        payloadBlock('emb_a', { embedId: 'emb_a', message: makeMessage(undefined, 'emb_a') }) +
        payloadBlock('emb_b', { embedId: 'emb_b', message: makeMessage(undefined, 'emb_b') });

      const instanceIds = await mountEmbedsFromDom();

      expect(instanceIds).toHaveLength(2);
      expect(embedMessage).toHaveBeenCalledTimes(2);
    });

    it('returns nothing when the page declares no embeds', async () => {
      expect(await mountEmbedsFromDom()).toEqual([]);
      expect(embedMessage).not.toHaveBeenCalled();
    });

    it('takes the embed id from the attribute when the payload omits it', async () => {
      document.body.innerHTML = payloadBlock('emb_c', {
        message: makeMessage(undefined, 'emb_c'),
      });

      await mountEmbedsFromDom();

      expect(embedMessage).toHaveBeenCalledWith(
        expect.objectContaining({ embedId: 'emb_c' }),
        '[data-cio-embed="emb_c"]'
      );
    });

    it('does not let one missing container hold up the others', async () => {
      // Only emb_f has a container; emb_e's would otherwise block it for the
      // whole target timeout.
      document.body.innerHTML =
        `<script type="application/json" data-cio-embed-payload="emb_e">${JSON.stringify({
          embedId: 'emb_e',
          message: makeMessage(undefined, 'emb_e'),
        })}</script>` +
        payloadBlock('emb_f', { embedId: 'emb_f', message: makeMessage(undefined, 'emb_f') });

      const pending = mountEmbedsFromDom();
      await vi.waitFor(() => expect(embedMessage).toHaveBeenCalledTimes(1));

      expect(embedMessage).toHaveBeenCalledWith(
        expect.objectContaining({ embedId: 'emb_f' }),
        '[data-cio-embed="emb_f"]'
      );

      // Let the straggler resolve so the mount settles rather than leaving its
      // wait dangling for the rest of the run.
      const late = document.createElement('div');
      late.setAttribute('data-cio-embed', 'emb_e');
      document.body.appendChild(late);
      expect(await pending).toHaveLength(2);
    });

    it('skips a malformed payload without failing the rest of the page', async () => {
      document.body.innerHTML =
        `<script type="application/json" data-cio-embed-payload="emb_bad">{ not json </script>` +
        payloadBlock('emb_d', { embedId: 'emb_d', message: makeMessage(undefined, 'emb_d') });

      const instanceIds = await mountEmbedsFromDom();

      expect(instanceIds).toEqual(['instance-1']);
      expect(embedMessage).toHaveBeenCalledTimes(1);
    });
  });
});
