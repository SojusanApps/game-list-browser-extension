import { describe, expect, it, vi } from "vitest";

import { NotLoggedInError } from "../adapter";
import { createNintendoAdapter, type NintendoDeps } from "./core";
import {
  CLIENT_ID_COLLECTION,
  CLIENT_ID_SHOP,
  collectionHtml,
  collectionPage,
  QUERY_HASH,
  shopHtml,
  wishlistPage,
} from "./fixtures";
import { buildWishlistRequestUrl, type GraphqlPayload } from "./parse";
import type { InspectResult, PageInspector } from "./tabs";

const SESSION = { idToken: "a.b.c", naId: "na-1", localeInfo: { country: "PL" } };
const EMPTY_COLLECTION: GraphqlPayload = {
  data: { account: { vgc: { vgcViews: { views: [], offsetInfo: { total: 0, offset: 0 } } } } },
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

interface Options {
  session?: unknown | null;
  collectionResult?: InspectResult<unknown>;
  storage?: Record<string, string>;
  graphql?: (url: string, init?: RequestInit) => Response;
}

function setup(options: Options = {}) {
  const store: Record<string, string> = { ...options.storage };
  const fetchMock = vi.fn<(input: string | URL | Request, init?: RequestInit) => Promise<Response>>(
    async (input, init) => {
      const url = String(input);
      if (url.includes("/api/auth/session")) {
        return options.session === null ? new Response("{}", { status: 401 }) : json(options.session ?? SESSION);
      }
      const handled = options.graphql?.(url, init);
      if (handled) return handled;
      if (init?.method === "POST") {
        const offset = (JSON.parse(String(init.body)) as { variables: { isHidden: boolean } }).variables.isHidden;
        return json(offset ? EMPTY_COLLECTION : collectionPage);
      }
      return json(wishlistPage);
    },
  );

  const inspect = vi.fn<(options: Parameters<PageInspector["inspect"]>[0]) => Promise<InspectResult<unknown>>>(
    async inspectOptions => {
      if (inspectOptions.expectedHost === "accounts.nintendo.com") {
        if (options.collectionResult) return options.collectionResult;
        const value = await inspectOptions.probe({
          getSnapshot: async () => ({ url: inspectOptions.url, html: collectionHtml, resourceUrls: [] }),
        });
        return { status: "found", value } as InspectResult<unknown>;
      }
      const value = await inspectOptions.probe({
        getSnapshot: async () => ({
          url: inspectOptions.url,
          html: shopHtml,
          resourceUrls: [buildWishlistRequestUrl("PL", "t", 0, QUERY_HASH)],
        }),
      });
      return value === null ? ({ status: "timeout" } as const) : ({ status: "found", value } as InspectResult<unknown>);
    },
  );

  const deps: NintendoDeps = {
    fetch: fetchMock as unknown as typeof fetch,
    inspector: { inspect } as unknown as PageInspector,
    storage: {
      get: async key => store[key],
      set: async (key, value) => {
        store[key] = value;
      },
      remove: async keys => {
        for (const key of keys) delete store[key];
      },
    },
  };
  return { adapter: createNintendoAdapter(deps), fetchMock, inspect, store };
}

describe("nintendo adapter", () => {
  it("returns collection and wishlist titles raw, collection first", async () => {
    const { adapter, store } = setup();
    expect(await adapter.fetchTitles()).toEqual([
      "The Legend of Zelda: Tears of the Kingdom",
      "Hades",
      "Hades",
      "Celeste Bundle",
    ]);
    expect(Object.values(store)).toEqual([QUERY_HASH, CLIENT_ID_SHOP]);
  });

  it("sends the discovered client id on both graphql calls", async () => {
    const { adapter, fetchMock } = setup();
    await adapter.fetchTitles();
    const clientIds = fetchMock.mock.calls
      .map(([, init]) => (init?.headers as Record<string, string> | undefined)?.["X-Nintendo-Savanna-Client-Id"])
      .filter(Boolean);
    expect(clientIds).toContain(CLIENT_ID_COLLECTION);
    expect(clientIds).toContain(CLIENT_ID_SHOP);
  });

  it("throws NotLoggedInError when the collection page redirects to login", async () => {
    const { adapter } = setup({ collectionResult: { status: "redirected" } });
    await expect(adapter.fetchTitles()).rejects.toBeInstanceOf(NotLoggedInError);
  });

  it("throws NotLoggedInError when the shop session cannot be refreshed", async () => {
    const { adapter } = setup({ session: null });
    await expect(adapter.fetchTitles()).rejects.toBeInstanceOf(NotLoggedInError);
  });

  it("rediscovers the query hash once when Nintendo reports it as outdated", async () => {
    let wishlistCalls = 0;
    const { adapter, store } = setup({
      storage: { nintendoWishlistQueryHash: "d".repeat(64), nintendoSavannaClientId: CLIENT_ID_SHOP },
      graphql: (url, init) => {
        if (init?.method === "POST") return undefined as never;
        wishlistCalls += 1;
        return wishlistCalls === 1
          ? json({ errors: [{ extensions: { errorCode: "1802", title: "INVALID_PARAM", type: "x/invalid-param" } }] })
          : (undefined as never);
      },
    });
    await adapter.fetchTitles();
    expect(wishlistCalls).toBe(2);
    expect(store.nintendoWishlistQueryHash).toBe(QUERY_HASH);
  });

  it("maps a 401 from the wishlist endpoint to NotLoggedInError", async () => {
    const { adapter } = setup({
      graphql: (_, init) => (init?.method === "POST" ? (undefined as never) : json({}, 401)),
    });
    await expect(adapter.fetchTitles()).rejects.toBeInstanceOf(NotLoggedInError);
  });
});
