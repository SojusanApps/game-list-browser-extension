import browser from "webextension-polyfill";

import { type Language, resolveLanguage, STORAGE_KEY } from "./popup/messages";

/** The language chosen in the popup, so messages built outside the popup match it. */
export async function currentLanguage(): Promise<Language> {
  const stored = await browser.storage.local.get(STORAGE_KEY).catch(() => ({}) as Record<string, unknown>);
  return resolveLanguage(stored[STORAGE_KEY], navigator.language);
}
