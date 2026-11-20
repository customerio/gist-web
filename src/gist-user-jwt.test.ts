import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type GistClass from './gist';
import type { GistConfig } from './types';

// The user JWT end to end through the public API: the real queue loop, storage,
// managers and services, with only fetch, EventSource and the clock faked.

const QUEUE_PATH = '/api/v4/users';
const NEXT_PULL_KEY = 'gist.web.userQueueNextPullCheck';
const USER_JWT_KEY = 'gist.web.userJwt';
const USER_TOKEN_KEY = 'gist.web.userToken';
const JWT_HEADER = 'X-CIO-User-JWT';
const USER_TOKEN_HEADER = 'X-Gist-Encoded-User-Token';
const ALICE = 'cio_a11ce';
const BOB = 'cio_b0b';
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
const lastQueueCall = () => queueCalls()[queueCalls().length - 1];
const jwtSent = (call: [string, FetchInit]) => call[1].headers[JWT_HEADER];
const userTokenSent = (call: [string, FetchInit]) => {
  const encoded = call[1].headers[USER_TOKEN_HEADER];
  return encoded === undefined ? undefined : atob(encoded);
};

let issued = 0;

// A new JWT naming `sub`, as a backend signs one at each sign-in or renewal.
function jwtFor(sub: string): string {
  const encode = (value: unknown) =>
    btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  issued += 1;
  return `${encode({ alg: 'RS256', typ: 'JWT' })}.${encode({ sub, n: issued })}.signature`;
}

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

// What setUserJwt in another tab, or on an earlier page, leaves in storage.
async function storeJwtElsewhere(jwt: string): Promise<void> {
  const { setKeyToLocalStore } = await import('./utilities/local-storage');
  setKeyToLocalStore(USER_JWT_KEY, jwt);
}

