export const SESSION_URL = "https://ec.nintendo.com/api/auth/session";
/** Opening this page refreshes the shop session and loads the wishlist frontend we read the query hash from. */
export const SHOP_WISHLIST_URL = "https://ec.nintendo.com/my/wishlist";
export const COLLECTION_PAGE_URL = "https://accounts.nintendo.com/portal/vgcs";
export const GRAPHQL_URL = "https://wb.lp1.savanna.srv.nintendo.net/graphql";
export const GRAPHQL_HOST = "wb.lp1.savanna.srv.nintendo.net";
export const GRAPHQL_PATH = "/graphql";

export const GRAPHQL_LANGUAGE = "en";
export const GRAPHQL_NAS_LANGUAGE = "en-US";
export const SHOP_ID = 3;

export const WISHLIST_OPERATION = "InfiniteScrollWishlist";
export const WISHLIST_PAGE_SIZE = 30;
export const COLLECTION_OPERATION = "getVgcsVgcs";
export const COLLECTION_PAGE_SIZE = 300;
/** Safety guard against pagination that never terminates. */
export const MAX_PAGES = 200;

export const QUERY_HASH_STORAGE_KEY = "nintendoWishlistQueryHash";
export const CLIENT_ID_STORAGE_KEY = "nintendoSavannaClientId";

export const SESSION_INITIAL_REFRESH_TIMEOUT_MS = 3000;
export const SESSION_REFRESH_TIMEOUT_MS = 12000;
export const SESSION_POLL_INTERVAL_MS = 750;
export const PAGE_DISCOVERY_TIMEOUT_MS = 15000;
export const PAGE_POLL_INTERVAL_MS = 250;
