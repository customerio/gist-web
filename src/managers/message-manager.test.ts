import { describe, it, expect, vi, beforeEach } from "vitest";
import { showMessage, embedMessage, hideMessage } from "./message-manager";
import type { GistMessage } from "../types";

const mockGist = vi.hoisted(() => ({
  config: { env: "prod" as const, siteId: "test-site", dataCenter: "us" },
  overlayInstanceId: null as string | null,
  currentMessages: [] as GistMessage[],
  isDocumentVisible: true,
  messageShown: vi.fn(),
  messageDismissed: vi.fn(),
  messageAction: vi.fn(),
  messageError: vi.fn(),
  showMessage: vi.fn(),
  events: { dispatch: vi.fn() },
}));

vi.mock("../utilities/log", () => ({ log: vi.fn() }));
vi.mock("../services/log-service", () => ({
  logMessageView: vi.fn(() => Promise.resolve({ status: 200 })),
  logUserMessageView: vi.fn(() => Promise.resolve({ status: 200 })),
}));
vi.mock("uuid", () => ({ v4: vi.fn(() => "mock-uuid") }));
vi.mock("../services/settings", () => ({
  settings: {
    RENDERER_HOST: "https://renderer.test",
    ENGINE_API_ENDPOINT: {
      prod: "https://api.test",
      dev: "https://api.test",
      local: "http://localhost",
    },
    GIST_VIEW_ENDPOINT: {
      prod: "https://view.test",
      dev: "https://view.test",
      local: "http://localhost",
    },
  },
}));
vi.mock("./message-component-manager", () => ({
  loadOverlayComponent: vi.fn(),
  showOverlayComponent: vi.fn(),
  hideOverlayComponent: vi.fn(() => Promise.resolve()),
  removeOverlayComponent: vi.fn(),
  loadEmbedComponent: vi.fn(),
  showEmbedComponent: vi.fn(),
  hideEmbedComponent: vi.fn(),
  resizeComponent: vi.fn(),
  elementHasHeight: vi.fn(() => false),
  changeOverlayTitle: vi.fn(),
  sendDisplaySettingsToIframe: vi.fn(),
}));
vi.mock("./gist-properties-manager", () => ({
  resolveMessageProperties: vi.fn(() => ({
    isEmbedded: false,
    elementId: "",
    hasRouteRule: false,
    routeRule: "",
    position: "",
    hasPosition: false,
    shouldScale: false,
    campaignId: null,
    messageWidth: 414,
    overlayColor: "#00000033",
    persistent: false,
    exitClick: false,
    hasCustomWidth: false,
  })),
}));
vi.mock("./page-component-manager", () => ({
  positions: ["x-gist-top"],
  addPageElement: vi.fn(),
}));
vi.mock("./custom-attribute-manager", () => ({
  getAllCustomAttributes: vi.fn(() => new Map()),
}));
vi.mock("./queue-manager", () => ({
  checkMessageQueue: vi.fn(),
}));
vi.mock("./message-broadcast-manager", () => ({
  isMessageBroadcast: vi.fn(() => false),
  markBroadcastAsSeen: vi.fn(),
  markBroadcastAsDismissed: vi.fn(),
  isShowAlwaysBroadcast: vi.fn(() => false),
}));
vi.mock("./message-user-queue-manager", () => ({
  markUserQueueMessageAsSeen: vi.fn(),
  saveMessageState: vi.fn(),
  clearMessageState: vi.fn(),
  setMessageLoaded: vi.fn(),
}));
vi.mock("../utilities/message-utils", () => ({
  fetchMessageByInstanceId: vi.fn(),
  fetchMessageByElementId: vi.fn(() => null),
  isQueueIdAlreadyShowing: vi.fn(() => false),
  removeMessageByInstanceId: vi.fn(),
  updateMessageByInstanceId: vi.fn(),
  hasDisplayChanged: vi.fn(() => false),
  applyDisplaySettings: vi.fn(),
}));

vi.mock("../gist", () => ({ default: mockGist }));

describe("message-manager", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGist.overlayInstanceId = null;
    mockGist.currentMessages = [];
    mockGist.isDocumentVisible = true;
  });

  it("embedMessage assigns instanceId, sets overlay: false, stores elementId", () => {
    const message: GistMessage = { messageId: "msg-1" };
    const result = embedMessage(message, "my-element");

    expect(result).toBe(message);
    expect(message.instanceId).toBe("mock-uuid");
    expect(message.overlay).toBe(false);
    expect(message.elementId).toBe("my-element");
    expect(mockGist.currentMessages).toContain(message);
  });

  it("showMessage assigns instanceId, sets overlay: true, pushes to currentMessages", async () => {
    const message: GistMessage = { messageId: "msg-1" };
    const result = await showMessage(message);

    expect(result).toBe(message);
    expect(message.instanceId).toBe("mock-uuid");
    expect(message.overlay).toBe(true);
    expect(mockGist.currentMessages).toContain(message);
    expect(mockGist.overlayInstanceId).toBe("mock-uuid");
  });

  it("showMessage returns null when document is hidden", async () => {
    mockGist.isDocumentVisible = false;
    const message: GistMessage = { messageId: "msg-1" };
    const result = await showMessage(message);

    expect(result).toBeNull();
    expect(mockGist.currentMessages).toHaveLength(0);
  });

  it("showMessage returns null when queueId is already showing", async () => {
    const { isQueueIdAlreadyShowing } =
      await import("../utilities/message-utils");
    vi.mocked(isQueueIdAlreadyShowing).mockReturnValue(true);
    const message: GistMessage = { messageId: "msg-1", queueId: "q-1" };
    const result = await showMessage(message);

    expect(result).toBeNull();
    expect(mockGist.currentMessages).toHaveLength(0);
  });

  it("showMessage returns null when overlay is already active", async () => {
    mockGist.overlayInstanceId = "existing-overlay";
    const message: GistMessage = { messageId: "msg-1" };
    const result = await showMessage(message);

    expect(result).toBeNull();
    expect(mockGist.currentMessages).toHaveLength(0);
  });

  it("embedMessage returns null if elementId already has a message", async () => {
    const { fetchMessageByElementId } =
      await import("../utilities/message-utils");
    vi.mocked(fetchMessageByElementId).mockReturnValue({
      messageId: "existing",
      instanceId: "existing-id",
    } as GistMessage);
    const message: GistMessage = { messageId: "msg-1" };
    const result = embedMessage(message, "taken-element");

    expect(result).toBeNull();
    expect(mockGist.currentMessages).toHaveLength(0);
  });

  it("hideMessage calls messageDismissed and resets state", async () => {
    const { hideOverlayComponent } =
      await import("./message-component-manager");
    const { removeMessageByInstanceId } =
      await import("../utilities/message-utils");

    const message: GistMessage = {
      messageId: "msg-1",
      instanceId: "inst-1",
      overlay: true,
    };
    mockGist.currentMessages = [message];
    mockGist.overlayInstanceId = "inst-1";

    await hideMessage(message);

    expect(mockGist.messageDismissed).toHaveBeenCalledWith(message);
    expect(hideOverlayComponent).toHaveBeenCalled();
    expect(removeMessageByInstanceId).toHaveBeenCalledWith("inst-1");
    expect(mockGist.overlayInstanceId).toBeNull();
  });
});
