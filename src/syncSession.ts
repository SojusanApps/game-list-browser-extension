import type { BackgroundSyncReply, Platform, SyncResult } from "./contract";
import type { AdapterRegistry } from "./platforms/adapter";
import type { Language } from "./popup/messages";
import type { StatusStore } from "./status";
import { runSync } from "./sync";
import { throttleLatest } from "./throttle";

/** How often progress is recorded and sent on; a library of hundreds of games reports far more often. */
export const PROGRESS_INTERVAL_MS = 250;

export interface SyncSession {
  platform: Platform;
  adapters: AdapterRegistry;
  language: Language;
  status: StatusStore;
  /** Delivers a reply to whoever asked for the sync; may throw once they are gone, which never stops the sync. */
  send(reply: BackgroundSyncReply): void;
}

/** Runs one Platform Sync, keeps its Sync Status up to date and sends its progress and result to the asker. */
export async function runTrackedSync({ platform, adapters, language, status, send }: SyncSession): Promise<SyncResult> {
  const trySend = (reply: BackgroundSyncReply) => {
    try {
      send(reply);
    } catch {
      // The asker (a closed page) is gone; the status still records how the sync ended.
    }
  };

  await status.start(platform);
  const progress = throttleLatest<Parameters<typeof status.progress>[0]>(update => {
    void status.progress(update);
    trySend({ type: "PROGRESS", progress: update });
  }, PROGRESS_INTERVAL_MS);

  const result = await runSync(platform, adapters, language, update => progress.push({ platform, ...update }));
  progress.cancel();
  await status.finish(result);
  trySend({ type: "RESULT", result });
  return result;
}
