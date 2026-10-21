import browser from "webextension-polyfill";

import type { BackgroundSyncRequest } from "./contract";
import { isPlatform } from "./contract";
import { adapters } from "./platforms";
import { runSync } from "./sync";

browser.runtime.onMessage.addListener((message: unknown) => {
  const request = message as Partial<BackgroundSyncRequest> | null;
  if (request?.type === "SYNC" && isPlatform(request.platform)) {
    return runSync(request.platform, adapters);
  }
  return undefined;
});
