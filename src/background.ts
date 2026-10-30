import browser from "webextension-polyfill";

import type { BackgroundSyncRequest } from "./contract";
import { isPlatform } from "./contract";
import { adapters } from "./platforms";
import { type Language, resolveLanguage, STORAGE_KEY } from "./popup/messages";
import { runSync } from "./sync";

/** The language chosen in the popup, so error messages match it. */
async function currentLanguage(): Promise<Language> {
  const stored = await browser.storage.local.get(STORAGE_KEY).catch(() => ({}) as Record<string, unknown>);
  return resolveLanguage(stored[STORAGE_KEY], navigator.language);
}

browser.runtime.onMessage.addListener((message: unknown) => {
  const request = message as Partial<BackgroundSyncRequest> | null;
  if (request?.type === "SYNC" && isPlatform(request.platform)) {
    const { platform } = request;
    return currentLanguage().then(language => runSync(platform, adapters, language));
  }
  return undefined;
});
