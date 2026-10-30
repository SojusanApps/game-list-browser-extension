import { describe, expect, it } from "vitest";

import {
  collectionHtml,
  CLIENT_ID_COLLECTION,
  CLIENT_ID_SHOP,
  collectionPage,
  QUERY_HASH,
  shopHtml,
  wishlistPage,
} from "./fixtures";
import {
  buildWishlistRequestUrl,
  extractCollectionBootstrap,
  extractQueryHash,
  extractShopClientId,
  idTokenCountry,
  isAuthError,
  isQueryHashError,
  firstErrorMessage,
  isSessionFresh,
  parseCollectionPage,
  parseWishlistPage,
  sessionCountry,
} from "./parse";

describe("page extraction", () => {
  it("reads the savanna client id from the shop page", () => {
    expect(extractShopClientId(shopHtml)).toBe(CLIENT_ID_SHOP);
    expect(extractShopClientId("<html></html>")).toBeNull();
  });

  it("reads the client id and idToken from the collection page", () => {
    const bootstrap = extractCollectionBootstrap(collectionHtml);
    expect(bootstrap?.clientId).toBe(CLIENT_ID_COLLECTION);
    expect(idTokenCountry(bootstrap?.idToken ?? "")).toBe("PL");
    expect(extractCollectionBootstrap(shopHtml)).toBeNull();
  });

  it("finds the wishlist query hash among resource urls", () => {
    const url = buildWishlistRequestUrl("PL", "token", 0, QUERY_HASH);
    const other = "https://wb.lp1.savanna.srv.nintendo.net/graphql?operationName=Other";
    expect(extractQueryHash([other, "not a url", url])).toBe(QUERY_HASH);
    expect(extractQueryHash([other])).toBeNull();
  });
});

describe("session helpers", () => {
  it("treats a missing or expired idToken as stale", () => {
    expect(isSessionFresh({ idToken: "a.b.c" })).toBe(true);
    expect(isSessionFresh({ idToken: "a.b.c", isIdTokenExpired: true })).toBe(false);
    expect(isSessionFresh({})).toBe(false);
  });

  it("prefers localeInfo country", () => {
    expect(sessionCountry({ localeInfo: { country: "PL" }, country: "US" })).toBe("PL");
    expect(sessionCountry({ country: "US" })).toBe("US");
  });
});

describe("graphql errors", () => {
  it("recognises auth errors and outdated query hashes", () => {
    expect(isAuthError({ errors: [{ message: "Token expired" }] })).toBe(true);
    expect(isAuthError({ errors: [{ message: "boom" }] })).toBe(false);
    expect(
      isQueryHashError({
        errors: [{ extensions: { errorCode: "1802", title: "INVALID_PARAM", type: "x/invalid-param" } }],
      }),
    ).toBe(true);
  });
});

describe("firstErrorMessage", () => {
  it("adds the extension details to a generic message", () => {
    const payload = { errors: [{ message: "error", extensions: { title: "INVALID_PARAM", errorCode: "1802" } }] };
    expect(firstErrorMessage(payload)).toBe("error (INVALID_PARAM 1802)");
  });

  it("uses the extension details when there is no message, and notes further errors", () => {
    const payload = { errors: [{ extensions: { detail: "Cannot query field nsUid" } }, { message: "x" }] };
    expect(firstErrorMessage(payload)).toBe("Cannot query field nsUid (+1)");
  });

  it("returns null when there is nothing readable", () => {
    expect(firstErrorMessage({ errors: [{}] })).toBeNull();
    expect(firstErrorMessage({})).toBeNull();
  });
});

describe("page parsing", () => {
  it("extracts trimmed wishlist games with their nsUid and skips entries without a name", () => {
    expect(parseWishlistPage(wishlistPage)).toEqual({
      games: [
        { storeId: "70010000000001", title: "Hades" },
        { storeId: "70010000000002", title: "Celeste Bundle" },
      ],
      entries: 3,
      total: 3,
    });
  });

  it("reads a numeric nsUid and falls back to the one on itemV2", () => {
    const item = (entry: unknown) =>
      parseWishlistPage({ data: { account: { wishlist: { wishlistItems: { items: [entry] } } } } });
    expect(item({ nsUid: 70010000096810, itemV2: { formalName: "A" } }).games).toEqual([
      { storeId: "70010000096810", title: "A" },
    ]);
    expect(item({ itemV2: { nsUid: 7, formalName: "B" } }).games).toEqual([{ storeId: "7", title: "B" }]);
    expect(item({ itemV2: { formalName: "No id" } }).games).toEqual([]);
  });

  it("extracts collection games with their nsUid", () => {
    expect(parseCollectionPage(collectionPage)).toEqual({
      games: [
        { storeId: "70010000063714", title: "The Legend of Zelda: Tears of the Kingdom" },
        { storeId: "70010000000001", title: "Hades" },
      ],
      entries: 2,
      total: 2,
    });
  });

  it("throws when the expected data is missing", () => {
    expect(() => parseWishlistPage({ data: {} })).toThrow(/wishlistItems/);
    expect(() => parseCollectionPage({ data: {} })).toThrow(/vgcViews/);
  });
});
