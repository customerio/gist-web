import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  setKeyToLocalStore,
  getKeyFromLocalStore,
  clearKeyFromLocalStore,
  clearExpiredFromLocalStore,
  shouldPersistSession,
  isSessionBeingPersisted,
} from "./local-storage";

vi.mock("./log", () => ({ log: vi.fn() }));

describe("local-storage", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it("setKeyToLocalStore / getKeyFromLocalStore round-trips a value", () => {
    shouldPersistSession(true);
    setKeyToLocalStore("test-key", { foo: "bar" });
    expect(getKeyFromLocalStore("test-key")).toEqual({ foo: "bar" });
  });

  it("getKeyFromLocalStore returns null for a missing key", () => {
    shouldPersistSession(true);
    expect(getKeyFromLocalStore("nonexistent")).toBeNull();
  });

  it("expired keys return null and are removed from storage", () => {
    shouldPersistSession(true);
    const pastDate = new Date(Date.now() - 1000);
    setKeyToLocalStore("expired-key", "value", pastDate);
    expect(getKeyFromLocalStore("expired-key")).toBeNull();
    expect(localStorage.getItem("expired-key")).toBeNull();
  });

  it("clearKeyFromLocalStore removes a key", () => {
    shouldPersistSession(true);
    setKeyToLocalStore("to-clear", "value");
    expect(getKeyFromLocalStore("to-clear")).toBe("value");
    clearKeyFromLocalStore("to-clear");
    expect(getKeyFromLocalStore("to-clear")).toBeNull();
  });

  it("clearExpiredFromLocalStore removes all expired keys, keeps non-expired", () => {
    shouldPersistSession(true);
    const pastDate = new Date(Date.now() - 1000);
    setKeyToLocalStore("expired", "old", pastDate);
    setKeyToLocalStore("valid", "new");
    clearExpiredFromLocalStore();
    expect(getKeyFromLocalStore("expired")).toBeNull();
    expect(getKeyFromLocalStore("valid")).toBe("new");
  });

  it("shouldPersistSession(false) causes storage to use sessionStorage", () => {
    shouldPersistSession(false);
    setKeyToLocalStore("session-key", "session-value");
    expect(getKeyFromLocalStore("session-key")).toBe("session-value");
    expect(sessionStorage.length).toBeGreaterThan(0);
    expect(localStorage.getItem("session-key")).toBeNull();
  });

  it("shouldPersistSession(true) causes storage to use localStorage", () => {
    shouldPersistSession(true);
    setKeyToLocalStore("local-key", "local-value");
    expect(getKeyFromLocalStore("local-key")).toBe("local-value");
    expect(localStorage.getItem("local-key")).not.toBeNull();
  });

  it("broadcast/user keys with expiry >60 minutes in the future are cleared", () => {
    shouldPersistSession(true);
    const twoHoursFromNow = new Date(Date.now() + 2 * 60 * 60 * 1000);
    setKeyToLocalStore(
      "gist.web.message.broadcasts.abc123",
      "value",
      twoHoursFromNow,
    );
    expect(
      getKeyFromLocalStore("gist.web.message.broadcasts.abc123"),
    ).toBeNull();
  });

  it("isSessionBeingPersisted() returns true by default and reflects shouldPersistSession()", () => {
    expect(isSessionBeingPersisted()).toBe(true);
    shouldPersistSession(false);
    expect(isSessionBeingPersisted()).toBe(false);
    shouldPersistSession(true);
    expect(isSessionBeingPersisted()).toBe(true);
  });
});
