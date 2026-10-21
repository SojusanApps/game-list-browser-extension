/** Shape of `https://embed.gog.com/userData.json`; only the field we read. */
interface UserDataPayload {
  isLoggedIn?: unknown;
}

/** Shape of `https://embed.gog.com/account/getFilteredProducts`; only the fields we read. */
interface FilteredProductsPayload {
  totalPages?: unknown;
  products?: { title?: unknown }[];
}

/** Shape of `https://embed.gog.com/user/wishlist.json`: product ids as keys. */
interface WishlistPayload {
  wishlist?: unknown;
}

export function parseIsLoggedIn(payload: unknown): boolean {
  return (payload as UserDataPayload | null)?.isLoggedIn === true;
}

function toTitles(items: unknown): string[] {
  if (!Array.isArray(items)) return [];
  const titles: string[] = [];
  for (const item of items) {
    const title = (item as { title?: unknown } | null)?.title;
    if (typeof title === "string" && title.trim()) titles.push(title);
  }
  return titles;
}

/** One page of the owned library: its titles and how many pages there are in total. */
export function parseOwnedPage(payload: unknown): { titles: string[]; totalPages: number } {
  const { totalPages, products } = (payload ?? {}) as FilteredProductsPayload;
  return {
    titles: toTitles(products),
    totalPages: typeof totalPages === "number" && Number.isInteger(totalPages) ? totalPages : 1,
  };
}

/** Product ids on the wishlist. */
export function parseWishlistIds(payload: unknown): string[] {
  const wishlist = (payload as WishlistPayload | null)?.wishlist;
  if (typeof wishlist !== "object" || wishlist === null || Array.isArray(wishlist)) return [];
  return Object.keys(wishlist);
}

/** Titles from a `https://api.gog.com/products?ids=` response. */
export function parseProductTitles(payload: unknown): string[] {
  return toTitles(payload);
}
