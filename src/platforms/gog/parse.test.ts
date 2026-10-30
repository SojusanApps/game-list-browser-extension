import { describe, expect, it } from "vitest";

import owned from "./fixtures/owned-page.json";
import products from "./fixtures/products.json";
import wishlist from "./fixtures/wishlist.json";
import { parseIsLoggedIn, parseOwnedPage, parseProducts, parseWishlistIds } from "./parse";

describe("parseIsLoggedIn", () => {
  it("is true only for an explicit logged-in session", () => {
    expect(parseIsLoggedIn({ isLoggedIn: true })).toBe(true);
    expect(parseIsLoggedIn({ isLoggedIn: false })).toBe(false);
    expect(parseIsLoggedIn(null)).toBe(false);
  });
});

describe("parseOwnedPage", () => {
  it("returns the products and page count, skipping those without a title or id", () => {
    expect(parseOwnedPage(owned)).toEqual({
      products: [
        { id: "1207658930", title: "The Witcher 3: Wild Hunt" },
        { id: "1423049311", title: "Cyberpunk 2077" },
      ],
      totalPages: 2,
    });
  });

  it("falls back to a single empty page for malformed payloads", () => {
    expect(parseOwnedPage(undefined)).toEqual({ products: [], totalPages: 1 });
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

describe("parseProducts", () => {
  it("returns product ids and titles", () => {
    expect(parseProducts(products)).toEqual([
      { id: "1207658924", title: "Disco Elysium" },
      { id: "1207659060", title: "Hades" },
    ]);
  });

  it("returns nothing for malformed payloads", () => {
    expect(parseProducts({})).toEqual([]);
  });
});
