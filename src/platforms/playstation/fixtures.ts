/** Hand-built pages shaped like the `__NEXT_DATA__` of library.playstation.com. */

export function page(nextData: unknown): string {
  return `<html><body><script id="__NEXT_DATA__" type="application/json">${JSON.stringify(nextData)}</script></body></html>`;
}

const session = { session: { userData: { accountId: "1234567890", onlineId: "player_one" } } };

export function collectionNextData(
  names: string[],
  pageInfo: { isLast: boolean; size: number; totalCount: number },
  pageNumber = 1,
) {
  return {
    props: {
      appProps: session,
      pageProps: { page: pageNumber },
      apolloState: {
        ROOT_QUERY: {
          'purchasedTitlesRetrieve({"first":24})': { games: names.map(name => ({ name, titleId: "X" })), pageInfo },
        },
      },
    },
  };
}

export const wishlistNextData = {
  props: {
    appProps: session,
    apolloState: {
      ROOT_QUERY: {
        'storeWishlistSecure({"locale":"en-us"})': [{ __ref: "Product:1" }, { name: "Inline Wish" }],
      },
      "Product:1": { name: "Hollow Knight" },
    },
  },
};

export const emptyWishlistNextData = {
  props: { appProps: session, apolloState: { ROOT_QUERY: { storeWishlistSecure: [] } } },
};

export const signedOutNextData = { props: { appProps: { session: {} }, apolloState: { ROOT_QUERY: {} } } };
