import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  updateQueueLocalStore,
  getMessagesFromLocalStore,
  markUserQueueMessageAsSeen,
  saveMessageState,
  getSavedMessageState,
  clearMessageState,
  isMessageLoading,
  setMessageLoading,
  setMessageLoaded,
} from "./message-user-queue-manager";
import {
  setKeyToLocalStore,
  getKeyFromLocalStore,
  clearKeyFromLocalStore,
} from "../utilities/local-storage";
import { getHashedUserToken } from "./user-manager";
import type { GistMessage } from "../types";

vi.mock("../utilities/log", () => ({ log: vi.fn() }));
vi.mock("../utilities/local-storage", () => ({
  setKeyToLocalStore: vi.fn(),
  getKeyFromLocalStore: vi.fn(() => null),
  clearKeyFromLocalStore: vi.fn(),
}));
vi.mock("./user-manager", () => ({
  getHashedUserToken: vi.fn(() => Promise.resolve("hashed-token")),
}));

describe("message-user-queue-manager", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getHashedUserToken).mockResolvedValue("hashed-token");
  });

  it("updateQueueLocalStore stores non-broadcast messages", async () => {
    const messages: GistMessage[] = [
      { messageId: "1", queueId: "q1" },
      {
        messageId: "2",
        queueId: "q2",
        properties: { gist: { broadcast: true } },
      },
    ];
    await updateQueueLocalStore(messages);
    expect(setKeyToLocalStore).toHaveBeenCalledWith(
      "gist.web.message.user.hashed-token",
      [{ messageId: "1", queueId: "q1" }],
      expect.any(Date),
    );
    const expiry = vi.mocked(setKeyToLocalStore).mock.calls[0][2] as Date;
    expect(expiry.getTime()).toBeGreaterThan(Date.now());
  });

  it("getMessagesFromLocalStore returns messages excluding seen ones", async () => {
    const stored: GistMessage[] = [
      { messageId: "1", queueId: "q1" },
      { messageId: "2", queueId: "q2" },
    ];
    vi.mocked(getKeyFromLocalStore).mockImplementation((key: string) => {
      if (key === "gist.web.message.user.hashed-token") return stored;
      if (key === "gist.web.message.user.hashed-token.seen") return ["q1"];
      return null;
    });
    const result = await getMessagesFromLocalStore();
    expect(result).toEqual([{ messageId: "2", queueId: "q2" }]);
  });

  it("markUserQueueMessageAsSeen adds queueId to seen list", async () => {
    vi.mocked(getKeyFromLocalStore).mockReturnValue([]);
    await markUserQueueMessageAsSeen("q99");
    expect(setKeyToLocalStore).toHaveBeenCalledWith(
      "gist.web.message.user.hashed-token.seen",
      ["q99"],
    );
  });

  it("saveMessageState persists step name and display settings with 30-day TTL", async () => {
    vi.mocked(getKeyFromLocalStore).mockReturnValue(null);
    await saveMessageState("q1", "step-2", {
      displayType: "modal",
      modalPosition: "center",
    });
    expect(setKeyToLocalStore).toHaveBeenCalledWith(
      "gist.web.message.user.hashed-token.message.q1.state",
      {
        stepName: "step-2",
        displaySettings: {
          displayType: "modal",
          modalPosition: "center",
        },
      },
      expect.any(Date),
    );
    const expiry = vi.mocked(setKeyToLocalStore).mock.calls[0][2] as Date;
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
    expect(
      Math.abs(expiry.getTime() - thirtyDaysFromNow.getTime()),
    ).toBeLessThan(60000);
  });

  it("saveMessageState merges with existing state (doesn't overwrite unset fields)", async () => {
    vi.mocked(getKeyFromLocalStore).mockReturnValue({
      stepName: "existing-step",
      displaySettings: { displayType: "overlay" },
    });
    await saveMessageState("q1", undefined, { modalPosition: "top" });
    expect(setKeyToLocalStore).toHaveBeenCalledWith(
      "gist.web.message.user.hashed-token.message.q1.state",
      {
        stepName: "existing-step",
        displaySettings: { modalPosition: "top" },
      },
      expect.any(Date),
    );
  });

  it("getSavedMessageState returns saved state or null", async () => {
    vi.mocked(getKeyFromLocalStore).mockReturnValue(null);
    expect(await getSavedMessageState("q1")).toBe(null);

    const savedState = { stepName: "step-1", displaySettings: {} };
    vi.mocked(getKeyFromLocalStore).mockReturnValue(savedState);
    expect(await getSavedMessageState("q1")).toEqual(savedState);
  });

  it("clearMessageState removes saved state", async () => {
    await clearMessageState("q1");
    expect(clearKeyFromLocalStore).toHaveBeenCalledWith(
      "gist.web.message.user.hashed-token.message.q1.state",
    );
  });

  it("setMessageLoading / isMessageLoading round-trip with 5s TTL", async () => {
    vi.mocked(getKeyFromLocalStore).mockReturnValue(null);
    expect(await isMessageLoading("q1")).toBe(false);

    await setMessageLoading("q1");
    expect(setKeyToLocalStore).toHaveBeenCalledWith(
      "gist.web.message.user.hashed-token.message.q1.loading",
      true,
      expect.any(Date),
    );
    const expiry = vi.mocked(setKeyToLocalStore).mock.calls[0][2] as Date;
    expect(expiry.getTime()).toBeGreaterThanOrEqual(Date.now() + 4999);

    vi.mocked(getKeyFromLocalStore).mockReturnValue(true);
    expect(await isMessageLoading("q1")).toBe(true);
  });

  it("setMessageLoaded clears the loading flag", async () => {
    await setMessageLoaded("q1");
    expect(clearKeyFromLocalStore).toHaveBeenCalledWith(
      "gist.web.message.user.hashed-token.message.q1.loading",
    );
  });
});
