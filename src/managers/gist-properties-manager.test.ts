import { describe, it, expect } from "vitest";
import { resolveMessageProperties } from "./gist-properties-manager";
import type { GistMessage } from "../types";

const defaults = {
  isEmbedded: false,
  elementId: "",
  hasRouteRule: false,
  routeRule: "",
  position: "",
  hasPosition: false,
  tooltipPosition: "",
  hasTooltipPosition: false,
  shouldScale: false,
  campaignId: null,
  messageWidth: 414,
  overlayColor: "#00000033",
  persistent: false,
  exitClick: false,
  hasCustomWidth: false,
};

describe("resolveMessageProperties", () => {
  it("returns defaults when message.properties is undefined", () => {
    const message: GistMessage = { messageId: "test" };
    expect(resolveMessageProperties(message)).toEqual(defaults);
  });

  it("returns defaults when message.properties.gist is undefined", () => {
    const message: GistMessage = { messageId: "test", properties: {} };
    expect(resolveMessageProperties(message)).toEqual(defaults);
  });

  it("isEmbedded is true when gist.elementId is set", () => {
    const message: GistMessage = {
      messageId: "test",
      properties: { gist: { elementId: "my-element" } },
    };
    expect(resolveMessageProperties(message).isEmbedded).toBe(true);
    expect(resolveMessageProperties(message).elementId).toBe("my-element");
  });

  it("hasRouteRule is true when gist.routeRuleWeb is set", () => {
    const message: GistMessage = {
      messageId: "test",
      properties: { gist: { routeRuleWeb: "/dashboard" } },
    };
    expect(resolveMessageProperties(message).hasRouteRule).toBe(true);
    expect(resolveMessageProperties(message).routeRule).toBe("/dashboard");
  });

  it("hasTooltipPosition is true and tooltipPosition is set when gist.tooltipPosition is set", () => {
    const message: GistMessage = {
      messageId: "test",
      properties: { gist: { tooltipPosition: "top" } },
    };
    expect(resolveMessageProperties(message).hasTooltipPosition).toBe(true);
    expect(resolveMessageProperties(message).tooltipPosition).toBe("top");
  });

  it("shouldScale is true when gist.scale is truthy", () => {
    const message: GistMessage = {
      messageId: "test",
      properties: { gist: { scale: true } },
    };
    expect(resolveMessageProperties(message).shouldScale).toBe(true);
  });

  it("campaignId uses nullish coalescing (returns null not undefined)", () => {
    const message: GistMessage = {
      messageId: "test",
      properties: { gist: {} },
    };
    const result = resolveMessageProperties(message);
    expect(result.campaignId).toBe(null);
    expect("campaignId" in result && result.campaignId === null).toBe(true);
  });

  it("messageWidth falls back to 414 when 0 or negative", () => {
    const messageZero: GistMessage = {
      messageId: "test",
      properties: { gist: { messageWidth: 0 } },
    };
    expect(resolveMessageProperties(messageZero).messageWidth).toBe(414);

    const messageNegative: GistMessage = {
      messageId: "test",
      properties: { gist: { messageWidth: -100 } },
    };
    expect(resolveMessageProperties(messageNegative).messageWidth).toBe(414);
  });

  it("hasCustomWidth is true when messageWidth > 0", () => {
    const message: GistMessage = {
      messageId: "test",
      properties: { gist: { messageWidth: 500 } },
    };
    expect(resolveMessageProperties(message).hasCustomWidth).toBe(true);
    expect(resolveMessageProperties(message).messageWidth).toBe(500);
  });

  it("overlayColor falls back to #00000033 when not set", () => {
    const message: GistMessage = {
      messageId: "test",
      properties: { gist: {} },
    };
    expect(resolveMessageProperties(message).overlayColor).toBe("#00000033");

    const messageWithColor: GistMessage = {
      messageId: "test",
      properties: { gist: { overlayColor: "#ff000080" } },
    };
    expect(resolveMessageProperties(messageWithColor).overlayColor).toBe(
      "#ff000080",
    );
  });

  it("persistent and exitClick are boolean-coerced", () => {
    const message: GistMessage = {
      messageId: "test",
      properties: {
        gist: { persistent: true, exitClick: 1 as unknown as boolean },
      },
    };
    const result = resolveMessageProperties(message);
    expect(result.persistent).toBe(true);
    expect(result.exitClick).toBe(true);
  });
});
