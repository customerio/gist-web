import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  updateInboxMessagesLocalStore,
  getInboxMessagesFromLocalStore,
  getInboxMessagesByTopic,
  updateInboxMessageOpenState,
  removeInboxMessage,
  type InboxMessage,
} from "./inbox-message-manager";
import {
  setKeyToLocalStore,
  getKeyFromLocalStore,
} from "../utilities/local-storage";
import { getHashedUserToken } from "./user-manager";
import Gist from "../gist";
import { logUserMessageView } from "../services/log-service";
import { updateMessage } from "../services/message-service";

vi.mock("../utilities/log", () => ({ log: vi.fn() }));
vi.mock("../utilities/local-storage", () => ({
  setKeyToLocalStore: vi.fn(),
  getKeyFromLocalStore: vi.fn(() => null),
}));
vi.mock("./user-manager", () => ({
  getHashedUserToken: vi.fn(() => Promise.resolve("hashed-token")),
}));
vi.mock("../gist", () => ({
  default: {
    events: { dispatch: vi.fn() },
  },
}));
vi.mock("../services/log-service", () => ({
  logUserMessageView: vi.fn(),
}));
vi.mock("../services/message-service", () => ({
  updateMessage: vi.fn(),
}));

describe("inbox-message-manager", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getHashedUserToken).mockResolvedValue("hashed-token");
  });

  it("updateInboxMessagesLocalStore stores messages and dispatches messageInboxUpdated event", async () => {
    const messages: InboxMessage[] = [
      { messageId: "m1", queueId: "q1", topics: ["news"] },
    ];
    await updateInboxMessagesLocalStore(messages);

    expect(setKeyToLocalStore).toHaveBeenCalledWith(
      "gist.web.inbox.messages.hashed-token",
      messages,
      expect.any(Date),
    );
    expect(Gist.events.dispatch).toHaveBeenCalledWith(
      "messageInboxUpdated",
      messages,
    );
  });

  it("getInboxMessagesFromLocalStore filters out expired messages", async () => {
    const pastDate = new Date(Date.now() - 60000).toISOString();
    const futureDate = new Date(Date.now() + 60000).toISOString();
    const stored: InboxMessage[] = [
      { messageId: "m1", queueId: "q1", expiry: pastDate },
      { messageId: "m2", queueId: "q2", expiry: futureDate },
    ];
    vi.mocked(getKeyFromLocalStore).mockReturnValue(stored);

    const result = await getInboxMessagesFromLocalStore();

    expect(result).toHaveLength(1);
    expect(result[0].messageId).toBe("m2");
  });

  it("getInboxMessagesByTopic returns messages matching the topic", async () => {
    const stored: InboxMessage[] = [
      { messageId: "m1", queueId: "q1", topics: ["news", "updates"] },
      { messageId: "m2", queueId: "q2", topics: ["news"] },
      { messageId: "m3", queueId: "q3", topics: ["alerts"] },
    ];
    vi.mocked(getKeyFromLocalStore).mockReturnValue(stored);

    const result = await getInboxMessagesByTopic("news");

    expect(result).toHaveLength(2);
    expect(result.map((m) => m.messageId)).toEqual(["m1", "m2"]);
  });

  it("getInboxMessagesByTopic returns all messages when topic is null", async () => {
    const stored: InboxMessage[] = [
      { messageId: "m1", queueId: "q1", topics: ["news"] },
      { messageId: "m2", queueId: "q2", topics: [] },
    ];
    vi.mocked(getKeyFromLocalStore).mockReturnValue(stored);

    const result = await getInboxMessagesByTopic(null);

    expect(result).toHaveLength(2);
  });

  it('getInboxMessagesByTopic("default") returns messages with no topics', async () => {
    const stored: InboxMessage[] = [
      { messageId: "m1", queueId: "q1" },
      { messageId: "m2", queueId: "q2", topics: [] },
      { messageId: "m3", queueId: "q3", topics: ["news"] },
    ];
    vi.mocked(getKeyFromLocalStore).mockReturnValue(stored);

    const result = await getInboxMessagesByTopic("default");

    expect(result).toHaveLength(2);
    expect(result.map((m) => m.messageId)).toEqual(["m1", "m2"]);
  });

  it("updateInboxMessageOpenState sends PATCH request and updates local store", async () => {
    vi.mocked(updateMessage).mockResolvedValue({ status: 200 } as never);
    const stored: InboxMessage[] = [
      { messageId: "m1", queueId: "q1", opened: false },
    ];
    const updated: InboxMessage[] = [
      { messageId: "m1", queueId: "q1", opened: true },
    ];
    vi.mocked(getKeyFromLocalStore)
      .mockReturnValueOnce(stored)
      .mockReturnValueOnce(updated);

    await updateInboxMessageOpenState("q1", true);

    expect(updateMessage).toHaveBeenCalledWith("q1", { opened: true });
    expect(setKeyToLocalStore).toHaveBeenCalledWith(
      "gist.web.inbox.messages.hashed-token",
      [{ messageId: "m1", queueId: "q1", opened: true }],
      expect.any(Date),
    );
    expect(Gist.events.dispatch).toHaveBeenCalledWith("inboxMessageAction", {
      message: expect.objectContaining({ queueId: "q1", opened: true }),
      action: "opened",
    });
    expect(Gist.events.dispatch).toHaveBeenCalledWith(
      "messageInboxUpdated",
      updated,
    );
  });

  it("updateInboxMessageOpenState throws on API failure", async () => {
    vi.mocked(updateMessage).mockResolvedValue({ status: 500 } as never);

    await expect(updateInboxMessageOpenState("q1", true)).rejects.toThrow(
      "Failed to mark inbox message opened: 500",
    );
  });

  it("removeInboxMessage logs view, removes from store, dispatches event", async () => {
    vi.mocked(logUserMessageView).mockResolvedValue({ status: 200 } as never);
    const stored: InboxMessage[] = [
      { messageId: "m1", queueId: "q1" },
      { messageId: "m2", queueId: "q2" },
    ];
    const afterRemove: InboxMessage[] = [{ messageId: "m2", queueId: "q2" }];
    vi.mocked(getKeyFromLocalStore)
      .mockReturnValueOnce(stored)
      .mockReturnValueOnce(afterRemove);

    await removeInboxMessage("q1");

    expect(logUserMessageView).toHaveBeenCalledWith("q1");
    expect(setKeyToLocalStore).toHaveBeenCalledWith(
      "gist.web.inbox.messages.hashed-token",
      [{ messageId: "m2", queueId: "q2" }],
      expect.any(Date),
    );
    expect(Gist.events.dispatch).toHaveBeenCalledWith(
      "messageInboxUpdated",
      afterRemove,
    );
  });

  it("removeInboxMessage throws on API failure", async () => {
    vi.mocked(logUserMessageView).mockResolvedValue({ status: 404 } as never);

    await expect(removeInboxMessage("q1")).rejects.toThrow(
      "Failed to remove inbox message: 404",
    );
  });
});
