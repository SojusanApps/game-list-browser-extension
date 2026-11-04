import browser from "webextension-polyfill";

import {
  type BackgroundDismissRequest,
  type BackgroundSyncReply,
  type BackgroundSyncRequest,
  isPlatform,
  SYNC_PORT,
} from "./contract";
import { formatError } from "./errors";
import { currentLanguage } from "./language";
import { adapters } from "./platforms";
import { createStatusStore, STATUS_KEY, type SyncStatusMap } from "./status";
import { runTrackedSync } from "./syncSession";

/** "…" while a sync runs, "!" while a failed one is not dismissed, nothing otherwise. */
function badgeFor(map: SyncStatusMap): { text: string; color: string } {
  const records = Object.values(map);
  if (records.some(record => record.state === "running")) return { text: "…", color: "#1a73e8" };
  if (records.some(record => record.state === "error")) return { text: "!", color: "#d93025" };
  return { text: "", color: "#1a73e8" };
}

function updateBadge(map: SyncStatusMap) {
  const { text, color } = badgeFor(map);
  void browser.action.setBadgeText({ text }).catch(() => {});
  void browser.action.setBadgeBackgroundColor({ color }).catch(() => {});
}

const status = createStatusStore(
  {
    load: async () => ((await browser.storage.session.get(STATUS_KEY))[STATUS_KEY] ?? {}) as SyncStatusMap,
    save: map => browser.storage.session.set({ [STATUS_KEY]: map }),
  },
  updateBadge,
);

// A background script that has just started runs no sync, so a sync still recorded as running was cut off.
void currentLanguage().then(language => status.recoverInterrupted(formatError(language, "syncInterrupted", {}))); // NOSONAR

browser.runtime.onConnect.addListener(port => {
  if (port.name !== SYNC_PORT) return;
  port.onMessage.addListener(message => {
    const request = message as Partial<BackgroundSyncRequest> | null;
    if (request?.type !== "SYNC" || !isPlatform(request.platform)) return;
    const { platform } = request;
    void currentLanguage().then(language =>
      runTrackedSync({
        platform,
        adapters,
        language,
        status,
        send: (reply: BackgroundSyncReply) => port.postMessage(reply),
      }),
    );
  });
});

browser.runtime.onMessage.addListener((message: unknown) => {
  const request = message as Partial<BackgroundDismissRequest> | null;
  if (request?.type === "DISMISS" && isPlatform(request.platform)) return status.dismiss(request.platform);
  return undefined;
});
