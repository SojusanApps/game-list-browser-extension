import browser from "webextension-polyfill";

import type { PlatformAdapter } from "../adapter";
import { createNintendoAdapter } from "./core";
import { browserPageInspector } from "./tabs";

export const nintendoAdapter: PlatformAdapter = createNintendoAdapter({
  fetch: (input, init) => fetch(input, init),
  inspector: browserPageInspector,
  storage: {
    async get(key) {
      return (await browser.storage.local.get(key))[key];
    },
    async set(key, value) {
      await browser.storage.local.set({ [key]: value });
    },
    async remove(keys) {
      await browser.storage.local.remove(keys);
    },
  },
});
