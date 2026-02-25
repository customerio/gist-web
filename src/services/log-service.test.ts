import { describe, it, expect, vi, beforeEach } from "vitest";
import { logUserMessageView, logMessageView } from "./log-service";

const mockPost = vi.fn();

vi.mock("./network", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./network")>();
  return {
    ...actual,
    UserNetworkInstance: vi.fn(() => ({
      post: mockPost,
    })),
  };
});

describe("log-service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("logMessageView() calls the correct API path", async () => {
    mockPost.mockResolvedValue({ status: 200, data: {}, headers: {} });

    await logMessageView("msg-123");

    expect(mockPost).toHaveBeenCalledWith("/api/v1/logs/message/msg-123");
  });

  it("logUserMessageView() calls the correct API path", async () => {
    mockPost.mockResolvedValue({ status: 200, data: {}, headers: {} });

    await logUserMessageView("queue-456");

    expect(mockPost).toHaveBeenCalledWith("/api/v1/logs/queue/queue-456");
  });

  it("returns the response on success", async () => {
    const mockResponse = { status: 200, data: { ok: true }, headers: {} };
    mockPost.mockResolvedValue(mockResponse);

    const result = await logMessageView("msg-123");

    expect(result).toEqual(mockResponse);
  });

  it("returns error.response on failure", async () => {
    const errorResponse = { status: 500, data: "Server error", headers: {} };
    mockPost.mockRejectedValue({ response: errorResponse });

    const result = await logMessageView("msg-123");

    expect(result).toEqual(errorResponse);
  });
});
