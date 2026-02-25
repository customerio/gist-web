import { describe, it, expect, vi, beforeEach } from "vitest";
import { settings } from "./settings";
import {
  setKeyToLocalStore,
  shouldPersistSession,
} from "../utilities/local-storage";

vi.mock("../utilities/log", () => ({ log: vi.fn() }));

describe("settings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    shouldPersistSession(true);
    localStorage.clear();
    sessionStorage.clear();
    settings.removeActiveSSEConnection();
    settings.setSSEHeartbeat(30);
  });

  it("getSdkId() returns a UUID string and is stable across calls", () => {
    const id1 = settings.getSdkId();
    const id2 = settings.getSdkId();
    expect(id1).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(id2).toBe(id1);
  });

  it("useSSE() / setUseSSEFlag() round-trip", () => {
    expect(settings.useSSE()).toBe(false);
    settings.setUseSSEFlag(true);
    expect(settings.useSSE()).toBe(true);
    settings.setUseSSEFlag(false);
    expect(settings.useSSE()).toBe(false);
  });

  it("setActiveSSEConnection() / hasActiveSSEConnection() / removeActiveSSEConnection() lifecycle", () => {
    expect(settings.hasActiveSSEConnection()).toBeFalsy();
    settings.setActiveSSEConnection();
    expect(settings.hasActiveSSEConnection()).toBeTruthy();
    settings.removeActiveSSEConnection();
    expect(settings.hasActiveSSEConnection()).toBeFalsy();
  });

  it("isSSEConnectionManagedBySDK() returns true only for the current SDK's connection", () => {
    settings.setActiveSSEConnection();
    expect(settings.isSSEConnectionManagedBySDK()).toBe(true);

    // Simulate another SDK setting a different connection ID
    setKeyToLocalStore(
      "gist.web.activeSSEConnection",
      "other-sdk-id",
      new Date(Date.now() + 60000),
    );
    expect(settings.isSSEConnectionManagedBySDK()).toBe(false);

    settings.removeActiveSSEConnection();
    expect(settings.isSSEConnectionManagedBySDK()).toBe(false);
  });

  it("setSSEHeartbeat() updates the heartbeat value returned by getSSEHeartbeat()", () => {
    settings.setSSEHeartbeat(30);
    expect(settings.getSSEHeartbeat()).toBe(35000); // (30 + 5) * 1000

    settings.setSSEHeartbeat(60);
    expect(settings.getSSEHeartbeat()).toBe(65000); // (60 + 5) * 1000
  });

  it("setSSEHeartbeat() ignores zero and negative values", () => {
    settings.setSSEHeartbeat(30);
    const before = settings.getSSEHeartbeat();

    settings.setSSEHeartbeat(0);
    expect(settings.getSSEHeartbeat()).toBe(before);

    settings.setSSEHeartbeat(-10);
    expect(settings.getSSEHeartbeat()).toBe(before);
  });

  it("endpoint objects have correct keys (prod, dev, local)", () => {
    const endpointKeys: Array<keyof typeof settings.ENGINE_API_ENDPOINT> = [
      "prod",
      "dev",
      "local",
    ];
    expect(Object.keys(settings.ENGINE_API_ENDPOINT).sort()).toEqual(
      endpointKeys.sort(),
    );
    expect(Object.keys(settings.GIST_QUEUE_API_ENDPOINT).sort()).toEqual(
      endpointKeys.sort(),
    );
    expect(
      Object.keys(settings.GIST_QUEUE_REALTIME_API_ENDPOINT).sort(),
    ).toEqual(endpointKeys.sort());
    expect(Object.keys(settings.GIST_VIEW_ENDPOINT).sort()).toEqual(
      endpointKeys.sort(),
    );
  });
});
