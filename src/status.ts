import type { Platform, SyncProgress, SyncResult } from "./contract";

/** Key under which the Sync Status of every platform is kept in `storage.session`. */
export const STATUS_KEY = "syncStatus";

export type SyncState = "running" | "done" | "not_logged_in" | "error";

/** What the popup shows about the latest Platform Sync of one platform. */
export interface SyncStatusRecord {
  platform: Platform;
  state: SyncState;
  /** Only while `running`. */
  stage?: SyncProgress["stage"];
  done?: number;
  total?: number;
  /** Only when `done`: how many entries were read. */
  count?: number;
  /** Only when `error`, already in the language chosen at the time. */
  error?: string;
  startedAt: number;
  updatedAt: number;
}

export type SyncStatusMap = Partial<Record<Platform, SyncStatusRecord>>;

export interface StatusStorage {
  load(): Promise<SyncStatusMap>;
  save(map: SyncStatusMap): Promise<void>;
}

export interface StatusStore {
  /** Reads what an earlier background run left in storage; every other method waits for it. */
  ready: Promise<void>;
  start(platform: Platform): Promise<void>;
  progress(progress: SyncProgress): Promise<void>;
  finish(result: SyncResult): Promise<void>;
  dismiss(platform: Platform): Promise<void>;
  /** Marks syncs a stopped background run left `running` as failed with `message`. Call once, at startup. */
  recoverInterrupted(message: string): Promise<void>;
}

/**
 * Keeps one Sync Status per platform in memory and mirrors every change to `storage`. The background script is the
 * only writer, so the popup, which reads and listens to the storage, never races with it.
 */
export function createStatusStore(
  storage: StatusStorage,
  onChange: (map: SyncStatusMap) => void,
  now: () => number = Date.now,
): StatusStore {
  let map: SyncStatusMap = {};
  const ready = storage.load().then(
    loaded => {
      map = loaded;
    },
    () => {},
  );

  async function commit(platform: Platform, record: SyncStatusRecord | null) {
    await ready;
    const next = { ...map };
    if (record) next[platform] = record;
    else delete next[platform];
    map = next;
    onChange(map);
    await storage.save(map).catch(() => {});
  }

  return {
    ready,
    start: platform =>
      commit(platform, {
        platform,
        state: "running",
        stage: "starting",
        startedAt: now(),
        updatedAt: now(),
      }),
    async progress({ platform, stage, done, total }) {
      await ready;
      const current = map[platform];
      if (current?.state !== "running") return;
      await commit(platform, { ...current, stage, done, total, updatedAt: now() });
    },
    async finish(result) {
      await ready;
      const startedAt = map[result.platform]?.startedAt ?? now();
      const base = { platform: result.platform, startedAt, updatedAt: now() };
      if (result.status === "ok") await commit(result.platform, { ...base, state: "done", count: result.count });
      else if (result.status === "not_logged_in") await commit(result.platform, { ...base, state: "not_logged_in" });
      else await commit(result.platform, { ...base, state: "error", error: result.error });
    },
    dismiss: platform => commit(platform, null),
    async recoverInterrupted(message) {
      await ready;
      for (const record of Object.values(map)) {
        if (record.state === "running") {
          const failed: SyncStatusRecord = {
            platform: record.platform,
            state: "error",
            error: message,
            startedAt: record.startedAt,
            updatedAt: now(),
          };
          // Sequential on purpose: each commit saves the whole map, so saves must not overlap.
          await commit(record.platform, failed); // NOSONAR
        }
      }
    },
  };
}
