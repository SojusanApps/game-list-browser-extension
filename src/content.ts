import browser from "webextension-polyfill";

import { startBridge } from "./bridge";
import {
  type BackgroundSyncReply,
  type BackgroundSyncRequest,
  type Platform,
  SYNC_PORT,
  type SyncProgress,
  type SyncResult,
} from "./contract";
import { formatError } from "./errors";
import { currentLanguage } from "./language";

/** Runs a Platform Sync over a port, so the background script can send progress before the result. */
function requestSync(platform: Platform, onProgress: (progress: SyncProgress) => void): Promise<SyncResult> {
  return new Promise(resolve => {
    const port = browser.runtime.connect({ name: SYNC_PORT });
    let settled = false;
    const settle = (result: SyncResult) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };
    port.onMessage.addListener(message => {
      const reply = message as BackgroundSyncReply;
      if (reply.type === "PROGRESS") onProgress(reply.progress);
      else if (reply.type === "RESULT") {
        settle(reply.result);
        port.disconnect();
      }
    });
    // The background script stopped before answering (the browser shut it down, or the extension was reloaded).
    port.onDisconnect.addListener(() => {
      void currentLanguage().then(language =>
        settle({
          platform,
          status: "error",
          entries: [],
          count: 0,
          error: formatError(language, "syncInterrupted", {}),
        }),
      );
    });
    port.postMessage({ type: "SYNC", platform } satisfies BackgroundSyncRequest);
  });
}

startBridge({ window, requestSync });
