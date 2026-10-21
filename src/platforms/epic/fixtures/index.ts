/** Hand-built from the response shapes; not recorded from live Epic. */

export const authCodeOk = {
  redirectUrl: "https://www.epicgames.com/id/api/redirect?code=abc",
  authorizationCode: "abc",
};

export const authCodeLoggedOut = { errorCode: "errors.com.epicgames.not_logged_in", errorMessage: "Not logged in" };

export const tokenOk = {
  access_token: "access-1",
  refresh_token: "refresh-1",
  expires_in: 28800,
  account_id: "acc-1",
  displayName: "player",
};

export const libraryPage1 = {
  records: [
    { namespace: "ns-a", catalogItemId: "item-1", appName: "Alpha", sandboxType: "PUBLIC", recordType: "APPLICATION" },
    { namespace: "ns-a", catalogItemId: "item-2", appName: "Beta", sandboxType: "PUBLIC", recordType: "APPLICATION" },
    { namespace: "ns-b", catalogItemId: "item-3", appName: "Gamma", sandboxType: "PUBLIC", recordType: "APPLICATION" },
    { appName: "broken-record" },
  ],
  responseMetadata: { nextCursor: "cursor-2" },
};

export const libraryPage2 = {
  records: [{ namespace: "ns-b", catalogItemId: "item-4", appName: "Delta", recordType: "APPLICATION" }],
  responseMetadata: {},
};

export const catalogNsA = {
  "item-1": { id: "item-1", title: "Alpha Game", namespace: "ns-a" },
  "item-2": { id: "item-2", title: "Beta Game", namespace: "ns-a" },
};

export const catalogNsB = {
  "item-3": { id: "item-3", title: "Gamma Game", namespace: "ns-b" },
  "item-4": { id: "item-4", namespace: "ns-b" },
};

export const wishlistOk = {
  data: {
    Wishlist: {
      wishlistItems: {
        elements: [
          { id: "w1", offerId: "o1", namespace: "ns-w", offer: { id: "o1", title: "Wished One" } },
          { id: "w2", offerId: "o2", namespace: "ns-w", offer: { id: "o2", title: "Wished Two" } },
        ],
      },
    },
  },
};

export const wishlistNotLoggedIn = {
  errors: [{ message: "com.epicgames.wishlist.notLoggedIn", status: 401 }],
  data: { Wishlist: null },
};
