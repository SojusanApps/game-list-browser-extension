/** Pure parsers for Epic's undocumented endpoints */

export interface LibraryRecord {
  namespace: string;
  catalogItemId: string;
}

export interface LibraryPage {
  records: LibraryRecord[];
  nextCursor: string | null;
}

function asObject(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

/** Reads the `authorizationCode` from the id.epicgames.com redirect endpoint; null means no web session. */
export function parseAuthorizationCode(payload: unknown): string | null {
  return nonEmptyString(asObject(payload)?.authorizationCode);
}

export interface EpicToken {
  accessToken: string;
  accountId: string;
}

export function parseToken(payload: unknown): EpicToken | null {
  const object = asObject(payload);
  const accessToken = nonEmptyString(object?.access_token);
  const accountId = nonEmptyString(object?.account_id);
  return accessToken && accountId ? { accessToken, accountId } : null;
}

/** One page of `library/api/public/items`. Records carry ids only; titles come from the catalog. */
export function parseLibraryPage(payload: unknown): LibraryPage {
  const object = asObject(payload);
  const records: LibraryRecord[] = [];
  for (const record of Array.isArray(object?.records) ? object.records : []) {
    const namespace = nonEmptyString(asObject(record)?.namespace);
    const catalogItemId = nonEmptyString(asObject(record)?.catalogItemId);
    if (namespace && catalogItemId) records.push({ namespace, catalogItemId });
  }
  return { records, nextCursor: nonEmptyString(asObject(object?.responseMetadata)?.nextCursor) };
}

export interface Offer {
  id: string;
  title: string;
  offerType: string | null;
}

export interface OffersPage {
  offers: Offer[];
  /** Number of offers the namespace has in total, across pages. */
  total: number;
}

function parseOffer(value: unknown): Offer | null {
  const id = nonEmptyString(asObject(value)?.id);
  const title = nonEmptyString(asObject(value)?.title);
  return id && title ? { id, title, offerType: nonEmptyString(asObject(value)?.offerType) } : null;
}

/** One page of `catalog/api/shared/namespace/{ns}/offers`. An offer's `id` is the `offerId`. */
export function parseOffersPage(payload: unknown): OffersPage {
  const object = asObject(payload);
  const offers = (Array.isArray(object?.elements) ? object.elements : [])
    .map(parseOffer)
    .filter(offer => offer !== null);
  const total = asObject(object?.paging)?.total;
  return { offers, total: typeof total === "number" ? total : offers.length };
}

/** Offers from `catalog/api/shared/namespace/{ns}/bulk/offers`, a map of offerId to offer. */
export function parseBulkOffers(payload: unknown): Offer[] {
  return Object.values(asObject(payload) ?? {})
    .map(parseOffer)
    .filter(offer => offer !== null);
}

const BASE_GAME_OFFER_TYPE = "BASE_GAME";

/** Only base games are importable; editions, add-ons and dev-audience placeholders are other offer types. */
export function isBaseGame(offer: Offer): boolean {
  return offer.offerType === BASE_GAME_OFFER_TYPE;
}

/**
 * The offer of the game a namespace holds. Library records and offers share no item id, so the namespace is the only
 * join; a namespace with no base game or with several is ambiguous and yields null rather than a guess.
 */
export function namespaceBaseGame(offers: readonly Offer[]): Offer | null {
  const baseGames = offers.filter(isBaseGame);
  return baseGames.length === 1 ? baseGames[0]! : null;
}

/** Groups wishlisted offer ids by namespace, since the catalog bulk endpoint is namespaced. */
export function groupByNamespace(items: readonly WishlistItem[]): Map<string, string[]> {
  const groups = new Map<string, Set<string>>();
  for (const { namespace, offerId } of items) {
    if (!groups.has(namespace)) groups.set(namespace, new Set());
    groups.get(namespace)!.add(offerId);
  }
  return new Map([...groups].map(([namespace, ids]) => [namespace, [...ids]]));
}

/** Namespace Epic uses for Unreal Engine Marketplace content: thousands of offers, none of them a game. */
const UNREAL_ASSET_NAMESPACE = "ue";

/** Library namespaces in first-seen order; one namespace is one game, however many items it has. */
export function libraryNamespaces(records: readonly LibraryRecord[]): string[] {
  const namespaces = new Set(records.map(record => record.namespace));
  namespaces.delete(UNREAL_ASSET_NAMESPACE);
  return [...namespaces];
}

/** True when the store GraphQL answer says the store session is missing. */
export function isWishlistNotLoggedIn(payload: unknown): boolean {
  const errors = asObject(payload)?.errors;
  return (
    Array.isArray(errors) &&
    errors.some(error =>
      (nonEmptyString(asObject(error)?.message) ?? "").includes("com.epicgames.wishlist.notLoggedIn"),
    )
  );
}

export interface WishlistItem {
  offerId: string;
  namespace: string;
}

export interface WishlistItems {
  items: WishlistItem[];
  /** Number of wishlist elements in the answer, including ones skipped for lacking an offer id or namespace. */
  elements: number;
}

/** Wishlisted offers from the `getWishlist` GraphQL answer (`data.Wishlist.wishlistItems.elements[]`); no titles. */
export function parseWishlistItems(payload: unknown): WishlistItems {
  const wishlistItems = asObject(asObject(asObject(asObject(payload)?.data)?.Wishlist)?.wishlistItems);
  const elements = Array.isArray(wishlistItems?.elements) ? wishlistItems.elements : [];
  const items: WishlistItem[] = [];
  for (const element of elements) {
    const offerId = nonEmptyString(asObject(element)?.offerId);
    const namespace = nonEmptyString(asObject(element)?.namespace);
    if (offerId && namespace) items.push({ offerId, namespace });
  }
  return { items, elements: elements.length };
}
