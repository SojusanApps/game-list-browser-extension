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
  parseWishlist,
} from "./parse";

const owned = (title: string) => ({ storeId: `P-${title}`, title, wishlisted: false });
const wished = (storeId: string, title: string) => ({ storeId, title, wishlisted: true });
const conceptOwned = (title: string) => ({ storeId: `C-P-${title}`, title, wishlisted: false });
const conceptWished = (productId: string, title: string) => ({ storeId: `C-${productId}`, title, wishlisted: true });
/** Answers store product pages with concept `C-<product id>` (null: unknown product); library pages go to `library`. */
function withStore(
  library: (url: string, init: RequestInit) => Response,
  conceptOf: (productId: string) => string | null = productId => `C-${productId}`,
  storeUrls: string[] = [],
) {
  return async (url: string, init: RequestInit): Promise<Response> => {
    if (!url.startsWith("https://store.playstation.com/")) return library(url, init);
    storeUrls.push(url);
    const productId = decodeURIComponent(url.split("/product/")[1]!);
    const conceptId = conceptOf(productId);
    return html(page(conceptId ? productNextData(productId, conceptId) : productErrorNextData));
  };
}
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

  it("reports HTTP failures as errors", async () => {
    const adapter = createPlayStationAdapter(async () => html("nope", { status: 500 }));
    await expect(adapter.fetchEntries()).rejects.toThrow("HTTP 500");
  });
});
