import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  shouldRenderEmbed,
  recordEmbedShown,
  recordEmbedDismissed,
  snoozeEmbed,
  clearEmbedState,
  releaseEmbedClaim,
  renderEmbed,
  renderEmbeds,
  readEmbedPayloads,
  resetRenderedEmbeds,
} from './embed-manager';
import { embedMessage } from './message-manager';
import { setKeyToLocalStore, getKeyFromLocalStore } from '../utilities/local-storage';
import type { EmbedDisplayConfig, EmbedPayload, GistMessage } from '../types';

vi.mock('../utilities/log', () => ({ log: vi.fn() }));

// localStorage is unavailable in this test environment, so the store is mocked
// with an in-memory stand-in that still round-trips values.
const stored = new Map<string, unknown>();

vi.mock('../utilities/local-storage', () => ({
  setKeyToLocalStore: vi.fn((key: string, value: unknown) => {
    stored.set(key, value);
  }),
  getKeyFromLocalStore: vi.fn((key: string) => stored.get(key) ?? null),
}));

vi.mock('./message-manager', () => ({
  embedMessage: vi.fn((message: GistMessage) => ({ ...message, instanceId: 'instance-1' })),
}));

const STORE = 'gist.web.embeds';
const embedId = 'emb_1';

function state(): { hidden: Record<string, number | true> } {
  return (stored.get(STORE) as { hidden: Record<string, number | true> }) ?? { hidden: {} };
}

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

