import browser from "webextension-polyfill";

import { startBridge } from "./bridge";
import type { BackgroundSyncRequest, SyncResult } from "./contract";

startBridge({
  window,
  requestSync: platform =>
    browser.runtime.sendMessage({ type: "SYNC", platform } satisfies BackgroundSyncRequest) as Promise<SyncResult>,
});
