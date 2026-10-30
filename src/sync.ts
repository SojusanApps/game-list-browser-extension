import type { LibraryEntry, Platform, SyncResult } from "./contract";
import { describeError, formatError } from "./errors";
import { type AdapterRegistry, NotLoggedInError } from "./platforms/adapter";
import type { Language } from "./popup/messages";

/**
 * Trims entries, drops those without a store id or title, and keeps one entry per store id in first-seen order.
 * A game that is both owned and wishlisted is kept as owned.
 */
export function dedupeEntries(entries: readonly LibraryEntry[]): LibraryEntry[] {
  const byStoreId = new Map<string, LibraryEntry>();
  for (const entry of entries) {
    const storeId = entry.storeId.trim();
    const title = entry.title.trim();
    if (!storeId || !title) continue;
    const existing = byStoreId.get(storeId);
    if (!existing) byStoreId.set(storeId, { storeId, title, wishlisted: entry.wishlisted });
    else if (existing.wishlisted && !entry.wishlisted) existing.wishlisted = false;
  }
  return [...byStoreId.values()];
}

/** Runs one Platform Sync and always resolves with a SyncResult, never throws. Error messages use `language`. */
export async function runSync(
  platform: Platform,
  adapters: AdapterRegistry,
  language: Language = "en",
): Promise<SyncResult> {
  const adapter = adapters[platform];
  if (!adapter) {
    return {
      platform,
      status: "error",
      entries: [],
      count: 0,
      error: formatError(language, "unsupportedPlatform", { platform }),
    };
  }
  try {
    const entries = dedupeEntries(await adapter.fetchEntries());
    return { platform, status: "ok", entries, count: entries.length };
  } catch (error) {
    if (error instanceof NotLoggedInError) {
      return { platform, status: "not_logged_in", entries: [], count: 0 };
    }
    return { platform, status: "error", entries: [], count: 0, error: describeError(error, language) };
  }
}
