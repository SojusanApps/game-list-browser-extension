import { describe, expect, it, vi } from "vitest";

import { createStatusStore, type StatusStorage, type SyncStatusMap } from "./status";

function setup(initial: SyncStatusMap = {}) {
  const saved: SyncStatusMap[] = [];
  const storage: StatusStorage = {
    load: async () => initial,
    save: async map => {
      saved.push(map);
    },
  };
  const onChange = vi.fn<(map: SyncStatusMap) => void>();
  let time = 1000;
  const store = createStatusStore(storage, onChange, () => (time += 10));
  return { store, saved, onChange };
}

describe("status store", () => {
  it("records a running sync, its progress and its outcome", async () => {
    const { store, saved } = setup();
    await store.start("playstation");
    await store.progress({ platform: "playstation", stage: "resolving", done: 3, total: 10 });
    expect(saved.at(-1)?.playstation).toMatchObject({ state: "running", stage: "resolving", done: 3, total: 10 });

    await store.finish({ platform: "playstation", status: "ok", entries: [], count: 7 });
    expect(saved.at(-1)?.playstation).toMatchObject({ state: "done", count: 7 });
    expect(saved.at(-1)?.playstation?.stage).toBeUndefined();
  });

  it("records errors and not-logged-in outcomes", async () => {
    const { store, saved } = setup();
    await store.start("steam");
    await store.finish({ platform: "steam", status: "error", entries: [], count: 0, error: "boom" });
    expect(saved.at(-1)?.steam).toMatchObject({ state: "error", error: "boom" });
    await store.start("epic");
    await store.finish({ platform: "epic", status: "not_logged_in", entries: [], count: 0 });
    expect(saved.at(-1)?.epic).toMatchObject({ state: "not_logged_in" });
  });

  it("keeps platforms apart and ignores progress for a sync that is not running", async () => {
    const { store, saved } = setup();
    await store.start("steam");
    await store.start("gog");
    await store.progress({ platform: "epic", stage: "collection" });
    expect(Object.keys(saved.at(-1)!).sort()).toEqual(["gog", "steam"]);
  });

  it("forgets a dismissed platform", async () => {
    const { store, saved } = setup();
    await store.start("steam");
    await store.dismiss("steam");
    expect(saved.at(-1)).toEqual({});
  });

  it("fails syncs an earlier background run left running, and keeps the finished ones", async () => {
    const { store, saved, onChange } = setup({
      steam: { platform: "steam", state: "running", stage: "collection", startedAt: 1, updatedAt: 2 },
      gog: { platform: "gog", state: "done", count: 4, startedAt: 1, updatedAt: 2 },
    });
    await store.recoverInterrupted("interrupted");
    expect(saved.at(-1)?.steam).toMatchObject({ state: "error", error: "interrupted" });
    expect(saved.at(-1)?.gog).toMatchObject({ state: "done", count: 4 });
    expect(onChange).toHaveBeenCalled();
  });
});
