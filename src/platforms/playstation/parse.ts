import type { LibraryEntry } from "../../contract";

type JsonObject = Record<string, unknown>;

export interface CollectionPage {
  entries: LibraryEntry[];
  /** Page number reported by the page, 1 when absent. */
  page: number;
  isLast: boolean;
  size?: number;
  totalCount?: number;
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

/** Parses the `__NEXT_DATA__` JSON embedded in a library.playstation.com page, or null if it is absent. */
export function extractNextData(html: string): unknown {
  const match = /<script[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i.exec(html);
  const raw = match?.[1]?.trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

function getApolloState(nextData: unknown): JsonObject | null {
  if (!isObject(nextData) || !isObject(nextData.props)) return null;
  return isObject(nextData.props.apolloState) ? nextData.props.apolloState : null;
}

function getRootQuery(nextData: unknown): JsonObject | null {
  const apolloState = getApolloState(nextData);
  return apolloState && isObject(apolloState.ROOT_QUERY) ? apolloState.ROOT_QUERY : null;
}

/** The signed-in user's account id, or null when the page was rendered for an anonymous visitor. */
export function extractAccountId(nextData: unknown): string | null {
  if (!isObject(nextData) || !isObject(nextData.props)) return null;
  const { appProps } = nextData.props;
  if (!isObject(appProps) || !isObject(appProps.session) || !isObject(appProps.session.userData)) return null;
  const { accountId } = appProps.session.userData;
  return typeof accountId === "string" && accountId.trim() ? accountId.trim() : null;
}

/** The store locale of the signed-in user (`pl-PL` becomes `pl-pl`), which their regional product ids belong to. */
export function extractLocale(nextData: unknown): string | null {
  if (!isObject(nextData) || !isObject(nextData.props)) return null;
  const { appProps } = nextData.props;
  if (!isObject(appProps) || !isObject(appProps.session) || !isObject(appProps.session.userData)) return null;
  const { locale } = appProps.session.userData;
  return typeof locale === "string" && locale.trim() ? locale.trim().toLowerCase() : null;
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/**
 * Reads a title as an entry, following an Apollo `__ref` into the normalized cache if needed. The store id is the
 * product id: `productId` on a purchased title, `id` on a wishlisted `Product`.
 */
function readEntry(
  entry: unknown,
  apolloState: JsonObject | null,
  idField: "productId" | "id",
  wishlisted: boolean,
): LibraryEntry | null {
  let node = entry;
  if (isObject(node) && typeof node.__ref === "string") {
    node = apolloState?.[node.__ref];
  }
  if (!isObject(node)) return null;
  const title = nonEmptyString(node.name);
  const storeId = nonEmptyString(node[idField]);
  return title && storeId ? { storeId, title, wishlisted } : null;
}

/** Titles from one page of the "purchased" library. Returns null when the page has no purchased-titles data. */
export function parseCollectionPage(nextData: unknown): CollectionPage | null {
  const rootQuery = getRootQuery(nextData);
  if (!rootQuery) return null;

  const entry = Object.entries(rootQuery).find(
    ([key, value]) => key.startsWith("purchasedTitlesRetrieve(") && isObject(value) && Array.isArray(value.games),
  );
  if (!entry) return null;

  const node = entry[1] as JsonObject;
  const apolloState = getApolloState(nextData);
  const entries = (node.games as unknown[])
    .map(game => readEntry(game, apolloState, "productId", false))
    .filter(entry => entry !== null);

  const pageInfo = isObject(node.pageInfo) ? node.pageInfo : {};
  const props = (nextData as { props: JsonObject }).props;
  const pageProps = isObject(props.pageProps) ? props.pageProps : {};
  const page = finiteNumber(pageProps.page);

  return {
    entries,
    page: page !== undefined && page > 0 ? Math.floor(page) : 1,
    isLast: pageInfo.isLast === true,
    size: finiteNumber(pageInfo.size),
    totalCount: finiteNumber(pageInfo.totalCount),
  };
}

/** Wishlisted entries. Returns null when the page has no wishlist data; an empty wishlist yields []. */
export function parseWishlist(nextData: unknown): LibraryEntry[] | null {
  const rootQuery = getRootQuery(nextData);
  if (!rootQuery) return null;

  const entries = Object.entries(rootQuery).filter(
    ([key]) => key === "storeWishlistSecure" || key.startsWith("storeWishlistSecure("),
  );
  if (entries.length === 0) return null;

  const apolloState = getApolloState(nextData);
  return entries
    .flatMap(([, value]) => (Array.isArray(value) ? value : []))
    .map(item => readEntry(item, apolloState, "id", true))
    .filter(entry => entry !== null);
}

function escapeRegExp(value: string): string {
  return value.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
}

/**
 * The concept id of a product from its store page. The page's own `apolloState` knows only the product's name; the
 * concept sits in the Apollo caches the page's micro-frontends embed as JSON inside `pageProps.batarangs.*.text`,
 * as `"Product:<productId>":{"id":…,"concept":{"__ref":"Concept:<id>"}…`. Null when the store showed an error page.
 */
export function parseConceptId(nextData: unknown, productId: string): string | null {
  if (!isObject(nextData) || !isObject(nextData.props) || !isObject(nextData.props.pageProps)) return null;
  const { batarangs } = nextData.props.pageProps;
  if (!isObject(batarangs)) return null;
  const entry = new RegExp(
    String.raw`"Product:${escapeRegExp(productId)}":\{.{0,400}?"concept":\{"__ref":"Concept:([^"]+)"\}`,
  );
  for (const batarang of Object.values(batarangs)) {
    const text = isObject(batarang) ? batarang.text : null;
    const conceptId = typeof text === "string" ? entry.exec(text)?.[1] : undefined;
    if (conceptId) return conceptId;
  }
  return null;
}
