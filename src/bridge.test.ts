import { describe, expect, it, vi } from "vitest";

import { startBridge } from "./bridge";
import { parseFrontendMessage, type SyncResult } from "./contract";

const ORIGIN = "http://localhost:5173";

function setup(requestSync = vi.fn<(platform: string) => Promise<SyncResult>>()) {
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

const sync = { source: "gamelist-frontend", version: 2, type: "SYNC", requestId: "r1", platform: "steam" };

describe("startBridge", () => {
  it("announces READY on load", () => {
    const { win } = setup();
    expect(win.postMessage).toHaveBeenCalledWith({ source: "gamelist-extension", version: 2, type: "READY" }, ORIGIN);
  });

  it("answers PING with READY", async () => {
    const { win, send } = setup();
    win.postMessage.mockClear();
    await send({ source: "gamelist-frontend", version: 2, type: "PING" });
    expect(win.postMessage).toHaveBeenCalledWith({ source: "gamelist-extension", version: 2, type: "READY" }, ORIGIN);
  });

  it("relays SYNC to the background and posts the result with the requestId", async () => {
    const result: SyncResult = {
      platform: "steam",
      status: "ok",
      entries: [{ storeId: "1", title: "A", wishlisted: false }],
      count: 1,
    };
    const { win, send, requestSync } = setup(
      vi.fn<(platform: string) => Promise<SyncResult>>().mockResolvedValue(result),
    );
    await send(sync);
    expect(requestSync).toHaveBeenCalledWith("steam");
    expect(win.postMessage).toHaveBeenLastCalledWith(
      { source: "gamelist-extension", version: 2, type: "SYNC_RESULT", requestId: "r1", result },
      ORIGIN,
    );
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
