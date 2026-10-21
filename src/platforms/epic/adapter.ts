import { NotLoggedInError, type PlatformAdapter } from "../adapter";
import {
  groupByNamespace,
  excludeUnrealAssets,
  isWishlistNotLoggedIn,
  type LibraryRecord,
  parseAuthorizationCode,
  parseCatalogTitles,
  parseLibraryPage,
  parseToken,
  parseWishlistTitles,
} from "./parse";

const AUTH_CODE_URL =
  "https://www.epicgames.com/id/api/redirect?clientId=34a02cf8f4414e29b15921876da36f9a&responseType=code";
const TOKEN_URL = "https://account-public-service-prod03.ol.epicgames.com/account/api/oauth/token";
const LIBRARY_URL = "https://library-service.live.use1a.on.epicgames.com/library/api/public/items";
const CATALOG_URL = "https://catalog-public-service-prod06.ol.epicgames.com/catalog/api/shared/namespace";
const WISHLIST_URL = "https://store.epicgames.com/graphql";
// Public launcher client credentials (launcherAppClient2)
const OAUTH_CLIENT = "34a02cf8f4414e29b15921876da36f9a:daafbccc737745039dffe53d94fc76cf";
const WISHLIST_QUERY_HASH = "40e7770852757ee6aaa43b0f6fce65de984754e8d32572a1c978910cbf26f02e";

const MAX_LIBRARY_PAGES = 200;
const CATALOG_BATCH_SIZE = 50;
const CATALOG_CONCURRENCY = 6;

export interface EpicDeps {
  fetch: typeof fetch;
  /** Opens the Epic store so its web session cookies are issued; used once if the wishlist reports logged out. */
  warmupStoreSession(): Promise<void>;
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

export function createEpicAdapter({ fetch: doFetch, warmupStoreSession }: EpicDeps): PlatformAdapter {
  async function getToken() {
    const codeResponse = await doFetch(AUTH_CODE_URL, { credentials: "include" });
    const code = parseAuthorizationCode(await readJson(codeResponse));
    // Epic answers 200 without a code when there is no web session.
    if (!code) {
      if (codeResponse.status >= 500) throw new Error(`Epic auth code request failed (HTTP ${codeResponse.status})`);
      throw new NotLoggedInError("epic");
    }

    const tokenResponse = await doFetch(TOKEN_URL, {
      method: "POST",
      credentials: "omit",
      headers: { Authorization: `Basic ${btoa(OAUTH_CLIENT)}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "authorization_code", code, token_type: "eg1" }).toString(),
    });
    const token = tokenResponse.ok ? parseToken(await readJson(tokenResponse)) : null;
    if (!token) throw new Error(`Epic token exchange failed (HTTP ${tokenResponse.status})`);
    return token;
  }

  async function fetchLibraryRecords(accessToken: string): Promise<LibraryRecord[]> {
    const records: LibraryRecord[] = [];
    let cursor: string | null = null;
    for (let page = 0; page < MAX_LIBRARY_PAGES; page += 1) {
      const url = new URL(LIBRARY_URL);
      url.searchParams.set("includeMetadata", "true");
      if (cursor) url.searchParams.set("cursor", cursor);
      const response = await doFetch(url.toString(), {
        credentials: "omit",
        headers: { Authorization: `bearer ${accessToken}` },
      });
      if (!response.ok) throw new Error(`Epic library request failed (HTTP ${response.status})`);
      const body = await readJson(response);
      const parsed = parseLibraryPage(body);
      records.push(...parsed.records);
      if (!parsed.nextCursor) return records;
      cursor = parsed.nextCursor;
    }
    throw new Error("Epic library has too many pages");
  }

  async function fetchCatalogTitles(accessToken: string, records: LibraryRecord[]): Promise<string[]> {
    const jobs: Array<{ namespace: string; ids: string[] }> = [];
    for (const [namespace, ids] of groupByNamespace(records)) {
      for (let start = 0; start < ids.length; start += CATALOG_BATCH_SIZE) {
        jobs.push({ namespace, ids: ids.slice(start, start + CATALOG_BATCH_SIZE) });
      }
    }

    async function fetchJobTitles({ namespace, ids }: (typeof jobs)[number]): Promise<string[]> {
      const url = new URL(`${CATALOG_URL}/${encodeURIComponent(namespace)}/bulk/items`);
      for (const id of ids) url.searchParams.append("id", id);
      url.searchParams.set("country", "US");
      url.searchParams.set("locale", "en-US");
      const response = await doFetch(url.toString(), {
        credentials: "omit",
        headers: { Authorization: `bearer ${accessToken}` },
      });
      if (!response.ok) throw new Error(`Epic catalog request failed (HTTP ${response.status})`);
      return parseCatalogTitles(await readJson(response));
    }

    // Libraries span hundreds of namespaces, so run the lookups in parallel, keeping the original order.
    const results: string[][] = Array.from({ length: jobs.length }, () => []);
    let next = 0;
    async function worker() {
      while (next < jobs.length) {
        const index = next;
        next += 1;
        results[index] = await fetchJobTitles(jobs[index]); // NOSONAR
      }
    }
    await Promise.all(Array.from({ length: Math.min(CATALOG_CONCURRENCY, jobs.length) }, worker));
    return results.flat();
  }

  async function requestWishlist(accessToken: string, accountId: string): Promise<unknown> {
    const url = new URL(WISHLIST_URL);
    url.searchParams.set("operationName", "getWishlist");
    url.searchParams.set("variables", JSON.stringify({ accountId }));
    url.searchParams.set(
      "extensions",
      JSON.stringify({ persistedQuery: { version: 1, sha256Hash: WISHLIST_QUERY_HASH } }),
    );
    const response = await doFetch(url.toString(), {
      credentials: "include",
      headers: { Accept: "application/json", Authorization: `bearer ${accessToken}` },
    });
    const payload = await readJson(response);
    if (isWishlistNotLoggedIn(payload)) return payload;
    if (!response.ok) throw new Error(`Epic wishlist request failed (HTTP ${response.status})`);
    return payload;
  }

  async function fetchWishlistTitles(accessToken: string, accountId: string): Promise<string[]> {
    let payload = await requestWishlist(accessToken, accountId);
    if (isWishlistNotLoggedIn(payload)) {
      await warmupStoreSession();
      payload = await requestWishlist(accessToken, accountId);
      if (isWishlistNotLoggedIn(payload)) {
        throw new Error(
          "Epic wishlist unavailable: open https://store.epicgames.com/wishlist while logged in, then retry",
        );
      }
    }
    return parseWishlistTitles(payload);
  }

  return {
    async fetchTitles() {
      const { accessToken, accountId } = await getToken();
      const library = await fetchCatalogTitles(
        accessToken,
        excludeUnrealAssets(await fetchLibraryRecords(accessToken)),
      );
      const wishlist = await fetchWishlistTitles(accessToken, accountId);
      return [...library, ...wishlist];
    },
  };
}
