import { describe, it, expect } from "vitest";
import { messageHTMLTemplate } from "./message";
import type { ResolvedMessageProperties } from "../types";

function makeProps(
  overrides: Partial<ResolvedMessageProperties> = {},
): ResolvedMessageProperties {
  return {
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
    ...overrides,
  };
}

describe("messageHTMLTemplate", () => {
  it("returns HTML containing the iframe with the correct id and src", () => {
    const html = messageHTMLTemplate(
      "my-element-id",
      makeProps(),
      "https://example.com/msg",
    );

    expect(html).toContain('id="my-element-id"');
    expect(html).toContain('src="https://example.com/msg"');
  });

  it("uses messageProperties.overlayColor in the background style", () => {
    const html = messageHTMLTemplate(
      "el",
      makeProps({ overlayColor: "#ff000080" }),
      "https://example.com",
    );

    expect(html).toContain("background-color: #ff000080");
  });

  it("uses messageProperties.messageWidth for the message width", () => {
    const html = messageHTMLTemplate(
      "el",
      makeProps({ messageWidth: 500 }),
      "https://example.com",
    );

    expect(html).toContain("width: 500px");
  });

  it("uses default 600px breakpoint when messageWidth <= 600", () => {
    const html = messageHTMLTemplate(
      "el",
      makeProps({ messageWidth: 414 }),
      "https://example.com",
    );

    expect(html).toContain("@media (max-width: 600px)");
  });

  it("adjusts media query breakpoint when messageWidth > 600", () => {
    const html = messageHTMLTemplate(
      "el",
      makeProps({ messageWidth: 800 }),
      "https://example.com",
    );

    expect(html).toContain("@media (max-width: 800px)");
    expect(html).not.toContain("@media (max-width: 600px)");
  });

  it("contains the gist-overlay wrapper div", () => {
    const html = messageHTMLTemplate("el", makeProps(), "https://example.com");

    expect(html).toContain('id="gist-overlay"');
    expect(html).toContain('class="gist-background"');
  });

  it("contains the gist-embed-message wrapper div", () => {
    const html = messageHTMLTemplate("el", makeProps(), "https://example.com");

    expect(html).toContain('id="gist-embed-message"');
  });
});
