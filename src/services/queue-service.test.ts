import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  getUserQueue,
  getQueueSSEEndpoint,
  userQueueNextPullCheckLocalStoreName,
} from "./queue-service";
import {
  getKeyFromLocalStore,
  setKeyToLocalStore,
  shouldPersistSession,
} from "../utilities/local-storage";
import { getEncodedUserToken, getUserToken } from "../managers/user-manager";

const mockPost = vi.fn();

vi.mock("../gist", () => ({
  default: {
    config: {
      env: "prod",
      siteId: "test-site-id",
    },
  },
}));

vi.mock("./network", () => ({
  UserNetworkInstance: vi.fn(() => ({
    post: mockPost,
  })),
}));

vi.mock("../utilities/log", () => ({ log: vi.fn() }));

vi.mock("../managers/user-manager", () => ({
  isUsingGuestUserToken: vi.fn(() => false),
  getEncodedUserToken: vi.fn(() => null),
  getUserToken: vi.fn(() => null),
}));

vi.mock("../managers/locale-manager", () => ({
  getUserLocale: vi.fn(() => "en-US"),
}));

vi.mock("./settings", () => ({
  settings: {
    GIST_QUEUE_REALTIME_API_ENDPOINT: {
      prod: "https://realtime.cloud.gist.build",
      dev: "https://realtime.cloud.dev.gist.build",
      local: "http://api.local.gist.build:3000",
    },
    setUseSSEFlag: vi.fn(),
  },
}));

describe("queue-service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    shouldPersistSession(true);
    localStorage.clear();
    sessionStorage.clear();
    vi.mocked(getEncodedUserToken).mockReturnValue("encoded-token");
    vi.mocked(getUserToken).mockReturnValue("user-token");
  });

  it("getUserQueue() sends POST to correct endpoint with correct headers", async () => {
    mockPost.mockResolvedValue({
      status: 200,
      data: {},
      headers: {},
    });

    await getUserQueue();

    expect(mockPost).toHaveBeenCalledWith(
      expect.stringMatching(/^\/api\/v4\/users\?sessionId=/),
      {},
      expect.objectContaining({
        headers: expect.objectContaining({
          "X-Gist-User-Anonymous": "false",
          "Content-Language": "en-US",
        }),
      }),
    );
  });

  it("getUserQueue() skips if checkInProgress is true", async () => {
    mockPost.mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(() => resolve({ status: 200, data: {}, headers: {} }), 50);
        }),
    );

    const promise1 = getUserQueue();
    const promise2 = getUserQueue();

    await promise1;
    await promise2;

    expect(mockPost).toHaveBeenCalledTimes(1);
  });

  it("getUserQueue() clears next pull check if user token changed during request", async () => {
    mockPost.mockImplementation(
      () =>
        new Promise((resolve) => {
          vi.mocked(getUserToken).mockReturnValue("different-token");
          resolve({
            status: 200,
            data: {},
            headers: {},
          });
        }),
    );

    await getUserQueue();

    expect(
      getKeyFromLocalStore(userQueueNextPullCheckLocalStoreName),
    ).toBeNull();
  });

  it("getQueueSSEEndpoint() returns null when no user token", async () => {
    vi.mocked(getEncodedUserToken).mockReturnValue(null);

    const result = getQueueSSEEndpoint();

    expect(result).toBeNull();
  });

  it("getQueueSSEEndpoint() returns correct URL with encoded token and site ID", () => {
    vi.mocked(getEncodedUserToken).mockReturnValue("encoded-token-123");
    setKeyToLocalStore(
      "gist.web.sessionId",
      "session-456",
      new Date(Date.now() + 1800000),
    );

    const result = getQueueSSEEndpoint();

    expect(result).toContain("https://realtime.cloud.gist.build/api/v3/sse");
    expect(result).toContain("userToken=encoded-token-123");
    expect(result).toContain("siteId=test-site-id");
    expect(result).toContain("sessionId=session-456");
  });

  it("scheduleNextQueuePull sets the correct TTL based on response header", async () => {
    mockPost.mockResolvedValue({
      status: 200,
      data: {},
      headers: {
        "x-gist-queue-polling-interval": "120",
      },
    });

    await getUserQueue();

    const storedValue = getKeyFromLocalStore(
      userQueueNextPullCheckLocalStoreName,
    );
    expect(Number(storedValue)).toBe(120);
  });
});