// What clearUserToken() in another tab leaves in storage.
function signOutElsewhere(): void {
  localStorage.removeItem(USER_JWT_KEY);
  localStorage.removeItem(USER_TOKEN_KEY);
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
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
    // The site identified the visitor with its own user id, as Data Pipelines JS does.
    await holdUserToken('user-1');
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("takes the JWT before setup() and sends it, and the person it names, with setup's first queue fetch", async () => {
    const alice = jwtFor(ALICE);
    expect(() => Gist.setUserJwt(alice)).not.toThrow();

    await setup();

    expect(queueCalls()).toHaveLength(1);
    expect(jwtSent(queueCalls()[0])).toBe(alice);
    expect(userTokenSent(queueCalls()[0])).toBe(ALICE);
  });

  it('sends the JWT and the person it names with the queue fetch, an inbox open-state update and a view log', async () => {
    const alice = jwtFor(ALICE);
    void Gist.setUserJwt(alice);
    await setup();
    await advance(100);

    await Gist.updateInboxMessageOpenState('queue-1', true);
    await Gist.removeInboxMessage('queue-1');

    for (const call of [
      queueCalls()[0],
      calls('/api/v1/messages/queue-1')[0],
      calls('/api/v1/logs/queue/queue-1')[0],
    ]) {
      expect(jwtSent(call)).toBe(alice);
      expect(userTokenSent(call)).toBe(ALICE);
    }
  });

  it('files what it caches under the person the JWT names', async () => {
    void Gist.setUserJwt(jwtFor(ALICE));
    await setup();
    await advance(100);

    expect(localStorage.getItem(`gist.web.message.user.${await sha256Hex(ALICE)}`)).not.toBeNull();
    expect(localStorage.getItem(`gist.web.message.user.${await sha256Hex('user-1')}`)).toBeNull();
  });

  describe('signing in', () => {
    it('signs the person the JWT names in on a page with no user', async () => {
      localStorage.clear();
      await setup();
      expect(queueCalls()).toHaveLength(0);

      const alice = jwtFor(ALICE);
      await Gist.setUserJwt(alice);
      await advance(100);

      expect(queueCalls()).toHaveLength(1);
      expect(jwtSent(queueCalls()[0])).toBe(alice);
      expect(userTokenSent(queueCalls()[0])).toBe(ALICE);
    });

    it('ends a guest session with the person the JWT names', async () => {
      localStorage.clear();
      await setup({ useAnonymousSession: true });
      await advance(100);
      expect(lastQueueCall()[1].headers['X-Gist-User-Anonymous']).toBe('true');

      const alice = jwtFor(ALICE);
      await Gist.setUserJwt(alice);
      await advance(1_000);

      expect(lastQueueCall()[1].headers['X-Gist-User-Anonymous']).toBe('false');
      expect(jwtSent(lastQueueCall())).toBe(alice);
      expect(userTokenSent(lastQueueCall())).toBe(ALICE);
    });

    it('ends with the person the JWT names whether identify reaches gist-web before it or after it', async () => {
      localStorage.clear();
      await setup();
      const alice = jwtFor(ALICE);
      await Gist.setUserToken('alice-id');
      await Gist.setUserJwt(alice);
      await advance(1_000);
      expect(jwtSent(lastQueueCall())).toBe(alice);
      expect(userTokenSent(lastQueueCall())).toBe(ALICE);

      await Gist.clearUserToken();
      const bob = jwtFor(BOB);
      await Gist.setUserJwt(bob);
      await Gist.setUserToken('bob-id');
      await advance(1_000);
      expect(jwtSent(lastQueueCall())).toBe(bob);
      expect(userTokenSent(lastQueueCall())).toBe(BOB);
    });

    it("keeps the person the JWT names through the site's own identify, and takes that id once the JWT goes", async () => {
      const alice = jwtFor(ALICE);
      void Gist.setUserJwt(alice);
      await setup();
      await advance(100);

      await Gist.setUserToken('alice-id');
      await advance(1_100);
      await Gist.updateInboxMessageOpenState('queue-1', true);

      expect(queueCalls()).toHaveLength(1);
      expect(jwtSent(calls('/api/v1/messages/queue-1')[0])).toBe(alice);
      expect(userTokenSent(calls('/api/v1/messages/queue-1')[0])).toBe(ALICE);

      await Gist.setUserJwt(null);
      await Gist.updateInboxMessageOpenState('queue-2', true);

      expect(jwtSent(calls('/api/v1/messages/queue-2')[0])).toBeUndefined();
      expect(userTokenSent(calls('/api/v1/messages/queue-2')[0])).toBe('alice-id');
    });

    it('sends a JWT that names nobody with the user token held, until another user signs in', async () => {
      void Gist.setUserJwt('opaque-jwt');
      await setup();
      await advance(100);
      expect(jwtSent(queueCalls()[0])).toBe('opaque-jwt');
      expect(userTokenSent(queueCalls()[0])).toBe('user-1');

      await Gist.setUserToken('user-2');
      await advance(11_000);

      expect(jwtSent(lastQueueCall())).toBeUndefined();
      expect(userTokenSent(lastQueueCall())).toBe('user-2');
    });
  });

  it('sends no JWT after setUserJwt(null) or clearUserToken()', async () => {
    void Gist.setUserJwt(jwtFor(ALICE));
    await setup({ useAnonymousSession: true });
    await advance(100);

    await Gist.setUserJwt(null);
    await Gist.updateInboxMessageOpenState('queue-1', true);

    await Gist.setUserJwt(jwtFor(BOB));
    await Gist.clearUserToken();
    await advance(11_000);

    expect(jwtSent(calls('/api/v1/messages/queue-1')[0])).toBeUndefined();
    const guestFetch = lastQueueCall();
    expect(guestFetch[1].headers['X-Gist-User-Anonymous']).toBe('true');
    expect(jwtSent(guestFetch)).toBeUndefined();
  });

  describe('a JWT stored on an earlier page or in another tab', () => {
    it("goes with setup's first fetch on the next page load", async () => {
      const alice = jwtFor(ALICE);
      await storeJwtElsewhere(alice);

      await setup();

      expect(queueCalls()).toHaveLength(1);
      expect(jwtSent(queueCalls()[0])).toBe(alice);
      expect(userTokenSent(queueCalls()[0])).toBe(ALICE);
    });

    it("goes with this tab's next fetch, with the person it names", async () => {
      void Gist.setUserJwt(jwtFor(ALICE));
      await setup();
      await advance(100);

      const bob = jwtFor(BOB);
      await storeJwtElsewhere(bob);
      await advance(11_000);

      expect(queueCalls()).toHaveLength(2);
      expect(jwtSent(queueCalls()[1])).toBe(bob);
      expect(userTokenSent(queueCalls()[1])).toBe(BOB);
    });

    it("ignores the previous person's JWT from this tab's app after another tab signed someone else in", async () => {
      const alice = jwtFor(ALICE);
      void Gist.setUserJwt(alice);
      await setup();
      await advance(100);

      // Another tab signs Bob in; this tab's app still acts for Alice.
      const bob = jwtFor(BOB);
      await storeJwtElsewhere(bob);
      await Gist.setUserJwt(alice);
      await advance(11_000);

      expect(jwtSent(lastQueueCall())).toBe(bob);
      expect(userTokenSent(lastQueueCall())).toBe(BOB);
    });

    it('keeps the newer JWT another tab stored for the same person', async () => {
      const older = jwtFor(ALICE);
      void Gist.setUserJwt(older);
      await setup();
      await advance(100);

      const newer = jwtFor(ALICE);
      await storeJwtElsewhere(newer);
      await Gist.setUserJwt(older);
      await advance(11_000);

      expect(jwtSent(lastQueueCall())).toBe(newer);
    });

    it("doesn't sign the previous person back in after another tab signed them out", async () => {
      const alice = jwtFor(ALICE);
      void Gist.setUserJwt(alice);
      await setup();
      await advance(100);

      signOutElsewhere();
      await Gist.setUserJwt(alice);
      await advance(11_000);

      expect(localStorage.getItem(USER_JWT_KEY)).toBeNull();
      expect(queueCalls()).toHaveLength(1);
    });

    it("leaves another tab's JWT in place when this tab hands over null", async () => {
      await setup();
      await advance(100);
      const bob = jwtFor(BOB);
      await storeJwtElsewhere(bob);

      await Gist.setUserJwt(null);
      await advance(11_000);

      expect(jwtSent(lastQueueCall())).toBe(bob);
    });

    it('lets a tab paused by a rejection fetch again once another tab stores a new JWT', async () => {
      void Gist.setUserJwt(jwtFor(ALICE));
      queueAnswers.push({ response: () => rejected('expired') });
      await setup();
      onRejected();
      await advance(30_000);
      expect(queueCalls()).toHaveLength(1);

      const renewed = jwtFor(ALICE);
      await storeJwtElsewhere(renewed);
      await advance(1_000);

      expect(queueCalls()).toHaveLength(2);
      expect(jwtSent(queueCalls()[1])).toBe(renewed);
    });
  });

  it('adds no queue fetch when the site hands over the JWT it already set', async () => {
    const alice = jwtFor(ALICE);
    void Gist.setUserJwt(alice);
    await setup();
    await advance(100);

    // A site that hands over its JWT on every render or route change.
    for (let i = 0; i < 5; i++) {
      await Gist.setUserJwt(alice);
      await advance(1_000);
    }
    expect(queueCalls()).toHaveLength(1);

    // The shared schedule's next fetch, 10 seconds after the first, still goes.
    await advance(6_000);
    expect(queueCalls()).toHaveLength(2);
    expect(jwtSent(queueCalls()[1])).toBe(alice);
  });

  describe('when Gist rejects the JWT', () => {
    it('tells the app once, pauses this tab and leaves the shared schedule alone', async () => {
      void Gist.setUserJwt(jwtFor(ALICE));
      await setup();
      const listener = onRejected();
      await advance(100);
      const schedule = localStorage.getItem(NEXT_PULL_KEY);
      expect(schedule).not.toBeNull();

      // The fetch for a new JWT goes ahead of the shared schedule, and is rejected.
      queueAnswers.push({ response: () => rejected('expired') });
      await Gist.setUserJwt(jwtFor(ALICE));
      await advance(1_000);

      expect(queueCalls()).toHaveLength(2);
      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith({ reason: 'expired' });
      expect(localStorage.getItem(NEXT_PULL_KEY)).toBe(schedule);

      otherAnswers.push({ response: () => rejected('expired'), latencyMs: 0 });
      await Gist.removeInboxMessage('queue-1');
      expect(listener).toHaveBeenCalledTimes(1);
      expect(localStorage.getItem(NEXT_PULL_KEY)).toBe(schedule);

      await advance(60_000);
      expect(queueCalls()).toHaveLength(2);
    });

    it('leaves the reason out when the 401 has no body', async () => {
      queueAnswers.push({ response: () => rejected() });
      await setup();
      const listener = onRejected();

      await advance(100);

      expect(listener).toHaveBeenCalledWith({});
    });

    it('fetches straight away for the first new JWT, then once per polling interval', async () => {
      const handedOver: string[] = [];
      const handOver = () => {
        const next = jwtFor(ALICE);
        handedOver.push(next);
        void Gist.setUserJwt(next);
      };
      // A good answer first, so this tab knows Gist's polling interval: 10 seconds.
      handOver();
      await setup();
      await advance(100);
      onRejected(handOver);
      for (let i = 0; i < 5; i++) {
        queueAnswers.push({ response: () => rejected('bad_subject') });
      }

      // The schedule's next fetch, at about 11 s, is rejected; the handler answers each
      // rejection with another JWT.
      await advance(11_000);
      expect(queueCalls()).toHaveLength(2);
      await advance(1_000);
      expect(queueCalls()).toHaveLength(3);
      expect(jwtSent(queueCalls()[2])).toBe(handedOver[1]);

      await advance(9_000);
      expect(queueCalls()).toHaveLength(3);
      await advance(1_000);
      expect(queueCalls()).toHaveLength(4);
      expect(jwtSent(queueCalls()[3])).toBe(handedOver[2]);
    });

    it('makes one queue request for two new JWTs within a polling interval', async () => {
      void Gist.setUserJwt(jwtFor(ALICE));
      queueAnswers.push({ response: () => rejected('expired') });
      queueAnswers.push({ response: () => rejected('expired') });
      await setup();
      await advance(100);

      void Gist.setUserJwt(jwtFor(ALICE));
      const latest = jwtFor(ALICE);
      void Gist.setUserJwt(latest);
      await advance(1_000);
      expect(queueCalls()).toHaveLength(2);
      expect(jwtSent(queueCalls()[1])).toBe(latest);

      void Gist.setUserJwt(jwtFor(ALICE));
      await advance(8_000);
      expect(queueCalls()).toHaveLength(2);
    });

    it('discards a late answer to the previous JWT and fetches with the new one on the next tick', async () => {
      void Gist.setUserJwt(jwtFor(ALICE));
      queueAnswers.push({ response: () => rejected('expired'), latencyMs: 1_500 });
      await setup();
      const listener = onRejected();

      const renewed = jwtFor(ALICE);
      void Gist.setUserJwt(renewed);
      await advance(1_600);

      expect(listener).not.toHaveBeenCalled();
      expect(localStorage.getItem(NEXT_PULL_KEY)).toBeNull();
      expect(queueCalls()).toHaveLength(1);

      await advance(1_000);
      expect(queueCalls()).toHaveLength(2);
      expect(jwtSent(queueCalls()[1])).toBe(renewed);
    });
  });

  describe('changes of user', () => {
    it("the site's identify while a JWT names the user keeps the JWT, the pause and the count", async () => {
      const alice = jwtFor(ALICE);
      void Gist.setUserJwt(alice);
      queueAnswers.push({ response: () => rejected('expired') });
      await setup();
      const listener = onRejected();
      await advance(100);

      await Gist.setUserToken('user-2');
      await advance(30_000);
      otherAnswers.push({ response: () => rejected('expired'), latencyMs: 0 });
      await Gist.removeInboxMessage('queue-1');

      expect(queueCalls()).toHaveLength(1);
      expect(jwtSent(calls('/api/v1/logs/queue/queue-1')[0])).toBe(alice);
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('a JWT naming someone else lifts the pause and is reported on its own', async () => {
      void Gist.setUserJwt(jwtFor(ALICE));
      queueAnswers.push({ response: () => rejected('expired') });
      await setup();
      const listener = onRejected();
      await advance(100);

      queueAnswers.push({ response: () => rejected('expired') });
      const bob = jwtFor(BOB);
      await Gist.setUserJwt(bob);
      await advance(1_100);

      expect(queueCalls()).toHaveLength(2);
      expect(jwtSent(queueCalls()[1])).toBe(bob);
      expect(listener).toHaveBeenCalledTimes(2);
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
      const alice = jwtFor(ALICE);
      void Gist.setUserJwt(alice);
      queueAnswers.push({ response: () => rejected('expired') });
      await setup({ useAnonymousSession: true });
      const listener = onRejected();
      await advance(100);

      await Gist.clearUserToken();
      await advance(1_100);

      expect(queueCalls()).toHaveLength(2);
      expect(jwtSent(queueCalls()[1])).toBeUndefined();

      // The value already reported before the sign-out is reported again.
      queueAnswers.push({ response: () => rejected('expired') });
      await Gist.setUserJwt(alice);
      await advance(1_000);

      expect(queueCalls()).toHaveLength(3);
      expect(listener).toHaveBeenCalledTimes(2);
    });

    it('keeps a JWT set right after clearUserToken() without awaiting it, on a site with guest sessions', async () => {
      await setup({ useAnonymousSession: true });
      await advance(100);

      const next = jwtFor(BOB);
      const signingOut = Gist.clearUserToken();
      void Gist.setUserJwt(next);
      await signingOut;
      await Gist.setUserToken('bob-id');
      await Gist.updateInboxMessageOpenState('queue-1', true);

      expect(jwtSent(calls('/api/v1/messages/queue-1')[0])).toBe(next);
      expect(userTokenSent(calls('/api/v1/messages/queue-1')[0])).toBe(BOB);
    });

    it('keeps a JWT set right after clearUserToken() without awaiting it', async () => {
      await setup();
      await advance(100);

      void Gist.setUserJwt(jwtFor(ALICE));
      const next = jwtFor(BOB);
      const signingOut = Gist.clearUserToken();
      void Gist.setUserJwt(next);
      await signingOut;
      await Gist.setUserToken('bob-id');
      await Gist.updateInboxMessageOpenState('queue-1', true);

      expect(jwtSent(calls('/api/v1/messages/queue-1')[0])).toBe(next);
    });
  });

  it('keeps the JWT out of console lines, URLs and the debug overlay, and stores it under its own key only, with logging on', async () => {
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

    void Gist.setUserJwt(secret);
    queueAnswers.push({ response: () => rejected('expired') });
    queueAnswers.push({ response: () => queueOk({ 'x-cio-use-sse': 'True' }) });
    await setup({ logging: true });
    const { initDebugOverlay } = await import('./managers/debug-overlay-manager');
    initDebugOverlay();
    await advance(100);
    void Gist.setUserJwt(secret);
    await advance(1_100);
    await advance(1_000);
    await Gist.updateInboxMessageOpenState('queue-1', true);
    await Gist.removeInboxMessage('queue-1');
    await Gist.setUserToken('user-1');
    await advance(1_100);

    const printed = consoleSpies.flatMap((spy) => spy.mock.calls.flat().map(String)).join('\n');
    expect(printed).toContain('User JWT set');
    expect(printed).not.toContain(secret);
    const keysHoldingSecret: string[] = [];
    for (const storage of [localStorage, sessionStorage]) {
      for (let i = 0; i < storage.length; i++) {
        const key = storage.key(i)!;
        expect(key).not.toContain(secret);
        if (storage.getItem(key)?.includes(secret)) keysHoldingSecret.push(key);
      }
    }
    expect(keysHoldingSecret).toEqual([USER_JWT_KEY]);
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
