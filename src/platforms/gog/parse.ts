/** Shape of `https://embed.gog.com/userData.json`; only the field we read. */
interface UserDataPayload {
  isLoggedIn?: unknown;
}

/** Shape of `https://embed.gog.com/account/getFilteredProducts`; only the fields we read. */
interface FilteredProductsPayload {
  totalPages?: unknown;
  products?: { id?: unknown; title?: unknown }[];
}

/** A GOG product: its numeric id as a string, and its title. */
export interface GogProduct {
  id: string;
  title: string;
}

/** Shape of `https://embed.gog.com/user/wishlist.json`: product ids as keys. */
interface WishlistPayload {
  wishlist?: unknown;
}

export function parseIsLoggedIn(payload: unknown): boolean {
  return (payload as UserDataPayload | null)?.isLoggedIn === true;
}

function toProducts(items: unknown): GogProduct[] {
  if (!Array.isArray(items)) return [];
  const products: GogProduct[] = [];
  for (const item of items) {
    const { id, title } = (item ?? {}) as { id?: unknown; title?: unknown };
    const hasId = typeof id === "number" ? Number.isInteger(id) : typeof id === "string" && id.trim() !== "";
    if (hasId && typeof title === "string" && title.trim()) products.push({ id: String(id), title });
  }
  return products;
}

/** One page of the owned library: its products and how many pages there are in total. */
export function parseOwnedPage(payload: unknown): { products: GogProduct[]; totalPages: number } {
  const { totalPages, products } = (payload ?? {}) as FilteredProductsPayload;
  return {
    products: toProducts(products),
    totalPages: typeof totalPages === "number" && Number.isInteger(totalPages) ? totalPages : 1,
  };
}

/** Product ids on the wishlist. */
export function parseWishlistIds(payload: unknown): string[] {
  const wishlist = (payload as WishlistPayload | null)?.wishlist;
  if (typeof wishlist !== "object" || wishlist === null || Array.isArray(wishlist)) return [];
  return Object.keys(wishlist);
}

/** Products from a `https://api.gog.com/products?ids=` response. */
export function parseProducts(payload: unknown): GogProduct[] {
  return toProducts(payload);
}
