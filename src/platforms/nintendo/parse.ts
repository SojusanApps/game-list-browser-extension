import { SyncError } from "../../errors";
import {
  GRAPHQL_HOST,
  GRAPHQL_LANGUAGE,
  GRAPHQL_PATH,
  GRAPHQL_URL,
  SHOP_ID,
  WISHLIST_OPERATION,
  WISHLIST_PAGE_SIZE,
} from "./constants";

const SHA256_HEX = /^[a-f0-9]{64}$/i;
const SHOP_CLIENT_ID = /\\?["']X-Nintendo-Savanna-Client-Id\\?["']\s*:\s*\\?["']([a-f0-9]{64})\\?["']/i;
const COLLECTION_CLIENT_ID =
  /(?:&quot;|["'])savannaClientId(?:&quot;|["'])\s*:\s*(?:&quot;|["'])([a-f0-9]{64})(?:&quot;|["'])/i;
const COLLECTION_ID_TOKEN = /(?:&quot;|["'])idToken(?:&quot;|["'])\s*:\s*(?:&quot;|["'])([^&"']+)(?:&quot;|["'])/i;

export interface NintendoSession {
  idToken?: string;
  naId?: string;
  country?: string;
  localeInfo?: { country?: string };
  isIdTokenExpired?: boolean;
}

export interface GraphqlError {
  message?: string;
  extensions?: { type?: string; title?: string; errorCode?: string; detail?: string };
}

export interface GraphqlPayload {
  errors?: GraphqlError[];
  data?: unknown;
}

/** A game as listed by Nintendo: its `nsUid` (as a string) and title. */
export interface NintendoGame {
  storeId: string;
  title: string;
}

export interface TitlePage {
  games: NintendoGame[];
  /** Number of raw entries on the page, including ones without a usable title or id. */
  entries: number;
  total: number | null;
}

export function trimmed(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function isSha256Hex(value: unknown): value is string {
  return typeof value === "string" && SHA256_HEX.test(value);
}

/** Savanna client id embedded in the eShop (ec.nintendo.com) page. */
export function extractShopClientId(html: string): string | null {
  const id = SHOP_CLIENT_ID.exec(html)?.[1];
  return id && isSha256Hex(id) ? id.toLowerCase() : null;
}

/** Savanna client id and idToken embedded in the accounts.nintendo.com/portal/vgcs page. */
export function extractCollectionBootstrap(html: string): { clientId: string; idToken: string } | null {
  const clientId = COLLECTION_CLIENT_ID.exec(html)?.[1];
  const idToken = COLLECTION_ID_TOKEN.exec(html)?.[1]?.trim() ?? "";
  if (!clientId || !isSha256Hex(clientId) || idToken.split(".").length !== 3) return null;
  return { clientId: clientId.toLowerCase(), idToken };
}

/** Wishlist persisted-query hash, read from the URLs of requests the wishlist page itself made. */
export function extractQueryHash(resourceUrls: readonly string[]): string | null {
  for (const raw of resourceUrls) {
    try {
      const url = new URL(raw);
      if (
        url.hostname !== GRAPHQL_HOST ||
        url.pathname !== GRAPHQL_PATH ||
        url.searchParams.get("operationName") !== WISHLIST_OPERATION
      ) {
        continue;
      }
      const extensions = JSON.parse(url.searchParams.get("extensions") ?? "null") as {
        persistedQuery?: { sha256Hash?: unknown };
      } | null;
      const hash = extensions?.persistedQuery?.sha256Hash;
      if (isSha256Hex(hash)) return hash.toLowerCase();
    } catch {
      // Not a parsable URL or extensions value; try the next entry.
    }
  }
  return null;
}

export function isSessionFresh(session: NintendoSession): boolean {
  return trimmed(session.idToken).length > 0 && session.isIdTokenExpired !== true;
}

export function sessionCountry(session: NintendoSession): string {
  return trimmed(session.localeInfo?.country) || trimmed(session.country);
}

/** Country claim of the (unverified) idToken payload, upper-cased. */
export function idTokenCountry(idToken: string): string {
  const segment = idToken.split(".")[1];
  if (!segment) return "";
  try {
    const base64 = segment.replaceAll("-", "+").replaceAll("_", "/");
    const payload = JSON.parse(atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "="))) as { country?: unknown };
    return trimmed(payload.country).toUpperCase();
  } catch {
    return "";
  }
}

export function buildWishlistRequestUrl(country: string, idToken: string, offset: number, queryHash: string): string {
  const url = new URL(GRAPHQL_URL);
  url.searchParams.set("operationName", WISHLIST_OPERATION);
  url.searchParams.set(
    "variables",
    JSON.stringify({
      country,
      idToken,
      language: GRAPHQL_LANGUAGE,
      limit: WISHLIST_PAGE_SIZE,
      offset,
      shopId: SHOP_ID,
    }),
  );
  url.searchParams.set("extensions", JSON.stringify({ persistedQuery: { version: 1, sha256Hash: queryHash } }));
  return url.toString();
}

export function isAuthError(payload: GraphqlPayload): boolean {
  return (payload.errors ?? []).some(error =>
    /unauthor|forbidden|invalid\s+token|token\s+expired|expired\s+token/i.test(trimmed(error.message)),
  );
}

/** The error Nintendo gives for any rejected parameter, a query field the schema lacks included. */
export function isInvalidParamError(payload: GraphqlPayload): boolean {
  return (payload.errors ?? []).some(
    error => trimmed(error.extensions?.errorCode) === "1802" && trimmed(error.extensions?.title) === "INVALID_PARAM",
  );
}

/** Nintendo answers an unknown or rotated persisted-query hash with INVALID_PARAM / 1802. */
export function isQueryHashError(payload: GraphqlPayload): boolean {
  return (payload.errors ?? []).some(
    error =>
      trimmed(error.extensions?.errorCode) === "1802" &&
      trimmed(error.extensions?.title) === "INVALID_PARAM" &&
      trimmed(error.extensions?.type).endsWith("/invalid-param"),
  );
}

/** One readable line for a GraphQL error; Nintendo's `message` is often just "error", the detail is in `extensions`. */
function describeError(error: GraphqlError): string {
  const { title, errorCode, detail } = error.extensions ?? {};
  const extra = [trimmed(title), trimmed(errorCode), trimmed(detail)].filter(Boolean).join(" ");
  const message = trimmed(error.message);
  if (!extra) return message;
  return message && message.toLowerCase() !== extra.toLowerCase() ? `${message} (${extra})` : extra;
}

/** The first GraphQL error as one line, with the count of further errors; null when there is none. */
export function firstErrorMessage(payload: GraphqlPayload): string | null {
  const errors = payload.errors ?? [];
  const first = errors[0] ? describeError(errors[0]) : "";
  if (!first) return null;
  return errors.length > 1 ? `${first} (+${errors.length - 1})` : first;
}

function total(offsetInfo: unknown): number | null {
  const value = (offsetInfo as { total?: unknown } | null | undefined)?.total;
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.floor(value) : null;
}

/**
 * Title of a wishlist entry. The persisted query returns `itemV2` (Application/Dlc/Bundle item) whose
 * display name is `formalName`; fall back to a few neighbouring keys in case the frontend renames it.
 */
export function wishlistItemTitle(item: unknown): string {
  const entry = (item ?? {}) as Record<string, unknown>;
  const itemV2 = (entry.itemV2 ?? {}) as Record<string, unknown>;
  return (
    trimmed(itemV2.formalName) ||
    trimmed(itemV2.name) ||
    trimmed(itemV2.title) ||
    trimmed(entry.name) ||
    trimmed(entry.title)
  );
}

/** `nsUid` as a trimmed string; Nintendo sends it as a number on some objects and a string on others. */
export function nsUidOf(value: unknown): string {
  return typeof value === "number" && Number.isSafeInteger(value) ? String(value) : trimmed(value);
}

/** A wishlist entry's `nsUid`: on the entry itself, else on its `itemV2`. */
function wishlistItemId(item: unknown): string {
  const entry = (item ?? {}) as Record<string, unknown>;
  return nsUidOf(entry.nsUid) || nsUidOf((entry.itemV2 as Record<string, unknown> | null | undefined)?.nsUid);
}

function toGames(
  items: unknown[],
  idOf: (item: unknown) => string,
  titleOf: (item: unknown) => string,
): NintendoGame[] {
  const games: NintendoGame[] = [];
  for (const item of items) {
    const storeId = idOf(item);
    const title = titleOf(item);
    if (storeId && title) games.push({ storeId, title });
  }
  return games;
}

export function parseWishlistPage(payload: GraphqlPayload): TitlePage {
  const wishlistItems = (
    payload.data as
      | { account?: { wishlist?: { wishlistItems?: { items?: unknown; offsetInfo?: unknown } } } }
      | undefined
  )?.account?.wishlist?.wishlistItems;
  if (!wishlistItems || !Array.isArray(wishlistItems.items)) {
    throw new SyncError("unexpectedResponse", { platform: "nintendo", field: "data.account.wishlist.wishlistItems" });
  }
  return {
    games: toGames(wishlistItems.items, wishlistItemId, wishlistItemTitle),
    entries: wishlistItems.items.length,
    total: total(wishlistItems.offsetInfo),
  };
}

export function parseCollectionPage(payload: GraphqlPayload): TitlePage {
  const vgcViews = (
    payload.data as { account?: { vgc?: { vgcViews?: { views?: unknown; offsetInfo?: unknown } } } } | undefined
  )?.account?.vgc?.vgcViews;
  if (!vgcViews || !Array.isArray(vgcViews.views)) {
    throw new SyncError("unexpectedResponse", { platform: "nintendo", field: "data.account.vgc.vgcViews" });
  }
  return {
    // UNVERIFIED against a real response: `nsUid` on a VGC view is assumed to be the same id the wishlist uses.
    games: toGames(
      vgcViews.views,
      view =>
        nsUidOf((view as { nsUid?: unknown }).nsUid) || nsUidOf((view as { applicationId?: unknown }).applicationId),
      view => trimmed((view as { applicationName?: unknown }).applicationName),
    ),
    entries: vgcViews.views.length,
    total: total(vgcViews.offsetInfo),
  };
}
