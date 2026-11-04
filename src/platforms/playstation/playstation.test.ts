import { describe, expect, it } from "vitest";

import { MissingStoreIdError, NotLoggedInError } from "../adapter";
import { createPlayStationAdapter } from "./adapter";
import {
  collectionNextData,
  emptyWishlistNextData,
  page,
  productErrorNextData,
  productNextData,
  signedOutNextData,
  wishlistNextData,
} from "./fixtures";
import {
  extractAccountId,
  extractLocale,
  extractNextData,
  parseCollectionPage,
  parseConceptId,
  parseGraphqlProduct,
  parseWishlist,
} from "./parse";

const owned = (title: string) => ({ storeId: `P-${title}`, title, wishlisted: false });
const wished = (storeId: string, title: string) => ({ storeId, title, wishlisted: true });
const conceptOwned = (title: string) => ({ storeId: `C-P-${title}`, title, wishlisted: false });
const conceptWished = (productId: string, title: string) => ({ storeId: `C-${productId}`, title, wishlisted: true });
/** Answers GraphQL and store product pages with concept `C-<product id>` (null: unknown product); library pages go to `library`. */
function withStore(
  library: (url: string, init: RequestInit) => Response,
  conceptOf: (productId: string) => string | null = productId => `C-${productId}`,
  storeUrls: string[] = [],
  graphql: (url: string, init: RequestInit) => Response | Promise<Response> = (url, _init) => {
    const productId = JSON.parse(new URL(url).searchParams.get("variables")!).productId as string;
    return graphqlAnswer(productId, conceptOf(productId));
  },
  /** The purchased-games GraphQL list; by default unavailable, so the library's html pages are used. */
  purchased: (url: string, init: RequestInit) => Response | Promise<Response> = () => new Response("", { status: 404 }),
) {
  return async (url: string, init: RequestInit): Promise<Response> => {
    if (url.startsWith("https://web.np.playstation.com/")) {
      return new URL(url).searchParams.get("operationName") === "getPurchasedGameList"
        ? purchased(url, init)
        : graphql(url, init);
    }
    if (!url.startsWith("https://store.playstation.com/")) return library(url, init);
    storeUrls.push(url);
    const productId = decodeURIComponent(url.split("/product/")[1]!);
    const conceptId = conceptOf(productId);
    return html(page(conceptId ? productNextData(productId, conceptId) : productErrorNextData));
  };
}
/** What the store's GraphQL API answers for a product with the given concept (null: unknown product). */
const graphqlAnswer = (productId: string, conceptId: string | null, invariantName?: string) =>
  new Response(
    JSON.stringify({
      data: {
        productRetrieve: conceptId
          ? { id: productId, invariantName, concept: { __typename: "Concept", id: conceptId } }
          : null,
      },
    }),
    { status: 200 },
  );
const noSleep = async () => {};
const html = (body: string, init: ResponseInit = {}) => new Response(body, { status: 200, ...init });

describe("parse", () => {
  it("extracts __NEXT_DATA__ and returns null for missing or broken payloads", () => {
    expect(extractNextData(page({ a: 1 }))).toEqual({ a: 1 });
    expect(extractNextData("<html></html>")).toBeNull();
    expect(extractNextData('<script id="__NEXT_DATA__">{oops</script>')).toBeNull();
  });

  it("reads the account id only for a signed-in page", () => {
    expect(extractAccountId(wishlistNextData)).toBe("1234567890");
    expect(extractAccountId(signedOutNextData)).toBeNull();
  });

  it("parses a collection page", () => {
    const data = parseCollectionPage(collectionNextData(["A", " B "], { isLast: false, size: 2, totalCount: 3 }, 2));
    expect(data).toEqual({ entries: [owned("A"), owned("B")], page: 2, isLast: false, size: 2, totalCount: 3 });
    expect(parseCollectionPage(signedOutNextData)).toBeNull();
  });

  it("parses a wishlist, resolving Apollo refs", () => {
    expect(parseWishlist(wishlistNextData)).toEqual([
      wished("P-wish-1", "Hollow Knight"),
      wished("P-wish-2", "Inline Wish"),
    ]);
    expect(parseWishlist(emptyWishlistNextData)).toEqual([]);
    expect(parseWishlist(signedOutNextData)).toBeNull();
  });
});

