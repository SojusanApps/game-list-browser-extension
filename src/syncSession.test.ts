import { describe, expect, it, vi } from "vitest";

import type { BackgroundSyncReply } from "./contract";
import { createStatusStore, type SyncStatusMap } from "./status";
import { runTrackedSync } from "./syncSession";

function setup() {
  const saved: SyncStatusMap[] = [];
  const status = createStatusStore({ load: async () => ({}), save: async map => void saved.push(map) }, () => {});
  const replies: BackgroundSyncReply[] = [];
  return { status, saved, replies, send: (reply: BackgroundSyncReply) => void replies.push(reply) };
}

describe("runTrackedSync", () => {
  it("sends progress then the result and ends with a done status", async () => {
    const { status, saved, replies, send } = setup();
    const result = await runTrackedSync({
      platform: "steam",
      language: "en",
      status,
      send,
      adapters: {
        steam: {
          fetchEntries: async report => {
            report?.({ stage: "collection", done: 1, total: 2 });
            return [{ storeId: "1", title: "A", wishlisted: false }];
          },
        },
      },
    });
    expect(result.status).toBe("ok");
    expect(replies[0]).toEqual({
      type: "PROGRESS",
      progress: { platform: "steam", stage: "collection", done: 1, total: 2 },
    });
    expect(replies.at(-1)).toEqual({ type: "RESULT", result });
    expect(saved.at(-1)?.steam).toMatchObject({ state: "done", count: 1 });
  });

  it("records an error status and still sends the result when the asker is gone", async () => {
    const { status, saved } = setup();
    const send = vi.fn<() => void>(() => {
      throw new Error("Attempt to postMessage on disconnected port");
    });
    const result = await runTrackedSync({
      platform: "steam",
      language: "en",
      status,
      send,
      adapters: {
        steam: {
          fetchEntries: async () => {
            throw new Error("down");
          },
        },
      },
    });
    expect(result.status).toBe("error");
    expect(saved.at(-1)?.steam).toMatchObject({ state: "error", error: expect.stringContaining("down") });
  });
});
