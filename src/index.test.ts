import { describe, it, expect, vi } from "vitest";

vi.mock("./utilities/log", () => ({ log: vi.fn() }));
vi.mock("./utilities/event-emitter", () => ({
  default: vi.fn(() => ({ dispatch: vi.fn() })),
}));
vi.mock("./utilities/local-storage", () => ({
  clearExpiredFromLocalStore: vi.fn(),
}));
vi.mock("./managers/queue-manager", () => ({
  startQueueListener: vi.fn(),
  checkMessageQueue: vi.fn(),
  checkCurrentMessagesAfterRouteChange: vi.fn(),
  stopSSEListener: vi.fn(),
}));
vi.mock("./managers/user-manager", () => ({
  setUserToken: vi.fn(),
  clearUserToken: vi.fn(),
  useGuestSession: vi.fn(),
}));
vi.mock("./managers/message-manager", () => ({
  showMessage: vi.fn(),
  embedMessage: vi.fn(),
  hideMessage: vi.fn(),
  removePersistentMessage: vi.fn(),
  logBroadcastDismissedLocally: vi.fn(),
}));
vi.mock("./utilities/message-utils", () => ({
  fetchMessageByInstanceId: vi.fn(),
}));
vi.mock("./managers/message-component-manager", () => ({
  sendDisplaySettingsToIframe: vi.fn(),
}));
vi.mock("./managers/locale-manager", () => ({
  setUserLocale: vi.fn(),
}));
vi.mock("./managers/custom-attribute-manager", () => ({
  setCustomAttribute: vi.fn(),
  clearCustomAttributes: vi.fn(),
  removeCustomAttribute: vi.fn(),
}));
vi.mock("./utilities/preview-mode", () => ({
  setupPreview: vi.fn(() => false),
}));
vi.mock("./managers/inbox-message-manager", () => ({
  getInboxMessagesFromLocalStore: vi.fn(),
  updateInboxMessageOpenState: vi.fn(),
  removeInboxMessage: vi.fn(),
}));

describe("index", () => {
  it("default export is the Gist class", async () => {
    const indexModule = await import("./index");
    const gistModule = await import("./gist");
    expect(indexModule.default).toBe(gistModule.default);
  });

  it("module is importable", async () => {
    const indexModule = await import("./index");
    expect(indexModule.default).toBeDefined();
  });
});
