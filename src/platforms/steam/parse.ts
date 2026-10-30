/** Shape of `https://store.steampowered.com/dynamicstore/userdata/`; only the fields we read. */
interface UserDataPayload {
  rgOwnedApps?: unknown;
  rgWishlist?: unknown;
}

/** Shape of `IStoreBrowseService/GetItems/v1`; only the fields we read. */
interface StoreItemsPayload {
  response?: { store_items?: { appid?: unknown; name?: unknown; success?: unknown }[] };
}

function toAppIds(value: unknown): number[] {
  return Array.isArray(value) ? value.filter((id): id is number => Number.isInteger(id)) : [];
}

export interface UserData {
  owned: number[];
  /** Wishlisted app ids the user does not also own. */
  wishlisted: number[];
}

/** Owned and wishlisted app ids from the logged-in user's userdata, de-duplicated. Empty for a logged-out session. */
export function parseUserData(payload: unknown): UserData {
  const { rgOwnedApps, rgWishlist } = (payload ?? {}) as UserDataPayload;
  const owned = [...new Set(toAppIds(rgOwnedApps))];
  const ownedSet = new Set(owned);
  return { owned, wishlisted: [...new Set(toAppIds(rgWishlist))].filter(id => !ownedSet.has(id)) };
}

/** Maps a GetItems response to `[appid, name]` pairs, skipping items Steam could not resolve. */
export function parseStoreItems(payload: unknown): [number, string][] {
  const items = (payload as StoreItemsPayload | null)?.response?.store_items;
  if (!Array.isArray(items)) return [];
  const pairs: [number, string][] = [];
  for (const item of items) {
    if (item.success === 1 && Number.isInteger(item.appid) && typeof item.name === "string" && item.name.trim()) {
      pairs.push([item.appid as number, item.name]);
    }
  }
  return pairs;
}
