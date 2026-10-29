import { describe, expect, it, vi } from "vitest";

import { NotLoggedInError } from "../adapter";
import { createEpicAdapter } from "./adapter";
import * as fixtures from "./fixtures";

type Route = (url: URL) => unknown;

function stubFetch(routes: { match: (url: URL) => boolean; respond: Route; status?: number }[]) {
  const calls: URL[] = [];
  const fn = vi.fn<(input: RequestInfo | URL) => Promise<Response>>(async input => {
    const url = new URL(String(input));
    calls.push(url);
    const route = routes.find(candidate => candidate.match(url));
    if (!route) throw new Error(`unexpected request ${url}`);
    const status = route.status ?? 200;
    return new Response(JSON.stringify(route.respond(url)), { status });
  });
  return { fn: fn as unknown as typeof fetch, calls };
}

const host = (name: string) => (url: URL) => url.host.includes(name);

function offersFor(namespace: string) {
  const byNamespace: Record<string, unknown> = {
    "ns-a": fixtures.offersNsA,
    "ns-b": fixtures.offersNsB,
    "ns-c": fixtures.offersNsC,
  };
  return byNamespace[namespace];
}

function happyRoutes(wishlist: () => unknown = () => fixtures.wishlistOk) {
  return [
    { match: host("www.epicgames.com"), respond: () => fixtures.authCodeOk },
    { match: host("account-public-service"), respond: () => fixtures.tokenOk },
    {
      match: host("library-service"),
      respond: (url: URL) => (url.searchParams.get("cursor") ? fixtures.libraryPage2 : fixtures.libraryPage1),
    },
    {
      match: host("catalog-public-service"),
      respond: (url: URL) =>
        url.pathname.endsWith("/bulk/offers") ? fixtures.bulkOffersNsW : offersFor(url.pathname.split("/")[5]!),
    },
    { match: host("store.epicgames.com"), respond: wishlist },
  ];
}

describe("epic adapter", () => {
  it("returns each namespace's base-game offer, then the wishlisted base-game offers", async () => {
    const { fn, calls } = stubFetch(happyRoutes());
    const adapter = createEpicAdapter({ fetch: fn, warmupStoreSession: async () => {} });

    expect(await adapter.fetchEntries()).toEqual([
      { storeId: "offer-a", title: "Alpha Game", wishlisted: false },
      { storeId: "offer-b", title: "Gamma Game", wishlisted: false },
      { storeId: "o1", title: "Wished One", wishlisted: true },
      { storeId: "o2", title: "Wished Two", wishlisted: true },
    ]);

    const listingCalls = calls.filter(
      url => url.pathname.endsWith("/offers") && !url.pathname.endsWith("/bulk/offers"),
    );
    expect(listingCalls.map(url => url.pathname.split("/")[5]).sort()).toEqual(["ns-a", "ns-b", "ns-c"]);
    const bulkCalls = calls.filter(url => url.pathname.endsWith("/bulk/offers"));
    expect(bulkCalls).toHaveLength(1);
    expect(bulkCalls[0]!.pathname).toContain("/ns-w/");
    expect(bulkCalls[0]!.searchParams.getAll("id")).toEqual(["o1", "o2", "o3", "o-gone"]);
    expect(calls.some(url => url.searchParams.get("cursor") === "cursor-2")).toBe(true);
  });

  it("reads every page of a namespace's offers", async () => {
    const routes = happyRoutes();
    routes[3] = {
      match: host("catalog-public-service"),
      respond: (url: URL) => {
        if (url.pathname.endsWith("/bulk/offers")) return fixtures.bulkOffersNsW;
        if (!url.pathname.includes("/ns-b/")) return offersFor(url.pathname.split("/")[5]!);
        return url.searchParams.get("start") === "0"
          ? fixtures.offersPage([{ id: "offer-b-audience", title: "GammaDevAudience", offerType: "OTHERS" }], 101)
          : fixtures.offersNsB;
      },
    };
    const { fn } = stubFetch(routes);
    const adapter = createEpicAdapter({ fetch: fn, warmupStoreSession: async () => {} });
    expect(await adapter.fetchEntries()).toContainEqual({ storeId: "offer-b", title: "Gamma Game", wishlisted: false });
  });

  it("fails when the wishlist has elements but none with an offer id", async () => {
    const { fn } = stubFetch(
      happyRoutes(() => ({ data: { Wishlist: { wishlistItems: { elements: [{ id: "w1" }] } } } })),
    );
    const adapter = createEpicAdapter({ fetch: fn, warmupStoreSession: async () => {} });
    await expect(adapter.fetchEntries()).rejects.toThrow(/none with a store id/);
  });

  it("throws NotLoggedInError when Epic issues no authorization code", async () => {
    const { fn } = stubFetch([{ match: host("www.epicgames.com"), respond: () => fixtures.authCodeLoggedOut }]);
    const adapter = createEpicAdapter({ fetch: fn, warmupStoreSession: async () => {} });
    await expect(adapter.fetchEntries()).rejects.toBeInstanceOf(NotLoggedInError);
  });

  it("warms up the store session once and retries a logged-out wishlist", async () => {
    let wishlistCalls = 0;
    const { fn } = stubFetch(
      happyRoutes(() => (++wishlistCalls === 1 ? fixtures.wishlistNotLoggedIn : fixtures.wishlistOk)),
    );
    const warmup = vi.fn<() => Promise<void>>(async () => {});
    const adapter = createEpicAdapter({ fetch: fn, warmupStoreSession: warmup });

    expect((await adapter.fetchEntries()).map(entry => entry.title)).toContain("Wished Two");
    expect(warmup).toHaveBeenCalledTimes(1);
  });

  it("fails with a clear error if the wishlist stays logged out after warmup", async () => {
    const { fn } = stubFetch(happyRoutes(() => fixtures.wishlistNotLoggedIn));
    const adapter = createEpicAdapter({ fetch: fn, warmupStoreSession: async () => {} });
    await expect(adapter.fetchEntries()).rejects.toThrow(/wishlist unavailable/);
  });

  it("surfaces a failed library request as an error", async () => {
    const routes = happyRoutes();
    routes[2] = { match: host("library-service"), respond: () => ({}), status: 500 } as never;
    const { fn } = stubFetch(routes);
    const adapter = createEpicAdapter({ fetch: fn, warmupStoreSession: async () => {} });
    await expect(adapter.fetchEntries()).rejects.toThrow(/HTTP 500/);
  });
});
