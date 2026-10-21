import { NotLoggedInError, type PlatformAdapter } from "../adapter";
import { type CollectionPage, extractAccountId, extractNextData, parseCollectionPage, parseWishlist } from "./parse";

export const COLLECTION_URL = "https://library.playstation.com/recently-purchased";
export const WISHLIST_URL = "https://library.playstation.com/wishlist";

/** Safety cap on collection pages, matching the reference implementation. */
const MAX_COLLECTION_PAGES = 100;

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
    throw new Error(`PlayStation request failed (HTTP ${response.status})`);
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
  return data.titles.length === 0 && data.totalCount === undefined;
}

async function fetchCollectionTitles(fetchFn: Fetch): Promise<string[]> {
  const titles: string[] = [];
  let expectedPageSize = 0;

  for (let page = 1; page <= MAX_COLLECTION_PAGES; page += 1) {
    const nextData = await fetchNextData(page === 1 ? COLLECTION_URL : pageUrl(COLLECTION_URL, page), fetchFn);
    const data = parseCollectionPage(nextData);
    if (!data) throw new Error("PlayStation collection data not found in page");

    titles.push(...data.titles);

    expectedPageSize = Math.max(expectedPageSize, data.size ?? 0);
    if (isLastCollectionPage(data, page, expectedPageSize)) break;
  }

  return titles;
}

async function fetchWishlistTitles(fetchFn: Fetch): Promise<string[]> {
  const nextData = await fetchNextData(WISHLIST_URL, fetchFn);
  const titles = parseWishlist(nextData);
  if (titles === null) throw new Error("PlayStation wishlist data not found in page");
  return titles;
}

export function createPlayStationAdapter(fetchFn: Fetch = (url, init) => fetch(url, init)): PlatformAdapter {
  return {
    async fetchTitles() {
      const collection = await fetchCollectionTitles(fetchFn);
      const wishlist = await fetchWishlistTitles(fetchFn);
      return [...collection, ...wishlist];
    },
  };
}

export const playstationAdapter = createPlayStationAdapter();
