import { describe, expect, it } from "vitest";

import { MESSAGES, otherLanguage, resolveLanguage } from "./messages";

describe("resolveLanguage", () => {
  it("prefers a valid stored choice", () => {
    expect(resolveLanguage("pl", "en-US")).toBe("pl");
    expect(resolveLanguage("en", "pl-PL")).toBe("en");
  });

  it("falls back to the browser language when nothing valid is stored", () => {
    expect(resolveLanguage(undefined, "pl-PL")).toBe("pl");
    expect(resolveLanguage("de", "en-GB")).toBe("en");
    expect(resolveLanguage(null, "fr")).toBe("en");
  });
});

describe("messages", () => {
  it("toggles between the two languages", () => {
    expect(otherLanguage("en")).toBe("pl");
    expect(otherLanguage("pl")).toBe("en");
  });

  it("has the same keys in every language", () => {
    expect(Object.keys(MESSAGES.pl)).toEqual(Object.keys(MESSAGES.en));
  });
});
