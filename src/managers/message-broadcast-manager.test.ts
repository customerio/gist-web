import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  isMessageBroadcast,
  isShowAlwaysBroadcast,
  markBroadcastAsSeen,
  markBroadcastAsDismissed,
} from "./message-broadcast-manager";
import {
  setKeyToLocalStore,
  getKeyFromLocalStore,
} from "../utilities/local-storage";
import type { GistMessage } from "../types";

vi.mock("../utilities/log", () => ({ log: vi.fn() }));
vi.mock("../utilities/local-storage", () => ({
  setKeyToLocalStore: vi.fn(),
  getKeyFromLocalStore: vi.fn(() => null),
}));
vi.mock("./user-manager", () => ({
  getHashedUserToken: vi.fn(() => Promise.resolve("hashed-token")),
}));

const broadcastsStoreName = "gist.web.message.broadcasts.hashed-token";

function makeBroadcast(
  overrides: Partial<GistMessage> & {
    properties?: {
      gist?: {
        broadcast?: {
          frequency?: {
            count?: number;
            delay?: number;
            ignoreDismiss?: boolean;
          };
        };
      };
    };
  } = {},
): GistMessage {
  return {
    messageId: "msg-1",
    queueId: "broadcast-1",
    properties: {
      gist: {
        broadcast: {
          frequency: { count: 3, delay: 60 },
        },
      },
    },
    ...overrides,
  } as GistMessage;
}

describe("message-broadcast-manager", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getKeyFromLocalStore).mockReturnValue(null);
  });

  describe("isMessageBroadcast", () => {
    it("returns true when properties.gist.broadcast exists", () => {
      const message = makeBroadcast();
      expect(isMessageBroadcast(message)).toBe(true);
    });

    it("returns false when no broadcast property", () => {
      const message: GistMessage = {
        messageId: "msg-1",
        properties: { gist: {} },
      };
      expect(isMessageBroadcast(message)).toBe(false);

      const messageNoGist: GistMessage = {
        messageId: "msg-1",
        properties: {},
      };
      expect(isMessageBroadcast(messageNoGist)).toBe(false);

      const messageNoProperties: GistMessage = { messageId: "msg-1" };
      expect(isMessageBroadcast(messageNoProperties)).toBe(false);
    });
  });

  describe("isShowAlwaysBroadcast", () => {
    it("returns true when frequency delay and count are both 0", () => {
      const message = makeBroadcast({
        properties: {
          gist: {
            broadcast: {
              frequency: { count: 0, delay: 0 },
            },
          },
        },
      });
      expect(isShowAlwaysBroadcast(message)).toBe(true);
    });

    it("returns false for non-broadcast messages", () => {
      const message: GistMessage = {
        messageId: "msg-1",
        properties: { gist: {} },
      };
      expect(isShowAlwaysBroadcast(message)).toBe(false);
    });
  });

  describe("markBroadcastAsSeen", () => {
    it("increments the number of times shown", async () => {
      const broadcast = makeBroadcast({
        queueId: "broadcast-1",
        properties: {
          gist: {
            broadcast: {
              frequency: { count: 3, delay: 60 },
            },
          },
        },
      });

      vi.mocked(getKeyFromLocalStore).mockImplementation((key: string) => {
        if (key === broadcastsStoreName) return [broadcast];
        if (key === `${broadcastsStoreName}.broadcast-1.numberOfTimesShown`)
          return 1;
        return null;
      });

      await markBroadcastAsSeen("broadcast-1");

      expect(setKeyToLocalStore).toHaveBeenCalledWith(
        `${broadcastsStoreName}.broadcast-1.numberOfTimesShown`,
        2,
      );
    });

    it("sets shouldShow to false when frequency.count === 1", async () => {
      const broadcast = makeBroadcast({
        queueId: "broadcast-1",
        properties: {
          gist: {
            broadcast: {
              frequency: { count: 1, delay: 0 },
            },
          },
        },
      });

      vi.mocked(getKeyFromLocalStore).mockImplementation((key: string) => {
        if (key === broadcastsStoreName) return [broadcast];
        return null;
      });

      await markBroadcastAsSeen("broadcast-1");

      expect(setKeyToLocalStore).toHaveBeenCalledWith(
        `${broadcastsStoreName}.broadcast-1.numberOfTimesShown`,
        1,
      );
      expect(setKeyToLocalStore).toHaveBeenCalledWith(
        `${broadcastsStoreName}.broadcast-1.shouldShow`,
        false,
      );
    });
  });

  describe("markBroadcastAsDismissed", () => {
    it("sets shouldShow to false", async () => {
      const broadcast = makeBroadcast({
        queueId: "broadcast-1",
        properties: {
          gist: {
            broadcast: {
              frequency: { count: 3, delay: 60, ignoreDismiss: false },
            },
          },
        },
      });

      vi.mocked(getKeyFromLocalStore).mockImplementation((key: string) => {
        if (key === broadcastsStoreName) return [broadcast];
        return null;
      });

      await markBroadcastAsDismissed("broadcast-1");

      expect(setKeyToLocalStore).toHaveBeenCalledWith(
        `${broadcastsStoreName}.broadcast-1.shouldShow`,
        false,
      );
    });

    it("does nothing when ignoreDismiss is true", async () => {
      const broadcast = makeBroadcast({
        queueId: "broadcast-1",
        properties: {
          gist: {
            broadcast: {
              frequency: { count: 3, delay: 60, ignoreDismiss: true },
            },
          },
        },
      });

      vi.mocked(getKeyFromLocalStore).mockImplementation((key: string) => {
        if (key === broadcastsStoreName) return [broadcast];
        return null;
      });

      await markBroadcastAsDismissed("broadcast-1");

      expect(setKeyToLocalStore).not.toHaveBeenCalled();
    });
  });
});