describe("graphql concept ids", () => {
  it("reads the concept of the requested product", async () => {
    const body = await graphqlAnswer("P-1", "10003293").json();
    expect(parseGraphqlProduct(body, "P-1")).toEqual({ conceptId: "10003293", title: null });
  });

  it("reads the English invariant name of the product", async () => {
    const body = await graphqlAnswer("P-1", "10003293", " Zenith: Nexus ").json();
    expect(parseGraphqlProduct(body, "P-1")).toEqual({ conceptId: "10003293", title: "Zenith: Nexus" });
  });

  it("yields null for errors, unknown products and another product's answer", async () => {
    expect(parseGraphqlProduct({ errors: [{}], data: null }, "P-1")).toBeNull();
    expect(parseGraphqlProduct(await graphqlAnswer("P-1", null).json(), "P-1")).toBeNull();
    expect(parseGraphqlProduct(await graphqlAnswer("P-2", "7").json(), "P-1")).toBeNull();
    expect(parseGraphqlProduct("nope", "P-1")).toBeNull();
  });
});

describe("concept ids", () => {
  const genshin = "EP6261-PPSA02584_00-OSRELSIEEGENSHIN";

  it("reads the locale of the signed-in user, lowercased", () => {
    expect(extractLocale(wishlistNextData)).toBe("pl-pl");
    expect(extractLocale(signedOutNextData)).toBeNull();
  });

  it("reads the concept from the cache embedded in a product page", () => {
    expect(parseConceptId(productNextData(genshin, "10000896"), genshin)).toBe("10000896");
  });

  it("does not take another product's concept, and yields null for the error page", () => {
    expect(parseConceptId(productNextData("P-1-extra", "1"), "P-1")).toBeNull();
    expect(parseConceptId(productNextData("P-1", "1"), "P-1.")).toBeNull();
    expect(parseConceptId(productErrorNextData, "P-1")).toBeNull();
    expect(parseConceptId(null, "P-1")).toBeNull();
  });
});

