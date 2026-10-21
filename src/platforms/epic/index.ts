import browser from "webextension-polyfill";

import { createEpicAdapter } from "./adapter";

const STORE_HOME_URL = "https://store.epicgames.com/";
const WARMUP_LOAD_TIMEOUT_MS = 20_000;
/** Extra time after the page loads for its scripts to finish issuing the session cookies. */
const WARMUP_SETTLE_MS = 3000;

function waitForTabLoad(tabId: number): Promise<void> {
  return new Promise(resolve => {
    const done = () => {
      clearTimeout(timer);
      browser.tabs.onUpdated.removeListener(onUpdated);
      resolve();
    };
    const onUpdated = (updatedId: number, changeInfo: { status?: string }) => {
      if (updatedId === tabId && changeInfo.status === "complete") done();
    };
    const timer = setTimeout(done, WARMUP_LOAD_TIMEOUT_MS);
    browser.tabs.onUpdated.addListener(onUpdated);
  });
}

async function warmupStoreSession(): Promise<void> {
  const tab = await browser.tabs.create({ url: STORE_HOME_URL, active: false });
  if (tab.id !== undefined) await waitForTabLoad(tab.id);
  await new Promise(resolve => setTimeout(resolve, WARMUP_SETTLE_MS));
  if (tab.id !== undefined) await browser.tabs.remove(tab.id).catch(() => undefined);
}

export const epicAdapter = createEpicAdapter({ fetch: (input, init) => fetch(input, init), warmupStoreSession });
