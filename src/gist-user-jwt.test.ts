import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type GistClass from './gist';
import type { GistConfig } from './types';

// The user JWT end to end through the public API: the real queue loop, storage,
// managers and services, with only fetch, EventSource and the clock faked.

const QUEUE_PATH = '/api/v4/users';
const NEXT_PULL_KEY = 'gist.web.userQueueNextPullCheck';
const JWT_HEADER = 'X-CIO-User-JWT';
const JSON_TYPE = { 'content-type': 'application/json' };

interface Answer {
  response: () => Response;
  latencyMs?: number;
}

type FetchInit = { method?: string; headers: Record<string, string> };

let Gist: typeof GistClass;
let fetchMock: ReturnType<typeof vi.fn<(url: string, init: FetchInit) => Promise<Response>>>;
let queueAnswers: Answer[];
let otherAnswers: Answer[];

function queueOk(headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify({ inAppMessages: [], inboxMessages: [] }), {
    status: 200,
    headers: {
      ...JSON_TYPE,
      'x-gist-queue-polling-interval': '10',
      'x-cio-use-sse': 'False',
      ...headers,
    },
  });
}

function rejected(reason?: string): Response {
  const body = reason ? JSON.stringify({ error: 'user_jwt_rejected', reason }) : '';
  return new Response(body, { status: 401, headers: JSON_TYPE });
}

function ok(): Response {
  return new Response('{}', { status: 200, headers: JSON_TYPE });
}

// Queue fetches answer after 50 ms of fake time by default, so an answer lands
// after setup() resolves, as it does over a real network. Other calls answer at
// once, so a test can await them without advancing the clock.
function answer(next: Answer | undefined, fallback: () => Response): Promise<Response> {
  const response = (next?.response ?? fallback)();
  const latencyMs = next?.latencyMs ?? 50;
  if (latencyMs === 0) return Promise.resolve(response);
  return new Promise((resolve) => setTimeout(() => resolve(response), latencyMs));
}

const calls = (path: string) => fetchMock.mock.calls.filter(([url]) => url.includes(path));
const queueCalls = () => calls(QUEUE_PATH);
const jwtSent = (call: [string, FetchInit]) => call[1].headers[JWT_HEADER];

async function advance(ms: number): Promise<void> {
  await vi.advanceTimersByTimeAsync(ms);
}

async function setup(config: Partial<GistConfig> = {}): Promise<void> {
  await Gist.setup({ siteId: 'site-1', env: 'prod', ...config });
}

async function holdUserToken(userToken: string): Promise<void> {
  const { setKeyToLocalStore } = await import('./utilities/local-storage');
  setKeyToLocalStore('gist.web.userToken', userToken);
}

function onRejected(listener: (event: unknown) => void = () => {}) {
  const spy = vi.fn(listener);
  Gist.events.on('userJwtRejected', spy);
  return spy;
}

