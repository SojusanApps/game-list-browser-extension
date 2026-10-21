import browser from "webextension-polyfill";

import { PAGE_POLL_INTERVAL_MS } from "./constants";

export interface PageSnapshot {
  url: string;
  html: string;
  /** URLs of the resources (XHR/fetch/script/...) the page has requested so far. */
  resourceUrls: string[];
}

export interface InspectOptions<T> {
  url: string;
  /** The tab counts as redirected (e.g. to a login page) once it settles on another host or path. */
  expectedHost: string;
  expectedPath?: string;
  timeoutMs: number;
  /** Reload the tab once if `probe` has found nothing after this many milliseconds. */
  reloadAfterMs?: number;
  /** Returns the value to resolve with, or null to keep polling. */
  probe(page: { getSnapshot(): Promise<PageSnapshot | null> }): Promise<T | null> | T | null;
}

export type InspectResult<T> = { status: "found"; value: T } | { status: "redirected" } | { status: "timeout" };

/** Opens a page in a background tab and polls it until `probe` finds something. */
export interface PageInspector {
  inspect<T>(options: InspectOptions<T>): Promise<InspectResult<T>>;
}

/** Runs inside the inspected page, so it must stay self-contained. */
function readPage() {
  return {
    url: location.href,
    html: document.documentElement?.innerHTML ?? "",
    resourceUrls: performance.getEntriesByType("resource").map(entry => entry.name),
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function parseUrl(raw: string | undefined): URL | null {
  try {
    return raw ? new URL(raw) : null;
  } catch {
    return null;
  }
}

export const browserPageInspector: PageInspector = {
  async inspect<T>(options: InspectOptions<T>): Promise<InspectResult<T>> {
    const tab = await browser.tabs.create({ url: options.url, active: false });
    const tabId = tab.id;
    if (typeof tabId !== "number") throw new Error("Nintendo discovery tab has no id");

    const getSnapshot = async (): Promise<PageSnapshot | null> => {
      try {
        const [injection] = await browser.scripting.executeScript({ target: { tabId }, func: readPage });
        return (injection?.result as PageSnapshot | undefined) ?? null;
      } catch {
        return null; // The page is still loading or is not scriptable (e.g. an error page).
      }
    };

    try {
      const startedAt = Date.now();
      let reloaded = false;
      while (Date.now() - startedAt < options.timeoutMs) {
        await sleep(PAGE_POLL_INTERVAL_MS);

        const current = await browser.tabs.get(tabId);
        const tabUrl = parseUrl(current.url);
        const onExpectedPage =
          tabUrl?.hostname === options.expectedHost &&
          (options.expectedPath === undefined || tabUrl.pathname === options.expectedPath);
        if (tabUrl?.protocol === "https:" && current.status === "complete" && !onExpectedPage) {
          return { status: "redirected" };
        }

        const value = await options.probe({ getSnapshot });
        if (value !== null) return { status: "found", value };

        if (options.reloadAfterMs !== undefined && !reloaded && Date.now() - startedAt >= options.reloadAfterMs) {
          reloaded = true;
          await browser.tabs.reload(tabId); //NOSONAR
        }
      }
      return { status: "timeout" };
    } finally {
      await browser.tabs.remove(tabId).catch(() => undefined);
    }
  },
};
