import { NotLoggedInError, type PlatformAdapter } from "../adapter";
import {
  CLIENT_ID_STORAGE_KEY,
  COLLECTION_OPERATION,
  COLLECTION_PAGE_SIZE,
  COLLECTION_PAGE_URL,
  GRAPHQL_LANGUAGE,
  GRAPHQL_NAS_LANGUAGE,
  GRAPHQL_URL,
  MAX_PAGES,
  PAGE_DISCOVERY_TIMEOUT_MS,
  QUERY_HASH_STORAGE_KEY,
  SESSION_INITIAL_REFRESH_TIMEOUT_MS,
  SESSION_REFRESH_TIMEOUT_MS,
  SESSION_URL,
  SHOP_ID,
  SHOP_WISHLIST_URL,
  WISHLIST_PAGE_SIZE,
} from "./constants";
import {
  buildWishlistRequestUrl,
  extractCollectionBootstrap,
  extractQueryHash,
  extractShopClientId,
  firstErrorMessage,
  type GraphqlPayload,
  idTokenCountry,
  isAuthError,
  isQueryHashError,
  isSessionFresh,
  isSha256Hex,
  type NintendoSession,
  parseCollectionPage,
  parseWishlistPage,
  sessionCountry,
  type TitlePage,
  trimmed,
} from "./parse";
import { COLLECTION_QUERY } from "./query";
import type { PageInspector } from "./tabs";

const SHOP_HOST = "ec.nintendo.com";
const ACCOUNTS_HOST = "accounts.nintendo.com";
const COLLECTION_PATH = new URL(COLLECTION_PAGE_URL).pathname;
const GRAPHQL_ACCEPT =
  "application/graphql-response+json, application/graphql+json, application/json, text/event-stream, multipart/mixed";

export interface NintendoStorage {
  get(key: string): Promise<unknown>;
  set(key: string, value: string): Promise<void>;
  remove(keys: string[]): Promise<void>;
}

export interface NintendoDeps {
  fetch: typeof fetch;
  inspector: PageInspector;
  storage: NintendoStorage;
}

/** The stored persisted-query hash no longer matches the one Nintendo's wishlist frontend uses. */
class QueryHashOutdatedError extends Error {}

interface WishlistConfig {
  queryHash: string;
  clientId: string;
}

async function readSession(deps: NintendoDeps): Promise<NintendoSession | null> {
  const response = await deps.fetch(SESSION_URL, {
    credentials: "include",
    cache: "no-store",
    headers: { Accept: "application/json", "Cache-Control": "no-cache", Pragma: "no-cache" },
  });
  if (!response.ok) return null;
  return (await response.json().catch(() => null)) as NintendoSession | null;
}

/** Returns a session with a fresh idToken, refreshing it through the shop's wishlist page if needed. */
async function getFreshSession(deps: NintendoDeps): Promise<NintendoSession> {
  const session = await readSession(deps).catch(() => null);
  if (session && isSessionFresh(session)) return session;

  const refreshed = await deps.inspector.inspect({
    url: SHOP_WISHLIST_URL,
    expectedHost: SHOP_HOST,
    timeoutMs: SESSION_INITIAL_REFRESH_TIMEOUT_MS + SESSION_REFRESH_TIMEOUT_MS,
    reloadAfterMs: SESSION_INITIAL_REFRESH_TIMEOUT_MS,
    probe: async () => {
      const next = await readSession(deps).catch(() => null);
      return next && isSessionFresh(next) ? next : null;
    },
  });
  // A session that cannot be refreshed means there is no (valid) Nintendo login in this browser.
  if (refreshed.status !== "found") throw new NotLoggedInError("nintendo");
  return refreshed.value;
}

async function readStored(deps: NintendoDeps, key: string): Promise<string | null> {
  const value = await deps.storage.get(key);
  return isSha256Hex(value) ? value : null;
}

