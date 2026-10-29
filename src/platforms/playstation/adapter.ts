import type { LibraryEntry } from "../../contract";
import { SyncError } from "../../errors";
import { MissingStoreIdError, NotLoggedInError, type PlatformAdapter } from "../adapter";
import {
  type CollectionPage,
  extractAccountId,
  extractLocale,
  extractNextData,
  parseCollectionPage,
  parseConceptId,
  parseWishlist,
} from "./parse";

export const COLLECTION_URL = "https://library.playstation.com/recently-purchased";
export const WISHLIST_URL = "https://library.playstation.com/wishlist";
const STORE_URL = "https://store.playstation.com";

/** Safety cap on collection pages, matching the reference implementation. */
const MAX_COLLECTION_PAGES = 100;
const CONCEPT_CONCURRENCY = 4;
/** Store locale used when the session does not name one; product ids are regional, so this may not resolve them. */
const FALLBACK_LOCALE = "en-us";

type Fetch = (url: string, init: RequestInit) => Promise<Response>;

/** Fetches a library page and returns its parsed `__NEXT_DATA__`, throwing NotLoggedInError without a session. */
async function fetchNextData(url: string, fetchFn: Fetch): Promise<unknown> {
  let response: Response;
  try {
    response = await fetchFn(url, {
      method: "GET",
      credentials: "include",
      cache: "no-store",
      redirect: "manual",
      // The library localizes titles by language, so ask for English; the imported titles are matched against English names.
      headers: { Accept: "text/html,application/xhtml+xml", "Accept-Language": "en-US,en;q=0.9" },
    });
  } catch (error) {
    // A signed-out visitor is redirected cross-origin to the sign-in page, which surfaces as a network error.
    if (error instanceof TypeError) throw new NotLoggedInError("playstation");
    throw error;
  }

  if (response.type === "opaqueredirect" || (response.status >= 300 && response.status < 400)) {
    throw new NotLoggedInError("playstation");
  }
  if (response.redirected && response.url.toLowerCase().includes("/signin")) {
    throw new NotLoggedInError("playstation");
  }
  if (!response.ok) {
    throw new SyncError("requestFailed", { platform: "playstation", status: response.status });
  }

  const nextData = extractNextData(await response.text());
  if (nextData === null || extractAccountId(nextData) === null) {
    throw new NotLoggedInError("playstation");
  }
  return nextData;
}

function pageUrl(baseUrl: string, page: number): string {
  const url = new URL(baseUrl);
  url.searchParams.set("page", String(page));
  return url.toString();
}

/** True when `data` is the last collection page, going by the page's own flag, the total count, or an empty page. */
function isLastCollectionPage(data: CollectionPage, page: number, expectedPageSize: number): boolean {
  if (data.isLast) return true;
  if (expectedPageSize > 0 && data.totalCount !== undefined && page >= Math.ceil(data.totalCount / expectedPageSize)) {
    return true;
  }
  return data.entries.length === 0 && data.totalCount === undefined;
}

async function fetchCollectionEntries(fetchFn: Fetch): Promise<{ entries: LibraryEntry[]; locale: string | null }> {
  const entries: LibraryEntry[] = [];
  let locale: string | null = null;
  let expectedPageSize = 0;

  for (let page = 1; page <= MAX_COLLECTION_PAGES; page += 1) {
    const nextData = await fetchNextData(page === 1 ? COLLECTION_URL : pageUrl(COLLECTION_URL, page), fetchFn);
    locale ??= extractLocale(nextData);
    const data = parseCollectionPage(nextData);
    if (!data) throw new SyncError("dataNotFound", { platform: "playstation", step: "collection" });

    entries.push(...data.entries);

    expectedPageSize = Math.max(expectedPageSize, data.size ?? 0);
    if (isLastCollectionPage(data, page, expectedPageSize)) break;
  }

  return { entries, locale };
}

async function fetchWishlistEntries(fetchFn: Fetch): Promise<LibraryEntry[]> {
  const nextData = await fetchNextData(WISHLIST_URL, fetchFn);
  const entries = parseWishlist(nextData);
  if (entries === null) throw new SyncError("dataNotFound", { platform: "playstation", step: "wishlist" });
  return entries;
}

/** The concept id of a product from its store page, or null when the store does not know the product. */
async function fetchConceptId(productId: string, locale: string, fetchFn: Fetch): Promise<string | null> {
  const response = await fetchFn(`${STORE_URL}/${locale}/product/${encodeURIComponent(productId)}`, {
    method: "GET",
    credentials: "include",
    cache: "no-store",
    headers: { Accept: "text/html,application/xhtml+xml" },
  });
  if (!response.ok)
    throw new SyncError("requestFailed", { platform: "playstation", step: "product", status: response.status });
  return parseConceptId(extractNextData(await response.text()), productId);
}

/**
 * Re-keys entries from product id to concept id, the id IGDB uses for PlayStation. Editions of one game share a
 * concept, so they collapse into one id; entries whose product has no concept are dropped.
 */
async function withConceptIds(entries: LibraryEntry[], locale: string, fetchFn: Fetch): Promise<LibraryEntry[]> {
  const productIds = [...new Set(entries.map(entry => entry.storeId))];
  const conceptIds = new Map<string, string | null>();
  let next = 0;
  async function worker() {
    while (next < productIds.length) {
      const productId = productIds[next]!;
      next += 1;
      conceptIds.set(productId, await fetchConceptId(productId, locale, fetchFn)); // NOSONAR
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCEPT_CONCURRENCY, productIds.length) }, worker));

  const resolved = entries.flatMap(entry => {
    const conceptId = conceptIds.get(entry.storeId);
    return conceptId ? [{ ...entry, storeId: conceptId }] : [];
  });
  if (entries.length > 0 && resolved.length === 0) throw new MissingStoreIdError("playstation", "concept id");
  if (resolved.length < entries.length) {
    console.warn(`[game-list:playstation] skipped ${entries.length - resolved.length} entries without a concept id`);
  }
  return resolved;
}

export function createPlayStationAdapter(fetchFn: Fetch = (url, init) => fetch(url, init)): PlatformAdapter {
  return {
    async fetchEntries() {
      const { entries: collection, locale } = await fetchCollectionEntries(fetchFn);
      const wishlist = await fetchWishlistEntries(fetchFn);
      return withConceptIds([...collection, ...wishlist], locale ?? FALLBACK_LOCALE, fetchFn);
    },
  };
}

export const playstationAdapter = createPlayStationAdapter();
