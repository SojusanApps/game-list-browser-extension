import { describe, expect, it } from "vitest";

import type { SyncStatusRecord } from "../status";
import { describeStatus } from "./describe";

const record = (extra: Partial<SyncStatusRecord>): SyncStatusRecord => ({
  platform: "playstation",
  state: "running",
  startedAt: 1,
  updatedAt: 2,
  ...extra,
});

describe("describeStatus", () => {
  it("shows the stage with its count and a determinate bar when the total is known", () => {
    expect(describeStatus(record({ stage: "resolving", done: 120, total: 480 }), "en")).toEqual({
      platform: "PlayStation",
      text: "Identifying games 120/480",
      progress: 0.25,
      tone: "running",
    });
  });

  it("shows the count without a bar when only the games read so far are known", () => {
    expect(describeStatus(record({ stage: "collection", done: 120 }), "en")).toMatchObject({
      text: "Reading your library 120",
      progress: null,
    });
  });

  it("shows an indeterminate bar when there is no total", () => {
    expect(describeStatus(record({ stage: "wishlist" }), "pl")).toMatchObject({
      text: "Odczyt listy życzeń",
      progress: null,
    });
  });

  it("describes outcomes without a bar", () => {
    expect(describeStatus(record({ state: "done", count: 1 }), "en")).toMatchObject({
      text: "Done: 1 game read.",
      progress: undefined,
    });
    expect(describeStatus(record({ state: "done", count: 5 }), "pl").text).toBe("Gotowe: odczytano 5 gier.");
    expect(describeStatus(record({ state: "error", error: "boom" }), "en")).toMatchObject({
      text: "boom",
      tone: "error",
    });
    expect(describeStatus(record({ state: "not_logged_in" }), "en").tone).toBe("warning");
  });
});
