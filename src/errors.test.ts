import { describe, expect, it } from "vitest";

import { type ErrorCode, formatError, SyncError } from "./errors";
import { LANGUAGES } from "./popup/messages";

describe("SyncError", () => {
  it("uses the English rendering as its message", () => {
    const error = new SyncError("requestFailed", { platform: "gog", status: 503 });
    expect(error.message).toBe("GOG request failed (HTTP 503)");
    expect(error.format("pl")).toBe("Żądanie do GOG nie powiodło się (HTTP 503)");
  });
});

describe("formatError", () => {
  it("appends the detail to a failed request", () => {
    expect(formatError("pl", "requestFailed", { platform: "nintendo", status: 200, detail: "boom" })).toBe(
      "Żądanie do Nintendo nie powiodło się (HTTP 200): boom",
    );
  });

  it("has a message for every code in every language", () => {
    const codes: ErrorCode[] = ["epicWishlistUnavailable", "nintendoConfigNotFound", "nintendoPageUnreadable"];
    for (const language of LANGUAGES) {
      for (const code of codes) expect(formatError(language, code, {})).not.toBe("");
    }
  });
});