describe('the user JWT, end to end', () => {
  beforeEach(async () => {
    vi.useFakeTimers();
    vi.resetModules();
    localStorage.clear();
    sessionStorage.clear();
    document.body.innerHTML = '';
    queueAnswers = [];
    otherAnswers = [];
    fetchMock = vi.fn((url: string) =>
      url.includes(QUEUE_PATH)
        ? answer(queueAnswers.shift(), queueOk)
        : answer(otherAnswers.shift() ?? { response: ok, latencyMs: 0 }, ok)
    );
    vi.stubGlobal('fetch', fetchMock);
    Gist = (await import('./gist')).default;
    await holdUserToken('user-1');
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("takes the JWT before setup() and sends it with setup's first queue fetch", async () => {
    expect(() => Gist.setUserJwt('jwt-a')).not.toThrow();

    await setup();

    expect(queueCalls()).toHaveLength(1);
    expect(jwtSent(queueCalls()[0])).toBe('jwt-a');
  });

  it('sends the JWT with the queue fetch, an inbox open-state update and a view log', async () => {
    Gist.setUserJwt('jwt-a');
    await setup();
    await advance(100);

    await Gist.updateInboxMessageOpenState('queue-1', true);
    await Gist.removeInboxMessage('queue-1');

    expect(jwtSent(queueCalls()[0])).toBe('jwt-a');
    expect(jwtSent(calls('/api/v1/messages/queue-1')[0])).toBe('jwt-a');
    expect(jwtSent(calls('/api/v1/logs/queue/queue-1')[0])).toBe('jwt-a');
  });

  it('sends no JWT after setUserJwt(null), a switch of user or clearUserToken()', async () => {
    Gist.setUserJwt('jwt-a');
    await setup({ useAnonymousSession: true });
    await advance(100);

    Gist.setUserJwt(null);
    await Gist.updateInboxMessageOpenState('queue-1', true);

    Gist.setUserJwt('jwt-a');
    await Gist.setUserToken('user-2');
    await Gist.updateInboxMessageOpenState('queue-2', true);

    Gist.setUserJwt('jwt-b');
    await Gist.clearUserToken();
    await advance(11_000);

    expect(jwtSent(calls('/api/v1/messages/queue-1')[0])).toBeUndefined();
    expect(jwtSent(calls('/api/v1/messages/queue-2')[0])).toBeUndefined();
    const guestFetch = queueCalls()[queueCalls().length - 1];
    expect(guestFetch[1].headers['X-Gist-User-Anonymous']).toBe('true');
    expect(jwtSent(guestFetch)).toBeUndefined();
  });

  describe('when Gist rejects the JWT', () => {
    it('tells the app once, pauses this tab and leaves the shared schedule alone', async () => {
      Gist.setUserJwt('jwt-a');
      queueAnswers.push({ response: () => rejected('expired') });
      await setup();
      const listener = onRejected();

      await advance(100);

      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith({ reason: 'expired' });
      expect(localStorage.getItem(NEXT_PULL_KEY)).toBeNull();

      await advance(60_000);
      expect(queueCalls()).toHaveLength(1);

      otherAnswers.push({ response: () => rejected('expired'), latencyMs: 0 });
      await Gist.removeInboxMessage('queue-1');
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('leaves the reason out when the 401 has no body', async () => {
      queueAnswers.push({ response: () => rejected() });
      await setup();
      const listener = onRejected();

      await advance(100);

      expect(listener).toHaveBeenCalledWith({});
    });

    it('fetches straight away for the first new JWT, then once per polling interval', async () => {
      // A good answer first, so this tab knows Gist's polling interval: 10 seconds.
      Gist.setUserJwt('jwt-0');
      await setup();
      await advance(100);
      let next = 1;
      onRejected(() => Gist.setUserJwt(`jwt-${next++}`));
      for (let i = 0; i < 5; i++) {
        queueAnswers.push({ response: () => rejected('bad_subject') });
      }

      // The schedule's next fetch, at about 11 s, is rejected; the handler answers each
      // rejection with another JWT.
      await advance(11_000);
      expect(queueCalls()).toHaveLength(2);
      await advance(1_000);
      expect(queueCalls()).toHaveLength(3);
      expect(jwtSent(queueCalls()[2])).toBe('jwt-1');

      await advance(9_000);
      expect(queueCalls()).toHaveLength(3);
      await advance(1_000);
      expect(queueCalls()).toHaveLength(4);
      expect(jwtSent(queueCalls()[3])).toBe('jwt-2');
    });

    it('makes one queue request for two new JWTs within a polling interval', async () => {
      Gist.setUserJwt('jwt-a');
      queueAnswers.push({ response: () => rejected('expired') });
      queueAnswers.push({ response: () => rejected('expired') });
      await setup();
      await advance(100);

      Gist.setUserJwt('jwt-b');
      Gist.setUserJwt('jwt-c');
      await advance(1_000);
      expect(queueCalls()).toHaveLength(2);
      expect(jwtSent(queueCalls()[1])).toBe('jwt-c');

      Gist.setUserJwt('jwt-d');
      await advance(8_000);
      expect(queueCalls()).toHaveLength(2);
    });

    it('discards a late answer to the previous JWT and fetches with the new one on the next tick', async () => {
      Gist.setUserJwt('jwt-a');
      queueAnswers.push({ response: () => rejected('expired'), latencyMs: 1_500 });
      await setup();
      const listener = onRejected();

      Gist.setUserJwt('jwt-b');
      await advance(1_600);

      expect(listener).not.toHaveBeenCalled();
      expect(localStorage.getItem(NEXT_PULL_KEY)).toBeNull();
      expect(queueCalls()).toHaveLength(1);

      await advance(1_000);
      expect(queueCalls()).toHaveLength(2);
      expect(jwtSent(queueCalls()[1])).toBe('jwt-b');
    });
  });

  describe('changes of user', () => {
    it('the token already held keeps the JWT, the pause and the count', async () => {
      Gist.setUserJwt('jwt-a');
      queueAnswers.push({ response: () => rejected('expired') });
      await setup();
      const listener = onRejected();
      await advance(100);

      await Gist.setUserToken('user-1');
      await advance(30_000);
      otherAnswers.push({ response: () => rejected('expired'), latencyMs: 0 });
      await Gist.removeInboxMessage('queue-1');

      expect(queueCalls()).toHaveLength(1);
      expect(jwtSent(calls('/api/v1/logs/queue/queue-1')[0])).toBe('jwt-a');
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('another identified user drops the JWT, lifts the pause and starts the count over', async () => {
      Gist.setUserJwt('jwt-a');
      queueAnswers.push({ response: () => rejected('expired') });
      queueAnswers.push({ response: () => rejected('missing') });
      await setup();
      const listener = onRejected();
      await advance(100);

      await Gist.setUserToken('user-2');
      await advance(1_100);

      expect(queueCalls()).toHaveLength(2);
      expect(jwtSent(queueCalls()[1])).toBeUndefined();
      expect(listener).toHaveBeenCalledTimes(2);
      expect(listener).toHaveBeenLastCalledWith({ reason: 'missing' });
    });

    it('signing in from no token keeps a JWT set just before it', async () => {
      localStorage.clear();
      await setup();
      expect(queueCalls()).toHaveLength(0);

      Gist.setUserJwt('jwt-a');
      await Gist.setUserToken('user-1');

      expect(queueCalls()).toHaveLength(1);
      expect(jwtSent(queueCalls()[0])).toBe('jwt-a');
    });

    it('signing in from the guest token lifts the pause and starts the count over', async () => {
      localStorage.clear();
      queueAnswers.push({ response: () => rejected('missing') });
      queueAnswers.push({ response: () => rejected('missing') });
      await setup({ useAnonymousSession: true });
      const listener = onRejected();
      await advance(100);
      await advance(30_000);
      expect(queueCalls()).toHaveLength(1);

      await Gist.setUserToken('user-1');
      await advance(1_100);

      expect(queueCalls()).toHaveLength(2);
      expect(listener).toHaveBeenCalledTimes(2);
    });

    it('clearUserToken() drops the JWT, lifts the pause and starts the count over', async () => {
      Gist.setUserJwt('jwt-a');
      queueAnswers.push({ response: () => rejected('expired') });
      queueAnswers.push({ response: () => rejected('missing') });
      await setup({ useAnonymousSession: true });
      const listener = onRejected();
      await advance(100);

      await Gist.clearUserToken();
      await advance(1_100);

      expect(queueCalls()).toHaveLength(2);
      expect(jwtSent(queueCalls()[1])).toBeUndefined();
      expect(listener).toHaveBeenCalledTimes(2);
    });

    it('keeps a JWT set right after clearUserToken() without awaiting it', async () => {
      await setup();
      await advance(100);

      Gist.setUserJwt('jwt-a');
      const signingOut = Gist.clearUserToken();
      Gist.setUserJwt('jwt-next');
      await signingOut;
      await holdUserToken('user-2');
      await Gist.updateInboxMessageOpenState('queue-1', true);

      expect(jwtSent(calls('/api/v1/messages/queue-1')[0])).toBe('jwt-next');
    });
  });

  it('keeps the JWT out of console lines, storage, URLs and the debug overlay, with logging on', async () => {
    const secret = 'eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJjaW9fMWEyYjNjIn0.c2lnbmF0dXJl';
    const consoleSpies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((method) =>
      vi.spyOn(console, method).mockImplementation(() => {})
    );
    const opened = vi.fn();
    vi.stubGlobal(
      'EventSource',
      class {
        constructor(url: string) {
          opened(url);
        }
        addEventListener() {}
        close() {}
      }
    );

    Gist.setUserJwt(secret);
    queueAnswers.push({ response: () => rejected('expired') });
    queueAnswers.push({ response: () => queueOk({ 'x-cio-use-sse': 'True' }) });
    await setup({ logging: true });
    const { initDebugOverlay } = await import('./managers/debug-overlay-manager');
    initDebugOverlay();
    await advance(100);
    Gist.setUserJwt(secret);
    await advance(1_100);
    await advance(1_000);
    await Gist.updateInboxMessageOpenState('queue-1', true);
    await Gist.removeInboxMessage('queue-1');
    await Gist.setUserToken('user-1');
    await advance(1_100);

    const printed = consoleSpies.flatMap((spy) => spy.mock.calls.flat().map(String)).join('\n');
    expect(printed).toContain('User JWT set');
    expect(printed).not.toContain(secret);
    for (const storage of [localStorage, sessionStorage]) {
      for (let i = 0; i < storage.length; i++) {
        const key = storage.key(i)!;
        expect(key).not.toContain(secret);
        expect(storage.getItem(key)).not.toContain(secret);
      }
    }
    expect(opened).toHaveBeenCalled();
    const urls = [
      ...fetchMock.mock.calls.map(([url]) => url),
      ...opened.mock.calls.map(([u]) => u),
    ];
    for (const url of urls) {
      expect(url).not.toContain(secret);
    }
    expect(document.body.textContent).toContain('Customer.io In-App SDK Debugger');
    expect(document.body.textContent).not.toContain(secret);
  });

  describe('streams when Gist says no', () => {
    let opened: ReturnType<typeof vi.fn<(url: string) => void>>;

    beforeEach(() => {
      opened = vi.fn<(url: string) => void>();
      vi.stubGlobal(
        'EventSource',
        class {
          constructor(url: string) {
            opened(url);
          }
          addEventListener() {}
          close() {}
        }
      );
    });

    it('opens no EventSource on the ticks after a queue response says X-CIO-Use-SSE: false', async () => {
      for (let i = 0; i < 10; i++) {
        queueAnswers.push({ response: () => queueOk({ 'x-gist-queue-polling-interval': '1' }) });
      }
      await setup();

      await advance(10_000);

      expect(queueCalls().length).toBeGreaterThan(3);
      expect(opened).not.toHaveBeenCalled();
    });

    it('opens one when the response says true, which shows the check above can fail', async () => {
      queueAnswers.push({ response: () => queueOk({ 'x-cio-use-sse': 'True' }) });
      await setup();

      await advance(1_100);

      expect(opened).toHaveBeenCalledTimes(1);
    });
  });
});
