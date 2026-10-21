import { NotLoggedInError, type PlatformAdapter } from "../adapter";
import { parseStoreItems, parseUserData } from "./parse";

const USERDATA_URL = "https://store.steampowered.com/dynamicstore/userdata/";
const STORE_ITEMS_URL = "https://api.steampowered.com/IStoreBrowseService/GetItems/v1";
const BATCH_SIZE = 200;

async function fetchJson(url: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(url, init);
  if (!response.ok) throw new Error(`Steam request failed: HTTP ${response.status}`);
  return response.json();
}

async function fetchAppIds(): Promise<number[]> {
  const url = new URL(USERDATA_URL);
  url.searchParams.set("_", Date.now().toString());
  const payload = await fetchJson(url.toString(), {
    credentials: "include",
    cache: "no-store",
    headers: { Accept: "application/json", "X-Requested-With": "XMLHttpRequest" },
  });
  return parseUserData(payload);
}

async function fetchNames(appIds: number[]): Promise<string[]> {
  const names: string[] = [];
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
    names.push(...parseStoreItems(payload).map(([, name]) => name));
  }
  return names;
}

export const steamAdapter: PlatformAdapter = {
  async fetchTitles() {
    const appIds = await fetchAppIds();
    // A logged-out session gets empty owned and wishlist lists.
    if (appIds.length === 0) throw new NotLoggedInError("steam");
    return fetchNames(appIds);
  },
};
