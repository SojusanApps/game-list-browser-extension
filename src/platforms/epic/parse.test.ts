import { describe, expect, it } from "vitest";

import * as fixtures from "./fixtures";
import {
  excludeUnrealAssets,
  groupByNamespace,
  isWishlistNotLoggedIn,
  parseAuthorizationCode,
  parseCatalogTitles,
  parseLibraryPage,
  parseToken,
  parseWishlistTitles,
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

describe("groupByNamespace", () => {
  it("groups and de-duplicates ids", () => {
    const groups = groupByNamespace([
      { namespace: "a", catalogItemId: "1" },
      { namespace: "a", catalogItemId: "1" },
      { namespace: "b", catalogItemId: "2" },
    ]);
    expect([...groups]).toEqual([
      ["a", ["1"]],
      ["b", ["2"]],
    ]);
  });
});

describe("parseCatalogTitles", () => {
  it("returns titles and skips items without one", () => {
    expect(parseCatalogTitles(fixtures.catalogNsB)).toEqual(["Gamma Game"]);
    expect(parseCatalogTitles([])).toEqual([]);
  });
});

describe("wishlist parsing", () => {
  it("reads offer titles", () => {
    expect(parseWishlistTitles(fixtures.wishlistOk)).toEqual(["Wished One", "Wished Two"]);
    expect(parseWishlistTitles(fixtures.wishlistNotLoggedIn)).toEqual([]);
  });

  it("detects the not-logged-in error", () => {
    expect(isWishlistNotLoggedIn(fixtures.wishlistNotLoggedIn)).toBe(true);
    expect(isWishlistNotLoggedIn(fixtures.wishlistOk)).toBe(false);
  });
});

describe("Unreal Engine content filtering", () => {
  it("drops library records in the ue namespace", () => {
    const records = [
      { namespace: "ue", catalogItemId: "asset-1" },
      { namespace: "ns-a", catalogItemId: "item-1" },
    ];
    expect(excludeUnrealAssets(records)).toEqual([{ namespace: "ns-a", catalogItemId: "item-1" }]);
  });

  it("skips catalog items categorised as assets, plugins or engine", () => {
    const payload = {
      a: { title: "Real Game", categories: [{ path: "games" }, { path: "applications" }] },
      b: { title: "Rock Pack", categories: [{ path: "assets/environments" }] },
      c: { title: "Some Plugin", categories: [{ path: "plugins" }] },
      d: { title: "Unreal Engine", categories: [{ path: "Engine" }] },
      e: { title: "No Categories" },
    };
    expect(parseCatalogTitles(payload)).toEqual(["Real Game", "No Categories"]);
  });
});
