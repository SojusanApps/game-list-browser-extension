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
      respond: (url: URL) => (url.pathname.includes("/ns-a/") ? fixtures.catalogNsA : fixtures.catalogNsB),
    },
    { match: host("store.epicgames.com"), respond: wishlist },
  ];
}

describe("epic adapter", () => {
  it("returns library titles (via the catalog) followed by wishlist titles", async () => {
    const { fn, calls } = stubFetch(happyRoutes());
    const adapter = createEpicAdapter({ fetch: fn, warmupStoreSession: async () => {} });

    expect(await adapter.fetchTitles()).toEqual(["Alpha Game", "Beta Game", "Gamma Game", "Wished One", "Wished Two"]);

    const catalogCalls = calls.filter(url => url.host.includes("catalog-public-service"));
    expect(catalogCalls).toHaveLength(2);
    expect(catalogCalls[0]!.searchParams.getAll("id")).toEqual(["item-1", "item-2"]);
    expect(calls.some(url => url.searchParams.get("cursor") === "cursor-2")).toBe(true);
  });

  it("throws NotLoggedInError when Epic issues no authorization code", async () => {
    const { fn } = stubFetch([{ match: host("www.epicgames.com"), respond: () => fixtures.authCodeLoggedOut }]);
    const adapter = createEpicAdapter({ fetch: fn, warmupStoreSession: async () => {} });
    await expect(adapter.fetchTitles()).rejects.toBeInstanceOf(NotLoggedInError);
  });

  it("warms up the store session once and retries a logged-out wishlist", async () => {
    let wishlistCalls = 0;
    const { fn } = stubFetch(
      happyRoutes(() => (++wishlistCalls === 1 ? fixtures.wishlistNotLoggedIn : fixtures.wishlistOk)),
    );
    const warmup = vi.fn<() => Promise<void>>(async () => {});
    const adapter = createEpicAdapter({ fetch: fn, warmupStoreSession: warmup });

    expect(await adapter.fetchTitles()).toContain("Wished Two");
    expect(warmup).toHaveBeenCalledTimes(1);
  });

  it("fails with a clear error if the wishlist stays logged out after warmup", async () => {
    const { fn } = stubFetch(happyRoutes(() => fixtures.wishlistNotLoggedIn));
    const adapter = createEpicAdapter({ fetch: fn, warmupStoreSession: async () => {} });
    await expect(adapter.fetchTitles()).rejects.toThrow(/wishlist unavailable/);
  });

  it("surfaces a failed library request as an error", async () => {
    const routes = happyRoutes();
    routes[2] = { match: host("library-service"), respond: () => ({}), status: 500 } as never;
    const { fn } = stubFetch(routes);
    const adapter = createEpicAdapter({ fetch: fn, warmupStoreSession: async () => {} });
    await expect(adapter.fetchTitles()).rejects.toThrow(/HTTP 500/);
  });
});
