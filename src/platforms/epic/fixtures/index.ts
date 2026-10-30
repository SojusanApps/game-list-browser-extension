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
  records: [{ namespace: "ns-c", catalogItemId: "item-4", appName: "Delta", recordType: "APPLICATION" }],
  responseMetadata: {},
};

function offer(id: string, title: string, offerType: string) {
  return { id, title, offerType, namespace: "ns", status: "ACTIVE", items: [{ id: `${id}-item` }] };
}

/** An offers page; `total` defaults to the number of elements. */
export function offersPage(elements: unknown[], total = elements.length) {
  return { elements, paging: { count: 100, start: 0, total } };
}

export const offersNsA = offersPage([
  offer("offer-a", "Alpha Game", "BASE_GAME"),
  offer("offer-a-audience", "AlphaDevAudience", "OTHERS"),
]);

export const offersNsB = offersPage([offer("offer-b", "Gamma Game", "BASE_GAME")]);

/** Two base games in one namespace: ambiguous, so it yields no entry. */
export const offersNsC = offersPage([
  offer("offer-c1", "Delta Standard", "BASE_GAME"),
  offer("offer-c2", "Delta Deluxe", "BASE_GAME"),
]);

/** Answer of `bulk/offers`: a map of offerId to offer, with no entry for ids Epic does not know. */
export const bulkOffersNsW = {
  o1: offer("o1", "Wished One", "BASE_GAME"),
  o2: offer("o2", "Wished Two", "BASE_GAME"),
  o3: offer("o3", "Wished Add-on", "OTHERS"),
};

/** Shape of the real answer: elements carry only an offer id and namespace, no offer object or title. */
export const wishlistOk = {
  data: {
    Wishlist: {
      wishlistItems: {
        elements: [
          { id: "w1", offerId: "o1", namespace: "ns-w", created: "2026-10-26T17:02:19.841Z", order: null },
          { id: "w2", offerId: "o2", namespace: "ns-w" },
          { id: "w3", offerId: "o3", namespace: "ns-w" },
          { id: "w4", offerId: "o-gone", namespace: "ns-w" },
          { id: "w5", namespace: "ns-w" },
        ],
      },
    },
  },
};

export const wishlistNotLoggedIn = {
  errors: [{ message: "com.epicgames.wishlist.notLoggedIn", status: 401 }],
  data: { Wishlist: null },
};
