import { describe, it, expect, vi, beforeEach } from "vitest";
import { updateMessage } from "./message-service";

const mockRequest = vi.fn();

vi.mock("./network", () => ({
  UserNetworkInstance: vi.fn(() => mockRequest),
}));

describe("message-service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("updateMessage() sends a PATCH request to the correct path", async () => {
    mockRequest.mockResolvedValue({ status: 200, data: {}, headers: {} });

    await updateMessage("queue-123", { opened: true });

    expect(mockRequest).toHaveBeenCalledWith(
      "/api/v1/messages/queue-123",
      expect.objectContaining({
        method: "PATCH",
      }),
    );
  });

  it("request body is JSON-stringified updatedFields", async () => {
    mockRequest.mockResolvedValue({ status: 200, data: {}, headers: {} });

    await updateMessage("queue-123", { opened: true, readAt: "2024-01-01" });

    expect(mockRequest).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        body: JSON.stringify({ opened: true, readAt: "2024-01-01" }),
      }),
    );
  });

  it("returns the response on success", async () => {
    const mockResponse = { status: 200, data: { ok: true }, headers: {} };
    mockRequest.mockResolvedValue(mockResponse);

    const result = await updateMessage("queue-123", {});

    expect(result).toEqual(mockResponse);
  });

  it("returns error.response on failure", async () => {
    const errorResponse = { status: 404, data: "Not found", headers: {} };
    mockRequest.mockRejectedValue({ response: errorResponse });

    const result = await updateMessage("queue-123", {});

    expect(result).toEqual(errorResponse);
  });
});
