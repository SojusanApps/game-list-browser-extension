# Changelog

> Date format is DD.MM.YYYY.

## v. [2.1.0] - 04.11.2026

- Every store reports its progress (stages, and how many games it has read so far), not only PlayStation
- Show what the extension is doing in the popup: each store's sync with its stage and a progress bar, or its error message, which stays until the next sync or until dismissed; the toolbar icon shows "…" while a sync runs and "!" after an error
- Send the sync's progress to the GameList page (contract version 3, new `SYNC_PROGRESS` message, only to pages that ask for it)
- Read each PlayStation game's concept id and English name from the store's GraphQL API, and the purchased list from the library's GraphQL API, falling back to the store and library pages when it fails; lookups run 10 at a time and are retried when throttled
- Tell the page the sync was interrupted, instead of leaving it waiting, when the browser stops the extension's background script mid-sync

## v. [2.0.0] - 30.10.2026

- Return the store id of each game and whether it is wishlisted (contract version 2, replaces `titles` with `entries`)
- Identify Epic games by their base-game `offerId`, so they match IGDB; add-ons, editions and Unreal Engine marketplace assets are no longer imported
- Fix the Epic wishlist, which returned nothing because its answer no longer carries titles; wishlisted offers are now looked up by id
- Identify PlayStation games by their store `conceptId` (the id IGDB uses), read from each product's store page in the account's own region; editions of one game now collapse into one entry
- Open the Epic wishlist page, instead of the store home page, to establish the store session when the wishlist reports logged out
- Skip, and log, Epic and PlayStation games whose id cannot be resolved, instead of sending an id that would not match

## v. [1.0.0] - 21.10.2026

- Add adapters for steam, epic, gog, playstation and nintendo
