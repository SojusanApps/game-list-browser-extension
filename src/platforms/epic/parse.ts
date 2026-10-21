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

/** Namespace Epic uses for Unreal Engine Marketplace content (assets, plugins, project templates). */
const UNREAL_ASSET_NAMESPACE = "ue";
/** Catalog category paths that mark Unreal Engine content rather than games. */
const NON_GAME_CATEGORY_PREFIXES = ["assets", "plugins", "engine"];

/** Drops Unreal Engine Marketplace records so they are neither looked up nor imported. */
export function excludeUnrealAssets(records: readonly LibraryRecord[]): LibraryRecord[] {
  return records.filter(record => record.namespace !== UNREAL_ASSET_NAMESPACE);
}

function isNonGameItem(item: Record<string, unknown> | null): boolean {
  const categories = Array.isArray(item?.categories) ? item.categories : [];
  return categories.some(category => {
    const path = (nonEmptyString(asObject(category)?.path) ?? "").toLowerCase();
    return NON_GAME_CATEGORY_PREFIXES.some(prefix => path === prefix || path.startsWith(`${prefix}/`));
  });
}

/** Groups catalog item ids by namespace, since the catalog bulk endpoint is namespaced. */
export function groupByNamespace(records: readonly LibraryRecord[]): Map<string, string[]> {
  const groups = new Map<string, Set<string>>();
  for (const { namespace, catalogItemId } of records) {
    if (!groups.has(namespace)) groups.set(namespace, new Set());
    groups.get(namespace)!.add(catalogItemId);
  }
  return new Map([...groups].map(([namespace, ids]) => [namespace, [...ids]]));
}

/** Titles from `catalog/api/shared/namespace/{ns}/bulk/items`, a map of catalogItemId to item. */
export function parseCatalogTitles(payload: unknown): string[] {
  const titles: string[] = [];
  for (const item of Object.values(asObject(payload) ?? {})) {
    if (isNonGameItem(asObject(item))) continue;
    const title = nonEmptyString(asObject(item)?.title);
    if (title) titles.push(title);
  }
  return titles;
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

/** Titles from the `getWishlist` GraphQL answer (`data.Wishlist.wishlistItems.elements[].offer.title`). */
export function parseWishlistTitles(payload: unknown): string[] {
  const wishlistItems = asObject(asObject(asObject(asObject(payload)?.data)?.Wishlist)?.wishlistItems);
  const titles: string[] = [];
  for (const element of Array.isArray(wishlistItems?.elements) ? wishlistItems.elements : []) {
    const title = nonEmptyString(asObject(asObject(element)?.offer)?.title) ?? nonEmptyString(asObject(element)?.title);
    if (title) titles.push(title);
  }
  return titles;
}
