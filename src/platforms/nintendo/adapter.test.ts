import { describe, expect, it, vi } from "vitest";

import { MissingStoreIdError, NotLoggedInError } from "../adapter";
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
  it("returns collection entries then wishlist entries raw, collection first", async () => {
    const { adapter, store } = setup();
    expect(await adapter.fetchEntries()).toEqual([
      { storeId: "70010000063714", title: "The Legend of Zelda: Tears of the Kingdom", wishlisted: false },
      { storeId: "70010000000001", title: "Hades", wishlisted: false },
      { storeId: "70010000000001", title: "Hades", wishlisted: true },
      { storeId: "70010000000002", title: "Celeste Bundle", wishlisted: true },
    ]);
    expect(Object.values(store)).toEqual([QUERY_HASH, CLIENT_ID_SHOP]);
  });

  it("sends the discovered client id on both graphql calls", async () => {
    const { adapter, fetchMock } = setup();
    await adapter.fetchEntries();
    const clientIds = fetchMock.mock.calls
      .map(([, init]) => (init?.headers as Record<string, string> | undefined)?.["X-Nintendo-Savanna-Client-Id"])
      .filter(Boolean);
    expect(clientIds).toContain(CLIENT_ID_COLLECTION);
    expect(clientIds).toContain(CLIENT_ID_SHOP);
  });

  it("throws NotLoggedInError when the collection page redirects to login", async () => {
    const { adapter } = setup({ collectionResult: { status: "redirected" } });
    await expect(adapter.fetchEntries()).rejects.toBeInstanceOf(NotLoggedInError);
  });

  it("throws NotLoggedInError when the shop session cannot be refreshed", async () => {
    const { adapter } = setup({ session: null });
    await expect(adapter.fetchEntries()).rejects.toBeInstanceOf(NotLoggedInError);
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
    await adapter.fetchEntries();
    expect(wishlistCalls).toBe(2);
    expect(store.nintendoWishlistQueryHash).toBe(QUERY_HASH);
  });

  it("fails when the collection has games but none with an nsUid", async () => {
    const withoutIds = {
      data: {
        account: {
          vgc: {
            vgcViews: { views: [{ id: "v1", applicationName: "Hades" }], offsetInfo: { total: 1, offset: 0 } },
          },
        },
      },
    };
    const { adapter } = setup({
      graphql: (_, init) => (init?.method === "POST" ? json(withoutIds) : (undefined as never)),
    });
    await expect(adapter.fetchEntries()).rejects.toBeInstanceOf(MissingStoreIdError);
  });

  it("tries the next id field when Nintendo rejects the first one", async () => {
    const queries: string[] = [];
    const rejected = json({
      errors: [{ message: "error", extensions: { title: "INVALID_PARAM", errorCode: "1802" } }],
    });
    const { adapter } = setup({
      graphql: (_, init) => {
        if (init?.method !== "POST") return undefined as never;
        const query = (JSON.parse(String(init.body)) as { query: string }).query;
        queries.push(query);
        return query.includes("nsUid") ? rejected : (undefined as never);
      },
    });
    const entries = await adapter.fetchEntries();
    expect(queries.some(query => query.includes("applicationId"))).toBe(true);
    expect(entries.length).toBeGreaterThan(0);
  });

  it("fails with the rejection text when every id field is rejected", async () => {
    const rejected = () =>
      json({ errors: [{ message: "error", extensions: { title: "INVALID_PARAM", errorCode: "1802" } }] });
    const { adapter } = setup({ graphql: (_, init) => (init?.method === "POST" ? rejected() : (undefined as never)) });
    await expect(adapter.fetchEntries()).rejects.toThrow(/rejected the collection query.*INVALID_PARAM 1802/);
  });

  it("maps a 401 from the wishlist endpoint to NotLoggedInError", async () => {
    const { adapter } = setup({
      graphql: (_, init) => (init?.method === "POST" ? (undefined as never) : json({}, 401)),
    });
    await expect(adapter.fetchEntries()).rejects.toBeInstanceOf(NotLoggedInError);
  });
});
