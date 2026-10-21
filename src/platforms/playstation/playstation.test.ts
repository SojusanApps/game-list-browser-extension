import { describe, expect, it } from "vitest";

import { NotLoggedInError } from "../adapter";
import { createPlayStationAdapter } from "./adapter";
import { collectionNextData, emptyWishlistNextData, page, signedOutNextData, wishlistNextData } from "./fixtures";
import { extractAccountId, extractNextData, parseCollectionPage, parseWishlist } from "./parse";

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
    expect(data).toEqual({ titles: ["A", "B"], page: 2, isLast: false, size: 2, totalCount: 3 });
    expect(parseCollectionPage(signedOutNextData)).toBeNull();
  });

  it("parses a wishlist, resolving Apollo refs", () => {
    expect(parseWishlist(wishlistNextData)).toEqual(["Hollow Knight", "Inline Wish"]);
    expect(parseWishlist(emptyWishlistNextData)).toEqual([]);
    expect(parseWishlist(signedOutNextData)).toBeNull();
  });
});

describe("playstation adapter", () => {
  it("asks the library for English titles", async () => {
    const languages: Array<string | null> = [];
    const adapter = createPlayStationAdapter(async (url, init) => {
      languages.push(new Headers(init.headers).get("Accept-Language"));
      if (url.includes("wishlist")) return html(page(wishlistNextData));
      return html(page(collectionNextData(["A"], { isLast: true, size: 1, totalCount: 1 })));
    });
    await adapter.fetchTitles();
    expect(languages).toEqual(["en-US,en;q=0.9", "en-US,en;q=0.9"]);
  });

  it("returns paginated collection titles followed by wishlist titles", async () => {
    const urls: string[] = [];
    const adapter = createPlayStationAdapter(async url => {
      urls.push(url);
      if (url.includes("wishlist")) return html(page(wishlistNextData));
      if (url.includes("page=2")) {
        return html(page(collectionNextData(["C"], { isLast: true, size: 2, totalCount: 3 }, 2)));
      }
      return html(page(collectionNextData(["A", "B"], { isLast: false, size: 2, totalCount: 3 })));
    });

    expect(await adapter.fetchTitles()).toEqual(["A", "B", "C", "Hollow Knight", "Inline Wish"]);
    expect(urls).toHaveLength(3);
  });

  it("accepts an empty wishlist", async () => {
    const adapter = createPlayStationAdapter(async url =>
      html(
        page(
          url.includes("wishlist")
            ? emptyWishlistNextData
            : collectionNextData(["A"], { isLast: true, size: 1, totalCount: 1 }),
        ),
      ),
    );
    expect(await adapter.fetchTitles()).toEqual(["A"]);
  });

  it("throws NotLoggedInError on a redirect to sign-in", async () => {
    const adapter = createPlayStationAdapter(async () => ({ type: "opaqueredirect", status: 0 }) as Response);
    await expect(adapter.fetchTitles()).rejects.toBeInstanceOf(NotLoggedInError);
  });

  it("throws NotLoggedInError when the page has no session or no __NEXT_DATA__", async () => {
    await expect(
      createPlayStationAdapter(async () => html(page(signedOutNextData))).fetchTitles(),
    ).rejects.toBeInstanceOf(NotLoggedInError);
    await expect(createPlayStationAdapter(async () => html("<html></html>")).fetchTitles()).rejects.toBeInstanceOf(
      NotLoggedInError,
    );
  });

  it("throws NotLoggedInError on a cross-origin redirect network error", async () => {
    const adapter = createPlayStationAdapter(async () => {
      throw new TypeError("Failed to fetch");
    });
    await expect(adapter.fetchTitles()).rejects.toBeInstanceOf(NotLoggedInError);
  });

  it("reports HTTP failures as errors", async () => {
    const adapter = createPlayStationAdapter(async () => html("nope", { status: 500 }));
    await expect(adapter.fetchTitles()).rejects.toThrow("HTTP 500");
  });
});
