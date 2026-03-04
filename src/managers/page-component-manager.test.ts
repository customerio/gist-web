import { describe, it, expect, vi, beforeEach } from "vitest";
import { positions, addPageElement } from "./page-component-manager";

vi.mock("../utilities/log", () => ({ log: vi.fn() }));

describe("page-component-manager", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("positions contains all 8 expected position strings", () => {
    const expected = [
      "x-gist-top",
      "x-gist-floating-top",
      "x-gist-bottom",
      "x-gist-floating-bottom",
      "x-gist-floating-bottom-left",
      "x-gist-floating-bottom-right",
      "x-gist-floating-top-left",
      "x-gist-floating-top-right",
    ];
    expect(positions).toEqual(expected);
    expect(positions).toHaveLength(8);
  });

  it('addPageElement("x-gist-top") inserts a div as the first child of body', () => {
    const existingChild = document.createElement("div");
    existingChild.id = "existing";
    document.body.appendChild(existingChild);

    addPageElement("x-gist-top");

    const inserted = document.getElementById("x-gist-top");
    expect(inserted).not.toBeNull();
    expect(document.body.firstChild).toBe(inserted);
    expect(document.body.children[1]).toBe(existingChild);
  });

  it("addPageElement with other positions appends to end of body", () => {
    addPageElement("x-gist-bottom");

    const inserted = document.getElementById("x-gist-bottom");
    expect(inserted).not.toBeNull();
    expect(document.body.lastChild).toBe(inserted);
  });

  it("addPageElement is idempotent (does not duplicate elements)", () => {
    addPageElement("x-gist-top");
    addPageElement("x-gist-top");

    const matches = document.querySelectorAll("#x-gist-top");
    expect(matches).toHaveLength(1);
  });
});
