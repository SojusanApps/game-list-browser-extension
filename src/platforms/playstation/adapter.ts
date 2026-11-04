import type { LibraryEntry } from "../../contract";
import { SyncError } from "../../errors";
import { MissingStoreIdError, NotLoggedInError, type PlatformAdapter, type ReportProgress } from "../adapter";
import {
  type CollectionPage,
  extractAccountId,
  extractLocale,
  extractNextData,
  parseCollectionPage,
  parseConceptId,
  parseGraphqlPurchasedPage,
  type GraphqlProduct,
  parseGraphqlProduct,
  parseWishlist,
} from "./parse";

export const COLLECTION_URL = "https://library.playstation.com/recently-purchased";
export const WISHLIST_URL = "https://library.playstation.com/wishlist";
const STORE_URL = "https://store.playstation.com";

/** Safety cap on collection pages, matching the reference implementation. */
const MAX_COLLECTION_PAGES = 100;
const CONCEPT_CONCURRENCY = 10;
/** Attempts per product lookup when the store answers 429 or 5xx, or the request fails. */
const MAX_LOOKUP_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 500;
/**
 * Persisted GraphQL query behind the store's `productRetrieveForCtasWithPrice` operation: a small (about 4 KB)
 * answer that carries a product's concept and its English `invariantName`. The hash changes when the store
 * redeploys; the lookup then falls back to the product's store page, which has no English name.
 */
const CONCEPT_GRAPHQL_URL = "https://web.np.playstation.com/api/graphql/v1/op";
const CONCEPT_GRAPHQL_OPERATION = "productRetrieveForCtasWithPrice";
const CONCEPT_GRAPHQL_HASH = "911a43f47dbbf7b2f3d513d6237dedfd679e57af3f34787667a22ecad6a249cd";
const GRAPHQL_CLIENT_NAME = "@sie-private/web-commerce-anywhere";
/**
 * Persisted GraphQL query behind the library page's `getPurchasedGameList` operation, which lists the purchased
 * games as JSON. If it stops working, the collection falls back to the library's html pages.
 */
const PURCHASED_GRAPHQL_URL = "https://web.np.playstation.com/api/graphql/v1/op";
const PURCHASED_GRAPHQL_OPERATION = "getPurchasedGameList";
const PURCHASED_GRAPHQL_HASH = "827a423f6a8ddca4107ac01395af2ec0eafd8396fc7fa204aaf9b7ed2eefa168";
const PURCHASED_PAGE_SIZE = 24;
const PURCHASED_CONCURRENCY = 4;
/** TEMPORARY: how many GraphQL concepts are cross-checked against the store page and logged. */
const DEBUG_COMPARE_SAMPLE = 5;
/** Store locale used when the session does not name one; product ids are regional, so this may not resolve them. */
const FALLBACK_LOCALE = "en-us";

type Fetch = (url: string, init: RequestInit) => Promise<Response>;
type Sleep = (ms: number) => Promise<void>;

const defaultSleep: Sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

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

async function fetchCollectionEntries(
  fetchFn: Fetch,
  report: ReportProgress,
): Promise<{ entries: LibraryEntry[]; locale: string | null }> {
  const entries: LibraryEntry[] = [];
  let locale: string | null = null;
  let expectedPageSize = 0;

  for (let page = 1; page <= MAX_COLLECTION_PAGES; page += 1) {
    const nextData = await fetchNextData(page === 1 ? COLLECTION_URL : pageUrl(COLLECTION_URL, page), fetchFn);
    locale ??= extractLocale(nextData);
    const data = parseCollectionPage(nextData);
    if (!data) throw new SyncError("dataNotFound", { platform: "playstation", step: "collection" });

    entries.push(...data.entries);
    report({ stage: "collection", done: entries.length, total: data.totalCount });

    expectedPageSize = Math.max(expectedPageSize, data.size ?? 0);
    if (isLastCollectionPage(data, page, expectedPageSize)) break;
  }

  return { entries, locale };
}

async function fetchWishlistEntries(fetchFn: Fetch): Promise<{ entries: LibraryEntry[]; locale: string | null }> {
  const nextData = await fetchNextData(WISHLIST_URL, fetchFn);
  const entries = parseWishlist(nextData);
  if (entries === null) throw new SyncError("dataNotFound", { platform: "playstation", step: "wishlist" });
  return { entries, locale: extractLocale(nextData) };
}

