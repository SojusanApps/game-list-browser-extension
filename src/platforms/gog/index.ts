import { NotLoggedInError, type PlatformAdapter } from "../adapter";
import { parseIsLoggedIn, parseOwnedPage, parseProductTitles, parseWishlistIds } from "./parse";

const USERDATA_URL = "https://embed.gog.com/userData.json";
const OWNED_URL = "https://embed.gog.com/account/getFilteredProducts";
const WISHLIST_URL = "https://embed.gog.com/user/wishlist.json";
const PRODUCTS_URL = "https://api.gog.com/products";
const MAX_OWNED_PAGES = 200;
const PRODUCTS_BATCH_SIZE = 50;

async function fetchJson(url: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(url, init);
  if (!response.ok) throw new Error(`GOG request failed: HTTP ${response.status}`);
  return response.json();
}

const withSession: RequestInit = { credentials: "include", headers: { Accept: "application/json" } };

async function fetchOwnedTitles(): Promise<string[]> {
  const titles: string[] = [];
  for (let page = 1; page <= MAX_OWNED_PAGES; page += 1) {
    const url = new URL(OWNED_URL);
    url.searchParams.set("mediaType", "1");
    url.searchParams.set("page", String(page));
    const parsed = parseOwnedPage(await fetchJson(url.toString(), withSession));
    titles.push(...parsed.titles);
    if (page >= parsed.totalPages) break;
  }
  return titles;
}

async function fetchWishlistTitles(): Promise<string[]> {
  const ids = parseWishlistIds(await fetchJson(WISHLIST_URL, withSession));
  const titles: string[] = [];
  for (let i = 0; i < ids.length; i += PRODUCTS_BATCH_SIZE) {
    const url = new URL(PRODUCTS_URL);
    url.searchParams.set("ids", ids.slice(i, i + PRODUCTS_BATCH_SIZE).join(","));
    titles.push(...parseProductTitles(await fetchJson(url.toString()))); // NOSONAR
  }
  return titles;
}

export const gogAdapter: PlatformAdapter = {
  async fetchTitles() {
    if (!parseIsLoggedIn(await fetchJson(USERDATA_URL, withSession))) throw new NotLoggedInError("gog");
    return [...(await fetchOwnedTitles()), ...(await fetchWishlistTitles())];
  },
};