describe("playstation adapter", () => {
  const singleGame = (url: string) =>
    html(
      page(
        url.includes("wishlist")
          ? wishlistNextData
          : collectionNextData(["A"], { isLast: true, size: 1, totalCount: 1 }),
      ),
    );

  it("asks the library for English titles", async () => {
    const languages: Array<string | null> = [];
    const adapter = createPlayStationAdapter(
      withStore((url, init) => {
        languages.push(new Headers(init.headers).get("Accept-Language"));
        return singleGame(url);
      }),
    );
    await adapter.fetchEntries();
    expect(languages).toEqual(["en-US,en;q=0.9", "en-US,en;q=0.9"]);
  });

  it("returns paginated collection entries followed by wishlist entries, keyed by concept id", async () => {
    const urls: string[] = [];
    const storeUrls: string[] = [];
    const adapter = createPlayStationAdapter(
      withStore(
        url => {
          urls.push(url);
          if (url.includes("wishlist")) return html(page(wishlistNextData));
          if (url.includes("page=2")) {
            return html(page(collectionNextData(["C"], { isLast: true, size: 2, totalCount: 3 }, 2)));
          }
          return html(page(collectionNextData(["A", "B"], { isLast: false, size: 2, totalCount: 3 })));
        },
        undefined,
        storeUrls,
      ),
    );

    expect(await adapter.fetchEntries()).toEqual([
      conceptOwned("A"),
      conceptOwned("B"),
      conceptOwned("C"),
      conceptWished("P-wish-1", "Hollow Knight"),
      conceptWished("P-wish-2", "Inline Wish"),
    ]);
    expect(urls).toHaveLength(3);
    expect(storeUrls).toHaveLength(5);
    expect(storeUrls[0]).toBe("https://store.playstation.com/pl-pl/product/P-A");
  });

  it("gives editions of one concept the same id and asks for each product once", async () => {
    const storeUrls: string[] = [];
    const adapter = createPlayStationAdapter(withStore(singleGame, () => "10000896", storeUrls));
    expect((await adapter.fetchEntries()).map(entry => entry.storeId)).toEqual(["10000896", "10000896", "10000896"]);
    expect(new Set(storeUrls).size).toBe(storeUrls.length);
  });

  it("skips products the store has no concept for", async () => {
    const adapter = createPlayStationAdapter(withStore(singleGame, productId => (productId === "P-A" ? null : "7")));
    expect(await adapter.fetchEntries()).toEqual([
      { storeId: "7", title: "Hollow Knight", wishlisted: true },
      { storeId: "7", title: "Inline Wish", wishlisted: true },
    ]);
  });

  it("fails when no product has a concept id", async () => {
    const adapter = createPlayStationAdapter(withStore(singleGame, () => null));
    await expect(adapter.fetchEntries()).rejects.toBeInstanceOf(MissingStoreIdError);
  });

  it("accepts an empty wishlist", async () => {
    const adapter = createPlayStationAdapter(
      withStore(url =>
        html(
          page(
            url.includes("wishlist")
              ? emptyWishlistNextData
              : collectionNextData(["A"], { isLast: true, size: 1, totalCount: 1 }),
          ),
        ),
      ),
    );
    expect(await adapter.fetchEntries()).toEqual([conceptOwned("A")]);
  });

  it("throws NotLoggedInError on a redirect to sign-in", async () => {
    const adapter = createPlayStationAdapter(async () => ({ type: "opaqueredirect", status: 0 }) as Response);
    await expect(adapter.fetchEntries()).rejects.toBeInstanceOf(NotLoggedInError);
  });

  it("throws NotLoggedInError when the page has no session or no __NEXT_DATA__", async () => {
    await expect(
      createPlayStationAdapter(async () => html(page(signedOutNextData))).fetchEntries(),
    ).rejects.toBeInstanceOf(NotLoggedInError);
    await expect(createPlayStationAdapter(async () => html("<html></html>")).fetchEntries()).rejects.toBeInstanceOf(
      NotLoggedInError,
    );
  });

  it("throws NotLoggedInError on a cross-origin redirect network error", async () => {
    const adapter = createPlayStationAdapter(async () => {
      throw new TypeError("Failed to fetch");
    });
    await expect(adapter.fetchEntries()).rejects.toBeInstanceOf(NotLoggedInError);
  });

  it("lists purchased games from GraphQL, fetching the pages after the first in parallel", async () => {
    const starts: number[] = [];
    const titles = ["A", "B", "C", "D", "E"];
    const adapter = createPlayStationAdapter(
      withStore(
        url => html(page(url.includes("wishlist") ? emptyWishlistNextData : signedOutNextData)),
        undefined,
        [],
        undefined,
        (url, init) => {
          const { start } = JSON.parse(new URL(url).searchParams.get("variables")!) as { start: number };
          starts.push(start);
          expect(new Headers(init.headers).get("x-psn-store-locale-override")).toBe("en-US");
          const games = titles.slice(start, start + 2).map(name => ({ name, productId: `P-${name}` }));
          return new Response(
            JSON.stringify({
              data: {
                purchasedTitlesRetrieve: {
                  games,
                  pageInfo: { isLast: start + 2 >= titles.length, offset: start, size: 2, totalCount: titles.length },
                },
              },
            }),
          );
        },
      ),
      noSleep,
    );
    expect((await adapter.fetchEntries()).map(entry => entry.title)).toEqual(titles);
    expect([...starts].sort((a, b) => a - b)).toEqual([0, 2, 4]);
  });

  it("falls back to the library pages when the purchased-games GraphQL fails", async () => {
    const adapter = createPlayStationAdapter(
      withStore(singleGame, undefined, [], undefined, () => new Response('{"errors":[{"message":"nope"}]}')),
      noSleep,
    );
    expect((await adapter.fetchEntries())[0]).toEqual(conceptOwned("A"));
  });

  it("reports its stages and how far it has come", async () => {
    const updates: Array<{ stage: string; done?: number; total?: number }> = [];
    const adapter = createPlayStationAdapter(withStore(singleGame), noSleep);
    await adapter.fetchEntries(update => updates.push(update));
    expect(updates.map(update => update.stage)).toContain("collection");
    expect(updates).toContainEqual({ stage: "wishlist" });
    expect(updates.at(-1)).toEqual({ stage: "resolving", done: 3, total: 3 });
    expect(updates.filter(update => update.stage === "resolving")[0]).toEqual({
      stage: "resolving",
      done: 0,
      total: 3,
    });
  });

  it("asks GraphQL for each product with the persisted query and the user's locale", async () => {
    const calls: Array<{ url: URL; headers: Headers }> = [];
    const adapter = createPlayStationAdapter(
      withStore(singleGame, undefined, [], (url, init) => {
        calls.push({ url: new URL(url), headers: new Headers(init.headers) });
        const productId = JSON.parse(new URL(url).searchParams.get("variables")!).productId as string;
        return graphqlAnswer(productId, `C-${productId}`);
      }),
      noSleep,
    );
    await adapter.fetchEntries();
    expect(calls).toHaveLength(3);
    const { url, headers } = calls[0]!;
    expect(url.searchParams.get("operationName")).toBe("productRetrieveForCtasWithPrice");
    expect(JSON.parse(url.searchParams.get("extensions")!).persistedQuery.sha256Hash).toMatch(/^[0-9a-f]{64}$/);
    expect(headers.get("x-psn-store-locale-override")).toBe("pl-PL");
    expect(headers.get("apollographql-client-name")).toBe("@sie-private/web-commerce-anywhere");
  });

  it("titles entries with the English invariant name from GraphQL, and keeps the library title on a fallback", async () => {
    const english = createPlayStationAdapter(
      withStore(singleGame, undefined, [], url => {
        const productId = JSON.parse(new URL(url).searchParams.get("variables")!).productId as string;
        return graphqlAnswer(productId, `C-${productId}`, `English ${productId}`);
      }),
      noSleep,
    );
    expect((await english.fetchEntries())[0]).toEqual({ storeId: "C-P-A", title: "English P-A", wishlisted: false });

    const fallback = createPlayStationAdapter(
      withStore(singleGame, undefined, [], () => new Response("", { status: 404 })),
      noSleep,
    );
    expect((await fallback.fetchEntries())[0]).toEqual(conceptOwned("A"));
  });

  it("falls back to the store page when GraphQL gives no concept", async () => {
    const storeUrls: string[] = [];
    const adapter = createPlayStationAdapter(
      withStore(
        singleGame,
        undefined,
        storeUrls,
        () => new Response('{"errors":[{"message":"PersistedQueryNotFound"}]}'),
      ),
      noSleep,
    );
    expect(await adapter.fetchEntries()).toEqual([
      conceptOwned("A"),
      conceptWished("P-wish-1", "Hollow Knight"),
      conceptWished("P-wish-2", "Inline Wish"),
    ]);
    expect(storeUrls).toHaveLength(3);
  });

  it("retries a throttled lookup with backoff and then succeeds", async () => {
    const delays: number[] = [];
    let attempts = 0;
    const adapter = createPlayStationAdapter(
      withStore(singleGame, undefined, [], (url, _init) => {
        const productId = JSON.parse(new URL(url).searchParams.get("variables")!).productId as string;
        if (productId === "P-A") attempts += 1;
        return productId === "P-A" && attempts <= 2
          ? new Response("slow down", { status: 429 })
          : graphqlAnswer(productId, `C-${productId}`);
      }),
      async ms => {
        delays.push(ms);
      },
    );
    expect((await adapter.fetchEntries())[0]).toEqual(conceptOwned("A"));
    expect(delays).toEqual([500, 1000]);
  });

  it("fails the sync when a product keeps failing after retries", async () => {
    const adapter = createPlayStationAdapter(
      async url =>
        url.startsWith("https://library.playstation.com/") ? singleGame(url) : html("down", { status: 503 }),
      noSleep,
    );
    await expect(adapter.fetchEntries()).rejects.toThrow("HTTP 503");
  });

  it("reports HTTP failures as errors", async () => {
    const adapter = createPlayStationAdapter(async () => html("nope", { status: 500 }));
    await expect(adapter.fetchEntries()).rejects.toThrow("HTTP 500");
  });
});
