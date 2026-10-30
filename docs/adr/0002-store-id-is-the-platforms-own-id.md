# The Store Id is the platform's own game id, and the backend matches on it

Each **Library Entry** carries a **Store Id**: the id the **Platform** itself uses for the game (Steam `appid`, GOG product id, Nintendo `nsUid`, Epic `offerId`, PlayStation `conceptId`), sent as a string. We chose this over sending titles only, because titles are ambiguous (editions, localized names, DLC) and the backend can then match a game by id against IGDB's `ExternalGame` and its own Store Mappings before ever falling back to fuzzy title matching.

Contract version 2 replaced `titles` with `entries` instead of keeping both, since the extension and the frontend ship together and two sources of truth for one list would drift.

## Consequences

- The ids are only useful if they match what the backend stores. Epic, PlayStation and Nintendo ids may not equal IGDB's `external_id`; that degrades to title matching, it never produces a wrong auto-import.
- Entries are de-duplicated by `storeId`, not by title; two games with the same title are two entries, and a game both owned and wishlisted is one owned entry.
- The Nintendo owned library was written without a real response to check the id field against (no samples were available). It is marked unverified in the code and must be confirmed against a real account. How Epic and PlayStation arrive at their ids is in [ADR 0003](0003-epic-store-id-is-the-base-game-offer-id.md) and [ADR 0004](0004-playstation-store-id-is-the-concept-id.md).