async function fetchPurchasedPage(start: number, fetchFn: Fetch): Promise<CollectionPage> {
  const url = new URL(PURCHASED_GRAPHQL_URL);
  url.searchParams.set("operationName", PURCHASED_GRAPHQL_OPERATION);
  url.searchParams.set(
    "variables",
    JSON.stringify({
      isActive: true,
      platform: ["ps4", "ps5"],
      size: PURCHASED_PAGE_SIZE,
      start,
      sortBy: "ACTIVE_DATE",
      sortDirection: "desc",
    }),
  );
  url.searchParams.set(
    "extensions",
    JSON.stringify({ persistedQuery: { version: 1, sha256Hash: PURCHASED_GRAPHQL_HASH } }),
  );
  const response = await fetchFn(url.toString(), {
    method: "GET",
    credentials: "include",
    cache: "no-store",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      // Titles are matched against English names, so ask for them in English whatever the user's own locale is.
      "Accept-Language": "en-US,en;q=0.9",
      "x-psn-store-locale-override": "en-US",
    },
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`HTTP ${response.status} ${text.slice(0, 200)}`);
  const data = parseGraphqlPurchasedPage(JSON.parse(text) as unknown);
  if (!data) throw new Error(`no game list in answer ${text.slice(0, 200)}`);
  return data;
}

/**
 * The purchased games from the library's GraphQL API: the first page tells the total, the rest are fetched in
 * parallel. Throws when the API does not answer as expected, so the caller can use the html pages instead.
 */
async function fetchPurchasedEntriesFromGraphql(fetchFn: Fetch, report: ReportProgress): Promise<LibraryEntry[]> {
  const first = await fetchPurchasedPage(0, fetchFn);
  let fetched = first.entries.length;
  report({ stage: "collection", done: fetched, total: first.totalCount });
  const pageSize = first.size ?? PURCHASED_PAGE_SIZE;
  if (first.isLast || first.totalCount === undefined || pageSize <= 0) return first.entries;

  const starts: number[] = [];
  for (let start = pageSize; start < first.totalCount && starts.length < MAX_COLLECTION_PAGES; start += pageSize) {
    starts.push(start);
  }
  const pages: CollectionPage[] = [];
  let next = 0;
  async function worker() {
    while (next < starts.length) {
      const index = next;
      next += 1;
      pages[index] = await fetchPurchasedPage(starts[index]!, fetchFn); // NOSONAR
      fetched += pages[index]!.entries.length;
      report({ stage: "collection", done: fetched, total: first.totalCount });
    }
  }
  await Promise.all(Array.from({ length: Math.min(PURCHASED_CONCURRENCY, starts.length) }, worker));
  return [first, ...pages].flatMap(page => page.entries);
}

/**
 * Fetches a product lookup, retrying with backoff on 429, 5xx and network errors. Resolves with the last response
 * once attempts run out, or rethrows the last network error.
 */
async function fetchWithRetry(url: string, init: RequestInit, fetchFn: Fetch, sleep: Sleep): Promise<Response> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      const response = await fetchFn(url, init);
      if ((response.status !== 429 && response.status < 500) || attempt >= MAX_LOOKUP_ATTEMPTS) return response;
    } catch (error) {
      if (attempt >= MAX_LOOKUP_ATTEMPTS) throw error;
    }
    await sleep(RETRY_BASE_DELAY_MS * 2 ** (attempt - 1)); // NOSONAR
  }
}

/** The concept id of a product from its store page, or null when the store does not know the product. */
async function fetchConceptIdFromStorePage(
  productId: string,
  locale: string,
  fetchFn: Fetch,
  sleep: Sleep,
): Promise<string | null> {
  const response = await fetchWithRetry(
    `${STORE_URL}/${locale}/product/${encodeURIComponent(productId)}`,
    {
      method: "GET",
      credentials: "include",
      cache: "no-store",
      headers: { Accept: "text/html,application/xhtml+xml" },
    },
    fetchFn,
    sleep,
  );
  if (response.status === 404) return null;
  if (!response.ok)
    throw new SyncError("requestFailed", { platform: "playstation", step: "product", status: response.status });
  return parseConceptId(extractNextData(await response.text()), productId);
}

/** `pl-pl` becomes `pl-PL`, the casing the store's GraphQL locale header expects. */
function toLocaleHeader(locale: string): string {
  const [language = "en", region] = locale.split("-");
  return region ? `${language}-${region.toUpperCase()}` : language;
}

