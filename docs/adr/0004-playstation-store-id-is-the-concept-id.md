# PlayStation's Store Id is the concept id, read from the product's store page

PlayStation's **Store Id** is the `conceptId` of the game, the number in `store.playstation.com/…/concept/10000896`, which is also what IGDB stores as the PlayStation `external_id`. The library only lists regional product ids (`EP6261-PPSA02584_00-OSRELSIEEGENSHIN`), which name one edition on one platform and cannot be matched to IGDB. The purchased library has a `conceptId` field, but it is null for at least some titles and the wishlist has none, so we do not rely on it. Instead, each distinct product id is looked up on its store page (`store.playstation.com/<locale>/product/<productId>`), where the `Product` entry in the page's `__NEXT_DATA__` points at its `Concept`.

The locale is the signed-in user's own (`pl-PL` becomes `pl-pl`), because product ids are regional: the `en-us` store answers an `EP…` product with an error page.

## Consequences

- Each distinct product is looked up with the store's persisted GraphQL query (`productRetrieveForCtasWithPrice`, about 4 KB, 10 at a time), which also gives the product's English `invariantName`, used as the entry's title, falling back to its store page (about 270 KB, no English name, so the library's title stays) when GraphQL gives no concept, for instance after the hash changes. Throttled (429) or failing (5xx) lookups are retried 3 times with backoff, then fail the sync. Nothing is cached between syncs.
- Editions and platform versions of one game share a concept, so they collapse into one **Library Entry**.
- A product whose store page has no concept (delisted, region-locked, changed page shape) yields no entry and is counted in a log line; if no product at all resolves, the sync fails with a missing-id error. We never fall back to the product id.
- If the session names no locale we fall back to `en-us`, which may resolve nothing for non-US accounts.
- The page shape is undocumented and could change; the parser is tested against a hand-built copy of the observed shape.
- The purchased list also comes from the library's persisted GraphQL query (`getPurchasedGameList`, 24 games a page, pages after the first fetched 4 at a time), falling back to the library's html pages when it fails. The wishlist still comes from its html page, which also names the user's locale.