/** Wishlist query hash and client id come from the shop frontend, so they are discovered once and cached. */
async function getWishlistConfig(deps: NintendoDeps): Promise<{ config: WishlistConfig; fromStorage: boolean }> {
  const storedHash = await readStored(deps, QUERY_HASH_STORAGE_KEY);
  const storedClientId = await readStored(deps, CLIENT_ID_STORAGE_KEY);
  if (storedHash && storedClientId) {
    return { config: { queryHash: storedHash, clientId: storedClientId }, fromStorage: true };
  }

  const found = await deps.inspector.inspect({
    url: SHOP_WISHLIST_URL,
    expectedHost: SHOP_HOST,
    timeoutMs: PAGE_DISCOVERY_TIMEOUT_MS,
    probe: async ({ getSnapshot }) => {
      const snapshot = await getSnapshot();
      if (!snapshot) return null;
      const queryHash = storedHash ?? extractQueryHash(snapshot.resourceUrls);
      const clientId = storedClientId ?? extractShopClientId(snapshot.html);
      return queryHash && clientId ? { queryHash, clientId } : null;
    },
  });
  if (found.status === "redirected") throw new NotLoggedInError("nintendo");
  if (found.status === "timeout") throw new Error("Could not discover the Nintendo wishlist configuration");

  await deps.storage.set(QUERY_HASH_STORAGE_KEY, found.value.queryHash);
  await deps.storage.set(CLIENT_ID_STORAGE_KEY, found.value.clientId);
  return { config: found.value, fromStorage: false };
}

async function readGraphqlPayload(response: Response, what: string): Promise<GraphqlPayload> {
  if (response.status === 401 || response.status === 403) throw new NotLoggedInError("nintendo");
  const payload = (await response.json().catch(() => null)) as GraphqlPayload | null;
  if (!payload) throw new Error(`Nintendo ${what} request returned invalid JSON (HTTP ${response.status})`);
  if (isAuthError(payload)) throw new NotLoggedInError("nintendo");
  return payload;
}

async function fetchWishlistPage(deps: NintendoDeps, url: string, clientId: string): Promise<TitlePage> {
  const response = await deps.fetch(url, {
    method: "GET",
    credentials: "include",
    cache: "no-store",
    headers: {
      Accept: GRAPHQL_ACCEPT,
      "Cache-Control": "no-cache",
      "Content-Type": "application/json",
      Pragma: "no-cache",
      "X-Nintendo-Savanna-Client-Id": clientId,
    },
  });
  const payload = await readGraphqlPayload(response, "wishlist");
  if (isQueryHashError(payload)) throw new QueryHashOutdatedError("Nintendo wishlist query hash is outdated");
  if (!response.ok || payload.errors?.length) {
    throw new Error(firstErrorMessage(payload, `Nintendo wishlist request failed (HTTP ${response.status})`));
  }
  return parseWishlistPage(payload);
}

/** Pages through a Nintendo list until `total` entries were seen or a page comes back short or empty. */
async function paginate(pageSize: number, fetchPage: (offset: number) => Promise<TitlePage>): Promise<string[]> {
  const titles: string[] = [];
  let seen = 0;
  for (let page = 1; page <= MAX_PAGES; page++) {
    const result = await fetchPage(seen);
    titles.push(...result.titles);
    seen += result.entries;
    if (result.entries === 0) return titles;
    if (result.total !== null ? seen >= result.total : result.entries < pageSize) return titles;
  }
  throw new Error(`Nintendo pagination exceeded the page limit (${MAX_PAGES} pages)`);
}

