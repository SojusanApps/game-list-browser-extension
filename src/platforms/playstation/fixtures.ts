/** Hand-built pages shaped like the `__NEXT_DATA__` of library.playstation.com. */

export function page(nextData: unknown): string {
  return `<html><body><script id="__NEXT_DATA__" type="application/json">${JSON.stringify(nextData)}</script></body></html>`;
}

const session = {
  session: { userData: { accountId: "1234567890", onlineId: "player_one", locale: "pl-PL" } },
};

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
          'purchasedTitlesRetrieve({"first":24})': {
            games: names.map(name => ({ name, productId: `P-${name.trim()}`, titleId: "X" })),
            pageInfo,
          },
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
        'storeWishlistSecure({"locale":"en-us"})': [{ __ref: "Product:1" }, { id: "P-wish-2", name: "Inline Wish" }],
      },
      "Product:1": { id: "P-wish-1", name: "Hollow Knight" },
    },
  },
};

export const emptyWishlistNextData = {
  props: { appProps: session, apolloState: { ROOT_QUERY: { storeWishlistSecure: [] } } },
};

export const signedOutNextData = { props: { appProps: { session: {} }, apolloState: { ROOT_QUERY: {} } } };

/**
 * A store product page, shaped like the real one: the top-level Apollo state knows only the product's name, and the
 * concept is in the Apollo cache that a micro-frontend (`batarang`) embeds as JSON in its html `text`.
 */
export function productNextData(productId: string, conceptId: string, locale = "pl-pl") {
  const cache = {
    [`Concept:${conceptId}`]: { id: conceptId, __typename: "Concept", name: "A Game" },
    [`Product:${productId}`]: {
      id: productId,
      __typename: "Product",
      concept: { __ref: `Concept:${conceptId}` },
      name: "A Game",
    },
  };
  const text = `<div data-mfe-name="gameTitle"></div>${JSON.stringify({ overrides: { locale }, cache })}`;
  return {
    props: {
      pageProps: { locale, productId, batarangs: { "game-title": { text }, info: { text: "<div>no cache</div>" } } },
      apolloState: { ROOT_QUERY: {}, [`Product:${productId}:${locale}`]: { id: productId, name: "A Game" } },
    },
  };
}

/** What the store answers for a product it does not know: an error page without any product. */
export const productErrorNextData = {
  props: { pageProps: { error: { name: "emptyRequiredBatarang" } }, apolloState: { ROOT_QUERY: {} } },
};