describe('embed-manager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stored.clear();
    resetRenderedEmbeds();
    document.body.innerHTML = '';
  });

  describe('stored state', () => {
    it('keeps every embed in one key rather than a key per embed', () => {
      recordEmbedShown(makeMessage({ frequency: 'onceEver' }, 'emb_a'));
      recordEmbedShown(makeMessage({ frequency: 'onceEver' }, 'emb_b'));
      snoozeEmbed(makeMessage(undefined, 'emb_c'), 30);

      expect([...stored.keys()]).toEqual([STORE]);
      expect(state().hidden).toEqual({
        emb_a: true,
        emb_b: true,
        emb_c: expect.any(Number),
      });
    });

    it('drops lapsed hide-until entries when read', () => {
      stored.set(STORE, { hidden: { [embedId]: Date.now() - 1000 } });

      expect(shouldRenderEmbed(embedId)).toBe(true);
      expect(state().hidden[embedId]).toBeUndefined();
    });

    it("does not lose another embed's state when writing", () => {
      snoozeEmbed(makeMessage(undefined, 'emb_a'), 10);
      recordEmbedShown(makeMessage({ frequency: 'onceEver' }, 'emb_b'));

      expect(state().hidden['emb_b']).toBe(true);
      expect(state().hidden['emb_a']).toBeGreaterThan(Date.now());
    });

    it('survives a store that returns nothing', () => {
      vi.mocked(getKeyFromLocalStore).mockReturnValueOnce(null);
      expect(shouldRenderEmbed(embedId)).toBe(true);
    });

    it('slides the expiry once per page load so never-again outlives it', () => {
      stored.set(STORE, { hidden: { [embedId]: true } });

      shouldRenderEmbed(embedId);
      shouldRenderEmbed('emb_other');

      // The store stamps a fixed expiry on write, so the record has to be
      // rewritten by visits rather than only by state changes — but once per
      // load, not once per embed.
      expect(setKeyToLocalStore).toHaveBeenCalledTimes(1);
      expect(setKeyToLocalStore).toHaveBeenCalledWith(STORE, {
        hidden: { [embedId]: true },
      });
    });

    it('writes nothing on a page whose visitor has no stored state', () => {
      shouldRenderEmbed(embedId);
      shouldRenderEmbed('emb_other');

      expect(setKeyToLocalStore).not.toHaveBeenCalled();
    });

    it('sheds lapsed entries when the record is refreshed', () => {
      stored.set(STORE, {
        hidden: {
          [embedId]: Date.now() - 1000,
          emb_live: Date.now() + 60_000,
          emb_forever: true,
        },
      });

      shouldRenderEmbed('emb_anything');

      expect(state().hidden).toEqual({ emb_live: expect.any(Number), emb_forever: true });
    });
  });

  describe('shouldRenderEmbed', () => {
    it('renders when nothing has been recorded', () => {
      expect(shouldRenderEmbed(embedId)).toBe(true);
      expect(setKeyToLocalStore).not.toHaveBeenCalled();
    });

    it('suppresses an embed hidden permanently', () => {
      stored.set(STORE, { hidden: { [embedId]: true } });
      expect(shouldRenderEmbed(embedId)).toBe(false);
    });

    it('suppresses an embed hidden until a future moment', () => {
      stored.set(STORE, { hidden: { [embedId]: Date.now() + 60_000 } });
      expect(shouldRenderEmbed(embedId)).toBe(false);
    });
  });

  describe('recordEmbedShown', () => {
    it('marks a onceEver embed as never to be shown again', () => {
      recordEmbedShown(makeMessage({ frequency: 'onceEver' }));
      expect(state().hidden[embedId]).toBe(true);
      expect(shouldRenderEmbed(embedId)).toBe(false);
    });

    it('records nothing for always or untilDismissed', () => {
      recordEmbedShown(makeMessage({ frequency: 'always' }));
      recordEmbedShown(makeMessage({ frequency: 'untilDismissed' }));
      expect(setKeyToLocalStore).not.toHaveBeenCalled();
    });

    it('ignores a message that is not an embed', () => {
      recordEmbedShown({ messageId: 'gist-html-1' });
      expect(setKeyToLocalStore).not.toHaveBeenCalled();
    });
  });

  describe('recordEmbedDismissed', () => {
    it('marks an untilDismissed embed as never to be shown again', () => {
      recordEmbedDismissed(makeMessage({ frequency: 'untilDismissed' }));
      expect(state().hidden[embedId]).toBe(true);
    });

    it('hides an untilDismissed embed for reshowAfterMinutes when set', () => {
      recordEmbedDismissed(makeMessage({ frequency: 'untilDismissed', reshowAfterMinutes: 30 }));

      expect(state().hidden[embedId]).toBeGreaterThan(Date.now() + 29 * 60 * 1000);
    });

    it('persists nothing for an always embed but keeps it closed for this page load', () => {
      const message = makeMessage({ frequency: 'always' });
      recordEmbedDismissed(message);

      expect(setKeyToLocalStore).not.toHaveBeenCalled();
      expect(shouldRenderEmbed(embedId)).toBe(false);
    });
  });

  describe('snoozeEmbed', () => {
    it('hides the embed until the snooze lapses, whatever the frequency rule', () => {
      snoozeEmbed(makeMessage({ frequency: 'always' }), 60);

      expect(state().hidden[embedId]).toBeGreaterThan(Date.now() + 59 * 60 * 1000);
      expect(shouldRenderEmbed(embedId)).toBe(false);
    });

    it('still suppresses the embed on a later page load', () => {
      snoozeEmbed(makeMessage({ frequency: 'always' }), 60);

      // A new page load keeps the store and forgets the in-memory sets.
      resetRenderedEmbeds();

      expect(shouldRenderEmbed(embedId)).toBe(false);
    });

    it('is not a dismissal, so it never marks the embed as never-show', () => {
      snoozeEmbed(makeMessage({ frequency: 'untilDismissed' }), 60);
      // A timestamp, not a permanent hide: the visitor asked to see it again.
      expect(state().hidden[embedId]).toBeGreaterThan(Date.now());
    });

    it('ignores a missing or non-positive duration', () => {
      snoozeEmbed(makeMessage(), 0);
      snoozeEmbed(makeMessage(), -5);
      expect(setKeyToLocalStore).not.toHaveBeenCalled();
    });
  });

  it('clearEmbedState forgets the embed everywhere', () => {
    stored.set(STORE, { hidden: { [embedId]: true, emb_other: true } });
    recordEmbedDismissed(makeMessage({ frequency: 'always' }));

    clearEmbedState(embedId);

    expect(state().hidden).toEqual({ emb_other: true });
    expect(shouldRenderEmbed(embedId)).toBe(true);
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

    it('pins the message inside its container, whatever display the payload asks for', async () => {
      document.body.innerHTML = `<div data-cio-embed="${embedId}"></div>`;

      const message = makeMessage();
      message.tooltipPosition = 'top';
      message.overlay = true;
      message.properties!.gist!.tooltipPosition = 'top';
      message.properties!.gist!.position = 'center';

      await renderEmbed(makePayload({ message }));

      expect(message.tooltipPosition).toBeUndefined();
      expect(message.overlay).toBe(false);
      expect(message.properties?.gist?.tooltipPosition).toBeUndefined();
      expect(message.properties?.gist?.position).toBeUndefined();
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

    it('skips an embed suppressed by its stored state', async () => {
      document.body.innerHTML = `<div data-cio-embed="${embedId}"></div>`;
      stored.set(STORE, { hidden: { [embedId]: true } });

      expect(await renderEmbed(makePayload())).toBeNull();
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

      // What a route change that replaced the container does.
      releaseEmbedClaim(message);
      document.body.innerHTML = `<div data-cio-embed="${embedId}"></div>`;

      expect(await renderEmbed(makePayload())).toBe('instance-1');
      expect(embedMessage).toHaveBeenCalledTimes(2);
    });

    it('does not reopen an embed the visitor closed, even after a teardown', async () => {
      document.body.innerHTML = `<div data-cio-embed="${embedId}"></div>`;
      const message = makeMessage({ frequency: 'always' });

      expect(await renderEmbed(makePayload({ message }))).toBe('instance-1');

      recordEmbedDismissed(message);
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

  describe('readEmbedPayloads', () => {
    function payloadBlock(id: string, payload: unknown): string {
      return `<div data-cio-embed="${id}"></div>
        <script type="application/json" data-cio-embed-payload="${id}">${JSON.stringify(payload)}</script>`;
    }

    it('reads every payload block without initializing or rendering anything', () => {
      document.body.innerHTML =
        payloadBlock('emb_a', { embedId: 'emb_a', message: makeMessage(undefined, 'emb_a') }) +
        payloadBlock('emb_b', { embedId: 'emb_b', message: makeMessage(undefined, 'emb_b') });

      const payloads = readEmbedPayloads();

      expect(payloads.map((p) => p.embedId)).toEqual(['emb_a', 'emb_b']);
      expect(embedMessage).not.toHaveBeenCalled();
    });

    it('returns nothing when the page declares no embeds', () => {
      expect(readEmbedPayloads()).toEqual([]);
    });

    it('takes the embed id from the attribute when the payload omits it', () => {
      document.body.innerHTML = payloadBlock('emb_c', { message: makeMessage(undefined, 'emb_c') });

      expect(readEmbedPayloads()[0].embedId).toBe('emb_c');
    });

    it('skips a malformed payload without losing the rest of the page', () => {
      document.body.innerHTML =
        `<script type="application/json" data-cio-embed-payload="emb_bad">{ not json </script>` +
        payloadBlock('emb_d', { embedId: 'emb_d', message: makeMessage(undefined, 'emb_d') });

      expect(readEmbedPayloads().map((p) => p.embedId)).toEqual(['emb_d']);
    });
  });

  describe('renderEmbeds', () => {
    it('does not let one missing container hold up the others', async () => {
      document.body.innerHTML = `<div data-cio-embed="emb_f"></div>`;
      const payloads = [
        { embedId: 'emb_e', message: makeMessage(undefined, 'emb_e') },
        { embedId: 'emb_f', message: makeMessage(undefined, 'emb_f') },
      ];

      const pending = renderEmbeds(payloads);
      await vi.waitFor(() => expect(embedMessage).toHaveBeenCalledTimes(1));

      expect(embedMessage).toHaveBeenCalledWith(
        expect.objectContaining({ embedId: 'emb_f' }),
        '[data-cio-embed="emb_f"]'
      );

      // Let the straggler resolve so the mount settles.
      const late = document.createElement('div');
      late.setAttribute('data-cio-embed', 'emb_e');
      document.body.appendChild(late);
      expect(await pending).toHaveLength(2);
    });
  });
});
