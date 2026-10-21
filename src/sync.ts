import type { Platform, SyncResult } from "./contract";
import { type AdapterRegistry, NotLoggedInError } from "./platforms/adapter";

/** Trims titles and drops blanks and exact duplicates, keeping first-seen order. */
export function dedupeTitles(titles: readonly string[]): string[] {
  const seen = new Set<string>();
  for (const title of titles) {
    const trimmed = title.trim();
    if (trimmed) seen.add(trimmed);
  }
  return [...seen];
}

/** Runs one Platform Sync and always resolves with a SyncResult, never throws. */
export async function runSync(platform: Platform, adapters: AdapterRegistry): Promise<SyncResult> {
  const adapter = adapters[platform];
  if (!adapter) {
    return { platform, status: "error", titles: [], count: 0, error: `${platform} is not supported yet` };
  }
  try {
    const rawTitles = await adapter.fetchTitles();
    const titles = dedupeTitles(rawTitles);
    return { platform, status: "ok", titles, count: titles.length };
  } catch (error) {
    if (error instanceof NotLoggedInError) {
      return { platform, status: "not_logged_in", titles: [], count: 0 };
    }
    const message = error instanceof Error ? error.message : String(error);
    return { platform, status: "error", titles: [], count: 0, error: message };
  }
}
