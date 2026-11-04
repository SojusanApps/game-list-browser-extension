import { describe, expect, it, vi } from "vitest";

import { startBridge } from "./bridge";
import { parseFrontendMessage, type SyncProgress, type SyncResult } from "./contract";

const ORIGIN = "http://localhost:5173";

type RequestSync = (platform: string, onProgress: (progress: SyncProgress) => void) => Promise<SyncResult>;

function setup(requestSync = vi.fn<RequestSync>()) {
  let listener: (event: MessageEvent) => Promise<void> = async () => {};
  const win = {
    location: { origin: ORIGIN },
    postMessage: vi.fn<(message: unknown, origin: string) => void>(),
    addEventListener: (_: string, fn: typeof listener) => {
      listener = fn;
    },
  };
  startBridge({ window: win as never, requestSync: requestSync as never });
  const send = (data: unknown, overrides: Partial<MessageEvent> = {}) =>
    listener({ data, source: win, origin: ORIGIN, ...overrides } as MessageEvent);
  return { win, send, requestSync };
}

const sync = { source: "gamelist-frontend", version: 3, type: "SYNC", requestId: "r1", platform: "steam" };

describe("startBridge", () => {
  it("announces READY on load", () => {
    const { win } = setup();
    expect(win.postMessage).toHaveBeenCalledWith({ source: "gamelist-extension", version: 3, type: "READY" }, ORIGIN);
  });

  it("answers PING with READY", async () => {
    const { win, send } = setup();
    win.postMessage.mockClear();
    await send({ source: "gamelist-frontend", version: 3, type: "PING" });
    expect(win.postMessage).toHaveBeenCalledWith({ source: "gamelist-extension", version: 3, type: "READY" }, ORIGIN);
  });

  it("relays SYNC to the background and posts the result with the requestId", async () => {
    const result: SyncResult = {
      platform: "steam",
      status: "ok",
      entries: [{ storeId: "1", title: "A", wishlisted: false }],
      count: 1,
    };
    const { win, send, requestSync } = setup(vi.fn<RequestSync>().mockResolvedValue(result));
    await send(sync);
    expect(requestSync).toHaveBeenCalledWith("steam", expect.any(Function));
    expect(win.postMessage).toHaveBeenLastCalledWith(
      { source: "gamelist-extension", version: 3, type: "SYNC_RESULT", requestId: "r1", result },
      ORIGIN,
    );
  });

  it("posts SYNC_PROGRESS with the requestId to frontends that know it", async () => {
    const progress: SyncProgress = { platform: "steam", stage: "resolving", done: 2, total: 9 };
    const { win, send } = setup(
      vi.fn<RequestSync>().mockImplementation(async (_platform, onProgress) => {
        onProgress(progress);
        return { platform: "steam", status: "ok", entries: [], count: 0 };
      }),
    );
    await send(sync);
    expect(win.postMessage).toHaveBeenCalledWith(
      { source: "gamelist-extension", version: 3, type: "SYNC_PROGRESS", requestId: "r1", progress },
      ORIGIN,
    );
  });

  it("never sends SYNC_PROGRESS to a frontend on an older contract version", async () => {
    const { win, send } = setup(
      vi.fn<RequestSync>().mockImplementation(async (_platform, onProgress) => {
        onProgress({ platform: "steam", stage: "starting" });
        return { platform: "steam", status: "ok", entries: [], count: 0 };
      }),
    );
    await send({ ...sync, version: 2 });
    const types = win.postMessage.mock.calls.map(([message]) => (message as { type: string }).type);
    expect(types).not.toContain("SYNC_PROGRESS");
    expect(types).toContain("SYNC_RESULT");
  });

  it("ignores messages from other windows or origins", async () => {
    const { send, requestSync } = setup();
    await send(sync, { source: {} as never });
    await send(sync, { origin: "https://evil.example" });
    expect(requestSync).not.toHaveBeenCalled();
  });
});

describe("parseFrontendMessage", () => {
  it("rejects unknown platforms and malformed payloads", () => {
    expect(parseFrontendMessage({ ...sync, platform: "origin" })).toBeNull();
    expect(parseFrontendMessage({ ...sync, requestId: 1 })).toBeNull();
    expect(parseFrontendMessage("SYNC")).toBeNull();
    expect(parseFrontendMessage(null)).toBeNull();
  });
});
