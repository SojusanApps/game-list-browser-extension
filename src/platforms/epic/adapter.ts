import type { LibraryEntry } from "../../contract";
import { SyncError } from "../../errors";
import { MissingStoreIdError, NotLoggedInError, type PlatformAdapter } from "../adapter";
import {
  isBaseGame,
  groupByNamespace,
  isWishlistNotLoggedIn,
  libraryNamespaces,
  type LibraryRecord,
  namespaceBaseGame,
  type Offer,
  parseAuthorizationCode,
  parseBulkOffers,
  parseLibraryPage,
  parseOffersPage,
  parseToken,
  parseWishlistItems,
  type WishlistItem,
  type WishlistItems,
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
const OFFERS_PAGE_SIZE = 100;
const OFFERS_CONCURRENCY = 20;
const BULK_OFFERS_BATCH_SIZE = 50;

export interface EpicDeps {
  fetch: typeof fetch;
  /** Opens the Epic wishlist page so the store session is established; used once if the wishlist reports logged out. */
  warmupStoreSession(): Promise<void>;
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

/** Runs `task` over `inputs` with bounded concurrency, keeping the input order in the results. */
async function inParallel<I, O>(inputs: readonly I[], task: (input: I) => Promise<O>): Promise<O[]> {
  const results: O[] = Array.from({ length: inputs.length });
  let next = 0;
  async function worker() {
    while (next < inputs.length) {
      const index = next;
      next += 1;
      results[index] = await task(inputs[index]!); // NOSONAR
    }
  }
  await Promise.all(Array.from({ length: Math.min(OFFERS_CONCURRENCY, inputs.length) }, worker));
  return results;
}

export function createEpicAdapter({ fetch: doFetch, warmupStoreSession }: EpicDeps): PlatformAdapter {
  async function getToken() {
    const codeResponse = await doFetch(AUTH_CODE_URL, { credentials: "include" });
    const code = parseAuthorizationCode(await readJson(codeResponse));
    // Epic answers 200 without a code when there is no web session.
    if (!code) {
      if (codeResponse.status >= 500)
        throw new SyncError("requestFailed", { platform: "epic", step: "authCode", status: codeResponse.status });
      throw new NotLoggedInError("epic");
    }

    const tokenResponse = await doFetch(TOKEN_URL, {
      method: "POST",
      credentials: "omit",
      headers: { Authorization: `Basic ${btoa(OAUTH_CLIENT)}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "authorization_code", code, token_type: "eg1" }).toString(),
    });
    const token = tokenResponse.ok ? parseToken(await readJson(tokenResponse)) : null;
    if (!token) throw new SyncError("requestFailed", { platform: "epic", step: "token", status: tokenResponse.status });
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
      if (!response.ok)
        throw new SyncError("requestFailed", { platform: "epic", step: "library", status: response.status });
      const body = await readJson(response);
      const parsed = parseLibraryPage(body);
      records.push(...parsed.records);
      if (!parsed.nextCursor) return records;
      cursor = parsed.nextCursor;
    }
    throw new SyncError("tooManyPages", { platform: "epic", step: "library" });
  }

  async function fetchNamespaceOffers(accessToken: string, namespace: string): Promise<Offer[]> {
    const offers: Offer[] = [];
    for (let start = 0; ; start += OFFERS_PAGE_SIZE) {
      const url = new URL(`${CATALOG_URL}/${encodeURIComponent(namespace)}/offers`);
      url.searchParams.set("status", "ACTIVE|SUNSET");
      url.searchParams.set("country", "US");
      url.searchParams.set("locale", "en-US");
      url.searchParams.set("start", String(start));
      url.searchParams.set("count", String(OFFERS_PAGE_SIZE));
      const response = await doFetch(url.toString(), {
        credentials: "omit",
        headers: { Authorization: `bearer ${accessToken}` },
      });
      if (!response.ok)
        throw new SyncError("requestFailed", { platform: "epic", step: "offers", status: response.status });
      const page = parseOffersPage(await readJson(response));
      offers.push(...page.offers);
      if (start + OFFERS_PAGE_SIZE >= page.total) return offers;
    }
  }

  /** Offers of every namespace, looked up in parallel since libraries span hundreds of namespaces. */
  async function fetchOffersByNamespace(accessToken: string, namespaces: string[]): Promise<Map<string, Offer[]>> {
    const results = await inParallel(namespaces, namespace => fetchNamespaceOffers(accessToken, namespace));
    return new Map(namespaces.map((namespace, index) => [namespace, results[index]!]));
  }

  /** The wishlisted offers themselves, asked for by id so no namespace has to be listed. */
  async function fetchWishlistOffers(accessToken: string, items: WishlistItem[]): Promise<Offer[]> {
    const jobs: Array<{ namespace: string; ids: string[] }> = [];
    for (const [namespace, ids] of groupByNamespace(items)) {
      for (let start = 0; start < ids.length; start += BULK_OFFERS_BATCH_SIZE) {
        jobs.push({ namespace, ids: ids.slice(start, start + BULK_OFFERS_BATCH_SIZE) });
      }
    }
    const results = await inParallel(jobs, async ({ namespace, ids }) => {
      const url = new URL(`${CATALOG_URL}/${encodeURIComponent(namespace)}/bulk/offers`);
      for (const id of ids) url.searchParams.append("id", id);
      url.searchParams.set("country", "US");
      url.searchParams.set("locale", "en-US");
      const response = await doFetch(url.toString(), {
        credentials: "omit",
        headers: { Authorization: `bearer ${accessToken}` },
      });
      if (!response.ok)
        throw new SyncError("requestFailed", { platform: "epic", step: "offers", status: response.status });
      return parseBulkOffers(await readJson(response));
    });
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
    if (!response.ok)
      throw new SyncError("requestFailed", { platform: "epic", step: "wishlist", status: response.status });
    return payload;
  }

  async function fetchWishlist(accessToken: string, accountId: string): Promise<WishlistItems> {
    let payload = await requestWishlist(accessToken, accountId);
    if (isWishlistNotLoggedIn(payload)) {
      await warmupStoreSession();
      payload = await requestWishlist(accessToken, accountId);
      if (isWishlistNotLoggedIn(payload)) {
        throw new SyncError("epicWishlistUnavailable", {});
      }
    }
    return parseWishlistItems(payload);
  }

  return {
    async fetchEntries() {
      const { accessToken, accountId } = await getToken();
      const namespaces = libraryNamespaces(await fetchLibraryRecords(accessToken));
      const wishlist = await fetchWishlist(accessToken, accountId);
      const offersByNamespace = await fetchOffersByNamespace(accessToken, namespaces);

      const owned: LibraryEntry[] = [];
      for (const namespace of namespaces) {
        const offer = namespaceBaseGame(offersByNamespace.get(namespace) ?? []);
        if (offer) owned.push({ storeId: offer.id, title: offer.title, wishlisted: false });
      }
      const wishlisted = (await fetchWishlistOffers(accessToken, wishlist.items))
        .filter(isBaseGame)
        .map((offer): LibraryEntry => ({ storeId: offer.id, title: offer.title, wishlisted: true }));

      const skipped = namespaces.length - owned.length + wishlist.items.length - wishlisted.length;
      if (skipped > 0) console.warn(`[game-list:epic] skipped ${skipped} entries without a single base-game offer`);
      if (wishlist.elements > 0 && wishlist.items.length === 0) {
        throw new MissingStoreIdError("epic", "offerId");
      }
      return [...owned, ...wishlisted];
    },
  };
}
