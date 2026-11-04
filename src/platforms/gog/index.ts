import type { LibraryEntry } from "../../contract";
import { SyncError } from "../../errors";
import { NotLoggedInError, type PlatformAdapter, type ReportProgress } from "../adapter";
import { parseIsLoggedIn, parseOwnedPage, parseProducts, parseWishlistIds } from "./parse";

const USERDATA_URL = "https://embed.gog.com/userData.json";
const OWNED_URL = "https://embed.gog.com/account/getFilteredProducts";
const WISHLIST_URL = "https://embed.gog.com/user/wishlist.json";
const PRODUCTS_URL = "https://api.gog.com/products";
const MAX_OWNED_PAGES = 200;
const PRODUCTS_BATCH_SIZE = 50;

async function fetchJson(url: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(url, init);
  if (!response.ok) throw new SyncError("requestFailed", { platform: "gog", status: response.status });
  return response.json();
}

const withSession: RequestInit = { credentials: "include", headers: { Accept: "application/json" } };

async function fetchOwnedEntries(report: ReportProgress): Promise<LibraryEntry[]> {
  const entries: LibraryEntry[] = [];
  for (let page = 1; page <= MAX_OWNED_PAGES; page += 1) {
    const url = new URL(OWNED_URL);
    url.searchParams.set("mediaType", "1");
    url.searchParams.set("page", String(page));
    const parsed = parseOwnedPage(await fetchJson(url.toString(), withSession));
    entries.push(...parsed.products.map(({ id, title }) => ({ storeId: id, title, wishlisted: false })));
    // GOG tells how many pages there are, not how many games, so only the games read so far are reported.
    report({ stage: "collection", done: entries.length });
    if (page >= parsed.totalPages) break;
  }
  return entries;
}

async function fetchWishlistEntries(report: ReportProgress): Promise<LibraryEntry[]> {
  report({ stage: "wishlist" });
  const ids = parseWishlistIds(await fetchJson(WISHLIST_URL, withSession));
  const entries: LibraryEntry[] = [];
  for (let i = 0; i < ids.length; i += PRODUCTS_BATCH_SIZE) {
    const url = new URL(PRODUCTS_URL);
    url.searchParams.set("ids", ids.slice(i, i + PRODUCTS_BATCH_SIZE).join(","));
    const products = parseProducts(await fetchJson(url.toString())); // NOSONAR
    entries.push(...products.map(({ id, title }) => ({ storeId: id, title, wishlisted: true })));
    report({ stage: "wishlist", done: entries.length, total: ids.length });
  }
  return entries;
}

export const gogAdapter: PlatformAdapter = {
  async fetchEntries(report = () => {}) {
    report({ stage: "starting" });
    if (!parseIsLoggedIn(await fetchJson(USERDATA_URL, withSession))) throw new NotLoggedInError("gog");
    return [...(await fetchOwnedEntries(report)), ...(await fetchWishlistEntries(report))];
  },
};
