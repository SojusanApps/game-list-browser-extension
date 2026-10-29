# Epic's Store Id is the namespace's base-game offer id

Epic's **Store Id** is the `offerId` of the game's `BASE_GAME` offer, not the `catalogItemId` the library lists. The library service and catalog items expose no offer, and the offer's `items[].id` does not equal the library's `catalogItemId`, so the only join between an owned game and its offer is the **namespace**. For each namespace the extension reads `catalog/api/shared/namespace/{ns}/offers` and takes its single `BASE_GAME` offer. The wishlist already carries an `offerId` and a namespace per element but no title, so each offer is looked up directly through `bulk/offers?id=…` (batched per namespace) and kept only when it is a `BASE_GAME`.

We rejected the account order history as the source: it misses games that were redeemed rather than purchased.

## Consequences

- A namespace with no `BASE_GAME` offer (delisted, Unreal Engine content) or with several (separate editions) yields no entry; a wrong id is worse than a missing one, and the backend falls back to title matching. The extension logs how many entries were skipped.
- The Unreal Engine Marketplace namespace (`ue`) is never listed: it holds thousands of offers and no games, so reading it would cost dozens of requests for nothing.
- Only base games are imported; add-ons and editions sold as other offer types are dropped, which replaces the former catalog category filter.
- The catalog `bulk/items` lookup is gone, and one offers request per library namespace (paged) replaces it, plus one `bulk/offers` request per wishlist namespace.
- A game owned through one offer and wishlisted through a different edition offer is two entries, not one.
- Offer ids may not equal IGDB's `external_id`; that degrades to title matching, as in ADR 0002.
- Verified only against the sample accounts' responses: delisted games have not been observed.