/** The product from the store's GraphQL API, or undefined (after `onFailure` says why) when it gives none. */
async function fetchProductFromGraphql(
  productId: string,
  locale: string,
  fetchFn: Fetch,
  sleep: Sleep,
  onFailure: (reason: string) => void,
): Promise<GraphqlProduct | undefined> {
  const url = new URL(CONCEPT_GRAPHQL_URL);
  url.searchParams.set("operationName", CONCEPT_GRAPHQL_OPERATION);
  url.searchParams.set("variables", JSON.stringify({ productId }));
  url.searchParams.set(
    "extensions",
    JSON.stringify({ persistedQuery: { version: 1, sha256Hash: CONCEPT_GRAPHQL_HASH } }),
  );
  try {
    const response = await fetchWithRetry(
      url.toString(),
      {
        method: "GET",
        credentials: "include",
        cache: "no-store",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "apollographql-client-name": GRAPHQL_CLIENT_NAME,
          "x-psn-store-locale-override": toLocaleHeader(locale),
        },
      },
      fetchFn,
      sleep,
    );
    const text = await response.text();
    if (!response.ok) {
      onFailure(`HTTP ${response.status} ${text.slice(0, 200)}`);
      return undefined;
    }
    const product = parseGraphqlProduct(JSON.parse(text) as unknown, productId);
    if (product === null) onFailure(`no concept in answer ${text.slice(0, 200)}`);
    return product ?? undefined;
  } catch (error) {
    onFailure(String(error));
    return undefined;
  }
}

/**
 * Re-keys entries from product id to concept id, the id IGDB uses for PlayStation, and retitles them with the
 * product's English name when the store gives one. Editions of one game share a concept, so they collapse into one
 * id; entries whose product has no concept are dropped. Each product is asked from the store's GraphQL API, and from
 * its store page when that gives no concept.
 */
async function withConceptIds(
  entries: LibraryEntry[],
  locale: string,
  fetchFn: Fetch,
  sleep: Sleep,
  report: ReportProgress,
): Promise<LibraryEntry[]> {
  const productIds = [...new Set(entries.map(entry => entry.storeId))];
  const products = new Map<string, GraphqlProduct | null>();
  let graphqlFailures = 0;
  let firstFailure: string | null = null;
  let compared = 0;

  async function resolve(productId: string): Promise<GraphqlProduct | null> {
    const fromGraphql = await fetchProductFromGraphql(productId, locale, fetchFn, sleep, reason => {
      graphqlFailures += 1;
      firstFailure ??= reason;
    });
    if (fromGraphql === undefined) {
      const conceptId = await fetchConceptIdFromStorePage(productId, locale, fetchFn, sleep);
      return conceptId ? { conceptId, title: null } : null;
    }
    if (compared < DEBUG_COMPARE_SAMPLE) {
      compared += 1;
      const fromPage = await fetchConceptIdFromStorePage(productId, locale, fetchFn, sleep).catch(() => undefined);
      console.debug(
        `[game-list:playstation] graphql ${fromGraphql.conceptId} (${fromGraphql.title}) vs store page ${fromPage} for ${productId}`,
      );
    }
    return fromGraphql;
  }

  report({ stage: "resolving", done: 0, total: productIds.length });
  let next = 0;
  async function worker() {
    while (next < productIds.length) {
      const productId = productIds[next]!;
      next += 1;
      products.set(productId, await resolve(productId)); // NOSONAR
      report({ stage: "resolving", done: products.size, total: productIds.length });
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCEPT_CONCURRENCY, productIds.length) }, worker));

  if (graphqlFailures > 0) {
    console.warn(
      `[game-list:playstation] graphql gave no concept for ${graphqlFailures} of ${productIds.length} products, used store pages; first: ${firstFailure}`,
    );
  }
  const resolved = entries.flatMap(entry => {
    const product = products.get(entry.storeId);
    return product ? [{ ...entry, storeId: product.conceptId, title: product.title ?? entry.title }] : [];
  });
  if (entries.length > 0 && resolved.length === 0) throw new MissingStoreIdError("playstation", "concept id");
  if (resolved.length < entries.length) {
    console.warn(`[game-list:playstation] skipped ${entries.length - resolved.length} entries without a concept id`);
  }
  return resolved;
}

export function createPlayStationAdapter(
  fetchFn: Fetch = (url, init) => fetch(url, init),
  sleep: Sleep = defaultSleep,
): PlatformAdapter {
  return {
    async fetchEntries(report = () => {}) {
      let collection: LibraryEntry[] | null = null;
      try {
        collection = await fetchPurchasedEntriesFromGraphql(fetchFn, report);
      } catch (error) {
        console.warn(
          `[game-list:playstation] purchased games from graphql failed, using library pages: ${String(error)}`,
        );
      }
      let locale: string | null = null;
      if (collection === null) ({ entries: collection, locale } = await fetchCollectionEntries(fetchFn, report));
      report({ stage: "wishlist" });
      const wishlist = await fetchWishlistEntries(fetchFn);
      return withConceptIds(
        [...collection, ...wishlist.entries],
        locale ?? wishlist.locale ?? FALLBACK_LOCALE,
        fetchFn,
        sleep,
        report,
      );
    },
  };
}

export const playstationAdapter = createPlayStationAdapter();
