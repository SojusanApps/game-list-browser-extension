import { describe, expect, it } from "vitest";

import owned from "./fixtures/owned-page.json";
import products from "./fixtures/products.json";
import wishlist from "./fixtures/wishlist.json";
import { parseIsLoggedIn, parseOwnedPage, parseProductTitles, parseWishlistIds } from "./parse";

describe("parseIsLoggedIn", () => {
  it("is true only for an explicit logged-in session", () => {
    expect(parseIsLoggedIn({ isLoggedIn: true })).toBe(true);
    expect(parseIsLoggedIn({ isLoggedIn: false })).toBe(false);
    expect(parseIsLoggedIn(null)).toBe(false);
  });
});

describe("parseOwnedPage", () => {
  it("returns the titles and page count, skipping blank or missing titles", () => {
    expect(parseOwnedPage(owned)).toEqual({ titles: ["The Witcher 3: Wild Hunt", "Cyberpunk 2077"], totalPages: 2 });
  });

  it("falls back to a single empty page for malformed payloads", () => {
    expect(parseOwnedPage(undefined)).toEqual({ titles: [], totalPages: 1 });
  });
});

describe("parseWishlistIds", () => {
  it("returns the wishlisted product ids", () => {
    expect(parseWishlistIds(wishlist)).toEqual(["1207658924", "1207659060"]);
  });

  it("returns nothing for malformed payloads", () => {
    expect(parseWishlistIds({ wishlist: [] })).toEqual([]);
    expect(parseWishlistIds(null)).toEqual([]);
  });
});

describe("parseProductTitles", () => {
  it("returns product titles", () => {
    expect(parseProductTitles(products)).toEqual(["Disco Elysium", "Hades"]);
  });

  it("returns nothing for malformed payloads", () => {
    expect(parseProductTitles({})).toEqual([]);
  });
});
