import type { LibraryEntry } from "../../contract";
import { SyncError } from "../../errors";
import { NotLoggedInError, type PlatformAdapter } from "../adapter";
import { parseStoreItems, parseUserData, type UserData } from "./parse";

const USERDATA_URL = "https://store.steampowered.com/dynamicstore/userdata/";
const STORE_ITEMS_URL = "https://api.steampowered.com/IStoreBrowseService/GetItems/v1";
const BATCH_SIZE = 200;

async function fetchJson(url: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(url, init);
  if (!response.ok) throw new SyncError("requestFailed", { platform: "steam", status: response.status });
  return response.json();
}

async function fetchUserData(): Promise<UserData> {
  const url = new URL(USERDATA_URL);
  url.searchParams.set("_", Date.now().toString());
  const payload = await fetchJson(url.toString(), {
    credentials: "include",
    cache: "no-store",
    headers: { Accept: "application/json", "X-Requested-With": "XMLHttpRequest" },
  });
  return parseUserData(payload);
}

async function fetchNames(appIds: number[]): Promise<[number, string][]> {
  const names: [number, string][] = [];
  for (let i = 0; i < appIds.length; i += BATCH_SIZE) {
    const url = new URL(STORE_ITEMS_URL);
    url.searchParams.set(
      "input_json",
      JSON.stringify({
        ids: appIds.slice(i, i + BATCH_SIZE).map(appid => ({ appid })),
        context: { language: "english", country_code: "US" },
        data_request: {},
      }),
    );
    const payload = await fetchJson(url.toString()); //NOSONAR
    names.push(...parseStoreItems(payload));
  }
  return names;
}

export const steamAdapter: PlatformAdapter = {
  async fetchEntries() {
    const { owned, wishlisted } = await fetchUserData();
    // A logged-out session gets empty owned and wishlist lists.
    if (owned.length + wishlisted.length === 0) throw new NotLoggedInError("steam");
    const ownedSet = new Set(owned);
    const entries: LibraryEntry[] = (await fetchNames([...owned, ...wishlisted])).map(([appid, title]) => ({
      storeId: String(appid),
      title,
      wishlisted: !ownedSet.has(appid),
    }));
    return entries;
  },
};
