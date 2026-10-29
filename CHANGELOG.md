# Changelog

> Date format is DD.MM.YYYY.

## v. [2.0.0] - 30.10.2026

- Return the store id of each game and whether it is wishlisted (contract version 2, replaces `titles` with `entries`)
- Identify Epic games by their base-game `offerId`, so they match IGDB; add-ons, editions and Unreal Engine marketplace assets are no longer imported
- Fix the Epic wishlist, which returned nothing because its answer no longer carries titles; wishlisted offers are now looked up by id
- Identify PlayStation games by their store `conceptId` (the id IGDB uses), read from each product's store page in the account's own region; editions of one game now collapse into one entry
- Open the Epic wishlist page, instead of the store home page, to establish the store session when the wishlist reports logged out
- Skip, and log, Epic and PlayStation games whose id cannot be resolved, instead of sending an id that would not match

## v. [1.0.0] - 21.10.2026

- Add adapters for steam, epic, gog, playstation and nintendo
