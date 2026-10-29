import { describe, expect, it } from "vitest";

import * as fixtures from "./fixtures";
import {
  groupByNamespace,
  isWishlistNotLoggedIn,
  libraryNamespaces,
  namespaceBaseGame,
  parseAuthorizationCode,
  parseBulkOffers,
  parseLibraryPage,
  parseOffersPage,
  parseToken,
  parseWishlistItems,
} from "./parse";

describe("parseAuthorizationCode", () => {
  it("reads the code and treats a logged-out answer as null", () => {
    expect(parseAuthorizationCode(fixtures.authCodeOk)).toBe("abc");
    expect(parseAuthorizationCode(fixtures.authCodeLoggedOut)).toBeNull();
    expect(parseAuthorizationCode(null)).toBeNull();
  });
});

describe("parseToken", () => {
  it("requires both access token and account id", () => {
    expect(parseToken(fixtures.tokenOk)).toEqual({ accessToken: "access-1", accountId: "acc-1" });
    expect(parseToken({ access_token: "x" })).toBeNull();
  });
});

describe("parseLibraryPage", () => {
  it("keeps records with ids and exposes the next cursor", () => {
    expect(parseLibraryPage(fixtures.libraryPage1)).toEqual({
      records: [
        { namespace: "ns-a", catalogItemId: "item-1" },
        { namespace: "ns-a", catalogItemId: "item-2" },
        { namespace: "ns-b", catalogItemId: "item-3" },
      ],
      nextCursor: "cursor-2",
    });
  });

  it("returns no cursor on the last page and tolerates garbage", () => {
    expect(parseLibraryPage(fixtures.libraryPage2).nextCursor).toBeNull();
    expect(parseLibraryPage("nope")).toEqual({ records: [], nextCursor: null });
  });
});

describe("libraryNamespaces", () => {
  it("lists each namespace once, in first-seen order", () => {
    expect(
      libraryNamespaces([
        { namespace: "b", catalogItemId: "1" },
        { namespace: "a", catalogItemId: "2" },
        { namespace: "b", catalogItemId: "3" },
      ]),
    ).toEqual(["b", "a"]);
  });

  it("leaves out the Unreal Engine Marketplace namespace, which is never listed", () => {
    expect(
      libraryNamespaces([
        { namespace: "ue", catalogItemId: "asset-1" },
        { namespace: "a", catalogItemId: "1" },
      ]),
    ).toEqual(["a"]);
  });
});

describe("parseOffersPage", () => {
  it("reads offer ids, titles and types and the total, skipping offers without an id or title", () => {
    expect(
      parseOffersPage({
        elements: [{ id: "o1", title: "One", offerType: "BASE_GAME" }, { id: "o2", title: "Two" }, { id: "o3" }],
        paging: { count: 100, start: 0, total: 3 },
      }),
    ).toEqual({
      offers: [
        { id: "o1", title: "One", offerType: "BASE_GAME" },
        { id: "o2", title: "Two", offerType: null },
      ],
      total: 3,
    });
    expect(parseOffersPage("nope")).toEqual({ offers: [], total: 0 });
  });
});

describe("parseBulkOffers", () => {
  it("reads the offers of the id-keyed map", () => {
    expect(parseBulkOffers(fixtures.bulkOffersNsW)).toEqual([
      { id: "o1", title: "Wished One", offerType: "BASE_GAME" },
      { id: "o2", title: "Wished Two", offerType: "BASE_GAME" },
      { id: "o3", title: "Wished Add-on", offerType: "OTHERS" },
    ]);
    expect(parseBulkOffers([])).toEqual([]);
  });
});

describe("groupByNamespace", () => {
  it("groups and de-duplicates offer ids", () => {
    expect([
      ...groupByNamespace([
        { namespace: "a", offerId: "1" },
        { namespace: "a", offerId: "1" },
        { namespace: "b", offerId: "2" },
      ]),
    ]).toEqual([
      ["a", ["1"]],
      ["b", ["2"]],
    ]);
  });
});

describe("namespaceBaseGame", () => {
  const base = (id: string) => ({ id, title: id, offerType: "BASE_GAME" });
  const other = { id: "x", title: "x", offerType: "OTHERS" };

  it("picks the single base game and ignores other offer types", () => {
    expect(namespaceBaseGame([other, base("a")])).toEqual(base("a"));
  });

  it("yields null when there is no base game or more than one", () => {
    expect(namespaceBaseGame([other])).toBeNull();
    expect(namespaceBaseGame([base("a"), base("b")])).toBeNull();
  });
});

describe("wishlist parsing", () => {
  it("reads offer ids with their namespaces, skipping elements without either", () => {
    expect(parseWishlistItems(fixtures.wishlistOk)).toEqual({
      items: [
        { offerId: "o1", namespace: "ns-w" },
        { offerId: "o2", namespace: "ns-w" },
        { offerId: "o3", namespace: "ns-w" },
        { offerId: "o-gone", namespace: "ns-w" },
      ],
      elements: 5,
    });
    expect(parseWishlistItems(fixtures.wishlistNotLoggedIn)).toEqual({ items: [], elements: 0 });
  });

  it("detects the not-logged-in error", () => {
    expect(isWishlistNotLoggedIn(fixtures.wishlistNotLoggedIn)).toBe(true);
    expect(isWishlistNotLoggedIn(fixtures.wishlistOk)).toBe(false);
  });
});