async function fetchWishlistTitles(deps: NintendoDeps): Promise<string[]> {
  const session = await getFreshSession(deps);
  const idToken = trimmed(session.idToken);
  const country = sessionCountry(session);
  if (!country) throw new Error("Nintendo session is missing the country required for the wishlist request");

  const attempt = (config: WishlistConfig) =>
    paginate(WISHLIST_PAGE_SIZE, offset =>
      fetchWishlistPage(deps, buildWishlistRequestUrl(country, idToken, offset, config.queryHash), config.clientId),
    );

  const { config, fromStorage } = await getWishlistConfig(deps);
  try {
    return await attempt(config);
  } catch (error) {
    // Stored values may be outdated in ways Nintendo does not report as a hash error (e.g. a rotated
    // client id), so stored values get one retry with freshly discovered ones.
    if (error instanceof NotLoggedInError || !(error instanceof QueryHashOutdatedError || fromStorage)) throw error;
    await deps.storage.remove([QUERY_HASH_STORAGE_KEY, CLIENT_ID_STORAGE_KEY]);
    return attempt((await getWishlistConfig(deps)).config);
  }
}

interface CollectionBootstrap {
  clientId: string;
  idToken: string;
  country: string;
}

async function getCollectionBootstrap(deps: NintendoDeps): Promise<CollectionBootstrap> {
  const found = await deps.inspector.inspect({
    url: COLLECTION_PAGE_URL,
    expectedHost: ACCOUNTS_HOST,
    expectedPath: COLLECTION_PATH,
    timeoutMs: PAGE_DISCOVERY_TIMEOUT_MS,
    probe: async ({ getSnapshot }) => {
      const snapshot = await getSnapshot();
      return snapshot ? extractCollectionBootstrap(snapshot.html) : null;
    },
  });
  // A logged-out user is redirected from the VGC portal to the Nintendo Account login page.
  if (found.status === "redirected") throw new NotLoggedInError("nintendo");
  if (found.status === "timeout") throw new Error("Could not read the Nintendo collection page");

  const country = idTokenCountry(found.value.idToken);
  if (!country) throw new Error("Nintendo collection idToken is missing the country claim");
  return { ...found.value, country };
}

async function fetchCollectionPage(
  deps: NintendoDeps,
  bootstrap: CollectionBootstrap,
  offset: number,
  isHidden: boolean,
): Promise<TitlePage> {
  const response = await deps.fetch(GRAPHQL_URL, {
    method: "POST",
    credentials: "include",
    cache: "no-store",
    headers: {
      Accept: GRAPHQL_ACCEPT,
      "Cache-Control": "no-cache",
      "Content-Type": "application/json",
      Pragma: "no-cache",
      "X-Nintendo-Savanna-Client-Id": bootstrap.clientId,
    },
    body: JSON.stringify({
      operationName: COLLECTION_OPERATION,
      query: COLLECTION_QUERY,
      variables: {
        idToken: bootstrap.idToken,
        isHidden,
        country: bootstrap.country,
        language: GRAPHQL_LANGUAGE,
        shopId: SHOP_ID,
        limit: COLLECTION_PAGE_SIZE,
        nasLanguage: GRAPHQL_NAS_LANGUAGE,
        offset,
        order: "DESC",
        sortBy: "ACTIVATED_DATE",
        vgcViewType: null,
        vgcViewStatus: null,
      },
    }),
  });
  const payload = await readGraphqlPayload(response, "collection");
  if (!response.ok || payload.errors?.length) {
    throw new Error(firstErrorMessage(payload, `Nintendo collection request failed (HTTP ${response.status})`));
  }
  return parseCollectionPage(payload);
}

async function fetchCollectionTitles(deps: NintendoDeps): Promise<string[]> {
  const bootstrap = await getCollectionBootstrap(deps);
  const visible = await paginate(COLLECTION_PAGE_SIZE, offset => fetchCollectionPage(deps, bootstrap, offset, false));
  const hidden = await paginate(COLLECTION_PAGE_SIZE, offset => fetchCollectionPage(deps, bootstrap, offset, true));
  return [...visible, ...hidden];
}

export function createNintendoAdapter(deps: NintendoDeps): PlatformAdapter {
  return {
    async fetchTitles() {
      const collection = await fetchCollectionTitles(deps);
      const wishlist = await fetchWishlistTitles(deps);
      return [...collection, ...wishlist];
    },
  };
}
